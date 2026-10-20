// P6b operational safety: feature gates, readiness and redaction of API and
// worker failures. No database or provider is touched: the v1 app below has
// a pool aimed at a closed loopback port, and every probed request stops at a
// gate or at the access checks that run before any database work.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';

import { Access } from '../auth/auth-route.decorator';
import { routeManifest } from '../auth/route-policy';
import { CommandRegistry } from '../commands/command-registry';
import { PG_POOL } from '../database/database.service';
import { HealthController } from '../health/health.controller';
import { HEALTH_OPTIONS, HealthService, READINESS_RECEIPTS, readinessReceiptsFromEnv } from '../health/health.service';
import type { HealthOptions, ReadinessReceipts } from '../health/health.service';
import { ImportsController } from '../imports/imports.controller';
import { ParseHandler } from '../imports/parse-handler';
import type { ObjectStore } from '../storage/object-store';
import type { ImportRepository } from '../imports/import.repository';
import type { PreviewQuery } from '../imports/preview-query';
import type { UploadIntake } from '../imports/upload-intake';
import { HandlerRegistry } from '../jobs/handler-registry';
import type { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { createV1TestApp } from '../testing/v1-test-app';
import { V1AppModule, configureV1App } from '../v1/v1-app.module';
import { ProblemException } from './api-problem.filter';
import { ConfigurationError } from './configuration-error';
import { FeatureGates, GATE_SCOPES, featureGatesFromEnv } from './feature-gates';
import type { GateScope } from './feature-gates';
import { OPERATIONAL_THRESHOLDS, OperationalLogger, describeFailure, queueAgeLines } from './operational-metrics';
import { handleShutdownSignals, runMain, shutdownTimeoutMsFromEnv } from './process-lifecycle';
import { setLogSink } from './safe-request-logger';

// ---------------------------------------------------------------------------
// Synthetic secrets and money values. None may ever reach a log line or body.
const PASSWORD = 'Syn7hetic-Pa55word-for-p6b-tests';
const CONNECTION = `postgres://gogospend_app_login:${PASSWORD}@db.synthetic.invalid:5432/gogospend_v1`;
const R2_SECRET = 'r2SyntheticSecretKey0123456789abcdefABCDEF';
const BEARER = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJl';
const AMOUNT_MINOR = '99999999999';
const AMOUNT_BAHT = '฿1,234.56';
const ACCOUNT_ID = '6f1c2b0e-8a7d-4c3b-9e2f-0123456789ab';
const SECRETS = [PASSWORD, CONNECTION, R2_SECRET, BEARER, AMOUNT_MINOR, AMOUNT_BAHT, ACCOUNT_ID, 'db.synthetic.invalid'];
const leakyText = `connect ${CONNECTION} key=${R2_SECRET} Bearer ${BEARER} amount ${AMOUNT_MINOR} (${AMOUNT_BAHT}) account ${ACCOUNT_ID}`;

function expectNoSecrets(text: string): void {
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

/** Captures JSON log lines and console output for the duration of `fn`. */
async function captureOutput(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const previous = setLogSink((line) => lines.push(line));
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    }),
  );
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    await fn();
  } finally {
    setLogSink(previous);
    for (const spy of spies) spy.mockRestore();
    stdout.mockRestore();
    stderr.mockRestore();
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The real v1 root with synthetic settings; nothing listens on its database.
const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgres://gogospend_unit:unused@127.0.0.1:9/gogospend_unit',
  AUTH0_ISSUER: 'https://synthetic-issuer.invalid/',
  AUTH0_AUDIENCE: 'https://api.gogospend.invalid',
  AUTH0_ALLOWED_CLIENT_IDS: 'synthetic-native-client',
  RATE_LIMIT_KEY: 'synthetic-rate-limit-key-0123456789abcdef0123',
  COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
  MIN_CLIENT_VERSION_IOS: '1.0.0',
  MIN_CLIENT_VERSION_ANDROID: '1.0.0',
  OBJECT_STORE: 'memory',
};
const GATE_ENV = ['OPERATIONAL_PAUSE', 'OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS', 'IMPORT_UPLOADS_ENABLED', 'READINESS_RECEIPTS', 'READINESS_RECEIPTS_FILE'];

async function v1App(extra: Record<string, string>): Promise<NestExpressApplication> {
  const keys = [...Object.keys(BASE_ENV), ...GATE_ENV];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of GATE_ENV) delete process.env[key];
  Object.assign(process.env, BASE_ENV, extra);
  try {
    const app = await NestFactory.create<NestExpressApplication>(V1AppModule, { bodyParser: false, logger: false, abortOnError: false });
    configureV1App(app);
    await app.init();
    return app;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const CLIENT = { 'x-gogospend-client': 'ios/1.0.0' };
const ID = '0b5c9a8e-1d2f-4e3a-8b7c-6d5e4f3a2b1c';
type Probe = { name: string; method: 'get' | 'post' | 'patch' | 'put' | 'delete'; path: string; scopes: readonly GateScope[]; contentType?: string };
// One request per kind of route. `scopes`: the gates that must pause it.
const PROBES: readonly Probe[] = [
  { name: 'create wallet', method: 'post', path: '/v1/wallets', scopes: ['writes'] },
  { name: 'edit transaction', method: 'patch', path: `/v1/transactions/${ID}`, scopes: ['writes'] },
  { name: 'delete transaction', method: 'delete', path: `/v1/transactions/${ID}`, scopes: ['writes'] },
  { name: 'set budget', method: 'put', path: '/v1/budgets/2026-10', scopes: ['writes'] },
  { name: 'create category', method: 'post', path: '/v1/categories', scopes: ['writes'] },
  { name: 'link identity', method: 'post', path: '/v1/me/identities', scopes: ['writes'] },
  { name: 'request export', method: 'post', path: '/v1/exports', scopes: ['jobs'] },
  { name: 'request snapshot', method: 'post', path: '/v1/sync/snapshots', scopes: ['jobs'] },
  { name: 'upload import', method: 'post', path: '/v1/imports', scopes: ['uploads', 'imports'], contentType: 'text/csv' },
  { name: 'correct import rows', method: 'patch', path: `/v1/imports/${ID}/rows`, scopes: ['imports'] },
  { name: 'freeze import selection', method: 'post', path: `/v1/imports/${ID}/selections`, scopes: ['imports'] },
  { name: 'confirm import batch', method: 'post', path: `/v1/imports/${ID}/confirmations`, scopes: ['imports', 'writes'] },
  { name: 'read import selection', method: 'get', path: `/v1/imports/${ID}/selections/${ID}`, scopes: [] },
  { name: 'read wallets', method: 'get', path: '/v1/wallets', scopes: [] },
  { name: 'read history', method: 'get', path: '/v1/history?from=2026-10-01&through=2026-10-31', scopes: [] },
  { name: 'read recently deleted', method: 'get', path: '/v1/history/deleted', scopes: [] },
  { name: 'read export', method: 'get', path: `/v1/exports/${ID}`, scopes: [] },
  { name: 'read import', method: 'get', path: `/v1/imports/${ID}`, scopes: [] },
  { name: 'command status', method: 'post', path: '/v1/commands/status', scopes: [] },
  { name: 'accept policy', method: 'post', path: '/v1/me/policy-acceptances', scopes: [] },
  { name: 'request deletion', method: 'post', path: '/v1/me/deletion', scopes: [] },
  { name: 'global logout', method: 'post', path: '/v1/me/global-logout', scopes: [] },
  { name: 'sign out', method: 'post', path: '/v1/me/logout', scopes: [] },
  { name: 'auth challenge', method: 'post', path: '/v1/auth/challenges', scopes: [] },
  { name: 'liveness', method: 'get', path: '/live', scopes: [] },
];

function send(app: NestExpressApplication, probe: Probe) {
  const call = request(app.getHttpServer())[probe.method](probe.path).set(CLIENT).set('idempotency-key', ID);
  if (probe.contentType) return call.set('content-type', probe.contentType).set('x-gogospend-file-name', 'synthetic.csv').send('date,amount\n');
  return probe.method === 'get' || probe.method === 'delete' ? call : call.send({});
}

describe('feature gates', () => {
  it('parses OPERATIONAL_PAUSE strictly and pauses nothing by default', () => {
    expect(featureGatesFromEnv({}).pausedScopes()).toEqual([]);
    expect(featureGatesFromEnv({ OPERATIONAL_PAUSE: '' }).pausedScopes()).toEqual([]);
    expect(featureGatesFromEnv({ OPERATIONAL_PAUSE: ' writes , jobs ' }).pausedScopes().sort()).toEqual(['jobs', 'writes']);
    expect(featureGatesFromEnv({ OPERATIONAL_PAUSE: 'writes' }).retryAfterSeconds).toBe(300);
    expect(featureGatesFromEnv({ OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS: '60' }).retryAfterSeconds).toBe(60);
    expect(() => featureGatesFromEnv({ OPERATIONAL_PAUSE: 'writes,everything' })).toThrow(/OPERATIONAL_PAUSE/);
    expect(() => featureGatesFromEnv({ OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS: '5' })).toThrow(/OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS/);
    expect(() => featureGatesFromEnv({ IMPORT_UPLOADS_ENABLED: 'yes' })).toThrow(/IMPORT_UPLOADS_ENABLED/);
    expect(featureGatesFromEnv({}).isExposed('uploads')).toBe(false);
    expect(featureGatesFromEnv({ IMPORT_UPLOADS_ENABLED: '1' }).isExposed('uploads')).toBe(true);
  });

  it('paused_writes_gate_rejects_business_mutation', async () => {
    const app = await v1App({ OPERATIONAL_PAUSE: 'writes' });
    try {
      const response = await request(app.getHttpServer())
        .post('/v1/wallets')
        .set(CLIENT)
        .set('authorization', `Bearer ${BEARER}`)
        .set('idempotency-key', ID)
        .send({ id: ID, name: 'Cash', opening_balance_minor: AMOUNT_MINOR, tracking_start: '2026-10-01' });
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('WRITES_PAUSED');
      expect(response.body.retry_after_seconds).toBe(300);
      expect(response.headers['retry-after']).toBe('300');
      expect(response.body.message_key).toBe('errors.writes_paused');
    } finally {
      await app.close();
    }
  });

  it('each gate pauses only its own scope', async () => {
    const outcomes: Record<string, Record<string, string>> = {};
    for (const scope of GATE_SCOPES) {
      const app = await v1App({ OPERATIONAL_PAUSE: scope, IMPORT_UPLOADS_ENABLED: '1' });
      try {
        outcomes[scope] = {};
        for (const probe of PROBES) {
          const response = await send(app, probe);
          outcomes[scope][probe.name] = response.status === 503 ? String(response.body.code) : 'not paused';
        }
      } finally {
        await app.close();
      }
    }
    const expected = Object.fromEntries(GATE_SCOPES.map((scope) => [
      scope,
      Object.fromEntries(PROBES.map((probe) => [probe.name, probe.scopes.includes(scope) ? `${scope.toUpperCase()}_PAUSED` : 'not paused'])),
    ]));
    expect(outcomes).toEqual(expected);
  });

  it('a request that is not paused goes on to the ordinary access checks', async () => {
    const app = await v1App({ OPERATIONAL_PAUSE: 'jobs' });
    try {
      const write = await send(app, PROBES[0]);
      expect([write.status, write.body.code]).toEqual([401, 'UNAUTHENTICATED']);
      const live = await send(app, PROBES.find((probe) => probe.name === 'liveness') as Probe);
      expect(live.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('an unreleased feature stays hidden (404) even while it is also paused', async () => {
    const app = await v1App({ OPERATIONAL_PAUSE: 'uploads,imports' });
    try {
      const response = await send(app, PROBES.find((probe) => probe.name === 'upload import') as Probe);
      expect([response.status, response.body.code]).toEqual([404, 'NOT_FOUND']);
    } finally {
      await app.close();
    }
  });

  it('every mutating v1 route is gated or deliberately exempt', async () => {
    const app = await v1App({});
    try {
      const gated = Object.fromEntries(
        routeManifest(app)
          .filter((entry) => !entry.route.startsWith('GET '))
          .map((entry) => [entry.route, [...entry.gates].sort().join(',') || 'exempt']),
      );
      expect(gated).toEqual({
        // Sign-in, sign-out, security and privacy rights stay available during any pause.
        'POST /v1/auth/challenges': 'exempt',
        'POST /v1/auth/bootstrap': 'exempt',
        'POST /v1/auth/proofs': 'exempt',
        'POST /v1/auth/provider-events': 'exempt',
        'POST /v1/auth/deletion-receipt': 'exempt',
        'POST /v1/me/logout': 'exempt',
        'POST /v1/me/global-logout': 'exempt',
        'POST /v1/me/deletion': 'exempt',
        'POST /v1/me/policy-acceptances': 'exempt',
        'PUT /v1/me/privacy-preferences': 'exempt',
        // A read that uses POST for its id list.
        'POST /v1/commands/status': 'exempt',
        // Business mutations.
        'POST /v1/me/identities': 'writes',
        'POST /v1/wallets': 'writes',
        'PATCH /v1/wallets/:id': 'writes',
        'POST /v1/wallets/:id/archive': 'writes',
        'POST /v1/wallets/:id/unarchive': 'writes',
        'POST /v1/categories/builtins': 'writes',
        'POST /v1/categories': 'writes',
        'PATCH /v1/categories/:id': 'writes',
        'POST /v1/categories/:id/archive': 'writes',
        'POST /v1/categories/:id/unarchive': 'writes',
        'POST /v1/transactions': 'writes',
        'PATCH /v1/transactions/:id': 'writes',
        'DELETE /v1/transactions/:id': 'writes',
        'POST /v1/transactions/:id/restore': 'writes',
        'POST /v1/transactions/:id/attachment': 'imports,writes',
        'PUT /v1/transactions/:id/attachment': 'imports,writes',
        'DELETE /v1/transactions/:id/attachment': 'writes',
        'PUT /v1/budgets/:month': 'writes',
        // Requests that queue background work.
        'POST /v1/exports': 'jobs',
        'POST /v1/sync/snapshots': 'jobs',
        // Uploads start an import.
        'POST /v1/imports': 'imports,uploads',
        // P3: review corrections and the frozen selection; confirmation also writes records.
        'PATCH /v1/imports/:id/rows': 'imports',
        'POST /v1/imports/:id/selections': 'imports',
        'POST /v1/imports/:id/confirmations': 'imports,writes',
      });
      expect(routeManifest(app).filter((entry) => entry.route.startsWith('GET ') && entry.gates.length > 0)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('the command-schema compatibility table matches the release package', async () => {
    // docs/operations/release.md: the new API and any rollback target must
    // accept every schema current clients emit (all send schema 1). A change
    // here is a release decision recorded in the release record.
    const app = await v1App({});
    try {
      const schemas = app.get(CommandRegistry).commandSchemas();
      expect(schemas).toEqual(Object.fromEntries([
        'attachment.remove', 'attachment.replace', 'attachment.retain',
        'budget.create', 'budget.replace',
        'category.archive', 'category.create', 'category.seed_builtins', 'category.unarchive', 'category.update',
        'export.request',
        'import.review.patch', 'import.selection.confirm', 'import.selection.freeze',
        'transaction.create', 'transaction.delete', 'transaction.restore', 'transaction.update',
        'wallet.archive', 'wallet.create', 'wallet.unarchive', 'wallet.update',
      ].map((kind) => [kind, [1]])));
    } finally {
      await app.close();
    }
  });

  describe('OCR inside the upload route', () => {
    const intakeCalls: string[] = [];
    const intake = { accept: async () => { intakeCalls.push('accept'); return { job_id: ID } as never; } } as unknown as UploadIntake;
    const imports = {} as ImportRepository;
    const previews = {} as PreviewQuery;
    const upload = (gates: FeatureGates, contentType: string) => {
      const controller = new ImportsController(intake, imports, previews, { uploadsEnabled: true }, gates);
      const body = (async function* () {})();
      const req = {
        headers: { 'content-type': contentType, 'x-gogospend-file-name': 'synthetic.jpg', 'idempotency-key': ID },
        iterator: () => body,
        complete: false,
        resume: jest.fn(),
      };
      const res = { setHeader: jest.fn() };
      return { result: controller.upload({} as never, req as never, res as never), req, res };
    };

    beforeEach(() => intakeCalls.splice(0));

    it('a paused OCR gate refuses image uploads before reading the body', async () => {
      const { result, req, res } = upload(new FeatureGates({ paused: ['ocr'] }), 'image/jpeg');
      await expect(result).rejects.toMatchObject({ code: 'OCR_PAUSED' });
      await expect(result).rejects.toBeInstanceOf(ProblemException);
      expect(intakeCalls).toEqual([]);
      expect(req.resume).not.toHaveBeenCalled();
      // The unread rest of the body closes the connection after the reply.
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'close');
    });

    it('a paused OCR gate leaves spreadsheet uploads alone', async () => {
      await upload(new FeatureGates({ paused: ['ocr'] }), 'text/csv').result;
      expect(intakeCalls).toEqual(['accept']);
    });
  });

  describe('worker claims', () => {
    function workerWith(gates: FeatureGates) {
      const claimed: string[][] = [];
      const jobs = { claim: async (kinds: readonly string[]) => { claimed.push([...kinds]); return []; } } as unknown as JobRepository;
      const handlers = new HandlerRegistry()
        .register('export', async () => undefined)
        .register('import_parse', async () => undefined)
        .register('import_expire', async () => undefined);
      return { worker: new JobWorker(jobs, handlers, { gates }), claimed };
    }

    it('a paused jobs gate claims nothing at all', async () => {
      const { worker, claimed } = workerWith(new FeatureGates({ paused: ['jobs'] }));
      expect(await worker.runOnce()).toBe('idle');
      expect(claimed).toEqual([]);
    });

    it('a paused imports gate stops only import parsing, not expiry or exports', async () => {
      const { worker, claimed } = workerWith(new FeatureGates({ paused: ['imports'] }));
      await worker.runOnce();
      expect(claimed).toEqual([['export', 'import_expire']]);
    });

    it('writes, uploads and OCR pauses leave the worker claiming every kind', async () => {
      const { worker, claimed } = workerWith(new FeatureGates({ paused: ['writes', 'uploads', 'ocr'] }));
      await worker.runOnce();
      expect(claimed).toEqual([['export', 'import_parse', 'import_expire']]);
    });
  });

  describe('OCR pause inside the parse handler', () => {
    const lease = { jobId: ID, accountId: ID, lifecycleGeneration: 1, leaseToken: ID, attempt: 1, maxAttempts: 3, deadline: '2099-01-01T00:00:00.000Z', signal: new AbortController().signal };
    const sourceRow = (format: string, expiresInMs = 3_600_000) => ({
      format, bytes: '4', sha256: 'a'.repeat(64), part_count: 1, expires_at: new Date(Date.now() + expiresInMs), part_keys: ['quarantine/a'], part_bytes: ['4'], part_sha256: ['a'.repeat(64)],
    });
    function handlerWith(format: string, gates: FeatureGates | undefined, expiresInMs?: number) {
      const calls: string[] = [];
      const jobs = {
        isHeld: async () => true,
        fail: async (_lease: unknown, failure: { code: string }) => (calls.push(`fail:${failure.code}`), true),
        release: async (_lease: unknown, code: string, options: { delaySeconds?: number }) => (calls.push(`release:${code}:${options.delaySeconds}`), true),
      } as unknown as JobRepository;
      const pool = { query: async () => ({ rows: [sourceRow(format, expiresInMs)] }) } as unknown as Pool;
      const store = { get: async () => (calls.push('read'), null) } as unknown as ObjectStore;
      const runner = { run: async () => (calls.push('run'), { kind: 'spawn_failed' as const }) };
      const handler = new ParseHandler({ jobs, pool, store, publication: {} as never }, { runner, gates });
      return { calls, run: () => handler.run({ lease, kind: 'import_parse', payload: {} }) };
    }

    it.each(['jpeg', 'png', 'webp'])('releases a queued %s parse as ocr_paused for the retry-after, reading and running nothing', async (format) => {
      const { calls, run } = handlerWith(format, new FeatureGates({ paused: ['ocr'], retryAfterSeconds: 90 }));
      await run();
      expect(calls).toEqual(['release:ocr_paused:90']);
    });

    it.each(['csv', 'xlsx'])('leaves a %s parse alone while OCR is paused', async (format) => {
      const { calls, run } = handlerWith(format, new FeatureGates({ paused: ['ocr'] }));
      await run();
      expect(calls).toEqual(['read', 'fail:quarantine_missing']);
    });

    it('parses images as before when OCR is open, or when no gates are given', async () => {
      for (const gates of [new FeatureGates({ paused: ['writes', 'uploads'] }), undefined]) {
        const { calls, run } = handlerWith('jpeg', gates);
        await run();
        expect(calls).toEqual(['read', 'fail:quarantine_missing']);
      }
    });

    it('still fails a raw file about to expire instead of parking it', async () => {
      const { calls, run } = handlerWith('jpeg', new FeatureGates({ paused: ['ocr'] }), 60_000);
      await run();
      expect(calls).toEqual(['fail:import_unavailable']);
    });
  });
});

// ---------------------------------------------------------------------------
const NOW = new Date('2026-10-17T03:00:00.000Z');
function receipt(overrides: Record<string, unknown> = {}, kind: 'restore_rehearsal' | 'storage_contract' = 'restore_rehearsal') {
  return {
    status: 'passed',
    recorded_at: '2026-10-16T03:00:00.000Z',
    valid_until: '2026-11-15T03:00:00.000Z',
    target: kind === 'restore_rehearsal' ? 'isolated-synthetic' : 'r2-test',
    evidence_sha256: 'a'.repeat(64),
    ...overrides,
  };
}
const ALL_PASSED: ReadinessReceipts = { restore_rehearsal: receipt(), storage_contract: receipt({}, 'storage_contract') };

type FakePool = { query: jest.Mock };
const healthyPool = (): FakePool => ({ query: jest.fn(async () => ({ rows: [{ ok: 1 }] })) });

describe('readiness', () => {
  async function ready(pool: FakePool, receipts: ReadinessReceipts, options: HealthOptions = {}) {
    const service = new HealthService(pool as never, receipts, { now: () => NOW, cacheMs: 0, timeoutMs: 50, log: () => undefined, ...options });
    return service.ready();
  }

  it('is ready only when the database answers and every mandatory receipt passed', async () => {
    const result = await ready(healthyPool(), ALL_PASSED);
    expect(result).toEqual({
      ready: true,
      checks: { process: 'ok', database: 'ok', 'receipt.restore_rehearsal': 'passed', 'receipt.storage_contract': 'passed' },
    });
  });

  it('a missing restore receipt keeps the API out of service', async () => {
    const result = await ready(healthyPool(), { storage_contract: ALL_PASSED.storage_contract });
    expect(result.ready).toBe(false);
    expect(result.checks['receipt.restore_rehearsal']).toBe('missing');
  });

  it('a failed mandatory receipt blocks readiness', async () => {
    const result = await ready(healthyPool(), { ...ALL_PASSED, restore_rehearsal: receipt({ status: 'failed' }) });
    expect(result.ready).toBe(false);
    expect(result.checks['receipt.restore_rehearsal']).toBe('failed');
  });

  it.each([
    ['expired', receipt({ valid_until: '2026-10-17T02:59:59.000Z' }), 'expired'],
    ['valid for longer than the maximum', receipt({ valid_until: '2026-12-01T03:00:00.000Z' }), 'invalid'],
    ['recorded in the future', receipt({ recorded_at: '2026-10-18T03:00:00.000Z' }), 'invalid'],
    ['from a local rehearsal', receipt({ target: 'local-isolated-synthetic' }), 'invalid'],
    ['without evidence', receipt({ evidence_sha256: 'not-a-digest' }), 'invalid'],
    ['with an unknown field', receipt({ note: 'looks fine' }), 'invalid'],
    ['with an unknown status', receipt({ status: 'skipped' }), 'invalid'],
    ['not an object', 'passed', 'invalid'],
  ])('a restore receipt %s is not ready', async (_label, entry, state) => {
    const result = await ready(healthyPool(), { ...ALL_PASSED, restore_rehearsal: entry });
    expect(result.ready).toBe(false);
    expect(result.checks['receipt.restore_rehearsal']).toBe(state);
  });

  it('a database that does not answer is bounded by the check timeout', async () => {
    const pool = { query: jest.fn(() => new Promise(() => undefined)) };
    const started = Date.now();
    const result = await ready(pool, ALL_PASSED, { timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result.ready).toBe(false);
    expect(result.checks.database).toBe('timeout');
  });

  it('a draining process is not ready, while liveness stays up', async () => {
    const service = new HealthService(healthyPool() as never, ALL_PASSED, { now: () => NOW, cacheMs: 0, log: () => undefined });
    service.markDraining();
    expect((await service.ready()).checks.process).toBe('draining');
    expect((await service.ready()).ready).toBe(false);
    expect(service.live()).toEqual({ status: 'live' });
  });

  it('readiness is cached and single-flight, so probes cannot drive database load', async () => {
    const pool = healthyPool();
    const service = new HealthService(pool as never, ALL_PASSED, { now: () => NOW, cacheMs: 5_000, log: () => undefined });
    await Promise.all(Array.from({ length: 20 }, () => service.ready()));
    await service.ready();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('reads the receipt source strictly: one source, valid JSON, known receipts only', () => {
    expect(readinessReceiptsFromEnv({})).toEqual({});
    const json = JSON.stringify(ALL_PASSED);
    expect(readinessReceiptsFromEnv({ READINESS_RECEIPTS: json })).toEqual(ALL_PASSED);
    expect(readinessReceiptsFromEnv({ READINESS_RECEIPTS_FILE: '/run/receipts.json' }, (path) => (path === '/run/receipts.json' ? json : ''))).toEqual(ALL_PASSED);
    expect(() => readinessReceiptsFromEnv({ READINESS_RECEIPTS: json, READINESS_RECEIPTS_FILE: '/run/receipts.json' })).toThrow(/READINESS_RECEIPTS/);
    expect(() => readinessReceiptsFromEnv({ READINESS_RECEIPTS: '{not json' })).toThrow(/READINESS_RECEIPTS/);
    expect(() => readinessReceiptsFromEnv({ READINESS_RECEIPTS: '[]' })).toThrow(/READINESS_RECEIPTS/);
    expect(() => readinessReceiptsFromEnv({ READINESS_RECEIPTS: JSON.stringify({ restore: receipt() }) })).toThrow(/restore/);
    expect(() => readinessReceiptsFromEnv({ READINESS_RECEIPTS_FILE: 'relative.json' }, () => json)).toThrow(/READINESS_RECEIPTS_FILE/);
  });

  it('over HTTP: /live is 200 without touching the database, /ready is a 503 ApiProblem that names no check state', async () => {
    const pool = healthyPool();
    const app = await v1HealthApp(pool, {});
    try {
      const live = await request(app.getHttpServer()).get('/live');
      expect([live.status, live.body]).toEqual([200, { status: 'live' }]);
      expect(pool.query).not.toHaveBeenCalled();
      const notReady = await request(app.getHttpServer()).get('/ready');
      expect(notReady.status).toBe(503);
      expect(notReady.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message_key: 'errors.not_ready' });
      // The check states (receipts included) go to the operator's readiness log line only.
      expect(notReady.body.fields).toBeUndefined();
      expect(notReady.body.retry_after_seconds).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
    const readyApp = await v1HealthApp(healthyPool(), ALL_PASSED);
    try {
      const response = await request(readyApp.getHttpServer()).get('/ready');
      expect([response.status, response.body]).toEqual([200, { status: 'ready' }]);
    } finally {
      await readyApp.close();
    }
  });
});

/** HealthController behind the real access guard, filter and middleware. */
async function v1HealthApp(pool: FakePool, receipts: ReadinessReceipts): Promise<NestExpressApplication> {
  return createV1TestApp([HealthController], {
    providers: [
      HealthService,
      { provide: PG_POOL, useValue: pool },
      { provide: READINESS_RECEIPTS, useValue: receipts },
      { provide: HEALTH_OPTIONS, useValue: { now: () => NOW, cacheMs: 0, log: () => undefined } },
    ],
  });
}

// ---------------------------------------------------------------------------
@Controller('v1/leaky')
class LeakyController {
  @Get('plain') @Access('public') plain(): never { throw new Error(leakyText); }
  @Get('driver') @Access('public') driver(): never {
    throw Object.assign(new Error(`invalid input syntax for type bigint: "${AMOUNT_MINOR}" via ${CONNECTION}`), { code: '22P02', detail: leakyText });
  }
  @Get('network') @Access('public') network(): never { throw Object.assign(new Error(`connect ECONNREFUSED ${CONNECTION}`), { code: 'ECONNREFUSED' }); }
  @Get('typed') @Access('public') typed(): never { throw new TypeError(leakyText); }
}

describe('redaction', () => {
  it('API failures carry no credential or financial value into logs or responses', async () => {
    const app = await createV1TestApp([LeakyController]);
    try {
      const bodies: string[] = [];
      const output = await captureOutput(async () => {
        for (const path of ['plain', 'driver', 'network', 'typed']) {
          const response = await request(app.getHttpServer()).get(`/v1/leaky/${path}?token=${BEARER}`).set('authorization', `Bearer ${BEARER}`);
          bodies.push(JSON.stringify(response.body));
        }
      });
      expect(output).toContain('"status":500');
      expectNoSecrets(output);
      expectNoSecrets(bodies.join('\n'));
    } finally {
      await app.close();
    }
  });

  it('a failing readiness check logs and returns no driver text', async () => {
    const pool = { query: jest.fn(async () => { throw Object.assign(new Error(`connect failed ${CONNECTION}`), { code: 'ECONNREFUSED' }); }) };
    const logged: string[] = [];
    const service = new HealthService(pool as never, ALL_PASSED, { now: () => NOW, cacheMs: 0, log: (entry) => logged.push(JSON.stringify(entry)) });
    const result = await service.ready();
    expect(result.checks.database).toBe('failed');
    expect(logged.join('\n')).toContain('readiness');
    expectNoSecrets(logged.join('\n'));
    expectNoSecrets(JSON.stringify(result));
  });

  it('worker and API startup failures log no credential or financial value', async () => {
    const lines: string[] = [];
    // runMain's crash handlers go on a stand-in, never on the test runner's process.
    const processDouble = { emitter: new EventEmitter(), exit: jest.fn() };
    const saved = process.exitCode;
    try {
      await runMain('job worker', async () => { throw new Error(leakyText); }, (line) => lines.push(line), processDouble);
      await runMain('security worker', async () => { throw Object.assign(new Error(`password authentication failed: ${CONNECTION}`), { code: '28P01' }); }, (line) => lines.push(line), processDouble);
      await runMain('deletion worker', async () => { throw Object.assign(new Error(`getaddrinfo ENOTFOUND db.synthetic.invalid ${R2_SECRET}`), { code: 'ENOTFOUND' }); }, (line) => lines.push(line), processDouble);
      await runMain('v1', async () => { throw 'a thrown string ' + leakyText; }, (line) => lines.push(line), processDouble);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = saved;
    }
    expect(lines).toEqual([
      'job worker startup failed: Error',
      'security worker startup failed: Error 28P01',
      'deletion worker startup failed: Error ENOTFOUND',
      'v1 startup failed: unknown error',
    ]);
    expectNoSecrets(lines.join('\n'));
  });

  it("Nest's own startup errors are redacted and carry no stack trace", () => {
    const lines: string[] = [];
    const logger = new OperationalLogger((entry) => lines.push(JSON.stringify(entry)));
    const failure = new Error(leakyText);
    logger.error(failure, failure.stack, 'ExceptionHandler');
    logger.error(`provider failed: ${CONNECTION}`, 'InstanceLoader');
    logger.warn('Database URL is not configured.', 'InstanceLoader');
    logger.log(`mapped route with ${BEARER}`);
    expect(lines).toEqual([
      '{"level":"error","source":"nest","context":"ExceptionHandler","message":"Error"}',
      '{"level":"error","source":"nest","context":"InstanceLoader","message":"(message withheld)"}',
      '{"level":"warn","source":"nest","context":"InstanceLoader","message":"(message withheld)"}',
    ]);
    expectNoSecrets(lines.join('\n'));
  });

  it('fixed configuration messages stay readable; any other message is withheld', () => {
    for (const message of [
      'DATABASE_URL is not configured.',
      'JOB_SWEEP_INTERVAL_MINUTES must be 1-1440.',
      'AUTH0_MAINTENANCE_CLIENT_ID and AUTH0_MAINTENANCE_CLIENT_SECRET are not configured.',
      'The erasure registry login must be a member of gogospend_erasure_registry only.',
      '--registry-fd <3-99> is required (the erasure registry settings, piped from the secret manager).',
    ]) {
      expect(describeFailure(new ConfigurationError(message))).toBe(`ConfigurationError: ${message}`);
      expect(describeFailure(new Error(message))).toBe('Error');
    }
    for (const leaky of [CONNECTION, `token ${BEARER}`, `amount ${AMOUNT_MINOR}`, `total ${AMOUNT_BAHT}`, `owner ${ACCOUNT_ID}`, `key ${R2_SECRET}`, `password ${PASSWORD}`, 'a'.repeat(400)]) {
      expect(describeFailure(new ConfigurationError(leaky))).toBe('ConfigurationError (message withheld)');
      expect(describeFailure(new Error(leaky))).toBe('Error');
    }
  });

  it('every release process reports startup failures through runMain, never raw error text', () => {
    for (const entry of ['v1/main.ts', 'worker.ts', 'jobs/security-worker.ts', 'privacy/deletion-worker.ts', 'database/migrate-cli.ts']) {
      const source = readFileSync(join(__dirname, '..', entry), 'utf8');
      expect({ entry, usesRunMain: /runMain\(/.test(source), rawMessage: /error\.message|\.message\}/.test(source) }).toEqual({ entry, usesRunMain: true, rawMessage: false });
    }
  });

  it('queue-age lines carry only kinds, counts and seconds, and alert past five minutes', () => {
    expect(OPERATIONAL_THRESHOLDS.queueAgeSeconds).toBe(300);
    const lines = queueAgeLines('job worker', [
      { kind: 'export', due: 3, oldestDueSeconds: 301 },
      { kind: 'sync_snapshot', due: 1, oldestDueSeconds: 12 },
    ]);
    expect(lines).toEqual({
      info: ['job worker: queue due=4 oldest_due_seconds=301'],
      alerts: ['job worker: alert queue_age kind=export due=3 oldest_due_seconds=301 threshold_seconds=300'],
    });
    expect(queueAgeLines('job worker', [])).toEqual({ info: ['job worker: queue due=0 oldest_due_seconds=0'], alerts: [] });
  });
});

// ---------------------------------------------------------------------------
describe('graceful shutdown', () => {
  it('stops on SIGTERM once, and exits 0 when the stop finished in time', async () => {
    const emitter = new EventEmitter();
    const exit = jest.fn();
    const stop = jest.fn(async () => undefined);
    const lines: string[] = [];
    handleShutdownSignals({ name: 'v1', timeoutMs: 1_000, stop, exitWhenStopped: true, emitter, exit, log: (line) => lines.push(line) });
    emitter.emit('SIGTERM', 'SIGTERM');
    emitter.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(lines).toEqual(['v1: stopping (SIGTERM)']);
  });

  it('a stop that hangs is cut off at the timeout with exit 1', async () => {
    const emitter = new EventEmitter();
    const exit = jest.fn();
    const onTimeout = jest.fn();
    const lines: string[] = [];
    handleShutdownSignals({ name: 'job worker', timeoutMs: 30, stop: () => new Promise(() => undefined), exitWhenStopped: false, emitter, exit, onTimeout, log: (line) => lines.push(line) });
    emitter.emit('SIGINT', 'SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(onTimeout).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    expect(lines).toEqual(['job worker: stopping (SIGINT)', 'job worker: shutdown timed out after 30 ms']);
  });

  it('a worker that stopped by itself is not forced to exit', async () => {
    const emitter = new EventEmitter();
    const exit = jest.fn();
    handleShutdownSignals({ name: 'job worker', timeoutMs: 1_000, stop: () => undefined, exitWhenStopped: false, emitter, exit, log: () => undefined });
    emitter.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(exit).not.toHaveBeenCalled();
  });

  it('SHUTDOWN_TIMEOUT_SECONDS is bounded', () => {
    expect(shutdownTimeoutMsFromEnv(undefined)).toBe(25_000);
    expect(shutdownTimeoutMsFromEnv('40')).toBe(40_000);
    for (const bad of ['0', '4', '121', 'soon', '2.5']) expect(() => shutdownTimeoutMsFromEnv(bad)).toThrow(/SHUTDOWN_TIMEOUT_SECONDS/);
  });
});
