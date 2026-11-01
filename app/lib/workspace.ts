/**
 * Workspace domain model: sessions (tabs) made of ordered prompt blocks.
 * Pure functions only — no Vue, no I/O — so everything here is unit-testable.
 */

export const MESSAGE_ROLES = ['system', 'user', 'assistant'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]
export type BlockType = MessageRole | 'snippets'

export interface MessageBlock {
  id: string
  kind: 'message'
  role: MessageRole
  content: string
}

/** A reusable piece of text that can be dragged into a prompt. */
export interface Snippet {
  id: string
  kind: 'snippet'
  text: string
}

/** A named divider: the snippets after it, up to the next one, form a section. */
export interface SnippetSection {
  id: string
  kind: 'section'
  title: string
}

export type SnippetItem = Snippet | SnippetSection

/** A tray of reusable text snippets. Never sent to the model. */
export interface SnippetsBlock {
  id: string
  kind: 'snippets'
  items: SnippetItem[]
}

export type Block = MessageBlock | SnippetsBlock

export interface Session {
  id: string
  title: string
  /** LM Studio model key. Empty means "whichever model is loaded". */
  model: string
  blocks: Block[]
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

export interface ChatMessage {
  role: MessageRole
  content: string
}

export interface GenerationPlan {
  messages: ChatMessage[]
  /** Existing empty assistant block to stream into, or `null` to append a new one. */
  targetBlockId: string | null
}

export const DEFAULT_USER_PROMPT = 'Who are you, and what can you do?'

export const createId = (): string => crypto.randomUUID()

export const createSnippet = (text = ''): Snippet => ({ id: createId(), kind: 'snippet', text })

export const createSection = (title = ''): SnippetSection => ({ id: createId(), kind: 'section', title })

export const createSidebars = (): Sidebars => ({ left: [], right: [] })

/** Copies snippet items with fresh ids. */
export const copySnippetItems = (items: readonly SnippetItem[]): SnippetItem[] =>
  items.map(item => ({ ...item, id: createId() }))

/** A copy of `items` with the item at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

export function createBlock(type: BlockType, content = ''): Block {
  if (type === 'snippets') return { id: createId(), kind: 'snippets', items: [] }
  return { id: createId(), kind: 'message', role: type, content }
}

export function createSession(init: Partial<Omit<Session, 'id'>> = {}): Session {
  return {
    id: createId(),
    title: init.title ?? 'Session 1',
    model: init.model ?? '',
    blocks: init.blocks ?? []
  }
}

export function createDefaultSession(title = 'Session 1', model = ''): Session {
  return createSession({
    title,
    model,
    blocks: [
      createBlock('snippets'),
      createBlock('system'),
      createBlock('user', DEFAULT_USER_PROMPT),
      createBlock('assistant')
    ]
  })
}

/** Deep copy with fresh ids, so the copy can be edited independently. */
export function duplicateSession(session: Session, title: string): Session {
  return {
    id: createId(),
    title,
    model: session.model,
    blocks: session.blocks.map(block => block.kind === 'snippets'
      ? { ...block, id: createId(), items: copySnippetItems(block.items) }
      : { ...block, id: createId() })
  }
}

/** Next free "Session N" title, never colliding with an existing title. */
export function nextSessionTitle(sessions: readonly Pick<Session, 'title'>[]): string {
  const taken = new Set(sessions.map(s => s.title))
  let n = sessions.length + 1
  while (taken.has(`Session ${n}`)) n++
  return `Session ${n}`
}

/**
 * Decides what to send and where the reply goes (playground semantics):
 * an empty trailing assistant block is filled in; otherwise a new assistant
 * block is appended. Snippets and empty messages are not sent.
 */
export function planGeneration(session: Session): GenerationPlan {
  const messageBlocks = session.blocks.filter((b): b is MessageBlock => b.kind === 'message')
  const last = messageBlocks.at(-1)
  const fillLast = last?.role === 'assistant' && last.content.trim() === ''
  const context = fillLast ? messageBlocks.slice(0, -1) : messageBlocks

  return {
    messages: context
      .filter(b => b.content.trim() !== '')
      .map(b => ({ role: b.role, content: b.content })),
    targetBlockId: fillLast ? last.id : null
  }
}

export function hasPrompt(plan: GenerationPlan): boolean {
  return plan.messages.some(m => m.role !== 'assistant')
}

/** Whether closing the session would throw away anything the user wrote. */
export function sessionHasContent(session: Session): boolean {
  return session.blocks.some(block => block.kind === 'snippets'
    ? block.items.length > 0
    : block.content.trim() !== '' && !(block.role === 'user' && block.content === DEFAULT_USER_PROMPT))
}
