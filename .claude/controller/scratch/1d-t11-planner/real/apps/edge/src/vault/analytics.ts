// Server analytics, the vault's half (1D-T11; plan 1D's L5 and L6, spec §7).
// The vault answers what only it can read: the person's analytics consent, the
// whole weeks since they signed up, and the records a create committed, as
// record_saved events that carry a kind and a category key only (Q16: imports
// and every other writer never count). The Worker adds the analytics id and
// decides what is sent (src/v1/handler.ts). Nothing here reads an amount, a
// note, a merchant or a category's label.
import type { ServerEvent } from '../analytics/server-analytics'
import { logFailure } from '../v1/log'
import type { VaultAnalytics, VaultRouteId } from '../v1/protocol'
import type { VaultContext } from './context'
import { categoryById } from './domain/categories'
import { currentRevision } from './live'

export type AnalyticsConsent = VaultAnalytics['consent']

/** At most this many whole weeks (20 years): the bound the phone checks (apps/app/src/analytics/analyticsServer.ts). */
export const MAX_WEEKS_SINCE_SIGNUP = 1040

const WEEK_MS = 7 * 86_400_000

/** The ('analytics', 0) consents row: granted 1 is yes, granted 0 is no, and no row is unasked. */
export function analyticsConsent(c: VaultContext): AnalyticsConsent {
  const [row] = c.sql.exec<{ granted: number }>("SELECT granted FROM consents WHERE kind = 'analytics' AND version = 0").toArray()
  if (row === undefined) return 'unasked'
  return row.granted === 1 ? 'yes' : 'no'
}

/** Whole weeks from account_state.created_at to the vault's clock: an integer from 0 to 1040, and 0 when that time cannot be read. */
export function weeksSinceSignup(c: VaultContext): number {
  const [account] = c.sql.exec<{ created_at: string }>('SELECT created_at FROM account_state WHERE id = 1').toArray()
  const created = account === undefined ? Number.NaN : Date.parse(account.created_at)
  if (!Number.isFinite(created)) return 0
  return Math.min(MAX_WEEKS_SINCE_SIGNUP, Math.max(0, Math.floor((c.now.getTime() - created) / WEEK_MS)))
}

/**
 * One record_saved for each record a transactions.create committed after
 * `before`, up to `after`; nothing for any other route (Q16). The change log is
 * read by a revision range with two parameters, never an id list (R57). A
 * transfer sends its kind only; any other record also sends its category's
 * built-in key, or 'custom', looked up one id at a time.
 */
export function committedEvents(c: VaultContext, route: VaultRouteId, before: string, after: string): ServerEvent[] {
  if (route !== 'transactions.create') return []
  return c.sql
    .exec<{ snapshot: string }>(
      "SELECT snapshot FROM entity_changes WHERE entity = 'transaction' AND version = 1 AND state = 'active' AND revision > CAST(?1 AS INTEGER) AND revision <= CAST(?2 AS INTEGER) ORDER BY revision, ordinal",
      before,
      after,
    )
    .toArray()
    .map((row) => recordSaved(c, JSON.parse(row.snapshot) as { type?: unknown; category_id?: unknown }))
}

function recordSaved(c: VaultContext, record: { type?: unknown; category_id?: unknown }): ServerEvent {
  const kind = typeof record.type === 'string' ? record.type : ''
  if (kind === 'transfer') return { name: 'record_saved', properties: { kind } }
  const category = typeof record.category_id === 'string' ? categoryById(c, record.category_id) : undefined
  return { name: 'record_saved', properties: { kind, category_key: category?.builtin_key ?? 'custom' } }
}

/**
 * What callWithAnalytics answers beside the reply, read after the block: a
 * refusal committed nothing, so these reads see the state before it. The
 * consent is read only when the vault holds the caller's own account, so a
 * refused first call, an erased vault or another account's vault reads
 * 'unasked'. Never throws: a failed read is logged by its class name only, and
 * the call's reply stands.
 */
export function analyticsAfterCall(c: VaultContext, route: VaultRouteId, before: string, failure: string | null): VaultAnalytics {
  try {
    const [account] = c.sql.exec<{ account_id: string }>('SELECT account_id FROM account_state WHERE id = 1').toArray()
    const consent = account !== undefined && account.account_id === c.claims.accountId ? analyticsConsent(c) : 'unasked'
    return { consent, events: committedEvents(c, route, before, currentRevision(c.sql)), failure }
  } catch (error) {
    logFailure('vault_analytics_failed', error)
    return { consent: 'unasked', events: [], failure }
  }
}
