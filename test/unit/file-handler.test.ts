import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Tauri invoke
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args)
}))

// Mock window.crypto.subtle for useCrypto dependency
const mockSubtle = {
  deriveKey: vi.fn().mockResolvedValue({}),
  encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  decrypt: vi.fn().mockResolvedValue(new TextEncoder().encode('[]').buffer),
  importKey: vi.fn().mockResolvedValue({}),
  generateKey: vi.fn().mockResolvedValue({})
}

const mockGetRandomValues = vi.fn((arr: Uint8Array) => arr)

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: mockSubtle,
    getRandomValues: mockGetRandomValues
  },
  writable: true,
  configurable: true
})

describe('useFileHandler - API surface', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('should expose canDecrypt method', async () => {
    mockInvoke.mockResolvedValue(new Array(29).fill(0))
    const { useFileHandler } = await import('~/composables/useFileHandler')
    const handler = useFileHandler()

    expect(handler.canDecrypt).toBeDefined()
    expect(typeof handler.canDecrypt).toBe('function')
  })

  it('should expose readExact method', async () => {
    mockInvoke.mockResolvedValue(new Array(29).fill(0))
    const { useFileHandler } = await import('~/composables/useFileHandler')
    const handler = useFileHandler()

    expect(handler.readExact).toBeDefined()
    expect(typeof handler.readExact).toBe('function')
  })

  it('should expose readFile method', async () => {
    mockInvoke.mockResolvedValue([1, 2, 3])
    const { useFileHandler } = await import('~/composables/useFileHandler')
    const handler = useFileHandler()

    expect(handler.readFile).toBeDefined()
    expect(typeof handler.readFile).toBe('function')
  })

  it('should expose readFileText method', async () => {
    mockInvoke.mockResolvedValue([72, 101, 108, 108, 111]) // "Hello"
    const { useFileHandler } = await import('~/composables/useFileHandler')
    const handler = useFileHandler()

    expect(handler.readFileText).toBeDefined()
    expect(typeof handler.readFileText).toBe('function')
  })

  it('should expose writeFile method', async () => {
    mockInvoke.mockResolvedValue(true)
    const { useFileHandler } = await import('~/composables/useFileHandler')
    const handler = useFileHandler()

    expect(handler.writeFile).toBeDefined()
    expect(typeof handler.writeFile).toBe('function')
  })
})

describe('useFileHandler - readFileText', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('should decode file content as UTF-8 text', async () => {
    mockInvoke.mockResolvedValue([72, 101, 108, 108, 111]) // "Hello"
    const { useFileHandler } = await import('~/composables/useFileHandler')
    const handler = useFileHandler()

    const result = await handler.readFileText('/test/file.txt')
    expect(result).toBe('Hello')
  })
})

describe('useFileHandler - canDecrypt', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('should return true for empty files (all zeros)', async () => {
    mockInvoke.mockResolvedValueOnce(new Array(29).fill(0))
    const { useFileHandler } = await import('~/composables/useFileHandler')
    const handler = useFileHandler()

    const result = await handler.canDecrypt('/test/file.txt', 'password')
    expect(result).toBe(true)
  })

  it('should return false when file cannot be decrypted', async () => {
    mockInvoke.mockResolvedValueOnce(new Uint8Array([1, 2, 3, ...new Array(25).fill(0)]))
    mockSubtle.decrypt.mockRejectedValueOnce(new Error('Decryption failed'))

    const { useFileHandler } = await import('~/composables/useFileHandler')
    const handler = useFileHandler()

    const result = await handler.canDecrypt('/test/file.txt', 'wrong-password')
    expect(result).toBe(false)
  })
})
