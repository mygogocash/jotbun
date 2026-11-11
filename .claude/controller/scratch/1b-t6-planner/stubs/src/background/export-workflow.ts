// 1B-T6 typed stub (RED): the Workflow answers skipped and calls nothing.
import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

import type { V1Env } from '../v1/env'
import type { BuildOutcome } from '../vault/files/work'

export type ExportParams = { vault: string; export: string }

export const EXPORT_STEP = { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '15 minutes' } as const

export class ExportWorkflow extends WorkflowEntrypoint<V1Env, ExportParams> {
  async run(_event: Readonly<WorkflowEvent<ExportParams>>, _step: WorkflowStep): Promise<BuildOutcome> {
    return { outcome: 'skipped' }
  }
}
