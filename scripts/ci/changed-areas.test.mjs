// ci-selective-jobs (14 November 2026): the change map that decides which gate jobs a change runs
// (scripts/ci/changed-areas.mjs). It must err toward running: unknown paths run every job, only the paths named
// here run none, and a merge group, a push to main or a manual run always runs every job.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { AREAS, JOBS, areasOf, changedFiles, decide } from './changed-areas.mjs';

const SCRIPT = fileURLToPath(new URL('./changed-areas.mjs', import.meta.url));

const NONE = { checks: false, exports: false, render: false, database: false, edge: false, image: false, full: false };
const ALL = { checks: true, exports: true, render: true, database: true, edge: true, image: true, full: true };

test('a path the map does not know runs every job', () => {
  for (const file of [
    'packages/contracts/src/index.ts',
    'package.json',
    'package-lock.json',
    '.github/workflows/backend.yml',
    'scripts/ci/changed-areas.mjs',
    'scripts/ops/backup.mjs',
    'compose.postgres.yml',
    '.nvmrc',
    'vendor/gogocash-apps-api-spend/x.ts',
    'docs/legal/terms.md',
    'README.md',
    'apps',
    'apps/web/index.ts',
  ]) {
    assert.deepEqual(areasOf(file), AREAS, file);
  }
});

test('each app runs its own area, and the docs that tests read run the reading area', () => {
  assert.deepEqual(areasOf('apps/app/src/wallet/home/WalletShell.tsx'), ['app']);
  assert.deepEqual(areasOf('apps/api/src/attachments/attachments.integration.spec.ts'), ['api']);
  assert.deepEqual(areasOf('apps/edge/src/vault/slips/drafts.ts'), ['edge']);
  assert.deepEqual(areasOf('apps/edge/package-lock.json'), ['edge']);
  // The release image installs the API with the app's manifest beside it (apps/api/Dockerfile).
  assert.deepEqual(areasOf('apps/app/package.json'), ['app', 'api']);
  assert.deepEqual(areasOf('docs/design/bun-wallet/wc-category-edit.dc.html'), ['app']);
  assert.deepEqual(areasOf('docs/operations/release.md'), ['api']);
  assert.deepEqual(areasOf('docs/implementation/handover.md'), ['ops']);
});

test('only the controller state, the plans and the implementation notes run no job', () => {
  for (const file of ['.claude/controller/handover.md', '.claude/skills/jotbun-controller/SKILL.md', 'docs/superpowers/plans/2026-10-25-jotbun-p4-slips-statements.md', 'docs/implementation/receipts/P4-T7.md', 'docs/implementation/premium-progress.md']) {
    assert.deepEqual(areasOf(file), [], file);
  }
  // Every tracked file that runs no job sits under one of these, so a broad rule cannot switch whole apps off.
  const inert = ['.claude/', 'docs/superpowers/', 'docs/implementation/'];
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(tracked.length > 1000, `found ${tracked.length} tracked files`);
  const switchedOff = tracked.filter((file) => areasOf(file).length === 0 && !inert.some((prefix) => file.startsWith(prefix)));
  assert.deepEqual(switchedOff, []);
  assert.ok(tracked.some((file) => file.startsWith('apps/app/') && areasOf(file).includes('app')));
});

test('a pull request runs the jobs its areas need', () => {
  const pr = (files) => decide({ event: 'pull_request', ref: 'refs/pull/481/merge', files });
  // P4-T7 (#481): edge files and its receipt.
  assert.deepEqual(pr(['apps/edge/src/v1/routes.ts', 'apps/edge/test/workers/slip-drafts.test.ts', 'docs/implementation/receipts/P4-T7.md']), { ...NONE, edge: true });
  // test:db's app-adapter spec imports app modules, and test:ops reads app files.
  assert.deepEqual(pr(['apps/app/src/wallet/home/WalletShell.tsx']), { ...NONE, checks: true, exports: true, render: true, database: true });
  assert.deepEqual(pr(['apps/app/package.json']), ALL);
  assert.deepEqual(pr(['apps/api/src/health/readiness-receipts.ts']), { ...NONE, checks: true, database: true, edge: true, image: true });
  assert.deepEqual(pr(['docs/implementation/handover.md']), { ...NONE, database: true });
  assert.deepEqual(pr(['docs/implementation/receipts/P4-T7.md', '.claude/controller/followups.md']), NONE);
  assert.deepEqual(pr([]), NONE);
  assert.deepEqual(pr(['apps/edge/src/v1/routes.ts', 'packages/contracts/src/v1/slips.ts']), ALL);
  assert.deepEqual(pr(['apps/app/src/a.ts', 'apps/api/src/b.ts', 'apps/edge/src/c.ts']), ALL);
  // A change that cannot be listed runs everything.
  assert.deepEqual(pr(null), ALL);
});

test('a merge group, a push to main, a manual run and any other event run every job', () => {
  const edgeOnly = ['apps/edge/src/v1/routes.ts'];
  assert.deepEqual(decide({ event: 'merge_group', ref: 'refs/heads/gh-readonly-queue/claude/p1a-vault-core/pr-481-ac0066a6', files: edgeOnly }), ALL);
  assert.deepEqual(decide({ event: 'push', ref: 'refs/heads/main', files: ['docs/implementation/receipts/P4-T7.md'] }), ALL);
  assert.deepEqual(decide({ event: 'workflow_dispatch', ref: 'refs/heads/claude/p1a-vault-core', files: null }), ALL);
  assert.deepEqual(decide({ event: 'schedule', ref: 'refs/heads/main', files: [] }), ALL);
});

test('a push to the integration branch runs every job, unless it changed only files no job reads', () => {
  const push = (files) => decide({ event: 'push', ref: 'refs/heads/claude/p1a-vault-core', files });
  assert.deepEqual(push(['.claude/controller/handover.md', '.claude/controller/followups.md']), NONE);
  assert.deepEqual(push(['.claude/controller/handover.md', 'apps/edge/src/v1/routes.ts']), ALL);
  assert.deepEqual(push(null), ALL);
});

/** The folder a file belongs to: `apps/<name>` or `packages/<name>`, or `scripts`. */
function homeOf(file) {
  return file.startsWith('apps/') || file.startsWith('packages/') ? file.split('/').slice(0, 2).join('/') : 'scripts';
}

/**
 * Every `[reader, target]` where tracked code under apps/, packages/ or scripts/ names a repo path outside its own
 * folder: a `../` path, a `join(__dirname, ...)` or `join(import.meta.dirname, ...)` path, or a path from the repo
 * root (`'apps/...'`, `${ROOT}docs/...`). node_modules and the repo root itself come from the lockfiles, which run
 * every job. The map and this file name paths as data, not reads, so they are left out.
 */
export function crossReads() {
  const data = new Set(['scripts/ci/changed-areas.mjs', 'scripts/ci/changed-areas.test.mjs']);
  const files = execFileSync('git', ['ls-files', '-z', 'apps', 'packages', 'scripts'], { encoding: 'utf8' }).split('\0').filter((file) => /\.(?:m|c)?[jt]sx?$/.test(file) && !data.has(file));
  const reads = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    const dir = posix.dirname(file);
    const home = homeOf(file);
    const targets = [
      ...[...text.matchAll(/['"`]((?:\.\.\/)+[^'"`\s$]*)['"`]/g)].map((match) => posix.join(dir, match[1])),
      ...[...text.matchAll(/\b(?:join|resolve)\(\s*(?:__dirname|import\.meta\.dirname)\s*((?:,\s*['"][^'"]*['"]\s*)+)\)/g)].map((match) => posix.join(dir, ...[...match[1].matchAll(/['"]([^'"]*)['"]/g)].map((part) => part[1]))),
      ...[...text.matchAll(/(?:\$\{ROOT\}|['"`])((?:apps|docs|packages|\.claude)\/[^'"`\s$]*)/g)].map((match) => match[1]),
    ].map((target) => posix.normalize(target));
    for (const target of targets) {
      if (target.startsWith('..') || target === '.' || target === './' || target === home || target.startsWith(`${home}/`) || target.split('/').includes('node_modules')) continue;
      reads.push([file, target]);
    }
  }
  return reads;
}

/** The jobs that run a reading file: its own test suite's job, or, for code that is not a test, its area's jobs. */
function jobsReading(file) {
  const jobsOf = (area) => Object.keys(JOBS).filter((job) => JOBS[job].includes(area));
  if (file.startsWith('apps/api/')) return file.endsWith('.integration.spec.ts') ? ['database'] : file.endsWith('.spec.ts') ? ['checks'] : jobsOf('api');
  if (file.startsWith('apps/app/')) return /\.render\.test\.tsx?$/.test(file) ? ['render'] : /\.test\.tsx?$/.test(file) ? ['checks'] : jobsOf('app');
  if (file.startsWith('apps/edge/')) return ['edge'];
  if (/^scripts\/(?:ci|ops)\//.test(file)) return ['database'];
  if (/^scripts\/dev/.test(file)) return ['checks'];
  return Object.keys(JOBS);
}

test('every file the code reads outside its own folder runs the reading test\'s job when it changes', () => {
  const reads = crossReads();
  // The reads known today, so a scan that stops seeing them fails too.
  for (const [reader, prefix] of [
    ['apps/api/src/v1/app-adapter.integration.spec.ts', 'apps/app/src/'],
    ['apps/api/src/spend/spend-compare-readiness.spec.ts', 'apps/app/src/'],
    ['apps/api/src/common/operational-hardening.spec.ts', 'docs/operations/'],
    ['apps/app/src/wallet/looks/WalletLooks.render.test.tsx', 'docs/design/'],
    ['apps/edge/test/route-coverage.test.ts', 'apps/api/'],
    ['scripts/ops/readiness-receipts.mjs', 'apps/api/'],
    ['scripts/ci/backend-workflow.test.mjs', 'apps/app/'],
    ['scripts/ci/backend-workflow.test.mjs', 'docs/implementation/handover.md'],
  ]) {
    assert.ok(reads.some(([file, target]) => file === reader && target.startsWith(prefix)), `${reader} reads ${prefix}`);
  }
  const unrouted = reads
    .filter(([reader, target]) => {
      const answer = decide({ event: 'pull_request', ref: 'refs/pull/1/merge', files: [target] });
      return !jobsReading(reader).every((job) => answer[job]);
    })
    .map(([reader, target]) => `${reader} reads ${target}`);
  assert.deepEqual(unrouted, []);
});

test('the map prints a file named like a workflow command only where the runner reads no commands', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-areas-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    git('init', '-q', '-b', 'base');
    writeFileSync(join(dir, 'README.md'), 'one\n');
    git('add', '.');
    git('commit', '-q', '-m', 'one');
    git('checkout', '-q', '-b', 'feature');
    writeFileSync(join(dir, '::error title=CI result::every needed job passed'), 'x\n');
    git('add', '.');
    git('commit', '-q', '-m', 'two');
    git('checkout', '-q', 'base');
    git('merge', '-q', '--no-ff', '-m', 'merge', 'feature');
    const stdout = execFileSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, EVENT: 'pull_request', REF: 'refs/pull/1/merge', GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' }, stdio: 'pipe' });
    const lines = stdout.split('\n');
    const at = lines.indexOf('::error title=CI result::every needed job passed');
    const token = /^::stop-commands::(\S+)$/.exec(lines[lines.findIndex((line) => line.startsWith('::stop-commands::'))])?.[1];
    assert.ok(token && at > 0, stdout);
    assert.ok(lines.indexOf(`::stop-commands::${token}`) < at && at < lines.indexOf(`::${token}::`), stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every area runs at least one job, and every job is started by some area', () => {
  for (const area of AREAS) assert.ok(Object.values(JOBS).some((needs) => needs.includes(area)), area);
  for (const [job, needs] of Object.entries(JOBS)) {
    assert.ok(needs.length > 0, job);
    for (const area of needs) assert.ok(AREAS.includes(area), `${job}: ${area}`);
  }
});

test('changed files come from git, and a range git cannot diff lists nothing (every job runs)', () => {
  assert.deepEqual(changedFiles('HEAD', 'HEAD'), []);
  assert.equal(changedFiles(''), null);
  assert.equal(changedFiles('0000000000000000000000000000000000000000'), null);
  assert.equal(changedFiles('no-such-ref-ci-selective-jobs'), null);
});

test('run as the workflow runs it, the script answers for the merge commit against its first parent, the base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-areas-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  const write = (file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  const run = (env) => {
    const output = join(dir, '.output');
    rmSync(output, { force: true });
    execFileSync(process.execPath, [SCRIPT], { cwd: dir, env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: '', ...env }, stdio: 'pipe' });
    return readFileSync(output, 'utf8').split('\n').filter(Boolean);
  };
  try {
    git('init', '-q', '-b', 'base');
    write('apps/edge/src/a.ts', 'export const a = 1;\n');
    write('apps/app/src/b.ts', 'export const b = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'one');
    git('checkout', '-q', '-b', 'feature');
    write('apps/edge/src/a.ts', 'export const a = 2;\n');
    write('docs/implementation/receipts/X.md', 'receipt\n');
    git('add', '.');
    git('commit', '-q', '-m', 'two');
    git('checkout', '-q', 'base');
    // The base moves on after the branch: the app change is not the pull request's.
    write('apps/app/src/b.ts', 'export const b = 2;\n');
    git('commit', '-q', '-am', 'three');
    const three = git('rev-parse', 'HEAD');
    git('merge', '-q', '--no-ff', '-m', 'merge', 'feature');
    assert.deepEqual(run({ EVENT: 'pull_request', REF: 'refs/pull/1/merge' }), ['checks=false', 'exports=false', 'render=false', 'database=false', 'edge=true', 'image=false', 'full=false']);
    // A push to the integration branch names its range with BEFORE, and runs every job for a code change.
    assert.deepEqual(run({ EVENT: 'push', REF: 'refs/heads/claude/p1a-vault-core', BEFORE: three }), ['checks=true', 'exports=true', 'render=true', 'database=true', 'edge=true', 'image=true', 'full=true']);
    assert.deepEqual(run({ EVENT: 'merge_group', REF: 'refs/heads/gh-readonly-queue/base/pr-1-x' }).at(-1), 'full=true');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file moved out of an app lists both paths, so the app\'s jobs still run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-areas-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
  try {
    git('init', '-q');
    mkdirSync(join(dir, 'apps/app/src'), { recursive: true });
    writeFileSync(join(dir, 'apps/app/src/kitCatalog.ts'), 'export const kit = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'one');
    mkdirSync(join(dir, 'docs/implementation'), { recursive: true });
    git('mv', 'apps/app/src/kitCatalog.ts', 'docs/implementation/kitCatalog.ts');
    git('commit', '-q', '-m', 'two');
    const files = changedFiles('HEAD^', 'HEAD', dir);
    assert.deepEqual([...files].sort(), ['apps/app/src/kitCatalog.ts', 'docs/implementation/kitCatalog.ts']);
    assert.equal(decide({ event: 'pull_request', ref: 'refs/pull/1/merge', files }).render, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
