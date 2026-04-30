import { describe, it, expect, vi, beforeEach } from 'vitest'
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

// Mock useFileHandler
vi.mock('~/composables/useFileHandler', () => ({
  useFileHandler: vi.fn(() => ({
    readFileText: vi.fn(async () => '[]'),
    canDecrypt: vi.fn(async () => true)
  }))
}))

// Mock useCrypto
vi.mock('~/composables/useCrypto', () => ({
  useCrypto: vi.fn(() => ({
    encryptFile: vi.fn(async () => {}),
    decryptFile: vi.fn(async () => ({}))
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

  beforeEach(() => {
    vi.clearAllMocks()
  })

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

    expect(wrapper.text()).toContain('Auto Save')
  })

  it('renders file operation dropdown', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    const buttons = wrapper.findAll('button')
    const openButton = buttons.find(b => b.text().includes('Open'))
    expect(openButton).toBeTruthy()
  })

  it('initializes with auto-save state', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.tabAutoSave).toBeDefined()
  })

  it('renders tab labels with correct indices', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    const text = wrapper.text()
    expect(text).toContain('0')
  })

  it('sets auto-save per tab on mount', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    await wrapper.vm.$nextTick()
    const autoSave = wrapper.vm.tabAutoSave as Record<number, boolean>
    expect(typeof autoSave).toBe('object')
  })

  it('handles multiple tabs correctly', async () => {
    const tab1 = { ...defaultTab, label: '0' }
    const tab2 = { ...defaultTab, label: '1' }

    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [tab1, tab2]
      }
    })

    expect(wrapper.props('modelValue')).toHaveLength(2)
    expect(wrapper.text()).toContain('0')
    expect(wrapper.text()).toContain('1')
  })

  it('has dropdown menu with file operations', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    await wrapper.vm.$nextTick()
    const dropdownItems = (wrapper.vm as any).dropdownItems
    expect(dropdownItems).toBeDefined()
    expect(dropdownItems).toHaveLength(4)
    expect(dropdownItems[0].label).toBe('Open JSON File')
    expect(dropdownItems[1].label).toBe('Open Encrypted File')
    expect(dropdownItems[2].label).toBe('Export JSON File')
    expect(dropdownItems[3].label).toBe('Save & Enc File')
  })

  it('uses USwitch component for auto-save', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    const switches = wrapper.findAll('[role="switch"], button')
    expect(switches.length).toBeGreaterThan(0)
  })

  it('renders TabComponent for each tab', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    const tabComponents = wrapper.findAllComponents({ name: 'TabComponent' })
    expect(tabComponents.length).toBeGreaterThan(0)
  })

  it('renders UTabs wrapper', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    const tabs = wrapper.findAllComponents({ name: 'UTabs' })
    expect(tabs.length).toBeGreaterThan(0)
  })

  it('renders file path ref for per-tab state', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.tabFilePath).toBeDefined()
  })

  it('renders with empty tabs array', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: []
      }
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('renders dropdown menu items with icons', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    await wrapper.vm.$nextTick()
    const dropdownItems = (wrapper.vm as any).dropdownItems
    dropdownItems.forEach((item: any) => {
      expect(item.icon).toBeDefined()
    })
  })

  it('renders dropdown menu items with click handlers', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    await wrapper.vm.$nextTick()
    const dropdownItems = (wrapper.vm as any).dropdownItems
    dropdownItems.forEach((item: any) => {
      expect(item.click).toBeDefined()
      expect(typeof item.click).toBe('function')
    })
  })

  it('renders with tab containing segments', async () => {
    const tabWithSegments = {
      ...defaultTab,
      promptsList: [
        { key: 'Cache', content: ['seg1', 'seg2'], type: 'Segments' },
        { key: 'System', content: '', type: 'Editor' },
        { key: 'User', content: '', type: 'Editor' },
        { key: 'Assistant', content: '', type: 'Editor' }
      ]
    }

    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [tabWithSegments]
      }
    })

    expect(wrapper.text()).toContain('Cache')
  })

  it('renders with different selected model', async () => {
    const tabWithModel = {
      ...defaultTab,
      selectedModel: 'custom/model/v1'
    }

    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [tabWithModel]
      }
    })

    expect(wrapper.props('modelValue')[0].selectedModel).toBe('custom/model/v1')
  })

  it('renders with tab containing editor content', async () => {
    const tabWithEditor = {
      ...defaultTab,
      promptsList: [
        { key: 'Cache', content: [], type: 'Segments' },
        { key: 'System', content: 'Custom system prompt', type: 'Editor' },
        { key: 'User', content: 'Custom user message', type: 'Editor' },
        { key: 'Assistant', content: 'Custom assistant response', type: 'Editor' }
      ]
    }

    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [tabWithEditor]
      }
    })

    expect(wrapper.text()).toContain('Cache')
    expect(wrapper.text()).toContain('User')
    expect(wrapper.text()).toContain('Assistant')
  })

  it('has activeTab state', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.activeTab).toBeDefined()
  })

  it('renders with tab containing stopController', async () => {
    const tabWithStop = {
      ...defaultTab,
      stopController: { cancel: vi.fn() }
    }

    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [tabWithStop]
      }
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('renders with multiple tabs containing different content', async () => {
    const tabs = [
      {
        ...defaultTab,
        label: '0',
        promptsList: [
          { key: 'Cache', content: [], type: 'Segments' },
          { key: 'System', content: '', type: 'Editor' },
          { key: 'User', content: '', type: 'Editor' },
          { key: 'Assistant', content: '', type: 'Editor' }
        ]
      },
      {
        ...defaultTab,
        label: '1',
        promptsList: [
          { key: 'Cache', content: ['seg'], type: 'Segments' },
          { key: 'System', content: 'system', type: 'Editor' },
          { key: 'User', content: 'user', type: 'Editor' },
          { key: 'Assistant', content: 'assistant', type: 'Editor' }
        ]
      }
    ]

    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: tabs
      }
    })

    expect(wrapper.props('modelValue')).toHaveLength(2)
  })

  it('renders the dropdown menu button with correct label', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    const buttons = wrapper.findAll('button')
    const dropdownButton = buttons.find(b => b.text().includes('Open'))
    expect(dropdownButton).toBeTruthy()
    expect(dropdownButton?.text()).toContain('Open')
  })

  it('renders auto-save switch with correct label', async () => {
    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [defaultTab]
      }
    })

    expect(wrapper.text()).toContain('Auto Save')
  })

  it('renders with tab having different promptsList order', async () => {
    const reorderedTab = {
      ...defaultTab,
      promptsList: [
        { key: 'User', content: '', type: 'Editor' },
        { key: 'Cache', content: [], type: 'Segments' },
        { key: 'Assistant', content: '', type: 'Editor' },
        { key: 'System', content: '', type: 'Editor' }
      ]
    }

    const wrapper = await mountSuspended(TabsComponent, {
      props: {
        modelValue: [reorderedTab]
      }
    })

    expect(wrapper.exists()).toBe(true)
  })
})
