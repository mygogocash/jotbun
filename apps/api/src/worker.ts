// `npm run worker:jobs -w gogospend-api`: the generic job worker. Its own
// process (same image as the API) with two least-privilege logins:
//   DATABASE_URL             - member of gogospend_jobs only (queue and
//                              publication registry; no financial reads);
//   LEASED_READ_DATABASE_URL - member of gogospend_leased_read only (account
//                              reads through lease-validating routines).
// One job at a time (CPU parser concurrency one). Periodically sweeps
// unpublished, expired and orphaned objects (export files at their 24-hour
// expiry), applies the 30-day change retention, and reports - counts only -
// failed jobs, queued kinds no handler here runs and export objects whose
// deletion is overdue. Never logs payloads,
// object keys or error text. See apps/api/.env.jobs-worker.example.
import { Pool } from 'pg';

import { poolConfigFromUrl } from './database/database-config';
import { LeasedAccountRead } from './database/leased-account-read';
import { exportCleanupOverdue } from './exports/export-handler';
import { buildHandlers } from './jobs/handlers';
import { JobRepository } from './jobs/job.repository';
import { JobWorker } from './jobs/worker';
import { assertLoginRoles } from './jobs/worker-login';
import { ObjectPublicationService } from './storage/object-publication.service';
import { objectStoreFromEnv } from './storage/object-store-config';
import { SyncRetention } from './sync/sync-retention';

function sweepMinutes(value: string | undefined): number {
  const minutes = Number(value ?? 15);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('JOB_SWEEP_INTERVAL_MINUTES must be 1-1440.');
  return minutes;
}

function pool(url: string | undefined, setting: string): Pool {
  if (!url) throw new Error(`${setting} is not configured.`);
  const created = new Pool(poolConfigFromUrl(url, 2));
  created.on('error', () => console.error('job worker: idle database connection failed'));
  return created;
}

async function main(): Promise<void> {
  const sweepEvery = sweepMinutes(process.env.JOB_SWEEP_INTERVAL_MINUTES);
  const store = objectStoreFromEnv(process.env);
  const jobsPool = pool(process.env.DATABASE_URL, 'DATABASE_URL');
  const readPool = pool(process.env.LEASED_READ_DATABASE_URL, 'LEASED_READ_DATABASE_URL');
  const stop = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
  let sweeper: NodeJS.Timeout | undefined;
  try {
    await assertLoginRoles(jobsPool, ['gogospend_jobs'], 'DATABASE_URL');
    await assertLoginRoles(readPool, ['gogospend_leased_read'], 'LEASED_READ_DATABASE_URL');
    const jobs = new JobRepository(jobsPool);
    const publication = new ObjectPublicationService(jobsPool, store);
    const handlers = buildHandlers({ jobs, reader: new LeasedAccountRead(readPool), store, publication });
    const retention = new SyncRetention(jobsPool);
    let maintaining = false;
    const maintain = async () => {
      // A slow sweep must not overlap the next one.
      if (maintaining) return;
      maintaining = true;
      // Each step runs even if another fails.
      try {
        const removed = await publication.sweep(null);
        if (removed.length > 0) console.log(`job worker: swept ${removed.length} object(s)`);
      } catch (error) {
        console.error(`job worker: object sweep failed (${error instanceof Error ? error.name : 'unknown'})`);
      }
      try {
        // Alert on this line: export files past their deletion deadline are still stored.
        const overdue = await exportCleanupOverdue(jobsPool);
        if (overdue > 0) console.error(`job worker: ${overdue} export object(s) overdue for deletion`);
      } catch (error) {
        console.error(`job worker: export cleanup check failed (${error instanceof Error ? error.name : 'unknown'})`);
      }
      try {
        const pruned = await retention.prune();
        if (pruned > 0) console.log(`job worker: applied change retention to ${pruned} account(s)`);
      } catch (error) {
        console.error(`job worker: change retention failed (${error instanceof Error ? error.name : 'unknown'})`);
      }
      try {
        const handled = new Set(handlers.kinds());
        for (const row of await jobs.backlog()) {
          // Alert on these lines: failed jobs need the runbook; unhandled kinds need a worker.
          if (row.status === 'failed') console.error(`job worker: ${row.count} ${row.kind} job(s) failed`);
          else if (!handled.has(row.kind)) console.error(`job worker: ${row.count} ${row.kind} job(s) ${row.status} with no handler in this worker`);
        }
      } catch (error) {
        console.error(`job worker: backlog report failed (${error instanceof Error ? error.name : 'unknown'})`);
      } finally {
        maintaining = false;
      }
    };
    await maintain();
    sweeper = setInterval(() => void maintain(), sweepEvery * 60_000);
    console.log(`job worker: running ${handlers.kinds().length} kind(s)`);
    await new JobWorker(jobs, handlers).runUntil(stop.signal, 2_000, (error) => {
      console.error(`job worker: claim failed (${error instanceof Error ? error.name : 'unknown'})`);
    });
  } finally {
    clearInterval(sweeper);
    await Promise.allSettled([jobsPool.end(), readPool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(`job worker startup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
