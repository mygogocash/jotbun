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
// 4. Legacy code and packages are absent from the image.
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
const LEGACY_PACKAGES = ['mongoose', 'mongodb', '@nestjs/mongoose', 'firebase-admin', '@nestjs/schedule', '@nestjs/swagger', 'exceljs', 'tesseract.js', 'sharp', 'jsqr'];

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

const leaks = (text) => [SECRET, PASSWORD, 'U21va2VTeW50aGV0aWNMb29rdXBLZXkwMTIzNDU2Nzg'].filter((value) => text.includes(value)).length;
const missingModule = (text) => /Cannot find module|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_|ERR_UNKNOWN_FILE_EXTENSION|ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/.test(text);

async function main() {
  const report = { node: process.version, contracts: null, processes: {}, legacy_absent: null, ok: false };
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

  const presentPaths = LEGACY_PATHS.filter((path) => existsSync(join(API, path)));
  const presentPackages = LEGACY_PACKAGES.filter((name) => {
    try {
      require.resolve(name, { paths: [API] });
      return true;
    } catch {
      return false;
    }
  });
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
