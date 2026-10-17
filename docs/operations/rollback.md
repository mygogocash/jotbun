# Rollback runbook (P6b)

Status: **local package only**; no deployment exists yet. A rollback is
itself a release step: it needs the same authority (E3) as a deployment.

A rollback redeploys a **previous image revision against the same
PostgreSQL data**. It keeps every financial write made since the release,
never runs a down-migration, and never points at the old Mongo stack or the
legacy API. A restore from backup is a different, separately authorized
operation ([restore.md](restore.md)) for data corruption only: it loses
writes after the backup and needs the erasure reapply.

## The rollback floor: P4

Once any account has requested an export, `export` entity changes are in the
sync change log. An API older than P4 rejects them in its sync validators, so
every device's deltas and snapshots would stop. **No rollback target may be
older than the P4 release** (P4 review). Later releases raise the floor the
same way whenever they add a synced entity type or state; the release record
names the current floor. At this revision the floor is the first deployed
revision that contains P4 (`0013_exports`); nothing earlier has been
deployed, so in practice the floor is the first beta release.

## Before rolling back

1. **Target at or above the floor**, and its image digest is the one that was
   released (from the release record).
2. **Schema compatible.** Migrations are expand-only, so an older API runs
   against the newer schema. Do not reverse a migration. If the newer
   release wrote data the older API cannot handle (a new entity type, a new
   status), the floor already excludes that target.
3. **Command schemas.** The target must accept every command schema current
   clients emit (all send schema 1 today; the table is in
   [release.md](release.md#command-schema-and-minimum-client-version-compatibility)).
   If it cannot, rollback is **blocked**: pause writes instead.
4. **Minimum client versions** stay as they are. Never lower them to make a
   target work; a client below the target's expectations gets `426` and
   keeps its drafts.
5. **Receipts.** The target reads the same `READINESS_RECEIPTS`; keep them in
   the service settings so `/ready` passes after the rollback.

## Procedure

1. **Pause what is unsafe.** If new writes could be harmed (a write-path
   bug, a data-shape problem), set `OPERATIONAL_PAUSE=writes` on the API
   first ([incident.md](incident.md#pausing)). Reads, sign-in, sign-out,
   global logout, export downloads and account deletion keep working; apps
   keep unsent drafts and retry after `retry_after_seconds`.
2. **Roll back the API** to the target image (same settings). Wait for
   `/ready` 200.
3. **Roll back workers only if they are the problem.** A newer worker can
   keep running with an older API. If a worker is rolled back, any job kind
   only the newer worker handles stays queued and the job worker reports
   `N <kind> job(s) queued with no handler in this worker`; that is visible
   and safe (nothing is claimed and failed). Security and deletion workers
   roll back only to a revision that handles every queued security kind
   (`auth0_revoke_grants`, `auth0_security_reconcile`,
   `auth0_link_identities`, `account_deletion`).
4. **Unpause** once the target is healthy and the cause is understood.
5. **Record** the from/to revisions, the time, the pause window and the
   alert lines seen.

## Success and failure signals

| Signal | Success | Failure → next step |
| --- | --- | --- |
| `GET /ready` | 200, every check `passed`/`ok` | 503: read `fields` (`database`, `receipt.*`) and fix; do not unpause |
| API 5xx rate (request log `status` ≥ 500) | back to baseline within 10 minutes | still elevated: keep writes paused, escalate |
| App behaviour | no `426`, no `422 COMMAND_SCHEMA_UNSUPPORTED` | either one means the target is not compatible: roll forward instead |
| Workers | heartbeat lines, no `queue_age` alert | `no handler` lines for new kinds: roll the worker forward again |
| Sync | no `410 RESYNC_REQUIRED` spike, no validator failures | a spike means the target is below the floor: roll forward |

## Never

- Never point the API at Mongo or the legacy `/spend` API, and never add an
  automatic fallback between stacks.
- Never drop or edit an applied migration; fix forward.
- Never delete rows to make an older revision work.
- Never restore a backup as a "rollback".
