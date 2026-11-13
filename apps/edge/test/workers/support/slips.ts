// Slip test support (P4-T3; P4-T6 and P4-T7 add theirs): a slip draft written straight into
// a person's vault, as a slip read writes one: a `draft` slip reference and its draft row.
// It commits no inbox change and makes no slip account (S2: a read makes only the person's
// side one; a test makes it with ensureSlipAccount). Synthetic values only.
import { runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'

import { SLIP_LIMITS } from '@gogospend/contracts'
import type { SlipOrigin, SlipParty } from '@gogospend/contracts'

import { vaultOf } from './v1-client'
import type { TestUser } from './v1-client'

export type SlipDraftFields = {
  amount_minor: string
  occurred_on: string
  occurred_time: string
  direction: 'out' | 'in'
  from: SlipParty
  to: SlipParty
  category_id: string
  origin: SlipOrigin
  created_at: string
  expires_at: string
}

const DAY_MS = 86_400_000

/** A random salted slip reference hash: 64 lowercase hex digits, as the phone sends one. */
export function randomRefHash(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** One side of a slip, as printed. */
export const party = (bank: SlipParty['bank'], last4: string | null, name: string | null = null): SlipParty => ({ bank, account_last4: last4, name })

/**
 * Writes one open draft and its `draft` slip reference in one block. Defaults: 65.00 baht out on
 * 2026-10-20 at 12:30 from kbank 1234 to scb 9876, read by Haiku from the K PLUS album, expiring
 * 30 days after it was read (C11). A category comes as Bun's guess (S3). Returns the draft's id
 * and its reference hash.
 */
export async function seedSlipDraft(user: TestUser, fields: Partial<SlipDraftFields> = {}): Promise<{ draftId: string; refHash: string }> {
  const draftId = randomUUID()
  const refId = randomUUID()
  const refHash = randomRefHash()
  const { category_id: category = null, ...given } = fields
  const createdAt = given.created_at ?? new Date().toISOString()
  const draft: Omit<SlipDraftFields, 'category_id'> = {
    amount_minor: '6500',
    occurred_on: '2026-10-20',
    occurred_time: '12:30',
    direction: 'out',
    from: party('kbank', '1234', 'นาย ทดสอบ ใจดี'),
    to: party('scb', '9876', 'ร้านป้าแดง ข้าวแกง'),
    origin: 'album',
    created_at: createdAt,
    expires_at: new Date(Date.parse(createdAt) + SLIP_LIMITS.draftDays * DAY_MS).toISOString(),
    ...given,
  }
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    state.storage.transactionSync(() => {
      state.storage.sql
        .exec("INSERT INTO slip_refs (id, ref_hash, state, transaction_id, first_seen_at, updated_at) VALUES (?, ?, 'draft', NULL, ?, ?)", refId, refHash, draft.created_at, draft.created_at)
        .toArray()
      state.storage.sql
        .exec(
          `INSERT INTO slip_drafts (id, ref_id, amount_minor, occurred_on, occurred_time, direction, from_bank, from_last4, from_name, to_bank, to_last4, to_name,
             category_id, category_guessed, flags, album, origin, model, escalated, announced, created_at, expires_at)
           VALUES (?, ?, CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'claude-haiku-5-5', 0, 0, ?, ?)`,
          draftId,
          refId,
          draft.amount_minor,
          draft.occurred_on,
          draft.occurred_time,
          draft.direction,
          draft.from.bank,
          draft.from.account_last4,
          draft.from.name,
          draft.to.bank,
          draft.to.account_last4,
          draft.to.name,
          category,
          category === null ? 0 : 1,
          category === null ? '[]' : '["category_guessed"]',
          draft.origin === 'album' ? 'K PLUS' : null,
          draft.origin,
          draft.created_at,
          draft.expires_at,
        )
        .toArray()
    })
  })
  return { draftId, refHash }
}
