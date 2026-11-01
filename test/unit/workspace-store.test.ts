import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSession, createSection, createSidebars, createSnippet } from '~/lib/workspace'
import { useWorkspaceStore } from '~/stores/workspace'

describe('workspace store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with one active default session', () => {
    const workspace = useWorkspaceStore()
    expect(workspace.sessions).toHaveLength(1)
    expect(workspace.activeSession.title).toBe('Session 1')
    expect(workspace.activeSession.blocks.map(b => b.kind === 'message' ? b.role : b.kind))
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

  it('selects a neighbour when the active session is closed', () => {
    const workspace = useWorkspaceStore()
    const [a, b, c] = [workspace.sessions[0]!, workspace.addSession(), workspace.addSession()]

    workspace.select(b.id)
    workspace.closeSession(b.id)
    expect(workspace.activeId).toBe(c.id)

    workspace.closeSession(c.id)
    expect(workspace.activeId).toBe(a.id)
  })

  it('keeps the active tab when closing another one', () => {
    const workspace = useWorkspaceStore()
    const first = workspace.sessions[0]!
    const second = workspace.addSession()
    workspace.closeSession(first.id)
    expect(workspace.activeId).toBe(second.id)
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

  it('edits blocks', () => {
    const workspace = useWorkspaceStore()
    const session = workspace.activeSession
    const [snippets, system, user] = session.blocks

    workspace.updateMessage(session.id, system!.id, { content: 'Be terse' })
    workspace.setRole(session.id, user!.id, 'assistant')
    const items = [createSnippet('a'), createSection('B'), createSnippet('b')]
    workspace.setSnippets(session.id, snippets!.id, items)
    workspace.moveBlock(session.id, 0, 3)
    workspace.removeBlock(session.id, user!.id)

    expect(session.blocks).toMatchObject([
      { kind: 'message', role: 'system', content: 'Be terse' },
      { kind: 'message', role: 'assistant' },
      { kind: 'snippets', items }
    ])
  })

  it('ignores out-of-range moves and mismatched block kinds', () => {
    const workspace = useWorkspaceStore()
    const session = workspace.activeSession
    const before = session.blocks.map(b => b.id)

    workspace.moveBlock(session.id, 0, 99)
    workspace.setSnippets(session.id, session.blocks[1]!.id, [createSnippet('not a snippets block')])

    expect(session.blocks.map(b => b.id)).toEqual(before)
    expect(session.blocks[1]).not.toHaveProperty('items')
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
