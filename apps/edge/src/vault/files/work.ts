import type { FeatureGates } from '@api/common/feature-gates'

import { logFailure } from '../../v1/log'
import type { VaultEnv } from '../user-vault'
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
