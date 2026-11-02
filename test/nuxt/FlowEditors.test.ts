import { beforeEach, describe, expect, it } from 'vitest'
import FlowConditionEditor from '~/components/flow/FlowConditionEditor.vue'
import FlowJoinEditor from '~/components/flow/FlowJoinEditor.vue'
import FlowNodeFocus from '~/components/flow/FlowNodeFocus.vue'
import FlowParallelEditor from '~/components/flow/FlowParallelEditor.vue'
import FlowSetEditor from '~/components/flow/FlowSetEditor.vue'
import type { FlowNode } from '~/lib/flow/types'
import { useWorkspaceStore } from '~/stores/workspace'
import { mountInApp } from './mount'

function setup() {
  const workspace = useWorkspaceStore()
  workspace.replaceAll([])
  const session = workspace.activeSession
  const node = <K extends FlowNode['kind']>(kind: K) => workspace.addNode(session.id, kind, { x: 0, y: 0 })!
  return { workspace, session, node }
}

describe('flow editors', () => {
  beforeEach(() => {
    useWorkspaceStore().replaceAll([])
  })

  it('edits condition cases and checks their expressions', async () => {
    const { workspace, session, node } = setup()
    const condition = node('condition')
    const wrapper = await mountInApp(FlowConditionEditor, { sessionId: session.id, node: condition })

    await wrapper.get('[data-testid=add-branch]').trigger('click')
    expect(workspace.findNode(session.id, condition.id, 'condition')!.branches).toHaveLength(2)

    const expression = wrapper.findAll('[data-testid=condition-branch] input')[1]!
    await expression.setValue('vars.score >')
    expect(wrapper.text()).toContain('Expected a value')
    await expression.setValue('vars.score > 3')
    expect(workspace.findNode(session.id, condition.id, 'condition')!.branches[0]!.expression).toBe('vars.score > 3')
    expect(wrapper.text()).not.toContain('Expected a value')
  })

  it('edits variables', async () => {
    const { workspace, session, node } = setup()
    const set = node('set')
    const wrapper = await mountInApp(FlowSetEditor, { sessionId: session.id, node: set })

    const [name, expression] = wrapper.get('[data-testid=assignment]').findAll('input')
    await name!.setValue('state')
    await expression!.setValue('"review"')

    expect(workspace.findNode(session.id, set.id, 'set')!.assignments[0]).toMatchObject({ name: 'state', expression: '"review"' })
  })

  it('edits a Parallel node’s branches, mode and concurrency', async () => {
    const { workspace, session, node } = setup()
    const fan = node('parallel')
    const wrapper = await mountInApp(FlowParallelEditor, { sessionId: session.id, node: fan })
    const current = () => workspace.findNode(session.id, fan.id, 'parallel')!

    await wrapper.get('[data-testid=add-parallel-branch]').trigger('click')
    expect(current().branches.map(b => b.label)).toEqual(['Branch 1', 'Branch 2', 'Branch 3'])

    await wrapper.findAll('[data-testid=parallel-branch] input')[0]!.setValue('Critic A')
    expect(current().branches[0]!.label).toBe('Critic A')
    expect(wrapper.text()).toContain('.critic_a')

    await wrapper.get('input[data-testid=parallel-concurrency]').setValue('0')
    expect(current().concurrency).toBe(1)
  })

  it('explains what a Join collects', async () => {
    const { workspace, session, node } = setup()
    const fan = node('parallel')
    const meet = node('join')
    workspace.connect(session.id, { source: fan.id, sourceHandle: fan.branches[0]!.id, target: meet.id })
    const wrapper = await mountInApp(FlowJoinEditor, { sessionId: session.id, node: meet })

    expect(wrapper.text()).toContain('Joins the branches of “Parallel”')
    expect(wrapper.text()).toContain('{{nodes.join.output.branch_1}}')
  })

  it('opens a segment with its messages, settings and a schema check', async () => {
    const { workspace, session } = setup()
    const segment = session.flow.nodes.find(n => n.kind === 'segment')!
    const wrapper = await mountInApp(FlowNodeFocus, { sessionId: session.id, node: segment })

    expect(wrapper.findAll('[data-testid=message-block]')).toHaveLength(3)
    expect(wrapper.find('[data-testid=snippets-block]').exists()).toBe(true)

    await wrapper.get('textarea[data-testid=segment-schema]').setValue('{ not json')
    expect(wrapper.text()).toContain('The schema is not valid JSON')

    await wrapper.get('[data-testid=node-title]').setValue('Greeter')
    expect(workspace.findNode(session.id, segment.id)!.title).toBe('Greeter')

    const key = wrapper.get('input[data-testid=node-key]')
    await key.setValue('greeter')
    await key.trigger('blur')
    expect(workspace.findNode(session.id, segment.id)!.key).toBe('greeter')
  })
})
