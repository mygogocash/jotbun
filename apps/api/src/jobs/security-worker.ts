// `npm run worker:security -w gogospend-api [-- --once]`: the security job
// worker (global-logout and credential-change provider cleanup, and the
// reconciliation pass for lost provider events). Its own process, database login
// (gogospend_jobs + gogospend_security) and Auth0 maintenance credentials;
// see apps/api/.env.worker.example and docs/operations/auth0-runbook.md.
// Logs counts only, never subjects, job payloads or tokens.
//
// P6b: OPERATIONAL_PAUSE=jobs stops claiming (holds stay in place, so a
// paused revocation fails closed: the principal cannot sign in again until it
// runs). Every 5 minutes it logs its queue (`security worker: queue due=N
// oldest_due_seconds=S`, the heartbeat) and `security worker: alert
// queue_age …` past 5 minutes. SIGTERM finishes the current pass and exits
// within SHUTDOWN_TIMEOUT_SECONDS.
import { setTimeout as sleep } from 'node:timers/promises';

import { Pool } from 'pg';

import { maintenanceGatewayFromEnv } from '../auth/auth0-management.client';
import { featureGatesFromEnv } from '../common/feature-gates';
import { failureName, queueAge, queueAgeLines } from '../common/operational-metrics';
import { handleShutdownSignals, runMain, shutdownTimeoutMsFromEnv } from '../common/process-lifecycle';
import { Auth0ProfileClient, profileGatewayFromEnv } from '../auth/auth0-profile.client';
import { SecurityJobRepository, runSecurityJobsOnce } from '../auth/security-job.repository';
import { poolConfigFromUrl } from '../database/database-config';
import { JobRepository } from './job.repository';

function intervalSeconds(value: string | undefined): number {
  const seconds = Number(value ?? 15);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) throw new Error('SECURITY_WORKER_INTERVAL_SECONDS must be 1-300.');
  return seconds;
}

function boundedInteger(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be ${min}-${max}.`);
  return parsed;
}

/** The kinds this worker runs (the deletion worker runs account_deletion). */
export const SECURITY_WORKER_KINDS = ['auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities'] as const;
const REPORT_EVERY_MS = 5 * 60_000;

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  const interval = intervalSeconds(process.env.SECURITY_WORKER_INTERVAL_SECONDS);
  const gates = featureGatesFromEnv(process.env);
  const shutdownMs = shutdownTimeoutMsFromEnv(process.env.SHUTDOWN_TIMEOUT_SECONDS);
  const gateway = maintenanceGatewayFromEnv(process.env);
  if (!gateway) throw new Error('AUTH0_MAINTENANCE_CLIENT_ID and AUTH0_MAINTENANCE_CLIENT_SECRET are not configured.');
  const nativeClientIds = (process.env.AUTH0_ALLOWED_CLIENT_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (nativeClientIds.length === 0) throw new Error('AUTH0_ALLOWED_CLIENT_IDS (the native app clients) is not configured.');
  const pool = new Pool(poolConfigFromUrl(process.env.DATABASE_URL, 2));
  pool.on('error', () => console.error('security worker: idle database connection failed'));
  const security = new SecurityJobRepository(pool);
  try {
    await security.assertLeastPrivilegeWorker();
  } catch (error) {
    await pool.end();
    throw error;
  }
  const reconcile = {
    everySeconds: boundedInteger('SECURITY_RECONCILE_INTERVAL_SECONDS', process.env.SECURITY_RECONCILE_INTERVAL_SECONDS, 300, 60, 86_400),
    batch: boundedInteger('SECURITY_RECONCILE_BATCH', process.env.SECURITY_RECONCILE_BATCH, 200, 1, 1000),
  };
  // F6c: the profile/link client (update:users) merges linked identities; unset, merge jobs wait.
  const profiles = profileGatewayFromEnv(process.env);
  const linker = profiles instanceof Auth0ProfileClient ? profiles : undefined;
  const deps = { jobs: new JobRepository(pool), security, gateway, nativeClientIds, reconcile, linker };
  const stop = new AbortController();
  handleShutdownSignals({ name: 'security worker', timeoutMs: shutdownMs, exitWhenStopped: false, stop: () => stop.abort() });
  let reportedAt = 0;
  try {
    while (!stop.signal.aborted) {
      if (Date.now() - reportedAt >= REPORT_EVERY_MS || once) {
        reportedAt = Date.now();
        try {
          // Alert on `alert queue_age`; the summary line is the heartbeat.
          // Without the link client, merge jobs wait by design (runbook), so they are not counted.
          const kinds = linker ? SECURITY_WORKER_KINDS : SECURITY_WORKER_KINDS.filter((kind) => kind !== 'auth0_link_identities');
          const lines = queueAgeLines('security worker', await queueAge(pool, kinds));
          for (const line of lines.info) console.log(line);
          for (const line of lines.alerts) console.error(line);
          if (gates.isPaused('jobs')) console.error('security worker: paused jobs');
        } catch (error) {
          console.error(`security worker: queue report failed (${failureName(error)})`);
        }
      }
      if (!gates.isPaused('jobs')) {
        try {
          const summary = await runSecurityJobsOnce(deps);
          if (Object.values(summary).some((count) => count > 0)) console.log(`security worker: ${JSON.stringify(summary)}`);
          // Alert on this line: a failed job leaves a user unable to sign in until the runbook is followed.
          if (summary.failed > 0) console.error(`security worker: ${summary.failed} security job(s) failed terminally`);
        } catch (error) {
          console.error(`security worker: batch failed (${failureName(error)})`);
          if (once) process.exitCode = 1;
        }
      }
      if (once) break;
      await sleep(interval * 1000, undefined, { signal: stop.signal }).catch(() => undefined);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) void runMain('security worker', main);
