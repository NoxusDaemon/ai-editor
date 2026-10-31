import { beforeEach, describe, expect, it, vi } from 'vitest'
import { basename, createTauriFileSystem, withExtension } from '~/services/files'

const tauri = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: tauri.open, save: tauri.save }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: tauri.readFile, writeFile: tauri.writeFile }))

describe('file helpers', () => {
  it('extracts file names from Windows and POSIX paths', () => {
    expect(basename('C:\\Users\\me\\notes.json')).toBe('notes.json')
    expect(basename('/home/me/notes.aienc')).toBe('notes.aienc')
  })

  it('swaps between workspace extensions', () => {
    expect(withExtension('notes.json', 'encrypted')).toBe('notes.aienc')
    expect(withExtension('notes.AIENC', 'json')).toBe('notes.json')
    expect(withExtension('draft', 'json')).toBe('draft.json')
  })
})

describe('Tauri file system', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the file the user picks', async () => {
    tauri.open.mockResolvedValue('C:\\data\\work.json')
    tauri.readFile.mockResolvedValue(new Uint8Array([1, 2]))

    const opened = await createTauriFileSystem().pickAndRead()

    expect(opened).toEqual({ ref: { name: 'work.json', path: 'C:\\data\\work.json' }, bytes: new Uint8Array([1, 2]) })
    expect(tauri.open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, directory: false }))
  })

  it('returns null when a dialog is cancelled', async () => {
    tauri.open.mockResolvedValue(null)
    tauri.save.mockResolvedValue(null)
    const files = createTauriFileSystem()

    expect(await files.pickAndRead()).toBeNull()
    expect(await files.pickSaveTarget('json', 'x.json')).toBeNull()
    expect(tauri.readFile).not.toHaveBeenCalled()
  })

  it('offers the right file type when saving', async () => {
    tauri.save.mockResolvedValue('/tmp/vault.aienc')

    const target = await createTauriFileSystem().pickSaveTarget('encrypted', 'vault.aienc')

    expect(target).toEqual({ name: 'vault.aienc', path: '/tmp/vault.aienc' })
    expect(tauri.save).toHaveBeenCalledWith({
      defaultPath: 'vault.aienc',
      filters: [{ name: 'Encrypted AI Editor workspace', extensions: ['aienc'] }]
    })
  })

  it('writes in place only when the file has a path', async () => {
    const files = createTauriFileSystem()
    const bytes = new Uint8Array([7])

    await files.write({ name: 'a.json', path: '/a.json' }, bytes)
    expect(tauri.writeFile).toHaveBeenCalledWith('/a.json', bytes)

    expect(files.canWriteInPlace({ name: 'dropped.json' })).toBe(false)
    await expect(files.write({ name: 'dropped.json' }, bytes)).rejects.toThrow('Save as')
  })
})
