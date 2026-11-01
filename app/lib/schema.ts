/**
 * Validation, migration and serialisation of workspace files.
 *
 * Current format (v3):  { "format": "ai-editor", "version": 3, "sessions": Session[], "sidebars": Sidebars }
 * v2:                   { "format": "ai-editor", "version": 2, "sessions" } with snippets as plain strings
 * Legacy format (v1):   TabsItem[] with { label, selectedModel, promptsList: [{ key, type, content }] }
 */
import { z } from 'zod'
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
export const FILE_VERSION = 3

export class InvalidDocumentError extends Error {
  override name = 'InvalidDocumentError'
}

const idSchema = z.string().min(1)

const messageBlockSchema = z.object({ id: idSchema, kind: z.literal('message'), role: z.enum(MESSAGE_ROLES), content: z.string() })

const snippetItemsSchema = z.array(z.discriminatedUnion('kind', [
  z.object({ id: idSchema, kind: z.literal('snippet'), text: z.string() }),
  z.object({ id: idSchema, kind: z.literal('section'), title: z.string() })
]))

const sessionSchema = z.object({
  id: idSchema,
  title: z.string(),
  model: z.string(),
  blocks: z.array(z.discriminatedUnion('kind', [
    messageBlockSchema,
    z.object({ id: idSchema, kind: z.literal('snippets'), items: snippetItemsSchema })
  ]))
})

const workspaceFileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  version: z.literal(FILE_VERSION),
  sessions: z.array(sessionSchema),
  sidebars: z.object({ left: snippetItemsSchema, right: snippetItemsSchema })
})

/** v2 stored snippets as plain strings and had no sidebars. */
const v2FileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  version: z.literal(2),
  sessions: z.array(sessionSchema.extend({
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
  return {
    id: createId(),
    title: label === '' || /^\d+$/.test(label) ? `Session ${label || index + 1}` : label,
    model: tab.selectedModel ?? '',
    blocks
  }
}

type V2Session = z.infer<typeof v2FileSchema>['sessions'][number]

function migrateV2Session(session: V2Session): Session {
  return {
    ...session,
    blocks: session.blocks.map(block => block.kind === 'snippets'
      ? { ...block, items: block.items.map(text => createSnippet(text)) }
      : block)
  }
}

/** Hand-edited files may contain duplicate ids, which would break list rendering. */
function ensureUniqueIds({ sessions, sidebars }: Workspace): Workspace {
  const seen = new Set<string>()
  const unique = <T extends { id: string }>(item: T): T => {
    const id = seen.has(item.id) ? createId() : item.id
    seen.add(id)
    return { ...item, id }
  }
  return {
    sessions: sessions.map(session => ({
      ...unique(session),
      blocks: session.blocks.map(block => block.kind === 'snippets'
        ? { ...unique(block), items: block.items.map(unique) }
        : unique(block))
    })),
    sidebars: { left: sidebars.left.map(unique), right: sidebars.right.map(unique) }
  }
}

/** Parses any supported file version. Throws `InvalidDocumentError`. */
export function parseWorkspace(input: unknown): Workspace {
  const current = workspaceFileSchema.safeParse(input)
  if (current.success) return ensureUniqueIds(current.data)

  const v2 = v2FileSchema.safeParse(input)
  if (v2.success) return ensureUniqueIds({ sessions: v2.data.sessions.map(migrateV2Session), sidebars: createSidebars() })

  const legacy = legacyWorkspaceSchema.safeParse(input)
  if (legacy.success) return { sessions: legacy.data.map(migrateLegacyTab), sidebars: createSidebars() }

  if (typeof input === 'object' && input !== null && 'format' in input && input.format === FILE_FORMAT) {
    const version = 'version' in input ? String(input.version) : 'unknown'
    if (Number(version) > FILE_VERSION) {
      throw new InvalidDocumentError(`This file was saved by a newer version of AI Editor (format v${version}).`)
    }
    const error = version === '2' ? v2.error : current.error
    throw new InvalidDocumentError(`This AI Editor file is damaged: ${z.prettifyError(error!)}`)
  }
  throw new InvalidDocumentError('This file is not an AI Editor workspace.')
}

export function serializeWorkspace({ sessions, sidebars }: Workspace, space?: number): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, sessions, sidebars }, null, space)
}
