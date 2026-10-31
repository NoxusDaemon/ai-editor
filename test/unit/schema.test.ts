import { describe, expect, it } from 'vitest'
import { InvalidDocumentError, parseWorkspace, serializeWorkspace } from '~/lib/schema'
import { createDefaultSession, type Session } from '~/lib/workspace'

describe('workspace schema', () => {
  it('round-trips the current format', () => {
    const sessions = [createDefaultSession('A', 'model-a'), createDefaultSession('B')]
    expect(parseWorkspace(JSON.parse(serializeWorkspace(sessions)))).toEqual(sessions)
  })

  it('migrates files from the original app', () => {
    const legacy = [
      {
        label: '1',
        selectedModel: 'liquid/lfm2.5-1.2b',
        stopController: { some: 'leaked runtime state' },
        promptsList: [
          { key: 'Cache', content: ['alpha', 'beta'], type: 'Segments' },
          { key: 'System', content: ' ', type: 'Editor' },
          { key: 'User', content: 'Hello', type: 'Editor' },
          { key: 'Assistant', content: 'Hi!', type: 'Editor' },
          { key: 'Narrator', content: 'unknown role', type: 'Editor' }
        ]
      },
      { label: 'Custom name', promptsList: [] }
    ]

    const [first, second] = parseWorkspace(legacy)

    expect(first).toMatchObject({
      title: 'Session 1',
      model: 'liquid/lfm2.5-1.2b',
      blocks: [
        { kind: 'snippets', items: ['alpha', 'beta'] },
        { kind: 'message', role: 'system', content: '' },
        { kind: 'message', role: 'user', content: 'Hello' },
        { kind: 'message', role: 'assistant', content: 'Hi!' },
        { kind: 'message', role: 'user', content: 'unknown role' }
      ]
    })
    expect(first).not.toHaveProperty('stopController')
    expect(second).toMatchObject({ title: 'Custom name', model: '', blocks: [] })
  })

  it('replaces duplicate ids so lists render correctly', () => {
    const session = createDefaultSession()
    const clash: Session = { ...session, blocks: session.blocks.map(b => ({ ...b, id: 'same' })) }
    const [parsed] = parseWorkspace(JSON.parse(serializeWorkspace([clash, clash])))
    const ids = parsed!.blocks.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('explains why a file cannot be opened', () => {
    expect(() => parseWorkspace({ hello: 'world' })).toThrow(InvalidDocumentError)
    expect(() => parseWorkspace({ format: 'ai-editor', version: 3, sessions: [] })).toThrow('newer version')
    expect(() => parseWorkspace({ format: 'ai-editor', version: 2, sessions: [{ id: 1 }] })).toThrow('damaged')
  })
})
