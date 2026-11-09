import type { FeatureGates } from '@api/common/feature-gates'

import { logFailure } from '../../v1/log'
import { PARSE_RESEND_MS } from './parse'
import type { VaultEnv } from '../user-vault'
import { touch } from './context'
import type { FileContext } from './context'

// Pending work (B5): exports, snapshot builds and parses the vault has
// recorded but not yet started. UserVault#call is synchronous, so the Worker
// starts them after its reply (waitUntil), and the vault's alarm starts any
// start that did not happen (1B-T11). Each kind of work is one starter;
// 1B-T5 (parse), 1B-T6 (export) and 1B-T8 (snapshot) each add theirs below.

/** What a background build answers: writeExport (1B-T6) and buildSnapshot (1B-T8). */
export type BuildOutcome = { outcome: 'ready' | 'skipped' | 'too_large' | 'failed' }

/** `unbound`: this Worker has no binding for the work yet, so it waits for a later start. */
export type StartResult = 'started' | 'unbound'

export type WorkStarter = {
  kind: 'snapshot' | 'export' | 'parse'
  /** The ids recorded but not started. */
  unstarted(c: FileContext): readonly string[]
  /** When the oldest unstarted item is worth a retry, or null when none waits. */
  dueAt(c: FileContext): number | null
  /** Starts one item outside every block (a Workflow create or a queue send). */
  start(env: VaultEnv, vaultId: string, id: string): Promise<StartResult>
  /** Records the start; runs inside a short block of its own. */
  markStarted(c: FileContext, id: string): void
}

/** A start is tried again at most once a minute. */
export const START_RETRY_MS = 60_000

/** Every kind of pending work. Empty until 1B-T5, T6 and T8 each add a starter. */
export const WORK_STARTERS: WorkStarter[] = []

/**
 * Creates a Workflow instance under a known id, once. `create` throws for an
 * id already used (Workflows docs), so when it throws and `get(id)` resolves,
 * the instance exists and counts as created; otherwise the first error is
 * thrown.
 */
export async function createOnce<P>(workflow: Workflow<P>, id: string, params: P): Promise<void> {
  try {
    await workflow.create({ id, params })
  } catch (error) {
    try {
      await workflow.get(id)
    } catch {
      throw error
    }
  }
}

/** When pending work is next worth starting: the later of the starters' earliest due time and the last attempt plus a minute; null when no starter has work. */
export function startDueAt(c: FileContext, lastStartAttemptMs: number | null, starters: readonly WorkStarter[] = WORK_STARTERS): number | null {
  let earliest: number | null = null
  for (const starter of starters) {
    const due = starter.dueAt(c)
    if (due !== null && (earliest === null || due < earliest)) earliest = due
  }
  if (earliest === null) return null
  return lastStartAttemptMs === null ? earliest : Math.max(earliest, lastStartAttemptMs + START_RETRY_MS)
}

/** What startPendingWork needs of the vault. */
export type PendingWorkHost = { env: VaultEnv; erased: boolean; context(): FileContext; active(c: FileContext): boolean; gates(): Promise<FeatureGates> }

/**
 * Starts every unstarted item of every starter. Nothing happens in an erased
 * vault or one that is not active. While the `jobs` gate is paused nothing
 * starts and the answer is `held` (C12: in the API every worker claim needs
 * `jobs` open). An item that started is marked in a short block of its own;
 * an `unbound` one is left for a later run; a start that throws counts as
 * failed, is logged, and is left for a later run too.
 */
export async function startPendingWork(v: PendingWorkHost, starters: readonly WorkStarter[] = WORK_STARTERS): Promise<{ started: number; failed: number; held: boolean }> {
  if (v.erased) return { started: 0, failed: 0, held: false }
  const c = v.context()
  if (!v.active(c)) return { started: 0, failed: 0, held: false }
  if ((await v.gates()).isPaused('jobs')) return { started: 0, failed: 0, held: true }
  let started = 0
  let failed = 0
  for (const starter of starters) {
    for (const id of starter.unstarted(c)) {
      try {
        if ((await starter.start(v.env, c.vaultId, id)) === 'started') {
          c.storage.transactionSync(() => starter.markStarted(c, id))
          started += 1
        }
      } catch (error) {
        failed += 1
        logFailure('work_start_failed', error)
      }
    }
  }
  return { started, failed, held: false }
}

// 1B-T5: the parse starter (ruling R32). One condition serves `unstarted` and
// `dueAt`: an accepted upload queued (or parsing) whose message was never sent,
// or was last sent or seen by the consumer more than PARSE_RESEND_MS ago, as
// when the queue discarded it after max_retries. A message sent twice is
// harmless: the consumer runs one message at a time and parseSource skips a
// job that is no longer queued or parsing.

const PARSE_WAITING = "status = 'accepted' AND parse_state IN ('queued', 'parsing')"

export const PARSE_STARTER: WorkStarter = {
  kind: 'parse',
  unstarted(c) {
    const stale = new Date(c.now.getTime() - PARSE_RESEND_MS).toISOString()
    // Bounded by the parse quota: at most 10 accepted uploads a day, each expired within 24 hours.
    return c.sql
      .exec<{ job_id: string }>(`SELECT job_id FROM import_uploads WHERE ${PARSE_WAITING} AND (enqueued_at IS NULL OR enqueued_at <= ?) ORDER BY accepted_at, job_id`, stale)
      .toArray()
      .map((row) => row.job_id)
  },
  dueAt(c) {
    const { unsent, sent } = c.sql
      .exec<{ unsent: string | null; sent: string | null }>(
        `SELECT (SELECT min(accepted_at) FROM import_uploads WHERE ${PARSE_WAITING} AND enqueued_at IS NULL) AS unsent,
                (SELECT min(enqueued_at) FROM import_uploads WHERE ${PARSE_WAITING} AND enqueued_at IS NOT NULL) AS sent`,
      )
      .one()
    const times = [unsent === null ? null : Date.parse(unsent) + START_RETRY_MS, sent === null ? null : Date.parse(sent) + PARSE_RESEND_MS].filter((time): time is number => time !== null)
    return times.length === 0 ? null : Math.min(...times)
  },
  async start(env, vaultId, id) {
    if (!env.PARSE_QUEUE) return 'unbound'
    await env.PARSE_QUEUE.send({ vault: vaultId, job: id })
    return 'started'
  },
  markStarted(c, id) {
    c.sql.exec(`UPDATE import_uploads SET enqueued_at = ?, enqueued_attempts = parse_attempts WHERE job_id = ? AND ${PARSE_WAITING}`, c.now.toISOString(), id)
    touch(c)
  },
}

WORK_STARTERS.push(PARSE_STARTER)

// 1B-T6: the export starter (B5). An export the vault recorded but has not
// started is a pending row with no started_at. Its Workflow instance is named
// by the export's id, so a second start (two overlapping runs, or the alarm
// after a hand-off that did start) finds the instance and changes nothing.

export const EXPORT_STARTER: WorkStarter = {
  kind: 'export',
  unstarted(c) {
    // Bounded: at most EXPORT_MAX_OPEN (2) exports are pending at once.
    return c.sql
      .exec<{ id: string }>("SELECT id FROM exports WHERE status = 'pending' AND started_at IS NULL ORDER BY requested_at, id")
      .toArray()
      .map((row) => row.id)
  },
  dueAt(c) {
    const { oldest } = c.sql.exec<{ oldest: string | null }>("SELECT min(requested_at) AS oldest FROM exports WHERE status = 'pending' AND started_at IS NULL").one()
    return oldest === null ? null : Date.parse(oldest) + START_RETRY_MS
  },
  async start(env, vaultId, id) {
    if (!env.EXPORT_WORKFLOW) return 'unbound'
    await createOnce(env.EXPORT_WORKFLOW, id, { vault: vaultId, export: id })
    return 'started'
  },
  markStarted(c, id) {
    c.sql.exec("UPDATE exports SET started_at = ? WHERE id = ? AND status = 'pending' AND started_at IS NULL", c.now.toISOString(), id)
    touch(c)
  },
}

WORK_STARTERS.push(EXPORT_STARTER)

// 1B-T8 typed stub (RED): the snapshot starter finds nothing and starts nothing. Step 4 puts the real starter back.

export const SNAPSHOT_STARTER: WorkStarter = {
  kind: 'snapshot',
  unstarted: () => [],
  dueAt: () => null,
  start: async () => 'unbound',
  markStarted: () => undefined,
}

WORK_STARTERS.push(SNAPSHOT_STARTER)
