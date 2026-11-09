import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

import type { V1Env } from '../v1/env'
import type { BuildOutcome } from '../vault/files/work'

// 1B-T8 typed stub (RED): the run builds nothing. Step 4 replaces this file with the real module.

export type SnapshotParams = { vault: string; snapshot: string }

export const SNAPSHOT_STEP = { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '10 minutes' } as const

export class SnapshotWorkflow extends WorkflowEntrypoint<V1Env, SnapshotParams> {
  async run(_event: Readonly<WorkflowEvent<SnapshotParams>>, _step: WorkflowStep): Promise<BuildOutcome> {
    return { outcome: 'skipped' }
  }
}
