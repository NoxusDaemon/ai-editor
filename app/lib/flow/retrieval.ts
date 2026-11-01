/**
 * Retrieval for knowledge nodes and store memories (RAG): splitting documents
 * into overlapping chunks, keyword search (BM25), semantic search (embeddings,
 * cosine similarity), hybrid search (reciprocal rank fusion), and optional
 * diversification (maximal marginal relevance). Embeddings come from the caller.
 */
import type { KnowledgeDocument, SearchMode } from './types'

export interface Chunk {
  id: string
  documentId: string
  /** Document name, shown with the passage. */
  source: string
  /** Position of the chunk in its document. */
  index: number
  text: string
}

export interface RetrievalHit extends Chunk {
  /** 0–1, higher is more relevant. */
  score: number
}

export type Embedder = (texts: string[]) => Promise<number[][]>

export interface SearchOptions {
  mode: SearchMode
  topK: number
  minScore: number
  diversify: boolean
  /** Required for semantic and hybrid search. */
  embed?: Embedder
}

const SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ']
const BM25_K1 = 1.5
const BM25_B = 0.75
const RRF_K = 60
const MMR_LAMBDA = 0.7
const MAX_TOP_K = 50

function splitRecursively(text: string, size: number, separators: readonly string[]): string[] {
  if (text.length <= size) return [text]
  const [separator, ...rest] = separators
  if (separator === undefined) {
    const pieces: string[] = []
    for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size))
    return pieces
  }
  const parts = text.split(separator)
  if (parts.length === 1) return splitRecursively(text, size, rest)
  // Keep each separator with the text before it, so chunks read naturally.
  return parts.flatMap((part, i) => {
    const piece = i < parts.length - 1 ? part + separator : part
    return piece.length > size ? splitRecursively(piece, size, rest) : [piece]
  })
}

/** The end of `text`, at most `length` characters, starting at a word. */
function tail(text: string, length: number): string {
  if (length <= 0) return ''
  const end = text.slice(-length)
  const space = end.search(/\s/)
  return space > 0 && space < end.length - 1 ? end.slice(space + 1) : end
}

/**
 * Splits text into chunks of about `size` characters, breaking at paragraphs,
 * then lines, sentences and words, with about `overlap` characters repeated
 * between neighbours so a passage cut in two is still found.
 */
export function chunkText(text: string, size: number, overlap: number): string[] {
  const chunkSize = Math.max(50, Math.floor(size) || 800)
  const overlapSize = Math.min(Math.max(0, Math.floor(overlap) || 0), Math.floor(chunkSize / 2))
  const normalised = text.replace(/\r\n?/g, '\n').trim()
  if (!normalised) return []

  const chunks: string[] = []
  let current = ''
  for (const piece of splitRecursively(normalised, chunkSize, SEPARATORS)) {
    if (current && current.length + piece.length > chunkSize) {
      chunks.push(current.trim())
      current = tail(current, overlapSize)
    }
    current += piece
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function buildChunks(documents: readonly KnowledgeDocument[], size: number, overlap: number): Chunk[] {
  return documents.flatMap(doc => chunkText(doc.text, size, overlap).map((text, index) => ({
    id: `${doc.id}:${index}`,
    documentId: doc.id,
    source: doc.name || 'Untitled document',
    index,
    text
  })))
}

const STOP_WORDS = new Set((
  'a about an and any are as at be been but by can could did do does for from had has have he her him his how i if in into is it its '
  + 'just me more most my no not of on or other our out she so some than that the their them then there these they this those to too '
  + 'us was we were what when where which while who why will with would you your'
).split(' '))

/** Search terms: lower case, accents removed, stop words dropped, simple plurals folded. */
export function terms(text: string): string[] {
  const words = text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []
  return words
    .filter(word => word.length > 1 && !STOP_WORDS.has(word))
    .map(word => word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)
}

/** Okapi BM25 score of each document for the query. */
export function bm25(queryTerms: readonly string[], documents: readonly string[][]): number[] {
  const count = documents.length
  if (!count) return []
  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / count || 1
  const frequency = new Map<string, number>()
  for (const doc of documents) {
    for (const term of new Set(doc)) frequency.set(term, (frequency.get(term) ?? 0) + 1)
  }
  const unique = [...new Set(queryTerms)]
  return documents.map((doc) => {
    const counts = new Map<string, number>()
    for (const term of doc) counts.set(term, (counts.get(term) ?? 0) + 1)
    return unique.reduce((score, term) => {
      const tf = counts.get(term) ?? 0
      if (!tf) return score
      const df = frequency.get(term) ?? 0
      const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5))
      return score + idf * (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * doc.length / averageLength))
    }, 0)
  })
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size && !b.size) return 0
  let shared = 0
  for (const term of a) if (b.has(term)) shared++
  return shared / (a.size + b.size - shared)
}

/** Reciprocal rank fusion of several rankings (lists of indices, best first). */
export function fuseRankings(rankings: readonly number[][]): Map<number, number> {
  const fused = new Map<number, number>()
  for (const ranking of rankings) {
    ranking.forEach((index, rank) => fused.set(index, (fused.get(index) ?? 0) + 1 / (RRF_K + rank + 1)))
  }
  return fused
}

/** Picks `k` candidates balancing relevance against similarity to those already picked. */
function diversifyCandidates(candidates: { index: number, score: number }[], k: number, similarity: (a: number, b: number) => number) {
  const picked: { index: number, score: number }[] = []
  const pool = [...candidates]
  while (picked.length < k && pool.length) {
    let best = 0
    let bestValue = -Infinity
    pool.forEach((candidate, i) => {
      const redundancy = picked.length ? Math.max(...picked.map(p => similarity(candidate.index, p.index))) : 0
      const value = MMR_LAMBDA * candidate.score - (1 - MMR_LAMBDA) * redundancy
      if (value > bestValue) {
        bestValue = value
        best = i
      }
    })
    picked.push(...pool.splice(best, 1))
  }
  return picked
}

const descending = (scores: readonly number[], keep: (score: number) => boolean) =>
  scores.map((score, index) => ({ index, score })).filter(c => keep(c.score)).sort((a, b) => b.score - a.score)

/** The chunks most relevant to `query`, best first. */
export async function searchChunks(chunks: readonly Chunk[], query: string, options: SearchOptions): Promise<RetrievalHit[]> {
  if (!chunks.length || !query.trim()) return []
  const topK = Math.min(MAX_TOP_K, Math.max(1, Math.floor(options.topK) || 1))
  const minScore = Math.max(0, options.minScore || 0)

  let keyword: number[] | undefined
  if (options.mode !== 'semantic') {
    const raw = bm25(terms(query), chunks.map(chunk => terms(chunk.text)))
    const best = Math.max(0, ...raw)
    keyword = raw.map(score => best > 0 ? score / best : 0)
  }

  let vectors: number[][] | undefined
  let semantic: number[] | undefined
  if (options.mode !== 'keyword') {
    if (!options.embed) throw new Error('Semantic search needs an embedding model.')
    const [queryVector, ...chunkVectors] = await options.embed([query, ...chunks.map(chunk => chunk.text)])
    vectors = chunkVectors
    semantic = chunkVectors.map(vector => cosine(queryVector!, vector))
  }

  let candidates: { index: number, score: number }[]
  if (options.mode === 'keyword') {
    candidates = descending(keyword!, score => score > 0 && score >= minScore)
  } else if (options.mode === 'semantic') {
    candidates = descending(semantic!, score => score >= minScore)
  } else {
    const fused = fuseRankings([
      descending(keyword!, score => score > 0).map(c => c.index),
      descending(semantic!, score => score >= minScore).map(c => c.index)
    ])
    const best = 2 / (RRF_K + 1)
    candidates = [...fused].map(([index, score]) => ({ index, score: score / best })).sort((a, b) => b.score - a.score)
  }

  let selected = candidates.slice(0, topK)
  if (options.diversify && candidates.length > topK) {
    const termSets = vectors ? [] : chunks.map(chunk => new Set(terms(chunk.text)))
    const similarity = vectors
      ? (a: number, b: number) => cosine(vectors![a]!, vectors![b]!)
      : (a: number, b: number) => jaccard(termSets[a]!, termSets[b]!)
    selected = diversifyCandidates(candidates.slice(0, topK * 4), topK, similarity)
  }
  return selected.map(({ index, score }) => ({ ...chunks[index]!, score: Math.round(score * 1000) / 1000 }))
}

/** Numbered passages for the prompt, so the model can cite them as [1], [2], … */
export function formatContext(hits: readonly RetrievalHit[], instructions: string): string {
  const passages = hits.map((hit, i) => `[${i + 1}] ${hit.source}${hit.index ? ` (part ${hit.index + 1})` : ''}\n${hit.text}`)
  return [instructions.trim(), passages.join('\n\n') || '(No relevant passages were found.)'].filter(Boolean).join('\n\n')
}
