// The security Worker (the API's `worker:security`): provider cleanup after a
// global logout or a credential change, provider links, and the
// reconciliation pass for lost provider events. Login: HYPERDRIVE_SECURITY
// (gogospend_jobs + gogospend_security). Secrets: the Auth0 maintenance
// client, kept apart from every other Worker, and the read-profile client
// for links.
import { runSecurityJobs } from '../server/jobs/roles'
import { ackAll, noHttp, poolOf, settingsAndGates, withPools, workerFetch } from './common'
import type { BatchLike, HyperdriveLike } from './common'

export type SecurityEnv = { HYPERDRIVE_SECURITY?: HyperdriveLike }

async function run(env: SecurityEnv): Promise<void> {
  const { settings, gates } = settingsAndGates(env)
  const pool = poolOf(env.HYPERDRIVE_SECURITY, 'HYPERDRIVE_SECURITY')
  await withPools([pool], () => runSecurityJobs({ pool, settings, gates, fetch: workerFetch }))
}

export default {
  // No HTTP surface: work arrives by Cron Trigger and queue only.
  fetch: noHttp,
  async scheduled(_controller: unknown, env: SecurityEnv): Promise<void> {
    await run(env)
  },
  async queue(batch: BatchLike, env: SecurityEnv): Promise<void> {
    ackAll(batch)
    await run(env)
  },
}
