/**
 * File access for the two runtimes the app supports:
 * - Tauri desktop: native dialogs + the fs plugin (scoped to picked files).
 * - Browser (`bun run dev`): File System Access API, falling back to
 *   upload/download where it is unavailable.
 */
import { isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'

export type DocumentKind = 'json' | 'encrypted'

export interface FileRef {
  readonly name: string
  /** Absolute path in the desktop app. */
  readonly path?: string
  /** File System Access handle in the browser. */
  readonly handle?: FileSystemFileHandle
}

export interface OpenedFile {
  ref: FileRef
  bytes: Uint8Array
}

export interface FileSystem {
  /** Asks the user for a file and reads it. `null` when cancelled. */
  pickAndRead(): Promise<OpenedFile | null>
  /** Asks the user where to save. `null` when cancelled. */
  pickSaveTarget(kind: DocumentKind, suggestedName: string): Promise<FileRef | null>
  write(ref: FileRef, bytes: Uint8Array): Promise<void>
  /** Whether `write` updates the file in place, which autosave relies on. */
  canWriteInPlace(ref: FileRef): boolean
}

export const FILE_EXTENSIONS: Record<DocumentKind, string> = { json: 'json', encrypted: 'aienc' }

const FILTER_NAMES: Record<DocumentKind, string> = {
  json: 'AI Editor workspace',
  encrypted: 'Encrypted AI Editor workspace'
}

export const basename = (path: string): string => path.split(/[\\/]/).pop() || path

/** `notes.json` → `notes.aienc` and vice versa; other names just get the extension. */
export function withExtension(name: string, kind: DocumentKind): string {
  const stem = name.replace(/\.(json|aienc)$/i, '')
  return `${stem}.${FILE_EXTENSIONS[kind]}`
}

export function createTauriFileSystem(): FileSystem {
  return {
    async pickAndRead() {
      const path = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: 'AI Editor workspaces', extensions: Object.values(FILE_EXTENSIONS) },
          { name: 'All files', extensions: ['*'] }
        ]
      })
      if (!path) return null
      return { ref: { name: basename(path), path }, bytes: await readFile(path) }
    },

    async pickSaveTarget(kind, suggestedName) {
      const path = await save({
        defaultPath: suggestedName,
        filters: [{ name: FILTER_NAMES[kind], extensions: [FILE_EXTENSIONS[kind]] }]
      })
      return path ? { name: basename(path), path } : null
    },

    async write(ref, bytes) {
      if (!ref.path) throw new Error(`"${ref.name}" has no location on disk. Use "Save as" instead.`)
      await writeFile(ref.path, bytes)
    },

    canWriteInPlace: ref => !!ref.path
  }
}

interface FilePickerType {
  description: string
  accept: Record<string, string[]>
}

interface FilePickerWindow {
  showOpenFilePicker?: (options: { types: FilePickerType[] }) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options: { suggestedName: string, types: FilePickerType[] }) => Promise<FileSystemFileHandle>
}

const PICKER_TYPES: Record<DocumentKind, FilePickerType> = {
  json: { description: FILTER_NAMES.json, accept: { 'application/json': ['.json'] } },
  encrypted: { description: FILTER_NAMES.encrypted, accept: { 'application/octet-stream': ['.aienc'] } }
}

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

function chooseWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.aienc,application/json'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

function download(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function createBrowserFileSystem(): FileSystem {
  const pickers = window as Window & FilePickerWindow

  return {
    async pickAndRead() {
      if (!pickers.showOpenFilePicker) {
        const file = await chooseWithInput()
        return file ? { ref: { name: file.name }, bytes: new Uint8Array(await file.arrayBuffer()) } : null
      }
      try {
        const [handle] = await pickers.showOpenFilePicker({ types: [PICKER_TYPES.json, PICKER_TYPES.encrypted] })
        if (!handle) return null
        const file = await handle.getFile()
        return { ref: { name: file.name, handle }, bytes: new Uint8Array(await file.arrayBuffer()) }
      } catch (error) {
        if (isAbortError(error)) return null
        throw error
      }
    },

    async pickSaveTarget(kind, suggestedName) {
      // Without the File System Access API every save becomes a download.
      if (!pickers.showSaveFilePicker) return { name: suggestedName }
      try {
        const handle = await pickers.showSaveFilePicker({ suggestedName, types: [PICKER_TYPES[kind]] })
        return { name: handle.name, handle }
      } catch (error) {
        if (isAbortError(error)) return null
        throw error
      }
    },

    async write(ref, bytes) {
      if (!ref.handle) return download(ref.name, bytes)
      const writable = await ref.handle.createWritable()
      await writable.write(new Uint8Array(bytes))
      await writable.close()
    },

    canWriteInPlace: ref => !!ref.handle
  }
}

export function createFileSystem(): FileSystem {
  return isTauri() ? createTauriFileSystem() : createBrowserFileSystem()
}
