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
  /** What comes before the reply. */
  messages: ChatMessage[]
  /** Existing assistant block the reply goes into, or `null` to append a new one. */
  targetBlockId: string | null
  /** The reply so far: the model carries on from it. Empty for a fresh reply. */
  prefill: string
}

/** Continue a reply from a point in its text: `prefix` is the text kept before that point. */
export interface ContinueFrom {
  blockId: string
  prefix: string
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
 * - A trailing assistant block gets the reply: filled in if empty, carried on
 *   from its end otherwise, so stopping and sending again keeps one reply.
 * - Otherwise a new assistant block is appended.
 * - `from` carries on a given assistant block from a point in its text instead;
 *   only the messages before it are sent, and the text after that point is replaced.
 * Snippets and empty messages are not sent.
 */
export function planGeneration(blocks: readonly Block[], from?: ContinueFrom): GenerationPlan {
  const messageBlocks = blocks.filter(isMessage)
  const index = from ? messageBlocks.findIndex(b => b.id === from.blockId) : messageBlocks.length - 1
  const target = messageBlocks[index]?.role === 'assistant' ? messageBlocks[index] : undefined
  const context = target ? messageBlocks.slice(0, index) : messageBlocks

  return {
    messages: context
      .filter(b => b.content.trim() !== '')
      .map(b => ({ role: b.role, content: b.content })),
    targetBlockId: target?.id ?? null,
    // A trailing space would split the next word's token; line breaks are kept.
    prefill: target ? (from?.prefix ?? target.content).replace(/[ \t]+$/, '') : ''
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
