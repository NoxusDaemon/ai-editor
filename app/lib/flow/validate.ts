/**
 * Checks a flow before it runs: errors stop a run, warnings point at things
 * that are probably mistakes. Shown on the canvas as the flow is edited.
 */
import { checkExpression, referencedPaths } from './expression'
import { branchLabel, branchPaths, findNode, hasFlowInput, isContextEdge, joinOf, KEY_PATTERN, nextEdge } from './graph'
import { parseSchema } from './json-schema'
import { checkTemplate, templateExpressions } from './template'
import type { Flow, FlowNode } from './types'

export interface FlowIssue {
  severity: 'error' | 'warning'
  message: string
  nodeId?: string
}

/** Every template a node has, with a name for messages. */
function templatesOf(node: FlowNode): [string, string][] {
  switch (node.kind) {
    case 'segment':
      return node.blocks.flatMap((block, i) => block.kind === 'message' ? [[`message ${i + 1}`, block.content] as [string, string]] : [])
    case 'ask':
      return [['question', node.prompt]]
    case 'end':
      return [['output', node.output]]
    case 'memory':
      return [['notes', node.content], ['query', node.query]]
    case 'knowledge':
      return [['query', node.query], ['instructions', node.instructions]]
    case 'group':
      return [['system prompt', node.system]]
    default:
      return []
  }
}

/** Every expression a node has. */
function expressionsOf(node: FlowNode): [string, string][] {
  switch (node.kind) {
    case 'condition':
      return node.branches.map((branch, i) => [`case ${i + 1}`, branch.expression])
    case 'loop':
      if (node.mode === 'while') return [['condition', node.condition]]
      if (node.mode === 'forEach') return [['items', node.items]]
      return []
    case 'set':
      return node.assignments.filter(a => a.name.trim()).map(a => [a.name.trim(), a.expression])
    case 'parallel':
      return node.mode === 'map' ? [['items', node.items]] : []
    default:
      return []
  }
}

/** Groups of nodes that can reach each other (Tarjan's strongly connected components). */
function cycles(flow: Flow): string[][] {
  const next = new Map<string, string[]>()
  for (const edge of flow.edges) {
    if (!isContextEdge(edge)) next.set(edge.source, [...next.get(edge.source) ?? [], edge.target])
  }
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const found: string[][] = []

  const visit = (id: string) => {
    index.set(id, counter)
    low.set(id, counter++)
    stack.push(id)
    onStack.add(id)
    for (const target of next.get(id) ?? []) {
      if (!index.has(target)) {
        visit(target)
        low.set(id, Math.min(low.get(id)!, low.get(target)!))
      } else if (onStack.has(target)) {
        low.set(id, Math.min(low.get(id)!, index.get(target)!))
      }
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = []
      let member: string
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== id)
      if (component.length > 1 || next.get(id)?.includes(id)) found.push(component)
    }
  }
  for (const node of flow.nodes) if (!index.has(node.id)) visit(node.id)
  return found
}

export function validateFlow(flow: Flow): FlowIssue[] {
  const issues: FlowIssue[] = []
  const add = (severity: FlowIssue['severity'], message: string, node?: FlowNode) =>
    issues.push({ severity, message, ...(node && { nodeId: node.id }) })
  const name = (node: FlowNode) => `“${node.title.trim() || node.key}”`

  const starts = flow.nodes.filter(node => node.kind === 'start')
  if (!starts.length) add('error', 'Add a Start node to say where a run begins.')
  starts.slice(1).forEach(node => add('error', 'A flow can only have one Start node.', node))

  const keys = new Map<string, FlowNode>()
  for (const node of flow.nodes) {
    if (!KEY_PATTERN.test(node.key)) add('error', `${name(node)} has an invalid key “${node.key}”: use letters, digits and _.`, node)
    else if (keys.has(node.key)) add('error', `Two nodes use the key “${node.key}”.`, node)
    keys.set(node.key, node)
  }

  // Reachability from Start along flow edges.
  const reachable = new Set<string>()
  const queue = starts.slice(0, 1).map(node => node.id)
  while (queue.length) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const edge of flow.edges) if (edge.source === id && !isContextEdge(edge)) queue.push(edge.target)
  }

  for (const node of flow.nodes) {
    if (starts.length && hasFlowInput(node) && !reachable.has(node.id)) add('warning', `${name(node)} is never reached from Start.`, node)

    for (const [part, text] of templatesOf(node)) {
      for (const problem of checkTemplate(text)) add('error', `${name(node)}, ${part}: ${problem}`, node)
      for (const expression of templateExpressions(text)) {
        for (const path of referencedPaths(expression)) {
          if (path[0] === 'nodes' && path[1] && !keys.has(path[1])) add('warning', `${name(node)} refers to nodes.${path[1]}, but no node has that key.`, node)
        }
      }
    }
    for (const [part, expression] of expressionsOf(node)) {
      if (!expression.trim()) {
        add('error', `${name(node)}: ${part} is empty.`, node)
        continue
      }
      const error = checkExpression(expression)
      if (error) add('error', `${name(node)}, ${part}: ${error}`, node)
      for (const path of referencedPaths(expression)) {
        if (path[0] === 'nodes' && path[1] && !keys.has(path[1])) add('warning', `${name(node)} refers to nodes.${path[1]}, but no node has that key.`, node)
      }
    }

    switch (node.kind) {
      case 'segment': {
        if (node.schema.trim()) {
          const parsed = parseSchema(node.schema)
          if (!parsed.ok) add('error', `${name(node)}: ${parsed.error}`, node)
        }
        if (node.generate && !node.blocks.some(b => b.kind === 'message' && b.role !== 'system' && b.content.trim()) && node.context === 'isolated') {
          add('warning', `${name(node)} has no messages and doesn't see the conversation, so there is nothing to reply to.`, node)
        }
        if (node.saveAs.trim() && !KEY_PATTERN.test(node.saveAs.trim())) add('error', `${name(node)}: “${node.saveAs}” is not a valid variable name.`, node)
        for (const id of node.memoryWrites) {
          const target = findNode(flow, id)
          if (target?.kind !== 'memory' || target.memory !== 'store') add('error', `${name(node)} writes to a memory that is not a store memory.`, node)
        }
        break
      }
      case 'condition':
        if (!node.branches.length) add('warning', `${name(node)} has no cases, so it always takes “Else”.`, node)
        break
      case 'loop':
        if (!flow.edges.some(edge => edge.source === node.id && edge.sourceHandle === 'body')) add('warning', `${name(node)} has nothing connected to “Each time”.`, node)
        break
      case 'set':
        for (const assignment of node.assignments) {
          if (assignment.name.trim() && !KEY_PATTERN.test(assignment.name.trim())) add('error', `${name(node)}: “${assignment.name}” is not a valid variable name.`, node)
        }
        break
      case 'ask':
        if (node.saveAs.trim() && !KEY_PATTERN.test(node.saveAs.trim())) add('error', `${name(node)}: “${node.saveAs}” is not a valid variable name.`, node)
        break
      case 'parallel': {
        if (node.mode === 'branches') {
          if (!node.branches.length) add('warning', `${name(node)} has no branches.`, node)
          node.branches.forEach((branch, i) => {
            if (!nextEdge(flow, node.id, branch.id)) add('warning', `${name(node)}: branch “${branchLabel(branch, i)}” has nothing connected.`, node)
          })
        } else if (!nextEdge(flow, node.id, 'each')) {
          add('warning', `${name(node)} has nothing connected to “Each item”.`, node)
        }
        const { joins, ends } = branchPaths(flow, node)
        if (joins.length > 1) add('error', `${name(node)}'s branches lead to different Joins (${joins.map(name).join(', ')}). They must all meet at one.`, node)
        else if (!joins.length) add('warning', `${name(node)}'s branches don't meet at a Join, so the run ends when they finish.`, node)
        for (const end of ends) add('error', `A branch of ${name(node)} can reach ${name(end)}. Branches can't end the run: lead them to a Join.`, node)
        break
      }
      case 'join':
        if (!flow.nodes.some(other => other.kind === 'parallel' && joinOf(flow, other)?.id === node.id)) {
          add('warning', `No Parallel node's branches meet at ${name(node)}, so it only passes the run on.`, node)
        }
        break
      case 'knowledge':
        if (node.search !== 'keyword' && !node.embeddingModel.trim()) add('error', `${name(node)} uses ${node.search} search, which needs an embedding model.`, node)
        if (!node.documents.some(doc => doc.text.trim())) add('warning', `${name(node)} has no documents.`, node)
        if (!flow.edges.some(edge => edge.source === node.id) && !node.parentId) add('warning', `${name(node)} isn't connected to a segment or inside a group, so nothing uses it.`, node)
        break
      case 'memory':
        if (!flow.edges.some(edge => edge.source === node.id) && !node.parentId && !flow.nodes.some(n => n.kind === 'segment' && n.memoryWrites.includes(node.id))) {
          add('warning', `${name(node)} isn't connected to a segment or inside a group, so nothing uses it.`, node)
        }
        break
    }
  }

  for (const component of cycles(flow)) {
    const members = component.map(id => findNode(flow, id)!).filter(Boolean)
    if (!members.some(node => node.kind === 'condition' || node.kind === 'loop' || node.kind === 'ask')) {
      add('warning', `${members.map(name).join(' → ')} form a cycle with no condition, loop or question, so it only ends at the step limit.`, members[0])
    }
  }
  return issues
}

export const hasErrors = (issues: readonly FlowIssue[]): boolean => issues.some(issue => issue.severity === 'error')
