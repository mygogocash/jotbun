import { RECEIPT_RETENTION_CONSENT, assertKnownFields } from '@gogospend/contracts'

import { DEFAULT_ATTACHMENT_LIMITS } from '@api/attachments/attachment-limits'
import type { AttachmentLimits } from '@api/attachments/attachment-limits'
import { commandHeaders } from '@api/commands/command-headers'
import { routeId } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'
import { parseConfirmBody } from '@api/imports/confirmation.service'

import { DownloadSlots } from '../../server/http/files'
import { R2ObjectStore, UnavailableObjectStore } from '../../server/storage/r2-object-store'
import { receiptChoice, supportsReceiptSchema } from '../../vault/files/attachments'
import type { PreparedCopy, StoredCopy } from '../../vault/files/attachments'
import type { ConfirmPrepared, ConfirmReceipt } from '../../vault/files/confirmation'
import type { V1Env } from '../env'
import type { VaultReply, VaultRouteId } from '../protocol'
import type { VaultSession, WorkerContext } from '../worker-routes'

// Retaining and replacing a receipt on the vault (1B-T9): ports of
// AttachmentService.withReceipt and prepare. The copy runs here, in the Worker,
// between two vault steps: `attachments.prepare` reserves the receipt key, the
// copy and its HEAD run under one deadline, then the command step publishes
// what the HEAD reported, and `attachments.release` gives back a copy the
// command did not use. Remove is one vault call (src/vault/routes.ts).

/**
 * The receipt limits in this isolate (the API's ATTACHMENT_LIMITS: one object,
 * read at use time; only tests change it). The copy and download slots are
 * fixed at their defaults: COPY_SLOTS here, RECEIPT_SLOTS in downloads.ts.
 */
export const RECEIPT_LIMITS: AttachmentLimits = { ...DEFAULT_ATTACHMENT_LIMITS }

/** Copies one isolate runs at once (the API's copiesPerProcess, 4); a busy isolate answers 503 with a retry before it reserves anything. */
export const COPY_SLOTS = new DownloadSlots(DEFAULT_ATTACHMENT_LIMITS.copiesPerProcess)

/** Told to a caller turned away because the isolate is busy or the store failed (the API's BUSY_RETRY_SECONDS). */
const BUSY_RETRY_SECONDS = 5
/** How often a request waiting on another's copy of the same image looks again (the API's WAIT_POLL_MS). */
const WAIT_POLL_MS = 75

/** The only request headers a receipt command step receives. */
const COMMAND_HEADERS = ['idempotency-key', 'x-gogospend-command-schema', 'if-match'] as const

const busy = () => new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: BUSY_RETRY_SECONDS })
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** One vault step whose problem reply is thrown as the ProblemException it carries. */
async function step<T>(vault: VaultSession, route: VaultRouteId, input: { params?: Record<string, string>; body?: unknown }): Promise<T> {
  const reply = await vault.call(route, input)
  if (!reply.ok) throw new ProblemException(reply.status, reply.code, reply.problem)
  return reply.body as T
}

/** gogospend_release_receipt_copy through its step: never fails the request. */
async function release(vault: VaultSession, key: string): Promise<void> {
  await vault.call('attachments.release', { body: { key } }).catch(() => undefined)
}

/** `work`, or the signal's reason once it aborts first: one deadline over every step of the copy. */
function beforeAbort<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    work()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
}

/**
 * Copies the import image to the reserved key inside the bucket, then reads
 * what is stored there, both under one deadline (copyDeadlineMs). Null when
 * the import image is gone. A failure gives the reservation back and is 503
 * with a retry, never the failure's text. The vault, not this code, decides
 * whether the stored copy is the registered image.
 */
async function copyOf(vault: VaultSession, env: Pick<V1Env, 'OBJECTS'>, prepared: Extract<PreparedCopy, { kind: 'copy' }>): Promise<StoredCopy | null> {
  const store = env.OBJECTS ? new R2ObjectStore(env.OBJECTS) : new UnavailableObjectStore()
  const signal = AbortSignal.timeout(RECEIPT_LIMITS.copyDeadlineMs)
  let stored: { bytes: number; sha256: string } | null
  try {
    stored = await beforeAbort(signal, async () => ((await store.copy(prepared.source_key, prepared.key, { signal })) ? store.head(prepared.key, { signal }) : null))
  } catch {
    await release(vault, prepared.key)
    throw busy()
  }
  if (!stored) {
    await release(vault, prepared.key)
    return null
  }
  return { key: prepared.key, bytes: stored.bytes, sha256: stored.sha256 }
}

/**
 * AttachmentService.prepare: the prepare step (`attachments.prepare`, or 1B-T10's
 * `imports.confirmPrepare`; the request's first, charged call) and, when it
 * answers `copy`, the copy. Each attempt holds a COPY_SLOTS slot from before
 * the step until the copy ends, so a busy isolate answers 503 before anything
 * is reserved. While another request is copying the same image (`wait`) it
 * looks again every 75 ms, up to copyDeadlineMs, then answers 503. A 429 from
 * the step is the answer. `refused` (a confirmation's read-only checks would
 * refuse its batch) reserves and copies nothing.
 */
async function prepare(w: WorkerContext, vault: VaultSession, route: 'attachments.prepare' | 'imports.confirmPrepare', input: unknown, params: Record<string, string> = {}): Promise<StoredCopy | null | 'refused'> {
  const deadline = Date.now() + RECEIPT_LIMITS.copyDeadlineMs
  for (;;) {
    const slot = COPY_SLOTS.take()
    try {
      const prepared = await step<ConfirmPrepared>(vault, route, { params, body: input })
      if (prepared.kind === 'refused') return 'refused'
      if (prepared.kind === 'none') return null
      if (prepared.kind === 'copy') return await copyOf(vault, w.env, prepared)
    } finally {
      slot()
    }
    if (Date.now() >= deadline) throw busy()
    await delay(WAIT_POLL_MS)
  }
}

/**
 * AttachmentService.withReceipt for retain (the record must hold none) and
 * replace (it must hold another): the command headers, the record's id and
 * the body are read as the API's controller reads them, then the consent and
 * the image's id; for a supported schema the copy is prepared (nothing is
 * copied for any other, which the command refuses); then the command step
 * with what the copy's HEAD reported, and in every case the release of a
 * copy it did not use.
 */
async function withReceipt(w: WorkerContext, route: 'attachments.retain' | 'attachments.replace', needs: 'none' | 'other'): Promise<VaultReply> {
  if (!w.vault) throw new Error('a receipt command needs a session')
  const vault = w.vault
  const command = commandHeaders(w.headers, 'required')
  const transactionId = routeId(w.params.id ?? '')
  const attachmentId = receiptChoice(assertKnownFields(w.body, ['attachment_id', 'consent']))
  const prepared = supportsReceiptSchema(command.schemaVersion)
    ? await prepare(w, vault, 'attachments.prepare', { attachment_id: attachmentId, command_id: command.commandId, record: { id: transactionId, expected_version: command.expectedVersion, needs } })
    : null
  // A receipt's prepare step never refuses; only a confirmation's does.
  const copy = prepared === 'refused' ? null : prepared
  try {
    const headers = Object.fromEntries(COMMAND_HEADERS.map((name) => [name, w.headers[name]]))
    return await vault.call(route, { params: { id: transactionId }, headers, body: { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT, prepared: copy } })
  } finally {
    if (copy) await release(vault, copy.key)
  }
}

/** POST /v1/transactions/:id/attachment: retains a preview's sanitized image as the record's receipt. */
export function retainRoute(w: WorkerContext): Promise<VaultReply> {
  return withReceipt(w, 'attachments.retain', 'none')
}

/** PUT /v1/transactions/:id/attachment: replaces the record's receipt; the one it held is deleted once nothing else holds it. */
export function replaceRoute(w: WorkerContext): Promise<VaultReply> {
  return withReceipt(w, 'attachments.replace', 'other')
}

// 1B-T10: confirmations.

/**
 * POST /v1/imports/:id/confirmations (ConfirmationService.confirm): the
 * import's id, the command headers (If-Match forbidden) and the batch are read
 * as the API's controller reads them. Without a receipt, one `imports.confirm`
 * step. With one, `imports.confirmPrepare` and the copy first (nothing is
 * reserved when the batch's read-only checks would refuse it), then
 * `imports.confirm` with what was prepared, and in every case the release of
 * a copy the command did not use.
 */
export async function confirmRoute(_w: WorkerContext): Promise<Response | VaultReply> {
  // 1B-T10 typed stub (RED): the confirmation answers 501. Step 4 puts the real function back.
  return new Response(null, { status: 501 })
}
