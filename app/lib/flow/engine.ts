/**
 * Runs a flow. A small interpreter walks the graph from Start one node at a
 * time, like a state machine: each node does its work and names the output
 * handle to leave by; the edge on that handle decides what runs next. The run
 * ends at an End node, at a handle with nothing connected, or when stopped.
 *
 * Everything the run can see is in its scope:
 *   input       the run's input
 *   vars        variables (Set and Ask nodes, segments' "save as")
 *   nodes.<key> { output, text, visits, error } for every node that has run
 *   last        the output of the previous step
 *   loop        { index, iteration, item, total } of the loop being run
 *   memory.<key> the current text of each memory
 *   error       the latest error, on a segment's "On error" path
 *
 * Side effects (the model, embeddings, asking the user) come in through
 * `RunDeps`, so the engine has no I/O of its own and is fully unit-tested.
 */
import { isMessage, type ChatMessage, type GenerateStats, type MessageRole } from '../blocks'
import { evaluate, formatValue, truthy } from './expression'
import { contextSources, findNode, nextEdge, resolveSettings, type ResolvedSettings } from './graph'
import { extractJson, parseSchema, validateJson } from './json-schema'
import { buildChunks, formatContext, searchChunks, terms, bm25, type Chunk, type RetrievalHit } from './retrieval'
import { renderTemplate, renderValue } from './template'
import type {
  AskNode,
  ConditionNode,
  EndNode,
  Flow,
  FlowEdge,
  FlowNode,
  KnowledgeNode,
  LoopNode,
  MemoryNode,
  NodeKind,
  SegmentNode,
  SetNode
} from './types'

export interface GenerateCall {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  /** Ask for JSON matching this schema (constrained decoding where the model supports it). */
  jsonSchema?: object
  signal: AbortSignal
  onText: (delta: string) => void
  onReasoning?: (delta: string) => void
}

export interface AskRequest {
  nodeId: string
  title: string
  prompt: string
}

export interface RunDeps {
  generate(call: GenerateCall): Promise<GenerateStats>
  embed?(model: string, texts: string[], signal: AbortSignal): Promise<number[][]>
  /** Resolves to `null` if the person declines, which stops the run. */
  ask?(request: AskRequest): Promise<string | null>
  onEvent?(event: RunEvent): void
  now?(): number
}

export interface RunInput {
  flow: Flow
  /** Model for segments and groups that don't choose one. */
  model: string
  input: string
  signal: AbortSignal
}

export interface TranscriptMessage extends ChatMessage {
  /** Segment or Ask node the message came from. */
  nodeId: string
}

export interface NodeResult {
  output: unknown
  text: string
  visits: number
  error: string | null
}

export type StepStatus = 'running' | 'done' | 'error' | 'stopped'

/** One node run: what went in, what came out. Shown in the run panel. */
export interface RunStep {
  id: string
  nodeId: string
  kind: NodeKind
  title: string
  /** How many times the node has run, including this time. */
  visit: number
  status: StepStatus
  startedAt: number
  finishedAt?: number
  /** Summary, e.g. the branch taken or the loop iteration. */
  detail?: string
  /** Output handle the run left by. */
  handle?: string
  model?: string
  /** Exactly what was sent to the model (last attempt). */
  messages?: ChatMessage[]
  text?: string
  reasoning?: string
  output?: unknown
  attempts?: number
  hits?: RetrievalHit[]
  stats?: GenerateStats
  error?: string
}

export interface RunSnapshot {
  vars: Record<string, unknown>
  nodes: Record<string, NodeResult>
  transcript: TranscriptMessage[]
}

export type RunEvent
  = | { type: 'step', step: RunStep }
    | { type: 'delta', stepId: string, text?: string, reasoning?: string, reset?: boolean }
    | { type: 'update', stepId: string, patch: Partial<RunStep> }
    | { type: 'state', state: RunSnapshot }

export interface RunResult extends RunSnapshot {
  status: 'done' | 'stopped' | 'error'
  output: unknown
  error?: string
  steps: RunStep[]
  /** Entries of store memories with "keep between runs" on, to save back into the flow. */
  memory: Record<string, string[]>
}

/** A problem with the flow itself, reported to the user as is. */
export class FlowError extends Error {
  override name = 'FlowError'
}

class StoppedError extends Error {
  override name = 'StoppedError'
}

const MAX_STORED_ENTRIES = 1000

interface LoopState {
  index: number
  items?: unknown[]
}

/** Joins consecutive messages from the same role, which many chat templates require. Drops empty ones. */
export function normalizeMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = []
  for (const message of messages) {
    const content = message.content.trim()
    if (!content) continue
    const previous = merged.at(-1)
    if (previous?.role === message.role) previous.content = `${previous.content}\n\n${content}`
    else merged.push({ role: message.role, content })
  }
  return merged
}

const ROLE_NAMES: Record<MessageRole, string> = { system: 'System', user: 'User', assistant: 'Assistant' }

export const formatTranscript = (messages: readonly ChatMessage[]): string =>
  messages.map(m => `${ROLE_NAMES[m.role]}: ${m.content}`).join('\n\n')

export function schemaInstructions(schema: object): string {
  return `Reply with only a JSON value that matches this JSON Schema, with no other text:\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``
}

const label = (node: FlowNode) => node.title.trim() || node.key

export async function runFlow({ flow, model, input, signal }: RunInput, deps: RunDeps): Promise<RunResult> {
  const now = deps.now ?? Date.now
  const steps: RunStep[] = []
  /** Reports an event, keeping the steps returned at the end up to date too (step ids are their index). */
  const emit = (event: RunEvent) => {
    if (event.type === 'update') Object.assign(steps[Number(event.stepId)]!, event.patch)
    deps.onEvent?.(event)
  }

  const transcript: TranscriptMessage[] = []
  const vars: Record<string, unknown> = {}
  const results: Record<string, NodeResult> = {}
  const loops = new Map<string, LoopState>()
  const loopStack: string[] = []
  const memory = new Map<string, string[]>()
  const chunkCache = new Map<string, Chunk[]>()
  const vectorCache = new Map<string, number[]>()
  let last: unknown = null
  let lastError: string | null = null

  for (const node of flow.nodes) {
    if (node.kind === 'memory' && node.memory === 'store') memory.set(node.id, [...node.entries])
  }

  const throwIfStopped = () => {
    if (signal.aborted) throw new StoppedError('Stopped')
  }

  function memoryText(node: MemoryNode): string {
    if (node.memory === 'notes') return node.content
    if (node.memory === 'buffer') return formatTranscript(transcript.slice(-Math.max(1, node.window)))
    return (memory.get(node.id) ?? []).slice(-Math.max(1, node.limit)).map(entry => `- ${entry}`).join('\n')
  }

  function scope(): Record<string, unknown> {
    const top = loopStack.at(-1)
    const state = top ? loops.get(top) : undefined
    const loopNode = top ? findNode(flow, top) as LoopNode | undefined : undefined
    const memoryScope: Record<string, string> = {}
    for (const node of flow.nodes) if (node.kind === 'memory') memoryScope[node.key] = memoryText(node)
    return {
      input,
      vars,
      nodes: results,
      last,
      error: lastError,
      memory: memoryScope,
      loop: state && loopNode
        ? {
            index: state.index,
            iteration: state.index + 1,
            item: state.items?.[state.index] ?? null,
            total: state.items ? state.items.length : loopNode.mode === 'count' ? loopNode.count : null
          }
        : null
    }
  }

  function record(node: FlowNode, output: unknown, text = formatValue(output)) {
    const previous = results[node.key]
    results[node.key] = { output, text, visits: (previous?.visits ?? 0) + 1, error: null }
    last = output
  }

  /** Embeds texts with the knowledge node's model, reusing vectors already computed in this run. */
  async function embedTexts(modelKey: string, texts: string[]): Promise<number[][]> {
    if (!deps.embed) throw new FlowError('Semantic search needs an embedding model, which is not available.')
    const missing = [...new Set(texts.filter(text => !vectorCache.has(`${modelKey}\u0000${text}`)))]
    if (missing.length) {
      const vectors = await deps.embed(modelKey, missing, signal)
      missing.forEach((text, i) => vectorCache.set(`${modelKey}\u0000${text}`, vectors[i]!))
    }
    return texts.map(text => vectorCache.get(`${modelKey}\u0000${text}`)!)
  }

  async function retrieve(node: KnowledgeNode, s: Record<string, unknown>, hits: RetrievalHit[]): Promise<string> {
    const query = renderTemplate(node.query || '{{input}}', s).trim()
    let chunks = chunkCache.get(node.id)
    if (!chunks) {
      chunks = buildChunks(node.documents, node.chunkSize, node.chunkOverlap)
      chunkCache.set(node.id, chunks)
    }
    if (node.search !== 'keyword' && !node.embeddingModel.trim()) {
      throw new FlowError(`"${label(node)}" uses ${node.search} search but has no embedding model.`)
    }
    const found = await searchChunks(chunks, query, {
      mode: node.search,
      topK: node.topK,
      minScore: node.minScore,
      diversify: node.diversify,
      embed: texts => embedTexts(node.embeddingModel.trim(), texts)
    })
    hits.push(...found.map(hit => ({ ...hit, source: `${label(node)} › ${hit.source}` })))
    return formatContext(found, renderTemplate(node.instructions, s))
  }

  function recall(node: MemoryNode, s: Record<string, unknown>): string {
    let body: string
    if (node.memory === 'notes') {
      body = renderTemplate(node.content, s)
    } else if (node.memory === 'buffer') {
      body = memoryText(node)
    } else {
      const entries = memory.get(node.id) ?? []
      const limit = Math.max(1, node.limit)
      let chosen = entries.slice(-limit)
      if (node.recall === 'relevant' && entries.length > limit) {
        const scores = bm25(terms(renderTemplate(node.query || '{{input}}', s)), entries.map(entry => terms(entry)))
        chosen = scores
          .map((score, index) => ({ score, index }))
          .sort((a, b) => b.score - a.score || b.index - a.index)
          .slice(0, limit)
          .sort((a, b) => a.index - b.index)
          .map(({ index }) => entries[index]!)
      }
      body = chosen.map(entry => `- ${entry}`).join('\n')
    }
    return body.trim() ? `## ${label(node)}\n${body.trim()}` : ''
  }

  function history(settings: ResolvedSettings): ChatMessage[] {
    const messages = transcript.map(({ role, content }) => ({ role, content }))
    if (settings.context === 'isolated') return []
    if (settings.context === 'window') return messages.slice(-Math.max(1, settings.window))
    return messages
  }

  async function runSegment(node: SegmentNode, step: RunStep): Promise<string> {
    const settings = resolveSettings(flow, model, node)
    const s = scope()
    const system = settings.system.map(text => renderTemplate(text, s))
    const injected: ChatMessage[] = []
    const hits: RetrievalHit[] = []
    for (const source of contextSources(flow, node)) {
      const text = source.kind === 'memory' ? recall(source, s) : await retrieve(source, s, hits)
      throwIfStopped()
      if (!text) continue
      if (source.placement === 'system') system.push(text)
      else injected.push({ role: 'user', content: text })
    }

    const own = node.blocks.filter(isMessage).map(block => ({ role: block.role, content: renderTemplate(block.content, s) }))
    system.push(...own.filter(m => m.role === 'system').map(m => m.content))
    const turns = normalizeMessages(own.filter(m => m.role !== 'system'))

    let schema: Record<string, unknown> | null = null
    if (node.schema.trim()) {
      const parsed = parseSchema(node.schema)
      if (!parsed.ok) throw new FlowError(`"${label(node)}": ${parsed.error}`)
      schema = parsed.schema
      if (node.generate) system.push(schemaInstructions(schema))
    }

    let messages = normalizeMessages([
      { role: 'system', content: system.join('\n\n') },
      ...history(settings),
      ...injected,
      ...turns
    ])
    emit({ type: 'update', stepId: step.id, patch: { model: settings.model || 'Loaded model', messages, hits } })

    let output: unknown
    let text: string
    if (!node.generate) {
      text = turns.at(-1)?.content ?? ''
      output = text
    } else {
      if (!messages.some(m => m.role !== 'system')) {
        throw new FlowError(`"${label(node)}" has nothing to send: add a user message, or give it the conversation as context.`)
      }
      const attempts = 1 + (schema ? Math.max(0, Math.floor(node.retries)) : 0)
      let attempt = 0
      for (;;) {
        attempt++
        let reply = ''
        let reasoning = ''
        if (attempt > 1) emit({ type: 'delta', stepId: step.id, reset: true })
        const stats = await deps.generate({
          model: settings.model,
          messages,
          ...(settings.temperature !== null && { temperature: settings.temperature }),
          ...(settings.maxTokens !== null && { maxTokens: settings.maxTokens }),
          ...(schema && { jsonSchema: schema }),
          signal,
          onText: (delta) => {
            reply += delta
            emit({ type: 'delta', stepId: step.id, text: delta })
          },
          onReasoning: (delta) => {
            reasoning += delta
            emit({ type: 'delta', stepId: step.id, reasoning: delta })
          }
        })
        throwIfStopped()
        emit({ type: 'update', stepId: step.id, patch: { stats, attempts: attempt, text: reply, reasoning } })
        text = reply
        if (!schema) {
          output = reply
          break
        }
        const json = extractJson(reply)
        const problems = json.ok ? validateJson(json.value, schema) : [json.error]
        if (!problems.length) {
          output = json.ok ? json.value : null
          break
        }
        if (attempt >= attempts) {
          throw new FlowError(`"${label(node)}" replied with JSON that doesn't match its schema: ${problems.slice(0, 3).join('; ')}`)
        }
        messages = [
          ...messages,
          { role: 'assistant', content: reply },
          { role: 'user', content: `That reply does not match the required JSON Schema:\n${problems.map(p => `- ${p}`).join('\n')}\nReply again with only JSON that matches the schema.` }
        ]
        emit({ type: 'update', stepId: step.id, patch: { messages } })
      }
    }

    record(node, output, text)
    if (node.saveAs.trim()) vars[node.saveAs.trim()] = output
    for (const id of node.memoryWrites) {
      const entries = memory.get(id)
      if (entries && text.trim()) {
        entries.push(text.trim())
        if (entries.length > MAX_STORED_ENTRIES) entries.splice(0, entries.length - MAX_STORED_ENTRIES)
      }
    }
    if (!settings.ephemeral) {
      transcript.push(...turns.map(m => ({ ...m, nodeId: node.id })))
      if (node.generate && text.trim()) transcript.push({ role: 'assistant', content: text.trim(), nodeId: node.id })
    }
    emit({
      type: 'update',
      stepId: step.id,
      patch: { output, text, detail: settings.ephemeral ? 'Setup only — not kept in the conversation' : undefined }
    })
    return 'out'
  }

  function runCondition(node: ConditionNode, step: RunStep): string {
    const s = scope()
    const index = node.branches.findIndex(branch => truthy(evaluate(branch.expression, s)))
    const branch = node.branches[index]
    const detail = branch ? `Took “${branch.label.trim() || branch.expression.trim() || `Case ${index + 1}`}”` : 'Took “Else”'
    record(node, branch ? branch.label.trim() || `case${index + 1}` : 'else')
    emit({ type: 'update', stepId: step.id, patch: { detail, output: last } })
    return branch?.id ?? 'else'
  }

  function runLoop(node: LoopNode, step: RunStep): string {
    let state = loops.get(node.id)
    if (state) {
      state.index++
    } else {
      state = { index: 0 }
      if (node.mode === 'forEach') {
        const items = evaluate(node.items, scope())
        state.items = Array.isArray(items) ? items : items == null ? [] : [items]
      }
      loops.set(node.id, state)
      loopStack.push(node.id)
    }
    const max = Math.max(1, Math.floor(node.max) || 1)
    let more: boolean
    if (node.mode === 'count') more = state.index < Math.floor(node.count)
    else if (node.mode === 'forEach') more = state.index < state.items!.length
    else more = truthy(evaluate(node.condition, scope()))
    const limited = more && state.index >= max
    if (more && !limited) {
      const total = node.mode === 'count' ? Math.floor(node.count) : node.mode === 'forEach' ? state.items!.length : null
      record(node, state.items?.[state.index] ?? state.index)
      emit({ type: 'update', stepId: step.id, patch: { detail: `Iteration ${state.index + 1}${total === null ? '' : ` of ${total}`}`, output: last } })
      return 'body'
    }
    loops.delete(node.id)
    loopStack.splice(loopStack.lastIndexOf(node.id), 1)
    record(node, { iterations: state.index })
    emit({
      type: 'update',
      stepId: step.id,
      patch: { detail: limited ? `Stopped at the limit of ${max} iterations` : `Done after ${state.index} iteration${state.index === 1 ? '' : 's'}`, output: last }
    })
    return 'done'
  }

  function runSet(node: SetNode, step: RunStep): string {
    const assigned: Record<string, unknown> = {}
    for (const assignment of node.assignments) {
      const name = assignment.name.trim()
      if (!name) continue
      const value = evaluate(assignment.expression, scope())
      vars[name] = value
      assigned[name] = value
    }
    record(node, assigned)
    emit({ type: 'update', stepId: step.id, patch: { output: assigned, detail: Object.keys(assigned).join(', ') || undefined } })
    return 'out'
  }

  async function runAsk(node: AskNode, step: RunStep): Promise<string> {
    if (!deps.ask) throw new FlowError('This run cannot ask questions.')
    const prompt = renderTemplate(node.prompt, scope())
    emit({ type: 'update', stepId: step.id, patch: { detail: 'Waiting for an answer…' } })
    const answer = await deps.ask({ nodeId: node.id, title: label(node), prompt })
    throwIfStopped()
    if (answer === null) throw new StoppedError('Declined')
    record(node, answer)
    if (node.saveAs.trim()) vars[node.saveAs.trim()] = answer
    if (node.addToConversation && answer.trim()) transcript.push({ role: 'user', content: answer.trim(), nodeId: node.id })
    emit({ type: 'update', stepId: step.id, patch: { output: answer, detail: undefined } })
    return 'out'
  }

  function runEnd(node: EndNode, step: RunStep): void {
    const output = renderValue(node.output.trim() || '{{last}}', scope())
    record(node, output)
    emit({ type: 'update', stepId: step.id, patch: { output } })
  }

  const finish = (status: RunResult['status'], error?: string): RunResult => {
    const persisted: Record<string, string[]> = {}
    for (const node of flow.nodes) {
      if (node.kind === 'memory' && node.memory === 'store' && node.persist) {
        const entries = memory.get(node.id) ?? []
        if (entries.length !== node.entries.length || entries.some((entry, i) => entry !== node.entries[i])) persisted[node.id] = entries
      }
    }
    return { status, output: last, error, steps, vars, nodes: results, transcript, memory: persisted }
  }

  const starts = flow.nodes.filter(node => node.kind === 'start')
  if (starts.length !== 1) {
    return finish('error', starts.length ? 'A flow can only have one Start node.' : 'Add a Start node to say where the run begins.')
  }

  let current: FlowNode | undefined = starts[0]
  let count = 0
  const maxSteps = Math.max(1, Math.floor(flow.settings.maxSteps) || 1)
  let step: RunStep | undefined

  try {
    while (current) {
      throwIfStopped()
      if (++count > maxSteps) {
        throw new FlowError(`Stopped after ${maxSteps} steps. A loop may never end: add a condition or loop limit, or raise the step limit in the flow settings.`)
      }
      const node: FlowNode = current
      step = {
        id: String(steps.length),
        nodeId: node.id,
        kind: node.kind,
        title: label(node),
        visit: (results[node.key]?.visits ?? 0) + 1,
        status: 'running',
        startedAt: now()
      }
      steps.push(step)
      emit({ type: 'step', step: { ...step } })

      let handle: string | null
      try {
        switch (node.kind) {
          case 'start':
            record(node, input)
            handle = 'out'
            break
          case 'segment':
            handle = await runSegment(node, step)
            break
          case 'condition':
            handle = runCondition(node, step)
            break
          case 'loop':
            handle = runLoop(node, step)
            break
          case 'set':
            handle = runSet(node, step)
            break
          case 'ask':
            handle = await runAsk(node, step)
            break
          case 'end':
            runEnd(node, step)
            handle = null
            break
          default:
            throw new FlowError(`"${label(node)}" is not a step and can't be run.`)
        }
      } catch (error) {
        // A segment with an "On error" path hands the error to it instead of failing the run.
        if (node.kind !== 'segment' || error instanceof StoppedError || signal.aborted || !nextEdge(flow, node.id, 'error')) throw error
        lastError = (error as Error).message
        results[node.key] = { output: null, text: '', visits: (results[node.key]?.visits ?? 0) + 1, error: lastError }
        handle = 'error'
        Object.assign(step, { status: 'error', error: lastError })
        emit({ type: 'update', stepId: step.id, patch: { status: 'error', error: lastError, detail: 'Continued on the error path' } })
      }

      if (step.status === 'running') step.status = 'done'
      step.finishedAt = now()
      step.handle = handle ?? undefined
      emit({ type: 'update', stepId: step.id, patch: { status: step.status, finishedAt: step.finishedAt, handle: step.handle } })
      emit({ type: 'state', state: structuredClone({ vars, nodes: results, transcript }) })

      const edge: FlowEdge | undefined = handle ? nextEdge(flow, node.id, handle) : undefined
      current = edge ? findNode(flow, edge.target) : undefined
    }
    return finish('done')
  } catch (error) {
    const stopped = error instanceof StoppedError || signal.aborted
    const message = stopped ? undefined : (error as Error).message
    if (step?.status === 'running') {
      step.status = stopped ? 'stopped' : 'error'
      step.finishedAt = now()
      step.error = message
      emit({ type: 'update', stepId: step.id, patch: { status: step.status, finishedAt: step.finishedAt, error: message } })
    }
    return finish(stopped ? 'stopped' : 'error', message)
  }
}
