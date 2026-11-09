# Review: 1A-T8b-followup "the money journey and two retention pins"

- Reviewer: Opus, read-only. Commit `ec4dc79` plus the merge `0c437ff` (integration head `c1ef35c`) on `fix/1a-t8b-followup` (worktree `.claude/worktrees/fix-1a-t8b-followup`), range `origin/claude/p1a-vault-core...HEAD` after `git fetch`. The merge-base is `c1ef35c`, so the range is exactly `ec4dc79`'s five files; the merge itself brings only `fix/flaky-tests` (#342) files (app render setup, three API specs, `premium-progress.md`) and nothing under `apps/edge`.
- Spec: brief `.claude/controller/briefs/1A-T8b-followup.md`; the 1A-T8b review (`reviews/1A-T8b.md`: minor 1, minor 3, and "Follow-up 1A-T8b needs once 1A-T7 merges"); plan `2026-10-25-jotbun-p1a-vault-core.md` Task 8 (line 714, halves note line 716, line 734) and rulings R5, R6, P2; protocol R87.
- Scratch: `.claude/controller/scratch/1a-t8b-followup-review/` (`tree/` is `git archive HEAD` with the worktree's root, `apps/edge` and `apps/api` `node_modules` symlinked; `scripts/review_mutants.py`; `logs/`). Every workers run held the heavy lock (taken 17:35:14, released 17:40:49, `logs/lock.state`). The worktree is untouched (clean, HEAD `0c437ff`), and every file I mutated in `tree/` compares equal to the worktree's afterwards.

## Verdict

VERDICT: Approved. No blockers, no majors, no minors. Three nits follow. The change is test-only plus the one plan line. The four edited files match the planner's verified `real/` checksums byte for byte, and every claim in the receipt held when I re-ran it at HEAD.

## Findings

### Nit 1. The money journey's summary check is a substring match, so a wrong total passes it

`history.test.ts:482-483` checks `toMatchObject({ month: '2026-10' })` and `JSON.stringify(summary)` contains `'6000'`. My mutant J7 (`summary.ts:74`, `expense_minor: '0'` in the returned summary) passes all 81 focused cases, the journey included, because the category total still carries `6000`. `summary.test.ts` kills it (4 of 7 cases fail, `logs/mutant-J7-summary-file.log`). This is the API case's own assertion (`apps/edge/test/dispatch.db.test.ts`, same lines), ported by name and assertion under R5, and the brief's scope is the `it.todo` flip only. So nothing to fix here. The journey catches a summary that loses the record (J1), not a wrong total.

### Nit 2. The receipt's Deviations line is garbled, and one RED gloss is loose

- "The brief expected higher counts than the planner's" says the opposite of what happened. The brief's counts are the planner's (at `01a5114`), and the implementer saw higher counts (343 passed and 3 todo in 20 files, against 306 and 3 in 16). The next two sentences explain it correctly: 1C-T1 (#334) and P5-T4 (#343) merged after `01a5114` (confirmed with `git log --first-parent 01a5114..3ab5d42`). Suggested: "The workers counts are higher than the brief's, which the planner measured at `01a5114` ...".
- The RED bullet glosses `expected 0 to be greater than ...` as the stray alarm "still due in the past". The `0` is the `?? 0` fallback for a null alarm, so the alarm was firing at that moment. The receipt's own design note says this correctly ("a stray alarm that is firing reads as null"), and the brief said "due in the past or firing".

### Nit 3. `clockAhead` is local to `history.test.ts`

The integrator note points future tests at "`clockAhead` in `history.test.ts`", but that helper is not exported, and `transactions.test.ts:208-214` already repeats it inline (with the alarm read at `:227`). The brief chose the inline copy so that no shared support file changes, which is reasonable here. If a third file needs it, `support/v1-client.ts` (next to `vaultOf` and `createLunch`) is the natural home.

## What I checked, with evidence

### Scope and files

- `git diff --stat origin/claude/p1a-vault-core...HEAD`: exactly five paths. They are `history.test.ts` (+35/-12), `retention.test.ts` (+28/-1), `transactions.test.ts` (+14/-3), the new receipt `docs/implementation/receipts/1A-T8b-followup.md`, and the 1B plan (one line). Nothing under `apps/edge/src/`, no route, migration, lockfile or `premium-progress.md` change (R87).
- SHA-256 at HEAD:
  - `history.test.ts` `ceb1ee8d...`, `transactions.test.ts` `83015707...`, `retention.test.ts` `3e4ca5d4...` and the 1B plan `7799ea20...` all equal `PL/SHA256SUMS` `real/`.
  - `src/vault/retention.ts` is `be59fcdf...`, as the brief expects.
- The plan edit is only the wording fix: line 1130 `| 1A-T7 (turned on in 1A-T8a), same name |` becomes `(turned on in 1A-T8b)`. The other `1A-T8a` mentions in that plan (lines 144, 745, 755, 810) are about sync and stay correct.
- `git diff --check origin/claude/p1a-vault-core...HEAD`: no output, exit 0.

### Determinism

- FOCUSED (`history` + `retention` + `transactions`, verbose) five times at HEAD: `Test Files 3 passed (3)`, `Tests 81 passed (81)` each time (`logs/green-1..5.log`). The journey, the new retention case, the S1 case and the three restore-window cases are listed as passed in each run.
- Beyond those five runs, 23 more focused runs under mutants (below) never failed a case other than the one each mutant targets. That makes 28 runs of each file.
- Margin probe (`logs/probe-alarm-margin.log`): I added a 2-second wait plus a print at the end of each restore-window case, in `tree/` only (restored after). After the wait, the armed alarm was still 6.999 days (`just inside`), 7.000 days (`exactly 30 days`) and 6.000 days (`restore fails after 30 days`) in the real future, and the expired record was still there. So the cases do not depend on how fast they run.
- Full workers suite at HEAD: `Test Files 20 passed (20)`, `Tests 343 passed | 3 todo (346)` (`logs/workers.log`). The 3 todos left are the `sync.test.ts` snapshot ones; the journey is no longer a todo.

### The money journey (it.todo to it, R5)

- `history.test.ts:459-508`: `it(` replaces `it.todo(`, and the comment is in the past tense. The body equals `dispatch.db.test.ts`'s case line for line, except for the client helper (`client` and `member` instead of `edge`, and an explicit wallet POST instead of `walletOf`).
- Mutants, applied to `tree/`, run against the three focused files, then restored byte for byte (`logs/review-mutants.out`, `logs/review-mutants-2.out`, `logs/planner-mutants.out`):

| Mutant | Change | Result |
| --- | --- | --- |
| MJ (planner's) | drop `'budgets.put'` from `VAULT_HANDLERS` | killed: only the journey fails |
| J1 | summary `MONTH_SCOPE` reads `deleted_at IS NOT NULL` | killed: only the journey fails |
| J2 | `lookupStatuses` answers every id `unknown` | killed: the journey and two retention cases |
| J3 | the sync page query leaves out `budget` groups | killed: only the journey fails |
| J4 | `history.list` returns no items | killed: the journey and 4 history cases |
| J6 | `budgets.get` returns `overall_limit_minor: '0'` | killed: only the journey fails |
| J5 | `scopedTotals` `expense_minor: '0'` | the journey survives; a history totals case kills it |
| J7 | the summary's `expense_minor: '0'` only | the journey and the focused set survive; `summary.test.ts` kills it (nit 1) |

- Within the focused set, the journey is the only case that catches J1, J3, J6 and MJ. It exercises history, summary, budgets, status and sync end to end, and fails when any of them breaks, apart from the total that nit 1 describes.

### X1 and X3 (review minor 1)

- **X1:**
  - The S1 case now runs the second alarm at `t0 + 61 * DAY`, the armed time it asserts on the line before (`retention.test.ts:262-264`). That is fix 1 of the review exactly.
  - X1 (prune cut `<=` becomes `<`, `retention.ts:195`) fails only that case.
  - X1 combined with the old `t0 + 62 * DAY` passes all 81 cases (`X1-with-old-62d`). So the pin, and nothing else, is what kills it.
  - The edit's `committed_at` and the prune's `isoAgo` are the same ISO millisecond, so the boundary comparison is exact.
- **X3:**
  - The new case (`retention.test.ts:293-317`) is fix 2 of the review: delete the lunch, rename the wallet, add a failing-purge trigger and run the alarm at `t0 + 31d`, then drop the trigger, run it again and assert that `pruned_through` is unchanged.
  - Revisions: wallet 1, built-ins 2, lunch 3, delete 4, rename 5. The prune moves the line to 5. The retried purge's `old` is 4, so `max()` keeps 5, and the bare value would lower it to 4.
  - The precondition `line > head(lunch).revision` (`:313`) guards against an equivalent mutant. Without the rename, the line would be 4 and X3 would be equivalent, and that check would fail first.
  - X3 (`max()` removed, `retention.ts:163`) fails only this case. My X3-min (`max` becomes `min`) fails it and `tombstones reach delta readers`.
  - Every alarm the case arms (`t0 + 31d + 60 s`, then about `t0 + 30d`) is in the real future (R6).

### The clock pins (review minor 3)

- **What changed:**
  - `clockAhead` (`history.test.ts:236-247`) and the inline pin (`transactions.test.ts:208-214`) set `vault.clock` to `Date.now() + 7 days`, and the deletion is backdated from that same instant.
  - The restore command (`domain/transactions.ts:310`) and the deleted list (`reads/deleted-history.ts:36`) both take their cutoff from `c.now`, the vault clock. So each case's relation to its clock is unchanged: `at - 30d` against `at - 30d - 1 ms` in `exactly 30 days`, and 31 days in `transactions`.
  - `just inside` now runs on a fixed clock with exactly ±60 s, where before it drifted by the request's own latency. That is stricter.
- **Boundary mutants**, all killed with the pins in place:

| Mutant | Change | Killed by |
| --- | --- | --- |
| B1 | restore `deleted_at < cutoff` becomes `<=` | `exactly 30 days` |
| B5 | restore cutoff 1 ms earlier | `exactly 30 days` |
| B2 | deleted list `>=` becomes `>` | `exactly 30 days` |
| B3 | restore cutoff from `Date.now()` instead of `c.now` | all three restore-window cases |
| B4 | deleted list from `Date.now()` | `exactly 30 days`, `just inside` |

  The week's shift hides no off-by-one. B3 and B4 are caught more surely than before, because a real-time cutoff is now a week away from the vault's, not a few milliseconds.
- **The end-of-case checks:** `alarm ?? 0 > Date.now()` and the expired row is still there. U1, U2 and U3 (each pin undone; the planner's runner on my copy) each fail exactly their own case. The implementer's RED logs show the three cases failing in 3 of 3 runs with the messages the brief predicts.
- **No other workers file backdates past 30 days and then commits** (grep over `test/workers`):
  - `a purged record is never listed ...` backdates and then only reads, plus a 410 restore, which commits nothing.
  - `history.test.ts:389` backdates one day.
  - `sync.test.ts:179` prunes directly.
  - `retention.test.ts`'s `age()` is followed at once by `runDurableObjectAlarm`.
  - `wallets.test.ts` 1990 rows are followed only by refused patches.
- **Leakage:** none. Each case pins the clock on its own new member's vault.

### Gate at HEAD (scratch copy)

- `tsc --noEmit` (apps/edge): exit 0 (`logs/typecheck.log`; my first attempt needed `apps/api/node_modules` linked as well).
- `test:edge`: `13 passed`, `162 passed` (`logs/test-edge.log`).
- `test:edge:workers`: `20 passed`, `343 passed | 3 todo (346)`.
- `build:edge`: passes. `grep -c vault_retention_ dist/jotbun_vault/index.js` prints 1, and the PostgreSQL grep prints 0 (`logs/build.log`).
- `test:edge:db`: SKIPPED. Docker is stopped and not started, and no PostgreSQL code changed.

### Receipt (R87) and commit

- **Receipt:**
  - It is its own file, `docs/implementation/receipts/1A-T8b-followup.md`, starting with `# 1A-T8b-followup: the money journey and two retention pins`. It follows the house style (Status, Files, RED to GREEN, Mutation check, Gate, Deviations, SKIPPED, Notes), with no em dash and a final newline.
  - Every number matches the implementer's logs and my runs:
    - baseline `79 passed | 1 todo (80)`;
    - RED `3 failed | 77 passed | 1 todo (81)` ×3;
    - GREEN `81 passed` ×5;
    - the 6 mutants as stated;
    - `test:edge` 162 in 13 files;
    - workers 341 and 4 todo before, 343 and 3 todo after, in 20 files;
    - build 1 and 0 matches.
  - The base `3ab5d42` is `ec4dc79`'s parent. The later merge `0c437ff` changes no edge file, and my counts at HEAD are the receipt's.
  - Wording: nit 2.
- **Commit `ec4dc79`:**
  - Summary "Turn on the money journey and pin two retention guards" (54 characters, imperative, no prefix), the brief's body, a blank line, then `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`, as protocol step 8 asks.
  - Only those five paths.

VERDICT: Approved
