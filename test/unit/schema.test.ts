import { describe, expect, it } from 'vitest'
import { FLOW_TEMPLATES } from '~/lib/flow/templates'
import { InvalidDocumentError, parseWorkspace, serializeWorkspace } from '~/lib/schema'
import { createDefaultSession, createSection, createSession, createSidebars, createSnippet, type Session, type Workspace } from '~/lib/workspace'

const workspaceOf = (sessions: Session[], sidebars = createSidebars()): Workspace => ({ sessions, sidebars })
const blocksOf = (session: Session) => session.flow.nodes.find(n => n.kind === 'segment')?.blocks

describe('workspace schema', () => {
  it('round-trips the current format', () => {
    const workspace = workspaceOf(
      [createDefaultSession('A', 'model-a'), createDefaultSession('B')],
      { left: [createSection('Plot'), createSnippet('a twist')], right: [createSnippet('Be brief')] }
    )
    expect(parseWorkspace(JSON.parse(serializeWorkspace(workspace)))).toEqual(workspace)
  })

  it('round-trips every template flow', () => {
    const workspace = workspaceOf(FLOW_TEMPLATES.map(t => createSession({ title: t.title, flow: t.create() })))
    expect(parseWorkspace(JSON.parse(serializeWorkspace(workspace)))).toEqual(workspace)
  })

  it('fills in node fields missing from older v4 files', () => {
    const session = createDefaultSession('A')
    const file = JSON.parse(serializeWorkspace(workspaceOf([session])))
    const segment = file.sessions[0].flow.nodes[1]
    delete segment.schema
    delete segment.retries
    delete file.sessions[0].flow.settings

    const parsed = parseWorkspace(file).sessions[0]!.flow
    expect(parsed.nodes[1]).toMatchObject({ schema: '', retries: 2 })
    expect(parsed.settings).toMatchObject({ context: 'conversation', maxSteps: 200 })
  })

  it('migrates v3 files: their blocks become a conversation segment', () => {
    const v3 = {
      format: 'ai-editor',
      version: 3,
      sessions: [{ id: 's1', title: 'Old', model: 'm', blocks: [{ id: 'b1', kind: 'message', role: 'user', content: 'Hello' }] }],
      sidebars: { left: [createSnippet('kept')], right: [] }
    }
    const { sessions, sidebars } = parseWorkspace(v3)
    expect(sessions[0]).toMatchObject({ id: 's1', title: 'Old', model: 'm' })
    expect(sessions[0]!.flow.nodes.map(n => n.kind)).toEqual(['start', 'segment', 'end'])
    expect(blocksOf(sessions[0]!)).toEqual(v3.sessions[0]!.blocks)
    expect(sidebars.left).toHaveLength(1)
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

    expect(blocksOf(sessions[0]!)![0]).toMatchObject({
      id: 'b1',
      kind: 'snippets',
      items: [{ kind: 'snippet', text: 'alpha' }, { kind: 'snippet', text: 'beta' }]
    })
    expect(blocksOf(sessions[0]!)![1]).toEqual(v2.sessions[0]!.blocks[1])
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

    expect(first).toMatchObject({ title: 'Session 1', model: 'liquid/lfm2.5-1.2b' })
    expect(blocksOf(first!)).toMatchObject([
      { kind: 'snippets', items: [{ kind: 'snippet', text: 'alpha' }, { kind: 'snippet', text: 'beta' }] },
      { kind: 'message', role: 'system', content: '' },
      { kind: 'message', role: 'user', content: 'Hello' },
      { kind: 'message', role: 'assistant', content: 'Hi!' },
      { kind: 'message', role: 'user', content: 'unknown role' }
    ])
    expect(first).not.toHaveProperty('stopController')
    expect(second).toMatchObject({ title: 'Custom name', model: '' })
    expect(blocksOf(second!)).toEqual([])
  })

  it('replaces duplicate ids so lists render correctly', () => {
    const session = createDefaultSession()
    const file = JSON.parse(serializeWorkspace(workspaceOf([session, session], { left: [createSnippet('x'), createSnippet('y')], right: [] })))
    file.sessions[0].flow.nodes[1].blocks.forEach((b: { id: string }) => (b.id = 'same'))
    file.sidebars.left.forEach((item: { id: string }) => (item.id = 'same'))
    const parsed = parseWorkspace(file)

    const ids = [
      ...parsed.sessions.map(s => s.id),
      ...parsed.sessions.flatMap(s => s.flow.nodes.map(n => n.id)),
      ...blocksOf(parsed.sessions[0]!)!.map(b => b.id),
      ...parsed.sidebars.left.map(item => item.id)
    ]
    expect(new Set(ids).size).toBe(ids.length)
    // Edges still point at the first copy's nodes.
    expect(parsed.sessions[0]!.flow.edges).toHaveLength(2)
  })

  it('explains why a file cannot be opened', () => {
    expect(() => parseWorkspace({ hello: 'world' })).toThrow(InvalidDocumentError)
    expect(() => parseWorkspace({ format: 'ai-editor', version: 5, sessions: [] })).toThrow('newer version')
    expect(() => parseWorkspace({ format: 'ai-editor', version: 4, sessions: [] })).toThrow('damaged')
    expect(() => parseWorkspace({ format: 'ai-editor', version: 3, sessions: [] })).toThrow('damaged')
    expect(() => parseWorkspace({ format: 'ai-editor', version: 2, sessions: [{ id: 1 }] })).toThrow('damaged')
  })
})
