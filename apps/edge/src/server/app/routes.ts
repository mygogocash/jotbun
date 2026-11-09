import { createHash } from 'node:crypto'

import {
  ContractValidationError,
  IMPORT_FILE_NAME_HEADER,
  MAX_COMMAND_STATUS_IDS,
  V1_HEADERS,
  assertKnownFields,
  isUuid,
  parseAiAskRequest,
  parseAiDate,
  parseAiLocale,
  parseAiParseRequest,
  parseAiPreferencesUpdate,
  parseAiSlipRequest,
  importFormatForContentType,
  parseImportPreviewPaging,
  parseMonth,
} from '@gogospend/contracts'
import type { ApiIdentity, ReceiptRetentionConsent, SessionContext } from '@gogospend/contracts'

import { DEFAULT_ATTACHMENT_LIMITS } from '@api/attachments/attachment-limits'
import { ATTACHMENT_REMOVE_KIND, ATTACHMENT_REPLACE_KIND, ATTACHMENT_RETAIN_KIND } from '@api/attachments/attachments.service'

import { bindingFrom } from '@api/auth/application-session.guard'
import { EVENT_SIGNATURE_HEADER } from '@api/auth/auth0-event-verifier'
import { MAX_TOKEN_LENGTH } from '@api/auth/auth0-token-verifier'
import { ProofVerificationError } from '@api/auth/oidc-proof-verifier'
import type { VerifiedOidcProof } from '@api/auth/oidc-proof-verifier'
import type { RouteAccess } from '@api/auth/route-policy'
import { commandHeaders } from '@api/commands/command-headers'
import { routeId } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'
import type { GateScope } from '@api/common/feature-gates'
import { EXPORT_REQUEST_KIND, parseExportFilter } from '@api/exports/export.service'
import { DeletedHistoryQuery, parseDeletedHistoryRequest } from '@api/history/deleted-history-query'
import { HistoryQuery, parseHistoryRequest } from '@api/history/history-query'
import { CONFIRM_KIND, FREEZE_KIND, PATCH_KIND, parseConfirmBody, parseFreezeBody, parsePatchBody } from '@api/imports/confirmation.service'
import { SummaryQuery } from '@api/summary/summary-query'
import { parseSyncRequest } from '@api/sync/sync-query'

import { matchRoute } from '../../v1/match'
import { bodyStream, fileResponse, verifiedChunks, within as withinIdle } from '../http/files'
import type { HeaderBag } from '../http/request'
import type { Container } from './container'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RouteContext = {
  c: Container
  /** Set on bound_session, current_policy and recent_proof routes. */
  session: SessionContext
  identity: ApiIdentity | undefined
  params: Record<string, string>
  query: Record<string, unknown>
  headers: HeaderBag
  body: unknown
  /** The exact JSON bytes, on `body: 'raw'` routes (signed provider events). */
  rawBody?: Uint8Array
  /** The unread request body, on `body: 'stream'` routes (uploads). */
  stream?: AsyncIterable<Uint8Array>
}

/**
 * A handler's answer when its status or headers depend on the outcome
 * (Nest's `@Res({ passthrough: true })`). A handler may also return a
 * `Response` for a file; the dispatcher adds the v1 headers to it.
 */
export class Reply {
  constructor(readonly status: number, readonly body: unknown, readonly headers: Readonly<Record<string, string>> = {}) {}
}

/**
 * How the body is read before the guards run: `json` (the 2 MiB v1 parser),
 * `raw` (8 KiB, bytes kept) or `stream` (left unread for the handler, as the
 * JSON parser skips any other content type).
 */
export type BodyMode = 'json' | 'raw' | 'stream'

/** The background Workers: generic jobs (snapshots, exports, imports), Auth0 maintenance, account deletion. */
export type WakeRole = 'jobs' | 'security' | 'deletion'

export type Route = {
  method: Method
  /** Express-style path with `:name` segments. */
  path: string
  access: RouteAccess
  gates?: readonly GateScope[]
  /** Nest's default is 201 for POST and 200 otherwise; `@HttpCode` overrides it. */
  status?: number
  body?: BodyMode
  /**
   * The background role whose work a success may have queued (a job row in
   * PostgreSQL): its Worker is woken instead of waiting for its next cron
   * sweep (the API's workers poll every few seconds).
   */
  wakes?: WakeRole
  handle(ctx: RouteContext): Promise<unknown>
}

type RouteOptions = { gates?: readonly GateScope[]; status?: number; body?: BodyMode; wakes?: WakeRole }

const route = (method: Method, path: string, access: RouteAccess, handle: Route['handle'], options: RouteOptions = {}): Route => ({
  method,
  path,
  access,
  handle,
  ...options,
})

/** The verified identity on a non-public route (the guard sets it before any handler runs). */
function identityOf(ctx: RouteContext): ApiIdentity {
  if (!ctx.identity) throw new Error('A token route ran without an identity.')
  return ctx.identity
}

/** auth.controller.ts `verify`: one ID token as proof for one challenge. */
async function verifyProof(ctx: RouteContext): Promise<VerifiedOidcProof> {
  const input = assertKnownFields(ctx.body, ['challenge_id', 'id_token'])
  if (!isUuid(input.challenge_id)) throw new ContractValidationError('VALIDATION_FAILED', 'challenge_id must be a UUID.', 'challenge_id')
  if (typeof input.id_token !== 'string' || input.id_token.length === 0 || input.id_token.length > MAX_TOKEN_LENGTH) {
    throw new ContractValidationError('VALIDATION_FAILED', 'id_token is missing or too long.', 'id_token')
  }
  try {
    return await ctx.c.proofs.verifyChallenge(identityOf(ctx), input.challenge_id, input.id_token)
  } catch (error) {
    if (error instanceof ProofVerificationError && error.reason === 'unavailable') {
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })
    }
    throw new ProblemException(401, 'PROOF_INVALID')
  }
}

/** The Idempotency-Key of a recent-proof request, which is its proof's command id. */
function proofCommandId(headers: HeaderBag): string {
  const commandId = headers[V1_HEADERS.idempotencyKey]
  if (!isUuid(commandId)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency_key')
  return commandId
}

const writes = ['writes'] as const
const jobs = ['jobs'] as const

/** The percent-encoded file name header, decoded; anything undecodable is an invalid name (imports.controller.ts). */
function fileNameFrom(headers: HeaderBag): string {
  const raw = headers[IMPORT_FILE_NAME_HEADER]
  if (raw === undefined) throw new ContractValidationError('INVALID_FILE_NAME', 'File name header is required.', 'file_name')
  try {
    return decodeURIComponent(raw)
  } catch {
    throw new ContractValidationError('INVALID_FILE_NAME', 'File name is not percent-encoded UTF-8.', 'file_name')
  }
}

function contentLength(headers: HeaderBag): number | null {
  const raw = headers['content-length']
  if (raw === undefined || !/^\d{1,16}$/.test(raw)) return null
  return Number(raw)
}

async function* emptyBody(): AsyncIterable<Uint8Array> {}

/**
 * The v1 routes the edge serves itself. Each mirrors its NestJS controller
 * line for line (access class, gates, status, the service call). Every other
 * /v1 route is forwarded to the NestJS origin until it is ported.
 */
export const V1_ROUTES: readonly Route[] = [
  // policies/policy.controller.ts
  route('GET', '/v1/policies', 'public', ({ c }) => c.policies.published()),
  route('POST', '/v1/me/policy-acceptances', 'bound_session', async ({ c, session, body }) => {
    const input = assertKnownFields(body, ['kind', 'version'])
    await c.policies.accept(session, input.kind, input.version)
  }, { status: 204 }),
  route('PUT', '/v1/me/privacy-preferences', 'bound_session', ({ c, session, body }) => {
    const input = assertKnownFields(body, ['analytics'])
    return c.policies.setPrivacy(session, input.analytics)
  }),

  // auth/auth.controller.ts
  route('POST', '/v1/auth/challenges', 'token_only', (ctx) => {
    const input = assertKnownFields(ctx.body, ['request_id', 'purpose', 'command_id'])
    return ctx.c.reauth.issueChallenge(identityOf(ctx), { requestId: input.request_id as string, purpose: input.purpose as string, commandId: input.command_id as string })
  }),
  // The only places an ID token is accepted, as proof for one challenge.
  route('POST', '/v1/auth/bootstrap', 'token_only', async (ctx) => ctx.c.bootstrapper.bootstrap(identityOf(ctx), await verifyProof(ctx))),
  route('POST', '/v1/auth/proofs', 'token_only', async (ctx) => ctx.c.reauth.prove(await verifyProof(ctx))),
  route('GET', '/v1/me', 'bound_session', ({ c, session }) => c.accounts.describe(session)),
  route('POST', '/v1/me/logout', 'bound_session', ({ c, session }) => c.revocation.revokeCurrent(session), { status: 204 }),
  // Links a second sign-in method; needs fresh logins of both identities for this Idempotency-Key.
  route('POST', '/v1/me/identities', 'recent_proof', (ctx) => {
    const input = assertKnownFields(ctx.body, ['proof_id', 'secondary_challenge_id', 'secondary_id_token'])
    const commandId = proofCommandId(ctx.headers)
    if (!isUuid(input.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id')
    if (!isUuid(input.secondary_challenge_id)) throw new ContractValidationError('VALIDATION_FAILED', 'secondary_challenge_id must be a UUID.', 'secondary_challenge_id')
    if (typeof input.secondary_id_token !== 'string' || input.secondary_id_token.length === 0 || input.secondary_id_token.length > MAX_TOKEN_LENGTH) {
      throw new ContractValidationError('VALIDATION_FAILED', 'secondary_id_token must be a token.', 'secondary_id_token')
    }
    return ctx.c.linking.link(ctx.session, identityOf(ctx), { proofId: input.proof_id, commandId, secondaryChallengeId: input.secondary_challenge_id, secondaryIdToken: input.secondary_id_token })
  }, { gates: writes, status: 202, wakes: 'security' }),
  // Signs out everywhere; needs a fresh global_logout proof bound to this Idempotency-Key.
  route('POST', '/v1/me/global-logout', 'recent_proof', ({ c, session, headers, body }) => {
    const input = assertKnownFields(body, ['proof_id'])
    const commandId = proofCommandId(headers)
    if (!isUuid(input.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id')
    return c.revocation.revokeAll(session, input.proof_id, commandId)
  }, { status: 202, wakes: 'security' }),

  // auth/auth0-events.controller.ts: the signed envelope is the only authentication.
  route('POST', '/v1/auth/provider-events', 'public', async ({ c, headers, rawBody }) => ({
    result: await c.securityEvents.handleSecurityEvent({ rawBody: rawBody ? Buffer.from(rawBody) : undefined, signature: headers[EVENT_SIGNATURE_HEADER] }),
  }), { status: 200, body: 'raw', wakes: 'security' }),

  // privacy/deletion.controller.ts
  route('POST', '/v1/me/deletion', 'recent_proof', ({ c, session, headers, body }) => {
    const input = assertKnownFields(body, ['proof_id'])
    const commandId = proofCommandId(headers)
    if (!isUuid(input.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id')
    return c.deletion.request(session, input.proof_id, commandId)
  }, { status: 202, wakes: 'deletion' }),
  // Token-only: the initiating device's binding is dead once its request was accepted.
  route('POST', '/v1/auth/deletion-receipt', 'token_only', async (ctx) => {
    const input = assertKnownFields(ctx.body, ['command_id'])
    if (!isUuid(input.command_id)) throw new ContractValidationError('VALIDATION_FAILED', 'command_id must be a UUID.', 'command_id')
    const binding = bindingFrom({ headers: ctx.headers } as never)
    const receipt = binding ? await ctx.c.deletion.receipt(identityOf(ctx), binding, input.command_id) : null
    if (!receipt) throw new ProblemException(404, 'NOT_FOUND')
    return receipt
  }, { status: 200 }),

  // commands/command-status.controller.ts
  route('POST', '/v1/commands/status', 'bound_session', async ({ c, session, body }) => {
    const input = assertKnownFields(body, ['command_ids'])
    const ids = input.command_ids
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_COMMAND_STATUS_IDS || !ids.every(isUuid)) {
      throw new ContractValidationError('VALIDATION_FAILED', `command_ids must be 1-${MAX_COMMAND_STATUS_IDS} UUIDs.`, 'command_ids')
    }
    const statuses = await c.db.withOwnerTransaction(session, (tx) => c.receipts.lookup(tx, ids))
    return { statuses }
  }, { status: 200 }),

  // wallets/wallets.controller.ts
  route('GET', '/v1/wallets', 'bound_session', ({ c, session }) => c.wallets.list(session)),
  route('GET', '/v1/wallets/:id', 'bound_session', ({ c, session, params }) => c.wallets.get(session, params.id)),
  route('POST', '/v1/wallets', 'current_policy', ({ c, session, headers, body }) => c.wallets.create(session, commandHeaders(headers, 'forbidden'), body), { gates: writes }),
  route('PATCH', '/v1/wallets/:id', 'current_policy', ({ c, session, headers, params, body }) => c.wallets.update(session, commandHeaders(headers, 'required'), params.id, body), { gates: writes, status: 200 }),
  route('POST', '/v1/wallets/:id/archive', 'current_policy', ({ c, session, headers, params, body }) => c.wallets.archive(session, commandHeaders(headers, 'required'), params.id, body), { gates: writes, status: 200 }),
  route('POST', '/v1/wallets/:id/unarchive', 'current_policy', ({ c, session, headers, params, body }) => c.wallets.unarchive(session, commandHeaders(headers, 'required'), params.id, body), { gates: writes, status: 200 }),

  // categories/categories.controller.ts
  route('GET', '/v1/categories', 'bound_session', ({ c, session }) => c.categories.list(session)),
  route('POST', '/v1/categories/builtins', 'current_policy', ({ c, session }) => c.categories.seedBuiltins(session), { gates: writes, status: 200 }),
  route('POST', '/v1/categories', 'current_policy', ({ c, session, headers, body }) => c.categories.create(session, commandHeaders(headers, 'forbidden'), body), { gates: writes }),
  route('PATCH', '/v1/categories/:id', 'current_policy', ({ c, session, headers, params, body }) => c.categories.update(session, commandHeaders(headers, 'required'), params.id, body), { gates: writes, status: 200 }),
  route('POST', '/v1/categories/:id/archive', 'current_policy', ({ c, session, headers, params, body }) => c.categories.archive(session, commandHeaders(headers, 'required'), params.id, body), { gates: writes, status: 200 }),
  route('POST', '/v1/categories/:id/unarchive', 'current_policy', ({ c, session, headers, params, body }) => c.categories.unarchive(session, commandHeaders(headers, 'required'), params.id, body), { gates: writes, status: 200 }),

  // transactions/transactions.controller.ts
  route('GET', '/v1/transactions/:id', 'bound_session', ({ c, session, params }) => c.transactions.get(session, params.id)),
  route('POST', '/v1/transactions', 'current_policy', ({ c, session, headers, body }) => c.transactions.create(session, commandHeaders(headers, 'forbidden'), body), { gates: writes }),
  route('PATCH', '/v1/transactions/:id', 'current_policy', ({ c, session, headers, params, body }) => c.transactions.update(session, commandHeaders(headers, 'required'), params.id, body), { gates: writes, status: 200 }),
  route('DELETE', '/v1/transactions/:id', 'current_policy', ({ c, session, headers, params }) => c.transactions.remove(session, commandHeaders(headers, 'required'), params.id), { gates: writes, status: 200 }),
  route('POST', '/v1/transactions/:id/restore', 'current_policy', ({ c, session, headers, params, body }) => c.transactions.restore(session, commandHeaders(headers, 'required'), params.id, body), { gates: writes, status: 200 }),

  // budgets/budgets.controller.ts
  route('GET', '/v1/budgets/:month', 'bound_session', ({ c, session, params }) => c.budgets.get(session, params.month)),
  route('PUT', '/v1/budgets/:month', 'current_policy', ({ c, session, headers, params, body }) => c.budgets.set(session, commandHeaders(headers, 'optional'), params.month, body), { gates: writes }),

  // history/history.controller.ts
  route('GET', '/v1/history', 'bound_session', ({ c, session, query }) => {
    const request = parseHistoryRequest(query)
    return c.db.withOwnerTransaction(session, (tx) => HistoryQuery.list(tx, request.filter, request.cursor, request.limit), { snapshot: true })
  }),
  route('GET', '/v1/history/deleted', 'bound_session', ({ c, session, query }) => {
    const request = parseDeletedHistoryRequest(query)
    return c.db.withOwnerTransaction(session, (tx) => DeletedHistoryQuery.list(tx, request.cursor, request.limit), { snapshot: true })
  }),

  // summary/summary.controller.ts
  route('GET', '/v1/summary', 'bound_session', ({ c, session, query }) => {
    const parsed = parseMonth(assertKnownFields({ ...query }, ['month']).month)
    return c.db.withOwnerTransaction(session, (tx) => SummaryQuery.month(tx, parsed), { snapshot: true })
  }),

  // sync/sync.controller.ts
  route('GET', '/v1/sync/changes', 'bound_session', ({ c, session, query }) => {
    const request = parseSyncRequest(query)
    return c.db.withOwnerTransaction(session, (tx) => c.sync.after(tx, request.cursor, request.limit), { snapshot: true })
  }),
  // A full snapshot, built in the background: 200 when one is ready, else 202 (poll its status).
  route('POST', '/v1/sync/snapshots', 'bound_session', async ({ c, session, headers, body }) => {
    assertKnownFields(body ?? {}, [])
    const key = headers['idempotency-key']
    if (!isUuid(key)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency-key')
    const status = await c.db.withOwnerTransaction(session, async (tx) => {
      const current = await c.snapshots.status(tx, await c.snapshots.request(tx, key))
      if (!current) throw new Error('a requested snapshot has no status')
      return current
    })
    return new Reply(status.status === 'ready' ? 200 : 202, status)
  }, { gates: jobs, wakes: 'jobs' }),
  route('GET', '/v1/sync/snapshots/:id', 'bound_session', async ({ c, session, params }) => {
    if (!isUuid(params.id)) throw new ProblemException(404, 'NOT_FOUND')
    const status = await c.db.withOwnerTransaction(session, (tx) => c.snapshots.status(tx, params.id), { snapshot: true })
    if (!status) throw new ProblemException(404, 'NOT_FOUND')
    return status
  }),
  // One chunk's JSON, for a current grant of the caller's own ready snapshot.
  route('GET', '/v1/sync/snapshot-chunks/:grant', 'bound_session', async ({ c, session, params }) => {
    const stored = await c.db.withOwnerTransaction(session, (tx) => c.snapshots.chunk(tx, params.grant), { snapshot: true })
    if (!stored) throw new ProblemException(404, 'NOT_FOUND')
    const body = await c.store.get(stored.key)
    if (!body || body.byteLength !== stored.bytes || createHash('sha256').update(body).digest('hex') !== stored.sha256) throw new ProblemException(404, 'NOT_FOUND')
    return fileResponse(body, { contentType: 'application/json', bytes: body.byteLength })
  }),

  // exports/exports.controller.ts: one private CSV per request (Idempotency-Key = the export proof's command id).
  route('POST', '/v1/exports', 'recent_proof', ({ c, session, headers, body }) => {
    const command = commandHeaders(headers, 'forbidden')
    const input = assertKnownFields(body, ['proof_id', 'from', 'through'])
    if (!isUuid(input.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id')
    const filter = parseExportFilter(input)
    return c.exports.request(session, input.proof_id, { commandId: command.commandId, kind: EXPORT_REQUEST_KIND, schemaVersion: command.schemaVersion, payload: filter })
  }, { gates: jobs, status: 202, wakes: 'jobs' }),
  route('GET', '/v1/exports/:id', 'bound_session', async ({ c, session, params }) => {
    if (!isUuid(params.id)) throw new ProblemException(404, 'NOT_FOUND')
    const dto = await c.exports.status(session, params.id)
    if (!dto) throw new ProblemException(404, 'NOT_FOUND')
    return dto
  }),
  route('GET', '/v1/exports/:id/grant', 'bound_session', async ({ c, session, params }) => {
    if (!isUuid(params.id)) throw new ProblemException(404, 'NOT_FOUND')
    const grant = await c.exports.grant(session, params.id)
    if (!grant) throw new ProblemException(404, 'NOT_FOUND')
    return grant
  }),
  // The CSV, streamed with its recorded length; its digest is checked as it streams.
  route('GET', '/v1/export-files/:grant', 'bound_session', async ({ c, session, params }) => {
    const stored = await c.exports.file(session, params.grant)
    if (!stored) throw new ProblemException(404, 'NOT_FOUND')
    const release = c.downloads.exports.take()
    try {
      const object = await c.store.getStream(stored.key)
      if (!object || object.bytes !== stored.bytes || (object.sha256 !== '' && object.sha256 !== stored.sha256)) throw new ProblemException(404, 'NOT_FOUND')
      const chunks = verifiedChunks(object.body, stored.bytes, stored.sha256)[Symbol.asyncIterator]()
      return fileResponse(bodyStream(chunks, release), { contentType: 'text/csv; charset=utf-8', bytes: stored.bytes, fileName: stored.fileName })
    } catch (error) {
      release()
      throw error
    }
  }),

  // imports/imports.controller.ts: the raw body streams into private quarantine and one parse job is queued.
  route('POST', '/v1/imports', 'current_policy', ({ c, session, headers, stream }) => {
    if (!c.importIntake.uploadsEnabled) throw new ProblemException(404, 'NOT_FOUND')
    const format = importFormatForContentType(headers['content-type'])
    if (format === 'jpeg' || format === 'png' || format === 'webp') c.gates.assertOpen('ocr')
    return c.uploads.accept(session, stream ?? emptyBody(), {
      idempotencyKey: headers['idempotency-key'],
      fileName: fileNameFrom(headers),
      contentType: headers['content-type'] ?? '',
      declaredBytes: contentLength(headers),
    })
  }, { gates: ['uploads', 'imports'], status: 202, body: 'stream', wakes: 'jobs' }),
  route('GET', '/v1/imports/:id', 'bound_session', async ({ c, session, params }) => {
    if (!isUuid(params.id)) throw new ProblemException(404, 'NOT_FOUND')
    const found = await c.imports.find(session, params.id)
    if (!found) throw new ProblemException(404, 'NOT_FOUND')
    return found
  }),
  route('GET', '/v1/imports/:id/preview', 'bound_session', async ({ c, session, params, query }) => {
    if (!isUuid(params.id)) throw new ProblemException(404, 'NOT_FOUND')
    const found = await c.previews.find(session, params.id, parseImportPreviewPaging(query))
    if (!found) throw new ProblemException(404, 'NOT_FOUND')
    return found
  }),

  // imports/confirmation.controller.ts: review corrections, the frozen selection and confirmation batches.
  route('PATCH', '/v1/imports/:id/rows', 'current_policy', ({ c, session, headers, params, body }) => {
    const jobId = routeId(params.id)
    const command = commandHeaders(headers, 'required')
    return c.confirmation.patchRows(session, { ...command, kind: PATCH_KIND, payload: { job_id: jobId, rows: parsePatchBody(body) } })
  }, { gates: ['imports'], status: 200 }),
  route('POST', '/v1/imports/:id/selections', 'current_policy', ({ c, session, headers, params, body }) => {
    const jobId = routeId(params.id)
    const command = commandHeaders(headers, 'forbidden')
    return c.confirmation.freezeSelection(session, { ...command, kind: FREEZE_KIND, payload: { job_id: jobId, ...parseFreezeBody(body) } })
  }, { gates: ['imports'], status: 201 }),
  route('POST', '/v1/imports/:id/confirmations', 'current_policy', ({ c, session, headers, params, body }) => {
    const jobId = routeId(params.id)
    const command = commandHeaders(headers, 'forbidden')
    return c.confirmation.confirm(session, { ...command, kind: CONFIRM_KIND, payload: parseConfirmBody(body) }, { jobId })
  }, { gates: ['imports', 'writes'], status: 200 }),
  route('GET', '/v1/imports/:id/selections/:selectionId', 'bound_session', async ({ c, session, params }) => {
    const found = await c.confirmation.progress(session, routeId(params.id), routeId(params.selectionId))
    if (!found) throw new ProblemException(404, 'NOT_FOUND')
    return found
  }),

  // attachments/attachments.controller.ts: receipts are commands on the record (If-Match, Idempotency-Key).
  route('POST', '/v1/transactions/:id/attachment', 'current_policy', ({ c, session, headers, params, body }) => {
    const command = commandHeaders(headers, 'required')
    const transactionId = routeId(params.id)
    const input = assertKnownFields(body, ['attachment_id', 'consent'])
    return c.attachments.retain(session, { ...command, kind: ATTACHMENT_RETAIN_KIND, payload: { transaction_id: transactionId, attachment_id: input.attachment_id as string, consent: input.consent as ReceiptRetentionConsent } })
  }, { gates: ['imports', 'writes'], status: 200 }),
  route('PUT', '/v1/transactions/:id/attachment', 'current_policy', ({ c, session, headers, params, body }) => {
    const command = commandHeaders(headers, 'required')
    const transactionId = routeId(params.id)
    const input = assertKnownFields(body, ['attachment_id', 'consent'])
    return c.attachments.replace(session, { ...command, kind: ATTACHMENT_REPLACE_KIND, payload: { transaction_id: transactionId, attachment_id: input.attachment_id as string, consent: input.consent as ReceiptRetentionConsent } })
  }, { gates: ['imports', 'writes'], status: 200 }),
  route('DELETE', '/v1/transactions/:id/attachment', 'current_policy', ({ c, session, headers, params }) => {
    const command = commandHeaders(headers, 'required')
    return c.attachments.remove(session, { ...command, kind: ATTACHMENT_REMOVE_KIND, payload: { transaction_id: routeId(params.id) } })
  }, { gates: writes, status: 200 }),
  route('GET', '/v1/attachments/:id/grant', 'bound_session', async ({ c, session, params }) => {
    if (!isUuid(params.id)) throw new ProblemException(404, 'NOT_FOUND')
    const grant = await c.attachments.grant(session, params.id)
    if (!grant) throw new ProblemException(404, 'NOT_FOUND')
    return grant
  }),
  // The image, re-authorized now and streamed with its recorded length. One
  // chunk is read before any header is sent, so a failure up to then is a 503;
  // the last chunk is held until the digest matches.
  route('GET', '/v1/attachment-files/:grant', 'bound_session', async ({ c, session, params }) => {
    const stored = await c.attachments.file(session, params.grant)
    if (!stored) throw new ProblemException(404, 'NOT_FOUND')
    const release = c.downloads.receipts.take(session.accountId)
    let chunks: AsyncIterator<Uint8Array> | undefined
    try {
      const object = await c.store.getStream(stored.key)
      if (!object || object.bytes !== stored.bytes || (object.sha256 !== '' && object.sha256 !== stored.sha256)) throw new ProblemException(404, 'NOT_FOUND')
      chunks = verifiedChunks(object.body, stored.bytes, stored.sha256, true)[Symbol.asyncIterator]()
      const limits = { idleMs: DEFAULT_ATTACHMENT_LIMITS.downloadIdleMs, totalMs: DEFAULT_ATTACHMENT_LIMITS.downloadTotalMs }
      const first = await withinIdle(chunks.next(), limits.idleMs, 'receipt download')
      return fileResponse(bodyStream(chunks, release, limits, first), { contentType: stored.contentType, bytes: stored.bytes, fileName: stored.fileName })
    } catch (error) {
      void chunks?.return?.().catch(() => undefined)
      release()
      if (error instanceof ProblemException) throw error
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })
    }
  }),
]

/**
 * Routes only the edge serves (the AI companion, D15, and the GoGoCash
 * bridge, D16). route-coverage.test.ts
 * checks that none of them shadows a NestJS route. The AI service checks
 * consent and daily limits itself; drafts are never saved here.
 */
export const EDGE_ONLY_ROUTES: readonly Route[] = [
  route('GET', '/v1/me/ai-preferences', 'bound_session', ({ c, session }) => c.ai.preferences(session)),
  route('PUT', '/v1/me/ai-preferences', 'bound_session', ({ c, session, body }) => c.ai.setPreferences(session, parseAiPreferencesUpdate(body))),
  route('POST', '/v1/ai/parse', 'current_policy', ({ c, session, body }) => c.ai.parse(session, parseAiParseRequest(body)), { status: 200 }),
  route('POST', '/v1/ai/slip', 'current_policy', ({ c, session, body }) => c.ai.slip(session, parseAiSlipRequest(body)), { status: 200 }),
  route('GET', '/v1/ai/note', 'bound_session', ({ c, session, query }) => {
    const input = assertKnownFields({ ...query }, ['date', 'locale'])
    return c.ai.note(session, parseAiDate(input.date, 'date'), parseAiLocale(input.locale))
  }),
  route('POST', '/v1/ai/ask', 'current_policy', ({ c, session, body }) => c.ai.ask(session, parseAiAskRequest(body)), { status: 200 }),
  // The GoGoCash bridge (D16): a public catalogue, no account data.
  route('GET', '/v1/bridge/gogocash/catalogue', 'public', ({ c }) => c.cashback.get()),
]

/** Everything the edge answers itself. */
export const ALL_ROUTES: readonly Route[] = [...V1_ROUTES, ...EDGE_ONLY_ROUTES]

/**
 * NestJS v1 routes the edge forwards to LEGACY_V1_ORIGIN: none. Every v1
 * route is ported; the forwarder stays for a route the API gains before the
 * edge does. route-coverage.test.ts fails if a Nest route is neither ported
 * nor listed here.
 */
export const FORWARDED_V1_ROUTES: readonly string[] = []

export type RouteMatch = { route: Route; params: Record<string, string> }

// Matching lives in src/v1/match.ts, shared with the vault Worker's table.
export { matchRoute }

export function defaultStatus(r: Route): number {
  return r.status ?? (r.method === 'POST' ? 201 : 200)
}
