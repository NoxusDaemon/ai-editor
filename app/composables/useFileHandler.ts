import { invoke } from '@tauri-apps/api/core'
import { useCrypto } from './useCrypto'

export const useFileHandler = () => {
  const writeFile = async (path: string, data: Uint8Array): Promise<boolean> => {
    await invoke('write_file', { path, data })
    return true
  }

  // Tauri invoke returns number[] for Vec<u8>, wrap in Uint8Array for crypto compatibility
  const readExact = async (path: string, length: number): Promise<Uint8Array<ArrayBuffer>> =>
    new Uint8Array(await invoke<number[]>('read_file_bytes', { path, length }))

  const readFile = async (path: string): Promise<Uint8Array> =>
    new Uint8Array(await invoke<number[]>('read_file', { path }))

  const readFileText = async (path: string): Promise<string> =>
    new TextDecoder().decode(new Uint8Array(await invoke<number[]>('read_file', { path })))

  const canDecrypt = async (path: string, password: string): Promise<boolean> => {
    let existingData: Uint8Array
    try {
      existingData = await readFile(path)
    } catch {
      // File does not exist — safe to write
      return true
    }

    // Check if file is empty — new file, safe to write
    if (existingData.length === 0) {
      return true
    }

    // File has content — verify it's a valid encrypted file with the correct password.
    // Must read the FULL file (not just the header) because AES-GCM requires the
    // authentication tag (last 16 bytes of ciphertext) to verify the password.
    // Reading only 29 bytes leaves no room for the auth tag, so decryption always fails.
    try {
      const decryptedResult = await useCrypto().decryptCore(existingData, password)
      // Must start with valid JSON (array or object)
      const trimmed = decryptedResult.trimStart()
      if (trimmed[0] !== '[' && trimmed[0] !== '{') return false
      return true
    } catch {
      // Wrong password or not an encrypted file
      return false
    }
  }

  return {
    canDecrypt,
    readExact,
    readFile,
    readFileText,
    writeFile
  }
}
