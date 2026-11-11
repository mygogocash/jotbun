# alarm-hardening review: Harden the vault alarm after 1B-T11 (PR #398)

- **Reviewer:** independent Opus review, run as a workflow. Two lens reviewers covered separate areas, one after the other:
  - the **rules lens**: the alarm rules (m1, n1, n2 and n5 of the 1B-T11 review) and the m4 schema change (R105: 0004's triggers, its backfill, the import index, the upgrade from 0003);
  - the **tests lens**: the pins (PA, PH, PE, PF, and the rows, receipts, upgrade and imports cases), the planner's mutants and its own, the merges with #397, #396 and #394, and CI.

  This file is the synthesis. Neither lens reported a blocker or a major, so no skeptic pass ran and nothing is left unverified.
- **Read-only.** Probes ran only in scratch copies under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/alarm-hardening-review/`. Paths below are relative to that folder.
  - `rules/tree/` and `tests/tree/`: each is `git archive 14844b9`, with `node_modules` linked from the worktree. The rules lens also built `rules/tree-j1/` and `rules/tree-n5/` (the m1 and n5 what-ifs); the tests lens built `tests/tree-m397/`, `tests/tree-b394/` and `tests/tree-m394/` (the merges).
  - `synth/tree/`: `git archive 14844b9` again, for my own spot-check.

  Every workers and mutant run held the heavy lock and released it. The worktree is clean at `14844b9` (`git status --short` prints nothing). The tests lens's `git archive -o` with a relative path put two archives in the worktree root for a few seconds; it moved them to its scratch folder at once. Nothing in the worktree or in the main checkout was edited.
- **Reviewed:** `14844b9` on `fix/alarm-hardening` (PR #398), range `origin/claude/p1a-vault-core...14844b9`, merge base `06fdd97`. One commit, 11 files, all under `apps/edge` except the receipt:
  - new: `src/vault/migrations/0004_alarm_bounds.sql`, and the receipt `docs/implementation/receipts/alarm-hardening.md` (R87);
  - 1B-T11's: `src/vault/files/jobs.ts` and `test/workers/files-alarm.test.ts` (35 cases: 12 new, 2 changed);
  - 1B-T9's `src/vault/files/attachments.ts`, and 1B-T10's `src/vault/files/previews.ts`;
  - shared: `src/vault/user-vault.ts`, `src/vault/schema.ts`, `src/vault/migrations/index.ts`, `src/cloudflare-workers.d.ts` and `test/workers/vault-schema.test.ts`.

  All 10 code and test files are byte-identical to the planner's `real/` copies (the tests lens, and my `synth/tree/`), and every line of the planner's `SHA256SUMS` answers OK. The commit message is the brief's (Step 7.3), with the Haiku trailer.
- **The base has moved since, in controller files only.** `origin/claude/p1a-vault-core` is now `8e1b439`, 15 commits past the merge base. GitHub's compare of `06fdd97...8e1b439` lists 129 files, every one under `.claude/`. GitHub reports PR #398 `MERGEABLE` (`UNSTABLE` only because of the checks below).
- **Against:**
  - the 1B-T11 review (`reviews/1B-T11.md`: m1, m2, m4, n1 to n5 and n9), with followups.md's alarm-hardening entries;
  - the brief `briefs/alarm-hardening.md`, whose P1 to P14 the controller accepted, with P6 recorded as R105, and R104 (`handover.md`, "Rulings this session");
  - plan 1B `### Task 1B-T11` (R37's rule at plan line 1002: "After every alarm, each `schedule.due_at` is later than the vault clock") and the Global Constraints;
  - the receipt and the protocol.

## Summary

**Approved.** There is no blocker and no major. One minor and six nits remain, each with a carrier. **CI never ran** (GitHub Actions is paused for billing), so the merge waits for the nine jobs.

- **The task does what the 1B-T11 review asked.**
  - m1: `pruneSnapshots` runs last. The R37 case's seed is a fair pin: it fails on the base for m1's reason, and the dedicated m1 case pins the order without the seed's offset.
  - n1: a held guard logs `file_run_held` and reports `delete_objects`. It cannot loop, and it cannot add to a real delete failure.
  - n2: the `.catch` logs a refusal and forgets only the alarm it asked for, so a later rearm's alarm stays. Its one residual is n2 below.
  - m4: both reads are bounded. The rows case reads 2 and 6 rows with a hundred held receipts and purged import records, as with none. The triggers list every receipt the vault's own statements can leave without a holder, they fire inside the statement's transaction, the backfill is right on an upgraded vault, and `CROSS JOIN` answers exactly as the old `JOIN` did.
  - n5: under the review's R4 what-if, this `jobs.ts` passes 35 of 35; the base's fails 7.
  - m2, n3 and n4: PA, PH, PE and PF are faithful ports of the 1B-T11 alarm lens's probes, and each kills its mutant.
- **One test is missing (m1).** `pruneAttachments`' full pass is R105's backstop, but a pass narrowed to the listed receipts passes every committed receipt test. The code is right; a ready pin (K1) passes on `14844b9` and kills the mutant. I reran both.
- **Both lenses found the same gap in R105's wording (n1).** REPLACE conflict resolution on `transaction_attachments` removes a holder with no delete trigger firing, so B20 and 0004 both miss it. No vault statement does that today, and the full pass still finds such a receipt at the next alarm.
- **The other nits:** n2's residual after a refused `setAlarm` (n2), two pins weaker than their comments (n3, n4), the receipt's stale owner lines, already listed for correction before merge (n5), and R104's reasons misplaced in `handover.md` (n6).
- **The merges are clean.** #397's pins pass on the tree merged with #398, #396 merges cleanly, and 1B-T12's parity session answers identically with 0004 applied. The four PRs touch disjoint files.

## CI

### Run 42771332803 on `14844b9`: never started (billing)

`gh pr checks 398 --repo mygogocash/jotbun` lists nine failed checks. None of them ran a step.

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | not started, failed after 3 s |
| Exports (web and iOS bundles) | not started, 3 s |
| Render (every file but the per-section suites) | not started, 3 s |
| Render, per-section suites (three jobs) | not started, 3 s each |
| Edge Worker (types, unit, workerd, build, PostgreSQL container) | not started, 3 s |
| SQL integration and ops (local PostgreSQL 17 container) | not started, 3 s |
| Release image and smoke (never pushed) | not started, 3 s |

- Every job has 0 steps. Each annotation reads: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings".
- It is the only run on `fix/alarm-hardening` (event `pull_request`, head `14844b9`, created 2026-11-10 06:51:39 UTC).
- **So no suite ran,** and there are no counts to read. Unverified until it runs: the whole `test:edge:workers` (with the new prune order and 0004 in every vault), `test:edge:db` (1B-T12's parity files included, on whatever head merges), `test:db`, `test:ops`, typecheck, unit, API, build, the render suites, the exports and the image.
- **The merge waits for the nine jobs.** Against a base run of the same integration head, expect:
  - `test:edge:workers`: +0 files and +12 passed (`files-alarm.test.ts` goes from 23 cases to 35; `vault-schema.test.ts` keeps its 14);
  - `test:edge` and `test:edge:db`: +0;
  - the vault bundle: about +5.5 kB, 0004's SQL bundled as text (1,671.04 kB in the planner's base build, 1,676.57 kB in the implementer's);
  - 7 more event lines, all from `files-alarm.test.ts` by design (`file_run_held` 2, `vault_alarm_unset` 4, `file_delete_failed` 1), and no `Unhandled` line. The implementer's AFFECTED run (9 files) logs none of the three.
- **Local stand-ins** (not a substitute for CI):
  - the implementer's gate: `typecheck:edge` exit 0; FOCUSED 2 files, 49 passed; `test:edge` 15 files, 176 passed; `build:edge` exit 0; AFFECTED 9 files, 261 passed, 1 todo; `git diff --check` clean;
  - the tests lens: FOCUSED 49 passed in its copy (56 with its 7 probes), and 3 files, 165 passed on the tree merged with #397;
  - mine: `files-alarm.test.ts`, `attachments.test.ts` and the tests lens's probes, 94 passed on `14844b9` (`synth/base-run.log`).

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. Nothing tests R105's backstop. A `pruneAttachments` pass narrowed to the receipts in `attachment_checks` passes every receipt test.** (tests lens m1)

- **Where:** `attachments.ts:353`, the full pass `UPDATE attachments SET status = 'released' WHERE ${UNHELD}`. R105, bullet 2: "`pruneAttachments`' full pass over every retained receipt stays ... A statement that bypassed the triggers is still found at the next alarm". Brief P6 says the same.
- **Mutant O11** adds `AND id IN (SELECT attachment_id FROM attachment_checks)` to that statement.
  - On the tree merged with #397, all 35 `files-alarm.test.ts` cases and all 61 `attachments.test.ts` cases pass, DU-1, DU-2 and 1B-T9's "the retention step releases a receipt nothing holds ..." included. Only the lens's probes K1 and F2 fail: `2 failed | 101 passed (103)` (`tests/own-mutants.out`; `tests/own/own-mutant-logs/O11.log`: `expected [ [ 'retained' ], [ 'retained' ] ] to deeply equal [ [ 'released' ], [ 'retained' ] ]`).
  - **My rerun on `14844b9` alone** agrees: `2 failed | 92 passed (94)`. The 35 `files-alarm.test.ts` and 52 `attachments.test.ts` cases pass, and the two failures are K1 and F2 (`synth/own-mutants.out`, `synth/own-mutant-logs/O11.log`).
- **Why the tests miss it:**
  - Before 0004, 1B-T9's safety-net case pinned the full pass.
  - Now the receipt that case orphans is already listed: by the retain's own insert trigger, and again by `transaction_attachments_checked_delete`, since the case drops only B20's trigger (`attachments.test.ts:819`). A pass over listed receipts only releases it too.
  - No committed workers test leaves a receipt without a holder around both trigger sets. Every `DROP TRIGGER` on a receipt or holder trigger drops one of B20's, never 0004's: `attachments.test.ts:330` and `:819` and `files-alarm.test.ts:773` (`aroundTrigger`) on `14844b9`, and `attachments.test.ts:1795` (DU-2) on #397's tree.
- **Why it matters:** the full pass is the only thing that finds a receipt orphaned by a statement that goes around the triggers: the REPLACE forms in n1, or a migration that rebuilds a table and forgets the triggers (R105, bullet 3). Under O11 such a receipt would stay retained, with its object kept, and nothing would ever list it.
- **The code is right** (`attachments.ts:353` reads every retained receipt); only the pin is missing.
- **Fix:** add K1 (`tests/zz-lens2-probes.test.ts`) to `files-alarm.test.ts`. It drops both `transaction_attachments_unheld_delete` and `transaction_attachments_checked_delete` around the holder's delete, expects no checks and `attachmentsDueAt` null, then expects `pruneAttachments` to release that receipt and keep the held one. K1 passes on `14844b9` (`tests/runA-focused-probes.log`, `synth/base-run.log`).
- **Carrier:** a follow-up.

### Nit

**n1. REPLACE conflict resolution on `transaction_attachments` removes a holder without firing any delete trigger, so B20 and 0004 both miss it. R105 says the four triggers fill the table "on every SQL statement".** (rules lens L1-replace-bypass and tests lens n1, merged; both rated it a nit)

- **Where:**
  - `0004_alarm_bounds.sql:5-8`: a retained receipt can lose its holder "only by one of the four events below", unless a statement went around B20's triggers;
  - R105 (`handover.md:729-731`) names only a migration that rebuilds a table as a way around them.
- **SQLite:** a REPLACE deletes the conflicting row without firing delete triggers while `recursive_triggers` is off. It reads 0 in the vault (probe F2). `0000_vault_core.sql:93-97` records the same for categories.
- **Probes:**
  - rules RP and tests F2: `INSERT OR REPLACE` swaps a record's receipt. The old receipt stays retained with no holder and is not in `attachment_checks`, so `attachmentsDueAt` answers null, where the base's full-scan term answered now. The next `pruneAttachments` releases it (`rules/probes-2.log`, `tests/runA-focused-probes.log`);
  - F3: `UPDATE OR REPLACE` of a holder onto another record does the same;
  - for contrast, F1: a record purge's cascade (`retention.ts:181`, `DELETE FROM transactions`) fires `transaction_attachments_checked_delete` even with B20 dropped, and the receipt is listed and due. F4: an upsert goes through its UPDATE, so the receipt is released and listed;
  - my rerun of F1 to F4 on `14844b9` prints the same (`synth/base-run.log`).
- **Unreachable today.** No vault statement uses `OR REPLACE`, `REPLACE INTO` or an upsert on `attachments` or `transaction_attachments`. The only writes are `attachments.ts:194`, `:249`, `:263`, `:274`, `:353`, `:357` and `:363`, and `confirmation.ts:507` (grep). B20 has had the same blind spot since 1B-T9.
- **If it ever happens,** the receipt waits for an alarm that runs for another reason (the degraded X5 case P6 accepts), and only the full pass finds it. That is why m1's pin matters.
- **Fix:** R105 names these forms beside a rebuild: a writer of `transaction_attachments` never uses `INSERT OR REPLACE`, `REPLACE INTO` or `UPDATE OR REPLACE`, or else lists the old receipt itself.
- **Carrier:** a follow-up (R105's text is the controller's).

**n2. After a refused `setAlarm`, the next rearm skips R104's keep rule once, and a vault that gets no further call can be left without an alarm.** (rules lens)

- **Where:** `user-vault.ts:173` applies the keep rule only while `alarmAt !== null`. The new `.catch` (`:177-180`) sets `alarmAt` to null after a refusal, even when the storage still holds an earlier, sooner alarm.
- **Probes** (`rules/zz-rules-probes.test.ts`, run in `rules/tree`; `rules/probes-2.log`), each as `[alarmAt, getAlarm()]`:
  - N2e: the stored alarm is `t + 30 s`. A rearm asks for `t + 10 s` and is refused, leaving `[null, t + 30 s]`. The next write's rearm sets `[t + 60 s, t + 60 s]`, 30 seconds later than the alarm the storage held.
  - N2d (`T` refused late, after a `deleteAlarm` and a second `setAlarm(T)`): `[null, T]` until the next rearm sets `[T, T]`.
  - N2a: the refusal lands after a second rearm to the same time returned early (one `setAlarm` call), leaving `[null, null]` while work is due at `t + 10 min`. The next rearm sets `[t + 10 min, t + 10 min]`. Nothing re-arms an idle vault before that: the constructor only reads `getAlarm()` (`user-vault.ts:94`), and the jobs Worker's cron (`wrangler.jobs.jsonc:31-33`) drives the API's queue, not the vaults.
- **Bounded:** the postponement (N2e) is at most `CALL_ALARM_DELAY_MS`, once; the lost alarm (N2a) lasts until the vault's next call; neither loops, and R104's floor holds. Only a storage failure can cause either, since the floor rules out workerd's own refusal of `setAlarm(<= 0)`.
- **It is P5's accepted design,** and the base was worse: `alarmAt` kept the refused time, so the next rearm to that time returned early and the alarm was never set.
- **Only the wording leaves it out:** R104's "never postpones an alarm already set sooner" and `rearm`'s doc comment (`user-vault.ts:162-165`) do not name this exception.
- **Fix:** say it in both: after a refused `setAlarm`, the next write may move a sooner stored alarm out to the write floor, once, and an idle vault's work waits for its next call.
- **Carrier:** a follow-up.

**n3. The imports case says it pins both entity names, but it passes with `REVIEW_ENTITY` dropped.** (tests lens n2)

- **Where:** the case's comment, `files-alarm.test.ts:1145-1146`: "This pins the two terms of its WHERE that the index matches: the purged state, and both entity names".
- **Mutant O12** drops `REVIEW_ENTITY` from `LIVE_IMPORT_HEADS` (`previews.ts:334`). All 35 `files-alarm.test.ts` cases pass (`tests/own-mutants.out`), the rows case included, which then reads no review head at all. My rerun on `14844b9` agrees: `35 passed (35)` (`synth/own-mutants.out`).
- **Why:** the case's purged record is an `import_review`, which the state term skips either way, so only its live selection is tested (`:1149-1153`).
- **The workers suite still kills O12,** through 1B-T10's `imports-review.test.ts` case "after pruneImports at importsDueAt, the next importsDueAt is later or null" (O12i: `expected [...] to have a length of 3 but got 2`).
- **Fix:** add a live `import_review` record to the case, or change the comment to "the purged state and the selections".
- **Carrier:** a follow-up.

**n4. The rows case would pass without testing anything if the runtime ever stopped providing `rowsRead`.** (tests lens n3)

- **Where:** `files-alarm.test.ts:1056` sums `cursor.rowsRead` from 0, and `:1067` compares the two sums with `toEqual`.
- **Evidence:** without `rowsRead`, both sums would be `NaN`, and `@vitest/expect`'s `equals({ receipts: NaN, imports: NaN }, same)` answers true. The tests lens checked it with the worktree's vitest, and so did I (`node` in `synth/tree/apps/edge`: true for two NaN objects, false against `{ receipts: 2, imports: 6 }`).
- The hand-written `SqlStorageCursor` declaration in `cloudflare-workers.d.ts` (P8) cannot notice such a change.
- **Today `rowsRead` is a real count** (probe R1, below).
- **Fix:** assert the baseline counts are positive integers, for example `expect(none.receipts).toBeGreaterThan(0)`.
- **Carrier:** a follow-up.

**n5. The receipt still gives download-pins' items to fix-download-aborts (lines 4, 97 and 108).** (tests lens n4)

- **Where:** `docs/implementation/receipts/alarm-hardening.md`:
  - `:4`, "m3 and n6 are fix-download-aborts'";
  - `:97`, which calls `snapshotsDueAt`'s scan fix-download-aborts';
  - `:108`, which addresses the X5 note to fix-download-aborts.
- **In fact** #397 (download-pins, `receipts/download-pins.md`) took 1B-T11's m3 and n6 (its V14 and V15) and DU-2 (V3), and #396 touches none of these files.
- **Already listed** in followups.md as "alarm-hardening (#398), n7: ... Correct them before #398 merges". It is still open at `14844b9`.
- **The other half of that entry is settled.** On the tree merged with #397, A1's text (where X5 now lives) is killed by #397's DU-2 pin, "a retained receipt that nothing holds makes attachmentsDueAt now, so the safety net is scheduled" (`attachments.test.ts:1785` there), as well as by FOCUSED's receipts and upgrade cases (A1x: `3 failed | 93 passed (96)`). That is download-pins' V3 rerun with A1's text.
- **Carrier:** the controller, before #398 merges (followups.md's #398 n7).

**n6. `handover.md`: R104's three reasons now sit under R105.** (rules lens)

- **Where:** in the live `handover.md`, the bullets at `:733-735` ("Why: workerd refuses `setAlarm` at or before 0 ...", "A person never sees the minute ...", "Later vault tasks that reason about alarm timing must expect it") hang under R105's last bullet (`:732`). In `402c1df`'s `handover.md` (`:574-576`) they were R104's sub-bullets.
- Inserting R105 split R104 (`:726`) from its reasons, so R104 reads without them and R105 carries text that is not its own.
- This is the controller's file, not part of PR #398.
- **Fix:** move the three bullets back under R104.
- **Carrier:** the controller.

## What was checked and found right

### 1. m1, the prune order (P1, P2): holds

- `FILE_PRUNES` and `PRUNE_DUE_TIMES` both list uploads, exports, attachments, imports, snapshots (`jobs.ts:39-54`). The tests use `FILE_PRUNES` only by spread (`files-alarm.test.ts:246`), never by index.
- **Nothing relied on the old order:**
  - no earlier prune reads `snapshots` or `snapshot_chunks`;
  - the only shared state is the `vault_objects` keys, and `deleteDueObjects` deletes those after all the prunes;
  - `uploadsDueAt`, `exportsDueAt`, `importsDueAt` and `attachmentsDueAt` read nothing a later prune writes;
  - `pruneImports` and `pruneSnapshots` never touch receipts or holders. So the reorder makes no other m1-type pair, and no R37 loop through receipts.
- **The R37 seed is fair** (P2).
  - J1 alone (the base order) fails the R37 case with `prune_files: expected <t0> to be greater than <t0>`, m1's symptom, and fails the m1 case with its chunk rows left.
  - With the naive seed (`high_water` at the seed's own revision), the R37 case passes under J1. So the +1 offset is what makes it a pin (`rules/j1.log`).
  - `purgeEntities` takes one revision per call (`retention.ts:125`), so the offset holds. The seed's comment says what would break it, and the m1 case pins m1 without it.

### 2. n1, the held guard (P4): holds

- A held guard logs `file_run_held` and returns `['delete_objects']` (`jobs.ts:104-107`). `alarm()` reads only whether the list is empty (`user-vault.ts:141`), so a held report cannot add to a real delete failure. `runFileJobs` has one caller.
- **Probe N1:** two alarms held by a stuck run came back at `t + 60 s` and `t + 120 s`, `file_run_held` was logged twice, and the stuck run returned `[]`. When nothing is due, `rearm` gets `at = null` whatever the delay, so there is no retry and no loop.

### 3. n2, rearm's catch (P5): holds (n2 aside)

- N2b: a refusal that lands after a later rearm keeps the later alarm, `[t + 10 min, t + 10 min]`. The planner's U3 (clearing `alarmAt` unconditionally) is killed by the late-refusal case.
- N2c: a refused `deleteAlarm` leaves the stored alarm, which fires, finds nothing due and is gone: `[null, null]`.
- N2d: the three rearms in flight do no harm, and the next rearm resets the state.
- R104's floor is unchanged. A synchronous throw leaves `alarmAt` as it was, because `alarmAt` is assigned after the call (`user-vault.ts:175-176`).

### 4. m4, receipts (P6, R105): holds (m1 and n1 aside)

- **The events.** 0004's four triggers, plus the foreign key's cascade from `DELETE FROM transactions` as `purgeExpiredRecords` runs it (`retention.ts:181`), list every receipt the vault's own statements can leave without a holder.
  - Probe CA: with B20, the receipt is released and listed. With B20 dropped, it stays retained, has no holder, is listed, and is due at `t`.
  - Covered: retain, replace, remove, purge, import confirmation (`confirmation.ts:507`), and erase (`deleteAll`, then the migrations).
- **One transaction.** The triggers fire inside the statement's own transaction: probe AT's check row is visible inside the block and rolls back with it.
  - `pruneAttachments` empties `attachment_checks` in the same `transactionSync` as its full pass (`attachments.ts:352-360`), and a failure rolls both back.
  - Its own UPDATEs set `status = 'released'` or only `released_at`, so no check row is written in between.
  - Every alarm of an active vault runs every prune (`jobs.ts:116-123`), so between alarms the table holds only the receipts changed since the last one.
- **The backfill (probe UP).** A 0003 vault with 6 receipts in every state and 7 heads migrates in one drizzle transaction:
  - row counts are unchanged, `PRAGMA quick_check` is ok, and the journal has 5 rows, the last 1761696000000;
  - `attachment_checks` is exactly the full UNHELD set (the one unheld receipt); a receipt held only by a soft-deleted record is not listed, as UNHELD says;
  - after the upgrade a holder delete is listed by the trigger, and `pruneAttachments` releases the unheld receipt and empties the table.
- **The cost per write (probe COST,** the storage's `rowsWritten`, 0003 against 0004):
  - +2 rows written for each of the four events while the receipt is not yet listed (the check row and its primary-key autoindex; `WITHOUT ROWID` would halve it), and 0 once it is listed;
  - 0 for a holder insert or an unrelated write;
  - +1 per import-head write (the partial index entry), 0 for any other head.
- **The net checks the holder,** not only the list: O7 (the net without its holder check) passes FOCUSED but is killed by 1B-T9's `attachments.test.ts` case "after pruneAttachments at attachmentsDueAt, the next attachmentsDueAt is later or null" (its step "Nothing to do while every receipt is held", `:1549`) and by the lens's K2.

### 5. m4, imports (P7): holds (n3 aside)

- `LIVE_IMPORT_HEADS` expands to the index's WHERE term for term, in the same order (`SELECTION_ENTITY = 'import_selection'`, `REVIEW_ENTITY = 'import_review'`, `apps/api/src/imports/confirmation.service.ts:51-52`).
- EXPLAIN shows `SEARCH h USING INDEX entity_heads_imports_idx (entity=?)`, then `SEARCH g USING INDEX entity_changes_entity_idx (entity=? AND entity_id=?)`. `INDEXED BY` returns exactly the live import heads, deleted ones included; purged heads and other entities are left out.
- **`CROSS JOIN` is safe for correctness,** not only for speed: probe XJ matched the base `JOIN` statement's answer in 6 rounds over 240 heads (4 entities; active, deleted and purged). UP matched it before and after the upgrade.
- **No other reader changes:** `recordsDue` (both entities) and `purgeEntities`' head read have identical plans before and after 0004 and never name the new index, because they bind the entity and have no literal `IN` term.

### 6. n5 (P10): holds

- The R4 what-if (`pruneExports` as a `const` function expression):
  - with the task's `jobs.ts`, 35 of 35 pass, and only the 2 deliberate `file_prune_failed` lines appear (`rules/n5-real.log`);
  - with the base's `jobs.ts`, 7 fail and 23 lines appear (`rules/n5-base.log`);
  - the control (the base's `jobs.ts` without R4) has 4 failures and 2 lines (`rules/n5-control.log`). So R4 alone adds 3 failures and 21 TypeErrors, as the 1B-T11 review found.
- `jobs.ts` no longer reads a cycle member's export at load. The one new load-time read, `LIVE_IMPORT_HEADS`, reads `@api` constants outside the cycle.

### 7. The migration: holds

- The journal entry is idx 4, `when` 1761696000000 (0003's plus 86,400,000), key `m0004`.
- `schema.ts` has `attachmentChecks` in `vaultSchema`. `vault-schema.test.ts` lists `'attachment_checks'` in its sorted place, and the Drizzle column check covers the table.
- The vault bundle carries 0004: 1,676.57 kB.
- No other open PR (#392, #394 to #397) touches the vault migrations or these source files, so 0004 has no clash.

### 8. The pins (P3, P8): hold (m1, n3 and n4 aside)

- **PA, PH, PE and PF** are faithful ports of the 1B-T11 alarm lens's `probe-alarm.test.ts`: the same seeds, clocks and expectations. PE requests its export on the real clock first; PF builds its key with `vaultObjectKey`.
  - The tests lens's reruns: PA kills J4 (the alarm at `t` instead of `t + 60,000`); PE kills U6 and PF kills U7 (`[t, t]` instead of `[t + 60,000, t + 60,000]`).
  - The implementer's log shows PH killing U5 (status 500, logged false).
- **`rowsRead` is the storage's own count under Miniflare** (probe R1, `tests/runA-focused-probes.log`, and again in `synth/base-run.log`). It is a number. A 300-row full scan reads 300, a key lookup 1, an unindexed filter 300, an `EXISTS` that hits its first row 1, and one that finds nothing 300. It grows as the cursor is read (1 before any row, 3 after two rows, 300 at the end). The rows case reads it after `.one()` has consumed the cursor.
- **The rows case fails for every index and join-order mutant:**
  - the tests lens's reruns: A3 (receipts 201 against 2), A4 (301), P1 (imports 206 against 6), P4 (106) and M7 (105);
  - the implementer's logs: A2 (201), M6 (106), P2 (306) and P3 (103 against 3);
  - the lens's own O1 (the stamp term with its index disabled, 102 against 3) and O3 (the prune empties only the checks of receipts no longer retained, 301).
- **The receipts case** kills M1 to M4, A1, A4 and A5; **the upgrade case** kills M5 and A1; **the imports case** kills P2 and P3.
- **FOCUSED** in the tests lens's copy: 49 passed (56 with its 7 probes). The 12 event lines match the brief: `file_delete_failed` 1, `file_prune_failed` 2, `file_run_held` 2, `object_delete_failed` 1, `vault_alarm_unset` 4, `vault_retention_purge_failed` 1, `work_start_failed` 1. No `Unhandled` or uncaught line.
- **RED** (the implementer's `red.log`) holds exactly the brief's 9 failures. PA, PH, PE, PF and the imports case pass at RED by design (P3).

### 9. The merges: clean

- **#397 (download-pins, `3894e58`).** `git merge-tree` is clean (tree `1f8c74e2`), and the merged tree is `14844b9` plus #397's five test files, byte for byte.
  - `attachments.test.ts`, `snapshots.test.ts` and `imports-review.test.ts` under the lock: 3 files, 165 passed (`tests/runD-m397.log`).
  - DU-1, DU-2, 1B-T9's safety-net case, 1B-T11's m3 and n6 pins, and the preview pin (U1: 404 for an upload never accepted) all pass.
  - Download-pins' kit mutants V2 (DU-1), V14 (m3) and V15 (n6) are still killed on the merged tree.
  - The two "uncaught exception" lines come from `snapshots.test.ts`'s Workflow cases, as #397's receipt records.
  - 0004 does not change the ten-times proof: 32,000 records, 19,001,807 stored bytes, a database of 50,593,792 bytes.
- **#396 (fix-download-aborts, `d0cc479`).** `git merge-tree` is clean (tree `f7fa17fc`). It touches only `src/v1/files/{downloads,receipts,slots,uploads}.ts`, `src/v1/handler.ts`, and its own test and receipt: no vault SQL.
- **#394 (1B-T12, `317cf3a`).** `git merge-tree` is clean (tree `6e351f49`).
  - The tests lens ran the vault half of its parity files session on #394 alone and on #394 merged with #398 (0004 applied), twice each. The steps are `files-session.ts`'s 42, word for word, 40 of them sent in vault mode, normalised as `vault-parity-files.db.test.ts` does.
  - Every answer is identical (`tests/parity-b394-first.jsonl` and `tests/parity-m394-first.jsonl` show no diff, nor do the second runs). The session reaches its success paths (snapshot 202, export 202, upload 202, import preview 200, transaction 201). Every receipt step is refused, so 0004's triggers never fire during it.
  - Both merged trees typecheck. The NestJS half needs PostgreSQL, and Docker is stopped, so CI's `edge` job stays its gate.
  - #394's head has since moved to `d853122`, which changes one line of its own receipt (GitHub's compare), so the result stands.
- **The four PRs touch pairwise disjoint files:** I rechecked GitHub's file lists for #394, #396, #397 and #398 (`synth/pr-files.txt`); no path is shared. `14844b9` also merges cleanly with the integration head the tests lens saw (tree `6fbb11b9`), and the head has moved only in `.claude/` since.

### 10. Integrity and mutants

- **The kit:** the ten committed code and test files match the planner kit's `real/` byte for byte, and every line of the kit's `SHA256SUMS` is OK.
- **The implementer's logs** (`scratch/alarm-hardening/`): RED `9 failed | 40 passed (49)`, the R37 case failing on `prune_files` `t0 > t0`; GREEN `49 passed (49)`, with the 12 event lines; AFFECTED 9 files, 261 passed, 1 todo; `test:edge` 15 files, 176 passed; `build:edge` 1,676.57 kB; 28 of 28 mutants killed.
- **The planner's mutants (R100):** the tests lens reran 10 under the heavy lock: J4, U3, U6, U7, A3, A4, P1, P4 and M7 with `mutants.py` (`tests/planner-sample.out`), plus A1 as A1x against #397's `attachments.test.ts`. Each was killed by the same cases as in the planner's and the implementer's runs, and every mutated file was restored byte for byte (`shasum -c` OK).
- **The lenses' own mutants and what-ifs:**

| Mutant | Change | Result |
| --- | --- | --- |
| tests O1 | the stamp term scans `attachments` (its index disabled with a unary plus) | KILLED by the rows case (102 against 3) |
| tests O3 | the full pass empties only the checks of receipts no longer retained | KILLED, 2 cases (receipts, rows) |
| tests O7 | the net in `attachmentsDueAt` drops its holder check | survives FOCUSED; KILLED by 1B-T9's `attachments.test.ts` and by K2 |
| tests O11 | `pruneAttachments`' full pass releases only listed receipts | survives every committed case; killed by K1 and F2 (m1) |
| tests O12 | `LIVE_IMPORT_HEADS` without `REVIEW_ENTITY` | survives `files-alarm.test.ts`, 35 of 35 (n3); KILLED by `imports-review.test.ts` (O12i) |
| tests A1x | the planner's A1 (X5 on the new text), with #397's `attachments.test.ts` | KILLED, 3 cases (#397's DU-2 pin, receipts, upgrade) |
| tests V2m, V14m, V15m | download-pins' V2, V14 and V15 on the tree merged with #397 | KILLED, 1 case each |
| rules J1 | `pruneSnapshots` back in third place | KILLED by the R37 and m1 cases; with the naive seed the R37 case passes (P2) |
| rules R4 | what-if: `pruneExports` as a `const` function expression | 35 of 35 with this `jobs.ts`; 7 failed with the base's (n5) |

- **My spot-check** (`synth/`; the runner is `run-synth.sh`, which runs the tests lens's `own-mutants.py` on `synth/tree`, a `git archive` of `14844b9` without #397):
  - `base-run.log`: `files-alarm.test.ts`, `attachments.test.ts` and the tests lens's seven probes, 94 passed (35, 52 and 7). F1 to F4 and R1 print what the lens recorded.
  - `own-mutants.out`: O11, `2 failed | 92 passed (94)`, the failures K1 and F2 only (m1). O12, `35 passed (35)` (n3).
  - The `NaN` equality for n4, with the worktree's `@vitest/expect`.
  - The mutated files were restored (`shasum -c` OK). Both runs held the heavy lock and released it.
  - From GitHub: the CI run, the PR file lists, and the compare of the integration head.

## Notes for later tasks

- **A test-and-wording follow-up for this review (m1, n1 to n4).** It could be one small task. The ready material:
  - m1: add K1 (`tests/zz-lens2-probes.test.ts`) to `files-alarm.test.ts`. It passes on `14844b9` and kills O11.
  - n3: add a live `import_review` record to the imports case (`files-alarm.test.ts:1144`), or change its comment to "the purged state and the selections".
  - n4: assert that the rows case's baseline counts are positive integers.
  - n1 and n2 are wording: R105 names REPLACE conflict resolution beside a rebuild, and R104 and `rearm`'s doc comment (`user-vault.ts:162-165`) name what a refused `setAlarm` leaves: one postponement to the write floor, and an idle vault's work waiting for its next call. R104 and R105 are the controller's text.
- **Any task that writes `attachments` or `transaction_attachments`:** never `INSERT OR REPLACE`, `REPLACE INTO` or `UPDATE OR REPLACE` onto a holder, or else list the old receipt in `attachment_checks` yourself (n1). 0004's triggers list every other change, and the next `pruneAttachments` empties the table (R105). A migration that rebuilds either table recreates the four triggers (R105; already in followups.md).
- **The controller, before #398 merges:**
  - CI: run 42771332803 never started. The merge waits for the nine jobs, with the deltas under CI above.
  - confirm-n6 (followups.md): read the `edge` job's `test:edge:db` of whichever of #394, #396 and #398 merges last, on a head that holds all three. The vault half of the parity session already answers the same with 0004 applied.
  - n5: correct the receipt's lines 4, 97 and 108 (followups.md's #398 n7). Download-pins' V3 rerun with A1's text is done: A1x is killed on the tree merged with #397.
  - n6: move R104's three reasons (`handover.md:733-735`) back under R104 (`:726`).
- **1B-T13:** the receipt's note stands (0004's table and index are empty in a vault with no receipt change since its last alarm, or with no imports). For the hosted sizing, each of the four receipt events writes 2 more rows the first time it lists a receipt, and each import-head write 1 more.
- **The probes and runners:**
  - the rules lens's: `rules/` (`zz-rules-probes.test.ts` with N1, N2a to N2e, RP, CA, AT, UP, COST and XJ; `make-j1.py`, `make-r4.py`, `run-chain.sh`, `run-focused.sh`);
  - the tests lens's: `tests/` (`zz-lens2-probes.test.ts` with R1, F1 to F4, K1 and K2; `own-mutants.py`, `run-mutants.sh`, `run-mutants-2.sh`; the parity session's `tree-b394/`, `tree-m394/`, `run-parity.sh` and `summarize-parity.py`);
  - mine: `synth/` (`run-synth.sh`, `base-run.log`, `own-mutants.out`, `own-mutant-logs/`, `pr-files.txt`).

VERDICT: Approved
