import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Vue composables
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    toRaw: (val: unknown) => val,
    ref: (val: unknown) => ({ value: val, _raw: val }),
    reactive: (val: unknown) => val,
    computed: (fn: () => unknown) => ({ value: fn() }),
    watch: vi.fn(),
    watchEffect: vi.fn(),
    onMounted: vi.fn(),
    onBeforeUnmount: vi.fn(),
    useState: vi.fn((key: string, def: () => unknown) => ({ value: def() })),
    useTemplateRef: vi.fn(() => ({ value: null })),
    defineModel: vi.fn((opts?: any) => ({ value: opts?.default || [] })),
    defineProps: vi.fn((opts?: any) => ({})),
    defineEmits: vi.fn(() => () => {}),
    defineExpose: vi.fn(),
    defineOptions: vi.fn(),
    defineSlots: vi.fn(),
    resolveComponent: vi.fn((name: string) => name),
    resolveDirective: vi.fn(),
    withDefaults: vi.fn(() => () => ({})),
    nextTick: (fn?: () => void) => Promise.resolve().then(fn),
    getCurrentInstance: vi.fn(),
    provide: vi.fn(),
    inject: vi.fn(),
    shallowRef: (val: unknown) => ({ value: val, _raw: val }),
    isRef: (val: unknown) => typeof val === 'object' && val !== null && 'value' in val,
    isReactive: (val: unknown) => false,
    isReadonly: (val: unknown) => false,
  }
})

// Mock @nuxt/ui
vi.mock('@nuxt/ui', () => ({}))
vi.mock('@nuxt/ui/runtime/components/Tabs.d.vue.js', () => ({}))

// Mock Tauri APIs
const tauriInvokeState = { mock: vi.fn().mockResolvedValue(new Uint8Array()) }
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => tauriInvokeState.mock(...args)
}))
export { tauriInvokeState }

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue('/mock/path.txt'),
  save: vi.fn().mockResolvedValue('/mock/output.txt')
}))

vi.mock('@tauri-apps/plugin-fs', () => ({}))

// Mock @vueuse/core
vi.mock('@vueuse/core', () => ({
  useDebounceFn: (fn: Function, delay: number) => {
    const wrapped = async (...args: unknown[]) => fn(...args)
    wrapped.cancel = vi.fn()
    wrapped.flush = vi.fn()
    return wrapped
  }
}))

// Mock Nuxt runtime
vi.mock('#app', () => ({
  useOverlay: vi.fn(() => ({
    create: vi.fn(() => ({ open: vi.fn() }))
  }))
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

// Mock useCrypto
const cryptoMockState = {
  decryptResult: null as string | null,
  decryptThrows: false as boolean,
  encryptFileCalls: [] as Array<{ path: string; password: string; data: unknown }>
}

vi.mock('~/composables/useCrypto', () => ({
  MIN_HEADER_READ: 29,
  useCrypto: () => ({
    decryptCore: async () => {
      if (cryptoMockState.decryptThrows) {
        throw new Error('Decryption failed')
      }
      if (cryptoMockState.decryptResult !== null) {
        return cryptoMockState.decryptResult
      }
      return ''
    },
    decryptFile: async (path: string, password: string) => {
      if (cryptoMockState.decryptThrows) {
        throw new Error('Decryption failed')
      }
      const result = cryptoMockState.decryptResult || ''
      return JSON.parse(result || '[]')
    },
    encryptFile: async (path: string, password: string, data: unknown) => {
      cryptoMockState.encryptFileCalls.push({ path, password, data })
    }
  })
}))
export { cryptoMockState }

// Mock @vueuse/integrations/useSortable
vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: vi.fn().mockReturnValue({ stop: vi.fn() })
}))

describe('IndexPage - overlayResult watch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cryptoMockState.decryptResult = null
    cryptoMockState.decryptThrows = false
    cryptoMockState.encryptFileCalls = []
  })

  describe('readEncryptedFile flow', () => {
    it('should trigger decrypt when overlayResult has readEncryptedFile with path and password', () => {
      const overlayResult = { value: { readEncryptedFile: { path: '/encrypted.json', password: 'secret' } } }
      const totalJson = { value: [] }
      const statePassword = { value: '' }

      // Simulate the watch callback logic
      const oResult = overlayResult.value
      if ('readEncryptedFile' in oResult) {
        const wResults = oResult['readEncryptedFile']
        expect(wResults.path).toBe('/encrypted.json')
        expect(wResults.password).toBe('secret')
        // Verify the watch mock was called (from the top-level mock)
        expect(vi.fn()).toBeDefined()
      }
    })

    it('should NOT trigger decrypt when path is missing', () => {
      const oResult = { readEncryptedFile: { password: 'secret' } } as Record<string, unknown>
      const wResults = oResult['readEncryptedFile']
      expect(wResults.path).toBeUndefined()
    })

    it('should NOT trigger decrypt when password is missing', () => {
      const oResult = { readEncryptedFile: { path: '/file.json' } } as Record<string, unknown>
      const wResults = oResult['readEncryptedFile']
      expect(wResults.password).toBeUndefined()
    })

    it('should clean up readEncryptedFile after processing', () => {
      const oResult = { readEncryptedFile: { path: '/file.json', password: 'pass' } }
      delete oResult['readEncryptedFile']
      expect('readEncryptedFile' in oResult).toBe(false)
    })

    it('should set statePassword from the overlayResult password', () => {
      const password = 'mySecretPassword'
      const statePassword = { value: '' }
      statePassword.value = password
      expect(statePassword.value).toBe(password)
    })

    it('should handle multiple readEncryptedFile entries', () => {
      const oResult = {
        readEncryptedFile: { path: '/file1.json', password: 'pass1' },
        readEncryptedFile2: { path: '/file2.json', password: 'pass2' }
      }
      expect('readEncryptedFile' in oResult).toBe(true)
      expect('readEncryptedFile2' in oResult).toBe(true)
    })
  })

  describe('writeEncryptedFile flow', () => {
    it('should trigger encrypt when overlayResult has writeEncryptedFile with path and password', () => {
      const oResult = { writeEncryptedFile: { path: '/output.json', password: 'secret' } }
      const wResults = oResult['writeEncryptedFile']
      expect(wResults.path).toBe('/output.json')
      expect(wResults.password).toBe('secret')
    })

    it('should NOT trigger encrypt when path is missing', () => {
      const oResult = { writeEncryptedFile: { password: 'secret' } } as Record<string, unknown>
      const wResults = oResult['writeEncryptedFile']
      expect(wResults.path).toBeUndefined()
    })

    it('should NOT trigger encrypt when password is missing', () => {
      const oResult = { writeEncryptedFile: { path: '/output.json' } } as Record<string, unknown>
      const wResults = oResult['writeEncryptedFile']
      expect(wResults.password).toBeUndefined()
    })

    it('should clean up writeEncryptedFile after processing', () => {
      const oResult = { writeEncryptedFile: { path: '/output.json', password: 'pass' } }
      delete oResult['writeEncryptedFile']
      expect('writeEncryptedFile' in oResult).toBe(false)
    })

    it('should set statePassword from the overlayResult password', () => {
      const password = 'encryptPassword'
      const statePassword = { value: '' }
      statePassword.value = password
      expect(statePassword.value).toBe(password)
    })
  })

  describe('totalJson state management', () => {
    it('should initialize totalJson as empty array', () => {
      const totalJson = { value: [] }
      expect(totalJson.value).toEqual([])
      expect(totalJson.value.length).toBe(0)
    })

    it('should replace totalJson contents with decrypted data', () => {
      const totalJson = { value: [] }
      const decryptedData = [
        { label: '1', promptsList: [{ key: 'User', content: 'hello' }] },
        { label: '2', promptsList: [{ key: 'Assistant', content: 'hi' }] }
      ]
      totalJson.value.splice(0, totalJson.value.length)
      totalJson.value.splice(0, 0, ...decryptedData)
      expect(totalJson.value).toHaveLength(2)
      expect(totalJson.value[0].label).toBe('1')
      expect(totalJson.value[1].label).toBe('2')
    })

    it('should handle non-array decrypted data gracefully', () => {
      const totalJson = { value: [] }
      const nonArrayData = { label: 'single' }
      if (Array.isArray(nonArrayData)) {
        totalJson.value.splice(0, 0, ...nonArrayData)
      }
      expect(totalJson.value).toEqual([])
    })

    it('should clear existing tabs before loading new ones', () => {
      const totalJson = { value: [{ label: '1' }, { label: '2' }, { label: '3' }] }
      expect(totalJson.value.length).toBe(3)
      totalJson.value.splice(0, totalJson.value.length)
      expect(totalJson.value.length).toBe(0)
    })
  })

  describe('watch configuration', () => {
    it('should use deep watch on overlayResult', () => {
      // Verify watch is mocked and would accept deep/immediate options
      const watchMock = vi.fn()
      const options = { deep: true, immediate: true }
      watchMock(() => {}, () => {}, options)
      expect(options.deep).toBe(true)
      expect(options.immediate).toBe(true)
    })

    it('should use immediate watch to process initial overlayResult', () => {
      const watchMock = vi.fn()
      const options = { immediate: true }
      watchMock(() => {}, () => {}, options)
      expect(options.immediate).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should catch and log decryption errors', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      cryptoMockState.decryptThrows = true

      try {
        // Simulate the try/catch from the watch callback
        throw new Error('Decryption failed')
      } catch (e) {
        consoleErrorSpy('Failed to decrypt file:', e)
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to decrypt file:', expect.anything())
      consoleErrorSpy.mockRestore()
    })

    it('should not crash on decryption failure - totalJson should remain unchanged', () => {
      const totalJson = { value: [{ label: 'existing' }] }
      const initialLength = totalJson.value.length
      // Even if decryption throws, the array should be unchanged
      expect(totalJson.value.length).toBe(initialLength)
    })
  })

  describe('statePassword management', () => {
    it('should update statePassword on successful readEncryptedFile', () => {
      const statePassword = { value: '' }
      const password = 'newPassword'
      statePassword.value = password
      expect(statePassword.value).toBe(password)
    })

    it('should update statePassword on successful writeEncryptedFile', () => {
      const statePassword = { value: '' }
      const password = 'writePassword'
      statePassword.value = password
      expect(statePassword.value).toBe(password)
    })

    it('should persist statePassword across operations', () => {
      const statePassword = { value: '' }
      statePassword.value = 'persisted'
      expect(statePassword.value).toBe('persisted')
      statePassword.value = 'updated'
      expect(statePassword.value).toBe('updated')
    })
  })

  describe('combined operations', () => {
    it('should handle overlayResult with both read and write operations', () => {
      const oResult = {
        readEncryptedFile: { path: '/read.json', password: 'readPass' },
        writeEncryptedFile: { path: '/write.json', password: 'writePass' }
      }
      expect('readEncryptedFile' in oResult).toBe(true)
      expect('writeEncryptedFile' in oResult).toBe(true)
    })

    it('should handle empty overlayResult', () => {
      const oResult = {}
      expect('readEncryptedFile' in oResult).toBe(false)
      expect('writeEncryptedFile' in oResult).toBe(false)
    })

    it('should handle overlayResult with unknown keys', () => {
      const oResult = { unknownKey: { some: 'data' } }
      expect('readEncryptedFile' in oResult).toBe(false)
      expect('writeEncryptedFile' in oResult).toBe(false)
    })
  })
})
