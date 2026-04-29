import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TabsComponent from '../../app/components/TabsComponent.vue'

// Stub the useLMStudioClient composable before mounting
vi.mock('../../app/composables/useLMStudioClient', () => ({
  useLMStudioClient: vi.fn(() => ({
    chat: async () => ({ role: 'assistant', content: 'Mock response' }),
    stop: async () => {}
  }))
}))

describe('TabsComponent', () => {
  it('renders with an "Add Segment" button', async () => {
    const mockTabsData = [
      { label: '0', promptsList: [{ key: 'User', content: 'Test' }] }
    ]

    const wrapper = mount(TabsComponent, {
      props: {
        modelValue: mockTabsData
      },
      global: {
        stubs: {
          FileComponent: true,
          USwitch: true,
          UDropdownMenu: true,
          UButton: true
        }
      }
    })

    // Find the "Add Segment" button in the list-trailing template (nested in UButton)
    const addButton = wrapper.find('button span.truncate')

    expect(addButton.exists()).toBe(true)
  })

  it('displays tabs with correct structure', async () => {
    const mockTabsData = [
      { label: '0', promptsList: [{ key: 'User', content: 'Test' }] }
    ]

    const wrapper = mount(TabsComponent, {
      props: {
        modelValue: mockTabsData
      },
      global: {
        stubs: {
          FileComponent: true,
          USwitch: true,
          UDropdownMenu: true,
          UButton: true
        }
      }
    })

    // Verify we have at least one tab (the data-tab-index elements)
    const tabItems = wrapper.findAll('[data-tab-index]')
    expect(tabItems.length).toBeGreaterThan(0)

    // Each tab should be clickable and have a label
    for (const tab of tabItems) {
      expect(tab.exists()).toBe(true)
      const labelText = tab.text()
      expect(labelText).toBeTruthy()
    }
  })
})
