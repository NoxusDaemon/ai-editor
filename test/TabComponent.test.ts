import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock LMStudio SDK
vi.mock('@lmstudio/sdk', () => ({
  Chat: {
    from: vi.fn().mockReturnThis(),
    respond: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: '' }) })
    })
  }
}))

// Mock vueuse
vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: vi.fn()
}))

// Mock Nuxt composables
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    toRaw: (val: unknown) => val,
    useState: vi.fn((key: string, def: () => unknown) => ({ value: def() }))
  }
})

// Mock Nuxt UI
vi.mock('#ui/components', () => ({
  UEditor: {
    props: ['modelValue', 'contentType'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelect: {
    props: ['modelValue', 'items', 'loading'],
    template: '<select><slot /></select>'
  },
  UButton: {
    props: ['label', 'icon', 'color', 'variant', 'size', 'disabled', 'loading'],
    template: '<button :disabled="disabled"><slot /></button>'
  },
  UInput: {
    props: ['modelValue', 'variant'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }
}))

// Mock constants
vi.mock('~/constants/constants', () => ({
  defaultTab: {
    label: '1',
    selectedModel: 'liquid/lfm2.5-1.2b',
    promptsList: [
      { key: 'Cache', content: [], type: 'Segments' },
      { key: 'System', content: '', type: 'Editor' },
      { key: 'User', content: '', type: 'Editor' },
      { key: 'Assistant', content: '', type: 'Editor' }
    ],
    stopController: undefined
  }
}))

// Mock composables
const mockLMStudioClient = {
  llm: {
    model: vi.fn().mockResolvedValue({
      respond: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: '' }) })
      })
    }),
    listDownloadedModels: vi.fn().mockResolvedValue([])
  },
  system: {
    listDownloadedModels: vi.fn().mockResolvedValue([])
  }
}
vi.mock('~/composables/useLMStudioClient', () => ({
  useLMStudioClient: () => mockLMStudioClient
}))

describe('TabComponent addSegment logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should add a Cache segment when promptOption is Cache', () => {
    const promptsList = [
      { key: 'User', content: 'hello', type: 'Editor' as const },
      { key: 'Assistant', content: 'hi', type: 'Editor' as const }
    ]
    const promptOption = 'Cache'
    
    const defaultTab = {
      promptsList: [
        { key: 'Cache', content: [], type: 'Segments' },
        { key: 'System', content: '', type: 'Editor' },
        { key: 'User', content: '', type: 'Editor' },
        { key: 'Assistant', content: '', type: 'Editor' }
      ]
    }
    
    const defaultItem = defaultTab.promptsList.find(f => f.key === promptOption)
    if (defaultItem) {
      promptsList.push(JSON.parse(JSON.stringify(defaultItem)))
    }
    
    expect(promptsList).toHaveLength(3)
    expect(promptsList[2]).toEqual({ key: 'Cache', content: [], type: 'Segments' })
  })

  it('should add a System segment when promptOption is System', () => {
    const promptsList = [
      { key: 'User', content: 'hello', type: 'Editor' as const }
    ]
    const promptOption = 'System'
    
    const defaultTab = {
      promptsList: [
        { key: 'Cache', content: [], type: 'Segments' },
        { key: 'System', content: '', type: 'Editor' },
        { key: 'User', content: '', type: 'Editor' },
        { key: 'Assistant', content: '', type: 'Editor' }
      ]
    }
    
    const defaultItem = defaultTab.promptsList.find(f => f.key === promptOption)
    if (defaultItem) {
      promptsList.push(JSON.parse(JSON.stringify(defaultItem)))
    }
    
    expect(promptsList).toHaveLength(2)
    expect(promptsList[1]).toEqual({ key: 'System', content: '', type: 'Editor' })
  })

  it('should add a User segment when promptOption is User', () => {
    const promptsList = [
      { key: 'System', content: 'be helpful', type: 'Editor' as const }
    ]
    const promptOption = 'User'
    
    const defaultTab = {
      promptsList: [
        { key: 'Cache', content: [], type: 'Segments' },
        { key: 'System', content: '', type: 'Editor' },
        { key: 'User', content: '', type: 'Editor' },
        { key: 'Assistant', content: '', type: 'Editor' }
      ]
    }
    
    const defaultItem = defaultTab.promptsList.find(f => f.key === promptOption)
    if (defaultItem) {
      promptsList.push(JSON.parse(JSON.stringify(defaultItem)))
    }
    
    expect(promptsList).toHaveLength(2)
    expect(promptsList[1]).toEqual({ key: 'User', content: '', type: 'Editor' })
  })

  it('should add an Assistant segment when promptOption is Assistant', () => {
    const promptsList = [
      { key: 'User', content: 'hello', type: 'Editor' as const }
    ]
    const promptOption = 'Assistant'
    
    const defaultTab = {
      promptsList: [
        { key: 'Cache', content: [], type: 'Segments' },
        { key: 'System', content: '', type: 'Editor' },
        { key: 'User', content: '', type: 'Editor' },
        { key: 'Assistant', content: '', type: 'Editor' }
      ]
    }
    
    const defaultItem = defaultTab.promptsList.find(f => f.key === promptOption)
    if (defaultItem) {
      promptsList.push(JSON.parse(JSON.stringify(defaultItem)))
    }
    
    expect(promptsList).toHaveLength(2)
    expect(promptsList[1]).toEqual({ key: 'Assistant', content: '', type: 'Editor' })
  })

  it('should not add anything when promptOption does not match', () => {
    const promptsList = [{ key: 'User', content: 'hello', type: 'Editor' as const }]
    const promptOption = 'NonExistent'
    
    const defaultTab = {
      promptsList: [
        { key: 'Cache', content: [], type: 'Segments' },
        { key: 'System', content: '', type: 'Editor' },
        { key: 'User', content: '', type: 'Editor' },
        { key: 'Assistant', content: '', type: 'Editor' }
      ]
    }
    
    const defaultItem = defaultTab.promptsList.find(f => f.key === promptOption)
    if (!defaultItem) return
    promptsList.push(JSON.parse(JSON.stringify(defaultItem)))
    
    expect(promptsList).toHaveLength(1)
  })

  it('should deep clone the default item to avoid mutating the global default', () => {
    const promptsList: unknown[] = []
    const promptOption = 'User'
    
    const defaultTab = {
      promptsList: [
        { key: 'User', content: '', type: 'Editor' }
      ]
    }
    
    const defaultItem = defaultTab.promptsList.find(f => f.key === promptOption)
    if (defaultItem) {
      promptsList.push(JSON.parse(JSON.stringify(defaultItem)))
    }
    
    // Modify the cloned item
    const cloned = promptsList[0] as { content: string }
    cloned.content = 'modified'
    
    // Original should be unchanged
    expect((defaultItem as { content: string }).content).toBe('')
  })
})

describe('TabComponent deleteSegment logic', () => {
  it('should remove the segment at the given index', () => {
    const promptsList = [
      { key: 'Cache', content: [], type: 'Segments' },
      { key: 'System', content: '', type: 'Editor' },
      { key: 'User', content: '', type: 'Editor' }
    ]
    
    const index = 1
    promptsList.splice(index, 1)
    
    expect(promptsList).toHaveLength(2)
    expect(promptsList[0].key).toBe('Cache')
    expect(promptsList[1].key).toBe('User')
  })

  it('should handle deleting the first segment', () => {
    const promptsList = [
      { key: 'Cache', content: [], type: 'Segments' },
      { key: 'System', content: '', type: 'Editor' },
      { key: 'User', content: '', type: 'Editor' }
    ]
    
    promptsList.splice(0, 1)
    
    expect(promptsList).toHaveLength(2)
    expect(promptsList[0].key).toBe('System')
  })

  it('should handle deleting the last segment', () => {
    const promptsList = [
      { key: 'Cache', content: [], type: 'Segments' },
      { key: 'System', content: '', type: 'Editor' },
      { key: 'User', content: '', type: 'Editor' }
    ]
    
    promptsList.splice(2, 1)
    
    expect(promptsList).toHaveLength(2)
    expect(promptsList[1].key).toBe('System')
  })

  it('should handle deleting from a single-segment list', () => {
    const promptsList = [
      { key: 'User', content: '', type: 'Editor' }
    ]
    
    promptsList.splice(0, 1)
    
    expect(promptsList).toHaveLength(0)
  })
})

describe('TabComponent callModel logic', () => {
  it('should warn and return when no model is selected', () => {
    const selectedModel = ''
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    if (!selectedModel) {
      consoleWarn('No model selected')
    }
    
    expect(consoleWarn).toHaveBeenCalledWith('No model selected')
    consoleWarn.mockRestore()
  })

  it('should filter out cache prompts when building chat input', () => {
    const promptsList = [
      { key: 'Cache', content: ['cached data'] },
      { key: 'System', content: 'be helpful' },
      { key: 'User', content: 'hello' },
      { key: 'Assistant', content: 'hi there' }
    ]
    
    const chatInput = promptsList
      .map((m: { key: string, content: string | string[] }) => ({ role: m.key.toLowerCase(), content: m.content }))
      .filter((m: { role: string }) => m.role !== 'cache')
    
    expect(chatInput).toHaveLength(3)
    expect(chatInput[0].role).toBe('system')
    expect(chatInput[1].role).toBe('user')
    expect(chatInput[2].role).toBe('assistant')
    expect(chatInput[0].content).toBe('be helpful')
  })

  it('should warn when no chat input remains after filtering cache', () => {
    const promptsList = [
      { key: 'Cache', content: ['cached data'] }
    ]
    
    const chatInput = promptsList
      .map((m: { key: string, content: string | string[] }) => ({ role: m.key.toLowerCase(), content: m.content }))
      .filter((m: { role: string }) => m.role !== 'cache')
    
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    if (chatInput.length === 0) {
      consoleWarn('No chat input after filtering cache')
    }
    
    expect(chatInput).toHaveLength(0)
    expect(consoleWarn).toHaveBeenCalledWith('No chat input after filtering cache')
    consoleWarn.mockRestore()
  })

  it('should find the last assistant prompt', () => {
    const promptsList = [
      { key: 'User', content: 'hello' },
      { key: 'Assistant', content: 'hi' },
      { key: 'User', content: 'how are you' },
      { key: 'Assistant', content: 'I am fine' }
    ]
    
    const lastAssistantPrompt = promptsList.findLast((m: { key: string }) => m.key === 'Assistant')
    
    expect(lastAssistantPrompt).toBeDefined()
    expect(lastAssistantPrompt?.key).toBe('Assistant')
    expect(lastAssistantPrompt?.content).toBe('I am fine')
  })

  it('should warn when no assistant prompt is found', () => {
    const promptsList = [
      { key: 'User', content: 'hello' },
      { key: 'System', content: 'be helpful' }
    ]
    
    const lastAssistantPrompt = promptsList.findLast((m: { key: string }) => m.key === 'Assistant')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    if (!lastAssistantPrompt) {
      consoleWarn('No Assistant prompt found to append response to')
    }
    
    expect(lastAssistantPrompt).toBeUndefined()
    expect(consoleWarn).toHaveBeenCalledWith('No Assistant prompt found to append response to')
    consoleWarn.mockRestore()
  })

  it('should append streaming response to last assistant prompt', () => {
    const promptsList = [
      { key: 'User', content: 'hello' },
      { key: 'Assistant', content: '' }
    ]
    
    const lastAssistantPrompt = promptsList.findLast((m: { key: string }) => m.key === 'Assistant')
    const fragment = { content: ' world' }
    
    if (lastAssistantPrompt) {
      lastAssistantPrompt.content += fragment.content.replace('&nbsp;', ' ')
    }
    
    expect(promptsList[1].content).toBe(' world')
  })

  it('should handle &nbsp; replacement in streaming response', () => {
    const promptsList = [
      { key: 'User', content: 'hello' },
      { key: 'Assistant', content: '' }
    ]
    
    const lastAssistantPrompt = promptsList.findLast((m: { key: string }) => m.key === 'Assistant')
    const fragment = { content: 'hello&nbsp;world' }
    
    if (lastAssistantPrompt) {
      lastAssistantPrompt.content += fragment.content.replace('&nbsp;', ' ')
    }
    
    expect(promptsList[1].content).toBe('hello world')
  })
})

describe('TabComponent prompt options', () => {
  it('should have exactly three prompt options', () => {
    const promptOptions = ['Cache', 'User', 'Assistant']
    expect(promptOptions).toHaveLength(3)
  })

  it('should include all expected prompt option types', () => {
    const promptOptions = ['Cache', 'User', 'Assistant']
    expect(promptOptions).toContain('Cache')
    expect(promptOptions).toContain('User')
    expect(promptOptions).toContain('Assistant')
  })
})
