import { vi } from 'vitest'
import { provideServices, type Dialogs, type PasswordRequest } from '~/services/container'
import type { FileRef, FileSystem } from '~/services/files'
import type { GenerateRequest, GenerateStats, LlmProvider, ModelOption } from '~/services/llm'

/** In-memory file system: paths map to bytes; tests choose what the dialogs return. */
export class FakeFiles implements FileSystem {
  disk = new Map<string, Uint8Array>()
  nextOpen: string | null = null
  nextSave: string | null = null
  failWrites = false
  writes: string[] = []

  async pickAndRead() {
    const path = this.nextOpen
    if (!path) return null
    return { ref: { name: path, path }, bytes: this.disk.get(path)! }
  }

  async pickSaveTarget() {
    return this.nextSave ? { name: this.nextSave, path: this.nextSave } : null
  }

  async write(ref: FileRef, bytes: Uint8Array) {
    if (this.failWrites) throw new Error('Disk full')
    this.writes.push(ref.path!)
    this.disk.set(ref.path!, bytes)
  }

  canWriteInPlace(ref: FileRef) {
    return !!ref.path
  }
}

export function createFakeServices() {
  const files = new FakeFiles()
  const dialogs = {
    askPassword: vi.fn<Dialogs['askPassword']>(async () => null),
    confirm: vi.fn<Dialogs['confirm']>(async () => true),
    notify: vi.fn<Dialogs['notify']>()
  }
  const llm = {
    listModels: vi.fn<() => Promise<ModelOption[]>>(async () => []),
    generate: vi.fn<(request: GenerateRequest) => Promise<GenerateStats>>(async () => ({ stopReason: 'eosFound' }))
  } satisfies LlmProvider

  provideServices({ files, dialogs, llm })

  /** Answers password prompts like the real dialog: tries each password until `verify` accepts one. */
  function answerPasswords(...passwords: string[]) {
    dialogs.askPassword.mockImplementation(async (request: PasswordRequest) => {
      for (const password of passwords) {
        if (!request.verify || await request.verify(password)) return password
      }
      return null
    })
  }

  return { files, dialogs, llm, answerPasswords }
}
