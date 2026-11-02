import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  absolutePosition,
  ancestors,
  CARD_SIZE,
  connectEdges,
  copyNodes,
  descendants,
  findNode as findFlowNode,
  groupAt,
  KEY_PATTERN,
  nodeSize,
  pruneEdges,
  uniqueKey,
  type Connection
} from '~/lib/flow/graph'
import type { FlowTemplate } from '~/lib/flow/templates'
import {
  createNode,
  DEFAULT_TITLES,
  type Flow,
  type FlowNode,
  type FlowSettings,
  type NodeInit,
  type NodeKind,
  type NodeOf,
  type Position
} from '~/lib/flow/types'
import {
  createBlock,
  createDefaultSession,
  createSession,
  createSidebars,
  duplicateSession,
  moveItem,
  nextSessionTitle,
  type Block,
  type BlockType,
  type MessageBlock,
  type MessageRole,
  type Session,
  type SidebarSide,
  type Sidebars,
  type SnippetItem,
  type Workspace
} from '~/lib/workspace'
import { useSettingsStore } from './settings'

export const HISTORY_LIMIT = 50
/** Undo snapshots kept per session at most, in characters: flows with large knowledge documents keep fewer steps. */
export const HISTORY_MAX_CHARS = 40_000_000
/** Edits to the same thing within this long of each other are undone together, e.g. a burst of typing. */
export const HISTORY_COALESCE_MS = 1500
const GROUP_PADDING = 40

interface History {
  past: string[]
  future: string[]
  lastKey?: string
  lastAt?: number
}

/** A node's fields that can be patched; id, kind, key and nesting change through dedicated actions. */
export type NodePatch = { [K in NodeKind]: Partial<Omit<NodeOf<K>, 'id' | 'kind' | 'parentId' | 'key'>> }[NodeKind]

/** The open sessions (tabs), their flows, the snippet sidebars, and every edit made to them. */
export const useWorkspaceStore = defineStore('workspace', () => {
  const settings = useSettingsStore()

  const sessions = ref<Session[]>([createDefaultSession('Session 1', settings.defaultModel)])
  const activeId = ref(sessions.value[0]!.id)
  const sidebars = ref<Sidebars>(createSidebars())

  const activeSession = computed(() => sessions.value.find(s => s.id === activeId.value) ?? sessions.value[0]!)

  const findSession = (id: string) => sessions.value.find(s => s.id === id)
  const findFlow = (sessionId: string): Flow | undefined => findSession(sessionId)?.flow

  function findNode<K extends NodeKind>(sessionId: string, nodeId: string, kind?: K): NodeOf<K> | undefined {
    const node = findFlow(sessionId)?.nodes.find(n => n.id === nodeId)
    return node && (!kind || node.kind === kind) ? node as NodeOf<K> : undefined
  }

  const findSegment = (sessionId: string, segmentId: string) => findNode(sessionId, segmentId, 'segment')

  function findBlock<K extends Block['kind']>(sessionId: string, segmentId: string, blockId: string, kind: K) {
    const block = findSegment(sessionId, segmentId)?.blocks.find(b => b.id === blockId)
    return block?.kind === kind ? block as Extract<Block, { kind: K }> : undefined
  }

  // ── Undo history (per session) ──────────────────────────────────────

  const histories = new Map<string, History>()
  /** Bumped whenever a history changes, so canUndo/canRedo stay reactive. */
  const historyVersion = ref(0)

  const historyOf = (sessionId: string) => {
    let history = histories.get(sessionId)
    if (!history) histories.set(sessionId, history = { past: [], future: [] })
    return history
  }

  /**
   * Records the flow before an edit so it can be undone. Edits with the same
   * `coalesce` key in quick succession share one undo step.
   */
  function checkpoint(sessionId: string, coalesce?: string) {
    const flow = findFlow(sessionId)
    if (!flow) return
    const history = historyOf(sessionId)
    const now = Date.now()
    const merge = coalesce !== undefined && history.lastKey === coalesce && now - (history.lastAt ?? 0) < HISTORY_COALESCE_MS
    history.lastKey = coalesce
    history.lastAt = now
    if (merge) return
    history.past.push(JSON.stringify(flow))
    let size = history.past.reduce((total, snapshot) => total + snapshot.length, 0)
    while (history.past.length > HISTORY_LIMIT || (size > HISTORY_MAX_CHARS && history.past.length > 1)) size -= history.past.shift()!.length
    history.future = []
    historyVersion.value++
  }

  function travel(sessionId: string, from: 'past' | 'future') {
    const session = findSession(sessionId)
    const history = histories.get(sessionId)
    const snapshot = history?.[from].pop()
    if (!session || !history || snapshot === undefined) return false
    history[from === 'past' ? 'future' : 'past'].push(JSON.stringify(session.flow))
    history.lastKey = undefined
    session.flow = JSON.parse(snapshot)
    historyVersion.value++
    return true
  }

  const undo = (sessionId: string) => travel(sessionId, 'past')
  const redo = (sessionId: string) => travel(sessionId, 'future')

  function canUndo(sessionId: string) {
    void historyVersion.value
    return !!histories.get(sessionId)?.past.length
  }

  function canRedo(sessionId: string) {
    void historyVersion.value
    return !!histories.get(sessionId)?.future.length
  }

  // ── Sessions ────────────────────────────────────────────────────────

  function select(id: string) {
    if (findSession(id)) activeId.value = id
  }

  /** Opens a new session, from a template or with the default conversation. */
  function addSession(template?: FlowTemplate): Session {
    const title = nextSessionTitle(sessions.value)
    const session = template
      ? createSession({ title: template.title === 'Conversation' ? title : template.title, model: settings.defaultModel, flow: template.create() })
      : createDefaultSession(title, settings.defaultModel)
    sessions.value.push(session)
    activeId.value = session.id
    return session
  }

  function duplicate(id: string): Session | undefined {
    const index = sessions.value.findIndex(s => s.id === id)
    if (index === -1) return
    const copy = duplicateSession(sessions.value[index]!, nextSessionTitle(sessions.value))
    sessions.value.splice(index + 1, 0, copy)
    activeId.value = copy.id
    return copy
  }

  function closeSession(id: string) {
    const index = sessions.value.findIndex(s => s.id === id)
    if (index === -1) return
    histories.delete(id)
    if (sessions.value.length === 1) {
      replaceAll([])
      return
    }
    sessions.value.splice(index, 1)
    if (activeId.value === id) {
      activeId.value = sessions.value[Math.min(index, sessions.value.length - 1)]!.id
    }
  }

  function renameSession(id: string, title: string) {
    const session = findSession(id)
    const trimmed = title.trim()
    if (session && trimmed) session.title = trimmed
  }

  function setModel(id: string, model: string) {
    const session = findSession(id)
    if (session) session.model = model
  }

  // ── Blocks inside a segment ─────────────────────────────────────────

  function addBlock(sessionId: string, segmentId: string, type: BlockType): Block | undefined {
    const segment = findSegment(sessionId, segmentId)
    if (!segment) return
    checkpoint(sessionId)
    segment.blocks.push(createBlock(type))
    return segment.blocks.at(-1)
  }

  function removeBlock(sessionId: string, segmentId: string, blockId: string) {
    const segment = findSegment(sessionId, segmentId)
    const index = segment?.blocks.findIndex(b => b.id === blockId) ?? -1
    if (index === -1) return
    checkpoint(sessionId)
    segment!.blocks.splice(index, 1)
  }

  function moveBlock(sessionId: string, segmentId: string, from: number, to: number) {
    const segment = findSegment(sessionId, segmentId)
    const length = segment?.blocks.length ?? 0
    if (!segment || from === to || from < 0 || to < 0 || from >= length || to >= length) return
    checkpoint(sessionId)
    segment.blocks = moveItem(segment.blocks, from, to)
  }

  function updateMessage(sessionId: string, segmentId: string, blockId: string, patch: Partial<Pick<MessageBlock, 'content' | 'role'>>) {
    const block = findBlock(sessionId, segmentId, blockId, 'message')
    if (!block) return
    checkpoint(sessionId, `block:${blockId}`)
    Object.assign(block, patch)
  }

  function setRole(sessionId: string, segmentId: string, blockId: string, role: MessageRole) {
    updateMessage(sessionId, segmentId, blockId, { role })
  }

  function setSnippets(sessionId: string, segmentId: string, blockId: string, items: SnippetItem[]) {
    const block = findBlock(sessionId, segmentId, blockId, 'snippets')
    if (!block) return
    checkpoint(sessionId, `block:${blockId}`)
    block.items = items
  }

  /** Writes a streamed reply. Not an undo step: the run that produced it is. */
  function streamMessage(sessionId: string, segmentId: string, blockId: string, content: string) {
    const block = findBlock(sessionId, segmentId, blockId, 'message')
    if (block) block.content = content
  }

  // ── Flow nodes and edges ────────────────────────────────────────────

  /** Adds a node at `position` (relative to `parentId`'s group). */
  function addNode<K extends NodeKind>(sessionId: string, kind: K, position: Position, parentId: string | null = null): NodeOf<K> | undefined {
    const flow = findFlow(sessionId)
    if (!flow) return
    checkpoint(sessionId)
    const parent = findFlowNode(flow, parentId)
    const key = uniqueKey(kind === 'set' ? 'vars' : kind, flow.nodes.map(n => n.key))
    const init: NodeInit = {
      key,
      title: DEFAULT_TITLES[kind],
      position: { x: Math.round(position.x), y: Math.round(position.y) },
      parentId: parent?.kind === 'group' ? parent.id : null
    }
    const node = createNode(kind, init as Parameters<typeof createNode<K>>[1])
    flow.nodes.push(node)
    return flow.nodes.at(-1) as NodeOf<K>
  }

  function updateNode(sessionId: string, nodeId: string, patch: NodePatch) {
    const flow = findFlow(sessionId)
    const node = findNode(sessionId, nodeId)
    if (!flow || !node) return
    checkpoint(sessionId, `node:${nodeId}:${Object.keys(patch).sort().join(',')}`)
    Object.assign(node, patch)
    // Removing a branch, or switching a Parallel node's mode, removes the edges from handles that are gone.
    if ('branches' in patch || 'mode' in patch) flow.edges = pruneEdges(flow)
    if ('memory' in patch && node.kind === 'memory' && node.memory !== 'store') {
      for (const other of flow.nodes) {
        if (other.kind === 'segment') other.memoryWrites = other.memoryWrites.filter(id => id !== nodeId)
      }
    }
  }

  /** Changes a node's template key. Returns `false` (and changes nothing) if it is invalid or taken. */
  function setKey(sessionId: string, nodeId: string, key: string): boolean {
    const flow = findFlow(sessionId)
    const node = findNode(sessionId, nodeId)
    const trimmed = key.trim()
    if (!flow || !node || !KEY_PATTERN.test(trimmed) || flow.nodes.some(n => n.id !== nodeId && n.key === trimmed)) return false
    if (node.key === trimmed) return true
    checkpoint(sessionId)
    node.key = trimmed
    return true
  }

  /** Moves a node into `parentId` (or out of all groups), keeping where it is on screen. */
  function reparent(flow: Flow, node: FlowNode, parentId: string | null) {
    const absolute = absolutePosition(flow, node)
    const parent = findFlowNode(flow, parentId)
    const origin = parent ? absolutePosition(flow, parent) : { x: 0, y: 0 }
    node.parentId = parent?.id ?? null
    node.position = { x: Math.round(absolute.x - origin.x), y: Math.round(absolute.y - origin.y) }
  }

  /**
   * Commits nodes dragged on the canvas (positions relative to their current
   * group), then moves each into the innermost group it was dropped in.
   */
  function moveNodes(sessionId: string, moves: { id: string, position: Position }[]) {
    const flow = findFlow(sessionId)
    if (!flow || !moves.length) return
    checkpoint(sessionId)
    const moved = new Set(moves.map(m => m.id))
    for (const { id, position } of moves) {
      const node = findFlowNode(flow, id)
      if (node) node.position = { x: Math.round(position.x), y: Math.round(position.y) }
    }
    for (const { id } of moves) {
      const node = findFlowNode(flow, id)
      // Nodes dragged together with their group stay in it.
      if (!node || (node.parentId && moved.has(node.parentId))) continue
      const { x, y } = absolutePosition(flow, node)
      const size = nodeSize(node)
      const target = groupAt(flow, { x: x + Math.min(size.width, CARD_SIZE.width) / 2, y: y + Math.min(size.height, CARD_SIZE.height) / 2 }, node)
      if ((target?.id ?? null) !== node.parentId) reparent(flow, node, target?.id ?? null)
    }
  }

  /** Takes a node out of its group, placing it just left of the group. */
  function moveOutOfGroup(sessionId: string, nodeId: string) {
    const flow = findFlow(sessionId)
    const node = findNode(sessionId, nodeId)
    const group = node && findFlowNode(flow!, node.parentId)
    if (!flow || !node || !group) return
    checkpoint(sessionId)
    node.parentId = group.parentId
    node.position = { x: group.position.x - nodeSize(node).width - GROUP_PADDING, y: group.position.y }
  }

  /** Resizing from the top or left edge also moves the group; its contents stay where they are on screen. */
  function resizeGroup(sessionId: string, groupId: string, box: Position & { width: number, height: number }) {
    const flow = findFlow(sessionId)
    const group = findNode(sessionId, groupId, 'group')
    if (!flow || !group) return
    const unchanged = Math.round(box.x) === group.position.x && Math.round(box.y) === group.position.y
      && Math.round(box.width) === group.width && Math.round(box.height) === group.height
    if (unchanged) return
    checkpoint(sessionId)
    const dx = Math.round(box.x - group.position.x)
    const dy = Math.round(box.y - group.position.y)
    group.position = { x: Math.round(box.x), y: Math.round(box.y) }
    group.width = Math.round(box.width)
    group.height = Math.round(box.height)
    if (dx || dy) {
      for (const child of flow.nodes) {
        if (child.parentId === groupId) child.position = { x: child.position.x - dx, y: child.position.y - dy }
      }
    }
  }

  /**
   * Removes nodes; removing a group removes everything inside it. The Start
   * node stays (it can't be added back from the palette), moved out of any
   * group being removed.
   */
  function removeNodes(sessionId: string, ids: readonly string[]) {
    const flow = findFlow(sessionId)
    if (!flow || !ids.length) return
    const doomed = new Set(ids)
    for (const id of ids) {
      if (findFlowNode(flow, id)?.kind === 'group') descendants(flow, id).forEach(node => doomed.add(node.id))
    }
    const starts = flow.nodes.filter(node => node.kind === 'start' && doomed.has(node.id))
    starts.forEach(node => doomed.delete(node.id))
    if (!flow.nodes.some(node => doomed.has(node.id))) return
    checkpoint(sessionId)
    for (const start of starts) {
      if (ancestors(flow, start).some(group => doomed.has(group.id))) reparent(flow, start, null)
    }
    flow.nodes = flow.nodes.filter(node => !doomed.has(node.id))
    flow.edges = flow.edges.filter(edge => !doomed.has(edge.source) && !doomed.has(edge.target))
    for (const node of flow.nodes) {
      if (node.kind === 'segment') node.memoryWrites = node.memoryWrites.filter(id => !doomed.has(id))
    }
  }

  /** Removes a group but keeps its contents, in the group's own parent. */
  function ungroup(sessionId: string, groupId: string) {
    const flow = findFlow(sessionId)
    const group = findNode(sessionId, groupId, 'group')
    if (!flow || !group) return
    checkpoint(sessionId)
    for (const child of flow.nodes.filter(node => node.parentId === groupId)) reparent(flow, child, group.parentId)
    flow.nodes = flow.nodes.filter(node => node.id !== groupId)
    flow.edges = flow.edges.filter(edge => edge.source !== groupId && edge.target !== groupId)
  }

  /** Wraps nodes in a new group sized around them. */
  function groupNodes(sessionId: string, ids: readonly string[]): NodeOf<'group'> | undefined {
    const flow = findFlow(sessionId)
    const nodes = ids.map(id => findFlowNode(flow!, id)).filter((node): node is FlowNode => !!node)
    if (!flow || !nodes.length) return
    // Only the outermost of the chosen nodes move; their contents come along.
    const chosen = new Set(nodes.map(node => node.id))
    const roots = nodes.filter(node => !ancestors(flow, node).some(group => chosen.has(group.id)))
    checkpoint(sessionId)
    const boxes = roots.map((node) => {
      const { x, y } = absolutePosition(flow, node)
      const size = nodeSize(node)
      return { x, y, right: x + size.width, bottom: y + size.height }
    })
    const left = Math.min(...boxes.map(b => b.x)) - GROUP_PADDING
    const top = Math.min(...boxes.map(b => b.y)) - GROUP_PADDING * 1.5
    const parentId = roots[0]!.parentId
    const parent = findFlowNode(flow, parentId)
    const origin = parent ? absolutePosition(flow, parent) : { x: 0, y: 0 }
    const group = createNode('group', {
      key: uniqueKey('group', flow.nodes.map(n => n.key)),
      position: { x: Math.round(left - origin.x), y: Math.round(top - origin.y) },
      parentId,
      width: Math.round(Math.max(...boxes.map(b => b.right)) + GROUP_PADDING - left),
      height: Math.round(Math.max(...boxes.map(b => b.bottom)) + GROUP_PADDING - top)
    })
    // Groups go first so they are drawn beneath their contents.
    flow.nodes.unshift(group)
    for (const node of roots) reparent(flow, node, group.id)
    return flow.nodes[0] as NodeOf<'group'>
  }

  /** Copies nodes (and anything inside copied groups) next to the originals. */
  function duplicateNodes(sessionId: string, ids: readonly string[]): FlowNode[] {
    const flow = findFlow(sessionId)
    if (!flow) return []
    const chosen = new Set(ids)
    for (const id of ids) {
      if (findFlowNode(flow, id)?.kind === 'group') descendants(flow, id).forEach(node => chosen.add(node.id))
    }
    // A flow has one Start.
    const originals = flow.nodes.filter(node => chosen.has(node.id) && node.kind !== 'start')
    if (!originals.length) return []
    checkpoint(sessionId)
    const { nodes, edges } = copyNodes(flow, originals, flow.nodes.map(n => n.key))
    for (const [i, node] of nodes.entries()) {
      // Copies inside a copied group keep their place in it.
      if (!originals.some(o => o.id === originals[i]!.parentId)) node.position = { x: node.position.x + 40, y: node.position.y + 40 }
      node.title = originals[i]!.title
    }
    flow.nodes.push(...nodes)
    flow.edges.push(...edges)
    return nodes
  }

  /** Connects two handles if the rules allow it. A flow output's previous edge is replaced. */
  function connect(sessionId: string, connection: Connection): boolean {
    const flow = findFlow(sessionId)
    if (!flow) return false
    const edges = connectEdges(flow, connection)
    if (!edges) return false
    checkpoint(sessionId)
    flow.edges = edges
    return true
  }

  function removeEdges(sessionId: string, ids: readonly string[]) {
    const flow = findFlow(sessionId)
    if (!flow || !flow.edges.some(edge => ids.includes(edge.id))) return
    checkpoint(sessionId)
    flow.edges = flow.edges.filter(edge => !ids.includes(edge.id))
  }

  function updateFlowSettings(sessionId: string, patch: Partial<FlowSettings>) {
    const flow = findFlow(sessionId)
    if (!flow) return
    checkpoint(sessionId, `settings:${Object.keys(patch).sort().join(',')}`)
    Object.assign(flow.settings, patch)
  }

  /** Replaces a session's flow, e.g. with a template. Can be undone. */
  function replaceFlow(sessionId: string, flow: Flow) {
    const session = findSession(sessionId)
    if (!session) return
    checkpoint(sessionId)
    session.flow = flow
  }

  /** Saves store-memory entries written during a run. Not an undo step. */
  function saveMemoryEntries(sessionId: string, entries: Record<string, string[]>) {
    for (const [id, list] of Object.entries(entries)) {
      const memory = findNode(sessionId, id, 'memory')
      if (memory) memory.entries = list
    }
  }

  // ── Sidebars and whole workspaces ───────────────────────────────────

  function setSidebar(side: SidebarSide, items: SnippetItem[]) {
    sidebars.value[side] = items
  }

  /** Replaces every session. Never leaves the workspace empty. */
  function replaceAll(next: Session[]) {
    histories.clear()
    historyVersion.value++
    sessions.value = next.length ? next : [createDefaultSession('Session 1', settings.defaultModel)]
    activeId.value = sessions.value[0]!.id
  }

  /** Replaces everything, e.g. after opening a file. */
  function restore(next: Workspace) {
    replaceAll(next.sessions)
    sidebars.value = next.sidebars
  }

  return {
    sessions,
    activeId,
    activeSession,
    sidebars,
    findSession,
    findFlow,
    findNode,
    findSegment,
    findBlock,
    checkpoint,
    undo,
    redo,
    canUndo,
    canRedo,
    select,
    addSession,
    duplicate,
    closeSession,
    renameSession,
    setModel,
    addBlock,
    removeBlock,
    moveBlock,
    updateMessage,
    setRole,
    setSnippets,
    streamMessage,
    addNode,
    updateNode,
    setKey,
    moveNodes,
    moveOutOfGroup,
    resizeGroup,
    removeNodes,
    ungroup,
    groupNodes,
    duplicateNodes,
    connect,
    removeEdges,
    updateFlowSettings,
    replaceFlow,
    saveMemoryEntries,
    setSidebar,
    replaceAll,
    restore
  }
})
