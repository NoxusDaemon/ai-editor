/**
 * Runs a flow. A small interpreter walks the graph from Start one node at a
 * time, like a state machine: each node does its work and names the output
 * handle to leave by; the edge on that handle decides what runs next. The run
 * ends at an End node, at a handle with nothing connected, or when stopped.
 *
 * A Parallel node splits the walk into branches that run at the same time.
 * Each branch works on its own copy of the run's state (a frame), so branches
 * never see each other's changes. At the Join they are merged back in branch
 * order, never in the order they finished, so a run comes out the same however
 * long each branch takes.
 *
 * Everything the run can see is in its scope:
 *   input       the run's input
 *   vars        variables (Set and Ask nodes, segments' "save as")
 *   nodes.<key> { output, text, visits, error } for every node that has run
 *   last        the output of the previous step
 *   loop        { index, iteration, item, total } of the loop being run
 *   branch      { name, index, item, total } of the Parallel branch being run
 *   memory.<key> the current text of each memory
 *   error       the latest error, on an "On error" or "If a branch fails" path
 *
 * Side effects (the model, embeddings, asking the user) come in through
 * `RunDeps`, so the engine has no I/O of its own and is fully unit-tested.
 */
import { isMessage, type ChatMessage, type GenerateStats, type MessageRole } from '../blocks'
import { evaluate, formatValue, truthy } from './expression'
import { branchLabel, branchNames, contextSources, findNode, joinOf, nextEdge, resolveSettings, type ResolvedSettings } from './graph'
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
  JoinNode,
  KnowledgeNode,
  LoopNode,
  MemoryNode,
  NodeKind,
  ParallelNode,
  Placement,
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
  /** Aborted when the run stops or the branch asking is cancelled: the question should go away. */
  signal: AbortSignal
}

export interface RunDeps {
  /** May be called several times at once, by branches of a Parallel node. */
  generate(call: GenerateCall): Promise<GenerateStats>
  embed?(model: string, texts: string[], signal: AbortSignal): Promise<number[][]>
  /** Resolves to `null` if the person declines, which stops the run. Never called while a question is open. */
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

/** Memory or knowledge put into a segment's prompt. */
export interface RecalledContext {
  nodeId: string
  kind: 'memory' | 'knowledge'
  title: string
  placement: Placement
  /** Exactly what went into the prompt; empty when there was nothing to recall. */
  text: string
}

/** One node run: what went in, what came out. Shown in the run panel. */
export interface RunStep {
  id: string
  nodeId: string
  kind: NodeKind
  title: string
  /** How many times the node has run, including this time (within its branch). */
  visit: number
  status: StepStatus
  startedAt: number
  finishedAt?: number
  /** Summary, e.g. the branch taken or the loop iteration. */
  detail?: string
  /** Output handle the run left by. */
  handle?: string
  /** Edges the run arrived by: one, or several for a Join. */
  via?: string[]
  /** The Parallel branch the step ran in, e.g. "Critic" or "Item 2 › Critic". */
  branch?: string
  model?: string
  /** Exactly what was sent to the model (last attempt). */
  messages?: ChatMessage[]
  text?: string
  reasoning?: string
  output?: unknown
  attempts?: number
  /** Memory and knowledge recalled into the prompt, in order. */
  recalled?: RecalledContext[]
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

interface BranchInfo {
  name: string
  index: number
  item: unknown
  total: number
}

/**
 * The state a walk works on. The main path has one; each Parallel branch gets
 * a copy of its parent's, merged back at the Join.
 */
interface Frame {
  transcript: TranscriptMessage[]
  vars: Record<string, unknown>
  results: Record<string, NodeResult>
  /** Entries of every store memory, as this frame sees them. */
  memory: Map<string, string[]>
  /** Entries this frame added to store memories, to merge into its parent. */
  written: Map<string, string[]>
  loops: Map<string, LoopState>
  loopStack: string[]
  last: unknown
  lastError: string | null
  branch: BranchInfo | null
  /** Where the frame sits, e.g. "Item 2 › Critic"; empty on the main path. */
  path: string
  /** The Join this branch ends at. */
  joinId: string | null
  signal: AbortSignal
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

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

export async function runFlow({ flow, model, input, signal }: RunInput, deps: RunDeps): Promise<RunResult> {
  const now = deps.now ?? Date.now
  const steps: RunStep[] = []
  /** Reports an event, keeping the steps returned at the end up to date too (step ids are their index). */
  const emit = (event: RunEvent) => {
    if (event.type === 'update') Object.assign(steps[Number(event.stepId)]!, event.patch)
    deps.onEvent?.(event)
  }

  const chunkCache = new Map<string, Chunk[]>()
  const vectorCache = new Map<string, number[]>()
  const maxSteps = Math.max(1, Math.floor(flow.settings.maxSteps) || 1)
  /** Steps taken so far, across every branch. */
  let count = 0
  /** Questions wait for the one before them, so branches never open two at once. */
  let asking: Promise<unknown> = Promise.resolve()

  const root: Frame = {
    transcript: [],
    vars: {},
    results: {},
    memory: new Map(),
    written: new Map(),
    loops: new Map(),
    loopStack: [],
    last: null,
    lastError: null,
    branch: null,
    path: '',
    joinId: null,
    signal
  }
  for (const node of flow.nodes) {
    if (node.kind === 'memory' && node.memory === 'store') root.memory.set(node.id, [...node.entries])
  }

  const throwIfStopped = (f: Frame) => {
    if (f.signal.aborted) throw new StoppedError('Stopped')
  }

  function memoryText(f: Frame, node: MemoryNode): string {
    if (node.memory === 'notes') return node.content
    if (node.memory === 'buffer') return formatTranscript(f.transcript.slice(-Math.max(1, node.window)))
    return (f.memory.get(node.id) ?? []).slice(-Math.max(1, node.limit)).map(entry => `- ${entry}`).join('\n')
  }

  function writeMemory(f: Frame, id: string, entry: string) {
    const entries = f.memory.get(id)
    if (!entries) return
    entries.push(entry)
    if (entries.length > MAX_STORED_ENTRIES) entries.splice(0, entries.length - MAX_STORED_ENTRIES)
    f.written.set(id, [...f.written.get(id) ?? [], entry])
  }

  function scope(f: Frame): Record<string, unknown> {
    const top = f.loopStack.at(-1)
    const state = top ? f.loops.get(top) : undefined
    const loopNode = top ? findNode(flow, top) as LoopNode | undefined : undefined
    const memoryScope: Record<string, string> = {}
    for (const node of flow.nodes) if (node.kind === 'memory') memoryScope[node.key] = memoryText(f, node)
    return {
      input,
      vars: f.vars,
      nodes: f.results,
      last: f.last,
      error: f.lastError,
      memory: memoryScope,
      branch: f.branch ? { ...f.branch } : null,
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

  function record(f: Frame, node: FlowNode, output: unknown, text = formatValue(output)) {
    const previous = f.results[node.key]
    f.results[node.key] = { output, text, visits: (previous?.visits ?? 0) + 1, error: null }
    f.last = output
  }

  function startStep(f: Frame, node: FlowNode, via: string[] = []): RunStep {
    if (++count > maxSteps) {
      throw new FlowError(`Stopped after ${maxSteps} steps. A loop may never end: add a condition or loop limit, or raise the step limit in the flow settings.`)
    }
    const step: RunStep = {
      id: String(steps.length),
      nodeId: node.id,
      kind: node.kind,
      title: label(node),
      visit: (f.results[node.key]?.visits ?? 0) + 1,
      status: 'running',
      startedAt: now(),
      ...(via.length && { via }),
      ...(f.path && { branch: f.path })
    }
    steps.push(step)
    emit({ type: 'step', step: { ...step } })
    return step
  }

  /** Marks a step finished (unless it already is) and reports the main path's state. */
  function complete(f: Frame, step: RunStep, patch: Partial<RunStep> = {}) {
    if (step.status !== 'running' && !patch.status) return
    emit({ type: 'update', stepId: step.id, patch: { status: 'done', finishedAt: now(), ...patch } })
    if (!f.path) emit({ type: 'state', state: structuredClone({ vars: f.vars, nodes: f.results, transcript: f.transcript }) })
  }

  /** Embeds texts with the knowledge node's model, reusing vectors already computed in this run. */
  async function embedTexts(f: Frame, modelKey: string, texts: string[]): Promise<number[][]> {
    if (!deps.embed) throw new FlowError('Semantic search needs an embedding model, which is not available.')
    const missing = [...new Set(texts.filter(text => !vectorCache.has(`${modelKey}\u0000${text}`)))]
    if (missing.length) {
      const vectors = await deps.embed(modelKey, missing, f.signal)
      missing.forEach((text, i) => vectorCache.set(`${modelKey}\u0000${text}`, vectors[i]!))
    }
    return texts.map(text => vectorCache.get(`${modelKey}\u0000${text}`)!)
  }

  async function retrieve(f: Frame, node: KnowledgeNode, s: Record<string, unknown>, hits: RetrievalHit[]): Promise<string> {
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
      embed: texts => embedTexts(f, node.embeddingModel.trim(), texts)
    })
    hits.push(...found.map(hit => ({ ...hit, source: `${label(node)} › ${hit.source}` })))
    return formatContext(found, renderTemplate(node.instructions, s))
  }

  function recall(f: Frame, node: MemoryNode, s: Record<string, unknown>): string {
    let body: string
    if (node.memory === 'notes') {
      body = renderTemplate(node.content, s)
    } else if (node.memory === 'buffer') {
      body = memoryText(f, node)
    } else {
      const entries = f.memory.get(node.id) ?? []
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

  function history(f: Frame, settings: ResolvedSettings): ChatMessage[] {
    const messages = f.transcript.map(({ role, content }) => ({ role, content }))
    if (settings.context === 'isolated') return []
    if (settings.context === 'window') return messages.slice(-Math.max(1, settings.window))
    return messages
  }

  async function runSegment(f: Frame, node: SegmentNode, step: RunStep): Promise<string> {
    const settings = resolveSettings(flow, model, node)
    const s = scope(f)
    const system = settings.system.map(text => renderTemplate(text, s))
    const injected: ChatMessage[] = []
    const hits: RetrievalHit[] = []
    const recalled: RecalledContext[] = []
    for (const source of contextSources(flow, node)) {
      const text = source.kind === 'memory' ? recall(f, source, s) : await retrieve(f, source, s, hits)
      throwIfStopped(f)
      recalled.push({ nodeId: source.id, kind: source.kind, title: label(source), placement: source.placement, text })
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
      ...history(f, settings),
      ...injected,
      ...turns
    ])
    emit({ type: 'update', stepId: step.id, patch: { model: settings.model || 'Loaded model', messages, hits, recalled } })

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
          signal: f.signal,
          onText: (delta) => {
            reply += delta
            emit({ type: 'delta', stepId: step.id, text: delta })
          },
          onReasoning: (delta) => {
            reasoning += delta
            emit({ type: 'delta', stepId: step.id, reasoning: delta })
          }
        })
        throwIfStopped(f)
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

    record(f, node, output, text)
    if (node.saveAs.trim()) f.vars[node.saveAs.trim()] = output
    if (text.trim()) for (const id of node.memoryWrites) writeMemory(f, id, text.trim())
    if (!settings.ephemeral) {
      f.transcript.push(...turns.map(m => ({ ...m, nodeId: node.id })))
      if (node.generate && text.trim()) f.transcript.push({ role: 'assistant', content: text.trim(), nodeId: node.id })
    }
    emit({
      type: 'update',
      stepId: step.id,
      patch: { output, text, detail: settings.ephemeral ? 'Setup only — not kept in the conversation' : undefined }
    })
    return 'out'
  }

  function runCondition(f: Frame, node: ConditionNode, step: RunStep): string {
    const s = scope(f)
    const index = node.branches.findIndex(branch => truthy(evaluate(branch.expression, s)))
    const branch = node.branches[index]
    const detail = branch ? `Took “${branch.label.trim() || branch.expression.trim() || `Case ${index + 1}`}”` : 'Took “Else”'
    record(f, node, branch ? branch.label.trim() || `case${index + 1}` : 'else')
    emit({ type: 'update', stepId: step.id, patch: { detail, output: f.last } })
    return branch?.id ?? 'else'
  }

  function runLoop(f: Frame, node: LoopNode, step: RunStep): string {
    let state = f.loops.get(node.id)
    if (state) {
      state.index++
    } else {
      state = { index: 0 }
      if (node.mode === 'forEach') {
        const items = evaluate(node.items, scope(f))
        state.items = Array.isArray(items) ? items : items == null ? [] : [items]
      }
      f.loops.set(node.id, state)
      f.loopStack.push(node.id)
    }
    const max = Math.max(1, Math.floor(node.max) || 1)
    let more: boolean
    if (node.mode === 'count') more = state.index < Math.floor(node.count)
    else if (node.mode === 'forEach') more = state.index < state.items!.length
    else more = truthy(evaluate(node.condition, scope(f)))
    const limited = more && state.index >= max
    if (more && !limited) {
      const total = node.mode === 'count' ? Math.floor(node.count) : node.mode === 'forEach' ? state.items!.length : null
      record(f, node, state.items?.[state.index] ?? state.index)
      emit({ type: 'update', stepId: step.id, patch: { detail: `Iteration ${state.index + 1}${total === null ? '' : ` of ${total}`}`, output: f.last } })
      return 'body'
    }
    f.loops.delete(node.id)
    f.loopStack.splice(f.loopStack.lastIndexOf(node.id), 1)
    record(f, node, { iterations: state.index })
    emit({
      type: 'update',
      stepId: step.id,
      patch: { detail: limited ? `Stopped at the limit of ${max} iterations` : `Done after ${plural(state.index, 'iteration')}`, output: f.last }
    })
    return 'done'
  }

  function runSet(f: Frame, node: SetNode, step: RunStep): string {
    const assigned: Record<string, unknown> = {}
    for (const assignment of node.assignments) {
      const name = assignment.name.trim()
      if (!name) continue
      const value = evaluate(assignment.expression, scope(f))
      f.vars[name] = value
      assigned[name] = value
    }
    record(f, node, assigned)
    emit({ type: 'update', stepId: step.id, patch: { output: assigned, detail: Object.keys(assigned).join(', ') || undefined } })
    return 'out'
  }

  async function runAsk(f: Frame, node: AskNode, step: RunStep): Promise<string> {
    const ask = deps.ask
    if (!ask) throw new FlowError('This run cannot ask questions.')
    const prompt = renderTemplate(node.prompt, scope(f))
    emit({ type: 'update', stepId: step.id, patch: { detail: 'Waiting for an answer…' } })
    const question = asking.then(() => {
      throwIfStopped(f)
      return ask({ nodeId: node.id, title: label(node), prompt, signal: f.signal })
    })
    asking = question.catch(() => {})
    const answer = await question
    throwIfStopped(f)
    if (answer === null) throw new StoppedError('Declined')
    record(f, node, answer)
    if (node.saveAs.trim()) f.vars[node.saveAs.trim()] = answer
    if (node.addToConversation && answer.trim()) f.transcript.push({ role: 'user', content: answer.trim(), nodeId: node.id })
    emit({ type: 'update', stepId: step.id, patch: { output: answer, detail: undefined } })
    return 'out'
  }

  function runEnd(f: Frame, node: EndNode, step: RunStep): void {
    if (f.path) throw new FlowError(`"${label(node)}" was reached inside a branch of a Parallel node. Branches can't end the run: lead them to a Join.`)
    const output = renderValue(node.output.trim() || '{{last}}', scope(f))
    record(f, node, output)
    emit({ type: 'update', stepId: step.id, patch: { output } })
  }

  /** A copy of `parent` for one branch of a Parallel node. */
  function forkFrame(parent: Frame, branch: BranchInfo, name: string, joinId: string | null, branchSignal: AbortSignal): Frame {
    return {
      transcript: [...parent.transcript],
      vars: { ...parent.vars },
      results: { ...parent.results },
      memory: new Map([...parent.memory].map(([id, entries]) => [id, [...entries]])),
      written: new Map(),
      loops: new Map([...parent.loops].map(([id, state]) => [id, { ...state }])),
      loopStack: [...parent.loopStack],
      last: parent.last,
      lastError: parent.lastError,
      branch,
      path: parent.path ? `${parent.path} › ${name}` : name,
      joinId,
      signal: branchSignal
    }
  }

  /**
   * Merges finished branches into the frame they were forked from, in branch
   * order: later branches win where two set the same variable.
   */
  function mergeBranches(f: Frame, base: Pick<Frame, 'vars' | 'results'> & { length: number }, branches: Frame[], keepConversation: boolean) {
    for (const child of branches) {
      for (const [name, value] of Object.entries(child.vars)) {
        if (value !== base.vars[name]) f.vars[name] = value
      }
      for (const [key, result] of Object.entries(child.results)) {
        const before = base.results[key]
        if (result === before) continue
        const added = result.visits - (before?.visits ?? 0)
        f.results[key] = { ...result, visits: (f.results[key]?.visits ?? 0) + added }
      }
      for (const [id, entries] of child.written) for (const entry of entries) writeMemory(f, id, entry)
      if (keepConversation) f.transcript.push(...child.transcript.slice(base.length))
    }
  }

  /**
   * Runs a Parallel node's branches, at most `concurrency` at a time, then its
   * Join. Returns the Join and the handle to leave it by, or `null` if the
   * branches never meet (the walk ends after them).
   */
  async function runParallel(f: Frame, node: ParallelNode, step: RunStep): Promise<[JoinNode, string] | null> {
    const join = joinOf(flow, node) ?? null
    const wait = join?.wait ?? 'all'
    let branches: { label: string, name: string, item: unknown, edge: FlowEdge | undefined }[]
    if (node.mode === 'map') {
      const value = evaluate(node.items, scope(f))
      const items = Array.isArray(value) ? value : value == null ? [] : [value]
      const edge = nextEdge(flow, node.id, 'each')
      branches = items.map((item, i) => ({ label: `Item ${i + 1}`, name: String(i), item, edge }))
    } else {
      const names = branchNames(node)
      branches = node.branches.map((branch, i) => ({ label: branchLabel(branch, i), name: names[i]!, item: null, edge: nextEdge(flow, node.id, branch.id) }))
    }
    const limit = Math.max(1, Math.floor(node.concurrency) || 1)
    record(f, node, node.mode === 'map' ? branches.map(b => b.item) : branches.map(b => b.name))
    complete(f, step, {
      output: f.last,
      detail: `${plural(branches.length, 'branch', 'branches')}${branches.length > limit ? `, ${limit} at a time` : ''}`
    })

    const base = { vars: { ...f.vars }, results: { ...f.results }, length: f.transcript.length }
    const controller = new AbortController()
    const cancel = () => controller.abort()
    f.signal.addEventListener('abort', cancel)
    const finished: (Frame | undefined)[] = []
    const arrivals: string[] = []
    const race = { winner: null as number | null, failure: null as { index: number, error: unknown } | null }
    let next = 0

    const worker = async () => {
      while (next < branches.length && !controller.signal.aborted) {
        const index = next++
        const branch = branches[index]!
        const child = forkFrame(f, { name: branch.name, index, item: branch.item, total: branches.length }, branch.label, join?.id ?? null, controller.signal)
        try {
          const target = findNode(flow, branch.edge?.target)
          const arrival = target ? await walk(child, target, [branch.edge!.id]) : null
          if (arrival) arrivals.push(arrival)
          finished[index] = child
          if (wait === 'first' && race.winner === null) {
            race.winner = index
            controller.abort()
          }
        } catch (error) {
          // Branches cancelled because another failed, won the race or the run stopped are not failures.
          if (!controller.signal.aborted) {
            race.failure = { index, error }
            controller.abort()
          }
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(limit, branches.length) }, worker))
    } finally {
      f.signal.removeEventListener('abort', cancel)
    }
    throwIfStopped(f)
    const { winner, failure } = race
    // Declining a question stops the whole run.
    if (failure?.error instanceof StoppedError) throw failure.error
    const failMessage = failure ? `${branches[failure.index]!.label}: ${(failure.error as Error).message}` : null

    if (!join) {
      if (failMessage) throw new FlowError(failMessage)
      mergeBranches(f, base, finished.filter(child => !!child), false)
      f.last = node.mode === 'map' ? finished.map(child => child?.last ?? null) : Object.fromEntries(branches.map((b, i) => [b.name, finished[i]?.last ?? null]))
      return null
    }

    const joinStep = startStep(f, join, arrivals)
    if (failMessage) {
      if (!nextEdge(flow, join.id, 'error')) {
        complete(f, joinStep, { status: 'error', error: failMessage })
        throw new FlowError(failMessage)
      }
      f.lastError = failMessage
      f.results[join.key] = { output: null, text: '', visits: (f.results[join.key]?.visits ?? 0) + 1, error: failMessage }
      f.last = null
      complete(f, joinStep, { status: 'error', error: failMessage, detail: 'Continued on the “If a branch fails” path', handle: 'error' })
      return [join, 'error']
    }

    let output: unknown
    let detail: string
    if (wait === 'first') {
      const first = winner === null ? undefined : finished[winner]
      mergeBranches(f, base, first ? [first] : [], join.keepConversation)
      output = first?.last ?? null
      detail = winner === null ? 'No branches to wait for' : `“${branches[winner]!.label}” finished first`
    } else {
      const done = finished.filter((child): child is Frame => !!child)
      mergeBranches(f, base, done, join.keepConversation)
      output = node.mode === 'map'
        ? finished.map(child => child?.last ?? null)
        : Object.fromEntries(branches.map((b, i) => [b.name, finished[i]?.last ?? null]))
      detail = `Joined ${plural(done.length, 'branch', 'branches')}`
    }
    record(f, join, output)
    complete(f, joinStep, { output, detail, handle: 'out' })
    return [join, 'out']
  }

  /** A Join reached without going through its Parallel node passes the run straight on. */
  function runJoin(f: Frame, node: JoinNode, step: RunStep): string {
    record(f, node, f.last)
    emit({ type: 'update', stepId: step.id, patch: { output: f.last, detail: 'Nothing to join: the run didn’t come through a Parallel node' } })
    return 'out'
  }

  /**
   * Walks from `start` until the frame's Join (returning the edge it arrived
   * by), an End, or an output with nothing connected.
   */
  async function walk(f: Frame, start: FlowNode, via: string[] = []): Promise<string | null> {
    let current: FlowNode | undefined = start
    let arrivedBy = via
    let step: RunStep | undefined
    try {
      while (current) {
        if (current.id === f.joinId) return arrivedBy[0] ?? null
        throwIfStopped(f)
        const node: FlowNode = current
        step = startStep(f, node, arrivedBy)

        let from: FlowNode = node
        let handle: string | null
        try {
          switch (node.kind) {
            case 'start':
              record(f, node, input)
              handle = 'out'
              break
            case 'segment':
              handle = await runSegment(f, node, step)
              break
            case 'condition':
              handle = runCondition(f, node, step)
              break
            case 'loop':
              handle = runLoop(f, node, step)
              break
            case 'set':
              handle = runSet(f, node, step)
              break
            case 'ask':
              handle = await runAsk(f, node, step)
              break
            case 'parallel': {
              const joined = await runParallel(f, node, step)
              if (!joined) return null
              from = joined[0]
              handle = joined[1]
              break
            }
            case 'join':
              handle = runJoin(f, node, step)
              break
            case 'end':
              runEnd(f, node, step)
              handle = null
              break
            default:
              throw new FlowError(`"${label(node)}" is not a step and can't be run.`)
          }
        } catch (error) {
          // A segment with an "On error" path hands the error to it instead of failing the run.
          if (node.kind !== 'segment' || error instanceof StoppedError || f.signal.aborted || !nextEdge(flow, node.id, 'error')) throw error
          f.lastError = (error as Error).message
          f.results[node.key] = { output: null, text: '', visits: (f.results[node.key]?.visits ?? 0) + 1, error: f.lastError }
          handle = 'error'
          emit({ type: 'update', stepId: step.id, patch: { status: 'error', error: f.lastError, detail: 'Continued on the error path' } })
        }

        // A Parallel step finished when its branches started; the Join has a step of its own.
        if (node.kind !== 'parallel') complete(f, step, { status: step.status === 'running' ? 'done' : step.status, handle: handle ?? undefined })
        const edge: FlowEdge | undefined = handle ? nextEdge(flow, from.id, handle) : undefined
        current = edge ? findNode(flow, edge.target) : undefined
        arrivedBy = edge ? [edge.id] : []
      }
      return null
    } catch (error) {
      if (step?.status === 'running') {
        const stopped = error instanceof StoppedError || f.signal.aborted
        emit({ type: 'update', stepId: step.id, patch: { status: stopped ? 'stopped' : 'error', finishedAt: now(), error: stopped ? undefined : (error as Error).message } })
      }
      throw error
    }
  }

  const finish = (status: RunResult['status'], error?: string): RunResult => {
    const persisted: Record<string, string[]> = {}
    for (const node of flow.nodes) {
      if (node.kind === 'memory' && node.memory === 'store' && node.persist) {
        const entries = root.memory.get(node.id) ?? []
        if (entries.length !== node.entries.length || entries.some((entry, i) => entry !== node.entries[i])) persisted[node.id] = entries
      }
    }
    return { status, output: root.last, error, steps, vars: root.vars, nodes: root.results, transcript: root.transcript, memory: persisted }
  }

  const starts = flow.nodes.filter(node => node.kind === 'start')
  if (starts.length !== 1) {
    return finish('error', starts.length ? 'A flow can only have one Start node.' : 'Add a Start node to say where the run begins.')
  }

  try {
    await walk(root, starts[0]!)
    return finish('done')
  } catch (error) {
    const stopped = error instanceof StoppedError || signal.aborted
    return finish(stopped ? 'stopped' : 'error', stopped ? undefined : (error as Error).message)
  }
}
