# 1B-T12 confirming review: the fix round (PR #394, 317cf3a)

- **Reviewer:** a Sonnet confirming workflow (one reviewer, a skeptic for any blocker or major, and this write-up). The reviewer raised no blocker or major, so no skeptic ran. Read-only: the task worktree `.claude/worktrees/p1-1b-t12` was only read, and every probe ran in a scratch copy. This write-up re-read the evidence it cites (last section of "What holds") and ran no tests.
- **Range:** the reviewed head was `ef37c41` (approved in `reviews/1B-T12.md`). The round is two commits on `p1/1b-t12-files-parity`: the merge `68fcbc8` (parents `ef37c41` and `9ddb949`; it brings 0 files outside `.claude/`) and the fix `317cf3a`, which is PR #394's `headRefOid`. From `ef37c41` the change is four files, 49 insertions and 11 deletions: `apps/edge/test/vault-parity-files.db.test.ts`, `apps/edge/test/vault-parity.db.test.ts`, `apps/edge/test/support/vault-worker.ts` and `docs/implementation/receipts/1B-T12.md`. Nothing under `apps/edge/src`. The whole PR against `claude/p1a-vault-core` is six files: the tests, the test support and the receipt.
- **Scratch:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-confirm/`. `tree/` is `git archive 317cf3a` (without `.claude`) with the worktree's `node_modules` linked and the kit's twin harness copied. Every probe edit there was restored byte for byte. The task worktree is clean at `317cf3a`.
- **Verdict:** Approved. No blocker, no major, no minor; six nits, none needs a change on this PR. The merge still waits for CI's edge job, which has never run on this head (billing): see "CI on PR #394".

## Summary: what the round set out to fix, and whether it did

The first review approved `ef37c41` with one minor (m1) and eight nits. CI could not run, so the controller folded m1, n4, n5, n6 and P3's wording (the first review's n2) into this PR (`briefs/1B-T12-fix.md`, the planner's kit `scratch/1b-t12-fix-planner/`, rulings F1 to F6). n1, n7 and n8 stay with 1B-T13; the rest of n2, and n3, with snapshot-parity-window. All five items are met:

- **m1 (no sanity assertions, so a session that fails alike on both sides could pass):** met. `vault-parity-files.db.test.ts` now asserts, after the comparison, the six statuses its NestJS sibling checks. Probe V1 (uploads off on both sides) survived on `ef37c41` and is killed now (`expected 404 to be 202`).
- **n4 (the R92 message was unconditional, and key order was invisible):** met. The message is a condition, and each listed step carries `nestText` and `vaultText`, both answers as text in their own key order.
- **n5 (the default `background: 'on'` was pinned by no test):** met. A new case in `vault-parity.db.test.ts` pins `vault.config`; it needs no database and fails under O1.
- **n6 (`startVaultWorker` leaked its temp store if `configFor` threw):** met. `configFor` now runs before `mkdtempSync`.
- **P3's wording (the first review's n2):** met. The receipt and the test header now name both NestJS rules (day 8 and day 30) and the vault's fresh build, and every citation is right.

The round is test-only and small, and it holds under the reviewer's own probes and 6 of the planner's 19 mutants.

## CI on PR #394

- **Did it run for `317cf3a`? No.** Run `42774078632` (`pull_request`, created 2026-11-10 07:15 UTC) is on head `317cf3a0b857826951ffd96d57080b401a65e5f1`, the PR's `headRefOid`. All nine jobs show `fail` after 2 to 3 seconds with 0 steps: Edge Worker (types, unit, workerd, build, PostgreSQL container); SQL integration and ops (local PostgreSQL 17 container); Typecheck, unit, API, build; Exports (web and iOS bundles); Release image and smoke (never pushed); Render (every file but the per-section suites); and the three per-section render jobs.
- The check-run annotation (the reviewer read all nine; re-read here for the edge job) says: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings". Nothing ran: GitHub Actions is paused for billing, so these are not test failures. No one waited for a rerun.
- GitHub reports the PR `OPEN`, `MERGEABLE`, `mergeStateStatus` `UNSTABLE`.
- **The merge waits for a green `Edge Worker (types, unit, workerd, build, PostgreSQL container)` job.** Its `test:edge:db` step (`.github/workflows/backend.yml:199`, after `build:edge` at `:198`) must list `vault-parity-files.db.test.ts` (3 tests), `parity-files.db.test.ts` (1) and `vault-parity.db.test.ts` (3, up from 2 by the n5 case) as passed. A listed difference is fixed in `src/vault` or `src/v1` under a fix round, never in the session or the normalizer (plan Step 5).
- **Earlier evidence:** CI run `42634746140` (head `b33a59d`, 9 November, success) ran `parity-files.db.test.ts` (1 test, which already held the same six status assertions) and `vault-parity.db.test.ts` (2 tests) green against real NestJS, in a `test:edge:db` of 9 files and 64 tests (read in its database job's log here). So the six statuses already hold on the real API. The NestJS comparison of the files session itself (`vault-parity-files.db.test.ts`) stays unobserved until the edge job runs.

## Findings

No blocker, no major, no minor. Six nits, in the order the reviewer raised them. None needs a change on this PR; each has a carrier.

### Blocker

None.

### Major

None.

### Minor

None.

### Nits

**confirm-n1. n5's path pattern names `dist/jotbun_vault`, which 1B-T13 moves, and `followups.md` does not list it under 1B-T13.** Carrier: 1B-T13.
- **Evidence:** `apps/edge/test/vault-parity.db.test.ts:77` pins `/\/dist\/jotbun_vault\/wrangler\.json$/`. Plan `docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md:1106` has 1B-T13 make the built config `dist/server/wrangler.json`, and `:1182` (T13 Step 4) runs `vault-parity.db.test.ts` on it. The reviewer's regex check in node: true for `.../dist/jotbun_vault/wrangler.json`, false for `.../dist/server/wrangler.json` and for the parity copy. So the case fails loudly at T13's own gate unless edited; it cannot pass silently. The receipt (lines 25, 36 and 37) and the fix brief say T13 must move it, but `followups.md:432-435` lists only n1, n7 and n8 under 1B-T13.
- **Probe:** a looser pin, `/\/wrangler\.json$/`, in a scratch copy passes at baseline (`Tests  2 passed | 1 skipped (3)`, `loose-baseline.log`) and O1 is still killed, because the parity copy is `wrangler.parity.json` (`mutants-loose/O1.log`). The committed file was not edited.
- **Action:** loosen the pattern in 1B-T13 (it edits `vault-worker.ts` again anyway), or add the pattern to T13's carry list. Nothing on this PR.

**confirm-n2. `followups.md:431` still lists `vault-parity.db.test.ts` as 2 tests; CI will show 3.** Carrier: follow-up (the controller's file).
- **Evidence:** `followups.md:431` reads "(vault-parity-files 3, parity-files 1, vault-parity 2)". The committed file has three cases (`vault-parity.db.test.ts:39`, `:59` and `:76`: the money comparison, "isolates people", and the n5 case). The receipt (lines 16 and 37), the PR body (its checklist) and `handover.md` (the fix-round entry, line 435 at this write-up) all say 3. Someone checking the edge job against the stale line would read the third case as an extra test.
- **Action:** correct the merge condition to 3, 1 and 3.

**confirm-n3. n6's order (`configFor` before `mkdtempSync`) is pinned only by the uncommitted probe (brief F4, accepted).** Carrier: follow-up, no action.
- **Evidence:** mutant N6 (`configFor` back after the store and the KV seeding) is killed only by `n6-leak.probe.db.test.ts`, which lives in the kit's twin folder and is never committed (receipt line 36). `git grep` over `apps` finds the temp prefix `jotbun-vault-` and `wrangler.parity` only in `vault-worker.ts` (lines 23 and 56), so no committed test names them. The reviewer's rerun: N6 killed (`expected [ 'jotbun-vault-GJb5FD' ] to deeply equal []`, `mutants/N6.log`). Nothing in CI notices the order reverting.
- The first review's n6 was itself a nit and the brief accepted this; recorded for completeness.

**confirm-n4. P3's "build starts afresh" holds only while `default_retention` stays on the Workflows bindings, and the test header says it without that condition.** Carrier: 1B-T13 (the first review's n1 already carries the config side).
- **Evidence:** the header (`vault-parity-files.db.test.ts:18-19`) and receipt line 12 say a resend after day 8 opens a pending row "whose build starts afresh". That rests on two things. First, Workflows `create` throws only while an id's old instance is within its retention, and with no `retention` on `create` the binding's `default_retention` applies, else the account maximum, 30 days on Paid (Workflows docs, read here via Context7 `/websites/developers_cloudflare_workflows`: `create` and the `WorkflowInstanceCreateOptions` notes). Second, `default_retention` of 1 day on success and 7 on error at `apps/edge/wrangler.vault.jsonc:35-36`; `createOnce` (`src/vault/files/work.ts:45-55`) passes no per-instance retention. Without the binding setting, a resend in days 8 to 30 would count a retained id as started. The receipt cites `wrangler.vault.jsonc:35-36`; the header names no dependency, and 1B-T13 deletes that file (plan `:1109`).
- **Action:** nothing beyond keeping the first review's n1 on T13's list (keep both `default_retention` blocks and pin them in `c1-shape.test.ts`).

**confirm-n5. The receipt's Files bullet still says `vault-parity.db.test.ts` is unchanged.** Carrier: follow-up, no action.
- **Evidence:** `docs/implementation/receipts/1B-T12.md:4` says `background` defaults to on "so `vault-parity.db.test.ts` is unchanged" and lists no fix-round file. The fix-round section (lines 19-37) and line 16 do record the new n5 case, so the receipt reads right only top to bottom.
- The committed receipt also differs from the kit's `real/` copy by two things: the filled `MERGE_LINE` (`9ddb949` in `68fcbc8`, which is true) and one Deviations bullet (line 36, F1 to F6) that the fixer added beyond brief Step 8. Its text matches the brief's rulings and nothing in it is inaccurate.

**confirm-n6. #398 (alarm-hardening) also edits vault files the session reaches; neither range holds the other.** Carrier: follow-up (merge order).
- **Evidence:** `gh pr view 398 --json files` lists `apps/edge/src/vault/files/previews.ts`, `attachments.ts` and `jobs.ts`, and also `user-vault.ts`, `schema.ts` and a new `0004_alarm_bounds.sql` migration. #396 lists `src/v1/files/downloads.ts`, `receipts.ts`, `slots.ts`, `uploads.ts` and `src/v1/handler.ts` (the first review named #396 only). The 42-step session reaches the import preview (step 28) and the receipt steps, and #398's diff changes the due-time reads that run after every write. Neither PR touches this PR's files, and none of the three has merged: all are open, and `git diff 317cf3a...origin/claude/p1a-vault-core -- apps packages docs/implementation` is empty at the current integration head `acf658d` (it was `edfca81` when the reviewer ran; the three commits since are controller-state syncs). #397 is test-only under `apps/edge/test/workers/` and changes nothing the session runs. This review did not probe the vault with #396 or #398 applied.
- **Action:** read the edge job of whichever of #394, #396 and #398 merges last, on a head that holds all three.

## What holds

### 1. m1, and F1's `?.`

- The six assertions (`vault-parity-files.db.test.ts:66-72`) equal `parity-files.db.test.ts:46-52` under `diff -w`, except `nestRun[i]?.status` for `nestRun[i]!.status` (F1). Each of the six names occurs once in the 42 `STEPS` (no duplicate names), and `expected-nest.json` (lens A's derivation from `apps/api`, sha `56857b4d...`) holds 202, 202, 202, 200, 200 and 201 at steps 2, 13, 24, 28, 5 and 36. They sit after the comparison, so a listed difference still headlines.
- **The twin** (the committed tests with only the PostgreSQL and NestJS side replaced, NestJS replayed from `expected-nest.json`): baseline `Tests  3 passed (3)` (`baseline-files.log`). V1 rerun: `Tests  1 failed | 2 passed (3)`, `expected 404 to be 202`. The fixer's `red.out` shows V1 surviving on `ef37c41` (`Tests  3 passed (3)`), so the round turns a surviving mutant into a killed one.
- **The sibling's identical block has already passed against real NestJS:** CI run `42634746140` passed `parity-files.db.test.ts` (1 test) on `b33a59d`, where lines 151-156 hold the same six `byName.get` assertions (in since `b22c41c`, checked with `git log -S`). So the six statuses hold on the real API.
- **F1, is there a CI path where a NestJS entry is null and the assertion silently passes? No.** `runFilesSession` returns `(Seen | null)[]` and pushes `null` only in vault mode at the two `signIn` steps (`files-session.ts:130-138`). CI calls `runFilesSession(nest.send, ..., 'nest')` (`vault-parity-files.db.test.ts:52`), so no NestJS entry is null there, and none of the six asserted names is a `signIn` step. Probe: replaying a null NestJS entry at `snapshot` fails loudly with `TypeError: Cannot read properties of null (reading 'body')` at `:58`, before the six assertions are reached (`f1-null-snapshot.log`); an `undefined` status would fail `toBe(202)` as well.

### 2. n4

- The message (`:64`) is a condition: "a listed step whose nest and vault answers print alike differs in key order (R92): compare its nestText and vaultText". `nestText` and `vaultText` are built at `:60-61`.
- **Key-order run** (the kit's `expected-key-order.json`: step 13's acknowledgement with two keys swapped): `Tests  1 failed | 2 passed (3)`, one listed step, `13. export`. The `nest` and `vault` objects print sorted and alike, while `nestText`'s body starts `{"entity_id"...` and `vaultText`'s starts `{"command_id"...` (`n4-key-order.log`). That equals the kit's `proof/b5-new-n4-key-order.log` and the fixer's `green-n4.log` apart from the RUN path and the timings (diffed here); the kit's `proof/a5-old-n4-key-order.log` shows the old message with alike objects and no text.
- **Status run** (my O4, and the fixer's and kit's M3t): the same condition headline, with listed steps 3, 5, 15 and 17 whose objects differ (`pending` against `ready`, 202 against 200) and carry their texts, so a status difference cannot be mistaken for key order.

### 3. n5

- The case (`vault-parity.db.test.ts:74-78`) asserts `vault.config` matches `/\/dist\/jotbun_vault\/wrangler\.json$/`. In the twin it passes (`Tests  2 passed | 1 skipped (3)`; the money case needs the database) and O1 (the default flipped to `'off'`) kills it: `expected ... to match /\/dist\/jotbun_vault\/wrangler\.json$/`.
- The case body needs no database, but the file's `beforeAll` (`startEdge`, `startNest`) needs PostgreSQL and `apps/api/dist`, so the committed file ran here only through the twin and CI is its first real run. CI's count for the file is 3. The pattern against 1B-T13: confirm-n1.

### 4. n6

- `startVaultWorker` has two callers in the repo (`git grep`): `vault-parity.db.test.ts:30` with defaults, and `vault-parity-files.db.test.ts:42` with `'off'`. `configFor('on')` only joins paths with no I/O, so moving it before `mkdtempSync` changes nothing for the default caller. For `'off'` the parity file is now written before the KV put, which reads only the built config (`-c VAULT_CONFIG`, `vault-worker.ts:60`). The only observable change is an earlier throw with no store left behind. The fixer's `red-n6.log` shows the leak on `ef37c41`'s order and none with the fix; N6 is killed by the uncommitted probe (confirm-n3).

### 5. P3 against the first review's n2

- Receipt line 12 and the header (`vault-parity-files.db.test.ts:12-19`) now name: the manifest sweep as day 8 (`gogospend_prune_expired_manifests`, `apps/api/drizzle/0010_sync.sql:216-226`, `interval '7 days'` past expiry); the succeeded job answered as `expired` (`apps/api/src/sync/snapshot.repository.ts:63-65`); the 30-day finished-job prune (`gogospend_prune_finished_jobs`, `0015_privacy.sql:815-830`); the vault's keep-and-delete (`apps/edge/src/vault/files/snapshots.ts:41`, `:348`); the new pending row (`snapshots.ts:90-93`); and the retention (`wrangler.vault.jsonc:35-36`). Every citation was read here and is correct. Both sides answer `expired` on days 1 to 8 (`snapshot.repository.ts:37`, `snapshots.ts:116`), so the difference does start at day 8.
- The Workflows rule behind "build starts afresh" matches the docs (see confirm-n4). n2's two requests (cite both rules, close open question (d)) are met, and the old wording ("it keeps a finished job 30 days") is gone from the PR's files. One condition is noted in confirm-n4.

### 6. Mutants

- 6 of the planner's 19 rerun in the scratch tree through the kit's scripts, each restored byte for byte (the mutated files hash equal to the worktree afterwards): V1, O1, N6, M1 (steps 2 and 3 listed), M2 (steps 24 to 26 listed) and O4 (the comparison lists 4 steps under the new headline). **6 of 6 killed, survivors `[]`, not restored `[]`** (`mutants.out`).
- The fixer's own `mutants.out` reads 19 of 19 killed. The reviewer's own probes: the null replay (F1), the loose n5 pattern, a planted type error, and the n4 key-order rerun.

### 7. The gate and the scope

- **Typecheck:** `typecheck:edge` exit 0 in the scratch tree, and a planted type error in the committed files test makes it fail (`test/vault-parity-files.db.test.ts(92,7): error TS2322`, `typecheck-negative.log`), so the gate does cover the committed tests. `build:edge` exit 0; the reviewer counted 0 of 5 PostgreSQL driver markers in `dist/jotbun_vault/index.js`. `git diff --check origin/claude/p1a-vault-core...317cf3a` is clean. The repo has no lint or format step (`.github/workflows/backend.yml`, the package scripts).
- **The fixer's claims** in the receipt's fix round agree with its logs and the reviewer's reruns: `red-baseline.log` 3 passed, V1 and O1 surviving on `ef37c41`, the n6 leak (`red-n6.log`), the green runs, 19 of 19 killed, `test:edge` 15 files and 176 tests (`gate-test-edge.log`), the files smoke answers `cmp`-equal to `expected-nest.json`.
- **Scope and hygiene:** the three changed test files in the worktree are byte-equal to the kit's `real/` copies (sha256; the kit's `SHA256SUMS` is 64 of 64 OK). The commit message follows the protocol (a plain imperative summary line, a short body, `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`). No package, no lockfile, no `premium-progress.md` (R87), nothing under `apps/edge/src`.

### 8. The lock and what was left behind

- The heavy lock was taken only through the kit's `run-twin.sh` and `run-smoke.sh` (mkdir, then rmdir on exit, also after failures). When the reviewer finished, and again early in this write-up, the lock (`/private/tmp/claude-501/jotbun-heavy.lock`) did not exist and no `workerd` or `wrangler` process was running; no `jotbun-vault-*` store is left from these runs. Other agents have taken the lock since (their `vitest` runs are in other scratch trees); they are not ours and were not touched. The main checkout and the task worktree were not touched either.

### 9. Not run, by assignment, and checked in this write-up

- **Not run (R100 and the brief):** whole suites, `test:edge`, `test:edge:workers` and `test:edge:db` (Docker stopped). The real NestJS comparison and the three CI counts remain CI's. In the twin, NestJS is replayed from `expected-nest.json`, so a pass proves the vault equals that derivation, not NestJS itself.
- **Re-read for this write-up:** `gh pr checks 394` and the run's jobs, head and annotation; the PR's file list, state and head; the earlier green run's database job log (`parity-files.db.test.ts` 1 test, `vault-parity.db.test.ts` 2 tests, `test:edge:db` 9 files and 64 tests); `git log` and `git diff` for the merge and the integration head; the cited lines in the two parity tests, `files-session.ts`, `vault-worker.ts`, `work.ts`, `snapshots.ts`, `snapshot.repository.ts`, `0010_sync.sql`, `0015_privacy.sql`, `wrangler.vault.jsonc`, the plan (`:1106`, `:1109`, `:1182`), `followups.md:431-435` and the receipt; the Workflows docs through Context7; and the reviewer's and fixer's logs named above. One reviewer citation was off: the handover line that says "CI count 3" is `handover.md:435`, not `:428`; the claim itself holds.

## Notes for later tasks

- **1B-T13:**
  - Move the n5 case's path (`vault-parity.db.test.ts:77`) together with `VAULT_CONFIG` and `PARITY_CONFIG` (the first review's n7), or loosen it to `/\/wrangler\.json$/` (confirm-n1). `followups.md:432-435` lists n1, n7 and n8 only; add it there.
  - Keep the first review's n1: `default_retention` (1 day on success, 7 days on error) on both Workflows bindings, pinned in `c1-shape.test.ts`. The files test's header claim that a resend after day 8 starts a build afresh depends on it (confirm-n4); name the dependency in the header if T13 edits it.
  - The first review's m1 note ("as 1B-T13's first step, before it deletes `parity-files.db.test.ts`") is no longer needed: the six assertions now live in `vault-parity-files.db.test.ts`.
- **The controller, at the merge:**
  - Correct `followups.md:431` to "vault-parity-files 3, parity-files 1, vault-parity 3" (confirm-n2).
  - Read the edge job of whichever of #394, #396 and #398 merges last, on a head that holds all three (confirm-n6).
  - If the files comparison lists a difference once CI runs, each listed step carries `nestText` and `vaultText`: two answers that print alike as objects differ in key order (R92). Fix it in `src/vault` or `src/v1`, never in the session or the normalizer.
- **snapshot-parity-window:** the wording part of the first review's n2 is in this PR. The rest of n2, and n3 (pending snapshots and exports older than a day turn `failed` on the vault, never on NestJS), stay as `followups.md` lists them.

## Scratch evidence

All paths are under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-confirm/` unless stated.

- **Twin baselines and gate:** `baseline-files.log`, `baseline-money.log`, `build.log`, `typecheck.log`, `typecheck-negative.log`.
- **Mutants:** `mutants.out` and `mutants/*.log` (V1, O1, N6, M1, M2, O4, with `*.orig` copies); `mutants-loose.out`, `mutants-loose/O1.log` and `loose-baseline.log` (the loose n5 pattern, scratch only).
- **Probes:** `f1-null-snapshot.log` (a null NestJS entry), `n4-key-order.log` (a key-order difference).
- **The scratch copy:** `tree/`.
- **The fixer's logs:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-fix/` (`red.out`, `red-baseline.log`, `red-n6.log`, `green-*.log`, `mutants.out`, `gate-*.log`). **The kit:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-fix-planner/`.

VERDICT: Approved
