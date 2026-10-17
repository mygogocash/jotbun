// `npm run worker:deletion -w gogospend-api -- --registry-fd 3 [--once]`: the
// account deletion worker (P5). Its own process and deployment, separate from
// the API, the security worker and the generic job worker:
//   DATABASE_URL       - a login in gogospend_jobs and gogospend_security
//                        only (the deletion job, its routines and the object
//                        publication registry);
//   Auth0 maintenance  - AUTH0_MAINTENANCE_CLIENT_ID/SECRET and
//                        AUTH0_ALLOWED_CLIENT_IDS, as the security worker;
//   object storage     - R2_* (or OBJECT_STORE=memory locally), as the job worker;
//   erasure registry   - never an environment variable: a JSON object
//                        {"database_url", "lookup_key"} (the registry login,
//                        a member of gogospend_erasure_registry only, and its
//                        32-byte lookup key, base64url) read once from an
//                        inherited descriptor piped from the secret manager.
// One deletion at a time with P1's heartbeat protocol. Every few minutes it
// reports - counts only - open, overdue (over 20 hours) and failed deletions.
// Never logs subjects, account ids, payloads or error text.
// See apps/api/.env.deletion-worker.example and docs/operations/deletion.md.
import { closeSync, readFileSync } from 'node:fs';

import { Pool } from 'pg';

import { maintenanceGatewayFromEnv } from '../auth/auth0-management.client';
import { poolConfigFromUrl } from '../database/database-config';
import { HandlerRegistry } from '../jobs/handler-registry';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { assertLoginRoles } from '../jobs/worker-login';
import { ObjectPublicationService } from '../storage/object-publication.service';
import { objectStoreFromEnv } from '../storage/object-store-config';
import { DeletionHandler, DeletionRepository } from './deletion-handler';
import { LookupKey, PostgresErasureRegistry } from './erasure-registry';
import { defaultPrivacySteps } from './privacy-steps';

type RegistrySettings = { databaseUrl: string; lookupKey: LookupKey };

/** Reads the registry settings from the descriptor named by --registry-fd (3-99), once. */
export function readRegistrySettings(argv: readonly string[], read: (fd: number) => string = (fd) => readFileSync(fd, 'utf8')): RegistrySettings {
  const index = argv.indexOf('--registry-fd');
  const fd = index >= 0 ? Number(argv[index + 1]) : NaN;
  if (!Number.isInteger(fd) || fd < 3 || fd > 99) throw new Error('--registry-fd <3-99> is required (the erasure registry settings, piped from the secret manager).');
  let parsed: unknown;
  try {
    parsed = JSON.parse(read(fd));
  } catch {
    throw new Error('The erasure registry settings are not readable JSON.');
  }
  const value = parsed as { database_url?: unknown; lookup_key?: unknown } | null;
  const keys = value && typeof value === 'object' ? Object.keys(value).sort().join(',') : '';
  if (keys !== 'database_url,lookup_key' || typeof value?.database_url !== 'string' || typeof value.lookup_key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.lookup_key)) {
    throw new Error('The erasure registry settings must be exactly {database_url, lookup_key}.');
  }
  return { databaseUrl: value.database_url, lookupKey: new LookupKey(Buffer.from(value.lookup_key, 'base64url')) };
}

function intervalSeconds(value: string | undefined): number {
  const seconds = Number(value ?? 15);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) throw new Error('DELETION_WORKER_INTERVAL_SECONDS must be 1-300.');
  return seconds;
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  const interval = intervalSeconds(process.env.DELETION_WORKER_INTERVAL_SECONDS);
  const registrySettings = readRegistrySettings(process.argv);
  const fd = Number(process.argv[process.argv.indexOf('--registry-fd') + 1]);
  try {
    closeSync(fd);
  } catch {
    // Already closed.
  }
  const gateway = maintenanceGatewayFromEnv(process.env);
  if (!gateway) throw new Error('AUTH0_MAINTENANCE_CLIENT_ID and AUTH0_MAINTENANCE_CLIENT_SECRET are not configured.');
  const nativeClientIds = (process.env.AUTH0_ALLOWED_CLIENT_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (nativeClientIds.length === 0) throw new Error('AUTH0_ALLOWED_CLIENT_IDS (the native app clients) is not configured.');
  const store = objectStoreFromEnv(process.env);
  const pool = new Pool(poolConfigFromUrl(process.env.DATABASE_URL, 2));
  pool.on('error', () => console.error('deletion worker: idle database connection failed'));
  const registryPool = new Pool(poolConfigFromUrl(registrySettings.databaseUrl, 2));
  registryPool.on('error', () => console.error('deletion worker: idle registry connection failed'));
  const stop = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
  let reporter: NodeJS.Timeout | undefined;
  try {
    await assertLoginRoles(pool, ['gogospend_jobs', 'gogospend_security'], 'DATABASE_URL');
    await assertLoginRoles(registryPool, ['gogospend_erasure_registry'], 'the erasure registry login', 'The erasure registry login must be a member of gogospend_erasure_registry only.');
    const jobs = new JobRepository(pool);
    const repository = new DeletionRepository(pool);
    const handler = new DeletionHandler({
      jobs,
      repository,
      registry: new PostgresErasureRegistry(registryPool, registrySettings.lookupKey),
      gateway,
      publication: new ObjectPublicationService(pool, store),
      pool,
      nativeClientIds,
      steps: defaultPrivacySteps(),
    });
    const handlers = new HandlerRegistry({ security: true }).register('account_deletion', (job) => handler.run(job.lease));
    const worker = new JobWorker(jobs, handlers);
    const report = async () => {
      try {
        const backlog = await repository.backlog();
        if (backlog.open > 0) console.log(`deletion worker: ${backlog.open} deletion(s) in progress, oldest ${backlog.oldestSeconds}s`);
        // Alert on these lines: the 24-hour target is at risk, or a deletion needs the runbook.
        if (backlog.overdue > 0) console.error(`deletion worker: ${backlog.overdue} deletion(s) open for over 20 hours`);
        if (backlog.failed > 0) console.error(`deletion worker: ${backlog.failed} deletion job(s) failed terminally`);
      } catch (error) {
        console.error(`deletion worker: backlog report failed (${error instanceof Error ? error.name : 'unknown'})`);
      }
    };
    if (once) {
      for (let run = 0; run < 100 && (await worker.runOnce(stop.signal)) === 'ran'; run += 1);
      await report();
      return;
    }
    await report();
    reporter = setInterval(() => void report(), 5 * 60_000);
    await worker.runUntil(stop.signal, interval * 1000, (error) => {
      console.error(`deletion worker: claim failed (${error instanceof Error ? error.name : 'unknown'})`);
    });
  } finally {
    clearInterval(reporter);
    await Promise.allSettled([pool.end(), registryPool.end()]);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`deletion worker startup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
