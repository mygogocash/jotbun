# GoGoSpend Offline and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve manual drafts on device and reconcile them to exact server history without duplicate writes or stale-record resurrection.

**Architecture:** PostgreSQL's account-locked revision stream feeds encrypted per-account SQLite. The outbox stores immutable transmitted commands and tracks uncertainty separately from never-sent drafts. Full resync downloads one immutable account snapshot rather than independently paginating live tables.

**Tech Stack:** Existing API/Expo, SQLCipher/SecureStore, pure sync state machines and PostgreSQL integration tests; P1's private object adapter for full snapshots.

**Spec:** [Approved architecture](../../design/backend-architecture-2026-10-17.md), [master/shared contracts](2026-10-17-gogospend-backend.md), [money prerequisites](2026-10-17-gogospend-02-money.md), [P1 private-object prerequisite](2026-10-17-gogospend-04-jobs-privacy-release.md).

## Global Constraints

- All master constraints apply. S1 starts after M1–M4 and P1's local gate (local PostgreSQL plus the deterministic object-store failure adapter); this dependency is intentional despite the plan filenames. P1's hosted R2 gate must pass before S1's storage contract is reported complete and before beta, but does not block S1–S4 development. S3 and S4 also depend on M5, whose v1 resource adapter and screens they extend.
- Offline creation only: manual expense/income/transfer with already-synced wallet/category IDs. Existing record edits/deletes, budget/entity changes, imports/export/privacy remain online.
- Changes/tombstones 30 days; expired cursor `410 RESYNC_REQUIRED`; immutable full snapshot TTL 24 hours; download grants 5 minutes. All unresolved outbox commands survive a resync.
- Persist before **Saved on device · Waiting to sync**; confirmed and pending totals remain distinguishable. Auth denial/outage never silently destroys drafts.

## Review Focus

1. Snapshot tables and cursor come from different moments: S1 concurrent snapshot test.
2. Commit succeeds while response is lost and app crashes: S3 replay test.
3. A confirmed record is deleted before an old acknowledgement arrives: S3 no-resurrection test.
4. Account changes during a network/storage callback: S2/S4 isolation tests.
5. Device key is missing or an OS backup restores files without it: S2 native storage proof.

### Pinned regression assertions

Use these fixture assertions within each task's specified tests; native/provider checks still need real evidence.

| Task | Test name | Core assertion |
| --- | --- | --- |
| S1 | `pagination_never_splits_a_command_group` | `expect(page.groups[0].changes).toHaveLength(500); expect(decodedCursor.revision).toBe(group.revision)` |
| S2 | `failed_snapshot_swap_preserves_cursor_and_outbox` | `expect(after.cursor).toBe(before.cursor); expect(after.outbox).toEqual(before.outbox)` |
| S3 | `purged_ack_does_not_resurrect_original_draft` | `expect(confirmedIds).not.toContain(purgedId); expect(pendingAdjustmentMinor).toBe('0')` |
| S4 | `pending_expense_is_distinct_from_confirmed_total` | `expect(display.confirmed.expense_minor).toBe('10000'); expect(display.pendingAdjustment.expense_minor).toBe('6500')` |

### Task S1: Implement ordered deltas, consistent snapshots and command reconciliation

**Files:** Create `apps/api/drizzle/NNNN_sync.sql`, `packages/contracts/src/v1/sync.ts`, `apps/api/src/sync/{sync.controller,sync-query,snapshot-builder,snapshot.repository,sync-cursor}.ts`, `apps/api/src/sync/{sync-query,snapshot-builder}.integration.spec.ts`; extend M1 change writer/status, P1 handler registry and root/schema/exports.

**Interfaces:** `SyncQuery.after(ctx, cursor?: string, limit?: number): Promise<{groups: CommittedChangeGroup[]; next_cursor: string; has_more: boolean}>`; `SnapshotBuilder.build(lease: JobLease): Promise<SnapshotManifest>`; `SnapshotManifest = {snapshot_id: string; account_id: string; high_water: Revision; schema_version: 1; chunks: readonly {key: string; sha256: string; bytes: number}[]; expires_at: string}` is internal metadata. Public responses use opaque authorized chunk grants, never public keys. Use M1's owned command-status API for uncertain commands and P1's `LeasedAccountRead.withSnapshot` for worker reads; do not fabricate a user session.

- [ ] Add RED real-SQL tests that stagger two commits and read while a snapshot is building; applying snapshot plus changes strictly above its high-water yields every latest entity once. Allocate cursor revisions only through M1; reject wrong-account/malformed/future/expired cursors and expired manifests.
- [ ] Implement deltas with default 200/max 1,000 complete command groups per page, a 2 MiB page budget and 30-day retention. A cursor names the last fully included group revision. Add a page-boundary test where one command has 500 sibling changes: never split/skip any sibling or expose half a budget/transfer update. A too-large group is rejected before commit by M1. Create manifest/high-water from one PostgreSQL REPEATABLE READ view through the leased read capability and stream bounded chunks through P1. Deadline failure never publishes a partial manifest or advances a cursor.
- [ ] Test a mutation/deletion during multi-chunk creation: every chunk is from the same view, later changes remain above high-water, and deletion cancels issuance/publication under P1's generation/lease rules. Completed snapshots expire at 24 hours. No snapshot runs as an unbounded HTTP request.
- [ ] Run `npm run test:db -w gogospend-api -- --runTestsByPath src/sync/sync-query.integration.spec.ts src/sync/snapshot-builder.integration.spec.ts` plus P1's object contract tests against the failure adapter; this is S1's local gate and unblocks S2–S4. Under authorized R2/Neon proof, verify private grants/expiry and streamed checksums; until then record that check SKIPPED. Mocks alone do not complete the storage contract, and S1 is not reported complete for beta until the hosted check passes.
- [ ] Validate versioned manifests and all returned entity DTOs; review retention so purged private payloads are not retained in obsolete changes/snapshots. Record barrier/concurrency receipts and explicit `410` recovery behavior.

**Done:** a client can construct a complete consistent state at a known committed revision without skipping a race-window write.

### Task S2: Add encrypted per-account local storage and atomic replacement

**Files:** Modify `apps/app/app.json` and dependency manifest; create `apps/app/src/storage/{database.native,database.web,accountDatabase,keyStore,migrations,diaryRepository}.ts`, `apps/app/src/storage/{accountDatabase,diaryRepository}.test.ts`, `apps/app/src/storage/native-storage-proof.ts`, `docs/implementation/sqlcipher-device-proof.md`.

**Interfaces:** `AccountDatabase.open(accountId: string): Promise<DiaryStore>`; `DiaryStore.savePending(entry, command): Promise<void>`, `applyChangeGroups(groups: readonly CommittedChangeGroup[], cursor: string): Promise<void>`, `replaceConfirmed(snapshot, highWater): Promise<void>`, `readOutbox(): Promise<OutboxCommand[]>`, `lock(): Promise<void>`, `eraseAfterConfirmation(): Promise<void>`. Apply full groups, recomputed derived totals and cursor in the same local transaction. All callbacks carry F5's installation-local epoch captured at open, not a reusable server generation. Web uses only synthetic in-memory preview storage, never a real unencrypted fallback diary.

- [ ] Establish a transaction-capable local test adapter, then add RED assertions that entry+outbox either both persist or neither does; delta records+cursor commit together; confirmed replacement never removes unresolved outbox; an exception halfway through leaves the original confirmed store/cursor intact. Seed overlapping entity IDs in two accounts and prove isolation.
- [ ] Implement SQLCipher native configuration, random per-account key in SecureStore and versioned SQLite migrations. Store exact integer strings and confirmed/pending records separately. A missing/invalidated key locks data and offers explicit recovery/discard, never silently creates an empty replacement under the same account.
- [ ] Disable OS/cloud backup of database/key/temp receipt locations using reviewed platform configuration. Explicit erase drops that account's DB/key/outbox after confirmation; a transient 401/network error only locks it. Reject a stale local-epoch write after switch, including A → B → A with an old A SQLite/network callback. Do not put Auth0 tokens/application binding into SQLite.
- [ ] Run `npm run test:unit -w gogospend-app -- src/storage/accountDatabase.test.ts src/storage/diaryRepository.test.ts`. On both development builds, execute the native proof harness for encryption at rest, restart, migration rollback, process kill, key invalidation, backup exclusion and sign-out/account switch. Record controlled file inspection without displaying plaintext financial data or keys.
- [ ] Verify SQLCipher behavior using the actual native engine, not only the in-memory test adapter; attach redacted device/build evidence. An unsuccessful local commit must show a save error and must not show **Saved on device**.

**Done:** native local persistence is atomic, account-scoped, encrypted and recoverable in its documented failure states.

### Task S3: Implement outbox state, retry discipline and full reconciliation

**Files:** Create `apps/app/src/sync/{outbox,syncEngine,retryPolicy,reconcile,types}.ts`, `apps/app/src/sync/{outbox,syncEngine,reconcile}.test.ts`; extend `src/spend/v1/resources.ts`, F5 credentials transport and S2 repository.

**Interfaces:** `OutboxCommand = {commandId: string; accountId: string; schemaVersion: number; payload: CreateTransaction|CreateTransfer; state: 'unsent'|'sending'|'uncertain'|'needs_review'|'paused_upgrade'; firstTransmissionAt: string|null; createdAt: string}`. `schemaVersion` is fixed when the draft is saved and sent as the master `X-GoGoSpend-Command-Schema` header on every transmission. `SyncEngine.flush(snapshot: SessionSnapshot): Promise<SyncOutcome>`; `reconcile(store: DiaryStore, remote: SyncRemote): Promise<void>` preserves all unresolved commands and consults command status before replay/display. `SyncRemote` implements S1 deltas/snapshot and M1 command-status endpoints; it cannot change a command's immutable ID/body.

- [ ] Add RED tests for airplane mode, HTTP timeout after commit, kill before local acknowledgement, duplicate/late responses, token expiry, 429/5xx, 409/422, `426 CLIENT_UPGRADE_REQUIRED`, `422 COMMAND_SCHEMA_UNSUPPORTED`, a 200-draft backlog under repeated 429s, and account denial. One in-flight flush per account, at most two requests in flight; retry delay starts at 1 second, doubles with jitter to 60 seconds, honours `Retry-After`, and pauses after five consecutive transport/server failures until foreground/manual retry. A `429` with `Retry-After` is pacing, not a failure: it does not count toward the five-failure pause. The business-write limit is 60/minute per binding, so a 200-draft backlog takes at least about four minutes; the engine reports `n of m` progress for S4 rather than an error. `426 CLIENT_UPGRADE_REQUIRED` moves unsent commands to `paused_upgrade` without changing their ID/body, leaves uncertain commands uncertain, and stops flushing until the app is updated; `422 COMMAND_SCHEMA_UNSUPPORTED` moves that command to **Needs review** and keeps its draft. Validation/auth/conflict is not an infinite retry loop.
- [ ] Implement atomic local save then queue. Unsent drafts may be edited/removed locally; first transmission freezes payload/key even when its outcome is unknown. One token refresh maximum per failed request; preserve the same key/body. Older-than-30-day pending entries require review. Archived/deleted references become **Needs review** without data loss.
- [ ] Add and pass reconciliation assertions: full resync keeps unsent, sending and uncertain commands; status `unknown` retries only the original immutable command after reference checks; acknowledged commands resolve from current snapshot/change; `ENTITY_DELETED`/`ENTITY_PURGED` removes pending effects without inserting an old draft. Never reconstruct confirmed state from a compact receipt or stale acknowledgement.
- [ ] Run `npm run test:unit -w gogospend-app -- src/sync/outbox.test.ts src/sync/syncEngine.test.ts src/sync/reconcile.test.ts`. Combine the real API/SQL fixture with a controlled network cut immediately after commit; restart app and prove one server record/receipt, no missing local draft, correct confirmed balance. No live financial data.
- [ ] Review polling/cancellation: launch/foreground/manual/successful-write sync, at most one 60-second foreground timer, teardown on background/switch, no promised background OS delivery. Unknown outcome remains visible; retry exhaustion never converts it to failed-and-safe-to-recreate.

**Done:** uncertain outcomes resolve without duplicate writes, disappearing drafts or resurrected records.

### Task S4: Wire pending/conflict UX, locale settings and local reminders

**Files:** Create `apps/app/src/sync/SyncStatus.tsx`, `apps/app/src/spend/v1/pendingTotals.ts`, `apps/app/src/spend/v1/pendingTotals.test.ts`, `apps/app/src/notifications/{localReminders.native,localReminders.web}.ts`, `apps/app/src/notifications/localReminders.test.ts`, `apps/app/src/sync/SyncStatus.render.test.tsx`; modify v1 screens, session lifecycle, Thai/English locale messages and settings adapter/routes only after required visual approval.

**Interfaces:** `deriveDisplayedTotals(confirmed, pending): {confirmed: Totals; pendingAdjustment: Totals; estimated: Totals}` uses exact integer strings. `LocalReminderService.setPreference({enabled,localTime}): Promise<PermissionOutcome>` schedules one device-local daily reminder; denial is a usable settings state, not a hidden retry loop.

- [ ] Add RED render/state tests for **Saved on device · Waiting to sync**, syncing with `n of m` progress for a large backlog, uncertain, needs-review, upgrade-required, locked session and retry; the pending adjustment cannot masquerade as confirmed history. Undo of an unsent draft is local; transmitted commands require outcome resolution. Add locale cases for long Thai labels, empty history and permission denial.
- [ ] Produce focused artifact drafts for newly required sync/conflict/deletion notices and remaining unapproved visual pages; use E2 page approval before finalizing UI. Preserve Home/Add/Transactions style and update only necessary labels/layout. Use accessible status announcements, focus and reduced motion; never encode state by color alone.
- [ ] Wire S2/S3 to save, foreground and account lifecycle. Remote auth denial locks/preserves drafts; local explicit discard/sign-out erases only that account. A new identity with matching email cannot inherit its queue. Disable unsupported offline actions with a clear reconnect explanation. Locale/timezone settings use current server policy; optional analytics stays off.
- [ ] Add local notification adapter and opt-in preference; re-schedule on time/locale changes without duplicates. Local display uses device time, money reporting remains `Asia/Bangkok`. Web preview reports unsupported notifications gracefully; no push backend is introduced.
- [ ] Run the pending/reminder unit specs, `npm run test:render -w gogospend-app`, both typechecks, native airplane-mode/restart/two-device/account-switch journeys and 320 px Thai/English visual checks. Record device evidence for OS permission and delivery behavior; do not promise background synchronization or guaranteed reminder delivery.

**Done:** users can distinguish local pending money from confirmed money and recover from auth/network/device failures without silent data loss.
