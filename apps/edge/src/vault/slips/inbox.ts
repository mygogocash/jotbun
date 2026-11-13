// The slip inbox (P4-T3, S1, A28). Only the count of open drafts is change-logged, as the one
// `slip_inbox` entity of each vault ({ id: SLIP_INBOX_ID, version, open }); drafts, slip
// references and slip accounts never reach a phone's diary, the sync feed or a snapshot. A
// write that changes the open drafts (P4-T6, P4-T7) commits inboxChange(c) in its change
// group, so the other phones are poked (1D-T10) and keep the Home card's count. Every
// slip_drafts row is an open draft: confirm, dismiss and expiry delete it (P4-T7).
//
// The draft mapper and the duplicate check are here too, for P4-T6 and P4-T7.
import { SLIP_INBOX_ID } from '@gogospend/contracts'
import type { AiDraftFlag, EntityChange, Minor, SlipDraftDto, SlipOrigin, SlipReadModel, ThaiBankKey } from '@gogospend/contracts'

/** The entity the inbox count syncs as (commands/registry.ts defines it after the import entities). */
export const SLIP_INBOX_ENTITY = 'slip_inbox'

/** How many drafts are open: every row of slip_drafts. */
export function openDraftCount(c: { sql: SqlStorage }): number {
  return c.sql.exec<{ n: number }>('SELECT count(*) AS n FROM slip_drafts').one().n
}

/**
 * The inbox's next change, for the caller's change group: one version past the
 * head (1 without a head), active, with the open count read now. It reads
 * entity_heads itself, so a change committed earlier in the same block counts.
 */
export function inboxChange(c: { sql: SqlStorage }): EntityChange {
  const [head] = c.sql.exec<{ version: number }>('SELECT version FROM entity_heads WHERE entity = ? AND entity_id = ?', SLIP_INBOX_ENTITY, SLIP_INBOX_ID).toArray()
  const version = (head?.version ?? 0) + 1
  return { entity: SLIP_INBOX_ENTITY, id: SLIP_INBOX_ID, version, state: 'active', snapshot: { id: SLIP_INBOX_ID, version, open: openDraftCount(c) } }
}

/** A slip_drafts row as SLIP_DRAFT_COLUMNS reads it: the amount as text (R16), the flags as JSON text, booleans as 0 or 1. */
export type SlipDraftRow = {
  id: string
  ref_id: string
  amount_minor: Minor | null
  occurred_on: string | null
  occurred_time: string | null
  direction: 'out' | 'in'
  from_bank: ThaiBankKey | null
  from_last4: string | null
  from_name: string | null
  to_bank: ThaiBankKey | null
  to_last4: string | null
  to_name: string | null
  category_id: string | null
  category_guessed: number
  flags: string
  album: string | null
  origin: SlipOrigin
  model: SlipReadModel
  escalated: number
  announced: number
  created_at: string
  expires_at: string
}

/** Every column of slip_drafts, the amount as text: what P4-T6 and P4-T7 select before slipDraftDto. */
export const SLIP_DRAFT_COLUMNS = `id, ref_id, CAST(amount_minor AS TEXT) AS amount_minor, occurred_on, occurred_time, direction,
  from_bank, from_last4, from_name, to_bank, to_last4, to_name, category_id, category_guessed, flags,
  album, origin, model, escalated, announced, created_at, expires_at`

/** The one mapper from a draft row to the phone's DTO (P4-T6, P4-T7). Its slip reference and announcement stay in the vault. */
export function slipDraftDto(row: SlipDraftRow, duplicateOf: string | null): SlipDraftDto {
  return {
    id: row.id,
    amount_minor: row.amount_minor,
    occurred_on: row.occurred_on,
    occurred_time: row.occurred_time,
    direction: row.direction,
    from: { bank: row.from_bank, account_last4: row.from_last4, name: row.from_name },
    to: { bank: row.to_bank, account_last4: row.to_last4, name: row.to_name },
    category_id: row.category_id,
    category_guessed: row.category_guessed === 1,
    flags: JSON.parse(row.flags) as AiDraftFlag[],
    album: row.album,
    origin: row.origin,
    model: row.model,
    escalated: row.escalated === 1,
    created_at: row.created_at,
    expires_at: row.expires_at,
    duplicate_of: duplicateOf,
  }
}

/**
 * The oldest live record with the draft's amount and date: a possible
 * duplicate. A draft with no amount or no date names none (`= NULL` matches no row).
 */
export function slipDuplicateOf(c: { sql: SqlStorage }, amountMinor: Minor | null, occurredOn: string | null): string | null {
  const [row] = c.sql
    .exec<{ id: string }>('SELECT id FROM transactions WHERE deleted_at IS NULL AND amount_minor = CAST(?1 AS INTEGER) AND occurred_on = ?2 ORDER BY created_at LIMIT 1', amountMinor, occurredOn)
    .toArray()
  return row === undefined ? null : row.id
}
