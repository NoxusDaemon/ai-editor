import { describe, expect, it } from 'vitest'
import { InvalidDocumentError, parseWorkspace, serializeWorkspace } from '~/lib/schema'
import { createDefaultSession, createSection, createSidebars, createSnippet, type Session, type Workspace } from '~/lib/workspace'

const workspaceOf = (sessions: Session[], sidebars = createSidebars()): Workspace => ({ sessions, sidebars })

describe('workspace schema', () => {
  it('round-trips the current format', () => {
    const workspace = workspaceOf(
      [createDefaultSession('A', 'model-a'), createDefaultSession('B')],
      { left: [createSection('Plot'), createSnippet('a twist')], right: [createSnippet('Be brief')] }
    )
    expect(parseWorkspace(JSON.parse(serializeWorkspace(workspace)))).toEqual(workspace)
  })

  it('migrates v2 files, whose snippets were plain strings', () => {
    const v2 = {
      format: 'ai-editor',
      version: 2,
      sessions: [{
        id: 's1',
        title: 'Old',
        model: '',
        blocks: [
          { id: 'b1', kind: 'snippets', items: ['alpha', 'beta'] },
          { id: 'b2', kind: 'message', role: 'user', content: 'Hello' }
        ]
      }]
    }

    const { sessions, sidebars } = parseWorkspace(v2)

    expect(sessions[0]!.blocks[0]).toMatchObject({
      id: 'b1',
      kind: 'snippets',
      items: [{ kind: 'snippet', text: 'alpha' }, { kind: 'snippet', text: 'beta' }]
    })
    expect(sessions[0]!.blocks[1]).toEqual(v2.sessions[0]!.blocks[1])
    expect(sidebars).toEqual({ left: [], right: [] })
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

    const [first, second] = parseWorkspace(legacy).sessions

    expect(first).toMatchObject({
      title: 'Session 1',
      model: 'liquid/lfm2.5-1.2b',
      blocks: [
        { kind: 'snippets', items: [{ kind: 'snippet', text: 'alpha' }, { kind: 'snippet', text: 'beta' }] },
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
    const snippet = { ...createSnippet('x'), id: 'same' }
    const parsed = parseWorkspace(JSON.parse(serializeWorkspace(workspaceOf([clash, clash], { left: [snippet, snippet], right: [] }))))

    const ids = [...parsed.sessions[0]!.blocks.map(b => b.id), ...parsed.sidebars.left.map(item => item.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('explains why a file cannot be opened', () => {
    expect(() => parseWorkspace({ hello: 'world' })).toThrow(InvalidDocumentError)
    expect(() => parseWorkspace({ format: 'ai-editor', version: 4, sessions: [] })).toThrow('newer version')
    expect(() => parseWorkspace({ format: 'ai-editor', version: 3, sessions: [] })).toThrow('damaged')
    expect(() => parseWorkspace({ format: 'ai-editor', version: 2, sessions: [{ id: 1 }] })).toThrow('damaged')
  })
})
