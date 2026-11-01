import { beforeAll, describe, expect, it } from 'vitest'
import { createCipher, cryptoSettings, DecryptionError } from '~/lib/crypto'
import { decryptDocument, encodeEncryptedDocument, encodeJsonDocument, inspectDocument } from '~/lib/document'
import { InvalidDocumentError } from '~/lib/schema'
import { createDefaultSession, createSidebars } from '~/lib/workspace'

const workspace = { sessions: [createDefaultSession('Only')], sidebars: createSidebars() }

describe('document codec', () => {
  beforeAll(() => {
    cryptoSettings.iterations = 1_000
  })

  it('reads plain JSON workspaces immediately', () => {
    const inspected = inspectDocument(encodeJsonDocument(workspace))
    expect(inspected).toEqual({ kind: 'json', workspace })
  })

  it('writes human-readable JSON', () => {
    const text = new TextDecoder().decode(encodeJsonDocument(workspace))
    expect(text).toContain('\n  "format": "ai-editor"')
  })

  it('recognises encrypted workspaces and decrypts them', async () => {
    const bytes = await encodeEncryptedDocument(workspace, await createCipher('pw'))
    expect(inspectDocument(bytes)).toEqual({ kind: 'encrypted' })

    const decrypted = await decryptDocument(bytes, 'pw')
    expect(decrypted.workspace).toEqual(workspace)
    expect(decrypted.cipher).not.toBeNull()
    await expect(decryptDocument(bytes, 'nope')).rejects.toBeInstanceOf(DecryptionError)
  })

  it('treats unknown binary data as a legacy encrypted file', () => {
    const binary = new Uint8Array(64).fill(0xFF)
    expect(inspectDocument(binary)).toEqual({ kind: 'encrypted' })
  })

  it('rejects empty files and JSON that is not a workspace', () => {
    expect(() => inspectDocument(new Uint8Array())).toThrow('empty')
    expect(() => inspectDocument(new TextEncoder().encode('{"not":"ours"}'))).toThrow(InvalidDocumentError)
  })
})
