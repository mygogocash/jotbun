# Retention runbook

Status: **local implementation only**, proven against local PostgreSQL and the
deterministic object-store adapter. Hosted storage expiry evidence is SKIPPED
until E1 (P1's hosted gate).

Retention runs in the generic job worker (`npm run worker:jobs`, login
`gogospend_jobs`) on every maintenance pass (`JOB_SWEEP_INTERVAL_MINUTES`,
default 15), through `RetentionHandler` and the steps registered in
`apps/api/src/privacy/privacy-steps.ts`. Every deadline is the database clock,
so no worker clock can shorten one. Each step is a SECURITY DEFINER routine
that deletes only what is past its deadline, never waits on an account lock a
user write holds (that account is retried next pass), works in bounded batches
(at most 10,000 rows per call, called again until a call removes nothing) and
can run any number of times. A failing step does not stop the others. An
account being erased is left to its erasure: retention writes no purge group
for it.

## What is kept, and for how long

| Data | Kept | Then | Step / mechanism |
| --- | --- | --- | --- |
| Deleted expense/income/transfer | counted nowhere from the moment it is deleted; restorable for 30 days | the row is deleted, every earlier change-log payload of it is removed, and its head becomes a `purged` tombstone in a new change group | `records.purge` (`gogospend_retention_purge_account` → `gogospend_purge_entities`) |
| Export request (`exports` row and `export` entity) | 30 days after the request (the file itself 24 hours) | row deleted, entity purged as above | `records.purge` |
| Export file, snapshot chunks | 24 hours | deleted by P1's sweep at expiry; an overdue export file alerts | P1 sweep (`worker.ts`) |
| Snapshot manifest rows | a week past expiry | deleted | `sync.change_log` (S1) |
| Superseded change-log rows | 30 days | deleted; the retention line (`pruned_through`) moves and older cursors get `410 RESYNC_REQUIRED` | `sync.change_log` (S1). P5 also removes rows superseded after an earlier pass, still incrementally: only the history of entities changed since the last pass is visited (50,000 entities: 1.6 ms per pass, against 27 ms for a full scan) |
| Command receipt request digests | 30 days (the outbox lifetime) | digest dropped; the compact acknowledgement stays, so status still answers, and a replay is `409 IDEMPOTENCY_MISMATCH` (never executed again) | `commands.receipt_digests` |
| Provider-event receipts, reconcile checks | 30 days (past the 7-day event window) | deleted | `auth.security_records` |
| Expired reauthentication challenges | a day past expiry | deleted | `auth.security_records` |
| `deleted` holds | one hour past provider verification of the erasure | deleted | `auth.security_records` |
| Finished jobs (succeeded, superseded, cancelled) | 30 days | deleted; failed jobs stay for the runbook | `jobs.finished` |
| Completed deletion requests | 30 days after the purge (and its registry record) | deleted | `privacy.deletion_requests` |
| P2a upload rows | 30 days after they were refused, failed or expired (or after an accepted upload's 24-hour expiry); never a receiving one or one inside the 24-hour quota window | deleted (P2a's maintenance clears names after 8 days; quarantine objects go at 24 hours) | `imports.uploads` |
| Unconfirmed previews and unattached sanitized images (P2b), receipts of purged or replaced records (P2c), import selections (P3) | per their task | - | **registration point**: each task adds its step (below) |

## Purged records and sync

`gogospend_purge_entities(account, entity, ids)` is the one way to remove a
synced record's data, under the account lock:

- the head moves to `purged` at the next version in a new change group (a
  derived command id; no receipt). Delta readers receive the tombstone; the app
  diary drops the record's data and keeps the tombstone;
- every earlier change row of those entities is deleted (their snapshots held
  the data) and `pruned_through` moves over them. Those rows are all at least
  30 days old (a record is purged 30 days after its deletion, and a deleted
  record cannot be edited), so only cursors older than S1's own 30-day
  guarantee resync;
- snapshot manifests built before the purge are dropped and their chunk
  objects become due for the sweep, and the account's purge watermark
  (`account_sync_state.purge_revision`) moves to the purge's revision: a
  snapshot whose read view predates it is refused by
  `gogospend_record_snapshot` (the builder retries with a fresh view), so no
  view read before the purge can be served afterwards;
- compact receipts stay: a replay of the original command returns its
  acknowledgement with `entity_state: "purged"`, and any new create, edit or
  restore for that id is `410 ENTITY_PURGED`. Nothing can resurrect the record.

## Adding a step (P2a, P2b, P2c, P3)

Register in `defaultPrivacySteps()` (`privacy-steps.ts`) and nowhere else:

```ts
.retention({ name: 'imports.preview', run: (pool) => batched(pool, 'gogospend_prune_import_candidates') })
```

- one SECURITY DEFINER routine per step, granted to `gogospend_jobs`, with a
  database-clock cutoff, `FOR UPDATE SKIP LOCKED` on any account lock, and a
  bounded batch;
- objects: register every key through P1's publication registry with its
  purpose in `PUBLICATION_PURPOSES`, and give it a `delete_after`; the sweep
  deletes it. Account erasure then deletes the account's objects of every
  purpose automatically;
- synced records: purge with `gogospend_purge_entities` (and delete the domain
  rows first); an attachment association should reference its record with
  `ON DELETE CASCADE`, so a record purge removes it, and a retention step then
  deletes attachments nothing references;
- account erasure: owned tables reference `accounts(id) ON DELETE CASCADE`.
  A table that must outlive the account goes in `ERASURE_HANDLED_TABLES` with
  the step that clears it; `deletion.integration.spec.ts` fails on any other
  table with an `account_id`. Anything the cascade and object stage cannot
  reach is an `.erasure({ name, run })` step: idempotent, run under the
  deletion lease before the purge.

## Alerts

The job worker logs, counts only:

- `job worker: retention <step>=<n> …` - what each pass removed;
- `job worker: retention step(s) failed: <names>` - **alert** when it repeats;
- `job worker: N export object(s) overdue for deletion` - **alert** (P4);
- `job worker: N <kind> job(s) failed` - **alert** (P1).

## Checks (operator, admin connection)

```sql
-- Deleted records past the restore window still waiting (should be ~0 after a pass).
SELECT count(*) FROM transactions WHERE deleted_at < now() - interval '30 days';
-- Receipts still carrying a digest past the outbox lifetime.
SELECT count(*) FROM command_receipts WHERE request_digest IS NOT NULL AND committed_at < now() - interval '30 days';
```
