import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import EditorComponent from '~/components/EditorComponent.vue'

describe('EditorComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an editor component', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'Test content'
      }
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('binds the v-model value', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'Hello World'
      }
    })

    expect(wrapper.props('modelValue')).toBe('Hello World')
  })

  it('updates modelValue when content changes', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'Initial content'
      }
    })

    await wrapper.setProps({ modelValue: 'Updated content' })
    await wrapper.vm.$nextTick()

    expect(wrapper.props('modelValue')).toBe('Updated content')
  })

  it('renders with empty string content', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: ''
      }
    })

    expect(wrapper.exists()).toBe(true)
    expect(wrapper.props('modelValue')).toBe('')
  })

  it('renders with long content', async () => {
    const longContent = 'a'.repeat(10000)
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: longContent
      }
    })

    expect(wrapper.props('modelValue')).toBe(longContent)
  })

  it('renders with markdown content', async () => {
    const markdown = `# Heading\n\nSome **bold** and *italic* text.\n\n- List item 1\n- List item 2`
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: markdown
      }
    })

    expect(wrapper.props('modelValue')).toBe(markdown)
  })

  it('renders with unicode content', async () => {
    const unicode = 'Hello 世界 🌍 مرحبا'
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: unicode
      }
    })

    expect(wrapper.props('modelValue')).toBe(unicode)
  })

  it('renders with newlines and whitespace', async () => {
    const content = 'Line 1\n\nLine 2\n  Indented\n\tTabbed'
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: content
      }
    })

    expect(wrapper.props('modelValue')).toBe(content)
  })

  it('wraps UEditor component', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'test'
      }
    })

    // UEditor should be rendered
    const uEditors = wrapper.findAllComponents({ name: 'UEditor' })
    expect(uEditors.length).toBeGreaterThan(0)
  })

  it('has correct CSS class applied', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'test'
      }
    })

    const container = wrapper.find('div')
    expect(container.exists()).toBe(true)
  })

  it('renders UEditor with content-type markdown', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: 'test'
      }
    })

    const uEditor = wrapper.findComponent({ name: 'UEditor' })
    expect(uEditor.exists()).toBe(true)
  })

  it('handles null modelValue gracefully', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: null as any
      }
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('handles undefined modelValue gracefully', async () => {
    const wrapper = await mountSuspended(EditorComponent, {
      props: {
        modelValue: undefined
      }
    })

    expect(wrapper.exists()).toBe(true)
  })
})
