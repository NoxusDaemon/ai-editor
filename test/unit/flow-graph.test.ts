import { describe, expect, it } from 'vitest'
import { createBlock } from '~/lib/blocks'
import {
  absolutePosition,
  canConnect,
  cloneFlow,
  connectEdges,
  contextSources,
  groupAt,
  keyFromTitle,
  outputHandles,
  resolveSettings,
  sanitizeFlow,
  uniqueKey
} from '~/lib/flow/graph'
import { FLOW_TEMPLATES } from '~/lib/flow/templates'
import { createEdge, createFlowSettings, createNode, type Flow, type FlowNode } from '~/lib/flow/types'
import { hasErrors, validateFlow } from '~/lib/flow/validate'

const flowOf = (nodes: FlowNode[], edges: Flow['edges'] = [], settings = createFlowSettings()): Flow => ({ settings, nodes, edges })

describe('flow graph', () => {
  const start = createNode('start', { key: 'start' })
  const a = createNode('segment', { key: 'a' })
  const b = createNode('segment', { key: 'b' })
  const memory = createNode('memory', { key: 'm' })
  const group = createNode('group', { key: 'g' })

  it('allows flow edges into steps and context edges into segments and groups', () => {
    const flow = flowOf([start, a, b, memory, group])
    expect(canConnect(flow, { source: start.id, sourceHandle: 'out', target: a.id })).toBe(true)
    expect(canConnect(flow, { source: a.id, sourceHandle: 'out', target: start.id })).toBe(false)
    expect(canConnect(flow, { source: a.id, sourceHandle: 'out', target: a.id })).toBe(false)
    expect(canConnect(flow, { source: a.id, sourceHandle: 'nope', target: b.id })).toBe(false)
    expect(canConnect(flow, { source: memory.id, sourceHandle: 'ctx', target: group.id })).toBe(true)
    expect(canConnect(flow, { source: memory.id, sourceHandle: 'ctx', target: start.id })).toBe(false)
    expect(canConnect(flow, { source: start.id, sourceHandle: 'out', target: group.id })).toBe(false)
  })

  it('replaces the edge on a flow output when it is connected again', () => {
    const flow = flowOf([start, a, b], [createEdge(start.id, 'out', a.id)])
    const edges = connectEdges(flow, { source: start.id, sourceHandle: 'out', target: b.id })!
    expect(edges.map(e => e.target)).toEqual([b.id])
  })

  it('names condition handles after their branches', () => {
    const condition = createNode('condition', { key: 'c', branches: [{ id: 'x', label: 'Yes', expression: 'true' }, { id: 'y', label: '', expression: 'vars.n > 1' }] })
    expect(outputHandles(condition)).toEqual([{ id: 'x', label: 'Yes' }, { id: 'y', label: 'vars.n > 1' }, { id: 'else', label: 'Else' }])
  })

  it('inherits settings from the nearest group, then the flow', () => {
    const outer = createNode('group', { key: 'outer', model: 'outer-model', context: 'window', window: 3, ephemeral: true, system: 'Outer' })
    const inner = createNode('group', { key: 'inner', parentId: outer.id, temperature: 0.5, system: 'Inner' })
    const segment = createNode('segment', { key: 's', parentId: inner.id, maxTokens: 100 })
    const flow = flowOf([outer, inner, segment], [], createFlowSettings({ system: 'Flow', temperature: 0.9 }))
    expect(resolveSettings(flow, 'session-model', segment)).toEqual({
      model: 'outer-model',
      temperature: 0.5,
      maxTokens: 100,
      context: 'window',
      window: 3,
      ephemeral: true,
      system: ['Flow', 'Outer', 'Inner']
    })
    expect(resolveSettings(flowOf([b]), 'session-model', b)).toMatchObject({ model: 'session-model', context: 'conversation', ephemeral: false })
  })

  it('collects context from enclosing groups and context edges, outermost first', () => {
    const outer = createNode('group', { key: 'outer' })
    const inner = createNode('group', { key: 'inner', parentId: outer.id })
    const inOuter = createNode('memory', { key: 'in_outer', parentId: outer.id })
    const inInner = createNode('memory', { key: 'in_inner', parentId: inner.id })
    const linked = createNode('knowledge', { key: 'linked' })
    const elsewhere = createNode('memory', { key: 'elsewhere' })
    const segment = createNode('segment', { key: 's', parentId: inner.id })
    const flow = flowOf([outer, inner, inOuter, inInner, linked, elsewhere, segment], [
      createEdge(linked.id, 'ctx', segment.id),
      createEdge(inOuter.id, 'ctx', segment.id)
    ])
    expect(contextSources(flow, segment).map(n => n.key)).toEqual(['in_outer', 'in_inner', 'linked'])
  })

  it('works out positions and drop targets through nested groups', () => {
    const outer = createNode('group', { key: 'outer', position: { x: 100, y: 100 }, width: 500, height: 400 })
    const inner = createNode('group', { key: 'inner', parentId: outer.id, position: { x: 50, y: 50 }, width: 200, height: 200 })
    const node = createNode('segment', { key: 's', parentId: inner.id, position: { x: 10, y: 20 } })
    const flow = flowOf([outer, inner, node])
    expect(absolutePosition(flow, node)).toEqual({ x: 160, y: 170 })
    expect(groupAt(flow, { x: 200, y: 200 })?.key).toBe('inner')
    expect(groupAt(flow, { x: 500, y: 450 })?.key).toBe('outer')
    expect(groupAt(flow, { x: 10, y: 10 })).toBeNull()
    expect(groupAt(flow, { x: 200, y: 200 }, inner)?.key).toBe('outer')
    expect(groupAt(flow, { x: 200, y: 200 }, outer)).toBeNull()
  })

  it('makes unique keys', () => {
    expect(keyFromTitle('Draft reply!')).toBe('draft_reply')
    expect(keyFromTitle('2nd pass')).toBe('n_2nd_pass')
    expect(uniqueKey('segment', ['segment', 'segment2'])).toBe('segment3')
    expect(uniqueKey('draft', [])).toBe('draft')
  })

  it('clones flows with fresh ids, keeping edges, nesting and memory links', () => {
    const source = FLOW_TEMPLATES.find(t => t.id === 'chat')!.create()
    const copy = cloneFlow(source)
    const ids = new Set(source.nodes.map(n => n.id))
    expect(copy.nodes.some(n => ids.has(n.id))).toBe(false)
    expect(copy.edges).toHaveLength(source.edges.length)
    const copyIds = new Set(copy.nodes.map(n => n.id))
    expect(copy.edges.every(e => copyIds.has(e.source) && copyIds.has(e.target))).toBe(true)
    const remember = copy.nodes.find(n => n.key === 'remember')
    expect(remember?.kind === 'segment' && copyIds.has(remember.memoryWrites[0]!)).toBe(true)
  })

  it('repairs damaged flows', () => {
    const memory = createNode('memory', { key: 'notes' })
    const segment = createNode('segment', { key: 'bad key', parentId: 'missing', memoryWrites: [memory.id] })
    const loopA = createNode('group', { key: 'a' })
    const loopB = createNode('group', { key: 'a', parentId: loopA.id })
    loopA.parentId = loopB.id
    const repaired = sanitizeFlow(flowOf([start, segment, memory, loopA, loopB], [
      createEdge(start.id, 'out', segment.id),
      createEdge(start.id, 'out', memory.id),
      createEdge('ghost', 'out', segment.id)
    ]))
    const fixed = repaired.nodes.find(n => n.id === segment.id)!
    expect(fixed).toMatchObject({ key: 'bad_key', parentId: null, memoryWrites: [] })
    expect(repaired.nodes.filter(n => n.kind === 'group').map(n => n.key)).toEqual(['a', 'a2'])
    expect(repaired.nodes.filter(n => n.kind === 'group' && n.parentId === null)).not.toHaveLength(0)
    expect(repaired.edges).toHaveLength(1)
  })
})

describe('validateFlow', () => {
  it('passes every template', () => {
    for (const template of FLOW_TEMPLATES) {
      expect([template.id, validateFlow(template.create())]).toEqual([template.id, []])
    }
  })

  it('finds missing starts, bad expressions, schemas and keys', () => {
    const segment = createNode('segment', { key: 'seg', schema: '{ broken', blocks: [createBlock('user', '{{nodes.ghost.output}} {{vars.x +}}')] })
    const condition = createNode('condition', { key: 'seg', branches: [{ id: 'b', label: '', expression: '' }] })
    const knowledge = createNode('knowledge', { key: 'k', search: 'semantic' })
    const issues = validateFlow(flowOf([segment, condition, knowledge]))
    const messages = issues.map(issue => issue.message).join('\n')
    expect(hasErrors(issues)).toBe(true)
    expect(messages).toMatch(/Add a Start node/)
    expect(messages).toMatch(/schema is not valid JSON/)
    expect(messages).toMatch(/no node has that key/)
    expect(messages).toMatch(/\{\{vars.x \+\}\}/)
    expect(messages).toMatch(/Two nodes use the key “seg”/)
    expect(messages).toMatch(/case 1 is empty/)
    expect(messages).toMatch(/needs an embedding model/)
  })

  it('warns about unreachable nodes and cycles that never end', () => {
    const start = createNode('start', { key: 'start' })
    const a = createNode('set', { key: 'a', assignments: [] })
    const b = createNode('set', { key: 'b', assignments: [] })
    const orphan = createNode('segment', { key: 'orphan', blocks: [createBlock('user', 'x')] })
    const issues = validateFlow(flowOf([start, a, b, orphan], [createEdge(start.id, 'out', a.id), createEdge(a.id, 'out', b.id), createEdge(b.id, 'out', a.id)]))
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({ severity: 'warning', nodeId: orphan.id, message: expect.stringMatching(/never reached/) })
    expect(issues[1]).toMatchObject({ severity: 'warning', message: expect.stringMatching(/form a cycle/) })
    expect([a.id, b.id]).toContain(issues[1]!.nodeId)
  })
})
