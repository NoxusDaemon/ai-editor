/**
 * Flow model: a session's conversation is designed as a graph of nodes that a
 * run walks from Start, one node at a time, like a state machine.
 *
 * - Flow nodes (start, segment, condition, loop, set, ask, parallel, join, end)
 *   are connected by flow edges: one edge per output handle, so every transition
 *   is unambiguous. A Parallel node runs several paths at once, each on its own
 *   copy of the conversation and variables, and they meet again at a Join.
 * - Context nodes (memory, knowledge) are not steps. They feed segments, either
 *   through a context edge or by sitting inside a group with them.
 * - Groups contain nodes and pass their settings (model, system prompt, context,
 *   setup-only) down to every segment inside them, nested groups included.
 *
 * Pure data and factories only — no Vue, no I/O.
 */
import { createBlock, createId, type Block } from '../blocks'

export interface Position {
  x: number
  y: number
}

export const NODE_KINDS = ['start', 'segment', 'condition', 'loop', 'set', 'ask', 'parallel', 'join', 'end', 'memory', 'knowledge', 'group', 'note'] as const
export type NodeKind = (typeof NODE_KINDS)[number]

/** How much of the conversation so far a segment sees. */
export const CONTEXT_MODES = ['conversation', 'window', 'isolated'] as const
export type ContextMode = (typeof CONTEXT_MODES)[number]
/** On segments and groups; `inherit` takes the setting of the enclosing group, or the flow. */
export type ContextSetting = ContextMode | 'inherit'

/** Where injected memory or retrieved knowledge goes in a segment's prompt. */
export const PLACEMENTS = ['system', 'message'] as const
export type Placement = (typeof PLACEMENTS)[number]

interface NodeBase {
  id: string
  /** Identifier used in templates and expressions, e.g. `{{nodes.summary.output}}`. Unique per flow. */
  key: string
  title: string
  /** Relative to the parent group, or to the canvas when there is none. */
  position: Position
  /** Group this node sits in. */
  parentId: string | null
}

/** Settings a segment inherits from the groups around it and from the flow. Empty / null / 'inherit' = inherit. */
export interface InheritableSettings {
  /** LM Studio model key. */
  model: string
  temperature: number | null
  maxTokens: number | null
  context: ContextSetting
  /** Messages kept when `context` is `window`. */
  window: number
  /** Setup only: runs, but leaves nothing in the conversation (its output stays available). */
  ephemeral: boolean | null
}

export interface StartNode extends NodeBase {
  kind: 'start'
  /** The run's input, available as `{{input}}`. */
  input: string
}

export interface SegmentNode extends NodeBase, InheritableSettings {
  kind: 'segment'
  /** Messages (templated) and snippet trays, edited like a chat. */
  blocks: Block[]
  /** Ask the model for a reply after the messages. Off: the messages are only added to the conversation. */
  generate: boolean
  /** JSON Schema the reply must match; empty for free text. */
  schema: string
  /** Extra attempts when the reply doesn't match the schema; the model is shown what was wrong. */
  retries: number
  /** Also store the output in `vars.<saveAs>`. */
  saveAs: string
  /** Store memories that the output is appended to. */
  memoryWrites: string[]
}

export interface ConditionBranch {
  /** Also the id of the branch's output handle. */
  id: string
  label: string
  expression: string
}

/** Takes the first branch whose expression is true, or "else". */
export interface ConditionNode extends NodeBase {
  kind: 'condition'
  branches: ConditionBranch[]
}

export const LOOP_MODES = ['count', 'while', 'forEach'] as const
export type LoopMode = (typeof LOOP_MODES)[number]

/** Sends the run down "body" until it is done, then down "done". The body leads back to the loop. */
export interface LoopNode extends NodeBase {
  kind: 'loop'
  mode: LoopMode
  count: number
  /** `while`: checked before every iteration. */
  condition: string
  /** `forEach`: an expression giving the list; the current item is `loop.item`. */
  items: string
  /** Safety limit on iterations, whatever the mode. */
  max: number
}

export interface Assignment {
  id: string
  name: string
  expression: string
}

/** Sets variables (`vars.<name>`), e.g. the state of a state machine. */
export interface SetNode extends NodeBase {
  kind: 'set'
  assignments: Assignment[]
}

/** Pauses the run and asks the person running it (human in the loop). */
export interface AskNode extends NodeBase {
  kind: 'ask'
  prompt: string
  saveAs: string
  /** Add the answer to the conversation as a user message. */
  addToConversation: boolean
}

export const PARALLEL_MODES = ['branches', 'map'] as const
export type ParallelMode = (typeof PARALLEL_MODES)[number]

export interface ParallelBranch {
  /** Also the id of the branch's output handle. */
  id: string
  label: string
}

/**
 * Runs several paths at the same time. Each starts from a copy of the
 * conversation and variables; they meet again at a Join node.
 */
export interface ParallelNode extends NodeBase {
  kind: 'parallel'
  /** branches: one output per branch. map: the "Each item" path runs once per item of a list. */
  mode: ParallelMode
  branches: ParallelBranch[]
  /** `map`: an expression giving the list; each run sees its item as `branch.item`. */
  items: string
  /** Most branches running at once. */
  concurrency: number
}

export const JOIN_WAITS = ['all', 'first'] as const
export type JoinWait = (typeof JOIN_WAITS)[number]

/** Where the branches of a Parallel node meet again. Its output collects theirs. */
export interface JoinNode extends NodeBase {
  kind: 'join'
  /** all: wait for every branch. first: take the first branch to finish and stop the others. */
  wait: JoinWait
  /** Add the messages the branches added to the conversation, in branch order. */
  keepConversation: boolean
}

export interface EndNode extends NodeBase {
  kind: 'end'
  /** The run's result. A single `{{expression}}` keeps its value as is (e.g. an object). */
  output: string
}

export const MEMORY_TYPES = ['notes', 'buffer', 'store'] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

export interface MemoryNode extends NodeBase {
  kind: 'memory'
  /**
   * - notes: fixed text (templated), e.g. facts about the user or a style guide
   * - buffer: the last `window` messages of the conversation
   * - store: entries segments write during runs; can be kept between runs
   */
  memory: MemoryType
  content: string
  window: number
  entries: string[]
  /** Store: keep entries written during runs, saved with the workspace. */
  persist: boolean
  /** Store: inject the most recent entries, or those most relevant to `query`. */
  recall: 'recent' | 'relevant'
  query: string
  /** Store: entries injected at most. */
  limit: number
  placement: Placement
}

export interface KnowledgeDocument {
  id: string
  name: string
  text: string
}

export const SEARCH_MODES = ['keyword', 'semantic', 'hybrid'] as const
export type SearchMode = (typeof SEARCH_MODES)[number]

/** Documents retrieved from (RAG) for the segments it feeds. */
export interface KnowledgeNode extends NodeBase {
  kind: 'knowledge'
  documents: KnowledgeDocument[]
  /** Characters per chunk, and characters repeated between neighbouring chunks. */
  chunkSize: number
  chunkOverlap: number
  search: SearchMode
  /** LM Studio embedding model for semantic and hybrid search. */
  embeddingModel: string
  topK: number
  /** Results scoring below this (0–1) are dropped. */
  minScore: number
  /** Prefer passages that add something new over near-duplicates (maximal marginal relevance). */
  diversify: boolean
  /** What to search for (templated). */
  query: string
  /** Shown above the passages (templated). */
  instructions: string
  placement: Placement
}

export interface GroupNode extends NodeBase, Omit<InheritableSettings, 'ephemeral'> {
  kind: 'group'
  width: number
  height: number
  /** Added to the system prompt of every segment inside. */
  system: string
  ephemeral: boolean | null
}

export interface NoteNode extends NodeBase {
  kind: 'note'
  text: string
}

export type FlowNode
  = | StartNode
    | SegmentNode
    | ConditionNode
    | LoopNode
    | SetNode
    | AskNode
    | ParallelNode
    | JoinNode
    | EndNode
    | MemoryNode
    | KnowledgeNode
    | GroupNode
    | NoteNode

export type NodeOf<K extends NodeKind> = Extract<FlowNode, { kind: K }>
export type ContextNode = MemoryNode | KnowledgeNode

export interface FlowEdge {
  id: string
  source: string
  /** Output handle on the source: `out`, a condition or parallel branch id, `body`, `ctx`, … */
  sourceHandle: string
  target: string
}

export interface FlowSettings {
  /** System prompt for every segment. */
  system: string
  temperature: number | null
  maxTokens: number | null
  context: ContextMode
  window: number
  /** A run stops after this many steps, so a loop that never ends can't run forever. */
  maxSteps: number
}

export interface Flow {
  settings: FlowSettings
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export const DEFAULT_TITLES: Record<NodeKind, string> = {
  start: 'Start',
  segment: 'Segment',
  condition: 'Condition',
  loop: 'Loop',
  set: 'Set variables',
  ask: 'Ask user',
  parallel: 'Parallel',
  join: 'Join',
  end: 'End',
  memory: 'Memory',
  knowledge: 'Knowledge',
  group: 'Group',
  note: 'Note'
}

export const DEFAULT_KNOWLEDGE_INSTRUCTIONS = 'Answer using the context below and cite passages like [1]. If the context does not contain the answer, say so.'

export const createFlowSettings = (init: Partial<FlowSettings> = {}): FlowSettings => ({
  system: '',
  temperature: null,
  maxTokens: null,
  context: 'conversation',
  window: 6,
  maxSteps: 200,
  ...init
})

const inherit = (): InheritableSettings => ({
  model: '',
  temperature: null,
  maxTokens: null,
  context: 'inherit',
  window: 6,
  ephemeral: null
})

type NodeDefaults = { [K in NodeKind]: () => Omit<NodeOf<K>, keyof NodeBase | 'kind'> }

const DEFAULTS: NodeDefaults = {
  start: () => ({ input: '' }),
  segment: () => ({
    ...inherit(),
    blocks: [createBlock('user')],
    generate: true,
    schema: '',
    retries: 2,
    saveAs: '',
    memoryWrites: []
  }),
  condition: () => ({ branches: [{ id: createId(), label: '', expression: '' }] }),
  loop: () => ({ mode: 'count', count: 3, condition: '', items: '', max: 10 }),
  set: () => ({ assignments: [{ id: createId(), name: '', expression: '' }] }),
  ask: () => ({ prompt: '', saveAs: 'answer', addToConversation: true }),
  parallel: () => ({
    mode: 'branches',
    branches: [{ id: createId(), label: 'Branch 1' }, { id: createId(), label: 'Branch 2' }],
    items: '',
    concurrency: 4
  }),
  join: () => ({ wait: 'all', keepConversation: false }),
  end: () => ({ output: '{{last}}' }),
  memory: () => ({
    memory: 'notes',
    content: '',
    window: 6,
    entries: [],
    persist: true,
    recall: 'recent',
    query: '{{input}}',
    limit: 10,
    placement: 'system'
  }),
  knowledge: () => ({
    documents: [],
    chunkSize: 800,
    chunkOverlap: 120,
    search: 'keyword',
    embeddingModel: '',
    topK: 4,
    minScore: 0,
    diversify: false,
    query: '{{input}}',
    instructions: DEFAULT_KNOWLEDGE_INSTRUCTIONS,
    placement: 'system'
  }),
  group: () => ({ ...inherit(), width: 560, height: 320, system: '' }),
  note: () => ({ text: '' })
}

export interface NodeInit {
  key: string
  position?: Position
  parentId?: string | null
  title?: string
}

export function createNode<K extends NodeKind>(kind: K, init: NodeInit & Partial<Omit<NodeOf<K>, 'kind' | 'id'>>): NodeOf<K> {
  return {
    ...DEFAULTS[kind](),
    title: DEFAULT_TITLES[kind],
    position: { x: 0, y: 0 },
    parentId: null,
    ...init,
    id: createId(),
    kind
  } as NodeOf<K>
}

export function createEdge(source: string, sourceHandle: string, target: string): FlowEdge {
  return { id: createId(), source, sourceHandle, target }
}

export const isContextNode = (node: FlowNode): node is ContextNode => node.kind === 'memory' || node.kind === 'knowledge'
