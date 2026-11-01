import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import type { SidebarSide } from '~/lib/workspace'

/** Per-device preferences, persisted in localStorage. */
export const useSettingsStore = defineStore('settings', () => {
  const autosave = useLocalStorage('ai-editor:autosave', false)
  /** LM Studio WebSocket URL; empty means the default local server. */
  const lmStudioUrl = useLocalStorage('ai-editor:lmstudio-url', '')
  /** Model used for new sessions. */
  const defaultModel = useLocalStorage('ai-editor:default-model', '')
  /** Snippet sidebars that stay open instead of appearing when the pointer nears the edge. */
  const pinnedSidebars = useLocalStorage<Record<SidebarSide, boolean>>(
    'ai-editor:pinned-sidebars',
    { left: false, right: false },
    { mergeDefaults: true }
  )

  /** Paths of recently opened or saved files, newest first (desktop app only). */
  const recentFiles = useLocalStorage<string[]>('ai-editor:recent-files', [])
  /** Opens the most recent file when the app starts (desktop app only). */
  const reopenLastFile = useLocalStorage('ai-editor:reopen-last-file', true)

  return { autosave, lmStudioUrl, defaultModel, pinnedSidebars, recentFiles, reopenLastFile }
})
