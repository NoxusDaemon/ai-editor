/**
 * Validation, migration and serialisation of workspace files.
 *
 * Current format (v4):  { "format": "ai-editor", "version": 4, "sessions": Session[], "sidebars": Sidebars }, each session holding a flow
 * v3:                   sessions held a flat list of blocks instead of a flow
 * v2:                   { "format": "ai-editor", "version": 2, "sessions" } with snippets as plain strings
 * Legacy format (v1):   TabsItem[] with { label, selectedModel, promptsList: [{ key, type, content }] }
 *
 * Older files open as a flow with one segment holding their blocks. Within v4,
 * missing node fields take their defaults, so files written before a field
 * existed still open.
 */
import { z } from 'zod'
import { sanitizeFlow } from './flow/graph'
import { createConversationFlow } from './flow/templates'
import {
  CONTEXT_MODES,
  DEFAULT_KNOWLEDGE_INSTRUCTIONS,
  JOIN_WAITS,
  LOOP_MODES,
  MEMORY_TYPES,
  PARALLEL_MODES,
  PLACEMENTS,
  SEARCH_MODES,
  type Flow
} from './flow/types'
import {
  createId,
  createSidebars,
  createSnippet,
  MESSAGE_ROLES,
  type Block,
  type MessageRole,
  type Session,
  type Workspace
} from './workspace'

// Zod's JIT compiles validators with `new Function`, which the app's CSP forbids.
z.config({ jitless: true })

export const FILE_FORMAT = 'ai-editor'
export const FILE_VERSION = 4

export class InvalidDocumentError extends Error {
  override name = 'InvalidDocumentError'
}

const idSchema = z.string().min(1)

const messageBlockSchema = z.object({ id: idSchema, kind: z.literal('message'), role: z.enum(MESSAGE_ROLES), content: z.string() })

const snippetItemsSchema = z.array(z.discriminatedUnion('kind', [
  z.object({ id: idSchema, kind: z.literal('snippet'), text: z.string() }),
  z.object({ id: idSchema, kind: z.literal('section'), title: z.string() })
]))

const blocksSchema = z.array(z.discriminatedUnion('kind', [
  messageBlockSchema,
  z.object({ id: idSchema, kind: z.literal('snippets'), items: snippetItemsSchema })
]))

// ── Flows (v4) ──────────────────────────────────────────────────────────

const text = (fallback = '') => z.string().default(fallback)
const count = (fallback: number, min = 0) => z.number().int().min(min).default(fallback)
const optionalNumber = z.number().nullable().default(null)

const nodeBase = {
  id: idSchema,
  key: text(),
  title: text(),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  parentId: z.string().nullable().default(null)
}

const inheritable = {
  model: text(),
  temperature: optionalNumber,
  maxTokens: z.number().int().positive().nullable().default(null),
  context: z.enum([...CONTEXT_MODES, 'inherit']).default('inherit'),
  window: count(6, 1),
  ephemeral: z.boolean().nullable().default(null)
}

const nodeSchema = z.discriminatedUnion('kind', [
  z.object({ ...nodeBase, kind: z.literal('start'), input: text() }),
  z.object({
    ...nodeBase,
    ...inheritable,
    kind: z.literal('segment'),
    blocks: blocksSchema.default([]),
    generate: z.boolean().default(true),
    schema: text(),
    retries: count(2),
    saveAs: text(),
    memoryWrites: z.array(z.string()).default([])
  }),
  z.object({
    ...nodeBase,
    kind: z.literal('condition'),
    branches: z.array(z.object({ id: idSchema, label: text(), expression: text() })).default([])
  }),
  z.object({
    ...nodeBase,
    kind: z.literal('loop'),
    mode: z.enum(LOOP_MODES).default('count'),
    count: count(3),
    condition: text(),
    items: text(),
    max: count(10, 1)
  }),
  z.object({
    ...nodeBase,
    kind: z.literal('set'),
    assignments: z.array(z.object({ id: idSchema, name: text(), expression: text() })).default([])
  }),
  z.object({ ...nodeBase, kind: z.literal('ask'), prompt: text(), saveAs: text(), addToConversation: z.boolean().default(true) }),
  z.object({
    ...nodeBase,
    kind: z.literal('parallel'),
    mode: z.enum(PARALLEL_MODES).default('branches'),
    branches: z.array(z.object({ id: idSchema, label: text() })).default([]),
    items: text(),
    concurrency: count(4, 1)
  }),
  z.object({ ...nodeBase, kind: z.literal('join'), wait: z.enum(JOIN_WAITS).default('all'), keepConversation: z.boolean().default(false) }),
  z.object({ ...nodeBase, kind: z.literal('end'), output: text('{{last}}') }),
  z.object({
    ...nodeBase,
    kind: z.literal('memory'),
    memory: z.enum(MEMORY_TYPES).default('notes'),
    content: text(),
    window: count(6, 1),
    entries: z.array(z.string()).default([]),
    persist: z.boolean().default(true),
    recall: z.enum(['recent', 'relevant']).default('recent'),
    query: text('{{input}}'),
    limit: count(10, 1),
    placement: z.enum(PLACEMENTS).default('system')
  }),
  z.object({
    ...nodeBase,
    kind: z.literal('knowledge'),
    documents: z.array(z.object({ id: idSchema, name: text(), text: text() })).default([]),
    chunkSize: count(800, 50),
    chunkOverlap: count(120),
    search: z.enum(SEARCH_MODES).default('keyword'),
    embeddingModel: text(),
    topK: count(4, 1),
    minScore: z.number().min(0).max(1).default(0),
    diversify: z.boolean().default(false),
    query: text('{{input}}'),
    instructions: text(DEFAULT_KNOWLEDGE_INSTRUCTIONS),
    placement: z.enum(PLACEMENTS).default('system')
  }),
  z.object({
    ...nodeBase,
    ...inheritable,
    kind: z.literal('group'),
    width: z.number().positive().default(560),
    height: z.number().positive().default(320),
    system: text()
  }),
  z.object({ ...nodeBase, kind: z.literal('note'), text: text() })
])

const flowSchema = z.object({
  settings: z.object({
    system: text(),
    temperature: optionalNumber,
    maxTokens: z.number().int().positive().nullable().default(null),
    context: z.enum(CONTEXT_MODES).default('conversation'),
    window: count(6, 1),
    maxSteps: count(200, 1)
  }).prefault({}),
  nodes: z.array(nodeSchema),
  edges: z.array(z.object({ id: idSchema, source: z.string(), sourceHandle: z.string(), target: z.string() })).default([])
})

const sidebarsSchema = z.object({ left: snippetItemsSchema, right: snippetItemsSchema })

const workspaceFileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  version: z.literal(FILE_VERSION),
  sessions: z.array(z.object({ id: idSchema, title: z.string(), model: z.string(), flow: flowSchema })),
  sidebars: sidebarsSchema
})

// ── Older versions ──────────────────────────────────────────────────────

/** v3 sessions held a flat list of blocks. */
const v3SessionSchema = z.object({ id: idSchema, title: z.string(), model: z.string(), blocks: blocksSchema })

const v3FileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  version: z.literal(3),
  sessions: z.array(v3SessionSchema),
  sidebars: sidebarsSchema
})

/** v2 stored snippets as plain strings and had no sidebars. */
const v2FileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  version: z.literal(2),
  sessions: z.array(v3SessionSchema.extend({
    blocks: z.array(z.discriminatedUnion('kind', [
      messageBlockSchema,
      z.object({ id: idSchema, kind: z.literal('snippets'), items: z.array(z.string()) })
    ]))
  }))
})

const legacyTabSchema = z.object({
  label: z.union([z.string(), z.number()]).optional(),
  selectedModel: z.string().optional(),
  promptsList: z.array(z.object({
    key: z.string(),
    type: z.string().optional(),
    content: z.union([z.string(), z.array(z.string())]).optional()
  })).default([])
})

const legacyWorkspaceSchema = z.array(legacyTabSchema)

type LegacyTab = z.infer<typeof legacyTabSchema>
type V3Session = z.infer<typeof v3SessionSchema>

/** A v3 session becomes Start → one segment with its blocks → End. */
const fromBlocks = ({ id, title, model, blocks }: V3Session): Session => ({ id, title, model, flow: createConversationFlow(blocks) })

function migrateLegacyTab(tab: LegacyTab, index: number): Session {
  const label = tab.label === undefined ? '' : String(tab.label).trim()
  const blocks = tab.promptsList.map((prompt): Block => {
    if (prompt.type === 'Segments' || Array.isArray(prompt.content)) {
      const items = Array.isArray(prompt.content) ? prompt.content.map(text => createSnippet(text)) : []
      return { id: createId(), kind: 'snippets', items }
    }
    const role = prompt.key.toLowerCase()
    return {
      id: createId(),
      kind: 'message',
      role: (MESSAGE_ROLES as readonly string[]).includes(role) ? role as MessageRole : 'user',
      // The old editor padded empty prompts with a single space.
      content: (prompt.content ?? '').trim() === '' ? '' : prompt.content ?? ''
    }
  })
  return fromBlocks({
    id: createId(),
    title: label === '' || /^\d+$/.test(label) ? `Session ${label || index + 1}` : label,
    model: tab.selectedModel ?? '',
    blocks
  })
}

type V2Session = z.infer<typeof v2FileSchema>['sessions'][number]

const migrateV2Session = (session: V2Session): Session => fromBlocks({
  ...session,
  blocks: session.blocks.map(block => block.kind === 'snippets'
    ? { ...block, items: block.items.map(text => createSnippet(text)) }
    : block)
})

/**
 * Hand-edited files may contain duplicate ids, which would break list rendering.
 * Node ids stay as they are where possible, since edges and groups refer to them.
 */
function ensureUniqueIds({ sessions, sidebars }: Workspace): Workspace {
  const seen = new Set<string>()
  const unique = <T extends { id: string }>(item: T): T => {
    const id = seen.has(item.id) ? createId() : item.id
    seen.add(id)
    return { ...item, id }
  }
  const uniqueBlock = (block: Block): Block => block.kind === 'snippets'
    ? { ...unique(block), items: block.items.map(unique) }
    : unique(block)
  return {
    sessions: sessions.map(session => ({
      ...unique(session),
      flow: {
        ...session.flow,
        nodes: session.flow.nodes.map((node) => {
          const copy = unique(node)
          return copy.kind === 'segment' ? { ...copy, blocks: copy.blocks.map(uniqueBlock) } : copy
        }),
        edges: session.flow.edges.map(unique)
      }
    })),
    sidebars: { left: sidebars.left.map(unique), right: sidebars.right.map(unique) }
  }
}

const repair = (workspace: Workspace): Workspace => {
  const unique = ensureUniqueIds(workspace)
  return { ...unique, sessions: unique.sessions.map(session => ({ ...session, flow: sanitizeFlow(session.flow) })) }
}

/** Parses any supported file version. Throws `InvalidDocumentError`. */
export function parseWorkspace(input: unknown): Workspace {
  const current = workspaceFileSchema.safeParse(input)
  if (current.success) {
    const { sessions, sidebars } = current.data
    return repair({ sessions: sessions.map(session => ({ ...session, flow: session.flow as Flow })), sidebars })
  }

  const v3 = v3FileSchema.safeParse(input)
  if (v3.success) return repair({ sessions: v3.data.sessions.map(fromBlocks), sidebars: v3.data.sidebars })

  const v2 = v2FileSchema.safeParse(input)
  if (v2.success) return repair({ sessions: v2.data.sessions.map(migrateV2Session), sidebars: createSidebars() })

  const legacy = legacyWorkspaceSchema.safeParse(input)
  if (legacy.success) return { sessions: legacy.data.map(migrateLegacyTab), sidebars: createSidebars() }

  if (typeof input === 'object' && input !== null && 'format' in input && input.format === FILE_FORMAT) {
    const version = 'version' in input ? String(input.version) : 'unknown'
    if (Number(version) > FILE_VERSION) {
      throw new InvalidDocumentError(`This file was saved by a newer version of AI Editor (format v${version}).`)
    }
    const error = { 2: v2.error, 3: v3.error }[version] ?? current.error
    throw new InvalidDocumentError(`This AI Editor file is damaged: ${z.prettifyError(error!)}`)
  }
  throw new InvalidDocumentError('This file is not an AI Editor workspace.')
}

export function serializeWorkspace({ sessions, sidebars }: Workspace, space?: number): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, sessions, sidebars }, null, space)
}
