import { createHash } from 'node:crypto'

import { ProblemException } from '@api/common/api-problem.filter'

/**
 * Downloads one isolate streams at once, and per account, as the API counts
 * them per process (exports.controller.ts, attachments.controller.ts). A
 * slot is returned by calling what `take` gives, once; when none is free
 * the caller is told to retry.
 */
export class DownloadSlots {
  private running = 0
  private readonly byAccount = new Map<string, number>()

  constructor(private readonly perIsolate: number, private readonly perAccount = Number.POSITIVE_INFINITY, private readonly retryAfterSeconds = 5) {}

  take(accountId = ''): () => void {
    const mine = this.byAccount.get(accountId) ?? 0
    if (this.running >= this.perIsolate || mine >= this.perAccount) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: this.retryAfterSeconds })
    this.running += 1
    this.byAccount.set(accountId, mine + 1)
    let given = false
    return () => {
      if (given) return
      given = true
      this.running -= 1
      const left = (this.byAccount.get(accountId) ?? 1) - 1
      if (left > 0) this.byAccount.set(accountId, left)
      else this.byAccount.delete(accountId)
    }
  }
}

/**
 * Passes chunks through, failing if the total size or digest is not what was
 * recorded. With `holdLast` the final chunk waits until the whole body has
 * been checked, so nothing that fails the check is ever the last byte sent.
 */
export async function* verifiedChunks(body: AsyncIterable<Uint8Array>, bytes: number, sha256: string, holdLast = false): AsyncIterable<Uint8Array> {
  const hash = createHash('sha256')
  let seen = 0
  let held: Uint8Array | undefined
  for await (const chunk of body) {
    seen += chunk.byteLength
    if (seen > bytes) throw new Error('file is larger than recorded')
    hash.update(chunk)
    if (!holdLast) yield chunk
    else {
      if (held) yield held
      held = chunk
    }
  }
  if (seen !== bytes || hash.digest('hex') !== sha256) throw new Error('file does not match its record')
  if (held) yield held
}

export type StreamLimits = { idleMs?: number; totalMs?: number }

/** One step, or a failure when it takes longer than `ms`. */
export function within<T>(step: Promise<T>, ms: number | undefined, what: string): Promise<T> {
  if (ms === undefined) return step
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} stalled`)), ms)
  })
  return Promise.race([step, late]).finally(() => clearTimeout(timer))
}

/**
 * A response body from chunks: each must arrive within the idle limit and
 * the whole within the total limit, or the stream fails (the client sees the
 * connection cut, never a short file passed off as whole). `onClose` runs
 * once, however it ends. `first` is a chunk the caller already read.
 */
export function bodyStream(chunks: AsyncIterator<Uint8Array>, onClose: () => void, limits: StreamLimits = {}, first?: IteratorResult<Uint8Array>): ReadableStream<Uint8Array> {
  let closed = false
  let total: ReturnType<typeof setTimeout> | undefined
  let expired = false
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(total)
    // Not awaited: a source that stalled might never answer.
    void chunks.return?.().catch(() => undefined)
    onClose()
  }
  let pending = first
  return new ReadableStream<Uint8Array>({
    start() {
      if (limits.totalMs !== undefined) total = setTimeout(() => (expired = true), limits.totalMs)
    },
    async pull(controller) {
      try {
        if (expired) throw new Error('download timed out')
        const next = pending ?? (await within(chunks.next(), limits.idleMs, 'download'))
        pending = undefined
        if (next.done) {
          controller.close()
          close()
        } else controller.enqueue(next.value)
      } catch (error) {
        controller.error(error)
        close()
      }
    },
    cancel() {
      close()
    },
  })
}

/** Workers' FixedLengthStream, so a streamed body is sent with its Content-Length; absent in Node. */
type FixedLength = new (length: number) => TransformStream<Uint8Array, Uint8Array>

/** A file response with its recorded length (the v1 headers are added by the dispatcher). */
export function fileResponse(body: ReadableStream<Uint8Array> | Uint8Array, file: { contentType: string; bytes: number; fileName?: string }): Response {
  const headers: Record<string, string> = { 'content-type': file.contentType, 'content-length': String(file.bytes) }
  if (file.fileName !== undefined) headers['content-disposition'] = `attachment; filename="${file.fileName}"`
  const Fixed = (globalThis as { FixedLengthStream?: FixedLength }).FixedLengthStream
  if (body instanceof ReadableStream && Fixed) return new Response(body.pipeThrough(new Fixed(file.bytes)), { headers })
  return new Response(body as unknown as BodyInit, { headers })
}
