import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

import type { V1Env } from '../v1/env'
import { logFailure } from '../v1/log'
import type { BuildOutcome } from '../vault/files/work'
import { vaultById } from './vault-stub'

// Resync snapshots on Workflows (1B-T8, B5). The params carry the vault id and
// the snapshot id, never a user id (B11). The step calls the vault, which reads
// its ledger synchronously and writes the chunks to R2 itself, so chunk bytes
// never cross RPC or step state (the step's result is `{ outcome }`).

export type SnapshotParams = { vault: string; snapshot: string }

/** Three attempts of at most 600 seconds each: the API's snapshot job (max_attempts 3, max_runtime_seconds 600). */
export const SNAPSHOT_STEP = { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '10 minutes' } as const

/**
 * Builds one snapshot. Each attempt writes under a fresh attempt token (B4),
 * so a retried step never meets its own create-only chunks, and a build read
 * before a purge throws, so the retry reads again. When the build still throws
 * after its retries, the vault records the snapshot as failed and the run
 * answers `failed`. `too_large` and `skipped` are answers, not failures.
 */
export class SnapshotWorkflow extends WorkflowEntrypoint<V1Env, SnapshotParams> {
  async run(event: Readonly<WorkflowEvent<SnapshotParams>>, step: WorkflowStep): Promise<BuildOutcome> {
    const p = event.payload
    try {
      return await step.do('build the snapshot', SNAPSHOT_STEP, () => vaultById(this.env, p.vault).buildSnapshot(p.snapshot))
    } catch (error) {
      logFailure('snapshot_build_failed', error)
      await step.do('record the failure', async () => {
        await vaultById(this.env, p.vault).failSnapshot(p.snapshot)
        return { recorded: true }
      })
      return { outcome: 'failed' }
    }
  }
}
