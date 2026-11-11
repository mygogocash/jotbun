// Local edge stack: `npm run dev:edge` from the repository root.
//   1. writes the Worker's local settings to apps/edge/.dev.vars (ignored by
//      git): a fresh command-digest key each run unless one is given, and
//      Bun's AI help only with a key you provide;
//   2. runs `vite dev` for the one Worker (C1) on http://127.0.0.1:8092: the
//      TanStack Start pages, Better Auth at /api/auth/*, and every /v1 route on
//      the UserVault, with its Workflows and its parse queue. The parser
//      container stays off (`dev.enable_containers` in wrangler.jsonc), so a
//      statement parse asks to be retried.
// No database runs here: the PostgreSQL edge retired at C1 (1B-T13). Until a
// token issuer is configured (AUTH_JWKS_URL, or Better Auth's own keys from
// 1C), token-checked routes fail closed with 503.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const edge = fileURLToPath(new URL('../', import.meta.url));

try {
  const env = process.env;
  const vars = {
    JOTBUN_ENV: 'local',
    COMMAND_DIGEST_KEY: env.COMMAND_DIGEST_KEY ?? randomBytes(32).toString('base64url'),
    MIN_CLIENT_VERSION_IOS: env.MIN_CLIENT_VERSION_IOS ?? '0.0.0',
    MIN_CLIENT_VERSION_ANDROID: env.MIN_CLIENT_VERSION_ANDROID ?? '0.0.0',
    GOGOCASH_BRIDGE_ENABLED: env.GOGOCASH_BRIDGE_ENABLED ?? '1',
    // Bun's AI help runs only with a key you provide; without it every AI route uses its fallback.
    ...(env.ANTHROPIC_API_KEY ? { AI_ENABLED: 'true', ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY } : {}),
  };
  writeFileSync(`${edge}.dev.vars`, Object.entries(vars).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  const child = spawn('npx', ['vite', 'dev', '--port', '8092', '--strictPort', '--host', '127.0.0.1'], {
    cwd: edge,
    stdio: 'inherit',
    env: process.env,
  });
  const stop = () => child.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => { process.exitCode = code ?? 0; });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local edge startup failed.');
  process.exitCode = 1;
}
