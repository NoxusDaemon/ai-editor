import { describe, it, expect, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TabComponent from '~/components/TabComponent.vue'

// Mock LM Studio Client composable
vi.mock('~/composables/useLMStudioClient', () => ({
  useLMStudioClient: vi.fn(() => ({
    llm: {
      model: vi.fn(async () => ({
        respond: vi.fn(() => ({}))
      }))
    },
    system: {
      listDownloadedModels: vi.fn(async () => [])
    }
  }))
}))

describe('TabComponent', () => {
  const defaultTab = {
    label: '0',
    selectedModel: 'liquid/lfm2.5-1.2b',
    promptsList: [
      { key: 'Cache', content: [], type: 'Segments' },
      { key: 'System', content: '', type: 'Editor' },
      { key: 'User', content: '', type: 'Editor' },
      { key: 'Assistant', content: '', type: 'Editor' }
    ],
    stopController: undefined
  }

  it('renders with an "Add Segment" button', async () => {
    const wrapper = await mountSuspended(TabComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    // Find the "Add Segment" button
    const buttons = wrapper.findAll('button')
    const addButton = buttons.find(b => b.text().includes('Add Segment'))

    expect(addButton).toBeTruthy()
  })

  it('renders the Cache prompt key in the prompts list', async () => {
    const wrapper = await mountSuspended(TabComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    // The Cache key is rendered as a draggable handle text
    const text = wrapper.text()
    expect(text).toContain('Cache')
  })

  it('renders a "Send" button when not streaming', async () => {
    const wrapper = await mountSuspended(TabComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    const buttons = wrapper.findAll('button')
    const sendButton = buttons.find(b => b.text().includes('Send'))

    expect(sendButton).toBeTruthy()
  })
})
