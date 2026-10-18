# Release runbook (P6b)

Status: **local package only.** The image builds and passes its smoke on this
machine, and the CI workflow has been reviewed against the local gate. Nothing
has been deployed, no secret has been written anywhere, no image has been
pushed, and hosted CI has not run. Production deployment, secret writes, push,
PR and merge stay gated (E3/E4) until expressly authorized. The beta decision
also needs every receipt in [beta-receipts.md](../implementation/beta-receipts.md).

Related: [rollback.md](rollback.md), [incident.md](incident.md),
[restore.md](restore.md), [deletion.md](deletion.md), [retention.md](retention.md),
[auth0-runbook.md](auth0-runbook.md).

## What ships

One image (`apps/api/Dockerfile`), one process per service. The image holds
only the release graph (`apps/api/scripts/release-graph.mjs`): the compiled
files the five entries below reach, the migrations, the contracts TypeScript
source and the package closure of eight reviewed runtime packages (117
packages in all at this revision). Legacy `/spend`, internal shared-key, Salt
Edge, cashback, autolog, Firebase and Mongo code and packages, tests, fixtures
and the app are not in it; their source stays in the repository.

| Service | Command (WORKDIR `/app/apps/api`) | Database login (exact roles, checked at startup) | Other settings | Health |
| --- | --- | --- | --- | --- |
| Migration (release step) | `node dist/database/migrate-cli.js` | `DATABASE_DIRECT_URL`: migration owner | none | exit 0, `Migrations are up to date.` |
| API | `node dist/v1/main.js` (default) | `DATABASE_URL`: `gogospend_app` + `gogospend_bootstrap` | `apps/api/.env.example` | deploy check `GET /ready`; liveness `GET /live` |
| Job worker | `node dist/worker.js` | `DATABASE_URL`: `gogospend_jobs`; `LEASED_READ_DATABASE_URL`: `gogospend_leased_read` | `.env.jobs-worker.example` | heartbeat line every sweep (default 15 min) |
| Security worker | `node dist/jobs/security-worker.js` | `DATABASE_URL`: `gogospend_jobs` + `gogospend_security` | `.env.worker.example` | heartbeat line every 5 min |
| Deletion worker | `node dist/privacy/deletion-worker.js --registry-fd 3` | `DATABASE_URL`: `gogospend_jobs` + `gogospend_security`; registry login (fd 3): `gogospend_erasure_registry` | `.env.deletion-worker.example` | heartbeat line every 5 min |

Every process: `NODE_ENV=production` (set in the image), runs as the `node`
user over a read-only release tree, stops on SIGTERM within
`SHUTDOWN_TIMEOUT_SECONDS` (default 25; keep the platform's stop grace period,
for Railway `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`, at least 30), and reports a
startup failure as one redacted line (`<name> startup failed: <class>[: fixed
message | code]`, exit 1). There is no startup migration and no fallback to
Mongo or to the legacy API.

The API's HTTP bounds: 9-minute request timeout (the upload intake's 8-minute
receive bound plus 60 s, so the intake always answers a stalled upload first),
66 s for headers, 65 s keep-alive.

Build and prove the image locally (never pushed):

```sh
docker build -f apps/api/Dockerfile -t gogospend-local .
docker run --rm gogospend-local node scripts/release-smoke.cjs
```

The smoke proves that every API and worker process loads
`@gogospend/contracts` runtime exports, that each command starts with
production settings and fails closed at its first database connection with no
missing module and no credential in its output, and that legacy paths and
packages are absent. The build itself fails if a legacy file, a test file or an
unreviewed package becomes reachable (`release-graph.json`).

**Lockfile finding.** `package-lock.json` records only the darwin-arm64
binding of the API workspace's nested `@swc/core`, `unrs-resolver` (Jest 30)
and `sharp`. On Linux, `npm ci` alone cannot build the API or run Jest. The
Docker build and CI add the exact locked versions with pinned sha512
(`scripts/ci/linux-native-bindings.mjs`). Regenerating the lockfile with every
platform's bindings is the proper fix and needs a separately authorized
dependency change.

## Secrets and settings, by name and role

Real values are set only through the approved secure workflow (E1/E3), each
in the one service that needs it. Placeholders live in the `.env*.example`
files. No secret is baked into the image, passed as an argument, or logged.

| Name | Secret | API | Job worker | Security worker | Deletion worker | Migration |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | yes | app + bootstrap login | jobs login | jobs + security login | jobs + security login | - |
| `LEASED_READ_DATABASE_URL` | yes | - | leased-read login | - | - | - |
| `DATABASE_DIRECT_URL` | yes | - | - | - | - | migration owner |
| erasure registry `{database_url, lookup_key}` | yes, **fd 3 only** | - | - | - | yes | - |
| `AUTH0_ISSUER`, `AUTH0_MANAGEMENT_URL` | no | yes | - | yes | yes | - |
| `AUTH0_AUDIENCE` | no | yes | - | - | - | - |
| `AUTH0_ALLOWED_CLIENT_IDS` | no | yes | - | yes | yes | - |
| `AUTH0_PROFILE_LINK_CLIENT_ID` / `_SECRET` | secret | read-profile | - | profile/link merges (F6c) | - | - |
| `AUTH0_MAINTENANCE_CLIENT_ID` / `_SECRET` | secret | - | - | yes | yes | - |
| `AUTH0_EVENTS_SIGNING_SECRETS` | yes | yes | - | - | - | - |
| `RATE_LIMIT_KEY` | yes | yes | - | - | - | - |
| `COMMAND_DIGEST_KEY`, `COMMAND_DIGEST_PREVIOUS_KEYS` | yes | yes | - | - | - | - |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_REGION` | no | yes | yes | - | yes | - |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secret | read (+ quarantine write/delete once uploads are on) | read/write/delete | - | read/delete | - |
| `MIN_CLIENT_VERSION_IOS`, `_ANDROID` | no | yes | - | - | - | - |
| `TRUST_PROXY_HOPS` | no | `1` behind Railway (required in production) | - | - | - | - |
| `IMPORT_UPLOADS_ENABLED` | no | `0` until the import gates pass | - | - | - | - |
| `OPERATIONAL_PAUSE`, `OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS` | no | yes | `OPERATIONAL_PAUSE` | `OPERATIONAL_PAUSE` | `OPERATIONAL_PAUSE` | - |
| `READINESS_RECEIPTS` or `READINESS_RECEIPTS_FILE` | no (redacted outcomes) | yes | - | - | - | - |
| `SHUTDOWN_TIMEOUT_SECONDS`, `DATABASE_POOL_MAX` | no | yes | shutdown only | shutdown only | shutdown only | - |
| `JOB_SWEEP_INTERVAL_MINUTES` | no | - | yes | - | - | - |
| `SECURITY_WORKER_INTERVAL_SECONDS`, `SECURITY_RECONCILE_*` | no | - | - | yes | - | - |
| `DELETION_WORKER_INTERVAL_SECONDS` | no | - | - | - | yes | - |

Never in any image service: the recovery key, recovery-store credentials, the
erasure registry outside the deletion worker's fd, Neon project or branch
credentials, provider billing access. Those belong to the operator/cron role
that runs backups, restores and the inventory ([restore.md](restore.md)).
Mobile builds carry only public `EXPO_PUBLIC_*` configuration. CI holds no
secret.

**Open (E1):** how the platform hands the deletion worker its registry
settings on fd 3. Railway has no secret-file or descriptor injection, and an
environment variable would break the rule. Decide the mechanism (for example
a small launcher that reads one secret from the secret manager and pipes it)
with the hosted registry placement.

## Preflight (every release)

1. **Receipts current.** Every mandatory readiness receipt is `passed` and
   valid for the release window (`READINESS_RECEIPTS`; see
   [beta-receipts.md](../implementation/beta-receipts.md)). A restore
   rehearsal older than 31 days, or failed, keeps `/ready` at 503.
2. **Backup.** The newest daily logical backup is under 26 hours old
   (`node scripts/ops/recovery-inventory.mjs --recovery-dir <dir> | node
   scripts/ops/backup-age.mjs` exits 0), and a fresh on-demand backup is
   taken just before migrating. Record its id in the release record.
3. **Compatibility.** The command-schema table and minimum versions below
   are unchanged, or the change is an explicit, dated decision in the
   release record. The rollback target is at or above the rollback floor
   ([rollback.md](rollback.md)).
4. **Image.** `docker build` and the release smoke pass for the exact commit;
   hosted CI is green for that commit (once authorized). Record the commit
   and the image digest.
5. **Alerts and costs.** Alert routing for every line in
   [incident.md](incident.md) points at the named owner; provider budget
   alerts exist at 50/80/100% of the US$100 envelope; log retention is 7 days.

## Migration order

Migrations are reviewed SQL applied by `migrate-cli` under one advisory lock,
after it verifies the journal and every applied file. They are expand-only
(new tables, columns, routines, policies), so the previous API keeps working
against the migrated schema; nothing is dropped or rewritten in a release.

1. Preflight backup (above).
2. Run the migration service once with `DATABASE_DIRECT_URL`. It is the only
   place a migration runs. A failure prints the error class and SQLSTATE
   only; investigate on the database, fix forward with a new migration, never
   edit an applied one (the journal check refuses it).
3. Deploy the **deletion, security and job workers** (new handlers can run
   every job kind the old API still queues).
4. Deploy the **API**. A job kind the new API introduces before its worker is
   ready stays queued and the job worker reports `… queued with no handler`.
5. Verify (below). The previous API and workers keep running until the new
   ones pass their health checks.

A migration that needs a long lock or rewrites rows must say so in its file
and in the release record, and runs with `OPERATIONAL_PAUSE=writes` on the
API for its duration ([incident.md](incident.md#pausing)).

Current journal at this revision: `0001_identity` … `0018_import_confirmation`
(P2b's `0016_import_candidates`, P2c's `0017_attachments`, P3's
`0018_import_confirmation`).

## Command-schema and minimum-client-version compatibility

- Every v1 command kind accepts schema **1**, and the app sends
  `X-GoGoSpend-Command-Schema: 1`: `attachment.remove|replace|retain` (P2c),
  `budget.create`, `budget.replace`,
  `category.archive|create|seed_builtins|unarchive|update`, `export.request`,
  `import.review.patch`, `import.selection.confirm|freeze` (P3),
  `transaction.create|delete|restore|update`,
  `wallet.archive|create|unarchive|update`. The table is pinned by
  `operational-safety.spec.ts` ("the command-schema compatibility table"), so
  any change shows in review.
- The new API and the rollback API must both accept every schema that any
  client at or above the minimum version emits, and keep accepting a schema
  for at least 30 days (the outbox lifetime) after the last client that
  emits it drops below the minimum. A replay of a committed command returns
  its acknowledgement even if its schema is no longer accepted; an
  unsupported schema with no receipt is `422 COMMAND_SCHEMA_UNSUPPORTED`,
  which the app shows as **Needs review** and never treats as data loss.
- `MIN_CLIENT_VERSION_IOS` / `_ANDROID` (major.minor.patch, required) gate
  every non-public route with `426 CLIENT_UPGRADE_REQUIRED`; the app pauses
  and keeps drafts. Raising a minimum, or dropping a schema, is a release
  decision recorded with its date, the affected builds and the store state
  in the release record. Never lower a minimum to make a rollback work.

## Staged enablement

| Stage | Change | Success signal (hold at least the stated time) | Failure signal → action |
| --- | --- | --- | --- |
| 0. Dark | Deploy all services; `IMPORT_UPLOADS_ENABLED=0`; no client points at it | `/ready` 200 with every receipt `passed`; each worker's heartbeat line; no alert line for 1 hour | any alert, `/ready` 503 → stop, fix or roll back |
| 1. Founder devices | Synthetic accounts on iOS and Android release builds | native smoke: sign in, accept terms, first wallet, expense, transfer, edit, undo, offline save and sync, export (grant, download), global logout, deletion of a synthetic account; no 5xx; queue age under 5 min | any failed step, 5xx, `queue_age` → pause the scope, roll back if not quickly fixed |
| 2. Invited beta | A small named cohort; uploads still off | 48 hours: API 5xx < 0.5% of requests, warm p95 within the performance budget, no `failed terminally`, no overdue cleanup, deletions purged within 24 h, spend below 50% of the envelope pro rata | as above; cost at 80% → review usage before growing |
| 3. Imports | Only after P1/P2a hosted gates and P2b/P2c/P3 all pass: `IMPORT_UPLOADS_ENABLED=1` | quarantine and parse queues drain, no `quarantine … overdue`, no `import maintenance failed` | `OPERATIONAL_PAUSE=uploads,imports` (or `ocr`), investigate |

## Verify after deploying

1. The deployed image digest and git commit equal the release record's.
2. `GET /ready` → 200 with `process`, `database` and every `receipt.*`
   `passed`; `GET /live` → 200.
3. Each worker printed its heartbeat (`<worker>: queue due=…`) and no alert.
4. The native smoke of the current stage passes on both platforms.
5. Sign-off records the revision, the receipts, the backup id and who
   approved. Local green, hosted CI, the deployed commit and production
   readiness are reported separately; none implies another.

## Performance budget

`node scripts/ops/performance-smoke.mjs --target staging-synthetic
--authorization-fd 3 --accounts-fd 4 --location bangkok-<site>` against an
authorized staging target only: mixed 20 requests/second (80% reads of
summary, history and wallets; 20% expense writes) from at least 20 synthetic
accounts, run from a named location in Thailand, 30 s warm-up then 120 s
measured. Pass: warm p95 reads < 800 ms, writes < 1,200 ms, at most 1% failed.
It refuses any other target (exit 2) and exits 3 (SKIPPED) without a valid
authorization record. No performance claim is made without its receipt.

## Cost and logs

- **Envelope:** US$100/month across Railway, Neon, Cloudflare R2 and Auth0
  (planning estimate about US$75). Configure each provider's budget or usage
  alerts at **50%, 80% and 100%** of its share and of the total. These are
  alerts, **not caps**: nothing stops at 100%, and no purchase follows from
  them. Recheck the Auth0 entitlement and actual usage before any purchase.
- **Logs:** operational logs are redacted by construction (JSON request lines
  with request id, method, route template, status and latency; workers log
  counts, kinds and codes). Keep them **7 days**, then delete; restrict
  access to the operator role. No request body, query string, token,
  binding, amount, note, object key, signed URL, subject or account id is
  logged, and startup errors pass through `describeFailure`.
