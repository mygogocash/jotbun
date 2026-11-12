# P3-T2 second review: Record source in the contract, the vault and the phone's outbox

Reviewer: Claude Sonnet 5.5, independent second review (data safety focus). Gemini's quota ran out, and the first reviewer is Opus. PR #420, commit `182f3054` on `p3/t2-transaction-source`, range `origin/claude/p1a-vault-core...182f3054` (merge base `e8de291d`). I did not read `reviews/P3-T2.md` before writing this file.

Method: read-only. Every probe and mutant ran in `git archive` copies under `.claude/controller/scratch/p3-t2-second/` (`s2base` = `e8de291d`, `s2tree` and `s2tree-b` = `182f3054`, `node_modules` symlinked from the worktree). Every workerd run took the heavy lock and gave it back (the lock is free now). The task worktree is still clean at `182f3054`. Database suites were not run (Docker is stopped); CI runs them.

## Summary

No blocker and no major. The four focus points hold:

1. The migration is one `ALTER TABLE ... ADD COLUMN`; a whole-database before/after dump shows every row, index, trigger, foreign key and root page unchanged, with older records NULL.
2. Source is written only by `createTransaction`'s insert. No edit, delete, restore, receipt, import or phone path writes it. Three of those paths are not pinned by the PR's tests (m1).
3. Replays of pre-P3 commands digest byte for byte as before (base and head compared in workerd).
4. The PR adds no log or analytics call.

## CI (R100: read, not re-run)

PR head is `182f3054d6ae`, mergeable. Run 43127082956 (pull request merge ref, 2026-11-12 00:29 to 01:05 UTC), all nine jobs SUCCESS: Typecheck/unit/API/build, Exports (web and iOS), Render, three render per-section jobs, SQL integration and ops, Edge Worker, Release image and smoke.

Counts from the job logs (`scratch/p3-t2-second/ci-edge-job.log`, `ci-checks-job.log`):

| Step | Result |
| --- | --- |
| `test:edge` | 18 files, 192 tests passed |
| `test:edge:workers` | 32 files, 785 passed, 1 todo (786); `transaction-source.test.ts` 9, `vault-schema.test.ts` 14, `currency-migration.test.ts` 10 |
| `test:edge:db` | 3 files, 12 tests passed |
| `build:edge`, `typecheck:edge`, `typecheck`, `typecheck:app`, `typecheck:routes` | passed |
| `test:app` / `test:unit` / `test:dev` | 35 / 1016 / 7 passed, 0 failed |

Note: the integration branch has moved since the PR's base (now `9a7b767e`); none of the moved paths overlap this PR's `apps/edge/src/vault`, `apps/edge/test`, `packages/contracts`, `apps/app/src/storage` or `app.json`. Among the open PRs' file lists (`gh pr list --json files`, which gh caps per PR), only #402 touches `apps/edge/src/vault/migrations` besides this one, and it is the promote of 0004, which this PR's base already has.

Kit check: the 17 code and test files in the commit are byte-identical to the planner's `real/` tree; only the receipt differs. The implementer's logs match the receipt (27 of 27 mutants killed, compat 4 of 4, workers 33 passed, `test:edge` 192).

## What I ran

| Run | Tree | Result |
| --- | --- | --- |
| Planner mutants M7, M9, M10, M11, M13, M14, M16, M17, M20, M21 | head | 10 of 10 killed by the intended tests, each restored (sha256 checked). `mutants-sample.out`, `mutants-sample/results.json` |
| Probe `zz-second-migration.test.ts` (whole-database invariance across 0005) | head | all assertions passed (details under focus 1) |
| Probe `zz-second-digest.test.ts` (5 fixed creates, request digests) | base and head | digests byte-identical (`digests-base.txt`, `digests-head.txt`) |
| Probe `zz-second-paths.test.ts` (delete, restore, edit, refusals, odd values) | head | 3 of 3 passed |
| Probe `zz-second-attachments.test.ts` (source with retain, replace, remove, delete, restore) | head | 1 of 1 passed |
| Probe `zz-second-imports.test.ts` (import confirmation leaves source NULL) | head | 1 of 1 passed |
| My mutants X1 to X6, X5b (`probes/my-mutants.py`) | head | see focus 2 and m1 |

Limit: in my scratch trees `@gogospend/contracts` resolves through the symlinked `node_modules` to the worktree's `packages/contracts` (the same `182f3054` code), so I did not sample the planner's contract mutants M1 to M6. This does not weaken the digest comparison: the base tree ran the base `domain/transactions.ts` (no `parseTransactionSource`, `payload: draft`), and this PR does not touch `normalizeCommand`.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. The PR's tests do not pin source preservation on three write paths: restore, the receipt commands, and an import confirmation.**
The code is correct on all three (probes below), but a later refactor could break any of them silently. This is the controller's focus 2 ("no edit, import, transfer or restore path can set or change it"), so it deserves a test each.

Evidence (my mutants, run against the PR's own focused files, the existing suite for the path, and my probe):

| Mutant | PR's tests | Existing suite | My probe |
| --- | --- | --- | --- |
| X1 restore sets `source = NULL` (`domain/transactions.ts:334`) | survives | `transactions`, `history`, `sync` survive | killed |
| X3 receipt commands set `source = NULL` (`files/attachments.ts:222`) | survives | `attachments.test.ts` survives | killed |
| X5 import confirmation stamps `'statement'` (`files/confirmation.ts:473`) | survives | `imports-review.test.ts` survives | killed (X5b) |
| X2 delete clears, X4 edit clears, X6 edit writes `'typed'` | killed | | killed |

Why they survive: `transaction-source.test.ts` test 1 deletes the record but never restores it, never combines a source with a receipt, and no test confirms an import and then looks at `source`. Fix: add three short cases to `transaction-source.test.ts` (restore step after the delete in test 1; retain, replace and remove on a record created with a source; an import confirm whose records read without the key). My probes are ready to adapt: `scratch/p3-t2-second/probes/zz-second-paths.test.ts`, `zz-second-attachments.test.ts` (an appended `describe` in a copy of `attachments.test.ts`), `zz-second-imports.test.ts` (an appended `describe` in a copy of `imports-review.test.ts`).

### Nit

**n1. The receipt says `CreateEntryInput` and `CreateTransferInput` gain `source?: TransactionSource | null`; the code has no `| null`.**
`apps/app/src/spend/v1/resources.ts:50-51` is `source?: TransactionSource`; the receipt (`docs/implementation/receipts/P3-T2.md:26`) and the brief's table say `| null`. The code is the planner's kit (the kit and the brief disagree; the plan names only the two types). Effect: `PendingEntry` (`CreateTransactionRequest`) accepts `source: null`, but `resources.createTransaction` does not, so a later caller passing null fails typecheck. Either fix the receipt line or add `| null`.

**n2. The receipt names `0.2.0` but does not state the client minimum for P6C.**
Plan Step 6: "the receipt names the client minimum (`0.2.0`)"; Global Constraints (Contracts): "each receipt repeats it for P6C". The receipt lists `AI_MIN_CLIENT_VERSION` and the `expo.version` bump (lines 12, 24, 66) but never says that a release carrying P3-T2 needs `MIN_CLIENT_VERSION_IOS` and `MIN_CLIENT_VERSION_ANDROID` of at least `0.2.0`. One sentence fixes it.

**n3. The commit trailer email differs from the brief.**
Commit has `Co-Authored-By: Gemini 3.8 Flash <noreply@google.com>`; the brief's Step 8 gives `<gemini@google.com>`. The model name matches.

## Focus answers, with evidence

### 1. The migration keeps every row and every link

- `apps/edge/src/vault/migrations/0005_transaction_source.sql:9` is one statement: `ALTER TABLE transactions ADD COLUMN source TEXT CHECK (source IN (the seven))`. No DEFAULT, no backfill, no rebuild. `transactions` is `STRICT` with seven partial indexes and two triggers (0000, 0002, 0003), and two child tables point at it (`transaction_attachments` ON DELETE CASCADE, whose delete trigger also releases the receipt object; `import_row_progress` ON DELETE SET NULL, confirmed by my probe's `PRAGMA foreign_key_list`). A rebuild would lose all of that; ADD COLUMN touches none of it.
- My probe `zz-second-migration.test.ts` (workerd, head): a vault at the pre-0005 shape holding 5 records (expense, expense with note and merchant at the amount cap, income, soft-deleted expense, transfer), 2 wallets, 2 categories, a retained receipt linked to a record, and an import (upload, preview, selection, row, progress link to a record). It dumps the whole database before and after `migrate()`. Asserted equal: every table's rows including rowid; `sqlite_master` for every object (type, name, tbl_name, rootpage, sql) except the `transactions` table's own SQL, whose rootpage is also unchanged (a rebuild allocates a new root page); the full foreign key list; foreign keys on; `PRAGMA foreign_key_check` empty; 1 receipt link and 1 import link still present. `transactions` rows equal the old rows plus `source: null`; `__drizzle_migrations` gains exactly one row; the new column is `TEXT`, nullable, no default; an older record still edits and keeps NULL; a second wake migrates nothing.
- The journal entry's `when` (1761782400000) is later than 0004's (1761696000000); M11 (equal `when`) and M9 (`NOT NULL DEFAULT 'typed'`, which would stamp older rows) and M10 (links deleted) are killed.

### 2. A source is set once, at create

Every SQL write to `transactions` in `apps/edge/src` (grep of `INSERT`, `UPDATE`, `DELETE`):

| Writer | Names `source`? |
| --- | --- |
| `createTransaction` insert, `domain/transactions.ts:177-198` | yes, once, bound from `parseTransactionSource` |
| `updateTransaction` `writeRow`, `:201-221` | no (explicit SET list); the body's known fields (`:275`) exclude it, so `source` in a PATCH is 422 UNKNOWN_FIELD |
| delete `:310`, restore `:334` | no (`restore` also refuses any body field, `:324`) |
| receipt retain, replace, remove, `files/attachments.ts:222` | no |
| import confirmation, `files/confirmation.ts:473` | no (11 named columns), so imported records stay NULL |
| retention purge, `retention.ts:181` | DELETE only |

History and Recently deleted reuse the shared `COLUMNS` and `toDto` (`reads/history.ts:14,109`, `reads/deleted-history.ts:11,40`), so they carry `source` without their own lists; the plan's "where they keep their own column lists" does not apply. Every query that uses `COLUMNS` reads one table (`FROM transactions t`, or an UPDATE or INSERT with RETURNING), so the unqualified `source` cannot be ambiguous, and no edge query uses `SELECT *` or `t.*` on `transactions`.

On the phone: `editPending` and `removePending` act only on a never-transmitted unsent draft (`diaryRepository.ts:467-490`); an edit or "Use yours" builds its PATCH body field by field (`spend/v1/redesign/recordModel.ts:124-136`, `screens/v1/TransactionsScreen.tsx`), and `CHANGE_RULES` has no `source` (`diaryRepository.ts:182-192`); `sendCreate` sends the stored body verbatim (`spend/v1/resources.ts:254-260`). `ownCreateMatches` (`screens/v1/parts.tsx:200-204`) treats absent and null alike, so a source-bearing create still matches its own committed record.

My probes on the head: delete, restore and edits keep `source` in the record, every sync snapshot (versions 1 to 4) and the table; retain, replace, remove, delete and restore on a record with a source and a receipt keep it; PATCH that sets, clears (null) or mixes `source` with a real edit, and a restore with a body naming it, are each 422 UNKNOWN_FIELD on `source` and change nothing; imported records have no `source` in the table or the sync feed; `__proto__`, `constructor`, `toString`, arrays, objects, booleans, numbers and `'photo\n'` or `' photo'` are 422 VALIDATION_FAILED with no receipt row and no record written. See m1 for what the PR's own tests leave unpinned.

### 3. Replays of commands made before P3 digest exactly as before

- Static: base `runCommand(c, { ...command, payload: draft })` (`e8de291d:domain/transactions.ts:246`) against head `payload: source === null ? draft : { ...draft, source }` (`:258`). `canonicalize` (`packages/contracts/src/v1/validation.ts:67,89-92`) drops only `undefined`; `null` is kept, so an unconditional `source: null` would have changed every digest (M16, killed). The digester and `normalizeCommand` are untouched by the PR. Validation runs before `runCommand`, so a bad source writes no receipt.
- Dynamic: fixed account, fixed command keys and ids, the vault's test digest key. Five creates on `e8de291d` and on `182f3054`: a minimal expense, an income with Thai note and merchant, a transfer with a Thai note, an expense at the amount cap with explicit `note: null, merchant: null`, a minimal transfer. The five HMAC request digests are byte-identical (both logs).
- Phone: an outbox row queued before P3 has no `source` key and is sent as stored, so its body and digest are unchanged; `assertDraft` treats an absent source as none.

### 4. Logging

The range diff adds no `console`, `logFailure`, logger, `track*` or similar call (grep of the diff: none). The 422 for a bad source names the field and the seven allowed values and does not echo the offered value (`packages/contracts/src/v1/transactions.ts:106-107`). Analytics: `RecordSource` is now `TransactionSource`; the analytics catalog already enumerated the same seven values (`apps/app/src/analytics/catalog.ts:77`), and `EntryTrack.source` stays `'typed' | 'tell_bun'`.

## Notes for later tasks

1. **Rollout order.** Builds below `0.2.0` reject any record that has a `source` key: `isTransactionSnapshot` is an exact-key check, and the app validates whole history, deleted-history and sync pages with it, so one such record stops a page, on a second device of the same account too. The server's `MIN_CLIENT_VERSION_IOS` and `_ANDROID` (`apps/api/src/common/client-version.guard.ts:36`, set by P6C) must be at least `0.2.0` before any build that sets a source ships. In the other direction, a vault Worker or NestJS API older than this PR answers a create that names `source` (even `source: null`) with 422 UNKNOWN_FIELD, and the outbox marks the draft refused.
2. **Send no source key when there is none.** `assertDraft` and the server accept `source: null`, but an older server refuses the key, and `savePending` compares `canonical(command.payload)` to `canonical(entry)`, which keeps `null` and drops `undefined`, so an entry holding `source: null` with a payload lacking the key is refused. Later builders (`toPendingEntry` passes its input through) should add `source` only when they have one, from one shared object. H9: the old Quick add sends none.
3. **Import records stay NULL.** P4's `slip_import` and `statement` sources must name `source` in the confirmation INSERT (`files/confirmation.ts:473`); land the pinning test from m1 first, so the change shows.
4. **The CHECK is a second copy of the seven sources.** SQLite cannot alter a CHECK, so an eighth source later costs a rebuild of `transactions` (which this migration's own comment says deletes receipt links and clears import links) or a loosened CHECK. Decide before any task proposes a new source.
5. **Promotion order.** The vault migrator applies an entry only when its `when` is later than the latest applied one (`node_modules/drizzle-orm/sqlite-core/dialect.js:660`). `origin/main` holds migrations 0000 to 0002 only; 0003 and 0004 have not reached main yet (#402 carries 0004). Promote 0005 after them, or a vault that took 0005 first would never apply them.
6. **`source` is client-asserted.** Nothing verifies that a record claiming `photo` or `slip_import` came from one. Do not use it for quotas, points, entitlements or AI trust.
7. **`vault-schema.test.ts` now names every journal tag in one line,** so each later migration PR edits that line (a conflict hotspot for parallel P4 and P5 work).
8. **Index name.** `transactions_source_idx` already exists and indexes `source_wallet_id` (`0000_vault_core.sql:151`); an index on the new column needs another name. (Seen in the first review after my findings were written; I confirmed the line myself.)

## After the findings were written

- **PR #420 merged at 2026-11-12T02:01:34Z (merge commit `25ce2661`) while I was finishing,** and the task worktree is gone. Nothing I found calls for a revert: no blocker, no major. m1 (three unpinned write paths), n1 to n3 and the notes can ride in a follow-up commit or the next task that touches `transaction-source.test.ts`.
- **Agreement with the first review (read after writing mine).** Same verdict, same core minor (restore and the receipt commands have no case; I add the import confirmation), the same receipt nits (`| null`, the client minimum for P6C), and the same notes on rollout order, null versus absent, imports and the fixed CHECK list. It saw the "SQL integration and ops" job fail on one `attachments.integration.spec.ts` case while the run was still going; the run is now attempt 2 and all nine jobs pass on `182f3054`, so no CI item is open for this head. Points only it checked, which I do not dispute: the merge of `events.ts` with #418, the receipt's gate counts copied from the planner, a transfer twin for the outbox source check.
- **A slip to disclose.** After the worktree was removed, one of my read-only commands ran with the main checkout's `.claude/` folder as its working directory, so three `git show` calls and a `git merge-file` on files in my scratch folder ran there. They write nothing to the index, working tree or refs; I ran no other git command in the main checkout.

VERDICT: Approved
