import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { createBatcher } from '~/lib/batch'
import { hasPrompt, planGeneration } from '~/lib/workspace'
import { errorMessage, useServices } from '~/services/container'
import type { GenerateStats, ModelOption } from '~/services/llm'
import { useSettingsStore } from './settings'
import { useWorkspaceStore } from './workspace'

export interface GenerationRun {
  status: 'running' | 'done' | 'stopped' | 'error'
  /** Assistant block receiving the reply. */
  blockId: string
  /** Model "thinking" output; shown live but never saved or sent back. */
  reasoning: string
  startedAt: number
  finishedAt?: number
  stats?: GenerateStats
  error?: string
}

export const STREAM_FLUSH_MS = 50

/** Talking to the model: model list, streaming replies, cancellation. */
export const useGenerationStore = defineStore('generation', () => {
  const workspace = useWorkspaceStore()
  const settings = useSettingsStore()

  /** Latest run per session id. Runtime-only state, never persisted. */
  const runs = ref<Record<string, GenerationRun>>({})
  const controllers = new Map<string, AbortController>()

  const models = ref<ModelOption[]>([])
  const modelsStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const modelsError = ref<string | null>(null)

  const isRunning = (sessionId: string) => runs.value[sessionId]?.status === 'running'

  async function loadModels() {
    if (modelsStatus.value === 'loading') return
    modelsStatus.value = 'loading'
    try {
      models.value = await useServices().llm.listModels()
      modelsError.value = null
      modelsStatus.value = 'ready'
    } catch (error) {
      modelsError.value = `Could not reach LM Studio. ${errorMessage(error)}`
      modelsStatus.value = 'error'
    }
  }

  async function send(sessionId: string) {
    const session = workspace.findSession(sessionId)
    if (!session || isRunning(sessionId)) return
    const { llm, dialogs } = useServices()

    const plan = planGeneration(session)
    if (!hasPrompt(plan)) {
      dialogs.notify({ title: 'Nothing to send', description: 'Write a system or user message first.', color: 'warning' })
      return
    }

    const created = plan.targetBlockId === null
    const target = created
      ? workspace.addBlock(sessionId, 'assistant')
      : workspace.findBlock(sessionId, plan.targetBlockId!, 'message')
    if (!target) return

    const controller = new AbortController()
    controllers.set(sessionId, controller)
    runs.value[sessionId] = { status: 'running', blockId: target.id, reasoning: '', startedAt: Date.now() }
    const run = runs.value[sessionId]!

    let text = ''
    let reasoning = ''
    const batcher = createBatcher(() => {
      // Deleting the block mid-stream cancels the run.
      if (!workspace.findBlock(sessionId, target.id, 'message')) return controller.abort()
      workspace.updateMessage(sessionId, target.id, { content: text })
      run.reasoning = reasoning
    }, STREAM_FLUSH_MS)

    try {
      run.stats = await llm.generate({
        model: session.model,
        messages: plan.messages,
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
      if (session.model) settings.defaultModel = session.model
    } catch (error) {
      batcher.flush()
      if (controller.signal.aborted) {
        run.status = 'stopped'
      } else {
        run.status = 'error'
        run.error = errorMessage(error)
        dialogs.notify({ title: 'Generation failed', description: run.error, color: 'error' })
      }
      if (created && text === '') workspace.removeBlock(sessionId, target.id)
    } finally {
      run.finishedAt = Date.now()
      controllers.delete(sessionId)
    }
  }

  function stop(sessionId: string) {
    controllers.get(sessionId)?.abort()
  }

  function toggle(sessionId: string) {
    if (isRunning(sessionId)) stop(sessionId)
    else void send(sessionId)
  }

  // A different server has different models.
  watch(() => settings.lmStudioUrl, () => {
    models.value = []
    modelsError.value = null
    modelsStatus.value = 'idle'
  })

  // Closing a tab or opening another file cancels that session's generation.
  watch(() => workspace.sessions.map(s => s.id), (ids) => {
    const alive = new Set(ids)
    for (const [id, controller] of controllers) {
      if (!alive.has(id)) controller.abort()
    }
    runs.value = Object.fromEntries(Object.entries(runs.value).filter(([id]) => alive.has(id)))
  })

  return { runs, models, modelsStatus, modelsError, isRunning, loadModels, send, stop, toggle }
})
