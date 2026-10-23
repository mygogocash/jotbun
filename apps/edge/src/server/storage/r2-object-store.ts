import { createHash } from 'node:crypto'

import { MAX_OBJECT_BYTES, ObjectStoreError, assertObjectKey, assertObjectPrefix, collectBody } from '@api/storage/object-store'
import type { ObjectBody, ObjectInfo, ObjectStore } from '@api/storage/object-store'

/** What the adapter reads of an R2 object (R2Object / R2ObjectBody). */
export type R2ObjectLike = {
  key: string
  size: number
  uploaded: Date
  customMetadata?: Record<string, string>
  httpMetadata?: { contentType?: string }
}

/** The slice of the Workers R2 binding (R2Bucket) this adapter uses. */
export type R2BucketLike = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | null,
    options?: { onlyIf?: Headers; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string>; sha256?: string },
  ): Promise<R2ObjectLike | null>
  head(key: string): Promise<R2ObjectLike | null>
  get(key: string): Promise<(R2ObjectLike & { body: ReadableStream<Uint8Array>; arrayBuffer(): Promise<ArrayBuffer> }) | null>
  delete(key: string): Promise<void>
  list(options: { prefix: string; cursor?: string; limit?: number; include?: 'customMetadata'[] }): Promise<{ objects: R2ObjectLike[]; truncated: boolean; cursor?: string }>
}

const sha256Hex = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

// Only if the key is free: R2 answers a failed precondition with null.
const IF_ABSENT = () => new Headers({ 'if-none-match': '*' })

/**
 * The ObjectStore on the Worker's R2 binding (no credentials, no public
 * URL). It keeps the S3 adapter's rules, so either can read what the other
 * wrote in one bucket: PUTs are conditional and never overwrite; the body's
 * SHA-256 goes with the upload for R2 to verify and is kept as the `sha256`
 * custom metadata (S3's `x-amz-meta-sha256`), which `head`, `list` and
 * `getStream` report and `get` checks. Bodies are buffered (at most
 * MAX_OBJECT_BYTES) so they can be hashed first. The binding has no
 * server-side copy, so `copy` reads the source through the Worker. Errors
 * carry only a code.
 */
export class R2ObjectStore implements ObjectStore {
  constructor(private readonly bucket: R2BucketLike, private readonly maxBytes = MAX_OBJECT_BYTES, private readonly pageSize = 1000) {}

  async putStream(key: string, body: ObjectBody, options: { contentType?: string; signal?: AbortSignal } = {}): Promise<{ bytes: number; sha256: string }> {
    assertObjectKey(key)
    const data = await collectBody(body, this.maxBytes, options.signal)
    const sha256 = sha256Hex(data)
    options.signal?.throwIfAborted()
    const stored = await this.call(() =>
      this.bucket.put(key, data, { onlyIf: IF_ABSENT(), sha256, customMetadata: { sha256 }, httpMetadata: { contentType: options.contentType ?? 'application/octet-stream' } }),
    )
    if (stored === null) throw new ObjectStoreError('exists')
    return { bytes: data.byteLength, sha256 }
  }

  async copy(sourceKey: string, destinationKey: string, options: { signal?: AbortSignal } = {}): Promise<boolean> {
    assertObjectKey(sourceKey)
    assertObjectKey(destinationKey)
    options.signal?.throwIfAborted()
    const source = await this.call(() => this.bucket.get(sourceKey))
    if (!source) return false
    if (source.size > this.maxBytes) {
      await source.body.cancel()
      throw new ObjectStoreError('too_large')
    }
    const data = new Uint8Array(await this.call(() => source.arrayBuffer()))
    const recorded = source.customMetadata?.sha256
    if (recorded && recorded !== sha256Hex(data)) throw new ObjectStoreError('unavailable')
    options.signal?.throwIfAborted()
    const stored = await this.call(() =>
      this.bucket.put(destinationKey, data, {
        onlyIf: IF_ABSENT(),
        ...(recorded ? { sha256: recorded } : {}),
        customMetadata: { ...source.customMetadata },
        httpMetadata: { contentType: source.httpMetadata?.contentType ?? 'application/octet-stream' },
      }),
    )
    if (stored === null) throw new ObjectStoreError('exists')
    return true
  }

  async head(key: string, options: { signal?: AbortSignal } = {}): Promise<ObjectInfo | null> {
    assertObjectKey(key)
    options.signal?.throwIfAborted()
    const object = await this.call(() => this.bucket.head(key))
    return object ? infoOf(object) : null
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertObjectKey(key)
    const object = await this.call(() => this.bucket.get(key))
    if (!object) return null
    if (object.size > this.maxBytes) {
      await object.body.cancel()
      throw new ObjectStoreError('too_large')
    }
    const data = new Uint8Array(await this.call(() => object.arrayBuffer()))
    const expected = object.customMetadata?.sha256
    if (expected && expected !== sha256Hex(data)) throw new ObjectStoreError('unavailable')
    return data
  }

  /** Streams the body as R2 sends it; the caller checks size and digest against what it recorded. */
  async getStream(key: string): Promise<{ body: AsyncIterable<Uint8Array>; bytes: number; sha256: string } | null> {
    assertObjectKey(key)
    const object = await this.call(() => this.bucket.get(key))
    if (!object) return null
    if (object.size > this.maxBytes) {
      await object.body.cancel()
      throw new ObjectStoreError('unavailable')
    }
    return { body: object.body as unknown as AsyncIterable<Uint8Array>, bytes: object.size, sha256: object.customMetadata?.sha256 ?? '' }
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key)
    await this.call(() => this.bucket.delete(key))
  }

  async list(prefix: string): Promise<ObjectInfo[]> {
    const found: ObjectInfo[] = []
    for await (const page of this.listPages(prefix)) found.push(...page)
    return found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  /** One list request per page, made when the previous page has been consumed. */
  async *listPages(prefix: string): AsyncIterable<ObjectInfo[]> {
    assertObjectPrefix(prefix)
    let cursor: string | undefined
    do {
      const listing = await this.call(() => this.bucket.list({ prefix, limit: this.pageSize, include: ['customMetadata'], ...(cursor ? { cursor } : {}) }))
      const page = listing.objects.filter((object) => object.key.startsWith(prefix)).map(infoOf)
      cursor = listing.truncated ? listing.cursor : undefined
      if (page.length > 0) yield page
    } while (cursor)
  }

  /** Runs one binding call; anything it throws is `unavailable`, with no provider text. */
  private async call<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof ObjectStoreError) throw error
      throw new ObjectStoreError('unavailable')
    }
  }
}

function infoOf(object: R2ObjectLike): ObjectInfo {
  return { key: object.key, bytes: object.size, sha256: object.customMetadata?.sha256 ?? '', lastModified: new Date(object.uploaded) }
}

/**
 * The store when no bucket is bound (a local run without R2): every call is
 * `unavailable`, so the storage routes answer 503 and the others keep working.
 */
export class UnavailableObjectStore implements ObjectStore {
  async putStream(): Promise<never> {
    throw new ObjectStoreError('unavailable')
  }
  async copy(): Promise<never> {
    throw new ObjectStoreError('unavailable')
  }
  async head(): Promise<never> {
    throw new ObjectStoreError('unavailable')
  }
  async get(): Promise<never> {
    throw new ObjectStoreError('unavailable')
  }
  async getStream(): Promise<never> {
    throw new ObjectStoreError('unavailable')
  }
  async delete(): Promise<never> {
    throw new ObjectStoreError('unavailable')
  }
  async list(): Promise<never> {
    throw new ObjectStoreError('unavailable')
  }
  async *listPages(): AsyncIterable<never> {
    throw new ObjectStoreError('unavailable')
  }
}
