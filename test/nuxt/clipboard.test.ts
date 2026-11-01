import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { useCopyTracking } from '~/composables/useClipboardGuard'
import { useDocumentStore } from '~/stores/document'
import { createFakeServices } from '../unit/fakes'

let unmount: (() => void) | undefined

/** A text field in an app that tracks copies, with `selected` selected. */
async function setup({ encrypted, value = 'secret plot twist', selected = 'secret' }: { encrypted: boolean, value?: string, selected?: string }) {
  const services = createFakeServices()
  useDocumentStore().encrypted = encrypted
  const wrapper = await mountSuspended(defineComponent({
    setup: () => useCopyTracking(),
    render: () => h('textarea', { value })
  }), { attachTo: document.body })
  unmount = () => wrapper.unmount()

  const field = wrapper.element as HTMLTextAreaElement
  field.focus()
  field.setSelectionRange(value.indexOf(selected), value.indexOf(selected) + selected.length)
  return { ...services, field }
}

function fire(target: EventTarget, type: 'copy' | 'cut') {
  const event = new ClipboardEvent(type, { clipboardData: new DataTransfer(), bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('copy tracking', () => {
  afterEach(() => unmount?.())

  it('leaves copies from a plain workspace to the browser', async () => {
    const { field, clipboard } = await setup({ encrypted: false })

    const event = fire(field, 'copy')

    expect(event.defaultPrevented).toBe(false)
    expect(clipboard.writeSecret).not.toHaveBeenCalled()
  })

  it('copies from an encrypted workspace as a secret, with nothing left for the browser to write', async () => {
    const { field, clipboard } = await setup({ encrypted: true })

    const event = fire(field, 'copy')

    expect(clipboard.writeSecret).toHaveBeenCalledWith('secret')
    expect(event.defaultPrevented).toBe(true)
    expect(event.clipboardData!.types).toEqual([])
    expect(field.value).toBe('secret plot twist')
  })

  it('still removes the text when cutting from a field', async () => {
    const { field, clipboard } = await setup({ encrypted: true })
    const inputs: string[] = []
    field.addEventListener('input', () => inputs.push(field.value))

    fire(field, 'cut')

    expect(clipboard.writeSecret).toHaveBeenCalledWith('secret')
    expect(inputs).toEqual([' plot twist'])
  })

  it('takes over what an editor put on the clipboard, without cutting twice', async () => {
    const { field, clipboard } = await setup({ encrypted: true })
    // Stands in for the prompt editor, which writes its own data and deletes the selection itself.
    field.addEventListener('cut', (event) => {
      event.preventDefault()
      event.clipboardData!.setData('text/html', '<p>**secret**</p>')
      event.clipboardData!.setData('text/plain', '**secret**')
    })

    const event = fire(field, 'cut')

    expect(clipboard.writeSecret).toHaveBeenCalledWith('**secret**')
    expect(event.clipboardData!.types).toEqual([])
    expect(field.value).toBe('secret plot twist')
  })
})
