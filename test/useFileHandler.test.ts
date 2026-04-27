import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cryptoMockState, tauriInvokeState } from './setup'

describe('useFileHandler', () => {
  beforeEach(() => {
    tauriInvokeState.mock.mockClear()
    cryptoMockState.decryptResult = null
    cryptoMockState.decryptThrows = false
  })

  describe('writeFile', () => {
    it('should call Tauri invoke with correct arguments', async () => {
      tauriInvokeState.mock.mockResolvedValueOnce(undefined)

      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()

      const data = new Uint8Array([1, 2, 3, 4])
      const result = await handler.writeFile('/test/path.txt', data)

      expect(tauriInvokeState.mock).toHaveBeenCalledWith('write_file', {
        path: '/test/path.txt',
        data
      })
      expect(result).toBe(true)
    })
  })

  describe('readFile', () => {
    it('should return a Uint8Array from Tauri invoke result', async () => {
      tauriInvokeState.mock.mockResolvedValueOnce([1, 2, 3, 4])

      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()

      const result = await handler.readFile('/test/path.txt')

      expect(tauriInvokeState.mock).toHaveBeenCalledWith('read_file', { path: '/test/path.txt' })
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(4)
    })
  })

  describe('readFileText', () => {
    it('should decode bytes to string', async () => {
      tauriInvokeState.mock.mockResolvedValueOnce([72, 101, 108, 108, 111]) // "Hello"

      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()

      const result = await handler.readFileText('/test/path.txt')

      expect(result).toBe('Hello')
    })
  })

  describe('canDecrypt', () => {
    it('should return true when file does not exist', async () => {
      tauriInvokeState.mock.mockRejectedValueOnce(new Error('File not found'))

      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()

      const result = await handler.canDecrypt('/nonexistent/path.txt', 'password')

      expect(result).toBe(true)
    })

    it('should return true when file is empty (all zeros)', async () => {
      tauriInvokeState.mock.mockResolvedValueOnce(new Uint8Array(29).fill(0))

      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()

      const result = await handler.canDecrypt('/empty/file.txt', 'password')

      expect(result).toBe(true)
    })

    it('should return false when password is wrong', async () => {
      const mockHeader = new Uint8Array(29).fill(42)
      tauriInvokeState.mock.mockResolvedValueOnce(mockHeader)
      cryptoMockState.decryptThrows = true

      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()

      const result = await handler.canDecrypt('/encrypted/file.txt', 'wrongpassword')

      expect(result).toBe(false)
    })

    it('should return false when decrypted content does not start with [', async () => {
      const mockHeader = new Uint8Array(29).fill(42)
      tauriInvokeState.mock.mockResolvedValueOnce(mockHeader)
      cryptoMockState.decryptResult = '{"not": "an array"}'

      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()

      const result = await handler.canDecrypt('/encrypted/file.txt', 'correctpassword')

      expect(result).toBe(false)
    })

    it('should return true when password is correct and content starts with [', async () => {
      const mockHeader = new Uint8Array(29).fill(42)
      tauriInvokeState.mock.mockResolvedValueOnce(mockHeader)
      cryptoMockState.decryptResult = '[{"key":"test"}]'

      const { useFileHandler } = await import('../app/composables/useFileHandler')
      const handler = useFileHandler()

      const result = await handler.canDecrypt('/encrypted/file.txt', 'correctpassword')

      expect(result).toBe(true)
    })
  })
})
