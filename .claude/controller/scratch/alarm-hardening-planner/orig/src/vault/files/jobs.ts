import { logFailure } from '../../v1/log'
import type { UserVault } from '../user-vault'
import { attachmentsDueAt, pruneAttachments } from './attachments'
import type { FileContext } from './context'
import { exportsDueAt, pruneExports } from './exports'
import { pruneUploads, uploadsDueAt } from './intake'
import { deleteDueObjects, objectsDueAt } from './objects'
import { importsDueAt, pruneImports } from './previews'
import { pruneSnapshots, snapshotsDueAt } from './snapshots'
import { startDueAt } from './work'

// Files on the vault's alarm (1B-T11): the file jobs beside 1A-T8b's retention
// jobs. Each due time comes from its owning task's function and constants
// (ruling R37); nothing here derives a deadline. Only an active vault has file
// jobs: none of the prunes checks the vault's state itself, and a vault being
// deleted is left to its erasure, as 1A's retention is.

/** The file jobs, as `schedule` names them. */
export type FileJob = 'start_work' | 'delete_objects' | 'prune_files'

/** Every file job, in the order the alarm runs them. */
export const FILE_JOBS: readonly FileJob[] = ['prune_files', 'delete_objects', 'start_work']

/** One prune: it opens its own short blocks, so it is never called inside another (R21). */
export type FilePrune = (c: FileContext) => void

/** The five prunes, in their tasks' order: uploads (1B-T5), exports (1B-T6), snapshots (1B-T8), receipts (1B-T9), imports (1B-T10). */
export const FILE_PRUNES: readonly FilePrune[] = [pruneUploads, pruneExports, pruneSnapshots, pruneAttachments, pruneImports]

/** The due time of each prune, in the same order. */
const PRUNE_DUE_TIMES: readonly ((c: FileContext) => number | null)[] = [uploadsDueAt, exportsDueAt, snapshotsDueAt, attachmentsDueAt, importsDueAt]

/** What a test sets on UserVault#fileJobOptions, as it sets `clock`: fewer delete batches, or other prunes. */
export type FileJobOptions = { maxBatches?: number; prunes?: readonly FilePrune[] }

/** The most delete batches (up to 1,000 keys each) one alarm runs; keys left over stay due now, so the next alarm continues. */
export const MAX_DELETE_BATCHES = 10

const isActive = (c: FileContext): boolean => c.sql.exec<{ status: string }>('SELECT status FROM account_state WHERE id = 1').toArray()[0]?.status === 'active'

/**
 * When each file job next has work, in epoch milliseconds. A job with nothing
 * to do is absent, and a vault that is not active has none (as 1A's nextDue):
 * - start_work: startDueAt, the starters' earliest due time, never sooner than
 *   a minute after the last start attempt;
 * - delete_objects: objectsDueAt, the earliest deadline in vault_objects;
 * - prune_files: the earliest of the five prunes' due times.
 */
export function fileJobsDue(c: FileContext, lastStartAttemptMs: number | null): Map<FileJob, number> {
  const due = new Map<FileJob, number>()
  if (!isActive(c)) return due
  const start = startDueAt(c, lastStartAttemptMs)
  if (start !== null) due.set('start_work', start)
  const objects = objectsDueAt(c)
  if (objects !== null) due.set('delete_objects', objects)
  const prunes = PRUNE_DUE_TIMES.map((dueAt) => dueAt(c)).filter((at): at is number => at !== null)
  if (prunes.length > 0) due.set('prune_files', Math.min(...prunes))
  return due
}

/** The vaults with a file run in progress in this isolate. */
const running = new WeakSet<UserVault>()

/**
 * The alarm's file jobs, for an active vault only. First every prune of
 * `options.prunes ?? FILE_PRUNES`, one after another on one clock reading, each
 * in its own try: a throw is logged and the next prune still runs. Then
 * deleteDueObjects, at most `options.maxBatches ?? MAX_DELETE_BATCHES` batches;
 * it reads the bucket inside its own try, so an unbound OBJECTS is a failed
 * delete, due again a minute later. Then, unless an erase() landed during the
 * R2 wait, startPendingWork when start_work is due (it records the attempt).
 * One run at a time per vault: a run that finds another in progress returns at
 * once, so deleteDueObjects never overlaps itself (the 1B-T4 follow-up). Each
 * job's failure is logged and returned, never thrown, so the alarm comes back
 * a minute later and the platform never retries it in a loop.
 */
export async function runFileJobs(v: UserVault, options: FileJobOptions = {}): Promise<FileJob[]> {
  if (v.erased || running.has(v)) return []
  running.add(v)
  const failed: FileJob[] = []
  const fail = (job: FileJob, event: string, error: unknown): void => {
    logFailure(event, error)
    if (!failed.includes(job)) failed.push(job)
  }
  try {
    const c = v.fileContext()
    if (!v.isActive(c)) return failed
    for (const prune of options.prunes ?? FILE_PRUNES) {
      try {
        prune(c)
      } catch (error) {
        fail('prune_files', 'file_prune_failed', error)
      }
    }
    try {
      await deleteDueObjects(
        {
          context: () => v.fileContext(),
          get bucket() {
            return v.bucket
          },
        },
        options.maxBatches ?? MAX_DELETE_BATCHES,
      )
    } catch (error) {
      fail('delete_objects', 'file_delete_failed', error)
    }
    if (v.erased) return failed
    try {
      const s = v.fileContext()
      const due = startDueAt(s, v.lastStartAttemptMs)
      if (due !== null && due <= s.now.getTime()) await v.startPendingWork()
    } catch (error) {
      fail('start_work', 'file_start_failed', error)
    }
    return failed
  } finally {
    running.delete(v)
  }
}
