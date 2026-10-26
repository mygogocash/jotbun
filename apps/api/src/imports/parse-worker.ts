// `npm run worker:parse -w gogospend-api`: the import parser on its own (P2b),
// for the container that the Cloudflare jobs Worker starts when parses wait
// (apps/edge src/roles/parser.ts). It claims `import_parse` only, under the
// job worker's gogospend_jobs login (DATABASE_URL), with the same parser
// child sandbox (Node 25 or later; imports/import-parsing.ts) and object
// storage (R2_* over the S3 API). It exits once no parse has been due for
// PARSE_WORKER_IDLE_EXIT_SECONDS (1-3600, default 60), so the container runs
// only while uploads wait; everything else the generic job worker does
// (snapshots, exports, expiry, sweeps, reports) runs in the jobs Worker.
// Logs counts only. SIGTERM releases the running parse (attempt not spent).
import { setTimeout as sleep } from 'node:timers/promises';

import { Pool } from 'pg';

import { ConfigurationError } from '../common/configuration-error';
import { featureGatesFromEnv } from '../common/feature-gates';
import type { FeatureGates } from '../common/feature-gates';
import { failureName } from '../common/operational-metrics';
import { handleShutdownSignals, runMain, shutdownTimeoutMsFromEnv } from '../common/process-lifecycle';
import { poolConfigFromUrl } from '../database/database-config';
import { HandlerRegistry } from '../jobs/handler-registry';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { assertLoginRoles } from '../jobs/worker-login';
import { ObjectPublicationService } from '../storage/object-publication.service';
import type { ObjectStore } from '../storage/object-store';
import { objectStoreFromEnv } from '../storage/object-store-config';
import { importParsingStartup } from './import-parsing';
import type { ImportParsingStartup } from './import-parsing';
import { ParseHandler } from './parse-handler';

export type ParseWorkerDeps = {
  /** gogospend_jobs only. */
  pool: Pool;
  store: ObjectStore;
  gates: FeatureGates;
  /** Stop after this long with nothing due. */
  idleExitMs: number;
  pollMs?: number;
  stop?: AbortSignal;
};

/** `idle`: the queue stayed empty; `stopped`: SIGTERM; `disabled`: the parser sandbox does not hold here. */
export type ParseWorkerResult = { ran: number; reason: 'idle' | 'stopped' | 'disabled' };

export function idleExitMsFromEnv(value: string | undefined): number {
  const seconds = Number(value ?? 60);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new ConfigurationError('PARSE_WORKER_IDLE_EXIT_SECONDS must be 1-3600.');
  return seconds * 1000;
}

/** Runs due parses one at a time until none has been due for `idleExitMs`. */
export async function runParseWorker(deps: ParseWorkerDeps, startup: () => Promise<ImportParsingStartup> = importParsingStartup): Promise<ParseWorkerResult> {
  const parsing = await startup();
  if (!parsing.parse) {
    if (parsing.alert) console.error(parsing.alert);
    return { ran: 0, reason: 'disabled' };
  }
  const jobs = new JobRepository(deps.pool);
  const handler = new ParseHandler({ jobs, publication: new ObjectPublicationService(deps.pool, deps.store), store: deps.store, pool: deps.pool }, { gates: deps.gates, ...parsing.parse });
  const worker = new JobWorker(jobs, new HandlerRegistry().register('import_parse', (job) => handler.run(job)), { gates: deps.gates });
  let ran = 0;
  let idleSince = Date.now();
  while (!deps.stop?.aborted) {
    let outcome: 'idle' | 'ran' = 'idle';
    try {
      outcome = await worker.runOnce(deps.stop);
    } catch (error) {
      console.error(`parse worker: claim failed (${failureName(error)})`);
    }
    if (outcome === 'ran') {
      ran += 1;
      idleSince = Date.now();
      continue;
    }
    if (Date.now() - idleSince >= deps.idleExitMs) return { ran, reason: 'idle' };
    await sleep(deps.pollMs ?? 2_000, undefined, { signal: deps.stop }).catch(() => undefined);
  }
  return { ran, reason: 'stopped' };
}

async function main(): Promise<void> {
  const idleExitMs = idleExitMsFromEnv(process.env.PARSE_WORKER_IDLE_EXIT_SECONDS);
  const gates = featureGatesFromEnv(process.env);
  const shutdownMs = shutdownTimeoutMsFromEnv(process.env.SHUTDOWN_TIMEOUT_SECONDS);
  const store = objectStoreFromEnv(process.env);
  if (!process.env.DATABASE_URL) throw new ConfigurationError('DATABASE_URL is not configured.');
  const pool = new Pool(poolConfigFromUrl(process.env.DATABASE_URL, 2));
  pool.on('error', () => console.error('parse worker: idle database connection failed'));
  const stop = new AbortController();
  handleShutdownSignals({ name: 'parse worker', timeoutMs: shutdownMs, exitWhenStopped: false, stop: () => stop.abort() });
  try {
    await assertLoginRoles(pool, ['gogospend_jobs'], 'DATABASE_URL');
    const result = await runParseWorker({ pool, store, gates, idleExitMs, stop: stop.signal });
    console.log(`parse worker: ran ${result.ran} parse(s), exiting (${result.reason})`);
    if (result.reason === 'disabled') process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) void runMain('parse worker', main);
