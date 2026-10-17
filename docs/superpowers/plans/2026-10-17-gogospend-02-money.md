# GoGoSpend Money and Online Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver exact owned-wallet accounting, budgets and complete history through the first signed-in mobile journey.

**Architecture:** All domain writes share one account-locked command executor. SQL constraints encode ownership/type relationships; balances are derived from active records. The app uses a new v1 resource adapter rather than silently coercing legacy numbers or names.

**Tech Stack:** NestJS, shared TypeScript contracts, Drizzle/`pg`, PostgreSQL integration tests, existing Expo components and locale system.

**Spec:** [Approved architecture](../../design/backend-architecture-2026-10-17.md), [master/shared interfaces](2026-10-17-gogospend-backend.md), [foundation prerequisites](2026-10-17-gogospend-01-foundation-auth.md).

## Global Constraints

- All master constraints apply. F1–F4 and F6a's local schema/security job contract precede this stage; F5, F6a and F6b native/tenant gates precede any claim of signed-in readiness. F6c (linking) is not a prerequisite.
- Integer string money; cap `99,999,999,999` satang. One logical transfer row; positive expense/income and nonnegative opening. No float arithmetic, implicit upserts or content-based manual deduplication.
- All writes lock account state before status/session/version checks, receipt reservation and revision allocation. Current-required policy applies to writes; export/deletion exemptions remain intact.
- Preserve legacy Mongo source/data and current dirty work. No dual writes and no source/runtime migration without the execution gate.

## Review Focus

1. Two identical same-day purchases are valid with different keys: M1/M3.
2. A guard passes before deletion wins the database lock: M1.
3. A transfer edit/delete/restore changes only one wallet: M3 reconciliation.
4. A category rename/archive loses history or overstates a budget: M2/M4.
5. A 201st record disappears from history or a large total loses precision: M4/M5.

### Pinned regression assertions

Fixture variables belong to the named task test; these assertions are planned, not executed here.

| Task | Test name | Core assertion |
| --- | --- | --- |
| M1 | `same_command_executes_once_after_lost_response` | `expect(mutationExecutions).toBe(1); expect(secondAck).toEqual(firstAck)` |
| M2 | `renaming_category_preserves_historical_reference` | `expect(history[0].category_id).toBe(originalCategory.id)` |
| M3 | `golden_transfer_reconciles_both_wallets` | `expect([cash.balance_minor,daily.balance_minor]).toEqual(['235000','1870000'])` |
| M4 | `all_451_records_are_pageable` | `expect(new Set(allPages.map(r => r.id)).size).toBe(451)` |
| M5 | `large_minor_amount_is_formatted_exactly` | `expect(parseAmountInput('999999999.99','en')).toBe('99999999999')` |

### Task M1: Implement the common command transaction and revision protocol

**Files:** Create `apps/api/drizzle/0006_commands.sql`, `apps/api/src/commands/{command-executor,command-receipts.repository,command-status.controller,command-digest}.ts`, `apps/api/src/sync/change-writer.ts`, `apps/api/src/commands/{command-executor,command-status}.integration.spec.ts`; extend F2 schema and F1 command/error contracts.

**Interfaces:** Implement master `CommandExecutor.run` and `MutationResult`. `ChangeWriter.append(tx: OwnerTx, commandId: string, changes: readonly EntityChange[]): Promise<Revision>` writes one master `CommittedChangeGroup` and allocates its account revision under the held lock. `CommandReceiptRepository.lookup(tx, ids: readonly string[]): Promise<CommandStatus[]>` returns at most 100 outcomes; `CommandStatus = {command_id:string; state:'unknown'} | {command_id:string; state:'known'; ack:CommandAck}`. No arbitrary nested transaction or callback may publish an external object inside this database transaction. Each command kind registers the schema versions it accepts; `CommandInput.schemaVersion` comes from the master `X-GoGoSpend-Command-Schema` header and is part of the canonical digest.

- [ ] Create command/change/audit tables with owner/command uniqueness and minimal receipt fields. Add a compile-safe domain fixture that can exercise the executor; ensure the real SQL harness is green first.
- [ ] Add behavioral RED tests: concurrent same-key requests call the mutation once; changed normalized payload returns `409 IDEMPOTENCY_MISMATCH`; two different keys with the same purchase both succeed; failure rolls back mutation/receipt/change together. Assert receipts contain no amount/note/name/full DTO. Schema compatibility: a missing or unregistered schema version with no existing receipt returns `422 COMMAND_SCHEMA_UNSUPPORTED` and reserves no receipt or revision; a replay of an already-committed command returns its original acknowledgement even after its schema version is withdrawn; the same key with a different schema version returns `409 IDEMPOTENCY_MISMATCH`.
- [ ] Implement lock → current account/session/policy check → receipt check → schema-version check → validation/mutation → one atomic change group/audit/receipt → one commit. Existing receipt replay still requires currently authorized account/session. Enforce the master's 1 MiB serialized group budget before commit; no page may later split the group. Allocate revisions only under this lock; lock-order discipline also applies to disabling/global logout/deletion.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/commands/command-executor.integration.spec.ts src/commands/command-status.integration.spec.ts`. Use two real connections/barriers to prove a delayed mutation loses to a revocation/deleting state committed first, and commit order matches sync order. A timeout after server commit must return the original acknowledgement on retry.
- [ ] Test `ENTITY_DELETED`/`ENTITY_PURGED` status without private reconstruction and inaccessible owner IDs without existence leaks. Review rollback paths, canonical digest inputs and audit redaction. Record RED/GREEN and schema/grant diff.

**Done:** one reusable protocol prevents duplicate business writes and establishes committed sync order.

### Task M2: Add wallets, opening balances and stable categories

**Files:** Create `apps/api/drizzle/0007_wallets_categories.sql`, `packages/contracts/src/v1/{wallets,categories}.ts`, `apps/api/src/wallets/{wallets.module,wallets.controller,wallets.service,wallets.repository}.ts`, `apps/api/src/categories/{categories.module,categories.controller,categories.service,categories.repository}.ts`, `apps/api/src/wallets/wallets.integration.spec.ts`, `apps/api/src/categories/categories.integration.spec.ts`; extend schema/v1 root and contract exports.

**Interfaces:** `WalletsService.create(ctx, CommandInput<CreateWallet>)`, `update(ctx, CommandInput<UpdateWallet>)`, `archive(ctx, CommandInput<{id: string}>)` return `CommandAck`; owned queries return `WalletDto {id,name,currency:'THB',opening_minor,balance_minor,tracking_start,archived,version}`. Category DTO has stable UUID, immutable expense/income type, built-in key or custom label, color and archive/version state. All commands use M1.

- [ ] Add RED SQL/HTTP tests for cross-owner references, zero/capped opening, invalid currency/date, name validation, stale versions and immutable category type. Names trim to 1–80 characters; note/merchant constraints are defined in M3. A zero opening is not income.
- [ ] Implement owned CRUD with explicit request UUIDs and composite FKs. Seed stable built-in categories per account idempotently after bootstrap; custom creation is explicit. Renaming preserves references. Derive initial balance from opening; later M3 adds records. A correction after records exist requires an explicit reason and audit metadata, not a hidden income adjustment.
- [ ] Implement archive validation under the account lock: wallet must have zero derived balance; category/wallet archive blocks new references while historical queries retain the entity. Reject version conflicts; do not hard-delete a category with history. Restoration/unarchive is an explicit versioned action, not a new UUID.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/wallets/wallets.integration.spec.ts src/categories/categories.integration.spec.ts`. Assert rename/archive history, concurrent name edits, duplicate bootstrap seeds and meaningful permission errors. RLS tests also attempt direct forged composite references.
- [ ] Validate shared DTOs/OpenAPI against generated responses; register route access classes and focused rate budgets. Review owner/date indexes and fresh migration replay before integrating controllers.

**Done:** wallets/categories exist independently of transaction submission; no implicit name-based account data creation remains in v1.

### Task M3: Deliver expense/income/transfer and edit/delete/undo

**Files:** Create `apps/api/drizzle/0008_transactions.sql`, `packages/contracts/src/v1/transactions.ts`, `apps/api/src/transactions/{transactions.module,transactions.controller,transactions.service,transactions.repository,balance-query}.ts`, `apps/api/src/transactions/{transactions,reconciliation}.integration.spec.ts`, `apps/api/src/transactions/fixtures/golden-diary.ts`; extend wallet balance queries/schema and v1 root.

**Interfaces:** `TransactionsService.create(ctx, CommandInput<CreateTransaction>)`, `transfer(ctx, CommandInput<CreateTransfer>)`, `edit/delete/restore(ctx, command)` return compact `CommandAck`. Expense/income use `wallet_id/category_id`; transfer uses `source_wallet_id/destination_wallet_id`. `BalanceQuery.forWallets(tx, ids): Promise<ReadonlyMap<string, Minor>>` derives totals from active rows. Input ID is unique per owner. Notes ≤500 and merchant ≤120 characters; empty optional values normalize consistently.

- [ ] Add RED tests for exact positive amount/cap, real Gregorian dates and Bangkok today, wrong category type/owner, same-wallet/foreign/archived-wallet transfer and pre-tracking dates. Reject extra fields/invalid union branches. A client-provided `owner_id` is never accepted.
- [ ] Implement one-row transfer constraints and domain commands through M1. Expense/income/transfer edits require `If-Match`; stale update returns `409 VERSION_CONFLICT` plus a safe current record. Derived wallet totals allow negative balances. Deleting soft-hides immediately; restore is allowed for 30 days after deletion with current version and valid references. Expired restore fails; private payload purging is P5.
- [ ] Pin the exact fixture: cash opening `403200`, daily opening `146800`, income `2800000` to daily, expenses `18200` cash and `1226800` daily, transfer `150000` cash→daily. Assert balances `235000`, `1870000`, total `2105000`; income/expense exclude opening/transfer. Add two `6500` coffees with different IDs and keys; both remain.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/transactions/transactions.integration.spec.ts src/transactions/reconciliation.integration.spec.ts`. Prove edit/delete/restore of each transfer changes both wallet views atomically; crash/constraint failure leaves neither side changed. Race two edits and a delete/restore; one stale version loses with no extra receipt/revision.
- [ ] Reconcile direct SQL and wallet/transaction HTTP views to the fixture; M4 owns the later summary endpoint reconciliation. Test totals above JS safe-integer range remain strings and produce exact arithmetic. Review public error payloads and private audit/change fields against retention rules; no financial values enter operational logs.

**Done:** a complete financial slice reconciles exactly in real SQL and remains correct under retries/concurrent edits.

### Task M4: Add budgets and complete filtered history/summary

**Files:** Create `apps/api/drizzle/0009_budgets.sql`, `packages/contracts/src/v1/{budgets,history,summary}.ts`, `apps/api/src/budgets/{budgets.controller,budgets.service}.ts`, `apps/api/src/history/{history.controller,history-query,cursor}.ts`, `apps/api/src/summary/summary-query.ts`, `apps/api/src/budgets/budgets.integration.spec.ts`, `apps/api/src/history/history.integration.spec.ts`, `apps/api/src/summary/summary.integration.spec.ts`; extend schema/root/exports.

**Interfaces:** `BudgetService.set(ctx, CommandInput<SetMonthlyBudget>): Promise<CommandAck>`; `HistoryQuery.list(tx, filter: HistoryFilter, cursor?: string, limit?: number): Promise<{items: TransactionDto[]; next_cursor: string|null; as_of_revision: Revision; summary: FilteredTotals}>`; `SummaryQuery.month(tx, month: string): Promise<MonthSummary>`. `HistoryFilter = {from:string; through:string; wallet_id?:string; category_id?:string; type?:'expense'|'income'|'transfer'; query?:string; sort:'date_desc'|'date_asc'}` uses inclusive Gregorian date bounds. `Totals = {income_minor:Minor; expense_minor:Minor; balance_minor:Minor; by_wallet:Readonly<Record<string,Minor>>}`; `FilteredTotals` adds count, and `MonthSummary` adds month, category totals, budget usage and `as_of_revision`.

- [ ] Add RED tests: overall/category sublimits are positive and within cap; duplicate category limits reject; summed sublimits cannot exceed overall after either child or parent edit; uncapped category spending still counts overall. Transfers/opening never consume a budget. Test Bangkok month/year boundaries and category rename/archive continuity.
- [ ] Implement account-locked validation plus a deferred SQL constraint trigger for the category sum, including parent-limit changes and deletes. One account/month budget is unique. Use appropriate owner/month/date/type indexes; no separate mutable balance/summary cache.
- [ ] Implement keyset history `(occurred_on,id)` with requested ascending/descending order and opaque filter-bound cursor; default 50, reject limits outside 1–200. Reject malformed/cross-filter cursors. Return rows and their scoped summary from one consistent read transaction with an `as_of_revision`. Later pages whose data revision changed signal refresh; do not claim live multi-page history is one immutable snapshot.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/budgets/budgets.integration.spec.ts src/history/history.integration.spec.ts src/summary/summary.integration.spec.ts`. Insert 451 synthetic records with tied dates; fetch every page without hidden truncation/duplicates in the unchanged dataset. Concurrent sublimit/parent updates cannot breach the invariant. List/summary filters agree exactly.
- [ ] Inspect query plans on seeded synthetic scale and record the chosen indexes; only introduce an additional index for an observed query. Verify totals contain decimal strings and budget percentage/formatting never becomes arithmetic input. Review summary/history contracts for S1 snapshots and P4 exports.

**Done:** the 201st and later records remain accessible, and budgets/summary use consistent financial definitions.

### Task M5: Wire the first online app journey and retire its legacy transport

**Files:** Create `apps/app/src/spend/v1/{resources,money,viewModels}.ts`, `apps/app/src/spend/v1/{money,resources}.test.ts`, `apps/app/src/screens/v1/{HomeScreen,AddTransactionScreen,TransactionsScreen}.tsx`, corresponding `.render.test.tsx` files; modify `apps/app/app/spend/{index,all}.tsx`, `apps/app/src/api/{client,sharedClient}.ts`, locale messages. Wallet/settings screens are added only after their outstanding visual drafts are approved; their repository/resource ports are included here.

**Interfaces:** `SpendV1Resources.createTransaction(input, commandId)`, `createTransfer`, `wallets`, `categories`, `history`, `summary`, `budget` consume shared DTOs; no route accepts user ID or name-based ownership. `formatMinor(value: Minor, locale: 'th'|'en'): string` formats without float arithmetic; `parseAmountInput(text, locale): Minor` rejects ambiguous/invalid input rather than guessing.

- [ ] Add RED tests for exact THB parsing/formatting, unknown DTO field/number money rejection, immutable command retry, version conflict and permission errors. Every mutation sends the master `X-GoGoSpend-Command-Schema` header with the command; `426 CLIENT_UPGRADE_REQUIRED` shows an upgrade state that blocks new writes without sign-out or data loss (new state, E2 visual review). Render loading/empty/error/retry states; Home/Add/Transactions use their approved visual direction and appropriate labels/focus. New auth/conflict/retention states go through E2 visual review.
- [ ] Implement a separate typed `/v1` resource adapter and migrate these routes atomically, preserving F5 stable session handling. Fetch current entity/sync after compact acknowledgement; a receipt is not a record snapshot. Do not fall back to `/spend` or infer a Cash wallet on missing data. Wallet/category selection uses owned IDs; empty account prompts explicit creation.
- [ ] Show the golden fixture through Home → Add → Transactions, transfer flow, filtering and versioned edit/delete/undo. Online success is shown only after server acknowledgement; server conflict offers reload/explicit reapply rather than silent overwrite. Keep offline saving disabled until S2/S3 can persist it.
- [ ] Run `npm run test:unit -w gogospend-app -- src/spend/v1/money.test.ts src/spend/v1/resources.test.ts`, `npm run test:render -w gogospend-app`, `npm run typecheck:app` and web export. On both native builds prove actual authorized API writes/restart and Thai/English layout/screen reader/focus/reduced-motion behavior; no real auth claim from a web mock.
- [ ] Review all migrated callers for legacy numeric/source assumptions and removed auto-upserts. Preserve unrelated extraction changes and old unconverted screens behind explicit development separation. Record API/native receipts, remaining unapproved visual pages and rollback to the compatible v1 API.

**Done:** a real signed-in native user can create an expense and see exact updated wallet/history totals, with no hidden legacy transport fallback.
