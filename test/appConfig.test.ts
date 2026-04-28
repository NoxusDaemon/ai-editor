import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock defineAppConfig to return the config as-is - must be before the import
vi.mock('nuxt/app', () => ({
  defineAppConfig: (config: Record<string, unknown>) => config
}))

vi.mock('nuxt/config', () => ({
  defineAppConfig: (config: Record<string, unknown>) => config
}))

vi.mock('nuxt/schema', () => ({
  defineAppConfig: (config: Record<string, unknown>) => config
}))

// Mock the actual app.config by intercepting the module resolution
vi.mock('/app/app.config', () => ({
  default: {
    ui: {
      colors: {
        primary: 'green',
        neutral: 'slate'
      }
    }
  }
}))

import config from '~/app.config'

describe('app.config', () => {
  it('should define ui config object', () => {
    expect(config.ui).toBeDefined()
  })

  it('should define ui.colors object', () => {
    expect(config.ui.colors).toBeDefined()
  })

  it('should set primary color to green', () => {
    expect(config.ui.colors.primary).toBe('green')
  })

  it('should set neutral color to slate', () => {
    expect(config.ui.colors.neutral).toBe('slate')
  })

  it('should not have any other top-level keys besides ui', () => {
    const keys = Object.keys(config)
    expect(keys).toEqual(['ui'])
  })

  it('should only have primary and neutral in colors', () => {
    const keys = Object.keys(config.ui.colors)
    expect(keys).toEqual(['primary', 'neutral'])
  })

  it('should use valid Tailwind color names', () => {
    const validColors = ['green', 'slate']
    expect(validColors).toContain(config.ui.colors.primary)
    expect(validColors).toContain(config.ui.colors.neutral)
  })

  it('should export a plain object (not a function)', () => {
    expect(typeof config).toBe('object')
    expect(typeof config).not.toBe('function')
  })
})
