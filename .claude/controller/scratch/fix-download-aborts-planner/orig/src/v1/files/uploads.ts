import { ContractValidationError, IMPORT_FILE_NAME_HEADER, importFormatForContentType } from '@gogospend/contracts'
import type { SessionContext } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import type { ImportIntakeRepository } from '@api/imports/import.repository'
import { UploadIntake } from '@api/imports/upload-intake'

import { R2ObjectStore, UnavailableObjectStore } from '../../server/storage/r2-object-store'
import type { VaultClaims, VaultReply, VaultRouteId } from '../protocol'
import type { VaultSession, WorkerContext } from '../worker-routes'

// POST /v1/imports on the vault (1B-T5): the API's UploadIntake, unchanged,
// streams the body into R2 quarantine while each of its database steps is one
// step call to the caller's vault (B9). The route is marked `starts`, so the
// vault's parse starts after the 202 (B5).

/** An isolate takes at most this many uploads at once; more answer 503 with a retry (the API's per-process intake limit). */
export const MAX_UPLOADS_PER_ISOLATE = 16

let uploading = 0

/** The intake's session, from the verified claims: the vault names its account by the token's subject. */
export function sessionContextOf(claims: VaultClaims): SessionContext {
  return { accountId: claims.accountId, subject: claims.accountId, clientId: claims.clientId, bindingId: claims.sessionId, sessionGeneration: 0 }
}

/**
 * The intake's database port on the caller's vault: each method is one step
 * call. An ok reply's body is the result; a problem reply is thrown as the
 * ProblemException it carries.
 */
export function vaultIntakeRepository(session: VaultSession): ImportIntakeRepository {
  async function step<T>(route: VaultRouteId, body: unknown): Promise<T> {
    const reply = await session.call(route, { body })
    if (!reply.ok) throw new ProblemException(reply.status, reply.code, reply.problem)
    return reply.body as T
  }
  return {
    begin: (_ctx, input) => step('imports.begin', input),
    reservePart: async (_ctx, jobId, intakeToken, index) => (await step<{ key: string | null }>('imports.reservePart', { job_id: jobId, intake_token: intakeToken, index })).key,
    finish: (_ctx, input) => step('imports.finish', input),
    abort: async (_ctx, jobId, intakeToken, status, code) => (await step<{ keys: string[] }>('imports.abort', { job_id: jobId, intake_token: intakeToken, status, code })).keys,
    discarded: async (_ctx, jobId, intakeToken, keys) => {
      await step('imports.discarded', { job_id: jobId, intake_token: intakeToken, keys: [...keys] })
    },
    bytesRetry: async (_ctx, need) => (await step<{ seconds: number }>('imports.bytesRetry', { need })).seconds,
  }
}

/** The percent-encoded file name header, decoded; anything undecodable is an invalid name (fileNameFrom in src/server/app/routes.ts). */
function fileNameFrom(headers: Record<string, string | undefined>): string {
  const raw = headers[IMPORT_FILE_NAME_HEADER]
  if (raw === undefined) throw new ContractValidationError('INVALID_FILE_NAME', 'File name header is required.', 'file_name')
  try {
    return decodeURIComponent(raw)
  } catch {
    throw new ContractValidationError('INVALID_FILE_NAME', 'File name is not percent-encoded UTF-8.', 'file_name')
  }
}

/** contentLength in src/server/app/routes.ts. */
function contentLength(headers: Record<string, string | undefined>): number | null {
  const raw = headers['content-length']
  if (raw === undefined || !/^\d{1,16}$/.test(raw)) return null
  return Number(raw)
}

async function* emptyBody(): AsyncIterable<Uint8Array> {}

/**
 * The `import.upload` Worker route. The front door has already applied the
 * `uploads` and `imports` gates (404 while uploads are off), the client
 * version and the token. An image needs the `ocr` gate open, before any byte
 * is read; then the intake answers 202 with the accepted import.
 */
export async function uploadRoute(w: WorkerContext): Promise<VaultReply> {
  if (!w.vault || !w.claims) throw new Error('an upload needs a session')
  const format = importFormatForContentType(w.headers['content-type'])
  if (format === 'jpeg' || format === 'png' || format === 'webp') w.gates.assertOpen('ocr')
  if (uploading >= MAX_UPLOADS_PER_ISOLATE) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })
  uploading += 1
  try {
    const store = w.env.OBJECTS ? new R2ObjectStore(w.env.OBJECTS) : new UnavailableObjectStore()
    const accepted = await new UploadIntake(vaultIntakeRepository(w.vault), store).accept(sessionContextOf(w.claims), w.stream ?? emptyBody(), {
      idempotencyKey: w.headers['idempotency-key'],
      fileName: fileNameFrom(w.headers),
      contentType: w.headers['content-type'] ?? '',
      declaredBytes: contentLength(w.headers),
    })
    return { ok: true, status: 202, body: accepted }
  } finally {
    uploading -= 1
  }
}

/** For tests: how many uploads this isolate holds now. */
export function uploadsInFlight(): number {
  return uploading
}
