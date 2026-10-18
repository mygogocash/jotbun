# Backup, recovery inventory and restore runbook (P6a)

Status: **local implementation only.** No Neon project, R2 bucket, erasure
registry or managed secret has been used (E1 not authorized). Everything marked
*Hosted* below is SKIPPED, and P6a is not complete until it passes. A failed or
SKIPPED restore rehearsal blocks beta readiness (P6b).

## What exists

| Piece | File | Local adapter | Hosted adapter |
| --- | --- | --- | --- |
| Encrypted streaming backup + accepted-attachment copy | `scripts/ops/backup.mjs` | `localDockerDump`, `localRecoveryStore`, `memoryAttachmentSource` | Neon dump, R2 recovery scope, R2 attachment scope: SKIPPED |
| Recovery inventory (`RecoveryInventory.enumerate()`) | `scripts/ops/recovery-inventory.mjs` | `recoveryStoreSource`, `restoreLedgerSource` | `neon-history`, `neon-branches`, `neon-snapshots`, `r2-recovery-objects`: SKIPPED |
| Restore rehearsal (`restoreRehearsal(input)`) | `scripts/ops/restore-rehearsal.mjs` | `localDockerRestorer` (`local-postgres.mjs`) | Neon branch/PITR restore: SKIPPED |
| Erasure-marker contract (P5 satisfies it) | `scripts/ops/erasure-markers.mjs` | `memoryMarkerSource` | R2 recovery-control registry: SKIPPED |
| Key custody, stream format | `scripts/ops/recovery-crypto.mjs` | key from an inherited pipe | managed configuration: SKIPPED |
| Errors, logs, CLI parsing | `scripts/ops/ops-safety.mjs` | | |

Commands:

```sh
npm run test:ops               # safety tests, plus the Docker rehearsal when the local server is up
npm run ops:rehearsal:local    # the end-to-end rehearsal on its own, printing its receipt
node scripts/ops/backup.mjs --target local --database <name> --recovery-dir <abs dir> --key-fd 3 --synthetic 3< <(your-secret-manager read …)
node scripts/ops/recovery-inventory.mjs --recovery-dir <abs dir> [--key-fd 3]   # exit 3 while hosted sources are SKIPPED
node scripts/ops/restore-rehearsal.mjs --target isolated-synthetic # hosted: refuses, exit 3 (SKIPPED)
```

`npm run test:ops` runs `local-rehearsal.test.mjs` against the local Docker
PostgreSQL. If that server is unreachable the test is skipped and the runner
prints the reason; set `GOGOSPEND_OPS_REQUIRE_DB=1` to make it a failure.

## Rules the tooling enforces

- **Retention.** Every recoverable copy expires at most 7 days after it was
  taken: backup sets, restore-created databases (default 24 h), and every
  hosted copy once its adapter exists. The inventory refuses a copy with no
  expiry, more than 7 days of retention, an expiry more than 7 days away, a
  copy still listed after its expiry, and a non-production copy that is not
  synthetic.
- **Retention dates a store writer cannot stretch.** A backup set's creation
  time is the oldest of the time in its id (`bk_YYYYMMDDTHHMMSSZ_…`) and the
  manifest's `created_at`. Unless the manifest verifies with the recovery key,
  the oldest of its files' modification times also counts and retention is the
  full 7 days. A verified manifest may shorten retention, never lengthen it.
  Prune and the inventory use these dates, not the manifest's own claims. With
  the key (`--key-fd`), a manifest that fails its MAC is a violation
  (`manifest_unverified`).
- **Nothing unaccounted for.** Every entry in the store directory is a backup
  set's file, the restore ledger, a partial write (a copy that the store
  removes after 24 h) or a stray. A part without a manifest, an unreadable
  manifest or an unknown file is an `unaccounted_file` violation, and prune
  removes it 7 days after its last modification.
- **Clearing an erasure marker.** P5 records the marker first and purges
  later, so a backup taken in between still holds the account. A marker is
  clearable only when:
  - it carries `purged_at`;
  - the inventory is complete (no SKIPPED source);
  - every copy taken at or before `purged_at` has expired. A point-in-time
    history window counts as holding the pre-purge state until
    `purged_at` + its window.

  `canClearMarker` / `markerClearableAt` implement this; without `purged_at`
  the answer is "never".
- **Fail closed.** A source that cannot be listed fails the whole inventory
  (`INVENTORY_SOURCE_FAILED`), never a shorter list.
- **No plaintext at rest.** `pg_dump` output and attachments go through the
  authenticated stream straight into 0600 files in an owner-only (0700)
  directory outside the repository. Restores stream decrypted records into
  `pg_restore` over a pipe. Nothing secret is in an argument; tool stderr is
  discarded. A decryption failure closes the backup file it was reading.
- **Key custody.** The recovery key comes from an inherited descriptor (a pipe
  from a secret manager), never an ordinary file (`KEY_SOURCE_PLAINTEXT_FILE`),
  a terminal (`KEY_SOURCE_TERMINAL`), an argument, stdout or an environment
  variable. CLIs refuse any secret-shaped or unknown argument without echoing
  it (`ARGUMENT_REFUSED`, exit 2).
- **The API holds no recovery authority.** The API, security worker and job
  worker environments (`apps/api/.env*.example`) and `apps/api/src` contain no
  recovery-key, recovery-store or erasure-registry credential name, and the API
  never imports `scripts/ops` (`restore-safety.test.mjs` checks both). Backups,
  restores and the registry run as a separate operator/cron role.
- **Redaction.** Every failure is an `OpsError` with a fixed code and message.
  Error details and log fields keep only:
  - UPPER_SNAKE codes;
  - lower-case identifiers (names, UUIDs, 32-hex key ids);
  - backup-set ids;
  - ISO dates, counts and booleans.

  Mixed-case base64-like values and hex longer than a key id are replaced with
  `[redacted]`. Tests inject synthetic connection strings, access keys and
  baht/satang values into every failure path, and scan logs and receipts for
  the recovery key and its derived MAC key in hex/base64/base64url.

## Stream format

`GGSREC01 | key id (16) | salt (32) | nonce prefix (7)`, then records of at most
64 KiB: `u32 length (high bit = final) | AES-256-GCM ciphertext | tag`. The file
key is HKDF-SHA256(recovery key, salt); each nonce is `prefix | u32 counter |
final flag` and the header is the AAD. Each of these fails with
`BACKUP_INTEGRITY`, and no record's plaintext is released before its tag is
verified:
- reordering records;
- truncation, including at a record boundary with the last kept record's flag
  forged to final;
- anything after the final record, even an authentic one;
- a cleared final flag;
- another file's header.

A different key fails with `RECOVERY_KEY_MISMATCH`. The manifest (expiry, and
the size and SHA-256 of each part) carries an HMAC under a key derived from the
recovery key. A store writer without the key therefore cannot extend an expiry
or swap in a part from another backup made with the same key.

## Restore rehearsal: order of operations

1. Refuse the target unless it says `serving: false`, `isolated: true`, a
   non-production environment, a loopback adapter and a fresh
   `gogospend_restore_*` name. `gogospend_v1`, `postgres`, the templates and
   `neondb` are serving names. `kind: "hosted"` is SKIPPED until E1.
2. Check the endpoint the adapter will really use (`restorer.endpoint()`) is a
   loopback IP. The local adapter resolves its connection exactly as `pg`
   does: URL host, a `host=` query parameter, `PGHOST`/`PGPORT`, or a socket
   path. It requires 127.0.0.0/8 or ::1 on port 55432, the container that
   `pg_dump`/`pg_restore` run in, and checks this on every connection. The
   declared target fields are only the first gate.
3. Refuse without the restore-copy ledger, recovery-key custody, or a complete,
   independent, correctly keyed erasure registry (below). Nothing has been read
   or created yet.
4. Select the named backup, or with `latest` the newest set that verifies. A
   planted, unverifiable or future-dated manifest is skipped, so it cannot block
   or hijack restores. Check key id, manifest MAC and expiry
   (`BACKUP_MISSING`, `RECOVERY_KEY_MISMATCH`, `BACKUP_INTEGRITY`,
   `BACKUP_EXPIRED`).
5. Refuse a backup that is production or not synthetic into a non-production
   target (`RESTORE_DATA_CLASS_MISMATCH`). Restoring real data needs a hosted,
   isolated production-class target (E1/E3), which does not exist yet.
6. Record the restore-created copy in the ledger (it is a recoverable copy).
   Then create the private database, never an existing one. `CONNECT` and
   `TEMPORARY` are revoked from PUBLIC at creation, so only superusers can open
   it, and that is checked again after `pg_restore`. No serving login can read
   the copy before erasure is applied.
7. Reapply erasure markers. A marker erases its own account, and every account
   with an alias whose keyed lookup it lists if that alias was created no later
   than the marker. (An older backup can hold an alias that was later linked
   elsewhere; a later sign-up with the same subject is kept.) A deletion the
   restored copy itself holds as accepted but not purged (`deletion_requests`,
   `restorer.openDeletions`) is erased too: its marker may not exist yet (P5
   writes it after the acceptance). In one transaction:
   - P5's `gogospend_reapply_erasure` for every erasure still in progress -
     a marker without `purged_at`, or a request held by the copy
     (`plan.reapply`): it captures the account's provider aliases and
     re-queues a deletion job without an `account_id`, so provider cleanup,
     the object sweep, the purge and the marker's `purged_at` are redone by
     P5's deletion worker once the copy serves (its provider calls are
     harmless when already done). A marker with `purged_at` is only replayed;
   - re-block every alias of those accounts in `blocked_principals` with the
     block end the marker records (none = no end until the re-queued erasure
     purges; an end already past adds no block; an existing open hold stays);
   - delete rows keyed by those aliases' principal digests
     (`auth_event_receipts`, `security_reconcile_checks`, `auth_sessions`,
     `reauth_challenges`: every `public` table with a `principal_digest` column
     except `blocked_principals`);
   - delete rows from `account_id` tables that do not follow `accounts` (jobs,
     object publications);
   - delete the accounts (owned rows cascade).
8. Prove it. There must be no row for an erased account in `accounts`, in any
   `public` table with an `account_id` column (this includes a marker's account
   id whose account row is already gone), or in any principal-digest table
   above (`erased_owner_rows`, else `ERASURE_NOT_APPLIED`). P5's work items
   (`deletion_requests` keyed by `erased_account_id`, `deletion_request_subjects`,
   the re-queued job with no `account_id`) are deliberately outside this check:
   they are the erasure itself, and hold the provider aliases only until the
   re-queued erasure purges them. The receipt counts them as
   `erasures_requeued`.
9. Every retained attachment reference must resolve, with a matching SHA-256,
   in the backup's attachment copy (`missing_retained_objects`, else
   `ATTACHMENT_REFERENCES_MISSING`). The references are P2c's
   `RETAINED_ATTACHMENT_REFERENCES_SQL` (`scripts/ops/local-postgres.mjs`):
   every `attachments` row with status `retained`, whether the record holding
   it is active or deleted within its 30-day undo window. Released receipts are
   not references (their objects are deleted). A copy taken before P2c (no
   `attachments` table) has nothing to check; a restorer given no query for a
   schema with attachment tables is refused (`ATTACHMENT_VALIDATOR_MISSING`).
   Erased accounts' receipts are gone with their rows, and their objects in
   the copy are not restored (`unreferenced_objects_not_restored`).
10. Never switch traffic. The receipt says `ready_for_serving_switch` and
    `serving_switch: "not_performed"`. Drop the target (always on failure) and
    mark it dropped in the ledger.

A serving switch after a real restore is a separate, explicitly authorized
release step (P6b/E3). It must also restore what a logical dump does not carry:
roles and their attributes, `CONNECT` grants for the serving logins, and any
database-level settings, including 0001's `REVOKE TEMPORARY … FROM PUBLIC`.
Then it reruns this rehearsal's checks on the target.

## The erasure-marker contract (for P5)

P5's `ErasureRegistry.record(accountId, providerSubjectKeys)` writes, before any
destructive cleanup, one marker per accepted deletion to a maintenance-only
recovery-control scope that is not inside the database or backups being
restored:

```text
{ marker_id: uuid, account_id: uuid, subject_lookups: [base64url HMAC-SHA256 …],
  lookup_key_id: 32 hex, recorded_at: ISO-8601 UTC,
  purged_at?: ISO-8601 | null, blocked_until?: ISO-8601 | null }
```

- Only these keys: no email, name, raw subject, token or financial value
  (`ERASURE_MARKER_INVALID` otherwise). `purged_at` cannot be earlier than
  `recorded_at`.
- `subject_lookups` has 1–32 entries, one per provider alias, each
  `deriveSubjectLookup(lookupKey, issuer, subject)` =
  HMAC-SHA256(key, `gogospend-erasure-subject-v1\0<issuer>\0<subject>`).
- `lookup_key_id` is `SubjectLookupKey.id` of the registry lookup key.
- **`purged_at`**: P5 sets it, once, on every unpurged marker of the account
  after its purge transaction committed (the registry stage of the deletion
  worker). Until then the marker can never be cleared, and a restore
  re-queues the account's erasure (step 7). An erasure re-run after a restore
  appends a new, unpurged marker, so the account cannot be cleared before that
  run is purged too.
- **`blocked_until`**: P5 sets it with `purged_at`: one hour past provider
  verification, the end of the aliases' hold (no access token issued before
  the provider deletion can still be valid). A restore replays it. Null means
  the erasure is still in progress: held with no end until it purges.
- P5's purge removes the same principal-digest rows as step 7 (event
  receipts, reconcile checks, sessions, challenges) and keeps only the
  `blocked_principals` hold; provider events for an alias under an active
  `deleted` hold record nothing.
- **The window before the marker** (see [deletion.md](deletion.md)): the API
  answers `accepted` before the deletion worker writes the marker. A backup
  taken before the acceptance holds neither the request nor a marker; before
  a serving switch the operator compares the failed primary's open
  `deletion_requests` (or the deletion worker's alerts) with the copy and runs
  `gogospend_reapply_erasure` for any account it still holds.
- P5's `PostgresErasureRegistry` is not itself an `ErasureMarkerSource`: it has
  `independent` (false unless deployed outside the main database and its
  backups), `location` and `listMarkers()`, but no `lookupKey()` - the key's
  bytes never leave it. The restore builds its source from a read login on
  the registry and its own key custody. The local registry is not independent
  (same database): the hosted placement is SKIPPED (E1).
- The registry is supplied to restores as an `ErasureMarkerSource`:
  `{ independent: true, location, listMarkers(), lookupKey() }`.
  - `listMarkers` returns the complete set and throws on any failure (never
    `[]` for "could not read").
  - `lookupKey` returns a `SubjectLookupKey`, or throws when custody is
    unavailable.
  - Each of these refuses the restore before any data is read: a missing
    registry, `independent !== true`, an unreadable registry, missing key
    custody, or a marker made with another key.
- Markers are not signed; the registry should be append-only (object lock or
  versioning) so that a marker cannot be quietly removed.

## Local rehearsal

`npm run ops:rehearsal:local` (and the Docker test in `npm run test:ops`):

1. creates `gogospend_rehearsal_src_<random>`, applies the migrations and seeds
   four synthetic accounts. Each has an alias, a wallet, a category, three
   expenses, a queued job, a verified provider-event receipt, a reconcile
   check, and one P2c receipt (registry row, `attachments` and
   `transaction_attachments`) held by its first expense. The kept account also
   has a receipt held by a record deleted within its undo window, and a
   released receipt whose object is gone. One account has a deletion accepted
   (P5's request, captured alias and job) but no marker yet;
2. takes an encrypted backup with an in-memory key (or `--key-fd N`);
3. records markers (one by account id still in progress - no `purged_at` -,
   one by a linked alias only, purged with a block end, one for an account the
   backup never held), then deletes two accounts in the source;
4. refuses `gogospend_v1` as a serving target before connecting;
5. restores the pre-deletion backup into `gogospend_restore_<random>`, reapplies
   the markers and checks:
   - no erased-owner row, no erased job, no erased principal-digest row;
   - both erased aliases blocked, with the recorded block end replayed;
   - the in-progress erasure and the copy's accepted-but-unmarked deletion
     re-queued by P5's routine (a detached job, one captured alias each, holds
     open), and the purged one not re-queued;
   - the kept account byte-identical, with its event receipt and receipts;
   - the kept account's two retained receipts (one held by a deleted record)
     checked against the copy by P2c's reference query, and the erased
     accounts' receipt objects not restored;
   - no PUBLIC or non-superuser `CONNECT` and no PUBLIC `TEMPORARY`;
6. tampers one ciphertext byte and proves the restore is refused with
   `BACKUP_INTEGRITY` and its target is gone;
7. drops every database it created and deletes its temporary recovery
   directory. It never touches `gogospend_v1`, other databases or any role.

It prints a JSON result whose `receipt` is the redacted `RestoreReceipt`.

## Hosted gate (SKIPPED until E1)

With exact authority for an isolated synthetic Neon project and private R2
recovery/attachment/control scopes, and the keys in managed configuration:

- implement the hosted adapters behind the same interfaces:
  - dump through managed configuration;
  - an R2 recovery store with a 7-day lifecycle rule;
  - the attachment copy and the R2 erasure registry;
  - Neon history, branch and snapshot inventory sources;
  - a branch restore target whose `endpoint()` is checked like the local one;

  configure seven-day PITR only on the authorized resource;
- run `node scripts/ops/restore-rehearsal.mjs --target isolated-synthetic`:
  restore a pre-deletion backup, reapply markers, prove deleted principal and
  financial rows absent and retained attachments available;
- measure PITR RPO ≤ 1 hour and RTO ≤ 4 hours, and the daily-backup fallback
  RPO ≤ 24 hours; store the redacted receipts for P6b's readiness check;
- confirm the inventory report is `complete: true` with every hosted copy
  expiring within 7 days, and alert on backup age over 26 hours (P6b).
