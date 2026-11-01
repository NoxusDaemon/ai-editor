import { clear, readText, writeSecret } from '@tauri-apps/plugin-clipboard-manager'

/** The parts of the system clipboard the app uses. */
export interface Clipboard {
  /** The current text, or `null` if there is none or it can't be read. */
  readText(): Promise<string | null>
  /**
   * Writes text marked as sensitive: Windows keeps it out of clipboard history and
   * cloud sync, and clipboard managers are asked to skip it.
   */
  writeSecret(text: string): Promise<void>
  clear(): Promise<void>
}

export function createClipboard(): Clipboard {
  return {
    readText: () => readText().catch(() => null),
    writeSecret,
    clear
  }
}
