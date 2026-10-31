import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createCipher, cryptoSettings, isEncryptedEnvelope } from '~/lib/crypto'
import { decryptDocument, encodeEncryptedDocument, encodeJsonDocument, inspectDocument } from '~/lib/document'
import { createDefaultSession, type Session } from '~/lib/workspace'
import { AUTOSAVE_DELAY_MS, useDocumentStore } from '~/stores/document'
import { useSettingsStore } from '~/stores/settings'
import { useWorkspaceStore } from '~/stores/workspace'
import { createFakeServices } from './fakes'

const fileSessions = (): Session[] => [createDefaultSession('From file')]

function setup() {
  const services = createFakeServices()
  const doc = useDocumentStore()
  const workspace = useWorkspaceStore()
  const settings = useSettingsStore()
  return { ...services, doc, workspace, settings }
}

/** Sessions stored on the fake disk at `path`, whatever the format. */
async function readDisk(bytes: Uint8Array | undefined, password = 'pw') {
  const inspected = inspectDocument(bytes!)
  return inspected.kind === 'json' ? inspected.sessions : (await decryptDocument(bytes!, password)).sessions
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
    files.disk.set('a.json', encodeJsonDocument(fileSessions()))
    files.nextOpen = 'a.json'

    expect(await doc.open()).toBe(true)
    expect(workspace.sessions[0]!.title).toBe('From file')
    expect(doc).toMatchObject({ fileName: 'a.json', encrypted: false, dirty: false, canAutosave: true })

    workspace.renameSession(workspace.activeId, 'Edited')
    expect(doc.dirty).toBe(true)

    expect(await doc.save()).toBe(true)
    expect(doc.dirty).toBe(false)
    expect((await readDisk(files.disk.get('a.json')))[0]!.title).toBe('Edited')
  })

  it('unlocks encrypted files, retrying wrong passwords, and keeps them encrypted on save', async () => {
    const { files, doc, workspace, dialogs, answerPasswords } = setup()
    files.disk.set('s.aienc', await encodeEncryptedDocument(fileSessions(), await createCipher('pw')))
    files.nextOpen = 's.aienc'
    answerPasswords('wrong', 'pw')

    expect(await doc.open()).toBe(true)
    expect(dialogs.askPassword).toHaveBeenCalledOnce()
    expect(doc.encrypted).toBe(true)

    workspace.renameSession(workspace.activeId, 'Still secret')
    await doc.save()

    const saved = files.disk.get('s.aienc')!
    expect(isEncryptedEnvelope(saved)).toBe(true)
    expect((await readDisk(saved, 'pw'))[0]!.title).toBe('Still secret')
  })

  it('leaves the workspace alone when unlocking is cancelled', async () => {
    const { files, doc, workspace } = setup()
    files.disk.set('s.aienc', await encodeEncryptedDocument(fileSessions(), await createCipher('pw')))
    files.nextOpen = 's.aienc'
    const before = workspace.sessions

    expect(await doc.open()).toBe(false)
    expect(workspace.sessions).toBe(before)
    expect(doc.file).toBeNull()
  })

  it('asks before discarding unsaved changes', async () => {
    const { files, doc, workspace, dialogs } = setup()
    files.disk.set('a.json', encodeJsonDocument(fileSessions()))
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
    await expect(readDisk(files.disk.get('vault.aienc'), 's3cret')).resolves.toHaveLength(1)
  })

  it('treats dropped files as having no location to save to', async () => {
    const { files, doc } = setup()
    const dropped = new File([encodeJsonDocument(fileSessions())], 'dropped.json')

    expect(await doc.openDropped(dropped)).toBe(true)
    expect(doc).toMatchObject({ fileName: 'dropped.json', canAutosave: false })

    files.nextSave = 'kept.json'
    await doc.save()
    expect(files.writes).toEqual(['kept.json'])
  })

  it('autosaves after edits settle', async () => {
    vi.useFakeTimers()
    const { files, doc, workspace, settings } = setup()
    files.disk.set('a.json', encodeJsonDocument(fileSessions()))
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

    files.disk.set('a.json', encodeJsonDocument(fileSessions()))
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
    files.disk.set('a.json', encodeJsonDocument(fileSessions()))
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
})
