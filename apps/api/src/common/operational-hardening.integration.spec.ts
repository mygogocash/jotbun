// P6b review fixes against a disposable local PostgreSQL database:
// - M1 an in-flight request that still needs the pool finishes (200) during a
//   graceful stop, and the process exits 0 well before the timeout (probe B);
// - M4 stopping a worker releases the running job without spending its
//   attempt, even on its last attempt (probe C), through an attempt-neutral,
//   lease-fenced `release`.
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Controller, Get, Inject, Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';

import { poolConfigFromUrl } from '../database/database-config';
import { DatabaseService, PG_POOL } from '../database/database.service';
import { HandlerRegistry } from '../jobs/handler-registry';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { configureV1App } from '../v1/v1-app.module';
import { ApiProblemFilter } from './api-problem.filter';
import { applyHttpTimeouts, gracefulHttpStop, handleShutdownSignals, trackHttpDrain } from './process-lifecycle';

let db: TestDatabase;
let jobsPool: Pool;
let jobs: JobRepository;

beforeAll(async () => {
  db = await createTestDatabase();
  jobsPool = await db.loginPool(['gogospend_jobs'], 4);
  jobs = new JobRepository(jobsPool);
});

afterAll(async () => {
  // drop() ends the pools it handed out.
  await db?.drop();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const code = (promise: Promise<unknown>) => promise.then(() => 'ok', (error: { code?: string }) => error.code ?? 'error');

describe('M1: graceful stop with a request that still needs the database', () => {
  @Controller('probe')
  class PoolController {
    constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

    /** Past the guard, but has not checked out a connection yet when SIGTERM arrives. */
    @Get('slow')
    async slow(): Promise<{ ok: number }> {
      await sleep(400);
      const { rows } = await this.pool.query<{ ok: number }>('SELECT 1 AS ok');
      return rows[0];
    }
  }

  it('the in-flight request returns 200 and the process exits 0 well before the timeout', async () => {
    const url = await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']);
    @Module({
      controllers: [PoolController],
      providers: [{ provide: PG_POOL, useFactory: () => new Pool(poolConfigFromUrl(url, 2)) }, DatabaseService, { provide: APP_FILTER, useClass: ApiProblemFilter }],
    })
    class ProbeModule {}
    const app = await NestFactory.create<NestExpressApplication>(ProbeModule, { logger: false, abortOnError: false });
    configureV1App(app);
    const server = app.getHttpServer() as Server;
    applyHttpTimeouts(server);
    const drain = trackHttpDrain(server, 20);
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { 'x-gogospend-client': 'ios/1.0.0' };
    expect((await fetch(`${base}/probe/slow`, { headers })).status).toBe(200);
    const emitter = new EventEmitter();
    const started = Date.now();
    const exited = new Promise<{ code: number; ms: number }>((resolve) => {
      handleShutdownSignals({
        name: 'v1',
        timeoutMs: 6_000,
        exitWhenStopped: true,
        emitter,
        exit: (exitCode) => resolve({ code: exitCode, ms: Date.now() - started }),
        log: () => undefined,
        stop: () => gracefulHttpStop({ markDraining: () => undefined, delayMs: 0, drain, closeApp: () => app.close() }),
        onTimeout: () => server.closeAllConnections(),
      });
    });
    const inflight = fetch(`${base}/probe/slow`, { headers }).then(
      async (res) => ({ status: res.status, body: await res.json() as unknown }),
      (error: Error) => ({ status: 0, body: error.name }),
    );
    await sleep(100);
    emitter.emit('SIGTERM', 'SIGTERM');
    const reply = await inflight;
    const outcome = await exited;
    expect({ reply, code: outcome.code, wellBeforeTimeout: outcome.ms < 3_000 }).toEqual({ reply: { status: 200, body: { ok: 1 } }, code: 0, wellBeforeTimeout: true });
  }, 20_000);
});

describe('M4: a stopped worker releases its job without spending the attempt', () => {
  beforeEach(async () => {
    await db.admin((client) => client.query('DELETE FROM jobs'));
  });

  async function queued(priorAttempts: number): Promise<string> {
    const id = randomUUID();
    await jobs.enqueue({ id, kind: 'test_task', accountId: null, payload: {}, maxAttempts: 3, maxRuntimeSeconds: 60 });
    if (priorAttempts > 0) await db.admin((client) => client.query('UPDATE jobs SET attempts = $2 WHERE id = $1', [id, priorAttempts]));
    return id;
  }
  const row = async (id: string) =>
    (await db.admin((client) => client.query(`SELECT status, attempts, last_error, run_after <= now() AS due FROM jobs WHERE id = $1`, [id]))).rows[0];

  it.each([0, 2])('SIGTERM during attempt %i+1 of 3 puts the job back, due now, with its attempts unchanged (probe C)', async (prior) => {
    const id = await queued(prior);
    const handlers = new HandlerRegistry().register('test_task', (job) =>
      new Promise((_resolve, reject) => job.lease.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
    );
    const worker = new JobWorker(jobs, handlers, { heartbeatMs: 10_000 });
    const stop = new AbortController();
    const running = worker.runOnce(stop.signal);
    await sleep(300);
    stop.abort();
    await running;
    expect(await row(id)).toEqual({ status: 'queued', attempts: prior, last_error: 'worker_stopped', due: true });
  });

  it('a handler that just returns on the stop, still holding its lease, is released rather than failed as incomplete', async () => {
    const id = await queued(2);
    const handlers = new HandlerRegistry().register('test_task', (job) =>
      new Promise<void>((resolve) => job.lease.signal.addEventListener('abort', () => resolve(), { once: true })),
    );
    const stop = new AbortController();
    const running = new JobWorker(jobs, handlers, { heartbeatMs: 10_000 }).runOnce(stop.signal);
    await sleep(200);
    stop.abort();
    await running;
    expect(await row(id)).toEqual({ status: 'queued', attempts: 2, last_error: 'worker_stopped', due: true });
  });

  it('a handler that records a retryable failure itself after the stop (deletion, export, snapshot, parse) is released too; a terminal one still fails', async () => {
    const retryable = await queued(2);
    const handlers = new HandlerRegistry().register('test_task', async (job) => {
      await new Promise((resolve) => job.lease.signal.addEventListener('abort', resolve, { once: true }));
      await jobs.fail(job.lease, { code: 'lease_expired', retryable: true });
    });
    const stop = new AbortController();
    const running = new JobWorker(jobs, handlers, { heartbeatMs: 10_000 }).runOnce(stop.signal);
    await sleep(200);
    stop.abort();
    await running;
    expect(await row(retryable)).toEqual({ status: 'queued', attempts: 2, last_error: 'worker_stopped', due: true });

    await db.admin((client) => client.query('DELETE FROM jobs'));
    const terminal = await queued(0);
    const terminalHandlers = new HandlerRegistry().register('test_task', async (job) => {
      await new Promise((resolve) => job.lease.signal.addEventListener('abort', resolve, { once: true }));
      await jobs.fail(job.lease, { code: 'no_client_ids', retryable: false });
    });
    const stopAgain = new AbortController();
    const runningAgain = new JobWorker(jobs, terminalHandlers, { heartbeatMs: 10_000 }).runOnce(stopAgain.signal);
    await sleep(200);
    stopAgain.abort();
    await runningAgain;
    expect(await row(terminal)).toEqual({ status: 'failed', attempts: 1, last_error: 'no_client_ids', due: true });
  });

  it('release(lease) is attempt-neutral and fenced by the lease token like every transition', async () => {
    const id = await queued(2);
    const [claimed] = await jobs.claim(['test_task'], { leaseSeconds: 30 });
    expect(claimed.lease.attempt).toBe(3);
    const forged = { ...claimed.lease, leaseToken: randomUUID() };
    expect(await jobs.release(forged, 'worker_stopped')).toBe(false);
    expect(await jobs.release(claimed.lease, 'worker_stopped')).toBe(true);
    expect(await row(id)).toEqual({ status: 'queued', attempts: 2, last_error: 'worker_stopped', due: true });
    expect(await jobs.release(claimed.lease, 'worker_stopped')).toBe(false);
    // The next claim is attempt 3 again, with a fresh token.
    const [again] = await jobs.claim(['test_task'], { leaseSeconds: 30 });
    expect([again.lease.attempt, again.lease.leaseToken === claimed.lease.leaseToken]).toEqual([3, false]);
    // An expired lease cannot be released.
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [id]));
    expect(await jobs.release(again.lease)).toBe(false);
  });

  it('release(lease, code, { delaySeconds }) holds the job back for that long and stays attempt-neutral', async () => {
    const id = await queued(0);
    const [claimed] = await jobs.claim(['test_task'], { leaseSeconds: 30 });
    expect(await jobs.release(claimed.lease, 'ocr_paused', { delaySeconds: 120 })).toBe(true);
    expect(await row(id)).toEqual({ status: 'queued', attempts: 0, last_error: 'ocr_paused', due: false });
    expect(await jobs.claim(['test_task'], { leaseSeconds: 30 })).toEqual([]);
    await expect(jobs.release(claimed.lease, 'ocr_paused', { delaySeconds: -1 })).rejects.toThrow(RangeError);
    await expect(jobs.release(claimed.lease, 'ocr_paused', { delaySeconds: 7200 })).rejects.toThrow(RangeError);
  });

  it('the database still refuses any other attempt change from a worker login', async () => {
    const id = await queued(2);
    expect(await code(jobsPool.query('UPDATE jobs SET attempts = attempts - 1 WHERE id = $1', [id]))).toBe('42501');
    const [claimed] = await jobs.claim(['test_task'], { leaseSeconds: 30 });
    // Not a release: the lease stays (or the job stays leased), or it drops by more than one.
    expect(await code(jobsPool.query('UPDATE jobs SET attempts = attempts - 1 WHERE id = $1', [id]))).toBe('42501');
    expect(await code(jobsPool.query(`UPDATE jobs SET status = 'queued', attempts = attempts - 2, lease_token = NULL, lease_expires_at = NULL WHERE id = $1`, [id]))).toBe('42501');
    expect(await code(jobsPool.query(`UPDATE jobs SET status = 'failed', attempts = attempts - 1, lease_token = NULL, lease_expires_at = NULL WHERE id = $1`, [id]))).toBe('42501');
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [id]));
    expect(await code(jobsPool.query(`UPDATE jobs SET status = 'queued', attempts = attempts - 1, lease_token = NULL, lease_expires_at = NULL WHERE id = $1`, [id]))).toBe('42501');
    expect(await row(id)).toMatchObject({ status: 'leased', attempts: 3 });
    expect(claimed.lease.attempt).toBe(3);
  });
});
