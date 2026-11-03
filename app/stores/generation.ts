import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { createBatcher, STREAM_FLUSH_MS } from '~/lib/batch'
import { normalizeMessages } from '~/lib/flow/engine'
import { resolveSettings } from '~/lib/flow/graph'
import { renderTemplate } from '~/lib/flow/template'
import type { StartNode } from '~/lib/flow/types'
import { hasPrompt, planGeneration, type ChatMessage, type ContinueFrom } from '~/lib/workspace'
import { errorMessage, useServices } from '~/services/container'
import type { GenerateStats, ModelOption } from '~/services/llm'
import { useFlowRunStore } from './flowRun'
import { useSettingsStore } from './settings'
import { useWorkspaceStore } from './workspace'

export interface GenerationRun {
  status: 'running' | 'done' | 'stopped' | 'error'
  sessionId: string
  /** Assistant block receiving the reply. */
  blockId: string
  /** Model "thinking" output; shown live but never saved or sent back. */
  reasoning: string
  startedAt: number
  finishedAt?: number
  stats?: GenerateStats
  error?: string
}

/**
 * The segment playground: streams a reply into a segment's blocks, as the
 * classic editor did, with the model, sampling settings and system prompts the
 * segment inherits. Placeholders are filled in from the Start node's input and
 * the flow's last run. Also owns the model lists. Running whole flows is `flowRun`.
 */
export const useGenerationStore = defineStore('generation', () => {
  const workspace = useWorkspaceStore()
  const settings = useSettingsStore()
  const flowRun = useFlowRunStore()

  /** Latest run per segment id. Runtime-only state, never persisted. */
  const runs = ref<Record<string, GenerationRun>>({})
  const controllers = new Map<string, AbortController>()

  const models = ref<ModelOption[]>([])
  const embeddingModels = ref<ModelOption[]>([])
  const modelsStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const modelsError = ref<string | null>(null)

  const isRunning = (segmentId: string) => runs.value[segmentId]?.status === 'running'
  const isSessionBusy = (sessionId: string) =>
    Object.values(runs.value).some(run => run.sessionId === sessionId && run.status === 'running')

  async function loadModels() {
    if (modelsStatus.value === 'loading') return
    modelsStatus.value = 'loading'
    try {
      const { llm } = useServices()
      const [chat, embedding] = await Promise.all([llm.listModels('llm'), llm.listModels('embedding').catch(() => [])])
      models.value = chat
      embeddingModels.value = embedding
      modelsError.value = null
      modelsStatus.value = 'ready'
    } catch (error) {
      modelsError.value = `Could not reach LM Studio. ${errorMessage(error)}`
      modelsStatus.value = 'error'
    }
  }

  /**
   * Streams a reply into the segment: into its trailing assistant block (carrying
   * on any text already there), or a new one. `from` carries on an assistant
   * block from a point in its text instead, replacing what came after it.
   */
  async function send(sessionId: string, segmentId: string, from?: ContinueFrom) {
    const session = workspace.findSession(sessionId)
    const segment = workspace.findSegment(sessionId, segmentId)
    if (!session || !segment || isRunning(segmentId)) return
    const { llm, dialogs } = useServices()

    const plan = planGeneration(segment.blocks, from)
    if (!hasPrompt(plan)) {
      dialogs.notify({ title: 'Nothing to send', description: 'Write a system or user message first.', color: 'warning' })
      return
    }

    const { model, temperature, maxTokens, system } = resolveSettings(session.flow, session.model, segment)
    // What a run would have at this point: the input, and the variables and outputs of the last run.
    const last = flowRun.runs[sessionId]?.state
    const scope = {
      input: session.flow.nodes.find((node): node is StartNode => node.kind === 'start')?.input ?? '',
      vars: last?.vars ?? {},
      nodes: last?.nodes ?? {},
      last: null,
      error: null,
      memory: {},
      loop: null,
      branch: null
    }
    let messages: ChatMessage[]
    try {
      messages = normalizeMessages([
        ...system.map(content => ({ role: 'system' as const, content: renderTemplate(content, scope) })),
        ...plan.messages.map(message => ({ ...message, content: renderTemplate(message.content, scope) }))
      ])
    } catch (error) {
      dialogs.notify({ title: 'Could not fill in the placeholders', description: errorMessage(error), color: 'error' })
      return
    }

    const created = plan.targetBlockId === null
    const target = created
      ? workspace.addBlock(sessionId, segmentId, 'assistant')
      : workspace.findBlock(sessionId, segmentId, plan.targetBlockId!, 'message')
    if (target?.kind !== 'message') return
    // Cutting the reply at the caret (or clearing it to regenerate) is an edit of its own, so it can be undone.
    if (target.content !== plan.prefill) workspace.updateMessage(sessionId, segmentId, target.id, { content: plan.prefill })

    const controller = new AbortController()
    controllers.set(segmentId, controller)
    runs.value[segmentId] = { status: 'running', sessionId, blockId: target.id, reasoning: '', startedAt: Date.now() }
    const run = runs.value[segmentId]!

    let text = ''
    let reasoning = ''
    const batcher = createBatcher(() => {
      // Deleting the block mid-stream cancels the run.
      if (!workspace.findBlock(sessionId, segmentId, target.id, 'message')) return controller.abort()
      workspace.streamMessage(sessionId, segmentId, target.id, plan.prefill + text)
      run.reasoning = reasoning
    }, STREAM_FLUSH_MS)

    try {
      run.stats = await llm.generate({
        model,
        messages,
        ...(temperature !== null && { temperature }),
        ...(maxTokens !== null && { maxTokens }),
        ...(plan.prefill && { prefill: plan.prefill }),
        signal: controller.signal,
        onText: (delta) => {
          text += delta
          batcher.schedule()
        },
        onReasoning: (delta) => {
          reasoning += delta
          batcher.schedule()
        }
      })
      batcher.flush()
      run.status = controller.signal.aborted || run.stats.stopReason === 'userStopped' ? 'stopped' : 'done'
      if (model) settings.defaultModel = model
    } catch (error) {
      batcher.flush()
      if (controller.signal.aborted) {
        run.status = 'stopped'
      } else {
        run.status = 'error'
        run.error = errorMessage(error)
        dialogs.notify({ title: 'Generation failed', description: run.error, color: 'error' })
      }
      if (created && text === '') workspace.removeBlock(sessionId, segmentId, target.id)
    } finally {
      run.finishedAt = Date.now()
      controllers.delete(segmentId)
    }
  }

  function stop(segmentId: string) {
    controllers.get(segmentId)?.abort()
  }

  function toggle(sessionId: string, segmentId: string) {
    if (isRunning(segmentId)) stop(segmentId)
    else void send(sessionId, segmentId)
  }

  // A different server has different models.
  watch(() => settings.lmStudioUrl, () => {
    models.value = []
    embeddingModels.value = []
    modelsError.value = null
    modelsStatus.value = 'idle'
  })

  // Closing a tab, deleting a segment or opening another file cancels its generation.
  watch(() => workspace.sessions.flatMap(s => s.flow.nodes.filter(n => n.kind === 'segment').map(n => n.id)), (ids) => {
    const alive = new Set(ids)
    for (const [id, controller] of controllers) {
      if (!alive.has(id)) controller.abort()
    }
    runs.value = Object.fromEntries(Object.entries(runs.value).filter(([id]) => alive.has(id)))
  })

  return { runs, models, embeddingModels, modelsStatus, modelsError, isRunning, isSessionBusy, loadModels, send, stop, toggle }
})
