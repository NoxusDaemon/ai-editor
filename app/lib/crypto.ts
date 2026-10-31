/**
 * Password-based encryption (PBKDF2-SHA256 → AES-256-GCM) using Web Crypto.
 *
 * Envelope v1 layout:
 *   "AIEDITOR" (8) | version (1) | PBKDF2 iterations, uint32 BE (4) | salt (16) | iv (12) | ciphertext + tag
 * The 13 header bytes are authenticated as AES-GCM additional data.
 *
 * Legacy layout (files from the original app): salt (16) | iv (12) | ciphertext + tag, 100k iterations.
 */

export type Bytes = Uint8Array<ArrayBuffer>

const MAGIC = new TextEncoder().encode('AIEDITOR')
const ENVELOPE_VERSION = 1
const HEADER_LENGTH = MAGIC.length + 1 + 4
const SALT_LENGTH = 16
const IV_LENGTH = 12
const TAG_LENGTH = 16
const LEGACY_ITERATIONS = 100_000
const MAX_ITERATIONS = 10_000_000

/** Mutable so tests can trade strength for speed. OWASP (2023) recommends 600k for PBKDF2-SHA256. */
export const cryptoSettings = { iterations: 600_000 }

export class DecryptionError extends Error {
  override name = 'DecryptionError'
}

export interface Cipher {
  readonly iterations: number
  /** Encrypts with the cached key and a fresh random IV. */
  encrypt(plaintext: Uint8Array): Promise<Bytes>
}

export interface DecryptResult {
  plaintext: Bytes
  /**
   * A cipher bound to the same key and salt, so re-saving does not need another
   * slow key derivation. `null` for legacy files, which should be re-encrypted
   * with a fresh cipher (upgrading them to the current envelope).
   */
  cipher: Cipher | null
}

const subtle = () => globalThis.crypto.subtle
const randomBytes = (length: number): Bytes => globalThis.crypto.getRandomValues(new Uint8Array(length))

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

function buildHeader(iterations: number): Bytes {
  const header = new Uint8Array(HEADER_LENGTH)
  header.set(MAGIC)
  header[MAGIC.length] = ENVELOPE_VERSION
  new DataView(header.buffer).setUint32(MAGIC.length + 1, iterations)
  return header
}

async function deriveKey(password: string, salt: Bytes, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function cipherFromKey(key: CryptoKey, salt: Bytes, iterations: number): Cipher {
  const header = buildHeader(iterations)
  return {
    iterations,
    async encrypt(plaintext) {
      const iv = randomBytes(IV_LENGTH)
      const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, new Uint8Array(plaintext))
      return concat(header, salt, iv, new Uint8Array(ciphertext))
    }
  }
}

export function isEncryptedEnvelope(data: Uint8Array): boolean {
  return data.byteLength >= MAGIC.length && MAGIC.every((byte, i) => data[i] === byte)
}

/** Smallest blob that could be a legacy encrypted file (empty plaintext). */
export const LEGACY_MIN_LENGTH = SALT_LENGTH + IV_LENGTH + TAG_LENGTH

export async function createCipher(password: string, iterations = cryptoSettings.iterations): Promise<Cipher> {
  const salt = randomBytes(SALT_LENGTH)
  return cipherFromKey(await deriveKey(password, salt, iterations), salt, iterations)
}

async function openCiphertext(key: CryptoKey, iv: Bytes, ciphertext: Bytes, additionalData?: Bytes): Promise<Bytes> {
  try {
    const params: AesGcmParams = additionalData ? { name: 'AES-GCM', iv, additionalData } : { name: 'AES-GCM', iv }
    return new Uint8Array(await subtle().decrypt(params, key, ciphertext))
  } catch {
    throw new DecryptionError('Incorrect password, or the file is damaged.')
  }
}

export async function decrypt(input: Uint8Array, password: string): Promise<DecryptResult> {
  const data = new Uint8Array(input)

  if (isEncryptedEnvelope(data)) {
    if (data.byteLength < HEADER_LENGTH + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw new DecryptionError('The encrypted file is truncated.')
    }
    const version = data[MAGIC.length]
    if (version !== ENVELOPE_VERSION) {
      throw new DecryptionError(`Unsupported encryption format v${version}.`)
    }
    const iterations = new DataView(data.buffer).getUint32(MAGIC.length + 1)
    if (iterations < 1 || iterations > MAX_ITERATIONS) {
      throw new DecryptionError('The encrypted file header is damaged.')
    }
    const header = data.slice(0, HEADER_LENGTH)
    const salt = data.slice(HEADER_LENGTH, HEADER_LENGTH + SALT_LENGTH)
    const iv = data.slice(HEADER_LENGTH + SALT_LENGTH, HEADER_LENGTH + SALT_LENGTH + IV_LENGTH)
    const ciphertext = data.slice(HEADER_LENGTH + SALT_LENGTH + IV_LENGTH)

    const key = await deriveKey(password, salt, iterations)
    const plaintext = await openCiphertext(key, iv, ciphertext, header)
    return { plaintext, cipher: cipherFromKey(key, salt, iterations) }
  }

  if (data.byteLength < LEGACY_MIN_LENGTH) {
    throw new DecryptionError('The file is too short to be encrypted data.')
  }
  const salt = data.slice(0, SALT_LENGTH)
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH)
  const key = await deriveKey(password, salt, LEGACY_ITERATIONS)
  return { plaintext: await openCiphertext(key, iv, ciphertext), cipher: null }
}
