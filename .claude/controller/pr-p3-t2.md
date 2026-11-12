## Summary
- **P3-T2: each record says how it was made.** The source is one of the seven spec sources: `typed`, `photo`, `slip_import`, `tell_bun`, `statement`, `share_extension` or `siri`. It is carried in the contract, the vault and the phone's outbox.
- **The contract** (`packages/contracts`):
  - `TRANSACTION_SOURCES`, `TransactionSource` and `parseTransactionSource`;
  - `RecordFields` and `RecordInput` gain `source`, and `isTransactionSnapshot` checks it;
  - `AI_MIN_CLIENT_VERSION = '0.2.0'`.
- **The vault:**
  - migration `0005_transaction_source.sql` adds a checked `source` column with `ALTER TABLE ... ADD COLUMN`, never a rebuild (P1). A rebuild's drop would fire the child foreign keys: `transaction_attachments` cascades and `import_row_progress` sets null.
  - `createTransaction` checks and keeps the source, set once at create (H9);
  - an edit that names `source` is refused, 422 `UNKNOWN_FIELD` (P6);
  - reads show the key only when a source was set, so older records stay NULL (B2);
  - the command digest includes `source` only when present, so replays of commands already in flight digest as before (P7).
- **The phone:** the outbox's draft keys and `assertDraft` check the source through `parseTransactionSource`. `CreateEntryInput` and `CreateTransferInput` take it, and analytics' `RecordSource` becomes the contract's type.
- **`app.json`'s `expo.version` goes to `0.2.0`**, as the plan's Step 3 says. It matches `AI_MIN_CLIENT_VERSION`, and `aiClientVersion.test.ts` holds it (P8).
- **Carried from P5-T4's review** (`currency-migration.test.ts`, P3):
  - the referencing-table case compares only the tables that existed before the rebuild;
  - every wallets foreign key is `NO ACTION` before and after;
  - the exact-row case compares only the 1A and P5 columns, so later columns such as `source` don't break it.
  - The compat probes C1 to C4 prove each.
- **`events.ts` is shared with P3-T5 (#418):** one line here, one block there. The controller proved the 3-way merge clean in either order, with the same result.
- **The controller accepted the planner's calls P1 to P9.**
  - Planned on Claude Opus (finished on Gemini 3.8 Flash after Claude's weekly limit), built on Gemini 3.8 Flash.
  - The controller checked the commit: 17 of 18 `real/` files are byte-identical. The receipt differs only by correcting the brief's worker total from 34 to 33 (14 + 10 + 9, as the planner's own logs count).
  - The receipt is its own file under R87: `docs/implementation/receipts/P3-T2.md`.
  - No package, lockfile, Cloudflare resource or owner decision.

## Test plan
- [x] RED, every failure an `AssertionError`:
  - contracts 2 of 3;
  - app 2 of 26;
  - workers 8 of 33.
- [x] GREEN: contracts 3, app 26, workers 33.
- [x] 27 of 27 mutants killed, and the compat probes C1 to C4 4 of 4.
- [x] R100's fast gate:
  - `typecheck`, `typecheck:app` and `typecheck:edge`;
  - `test:edge` (18 files, 192);
  - `test:app` 35 and `test:unit`;
  - `build:edge`;
  - the four routes tests, 11 of 11;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the full workers suite, the database suites, `export:web` and the iOS export.
- [ ] Independent review (Opus), and a second review: the migration keeps every row and every link, and a source is set once and never edited.
- [ ] SKIPPED: none beyond R100's whole suites, which CI runs.

Closes #186 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
