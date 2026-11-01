/**
 * Workspace domain model: sessions (tabs), each designed as a flow of nodes,
 * plus the snippet sidebars. Pure functions only — no Vue, no I/O — so
 * everything here is unit-testable.
 */
import { blocksHaveContent, createBlock, DEFAULT_USER_PROMPT, type SnippetItem } from './blocks'
import { cloneFlow } from './flow/graph'
import { createConversationFlow } from './flow/templates'
import type { Flow } from './flow/types'

export * from './blocks'

export interface Session {
  id: string
  title: string
  /** LM Studio model key used by segments that don't choose one. Empty means "whichever model is loaded". */
  model: string
  flow: Flow
}

export const SIDEBAR_SIDES = ['left', 'right'] as const
export type SidebarSide = (typeof SIDEBAR_SIDES)[number]

/** Snippet trays at the window edges, shared by every session in the workspace. */
export type Sidebars = Record<SidebarSide, SnippetItem[]>

/** Everything a workspace file holds. */
export interface Workspace {
  sessions: Session[]
  sidebars: Sidebars
}

export const createSidebars = (): Sidebars => ({ left: [], right: [] })

export function createSession(init: Partial<Omit<Session, 'id'>> = {}): Session {
  return {
    id: crypto.randomUUID(),
    title: init.title ?? 'Session 1',
    model: init.model ?? '',
    flow: init.flow ?? createConversationFlow()
  }
}

/** A new session: Start → a conversation segment laid out like the classic editor → End. */
export function createDefaultSession(title = 'Session 1', model = ''): Session {
  return createSession({
    title,
    model,
    flow: createConversationFlow([
      createBlock('snippets'),
      createBlock('system'),
      createBlock('user', DEFAULT_USER_PROMPT),
      createBlock('assistant')
    ])
  })
}

/** Deep copy with fresh ids, so the copy can be edited independently. */
export function duplicateSession(session: Session, title: string): Session {
  return { id: crypto.randomUUID(), title, model: session.model, flow: cloneFlow(session.flow) }
}

/** Next free "Session N" title, never colliding with an existing title. */
export function nextSessionTitle(sessions: readonly Pick<Session, 'title'>[]): string {
  const taken = new Set(sessions.map(s => s.title))
  let n = sessions.length + 1
  while (taken.has(`Session ${n}`)) n++
  return `Session ${n}`
}

/** Whether a flow holds anything the user made, beyond the nodes every new session starts with. */
export function flowHasContent(flow: Flow): boolean {
  if (flow.settings.system.trim()) return true
  const segments = flow.nodes.filter(node => node.kind === 'segment')
  if (segments.length > 1) return true
  return flow.nodes.some((node) => {
    switch (node.kind) {
      case 'start': return node.input.trim() !== ''
      case 'end': return false
      case 'segment': return blocksHaveContent(node.blocks)
      default: return true
    }
  })
}

/** Whether closing the session would throw away anything the user wrote. */
export const sessionHasContent = (session: Session): boolean => flowHasContent(session.flow)
