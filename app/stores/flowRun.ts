import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { createBatcher, STREAM_FLUSH_MS } from '~/lib/batch'
import { runFlow, type RunDeps, type RunEvent, type RunSnapshot, type RunStep } from '~/lib/flow/engine'
import type { Flow, StartNode } from '~/lib/flow/types'
import { hasErrors, validateFlow } from '~/lib/flow/validate'
import { errorMessage, useServices } from '~/services/container'
import { useSettingsStore } from './settings'
import { useWorkspaceStore } from './workspace'

export interface FlowRun {
  sessionId: string
  status: 'running' | 'done' | 'stopped' | 'error'
  input: string
  startedAt: number
  finishedAt?: number
  steps: RunStep[]
  state: RunSnapshot
  output?: unknown
  error?: string
  /** Ask node waiting for an answer. */
  waitingNodeId: string | null
}

export interface NodeRunState {
  status: RunStep['status']
  visits: number
  step: RunStep
}

/** Embedding vectors kept between runs, so unchanged documents aren't embedded again. */
export const EMBEDDING_CACHE_LIMIT = 20_000

/** Running whole flows: the engine wired to LM Studio, the Ask dialog, and the run panel's state. */
export const useFlowRunStore = defineStore('flowRun', () => {
  const workspace = useWorkspaceStore()
  const settings = useSettingsStore()

  /** Latest run per session id. Runtime-only state, never persisted. */
  const runs = ref<Record<string, FlowRun>>({})
  const controllers = new Map<string, AbortController>()
  const embeddings = new Map<string, number[]>()

  const isRunning = (sessionId: string) => runs.value[sessionId]?.status === 'running'

  /**
   * Each node's latest step in the session's last run. A node that is running in
   * one Parallel branch shows as running even if it has since started in another.
   */
  function nodeStates(sessionId: string): Map<string, NodeRunState> {
    const states = new Map<string, NodeRunState>()
    for (const step of runs.value[sessionId]?.steps ?? []) {
      const previous = states.get(step.nodeId)
      const shown = previous?.status === 'running' && step.status !== 'running' ? previous.step : step
      states.set(step.nodeId, { status: shown.status, visits: (previous?.visits ?? 0) + 1, step: shown })
    }
    return states
  }

  /** Embeds texts, reusing vectors from earlier runs and test searches. */
  async function embed(model: string, texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const key = (text: string) => `${model}\u0000${text}`
    const missing = [...new Set(texts.filter(text => !embeddings.has(key(text))))]
    if (missing.length) {
      const vectors = await useServices().llm.embed(model, missing, signal)
      missing.forEach((text, i) => embeddings.set(key(text), vectors[i]!))
      for (const oldest of embeddings.keys()) {
        if (embeddings.size <= EMBEDDING_CACHE_LIMIT) break
        embeddings.delete(oldest)
      }
    }
    return texts.map(text => embeddings.get(key(text))!)
  }

  /** Runs the session's flow from its Start node. Returns `false` if it couldn't start. */
  async function run(sessionId: string): Promise<boolean> {
    const session = workspace.findSession(sessionId)
    if (!session || isRunning(sessionId)) return false
    const { llm, dialogs } = useServices()

    const issues = validateFlow(session.flow)
    if (hasErrors(issues)) {
      const errors = issues.filter(issue => issue.severity === 'error')
      dialogs.notify({
        title: errors.length === 1 ? 'Fix 1 problem before running' : `Fix ${errors.length} problems before running`,
        description: errors[0]!.message,
        color: 'error'
      })
      return false
    }

    // The run works on a copy, so editing the flow meanwhile doesn't change it halfway.
    const flow: Flow = JSON.parse(JSON.stringify(session.flow))
    const input = flow.nodes.find((node): node is StartNode => node.kind === 'start')?.input ?? ''
    const controller = new AbortController()
    controllers.set(sessionId, controller)
    runs.value[sessionId] = {
      sessionId,
      status: 'running',
      input,
      startedAt: Date.now(),
      steps: [],
      state: { vars: {}, nodes: {}, transcript: [] },
      waitingNodeId: null
    }
    const current = runs.value[sessionId]!

    // Streamed text is buffered and written to the steps every STREAM_FLUSH_MS.
    const pending = new Map<string, { text: string, reasoning: string }>()
    const batcher = createBatcher(() => {
      for (const [id, delta] of pending) {
        const step = current.steps[Number(id)]
        if (!step) continue
        step.text = (step.text ?? '') + delta.text
        step.reasoning = (step.reasoning ?? '') + delta.reasoning
      }
      pending.clear()
    }, STREAM_FLUSH_MS)

    const onEvent = (event: RunEvent) => {
      switch (event.type) {
        case 'step':
          batcher.flush()
          current.steps.push(event.step)
          break
        case 'delta': {
          if (event.reset) {
            batcher.flush()
            const step = current.steps[Number(event.stepId)]
            if (step) Object.assign(step, { text: '', reasoning: '' })
            break
          }
          const buffered = pending.get(event.stepId) ?? { text: '', reasoning: '' }
          buffered.text += event.text ?? ''
          buffered.reasoning += event.reasoning ?? ''
          pending.set(event.stepId, buffered)
          batcher.schedule()
          break
        }
        case 'update': {
          batcher.flush()
          const step = current.steps[Number(event.stepId)]
          if (step) Object.assign(step, event.patch)
          break
        }
        case 'state':
          current.state = event.state
          break
      }
    }

    const deps: RunDeps = {
      generate: call => llm.generate(call),
      embed,
      ask: async ({ nodeId, title, prompt, signal }) => {
        current.waitingNodeId = nodeId
        try {
          return await dialogs.prompt({ title, description: prompt || undefined, submitLabel: 'Continue', signal })
        } finally {
          current.waitingNodeId = null
        }
      },
      onEvent
    }

    try {
      const result = await runFlow({ flow, model: session.model, input, signal: controller.signal }, deps)
      batcher.flush()
      Object.assign(current, {
        status: result.status,
        output: result.output,
        error: result.error,
        state: { vars: result.vars, nodes: result.nodes, transcript: result.transcript }
      })
      if (Object.keys(result.memory).length) workspace.saveMemoryEntries(sessionId, result.memory)
      if (result.status === 'error') dialogs.notify({ title: 'Run failed', description: result.error, color: 'error' })
      if (result.status === 'done' && session.model) settings.defaultModel = session.model
    } catch (error) {
      batcher.flush()
      current.status = 'error'
      current.error = errorMessage(error)
      dialogs.notify({ title: 'Run failed', description: current.error, color: 'error' })
    } finally {
      current.finishedAt = Date.now()
      controllers.delete(sessionId)
    }
    return true
  }

  function stop(sessionId: string) {
    controllers.get(sessionId)?.abort()
  }

  function toggle(sessionId: string) {
    if (isRunning(sessionId)) stop(sessionId)
    else void run(sessionId)
  }

  function clear(sessionId: string) {
    if (!isRunning(sessionId)) runs.value = Object.fromEntries(Object.entries(runs.value).filter(([id]) => id !== sessionId))
  }

  // A different server may have different embedding models.
  watch(() => settings.lmStudioUrl, () => embeddings.clear())

  // Closing a tab or opening another file stops its run.
  watch(() => workspace.sessions.map(s => s.id), (ids) => {
    const alive = new Set(ids)
    for (const [id, controller] of controllers) {
      if (!alive.has(id)) controller.abort()
    }
    runs.value = Object.fromEntries(Object.entries(runs.value).filter(([id]) => alive.has(id)))
  })

  return { runs, isRunning, nodeStates, embed, run, stop, toggle, clear }
})
