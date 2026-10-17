# Account deletion runbook

Status: **local implementation only.** No Auth0 tenant, R2 bucket, independent
registry store or production data has been used (E1/E2 not authorized). Every
step marked *Hosted proof* is SKIPPED until then and must pass before beta.
No production-data deletion has run.

## What the user gets

`POST /v1/me/deletion` (recent proof: a bound session and a fresh `deletion`
proof whose command id is the `Idempotency-Key`; body `{"proof_id"}`) answers
`202 {"request_id", "status": "accepted"}`. Accepted is not completed: the
server erases the account on its own (target: active server data within 24
hours) and needs no later sign-in or polling.

In one transaction under the common account lock
(`gogospend_request_deletion`):

1. the account becomes `deleting`; its session generation and lifecycle
   generation both move and `reauth_after` moves past now, so every binding,
   leased read and publisher at the old generation is dead - including a
   request that had already passed the access guard and waits on the lock;
2. every binding row is revoked;
3. every alias (every linked sign-in method) is held in `blocked_principals`
   as `deleted` with no end (no sign-in, challenge, proof or link). A pending
   global-logout hold is replaced, so its revocation job completes as
   superseded - the deletion revokes grants itself;
4. every open job of the account is cancelled (exports, snapshot builds,
   imports), so no publisher can publish again; security cleanup jobs,
   including the deletion job, are never cancelled (also not by
   `gogospend_cancel_account_jobs`);
5. the erasure's work items are recorded: the request (`deletion_requests`,
   keyed by `erased_account_id`, with the initiating device's binding digest,
   principal digest and client), every alias to clean up at the provider
   (`deletion_request_subjects`, so provider cleanup never depends on the
   account's own rows) and its `account_deletion` job (20 attempts, a
   security kind).

### Lost acceptance

The response can be lost after the commit. The app resends the identical
request; the binding is now dead, so it gets `401 SESSION_REQUIRED`. Only the
initiating device can then ask `POST /v1/auth/deletion-receipt` (token only;
its old `X-GoGoSpend-Session` header and `{"command_id"}`): `200
{"request_id", "status": "accepted" | "completed"}`, or `404` when that device
never had a request accepted with that command id. Until the purge the
binding digest, principal and client all have to match; the purge clears the
principal digest (no pseudonymous identifier of the person outlives it), and
from then on the binding digest - a hash of the device's random secret - and
the client still have to match. Any other device, binding, client or command
id gets the same 404. The receipt works while the device still has a valid
access token (at most 15 minutes after the provider user is deleted); after
that the app cannot confirm and must keep its data.

### On the device (`apps/app/src/spend/v1/deletion.ts`)

| State | Meaning | This device's copy |
| --- | --- | --- |
| `accepted` | the server confirmed (response or receipt) | may be erased (`eraseForSignOut`) |
| `denied` | refused (401/403 and no receipt): nothing was requested by this device | locked, drafts kept |
| `unconfirmed` | outcome unknown (network, gateway, 429, receipt unreachable) | kept; resend the same request |
| `reauth_required` / `cancelled` | no request was made | kept |

An ordinary auth or network error never erases drafts and never means
"deleted". Other devices of the same person simply get `401` on their next
request and lock their diary like any signed-out device (S4). The screen and
copy wait for E2 visual approval.

### The window before the marker exists

The server answers `accepted` when the request commits; the independent
registry marker is written by the deletion worker afterwards - normally
within seconds, but hours later if the registry is unreachable (the job
retries as `registry_unavailable`). Inside that window the request lives only
in the main database. If that database is restored from a backup taken
**before** the request, the restored copy holds neither the request nor a
marker, so nothing re-erases the account, although the initiating device may
already have erased its own copy. A backup taken **after** the request holds
it, and the restore re-queues it (below).

The API cannot write the marker itself: it holds no registry credential (P6a
forbids it). The restore-time check below covers the gap; see also
[restore.md](restore.md).

**Operator check before switching a restored copy into service:**

1. List the deletion requests the failed primary still shows (if it is
   readable) that the restored copy does not:
   `SELECT request_id, erased_account_id, requested_at FROM deletion_requests WHERE purged_at IS NULL;`
   For each one whose account the restored copy holds, run
   `SELECT gogospend_reapply_erasure('<erased_account_id>', gen_random_uuid());`
   on the copy before the switch.
2. If the primary is not readable, compare the deletion worker's alert history
   (`deletion(s) open`, `registry_unavailable`) between the backup's time and
   the incident: any request accepted in that window without a marker must be
   found from the alert logs or support contact before the switch, or
   recorded as a known residual risk with the founder's sign-off.

## The deletion worker

```bash
npm run build -w gogospend-api
```

```bash
npm run worker:deletion -w gogospend-api -- --registry-fd 3 3< <(your-secret-manager read …)
```

Its own deployment (`apps/api/.env.deletion-worker.example`):

- `DATABASE_URL`: a login in `gogospend_jobs` and `gogospend_security` only
  (checked at startup);
- the Auth0 maintenance application (`AUTH0_MAINTENANCE_CLIENT_ID/SECRET`,
  `AUTH0_ALLOWED_CLIENT_IDS`), with `read:users` and `delete:users` as well as
  the device-credential scopes;
- the job worker's object storage (`R2_*`, or `OBJECT_STORE=memory` locally);
- the erasure registry - never an environment variable: a JSON object
  `{"database_url", "lookup_key"}` (a login in `gogospend_erasure_registry`
  only, checked at startup, and the 32-byte lookup key as base64url) read once
  from the inherited descriptor named by `--registry-fd`. The API, the security
  worker and the job worker never receive it.

`--once` drains the queue and exits. Logs are counts only, never subjects,
account ids, payloads or error text.

### Stages (`DeletionHandler`)

Each stage is idempotent and recorded in `deletion_requests` once done, so a
crash at any point resumes and never re-creates anything:

1. **marker** - on every run, before anything destructive, the registry must
   hold an unpurged marker covering every captured alias. If it cannot be
   written or read back the job fails retryable `registry_unavailable` and
   nothing is destroyed.
2. **provider** - for each captured alias: revoke refresh grants for every
   native client (configured ones plus any that held a session), delete the
   Auth0 user, then confirm it is gone (`GET /api/v2/users/{id}` answers 404).
   A user still present is `provider_user_present`; nothing is assumed.
3. **objects** - the account's published objects become due now and P1's sweep
   deletes them (registry first) together with any orphan under the account's
   prefixes. A reservation of a cancelled publisher may still receive its PUT
   until its final deadline (attempt runtime + 15 minutes): the job is
   *deferred* to that deadline, then the sweep removes the late object. A
   failing storage delete is `objects_pending` (retried).
4. **steps** - registered per-domain erasure steps (`privacy-steps.ts`), then
   the account's largest tables (change log, audit rows, receipts, records,
   entity heads)
   are deleted in short transactions of at most 5,000 rows each
   (`gogospend_deletion_shed`), so the purge transaction stays small whatever
   the account's size.
5. **purge** - one transaction (`gogospend_deletion_purge`): deletes the
   account (its remaining owned rows cascade: wallets, categories, budgets,
   sessions, challenges, consents, exports, snapshots), its other jobs, its
   aliases' provider-event receipts, reconcile checks and open challenges
   (including sign-ins that had started), and the captured aliases; keeps
   every alias blocked until one hour past provider verification (no access
   token issued before the provider deletion can still be valid), after which
   the hold lapses and retention removes it; clears the initiator's principal
   digest; records `purged_at` and that hold end.
6. **registry** - every unpurged marker of the account gets `purged_at` and
   `blocked_until` (the hold end), once. Only now can P6a's inventory clear
   the markers (`canClearMarker`), and a restore replays the hold end. Then the
   job completes (`gogospend_deletion_finish`). A registry outage here leaves
   the job pending (`registry_unavailable`); the data is already gone and the
   marker simply stays unclearable until the retry.

What stays, and for how long:

| Row | Why | Removed |
| --- | --- | --- |
| `deletion_requests` (binding digest and client only after the purge) | the initiating device's receipt | 30 days after the purge (retention) |
| the `account_deletion` job | audit of the run | 30 days after it finished |
| `object_publications` rows, status `deleted` | a very late PUT under an old key is still an orphan the next sweep deletes | 30 days (P1's sweep) |
| `blocked_principals` (`deleted`) | stale tokens cannot bootstrap | one hour past provider verification |
| registry markers | restores re-erase the account | only by P6a's `canClearMarker`, after `purged_at` is recorded and every older copy has expired |

A sign-in with the same provider login after the hold lapses is a new person
with a new, empty account.

### Provider events after the purge

Provider-event receipts (`auth_event_receipts`) and reconcile checks of the
erased aliases **are purged** (by principal digest and by account). A
password-change or block event that arrives for an alias while its `deleted`
hold is active records nothing (`no_account`, no receipt with its digest):
every session is already gone. After the hold lapses, events are recorded as
for any unknown principal (F6b's watermark).

### Failures and alerts

Retryable failures back off (30 s × 2^attempt, at most 1 hour) for up to 20
attempts; the request stays pending - never "complete". Permanent provider
failures (`provider_forbidden`, `provider_rejected`) and exhausted retries
leave a visible `failed` job. Every 5 minutes the worker logs:

- `deletion worker: N deletion(s) open for over 20 hours` - **alert**: the
  24-hour target is at risk (open = purge or its registry record not done);
- `deletion worker: N deletion job(s) failed terminally` - **alert**: follow
  this runbook.

Stuck deletions (migration/admin connection; never expose payloads):

```sql
SELECT r.request_id, r.requested_at, r.marker_recorded_at, r.provider_verified_at, r.objects_swept_at,
       r.purged_at, r.marker_purge_recorded_at, j.status, j.attempts, j.last_error, j.run_after
  FROM deletion_requests r JOIN jobs j ON j.id = r.job_id
 WHERE r.marker_purge_recorded_at IS NULL
 ORDER BY r.requested_at;
```

After fixing the cause, requeue the failed job (`UPDATE jobs SET status =
'queued', attempts = 0, run_after = now(), last_error = NULL, finished_at =
NULL, updated_at = now() WHERE id = '<job id>' AND status = 'failed'`); it
resumes at the first unfinished stage. Never delete a `deleted` hold, a
deletion request, its captured aliases or account rows by hand: that skips
provider cleanup or lets an old login sign in again.

## The erasure registry

Written by `PostgresErasureRegistry` (role `gogospend_erasure_registry`, schema
`erasure_registry`: INSERT and SELECT, and UPDATE of `purged_at` /
`blocked_until` only, once - a trigger refuses any other change; never
DELETE). No API, worker or leased-read login can read or write it (tested).
Each marker is exactly P6a's contract (`scripts/ops/erasure-markers.mjs`):

```
{ marker_id, account_id, subject_lookups: [base64url HMAC-SHA256(lookup key,
  "gogospend-erasure-subject-v1\0<issuer>\0<subject>")], lookup_key_id, recorded_at,
  purged_at, blocked_until }
```

`lookup_key_id` is HMAC-SHA256(key, `gogospend-erasure-key-id-v1`), first 16
bytes as hex. No email, raw subject, token or amount. `record` is idempotent
over unpurged markers (one covering every alias is reused; otherwise a new one
is appended - so an erasure re-run after a restore gets a fresh, unclearable
marker). `listMarkers()` returns the complete set and throws when it cannot
read - never `[]`.

**Independence: SKIPPED.** Locally the schema lives in the same database as
the data (P5's privacy migration), so a restore of that database would roll
the markers back with it; it is not the independent store P6a requires.
`PostgresErasureRegistry` says so: `independent` is `false` unless the
deployment passes `{ independent: true, location }` for a store outside the
main database and its backups. It deliberately has no `lookupKey()`: the
key's bytes never leave it and the API code never imports the restore
tooling, so P6a's restore builds its marker source from a read login on the
registry and its own key custody, and checks the key id against
`lookup_key_id`. Placement, credentials and key custody are E1 work. Never
rotate the lookup key without re-keying every marker: P6a refuses markers
made with another key.

## Restores (P6a)

P6a's local restore (`scripts/ops/local-postgres.mjs` `applyErasure`) now
uses P5's routine. For every account whose erasure was still in progress -
a marker without `purged_at`, or a deletion request the restored copy itself
holds as accepted but not purged - it first runs
`gogospend_reapply_erasure(account_id, new_job_id)` (granted to no role; the
restore operator is the database owner) in the same transaction, then erases
rows as before:

- the routine applies a deletion request's transition (deleting, both
  generations, bindings revoked, every alias held with no end, open jobs
  cancelled), captures the aliases into `deletion_request_subjects`, creates
  or resets the request (no initiator receipt), and queues a new
  `account_deletion` job **without an account_id**, replacing any earlier
  one;
- P6a's row-level erase then deletes the account and every row with an
  `account_id`. The erasure's work items carry no `account_id` or
  `principal_digest` column and stay, so the copy passes P6a's "no erased-owner
  rows" check and still knows which provider users to delete;
- once the copy serves, the deletion worker runs that job: marker (a new,
  unpurged one), provider cleanup from the captured aliases (harmless when
  already done: revoke and delete answer done, confirmation answers 404), the
  object sweep under the account's prefixes, the purge and the registry
  record, which sets the new marker's `purged_at` and hold end.

A marker that already has `purged_at` is only replayed (its hold end), not
re-queued: its provider cleanup was verified. Hold semantics match P5's: no end
while an erasure is pending, one hour past provider verification after it.
The local Docker rehearsal (`npm run test:ops` with
`GOGOSPEND_OPS_REQUIRE_DB=1`) proves the re-queue, the captured aliases, the
open holds, the replayed end of a purged marker and an empty owner-row check.

## Hosted proof (SKIPPED until E1/E2)

- [ ] Grant `read:users` and `delete:users` to the maintenance application;
      record the plan and entitlement.
- [ ] Delete a synthetic account with two devices and an Apple login linked to
      an email login: both devices lose access at once, the initiating device
      shows accepted and discards its copy, the other locks and keeps its
      drafts; both Auth0 users are deleted.
- [ ] Prove primary Apple token revocation through Auth0's managed deletion
      (and a linked identity's once F6c ships); record the evidence.
- [ ] Measure active-server deletion within 24 hours on the authorized
      synthetic tenant and storage, including a forced provider outage that
      stays pending and alerts.
- [ ] Provision the independent registry store and its key custody; prove the
      API and other workers cannot reach it; mark it `independent: true`.
- [ ] Rehearse a restore that re-queues an in-progress erasure and run the
      deletion worker against the copy before the serving switch.
- [ ] Publish the exact retention and offline-copy wording after E2 approval.
