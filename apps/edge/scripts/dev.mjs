// Local edge stack: `npm run dev:edge` from the repository root.
//   1. the v1 PostgreSQL 17 container (scripts/dev-v1.mjs db-up), migrated;
//   2. least-privilege logins with fresh random passwords (only their SCRAM
//      verifiers are sent, as dev-v1.mjs does): the HTTP Worker's, and the
//      jobs, leased-read, security and erasure-registry logins of the
//      background Workers;
//   3. `vite dev` for the TanStack Start Worker on http://127.0.0.1:8092 and
//      the background Workers beside it, each reaching PostgreSQL through
//      Hyperdrive's local connection strings. Cron Triggers do not fire in
//      `vite dev`; the parser container stays off (wrangler.jobs.jsonc).
// Settings the Worker reads as secrets go to apps/edge/.dev.vars (ignored by
// git). Auth0 stays unconfigured until a tenant exists, so token-protected
// routes fail closed with 503, exactly as `npm run dev:v1` does.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const edge = fileURLToPath(new URL('../', import.meta.url));
const container = 'gogospend-postgres-v1-local';
const adminUrl = 'postgres://gogospend_local_admin:gogospend-local-only@127.0.0.1:55432/gogospend_v1';
// Each login, its roles and the Hyperdrive bindings that use it.
const LOGINS = [
  { login: 'gogospend_edge_dev', roles: ['gogospend_app', 'gogospend_bootstrap'], bindings: ['HYPERDRIVE'] },
  { login: 'gogospend_edge_jobs_dev', roles: ['gogospend_jobs'], bindings: ['HYPERDRIVE_JOBS'] },
  { login: 'gogospend_edge_leased_read_dev', roles: ['gogospend_leased_read'], bindings: ['HYPERDRIVE_LEASED_READ'] },
  { login: 'gogospend_edge_security_dev', roles: ['gogospend_jobs', 'gogospend_security'], bindings: ['HYPERDRIVE_SECURITY', 'HYPERDRIVE_DELETION'] },
  { login: 'gogospend_edge_registry_dev', roles: ['gogospend_erasure_registry'], bindings: ['HYPERDRIVE_ERASURE_REGISTRY'] },
];

function run(command, args, { cwd = root, input, env } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', input, env: env && { ...process.env, ...env }, stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'] });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args[0]} failed.`);
}

function scramVerifier(password) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const storedKey = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

try {
  run(process.execPath, ['scripts/dev-v1.mjs', 'db-up']);
  run('npm', ['run', 'build', '-w', 'gogospend-api']);
  run(process.execPath, ['apps/api/dist/database/migrate-cli.js'], { env: { DATABASE_DIRECT_URL: adminUrl } });
  const attributes = 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION';
  const connections = {};
  const sql = [];
  for (const { login, roles, bindings } of LOGINS) {
    const password = randomBytes(24).toString('base64url');
    sql.push(
      `SELECT format(CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${login}')`,
      `  THEN 'ALTER ROLE %I ${attributes} PASSWORD %L' ELSE 'CREATE ROLE %I ${attributes} PASSWORD %L' END,`,
      `  '${login}', '${scramVerifier(password)}') \\gexec`,
      `GRANT ${roles.join(', ')} TO ${login};`,
      `GRANT CONNECT ON DATABASE gogospend_v1 TO ${login};`,
    );
    for (const binding of bindings) connections[`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${binding}`] = `postgres://${login}:${password}@127.0.0.1:55432/gogospend_v1`;
  }
  run('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'gogospend_local_admin', '-d', 'gogospend_v1'], { input: [...sql, ''].join('\n') });
  const env = process.env;
  const vars = {
    JOTBUN_ENV: 'local',
    AUTH0_ISSUER: env.AUTH0_ISSUER ?? 'https://auth.gogospend.invalid/',
    AUTH0_AUDIENCE: env.AUTH0_AUDIENCE ?? 'https://api.gogospend.invalid',
    AUTH0_ALLOWED_CLIENT_IDS: env.AUTH0_ALLOWED_CLIENT_IDS ?? 'unconfigured-local-client',
    RATE_LIMIT_KEY: randomBytes(32).toString('base64url'),
    COMMAND_DIGEST_KEY: env.COMMAND_DIGEST_KEY ?? randomBytes(32).toString('base64url'),
    MIN_CLIENT_VERSION_IOS: env.MIN_CLIENT_VERSION_IOS ?? '0.0.0',
    MIN_CLIENT_VERSION_ANDROID: env.MIN_CLIENT_VERSION_ANDROID ?? '0.0.0',
    GOGOCASH_BRIDGE_ENABLED: env.GOGOCASH_BRIDGE_ENABLED ?? '1',
    ...(env.LEGACY_V1_ORIGIN ? { LEGACY_V1_ORIGIN: env.LEGACY_V1_ORIGIN } : {}),
    // Bun's AI help runs only with a key you provide; without it every AI route uses its fallback.
    ...(env.ANTHROPIC_API_KEY ? { AI_ENABLED: 'true', ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY } : {}),
    // The deletion Worker's registry lookup key: fresh each run, local only.
    ERASURE_REGISTRY_LOOKUP_KEY: randomBytes(32).toString('base64url'),
  };
  writeFileSync(`${edge}.dev.vars`, Object.entries(vars).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  const child = spawn('npx', ['vite', 'dev', '--port', '8092', '--strictPort', '--host', '127.0.0.1'], {
    cwd: edge,
    stdio: 'inherit',
    env: { ...process.env, ...connections },
  });
  const stop = () => child.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => { process.exitCode = code ?? 0; });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local edge startup failed.');
  process.exitCode = 1;
}
