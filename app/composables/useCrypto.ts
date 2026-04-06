// Helper to convert between ArrayBuffer and string
const ab2str = (buf: ArrayBuffer): string => new TextDecoder().decode(buf)

const str2ab = (str: string): ArrayBuffer => new TextEncoder().encode(str).buffer

export const useCrypto = () => {
  // Generate a random key for encryption (Store this securely in production!)
  const generateKey = async (): Promise<CryptoKey> => await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true, // extractable
    ['encrypt', 'decrypt']
  )

  const encrypt = async (data: object, password: string): Promise<string> => {
    try {
      // 1. Convert data to JSON string then to ArrayBuffer
      const rawData = JSON.stringify(data)
      const dataBuffer = str2ab(rawData)

      return await encryptCore(dataBuffer, password)
    } catch (error) {
      console.error('Encryption failed:', error)
      throw new Error('Failed to encrypt data')
    }
  }

  const decrypt = async (cipherTextBase64: string, password: string): Promise<unknown> => {
    try {
      // Decode Base64
      const combined = Uint8Array.from(atob(cipherTextBase64), c => c.charCodeAt(0))

      return JSON.parse(await decryptCore(combined, password))
    } catch (error) {
      console.error('Decryption failed:', error)
      throw new Error('Failed to decrypt data. Incorrect password or corrupted data.')
    }
  }

  const decryptCore = async (combined: Uint8Array<ArrayBuffer>, password: string): Promise<string> => {
    // Extract Salt (first 16 bytes)
    const salt = combined.slice(0, 16)
    const iv = combined.slice(16, 28) // Next 12 bytes
    const ciphertext = combined.slice(28)

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
      if (!password || !useFileHandler().canWrite(path, password)) return

      await useFileHandler().writeFile(path, new TextEncoder().encode(await encrypt(dataToEncrypt, password)))
    } catch {
      throw new Error('Encryption failed. Check password.')
    }
  }

  const decryptFile = async (path: string, password: string) => {
    try {
      const cipherText = await useFileHandler().readFile(path)
      return await decrypt(cipherText, password)
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

const encryptCore = async (dataBuffer: ArrayBuffer, password: string): Promise<string> => {
  // Use Password-based encryption
  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const key: CryptoKey = await deriveKey(password, salt)

  // We prepend the salt to the ciphertext so we can use it for decryption
  const iv: Uint8Array<ArrayBuffer> = window.crypto.getRandomValues(new Uint8Array(12))

  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  )

  // Combine Salt + IV + CipherText into one string for storage
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContent.byteLength)
  combined.set(salt)
  combined.set(iv, salt.byteLength)
  combined.set(new Uint8Array(encryptedContent), salt.byteLength + iv.byteLength)
  // @ts-ignore
  return combined.toBase64() // Base64 encode the whole thing
}

// Derive a key from a password (Useful if you want a user to type a password)
const deriveKey = async (password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => {
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
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}
