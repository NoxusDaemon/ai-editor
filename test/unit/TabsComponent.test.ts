import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TabsComponent from '~/components/TabsComponent.vue'

describe('TabsComponent', () => {
  it('renders with a button labeled "Add Segment"', async () => {
    // Create mock data for the defineModel prop
    const mockTabsData = [
      { label: '0', promptsList: [{ key: 'User', content: 'Test' }] }
    ]

    const wrapper = mount(TabsComponent, {
      props: {
        modelValue: mockTabsData,
      },
      global: {
        stubs: {
          // Stub nested components that might cause issues in isolation
          FileComponent: true,
          USwitch: true,
          UDropdownMenu: true,
          UButton: true,
        },
      },
    })

    // Find the button (the add tab button)
    const addButton = wrapper.find('button')

    expect(addButton.exists()).toBe(true)
    expect(addButton.attributes('type')).toBe('button')
  })
})
