import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to define the mock class before any imports
const { MockLMStudioClient } = vi.hoisted(() => {
  class MockLMStudioClient {
    llm = { model: vi.fn() }
    system = { listDownloadedModels: vi.fn() }
  }
  return { MockLMStudioClient }
})

vi.mock('@lmstudio/sdk', () => ({
  LMStudioClient: MockLMStudioClient,
  Chat: { from: vi.fn() }
}))

describe('useLMStudioClient - singleton behavior', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should return the same client instance on multiple calls', async () => {
    const { useLMStudioClient } = await import('~/composables/useLMStudioClient')

    const client1 = useLMStudioClient()
    const client2 = useLMStudioClient()

    expect(client1).toBe(client2)
  })

  it('should create an LMStudioClient instance on first call', async () => {
    const { useLMStudioClient } = await import('~/composables/useLMStudioClient')

    const client = useLMStudioClient()

    expect(client).toBeDefined()
    expect(client.llm).toBeDefined()
  })
})
