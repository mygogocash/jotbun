// ci-selective-jobs (14 November 2026): the change map that decides which gate jobs a change runs
// (scripts/ci/changed-areas.mjs). It must err toward running: unknown paths run every job, only the paths named
// here run none, and a merge group, a push to main or a manual run always runs every job.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  assert.deepEqual(pr(['apps/app/src/wallet/home/WalletShell.tsx']), { ...NONE, checks: true, exports: true, render: true });
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
