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
npm run test:ops               # hermetic safety tests (no Docker, no provider)
npm run ops:rehearsal:local    # end-to-end rehearsal on the local Docker PostgreSQL 17
node scripts/ops/backup.mjs --target local --database <name> --recovery-dir <abs dir> --key-fd 3 --synthetic 3< <(your-secret-manager read …)
node scripts/ops/recovery-inventory.mjs --recovery-dir <abs dir>   # exit 3 while hosted sources are SKIPPED
node scripts/ops/restore-rehearsal.mjs --target isolated-synthetic # hosted: refuses, exit 3 (SKIPPED)
```

## Rules the tooling enforces

- **Retention.** Every recoverable copy expires at most 7 days after it was
  taken: backup sets (`expires_at = created_at + 7 d`, MAC'd), restore-created
  databases (default 24 h), and every hosted copy once its adapter exists. The
  inventory refuses a copy with no expiry, more than 7 days of retention, an
  expiry more than 7 days away, a copy still listed after its expiry, and a
  non-production copy that is not synthetic. The local store prunes expired
  sets after each backup; a part without a readable manifest is itself a
  violation until pruned.
- **Fail closed.** A source that cannot be listed fails the whole inventory
  (`INVENTORY_SOURCE_FAILED`), never a shorter list. The report has
  `complete: false` while any source is SKIPPED, and an erasure marker may be
  cleared only from a complete inventory, after the last copy taken at or
  before the marker has expired (`canClearMarker`).
- **No plaintext at rest.** `pg_dump` output and attachments go through the
  authenticated stream straight into 0600 files in an owner-only (0700)
  directory outside the repository. Restores stream decrypted records into
  `pg_restore` over a pipe. Nothing secret is in an argument; tool stderr is
  discarded.
- **Key custody.** The recovery key comes from an inherited descriptor (a pipe
  from a secret manager), never an ordinary file (`KEY_SOURCE_PLAINTEXT_FILE`),
  an argument, stdout or an environment variable. CLIs refuse any secret-shaped
  or unknown argument without echoing it (`ARGUMENT_REFUSED`, exit 2).
- **The API holds no recovery authority.** The API, security worker and job
  worker environments (`apps/api/.env*.example`) and `apps/api/src` contain no
  recovery-key, recovery-store or erasure-registry credential name, and the API
  never imports `scripts/ops` (`restore-safety.test.mjs` checks both). Backups,
  restores and the registry run as a separate operator/cron role.
- **Redaction.** Every failure is an `OpsError` with a fixed code and message;
  details and log fields keep only short identifiers, counts and dates. Tests
  inject synthetic connection strings, access keys and baht/satang values into
  dump, attachment, registry, inventory and restore failures and assert they
  appear in no error, log line or receipt.

## Stream format

`GGSREC01 | key id (16) | salt (32) | nonce prefix (7)`, then records of at most
64 KiB: `u32 length (high bit = final) | AES-256-GCM ciphertext | tag`. The file
key is HKDF-SHA256(recovery key, salt); each nonce is `prefix | u32 counter |
final flag` and the header is the AAD. Reordering, truncation (including at a
record boundary), appending, a flipped final flag or another file's header all
fail with `BACKUP_INTEGRITY`, and no record's plaintext is released before its
tag is verified. A different key fails with `RECOVERY_KEY_MISMATCH`. The
manifest (expiry, sizes, SHA-256 of each part) carries an HMAC under a key
derived from the recovery key, so a store writer without the key cannot extend
an expiry.

## Restore rehearsal: order of operations

1. Refuse the target unless it says `serving: false`, `isolated: true`, a
   non-production environment, a loopback adapter and a fresh
   `gogospend_restore_*` name. `gogospend_v1`, `postgres`, the templates and
   `neondb` are serving names. `kind: "hosted"` is SKIPPED until E1.
2. Refuse without the restore-copy ledger, recovery-key custody, or a complete,
   independent, correctly keyed erasure registry (below). Nothing has been read
   or created yet.
3. Select the named or newest backup; check its key id, manifest MAC and expiry
   (`BACKUP_MISSING`, `RECOVERY_KEY_MISMATCH`, `BACKUP_INTEGRITY`,
   `BACKUP_EXPIRED`).
4. Record the restore-created copy in the ledger (it is a recoverable copy),
   create the private database (never an existing one) and stream the restore.
   The local adapter then reapplies 0001's database-level hardening (`REVOKE
   TEMPORARY … FROM PUBLIC`), which a per-database dump does not carry.
5. Reapply erasure markers: erase each marker's account, and every account with
   an alias whose keyed lookup the marker lists if that alias was created no
   later than the marker (an older backup can hold an alias that was later
   linked elsewhere; a later sign-up with the same subject is kept). In one
   transaction: block every alias of those accounts in `blocked_principals`,
   delete rows from `account_id` tables that do not follow `accounts` (jobs,
   object publications), then delete the accounts (owned rows cascade).
6. Prove it: every `public` table with an `account_id` column, and `accounts`,
   must have no row for an erased id (`erased_owner_rows`, else
   `ERASURE_NOT_APPLIED`).
7. Every retained attachment reference must resolve, with a matching SHA-256,
   in the backup's attachment copy (`missing_retained_objects`, else
   `ATTACHMENT_REFERENCES_MISSING`). A schema with attachment tables but no
   reference query is refused (`ATTACHMENT_VALIDATOR_MISSING`); P2c supplies
   the query.
8. Never switch traffic. The receipt says `ready_for_serving_switch` and
   `serving_switch: "not_performed"`. Drop the target (always on failure) and
   mark it dropped in the ledger.

A serving switch after a real restore is a separate, explicitly authorized
release step (P6b/E3). It must also restore what a logical dump does not carry:
roles and their attributes, `CONNECT` grants for the serving logins, and any
database-level settings; then rerun this rehearsal's checks on the target.

## The erasure-marker contract (for P5)

P5's `ErasureRegistry.record(accountId, providerSubjectKeys)` writes, before any
destructive cleanup, one marker per accepted deletion to a maintenance-only
recovery-control scope that is not inside the database or backups being
restored:

```text
{ marker_id: uuid, account_id: uuid, subject_lookups: [base64url HMAC-SHA256 …],
  lookup_key_id: 32 hex, recorded_at: ISO-8601 UTC }
```

- Exactly these keys: no email, name, raw subject, token or financial value
  (`ERASURE_MARKER_INVALID` otherwise).
- `subject_lookups` has 1–32 entries, one per provider alias, each
  `deriveSubjectLookup(lookupKey, issuer, subject)` =
  HMAC-SHA256(key, `gogospend-erasure-subject-v1\0<issuer>\0<subject>`).
- `lookup_key_id` is `SubjectLookupKey.id` of the registry lookup key.
- The registry is supplied to restores as an `ErasureMarkerSource`:
  `{ independent: true, location, listMarkers(), lookupKey() }`. `listMarkers`
  returns the complete set and throws on any failure (never `[]` for "could not
  read"); `lookupKey` returns a `SubjectLookupKey` or throws when custody is
  unavailable. A missing registry, `independent !== true`, an unreadable
  registry, missing key custody or a marker made with another key each refuse
  the restore before any data is read.
- Markers are cleared only by `canClearMarker` on a complete inventory.

## Local rehearsal

`npm run ops:rehearsal:local` (needs the local container; it starts it like
`npm run test:db`):

1. creates `gogospend_rehearsal_src_<random>`, applies the migrations and seeds
   three synthetic accounts (alias, wallet, category, three expenses, a queued
   job, one retained-attachment reference in the stand-in table
   `rehearsal_attachment_refs` until P2c exists);
2. takes an encrypted backup with an in-memory key (or `--key-fd N`);
3. records markers (one by account id, one by a linked alias only, one for an
   account the backup never held), then deletes two accounts in the source;
4. refuses `gogospend_v1` as a serving target before connecting;
5. restores the pre-deletion backup into `gogospend_restore_<random>`, reapplies
   the markers and checks: no erased-owner rows, both erased aliases blocked,
   the kept account byte-identical, its attachment present, `TEMPORARY`
   revoked from PUBLIC;
6. tampers one ciphertext byte and proves the restore is refused with
   `BACKUP_INTEGRITY` and its target is gone;
7. drops every database it created and deletes its temporary recovery
   directory. It never touches `gogospend_v1`, other databases or any role.

It prints a JSON result whose `receipt` is the redacted `RestoreReceipt`.

## Hosted gate (SKIPPED until E1)

With exact authority for an isolated synthetic Neon project and private R2
recovery/attachment/control scopes, and the keys in managed configuration:

- implement the hosted adapters behind the same interfaces (dump through
  managed configuration, R2 recovery store with a 7-day lifecycle rule,
  attachment copy, R2 erasure registry, Neon history/branch/snapshot inventory
  sources and a branch restore target); configure seven-day PITR only on the
  authorized resource;
- run `node scripts/ops/restore-rehearsal.mjs --target isolated-synthetic`:
  restore a pre-deletion backup, reapply markers, prove deleted principal and
  financial rows absent and retained attachments available;
- measure PITR RPO ≤ 1 hour and RTO ≤ 4 hours, and the daily-backup fallback
  RPO ≤ 24 hours; store the redacted receipts for P6b's readiness check;
- confirm the inventory report is `complete: true` with every hosted copy
  expiring within 7 days, and alert on backup age over 26 hours (P6b).
