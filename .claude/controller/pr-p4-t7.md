## Summary
- **P4-T7: slip drafts: the list, confirm, dismiss, slip refs and the 30-day expiry** (plan P4: S1, S2, S13, S18).
- **Four vault routes.** The first three sit behind P4-T3's release check (`SLIP_IMPORT_ENABLED`, still `"false"`):
  - `GET /v1/drafts`: the open slip drafts, newest slip first, a keyset page at a time.
    - The order is `occurred_on`, `occurred_time` and `id`, all descending, with a missing date or time last (P5).
    - The cursor is at most 512 characters, and `total` counts the open drafts.
  - `POST /v1/drafts/confirm`: one `slip_draft.confirm` command that turns drafts into records (P3, P4).
    - A draft that is gone is 409 `VERSION_CONFLICT`, with nothing written.
    - A record's refusal names `drafts[<i>].transaction.<field>`.
    - No `record_saved` event (S18).
  - `POST /v1/drafts/:id/dismiss`: one `slip_draft.dismiss` command. An unknown or closed draft is 404 inside the command (P6).
  - `POST /v1/slips/refs`: a plain write that records a slip ref (P7).
    - It moves no version, no source and no change log (H9).
    - It is not behind the release (S13).
- **One create path (P2):**
  - `createTransactionRow` shares `transactions.create`'s check (`parseCreate`) and its insert (`insertCreated`), so `createTransaction`'s answers and digest are unchanged.
  - The insert now names `slip_ref_id`.
  - A shared slip's source is `share_extension`; any other is `slip_import` (A1).
- **The 30-day expiry (P8):**
  - `pruneSlips` and `slipsDueAt` join the file alarm's prunes, before the snapshots'.
  - The prune binds no id lists and keeps R37.
  - `BACKFILL_KEEP_DAYS` is 31.
- **The registry (P9):** `UserVault#registry` is built once per instance, apart from the digester. `appendChanges` and `FilePrune` take it.
- **The P4-T3 reviews' pins (P12, followups line 868):** carried in `slips-vault.test.ts` and `route-coverage.test.ts`.
- **The controller accepted the planner's calls P1 to P17.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit. The 15 code and test files are byte-identical to the planner's `real/`.
  - The 10 base files the task relies on match their hashes. These include `vault/slips/accounts.ts`, where a cut mutant run had left a mutant until the implementer reversed it.
  - The receipt adds the accepted calls and R127's CI lines.
  - No package, lockfile, migration, `packages/contracts`, `wrangler.jsonc` or app change.

## Test plan
- [x] RED, every failing case an `AssertionError`, matching the planner's logs:
  - Node `route-coverage`: 2 of 14 failing.
  - Workers, 3 files: 19 of 49 failing.
- [x] GREEN: Node 14 of 14; workers 49 of 49.
- [x] 83 of 83 mutants killed, in four batches (16, 28, 29 and 10). Each batch's output matches the planner's line for line.
- [x] Local gate (R127): `typecheck:edge` at base, RED, GREEN and with every file in place; `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including `test:edge`, `build:edge` and the eleven neighbouring workers files this task's code reaches.
- [ ] Independent review (Opus), and a second review (Sonnet), covering:
  - privacy: what a draft and a slip ref keep;
  - the confirm's order and its refusals;
  - the list's order and cursor;
  - the prune and R37.

Closes #215 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
