import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

/** Per-device preferences, persisted in localStorage. */
export const useSettingsStore = defineStore('settings', () => {
  const autosave = useLocalStorage('ai-editor:autosave', false)
  /** LM Studio WebSocket URL; empty means the default local server. */
  const lmStudioUrl = useLocalStorage('ai-editor:lmstudio-url', '')
  /** Model used for new sessions. */
  const defaultModel = useLocalStorage('ai-editor:default-model', '')

  return { autosave, lmStudioUrl, defaultModel }
})
