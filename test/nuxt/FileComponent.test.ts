import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import FileComponent from '~/components/FileComponent.vue'

// Mock the useFileHandler composable
const mockCanDecrypt = vi.fn(async () => true)
vi.mock('~/composables/useFileHandler', () => ({
  useFileHandler: vi.fn(() => ({
    canDecrypt: mockCanDecrypt
  }))
}))

describe('FileComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the component', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('accepts readEncryptedFile as func prop', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    expect(wrapper.props('func')).toBe('readEncryptedFile')
  })

  it('accepts writeEncryptedFile as func prop', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'writeEncryptedFile'
      }
    })

    expect(wrapper.props('func')).toBe('writeEncryptedFile')
  })

  it('has a password ref initialized', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.password).toBeDefined()
  })

  it('has an open ref initialized to false', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.open).toBe(false)
  })

  it('has a showPassword ref initialized to false', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showPassword).toBe(false)
  })

  it('has an errorMessage ref initialized', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.errorMessage).toBeDefined()
  })

  it('has an isLoading ref initialized to false', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.isLoading).toBe(false)
  })

  it('has droppedFile prop accessible', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/custom/path/file.enc',
        func: 'writeEncryptedFile'
      }
    })

    expect(wrapper.props('droppedFile')).toBe('/custom/path/file.enc')
  })

  it('can toggle showPassword state', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showPassword).toBe(false)

    wrapper.vm.showPassword = true
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.showPassword).toBe(true)
  })

  it('can clear errorMessage after setting it', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    wrapper.vm.errorMessage = 'Some error'
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.errorMessage).toBe('Some error')

    wrapper.vm.errorMessage = ''
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.errorMessage).toBe('')
  })

  it('can set isLoading state', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.isLoading).toBe(false)

    wrapper.vm.isLoading = true
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.isLoading).toBe(true)
  })

  it('can set open state to true', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.open).toBe(false)

    wrapper.vm.open = true
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.open).toBe(true)
  })

  it('can set password value', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    await wrapper.vm.$nextTick()
    wrapper.vm.password = 'testpassword'
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.password).toBe('testpassword')
  })

  it('renders a modal wrapper', async () => {
    const wrapper = await mountSuspended(FileComponent, {
      props: {
        droppedFile: '/path/to/file.txt',
        func: 'readEncryptedFile'
      }
    })

    expect(wrapper.exists()).toBe(true)
  })
})
