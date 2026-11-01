import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { ReserveAppShortcuts } from '~/components/PromptEditor.vue'

let editor: Editor | undefined

function press(key: string, init: KeyboardEventInit = {}) {
  editor!.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...init }))
}

describe('PromptEditor shortcuts', () => {
  afterEach(() => editor?.destroy())

  it('leaves app shortcuts to the app instead of formatting text', () => {
    editor = new Editor({ extensions: [StarterKit, ReserveAppShortcuts], content: '<p>Who are you?</p>' })
    editor.commands.selectAll()

    press('S', { shiftKey: true })
    press('Enter')

    expect(editor.getHTML()).toBe('<p>Who are you?</p>')
  })

  it('still applies other formatting shortcuts', () => {
    editor = new Editor({ extensions: [StarterKit, ReserveAppShortcuts], content: '<p>Who are you?</p>' })
    editor.commands.selectAll()

    press('b')

    expect(editor.getHTML()).toBe('<p><strong>Who are you?</strong></p>')
  })
})
