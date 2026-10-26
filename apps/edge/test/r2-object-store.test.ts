// The ObjectStore contract (the cases of apps/api's
// s3-object-store.contract.spec.ts) on the R2 binding adapter, against
// Miniflare's R2: the same simulator `wrangler dev` runs. No real bucket.
import { createHash } from 'node:crypto'

import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ObjectStoreError } from '@api/storage/object-store'

import { R2ObjectStore } from '../src/server/storage/r2-object-store'
import type { R2BucketLike } from '../src/server/storage/r2-object-store'

const ACCOUNT = '0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11'
const JOB = '5f2c9d64-3b1e-4f7a-8c2d-9e0a1b2c3d4e'
const LEASE = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const key = (name: string) => `sync_snapshot/${ACCOUNT}/${JOB}/${LEASE}/${name}`
const text = (value: string) => new TextEncoder().encode(value)
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const read = (data: Uint8Array | null) => new TextDecoder().decode(data as Uint8Array)
async function* chunks(...parts: string[]) {
  for (const part of parts) yield text(part)
}

let mf: Miniflare
let bucket: R2BucketLike
let store: R2ObjectStore

beforeAll(async () => {
  // Miniflare 5's worker configuration: one module and one R2 binding.
  mf = new Miniflare({
    workers: [
      {
        config: {
          name: 'objects',
          compatibilityDate: '2026-10-01',
          manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch: () => new Response(null) }' } } },
          env: { OBJECTS: { type: 'r2', name: 'jotbun-test-objects' } },
        },
      },
    ],
  })
  bucket = (await mf.getR2Bucket('OBJECTS')) as unknown as R2BucketLike
}, 30_000)

afterAll(async () => {
  await mf?.dispose()
})

beforeEach(async () => {
  // Two per page, so paging is exercised with a handful of objects.
  store = new R2ObjectStore(bucket, undefined, 2)
  for (const object of await store.list(`sync_snapshot/${ACCOUNT}/`)) await store.delete(object.key)
})

describe('ObjectStore contract: R2 binding (Miniflare)', () => {
  it('streams an object in, reports its size and sha256, and reads it back', async () => {
    const result = await store.putStream(key('a.json'), chunks('{"a":', '1}'), { contentType: 'application/json' })
    expect(result).toEqual({ bytes: 7, sha256: sha('{"a":1}') })
    expect(await store.head(key('a.json'))).toMatchObject({ key: key('a.json'), bytes: 7, sha256: sha('{"a":1}') })
    expect(read(await store.get(key('a.json')))).toBe('{"a":1}')
  })

  it('never overwrites an existing key', async () => {
    await store.putStream(key('a.json'), text('first'))
    await expect(store.putStream(key('a.json'), text('second'))).rejects.toMatchObject({ code: 'exists' })
    expect(read(await store.get(key('a.json')))).toBe('first')
  })

  it('lists by prefix, and deletes idempotently', async () => {
    await store.putStream(key('a.json'), text('a'))
    await store.putStream(key('b.json'), text('bb'))
    expect((await store.list(`sync_snapshot/${ACCOUNT}/`)).map((o) => [o.key, o.bytes, o.sha256])).toEqual([
      [key('a.json'), 1, sha('a')],
      [key('b.json'), 2, sha('bb')],
    ])
    await store.delete(key('a.json'))
    await store.delete(key('a.json'))
    expect(await store.head(key('a.json'))).toBeNull()
    expect(await store.get(key('a.json'))).toBeNull()
  })

  it('copies an object inside the store, keeping its digest and never overwriting', async () => {
    await store.putStream(key('a.json'), chunks('{"a":', '1}'), { contentType: 'application/json' })
    expect(await store.copy(key('a.json'), key('b.json'))).toBe(true)
    expect(await store.head(key('b.json'))).toMatchObject({ key: key('b.json'), bytes: 7, sha256: sha('{"a":1}') })
    expect(read(await store.get(key('b.json')))).toBe('{"a":1}')
    expect(await store.head(key('a.json'))).toMatchObject({ bytes: 7 })
    // A missing source is not an error; an existing destination is never replaced.
    expect(await store.copy(key('absent.json'), key('c.json'))).toBe(false)
    expect(await store.head(key('c.json'))).toBeNull()
    await store.putStream(key('d.json'), text('other'))
    await expect(store.copy(key('a.json'), key('d.json'))).rejects.toMatchObject({ code: 'exists' })
    expect(read(await store.get(key('d.json')))).toBe('other')
    await expect(store.copy('../escape', key('e.json'))).rejects.toBeInstanceOf(ObjectStoreError)
    await expect(store.copy(key('a.json'), '/abs/path')).rejects.toBeInstanceOf(ObjectStoreError)
  })

  it('lists in pages that together are the whole listing', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) await store.putStream(key(`${name}.json`), text(name))
    const pages: string[][] = []
    for await (const page of store.listPages(`sync_snapshot/${ACCOUNT}/`)) pages.push(page.map((o) => o.key))
    expect(pages.flat()).toEqual(['a', 'b', 'c', 'd', 'e'].map((name) => key(`${name}.json`)))
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.every((page) => page.length > 0)).toBe(true)
  })

  it('streams a stored object with its recorded size and digest', async () => {
    await store.putStream(key('big.csv'), text('x'.repeat(200_000)))
    const object = await store.getStream(key('big.csv'))
    expect(object).toMatchObject({ bytes: 200_000, sha256: sha('x'.repeat(200_000)) })
    const hash = createHash('sha256')
    let seen = 0
    for await (const chunk of object!.body) {
      seen += chunk.byteLength
      hash.update(chunk)
    }
    expect([seen, hash.digest('hex')]).toEqual([200_000, sha('x'.repeat(200_000))])
    expect(await store.getStream(key('none.csv'))).toBeNull()
  })

  it('refuses objects over its size limit', async () => {
    const small = new R2ObjectStore(bucket, 4)
    await expect(small.putStream(key('five.txt'), text('12345'))).rejects.toMatchObject({ code: 'too_large' })
    await store.putStream(key('five.txt'), text('12345'))
    await expect(small.get(key('five.txt'))).rejects.toMatchObject({ code: 'too_large' })
  })

  it('reads a digest written over the S3 API (x-amz-meta-sha256 is custom metadata)', async () => {
    await bucket.put(key('s3.json'), text('{"s3":1}'), { customMetadata: { sha256: sha('{"s3":1}') } })
    expect(await store.head(key('s3.json'))).toMatchObject({ bytes: 8, sha256: sha('{"s3":1}') })
    await bucket.put(key('bad.json'), text('{"s3":2}'), { customMetadata: { sha256: sha('something else') } })
    await expect(store.get(key('bad.json'))).rejects.toMatchObject({ code: 'unavailable' })
  })

  it.each([['../escape'], ['/abs/path'], ['sync_snapshot/x/../y'], [''], ['UPPER/case'], ['a b']])('refuses the key %p', async (bad) => {
    await expect(store.putStream(bad, text('x'))).rejects.toBeInstanceOf(ObjectStoreError)
  })

  it('has no way to produce a public URL', () => {
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(store)).filter((name) => /url|presign|public/i.test(name))).toEqual([])
  })
})
