// P6b review (M5): the CI workflow runs every command of the local full gate
// with the same settings (GOGOSPEND_OPS_REQUIRE_DB=1 makes the ops suite's
// database rehearsal a failure instead of a skip), pins every action by
// commit, holds no secret and only reads the repository. It reads the YAML
// structurally (no YAML library: no new dependency) and the local gate from
// docs/implementation/handover.md ("Full gate").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(`${ROOT}.github/workflows/backend.yml`, 'utf8');
const handover = readFileSync(`${ROOT}docs/implementation/handover.md`, 'utf8');

/** `{ job, run, env }` for every step with a `run:`, env merged from workflow, job and step. */
export function workflowRuns(text) {
  const lines = text.split('\n');
  const runs = [];
  const workflowEnv = {};
  const jobEnv = {};
  let job = null;
  let step = null;
  let block = null;
  let jobEnvOpen = false;
  const indentOf = (line) => line.length - line.trimStart().length;
  const keyValue = (line) => {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim().replace(/^- /, ''));
    return match ? [match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')] : null;
  };
  const finish = () => {
    if (step?.run) runs.push({ job, run: step.run, env: { ...workflowEnv, ...(jobEnv[job] ?? {}), ...step.env } });
    step = null;
  };
  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const indent = indentOf(line);
    if (indent === 0) {
      finish();
      block = line.startsWith('env:') ? 'workflow-env' : line.startsWith('jobs:') ? 'jobs' : null;
      continue;
    }
    if (block === 'workflow-env' && indent === 2) {
      const [key, value] = keyValue(line) ?? [];
      if (key) workflowEnv[key] = value;
      continue;
    }
    if (block !== 'jobs') continue;
    if (indent === 2) {
      finish();
      job = line.trim().replace(/:$/, '');
      jobEnvOpen = false;
      continue;
    }
    if (indent === 4) {
      finish();
      jobEnvOpen = line.trim() === 'env:';
      if (jobEnvOpen) jobEnv[job] = jobEnv[job] ?? {};
      continue;
    }
    if (jobEnvOpen && indent === 6) {
      const [key, value] = keyValue(line) ?? [];
      if (key) jobEnv[job][key] = value;
      continue;
    }
    if (indent === 6 && line.trimStart().startsWith('- ')) {
      finish();
      step = { run: null, env: {}, inEnv: false };
      const [key, value] = keyValue(line) ?? [];
      if (key === 'run') step.run = value;
      continue;
    }
    if (step && indent === 8) {
      const [key, value] = keyValue(line) ?? [];
      step.inEnv = key === 'env';
      if (key === 'run') step.run = value;
      continue;
    }
    if (step?.inEnv && indent === 10) {
      const [key, value] = keyValue(line) ?? [];
      if (key) step.env[key] = value;
    }
  }
  finish();
  return runs;
}

/** The local full gate: each line of the handover's fenced block, as `{ run, env }`. */
export function localGate(text) {
  const block = /\*\*Full gate\*\*[^\n]*\n```bash\n([\s\S]*?)\n```/.exec(text)?.[1] ?? '';
  return block.split('\n').filter(Boolean).map((line) => {
    const env = {};
    let rest = line.trim();
    for (let match = /^([A-Z][A-Z0-9_]*)=(\S+)\s+/.exec(rest); match; match = /^([A-Z][A-Z0-9_]*)=(\S+)\s+/.exec(rest)) {
      env[match[1]] = match[2];
      rest = rest.slice(match[0].length);
    }
    return { run: rest, env };
  });
}

test('the workflow parser sees steps, their settings and the jobs they run in', () => {
  const runs = workflowRuns(workflow);
  assert.ok(runs.length >= 14, `found ${runs.length} run steps`);
  assert.deepEqual(new Set(runs.map((entry) => entry.job)), new Set(['gate', 'database', 'image']));
  assert.ok(runs.every((entry) => entry.env.NODE_VERSION === '26.9.0'));
});

// Owner decision §7.1 (19 October 2026): the worker runs Node 26, where the
// permission model denies the parser child the network, so imports can read
// files instead of failing closed. CI, the release image and local
// development run the same Node.
test('CI, the release image and .nvmrc run the same Node, 26 or later, with the image pinned by digest', () => {
  const dockerfile = readFileSync(`${ROOT}apps/api/Dockerfile`, 'utf8');
  const image = /^ARG NODE_IMAGE=node:(\d+)\.(\d+)\.(\d+)-bookworm-slim@sha256:([0-9a-f]{64})$/m.exec(dockerfile);
  assert.ok(image, 'the image names an exact Node version and its digest');
  const imageVersion = image.slice(1, 4).join('.');
  const ciVersion = workflowRuns(workflow)[0].env.NODE_VERSION;
  assert.equal(imageVersion, ciVersion);
  assert.ok(Number(image[1]) >= 26, `Node ${imageVersion} is older than the owner's 26`);
  assert.equal(readFileSync(`${ROOT}.nvmrc`, 'utf8').trim(), image[1]);
});

test('every local gate command runs in CI with the same settings', () => {
  const gate = localGate(handover);
  assert.ok(gate.length >= 12, `found ${gate.length} local gate commands`);
  const runs = workflowRuns(workflow);
  const missing = gate.filter(({ run, env }) => {
    const command = run === 'git diff --check' ? 'git diff --check' : run;
    return !runs.some((entry) => (entry.run === command || (command === 'git diff --check' && entry.run.startsWith('git diff --check '))) && Object.entries(env).every(([key, value]) => entry.env[key] === value));
  });
  assert.deepEqual(missing, []);
});

// Phase 1A Task 10: the edge steps run in one job, the database job, in the
// local gate's order: the UserVault suites in workerd after the unit tests and
// before the build, and the PostgreSQL suites last, on the built Workers.
test('the edge steps run in the database job in order, the workers suite between the unit tests and the build', () => {
  const edge = workflowRuns(workflow)
    .filter((entry) => /^npm run [a-z]+:edge(:[a-z]+)?$/.test(entry.run))
    .map((entry) => `${entry.job}: ${entry.run}`);
  assert.deepEqual(edge, [
    'database: npm run install:edge',
    'database: npm run typecheck:edge',
    'database: npm run test:edge',
    'database: npm run test:edge:workers',
    'database: npm run build:edge',
    'database: npm run test:edge:db',
  ]);
});

test('the ops suite in CI fails, not skips, when its database is unreachable', () => {
  const ops = workflowRuns(workflow).filter((entry) => entry.run === 'npm run test:ops');
  assert.deepEqual(ops.map((entry) => entry.env.GOGOSPEND_OPS_REQUIRE_DB), ['1']);
});

test('read-only, no secrets, every action pinned by commit', () => {
  assert.match(workflow, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(workflow, /secrets\./);
  const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  for (const action of uses) assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, action);
  // The image's Node version is checked against CI's in the Node 26 test above.
});
