import { defineStore } from 'pinia'
import type { ViewportTransform } from '@vue-flow/core'
import { ref } from 'vue'

/** Which node is zoomed into, and other view state of the flow editor. Runtime-only, never saved. */
export const useFlowViewStore = defineStore('flowView', () => {
  /** Node open in the zoomed-in editor, per session. */
  const focused = ref<Record<string, string | null>>({})
  /** Where each session's canvas was panned and zoomed to, restored when switching back to it. */
  const viewports = ref<Record<string, ViewportTransform>>({})
  const runPanelOpen = ref(false)
  /** Asks the canvas to centre on a node (e.g. from the run panel); `n` makes repeats distinct. */
  const reveal = ref<{ sessionId: string, nodeId: string, n: number } | null>(null)
  /** Asks the canvas to fit everything in view, e.g. after its flow was replaced. */
  const fit = ref<{ sessionId: string, n: number } | null>(null)

  const focusedId = (sessionId: string) => focused.value[sessionId] ?? null

  function focus(sessionId: string, nodeId: string) {
    focused.value[sessionId] = nodeId
  }

  function unfocus(sessionId: string) {
    focused.value[sessionId] = null
  }

  function saveViewport(sessionId: string, viewport: ViewportTransform) {
    viewports.value[sessionId] = { ...viewport }
  }

  function requestFit(sessionId: string) {
    fit.value = { sessionId, n: (fit.value?.n ?? 0) + 1 }
  }

  function revealNode(sessionId: string, nodeId: string) {
    reveal.value = { sessionId, nodeId, n: (reveal.value?.n ?? 0) + 1 }
  }

  return { focused, viewports, runPanelOpen, reveal, fit, focusedId, focus, unfocus, saveViewport, requestFit, revealNode }
})
