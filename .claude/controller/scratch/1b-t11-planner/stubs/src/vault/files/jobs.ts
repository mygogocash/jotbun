import type { UserVault } from '../user-vault'
import type { FileContext } from './context'

// 1B-T11 typed stub (RED): no file job is ever due, and the alarm runs none. Step 4 puts the real module in place.

export type FileJob = 'start_work' | 'delete_objects' | 'prune_files'

export const FILE_JOBS: readonly FileJob[] = ['prune_files', 'delete_objects', 'start_work']

export type FilePrune = (c: FileContext) => void

export const FILE_PRUNES: readonly FilePrune[] = []

export type FileJobOptions = { maxBatches?: number; prunes?: readonly FilePrune[] }

export const MAX_DELETE_BATCHES = 10

export function fileJobsDue(_c: FileContext, _lastStartAttemptMs: number | null): Map<FileJob, number> {
  return new Map()
}

export async function runFileJobs(_v: UserVault, _options: FileJobOptions = {}): Promise<FileJob[]> {
  return []
}
