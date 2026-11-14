## Summary
- **Why:** the owner asked for CI that is secure, fast, and fits many PRs and agents at once (14 Nov). This PR is the workflow half. The repo settings (branch protection, switching the merge queue on, secret scanning) wait for the owner's yes.
- **Run only the jobs a change needs:**
  - A first job, `changes`, lists the changed files and maps them to the gate jobs they can affect (`scripts/ci/changed-areas.mjs`). Each gate job's `if:` reads its output.
  - The map errs toward running: a path it does not know runs every job.
  - Only `.claude/`, `docs/superpowers/` and `docs/implementation/` run nothing. The exception is `handover.md`, which the guard test reads.
  - The docs that tests read run the job that reads them: `docs/design/` (app), `docs/operations/` (API) and `handover.md` (ops).
  - The map runs as the base commit has it, so a PR cannot change the map its own run uses. With no base map, every job runs.
  - **Examples:** an edge-only PR like #481 runs `changes`, `edge` and `ci-ok` instead of 9 jobs. An app-only PR runs checks, exports and the five render jobs.
- **Full runs where it counts:**
  - A merge group (once the merge queue is on), a push to `main` and a manual run run every job.
  - A push to the integration branch runs every job, unless only the controller's state changed. That is the full run after each merge, until the merge queue tests every merge.
- **One required check:** `ci-ok` ("CI result"). It needs every job and runs with `always()`.
  - It fails when a needed job failed or was cancelled, or when a full run skipped one.
  - It is the one check to require in branch protection and the merge queue.
- **Faster render:** the render files run in two shards (`vitest --shard=1/2` and `2/2`), splitting Render's 219 s of tests in two.
- **Hardening:**
  - Every job runs on `ubuntu-24.04`, with no runner variable (R127: no self-hosted runner on a public repo).
  - Each push has its own concurrency group, so the controller's state sync cannot cancel a merge's full run. A PR's newer push still cancels its older run.
  - Every expression that reaches a shell goes through `env:`, apart from the whitespace check's base SHA, which is unchanged.
- **The guard test** (`scripts/ci/backend-workflow.test.mjs`) keeps the 1A-T10 rule's intent:
  - the only `if:` lines are each gate job's map output and ci-ok's `always()`;
  - nothing uses `continue-on-error`, and ci-ok needs every job;
  - the triggers, the runner and the concurrency are pinned;
  - ci-ok's rule runs through `jq` on sample results.
- **The map's tests:** `scripts/ci/changed-areas.test.mjs`, added to `test:ops`. They pin the map, including a real merge commit and a rename in throwaway repos.
- **Controller side (outside this PR):** `merge_task_pr.sh` now accepts GitHub's "skipping" bucket, and requires a passing "CI result" check whenever a job was skipped.
- **Left out:** caching `node_modules`. `setup-node` already caches downloads, and a cache scoped to each PR would make every PR's first run slower; the gain was too uncertain to add.

## Test plan
- [x] `node --test scripts/ci/backend-workflow.test.mjs scripts/ci/changed-areas.test.mjs`: 26 of 26.
- [x] 27 mutants, one per guard (15 on the workflow, 12 on the map), each killed on an `AssertionError`.
- [x] PyYAML parses the workflow into the intended 12 jobs, 4 triggers and `if:` lines.
- [x] `git diff --check`.
- [x] CI on this PR: 12 of 12 green (run 43554451823). Every job ran, as intended for this PR: the base has no map, so `changes` fell back to every job (its log shows `git show` failing on `HEAD^1`).
  - The two render shards add up to the old Render job exactly: 70 + 70 = 140 files, and 1017 + 781 = 1798 tests.
  - The halves took 3m4s and 2m14s, against 4m26s for the one job before. `changes` took 11 s and `ci-ok` 3 s.
- [ ] Independent review (Opus): the map's coverage, the base-map step, ci-ok's rule and the guard test.
- [ ] After merge, the owner: switch on the merge queue and require "CI result". The integration-branch push trigger then goes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
