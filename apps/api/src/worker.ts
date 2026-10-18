// `npm run worker:jobs -w gogospend-api`: the generic job worker. Its own
// process (same image as the API) with two least-privilege logins:
//   DATABASE_URL             - member of gogospend_jobs only (queue and
//                              publication registry; no financial reads);
//   LEASED_READ_DATABASE_URL - member of gogospend_leased_read only (account
//                              reads through lease-validating routines).
// One job at a time (CPU parser concurrency one). Import files are parsed in
// a separate child process per job (imports/parser-runner.ts) that receives
// none of this process's settings: its environment is TZ only. import_parse is
// registered only when that child's sandbox holds on this runtime (Node 25 or
// later; imports/import-parsing.ts), else `job worker: import parsing disabled
// (…)` is logged at startup and imports wait. Periodically sweeps
// unpublished, expired and orphaned objects (export files at their 24-hour
// expiry), runs P5's retention steps (privacy/privacy-steps.ts: purged
// records, change log, receipt digests, security records, finished jobs,
// completed deletion requests), and reports - counts only - failed jobs,
// queued kinds no handler here runs and export, quarantine and receipt objects
// whose deletion is overdue. Before each sweep it runs the import maintenance
// (stale uploads, imports to end, names past their preview window). Never
// logs payloads,
// object keys or error text. See apps/api/.env.jobs-worker.example.
//
// P6b: OPERATIONAL_PAUSE=jobs stops claiming (imports stops import parsing
// only); maintenance and reports carry on. Every minute, on its own timer, it
// logs the queue (`job worker: queue due=N oldest_due_seconds=S`), which is
// also the worker's heartbeat, and `job worker: alert queue_age …` for a kind
// whose oldest due job waited over 5 minutes. SIGTERM stops claiming, aborts
// the running handler, releases its job (requeued as worker_stopped, due now,
// the attempt not spent) and exits within SHUTDOWN_TIMEOUT_SECONDS.
import { Pool } from 'pg';

import { ConfigurationError } from './common/configuration-error';
import { featureGatesFromEnv } from './common/feature-gates';
import { failureName, queueAge, queueAgeLines, startQueueReports } from './common/operational-metrics';
import { handleShutdownSignals, runMain, shutdownTimeoutMsFromEnv } from './common/process-lifecycle';
import { poolConfigFromUrl } from './database/database-config';
import { LeasedAccountRead } from './database/leased-account-read';
import { receiptCleanupOverdue } from './attachments/receipt-cleanup';
import { exportCleanupOverdue } from './exports/export-handler';
import { importMaintenance, quarantineCleanupOverdue } from './imports/import-expiry';
import { importParsingStartup } from './imports/import-parsing';
import { buildHandlers } from './jobs/handlers';
import { JobRepository } from './jobs/job.repository';
import { JobWorker } from './jobs/worker';
import { assertLoginRoles } from './jobs/worker-login';
import { RetentionHandler } from './privacy/retention-handler';
import { ObjectPublicationService } from './storage/object-publication.service';
import { objectStoreFromEnv } from './storage/object-store-config';

function sweepMinutes(value: string | undefined): number {
  const minutes = Number(value ?? 15);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new ConfigurationError('JOB_SWEEP_INTERVAL_MINUTES must be 1-1440.');
  return minutes;
}

function pool(url: string | undefined, setting: string): Pool {
  if (!url) throw new ConfigurationError(`${setting} is not configured.`);
  const created = new Pool(poolConfigFromUrl(url, 2));
  created.on('error', () => console.error('job worker: idle database connection failed'));
  return created;
}

async function main(): Promise<void> {
  const sweepEvery = sweepMinutes(process.env.JOB_SWEEP_INTERVAL_MINUTES);
  const gates = featureGatesFromEnv(process.env);
  const shutdownMs = shutdownTimeoutMsFromEnv(process.env.SHUTDOWN_TIMEOUT_SECONDS);
  const store = objectStoreFromEnv(process.env);
  const jobsPool = pool(process.env.DATABASE_URL, 'DATABASE_URL');
  const readPool = pool(process.env.LEASED_READ_DATABASE_URL, 'LEASED_READ_DATABASE_URL');
  const stop = new AbortController();
  handleShutdownSignals({ name: 'job worker', timeoutMs: shutdownMs, exitWhenStopped: false, stop: () => stop.abort() });
  let sweeper: NodeJS.Timeout | undefined;
  let stopQueueReports: (() => Promise<void>) | undefined;
  try {
    await assertLoginRoles(jobsPool, ['gogospend_jobs'], 'DATABASE_URL');
    await assertLoginRoles(readPool, ['gogospend_leased_read'], 'LEASED_READ_DATABASE_URL');
    const jobs = new JobRepository(jobsPool);
    const publication = new ObjectPublicationService(jobsPool, store);
    // P2b review fixes: import_parse only behind a verified parser sandbox (Node 25+); otherwise one alert line.
    const parsing = await importParsingStartup();
    if (parsing.alert) console.error(parsing.alert);
    const handlers = buildHandlers({ jobs, reader: new LeasedAccountRead(readPool), store, publication, pool: jobsPool }, { parse: parsing.parse });
    const retention = new RetentionHandler(jobsPool);
    let maintaining = false;
    const maintain = async () => {
      // A slow sweep must not overlap the next one.
      if (maintaining) return;
      maintaining = true;
      // Each step runs even if another fails.
      try {
        // Before the sweep, so the quarantine parts it makes due are deleted in this pass.
        const ended = await importMaintenance(jobsPool);
        if (ended.stale + ended.expired + ended.namesCleared > 0) {
          console.log(`job worker: import maintenance marked ${ended.stale} stale upload(s) failed, ended ${ended.expired} import(s), cleared ${ended.namesCleared} name(s)`);
        }
      } catch (error) {
        console.error(`job worker: import maintenance failed (${failureName(error)})`);
      }
      try {
        const removed = await publication.sweep(null);
        if (removed.length > 0) console.log(`job worker: swept ${removed.length} object(s)`);
      } catch (error) {
        console.error(`job worker: object sweep failed (${failureName(error)})`);
      }
      try {
        // Alert on this line: export files past their deletion deadline are still stored.
        const overdue = await exportCleanupOverdue(jobsPool);
        if (overdue > 0) console.error(`job worker: ${overdue} export object(s) overdue for deletion`);
      } catch (error) {
        console.error(`job worker: export cleanup check failed (${failureName(error)})`);
      }
      try {
        // Alert on this line: quarantined uploads past their deletion deadline are still stored.
        const overdue = await quarantineCleanupOverdue(jobsPool);
        if (overdue > 0) console.error(`job worker: ${overdue} quarantine object(s) overdue for deletion`);
      } catch (error) {
        console.error(`job worker: quarantine cleanup check failed (${failureName(error)})`);
      }
      try {
        // Alert on this line: released receipts past their deletion deadline are still stored.
        const overdue = await receiptCleanupOverdue(jobsPool);
        if (overdue > 0) console.error(`job worker: ${overdue} receipt object(s) overdue for deletion`);
      } catch (error) {
        console.error(`job worker: receipt cleanup check failed (${failureName(error)})`);
      }
      try {
        const report = await retention.run();
        const removed = Object.entries(report.counts).filter(([, n]) => n > 0);
        if (removed.length > 0) console.log(`job worker: retention ${removed.map(([step, n]) => `${step}=${n}`).join(' ')}`);
        // Alert on this line: a retention step keeps failing.
        if (report.failed.length > 0) console.error(`job worker: retention step(s) failed: ${report.failed.join(' ')}`);
      } catch (error) {
        console.error(`job worker: retention failed (${failureName(error)})`);
      }
      try {
        const handled = new Set(handlers.kinds());
        for (const row of await jobs.backlog()) {
          // Alert on these lines: failed jobs need the runbook; unhandled kinds need a worker.
          if (row.status === 'failed') console.error(`job worker: ${row.count} ${row.kind} job(s) failed`);
          else if (!handled.has(row.kind)) console.error(`job worker: ${row.count} ${row.kind} job(s) ${row.status} with no handler in this worker`);
        }
      } catch (error) {
        console.error(`job worker: backlog report failed (${failureName(error)})`);
      } finally {
        maintaining = false;
      }
    };
    const reportQueue = async () => {
      try {
        // Alert on `alert queue_age`: a due job waited over 5 minutes. The
        // summary line is the heartbeat: alert when it stops appearing.
        const lines = queueAgeLines('job worker', await queueAge(jobsPool, handlers.kinds()));
        for (const line of lines.info) console.log(line);
        for (const line of lines.alerts) console.error(line);
        if (gates.pausedScopes().length > 0) console.error(`job worker: paused ${gates.pausedScopes().join(',')}`);
      } catch (error) {
        console.error(`job worker: queue report failed (${failureName(error)})`);
      }
    };
    stopQueueReports = startQueueReports(reportQueue);
    await maintain();
    sweeper = setInterval(() => void maintain(), sweepEvery * 60_000);
    console.log(`job worker: running ${handlers.kinds().length} kind(s)`);
    await new JobWorker(jobs, handlers, { gates }).runUntil(stop.signal, 2_000, (error) => {
      console.error(`job worker: claim failed (${failureName(error)})`);
    });
  } finally {
    clearInterval(sweeper);
    await stopQueueReports?.();
    await Promise.allSettled([jobsPool.end(), readPool.end()]);
  }
}

if (require.main === module) void runMain('job worker', main);
