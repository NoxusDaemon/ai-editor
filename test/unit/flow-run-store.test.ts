import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { FLOW_TEMPLATES } from '~/lib/flow/templates'
import type { GenerateRequest } from '~/services/llm'
import { useFlowRunStore } from '~/stores/flowRun'
import { useWorkspaceStore } from '~/stores/workspace'
import { createFakeServices } from './fakes'

function setup() {
  const services = createFakeServices()
  const workspace = useWorkspaceStore()
  const flowRun = useFlowRunStore()
  return { ...services, workspace, flowRun }
}

const template = (id: string) => FLOW_TEMPLATES.find(t => t.id === id)!

describe('flow run store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('runs the flow from Start and keeps the steps, conversation and output', async () => {
    const { llm, workspace, flowRun } = setup()
    const session = workspace.addSession(template('conversation'))
    const start = session.flow.nodes.find(n => n.kind === 'start')!
    workspace.updateNode(session.id, start.id, { input: 'Hello there' })
    llm.generate.mockImplementation(async ({ onText }: GenerateRequest) => {
      onText('General ')
      onText('Kenobi')
      return { stopReason: 'eosFound' }
    })

    expect(await flowRun.run(session.id)).toBe(true)

    const run = flowRun.runs[session.id]!
    expect(run).toMatchObject({ status: 'done', input: 'Hello there', output: 'General Kenobi' })
    expect(llm.generate).toHaveBeenCalledWith(expect.objectContaining({ messages: [{ role: 'user', content: 'Hello there' }] }))
    expect(run.steps.map(s => [s.kind, s.status])).toEqual([['start', 'done'], ['segment', 'done'], ['end', 'done']])
    expect(run.steps[1]!.text).toBe('General Kenobi')
    expect(run.state.transcript.map(m => m.content)).toEqual(['Hello there', 'General Kenobi'])
    expect(flowRun.nodeStates(session.id).get(run.steps[1]!.nodeId)).toMatchObject({ status: 'done', visits: 1 })
  })

  it('refuses to run a flow with errors, saying what is wrong', async () => {
    const { llm, dialogs, workspace, flowRun } = setup()
    const session = workspace.activeSession
    const start = session.flow.nodes.find(n => n.kind === 'start')!
    workspace.removeNodes(session.id, [start.id])

    expect(await flowRun.run(session.id)).toBe(false)

    expect(llm.generate).not.toHaveBeenCalled()
    expect(dialogs.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fix 1 problem before running', color: 'error' }))
  })

  it('asks the user through the dialog and saves memory written during the run', async () => {
    const { llm, dialogs, workspace, flowRun } = setup()
    const session = workspace.addSession(template('chat'))
    const answers = ['I live in Leeds', 'bye']
    dialogs.prompt.mockImplementation(async () => answers.shift() ?? null)
    llm.generate.mockImplementation(async ({ messages, onText }: GenerateRequest) => {
      onText(messages.at(-1)!.content.includes('one short fact') ? 'Lives in Leeds.' : 'Nice!')
      return { stopReason: 'eosFound' }
    })

    await flowRun.run(session.id)

    expect(dialogs.prompt).toHaveBeenCalledTimes(2)
    expect(dialogs.prompt).toHaveBeenCalledWith(expect.objectContaining({ title: 'You', submitLabel: 'Continue' }))
    expect(flowRun.runs[session.id]!.status).toBe('done')
    const facts = workspace.findSession(session.id)!.flow.nodes.find(n => n.key === 'facts')!
    expect(facts.kind === 'memory' && facts.entries).toEqual(['Lives in Leeds.'])
  })

  it('stops a running flow', async () => {
    const { llm, workspace, flowRun } = setup()
    const session = workspace.activeSession
    llm.generate.mockImplementation(({ signal }: GenerateRequest) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))

    const running = flowRun.run(session.id)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(flowRun.isRunning(session.id)).toBe(true)
    flowRun.toggle(session.id)
    await running

    expect(flowRun.runs[session.id]!.status).toBe('stopped')
  })

  it('works on a copy, so editing the flow mid-run changes nothing in it', async () => {
    const { llm, workspace, flowRun } = setup()
    const session = workspace.activeSession
    const segment = session.flow.nodes.find(n => n.kind === 'segment')!
    llm.generate.mockImplementation(async ({ messages }: GenerateRequest) => {
      workspace.removeNodes(session.id, [segment.id])
      expect(messages.at(-1)!.content).toBe('Who are you, and what can you do?')
      return { stopReason: 'eosFound' }
    })

    await flowRun.run(session.id)

    expect(flowRun.runs[session.id]!.status).toBe('done')
  })

  it('reuses embeddings between runs', async () => {
    const { llm, workspace, flowRun } = setup()
    const session = workspace.addSession(template('rag'))
    const knowledge = session.flow.nodes.find(n => n.kind === 'knowledge')!
    workspace.updateNode(session.id, knowledge.id, { search: 'semantic', embeddingModel: 'embedder' })
    llm.generate.mockImplementation(async ({ jsonSchema, onText }: GenerateRequest) => {
      onText(jsonSchema ? '{"query":"password"}' : 'Answer')
      return { stopReason: 'eosFound' }
    })

    await flowRun.run(session.id)
    await flowRun.run(session.id)

    expect(flowRun.runs[session.id]!.status).toBe('done')
    expect(llm.embed).toHaveBeenCalledTimes(1)
  })
})
