/**
 * Converts between workspace sessions and file bytes (plain JSON or encrypted),
 * including detection of which kind a file is.
 */
import { decrypt, isEncryptedEnvelope, LEGACY_MIN_LENGTH, type Bytes, type Cipher } from './crypto'
import { InvalidDocumentError, parseWorkspace, serializeWorkspace } from './schema'
import type { Session } from './workspace'

export type InspectedDocument
  = | { kind: 'json', sessions: Session[] }
    | { kind: 'encrypted' }

export interface DecryptedDocument {
  sessions: Session[]
  cipher: Cipher | null
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function decodeJson(bytes: Uint8Array): { ok: true, value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(decoder.decode(bytes)) }
  } catch {
    return { ok: false }
  }
}

/** Works out what a file contains. Plain JSON is parsed straight away. */
export function inspectDocument(bytes: Uint8Array): InspectedDocument {
  if (isEncryptedEnvelope(bytes)) return { kind: 'encrypted' }

  const json = decodeJson(bytes)
  if (json.ok) return { kind: 'json', sessions: parseWorkspace(json.value) }

  // Files from the original app have no header; anything that is not text could be one.
  if (bytes.byteLength >= LEGACY_MIN_LENGTH) return { kind: 'encrypted' }
  throw new InvalidDocumentError(bytes.byteLength === 0 ? 'The file is empty.' : 'This file is not an AI Editor workspace.')
}

/** Throws `DecryptionError` for a wrong password, `InvalidDocumentError` for bad contents. */
export async function decryptDocument(bytes: Uint8Array, password: string): Promise<DecryptedDocument> {
  const { plaintext, cipher } = await decrypt(bytes, password)
  const json = decodeJson(plaintext)
  if (!json.ok) throw new InvalidDocumentError('The decrypted file is not valid JSON.')
  return { sessions: parseWorkspace(json.value), cipher }
}

export function encodeJsonDocument(sessions: readonly Session[]): Bytes {
  return encoder.encode(`${serializeWorkspace(sessions, 2)}\n`)
}

export function encodeEncryptedDocument(sessions: readonly Session[], cipher: Cipher): Promise<Bytes> {
  return cipher.encrypt(encoder.encode(serializeWorkspace(sessions)))
}
