/**
 * Starter flows, one per common pattern: a single reply, a chat loop with
 * memory, retrieval (RAG), routing, critique-and-revise, parallel fan-out,
 * map-reduce, and extraction.
 */
import { createBlock, createId, type Block } from '../blocks'
import { createEdge, createFlowSettings, createNode, type Flow, type FlowNode, type FlowSettings, type NodeOf } from './types'

export interface FlowTemplate {
  id: string
  title: string
  description: string
  icon: string
  create(): Flow
}

type Link = [from: FlowNode, handle: string, to: FlowNode]

function flowOf(nodes: FlowNode[], links: Link[], settings: Partial<FlowSettings> = {}): Flow {
  return {
    settings: createFlowSettings(settings),
    nodes,
    edges: links.map(([from, handle, to]) => createEdge(from.id, handle, to.id))
  }
}

const at = (x: number, y: number) => ({ x, y })
const user = (content: string) => createBlock('user', content)
const system = (content: string) => createBlock('system', content)

const segment = (key: string, title: string, x: number, y: number, blocks: Block[], init: Partial<NodeOf<'segment'>> = {}) =>
  createNode('segment', { key, title, position: at(x, y), blocks, ...init })

/** Start → one segment → End. The default for new sessions. */
export function createConversationFlow(blocks: Block[] = [createBlock('user')]): Flow {
  const start = createNode('start', { key: 'start', position: at(0, 40) })
  const reply = segment('reply', 'Conversation', 320, 40, blocks)
  const end = createNode('end', { key: 'end', position: at(680, 40) })
  return flowOf([start, reply, end], [[start, 'out', reply], [reply, 'out', end]])
}

function chatFlow(): Flow {
  const start = createNode('start', { key: 'start', position: at(0, 120) })
  const ask = createNode('ask', { key: 'ask', title: 'You', position: at(300, 120), prompt: 'Say something. Answer “bye” or leave it empty to finish.', saveAs: 'message' })
  const done = createNode('condition', {
    key: 'finished',
    title: 'Finished?',
    position: at(600, 120),
    branches: [{ id: createId(), label: 'Bye', expression: 'trim(vars.message) == "" or lower(trim(vars.message)) == "bye"' }]
  })
  const end = createNode('end', { key: 'end', position: at(900, 0), output: '{{nodes.reply.text}}' })
  const reply = segment('reply', 'Reply', 900, 200, [], { context: 'window', window: 12 })
  const remember = segment('remember', 'Remember facts', 1220, 200, [
    user('If this message says something lasting about me (name, preferences, plans), write it as one short fact. Otherwise reply with nothing at all.\n\nMessage: {{vars.message}}')
  ], { ephemeral: true, context: 'isolated', temperature: 0 })
  const facts = createNode('memory', { key: 'facts', title: 'Facts about the user', position: at(1060, 420), memory: 'store', recall: 'recent', limit: 20 })
  remember.memoryWrites = [facts.id]
  const flow = flowOf([start, ask, done, end, reply, remember, facts], [
    [start, 'out', ask],
    [ask, 'out', done],
    [done, done.branches[0]!.id, end],
    [done, 'else', reply],
    [reply, 'out', remember],
    [remember, 'out', ask],
    [facts, 'ctx', reply]
  ], { system: 'You are a friendly, concise assistant.' })
  return flow
}

const SAMPLE_HANDBOOK = `# Account help

## Resetting your password
Open Settings → Security and choose "Reset password". A link is emailed to you and stays valid for 30 minutes. If the email doesn't arrive, check your spam folder or ask support to resend it.

## Two-factor authentication
Two-factor authentication (2FA) adds a code from an authenticator app at sign-in. Turn it on under Settings → Security → Two-factor. Keep the recovery codes somewhere safe: each works once if you lose your phone.

## Closing an account
Accounts can be closed from Settings → Account → Close account. Data is kept for 14 days in case you change your mind, then deleted permanently.

## Billing
Invoices are emailed on the first of each month. Plans can be changed at any time; the difference is charged or credited pro rata.`

function ragFlow(): Flow {
  const start = createNode('start', { key: 'start', position: at(0, 60), input: 'I never got the email to reset my password' })
  const rewrite = segment('rewrite', 'Rewrite as a search query', 300, 60, [
    user('Rewrite this request as a short search query for a help centre:\n\n{{input}}')
  ], { ephemeral: true, context: 'isolated', temperature: 0, schema: JSON.stringify({ type: 'object', properties: { query: { type: 'string', minLength: 1 } }, required: ['query'], additionalProperties: false }, null, 2) })
  const answer = segment('answer', 'Answer with sources', 640, 60, [user('{{input}}')])
  const end = createNode('end', { key: 'end', position: at(980, 60) })
  const docs = createNode('knowledge', {
    key: 'handbook',
    title: 'Help centre',
    position: at(640, 300),
    query: '{{nodes.rewrite.output.query}}',
    documents: [{ id: createId(), name: 'Account help', text: SAMPLE_HANDBOOK }],
    chunkSize: 400,
    chunkOverlap: 60,
    topK: 3
  })
  return flowOf([start, rewrite, answer, end, docs], [
    [start, 'out', rewrite],
    [rewrite, 'out', answer],
    [answer, 'out', end],
    [docs, 'ctx', answer]
  ], { system: 'You are a support assistant for an online service.' })
}

function routerFlow(): Flow {
  const start = createNode('start', { key: 'start', position: at(0, 160), input: 'The app logged me out three times today and I lost my work.' })
  const classify = segment('classify', 'Classify', 300, 160, [
    user('Classify this message from a customer:\n\n{{input}}')
  ], {
    ephemeral: true,
    context: 'isolated',
    temperature: 0,
    schema: JSON.stringify({
      type: 'object',
      properties: { category: { type: 'string', enum: ['question', 'complaint', 'feedback', 'other'] }, reason: { type: 'string' } },
      required: ['category'],
      additionalProperties: false
    }, null, 2)
  })
  const route = createNode('condition', {
    key: 'route',
    title: 'Route',
    position: at(620, 160),
    branches: [
      { id: createId(), label: 'Complaint', expression: 'nodes.classify.output.category == "complaint"' },
      { id: createId(), label: 'Question', expression: 'nodes.classify.output.category == "question"' }
    ]
  })
  const team = createNode('group', {
    key: 'responders',
    title: 'Responders',
    position: at(920, -60),
    width: 360,
    height: 560,
    system: 'Reply to the customer in at most three sentences.'
  })
  const apologise = segment('apologise', 'Apologise and help', 50, 60, [user('{{input}}')], { parentId: team.id })
  const explain = segment('explain', 'Answer the question', 50, 230, [user('{{input}}')], { parentId: team.id })
  const thank = segment('thank', 'Thank them', 50, 390, [user('{{input}}')], { parentId: team.id })
  apologise.blocks.unshift(system('The customer is unhappy. Acknowledge the problem and say what happens next.'))
  const end = createNode('end', { key: 'end', position: at(1360, 160) })
  const tip = createNode('note', {
    key: 'tip',
    position: at(300, 340),
    text: 'Tip: give “Classify” a small, fast model and the Responders group a larger one: each segment and group has its own model picker.'
  })
  return flowOf([start, classify, route, team, apologise, explain, thank, end, tip], [
    [start, 'out', classify],
    [classify, 'out', route],
    [route, route.branches[0]!.id, apologise],
    [route, route.branches[1]!.id, explain],
    [route, 'else', thank],
    [apologise, 'out', end],
    [explain, 'out', end],
    [thank, 'out', end]
  ])
}

function reflectionFlow(): Flow {
  const start = createNode('start', { key: 'start', position: at(0, 120), input: 'why sleep matters for learning' })
  const draft = segment('draft', 'Draft', 280, 120, [user('Write one short paragraph about {{input}}.')], { saveAs: 'draft', ephemeral: true })
  const loop = createNode('loop', { key: 'rounds', title: 'Up to 3 rounds', position: at(580, 120), mode: 'count', count: 3, max: 3 })
  const review = createNode('group', {
    key: 'review',
    title: 'Review',
    position: at(860, 0),
    width: 760,
    height: 380,
    context: 'isolated',
    ephemeral: true,
    system: 'You are a demanding editor.'
  })
  const critique = segment('critique', 'Critique', 40, 60, [user('Score this paragraph from 1 to 10 against the style guide and say what to improve.\n\n{{vars.draft}}')], {
    parentId: review.id,
    temperature: 0,
    schema: JSON.stringify({
      type: 'object',
      properties: { score: { type: 'integer', minimum: 1, maximum: 10 }, feedback: { type: 'string' } },
      required: ['score', 'feedback'],
      additionalProperties: false
    }, null, 2)
  })
  const good = createNode('condition', {
    key: 'good_enough',
    title: 'Good enough?',
    position: at(400, 60),
    parentId: review.id,
    branches: [{ id: createId(), label: 'Score ≥ 8', expression: 'nodes.critique.output.score >= 8' }]
  })
  const revise = segment('revise', 'Revise', 400, 200, [
    user('Rewrite the paragraph using the feedback. Reply with the paragraph only.\n\nParagraph:\n{{vars.draft}}\n\nFeedback:\n{{nodes.critique.output.feedback}}')
  ], { parentId: review.id, saveAs: 'draft' })
  const guide = createNode('memory', {
    key: 'style_guide',
    title: 'Style guide',
    position: at(40, 230),
    parentId: review.id,
    content: '- Plain words, short sentences.\n- One concrete example.\n- No more than 120 words.'
  })
  const end = createNode('end', { key: 'end', position: at(1700, 120), output: '{{vars.draft}}' })
  return flowOf([start, draft, loop, review, critique, good, revise, guide, end], [
    [start, 'out', draft],
    [draft, 'out', loop],
    [loop, 'body', critique],
    [loop, 'done', end],
    [critique, 'out', good],
    [good, good.branches[0]!.id, end],
    [good, 'else', revise],
    [revise, 'out', loop]
  ])
}

function perspectivesFlow(): Flow {
  const start = createNode('start', { key: 'start', position: at(0, 180), input: 'Should a small team switch to a four-day working week?' })
  const fanOut = createNode('parallel', {
    key: 'ask_three_ways',
    title: 'Ask three ways',
    position: at(300, 180),
    branches: [{ id: createId(), label: 'Optimist' }, { id: createId(), label: 'Skeptic' }, { id: createId(), label: 'Pragmatist' }]
  })
  const panel = createNode('group', {
    key: 'panel',
    title: 'Panel',
    position: at(620, -20),
    width: 360,
    height: 520,
    context: 'isolated',
    ephemeral: true,
    system: 'Give your view in at most four sentences.'
  })
  const view = (key: string, title: string, y: number, stance: string) =>
    segment(key, title, 50, y, [system(stance), user('{{input}}')], { parentId: panel.id })
  const optimist = view('optimist', 'Optimist', 60, 'You see the opportunities in any change.')
  const skeptic = view('skeptic', 'Skeptic', 220, 'You look for the risks and hidden costs in any change.')
  const pragmatist = view('pragmatist', 'Pragmatist', 380, 'You care about what it would take to make a change work in practice.')
  const views = createNode('join', { key: 'views', title: 'Views', position: at(1060, 180) })
  const weigh = segment('weigh', 'Weigh them up', 1360, 180, [
    user('Question: {{input}}\n\nOptimist: {{nodes.views.output.optimist}}\n\nSkeptic: {{nodes.views.output.skeptic}}\n\nPragmatist: {{nodes.views.output.pragmatist}}\n\nWeigh these views and give a balanced recommendation.')
  ])
  const end = createNode('end', { key: 'end', position: at(1700, 180) })
  const tip = createNode('note', {
    key: 'tip',
    position: at(300, 400),
    text: 'The three branches run at the same time, each on its own copy of the conversation. The Join collects their replies by branch name.'
  })
  return flowOf([start, fanOut, panel, optimist, skeptic, pragmatist, views, weigh, end, tip], [
    [start, 'out', fanOut],
    [fanOut, fanOut.branches[0]!.id, optimist],
    [fanOut, fanOut.branches[1]!.id, skeptic],
    [fanOut, fanOut.branches[2]!.id, pragmatist],
    [optimist, 'out', views],
    [skeptic, 'out', views],
    [pragmatist, 'out', views],
    [views, 'out', weigh],
    [weigh, 'out', end]
  ])
}

const SAMPLE_BEES = `Honeybees live in colonies of tens of thousands. A single queen lays the eggs, while the workers gather food, build comb and defend the hive.

Foragers tell each other where they found flowers with the waggle dance: its angle gives the direction relative to the sun, and its length the distance.

In winter the colony clusters around the queen and shivers its flight muscles to keep the centre warm, living on the honey stored over the summer.`

function mapReduceFlow(): Flow {
  const start = createNode('start', { key: 'start', position: at(0, 100), input: SAMPLE_BEES })
  const split = createNode('set', {
    key: 'split',
    title: 'Split into parts',
    position: at(300, 100),
    assignments: [{ id: createId(), name: 'parts', expression: 'split(trim(input), "\\n\\n")' }]
  })
  const each = createNode('parallel', { key: 'each_part', title: 'Each part', position: at(600, 100), mode: 'map', items: 'vars.parts' })
  const summarise = segment('summarise', 'Summarise a part', 900, 100, [
    user('Summarise part {{branch.index + 1}} of {{branch.total}} in one sentence:\n\n{{branch.item}}')
  ], { context: 'isolated', ephemeral: true, temperature: 0 })
  const summaries = createNode('join', { key: 'summaries', title: 'Summaries', position: at(1220, 100) })
  const combine = segment('combine', 'Combine', 1520, 100, [
    user('Combine these summaries into one short paragraph:\n\n{{join(nodes.summaries.output, " ")}}')
  ])
  const end = createNode('end', { key: 'end', position: at(1860, 100) })
  return flowOf([start, split, each, summarise, summaries, combine, end], [
    [start, 'out', split],
    [split, 'out', each],
    [each, 'each', summarise],
    [summarise, 'out', summaries],
    [summaries, 'out', combine],
    [combine, 'out', end]
  ])
}

function extractionFlow(): Flow {
  const start = createNode('start', {
    key: 'start',
    position: at(0, 60),
    input: 'Met Priya (product lead at Northwind) and Tom Okafor from Contoso at the expo. Priya wants a demo next week; Tom asked for pricing.'
  })
  const extract = segment('extract', 'Extract contacts', 300, 60, [
    user('List every person mentioned, with their company and what they asked for.\n\n{{input}}')
  ], {
    context: 'isolated',
    temperature: 0,
    schema: JSON.stringify({
      type: 'object',
      properties: {
        people: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, company: { type: 'string' }, request: { type: 'string' } },
            required: ['name'],
            additionalProperties: false
          }
        }
      },
      required: ['people'],
      additionalProperties: false
    }, null, 2)
  })
  const count = createNode('set', {
    key: 'tally',
    title: 'Count people',
    position: at(640, 60),
    assignments: [{ id: createId(), name: 'count', expression: 'len(nodes.extract.output.people)' }]
  })
  const end = createNode('end', { key: 'end', position: at(940, 60), output: '{{merge(nodes.extract.output, { count: vars.count })}}' })
  return flowOf([start, extract, count, end], [[start, 'out', extract], [extract, 'out', count], [count, 'out', end]])
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  { id: 'conversation', title: 'Conversation', description: 'One segment that replies, like a chat playground', icon: 'i-lucide-message-square', create: () => createConversationFlow([system(''), user('{{input}}')]) },
  { id: 'chat', title: 'Chatbot with memory', description: 'Ask → reply loop that remembers facts between runs', icon: 'i-lucide-messages-square', create: chatFlow },
  { id: 'rag', title: 'Knowledge Q&A (RAG)', description: 'Rewrite the question, retrieve passages, answer with citations', icon: 'i-lucide-library', create: ragFlow },
  { id: 'router', title: 'Router', description: 'Classify with a schema, then branch to specialised segments', icon: 'i-lucide-split', create: routerFlow },
  { id: 'reflection', title: 'Draft, critique, revise', description: 'A loop that improves a draft until a reviewer is satisfied', icon: 'i-lucide-repeat', create: reflectionFlow },
  { id: 'perspectives', title: 'Several perspectives', description: 'Ask three ways at the same time, then weigh up the answers', icon: 'i-lucide-git-fork', create: perspectivesFlow },
  { id: 'map', title: 'Summarise in parts', description: 'Split a text, summarise every part at the same time, then combine', icon: 'i-lucide-git-merge', create: mapReduceFlow },
  { id: 'extraction', title: 'Structured extraction', description: 'Pull JSON matching a schema out of free text', icon: 'i-lucide-braces', create: extractionFlow }
]
