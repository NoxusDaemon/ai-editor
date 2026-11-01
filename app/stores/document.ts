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
import { withExtension, type DocumentKind, type FileRef } from '~/services/files'
import { useSettingsStore } from './settings'
import { useWorkspaceStore } from './workspace'

export type SaveStatus = 'idle' | 'saving' | 'error'

export const AUTOSAVE_DELAY_MS = 1000
export const AUTOSAVE_MAX_WAIT_MS = 5000

/** The file behind the workspace: opening, saving, encryption and autosave. */
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

  /** Reads a file of any supported kind, asking for the password if it is encrypted. */
  async function load(bytes: Uint8Array, ref: FileRef): Promise<boolean> {
    try {
      const inspected = inspectDocument(bytes)
      if (inspected.kind === 'json') {
        adopt(inspected.workspace, ref, null)
        return true
      }

      let unlocked: DecryptedDocument | undefined
      const password = await useServices().dialogs.askPassword({
        title: `Unlock ${ref.name}`,
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
      report(`Could not open ${ref.name}`, error)
      return false
    }
  }

  async function open(): Promise<boolean> {
    if (!await confirmDiscard()) return false
    try {
      const opened = await useServices().files.pickAndRead()
      return opened ? await load(opened.bytes, opened.ref) : false
    } catch (error) {
      report('Could not open the file', error)
      return false
    }
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
    openDropped,
    save,
    saveAs
  }
})
