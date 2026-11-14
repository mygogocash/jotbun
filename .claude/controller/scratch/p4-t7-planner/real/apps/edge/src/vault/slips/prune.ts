// The slip prune on the vault's alarm (P4-T7, C11, R37), one of 1B-T11's file prunes. An open draft
// leaves the inbox 30 days after its slip was read (its expires_at, which P4-T6 writes), and its
// slip reference stays known as `expired`. The inbox change is committed under a derived id, with no
// receipt, so the other phones are poked (1D-T10). Backfill use rows go once they are more than 31
// Bangkok days old (P4-T6 counts the 30 days ending today). Each part is its own short block, so
// pruneSlips is never called inside another block (R21). Leases are P4-T6's.
import { bangkokDate } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'

import { appendChanges } from '../commands/change-log'
import type { VaultContext } from '../context'
import { touch } from '../files/context'
import type { FileContext } from '../files/context'
import { inboxChange } from './inbox'

/** A backfill use row is kept until it is more than this many Bangkok days old. */
export const BACKFILL_KEEP_DAYS = 31

const DAY_MS = 86_400_000

/** The calendar date `days` after `date` (both YYYY-MM-DD); a negative count goes back. */
const shiftDate = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10)

/**
 * The open drafts whose expires_at has come go, their references become `expired`, and one inbox
 * change is committed under derivedUuid(vaultId, 'slip-prune', now); nothing expired writes
 * nothing. Then the backfill use rows more than BACKFILL_KEEP_DAYS Bangkok days old go. Both are
 * set-based statements, so any number of drafts binds no id list.
 */
export function pruneSlips(c: FileContext & Pick<VaultContext, 'registry'>): void {
  c.storage.transactionSync(() => {
    const now = c.now.toISOString()
    const expired = c.sql.exec("UPDATE slip_refs SET state = 'expired', updated_at = ?1 WHERE id IN (SELECT ref_id FROM slip_drafts WHERE expires_at <= ?1) RETURNING id", now).toArray()
    if (expired.length === 0) return
    c.sql.exec('DELETE FROM slip_drafts WHERE expires_at <= ?', now).toArray()
    appendChanges(c, derivedUuid(c.vaultId, 'slip-prune', now), [inboxChange(c)])
    touch(c)
  })
  c.storage.transactionSync(() => {
    const gone = c.sql.exec('DELETE FROM slip_backfill_uses WHERE day < ? RETURNING day', shiftDate(bangkokDate(c.now), -BACKFILL_KEEP_DAYS)).toArray()
    if (gone.length > 0) touch(c)
  })
}

/**
 * When pruneSlips next has work (epoch milliseconds), or null (R37): the earliest draft's
 * expires_at, and the Bangkok midnight that makes the oldest backfill row more than
 * BACKFILL_KEEP_DAYS days old. After a prune at that time, the next due time is later or null.
 */
export function slipsDueAt(c: FileContext): number | null {
  const { expires, oldest } = c.sql
    .exec<{ expires: string | null; oldest: string | null }>('SELECT (SELECT min(expires_at) FROM slip_drafts) AS expires, (SELECT min(day) FROM slip_backfill_uses) AS oldest')
    .one()
  const times = [expires === null ? null : Date.parse(expires), oldest === null ? null : Date.parse(`${shiftDate(oldest, BACKFILL_KEEP_DAYS + 1)}T00:00:00.000+07:00`)].filter(
    (time): time is number => time !== null,
  )
  return times.length === 0 ? null : Math.min(...times)
}
