import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { FLOW_TEMPLATES } from '~/lib/flow/templates'
import { createDefaultSession, createSection, createSidebars, createSnippet } from '~/lib/workspace'
import { useWorkspaceStore } from '~/stores/workspace'

function setup() {
  const workspace = useWorkspaceStore()
  const session = workspace.activeSession
  const segment = session.flow.nodes.find(n => n.kind === 'segment')!
  return { workspace, session, segment, flow: () => workspace.activeSession.flow }
}

describe('workspace store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with one active default session', () => {
    const { workspace, segment } = setup()
    expect(workspace.sessions).toHaveLength(1)
    expect(workspace.activeSession.title).toBe('Session 1')
    expect(segment.kind === 'segment' && segment.blocks.map(b => b.kind === 'message' ? b.role : b.kind))
      .toEqual(['snippets', 'system', 'user', 'assistant'])
  })

  it('adds sessions with unique titles and activates them', () => {
    const workspace = useWorkspaceStore()
    workspace.addSession()
    workspace.closeSession(workspace.sessions[0]!.id)
    const added = workspace.addSession()

    expect(workspace.sessions.map(s => s.title)).toEqual(['Session 2', 'Session 3'])
    expect(workspace.activeId).toBe(added.id)
  })

  it('adds sessions from templates', () => {
    const workspace = useWorkspaceStore()
    const rag = workspace.addSession(FLOW_TEMPLATES.find(t => t.id === 'rag'))
    expect(rag.title).toBe('Knowledge Q&A (RAG)')
    expect(rag.flow.nodes.some(n => n.kind === 'knowledge')).toBe(true)
  })

  it('selects a neighbour when the active session is closed', () => {
    const workspace = useWorkspaceStore()
    const [a, b, c] = [workspace.sessions[0]!, workspace.addSession(), workspace.addSession()]

    workspace.select(b.id)
    workspace.closeSession(b.id)
    expect(workspace.activeId).toBe(c.id)

    workspace.closeSession(c.id)
    expect(workspace.activeId).toBe(a.id)
  })

  it('replaces the last session instead of leaving the workspace empty', () => {
    const workspace = useWorkspaceStore()
    const only = workspace.sessions[0]!
    workspace.closeSession(only.id)
    expect(workspace.sessions).toHaveLength(1)
    expect(workspace.activeSession.id).not.toBe(only.id)
  })

  it('duplicates a session next to the original', () => {
    const workspace = useWorkspaceStore()
    const original = workspace.sessions[0]!
    workspace.addSession()
    const copy = workspace.duplicate(original.id)!

    expect(workspace.sessions.indexOf(workspace.findSession(copy.id)!)).toBe(1)
    expect(workspace.activeId).toBe(copy.id)
  })

  it('edits the blocks of a segment', () => {
    const { workspace, session, segment } = setup()
    const blocks = () => workspace.findSegment(session.id, segment.id)!.blocks
    const [snippets, system, user] = blocks()

    workspace.updateMessage(session.id, segment.id, system!.id, { content: 'Be terse' })
    workspace.setRole(session.id, segment.id, user!.id, 'assistant')
    const items = [createSnippet('a'), createSection('B'), createSnippet('b')]
    workspace.setSnippets(session.id, segment.id, snippets!.id, items)
    workspace.moveBlock(session.id, segment.id, 0, 3)
    workspace.removeBlock(session.id, segment.id, user!.id)

    expect(blocks()).toMatchObject([
      { kind: 'message', role: 'system', content: 'Be terse' },
      { kind: 'message', role: 'assistant' },
      { kind: 'snippets', items }
    ])
  })

  it('ignores out-of-range moves and mismatched block kinds', () => {
    const { workspace, session, segment } = setup()
    const blocks = () => workspace.findSegment(session.id, segment.id)!.blocks
    const before = blocks().map(b => b.id)

    workspace.moveBlock(session.id, segment.id, 0, 99)
    workspace.setSnippets(session.id, segment.id, blocks()[1]!.id, [createSnippet('not a snippets block')])

    expect(blocks().map(b => b.id)).toEqual(before)
    expect(blocks()[1]).not.toHaveProperty('items')
  })

  it('adds, connects and removes nodes', () => {
    const { workspace, session, flow } = setup()
    const condition = workspace.addNode(session.id, 'condition', { x: 10.4, y: 20.6 })!
    const end = flow().nodes.find(n => n.kind === 'end')!

    expect(condition).toMatchObject({ key: 'condition', position: { x: 10, y: 21 }, parentId: null })
    expect(workspace.connect(session.id, { source: condition.id, sourceHandle: 'else', target: end.id })).toBe(true)
    expect(workspace.connect(session.id, { source: end.id, sourceHandle: 'out', target: condition.id })).toBe(false)
    expect(flow().edges).toHaveLength(3)

    workspace.removeNodes(session.id, [condition.id])
    expect(flow().nodes.some(n => n.id === condition.id)).toBe(false)
    expect(flow().edges).toHaveLength(2)
  })

  it('drops the edge of a removed condition branch', () => {
    const { workspace, session, flow } = setup()
    const condition = workspace.addNode(session.id, 'condition', { x: 0, y: 0 })!
    const end = flow().nodes.find(n => n.kind === 'end')!
    const branch = condition.branches[0]!
    workspace.connect(session.id, { source: condition.id, sourceHandle: branch.id, target: end.id })

    workspace.updateNode(session.id, condition.id, { branches: [] })

    expect(flow().edges.some(e => e.sourceHandle === branch.id)).toBe(false)
  })

  it('renames keys only to free, valid identifiers', () => {
    const { workspace, session, segment } = setup()
    expect(workspace.setKey(session.id, segment.id, 'draft')).toBe(true)
    expect(workspace.setKey(session.id, segment.id, 'start')).toBe(false)
    expect(workspace.setKey(session.id, segment.id, '2 bad')).toBe(false)
    expect(workspace.findNode(session.id, segment.id)!.key).toBe('draft')
  })

  it('moves nodes into and out of groups, keeping them in place on screen', () => {
    const { workspace, session, segment, flow } = setup()
    const group = workspace.addNode(session.id, 'group', { x: 1000, y: 1000 })!
    const node = () => workspace.findNode(session.id, segment.id)!

    workspace.moveNodes(session.id, [{ id: segment.id, position: { x: 1100, y: 1100 } }])
    expect(node()).toMatchObject({ parentId: group.id, position: { x: 100, y: 100 } })

    // Moving the group keeps its contents inside.
    workspace.moveNodes(session.id, [{ id: group.id, position: { x: 2000, y: 2000 } }])
    expect(node().parentId).toBe(group.id)

    workspace.moveNodes(session.id, [{ id: segment.id, position: { x: -2000, y: -2000 } }])
    expect(node()).toMatchObject({ parentId: null, position: { x: 0, y: 0 } })
    expect(flow().nodes).toHaveLength(4)
  })

  it('groups and ungroups nodes', () => {
    const { workspace, session, segment, flow } = setup()
    const memory = workspace.addNode(session.id, 'memory', { x: 320, y: 300 })!

    const group = workspace.groupNodes(session.id, [segment.id, memory.id])!
    expect(flow().nodes[0]!.id).toBe(group.id)
    expect(workspace.findNode(session.id, segment.id)!.parentId).toBe(group.id)
    expect(group.width).toBeGreaterThan(256)

    workspace.ungroup(session.id, group.id)
    expect(workspace.findNode(session.id, segment.id)).toMatchObject({ parentId: null, position: { x: 320, y: 40 } })
  })

  it('removes a group with everything in it', () => {
    const { workspace, session, segment, flow } = setup()
    const group = workspace.groupNodes(session.id, [segment.id])!
    workspace.removeNodes(session.id, [group.id])
    expect(flow().nodes.map(n => n.kind)).toEqual(['start', 'end'])
    expect(flow().edges).toEqual([])
  })

  it('duplicates nodes with new keys next to the originals', () => {
    const { workspace, session, segment, flow } = setup()
    const [copy] = workspace.duplicateNodes(session.id, [segment.id])
    expect(copy).toMatchObject({ key: 'reply2', title: 'Conversation', position: { x: 360, y: 80 } })
    expect(flow().nodes).toHaveLength(4)
  })

  it('undoes and redoes flow edits', () => {
    const { workspace, session, flow } = setup()
    expect(workspace.canUndo(session.id)).toBe(false)
    const note = workspace.addNode(session.id, 'note', { x: 0, y: 0 })!
    workspace.updateNode(session.id, note.id, { text: 'a' })
    workspace.updateNode(session.id, note.id, { text: 'ab' }) // same undo step as the edit before

    expect(workspace.undo(session.id)).toBe(true)
    expect(flow().nodes.find(n => n.id === note.id)).toMatchObject({ text: '' })
    workspace.undo(session.id)
    expect(flow().nodes.some(n => n.id === note.id)).toBe(false)
    expect(workspace.canRedo(session.id)).toBe(true)

    workspace.redo(session.id)
    workspace.redo(session.id)
    expect(flow().nodes.find(n => n.id === note.id)).toMatchObject({ text: 'ab' })
    expect(workspace.redo(session.id)).toBe(false)
  })

  it('renames, ignoring blank names', () => {
    const workspace = useWorkspaceStore()
    const id = workspace.activeId
    workspace.renameSession(id, '  Research  ')
    workspace.renameSession(id, '   ')
    expect(workspace.activeSession.title).toBe('Research')
  })

  it('replaces everything when a file is loaded', () => {
    const workspace = useWorkspaceStore()
    const loaded = [createDefaultSession('Loaded A'), createDefaultSession('Loaded B')]
    const sidebars = { ...createSidebars(), right: [createSnippet('from file')] }
    workspace.restore({ sessions: loaded, sidebars })

    expect(workspace.sessions.map(s => s.title)).toEqual(['Loaded A', 'Loaded B'])
    expect(workspace.activeId).toBe(loaded[0]!.id)
    expect(workspace.sidebars).toEqual(sidebars)
  })

  it('keeps the sidebars when the last session is closed', () => {
    const workspace = useWorkspaceStore()
    const items = [createSection('Generic'), createSnippet('Be concise')]
    workspace.setSidebar('left', items)

    workspace.closeSession(workspace.activeId)

    expect(workspace.sidebars).toEqual({ left: items, right: [] })
  })
})
