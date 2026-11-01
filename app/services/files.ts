/**
 * File access: native dialogs + the fs plugin (scoped to picked files), with
 * saves going through the app's atomic `write_file_atomic` command.
 */
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'

export type DocumentKind = 'json' | 'encrypted'

export interface FileRef {
  readonly name: string
  /** Absolute path. Absent for a dropped file, which can't be written back, so saving asks where to. */
  readonly path?: string
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
  /** Replaces the file at `ref.path`. */
  write(ref: FileRef, bytes: Uint8Array): Promise<void>
  /** Reads a file picked in an earlier session, e.g. from the recent files list. */
  reopen(path: string): Promise<OpenedFile>
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

export function createFileSystem(): FileSystem {
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
      // Written to a temporary file and renamed over the original, so a crash never leaves half a file.
      await invoke('write_file_atomic', bytes, { headers: { path: encodeURIComponent(ref.path) } })
    },

    // Picked paths stay in the fs scope across restarts (persisted-scope plugin).
    async reopen(path) {
      return { ref: { name: basename(path), path }, bytes: await readFile(path) }
    }
  }
}
