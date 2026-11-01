/**
 * Graph rules and queries: which handles a node has, which connections are
 * allowed, group nesting, inherited settings, context sources, copying and
 * repairing flows.
 */
import { copyBlocks, createId } from '../blocks'
import {
  createEdge,
  isContextNode,
  type ContextMode,
  type ContextNode,
  type Flow,
  type FlowEdge,
  type FlowNode,
  type GroupNode,
  type NodeKind,
  type Position,
  type SegmentNode
} from './types'

export const FLOW_INPUT = 'in'
export const CONTEXT_HANDLE = 'ctx'

/** Approximate size of a node card, for working out which group a node was dropped in. */
export const CARD_SIZE = { width: 256, height: 96 }

export interface OutputHandle {
  id: string
  label: string
}

/** Kinds that are steps of a run (have a flow input). */
const FLOW_STEP_KINDS: ReadonlySet<NodeKind> = new Set(['segment', 'condition', 'loop', 'set', 'ask', 'end'])

export const hasFlowInput = (node: FlowNode): boolean => FLOW_STEP_KINDS.has(node.kind)
export const acceptsContext = (node: FlowNode): boolean => node.kind === 'segment' || node.kind === 'group'
export const isContextEdge = (edge: Pick<FlowEdge, 'sourceHandle'>): boolean => edge.sourceHandle === CONTEXT_HANDLE

/** A node's output handles, in the order they are drawn. */
export function outputHandles(node: FlowNode): OutputHandle[] {
  switch (node.kind) {
    case 'start':
    case 'set':
    case 'ask':
      return [{ id: 'out', label: '' }]
    case 'segment':
      return [{ id: 'out', label: '' }, { id: 'error', label: 'On error' }]
    case 'condition':
      return [
        ...node.branches.map((branch, i) => ({ id: branch.id, label: branch.label.trim() || branch.expression.trim() || `Case ${i + 1}` })),
        { id: 'else', label: 'Else' }
      ]
    case 'loop':
      return [{ id: 'body', label: 'Each time' }, { id: 'done', label: 'Done' }]
    case 'memory':
    case 'knowledge':
      return [{ id: CONTEXT_HANDLE, label: '' }]
    default:
      return []
  }
}

export const findNode = (flow: Flow, id: string | null | undefined): FlowNode | undefined =>
  id ? flow.nodes.find(node => node.id === id) : undefined

export interface Connection {
  source: string
  sourceHandle: string
  target: string
  targetHandle?: string | null
}

/** Whether a connection follows the rules: flow outputs go to flow inputs, context outputs to segments and groups. */
export function canConnect(flow: Flow, connection: Connection): boolean {
  const source = findNode(flow, connection.source)
  const target = findNode(flow, connection.target)
  if (!source || !target || source.id === target.id) return false
  if (!outputHandles(source).some(handle => handle.id === connection.sourceHandle)) return false
  if (connection.sourceHandle === CONTEXT_HANDLE) {
    if (!acceptsContext(target) || (connection.targetHandle && connection.targetHandle !== CONTEXT_HANDLE)) return false
    return !flow.edges.some(edge => edge.source === source.id && edge.target === target.id && isContextEdge(edge))
  }
  if (!hasFlowInput(target) || (connection.targetHandle && connection.targetHandle !== FLOW_INPUT)) return false
  return true
}

/**
 * The edges after making a connection. A flow output leads to one place, so a
 * new connection from it replaces the old one. Returns `null` if not allowed.
 */
export function connectEdges(flow: Flow, connection: Connection): FlowEdge[] | null {
  if (!canConnect(flow, connection)) return null
  const edges = isContextEdge(connection)
    ? flow.edges
    : flow.edges.filter(edge => !(edge.source === connection.source && edge.sourceHandle === connection.sourceHandle))
  return [...edges, createEdge(connection.source, connection.sourceHandle, connection.target)]
}

/** The flow edge leaving `nodeId` through `handle`. */
export const nextEdge = (flow: Flow, nodeId: string, handle: string): FlowEdge | undefined =>
  flow.edges.find(edge => edge.source === nodeId && edge.sourceHandle === handle && !isContextEdge(edge))

/** Groups around a node, innermost first. */
export function ancestors(flow: Flow, node: FlowNode): GroupNode[] {
  const chain: GroupNode[] = []
  const seen = new Set([node.id])
  let parent = findNode(flow, node.parentId)
  while (parent?.kind === 'group' && !seen.has(parent.id)) {
    chain.push(parent)
    seen.add(parent.id)
    parent = findNode(flow, parent.parentId)
  }
  return chain
}

/** Everything inside a group, at any depth. */
export function descendants(flow: Flow, groupId: string): FlowNode[] {
  return flow.nodes.filter(node => node.id !== groupId && ancestors(flow, node).some(group => group.id === groupId))
}

export function absolutePosition(flow: Flow, node: FlowNode): Position {
  return ancestors(flow, node).reduce((pos, group) => ({ x: pos.x + group.position.x, y: pos.y + group.position.y }), { ...node.position })
}

export const nodeSize = (node: FlowNode) => node.kind === 'group' ? { width: node.width, height: node.height } : CARD_SIZE

/** The innermost group whose box contains `point`, skipping `exclude` and anything inside it. */
export function groupAt(flow: Flow, point: Position, exclude?: FlowNode): GroupNode | null {
  let best: GroupNode | null = null
  let bestDepth = -1
  for (const node of flow.nodes) {
    if (node.kind !== 'group' || node.id === exclude?.id) continue
    const chain = ancestors(flow, node)
    if (exclude && chain.some(group => group.id === exclude.id)) continue
    const { x, y } = absolutePosition(flow, node)
    if (point.x < x || point.y < y || point.x > x + node.width || point.y > y + node.height) continue
    if (chain.length > bestDepth) {
      best = node
      bestDepth = chain.length
    }
  }
  return best
}

export interface ResolvedSettings {
  model: string
  temperature: number | null
  maxTokens: number | null
  context: ContextMode
  window: number
  ephemeral: boolean
  /** System prompts from the flow and enclosing groups, outermost first. */
  system: string[]
}

/** The settings a segment runs with: its own, else the nearest group's, else the flow's (and the session's model). */
export function resolveSettings(flow: Flow, defaultModel: string, segment: SegmentNode): ResolvedSettings {
  const groups = ancestors(flow, segment)
  const chain = [segment, ...groups]
  const contextSource = chain.find(level => level.context !== 'inherit')
  return {
    model: chain.find(level => level.model.trim())?.model.trim() ?? defaultModel,
    temperature: chain.find(level => level.temperature !== null)?.temperature ?? flow.settings.temperature,
    maxTokens: chain.find(level => level.maxTokens !== null)?.maxTokens ?? flow.settings.maxTokens,
    context: (contextSource?.context as ContextMode | undefined) ?? flow.settings.context,
    window: contextSource?.window ?? flow.settings.window,
    ephemeral: chain.find(level => level.ephemeral !== null)?.ephemeral ?? false,
    system: [flow.settings.system, ...groups.toReversed().map(group => group.system)].filter(text => text.trim() !== '')
  }
}

/**
 * Memories and knowledge a segment gets: those inside any group around it, then
 * those connected to it or to one of those groups. Outermost first, no repeats.
 */
export function contextSources(flow: Flow, segment: SegmentNode): ContextNode[] {
  const groups = ancestors(flow, segment).toReversed()
  const scopes = [...groups.map(group => group.id), segment.id]
  const sources: ContextNode[] = []
  const add = (node: FlowNode | undefined) => {
    if (node && isContextNode(node) && !sources.includes(node)) sources.push(node)
  }
  for (const scope of scopes) {
    flow.nodes.filter(node => node.parentId === scope).forEach(add)
    flow.edges.filter(edge => edge.target === scope && isContextEdge(edge)).forEach(edge => add(findNode(flow, edge.source)))
  }
  return sources
}

export const KEY_PATTERN = /^[A-Za-z_]\w*$/

/** Turns a title into a template key: "Draft reply" → "draft_reply". */
export function keyFromTitle(title: string): string {
  const key = title.trim().toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/\W+/g, '_').replace(/^_+|_+$/g, '')
  return /^\d/.test(key) ? `n_${key}` : key || 'node'
}

/** `base`, or `base2`, `base3`, … whichever is free. */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const stem = KEY_PATTERN.test(base) ? base : keyFromTitle(base)
  if (!used.has(stem)) return stem
  const root = stem.replace(/\d+$/, '') || stem
  let n = 2
  while (used.has(`${root}${n}`)) n++
  return `${root}${n}`
}

/** Copies nodes with fresh ids, keeping the edges, nesting and memory links among them. */
export function copyNodes(flow: Flow, nodes: readonly FlowNode[], taken: Iterable<string> = []): { nodes: FlowNode[], edges: FlowEdge[] } {
  const ids = new Map(nodes.map(node => [node.id, createId()]))
  const keys = new Set(taken)
  const copies = nodes.map((node) => {
    const key = uniqueKey(node.key, keys)
    keys.add(key)
    // Through JSON rather than structuredClone, which can't copy Vue's reactive proxies.
    const copy = JSON.parse(JSON.stringify(node)) as FlowNode
    copy.id = ids.get(node.id)!
    copy.key = key
    copy.parentId = node.parentId && ids.has(node.parentId) ? ids.get(node.parentId)! : node.parentId
    if (copy.kind === 'segment') {
      copy.blocks = copyBlocks(copy.blocks)
      copy.memoryWrites = copy.memoryWrites.map(id => ids.get(id) ?? id)
    }
    return copy
  })
  const edges = flow.edges
    .filter(edge => ids.has(edge.source) && ids.has(edge.target))
    .map(edge => ({ ...edge, id: createId(), source: ids.get(edge.source)!, target: ids.get(edge.target)! }))
  return { nodes: copies, edges }
}

/** Deep copy of a whole flow with fresh ids. */
export function cloneFlow(flow: Flow): Flow {
  const { nodes, edges } = copyNodes(flow, flow.nodes)
  return { settings: { ...flow.settings }, nodes, edges }
}

/** Drops edges that no longer fit the nodes (removed nodes or condition branches, wrong kinds). */
export function pruneEdges(flow: Flow): FlowEdge[] {
  const used = new Set<string>()
  const kept: FlowEdge[] = []
  for (const edge of flow.edges) {
    const scratch = { ...flow, edges: kept }
    if (!canConnect(scratch, edge)) continue
    if (!isContextEdge(edge)) {
      const slot = `${edge.source}\u0000${edge.sourceHandle}`
      if (used.has(slot)) continue
      used.add(slot)
    }
    kept.push(edge)
  }
  return kept
}

/**
 * Repairs a flow read from a file: unique valid keys, groups that exist and
 * don't contain themselves, edges that follow the rules, memory links to store
 * memories only.
 */
export function sanitizeFlow(flow: Flow): Flow {
  const keys = new Set<string>()
  const nodes = flow.nodes.map((node) => {
    const key = uniqueKey(KEY_PATTERN.test(node.key) ? node.key : keyFromTitle(node.key || node.title), keys)
    keys.add(key)
    return { ...node, key }
  })
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent?.kind !== 'group') node.parentId = null
  }
  // Break nesting cycles (a group inside itself).
  for (const node of nodes) {
    const seen = new Set([node.id])
    let parent = node.parentId ? byId.get(node.parentId) : undefined
    while (parent) {
      if (seen.has(parent.id)) {
        node.parentId = null
        break
      }
      seen.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
  }
  const stores = new Set(nodes.filter(node => node.kind === 'memory' && node.memory === 'store').map(node => node.id))
  for (const node of nodes) {
    if (node.kind === 'segment') node.memoryWrites = node.memoryWrites.filter(id => stores.has(id))
  }
  const repaired = { ...flow, nodes }
  return { ...repaired, edges: pruneEdges(repaired) }
}
