/**
 * LLM access via LM Studio's SDK. The SDK is loaded lazily (it is large) and a
 * single client is shared across the app; it is recreated if the server URL
 * changes or a request fails.
 */
import type { LMStudioClient } from '@lmstudio/sdk'
import type { ChatMessage, GenerateStats } from '~/lib/blocks'

export type { GenerateStats }

export interface ModelOption {
  label: string
  value: string
}

export interface GenerateRequest {
  /** Model key; empty uses whichever model LM Studio has loaded. */
  model: string
  messages: ChatMessage[]
  signal: AbortSignal
  onText: (delta: string) => void
  onReasoning?: (delta: string) => void
  temperature?: number
  maxTokens?: number
  /** Constrains the reply to JSON matching this schema, where the model supports it. */
  jsonSchema?: object
}

export type ModelKind = 'llm' | 'embedding'

export interface LlmProvider {
  listModels(kind?: ModelKind): Promise<ModelOption[]>
  generate(request: GenerateRequest): Promise<GenerateStats>
  /** One vector per text, in order. */
  embed(model: string, texts: string[], signal?: AbortSignal): Promise<number[][]>
}

export const DEFAULT_LMSTUDIO_URL = 'ws://127.0.0.1:1234'
const PROBE_TIMEOUT_MS = 3000

// The SDK logs every failed connection attempt; errors are surfaced in the UI instead.
const quietLogger = {
  info: () => {},
  debug: () => {},
  warn: (...messages: unknown[]) => console.warn('[LM Studio]', ...messages),
  error: (...messages: unknown[]) => console.debug('[LM Studio]', ...messages)
}

export function normaliseServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '') || DEFAULT_LMSTUDIO_URL
}

/**
 * Checks the server answers before handing it to the SDK. In the webview the SDK
 * neither awaits its own probe nor handles WebSocket errors safely, so an
 * unreachable server would otherwise surface as uncaught exceptions.
 * `no-cors` keeps this a pure reachability check.
 */
async function assertReachable(url: string) {
  try {
    await fetch(`${url.replace(/^ws/, 'http')}/lmstudio-greeting`, {
      mode: 'no-cors',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
  } catch {
    throw new Error(`LM Studio is not reachable at ${url}. Start its local server (\`lms server start --cors\`) or change the address in Settings.`)
  }
}

export function createLmStudioProvider(getServerUrl: () => string = () => ''): LlmProvider {
  let client: LMStudioClient | undefined
  let clientUrl: string | undefined

  function reset() {
    void client?.[Symbol.asyncDispose]().catch(() => {})
    client = undefined
    clientUrl = undefined
  }

  async function getClient(): Promise<LMStudioClient> {
    const url = normaliseServerUrl(getServerUrl())
    if (client && clientUrl === url) return client
    reset()
    await assertReachable(url)
    const { LMStudioClient } = await import('@lmstudio/sdk')
    client = new LMStudioClient({ baseUrl: url, logger: quietLogger })
    clientUrl = url
    return client
  }

  /** Drops the client after a failure so the next call reconnects from scratch. */
  async function withClient<T>(task: (client: LMStudioClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
      return await task(await getClient())
    } catch (error) {
      if (!signal?.aborted) reset()
      throw error
    }
  }

  return {
    listModels: (kind = 'llm') => withClient(async (c) => {
      const models = kind === 'llm' ? await c.system.listDownloadedModels('llm') : await c.system.listDownloadedModels('embedding')
      return models
        .map(m => ({ label: m.displayName || m.modelKey, value: m.modelKey }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }),

    generate: ({ model, messages, signal, onText, onReasoning, temperature, maxTokens, jsonSchema }) => withClient(async (c) => {
      const llm = model ? await c.llm.model(model, { signal }) : await c.llm.model()
      signal.throwIfAborted()

      const prediction = llm.respond(messages, {
        signal,
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { maxTokens }),
        ...(jsonSchema && { structured: { type: 'json' as const, jsonSchema } })
      })
      for await (const fragment of prediction) {
        if (fragment.reasoningType === 'none') onText(fragment.content)
        else if (fragment.reasoningType === 'reasoning') onReasoning?.(fragment.content)
      }
      const { stats } = await prediction
      return {
        stopReason: stats.stopReason,
        tokensPerSecond: stats.tokensPerSecond,
        predictedTokens: stats.predictedTokensCount,
        timeToFirstTokenSec: stats.timeToFirstTokenSec
      }
    }, signal),

    embed: (model, texts, signal) => withClient(async (c) => {
      if (!texts.length) return []
      const embedder = await c.embedding.model(model, { signal })
      signal?.throwIfAborted()
      const results = await embedder.embed(texts)
      return results.map(result => result.embedding)
    }, signal)
  }
}
