/**
 * Crash recovery: a copy of the workspace with unsaved changes, kept in the
 * webview's IndexedDB until it is saved or discarded. Encrypted workspaces are
 * stored encrypted, in the same format as their file.
 */

export interface RecoverySnapshot {
  /** File bytes, exactly as a save would write them. */
  bytes: Uint8Array
  /** The file the changes belong to; absent for a workspace that was never saved. */
  name?: string
  path?: string
  savedAt: number
}

export interface RecoveryStore {
  read(): Promise<RecoverySnapshot | null>
  write(snapshot: RecoverySnapshot): Promise<void>
  clear(): Promise<void>
}

const DB_NAME = 'ai-editor'
const STORE = 'recovery'
const KEY = 'workspace'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.addEventListener('success', () => resolve(req.result))
    req.addEventListener('error', () => reject(req.error))
  })
}

export function createIndexedDbRecovery(): RecoveryStore {
  let db: Promise<IDBDatabase> | undefined

  const open = () => db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.addEventListener('upgradeneeded', () => req.result.createObjectStore(STORE))
    req.addEventListener('success', () => resolve(req.result))
    req.addEventListener('error', () => {
      db = undefined
      reject(req.error)
    })
  })

  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE)

  return {
    async read() {
      return (await request((await store('readonly')).get(KEY)) as RecoverySnapshot | undefined) ?? null
    },
    async write(snapshot) {
      await request((await store('readwrite')).put(snapshot, KEY))
    },
    async clear() {
      await request((await store('readwrite')).delete(KEY))
    }
  }
}
