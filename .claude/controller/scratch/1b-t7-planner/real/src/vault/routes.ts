import { MAX_COMMAND_STATUS_IDS, ContractValidationError, assertKnownFields, isUuid, parseImportPreviewPaging } from '@gogospend/contracts'

import { routeId } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'
import type { BeginInput, FinishInput, IntakeOutcomeCode } from '@api/imports/import.repository'

import type { VaultCall, VaultReply, VaultRouteId } from '../v1/protocol'
import { lookupStatuses } from './commands/receipts'
import type { VaultContext } from './context'
import { getBudget, putBudget } from './domain/budgets'
import { archiveCategory, createCategory, listCategories, seedBuiltins, unarchiveCategory, updateCategory } from './domain/categories'
import { createTransaction, deleteTransaction, getTransaction, restoreTransaction, updateTransaction } from './domain/transactions'
import { createWallet, archiveWallet, getWallet, listWallets, unarchiveWallet, updateWallet } from './domain/wallets'
import { deletedHistory } from './reads/deleted-history'
import { history } from './reads/history'
import { summary } from './reads/summary'
import { syncChanges } from './reads/sync'
import { acceptPolicy, describeMe, setPrivacy } from './policies'
import { okReply } from './replies'
import { revokeSession } from './session'
import { abortUpload, beginUpload, discardUploadParts, finishUpload, reserveUploadPart, uploadBytesRetry, uploadStatus } from './files/intake'
import { exportFile, exportGrant, exportStatus, requestExport } from './files/exports'
import { prepareInput, prepareReceipt, receiptFile, receiptGrant, releaseReceiptCopy, removeReceipt, replaceReceipt, retainReceipt } from './files/attachments'
import { confirmImportBatch, confirmPrepare, freezeImportSelection, patchImportRows, selectionProgress } from './files/confirmation'
import { previewOf } from './files/previews'
import { requestSnapshot, snapshotChunk, snapshotStatus } from './files/snapshots'
import { AI_FEATURES, parseAiDate, parseAiLocale, parseAiPreferencesUpdate } from '@gogospend/contracts'
import type { AiFeature } from '@gogospend/contracts'
import { aiContext, aiDayFacts, aiPreferences, aiTool, consumeAi, setAiPreferences } from './ai'

export type VaultHandler = (c: VaultContext, call: VaultCall) => VaultReply

/** The command ids of a status request: 1 to 100 UUIDs, as the API checks them. */
function commandIdsOf(body: unknown): string[] {
  const { command_ids: ids } = assertKnownFields(body, ['command_ids'])
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_COMMAND_STATUS_IDS || !ids.every(isUuid)) {
    throw new ContractValidationError('VALIDATION_FAILED', `command_ids must be 1-${MAX_COMMAND_STATUS_IDS} UUIDs.`, 'command_ids')
  }
  return ids
}

/** A step body from the Worker's own upload code: an object, or the call is refused before anything is written. */
function stepBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('a step body is an object')
  return body as Record<string, unknown>
}

/** An upload step names its job and intake token as UUIDs. */
function uploadIds(body: Record<string, unknown>, job: string, token: string): { jobId: string; intakeToken: string } {
  const jobId = body[job]
  const intakeToken = body[token]
  if (!isUuid(jobId) || !isUuid(intakeToken)) throw new Error('an upload step names its job and intake token')
  return { jobId, intakeToken }
}

/** GET /v1/imports/:id: the caller's own accepted import; any other id is 404. */
function importStatusOf(c: VaultContext, id: string | undefined) {
  if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND')
  const found = uploadStatus(c, id)
  if (!found) throw new ProblemException(404, 'NOT_FOUND')
  return found
}

/** An export route's answer for the caller's own export; an unknown id, or one that is not a UUID, is 404 (1B-T6). */
function exportOr404<T>(c: VaultContext, id: string | undefined, read: (c: VaultContext, id: string) => T | null): T {
  const found = isUuid(id) ? read(c, id) : null
  if (found === null) throw new ProblemException(404, 'NOT_FOUND')
  return found
}

/**
 * The handlers the vault serves, one per ported route. Each runs after the
 * vault's own checks (user-vault.ts) and does only its route's work. The
 * status comes from the route table (okReply).
 */
export const VAULT_HANDLERS: Partial<Record<VaultRouteId, VaultHandler>> = {
  'me.get': (c, call) => okReply(call.route, describeMe(c)),
  'me.logout': (c, call) => {
    revokeSession(c)
    return okReply(call.route)
  },
  'me.privacy': (c, call) => okReply(call.route, setPrivacy(c, assertKnownFields(call.body, ['analytics']).analytics)),
  'policies.accept': (c, call) => {
    const input = assertKnownFields(call.body, ['kind', 'version'])
    acceptPolicy(c, input.kind, input.version)
    return okReply(call.route)
  },
  'wallets.list': (c, call) => okReply(call.route, listWallets(c)),
  'wallets.get': (c, call) => okReply(call.route, getWallet(c, call.params.id)),
  'wallets.create': (c, call) => okReply(call.route, createWallet(c, call)),
  'wallets.update': (c, call) => okReply(call.route, updateWallet(c, call)),
  'wallets.archive': (c, call) => okReply(call.route, archiveWallet(c, call)),
  'wallets.unarchive': (c, call) => okReply(call.route, unarchiveWallet(c, call)),
  'categories.list': (c, call) => okReply(call.route, listCategories(c)),
  'categories.builtins': (c, call) => okReply(call.route, seedBuiltins(c)),
  'categories.create': (c, call) => okReply(call.route, createCategory(c, call)),
  'categories.update': (c, call) => okReply(call.route, updateCategory(c, call)),
  'categories.archive': (c, call) => okReply(call.route, archiveCategory(c, call)),
  'categories.unarchive': (c, call) => okReply(call.route, unarchiveCategory(c, call)),
  'transactions.get': (c, call) => okReply(call.route, getTransaction(c, call.params.id)),
  'transactions.create': (c, call) => okReply(call.route, createTransaction(c, call)),
  'transactions.update': (c, call) => okReply(call.route, updateTransaction(c, call)),
  'transactions.delete': (c, call) => okReply(call.route, deleteTransaction(c, call)),
  'transactions.restore': (c, call) => okReply(call.route, restoreTransaction(c, call)),
  'budgets.get': (c, call) => okReply(call.route, getBudget(c, call.params.month)),
  'budgets.put': (c, call) => okReply(call.route, putBudget(c, call)),
  'history.list': (c, call) => okReply(call.route, history(c, call.query)),
  'history.deleted': (c, call) => okReply(call.route, deletedHistory(c, call.query)),
  'summary.get': (c, call) => okReply(call.route, summary(c, call.query)),
  'commands.status': (c, call) => okReply(call.route, { statuses: lookupStatuses(c, commandIdsOf(call.body)) }),
  'sync.changes': (c, call) => okReply(call.route, syncChanges(c, call.query)),
  // 1B-T5: the import status route and the upload's steps (src/v1/files/uploads.ts).
  'imports.status': (c, call) => okReply(call.route, importStatusOf(c, call.params.id)),
  'imports.begin': (c, call) => {
    const body = stepBody(call.body)
    uploadIds(body, 'jobId', 'intakeToken')
    return okReply(call.route, beginUpload(c, body as BeginInput))
  },
  'imports.reservePart': (c, call) => {
    const body = stepBody(call.body)
    const { jobId, intakeToken } = uploadIds(body, 'job_id', 'intake_token')
    return okReply(call.route, { key: reserveUploadPart(c, jobId, intakeToken, Number(body.index)) })
  },
  'imports.finish': (c, call) => {
    const body = stepBody(call.body)
    uploadIds(body, 'jobId', 'intakeToken')
    return okReply(call.route, finishUpload(c, body as FinishInput))
  },
  'imports.abort': (c, call) => {
    const body = stepBody(call.body)
    const { jobId, intakeToken } = uploadIds(body, 'job_id', 'intake_token')
    return okReply(call.route, { keys: abortUpload(c, jobId, intakeToken, body.status as 'rejected' | 'failed', String(body.code) as IntakeOutcomeCode) })
  },
  'imports.discarded': (c, call) => {
    const body = stepBody(call.body)
    const { jobId, intakeToken } = uploadIds(body, 'job_id', 'intake_token')
    discardUploadParts(c, jobId, intakeToken, Array.isArray(body.keys) ? (body.keys as string[]) : [])
    return okReply(call.route, {})
  },
  'imports.bytesRetry': (c, call) => okReply(call.route, { seconds: uploadBytesRetry(c, Number(stepBody(call.body).need)) }),
  // 1B-T6: the export routes and the download's step (src/v1/files/downloads.ts).
  'exports.request': (c, call) => okReply(call.route, requestExport(c, call)),
  'exports.status': (c, call) => okReply(call.route, exportOr404(c, call.params.id, exportStatus)),
  'exports.grant': (c, call) => okReply(call.route, exportOr404(c, call.params.id, exportGrant)),
  'exports.file': (c, call) => {
    const file = exportFile(c, String(call.params.grant ?? ''))
    if (!file) throw new ProblemException(404, 'NOT_FOUND')
    return okReply(call.route, file)
  },
  // 1B-T9: the receipt routes and the retain, replace and download steps (src/v1/files/receipts.ts, downloads.ts).
  'attachments.remove': (c, call) => okReply(call.route, removeReceipt(c, call)),
  'attachments.grant': (c, call) => {
    const grant = receiptGrant(c, call.params.id ?? '')
    if (!grant) throw new ProblemException(404, 'NOT_FOUND')
    return okReply(call.route, grant)
  },
  'attachments.prepare': (c, call) => okReply(call.route, prepareReceipt(c, prepareInput(call.body))),
  'attachments.release': (c, call) => {
    const { key } = stepBody(call.body)
    if (typeof key !== 'string') throw new Error('a release step names its key')
    releaseReceiptCopy(c, key)
    return okReply(call.route, {})
  },
  'attachments.retain': (c, call) => okReply(call.route, retainReceipt(c, call)),
  'attachments.replace': (c, call) => okReply(call.route, replaceReceipt(c, call)),
  'attachments.file': (c, call) => {
    const file = receiptFile(c, String(call.params.grant ?? ''))
    if (!file) throw new ProblemException(404, 'NOT_FOUND')
    return okReply(call.route, file)
  },
  // 1B-T10: the review routes and the confirmation's steps (src/v1/files/receipts.ts).
  'imports.preview': (c, call) => {
    // The id first, then the paging, as the API's controller reads them: a malformed id is 404 whatever the paging.
    const id = call.params.id
    if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND')
    const found = previewOf(c, id, parseImportPreviewPaging(call.query))
    if (!found) throw new ProblemException(404, 'NOT_FOUND')
    return okReply(call.route, found)
  },
  'imports.patchRows': (c, call) => okReply(call.route, patchImportRows(c, call)),
  'imports.freeze': (c, call) => okReply(call.route, freezeImportSelection(c, call)),
  'imports.progress': (c, call) => {
    const found = selectionProgress(c, routeId(call.params.id ?? ''), routeId(call.params.selectionId ?? ''))
    if (!found) throw new ProblemException(404, 'NOT_FOUND')
    return okReply(call.route, found)
  },
  'imports.confirmPrepare': (c, call) => okReply(call.route, confirmPrepare(c, call)),
  'imports.confirm': (c, call) => okReply(call.route, confirmImportBatch(c, call)),
  // 1B-T8: the snapshot routes and the chunk download's step (src/v1/files/downloads.ts). The request's
  // reply carries its own status: 200 for a ready snapshot, 202 otherwise.
  'snapshots.request': (c, call) => requestSnapshot(c, call),
  'snapshots.status': (c, call) => {
    const found = isUuid(call.params.id) ? snapshotStatus(c, call.params.id) : null
    if (!found) throw new ProblemException(404, 'NOT_FOUND')
    return okReply(call.route, found)
  },
  'snapshots.chunk': (c, call) => {
    const chunk = snapshotChunk(c, String(call.params.grant ?? ''))
    if (!chunk) throw new ProblemException(404, 'NOT_FOUND')
    return okReply(call.route, chunk)
  },
  // 1B-T7: the AI routes' steps (src/v1/ai/service.ts). The Worker reads each route's input before its first
  // step; what it sends a step is read again here, before anything is read or written.
  'ai.preferences': (c, call) => okReply(call.route, aiPreferences(c)),
  'ai.setPreferences': (c, call) => okReply(call.route, setAiPreferences(c, parseAiPreferencesUpdate(call.body))),
  'ai.context': (c, call) => okReply(call.route, aiContext(c)),
  'ai.consume': (c, call) => {
    const { feature } = stepBody(call.body)
    if (!(AI_FEATURES as readonly unknown[]).includes(feature)) throw new Error('an AI step names its feature')
    consumeAi(c, feature as AiFeature)
    return okReply(call.route, {})
  },
  'ai.facts': (c, call) => okReply(call.route, aiDayFacts(c, parseAiDate(call.query.date, 'date'))),
  'ai.tool': (c, call) => {
    const { name, input, locale } = stepBody(call.body)
    return okReply(call.route, aiTool(c, String(name), (input ?? {}) as Record<string, unknown>, parseAiLocale(locale)))
  },
}
