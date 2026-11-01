import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createCipher, cryptoSettings, isEncryptedEnvelope } from '~/lib/crypto'
import { decryptDocument, encodeEncryptedDocument, encodeJsonDocument, inspectDocument } from '~/lib/document'
import { createDefaultSession, createSection, createSidebars, createSnippet, type Workspace } from '~/lib/workspace'
import { AUTOSAVE_DELAY_MS, useDocumentStore } from '~/stores/document'
import { useSettingsStore } from '~/stores/settings'
import { useWorkspaceStore } from '~/stores/workspace'
import { createFakeServices } from './fakes'

const fileWorkspace = (): Workspace => ({ sessions: [createDefaultSession('From file')], sidebars: createSidebars() })

function setup() {
  const services = createFakeServices()
  const doc = useDocumentStore()
  const workspace = useWorkspaceStore()
  const settings = useSettingsStore()
  return { ...services, doc, workspace, settings }
}

/** The workspace stored in `bytes`, whatever the format. */
async function readDisk(bytes: Uint8Array | undefined, password = 'pw') {
  const inspected = inspectDocument(bytes!)
  return inspected.kind === 'json' ? inspected.workspace : (await decryptDocument(bytes!, password)).workspace
}

describe('document store', () => {
  beforeAll(() => {
    cryptoSettings.iterations = 1_000
  })

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens a JSON workspace and tracks unsaved changes', async () => {
    const { files, doc, workspace } = setup()
    files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
    files.nextOpen = 'a.json'

    expect(await doc.open()).toBe(true)
    expect(workspace.sessions[0]!.title).toBe('From file')
    expect(doc).toMatchObject({ fileName: 'a.json', encrypted: false, dirty: false, canAutosave: true })

    workspace.renameSession(workspace.activeId, 'Edited')
    expect(doc.dirty).toBe(true)

    expect(await doc.save()).toBe(true)
    expect(doc.dirty).toBe(false)
    expect((await readDisk(files.disk.get('a.json'))).sessions[0]!.title).toBe('Edited')
  })

  it('unlocks encrypted files, retrying wrong passwords, and keeps them encrypted on save', async () => {
    const { files, doc, workspace, dialogs, answerPasswords } = setup()
    files.disk.set('s.aienc', await encodeEncryptedDocument(fileWorkspace(), await createCipher('pw')))
    files.nextOpen = 's.aienc'
    answerPasswords('wrong', 'pw')

    expect(await doc.open()).toBe(true)
    expect(dialogs.askPassword).toHaveBeenCalledOnce()
    expect(doc.encrypted).toBe(true)

    workspace.renameSession(workspace.activeId, 'Still secret')
    await doc.save()

    const saved = files.disk.get('s.aienc')!
    expect(isEncryptedEnvelope(saved)).toBe(true)
    expect((await readDisk(saved, 'pw')).sessions[0]!.title).toBe('Still secret')
  })

  it('leaves the workspace alone when unlocking is cancelled', async () => {
    const { files, doc, workspace } = setup()
    files.disk.set('s.aienc', await encodeEncryptedDocument(fileWorkspace(), await createCipher('pw')))
    files.nextOpen = 's.aienc'
    const before = workspace.sessions

    expect(await doc.open()).toBe(false)
    expect(workspace.sessions).toBe(before)
    expect(doc.file).toBeNull()
  })

  it('asks before discarding unsaved changes', async () => {
    const { files, doc, workspace, dialogs } = setup()
    files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
    files.nextOpen = 'a.json'
    workspace.addSession()
    dialogs.confirm.mockResolvedValueOnce(false)

    expect(await doc.open()).toBe(false)
    expect(workspace.sessions).toHaveLength(2)

    expect(await doc.newWorkspace()).toBe(true) // confirm defaults to "discard"
    expect(workspace.sessions).toHaveLength(1)
    expect(dialogs.confirm).toHaveBeenCalledTimes(2)
  })

  it('reports files that are not workspaces', async () => {
    const { files, doc, dialogs } = setup()
    files.disk.set('notes.txt', new TextEncoder().encode('{"hello":1}'))
    files.nextOpen = 'notes.txt'

    expect(await doc.open()).toBe(false)
    expect(dialogs.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not open notes.txt', color: 'error' }))
  })

  it('saves an unsaved workspace through "save as"', async () => {
    const { files, doc } = setup()
    files.nextSave = 'new.json'

    expect(await doc.save()).toBe(true)
    expect(doc.fileName).toBe('new.json')
    expect(files.disk.has('new.json')).toBe(true)
  })

  it('encrypts with a newly chosen password', async () => {
    const { files, doc, answerPasswords } = setup()
    files.nextSave = 'vault.aienc'
    answerPasswords('s3cret')

    expect(await doc.saveAs('encrypted')).toBe(true)
    expect(doc).toMatchObject({ fileName: 'vault.aienc', encrypted: true, dirty: false })
    expect((await readDisk(files.disk.get('vault.aienc'), 's3cret')).sessions).toHaveLength(1)
  })

  it('keeps sidebar snippets in the file, encrypted along with it', async () => {
    const { files, doc, workspace, answerPasswords } = setup()
    workspace.setSidebar('left', [createSection('Plot'), createSnippet('twist')])
    expect(doc.dirty).toBe(true)

    files.nextSave = 'vault.aienc'
    answerPasswords('pw')
    expect(await doc.saveAs('encrypted')).toBe(true)
    expect((await readDisk(files.disk.get('vault.aienc'))).sidebars.left)
      .toMatchObject([{ kind: 'section', title: 'Plot' }, { kind: 'snippet', text: 'twist' }])

    await doc.newWorkspace()
    expect(workspace.sidebars.left).toEqual([])

    files.nextOpen = 'vault.aienc'
    expect(await doc.open()).toBe(true)
    expect(workspace.sidebars.left.map(item => item.kind)).toEqual(['section', 'snippet'])
  })

  it('treats dropped files as having no location to save to', async () => {
    const { files, doc } = setup()
    const dropped = new File([encodeJsonDocument(fileWorkspace())], 'dropped.json')

    expect(await doc.openDropped(dropped)).toBe(true)
    expect(doc).toMatchObject({ fileName: 'dropped.json', canAutosave: false })

    files.nextSave = 'kept.json'
    await doc.save()
    expect(files.writes).toEqual(['kept.json'])
  })

  it('autosaves after edits settle', async () => {
    vi.useFakeTimers()
    const { files, doc, workspace, settings } = setup()
    files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
    files.nextOpen = 'a.json'
    await doc.open()
    settings.autosave = true

    workspace.renameSession(workspace.activeId, 'Autosaved')
    await nextTick()
    expect(files.writes).toEqual([])

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(files.writes).toEqual(['a.json'])
    expect(doc.dirty).toBe(false)
  })

  it('never autosaves without a file, or when switched off', async () => {
    vi.useFakeTimers()
    const { files, doc, workspace, settings } = setup()
    settings.autosave = true
    workspace.addSession()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(files.writes).toEqual([])

    files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
    files.nextOpen = 'a.json'
    await doc.open()
    settings.autosave = false
    workspace.addSession()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(files.writes).toEqual([])
  })

  it('surfaces a failing autosave once rather than on every attempt', async () => {
    vi.useFakeTimers()
    const { files, doc, workspace, settings, dialogs } = setup()
    files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
    files.nextOpen = 'a.json'
    await doc.open()
    settings.autosave = true
    files.failWrites = true

    workspace.renameSession(workspace.activeId, 'one')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    workspace.renameSession(workspace.activeId, 'two')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    expect(doc).toMatchObject({ status: 'error', lastError: 'Disk full', dirty: true })
    expect(dialogs.notify).toHaveBeenCalledOnce()
  })

  describe('recent files', () => {
    it('remembers opened and saved files, newest first, without duplicates', async () => {
      const { files, doc, settings } = setup()
      files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
      files.nextOpen = 'a.json'
      await doc.open()
      files.nextSave = 'b.json'
      await doc.saveAs('json')
      files.nextOpen = 'a.json'
      await doc.open()

      expect(settings.recentFiles).toEqual(['a.json', 'b.json'])
    })

    it('reopens a recent file, and forgets it when it is gone', async () => {
      const { files, doc, workspace, settings, dialogs } = setup()
      files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
      settings.recentFiles = ['a.json', 'gone.json']

      expect(await doc.openRecent('a.json')).toBe(true)
      expect(workspace.sessions[0]!.title).toBe('From file')
      expect(doc.fileName).toBe('a.json')

      expect(await doc.openRecent('gone.json')).toBe(false)
      expect(settings.recentFiles).toEqual(['a.json'])
      expect(dialogs.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not open gone.json' }))
    })

    it('reopens the last file on startup unless switched off', async () => {
      const { files, doc, settings } = setup()
      files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
      settings.recentFiles = ['a.json']
      settings.reopenLastFile = false
      await doc.startup()
      expect(doc.fileName).toBe('Untitled')

      settings.reopenLastFile = true
      await doc.startup()
      expect(doc.fileName).toBe('a.json')
    })
  })

  describe('crash recovery', () => {
    it('keeps a copy of unsaved changes and drops it once they are saved', async () => {
      vi.useFakeTimers()
      const { files, recovery, doc, workspace } = setup()
      files.disk.set('a.json', encodeJsonDocument(fileWorkspace()))
      files.nextOpen = 'a.json'
      await doc.startup()
      await doc.open()

      workspace.renameSession(workspace.activeId, 'Unsaved')
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
      expect(recovery.saved).toMatchObject({ name: 'a.json', path: 'a.json' })
      expect((await readDisk(recovery.saved!.bytes)).sessions[0]!.title).toBe('Unsaved')
      expect(files.writes).toEqual([])

      await doc.save()
      await vi.advanceTimersByTimeAsync(0)
      expect(recovery.saved).toBeNull()
    })

    it('encrypts the copy of an encrypted workspace', async () => {
      vi.useFakeTimers()
      const { files, recovery, doc, workspace, answerPasswords } = setup()
      files.disk.set('s.aienc', await encodeEncryptedDocument(fileWorkspace(), await createCipher('pw')))
      files.nextOpen = 's.aienc'
      answerPasswords('pw')
      await doc.startup()
      await doc.open()

      workspace.renameSession(workspace.activeId, 'Secret')
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
      // Encryption finishes outside the fake clock.
      await vi.waitFor(() => expect(recovery.saved).not.toBeNull())
      expect(isEncryptedEnvelope(recovery.saved!.bytes)).toBe(true)
      expect((await readDisk(recovery.saved!.bytes)).sessions[0]!.title).toBe('Secret')
    })

    it('does not overwrite the copy before offering to restore it', async () => {
      vi.useFakeTimers()
      const { recovery, workspace } = setup()
      const saved = { bytes: encodeJsonDocument(fileWorkspace()), savedAt: 0 }
      recovery.saved = saved

      workspace.addSession()
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
      expect(recovery.saved).toBe(saved)
    })

    it('restores an unsaved workspace on startup as unsaved', async () => {
      const { recovery, doc, workspace, dialogs } = setup()
      recovery.saved = { bytes: encodeJsonDocument(fileWorkspace()), savedAt: 0 }

      await doc.startup()

      expect(dialogs.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Restore', cancelLabel: 'Discard' }))
      expect(workspace.sessions[0]!.title).toBe('From file')
      expect(doc).toMatchObject({ fileName: 'Untitled', dirty: true })
      expect(recovery.saved).not.toBeNull()
    })

    it('restores changes to an encrypted file back into that file', async () => {
      const { files, recovery, doc, workspace, settings, answerPasswords } = setup()
      const cipher = await createCipher('pw')
      recovery.saved = { bytes: await encodeEncryptedDocument(fileWorkspace(), cipher), name: 's.aienc', path: 's.aienc', savedAt: 0 }
      settings.recentFiles = ['other.json']
      answerPasswords('pw')

      await doc.startup()
      expect(doc).toMatchObject({ fileName: 's.aienc', encrypted: true, dirty: true })

      await doc.save()
      expect(files.writes).toEqual(['s.aienc'])
      expect((await readDisk(files.disk.get('s.aienc'))).sessions[0]!.title).toBe(workspace.sessions[0]!.title)
    })

    it('discards the copy when restoring is declined', async () => {
      const { recovery, doc, dialogs } = setup()
      recovery.saved = { bytes: encodeJsonDocument(fileWorkspace()), savedAt: 0 }
      dialogs.confirm.mockResolvedValue(false)

      await doc.startup()

      expect(doc.fileName).toBe('Untitled')
      expect(recovery.saved).toBeNull()
    })
  })
})
