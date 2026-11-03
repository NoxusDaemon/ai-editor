import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLmStudioProvider, DEFAULT_LMSTUDIO_URL, normaliseServerUrl } from '~/services/llm'

const sdk = vi.hoisted(() => ({
  constructed: [] as Array<{ baseUrl?: string }>,
  listDownloadedModels: vi.fn(),
  model: vi.fn(),
  dispose: vi.fn(async () => {})
}))

vi.mock('@lmstudio/sdk', () => ({
  LMStudioClient: class {
    system = { listDownloadedModels: sdk.listDownloadedModels }
    llm = { model: sdk.model };
    [Symbol.asyncDispose] = sdk.dispose
    constructor(options: { baseUrl?: string }) {
      sdk.constructed.push(options)
    }
  }
}))

/** Mimics the SDK's OngoingPrediction: async-iterable fragments that also resolve to a result. */
function prediction(fragments: Array<{ content: string, reasoningType: string }>, stats: object) {
  return Object.assign(Promise.resolve({ stats }), {
    async* [Symbol.asyncIterator]() {
      yield* fragments
    }
  })
}

const fetchMock = vi.fn(async () => new Response(null))

describe('LM Studio provider', () => {
  beforeEach(() => {
    sdk.constructed.length = 0
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('normalises server addresses', () => {
    expect(normaliseServerUrl('')).toBe(DEFAULT_LMSTUDIO_URL)
    expect(normaliseServerUrl(' ws://box:8080/ ')).toBe('ws://box:8080')
  })

  it('lists models sorted by name, connecting to an explicit address', async () => {
    sdk.listDownloadedModels.mockResolvedValue([
      { modelKey: 'z', displayName: 'Zeta' },
      { modelKey: 'a', displayName: '' }
    ])

    const models = await createLmStudioProvider().listModels()

    expect(models).toEqual([{ label: 'a', value: 'a' }, { label: 'Zeta', value: 'z' }])
    expect(sdk.constructed).toEqual([expect.objectContaining({ baseUrl: DEFAULT_LMSTUDIO_URL })])
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:1234/lmstudio-greeting', expect.objectContaining({ mode: 'no-cors' }))
  })

  it('explains an unreachable server without touching the SDK', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(createLmStudioProvider(() => 'ws://nowhere:1').listModels()).rejects.toThrow('not reachable at ws://nowhere:1')
    expect(sdk.constructed).toHaveLength(0)
  })

  it('streams text and reasoning separately and returns stats', async () => {
    const respond = vi.fn(() => prediction([
      { content: '<think>', reasoningType: 'reasoningStartTag' },
      { content: 'hmm', reasoningType: 'reasoning' },
      { content: '</think>', reasoningType: 'reasoningEndTag' },
      { content: 'Hi', reasoningType: 'none' }
    ], { stopReason: 'eosFound', tokensPerSecond: 10, predictedTokensCount: 4 }))
    sdk.model.mockResolvedValue({ respond })
    const onText = vi.fn()
    const onReasoning = vi.fn()
    const signal = new AbortController().signal
    const messages = [{ role: 'user' as const, content: 'Hello' }]

    const stats = await createLmStudioProvider().generate({ model: 'qwen', messages, signal, onText, onReasoning })

    expect(sdk.model).toHaveBeenCalledWith('qwen', { signal })
    expect(respond).toHaveBeenCalledWith(messages, { signal })
    expect(onText.mock.calls).toEqual([['Hi']])
    expect(onReasoning.mock.calls).toEqual([['hmm']])
    expect(stats).toEqual({ stopReason: 'eosFound', tokensPerSecond: 10, predictedTokens: 4, timeToFirstTokenSec: undefined })
  })

  it('carries a reply on by completing the chat formatted with the model’s template', async () => {
    const respond = vi.fn()
    const complete = vi.fn(() => prediction([{ content: ' fox.', reasoningType: 'none' }], { stopReason: 'eosFound' }))
    // A ChatML-like template that closes the assistant's message and adds nothing after it.
    const applyPromptTemplate = vi.fn(async (messages: Array<{ role: string, content: string }>) =>
      messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join(''))
    sdk.model.mockResolvedValue({ respond, complete, applyPromptTemplate })
    const onText = vi.fn()
    const messages = [{ role: 'user' as const, content: 'Tell a story' }]

    await createLmStudioProvider().generate({ model: 'qwen', messages, prefill: 'Once there was a', signal: new AbortController().signal, onText })

    expect(applyPromptTemplate).toHaveBeenCalledWith([...messages, { role: 'assistant', content: expect.any(String) }], { omitBosToken: true })
    expect(complete).toHaveBeenCalledWith('<|im_start|>user\nTell a story<|im_end|>\n<|im_start|>assistant\nOnce there was a', expect.anything())
    expect(respond).not.toHaveBeenCalled()
    expect(onText.mock.calls).toEqual([[' fox.']])
  })

  it('formats the chat without leaving out the start token on engines that can’t', async () => {
    const complete = vi.fn(() => prediction([], { stopReason: 'eosFound' }))
    const applyPromptTemplate = vi.fn(async (messages: Array<{ content: string }>, opts?: { omitBosToken?: boolean }) => {
      if (opts?.omitBosToken) throw new Error('llama-server /apply-template does not support omitBosToken.')
      return `[INST]${messages[0]!.content}[/INST]${messages[1]!.content}`
    })
    sdk.model.mockResolvedValue({ complete, applyPromptTemplate })

    await createLmStudioProvider().generate({ model: 'm', messages: [{ role: 'user', content: 'Hi' }], prefill: 'Hello', signal: new AbortController().signal, onText: vi.fn() })

    expect(complete).toHaveBeenCalledWith('[INST]Hi[/INST]Hello', expect.anything())
  })

  it('uses any loaded model when none is chosen', async () => {
    sdk.model.mockResolvedValue({ respond: () => prediction([], { stopReason: 'eosFound' }) })
    await createLmStudioProvider().generate({ model: '', messages: [], signal: new AbortController().signal, onText: vi.fn() })
    expect(sdk.model).toHaveBeenCalledWith()
  })

  it('reuses the client, and reconnects after a failure or an address change', async () => {
    let url = ''
    const provider = createLmStudioProvider(() => url)
    sdk.listDownloadedModels.mockResolvedValue([])

    await provider.listModels()
    await provider.listModels()
    expect(sdk.constructed).toHaveLength(1)

    sdk.listDownloadedModels.mockRejectedValueOnce(new Error('socket closed'))
    await expect(provider.listModels()).rejects.toThrow('socket closed')
    await provider.listModels()
    expect(sdk.constructed).toHaveLength(2)

    url = 'ws://other:1234'
    await provider.listModels()
    expect(sdk.constructed.at(-1)).toMatchObject({ baseUrl: 'ws://other:1234' })
    await vi.waitFor(() => expect(sdk.dispose).toHaveBeenCalledTimes(2))
  })

  it('connects once for requests made together, and lets them finish when one fails', async () => {
    const provider = createLmStudioProvider()
    let finish!: () => void
    const slow = new Promise<void>((resolve) => {
      finish = resolve
    })
    sdk.model
      .mockImplementationOnce(async () => ({ respond: () => Object.assign(slow.then(() => ({ stats: { stopReason: 'eosFound' } })), { async* [Symbol.asyncIterator]() {} }) }))
      .mockRejectedValueOnce(new Error('No model "nope"'))
    const request = (model: string) => provider.generate({ model, messages: [], signal: new AbortController().signal, onText: vi.fn() })

    const running = request('slow')
    await expect(request('nope')).rejects.toThrow('No model')
    expect(sdk.constructed).toHaveLength(1)
    expect(sdk.dispose).not.toHaveBeenCalled()

    finish()
    await expect(running).resolves.toMatchObject({ stopReason: 'eosFound' })
    await vi.waitFor(() => expect(sdk.dispose).toHaveBeenCalledTimes(1))
  })
})
