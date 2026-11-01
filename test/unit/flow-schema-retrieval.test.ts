import { describe, expect, it, vi } from 'vitest'
import { extractJson, parseSchema, SCHEMA_PRESETS, schemaFields, validateJson } from '~/lib/flow/json-schema'
import { bm25, buildChunks, chunkText, formatContext, fuseRankings, searchChunks, terms } from '~/lib/flow/retrieval'

describe('JSON schema validation', () => {
  const schema = {
    type: 'object',
    properties: {
      category: { type: 'string', enum: ['a', 'b'] },
      score: { type: 'integer', minimum: 1, maximum: 10 },
      tags: { type: 'array', items: { type: 'string', minLength: 2 }, maxItems: 2, uniqueItems: true },
      nested: { $ref: '#/$defs/point' }
    },
    required: ['category', 'score'],
    additionalProperties: false,
    $defs: { point: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] } }
  }

  it('accepts matching values', () => {
    expect(validateJson({ category: 'a', score: 3, tags: ['xy'], nested: { x: 1.5 } }, schema)).toEqual([])
  })

  it('explains every mismatch with a path', () => {
    expect(validateJson({ category: 'c', score: 11.5, tags: ['x', 'x', 'yy'], nested: {}, extra: 1 }, schema)).toEqual([
      '$.category: must be one of "a", "b"',
      '$.score: expected integer, got number',
      '$.tags: must have at most 2 items',
      '$.tags[0]: must be at least 2 characters',
      '$.tags[1]: must be at least 2 characters',
      '$.tags: items must be unique',
      '$.nested.x: is required',
      '$.extra: is not an allowed property'
    ])
    expect(validateJson({}, schema)).toEqual(['$.category: is required', '$.score: is required'])
  })

  it('handles anyOf, oneOf, not and const', () => {
    expect(validateJson(5, { anyOf: [{ type: 'string' }, { type: 'number' }] })).toEqual([])
    expect(validateJson(true, { anyOf: [{ type: 'string' }, { type: 'number' }] })).toHaveLength(1)
    expect(validateJson(5, { oneOf: [{ type: 'number' }, { type: 'integer' }] })[0]).toMatch(/exactly one/)
    expect(validateJson('x', { not: { type: 'string' } })).toHaveLength(1)
    expect(validateJson('yes', { const: 'yes' })).toEqual([])
  })

  it('parses schema text and lists its fields', () => {
    expect(parseSchema('{ nope')).toMatchObject({ ok: false })
    expect(parseSchema('[]')).toMatchObject({ ok: false })
    expect(schemaFields(JSON.stringify(SCHEMA_PRESETS[0]!.schema))).toEqual(['category', 'confidence', 'reason'])
  })

  it('pulls JSON out of fenced or chatty replies', () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(extractJson('Sure!\n```json\n{"a": 2}\n```')).toEqual({ ok: true, value: { a: 2 } })
    expect(extractJson('Here you go: {"a": 3} hope it helps')).toEqual({ ok: true, value: { a: 3 } })
    expect(extractJson('no json here')).toMatchObject({ ok: false })
  })
})

describe('retrieval', () => {
  it('chunks text at natural breaks with overlap', () => {
    const paragraph = 'Sentence one is here. Sentence two follows on. Sentence three ends it.'
    const chunks = chunkText(`${paragraph}\n\n${paragraph}\n\n${paragraph}`, 80, 20)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.every(chunk => chunk.length <= 80 * 1.5)).toBe(true)
    expect(chunks[1]!.startsWith('Sentence')).toBe(false) // starts with the overlap from the previous chunk
    expect(chunkText('   ', 100, 10)).toEqual([])
    expect(chunkText('short', 100, 10)).toEqual(['short'])
  })

  it('normalises search terms', () => {
    expect(terms('The Passwords, résumé and the 2FA codes!')).toEqual(['password', 'resume', '2fa', 'code'])
  })

  it('ranks with BM25', () => {
    const scores = bm25(['password'], [['billing', 'invoice'], ['password', 'reset', 'password'], ['password']])
    expect(scores[0]).toBe(0)
    expect(scores[1]).toBeGreaterThan(0)
    expect(scores[2]).toBeGreaterThan(0)
  })

  it('fuses rankings', () => {
    const fused = fuseRankings([[0, 1, 2], [2, 0]])
    expect([...fused].sort((a, b) => b[1] - a[1]).map(([i]) => i)).toEqual([0, 2, 1])
  })

  const docs = [
    { id: 'd1', name: 'Security', text: 'To reset your password open Settings. The reset link lasts 30 minutes.' },
    { id: 'd2', name: 'Billing', text: 'Invoices are emailed monthly. Plans change pro rata.' }
  ]

  it('finds passages by keyword', async () => {
    const chunks = buildChunks(docs, 400, 40)
    const hits = await searchChunks(chunks, 'how do I reset my password?', { mode: 'keyword', topK: 3, minScore: 0, diversify: false })
    expect(hits.map(hit => hit.source)).toEqual(['Security'])
    expect(hits[0]!.score).toBe(1)
  })

  it('finds passages by embedding, and fuses both in hybrid mode', async () => {
    const chunks = buildChunks(docs, 400, 40)
    const embed = vi.fn(async (texts: string[]) => texts.map(text => /invoice|bill|charge/i.test(text) ? [0, 1] : [1, 0]))
    const semantic = await searchChunks(chunks, 'when am I charged?', { mode: 'semantic', topK: 1, minScore: 0.5, diversify: false, embed })
    expect(semantic.map(hit => hit.source)).toEqual(['Billing'])
    const hybrid = await searchChunks(chunks, 'password charge', { mode: 'hybrid', topK: 2, minScore: 0, diversify: false, embed })
    expect(hybrid).toHaveLength(2)
    await expect(searchChunks(chunks, 'x', { mode: 'semantic', topK: 1, minScore: 0, diversify: false })).rejects.toThrow(/embedding/)
  })

  it('diversifies away near-duplicate passages', async () => {
    const chunks = buildChunks([
      { id: 'a', name: 'A', text: 'reset password link email' },
      { id: 'b', name: 'B', text: 'reset password link email' },
      { id: 'c', name: 'C', text: 'reset password policy notes' }
    ], 400, 0)
    const plain = await searchChunks(chunks, 'reset password', { mode: 'keyword', topK: 2, minScore: 0, diversify: false })
    const varied = await searchChunks(chunks, 'reset password', { mode: 'keyword', topK: 2, minScore: 0, diversify: true })
    expect(plain.map(h => h.source)).toEqual(['A', 'B'])
    expect(varied.map(h => h.source)).toEqual(['A', 'C'])
  })

  it('numbers passages for citation', () => {
    const text = formatContext([{ id: 'x', documentId: 'd', source: 'Doc', index: 1, text: 'Body', score: 1 }], 'Cite like [1].')
    expect(text).toBe('Cite like [1].\n\n[1] Doc (part 2)\nBody')
    expect(formatContext([], '')).toBe('(No relevant passages were found.)')
  })
})
