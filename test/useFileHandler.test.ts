import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Tauri invoke for file handler tests
const mockInvoke = vi.fn()

// Top-level mock for @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args)
}))

// Top-level mock for @tauri-apps/plugin-dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue('/mock/path.txt'),
  save: vi.fn().mockResolvedValue('/mock/output.txt')
}))

describe('useFileHandler', () => {
  beforeEach(() => {
    mockInvoke.mockClear()
    mockInvoke.mockResolvedValue(new Uint8Array())
    // Reset module cache so each test can set up its own mocks fresh
    vi.resetModules()
  })

  describe('writeFile', () => {
    it('should call Tauri invoke with correct arguments', async () => {
      mockInvoke.mockResolvedValue(undefined)
      
      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()
      
      const data = new Uint8Array([1, 2, 3, 4])
      const result = await handler.writeFile('/test/path.txt', data)
      
      expect(mockInvoke).toHaveBeenCalledWith('write_file', {
        path: '/test/path.txt',
        data
      })
      expect(result).toBe(true)
    })
  })

  describe('readFile', () => {
    it('should return a Uint8Array from Tauri invoke result', async () => {
      mockInvoke.mockResolvedValue([1, 2, 3, 4])
      
      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()
      
      const result = await handler.readFile('/test/path.txt')
      
      expect(mockInvoke).toHaveBeenCalledWith('read_file', { path: '/test/path.txt' })
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(4)
    })
  })

  describe('readFileText', () => {
    it('should decode bytes to string', async () => {
      mockInvoke.mockResolvedValue([72, 101, 108, 108, 111]) // "Hello"
      
      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()
      
      const result = await handler.readFileText('/test/path.txt')
      
      expect(result).toBe('Hello')
    })
  })

  describe('canDecrypt', () => {
    it('should return true when file does not exist', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('File not found'))
      
      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()
      
      const result = await handler.canDecrypt('/nonexistent/path.txt', 'password')
      
      expect(result).toBe(true)
    })

    it('should return true when file is empty (all zeros)', async () => {
      mockInvoke.mockResolvedValueOnce(new Uint8Array(29).fill(0))
      
      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()
      
      const result = await handler.canDecrypt('/empty/file.txt', 'password')
      
      expect(result).toBe(true)
    })

    it('should return false when password is wrong', async () => {
      const mockHeader = new Uint8Array(29).fill(42)
      mockInvoke.mockResolvedValueOnce(mockHeader)
      
      // Mock useCrypto to throw on decryptCore
      vi.doMock('../app/composables/useCrypto', () => ({
        MIN_HEADER_READ: 29,
        useCrypto: () => ({
          decryptCore: vi.fn().mockRejectedValue(new Error('Decryption failed'))
        })
      }))
      
      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()
      
      const result = await handler.canDecrypt('/encrypted/file.txt', 'wrongpassword')
      
      expect(result).toBe(false)
    })

    it('should return false when decrypted content does not start with [', async () => {
      const mockHeader = new Uint8Array(29).fill(42)
      mockInvoke.mockResolvedValueOnce(mockHeader)
      
      vi.doMock('../app/composables/useCrypto', () => ({
        MIN_HEADER_READ: 29,
        useCrypto: () => ({
          decryptCore: vi.fn().mockResolvedValue('{\"not\": \"an array\"}')
        })
      }))
      
      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()
      
      const result = await handler.canDecrypt('/encrypted/file.txt', 'correctpassword')
      
      expect(result).toBe(false)
    })

    it('should return true when password is correct and content starts with [', async () => {
      const mockHeader = new Uint8Array(29).fill(42)
      mockInvoke.mockResolvedValueOnce(mockHeader)
      
      vi.doMock('../app/composables/useCrypto', () => ({
        MIN_HEADER_READ: 29,
        useCrypto: () => ({
          decryptCore: vi.fn().mockResolvedValue('[{\"key\":\"test\"}]')
        })
      }))
      
      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()
      
      const result = await handler.canDecrypt('/encrypted/file.txt', 'correctpassword')
      
      expect(result).toBe(true)
    })
  })
})
