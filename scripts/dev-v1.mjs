// Local v1 stack: `npm run dev:v1` (database, migrations, v1 API) or
// `npm run db:v1:up` (database only, used by `npm run test:db`).
// It only ever creates or starts its own loopback PostgreSQL container and
// volume. Anything unexpected under those names stops startup untouched, and
// the legacy Mongo container/volume are never referenced.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const container = 'gogospend-postgres-v1-local';
const volume = 'gogospend-postgres-v1-local-data';
const compose = ['compose', '-f', 'compose.postgres.yml', '-p', 'gogospend-v1'];
const adminUrl = 'postgres://gogospend_local_admin:gogospend-local-only@127.0.0.1:55432/gogospend_v1';
const devLogin = 'gogospend_dev_api';
const mode = process.argv[2] ?? 'start';
const children = new Set();

function run(command, args, { capture = false, input, env } = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', input, env: env && { ...process.env, ...env },
    stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
  });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args[0]} failed.`);
  return result.stdout?.trim();
}
// Returns null when the inspected object does not exist.
function inspect(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  return result.status === 0 ? JSON.parse(result.stdout) : null;
}
let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function start(command, args, env) {
  if (stopping) return;
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  children.add(child);
  child.on('error', () => { console.error(`${command} could not start.`); shutdown(1); });
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) shutdown(code ?? (signal ? 1 : 0));
  });
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// PostgreSQL's SCRAM-SHA-256 password verifier (RFC 5802/7677). Sending this
// instead of the password means no server log or error echo can contain it.
function scramVerifier(password) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const storedKey = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

function ensureDatabase() {
  run('docker', ['info', '--format', '{{.ServerVersion}}'], { capture: true });
  const labels = inspect(['inspect', '--type', 'container', '--format', '{{json .Config.Labels}}', container]);
  if (labels) {
    const bindings = inspect(['inspect', '--type', 'container', '--format', '{{json .HostConfig.PortBindings}}', container]);
    const postgres = bindings?.['5432/tcp'];
    const isolated = Object.keys(bindings ?? {}).length === 1 && postgres?.length === 1
      && postgres[0].HostIp === '127.0.0.1' && postgres[0].HostPort === '55432';
    if (labels?.app !== 'gogospend' || labels?.role !== 'postgres-v1' || !isolated) {
      throw new Error(`Container ${container} is not the isolated GoGoSpend v1 database on 127.0.0.1:55432; left untouched.`);
    }
  }
  const volumeLabels = inspect(['volume', 'inspect', '--format', '{{json .Labels}}', volume]);
  if (volumeLabels !== null && (volumeLabels?.app !== 'gogospend' || volumeLabels?.role !== 'postgres-v1')) {
    throw new Error(`Volume ${volume} was not created by this launcher; left untouched.`);
  }
  run('docker', [...compose, 'up', '-d', '--wait', 'postgres']);
}

try {
  if (mode !== 'start' && mode !== 'db-up') throw new Error('Usage: dev-v1.mjs [start|db-up]');
  ensureDatabase();
  if (mode === 'start' && !stopping) {
    run('npm', ['run', 'build', '-w', 'gogospend-api']);
    run(process.execPath, ['apps/api/dist/database/migrate-cli.js'], { env: { DATABASE_DIRECT_URL: adminUrl } });
    // A fresh random password per start. Only its SCRAM verifier is sent, on
    // stdin, and the login is forced back to least privilege every time.
    const password = randomBytes(24).toString('base64url');
    const attributes = 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION';
    run('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'gogospend_local_admin', '-d', 'gogospend_v1'], {
      input: [
        `SELECT format(CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${devLogin}')`,
        `  THEN 'ALTER ROLE %I ${attributes} PASSWORD %L' ELSE 'CREATE ROLE %I ${attributes} PASSWORD %L' END,`,
        `  '${devLogin}', '${scramVerifier(password)}') \\gexec`,
        `GRANT gogospend_app, gogospend_bootstrap TO ${devLogin};`,
        `GRANT CONNECT ON DATABASE gogospend_v1 TO ${devLogin};`,
        '',
      ].join('\n'),
    });
    // Auth0 settings come from your environment once a non-production tenant
    // exists (E1). Until then these placeholders make every token-protected
    // route fail closed (503), while public routes still work.
    const env = process.env;
    start(process.execPath, ['apps/api/dist/v1/main.js'], {
      NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '8091',
      DATABASE_URL: `postgres://${devLogin}:${password}@127.0.0.1:55432/gogospend_v1`,
      AUTH0_ISSUER: env.AUTH0_ISSUER ?? 'https://auth.gogospend.invalid/',
      AUTH0_AUDIENCE: env.AUTH0_AUDIENCE ?? 'https://api.gogospend.invalid',
      AUTH0_ALLOWED_CLIENT_IDS: env.AUTH0_ALLOWED_CLIENT_IDS ?? 'unconfigured-local-client',
      RATE_LIMIT_KEY: randomBytes(32).toString('base64url'),
      // Set COMMAND_DIGEST_KEY yourself to keep command replays valid across restarts.
      COMMAND_DIGEST_KEY: env.COMMAND_DIGEST_KEY ?? randomBytes(32).toString('base64url'),
      MIN_CLIENT_VERSION_IOS: env.MIN_CLIENT_VERSION_IOS ?? '0.0.0',
      MIN_CLIENT_VERSION_ANDROID: env.MIN_CLIENT_VERSION_ANDROID ?? '0.0.0',
      TRUST_PROXY_HOPS: '0',
    });
  }
} catch (error) {
  if (!stopping) {
    console.error(error instanceof Error ? error.message : 'Local v1 startup failed.');
    shutdown(1);
  }
}
