// Global test setup
import { vi } from 'vitest'

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

// Mock @lmstudio/sdk
vi.mock('@lmstudio/sdk', () => ({
  LMStudioClient: vi.fn().mockImplementation(() => ({
    system: { listDownloadedModels: vi.fn().mockResolvedValue([]) },
    llm: { model: vi.fn().mockResolvedValue({ respond: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: vi.fn() }) }) }
  }))
}))

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(new Uint8Array())
}))

// Mock @tauri-apps/plugin-dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue('/mock/path.txt'),
  save: vi.fn().mockResolvedValue('/mock/output.txt')
}))

// Mock @tauri-apps/plugin-fs
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

// Mock @vueuse/integrations/useSortable
vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: vi.fn().mockReturnValue({ stop: vi.fn() })
}))

// Mock @nuxt/ui
vi.mock('@nuxt/ui', () => ({}))
vi.mock('@nuxt/ui/runtime/components/Tabs.d.vue.js', () => ({}))

// Mock Nuxt runtime
vi.mock('#app', () => ({
  useOverlay: vi.fn(() => ({
    create: vi.fn(() => ({ open: vi.fn() }))
  }))
}))

// Mock ~/constants/constants
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
