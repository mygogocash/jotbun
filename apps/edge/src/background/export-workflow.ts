import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

import type { V1Env } from '../v1/env'
import { logFailure } from '../v1/log'
import type { BuildOutcome } from '../vault/files/work'
import { vaultById } from './vault-stub'

// Exports on Workflows (1B-T6, B5). The params carry the vault id and the
// export id, never a user id (B11). The step calls the vault, which reads its
// ledger synchronously and writes the file to R2 itself, so file bytes never
// cross RPC or step state (the step's result is `{ outcome }`).

export type ExportParams = { vault: string; export: string }

/** Three attempts of at most 900 seconds each: the API's EXPORT_MAX_ATTEMPTS and EXPORT_MAX_RUNTIME_SECONDS. */
export const EXPORT_STEP = { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '15 minutes' } as const

/**
 * Writes one export. Each attempt writes under a fresh key (B4), so a retried
 * step never meets its own create-only object. When the write still throws
 * after its retries, the vault records the export as failed (`error`) and the
 * run answers `failed`. `too_large` and `skipped` are answers, not failures.
 */
export class ExportWorkflow extends WorkflowEntrypoint<V1Env, ExportParams> {
  async run(event: Readonly<WorkflowEvent<ExportParams>>, step: WorkflowStep): Promise<BuildOutcome> {
    const p = event.payload
    try {
      return await step.do('write the export file', EXPORT_STEP, () => vaultById(this.env, p.vault).writeExport(p.export))
    } catch (error) {
      logFailure('export_write_failed', error)
      await step.do('record the failure', async () => {
        await vaultById(this.env, p.vault).failExport(p.export)
        return { recorded: true }
      })
      return { outcome: 'failed' }
    }
  }
}
