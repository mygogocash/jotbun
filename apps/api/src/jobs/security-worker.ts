// `npm run worker:security -w gogospend-api [-- --once]`: the security job
// worker (global-logout provider cleanup). Its own process, database login
// (gogospend_jobs + gogospend_security) and Auth0 maintenance credentials;
// see apps/api/.env.worker.example and docs/operations/auth0-runbook.md.
// Logs counts only, never subjects, job payloads or tokens.
import { setTimeout as sleep } from 'node:timers/promises';

import { Pool } from 'pg';

import { maintenanceGatewayFromEnv } from '../auth/auth0-management.client';
import { SecurityJobRepository, runSecurityJobsOnce } from '../auth/security-job.repository';
import { poolConfigFromUrl } from '../database/database-config';
import { JobRepository } from './job.repository';

function intervalSeconds(value: string | undefined): number {
  const seconds = Number(value ?? 15);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) throw new Error('SECURITY_WORKER_INTERVAL_SECONDS must be 1-300.');
  return seconds;
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  const interval = intervalSeconds(process.env.SECURITY_WORKER_INTERVAL_SECONDS);
  const gateway = maintenanceGatewayFromEnv(process.env);
  if (!gateway) throw new Error('AUTH0_MAINTENANCE_CLIENT_ID and AUTH0_MAINTENANCE_CLIENT_SECRET are not configured.');
  const pool = new Pool(poolConfigFromUrl(process.env.DATABASE_URL, 2));
  pool.on('error', () => console.error('security worker: idle database connection failed'));
  const deps = { jobs: new JobRepository(pool), security: new SecurityJobRepository(pool), gateway };
  const stop = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
  try {
    while (!stop.signal.aborted) {
      try {
        const summary = await runSecurityJobsOnce(deps);
        if (Object.values(summary).some((count) => count > 0)) console.log(`security worker: ${JSON.stringify(summary)}`);
      } catch (error) {
        console.error(`security worker: batch failed (${error instanceof Error ? error.name : 'unknown'})`);
        if (once) process.exitCode = 1;
      }
      if (once) break;
      await sleep(interval * 1000, undefined, { signal: stop.signal }).catch(() => undefined);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`security worker startup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
