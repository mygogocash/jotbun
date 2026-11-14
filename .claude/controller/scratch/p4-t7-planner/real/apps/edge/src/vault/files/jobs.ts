import { logFailure } from '../../v1/log'
import type { VaultContext } from '../context'
import { pruneSlips, slipsDueAt } from '../slips/prune'
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

/**
 * One prune: it opens its own short blocks, so it is never called inside another (R21). It also
 * gets the vault's registry, since the slip prune (P4-T7) commits the inbox change through it.
 */
export type FilePrune = (c: FileContext & Pick<VaultContext, 'registry'>) => void

// Each entry below calls its function when it runs, never while this module loads. retention.ts imports this
// module, which imports exports.ts and previews.ts, which import retention.ts; in that cycle this module can run
// first (it does in the vault bundle), so an entry that read one of their exports at load time would hold
// undefined, or throw, unless that export happened to be a hoisted function declaration (the 1B-T11 review's
// n5). The build would not say so either: Vite drops the bundler's circular-dependency warnings.

/**
 * The six prunes: uploads (1B-T5), exports (1B-T6), receipts (1B-T9), imports (1B-T10), slips (P4-T7),
 * then snapshots (1B-T8) last. pruneExports and pruneImports purge records, which raises the purge
 * watermark, so a ready snapshot that a purge in this run makes stale has its chunks released in this run
 * too, and snapshotsDueAt is not left at now (the 1B-T11 review's m1; ruling R37). The slip prune purges
 * nothing; it commits one inbox change when drafts expire.
 */
export const FILE_PRUNES: readonly FilePrune[] = [
  (c) => pruneUploads(c),
  (c) => pruneExports(c),
  (c) => pruneAttachments(c),
  (c) => pruneImports(c),
  (c) => pruneSlips(c),
  (c) => pruneSnapshots(c),
]

/** The due time of each prune, in the same order. */
const PRUNE_DUE_TIMES: readonly ((c: FileContext) => number | null)[] = [
  (c) => uploadsDueAt(c),
  (c) => exportsDueAt(c),
  (c) => attachmentsDueAt(c),
  (c) => importsDueAt(c),
  (c) => slipsDueAt(c),
  (c) => snapshotsDueAt(c),
]

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
 * - prune_files: the earliest of the six prunes' due times.
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
 * once, so deleteDueObjects never overlaps itself (the 1B-T4 follow-up), and
 * reports delete_objects as failed, since the run in progress holds the delete:
 * the alarm then comes back a minute later, not at once (the 1B-T11 review's
 * n1). Each job's failure is logged and returned, never thrown, so the alarm
 * comes back a minute later and the platform never retries it in a loop.
 */
export async function runFileJobs(v: UserVault, options: FileJobOptions = {}): Promise<FileJob[]> {
  if (v.erased) return []
  if (running.has(v)) {
    logFailure('file_run_held', new Error('another file run is in progress'))
    return ['delete_objects']
  }
  running.add(v)
  const failed: FileJob[] = []
  const fail = (job: FileJob, event: string, error: unknown): void => {
    logFailure(event, error)
    if (!failed.includes(job)) failed.push(job)
  }
  try {
    // The prunes' context carries the registry the vault built once (P4-T7's slip prune commits a change).
    const c = { ...v.fileContext(), registry: v.registry }
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
