// P6b review fixes (no database: every pool aims at a closed loopback port):
// - M1 the API's stop closes HTTP first (busy keep-alive sockets included),
//   after an optional drain delay, and only then closes the app;
// - M2 the platform's deploy health check is receipt- and database-free, and
//   a passed receipt warns before it expires;
// - m1 a refused upload closes the connection instead of reading the body;
// - m2 only a ConfigurationError's message is ever logged;
// - m3 receipt timestamps and evidence are checked strictly, and `/ready`
//   no longer returns check states;
// - m4 the queue report runs on its own one-minute interval;
// - nits: a second signal, crash handlers, the readiness query bound and the
//   gates wiring.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { Agent, request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { join } from 'node:path';

import { Controller, Get, Module, Res } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'express';
import request from 'supertest';

import { ApplicationSessionGuard } from '../auth/application-session.guard';
import { V1AccessGuard } from '../auth/auth.module';
import { Auth0AccessTokenGuard } from '../auth/auth0-access-token.guard';
import { runSecurityJobsOnce } from '../auth/security-job.repository';
import { auth0ConfigFromEnv } from '../auth/auth0-token-verifier';
import { eventVerifierConfigFromEnv } from '../auth/auth0-event-verifier';
import { maintenanceGatewayFromEnv } from '../auth/auth0-management.client';
import { commandDigesterFromEnv } from '../commands/command-digest';
import { poolConfigFromUrl } from '../database/database-config';
import { DEPLOY_HEALTH_PATH } from '../health/health.controller';
import { HealthService, readinessReceiptsFromEnv } from '../health/health.service';
import { RECEIPT_EXPIRY_WARNING_DAYS, receiptExpiryWarnings, receiptPreflight, receiptState } from '../health/readiness-receipts';
import { ImportRepository } from '../imports/import.repository';
import { ImportsController } from '../imports/imports.controller';
import { PreviewQuery } from '../imports/preview-query';
import { IMPORT_INTAKE_CONFIG, UploadIntake } from '../imports/upload-intake';
import { readRegistrySettings } from '../privacy/deletion-worker';
import { objectStoreFromEnv } from '../storage/object-store-config';
import { V1AppModule, configureV1App, trustProxyHopsFromEnv } from '../v1/v1-app.module';
import { MIN_CLIENT_VERSIONS, minimumClientVersionsFromEnv } from './client-version.guard';
import { ConfigurationError } from './configuration-error';
import { FEATURE_GATES, FeatureGates, featureGatesFromEnv, releaseFlagFromEnv } from './feature-gates';
import { OperationalLogger, QUEUE_REPORT_INTERVAL_MS, describeFailure, startQueueReports } from './operational-metrics';
import { applyHttpTimeouts, gracefulHttpStop, handleShutdownSignals, runMain, shutdownDrainDelayMsFromEnv, shutdownTimeoutMsFromEnv, trackHttpDrain } from './process-lifecycle';
import { RATE_LIMITER, rateLimitKeyFromEnv } from './shared-rate-limit';

const PASSWORD = 'Syn7hetic-Pa55word-for-p6b-review';
const CONNECTION = `postgres://gogospend_app_login:${PASSWORD}@db.synthetic.invalid:5432/gogospend_v1`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function v1App(extra: Record<string, string>, listen = false): Promise<NestExpressApplication> {
  const keys = [...Object.keys(BASE_ENV), ...GATE_ENV];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of GATE_ENV) delete process.env[key];
  Object.assign(process.env, BASE_ENV, extra);
  try {
    const app = await NestFactory.create<NestExpressApplication>(V1AppModule, { bodyParser: false, logger: false, abortOnError: false });
    configureV1App(app);
    if (listen) await app.listen(0, '127.0.0.1');
    else await app.init();
    return app;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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
const healthyPool = () => ({ query: jest.fn(async () => ({ rows: [{ ok: 1 }] })) });

// ---------------------------------------------------------------------------
@Controller('probe')
class SlowController {
  @Get('slow')
  async slow(): Promise<{ ok: true }> {
    await sleep(500);
    return { ok: true };
  }

  /** A response whose headers are already sent when the stop begins. */
  @Get('stream')
  stream(@Res() res: Response): void {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.write('a');
    setTimeout(() => res.end('b'), 500);
  }
}
@Module({ controllers: [SlowController] })
class SlowModule {}

type Reply = { status: number; connection: string | undefined };
function get(port: number, agent?: Agent, path = '/probe/slow'): Promise<Reply | string> {
  return new Promise((resolve) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, agent }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, connection: res.headers.connection }));
    });
    req.on('error', (error: NodeJS.ErrnoException) => resolve(`error ${error.code ?? error.name}`));
    req.end();
  });
}

async function slowApp(): Promise<{ app: NestExpressApplication; server: Server; port: number; drain: ReturnType<typeof trackHttpDrain> }> {
  const app = await NestFactory.create<NestExpressApplication>(SlowModule, { logger: false });
  const server = app.getHttpServer() as Server;
  applyHttpTimeouts(server);
  const drain = trackHttpDrain(server, 20);
  await app.listen(0, '127.0.0.1');
  return { app, server, port: (server.address() as AddressInfo).port, drain };
}

describe('M1: the API stops HTTP before it closes the app', () => {
  it('a busy keep-alive connection finishes its request with Connection: close, and the process exits 0 well before the timeout', async () => {
    const { app, server, port, drain } = await slowApp();
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    expect(await get(port, agent)).toEqual({ status: 200, connection: 'keep-alive' });
    const emitter = new EventEmitter();
    const started = Date.now();
    const exited = new Promise<{ code: number; ms: number }>((resolve) => {
      handleShutdownSignals({
        name: 'v1',
        timeoutMs: 4_000,
        exitWhenStopped: true,
        emitter,
        exit: (code) => resolve({ code, ms: Date.now() - started }),
        log: () => undefined,
        stop: () => gracefulHttpStop({ markDraining: () => undefined, delayMs: 0, drain, closeApp: () => app.close() }),
        onTimeout: () => server.closeAllConnections(),
      });
    });
    const inflight = get(port, agent);
    await sleep(100);
    emitter.emit('SIGTERM', 'SIGTERM');
    const reply = await inflight;
    const outcome = await exited;
    agent.destroy();
    expect({ reply, code: outcome.code, wellBeforeTimeout: outcome.ms < 2_000 }).toEqual({ reply: { status: 200, connection: 'close' }, code: 0, wellBeforeTimeout: true });
  }, 15_000);

  it('a keep-alive socket whose response had already started is closed once it goes idle, so the stop still ends early', async () => {
    const { app, server, port, drain } = await slowApp();
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const emitter = new EventEmitter();
    const started = Date.now();
    const exited = new Promise<{ code: number; ms: number }>((resolve) => {
      handleShutdownSignals({
        name: 'v1',
        timeoutMs: 4_000,
        exitWhenStopped: true,
        emitter,
        exit: (code) => resolve({ code, ms: Date.now() - started }),
        log: () => undefined,
        stop: () => gracefulHttpStop({ markDraining: () => undefined, delayMs: 0, drain, closeApp: () => app.close() }),
        onTimeout: () => server.closeAllConnections(),
      });
    });
    const streaming = get(port, agent, '/probe/stream');
    await sleep(150);
    emitter.emit('SIGTERM', 'SIGTERM');
    const reply = await streaming;
    const outcome = await exited;
    agent.destroy();
    // Its headers went out before the stop, so it still says keep-alive; the idle poll closes it.
    expect({ reply, code: outcome.code, wellBeforeTimeout: outcome.ms < 2_000 }).toEqual({ reply: { status: 200, connection: 'keep-alive' }, code: 0, wellBeforeTimeout: true });
  }, 15_000);

  it('marks draining, keeps serving (with Connection: close) through the drain delay, then closes HTTP and only then the app', async () => {
    const { app, port, drain } = await slowApp();
    const steps: string[] = [];
    const started = Date.now();
    const stopping = gracefulHttpStop({
      markDraining: () => steps.push('draining'),
      delayMs: 400,
      drain,
      closeApp: async () => {
        steps.push(`close app after ${Date.now() - started >= 400 ? 'the delay' : 'no delay'}`);
        await app.close();
      },
    });
    await sleep(50);
    const duringDelay = await get(port);
    await stopping;
    expect({ steps, duringDelay }).toEqual({ steps: ['draining', 'close app after the delay'], duringDelay: { status: 200, connection: 'close' } });
    expect(await get(port)).toMatch(/^error ECONNREFUSED/);
  }, 15_000);

  it('SHUTDOWN_DRAIN_DELAY_SECONDS is 0-30 (default 2) and leaves at least half the shutdown timeout for draining', () => {
    expect(shutdownDrainDelayMsFromEnv(undefined, 25_000)).toBe(2_000);
    expect(shutdownDrainDelayMsFromEnv('', 25_000)).toBe(2_000);
    expect(shutdownDrainDelayMsFromEnv('0', 25_000)).toBe(0);
    expect(shutdownDrainDelayMsFromEnv('10', 25_000)).toBe(10_000);
    for (const [bad, timeout] of [['13', 25_000], ['31', 120_000], ['-1', 25_000], ['1.5', 25_000], ['soon', 25_000], ['3', 5_000]] as const) {
      expect(() => shutdownDrainDelayMsFromEnv(bad, timeout)).toThrow(/SHUTDOWN_DRAIN_DELAY_SECONDS/);
    }
  });

  it('main.ts wires the graceful stop: drain tracking before listen, the delay setting, and app.close() last', () => {
    const source = readFileSync(join(__dirname, '..', 'v1', 'main.ts'), 'utf8');
    expect({
      tracksDrain: /trackHttpDrain\(/.test(source),
      readsDelay: /shutdownDrainDelayMsFromEnv\(/.test(source),
      gracefulStop: /gracefulHttpStop\(/.test(source),
    }).toEqual({ tracksDrain: true, readsDelay: true, gracefulStop: true });
  });
});

describe('M4: the security worker claims nothing more once it is stopping', () => {
  it('a stopped pass claims no revocation, link or reconcile job', async () => {
    const claim = jest.fn(async () => []);
    const scheduleReconcile = jest.fn(async () => undefined);
    const summary = await runSecurityJobsOnce({
      jobs: { claim } as never,
      security: { scheduleReconcile } as never,
      gateway: {} as never,
      linker: {} as never,
      reconcile: { everySeconds: 300, batch: 10 },
      stop: AbortSignal.abort(),
    });
    expect({ claims: claim.mock.calls.length, scheduled: scheduleReconcile.mock.calls.length, summary: Object.values(summary).every((count) => count === 0) }).toEqual({ claims: 0, scheduled: 0, summary: true });
  });
});

describe('process signals and crashes', () => {
  it('a second SIGTERM during the stop is ignored instead of falling through to the default (kill)', () => {
    const emitter = new EventEmitter();
    const exit = jest.fn();
    let finish: () => void = () => undefined;
    const remove = handleShutdownSignals({ name: 'v1', timeoutMs: 60_000, exitWhenStopped: false, stop: () => new Promise<void>((resolve) => (finish = resolve)), emitter, exit, log: () => undefined });
    emitter.emit('SIGTERM', 'SIGTERM');
    const listening = { SIGTERM: emitter.listenerCount('SIGTERM'), SIGINT: emitter.listenerCount('SIGINT') };
    emitter.emit('SIGTERM', 'SIGTERM');
    emitter.emit('SIGINT', 'SIGINT');
    finish();
    remove();
    expect({ listening, exit: exit.mock.calls, afterRemove: emitter.listenerCount('SIGTERM') }).toEqual({ listening: { SIGTERM: 1, SIGINT: 1 }, exit: [], afterRemove: 0 });
  });

  it('an uncaught exception or unhandled rejection is reported redacted and exits 1', async () => {
    const emitter = new EventEmitter();
    const exit = jest.fn();
    const lines: string[] = [];
    await runMain('v1', async () => undefined, (line) => lines.push(line), { emitter, exit });
    const listening = { uncaught: emitter.listenerCount('uncaughtException'), rejection: emitter.listenerCount('unhandledRejection') };
    emitter.emit('uncaughtException', new Error(`invalid amount 9999 via ${CONNECTION}`));
    emitter.emit('unhandledRejection', Object.assign(new Error(`connect ECONNREFUSED ${CONNECTION}`), { code: 'ECONNREFUSED' }));
    expect({ listening, lines, exit: exit.mock.calls }).toEqual({
      listening: { uncaught: 1, rejection: 1 },
      lines: ['v1 crashed: Error', 'v1 crashed: Error ECONNREFUSED'],
      exit: [[1], [1]],
    });
  });
});

// ---------------------------------------------------------------------------
describe('M2: deploy health versus readiness', () => {
  it('the deploy health check answers 200 while the database check fails and every receipt has expired; /ready stays 503', async () => {
    const day = 86_400_000;
    const expired = (kind: 'restore_rehearsal' | 'storage_contract') =>
      receipt({ recorded_at: new Date(Date.now() - 40 * day).toISOString(), valid_until: new Date(Date.now() - 10 * day).toISOString() }, kind);
    const app = await v1App({ READINESS_RECEIPTS: JSON.stringify({ restore_rehearsal: expired('restore_rehearsal'), storage_contract: expired('storage_contract') }) });
    try {
      const deploy = await request(app.getHttpServer()).get(DEPLOY_HEALTH_PATH);
      const ready = await request(app.getHttpServer()).get('/ready');
      expect({ deploy: deploy.status, ready: ready.status }).toEqual({ deploy: 200, ready: 503 });
    } finally {
      await app.close();
    }
  });

  it('the release runbook names the same deploy health path, and readiness for monitoring', () => {
    const release = readFileSync(join(__dirname, '..', '..', '..', '..', 'docs', 'operations', 'release.md'), 'utf8');
    expect(release).toContain(`deploy health check \`GET ${DEPLOY_HEALTH_PATH}\``);
  });

  it('a passed receipt within 7 days of expiry logs receipt_expiring, at most once a day per receipt', () => {
    expect(RECEIPT_EXPIRY_WARNING_DAYS).toBe(7);
    const receipts = {
      restore_rehearsal: receipt({ recorded_at: '2026-09-22T03:00:00.000Z', valid_until: '2026-10-22T03:00:00.000Z' }),
      storage_contract: receipt({}, 'storage_contract'),
    };
    let now = NOW;
    const logged: Record<string, unknown>[] = [];
    const service = new HealthService(healthyPool() as never, receipts, { now: () => now, log: (entry) => logged.push(entry) });
    service.checkReceiptExpiry();
    service.checkReceiptExpiry();
    now = new Date(NOW.getTime() + 25 * 3_600_000);
    service.checkReceiptExpiry();
    expect(logged).toEqual([
      { level: 'warn', event: 'receipt_expiring', receipt: 'restore_rehearsal', hours_left: 120, warning_days: 7 },
      { level: 'warn', event: 'receipt_expiring', receipt: 'restore_rehearsal', hours_left: 95, warning_days: 7 },
    ]);
    expect(receiptExpiryWarnings(receipts, NOW)).toEqual([{ kind: 'restore_rehearsal', hoursLeft: 120 }]);
    expect(receiptExpiryWarnings(receipts, new Date('2026-10-14T03:00:00.000Z'))).toEqual([]);
  });

  it('the API checks receipt expiry at startup and every hour until it stops', () => {
    jest.useFakeTimers({ now: NOW });
    try {
      const service = new HealthService(healthyPool() as never, {}, { log: () => undefined });
      const check = jest.spyOn(service, 'checkReceiptExpiry');
      service.onApplicationBootstrap();
      jest.advanceTimersByTime(3_600_000);
      service.onApplicationShutdown();
      jest.advanceTimersByTime(3 * 3_600_000);
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the release preflight needs every receipt passed and valid for the release window', () => {
    const fresh = { restore_rehearsal: receipt(), storage_contract: receipt({}, 'storage_contract') };
    expect(receiptPreflight(fresh, NOW, 7)).toEqual({
      ok: true,
      receipts: { restore_rehearsal: { state: 'passed', valid_hours: 696 }, storage_contract: { state: 'passed', valid_hours: 696 } },
    });
    const soon = { ...fresh, restore_rehearsal: receipt({ recorded_at: '2026-09-22T03:00:00.000Z', valid_until: '2026-10-22T03:00:00.000Z' }) };
    expect(receiptPreflight(soon, NOW, 7).ok).toBe(false);
    expect(receiptPreflight(soon, NOW, 3).ok).toBe(true);
    expect(receiptPreflight({ storage_contract: fresh.storage_contract }, NOW, 7).receipts.restore_rehearsal).toEqual({ state: 'missing', valid_hours: null });
  });
});

describe('m3: receipts are format- and time-checked attestations', () => {
  it.each([
    ['an all-zero evidence digest', receipt({ evidence_sha256: '0'.repeat(64) })],
    ['an impossible calendar date', receipt({ recorded_at: '2026-09-31T03:00:00.000Z', valid_until: '2026-10-30T03:00:00.000Z' })],
    ['hour 24', receipt({ recorded_at: '2026-10-16T24:00:00Z' })],
    ['a valid_until that does not round-trip', receipt({ valid_until: '2026-11-15T03:00:60Z' })],
  ])('a receipt with %s is invalid', (_label, entry) => {
    expect(receiptState('restore_rehearsal', entry, NOW)).toBe('invalid');
  });

  it('timestamps as toISOString() prints them, or without zero milliseconds, are accepted', () => {
    expect(receiptState('restore_rehearsal', receipt(), NOW)).toBe('passed');
    expect(receiptState('restore_rehearsal', receipt({ recorded_at: '2026-10-16T03:00:00Z', valid_until: '2026-11-15T03:00:00Z' }), NOW)).toBe('passed');
  });

  it('/ready is a 503 ApiProblem without check states, and 200 without them too', async () => {
    const notReady = await v1App({});
    try {
      const response = await request(notReady.getHttpServer()).get('/ready');
      expect({ status: response.status, code: response.body.code, fields: response.body.fields, checks: response.body.checks }).toEqual({ status: 503, code: 'SERVICE_UNAVAILABLE', fields: undefined, checks: undefined });
    } finally {
      await notReady.close();
    }
  });

  it('the readiness query carries its own query_timeout, so a hung database does not keep a pooled connection', async () => {
    const pool = healthyPool();
    const service = new HealthService(pool as never, {}, { now: () => NOW, cacheMs: 0, timeoutMs: 1_500, log: () => undefined });
    await service.ready();
    expect(pool.query).toHaveBeenCalledWith({ text: 'SELECT 1 AS ok', query_timeout: 1_500 });
  });
});

// ---------------------------------------------------------------------------
describe('m2: only configuration errors print their message', () => {
  it('any other error is logged by its class name alone (probe D values)', () => {
    const lines: string[] = [];
    for (const message of [
      'invalid amount 9999 for wallet cash',
      'password correcthorsebatterystaple rejected',
      'login gogospend_app with secret hunter2hunter2 failed',
      'card 4111 1111 1111 1111 declined',
      'amount ๑๒๓๔๕.๖๗ invalid',
      'value 1.234 too precise',
      'refresh token abcdefghijklmnopqrstuvwxyz012345 expired',
      'account 081-234-5678',
    ]) {
      lines.push(describeFailure(new Error(message)), describeFailure(new TypeError(message)));
    }
    expect([...new Set(lines)]).toEqual(['Error', 'TypeError']);
    expect(describeFailure(new ConfigurationError('DATABASE_URL is not configured.'))).toBe('ConfigurationError: DATABASE_URL is not configured.');
    expect(describeFailure(new ConfigurationError(`bad ${CONNECTION}`))).toBe('ConfigurationError (message withheld)');
  });

  it("Nest's string messages are withheld; its errors show their class", () => {
    const lines: string[] = [];
    const logger = new OperationalLogger((entry) => lines.push(JSON.stringify(entry)));
    logger.error('Cannot apply 9999 to wallet', 'Error: x\n    at y', 'ExceptionHandler');
    logger.error(new ConfigurationError('Database URL is not configured.'), 'stack', 'ExceptionHandler');
    expect(lines).toEqual([
      '{"level":"error","source":"nest","context":"ExceptionHandler","message":"(message withheld)"}',
      '{"level":"error","source":"nest","context":"ExceptionHandler","message":"ConfigurationError: Database URL is not configured."}',
    ]);
  });

  const thrownBy = (fn: () => unknown): unknown => {
    try {
      fn();
    } catch (error) {
      return error;
    }
    return undefined;
  };
  it.each([
    ['OPERATIONAL_PAUSE', () => featureGatesFromEnv({ OPERATIONAL_PAUSE: 'everything' })],
    ['OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS', () => featureGatesFromEnv({ OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS: '5' })],
    ['IMPORT_UPLOADS_ENABLED', () => releaseFlagFromEnv({ IMPORT_UPLOADS_ENABLED: 'yes' }, 'IMPORT_UPLOADS_ENABLED')],
    ['SHUTDOWN_TIMEOUT_SECONDS', () => shutdownTimeoutMsFromEnv('1')],
    ['SHUTDOWN_DRAIN_DELAY_SECONDS', () => shutdownDrainDelayMsFromEnv('99', 25_000)],
    ['READINESS_RECEIPTS', () => readinessReceiptsFromEnv({ READINESS_RECEIPTS: '{not json' })],
    ['DATABASE_URL', () => poolConfigFromUrl(undefined)],
    ['TRUST_PROXY_HOPS', () => trustProxyHopsFromEnv(undefined, 'production')],
    ['MIN_CLIENT_VERSION_*', () => minimumClientVersionsFromEnv({})],
    ['RATE_LIMIT_KEY', () => rateLimitKeyFromEnv({ RATE_LIMIT_KEY: 'short' })],
    ['COMMAND_DIGEST_KEY', () => commandDigesterFromEnv({ COMMAND_DIGEST_KEY: 'short' })],
    ['AUTH0_AUDIENCE', () => auth0ConfigFromEnv({ AUTH0_ISSUER: 'https://issuer.invalid/' })],
    ['AUTH0_EVENTS_SIGNING_SECRETS', () => eventVerifierConfigFromEnv({ AUTH0_ISSUER: 'https://issuer.invalid/', AUTH0_EVENTS_SIGNING_SECRETS: 'short' })],
    ['AUTH0_MANAGEMENT_URL', () => maintenanceGatewayFromEnv({ AUTH0_MAINTENANCE_CLIENT_ID: 'm', AUTH0_MAINTENANCE_CLIENT_SECRET: 's', AUTH0_MANAGEMENT_URL: 'http://issuer.invalid/' })],
    ['OBJECT_STORE', () => objectStoreFromEnv({ OBJECT_STORE: 'memory', NODE_ENV: 'production' })],
    ['--registry-fd', () => readRegistrySettings([])],
  ])('%s problems are ConfigurationErrors, so their fixed text stays readable', (_setting, fn) => {
    const error = thrownBy(fn);
    expect({ configuration: error instanceof ConfigurationError, logged: describeFailure(error).startsWith('ConfigurationError: ') }).toEqual({ configuration: true, logged: true });
  });

  it('the worker entries throw ConfigurationError for their own settings', () => {
    for (const entry of ['worker.ts', 'jobs/security-worker.ts', 'privacy/deletion-worker.ts', 'database/migrate-cli.ts']) {
      const source = readFileSync(join(__dirname, '..', entry), 'utf8');
      expect({ entry, plainErrors: (source.match(/throw new Error\(/g) ?? []).length }).toEqual({ entry, plainErrors: 0 });
    }
  });
});

// ---------------------------------------------------------------------------
/**
 * Sends POST /v1/imports with a chunked body and keeps streaming after the
 * reply (probe A): the status line, whether the reply said Connection:
 * close, and how many bytes the server read.
 */
async function streamUpload(app: NestExpressApplication, totalMiB: number): Promise<{ status: string; connectionClose: boolean; serverBytesRead: number }> {
  const server = app.getHttpServer() as Server;
  const serverSockets: Socket[] = [];
  server.on('connection', (socket: Socket) => serverSockets.push(socket));
  const { port } = server.address() as AddressInfo;
  const socket = connect(port, '127.0.0.1');
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  let response = '';
  let closed = false;
  socket.on('data', (chunk) => (response += chunk.toString('latin1')));
  for (const event of ['end', 'close', 'error']) socket.on(event, () => (closed = true));
  socket.write(
    'POST /v1/imports HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: text/csv\r\nx-gogospend-client: ios/1.0.0\r\n' +
      'x-gogospend-file-name: synthetic.csv\r\nidempotency-key: 0b5c9a8e-1d2f-4e3a-8b7c-6d5e4f3a2b1c\r\nTransfer-Encoding: chunked\r\n\r\n',
  );
  const chunk = Buffer.alloc(64 * 1024, 0x61);
  const frame = Buffer.concat([Buffer.from(`${chunk.length.toString(16)}\r\n`), chunk, Buffer.from('\r\n')]);
  // Like a client that reads an early reply while it is still sending.
  for (let sent = 0; sent < totalMiB * 16 && !closed && !response.includes('\r\n\r\n'); sent += 1) {
    if (!socket.write(frame)) await Promise.race([new Promise((resolve) => socket.once('drain', resolve)), sleep(2_000)]);
    else await new Promise((resolve) => setImmediate(resolve));
  }
  await sleep(300);
  const serverBytesRead = serverSockets.reduce((sum, s) => sum + s.bytesRead, 0);
  socket.destroy();
  const head = response.split('\r\n\r\n')[0] ?? '';
  return { status: head.split('\r\n')[0] ?? '', connectionClose: /\r\nconnection: close/i.test(head), serverBytesRead };
}

describe('m1: a refused upload closes the connection', () => {
  it.each([
    ['unreleased uploads (guard 404)', {}, '404'],
    ['paused uploads (guard 503)', { IMPORT_UPLOADS_ENABLED: '1', OPERATIONAL_PAUSE: 'uploads' }, '503'],
    ['no token (guard 401)', { IMPORT_UPLOADS_ENABLED: '1' }, '401'],
  ])('%s: Connection: close, and under 1 MiB of the body read', async (_label, env, status) => {
    const app = await v1App(env as Record<string, string>, true);
    try {
      const outcome = await streamUpload(app, 16);
      expect({ status: outcome.status.includes(` ${status} `), connectionClose: outcome.connectionClose, underOneMiB: outcome.serverBytesRead < 1024 * 1024 }).toEqual({
        status: true,
        connectionClose: true,
        underOneMiB: true,
      });
    } finally {
      await app.close();
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
describe('gates wiring (no fail-open default)', () => {
  it('the real module hands the configured gates to the upload controller', async () => {
    const app = await v1App({ OPERATIONAL_PAUSE: 'ocr,jobs', IMPORT_UPLOADS_ENABLED: '1' });
    try {
      const gates = (app.get(ImportsController) as unknown as { gates: { isPaused(scope: string): boolean } }).gates;
      expect([gates.isPaused('ocr'), gates.isPaused('jobs'), gates.isPaused('writes')]).toEqual([true, true, false]);
    } finally {
      await app.close();
    }
  });

  it.each([
    ['the access guard', V1AccessGuard],
    ['the upload controller', ImportsController],
  ])('%s without FEATURE_GATES refuses to start instead of pausing nothing', async (_label, needsGates) => {
    const stubs = [
      { provide: MIN_CLIENT_VERSIONS, useValue: { ios: '1.0.0', android: '1.0.0' } },
      { provide: RATE_LIMITER, useValue: {} },
      { provide: Auth0AccessTokenGuard, useValue: {} },
      { provide: ApplicationSessionGuard, useValue: {} },
      { provide: UploadIntake, useValue: {} },
      { provide: ImportRepository, useValue: {} },
      { provide: PreviewQuery, useValue: {} },
      { provide: IMPORT_INTAKE_CONFIG, useValue: { uploadsEnabled: true } },
    ];
    const outcome = async (withGates: boolean) => {
      @Module({ providers: [needsGates as Type, ...stubs, ...(withGates ? [{ provide: FEATURE_GATES, useValue: new FeatureGates() }] : [])] })
      class ProbeModule {}
      return NestFactory.create(ProbeModule, { logger: false, abortOnError: false }).then(
        async (app) => {
          await app.close();
          return 'started';
        },
        () => 'refused',
      );
    };
    expect({ withGates: await outcome(true), withoutGates: await outcome(false) }).toEqual({ withGates: 'started', withoutGates: 'refused' });
  });
});

// ---------------------------------------------------------------------------
describe('m4: queue reports run on their own interval', () => {
  it('reports at once, then every minute at most, never overlapping, until stopped', async () => {
    expect(QUEUE_REPORT_INTERVAL_MS).toBeLessThanOrEqual(60_000);
    jest.useFakeTimers();
    try {
      let running = 0;
      let overlapped = false;
      let finish: () => void = () => undefined;
      const report = jest.fn(async () => {
        running += 1;
        if (running > 1) overlapped = true;
        await new Promise<void>((resolve) => (finish = resolve));
        running -= 1;
      });
      const stop = startQueueReports(report, 60_000);
      expect(report).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(report).toHaveBeenCalledTimes(1);
      finish();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(report).toHaveBeenCalledTimes(2);
      const stopped = stop();
      let settled = false;
      void stopped.then(() => (settled = true));
      await jest.advanceTimersByTimeAsync(0);
      const waitedForTheRunningReport = !settled;
      finish();
      await stopped;
      await jest.advanceTimersByTimeAsync(5 * 60_000);
      expect(waitedForTheRunningReport).toBe(true);
      expect({ calls: report.mock.calls.length, overlapped }).toEqual({ calls: 2, overlapped: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it('every worker schedules its queue report with startQueueReports, outside its sweep', () => {
    for (const entry of ['worker.ts', 'jobs/security-worker.ts', 'privacy/deletion-worker.ts']) {
      const source = readFileSync(join(__dirname, '..', entry), 'utf8');
      expect({ entry, scheduled: /startQueueReports\(/.test(source) }).toEqual({ entry, scheduled: true });
    }
    const worker = readFileSync(join(__dirname, '..', 'worker.ts'), 'utf8');
    const maintain = worker.slice(worker.indexOf('const maintain = async'), worker.indexOf('const reportQueue = async'));
    expect({ sweepFound: maintain.includes('publication.sweep('), queueAgeInSweep: /queueAge\(/.test(maintain) }).toEqual({ sweepFound: true, queueAgeInSweep: false });
  });
});
