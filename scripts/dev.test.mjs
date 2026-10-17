import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

async function runStartup({ port = '27017', cancel = true } = {}) {
  const handlers = {};
  const started = [];
  let readinessChecks = 0;
  const fakeProcess = { env: {}, execPath: process.execPath, on: (name, handler) => { handlers[name] = handler; } };
  const context = createContext({
    URL, process: fakeProcess, console: { error: () => undefined },
    setTimeout: callback => { if (cancel) handlers.SIGINT(); callback(); },
  });
  const url = new URL('./dev.mjs', import.meta.url);
  const module = new SourceTextModule(await readFile(url, 'utf8'), { context, initializeImportMeta: meta => { meta.url = url.href; } });
  await module.link(async name => {
    let values;
    if (name === 'node:crypto') values = { randomBytes: () => ({ toString: () => 'synthetic-test-only' }) };
    if (name === 'node:url') values = { fileURLToPath: url => url.pathname };
    if (name === 'node:child_process') values = {
      spawn: (_command, args) => { started.push(args); return { on() {}, kill() {} }; },
      spawnSync: (command, args) => {
        if (command !== 'docker') return { status: 0 };
        if (args[0] === 'container') return { status: 0, stdout: 'gogospend-mongo-local' };
        if (args[0] === 'inspect') return { status: 0, stdout: args[2].includes('Labels') ? 'gogospend' : args[2].includes('json') ? JSON.stringify({'27017/tcp': [{HostIp: '127.0.0.1', HostPort: port}]}) : '127.0.0.1' };
        if (args[0] === 'exec') return { status: ++readinessChecks === 1 ? 2 : 0 };
        return { status: 0, stdout: 'ready' };
      },
    };
    assert.ok(values, `Unexpected platform dependency: ${name}`);
    const dependency = new SyntheticModule(Object.keys(values), function() { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
    return dependency;
  });
  await module.evaluate();
  return { started, readinessChecks, exitCode: fakeProcess.exitCode };
}

test('cancelling database readiness never starts API or Expo afterward', async () => {
  const { started, exitCode } = await runStartup();
  assert.deepEqual(started, []);
  assert.equal(exitCode, 0);
});

test('a container on a different host port is rejected before accessing any database', async () => {
  const { started, readinessChecks, exitCode } = await runStartup({ port: '27018', cancel: false });
  assert.equal(readinessChecks, 0);
  assert.deepEqual(started, []);
  assert.equal(exitCode, 1);
});
