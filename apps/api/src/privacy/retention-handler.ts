import type { Pool } from 'pg';

import { defaultPrivacySteps } from './privacy-steps';
import type { PrivacySteps } from './privacy-steps';

/** Per-step removal counts, and the steps that failed this run (they run again next time). */
export type RetentionReport = { counts: Record<string, number>; failed: string[] };

/**
 * Runs every registered retention step (privacy-steps.ts) on the generic
 * worker's login (gogospend_jobs), in order. Each step runs even if an
 * earlier one failed; failures are reported by step name only, never with
 * error text (it could carry data). Every deadline is the database clock, so
 * no worker clock can shorten one.
 */
export class RetentionHandler {
  constructor(private readonly pool: Pool, private readonly steps: PrivacySteps = defaultPrivacySteps()) {}

  async run(): Promise<RetentionReport> {
    const report: RetentionReport = { counts: {}, failed: [] };
    for (const step of this.steps.retentionSteps()) {
      try {
        report.counts[step.name] = await step.run(this.pool);
      } catch {
        report.failed.push(step.name);
      }
    }
    return report;
  }
}
