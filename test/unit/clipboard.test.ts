import { describe, expect, it, vi } from 'vitest'
import { clearCopiedText, rememberCopiedText } from '~/composables/useClipboardGuard'
import type { Clipboard } from '~/services/clipboard'

function fakeClipboard(text: string | null) {
  return {
    readText: vi.fn<Clipboard['readText']>(async () => text),
    writeSecret: null,
    clear: vi.fn<Clipboard['clear']>(async () => {})
  }
}

describe('clipboard guard', () => {
  it('clears text the app copied, even with Windows line endings', async () => {
    rememberCopiedText('secret\nplot')
    const clipboard = fakeClipboard('secret\r\nplot')

    expect(await clearCopiedText(clipboard)).toBe(true)
    expect(clipboard.clear).toHaveBeenCalledOnce()
  })

  it('leaves text copied in another app alone', async () => {
    rememberCopiedText('from the app')
    const clipboard = fakeClipboard('from a browser')

    expect(await clearCopiedText(clipboard)).toBe(false)
    expect(clipboard.clear).not.toHaveBeenCalled()
  })

  it('does nothing once the copied text has been cleared', async () => {
    rememberCopiedText('once')
    await clearCopiedText(fakeClipboard('once'))
    const clipboard = fakeClipboard('once')

    expect(await clearCopiedText(clipboard)).toBe(false)
    expect(clipboard.readText).not.toHaveBeenCalled()
  })

  it('never throws, so quitting cannot fail', async () => {
    rememberCopiedText('text')
    const clipboard = fakeClipboard('text')
    clipboard.clear.mockRejectedValue(new Error('denied'))

    expect(await clearCopiedText(clipboard)).toBe(false)
  })
})
