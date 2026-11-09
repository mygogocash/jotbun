// P6b review (M5): the CI workflow runs every command of the local full gate
// with the same settings (GOGOSPEND_OPS_REQUIRE_DB=1 makes the ops suite's
// database rehearsal a failure instead of a skip), pins every action by
// commit, holds no secret and only reads the repository. It reads the YAML
// structurally (no YAML library: no new dependency) and the local gate from
// docs/implementation/handover.md ("Full gate").
// ci-parallel-jobs (9 November 2026): the jobs run in parallel and the render
// suite is split across four of them, so the cases below also pin which job
// runs each step, check that the split runs every render test exactly once,
// and keep any job or step from being switched off.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
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

/** The local gate's render suite, which CI splits across jobs. */
export const RENDER = 'npm run test:render -w gogospend-app';

/** Whether `file` (relative to apps/app) is there with exactly that spelling, also on a disk that ignores case. */
function appFileExists(file) {
  const path = `${ROOT}apps/app/${file}`;
  return existsSync(path) && readdirSync(dirname(path)).includes(basename(path));
}

/** Test names to try the split's patterns on: both per-section shapes, with ids of every length from 1 to 40, and names that are not section cases. */
export function sampleNames() {
  const names = ['the registry has a section for every component, the mascot and every screen state', 'a deep link opens one section in the theme and locale it names', 'section', 'sections in order', 'section -'];
  for (let length = 1; length <= 40; length += 1) {
    const id = 'abcdefghijklmnopqrstuvwxyz0123456789-'.repeat(2).slice(0, length);
    names.push(`section ${id} renders without errors in light and dark, in en, th and vi`, `section ${id}: every control has a name, nothing hidden takes focus`);
  }
  return names;
}

/**
 * Why CI's split of the render suite would not run every render test exactly once ([] when it does).
 * The steps that run `RENDER -- <args>` must be:
 * - one step with only `--exclude <file>` arguments: every render file but those;
 * - two or more steps that run exactly those files with a name pattern, `<file> ... -t '<pattern>'`,
 *   where the last pattern is the others negated (`^(?!a)(?!b)` after `^a` and `^b`), so every test
 *   matches one of them, and on sample names no test matches two.
 */
export function renderSplitProblems(runs) {
  const problems = [];
  const steps = runs.filter((entry) => entry.run.startsWith(`${RENDER} -- `)).map((entry) => entry.run.slice(`${RENDER} -- `.length));
  const rests = steps.filter((args) => /^--exclude \S+(?: --exclude \S+)*$/.test(args)).map((args) => [...args.matchAll(/--exclude (\S+)/g)].map((match) => match[1]));
  const parts = steps.map((args) => /^((?:\S+\.tsx )+)-t '([^']+)'$/.exec(args)).filter(Boolean).map((match) => ({ files: match[1].trim().split(' '), pattern: match[2] }));
  if (rests.length + parts.length !== steps.length) problems.push(`a render step is neither --exclude <file> ... nor <file> ... -t '<pattern>': ${steps.join(' | ')}`);
  if (rests.length !== 1) return [...problems, `one step must run every render file but the split ones; found ${rests.length}`];
  const [split] = rests;
  for (const file of split) {
    if (!/^src\/\S+\.render\.test\.tsx$/.test(file) || !appFileExists(file)) problems.push(`${file} is not a render test file in apps/app`);
  }
  if (new Set(split).size !== split.length) problems.push(`a file is excluded twice: ${split.join(' ')}`);
  if (parts.length < 2) return [...problems, `the split files need two or more name patterns; found ${parts.length}`];
  const sorted = (files) => [...files].sort().join(' ');
  for (const part of parts) {
    if (sorted(part.files) !== sorted(split)) problems.push(`a part runs ${part.files.join(' ')}, not the files the other step leaves out (${split.join(' ')})`);
  }
  if (!parts.every((part) => part.pattern.startsWith('^'))) problems.push('every name pattern must start with ^');
  const negated = `^${parts.slice(0, -1).map((part) => `(?!${part.pattern.slice(1)})`).join('')}`;
  if (parts.at(-1).pattern !== negated) problems.push(`the last pattern must be the others negated: ${negated}, not ${parts.at(-1).pattern}`);
  // Vitest compiles -t the same way: new RegExp(pattern), no flags.
  const patterns = parts.map((part) => new RegExp(part.pattern));
  const names = sampleNames();
  for (const name of names) {
    const count = patterns.filter((pattern) => pattern.test(name)).length;
    if (count !== 1) problems.push(`"${name}" matches ${count} patterns`);
  }
  for (const pattern of patterns) {
    if (!names.some((name) => pattern.test(name))) problems.push(`${pattern.source} matches no sample name`);
  }
  return problems;
}

test('the workflow parser sees steps, their settings and the jobs they run in', () => {
  const runs = workflowRuns(workflow);
  assert.ok(runs.length >= 14, `found ${runs.length} run steps`);
  assert.deepEqual(new Set(runs.map((entry) => entry.job)), new Set(['checks', 'exports', 'render', 'sections-1', 'sections-2', 'sections-3', 'database', 'edge', 'image']));
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
    // CI may split the render suite across jobs; the next case checks that the parts add up to the whole.
    if (run === RENDER && renderSplitProblems(runs).length === 0) return false;
    const command = run === 'git diff --check' ? 'git diff --check' : run;
    return !runs.some((entry) => (entry.run === command || (command === 'git diff --check' && entry.run.startsWith('git diff --check '))) && Object.entries(env).every(([key, value]) => entry.env[key] === value));
  });
  assert.deepEqual(missing, []);
});

// ci-parallel-jobs: the two per-section suites render every catalogue section
// (in each theme and locale, and as a screen reader reads it), so they take
// over half of the render suite's time, one file each. CI runs every other
// render file in one job and splits those two files by test name.
test('the render suite runs every test exactly once across its jobs', () => {
  assert.deepEqual(renderSplitProblems(workflowRuns(workflow)), []);
});

const SECTIONS = 'src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx';
// The section id's length is a multiple of 3, or one more than a multiple of 3.
const ID_3N = 'section (?:[a-z0-9-]{3})+(?![a-z0-9-])';
const ID_3N_1 = 'section (?:[a-z0-9-]{3})*[a-z0-9-](?![a-z0-9-])';
const INSTALL = 'npm ci --ignore-scripts --no-audit --no-fund';

// ci-parallel-jobs: which job runs each step, in order. A change to the layout
// changes this list in the same commit.
test('each job runs its own steps, in order', () => {
  assert.deepEqual(workflowRuns(workflow).map((entry) => `${entry.job}: ${entry.run}`), [
    `checks: ${INSTALL}`,
    'checks: npm run typecheck',
    'checks: npm run typecheck:app',
    'checks: npm run typecheck:routes -w gogospend-app',
    'checks: npm run test:api',
    'checks: npm run test:app',
    'checks: npm run test:unit',
    'checks: npm run test:dev',
    'checks: npm run build -w gogospend-api',
    'checks: node apps/api/scripts/release-graph.mjs check',
    'checks: node apps/api/scripts/parser-sandbox-check.cjs',
    "checks: git diff --check ${{ github.event.pull_request.base.sha || 'HEAD^' }} HEAD",
    `exports: ${INSTALL}`,
    'exports: npm run export:web -w gogospend-app -- --max-workers 2',
    'exports: npm run export:ios -w gogospend-app -- --max-workers 2',
    `render: ${INSTALL}`,
    `render: ${RENDER} -- --exclude src/dev/catalogue/CatalogueScreen.render.test.tsx --exclude src/dev/catalogue/screenReader.render.test.tsx`,
    `sections-1: ${INSTALL}`,
    `sections-1: ${RENDER} -- ${SECTIONS} -t '^${ID_3N}'`,
    `sections-2: ${INSTALL}`,
    `sections-2: ${RENDER} -- ${SECTIONS} -t '^${ID_3N_1}'`,
    `sections-3: ${INSTALL}`,
    `sections-3: ${RENDER} -- ${SECTIONS} -t '^(?!${ID_3N})(?!${ID_3N_1})'`,
    `database: ${INSTALL}`,
    'database: npm run test:db',
    'database: npm run test:ops',
    `edge: ${INSTALL}`,
    'edge: npm run build -w gogospend-api',
    'edge: npm run install:edge',
    'edge: npm run typecheck:edge',
    'edge: npm run test:edge',
    'edge: npm run test:edge:workers',
    'edge: npm run build:edge',
    'edge: npm run test:edge:db',
    'image: docker build -f apps/api/Dockerfile -t gogospend-ci .',
    'image: docker run --rm gogospend-ci node scripts/release-smoke.cjs',
  ]);
});

// Phase 1A Task 10: the edge steps run in one job, the edge job since
// ci-parallel-jobs, in the local gate's order: the UserVault suites in workerd
// after the unit tests and before the build, and the PostgreSQL suites last,
// on the built Workers.
test('the edge steps run in the edge job in order, the workers suite between the unit tests and the build', () => {
  const edge = workflowRuns(workflow)
    .filter((entry) => /^npm run [a-z]+:edge(:[a-z]+)?$/.test(entry.run))
    .map((entry) => `${entry.job}: ${entry.run}`);
  assert.deepEqual(edge, [
    'edge: npm run install:edge',
    'edge: npm run typecheck:edge',
    'edge: npm run test:edge',
    'edge: npm run test:edge:workers',
    'edge: npm run build:edge',
    'edge: npm run test:edge:db',
  ]);
});

// 1A-T10 review, minor 1: `if:` can stop a job or step from running, and
// `continue-on-error:` can stop its failure from failing the run, while every
// other case here still passes.
test('no job or step can be switched off: no if: and no continue-on-error:', () => {
  assert.doesNotMatch(workflow, /^\s*(?:-\s+)?(?:if|continue-on-error):/m);
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
