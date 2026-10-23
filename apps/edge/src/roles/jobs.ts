// The jobs Worker (the API's `worker:jobs`): snapshots, exports and import
// expiry, on every Cron Trigger and on wake-ups from the edge, and the sweep
// (retention, overdue objects, backlog) every JOB_SWEEP_INTERVAL_MINUTES.
// Logins: HYPERDRIVE_JOBS (gogospend_jobs) and HYPERDRIVE_LEASED_READ
// (gogospend_leased_read). `import_parse` runs in the parser container, which
// this Worker wakes when uploads wait.
import { ConfigurationError } from '@api/common/configuration-error'

import { R2ObjectStore } from '../server/storage/r2-object-store'
import type { R2BucketLike } from '../server/storage/r2-object-store'
import { runGenericJobs, runMaintenance } from '../server/jobs/roles'
import type { GenericJobDeps } from '../server/jobs/roles'
import { RUN_BUDGET_MS, ackAll, noHttp, poolOf, settingsAndGates, withPools } from './common'
import type { BatchLike, HyperdriveLike, ScheduledLike } from './common'
import { wakeParser } from './parser'
import type { ParserBinding } from './parser'

// The parser container's Durable Object lives in this Worker.
export { ImportParser } from './parser'

export type JobsEnv = {
  HYPERDRIVE_JOBS?: HyperdriveLike
  HYPERDRIVE_LEASED_READ?: HyperdriveLike
  OBJECTS?: R2BucketLike
  /** The parser container (Durable Object namespace); without it, imports wait for one. */
  PARSER?: ParserBinding
  JOB_SWEEP_INTERVAL_MINUTES?: string
}

export function sweepMinutes(value: string | undefined): number {
  const minutes = Number(value ?? 15)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new ConfigurationError('JOB_SWEEP_INTERVAL_MINUTES must be 1-1440.')
  return minutes
}

async function run(env: JobsEnv, sweep: boolean): Promise<void> {
  if (!env.OBJECTS) throw new Error('OBJECTS is not bound.')
  const { gates } = settingsAndGates(env)
  const jobsPool = poolOf(env.HYPERDRIVE_JOBS, 'HYPERDRIVE_JOBS')
  const readPool = poolOf(env.HYPERDRIVE_LEASED_READ, 'HYPERDRIVE_LEASED_READ')
  const deps: GenericJobDeps = { jobsPool, readPool, store: new R2ObjectStore(env.OBJECTS), gates, parserContainer: Boolean(env.PARSER) }
  await withPools([jobsPool, readPool], async () => {
    if (sweep) await runMaintenance(deps)
    const ran = await runGenericJobs(deps, RUN_BUDGET_MS)
    if (ran > 0) console.log(`job worker: ran ${ran} job(s)`)
    if (env.PARSER && !gates.isPaused('jobs') && !gates.isPaused('imports')) await wakeParser(env.PARSER, jobsPool)
  })
}

export default {
  // No HTTP surface: work arrives by Cron Trigger and queue only.
  fetch: noHttp,
  async scheduled(controller: ScheduledLike, env: JobsEnv): Promise<void> {
    const minute = Math.floor(controller.scheduledTime / 60_000)
    await run(env, minute % sweepMinutes(env.JOB_SWEEP_INTERVAL_MINUTES) === 0)
  },
  async queue(batch: BatchLike, env: JobsEnv): Promise<void> {
    ackAll(batch)
    await run(env, false)
  },
}
