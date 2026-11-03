import { describe, expect, it } from 'vitest'
import { createConversationFlow, FLOW_TEMPLATES } from '~/lib/flow/templates'
import { createNode } from '~/lib/flow/types'
import {
  createBlock,
  createDefaultSession,
  createSession,
  createSnippet,
  duplicateSession,
  hasPrompt,
  nextSessionTitle,
  planGeneration,
  sessionHasContent,
  type Block,
  type Session
} from '~/lib/workspace'

const message = (role: 'system' | 'user' | 'assistant', content: string): Block => createBlock(role, content)
const segmentOf = (session: Session) => session.flow.nodes.find(n => n.kind === 'segment')!
const sessionWith = (blocks: Block[]) => createSession({ flow: createConversationFlow(blocks) })

describe('planGeneration', () => {
  it('fills a trailing empty assistant block', () => {
    const target = message('assistant', '')
    expect(planGeneration([createBlock('snippets'), message('system', 'Be brief'), message('user', 'Hi'), target])).toEqual({
      messages: [{ role: 'system', content: 'Be brief' }, { role: 'user', content: 'Hi' }],
      targetBlockId: target.id,
      prefill: ''
    })
  })

  it('carries on a trailing assistant block that already has text, such as a stopped reply', () => {
    const target = message('assistant', 'Once upon a time ')
    expect(planGeneration([message('user', 'Tell a story'), target])).toEqual({
      messages: [{ role: 'user', content: 'Tell a story' }],
      targetBlockId: target.id,
      prefill: 'Once upon a time'
    })
  })

  it('appends a reply when the conversation ends with a user message', () => {
    const plan = planGeneration([message('user', 'Hi'), message('assistant', 'Hello'), message('user', 'More')])
    expect(plan).toMatchObject({ targetBlockId: null, prefill: '' })
    expect(plan.messages).toHaveLength(3)
  })

  it('carries on a reply from a point in its text, sending only what comes before it', () => {
    const reply = message('assistant', 'Paris is the capital. It has a river.')
    const plan = planGeneration([message('user', 'About France?'), reply, message('user', 'And Spain?')], { blockId: reply.id, prefix: 'Paris is the capital.\n\n' })
    expect(plan).toEqual({ messages: [{ role: 'user', content: 'About France?' }], targetBlockId: reply.id, prefill: 'Paris is the capital.\n\n' })
  })

  it('skips snippets and empty messages', () => {
    expect(planGeneration([message('system', '   '), createBlock('snippets'), message('user', 'Hi')]).messages).toEqual([{ role: 'user', content: 'Hi' }])
  })

  it('reports when there is nothing to send', () => {
    expect(hasPrompt(planGeneration([message('assistant', '')]))).toBe(false)
    expect(hasPrompt(planGeneration([message('assistant', 'only me')]))).toBe(false)
  })
})

describe('sessions', () => {
  it('starts as Start → a conversation segment laid out like the classic editor → End', () => {
    const session = createDefaultSession('A', 'model')
    expect(session.flow.nodes.map(n => n.kind)).toEqual(['start', 'segment', 'end'])
    expect(session.flow.edges).toHaveLength(2)
    expect(segmentOf(session).blocks.map(b => b.kind === 'message' ? b.role : b.kind)).toEqual(['snippets', 'system', 'user', 'assistant'])
  })

  it('picks the next free title', () => {
    expect(nextSessionTitle([])).toBe('Session 1')
    expect(nextSessionTitle([{ title: 'Session 1' }, { title: 'Session 3' }])).toBe('Session 4')
    expect(nextSessionTitle([{ title: 'Session 2' }])).toBe('Session 3')
  })

  it('duplicates with fresh ids and independent data', () => {
    const original = createDefaultSession('A', 'model')
    const copy = duplicateSession(original, 'B')

    expect(copy).toMatchObject({ title: 'B', model: 'model' })
    expect(copy.id).not.toBe(original.id)
    copy.flow.nodes.forEach((node, i) => expect(node.id).not.toBe(original.flow.nodes[i]!.id))
    segmentOf(copy).blocks.forEach((block, i) => expect(block.id).not.toBe(segmentOf(original).blocks[i]!.id))

    const snippets = segmentOf(copy).blocks.find(b => b.kind === 'snippets')!
    snippets.items.push(createSnippet('only in the copy'))
    expect(segmentOf(original).blocks.find(b => b.kind === 'snippets')!.items).toEqual([])
  })

  it('knows whether closing a session loses work', () => {
    expect(sessionHasContent(createDefaultSession())).toBe(false)
    expect(sessionHasContent(sessionWith([message('system', 'rules')]))).toBe(true)
    expect(sessionHasContent(sessionWith([{ ...createBlock('snippets'), items: [createSnippet('x')] } as Block]))).toBe(true)
    const withNote = createDefaultSession()
    withNote.flow.nodes.push(createNode('note', { key: 'note' }))
    expect(sessionHasContent(withNote)).toBe(true)
    expect(FLOW_TEMPLATES.filter(t => t.id !== 'conversation').every(t => sessionHasContent(createSession({ flow: t.create() })))).toBe(true)
  })
})
