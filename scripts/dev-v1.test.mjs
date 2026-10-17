import assert from 'node:assert/strict';
import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const ours = { app: 'gogospend', role: 'postgres-v1' };
const loopback = { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }] };
const DESTRUCTIVE = /^(rm|down|prune|kill)$|^volume$/;

// Runs dev-v1.mjs with fake docker/npm/node processes and records every call.
async function runLauncher({ mode, container = { labels: ours, bindings: loopback }, volume = ours } = {}) {
  const calls = [];
  const started = [];
  const fakeProcess = { argv: ['node', 'dev-v1.mjs', ...(mode ? [mode] : [])], env: {}, execPath: '/node', on() {} };
  const context = createContext({ URL, process: fakeProcess, console: { error: () => undefined, log: () => undefined } });
  const url = new URL('./dev-v1.mjs', import.meta.url);
  const module = new SourceTextModule(await readFile(url, 'utf8'), { context, initializeImportMeta: (meta) => { meta.url = url.href; } });
  await module.link(async (name) => {
    let values;
    // Deterministic bytes: the password is Buffer.alloc(24, 7) in base64url.
    if (name === 'node:crypto') values = { randomBytes: (size) => Buffer.alloc(size, 7), createHash, createHmac, pbkdf2Sync };
    if (name === 'node:url') values = { fileURLToPath: (href) => href.pathname };
    if (name === 'node:child_process') values = {
      spawn: (command, args, options) => { started.push({ command, args, env: options.env }); return { on() {}, kill() {} }; },
      spawnSync: (command, args, options) => {
        calls.push({ command, args, input: options.input, env: options.env });
        const json = (value) => (value === null ? { status: 1, stdout: '' } : { status: 0, stdout: JSON.stringify(value) });
        if (command === 'docker' && args[0] === 'inspect' && args.at(-2).includes('Labels')) return json(container && container.labels);
        if (command === 'docker' && args[0] === 'inspect' && args.at(-2).includes('PortBindings')) return json(container && container.bindings);
        if (command === 'docker' && args[0] === 'volume') return json(volume);
        return { status: 0, stdout: 'ok' };
      },
    };
    assert.ok(values, `Unexpected platform dependency: ${name}`);
    return new SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  const composeUp = calls.some((call) => call.args.includes('compose') && call.args.includes('up'));
  return { calls, started, composeUp, exitCode: fakeProcess.exitCode };
}

function assertNothingTouchedMongoOrDestroyed(calls, started) {
  const everything = JSON.stringify([calls.map((call) => call.args), started.map((child) => child.args)]);
  assert.doesNotMatch(everything, /mongo/i);
  for (const call of calls.filter((call) => call.command === 'docker')) {
    assert.ok(!(call.args[0] === 'volume' && call.args[1] !== 'inspect'), `unexpected volume command ${call.args.join(' ')}`);
    assert.ok(!call.args.some((arg, index) => index < 6 && DESTRUCTIVE.test(arg) && arg !== 'volume'), `destructive docker command ${call.args.join(' ')}`);
  }
}

test('a v1-named container on another port stops startup before compose or any database access', async () => {
  const { calls, started, composeUp, exitCode } = await runLauncher({ container: { labels: ours, bindings: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55432' }] } } });
  assert.equal(exitCode, 1);
  assert.equal(composeUp, false);
  assert.deepEqual(started, []);
  assertNothingTouchedMongoOrDestroyed(calls, started);
});

test('a container with the v1 name but not our labels is left untouched', async () => {
  const { composeUp, exitCode, calls, started } = await runLauncher({ container: { labels: { app: 'someone-else' }, bindings: loopback } });
  assert.equal(exitCode, 1);
  assert.equal(composeUp, false);
  assertNothingTouchedMongoOrDestroyed(calls, started);
});

test('an existing volume that this launcher did not create is left untouched', async () => {
  const { composeUp, exitCode, calls, started } = await runLauncher({ container: null, volume: {} });
  assert.equal(exitCode, 1);
  assert.equal(composeUp, false);
  assertNothingTouchedMongoOrDestroyed(calls, started);
});

test('db-up only ensures the database and starts nothing else', async () => {
  const { calls, started, composeUp, exitCode } = await runLauncher({ mode: 'db-up', container: null, volume: null });
  assert.equal(exitCode, undefined);
  assert.equal(composeUp, true);
  assert.deepEqual(started, []);
  assert.equal(calls.some((call) => call.command === 'npm'), false);
  assertNothingTouchedMongoOrDestroyed(calls, started);
});

test('start migrates with the admin URL, sets a fresh least-privilege login from a SCRAM verifier and starts only the v1 API', async () => {
  const password = Buffer.alloc(24, 7).toString('base64url');
  const { calls, started, exitCode } = await runLauncher();
  assert.equal(exitCode, undefined);
  const migrate = calls.find((call) => call.args[0] === 'apps/api/dist/database/migrate-cli.js');
  assert.match(migrate.env.DATABASE_DIRECT_URL, /@127\.0\.0\.1:55432\/gogospend_v1$/);
  const psql = calls.find((call) => call.args.includes('psql'));
  // Only the SCRAM verifier reaches the server, so no log can contain the password.
  assert.match(psql.input, /SCRAM-SHA-256\$4096:/);
  assert.match(psql.input, /NOSUPERUSER NOBYPASSRLS/);
  assert.doesNotMatch(`${psql.input} ${psql.args.join(' ')}`, new RegExp(password));
  assert.equal(started.length, 1);
  assert.deepEqual([...started[0].args], ['apps/api/dist/v1/main.js']);
  assert.equal(started[0].env.DATABASE_URL, `postgres://gogospend_dev_api:${password}@127.0.0.1:55432/gogospend_v1`);
  assert.equal(started[0].env.HOST, '127.0.0.1');
  // Without a configured tenant, token-protected routes fail closed.
  assert.equal(started[0].env.AUTH0_ISSUER, 'https://auth.gogospend.invalid/');
  assert.equal(started[0].env.TRUST_PROXY_HOPS, '0');
  assert.ok(started[0].env.RATE_LIMIT_KEY.length >= 32);
  assertNothingTouchedMongoOrDestroyed(calls, started);
});
