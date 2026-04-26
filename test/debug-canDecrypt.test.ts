import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('debug canDecrypt', () => {
  let mockInvoke: ReturnType<typeof vi.fn>
  
  beforeEach(() => {
    mockInvoke = vi.fn().mockResolvedValue(new Uint8Array())
    vi.mock('@tauri-apps/api/core', () => ({
      invoke: (...args: unknown[]) => mockInvoke(...args)
    }))
    vi.mock('@tauri-apps/plugin-dialog', () => ({
      open: vi.fn().mockResolvedValue('/mock/path.txt'),
      save: vi.fn().mockResolvedValue('/mock/output.txt')
    }))
  })

  it('debug: correct password test', async () => {
    const mockHeader = new Uint8Array(29).fill(42)
    mockInvoke.mockResolvedValueOnce(mockHeader)
    
    vi.doMock('../app/composables/useCrypto', () => ({
      MIN_HEADER_READ: 29,
      useCrypto: () => ({
        decryptCore: vi.fn().mockResolvedValue('[{"key":"test"}]')
      })
    }))
    
    const { useFileHandler } = await import('../app/composables/useFileHandler')
    const handler = useFileHandler()
    
    const result = await handler.canDecrypt('/test/file.txt', 'correctpassword')
    console.log('Result:', result)
    console.log('mockInvoke calls:', mockInvoke.mock.calls.length)
    console.log('mockInvoke calls details:', mockInvoke.mock.calls)
    
    expect(result).toBe(true)
  })
})
