import { describe, it, expect, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TabsComponent from '~/components/TabsComponent.vue'

// Mock Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => undefined),
  save: vi.fn(async () => undefined)
}))

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined)
}))

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

describe('TabsComponent', () => {
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

  it('renders with an initial tab', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('renders a plus button to add tabs', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    // Check that the component renders buttons
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('renders an open dropdown menu button', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    const buttons = wrapper.findAll('button')
    const openButton = buttons.find(b => b.text().includes('Open'))
    expect(openButton).toBeTruthy()
  })

  it('renders an auto-save switch', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    // The switch label contains "Auto Save"
    const autoSaveLabel = wrapper.text().includes('Auto Save')
    expect(autoSaveLabel).toBe(true)
  })

  it('renders file operation dropdown', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    // The dropdown button labeled "Open" is visible
    const buttons = wrapper.findAll('button')
    const openButton = buttons.find(b => b.text().includes('Open'))
    expect(openButton).toBeTruthy()
  })

  it('initializes with auto-save state set', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    // The component should have initialized tabAutoSave state
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.tabAutoSave).toBeDefined()
  })
})
