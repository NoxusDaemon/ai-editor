import type { ComputedRef, InjectionKey } from 'vue'
import type { FlowIssue } from '~/lib/flow/validate'
import type { NodeRunState } from '~/stores/flowRun'

/** How much a node card shows, from the zoom level. */
export type DetailLevel = 'compact' | 'normal' | 'full'

/** Shared by the canvas with its nodes, computed once instead of in every node. */
export interface FlowContext {
  sessionId: string
  detail: ComputedRef<DetailLevel>
  runStates: ComputedRef<Map<string, NodeRunState>>
  issues: ComputedRef<Map<string, FlowIssue[]>>
  /** Opens a node's zoomed-in editor. */
  open: (nodeId: string) => void
  /** Zooms the canvas to fit a group and its contents. */
  zoomToGroup: (groupId: string) => void
}

export const FLOW_CONTEXT: InjectionKey<FlowContext> = Symbol('flow-context')

export function detailForZoom(zoom: number): DetailLevel {
  if (zoom < 0.55) return 'compact'
  return zoom > 1.35 ? 'full' : 'normal'
}

/** Extra data on canvas edges. */
export interface FlowEdgeData {
  context: boolean
  /** Followed by the latest run. */
  taken: boolean
  remove: (id: string) => void
}

/** Vue Flow instance id for a session's canvas. */
export const flowIdFor = (sessionId: string): string => `flow-${sessionId}`

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
