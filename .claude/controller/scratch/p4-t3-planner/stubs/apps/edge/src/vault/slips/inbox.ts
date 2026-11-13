// RED stub (P4-T3): the plan's interface, with no behaviour yet.
import { SLIP_INBOX_ID } from '@gogospend/contracts'
import type { EntityChange, Minor, SlipDraftDto, SlipOrigin, SlipReadModel, ThaiBankKey } from '@gogospend/contracts'

export const SLIP_INBOX_ENTITY = 'slip_inbox'

export function openDraftCount(_c: { sql: SqlStorage }): number {
  return -1
}

export function inboxChange(_c: { sql: SqlStorage }): EntityChange {
  return { entity: SLIP_INBOX_ENTITY, id: SLIP_INBOX_ID, version: 0, state: 'active', snapshot: null }
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

export const SLIP_DRAFT_COLUMNS = 'id'

export function slipDraftDto(row: SlipDraftRow, _duplicateOf: string | null): SlipDraftDto {
  const nobody = { bank: null, account_last4: null, name: null }
  return {
    id: row.id,
    amount_minor: null,
    occurred_on: null,
    occurred_time: null,
    direction: 'out',
    from: nobody,
    to: nobody,
    category_id: null,
    category_guessed: false,
    flags: [],
    album: null,
    origin: 'photo',
    model: 'claude-haiku-5-5',
    escalated: false,
    created_at: '',
    expires_at: '',
    duplicate_of: null,
  }
}

export function slipDuplicateOf(_c: { sql: SqlStorage }, _amountMinor: Minor | null, _occurredOn: string | null): string | null {
  return null
}
