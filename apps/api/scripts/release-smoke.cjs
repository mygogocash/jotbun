// P6b release smoke, run inside the built image (never against a real
// service):
//
//   docker run --rm gogospend-local node scripts/release-smoke.cjs
//
// 1. The image loads @gogospend/contracts' runtime exports (TypeScript source
//    through Node's type stripping, the master contracts rule).
// 2. Each API and worker process - the v1 API, the job, security and
//    deletion workers - requests @gogospend/contracts while its module graph
//    loads, and receives the runtime exports. (The migration CLI does not use
//    the contracts; it is started below like the others.)
// 3. Each process command starts with production settings made of synthetic
//    values and fails closed at its first database connection (a closed
//    loopback port): its whole module graph and configuration loaded, no
//    module is missing, and no synthetic credential appears in its output.
// 4. P2b's parser children run inside the image with their real flags
//    (`--permission`, scrubbed environment). On Node ≥25 a synthetic CSV and
//    a 1x1 PNG both parse (children staged, sharp under the permission model).
//    On Node 24 (the pinned image today) `--permission` does not deny
//    sockets, so both answers are `sandbox_unsupported` — fail closed, and
//    proof the children and probe still load.
// 5. The v1 HTTP stack serves inside the image: the real V1AppModule (the
//    startup login check needs a database, so the module is created
//    directly) answers `GET /live` 200 and `GET /ready` 503 (no database, no
//    receipts) over loopback, and stops with the graceful HTTP stop.
// 6. Legacy code and packages are absent from the image.
// Prints a JSON report; exit 0 only when every check passes.
'use strict';

const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const API = join(__dirname, '..');
const ENTRIES = {
  'v1': { file: 'dist/v1/main.js', args: [], contracts: true },
  'job worker': { file: 'dist/worker.js', args: [], contracts: true },
  'security worker': { file: 'dist/jobs/security-worker.js', args: [], contracts: true },
  'deletion worker': { file: 'dist/privacy/deletion-worker.js', args: ['--registry-fd', '3'], contracts: true },
  'migration': { file: 'dist/database/migrate-cli.js', args: [], contracts: false },
};
const LEGACY_PATHS = ['dist/main.js', 'dist/app.module.js', 'dist/spend', 'dist/user', 'dist/offer', 'dist/legal-documents', 'dist/product-access', 'dist/analytics', 'dist/auth/firebase-auth.guard.js', 'dist/testing', 'src'];
const LEGACY_PACKAGES = ['mongoose', 'mongodb', '@nestjs/mongoose', 'firebase-admin', '@nestjs/schedule', '@nestjs/swagger', '@nestjs/jwt', 'class-validator', 'class-transformer', 'exceljs', 'tesseract.js', 'jsqr'];
// Synthetic inputs for the parser children: one CSV row and a 1x1 PNG.
const PARSER_CSV = 'date,amount,type\n2024-01-02,12.50,expense\n';
const PARSER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Synthetic values shaped like secrets. None may ever be printed.
const SECRET = 'SmokeSynthetic-Secret-0123456789abcdefABCDEF';
const PASSWORD = 'SmokeSynthetic-Pa55word-0123456789';
const closedDb = (login) => `postgres://${login}:${PASSWORD}@127.0.0.1:9/gogospend_smoke`;
const SETTINGS = {
  PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: '18091',
  TRUST_PROXY_HOPS: '1',
  DATABASE_URL: closedDb('smoke_login'),
  LEASED_READ_DATABASE_URL: closedDb('smoke_leased_read'),
  DATABASE_DIRECT_URL: closedDb('smoke_migrator'),
  AUTH0_ISSUER: 'https://smoke-tenant.invalid/',
  AUTH0_AUDIENCE: 'https://api.smoke.invalid',
  AUTH0_ALLOWED_CLIENT_IDS: 'smoke-native-client',
  AUTH0_MAINTENANCE_CLIENT_ID: 'smoke-maintenance-client',
  AUTH0_MAINTENANCE_CLIENT_SECRET: SECRET,
  RATE_LIMIT_KEY: `${SECRET}-rate`,
  COMMAND_DIGEST_KEY: `${SECRET}-digest`,
  MIN_CLIENT_VERSION_IOS: '1.0.0',
  MIN_CLIENT_VERSION_ANDROID: '1.0.0',
  R2_ENDPOINT: 'https://smoke-account.r2.invalid',
  R2_BUCKET: 'gogospend-smoke-release',
  R2_ACCESS_KEY_ID: 'smoke-access-key-id',
  R2_SECRET_ACCESS_KEY: SECRET,
  SHUTDOWN_TIMEOUT_SECONDS: '5',
};
const REGISTRY = JSON.stringify({ database_url: closedDb('smoke_registry'), lookup_key: 'U21va2VTeW50aGV0aWNMb29rdXBLZXkwMTIzNDU2Nzg' });

function run(args, { fd3 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: API, env: SETTINGS, stdio: ['ignore', 'pipe', 'pipe', fd3 === undefined ? 'ignore' : 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    if (fd3 !== undefined) child.stdio[3].end(fd3);
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });
}

// Loads an entry's module graph (its main() is guarded by require.main) and
// reports whether it requested @gogospend/contracts and got runtime exports.
const PROBE = `
const Module = require('node:module');
const load = Module._load;
const seen = [];
Module._load = function (request) {
  const result = load.apply(this, arguments);
  if (request === '@gogospend/contracts') seen.push(typeof result.isUuid === 'function' && typeof result.parseMinor === 'function' && Array.isArray(result.API_ERROR_CODES));
  return result;
};
require(process.argv[1]);
process.stdout.write('\\nPROBE_RESULT ' + JSON.stringify({ requests: seen.length, runtime_exports: seen.length > 0 && seen.every(Boolean) }) + '\\n');
`;

// Serves the real v1 module on loopback and reports the health answers.
const HTTP_PROBE = `
const { NestFactory } = require('@nestjs/core');
const { V1AppModule, configureV1App } = require('./dist/v1/v1-app.module.js');
const { OperationalLogger } = require('./dist/common/operational-metrics.js');
const { applyHttpTimeouts, gracefulHttpStop, trackHttpDrain } = require('./dist/common/process-lifecycle.js');
(async () => {
  const app = await NestFactory.create(V1AppModule, { bodyParser: false, logger: new OperationalLogger(), abortOnError: false });
  configureV1App(app);
  const server = app.getHttpServer();
  applyHttpTimeouts(server);
  const drain = trackHttpDrain(server);
  await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + server.address().port;
  const live = await fetch(base + '/live');
  const ready = await fetch(base + '/ready');
  const result = { live: live.status, live_body: await live.json(), ready: ready.status, ready_code: (await ready.json()).code };
  const started = Date.now();
  await gracefulHttpStop({ markDraining: () => undefined, delayMs: 0, drain, closeApp: () => app.close() });
  result.stopped_ms = Date.now() - started;
  process.stdout.write('\\nHTTP_RESULT ' + JSON.stringify(result) + '\\n');
})().catch((error) => {
  process.stdout.write('\\nHTTP_RESULT ' + JSON.stringify({ error: error instanceof Error ? error.name : 'unknown' }) + '\\n');
  process.exitCode = 1;
});
`;

const leaks = (text) => [SECRET, PASSWORD, 'U21va2VTeW50aGV0aWNMb29rdXBLZXkwMTIzNDU2Nzg'].filter((value) => text.includes(value)).length;
const missingModule = (text) => /Cannot find module|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_|ERR_UNKNOWN_FILE_EXTENSION|ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/.test(text);

async function main() {
  const report = { node: process.version, contracts: null, processes: {}, http: null, parsers: null, legacy_absent: null, ok: false };
  const failures = [];

  const contracts = require(require.resolve('@gogospend/contracts', { paths: [API] }));
  report.contracts = {
    parse_minor_6500: String(contracts.parseMinor('6500', { max: contracts.MINOR_AMOUNT_MAX })),
    error_codes: contracts.API_ERROR_CODES.length,
    pause_codes: ['WRITES_PAUSED', 'IMPORTS_PAUSED', 'OCR_PAUSED', 'UPLOADS_PAUSED', 'JOBS_PAUSED'].every((code) => contracts.API_ERROR_CODES.includes(code)),
  };
  if (report.contracts.parse_minor_6500 !== '6500' || !report.contracts.pause_codes) failures.push('contracts');

  for (const [name, entry] of Object.entries(ENTRIES)) {
    const probe = await run(['-e', PROBE, join(API, entry.file)]);
    let graph = { requests: 0, runtime_exports: false };
    const marker = probe.output.split('\n').find((line) => line.startsWith('PROBE_RESULT '));
    try {
      if (marker) graph = JSON.parse(marker.slice('PROBE_RESULT '.length));
    } catch {
      // Stays "not loaded".
    }
    const started = await run([entry.file, ...entry.args], name === 'deletion worker' ? { fd3: REGISTRY } : {});
    const failureLine = started.output.split('\n').find((line) => line.startsWith(`${name} startup failed:`)) ?? '';
    const result = {
      loads_contracts: entry.contracts ? graph.runtime_exports : 'not used',
      contracts_requests: graph.requests,
      exit_code: started.code,
      fails_closed_at_database: started.code === 1 && failureLine === `${name} startup failed: Error ECONNREFUSED`,
      failure_line: failureLine,
      missing_module: missingModule(probe.output + started.output),
      secret_values_printed: leaks(probe.output + started.output),
    };
    report.processes[name] = result;
    if ((entry.contracts && !graph.runtime_exports) || !result.fails_closed_at_database || result.missing_module || result.secret_values_printed > 0) failures.push(name);
  }

  const http = await run(['-e', HTTP_PROBE]);
  const httpMarker = http.output.split('\n').find((line) => line.startsWith('HTTP_RESULT '));
  try {
    report.http = httpMarker ? JSON.parse(httpMarker.slice('HTTP_RESULT '.length)) : { error: 'no result' };
  } catch {
    report.http = { error: 'unreadable result' };
  }
  report.http.secret_values_printed = leaks(http.output);
  report.http.missing_module = missingModule(http.output);
  if (report.http.live !== 200 || report.http.live_body?.status !== 'live' || report.http.ready !== 503 || report.http.ready_code !== 'SERVICE_UNAVAILABLE'
      || !(report.http.stopped_ms < 5_000) || report.http.secret_values_printed > 0 || report.http.missing_module) {
    failures.push('http');
  }

  const presentPaths = LEGACY_PATHS.filter((path) => existsSync(join(API, path)));
  const presentPackages = LEGACY_PACKAGES.filter((name) => {
    try {
      require.resolve(name, { paths: [API] });
      return true;
    } catch {
      return false;
    }
  });
  const { ParserRunner } = require(join(API, 'dist/imports/parser-runner.js'));
  const runner = new ParserRunner();
  const parsed = async (format, bytes) => {
    const outcome = await runner.run({ format, bytes, today: '2026-10-18' });
    return outcome.kind === 'result' ? (outcome.result.ok ? 'parsed' : 'refused') : outcome.kind;
  };
  report.parsers = { csv: await parsed('csv', Buffer.from(PARSER_CSV)), png: await parsed('png', Buffer.from(PARSER_PNG, 'base64')) };
  // Node's permission model denies the network only from 25 on. Below that the
  // runner must refuse every parse (B1); at 25+ the synthetic files must parse.
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  const expectParsers = major >= 25 ? 'parsed' : 'sandbox_unsupported';
  report.parsers.expected = expectParsers;
  report.parsers.node_major = major;
  if (report.parsers.csv !== expectParsers || report.parsers.png !== expectParsers) failures.push('parsers');

  report.legacy_absent = { paths_present: presentPaths, packages_present: presentPackages };
  if (presentPaths.length > 0 || presentPackages.length > 0) failures.push('legacy');

  report.ok = failures.length === 0;
  if (!report.ok) report.failures = failures;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  // The error class only: never its text.
  process.stdout.write(`${JSON.stringify({ ok: false, failures: ['smoke'], error: error instanceof Error ? error.name : 'unknown' })}\n`);
  process.exitCode = 1;
});
