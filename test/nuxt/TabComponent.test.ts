import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TabComponent from '../../app/components/TabComponent.vue'

// Stub the useLMStudioClient composable before mounting
vi.mock('../../app/composables/useLMStudioClient', () => ({
  useLMStudioClient: vi.fn(() => ({
    chat: async () => ({ role: 'assistant', content: 'Mock response' }),
    stop: async () => {}
  }))
}))

describe('TabComponent', () => {
  it('renders with an "Add Segment" button', async () => {
    const mockTabsData = [
      { label: '0', promptsList: [{ key: 'User', content: 'Test' }] }
    ]

    const wrapper = mount(TabComponent, {
      props: {
        modelValue: mockTabsData
      },
      global: {
        stubs: {
          FileComponent: true,
          USwitch: true,
          UDropdownMenu: true
        }
      }
    })

    // Find the "Add Segment" button among all buttons in the component
    const buttons = wrapper.findAll('button')
    const addButton = buttons.find(b => b.text().includes('Add Segment'))

    expect(addButton).toBeTruthy()
  })
})
