import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Clear module cache between tests to test singleton behavior
function clearModuleCache() {
  vi.resetModules()
}

describe('useLMStudioClient', () => {
  beforeEach(() => {
    clearModuleCache()
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearModuleCache()
  })

  it('should return the same client instance on repeated calls (singleton)', async () => {
    const mockClient = { 
      system: { listDownloadedModels: vi.fn().mockResolvedValue([]) },
      llm: { model: vi.fn().mockResolvedValue({ respond: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: vi.fn() }) }) }
    }
    
    // Define the mock class and pass it directly (not via vi.fn())
    class MockLMStudioClient {
      system = mockClient.system
      llm = mockClient.llm
    }
    
    vi.doMock('@lmstudio/sdk', () => ({
      LMStudioClient: MockLMStudioClient
    }))
    
    const { useLMStudioClient } = await import('../app/composables/useLMStudioClient')
    const client1 = useLMStudioClient()
    const client2 = useLMStudioClient()
    
    expect(client1).toBe(client2)
    expect(client1).toHaveProperty('system')
    expect(client1).toHaveProperty('llm')
  })

  it('should create a new LMStudioClient on first call', async () => {
    const mockClient = { 
      system: { listDownloadedModels: vi.fn().mockResolvedValue([]) },
      llm: { model: vi.fn().mockResolvedValue({ respond: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: vi.fn() }) }) }
    }
    
    class MockLMStudioClient {
      system = mockClient.system
      llm = mockClient.llm
    }
    
    vi.doMock('@lmstudio/sdk', () => ({
      LMStudioClient: MockLMStudioClient
    }))
    
    const { useLMStudioClient } = await import('../app/composables/useLMStudioClient')
    const client = useLMStudioClient()
    
    expect(client).toBeDefined()
    expect(client).toHaveProperty('system')
    expect(client).toHaveProperty('llm')
  })

  it('should maintain singleton within same module scope', async () => {
    const mockClient = { 
      system: { listDownloadedModels: vi.fn().mockResolvedValue([]) },
      llm: { model: vi.fn().mockResolvedValue({ respond: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: vi.fn() }) }) }
    }
    
    class MockLMStudioClient {
      system = mockClient.system
      llm = mockClient.llm
    }
    
    vi.doMock('@lmstudio/sdk', () => ({
      LMStudioClient: MockLMStudioClient
    }))
    
    const { useLMStudioClient } = await import('../app/composables/useLMStudioClient')
    const client1 = useLMStudioClient()
    
    // Call again within same module scope
    const client2 = useLMStudioClient()
    
    expect(client1).toBe(client2)
  })
})

describe('constants - defaultTab structure', () => {
  it('should have the correct defaultTab structure', async () => {
    const { defaultTab } = await import('../app/constants/constants')
    
    expect(defaultTab).toBeDefined()
    expect(typeof defaultTab.label).toBe('string')
    expect(typeof defaultTab.selectedModel).toBe('string')
    expect(Array.isArray(defaultTab.promptsList)).toBe(true)
    expect(defaultTab.promptsList.length).toBeGreaterThan(0)
    expect(defaultTab.stopController).toBeUndefined()
  })

  it('should have all required prompt types', async () => {
    const { defaultTab } = await import('../app/constants/constants')
    
    const keys = defaultTab.promptsList.map((p: { key: string }) => p.key)
    expect(keys).toContain('Cache')
    expect(keys).toContain('System')
    expect(keys).toContain('User')
    expect(keys).toContain('Assistant')
  })

  it('should have correct prompt types (Segments vs Editor)', async () => {
    const { defaultTab } = await import('../app/constants/constants')
    
    const cachePrompt = defaultTab.promptsList.find((p: { key: string }) => p.key === 'Cache')
    const systemPrompt = defaultTab.promptsList.find((p: { key: string }) => p.key === 'System')
    
    expect(cachePrompt?.type).toBe('Segments')
    expect(systemPrompt?.type).toBe('Editor')
  })

  it('should have non-empty label', async () => {
    const { defaultTab } = await import('../app/constants/constants')
    
    expect(defaultTab.label).toBeTruthy()
    expect(defaultTab.label.length).toBeGreaterThan(0)
  })

  it('should have a valid model key', async () => {
    const { defaultTab } = await import('../app/constants/constants')
    
    expect(defaultTab.selectedModel).toContain('/')
    expect(defaultTab.selectedModel.length).toBeGreaterThan(0)
  })
})
