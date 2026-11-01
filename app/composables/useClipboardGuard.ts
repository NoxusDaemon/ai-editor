import { refAutoReset, useClipboard, useEventListener } from '@vueuse/core'
import type { Clipboard } from '~/services/clipboard'
import { errorMessage, useServices } from '~/services/container'

// The last text the app put on the clipboard, normalised for comparison.
let copied: string | null = null

// Windows reads text back with CRLF line endings.
const normalize = (text: string) => text.replace(/\r\n?/g, '\n').trim()

/** Records text the app put on the clipboard, e.g. from a copy button. */
export function rememberCopiedText(text: string) {
  const value = normalize(text)
  if (value) copied = value
}

/**
 * Clears the clipboard if it still holds text copied from the app, so it doesn't
 * outlive the session. Anything copied in another app since is left alone.
 * Never throws: it runs while quitting.
 */
export async function clearCopiedText(clipboard: Clipboard): Promise<boolean> {
  if (copied === null) return false
  try {
    const current = await clipboard.readText()
    if (current === null || normalize(current) !== copied) return false
    await clipboard.clear()
    copied = null
    return true
  } catch {
    return false
  }
}

/** Text from an encrypted workspace is copied as a secret, where the platform supports it. */
function secretWriter() {
  return useDocumentStore().encrypted ? useServices().clipboard.writeSecret : null
}

async function copySecret(write: (text: string) => Promise<void>, text: string): Promise<boolean> {
  try {
    await write(text)
    return true
  } catch (error) {
    useServices().dialogs.notify({ title: 'Could not copy', description: errorMessage(error), color: 'error' })
    return false
  }
}

/** What a copy or cut puts on the clipboard: what the editor handling it set, else the selection. */
function copiedTextOf(event: ClipboardEvent): string {
  const handled = event.clipboardData?.getData('text/plain')
  if (handled) return handled
  const field = document.activeElement
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0)
  }
  return document.getSelection()?.toString() ?? ''
}

/** Does what the browser would have done for a cut in a plain text field. */
function deleteFieldSelection() {
  const field = document.activeElement
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || field.readOnly) return
  field.setRangeText('', field.selectionStart ?? 0, field.selectionEnd ?? 0, 'end')
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Handles every copy and cut in the app (keyboard or context menu). The text is
 * remembered so it can be cleared on quit. In an encrypted workspace it is written
 * as a secret instead, so it never reaches clipboard history. Call once.
 */
export function useCopyTracking() {
  // Bubble phase, so the editors' own handlers have already filled in the data.
  useEventListener(document, ['copy', 'cut'], (event: ClipboardEvent) => {
    const text = copiedTextOf(event)
    if (!text) return
    rememberCopiedText(text)

    const write = secretWriter()
    if (!write || !event.clipboardData) return
    // An editor that handled the event has already deleted the selection for a cut.
    const handled = event.defaultPrevented
    // Cancelling with no data stops the browser writing anything for Windows to record.
    event.preventDefault()
    event.clipboardData.clearData()
    if (event.type === 'cut' && !handled) deleteFieldSelection()
    void copySecret(write, text)
  })
}

/** For copy buttons: copies like Ctrl+C would, with a `copied` flag for feedback. */
export function useCopyButton() {
  const { copy: copyPlain } = useClipboard({ legacy: true })
  const copied = refAutoReset(false, 1500)

  async function copy(text: string) {
    rememberCopiedText(text)
    const write = secretWriter()
    if (write) {
      copied.value = await copySecret(write, text)
    } else {
      await copyPlain(text)
      copied.value = true
    }
  }

  return { copy, copied }
}
