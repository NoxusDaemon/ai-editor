/**
 * LLM access via LM Studio's SDK. The SDK is loaded lazily (it is large) and a
 * single client is shared across the app; it is replaced if the server URL
 * changes or a request fails. Several requests can run at once (parallel flow
 * branches), so a replaced client is only closed once nothing uses it.
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

interface Connection {
  url: string
  /** Shared by requests made while it connects, so there is only ever one. */
  client: Promise<LMStudioClient>
  /** Requests using it right now. */
  users: number
  /** Replaced by a newer connection; closed when its last request is done. */
  retired: boolean
}

export function createLmStudioProvider(getServerUrl: () => string = () => ''): LlmProvider {
  let connection: Connection | undefined

  function close(conn: Connection) {
    void conn.client.then(client => client[Symbol.asyncDispose]()).catch(() => {})
  }

  /** The next request reconnects from scratch; requests still using this one finish first. */
  function retire(conn: Connection) {
    if (connection === conn) connection = undefined
    conn.retired = true
    if (!conn.users) close(conn)
  }

  function connect(): Connection {
    const url = normaliseServerUrl(getServerUrl())
    if (connection?.url === url) return connection
    if (connection) retire(connection)
    const client = (async () => {
      await assertReachable(url)
      const { LMStudioClient } = await import('@lmstudio/sdk')
      return new LMStudioClient({ baseUrl: url, logger: quietLogger })
    })()
    connection = { url, client, users: 0, retired: false }
    return connection
  }

  async function withClient<T>(task: (client: LMStudioClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const conn = connect()
    conn.users++
    try {
      return await task(await conn.client)
    } catch (error) {
      if (!signal?.aborted) retire(conn)
      throw error
    } finally {
      conn.users--
      if (conn.retired && !conn.users) close(conn)
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
