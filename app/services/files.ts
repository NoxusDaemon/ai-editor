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

/** A document imported into a knowledge node. */
export interface TextFile {
  name: string
  text: string
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
  /** Asks the user for text documents and reads them as plain text. Empty when cancelled. */
  pickTextFiles(): Promise<TextFile[]>
}

/** Text formats a knowledge node can import. */
export const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'html', 'htm', 'log', 'yaml', 'yml']
export const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024

const HTML_ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&amp;': '&' }

/** Decodes a document; HTML is reduced to its visible text. */
export function documentText(name: string, bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
  if (!/\.html?$/i.test(name)) return text
  return text
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|lt|gt|quot|#39|amp);/g, entity => HTML_ENTITIES[entity]!)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim()
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
    },

    async pickTextFiles() {
      const picked = await open({
        multiple: true,
        directory: false,
        filters: [
          { name: 'Text documents', extensions: TEXT_EXTENSIONS },
          { name: 'All files', extensions: ['*'] }
        ]
      })
      if (!picked) return []
      const paths = Array.isArray(picked) ? picked : [picked]
      return Promise.all(paths.map(async (path) => {
        const name = basename(path)
        const bytes = await readFile(path)
        if (bytes.byteLength > MAX_TEXT_FILE_BYTES) throw new Error(`${name} is larger than 10 MB.`)
        return { name, text: documentText(name, bytes) }
      }))
    }
  }
}
