## Summary
- **P4-T3: the vault's slip tables, the slip salt, slip accounts and the inbox count.**
  - **Migration `0006_slips.sql`:** the plan's statements verbatim. Six STRICT tables, `slip_drafts_order_idx`, `transactions.slip_ref_id` (by `ADD COLUMN`) and `transactions_merchant_idx` (P2).
  - **`vault/slips/salt.ts`:** `slipSalt`. 32 random bytes made on the first read, inside the call's block, so two first reads never make two salts. Answered as base64url and never logged (P14).
  - **`vault/slips/accounts.ts`:** one account per bank and last four digits, with a random UUID (P10). The list sorts by open drafts. `updateSlipAccount` maps an account to a wallet.
  - **`vault/slips/inbox.ts`:** `openDraftCount`, `inboxChange` (the `slip_inbox` entity), `slipDraftDto` and `slipDuplicateOf`. `SlipDraftRow` is the snake_case SQL row with the amount as text (P3, R16).
- **Three routes**, each in `VAULT_ADDED_ROUTES`:
  - `GET /v1/slips/salt`;
  - `GET /v1/slip-accounts`;
  - `PUT /v1/slip-accounts/:id` (`current_policy`, the `imports` gate).

  The two account routes carry `release: 'SLIP_IMPORT_ENABLED'`.
- **The release check (P8)** sits right after the route matches. An unreleased route answers 404 `NOT_FOUND` before the body, gates, client check and token, so it cannot be told from a missing one. `wrangler.jsonc` keeps the var `"false"`.
- **Mapping an account (P7)** reads If-Match as a command does, in R41's order: If-Match, the id, the body, the version (409 with the current account), then the wallet (`errors.wallet_not_found` or `errors.wallet_archived`, 422).
- **Beyond the plan's file list (P4):** P3-T2's `transaction-source.test.ts` upgrade case pinned the exact column list, which the new `slip_ref_id` column breaks (shown in the planner's proof log). The case now allows the columns that later migrations add after `source`, as `currency-migration.test.ts` already does for tables.
- **The controller accepted the planner's calls P1 to P16.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: 18 of 19 `real/` files are byte-identical. The receipt adds one line, the skipped installs.
  - The receipt is its own file under R87: `docs/implementation/receipts/P4-T3.md`.
  - No package, lockfile, Cloudflare resource, secret or app change. `SLIP_IMPORT_ENABLED` is a var, off.

## Test plan
- [x] RED: Node 1 of 10 and Workers 14 of 36 failing, every one an `AssertionError`, under the heavy lock. RED's migration makes the tables without their rules (P5). `typecheck:edge` passes at RED.
- [x] GREEN: Node 10, Workers 36. The five neighbours pass: `ai`, `attachments`, `download-aborts`, `currency-migration` and `files-erase`.
- [x] 98 of 98 mutants killed (SQL 53, code 45), every failing case an assertion. Both batch outputs are byte-identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - `test:edge` (20 files, 207);
  - `build:edge` (the migration is in the bundle);
  - `git diff --check`.
- [x] CI at `6cb8d0d1`: **8 of 9**. `test:edge:workers` failed 1 of 845 cases: `sync.test.ts`'s "snapshots validate exactly the entities the API registers". That case pins the vault registry's entity list, and its comment already said phase 4 registers `slip_inbox`; it was outside the planner's gate.
- [x] **The controller's CI fix, `1eb4e5ed` (ruling R122):** test-only. The list gains `slip_inbox`, and the comments say `trip` waits for P5-T9; the receipt gains one line. The file passes 17 with 1 todo under the heavy lock, and a mutant that unregisters `slip_inbox` fails it on an `AssertionError` (`.claude/controller/scratch/p4-t3-ci-fix/`).
- [x] CI at `1eb4e5ed`: 9 of 9, with the whole workers suite (844 passed, 1 todo) and `test:edge:db` (the parity Worker applies the migration).
- [x] Independent review (Opus) and second review (Sonnet): **both approved** on `1eb4e5ed` (`.claude/controller/reviews/P4-T3.md`, `reviews/P4-T3-second.md`). Both found that R122 is right and that no other file pins the vault's entity or route lists. No open blocker or major. Their minors are test pins on code that is right today (the release check compared on whole responses, R41's order with two faults, a mapping that writes one account, a draft counted once, the salt never logged). They are carried in `followups.md`.
- [ ] SKIPPED: nothing hosted. The route stays dark until the owner turns on `SLIP_IMPORT_ENABLED`.

Closes #211 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
