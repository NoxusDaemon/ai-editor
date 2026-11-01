import { describe, expect, it } from 'vitest'
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
  type Block
} from '~/lib/workspace'

const message = (role: 'system' | 'user' | 'assistant', content: string): Block => createBlock(role, content)

describe('planGeneration', () => {
  it('fills a trailing empty assistant block', () => {
    const target = message('assistant', '')
    const session = createSession({ blocks: [createBlock('snippets'), message('system', 'Be brief'), message('user', 'Hi'), target] })

    expect(planGeneration(session)).toEqual({
      messages: [{ role: 'system', content: 'Be brief' }, { role: 'user', content: 'Hi' }],
      targetBlockId: target.id
    })
  })

  it('appends a new reply after a filled conversation', () => {
    const session = createSession({ blocks: [message('user', 'Hi'), message('assistant', 'Hello'), message('user', 'More')] })
    const plan = planGeneration(session)

    expect(plan.targetBlockId).toBeNull()
    expect(plan.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('skips empty messages and snippets', () => {
    const session = createSession({ blocks: [message('system', '   '), createBlock('snippets'), message('user', 'Hi')] })
    expect(planGeneration(session).messages).toEqual([{ role: 'user', content: 'Hi' }])
  })

  it('reports when there is nothing to send', () => {
    expect(hasPrompt(planGeneration(createSession({ blocks: [message('assistant', '')] })))).toBe(false)
    expect(hasPrompt(planGeneration(createSession({ blocks: [message('assistant', 'only me')] })))).toBe(false)
  })
})

describe('sessions', () => {
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
    copy.blocks.forEach((block, i) => expect(block.id).not.toBe(original.blocks[i]!.id))

    const snippets = copy.blocks.find(b => b.kind === 'snippets')!
    snippets.items.push(createSnippet('only in the copy'))
    expect(original.blocks.find(b => b.kind === 'snippets')!.items).toEqual([])
  })

  it('knows whether closing a session loses work', () => {
    const pristine = createDefaultSession()
    expect(sessionHasContent(pristine)).toBe(false)
    expect(sessionHasContent(createSession({ blocks: [message('system', 'rules')] }))).toBe(true)
    expect(sessionHasContent(createSession({ blocks: [{ ...createBlock('snippets'), items: [createSnippet('x')] } as Block] }))).toBe(true)
  })
})
