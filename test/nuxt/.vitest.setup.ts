// Vitest setup for Nuxt environment tests
// This file runs before each test in the nuxt project

import { vi } from 'vitest'

// Mock Tauri APIs since they are not available in test environment
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined)
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => undefined),
  save: vi.fn(async () => undefined),
  MessageDialogOptions: {}
}))

// Mock LM Studio SDK
vi.mock('@lmstudio/sdk', () => ({
  Chat: {
    from: vi.fn(() => ({ role: 'user', content: '' }))
  },
  LMStudioClient: vi.fn(() => ({
    llm: {
      model: vi.fn(async () => ({
        respond: vi.fn(() => ({}))
      }))
    },
    system: {
      listDownloadedModels: vi.fn(async () => [])
    }
  }))
}))
