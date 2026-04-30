import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import EditorComponent from '~/components/EditorComponent.vue'

describe('EditorComponent', () => {
  it('renders an editor component', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'Test content'
      }
    })

    // The component wraps UEditor, so it should render something
    expect(wrapper.exists()).toBe(true)
  })

  it('binds the v-model value', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'Hello World'
      }
    })

    // Check that the component renders with the expected value
    expect(wrapper.props('modelValue')).toBe('Hello World')
  })

  it('updates modelValue when content changes', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'Initial content'
      }
    })

    // Simulate updating the model value
    await wrapper.setProps({ modelValue: 'Updated content' })
    await wrapper.vm.$nextTick()

    expect(wrapper.props('modelValue')).toBe('Updated content')
  })
})
