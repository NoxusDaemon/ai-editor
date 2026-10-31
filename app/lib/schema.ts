/**
 * Validation, migration and serialisation of workspace files.
 *
 * Current format (v2):  { "format": "ai-editor", "version": 2, "sessions": Session[] }
 * Legacy format (v1):   TabsItem[] with { label, selectedModel, promptsList: [{ key, type, content }] }
 */
import { z } from 'zod'
import { createId, MESSAGE_ROLES, type Block, type MessageRole, type Session } from './workspace'

// Zod's JIT compiles validators with `new Function`, which the app's CSP forbids.
z.config({ jitless: true })

export const FILE_FORMAT = 'ai-editor'
export const FILE_VERSION = 2

export class InvalidDocumentError extends Error {
  override name = 'InvalidDocumentError'
}

const idSchema = z.string().min(1)

const blockSchema = z.discriminatedUnion('kind', [
  z.object({ id: idSchema, kind: z.literal('message'), role: z.enum(MESSAGE_ROLES), content: z.string() }),
  z.object({ id: idSchema, kind: z.literal('snippets'), items: z.array(z.string()) })
])

const sessionSchema = z.object({
  id: idSchema,
  title: z.string(),
  model: z.string(),
  blocks: z.array(blockSchema)
})

const workspaceFileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  version: z.literal(FILE_VERSION),
  sessions: z.array(sessionSchema)
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
      const items = Array.isArray(prompt.content) ? prompt.content : []
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

/** Hand-edited files may contain duplicate ids, which would break list rendering. */
function ensureUniqueIds(sessions: Session[]): Session[] {
  const seen = new Set<string>()
  const unique = (id: string) => {
    const result = seen.has(id) ? createId() : id
    seen.add(result)
    return result
  }
  return sessions.map(session => ({
    ...session,
    id: unique(session.id),
    blocks: session.blocks.map(block => ({ ...block, id: unique(block.id) }))
  }))
}

/** Parses any supported file version into sessions. Throws `InvalidDocumentError`. */
export function parseWorkspace(input: unknown): Session[] {
  const current = workspaceFileSchema.safeParse(input)
  if (current.success) return ensureUniqueIds(current.data.sessions)

  const legacy = legacyWorkspaceSchema.safeParse(input)
  if (legacy.success) return legacy.data.map(migrateLegacyTab)

  if (typeof input === 'object' && input !== null && 'format' in input && input.format === FILE_FORMAT) {
    const version = 'version' in input ? String(input.version) : 'unknown'
    if (version !== String(FILE_VERSION)) {
      throw new InvalidDocumentError(`This file was saved by a newer version of AI Editor (format v${version}).`)
    }
    throw new InvalidDocumentError(`This AI Editor file is damaged: ${z.prettifyError(current.error)}`)
  }
  throw new InvalidDocumentError('This file is not an AI Editor workspace.')
}

export function serializeWorkspace(sessions: readonly Session[], space?: number): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, sessions }, null, space)
}
