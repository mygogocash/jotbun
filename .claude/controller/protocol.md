# Jotbun task protocol (every subagent reads this first)

> **8 November 2026:** macOS cleared `/private/tmp`, which held the old briefs, planner files and checksums. From now on, briefs live in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/`, reviews in `.../controller/reviews/`, and each agent's scratch files in `.../controller/scratch/<task>/`. Never put anything you need to keep under `/private/tmp`. The heavy lock stays at `/private/tmp/claude-501/jotbun-heavy.lock`.

> **R87 (controller, 8 November 2026): receipts go in their own file.** Every receipt appended to the end of `docs/implementation/premium-progress.md` made every other open pull request conflict there and rerun CI. From now on a task (or a fix round started after this date) writes its receipt to `docs/implementation/receipts/<task-id>.md` (for example `receipts/1B-T5.md`, `receipts/1B-T4-followup.md`), in the same house style, starting with a `# <task-id>: <title>` heading, and does not edit `premium-progress.md`. Wherever this protocol or a brief says "the receipt in `premium-progress.md`", read it as that file. Briefs written before this date keep their own instructions.

Repo: `/Users/kunanonjarat/Developer/jotbun` (GitHub `mygogocash/jotbun`). Integration branch: `claude/p1a-vault-core`.
The orchestrator (not you) pushes, opens pull requests, merges and closes issues.

## Where you may work

- Work only inside the worktree path your brief names (`/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/<name>`).
- Never edit, reset or run git in: the main checkout `/Users/kunanonjarat/Developer/jotbun` (another session's uncommitted work lives there), the integration worktree `.claude/worktrees/p1a-vault-core`, or any other task's worktree.
- Reviewers and brief writers are read-only: no edits, no commits, anywhere in the repo. Scratch files go under the agents scratch folder named in your brief.

## Hard rules

- Git: `/usr/bin/git`, one plain command per call, run from inside your worktree. Never `git stash`, `git reset --hard`, `git clean`, `git checkout -- <path>` on files you did not create, rebase, amend a commit you did not make, or push. Never delete a branch.
- The plan is the spec: `docs/superpowers/plans/<plan>.md`, section `### Task <id>`, plus the rulings it cites (`docs/superpowers/plans/2026-10-25-jotbun-phases-3-6-boundaries.md`, the spec `docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md`). If the plan is ambiguous, contradicts the code, or needs an owner decision, stop and report `BLOCKED` with the exact question. Do not guess.
- Edit only the files your task names. Shared files (route tables, the command registry, `protocol.ts`, `env.ts`, `en.json`, `th.json`, `packages/contracts/src/index.ts`, ...) take additive edits in their documented order.
- No new npm packages unless the task names them; no lockfile changes otherwise; nothing under `vendor/`. No deploys, no hosted services, no secrets, no network calls beyond `npm ci` and `git fetch`.
- Amounts stay exact (minor units as strings/BigInt, `CAST(... AS TEXT)` out of SQLite). Never log amounts, names, notes or slip content.
- Copy: user-facing strings go through the existing i18n catalogs (`apps/app/src/messages/en.json` and `th.json`), Thai first-class.

## Procedure (handover section 4)

1. **Sync:** `/usr/bin/git fetch origin claude/p1a-vault-core` then `/usr/bin/git merge --no-edit origin/claude/p1a-vault-core`. In `docs/implementation/premium-progress.md`, `en.json` and `th.json` keep both sides of a conflict. Any other conflict: resolve only if it is plainly additive; otherwise report BLOCKED.
2. **Install** if `node_modules` is missing at the worktree root: `npm ci --ignore-scripts --no-audit --no-fund`. Edge work also needs `npm run install:edge`.
3. **RED:** behavioural tests that fail on assertions against compile-safe seams (a missing module is not a RED). Record the failing counts.
4. **GREEN:** the smallest code that passes, exactly as the plan says.
5. **Mutation check:** mutate each new guard or branch, run the focused tests, see them fail, restore the file and confirm `git diff` shows only your intended change. Add a test for every survivor, or explain why it is equivalent.
6. **Gate** (run what your change touches; typecheck always):
   - App: `npm run typecheck:app`, `npm run test:app`, `npm run test:unit`, `npm run test:render -w gogospend-app` (run focused files first, the full suite once at the end), and `npm run export:web -w gogospend-app -- --max-workers 2` when routes, config or app entry change.
   - Contracts and API: `npm run typecheck`, `npm run test:api`, `npm run build -w gogospend-api`, `node apps/api/scripts/release-graph.mjs check`.
   - Edge: `npm run typecheck:edge`, `npm run test:edge`, `npm run test:edge:workers`, `npm run build:edge`.
   - Database suites (`npm run test:db`, `npm run test:edge:db`) and `npm run test:edge:workers` share local ports and containers with other agents, so hold the lock while they run:
     `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done` before, and `rmdir /private/tmp/claude-501/jotbun-heavy.lock` after (also after a failure). If Docker or PostgreSQL is unavailable, record the suite as SKIPPED with the reason; CI runs it.
   - Always: `/usr/bin/git diff --check origin/claude/p1a-vault-core...HEAD`.
7. **Receipt:** add your own section to `docs/implementation/premium-progress.md` in the existing style: status, RED to GREEN counts, mutants, the gate with pass counts, deviations, SKIPPED items, risks and notes for the integrator. Never rewrite another task's section.
8. **Commit** locally: a plain imperative summary line (no type prefix), a short body, then a blank line and `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

## Your final message (the orchestrator reads only this)

- `STATUS: DONE` or `STATUS: BLOCKED` (with the exact blocker) on the first line.
- Commit SHA(s) and branch; files changed.
- RED count, GREEN count, mutants (killed, survivors and why).
- Each gate command with its result (passed or failed, test counts); anything SKIPPED and why.
- Deviations from the plan, and anything the reviewer should look at first.

## Reviewers (Opus)

- Review the commit range `origin/claude/p1a-vault-core...<sha>` against the plan task, the rulings it cites, and this protocol.
- Probe only in a scratch copy: `mkdir -p <scratch> && /usr/bin/git -C <worktree> archive <sha> | tar -x -C <scratch>`; to run tests there, symlink `node_modules` from the worktree. Never edit the worktree.
- Report findings ranked **blocker, major, minor, nit**, each with evidence (file and line, a failing probe, or the plan clause). End with `VERDICT: Approved` or `VERDICT: Needs fixes` (any blocker or major means Needs fixes).
