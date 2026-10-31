import { beforeAll, describe, expect, it } from 'vitest'
import { createCipher, cryptoSettings, decrypt, DecryptionError, isEncryptedEnvelope } from '~/lib/crypto'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Builds a file the way the original app did: salt | iv | AES-GCM ciphertext, 100k iterations. */
async function legacyEncrypt(text: string, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text)))
  const out = new Uint8Array(28 + ciphertext.length)
  out.set(salt)
  out.set(iv, 16)
  out.set(ciphertext, 28)
  return out
}

describe('crypto', () => {
  beforeAll(() => {
    // Production uses 600k iterations; tests only need the format to be right.
    cryptoSettings.iterations = 1_000
  })

  it('round-trips data and tags it with the envelope header', async () => {
    const cipher = await createCipher('correct horse')
    const sealed = await cipher.encrypt(encoder.encode('hello'))

    expect(isEncryptedEnvelope(sealed)).toBe(true)
    const { plaintext, cipher: reusable } = await decrypt(sealed, 'correct horse')
    expect(decoder.decode(plaintext)).toBe('hello')
    expect(reusable?.iterations).toBe(1_000)
  })

  it('stores the iteration count in the header', async () => {
    const sealed = await (await createCipher('pw', 4_321)).encrypt(encoder.encode('x'))
    expect(new DataView(sealed.buffer).getUint32(9)).toBe(4_321)
  })

  it('uses a fresh IV for every save with the same cipher', async () => {
    const cipher = await createCipher('pw')
    const a = await cipher.encrypt(encoder.encode('same'))
    const b = await cipher.encrypt(encoder.encode('same'))
    expect(a).not.toEqual(b)
    expect(a.slice(0, 13 + 16)).toEqual(b.slice(0, 13 + 16)) // header + salt are shared
  })

  it('returns a cipher that can re-encrypt without a new key derivation', async () => {
    const original = await (await createCipher('pw')).encrypt(encoder.encode('v1'))
    const { cipher } = await decrypt(original, 'pw')
    const resaved = await cipher!.encrypt(encoder.encode('v2'))
    expect(decoder.decode((await decrypt(resaved, 'pw')).plaintext)).toBe('v2')
  })

  it('rejects a wrong password', async () => {
    const sealed = await (await createCipher('right')).encrypt(encoder.encode('secret'))
    await expect(decrypt(sealed, 'wrong')).rejects.toBeInstanceOf(DecryptionError)
  })

  it('detects tampering with the ciphertext or the header', async () => {
    const sealed = await (await createCipher('pw')).encrypt(encoder.encode('secret'))

    const body = sealed.slice()
    body[body.length - 1]! ^= 1
    await expect(decrypt(body, 'pw')).rejects.toBeInstanceOf(DecryptionError)

    const header = sealed.slice()
    header[8] = 99 // unknown envelope version
    await expect(decrypt(header, 'pw')).rejects.toThrow('Unsupported encryption format v99')
  })

  it('refuses absurd iteration counts instead of hanging', async () => {
    const sealed = await (await createCipher('pw')).encrypt(encoder.encode('x'))
    new DataView(sealed.buffer).setUint32(9, 0xFFFFFFFF)
    await expect(decrypt(sealed, 'pw')).rejects.toThrow('header is damaged')
  })

  it('decrypts files written by the original app', async () => {
    const legacy = await legacyEncrypt('[{"label":"1"}]', 'old-password')

    expect(isEncryptedEnvelope(legacy)).toBe(false)
    const { plaintext, cipher } = await decrypt(legacy, 'old-password')
    expect(decoder.decode(plaintext)).toBe('[{"label":"1"}]')
    expect(cipher).toBeNull() // caller re-encrypts with the current format
  })

  it('rejects data too short to be encrypted', async () => {
    await expect(decrypt(new Uint8Array(10), 'pw')).rejects.toThrow('too short')
  })
})
