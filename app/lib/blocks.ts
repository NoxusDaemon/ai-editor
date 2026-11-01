/**
 * Prompt blocks: the messages and snippet trays a segment is made of, and what
 * gets sent to the model. Pure functions only — no Vue, no I/O.
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

export interface ChatMessage {
  role: MessageRole
  content: string
}

export interface GenerateStats {
  stopReason: string
  tokensPerSecond?: number
  predictedTokens?: number
  timeToFirstTokenSec?: number
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

/** Deep copy with fresh ids. */
export const copyBlocks = (blocks: readonly Block[]): Block[] => blocks.map(block => block.kind === 'snippets'
  ? { ...block, id: createId(), items: copySnippetItems(block.items) }
  : { ...block, id: createId() })

export const isMessage = (block: Block): block is MessageBlock => block.kind === 'message'

/**
 * Decides what to send and where the reply goes (playground semantics):
 * an empty trailing assistant block is filled in; otherwise a new assistant
 * block is appended. Snippets and empty messages are not sent.
 */
export function planGeneration(blocks: readonly Block[]): GenerationPlan {
  const messageBlocks = blocks.filter(isMessage)
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

/** Whether the blocks hold anything the user wrote (the default prompt doesn't count). */
export function blocksHaveContent(blocks: readonly Block[]): boolean {
  return blocks.some(block => block.kind === 'snippets'
    ? block.items.length > 0
    : block.content.trim() !== '' && !(block.role === 'user' && block.content === DEFAULT_USER_PROMPT))
}
