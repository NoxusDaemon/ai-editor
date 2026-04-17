// Helper to convert between ArrayBuffer and string (for JSON payload only)
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

  const encrypt = async (data: object, password: string): Promise<Uint8Array> => {
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

  const decrypt = async (cipherText: Uint8Array<ArrayBuffer> , password: string): Promise<unknown> => {
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
      
      // Pass binary Uint8Array directly to writeFile. 
      // Ensure useFileHandler supports binary writes in your Tauri setup.
      await useFileHandler().writeFile(path, await encrypt(dataToEncrypt, password))
    } catch {
      throw new Error('Encryption failed. Check password.')
    }
  }

  const decryptFile = async (path: string, password: string) => {
    try {
      // Ensure useFileHandler returns Uint8Array/Binary data here.
      // If it returns a string by default, you may need to adjust the file handler config.
      const cipherText = await useFileHandler().readFile(path) as Uint8Array<ArrayBuffer> 
      
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

const encryptCore = async (dataBuffer: ArrayBuffer, password: string): Promise<Uint8Array> => {
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

  // Combine Salt + IV + CipherText into one Uint8Array for storage
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContent.byteLength)
  combined.set(salt)
  combined.set(iv, salt.byteLength)
  combined.set(new Uint8Array(encryptedContent), salt.byteLength + iv.byteLength)
  
  // Return raw binary instead of Base64 string
  return combined 
}

// Derive a key from a password (Useful if you want a user to type a password)
const deriveKey = async (password: string, salt: Uint8Array<ArrayBuffer> ): Promise<CryptoKey> => {
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
