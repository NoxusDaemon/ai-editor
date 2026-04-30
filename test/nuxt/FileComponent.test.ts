import { describe, it, expect, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import FileComponent from '~/components/FileComponent.vue'

// Mock the useFileHandler composable
vi.mock('~/composables/useFileHandler', () => ({
  useFileHandler: vi.fn(() => ({
    canDecrypt: vi.fn(async () => true)
  }))
}))

describe('FileComponent', () => {
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
})
