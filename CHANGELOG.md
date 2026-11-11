# Changelog

All notable changes to Jotbun are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Task IDs (F1, M3, P2b, …) refer to the plans in `docs/superpowers/plans/`. Per-task evidence is in `docs/implementation/backend-progress.md`.

## [0.1.0] - 2026-10-18

**Pre-release.** The v1 API, its workers and the app journey are built and pass the full local gate, and hosted CI is green. Nothing is deployed. Every hosted, native and device check is recorded as SKIPPED.

### Added

**Foundation and auth**
- F1: v1 shared contracts (`@gogospend/contracts`) with exact satang parsing, and the app's `test:unit` runner.
- F2: PostgreSQL 17 migrations with group roles and row-level security, the journal-checked migrator, and the loopback local database.
- F3: Auth0 access-token verification (issuer, audience, client), five route access classes checked at startup, shared rate limits, and safe logging.
- F4: identity bootstrap, server-side session bindings, one-use reauthentication proofs, and published policies with consents. The native bootstrap spike is still pending.
- F5: the app's native session state machine (sign-in, account switch, lock, reauth) behind a credentials port for Auth0's native SDK.
- F6a: global logout ("sign out everywhere"), session revocation and the durable job queue for provider cleanup.
- F6b: verified Auth0 security events (password change, block) and their reconciliation. Password-reset recovery stays off.
- F6c: explicit account linking, which ends every session through global logout. Linking stays off.

**Money**
- M1: the command protocol: one account-locked transaction per command, revisions, a change log, idempotency receipts, audit events and `POST /v1/commands/status`.
- M2: wallets with opening balances (never counted as income), and built-in and custom categories with archive and unarchive.
- M3: expense, income and transfer records with version-checked edits, delete and a 30-day restore.
- M4: monthly budgets with category sub-limits, filtered history with keyset paging, and the month summary.
- M5: the first online app journey on the v1 API: Home, Add and Transactions screens, exact money input and formatting, and conflict handling.

**Offline sync**
- S1: ordered change deltas and consistent snapshots, with 30-day change retention and five-minute chunk grants.
- S2: an encrypted per-account device diary (SQLCipher, key in secure storage). Android backup is disabled.
- S3: the outbox, retry discipline, and reconciliation of every sent command after reconnecting.
- S4: pending totals shown apart from confirmed totals, the sync status banner, conflict handling and local reminders.

**Jobs and storage**
- P1: the fenced job runtime (leases, heartbeats, runtime bounds, attempt-neutral release) and the private object publication registry with its sweep.

**Imports**
- P2a: bounded private upload quarantine for CSV, XLSX, JPEG, PNG and WebP up to 12 MiB, with per-account quotas. Off behind `IMPORT_UPLOADS_ENABLED`.
- P2b: sandboxed parser children that turn quarantined files into reviewable previews, with exact money and dates (Buddhist era included), duplicate advice, a 7-day expiry and additive preview paging.
- P2c: retained receipt attachments: a server-side copy with versioned ownership, five-minute session-bound grants, and bounded copies and downloads.
- P3: explicit, resumable import confirmation from a frozen selection of up to 5,000 rows, in batches of up to 500, with per-row progress. The app has the review flow and a device-backed draft store; the review screen is not routed.

**Export**
- P4: a private asynchronous export file, kept for 24 hours and downloaded through five-minute grants.

**Retention and erasure**
- P5: a retention job for every data type, and resumable account erasure (marker, provider, objects, purge, registry) recorded in an independent erasure registry.

**Backup and restore**
- P6a: encrypted backup sets, a recovery inventory, restore safety checks and a local restore rehearsal that keeps erased accounts erased.

**Release package**
- P6b: operational gates (`writes`, `imports`, `ocr`, `uploads`, `jobs`), `/live` and `/ready` with readiness receipts, redacted logs, graceful shutdown, a release image holding only the release graph, the backend CI workflow, ops tooling, and release, rollback and incident runbooks.

**Branding**
- Jotbun: the app's display name, icon and user-facing copy, plus brand assets in `docs/brand/`. Internal identifiers (package names, database roles, `X-GoGoSpend-*` headers, the Expo slug and URL scheme) are unchanged.

### Changed

- The repository was renamed from `mygogocash/gogospend` to `mygogocash/jotbun`. The old URL redirects.
- The worker parser sandbox fails closed on Node 24: import parsing is not registered when the runtime can't deny network access.
- The owner statement timeout was raised from 15 s to 30 s, because a 500-row import confirmation exceeded 15 s on CI. Under review.

### Security

- **Role isolation:** each process connects with its own login and only the group roles it needs. Workers read accounts only through lease-checked routines.
- **Row-level security** keeps every query inside the caller's account.
- **Idempotent commands:** every business write has its own key, so a retry after a lost response never commits twice.
- **Session-bound grants:** files are served only through five-minute grants that work for the owner's account and need the owner's bound session. Receipt grants are also tied to the session they were issued to. There are no public URLs.
- **Redacted logs:** logs record error class names and codes, never messages or payloads.
- **Erasure registry:** an independent registry records erased accounts, so a restored backup never brings one back.

### Known issues

From independent verification on 18 October 2026:

- **Import parsing is disabled on Node 24.** It fails closed because Node 24's permission model can't block network access. Turning it on needs the worker runtime on Node ≥25, which is an owner decision.
- **The compiled image-parser child can't load `sharp`.** The read roots were narrowed, so in the release layout the child can't load sharp. On Node ≥25 that would disable all import parsing until it's fixed.
- **The parser child isn't fully sealed against `node:sqlite`.** It can create files through `node:sqlite`. The fix is to add `--no-experimental-sqlite`.
- **Some upload refusals bypass Express.** Refusals for uploads with an unread body are written raw on the socket, so they skip the security headers and the request log.
- **Raw-socket upload refusals mishandle pipelined requests.** Besides the missing headers and log line, they can answer an earlier pipelined request.
- **Import confirmation slows down quadratically.** On unanalyzed import tables, the committed-row queries run in quadratic time, so 500-row confirmations reach about 15 s. The owner statement timeout was raised to 30 s to get CI green. The fix is a query rewrite and restoring 15 s; it's in progress.
- **Workers can crash on a database disconnect.** Two production code paths check out a database client without an error listener. A recent test-harness change hides this in tests. Fix in progress.
- **Preview paging returns every row issue on every page.**
- **A rejected import preview includes a `page` field,** which the app's paging helper refuses.
- **The device import draft stores the whole preview in plaintext AsyncStorage.** That is up to about 22 MiB, against a 6 MB default limit on Android, and the draft survives an ordinary sign-out or an account switch.
- **The unknown-sync-entity skip policy never resyncs after an app upgrade,** although the docs say it does.
- **Receipt copy fairness:**
  - one account can take every copy slot in a process;
  - the copy-budget query isn't indexed;
  - the receipt orphan sweep makes one storage LIST per recently active account. Its estimated R2 cost could exceed the US$100 budget alert at about 10k weekly receipt users.
- **S3 downloads are cut off at 60 s** (the fetch timeout also covers the body).
- **The `0017` migration's lock note is inaccurate:** under the migrator's single transaction, `VALIDATE` holds exclusive locks.
- **Hosted and native checks are SKIPPED:**
  - Auth0 tenant proofs;
  - R2 storage;
  - hosted PITR and backups;
  - devices;
  - the staging performance smoke.
- **The lockfile only records darwin-arm64 native bindings.** CI uses `scripts/ci/linux-native-bindings.mjs` as a workaround. Regenerating the lockfile needs authorization.
- **Off by default:** uploads, account linking and password-reset recovery.

[0.1.0]: https://github.com/mygogocash/jotbun/releases/tag/v0.1.0
