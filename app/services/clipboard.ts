import { isTauri } from '@tauri-apps/api/core'
import { clear, readText, writeSecret } from '@tauri-apps/plugin-clipboard-manager'

/** The parts of the system clipboard the app uses. */
export interface Clipboard {
  /** The current text, or `null` if there is none or it can't be read. */
  readText(): Promise<string | null>
  /**
   * Writes text marked as sensitive: Windows keeps it out of clipboard history and
   * cloud sync, and clipboard managers are asked to skip it. `null` in browsers,
   * which can't mark text like that.
   */
  writeSecret: ((text: string) => Promise<void>) | null
  clear(): Promise<void>
}

export function createClipboard(): Clipboard {
  if (isTauri()) {
    return {
      readText: () => readText().catch(() => null),
      writeSecret,
      clear
    }
  }
  // Browsers only allow clipboard access in response to user input, so there is nothing to do on close.
  return {
    readText: async () => null,
    writeSecret: null,
    clear: async () => {}
  }
}
