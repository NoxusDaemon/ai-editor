import { describe, expect, it, vi } from 'vitest'
import { createBlock, type ChatMessage, type GenerateStats } from '~/lib/blocks'
import { normalizeMessages, runFlow, type AskRequest, type GenerateCall, type RunDeps, type RunEvent } from '~/lib/flow/engine'
import { FLOW_TEMPLATES } from '~/lib/flow/templates'
import { createEdge, createFlowSettings, createNode, type Flow, type FlowNode, type JoinNode, type ParallelNode } from '~/lib/flow/types'

type Reply = string | ((call: GenerateCall) => string)

/** A model that answers from a script, in order, recording what it was sent. */
function scriptedModel(...replies: Reply[]) {
  const calls: GenerateCall[] = []
  const generate = vi.fn(async (call: GenerateCall) => {
    calls.push({ ...call, messages: structuredClone(call.messages) })
    const next = replies.shift() ?? 'ok'
    const text = typeof next === 'function' ? next(call) : next
    for (const word of text.split(/(?<= )/)) call.onText(word)
    return { stopReason: 'eosFound' }
  })
  return { calls, generate }
}

function flowOf(nodes: FlowNode[], links: [FlowNode, string, FlowNode][], settings = createFlowSettings()): Flow {
  return { settings, nodes, edges: links.map(([a, handle, b]) => createEdge(a.id, handle, b.id)) }
}

const start = (input = '') => createNode('start', { key: 'start', input })
const end = (output = '{{last}}') => createNode('end', { key: 'end', output })
const segment = (key: string, user: string, init: Partial<Extract<FlowNode, { kind: 'segment' }>> = {}) =>
  createNode('segment', { key, blocks: [createBlock('user', user)], ...init })

function run(flow: Flow, deps: Partial<RunDeps> & Pick<RunDeps, 'generate'>, input = 'hi', signal = new AbortController().signal) {
  return runFlow({ flow, model: 'default-model', input, signal }, deps)
}

const roles = (messages: ChatMessage[]) => messages.map(m => `${m.role}: ${m.content}`)

describe('runFlow', () => {
  it('walks Start → segments → End, building up the conversation', async () => {
    const s = start()
    const a = segment('greet', 'Say hello to {{input}}')
    const b = segment('follow', 'Now say goodbye')
    const e = end()
    const model = scriptedModel('Hello Ada', 'Goodbye Ada')

    const result = await run(flowOf([s, a, b, e], [[s, 'out', a], [a, 'out', b], [b, 'out', e]]), model, 'Ada')

    expect(result.status).toBe('done')
    expect(result.output).toBe('Goodbye Ada')
    expect(roles(model.calls[1]!.messages)).toEqual([
      'user: Say hello to Ada',
      'assistant: Hello Ada',
      'user: Now say goodbye'
    ])
    expect(result.transcript.map(m => m.content)).toEqual(['Say hello to Ada', 'Hello Ada', 'Now say goodbye', 'Goodbye Ada'])
    expect(result.steps.map(step => [step.kind, step.status])).toEqual([['start', 'done'], ['segment', 'done'], ['segment', 'done'], ['end', 'done']])
    expect(result.nodes.greet).toMatchObject({ output: 'Hello Ada', visits: 1 })
  })

  it('keeps setup-only segments out of the conversation but makes their output available', async () => {
    const s = start()
    const plan = segment('plan', 'Plan an answer to {{input}}', { ephemeral: true })
    const answer = segment('answer', 'Answer {{input}} following this plan: {{nodes.plan.output}}')
    const model = scriptedModel('1. be brief', 'Brief answer')

    const result = await run(flowOf([s, plan, answer], [[s, 'out', plan], [plan, 'out', answer]]), model, 'why?')

    expect(roles(model.calls[1]!.messages)).toEqual(['user: Answer why? following this plan: 1. be brief'])
    expect(result.transcript.map(m => m.content)).toEqual(['Answer why? following this plan: 1. be brief', 'Brief answer'])
  })

  it('merges system prompts from the flow, groups and segment, and lets each level choose the model', async () => {
    const s = start()
    const outer = createNode('group', { key: 'outer', system: 'Outer rules.', model: 'big-model', temperature: 0.2 })
    const inner = createNode('group', { key: 'inner', parentId: outer.id, system: 'Inner rules.' })
    const a = segment('a', 'Hi', { parentId: inner.id })
    a.blocks.unshift(createBlock('system', 'Segment rules.'))
    const b = segment('b', 'Hi again', { model: 'small-model' })
    const model = scriptedModel('one', 'two')
    const settings = createFlowSettings({ system: 'Flow rules.' })

    await run(flowOf([s, outer, inner, a, b], [[s, 'out', a], [a, 'out', b]], settings), model)

    expect(model.calls[0]).toMatchObject({ model: 'big-model', temperature: 0.2 })
    expect(model.calls[0]!.messages[0]).toEqual({ role: 'system', content: 'Flow rules.\n\nOuter rules.\n\nInner rules.\n\nSegment rules.' })
    expect(model.calls[1]).toMatchObject({ model: 'small-model' })
    expect(model.calls[1]!.temperature).toBeUndefined()
    expect(model.calls[1]!.messages[0]).toEqual({ role: 'system', content: 'Flow rules.' })
  })

  it('limits what a segment sees with isolated and window context', async () => {
    const s = start()
    const segments = ['one', 'two', 'three'].map(key => segment(key, key))
    const isolated = segment('isolated', 'alone', { context: 'isolated' })
    const windowed = segment('windowed', 'recent', { context: 'window', window: 2 })
    const chain = [s, ...segments, isolated, windowed]
    const model = scriptedModel()

    await run(flowOf(chain, chain.slice(0, -1).map((node, i) => [node, 'out', chain[i + 1]!])), model)

    expect(roles(model.calls[3]!.messages)).toEqual(['user: alone'])
    expect(roles(model.calls[4]!.messages)).toEqual(['user: alone', 'assistant: ok', 'user: recent'])
  })

  it('validates structured output and asks again with the problems', async () => {
    const s = start()
    const schema = JSON.stringify({ type: 'object', properties: { score: { type: 'integer' } }, required: ['score'] })
    const rate = segment('rate', 'Rate it', { schema, saveAs: 'rating' })
    const model = scriptedModel('{"score": "high"}', 'Sure: ```json\n{"score": 9}\n```')

    const result = await run(flowOf([s, rate], [[s, 'out', rate]]), model)

    expect(result.status).toBe('done')
    expect(result.vars.rating).toEqual({ score: 9 })
    expect(model.calls[0]!.jsonSchema).toEqual(JSON.parse(schema))
    expect(model.calls[0]!.messages[0]!.content).toMatch(/JSON Schema/)
    expect(model.calls[1]!.messages.at(-1)!.content).toMatch(/\$\.score: expected integer, got string/)
    expect(result.steps[1]).toMatchObject({ attempts: 2, output: { score: 9 } })
  })

  it('fails when retries run out, unless the segment has an error path', async () => {
    const s = start()
    const schema = '{"type":"object","required":["x"]}'
    const strict = segment('strict', 'Go', { schema, retries: 1 })
    const model = () => scriptedModel('nope', 'still nope')

    const failed = await run(flowOf([s, strict], [[s, 'out', strict]]), model())
    expect(failed.status).toBe('error')
    expect(failed.error).toMatch(/doesn't match its schema/)
    expect(failed.steps.at(-1)!.status).toBe('error')

    const fallback = segment('fallback', 'Explain: {{error}}', { context: 'isolated' })
    const recovered = await run(flowOf([s, strict, fallback], [[s, 'out', strict], [strict, 'error', fallback]]), model())
    expect(recovered.status).toBe('done')
    expect(recovered.nodes.strict!.error).toMatch(/schema/)
    expect(recovered.steps.map(step => step.status)).toEqual(['done', 'error', 'done'])
  })

  it('branches on conditions and loops like a state machine', async () => {
    const s = start()
    const init = createNode('set', { key: 'init', assignments: [{ id: 'a', name: 'tries', expression: '0' }] })
    const attempt = segment('attempt', 'Try #{{vars.tries}}', { context: 'isolated', saveAs: 'reply' })
    const bump = createNode('set', { key: 'bump', assignments: [{ id: 'b', name: 'tries', expression: 'vars.tries + 1' }] })
    const check = createNode('condition', { key: 'check', branches: [{ id: 'good', label: 'Good', expression: 'contains(vars.reply, "yes") or vars.tries >= 5' }] })
    const e = end('{{vars.tries}}')
    const model = scriptedModel('no', 'no', 'yes!')

    const result = await run(flowOf([s, init, attempt, bump, check, e], [
      [s, 'out', init], [init, 'out', attempt], [attempt, 'out', bump], [bump, 'out', check],
      [check, 'good', e], [check, 'else', attempt]
    ]), model)

    expect(result.output).toBe(3)
    expect(model.calls.map(c => c.messages.at(-1)!.content)).toEqual(['Try #0', 'Try #1', 'Try #2'])
    expect(result.nodes.attempt!.visits).toBe(3)
    expect(result.steps.filter(step => step.kind === 'condition').map(step => step.handle)).toEqual(['else', 'else', 'good'])
  })

  it('runs loop nodes: counted, for each item, and while a condition holds', async () => {
    const build = (loop: FlowNode) => {
      const s = start()
      const body = createNode('set', { key: 'body', assignments: [{ id: 'x', name: 'seen', expression: 'append(vars.seen, loop.item ?? loop.index)' }] })
      const e = end('{{vars.seen}}')
      return flowOf([s, loop, body, e], [[s, 'out', loop], [loop, 'body', body], [body, 'out', loop], [loop, 'done', e]])
    }
    const model = scriptedModel()
    const counted = await run(build(createNode('loop', { key: 'loop', mode: 'count', count: 3 })), model)
    expect(counted.output).toEqual([0, 1, 2])

    const each = await run(build(createNode('loop', { key: 'loop', mode: 'forEach', items: 'split(input, ",")' })), model, 'a, b')
    expect(each.output).toEqual(['a', 'b'])

    const whileLoop = await run(build(createNode('loop', { key: 'loop', mode: 'while', condition: 'len(vars.seen) < 4', max: 10 })), model)
    expect(whileLoop.output).toEqual([0, 1, 2, 3])

    const capped = await run(build(createNode('loop', { key: 'loop', mode: 'while', condition: 'true', max: 2 })), model)
    expect(capped.output).toEqual([0, 1])
    expect(capped.steps.at(-2)!.detail).toMatch(/limit of 2/)
    expect(model.generate).not.toHaveBeenCalled()
  })

  it('stops endless cycles at the step limit', async () => {
    const s = start()
    const a = createNode('set', { key: 'a', assignments: [] })
    const b = createNode('set', { key: 'b', assignments: [] })
    const flow = flowOf([s, a, b], [[s, 'out', a], [a, 'out', b], [b, 'out', a]], createFlowSettings({ maxSteps: 25 }))

    const result = await run(flow, scriptedModel())

    expect(result.status).toBe('error')
    expect(result.error).toMatch(/Stopped after 25 steps/)
    expect(result.steps).toHaveLength(25)
  })

  it('injects memories and retrieved knowledge from groups and context edges', async () => {
    const s = start()
    const group = createNode('group', { key: 'team' })
    const notes = createNode('memory', { key: 'profile', title: 'Profile', parentId: group.id, content: 'Name: {{vars.name}}' })
    const docs = createNode('knowledge', {
      key: 'docs',
      title: 'Docs',
      placement: 'message',
      instructions: 'Use these:',
      documents: [
        { id: 'd1', name: 'Passwords', text: 'Reset your password from Settings.' },
        { id: 'd2', name: 'Billing', text: 'Invoices arrive monthly.' }
      ]
    })
    const set = createNode('set', { key: 'set', assignments: [{ id: 'n', name: 'name', expression: '"Ada"' }] })
    const ask = segment('ask', '{{input}}', { parentId: group.id })
    const outside = segment('outside', 'Again')
    const model = scriptedModel()
    const flow = flowOf([s, group, notes, docs, set, ask, outside], [[s, 'out', set], [set, 'out', ask], [ask, 'out', outside], [docs, 'ctx', ask]])

    const result = await run(flow, model, 'How do I reset my password?')

    expect(roles(model.calls[0]!.messages)).toEqual([
      'system: ## Profile\nName: Ada',
      'user: Use these:\n\n[1] Passwords\nReset your password from Settings.\n\nHow do I reset my password?'
    ])
    expect(result.steps.find(step => step.nodeId === ask.id)!.hits!.map(hit => hit.source)).toEqual(['Docs › Passwords'])
    // Neither the group's memory nor the retrieved passages reach segments outside, or the conversation.
    expect(model.calls[1]!.messages[0]!.role).toBe('user')
    expect(result.transcript[0]!.content).toBe('How do I reset my password?')
  })

  it('embeds once per text for semantic search', async () => {
    const s = start()
    const docs = createNode('knowledge', {
      key: 'docs',
      search: 'semantic',
      embeddingModel: 'embedder',
      documents: [{ id: 'd', name: 'D', text: 'alpha' }, { id: 'e', name: 'E', text: 'beta' }]
    })
    const a = segment('a', 'q1')
    const b = segment('b', 'q2')
    const embed = vi.fn(async (_model: string, texts: string[]) => texts.map(text => text === 'beta' ? [0, 1] : [1, 0]))
    const flow = flowOf([s, docs, a, b], [[s, 'out', a], [a, 'out', b], [docs, 'ctx', a], [docs, 'ctx', b]])

    const result = await run(flow, { ...scriptedModel(), embed }, 'q')

    expect(embed).toHaveBeenCalledTimes(1)
    expect(embed).toHaveBeenCalledWith('embedder', ['q', 'alpha', 'beta'], expect.anything())
    expect(result.status).toBe('done')
  })

  it('writes outputs to store memories and returns them to keep', async () => {
    const s = start()
    const facts = createNode('memory', { key: 'facts', title: 'Facts', memory: 'store', entries: ['Likes tea'], limit: 5 })
    const note = segment('note', 'Remember', { memoryWrites: [facts.id], ephemeral: true })
    const use = segment('use', 'What do you know?')
    const scratch = createNode('memory', { key: 'scratch', memory: 'store', persist: false })
    note.memoryWrites.push(scratch.id)
    const model = scriptedModel('Lives in Leeds', 'ok')
    const flow = flowOf([s, facts, scratch, note, use], [[s, 'out', note], [note, 'out', use], [facts, 'ctx', use]])

    const result = await run(flow, model)

    expect(model.calls[1]!.messages[0]!.content).toBe('## Facts\n- Likes tea\n- Lives in Leeds')
    expect(result.memory).toEqual({ [facts.id]: ['Likes tea', 'Lives in Leeds'] })
  })

  it('asks the user, and stops when they decline', async () => {
    const s = start()
    const question = createNode('ask', { key: 'q', prompt: 'Your name? (input was {{input}})', saveAs: 'name' })
    const reply = segment('reply', 'Greet them')
    const flow = flowOf([s, question, reply], [[s, 'out', question], [question, 'out', reply]])
    const ask = vi.fn(async () => 'Grace')
    const model = scriptedModel()

    const result = await run(flow, { ...model, ask })
    expect(ask).toHaveBeenCalledWith({ nodeId: question.id, title: 'Ask user', prompt: 'Your name? (input was hi)', signal: expect.any(AbortSignal) })
    expect(result.vars.name).toBe('Grace')
    expect(roles(model.calls[0]!.messages)).toEqual(['user: Grace\n\nGreet them'])

    const declined = await run(flow, { ...model, ask: async () => null })
    expect(declined.status).toBe('stopped')
  })

  it('stops when aborted, marking the running step', async () => {
    const controller = new AbortController()
    const s = start()
    const a = segment('a', 'Go')
    const generate = vi.fn(async (call: GenerateCall) => {
      call.onText('partial')
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })

    const result = await run(flowOf([s, a], [[s, 'out', a]]), { generate }, 'x', controller.signal)

    expect(result.status).toBe('stopped')
    expect(result.steps.at(-1)!.status).toBe('stopped')
  })

  it('reports progress as events', async () => {
    const events: RunEvent[] = []
    const s = start()
    const a = segment('a', 'Go')
    await run(flowOf([s, a], [[s, 'out', a]]), { ...scriptedModel('one two'), onEvent: event => events.push(event) })

    expect(events.filter(e => e.type === 'step')).toHaveLength(2)
    expect(events.filter(e => e.type === 'delta').map(e => e.type === 'delta' && e.text).join('')).toBe('one two')
    expect(events.at(-1)).toMatchObject({ type: 'state', state: { transcript: [{ content: 'Go' }, { content: 'one two' }] } })
  })

  it('needs exactly one Start node', async () => {
    const result = await run(flowOf([segment('a', 'x')], []), scriptedModel())
    expect(result).toMatchObject({ status: 'error', error: expect.stringMatching(/Start node/) })
  })

  it('runs every template without errors', async () => {
    for (const template of FLOW_TEMPLATES) {
      const model = scriptedModel(...Array.from({ length: 30 }, () => (call: GenerateCall) => {
        if (!call.jsonSchema) return 'A reply.'
        const schema = call.jsonSchema as { properties: Record<string, unknown> }
        if ('category' in schema.properties) return '{"category":"question"}'
        if ('score' in schema.properties) return '{"score":9,"feedback":"Good"}'
        if ('query' in schema.properties) return '{"query":"password reset email"}'
        return '{"people":[{"name":"Priya"}]}'
      }))
      let answers = 0
      const result = await run(template.create(), { ...model, ask: async () => answers++ ? 'bye' : 'My name is Ada' })
      expect([template.id, result.status, result.error]).toEqual([template.id, 'done', undefined])
    }
  })
})

/** A model whose replies are released by hand, to control which branch finishes first. */
function heldModel() {
  const held: { call: GenerateCall, reply: (text: string) => void }[] = []
  const generate = vi.fn((call: GenerateCall) => new Promise<GenerateStats>((resolve, reject) => {
    call.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    held.push({
      call,
      reply: (text) => {
        call.onText(text)
        resolve({ stopReason: 'eosFound' })
      }
    })
  }))
  /** The held call whose last message mentions `text`. */
  const find = (text: string) => held.find(h => h.call.messages.at(-1)!.content.includes(text))!
  return { generate, held, find }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

const parallel = (init: Partial<ParallelNode> = {}) => createNode('parallel', { key: 'fan', ...init })
const join = (init: Partial<JoinNode> = {}) => createNode('join', { key: 'meet', ...init })
const set = (key: string, name: string, expression: string) =>
  createNode('set', { key, assignments: [{ id: key, name, expression }] })

describe('runFlow: parallel branches', () => {
  it('runs branches at the same time and collects their outputs by name, in branch order', async () => {
    const s = start()
    const fan = parallel({ branches: [{ id: 'a', label: 'Critic A' }, { id: 'b', label: 'Critic B' }] })
    const a = segment('a', 'Review as A')
    const b = segment('b', 'Review as B')
    const meet = join()
    const e = end()
    const flow = flowOf([s, fan, a, b, meet, e], [[s, 'out', fan], [fan, 'a', a], [fan, 'b', b], [a, 'out', meet], [b, 'out', meet], [meet, 'out', e]])
    const model = heldModel()

    const running = run(flow, model)
    await settle()
    expect(model.held).toHaveLength(2)
    model.find('as B').reply('B is fine')
    await settle()
    model.find('as A').reply('A has notes')
    const result = await running

    expect(result.status).toBe('done')
    expect(result.output).toEqual({ critic_a: 'A has notes', critic_b: 'B is fine' })
    expect(Object.keys(result.output as object)).toEqual(['critic_a', 'critic_b'])
    expect(result.steps.map(step => [step.title, step.branch])).toEqual([
      ['Start', undefined],
      ['Parallel', undefined],
      ['Segment', 'Critic A'],
      ['Segment', 'Critic B'],
      ['Join', undefined],
      ['End', undefined]
    ])
    expect(result.steps.find(step => step.kind === 'join')!.via).toHaveLength(2)
    expect(result.transcript).toEqual([])
  })

  it('gives each branch its own copy of the run, merged in branch order whichever finishes first', async () => {
    const s = start()
    const fan = parallel({ branches: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })
    const a1 = segment('a1', 'First in A')
    const a2 = segment('a2', 'Second in A')
    const setA = set('set_a', 'winner', '"a"')
    const b1 = segment('b1', 'Only in B')
    const setB = set('set_b', 'winner', '"b"')
    const meet = join({ keepConversation: true })
    const e = end('{{vars.winner}}')
    const flow = flowOf([s, fan, a1, a2, setA, b1, setB, meet, e], [
      [s, 'out', fan],
      [fan, 'a', a1],
      [a1, 'out', a2],
      [a2, 'out', setA],
      [setA, 'out', meet],
      [fan, 'b', b1],
      [b1, 'out', setB],
      [setB, 'out', meet],
      [meet, 'out', e]
    ])
    const model = heldModel()

    const running = run(flow, model)
    await settle()
    model.find('First in A').reply('a1 done')
    await settle()
    // A's second segment sees A's conversation, never B's.
    expect(roles(model.find('Second in A').call.messages)).toEqual(['user: First in A', 'assistant: a1 done', 'user: Second in A'])
    model.find('Second in A').reply('a2 done')
    await settle()
    // B finishes last, and comes last in branch order too, so its variable wins.
    model.find('Only in B').reply('b1 done')
    const result = await running

    expect(result.output).toBe('b')
    expect(result.transcript.map(m => m.content)).toEqual(['First in A', 'a1 done', 'Second in A', 'a2 done', 'Only in B', 'b1 done'])
    expect(result.nodes.a2).toMatchObject({ output: 'a2 done', visits: 1 })
  })

  it('merges in branch order even when the last branch finishes first', async () => {
    const s = start()
    const fan = parallel({ branches: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })
    const slow = segment('slow', 'Slow')
    const setA = set('set_a', 'winner', '"a"')
    const setB = set('set_b', 'winner', '"b"')
    const meet = join()
    const e = end('{{vars.winner}}')
    const flow = flowOf([s, fan, slow, setA, setB, meet, e], [
      [s, 'out', fan],
      [fan, 'a', slow],
      [slow, 'out', setA],
      [setA, 'out', meet],
      [fan, 'b', setB],
      [setB, 'out', meet],
      [meet, 'out', e]
    ])
    const model = heldModel()

    const running = run(flow, model)
    await settle()
    model.find('Slow').reply('done at last')
    const result = await running

    expect(result.output).toBe('b')
  })

  it('runs a path for each item, at most `concurrency` at a time, keeping item order', async () => {
    const s = start()
    const fan = parallel({ mode: 'map', items: 'split(input)', concurrency: 2 })
    const each = segment('each', 'Describe {{branch.item}} ({{branch.index + 1}} of {{branch.total}})')
    const meet = join()
    const flow = flowOf([s, fan, each, meet], [[s, 'out', fan], [fan, 'each', each], [each, 'out', meet]])
    const model = heldModel()

    const running = run(flow, model, 'red, green, blue')
    await settle()
    expect(model.held.map(h => h.call.messages.at(-1)!.content)).toEqual(['Describe red (1 of 3)', 'Describe green (2 of 3)'])
    model.find('green').reply('Grass')
    await settle()
    expect(model.held).toHaveLength(3)
    model.find('blue').reply('Sky')
    model.find('red').reply('Fire')
    const result = await running

    expect(result.output).toEqual(['Fire', 'Grass', 'Sky'])
    expect(result.nodes.each!.visits).toBe(3)
    expect(result.steps.filter(step => step.kind === 'segment').map(step => step.branch)).toEqual(['Item 1', 'Item 2', 'Item 3'])
  })

  it('goes straight to the Join when there are no items', async () => {
    const s = start()
    const fan = parallel({ mode: 'map', items: '[]' })
    const each = segment('each', 'Never')
    const meet = join()
    const model = scriptedModel()
    const result = await run(flowOf([s, fan, each, meet], [[s, 'out', fan], [fan, 'each', each], [each, 'out', meet]]), model)

    expect(result).toMatchObject({ status: 'done', output: [] })
    expect(model.generate).not.toHaveBeenCalled()
  })

  it('can take the first branch to finish and stop the others', async () => {
    const s = start()
    const fan = parallel({ branches: [{ id: 'a', label: 'Slow' }, { id: 'b', label: 'Fast' }] })
    const a = segment('a', 'Think slowly')
    const b = segment('b', 'Think fast')
    const meet = join({ wait: 'first' })
    const flow = flowOf([s, fan, a, b, meet], [[s, 'out', fan], [fan, 'a', a], [fan, 'b', b], [a, 'out', meet], [b, 'out', meet]])
    const model = heldModel()

    const running = run(flow, model)
    await settle()
    model.find('fast').reply('Quick answer')
    const result = await running

    expect(result).toMatchObject({ status: 'done', output: 'Quick answer' })
    expect(result.steps.find(step => step.nodeId === a.id)!.status).toBe('stopped')
    expect(result.steps.find(step => step.kind === 'join')!.detail).toBe('“Fast” finished first')
  })

  it('stops the other branches when one fails, and takes the Join’s failure path if connected', async () => {
    const s = start()
    const fan = parallel({ branches: [{ id: 'a', label: 'Good' }, { id: 'b', label: 'Bad' }] })
    const a = segment('a', 'Be good')
    const b = segment('b', 'Be bad')
    const meet = join()
    const recover = createNode('end', { key: 'recover', output: 'Recovered from {{error}}' })
    const links: [FlowNode, string, FlowNode][] = [[s, 'out', fan], [fan, 'a', a], [fan, 'b', b], [a, 'out', meet], [b, 'out', meet]]
    const generate = vi.fn(async (call: GenerateCall): Promise<GenerateStats> => {
      if (call.messages.at(-1)!.content === 'Be bad') {
        await settle()
        throw new Error('model crashed')
      }
      return new Promise((_, reject) => call.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    })

    const failed = await run(flowOf([s, fan, a, b, meet], links), { generate })
    expect(failed).toMatchObject({ status: 'error', error: 'Bad: model crashed' })
    expect(failed.steps.find(step => step.nodeId === a.id)!.status).toBe('stopped')
    expect(failed.steps.find(step => step.nodeId === b.id)).toMatchObject({ status: 'error', error: 'model crashed' })

    const recovered = await run(flowOf([s, fan, a, b, meet, recover], [...links, [meet, 'error', recover]]), { generate })
    expect(recovered).toMatchObject({ status: 'done', output: 'Recovered from Bad: model crashed' })
    expect(recovered.steps.find(step => step.kind === 'join')).toMatchObject({ status: 'error', handle: 'error' })
  })

  it('runs nested Parallel nodes, each meeting at its own Join', async () => {
    const s = start()
    const outer = parallel({ key: 'outer', mode: 'map', items: '["x", "y"]' })
    const keep = set('keep', 'item', 'branch.item')
    const inner = parallel({ key: 'inner', branches: [{ id: 'up', label: 'Up' }, { id: 'down', label: 'Down' }] })
    const up = set('up_set', 'v', 'upper(vars.item)')
    const down = set('down_set', 'v', 'vars.item + "!"')
    const innerJoin = join({ key: 'inner_join' })
    const outerJoin = join({ key: 'outer_join' })
    const flow = flowOf([s, outer, keep, inner, up, down, innerJoin, outerJoin], [
      [s, 'out', outer],
      [outer, 'each', keep],
      [keep, 'out', inner],
      [inner, 'up', up],
      [up, 'out', innerJoin],
      [inner, 'down', down],
      [down, 'out', innerJoin],
      [innerJoin, 'out', outerJoin]
    ])

    const result = await run(flow, scriptedModel())

    expect(result.status).toBe('done')
    expect(result.output).toEqual([{ up: { v: 'X' }, down: { v: 'x!' } }, { up: { v: 'Y' }, down: { v: 'y!' } }])
    expect(result.steps.find(step => step.nodeId === down.id)!.branch).toBe('Item 1 › Down')
  })

  it('asks one question at a time', async () => {
    const s = start()
    const fan = parallel({ branches: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })
    const qa = createNode('ask', { key: 'qa', prompt: 'First?' })
    const qb = createNode('ask', { key: 'qb', prompt: 'Second?' })
    const meet = join()
    const flow = flowOf([s, fan, qa, qb, meet], [[s, 'out', fan], [fan, 'a', qa], [fan, 'b', qb], [qa, 'out', meet], [qb, 'out', meet]])
    let open = 0
    let most = 0
    const ask = vi.fn(async ({ prompt }: AskRequest) => {
      most = Math.max(most, ++open)
      await settle()
      open--
      return prompt.replace('?', '!')
    })

    const result = await run(flow, { ...scriptedModel(), ask })

    expect(ask).toHaveBeenCalledTimes(2)
    expect(most).toBe(1)
    expect(result.output).toEqual({ a: 'First!', b: 'Second!' })
  })

  it('stops every branch when the run is stopped', async () => {
    const controller = new AbortController()
    const s = start()
    const fan = parallel({ mode: 'map', items: '[1, 2, 3]' })
    const each = segment('each', 'Item {{branch.item}}')
    const meet = join()
    const model = heldModel()

    const running = run(flowOf([s, fan, each, meet], [[s, 'out', fan], [fan, 'each', each], [each, 'out', meet]]), model, 'x', controller.signal)
    await settle()
    controller.abort()
    const result = await running

    expect(result.status).toBe('stopped')
    expect(result.steps.filter(step => step.kind === 'segment').map(step => step.status)).toEqual(['stopped', 'stopped', 'stopped'])
  })

  it('refuses to end the run inside a branch', async () => {
    const s = start()
    const fan = parallel({ branches: [{ id: 'a', label: 'A' }] })
    const e = end()
    const result = await run(flowOf([s, fan, e], [[s, 'out', fan], [fan, 'a', e]]), scriptedModel())
    expect(result).toMatchObject({ status: 'error', error: expect.stringMatching(/Branches can't end the run/) })
  })

  it('passes the run on at a Join no Parallel node leads to', async () => {
    const s = start()
    const meet = join()
    const e = end()
    const result = await run(flowOf([s, meet, e], [[s, 'out', meet], [meet, 'out', e]]), scriptedModel(), 'hello')
    expect(result).toMatchObject({ status: 'done', output: 'hello' })
  })
})

describe('normalizeMessages', () => {
  it('drops empty messages and merges neighbours with the same role', () => {
    expect(normalizeMessages([
      { role: 'system', content: '  ' },
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b ' },
      { role: 'assistant', content: 'c' }
    ])).toEqual([{ role: 'user', content: 'a\n\nb' }, { role: 'assistant', content: 'c' }])
  })
})
