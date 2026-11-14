// P6b review (M5): the CI workflow runs every command of the local full gate
// with the same settings (GOGOSPEND_OPS_REQUIRE_DB=1 makes the ops suite's
// database rehearsal a failure instead of a skip), pins every action by
// commit, holds no secret and only reads the repository. It reads the YAML
// structurally (no YAML library: no new dependency) and the local gate from
// docs/implementation/handover.md ("Full gate").
// ci-parallel-jobs (9 November 2026): the jobs run in parallel and the render
// suite is split across jobs, so the cases below also pin which job runs each
// step and check that the split runs every render test exactly once.
// ci-selective-jobs (14 November 2026): a change map decides which gate jobs a
// change runs (scripts/ci/changed-areas.mjs). The cases below keep it the one
// way a job is switched off: the only `if:` lines are each gate job's change
// map output and ci-ok's always(), however the key is spelled; no shell,
// defaults or continue-on-error; ci-ok needs every job and lets a full run
// skip none; one read-only permissions block; and every job runs on GitHub's
// ubuntu-24.04. This file also runs in the whitespace job, which every change
// runs, so the guard never depends on the map.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JOBS } from './changed-areas.mjs';

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

/**
 * Each job's own settings, as `{ [job]: { settings: { 'runs-on', needs, if, ... }, outputs: { [name]: value } } }`:
 * the one-line keys at the job's level, and the lines of its `outputs:` block.
 */
export function jobSettings(text) {
  const jobs = {};
  let inJobs = false;
  let job = null;
  let block = null;
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inJobs = line.startsWith('jobs:');
      continue;
    }
    if (!inJobs) continue;
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (indent === 2) {
      job = line.trim().replace(/:$/, '');
      jobs[job] = { settings: {}, outputs: {} };
      block = null;
    } else if (indent === 4 && match) {
      block = match[2] === '' ? match[1] : null;
      if (match[2] !== '') jobs[job].settings[match[1]] = match[2];
    } else if (indent === 6 && block === 'outputs' && match) {
      jobs[job].outputs[match[1]] = match[2];
    }
  }
  return jobs;
}

/** `needs: a` or `needs: [a, b]`, as a list. */
function listOf(value = '') {
  return value.startsWith('[') ? value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean) : [value].filter(Boolean);
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
 * - the steps that run every render file but some, `--exclude <file> ...`: one step, or the shards
 *   `--shard=1/n` to `--shard=n/n` of the same files (Vitest gives each shard its part of the files, each file to
 *   one shard);
 * - two or more steps that run exactly those files with a name pattern, `<file> ... -t '<pattern>'`,
 *   where the last pattern is the others negated (`^(?!a)(?!b)` after `^a` and `^b`), so every test
 *   matches one of them, and on sample names no test matches two.
 */
export function renderSplitProblems(runs) {
  const problems = [];
  const steps = runs.filter((entry) => entry.run.startsWith(`${RENDER} -- `)).map((entry) => entry.run.slice(`${RENDER} -- `.length));
  const rests = steps
    .map((args) => /^(--exclude \S+(?: --exclude \S+)*)(?: --shard=(\d+)\/(\d+))?$/.exec(args))
    .filter(Boolean)
    .map((match) => ({ files: [...match[1].matchAll(/--exclude (\S+)/g)].map((m) => m[1]), shard: match[2] ? { index: Number(match[2]), count: Number(match[3]) } : null }));
  const parts = steps.map((args) => /^((?:\S+\.tsx )+)-t '([^']+)'$/.exec(args)).filter(Boolean).map((match) => ({ files: match[1].trim().split(' '), pattern: match[2] }));
  if (rests.length + parts.length !== steps.length) problems.push(`a render step is neither --exclude <file> ... [--shard=i/n] nor <file> ... -t '<pattern>': ${steps.join(' | ')}`);
  if (rests.length === 0) return [...problems, 'one step, or one step per shard, must run every render file but the split ones; found none'];
  const sorted = (files) => [...files].sort().join(' ');
  if (rests.length === 1 && rests[0].shard && rests[0].shard.count !== 1) {
    problems.push(`one step runs only shard ${rests[0].shard.index} of ${rests[0].shard.count} of the other render files`);
  }
  if (rests.length > 1) {
    const count = rests.length;
    if (!rests.every((rest) => rest.shard?.count === count)) {
      problems.push(`${count} steps run the other render files, so each must be one of --shard=1/${count} to --shard=${count}/${count}`);
    } else {
      const indexes = rests.map((rest) => rest.shard.index).sort((a, b) => a - b).join(',');
      const expected = Array.from({ length: count }, (_, index) => index + 1).join(',');
      if (indexes !== expected) problems.push(`the shards must be 1 to ${count}, each once; found ${indexes}`);
    }
    if (!rests.every((rest) => sorted(rest.files) === sorted(rests[0].files))) problems.push('every shard must leave out the same files');
  }
  const split = rests[0].files;
  for (const file of split) {
    if (!/^src\/\S+\.render\.test\.tsx$/.test(file) || !appFileExists(file)) problems.push(`${file} is not a render test file in apps/app`);
  }
  if (new Set(split).size !== split.length) problems.push(`a file is excluded twice: ${split.join(' ')}`);
  if (parts.length < 2) return [...problems, `the split files need two or more name patterns; found ${parts.length}`];
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

/** The lines that set `key`, however it is spelled: quoted or not, with or without a space before the colon. */
function keyLines(key) {
  return workflow.split('\n').filter((line) => new RegExp(`^\\s*(?:-\\s+)?["']?${key}["']?\\s*:`).test(line));
}

const indentOf = (line) => line.length - line.trimStart().length;

/** Each gate job and the change-map output that starts it; `changes`, `whitespace` and `ci-ok` always run. */
const GATE_JOBS = {
  checks: 'checks',
  exports: 'exports',
  'render-1': 'render',
  'render-2': 'render',
  'sections-1': 'render',
  'sections-2': 'render',
  'sections-3': 'render',
  database: 'database',
  edge: 'edge',
  image: 'image',
};

test('the workflow parser sees steps, their settings and the jobs they run in', () => {
  const runs = workflowRuns(workflow);
  assert.ok(runs.length >= 14, `found ${runs.length} run steps`);
  assert.deepEqual(new Set(runs.map((entry) => entry.job)), new Set(['changes', 'whitespace', ...Object.keys(GATE_JOBS), 'ci-ok']));
  assert.deepEqual(Object.keys(jobSettings(workflow)), ['changes', 'whitespace', ...Object.keys(GATE_JOBS), 'ci-ok']);
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
// render file in two jobs (vitest --shard) and splits those two files by test
// name.
test('the render suite runs every test exactly once across its jobs', () => {
  assert.deepEqual(renderSplitProblems(workflowRuns(workflow)), []);
});

test('the render split check refuses shards that miss or repeat a part, and a lone part shard', () => {
  const sections = 'src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx';
  const rest = '--exclude src/dev/catalogue/CatalogueScreen.render.test.tsx --exclude src/dev/catalogue/screenReader.render.test.tsx';
  const parts = [`${sections} -t '^section a'`, `${sections} -t '^(?!section a)'`].map((args) => ({ job: 'x', run: `${RENDER} -- ${args}`, env: {} }));
  const runsWith = (...restArgs) => [...restArgs.map((args) => ({ job: 'x', run: `${RENDER} -- ${args}`, env: {} })), ...parts];
  assert.deepEqual(renderSplitProblems(runsWith(rest)), []);
  assert.deepEqual(renderSplitProblems(runsWith(`${rest} --shard=1/2`, `${rest} --shard=2/2`)), []);
  assert.notDeepEqual(renderSplitProblems(runsWith(`${rest} --shard=1/2`)), []);
  assert.notDeepEqual(renderSplitProblems(runsWith(`${rest} --shard=1/2`, `${rest} --shard=1/2`)), []);
  assert.notDeepEqual(renderSplitProblems(runsWith(`${rest} --shard=1/3`, `${rest} --shard=2/3`)), []);
  assert.notDeepEqual(renderSplitProblems(runsWith(`${rest} --shard=1/2`, '--exclude src/dev/catalogue/CatalogueScreen.render.test.tsx --shard=2/2')), []);
  assert.notDeepEqual(renderSplitProblems(runsWith(rest, rest)), []);
});

const SECTIONS = 'src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx';
const EXCLUDES = '--exclude src/dev/catalogue/CatalogueScreen.render.test.tsx --exclude src/dev/catalogue/screenReader.render.test.tsx';
// The section id's length is a multiple of 3, or one more than a multiple of 3.
const ID_3N = 'section (?:[a-z0-9-]{3})+(?![a-z0-9-])';
const ID_3N_1 = 'section (?:[a-z0-9-]{3})*[a-z0-9-](?![a-z0-9-])';
const INSTALL = 'npm ci --ignore-scripts --no-audit --no-fund';
// The change map as the base commit has it; when that fails or writes no answer, every job runs.
const MAP_STEP = String.raw`git show "$MAP_BASE:scripts/ci/changed-areas.mjs" > "$RUNNER_TEMP/changed-areas.mjs" && node "$RUNNER_TEMP/changed-areas.mjs" && grep -q '^full=' "$GITHUB_OUTPUT" || printf 'checks=true\nexports=true\nrender=true\ndatabase=true\nedge=true\nimage=true\nfull=true\n' >> "$GITHUB_OUTPUT"`;
const CI_OK_STEP = String.raw`echo "$NEEDS" | jq -r 'to_entries[] | "\(.key)=\(.value.result)"' && echo "$NEEDS" | jq -e --arg full "$FULL" '[to_entries[] | select(.value.result != "success") | select(.key == "changes" or .key == "whitespace" or $full != "false" or .value.result != "skipped")] | length == 0'`;
const GUARDS = 'node --test scripts/ci/backend-workflow.test.mjs scripts/ci/changed-areas.test.mjs';

// ci-parallel-jobs: which job runs each step, in order. A change to the layout
// changes this list in the same commit.
test('each job runs its own steps, in order', () => {
  assert.deepEqual(workflowRuns(workflow).map((entry) => `${entry.job}: ${entry.run}`), [
    `changes: ${MAP_STEP}`,
    "whitespace: git diff --check ${{ github.event.pull_request.base.sha || 'HEAD^' }} HEAD",
    `whitespace: ${GUARDS}`,
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
    `exports: ${INSTALL}`,
    'exports: npm run export:web -w gogospend-app -- --max-workers 2',
    'exports: npm run export:ios -w gogospend-app -- --max-workers 2',
    `render-1: ${INSTALL}`,
    `render-1: ${RENDER} -- ${EXCLUDES} --shard=1/2`,
    `render-2: ${INSTALL}`,
    `render-2: ${RENDER} -- ${EXCLUDES} --shard=2/2`,
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
    `ci-ok: ${CI_OK_STEP}`,
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

// 1A-T10 review, minor 1: `continue-on-error:` can stop a failure from failing
// the run, and an `if:` can stop a job or step from running, while every other
// case here still passes. A `shell:` or `defaults:` can make every step exit 0
// without running (GitHub runs a custom shell's first word with the script's
// path). ci-selective-jobs keeps one kind of `if:`: a job's own, at the job's
// level, as the next case pins it. Each key is matched however it is spelled.
test('nothing ignores a failure, and no step can be switched off: every if: is a job\'s own', () => {
  for (const key of ['continue-on-error', 'shell', 'defaults']) assert.deepEqual(keyLines(key), [], key);
  assert.deepEqual(keyLines('if').map(indentOf), Array(Object.keys(GATE_JOBS).length + 1).fill(4));
});

test('each gate job runs on its change-map output, after the changes job, and on nothing else', () => {
  const jobs = jobSettings(workflow);
  for (const [job, output] of Object.entries(GATE_JOBS)) {
    assert.equal(jobs[job].settings.needs, 'changes', job);
    assert.equal(jobs[job].settings.if, `needs.changes.outputs.${output} == 'true'`, job);
  }
  for (const job of ['changes', 'whitespace']) {
    assert.equal(jobs[job].settings.if, undefined, job);
    assert.equal(jobs[job].settings.needs, undefined, job);
  }
  // The map decides exactly the outputs the jobs read.
  assert.deepEqual([...new Set(Object.values(GATE_JOBS))].sort(), Object.keys(JOBS).sort());
});

/** Runs the map step as the changes job does, in a temp folder reached through a symlink (as macOS's are). */
function runMapStep(env) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-map-'));
  try {
    mkdirSync(join(dir, 'real'));
    symlinkSync(join(dir, 'real'), join(dir, 'link'));
    const output = join(dir, 'output');
    const [map] = workflowRuns(workflow).filter((entry) => entry.job === 'changes');
    const stdout = execFileSync('bash', ['-c', map.run], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: join(dir, 'link'), GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: '', ...env }, stdio: 'pipe' });
    return { stdout, outputs: readFileSync(output, 'utf8').split('\n').filter(Boolean) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the changes job runs the base commit\'s map for a pull request or a push, and no map for any other event', () => {
  const { changes } = jobSettings(workflow);
  const outputs = [...Object.keys(JOBS), 'full'];
  assert.deepEqual(changes.outputs, Object.fromEntries(outputs.map((name) => [name, `\${{ steps.map.outputs.${name} }}`])));
  const [map] = workflowRuns(workflow).filter((entry) => entry.job === 'changes');
  assert.equal(map.run, MAP_STEP);
  assert.deepEqual(map.env, {
    NODE_VERSION: '26.9.0',
    EVENT: '${{ github.event_name }}',
    REF: '${{ github.ref }}',
    BEFORE: '${{ github.event.before }}',
    // A merge group or a manual run has no base map: the zero commit makes `git show` fail, so every job runs.
    MAP_BASE: "${{ github.event_name == 'pull_request' && 'HEAD^1' || github.event_name == 'push' && github.event.before || '0000000000000000000000000000000000000000' }}",
  });
  // Without a base map, the step writes every output true and prints nothing of the map's.
  const none = runMapStep({ MAP_BASE: '0000000000000000000000000000000000000000' });
  assert.deepEqual(none.outputs, outputs.map((name) => `${name}=true`));
  assert.doesNotMatch(none.stdout, /jobs:/);
});

test('the map step runs the map itself when it can, through a symlinked temp folder, and prints file names inert', () => {
  // HEAD holds the map once this file is committed; a manual run's event answers every job without reading git.
  const { stdout, outputs } = runMapStep({ MAP_BASE: 'HEAD', EVENT: 'workflow_dispatch', REF: 'refs/heads/claude/p1a-vault-core', BEFORE: '' });
  assert.deepEqual(outputs, [...Object.keys(JOBS), 'full'].map((name) => `${name}=true`));
  const token = /::stop-commands::([0-9a-f-]{36})\n/.exec(stdout)?.[1];
  assert.ok(token, stdout);
  assert.match(stdout, new RegExp(`::stop-commands::${token}\\n\\(not listed: every job runs\\)\\n::${token}::\\n\\njobs:\\n`));
});

test('ci-ok needs every job, runs even when one failed, and passes only when each passed or the map skipped it', () => {
  const jobs = jobSettings(workflow);
  const ciOk = jobs['ci-ok'].settings;
  assert.deepEqual(listOf(ciOk.needs).sort(), ['changes', 'whitespace', ...Object.keys(GATE_JOBS)].sort());
  // always(), not !cancelled(): a skipped ci-ok would count as passed.
  assert.equal(ciOk.if, 'always()');
  const [step] = workflowRuns(workflow).filter((entry) => entry.job === 'ci-ok');
  assert.equal(step.env.NEEDS, '${{ toJSON(needs) }}');
  assert.equal(step.env.FULL, '${{ needs.changes.outputs.full }}');
  const verdict = (needs, full) => {
    try {
      execFileSync('bash', ['-c', step.run], { env: { ...process.env, NEEDS: JSON.stringify(needs), FULL: full }, stdio: 'pipe' });
      return 'pass';
    } catch {
      return 'fail';
    }
  };
  const every = (result) => Object.fromEntries(['changes', 'whitespace', ...Object.keys(GATE_JOBS)].map((job) => [job, { result }]));
  assert.equal(verdict(every('success'), 'true'), 'pass');
  const edgeOnly = { ...every('skipped'), changes: { result: 'success' }, whitespace: { result: 'success' }, edge: { result: 'success' } };
  assert.equal(verdict(edgeOnly, 'false'), 'pass');
  // The whitespace job (and the guards in it) must pass, and is never skipped.
  assert.equal(verdict({ ...edgeOnly, whitespace: { result: 'failure' } }, 'false'), 'fail');
  assert.equal(verdict({ ...edgeOnly, whitespace: { result: 'skipped' } }, 'false'), 'fail');
  // A full run (or no answer from the map) may skip none.
  assert.equal(verdict(edgeOnly, 'true'), 'fail');
  assert.equal(verdict(edgeOnly, ''), 'fail');
  assert.equal(verdict({ ...edgeOnly, edge: { result: 'failure' } }, 'false'), 'fail');
  assert.equal(verdict({ ...edgeOnly, edge: { result: 'cancelled' } }, 'false'), 'fail');
  assert.equal(verdict({ ...every('skipped'), changes: { result: 'failure' } }, ''), 'fail');
  assert.equal(verdict(every('skipped'), 'false'), 'fail');
});

// R127 (14 November 2026): the repository is public, so a self-hosted runner
// would run any fork's pull request on the owner's machine.
test('every job runs on GitHub\'s ubuntu-24.04, never a self-hosted runner or a runner variable', () => {
  for (const [job, { settings }] of Object.entries(jobSettings(workflow))) assert.equal(settings['runs-on'], 'ubuntu-24.04', job);
  const code = workflow.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
  assert.doesNotMatch(code, /self-hosted|vars\./);
});

test('the triggers: pull requests, the merge queue, pushes to main and the integration branch, and a manual run', () => {
  const on = /^on:\n((?: {2}.*\n|\n)*?)(?=\S)/m.exec(workflow)?.[1].trimEnd();
  assert.equal(on, ['  pull_request:', '  merge_group:', '    types: [checks_requested]', '  push:', '    branches: [main, claude/p1a-vault-core]', '  workflow_dispatch:'].join('\n'));
});

// A push's run is the full run after a merge: a later push (the controller's
// state sync) must not cancel it, while a pull request's newer push cancels
// its older run.
test('a newer push to a pull request cancels its older run, and no push cancels another push\'s run', () => {
  assert.match(workflow, /^concurrency:\n {2}group: backend-\$\{\{ github\.event_name == 'push' && format\('\{0\}@\{1\}', github\.ref, github\.sha\) \|\| github\.ref \}\}\n {2}cancel-in-progress: true\n/m);
});

test('the ops suite in CI fails, not skips, when its database is unreachable', () => {
  const ops = workflowRuns(workflow).filter((entry) => entry.run === 'npm run test:ops');
  assert.deepEqual(ops.map((entry) => entry.env.GOGOSPEND_OPS_REQUIRE_DB), ['1']);
});

test('read-only, no secrets, every action pinned by commit', () => {
  assert.match(workflow, /^permissions:\n {2}contents: read\n/m);
  // One permissions block, the workflow's: a job's own could grant a writing token.
  assert.deepEqual(keyLines('permissions').map(indentOf), [0]);
  assert.doesNotMatch(workflow, /secrets\./);
  const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  for (const action of uses) assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, action);
  // The image's Node version is checked against CI's in the Node 26 test above.
});
