// Slip drafts (P4-T7, S1, B10 as A1 amends it). The open drafts are read online, a page at a
// time. A person confirms them in batches of at most 50, one `slip_draft.confirm` command each,
// or dismisses one (`slip_draft.dismiss`). Both are commands on the vault's one slip_inbox
// entity, and their change group ends with the new open count (inboxChange), so the other phones
// are poked (1D-T10) and no draft reaches a diary. A confirmed draft becomes a record through
// createTransactionRow, checked as transactions.create checks one, with the source the vault
// sets from the draft's origin (A1) and the draft's slip reference. The draft goes either way,
// and its slip reference stays known (`confirmed` or `dismissed`), so the slip is never read again.
import { ContractValidationError, SLIP_INBOX_ID, assertKnownFields, isUuid, parseSlipConfirmRequest } from '@gogospend/contracts'
import type { CommandAck, SlipDraftsPage, SlipOrigin, TransactionSource } from '@gogospend/contracts'

import { routeId } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'
import { parseLimit, single } from '@api/history/history-query'

import type { VaultCall } from '../../v1/protocol'
import { commandInput, runCommand } from '../commands/executor'
import type { VaultContext } from '../context'
import { createTransactionRow } from '../domain/transactions'
import { SLIP_DRAFT_COLUMNS, inboxChange, openDraftCount, slipDraftDto, slipDuplicateOf } from './inbox'
import type { SlipDraftRow } from './inbox'

/** The two commands, on the slip_inbox entity (commands/registry.ts defines them after it). */
export const SLIP_CONFIRM_KIND = 'slip_draft.confirm'
export const SLIP_DISMISS_KIND = 'slip_draft.dismiss'

const IN_IDS = 'IN (SELECT value FROM json_each(?))'

/** A1: a slip shared into Bun becomes a share_extension record; every other origin a slip_import one. */
export function slipSourceOf(origin: SlipOrigin): TransactionSource {
  return origin === 'share' ? 'share_extension' : 'slip_import'
}

// The list's order: the newest slip first, by its date, then its time, then the draft's id, all
// descending (slip_drafts_order_idx read backwards). A slip with no date (or no time) comes after
// every one with it: '' sorts below any date or time, so one row comparison is the keyset.
const ORDER_KEY = "coalesce(occurred_on, ''), coalesce(occurred_time, ''), id"
const ORDER_BY = "coalesce(occurred_on, '') DESC, coalesce(occurred_time, '') DESC, id DESC"
const CURSOR = /^[A-Za-z0-9_-]{1,512}$/
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

type DraftPosition = { occurredOn: string | null; occurredTime: string | null; id: string }

/** An opaque keyset cursor: the last draft's date, time and id. It grants nothing; the next page is still this vault's. */
function encodeDraftCursor(row: SlipDraftRow): string {
  return Buffer.from(JSON.stringify({ v: 1, k: 'slip_drafts', d: row.occurred_on, t: row.occurred_time, i: row.id })).toString('base64url')
}

function decodeDraftCursor(cursor: string): DraftPosition {
  const invalid = () => new ContractValidationError('VALIDATION_FAILED', 'The cursor is malformed.', 'cursor')
  let value: { v?: unknown; k?: unknown; d?: unknown; t?: unknown; i?: unknown } | null
  try {
    if (!CURSOR.test(cursor)) throw new Error('shape')
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as typeof value
  } catch {
    throw invalid()
  }
  const dateOk = value?.d === null || (typeof value?.d === 'string' && DATE.test(value.d))
  const timeOk = value?.t === null || (typeof value?.t === 'string' && TIME.test(value.t))
  if (value?.v !== 1 || value.k !== 'slip_drafts' || !dateOk || !timeOk || !isUuid(value.i)) throw invalid()
  return { occurredOn: value.d as string | null, occurredTime: value.t as string | null, id: value.i }
}

/**
 * GET /v1/drafts: the open drafts, newest slip first (ORDER_BY), `limit` a page (50 by default,
 * at most 200) with a keyset `cursor`. `total` counts every open draft. Each draft names the
 * oldest live record with its amount and date as a possible duplicate (slipDuplicateOf).
 */
export function listSlipDrafts(c: VaultContext, query: unknown): SlipDraftsPage {
  const input = assertKnownFields({ ...(query as Record<string, unknown>) }, ['cursor', 'limit'])
  const limit = parseLimit(single(input.limit, 'limit'))
  const cursor = single(input.cursor, 'cursor')
  const after = cursor === undefined ? null : decodeDraftCursor(cursor)
  const keyset = after ? `WHERE (${ORDER_KEY}) < (coalesce(?, ''), coalesce(?, ''), ?)` : ''
  const rows = c.sql
    .exec<SlipDraftRow>(`SELECT ${SLIP_DRAFT_COLUMNS} FROM slip_drafts ${keyset} ORDER BY ${ORDER_BY} LIMIT ?`, ...(after ? [after.occurredOn, after.occurredTime, after.id] : []), limit + 1)
    .toArray()
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    drafts: page.map((row) => slipDraftDto(row, slipDuplicateOf(c, row.amount_minor, row.occurred_on))),
    total: openDraftCount(c),
    next_cursor: rows.length > limit && last ? encodeDraftCursor(last) : null,
  }
}

/** Runs one draft's record write, and names its refusal by the draft's place in the request: drafts[<i>].transaction.<field>. */
function asDraft<T>(index: number, write: () => T): T {
  const at = `drafts[${index}].transaction`
  try {
    return write()
  } catch (error) {
    if (error instanceof ContractValidationError) throw new ContractValidationError(error.code, error.message, `${at}.${error.field ?? 'body'}`)
    if (error instanceof ProblemException && error.problem.fields) {
      const fields = Object.fromEntries(Object.entries(error.problem.fields).map(([field, key]) => [`${at}.${field}`, key]))
      throw new ProblemException(error.getStatus(), error.code, { ...error.problem, fields })
    }
    throw error
  }
}

/**
 * POST /v1/drafts/confirm (B10, default pending owner Q4): one command for a batch of 1 to 50
 * drafts. The headers, then the body (parseSlipConfirmRequest), then the command. Its mutation
 * reads the drafts with one JSON parameter: a draft that is gone (confirmed, dismissed or expired
 * since the list was read) is 409 VERSION_CONFLICT, nothing is written, and the phone reloads.
 * Each record goes through createTransactionRow, in the request's order, with slipSourceOf(origin)
 * and the draft's slip reference; a refusal names its draft and nothing is written. The drafts
 * go, their references become `confirmed` with their records, and the group is each record's
 * change, then the inbox's.
 */
export function confirmSlipDrafts(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, SLIP_CONFIRM_KIND, null, 'forbidden')
  const { drafts } = parseSlipConfirmRequest(call.body)
  return runCommand(c, { ...command, payload: { id: SLIP_INBOX_ID, drafts } }, () => {
    const ids = JSON.stringify(drafts.map((draft) => draft.draft_id))
    const open = new Map(c.sql.exec<SlipDraftRow>(`SELECT ${SLIP_DRAFT_COLUMNS} FROM slip_drafts WHERE id ${IN_IDS}`, ids).toArray().map((row) => [row.id, row]))
    if (open.size !== drafts.length) throw new ProblemException(409, 'VERSION_CONFLICT')
    const now = c.now.toISOString()
    const records = drafts.map(({ draft_id: draftId, transaction }, index) => {
      const draft = open.get(draftId) as SlipDraftRow
      const record = asDraft(index, () => createTransactionRow(c, transaction, { source: slipSourceOf(draft.origin), slipRefId: draft.ref_id }))
      c.sql.exec("UPDATE slip_refs SET state = 'confirmed', transaction_id = ?, updated_at = ? WHERE id = ?", record.id, now, draft.ref_id).toArray()
      return record
    })
    c.sql.exec(`DELETE FROM slip_drafts WHERE id ${IN_IDS}`, ids).toArray()
    const inbox = inboxChange(c)
    return { entityId: SLIP_INBOX_ID, version: inbox.version, changes: [...records, inbox] }
  })
}

/**
 * POST /v1/drafts/:id/dismiss: one command. The headers, the draft's id (404 when it is not a
 * UUID), then an empty body. An unknown or closed draft is 404. The draft goes, its reference
 * stays known as `dismissed`, and the group is the inbox's change.
 */
export function dismissSlipDraft(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, SLIP_DISMISS_KIND, null, 'forbidden')
  const draftId = routeId(call.params.id ?? '')
  assertKnownFields(call.body ?? {}, [])
  return runCommand(c, { ...command, payload: { id: SLIP_INBOX_ID, draft_id: draftId } }, () => {
    const [draft] = c.sql.exec<{ ref_id: string }>('SELECT ref_id FROM slip_drafts WHERE id = ?', draftId).toArray()
    if (!draft) throw new ProblemException(404, 'NOT_FOUND')
    c.sql.exec('DELETE FROM slip_drafts WHERE id = ?', draftId).toArray()
    c.sql.exec("UPDATE slip_refs SET state = 'dismissed', updated_at = ? WHERE id = ?", c.now.toISOString(), draft.ref_id).toArray()
    const inbox = inboxChange(c)
    return { entityId: SLIP_INBOX_ID, version: inbox.version, changes: [inbox] }
  })
}
