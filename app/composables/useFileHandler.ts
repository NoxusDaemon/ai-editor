import { invoke } from '@tauri-apps/api/core'
import { MIN_HEADER_READ, useCrypto } from './useCrypto'

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
    let existingData: Uint8Array<ArrayBuffer> | null = null
    try {
      existingData = await readExact(path, MIN_HEADER_READ)
    } catch {
      // File does not exist or is too small — can write
      return true
    }

    // Check if file is empty (all zeros) — new file, safe to write
    if (existingData.every(b => b === 0)) {
      return true
    }

    // File has content — verify it's a valid encrypted file with the correct password
    try {
      const decryptedResult = await useCrypto().decryptCore(existingData, password)
      // Valid JSON array start
      if (!decryptedResult.startsWith('[')) return false
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
