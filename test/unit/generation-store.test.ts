import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createConversationFlow } from '~/lib/flow/templates'
import { createBlock, createSession, type MessageBlock } from '~/lib/workspace'
import type { GenerateRequest } from '~/services/llm'
import { useGenerationStore } from '~/stores/generation'
import { useSettingsStore } from '~/stores/settings'
import { useWorkspaceStore } from '~/stores/workspace'
import { createFakeServices } from './fakes'

function setup() {
  const services = createFakeServices()
  const workspace = useWorkspaceStore()
  const generation = useGenerationStore()
  const session = workspace.activeSession
  const segment = session.flow.nodes.find(n => n.kind === 'segment')!
  const messages = () => workspace.findSegment(session.id, segment.id)!.blocks.filter((b): b is MessageBlock => b.kind === 'message')
  return { ...services, workspace, generation, session, segment, messages }
}

/** A generate() that streams the given fragments and then waits to be aborted, like a long reply. */
function streamUntilAborted(fragments: string[]) {
  return async ({ onText, signal }: GenerateRequest) => {
    fragments.forEach(onText)
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    return { stopReason: 'userStopped' }
  }
}

describe('generation store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('streams the reply into the empty assistant block', async () => {
    const { llm, generation, session, segment, messages } = setup()
    llm.generate.mockImplementation(async ({ onText }) => {
      onText('Hello')
      onText(', world')
      return { stopReason: 'eosFound', tokensPerSecond: 42, predictedTokens: 3 }
    })

    await generation.send(session.id, segment.id)

    expect(llm.generate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: 'Who are you, and what can you do?' }]
    }))
    expect(messages().at(-1)).toMatchObject({ role: 'assistant', content: 'Hello, world' })
    expect(generation.runs[segment.id]).toMatchObject({ status: 'done', stats: { tokensPerSecond: 42 } })
  })

  it('fills in placeholders and adds the system prompts the segment inherits', async () => {
    const { llm, workspace, generation, session, segment, messages } = setup()
    const start = session.flow.nodes.find(n => n.kind === 'start')!
    workspace.updateNode(session.id, start.id, { input: 'Ada' })
    workspace.updateFlowSettings(session.id, { system: 'Be brief.' })
    const group = workspace.groupNodes(session.id, [segment.id])!
    workspace.updateNode(session.id, group.id, { system: 'Talking to {{input}}.' })
    workspace.updateMessage(session.id, segment.id, messages().find(m => m.role === 'user')!.id, { content: 'Greet {{upper(input)}}' })

    await generation.send(session.id, segment.id)

    expect(llm.generate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'system', content: 'Be brief.\n\nTalking to Ada.' }, { role: 'user', content: 'Greet ADA' }]
    }))
  })

  it('refuses to send a placeholder it cannot fill in', async () => {
    const { llm, dialogs, workspace, generation, session, segment, messages } = setup()
    workspace.updateMessage(session.id, segment.id, messages().find(m => m.role === 'user')!.id, { content: 'Hi {{input +}}' })
    const before = messages().length

    await generation.send(session.id, segment.id)

    expect(llm.generate).not.toHaveBeenCalled()
    expect(dialogs.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not fill in the placeholders' }))
    expect(messages()).toHaveLength(before)
  })

  it('appends a new assistant block when the conversation ends with a user message', async () => {
    const { llm, workspace, generation, session, segment, messages } = setup()
    const assistant = messages().at(-1)!
    workspace.updateMessage(session.id, segment.id, assistant.id, { content: 'Earlier reply' })
    const followUp = workspace.addBlock(session.id, segment.id, 'user')!
    workspace.updateMessage(session.id, segment.id, followUp.id, { content: 'And then?' })
    llm.generate.mockImplementation(async ({ onText }) => {
      onText('Then this.')
      return { stopReason: 'eosFound' }
    })

    await generation.send(session.id, segment.id)

    expect(messages().map(m => [m.role, m.content]).slice(-3)).toEqual([
      ['assistant', 'Earlier reply'],
      ['user', 'And then?'],
      ['assistant', 'Then this.']
    ])
  })

  it('keeps model reasoning out of the saved reply', async () => {
    const { llm, generation, session, segment, messages } = setup()
    llm.generate.mockImplementation(async ({ onText, onReasoning }) => {
      onReasoning?.('Let me think…')
      onText('Answer')
      return { stopReason: 'eosFound' }
    })

    await generation.send(session.id, segment.id)

    expect(messages().at(-1)!.content).toBe('Answer')
    expect(generation.runs[segment.id]!.reasoning).toBe('Let me think…')
  })

  it('refuses to send when there is no prompt', async () => {
    const { llm, dialogs, workspace, generation } = setup()
    const empty = createSession({ flow: createConversationFlow([createBlock('assistant')]) })
    workspace.replaceAll([empty])

    await generation.send(empty.id, empty.flow.nodes[1]!.id)

    expect(llm.generate).not.toHaveBeenCalled()
    expect(dialogs.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nothing to send' }))
  })

  it('reports failures and removes the empty block it created', async () => {
    const { llm, dialogs, workspace, generation, session, segment, messages } = setup()
    workspace.removeBlock(session.id, segment.id, messages().at(-1)!.id) // conversation now ends with the user
    llm.generate.mockRejectedValue(new Error('LM Studio is not reachable'))

    await generation.send(session.id, segment.id)

    expect(messages().at(-1)!.role).toBe('user')
    expect(generation.runs[segment.id]).toMatchObject({ status: 'error', error: 'LM Studio is not reachable' })
    expect(dialogs.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Generation failed', color: 'error' }))
  })

  it('stops on request and keeps what was generated so far', async () => {
    const { llm, generation, session, segment, messages } = setup()
    llm.generate.mockImplementation(streamUntilAborted(['Once upon', ' a time']))

    const sending = generation.send(session.id, segment.id)
    expect(generation.isRunning(segment.id)).toBe(true)
    generation.toggle(session.id, segment.id)
    await sending

    expect(generation.runs[segment.id]!.status).toBe('stopped')
    expect(messages().at(-1)!.content).toBe('Once upon a time')
  })

  it('cancels the run when its session is closed', async () => {
    const { llm, workspace, generation, session, segment } = setup()
    let signal: AbortSignal | undefined
    llm.generate.mockImplementation(async (request) => {
      signal = request.signal
      return streamUntilAborted([])(request)
    })

    const sending = generation.send(session.id, segment.id)
    workspace.addSession()
    workspace.closeSession(session.id)
    await sending

    expect(signal?.aborted).toBe(true)
    expect(generation.runs[segment.id]).toBeUndefined()
  })

  it('remembers the model for new sessions', async () => {
    const { workspace, generation, session, segment } = setup()
    workspace.setModel(session.id, 'qwen3-8b')

    await generation.send(session.id, segment.id)

    expect(useSettingsStore().defaultModel).toBe('qwen3-8b')
    expect(workspace.addSession().model).toBe('qwen3-8b')
  })

  it('loads the model list and reports connection problems', async () => {
    const { llm, generation } = setup()
    llm.listModels.mockResolvedValueOnce([{ label: 'Qwen', value: 'qwen' }])
    await generation.loadModels()
    expect(generation).toMatchObject({ modelsStatus: 'ready', models: [{ value: 'qwen' }] })

    llm.listModels.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    await generation.loadModels()
    expect(generation.modelsStatus).toBe('error')
    expect(generation.modelsError).toContain('ECONNREFUSED')
  })
})
