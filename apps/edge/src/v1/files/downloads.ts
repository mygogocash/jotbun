import { DEFAULT_ATTACHMENT_LIMITS } from '@api/attachments/attachment-limits'
import { ProblemException } from '@api/common/api-problem.filter'

import { DownloadSlots, bodyStream, fileResponse, verifiedChunks, within } from '../../server/http/files'
import { R2ObjectStore, UnavailableObjectStore } from '../../server/storage/r2-object-store'
import { EXPORT_CONTENT_TYPE } from '../../vault/files/exports'
import type { StoredExportFile } from '../../vault/files/exports'
import type { StoredReceiptFile } from '../../vault/files/attachments'
import type { V1Env } from '../env'
import type { VaultReply } from '../protocol'
import type { WorkerContext } from '../worker-routes'
import { RECEIPT_LIMITS } from './receipts'

// File downloads the Worker streams from R2. Each download takes a slot first,
// as the API counts downloads per process; here the count is per isolate.
// A download asks the caller's vault, in one step, which stored file its grant
// names (the vault's refusal is the answer when it names none), then streams
// that object only while it matches what the vault recorded (matchingObject).
// 1B-T6 (serveExportFile), 1B-T8 (serveSnapshotChunk) and 1B-T9
// (serveReceiptFile) add their serve functions below, in that order, each
// under its own `// 1B-Tn:` line.

/** Export downloads one isolate streams at once (the API's EXPORT_DOWNLOADS_PER_PROCESS, 4). */
export const EXPORT_SLOTS = new DownloadSlots(4)

/** Receipt downloads one isolate streams at once, and per account (DEFAULT_ATTACHMENT_LIMITS: 8 and 2). */
export const RECEIPT_SLOTS = new DownloadSlots(DEFAULT_ATTACHMENT_LIMITS.downloadsPerProcess, DEFAULT_ATTACHMENT_LIMITS.downloadsPerAccount)

/** A file the vault recorded: its key, and the size and SHA-256 it was published with. */
export type StoredFile = { key: string; bytes: number; sha256: string }

/**
 * The R2 object of a recorded file, as a stream, only while its size and its
 * recorded digest still match the vault's record; otherwise 404 NOT_FOUND, so a
 * missing or swapped object is never served. It never reads the body whole: the
 * caller checks the digest as it streams (verifiedChunks).
 */
export async function matchingObject(env: Pick<V1Env, 'OBJECTS'>, file: StoredFile): Promise<AsyncIterable<Uint8Array>> {
  const store = env.OBJECTS ? new R2ObjectStore(env.OBJECTS) : new UnavailableObjectStore()
  const object = await store.getStream(file.key)
  if (!object || object.bytes !== file.bytes || (object.sha256 !== '' && object.sha256 !== file.sha256)) throw new ProblemException(404, 'NOT_FOUND')
  return object.body
}

// 1B-T6: exports.

/**
 * GET /v1/export-files/:grant (the edge's handler, on the vault). The
 * `exports.file` step names the caller's own ready, unexpired file; a grant
 * that is not current or not this person's is the vault's 404. Then the CSV
 * streams from R2 with its recorded length and its download name, its digest
 * checked as it goes. At most EXPORT_SLOTS downloads stream at once in an
 * isolate; more are 503 with a retry. The slot is returned when the body ends.
 */
export async function serveExportFile(w: WorkerContext): Promise<Response | VaultReply> {
  if (!w.vault) throw new Error('an export download needs a session')
  const reply = await w.vault.call('exports.file', { params: { grant: w.params.grant ?? '' } })
  if (!reply.ok) return reply
  const file = reply.body as StoredExportFile
  const release = EXPORT_SLOTS.take()
  try {
    const body = await matchingObject(w.env, file)
    const chunks = verifiedChunks(body, file.bytes, file.sha256)[Symbol.asyncIterator]()
    return fileResponse(bodyStream(chunks, release), { contentType: EXPORT_CONTENT_TYPE, bytes: file.bytes, fileName: file.fileName })
  } catch (error) {
    release()
    throw error
  }
}

// 1B-T9: receipts.

/**
 * GET /v1/attachment-files/:grant (the edge's handler, on the vault). The
 * `attachments.file` step names the image a current grant of this session
 * names, while a live record of the caller's still holds it; anything else is
 * the vault's 404. Then a RECEIPT_SLOTS slot for the account (503 with a retry
 * when none is free), the object only while it matches its record, and its
 * digest checked as it streams with the last chunk held until it matches. One
 * chunk is read within downloadIdleMs before any header, so a failure up to
 * then is 503 with a retry, never the failure's text; after it, a stall past
 * downloadIdleMs or a body still running at downloadTotalMs cuts the
 * connection. The slot is returned when the body ends.
 */
export async function serveReceiptFile(w: WorkerContext): Promise<Response | VaultReply> {
  if (!w.vault || !w.claims) throw new Error('a receipt download needs a session')
  const reply = await w.vault.call('attachments.file', { params: { grant: w.params.grant ?? '' } })
  if (!reply.ok) return reply
  const file = reply.body as StoredReceiptFile
  const release = RECEIPT_SLOTS.take(w.claims.accountId)
  let chunks: AsyncIterator<Uint8Array> | undefined
  try {
    const body = await matchingObject(w.env, file)
    chunks = verifiedChunks(body, file.bytes, file.sha256, true)[Symbol.asyncIterator]()
    const limits = { idleMs: RECEIPT_LIMITS.downloadIdleMs, totalMs: RECEIPT_LIMITS.downloadTotalMs }
    const first = await within(chunks.next(), limits.idleMs, 'receipt download')
    return fileResponse(bodyStream(chunks, release, limits, first), { contentType: file.contentType, bytes: file.bytes, fileName: file.fileName })
  } catch (error) {
    void chunks?.return?.().catch(() => undefined)
    release()
    if (error instanceof ProblemException) throw error
    throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })
  }
}
