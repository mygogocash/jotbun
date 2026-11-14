// CI's change map (ci-selective-jobs, 14 November 2026; the owner asked for CI that is secure, fast and fits many
// pull requests and agents at once). The workflow's first job runs this file. Each gate job reads its answer in its
// `if:`, so a pull request runs only the jobs its change can affect. GitHub reports a job skipped by `if:` as
// passed, so the workflow's `ci-ok` job fails the run when a job it needed failed or was cancelled.
//
// It errs toward running:
// - a path this map does not know runs every job;
// - a merge group (the merge queue), a push to main and a manual run always run every job;
// - a push to another branch (the integration branch) runs every job unless it changed only files no job reads.
//
// The workflow runs this file as the base commit has it (`git show <base>:scripts/ci/changed-areas.mjs`), so a pull
// request cannot change the map its own run uses. A change to this file runs every job, and takes effect once merged.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** What a changed file can affect: the app, the frozen API, the edge Worker, or the ops and CI suites (test:ops). */
export const AREAS = ['app', 'api', 'edge', 'ops'];

/**
 * The gate jobs, by the output each one reads, and the areas that make it run. The render output starts every render
 * job (the render shards and the three per-section jobs).
 * - checks: `test:api` reads an app file (apps/api/src/spend/spend-compare-readiness.spec.ts reads the app's
 *   kitCatalog.ts), and `test:dev` starts the app.
 * - database: `test:db` is the API's, and `test:ops` reads the API's migrations and health code.
 * - edge: the edge job builds the API and runs its PostgreSQL suites against the built NestJS server.
 */
export const JOBS = {
  checks: ['app', 'api'],
  exports: ['app'],
  render: ['app'],
  database: ['api', 'ops'],
  edge: ['edge', 'api'],
  image: ['api'],
};

/**
 * The areas one changed file needs: [] for a file no job reads, every area for a file this map does not know.
 * Each docs entry names the test that reads it.
 */
export function areasOf(file) {
  // Read by no job: the controller's state and skills, the plans and the task receipts.
  if (file.startsWith('.claude/')) return [];
  if (file.startsWith('docs/superpowers/')) return [];
  // scripts/ci/backend-workflow.test.mjs (in test:ops) reads the handover's "Full gate".
  if (file === 'docs/implementation/handover.md') return ['ops'];
  if (file.startsWith('docs/implementation/')) return [];
  // WalletLooks.render.test.tsx and categoryIcons.test.ts read docs/design/bun-wallet.
  if (file.startsWith('docs/design/')) return ['app'];
  // apps/api/src/common/operational-hardening.spec.ts reads docs/operations/release.md.
  if (file.startsWith('docs/operations/')) return ['api'];
  if (file.startsWith('apps/app/')) return ['app'];
  if (file.startsWith('apps/api/')) return ['api'];
  if (file.startsWith('apps/edge/')) return ['edge'];
  // Everything else: packages/ (every app reads the contracts), scripts/, .github/, the root lockfile and package
  // files, the compose file, .nvmrc, vendor/, any other docs, and any path added later.
  return [...AREAS];
}

/** Every gate output set to `value`, with `full` saying whether every job must run. */
function every(value) {
  return { ...Object.fromEntries(Object.keys(JOBS).map((job) => [job, value])), full: value };
}

/**
 * Which gate jobs run, as `{ checks, exports, render, database, edge, image, full }`.
 * `files` is null when the change cannot be listed (a new branch, or a range git cannot diff).
 */
export function decide({ event, ref, files }) {
  if (event !== 'pull_request' && event !== 'push') return every(true);
  if (event === 'push' && ref === 'refs/heads/main') return every(true);
  if (files === null) return every(true);
  const areas = new Set(files.flatMap((file) => areasOf(file)));
  if (event === 'push') return areas.size === 0 ? every(false) : every(true);
  const jobs = Object.fromEntries(Object.entries(JOBS).map(([job, needs]) => [job, needs.some((area) => areas.has(area))]));
  return { ...jobs, full: Object.values(jobs).every(Boolean) };
}

/**
 * The files changed between two commits; null when git cannot diff them. A rename lists both paths, so moving a file
 * out of an app still runs that app's jobs.
 */
export function changedFiles(base, head = 'HEAD', cwd = process.cwd()) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    return execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  const event = process.env.EVENT ?? '';
  const ref = process.env.REF ?? '';
  // A pull request's checkout is GitHub's merge commit: its first parent is the base branch it merges onto.
  const base = event === 'pull_request' ? 'HEAD^1' : (process.env.BEFORE ?? '');
  const files = event === 'pull_request' || event === 'push' ? changedFiles(base) : null;
  const answer = decide({ event, ref, files });
  const lines = Object.entries(answer).map(([key, value]) => `${key}=${value}`);
  const listed = files === null ? '(not listed: every job runs)' : files.length === 0 ? '(none)' : files.slice(0, 200).join('\n') + (files.length > 200 ? `\n... and ${files.length - 200} more` : '');
  console.log(`event ${event}, ref ${ref}\nchanged files:\n${listed}\n\njobs:\n${lines.join('\n')}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Jobs this change runs\n\n${lines.map((line) => `- ${line}`).join('\n')}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
