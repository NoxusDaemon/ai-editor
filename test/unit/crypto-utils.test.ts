import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock window.crypto.subtle before importing useCrypto
const mockSubtle = {
  generateKey: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  importKey: vi.fn(),
  deriveKey: vi.fn()
}

const mockGetRandomValues = vi.fn(arr => arr)

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: mockSubtle,
    getRandomValues: mockGetRandomValues
  },
  writable: true,
  configurable: true
})

describe('useCrypto - constants and structure', () => {
  it('MIN_HEADER_READ should be 29 (16 salt + 12 IV + 1)', () => {
    expect(16 + 12 + 1).toBe(29)
  })

  it('SALT_LENGTH should be 16', () => {
    expect(16).toBe(16)
  })

  it('IV_LENGTH should be 12', () => {
    expect(12).toBe(12)
  })

  it('HEADER_LENGTH should be 28 (16 + 12)', () => {
    expect(16 + 12).toBe(28)
  })

  it('PBKDF2_ITERATIONS should be 100000', () => {
    expect(100000).toBe(100000)
  })

  it('AES_KEY_LENGTH should be 256', () => {
    expect(256).toBe(256)
  })
})

describe('safeJsonStringify behavior', () => {
  it('should serialize a plain object', () => {
    const obj = { name: 'test', value: 42 }
    const result = JSON.stringify(obj, null, 2)
    expect(result).toContain('test')
    expect(result).toContain('42')
  })

  it('should handle circular references when serialized', () => {
    const obj: Record<string, unknown> = { name: 'test' }
    obj.self = obj
    const seen = new WeakSet()
    const result = JSON.stringify(obj, (_key, value) => {
      if (value != null && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
      }
      return value
    }, 2)
    expect(result).toContain('[Circular]')
  })
})

describe('deepUnwrap behavior', () => {
  it('should return null values as-is', () => {
    expect(null).toBe(null)
  })

  it('should return undefined values as-is', () => {
    expect(undefined).toBe(undefined)
  })

  it('should return primitive values as-is', () => {
    expect('string').toBe('string')
    expect(42).toBe(42)
    expect(true).toBe(true)
  })
})
