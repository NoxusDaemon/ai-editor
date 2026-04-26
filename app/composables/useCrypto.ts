import { toRaw } from 'vue'

// Helper to convert between ArrayBuffer and string (for JSON payload only)
const ab2str = (buf: ArrayBuffer): string => new TextDecoder().decode(buf)

const str2ab = (str: string): ArrayBuffer => new TextEncoder().encode(str).buffer

/**
 * Safely serialize an object to JSON, handling:
 * - Vue reactive proxies (unwraps with toRaw)
 * - Circular references (detected via WeakSet)
 * - Non-serializable values (functions, symbols, undefined → removed)
 */
function safeJsonStringify(obj: unknown): string {
  const seen = new WeakSet()
  return JSON.stringify(obj, (_key, value) => {
    if (value != null && typeof value === 'object') {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
    }
    return value
  }, 2)
}

/**
 * Deep-unwrap Vue reactive proxies recursively.
 * toRaw() only unwraps the top level; nested proxies remain.
 */
function deepUnwrap(val: unknown): unknown {
  if (val == null) return val
  if (typeof val !== 'object') return val
  const raw = toRaw(val)
  if (raw === val) return val // not a proxy
  if (Array.isArray(raw)) return raw.map(item => deepUnwrap(item))
  const result: Record<string, unknown> = {}
  const rawObj = raw as Record<string, unknown>
  for (const key of Object.keys(rawObj)) {
    result[key] = deepUnwrap(rawObj[key])
  }
  return result
}

// Crypto constants
const SALT_LENGTH = 16
const IV_LENGTH = 12
const HEADER_LENGTH = SALT_LENGTH + IV_LENGTH // 28 bytes
export const MIN_HEADER_READ = HEADER_LENGTH + 1 // 29 bytes (salt + IV + first byte of ciphertext)
const PBKDF2_ITERATIONS = 100000
const AES_KEY_LENGTH = 256

// Web Crypto API availability check for Tauri compatibility
function ensureCryptoSubtle(): void {
  if (!window.crypto?.subtle) {
    throw new Error('Web Crypto API is not available in this environment')
  }
}

export const useCrypto = () => {
  // Generate a random key for encryption (Store this securely in production!)
  const generateKey = async (): Promise<CryptoKey> => {
    return await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: AES_KEY_LENGTH
      },
      true, // extractable
      ['encrypt', 'decrypt']
    )
  }

  const encrypt = async (data: object, password: string): Promise<Uint8Array> => {
    try {
      // 1. Deep-unwrap Vue reactive proxies, then safely serialize (handles circular refs)
      const unwrapped = deepUnwrap(data)
      const rawData = safeJsonStringify(unwrapped)
      const dataBuffer = str2ab(rawData)

      return await encryptCore(dataBuffer, password)
    } catch (error) {
      console.error('Encryption failed:', error)
      throw new Error('Failed to encrypt data')
    }
  }

  const decrypt = async <T = unknown>(cipherText: Uint8Array<ArrayBuffer>, password: string): Promise<T> => {
    try {
      // No Base64 decoding needed anymore. Input is raw binary.
      return JSON.parse(await decryptCore(cipherText, password))
    } catch (error) {
      console.error('Decryption failed:', error)
      throw new Error('Failed to decrypt data. Incorrect password or corrupted data.')
    }
  }

  const decryptCore = async (combined: Uint8Array<ArrayBuffer>, password: string): Promise<string> => {
    // Extract Salt (first 16 bytes)
    const salt = combined.slice(0, SALT_LENGTH)
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH) // Next 12 bytes
    const ciphertext = combined.slice(HEADER_LENGTH)

    const key: CryptoKey = await deriveKey(password, salt)

    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )

    return ab2str(decryptedContent)
  }

  const encryptFile = async (path: string, password: string, dataToEncrypt: object) => {
    try {
      if (!password) {
        throw new Error('Password is required')
      }

      // Pass binary Uint8Array directly to writeFile.
      await useFileHandler().writeFile(path, await encrypt(dataToEncrypt, password))
    } catch (error) {
      if (error instanceof Error) throw error
      throw new Error('Encryption failed. Check password.')
    }
  }

  const decryptFile = async (path: string, password: string): Promise<unknown> => {
    try {
      // Ensure useFileHandler returns Uint8Array/Binary data here.
      const cipherText = await useFileHandler().readFile(path)

      return await decrypt(cipherText as Uint8Array<ArrayBuffer>, password)
    } catch {
      throw new Error('Decryption failed. Wrong password?')
    }
  }

  return {
    decrypt,
    decryptCore,
    decryptFile,
    encrypt,
    encryptFile,
    generateKey
  }
}

const encryptCore = async (dataBuffer: ArrayBuffer, password: string): Promise<Uint8Array> => {
  ensureCryptoSubtle()
  // Use Password-based encryption
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const key: CryptoKey = await deriveKey(password, salt)

  // We prepend the salt to the ciphertext so we can use it for decryption
  const iv: Uint8Array<ArrayBuffer> = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  )

  // Combine Salt + IV + CipherText into one Uint8Array for storage
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContent.byteLength)
  combined.set(salt)
  combined.set(iv, salt.byteLength)
  combined.set(new Uint8Array(encryptedContent), salt.byteLength + iv.byteLength)

  // Return raw binary instead of Base64 string
  return combined
}

// Derive a key from a password (Useful if you want a user to type a password)
const deriveKey = async (password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => {
  ensureCryptoSubtle()
  const enc = new TextEncoder()
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}
