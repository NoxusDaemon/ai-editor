import { useDebounceFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { createCipher, DecryptionError, type Cipher } from '~/lib/crypto'
import {
  decryptDocument,
  encodeEncryptedDocument,
  encodeJsonDocument,
  inspectDocument,
  type DecryptedDocument
} from '~/lib/document'
import { serializeWorkspace } from '~/lib/schema'
import { createSidebars, type Workspace } from '~/lib/workspace'
import { errorMessage, useServices } from '~/services/container'
import { basename, withExtension, type DocumentKind, type FileRef } from '~/services/files'
import type { RecoverySnapshot } from '~/services/recovery'
import { useSettingsStore } from './settings'
import { useWorkspaceStore } from './workspace'

export type SaveStatus = 'idle' | 'saving' | 'error'

export const AUTOSAVE_DELAY_MS = 1000
export const AUTOSAVE_MAX_WAIT_MS = 5000
export const MAX_RECENT_FILES = 8

/** The file behind the workspace: opening, saving, encryption, autosave, recent files and crash recovery. */
export const useDocumentStore = defineStore('document', () => {
  const workspace = useWorkspaceStore()
  const settings = useSettingsStore()

  const file = shallowRef<FileRef | null>(null)
  const encrypted = ref(false)
  const status = ref<SaveStatus>('idle')
  const lastError = ref<string | null>(null)
  const lastSavedAt = ref<Date | null>(null)
  // Holds a non-extractable CryptoKey rather than the password. Not reactive on purpose.
  let cipher: Cipher | null = null
  let writes: Promise<unknown> = Promise.resolve()
  let recoveryOps: Promise<unknown> = Promise.resolve()
  // Off until `startup` has offered to restore the previous copy, so it isn't overwritten first.
  let recoveryEnabled = false

  const current = (): Workspace => ({ sessions: workspace.sessions, sidebars: workspace.sidebars })
  const snapshot = computed(() => serializeWorkspace(current()))
  const savedSnapshot = ref(snapshot.value)
  const dirty = computed(() => snapshot.value !== savedSnapshot.value)
  const fileName = computed(() => file.value?.name ?? 'Untitled')
  const canAutosave = computed(() => !!file.value && useServices().files.canWriteInPlace(file.value))

  function report(title: string, error: unknown) {
    useServices().dialogs.notify({ title, description: errorMessage(error), color: 'error' })
  }

  function adopt(data: Workspace, ref: FileRef | null, nextCipher: Cipher | null) {
    workspace.restore(data)
    file.value = ref
    cipher = nextCipher
    encrypted.value = nextCipher !== null
    status.value = 'idle'
    lastError.value = null
    lastSavedAt.value = null
    savedSnapshot.value = snapshot.value
  }

  function confirmDiscard(): Promise<boolean> {
    if (!dirty.value) return Promise.resolve(true)
    return useServices().dialogs.confirm({
      title: 'Discard unsaved changes?',
      description: `${fileName.value} has changes that have not been saved.`,
      confirmLabel: 'Discard changes',
      danger: true
    })
  }

  async function newWorkspace(): Promise<boolean> {
    if (!await confirmDiscard()) return false
    adopt({ sessions: [], sidebars: createSidebars() }, null, null)
    return true
  }

  /** Adds a file to the top of the recent files list (desktop app only). */
  function remember(target: FileRef | null) {
    const path = target?.path
    if (!path || !useServices().files.remembersPaths) return
    settings.recentFiles = [path, ...settings.recentFiles.filter(p => p !== path)].slice(0, MAX_RECENT_FILES)
  }

  function forgetRecent(path?: string) {
    settings.recentFiles = path === undefined ? [] : settings.recentFiles.filter(p => p !== path)
  }

  /**
   * Reads a file of any supported kind, asking for the password if it is encrypted.
   * `ref` is `null` for a workspace that has no file, such as a restored "Untitled" one.
   */
  async function load(bytes: Uint8Array, ref: FileRef | null, name = ref?.name ?? 'Untitled'): Promise<boolean> {
    try {
      const inspected = inspectDocument(bytes)
      if (inspected.kind === 'json') {
        adopt(inspected.workspace, ref, null)
        return true
      }

      let unlocked: DecryptedDocument | undefined
      const password = await useServices().dialogs.askPassword({
        title: `Unlock ${name}`,
        description: 'This workspace is encrypted. Enter its password to open it.',
        submitLabel: 'Unlock',
        verify: async (candidate) => {
          try {
            unlocked = await decryptDocument(bytes, candidate)
            return true
          } catch (error) {
            if (error instanceof DecryptionError) return false
            throw error
          }
        }
      })
      if (password === null || !unlocked) return false
      // Legacy files have no reusable cipher; saving upgrades them to the current format.
      adopt(unlocked.workspace, ref, unlocked.cipher ?? await createCipher(password))
      return true
    } catch (error) {
      report(`Could not open ${name}`, error)
      return false
    }
  }

  async function open(): Promise<boolean> {
    if (!await confirmDiscard()) return false
    try {
      const opened = await useServices().files.pickAndRead()
      if (!opened || !await load(opened.bytes, opened.ref)) return false
      remember(opened.ref)
      return true
    } catch (error) {
      report('Could not open the file', error)
      return false
    }
  }

  /** Opens a file from the recent files list, dropping it from the list if it is gone. */
  async function openRecent(path: string): Promise<boolean> {
    if (!await confirmDiscard()) return false
    let opened
    try {
      opened = await useServices().files.reopen(path)
    } catch (error) {
      forgetRecent(path)
      report(`Could not open ${basename(path)}`, error)
      return false
    }
    if (!await load(opened.bytes, opened.ref)) return false
    remember(opened.ref)
    return true
  }

  /** Dropped files have no writable location, so the next save asks where to put it. */
  async function openDropped(dropped: File): Promise<boolean> {
    if (!await confirmDiscard()) return false
    return load(new Uint8Array(await dropped.arrayBuffer()), { name: dropped.name })
  }

  function writeTo(target: FileRef, withCipher: Cipher | null, auto = false): Promise<boolean> {
    const run = async () => {
      const previousStatus = status.value
      status.value = 'saving'
      // Snapshot and bytes are both taken synchronously, so they always agree.
      const pending = snapshot.value
      try {
        const bytes = withCipher
          ? await encodeEncryptedDocument(current(), withCipher)
          : encodeJsonDocument(current())
        await useServices().files.write(target, bytes)
        savedSnapshot.value = pending
        lastSavedAt.value = new Date()
        lastError.value = null
        status.value = 'idle'
        return true
      } catch (error) {
        status.value = 'error'
        lastError.value = errorMessage(error)
        // Don't repeat the same toast on every autosave attempt.
        if (!auto || previousStatus !== 'error') report(`Could not save ${target.name}`, error)
        return false
      }
    }
    const result = writes.then(run)
    writes = result
    return result
  }

  async function saveAs(kind: DocumentKind): Promise<boolean> {
    const { files, dialogs } = useServices()
    let target: FileRef | null
    try {
      target = await files.pickSaveTarget(kind, withExtension(file.value?.name ?? 'workspace', kind))
    } catch (error) {
      report('Could not save', error)
      return false
    }
    if (!target) return false

    let nextCipher: Cipher | null = null
    if (kind === 'encrypted') {
      const password = await dialogs.askPassword({
        title: 'Encrypt workspace',
        description: 'Choose a password for this file. It cannot be recovered if you forget it.',
        submitLabel: 'Encrypt and save',
        confirm: true
      })
      if (password === null) return false
      nextCipher = await createCipher(password)
    }

    if (!await writeTo(target, nextCipher)) return false
    file.value = target
    cipher = nextCipher
    encrypted.value = nextCipher !== null
    remember(target)
    return true
  }

  async function save(): Promise<boolean> {
    if (!file.value || !useServices().files.canWriteInPlace(file.value)) {
      return saveAs(encrypted.value ? 'encrypted' : 'json')
    }
    return writeTo(file.value, cipher)
  }

  const shouldAutosave = () => settings.autosave && dirty.value && canAutosave.value
  const autosave = useDebounceFn(() => {
    if (shouldAutosave()) void writeTo(file.value!, cipher, true)
  }, AUTOSAVE_DELAY_MS, { maxWait: AUTOSAVE_MAX_WAIT_MS })

  watch([snapshot, () => settings.autosave], () => {
    if (shouldAutosave()) void autosave()
  })

  /** Recovery writes are best effort and run one at a time, so a clear never overtakes a write. */
  function queueRecovery(op: () => Promise<void>): Promise<unknown> {
    recoveryOps = recoveryOps.then(op).catch(error => console.warn('Crash recovery:', error))
    return recoveryOps
  }

  const clearRecovery = () => queueRecovery(() => useServices().recovery.clear())

  // Unsaved changes are copied for crash recovery whether or not autosave is on,
  // encrypted with the workspace's key when it is encrypted.
  const saveRecovery = useDebounceFn(() => queueRecovery(async () => {
    if (!dirty.value) return
    const bytes = cipher ? await encodeEncryptedDocument(current(), cipher) : encodeJsonDocument(current())
    const target = file.value
    await useServices().recovery.write({ bytes, name: target?.name, path: target?.path, savedAt: Date.now() })
  }), AUTOSAVE_DELAY_MS, { maxWait: AUTOSAVE_MAX_WAIT_MS })

  watch(snapshot, () => {
    if (recoveryEnabled && dirty.value) void saveRecovery()
  })
  watch(dirty, (isDirty) => {
    if (recoveryEnabled && !isDirty) void clearRecovery()
  })

  /** Offers to restore changes that were never saved. Returns whether they were restored. */
  async function restore(saved: RecoverySnapshot): Promise<boolean> {
    const { files, dialogs } = useServices()
    const name = saved.name ?? 'Untitled'
    const restoring = await dialogs.confirm({
      title: 'Restore unsaved changes?',
      description: `${name} had changes that were not saved when AI Editor last closed (${new Date(saved.savedAt).toLocaleString()}).`,
      confirmLabel: 'Restore',
      cancelLabel: 'Discard'
    })
    // Without the File System Access handle a browser can't write back, so the next save asks where to.
    const ref = saved.name === undefined ? null : saved.path && files.remembersPaths ? { name: saved.name, path: saved.path } : { name: saved.name }
    if (restoring && await load(saved.bytes, ref, name)) {
      // The changes are still unsaved; the file on disk doesn't have them.
      savedSnapshot.value = ''
      return true
    }
    await clearRecovery()
    return false
  }

  /** Runs once when the app starts: restores unsaved changes after a crash, or reopens the last file. */
  async function startup(): Promise<void> {
    const { files, recovery } = useServices()
    try {
      const saved = await recovery.read().catch((error) => {
        console.warn('Crash recovery:', error)
        return null
      })
      if (saved && await restore(saved)) return
      const last = settings.recentFiles[0]
      if (last && settings.reopenLastFile && files.remembersPaths) await openRecent(last)
    } finally {
      recoveryEnabled = true
    }
  }

  /** Drops the recovery copy, e.g. when the user quits without saving on purpose. */
  const discardRecovery = (): Promise<unknown> => clearRecovery()

  return {
    file,
    fileName,
    encrypted,
    status,
    lastError,
    lastSavedAt,
    dirty,
    canAutosave,
    newWorkspace,
    load,
    open,
    openRecent,
    openDropped,
    forgetRecent,
    startup,
    discardRecovery,
    save,
    saveAs
  }
})
