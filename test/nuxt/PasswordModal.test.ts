import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PasswordModal from '~/components/PasswordModal.vue'

// `open` and `portal` fall through to UModal; rendering in place keeps the DOM queryable.
const mountModal = (props: Record<string, unknown>) =>
  mountSuspended(PasswordModal, { props: { title: 'Unlock', open: true, portal: false, ...props } })

describe('PasswordModal', () => {
  it('requires the confirmation to match before submitting', async () => {
    const wrapper = await mountModal({ confirm: true })
    const submit = () => wrapper.get('[data-testid=password-submit]')

    await wrapper.get('[data-testid=password]').setValue('hunter22')
    await wrapper.get('[data-testid=password-repeat]').setValue('hunter2')
    expect(wrapper.text()).toContain('Passwords do not match')
    expect(submit().attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid=password-repeat]').setValue('hunter22')
    expect(submit().attributes('disabled')).toBeUndefined()
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('close')).toEqual([['hunter22']])
  })

  it('keeps the dialog open and explains a wrong password', async () => {
    const verify = vi.fn(async (password: string) => password === 'right')
    const wrapper = await mountModal({ verify })

    await wrapper.get('[data-testid=password]').setValue('wrong')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid=password-error]').text()).toContain('Incorrect password')
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.get('[data-testid=password]').setValue('right')
    expect(wrapper.find('[data-testid=password-error]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(verify).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('close')).toEqual([['right']])
  })

  it('resolves with null when cancelled', async () => {
    const wrapper = await mountModal({})
    const cancel = wrapper.findAll('button').find(b => b.text() === 'Cancel')!
    await cancel.trigger('click')
    expect(wrapper.emitted('close')).toEqual([[null]])
  })
})
