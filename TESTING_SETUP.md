# Testing Setup for Nuxt v4 + Tauri v2 + Bun Project

## Overview
This project now has a complete testing setup using Vitest with @nuxt/test-utils, following best practices from the official Nuxt documentation.

## What Was Added

### 1. Configuration Files

#### vitest.config.ts
- Uses `@nuxt/test-utils/config` for proper Nuxt integration
- Supports multiple test projects (unit and nuxt)
- Configured with jsdom environment for DOM testing

### 2. Test File Structure

Tests are organized in:
```
test/
├── unit/          # Unit tests (node environment)
│   └── TabsComponent.test.ts
└── nuxt/          # Nuxt-specific tests (nuxt environment)
```

## Key Features of the Setup

1. **Dual Test Environments**:
   - `unit` project: Runs in Node.js for fast unit tests
   - `nuxt` project: Runs with full Nuxt runtime for component testing

2. **Proper Alias Resolution**: The setup handles Nuxt's `~` alias through @nuxt/test-utils

3. **Component Testing**: Uses Vue Test Utils with mount() for component rendering

## Example Test (TabsComponent.test.ts)

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TabsComponent from '/home/nightly/ai-editor/app/components/TabsComponent.vue'

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
```

## Running Tests

- Run all tests: `bun run test`
- Run specific test file: `bun run test -- test/unit/TabsComponent.test.ts`
- Watch mode (development): `bun run test:watch`

## Dependencies Added

- @nuxt/test-utils - Nuxt's official testing utilities
- happy-dom - Fast DOM implementation for testing
- jsdom - Standard DOM implementation for testing  
- playwright-core - For browser-based testing
- @vue/test-utils - Vue component testing library

## Best Practices Followed

1. **Isolation**: Stub complex nested components to test in isolation
2. **Mocking**: Use stubs for external dependencies
3. **Proper Data**: Pass realistic mock data matching the component's expected props
4. **TypeScript Support**: Full TS support through vitest globals

## Next Steps (Optional Enhancements)

1. Add coverage reporting to vitest.config.ts
2. Create nuxt-specific tests in test/nuxt/ directory
3. Add integration tests for more complex scenarios
4. Configure test:browser mode with Playwright for E2E testing
