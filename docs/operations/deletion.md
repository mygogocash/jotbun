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
3. every alias is held in `blocked_principals` as `deleted` (no sign-in,
   challenge, proof or link). A pending global-logout hold is replaced, so its
   revocation job completes as superseded - the deletion revokes grants itself;
4. every open job of the account is cancelled (exports, snapshot builds,
   later imports), so no publisher can publish again; security cleanup jobs
   are left alone;
5. the request (`deletion_requests`, with the initiating device's binding
   digest, principal digest and client) and its `account_deletion` job (20
   attempts, a security kind) are recorded.

### Lost acceptance

The response can be lost after the commit. The app resends the identical
request; the binding is now dead, so it gets `401 SESSION_REQUIRED`. Only the
initiating device can then ask `POST /v1/auth/deletion-receipt` (token only;
its old `X-GoGoSpend-Session` header and `{"command_id"}`): `200
{"request_id", "status": "accepted" | "completed"}`, or `404` when that device
never had a request accepted with that command id. Any other device, binding
or command id gets the same 404. The receipt works while the device still has
a valid access token (at most 15 minutes after the provider user is deleted);
after that the app cannot confirm and must keep its data.

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
   hold a marker covering every alias. If it cannot be written or read back the
   job fails retryable `registry_unavailable` and nothing is destroyed.
2. **provider** - for each alias: revoke refresh grants for every native client
   (configured ones plus any that held a session), delete the Auth0 user,
   then confirm it is gone (`GET /api/v2/users/{id}` answers 404). A user still
   present is `provider_user_present`; nothing is assumed.
3. **objects** - the account's published objects become due now and P1's sweep
   deletes them (registry first) together with any orphan under the account's
   prefixes. A reservation of a cancelled publisher may still receive its PUT
   until its final deadline (attempt runtime + 15 minutes): the job is
   *deferred* to that deadline, then the sweep removes the late object. A
   failing storage delete is `objects_pending` (retried).
4. **steps** - registered per-domain erasure steps (`privacy-steps.ts`).
5. **purge** - one transaction (`gogospend_deletion_purge`): deletes the
   account (every owned table cascades: records, change log, receipts, audit,
   sessions, challenges, consents, exports, snapshots), its other jobs, and its
   principals' provider-event receipts, reconcile checks and challenges; keeps
   every alias blocked until one hour past provider verification (no access
   token issued before the provider deletion can still be valid), after which
   the hold lapses and retention removes it; marks the request purged and the
   job succeeded.

What stays, and for how long:

| Row | Why | Removed |
| --- | --- | --- |
| `deletion_requests` (no data, binding/principal digests) | the initiating device's receipt | 30 days after the purge (retention) |
| the `account_deletion` job | audit of the run | 30 days after it finished |
| `object_publications` rows, status `deleted` | a very late PUT under an old key is still an orphan the next sweep deletes | 30 days (P1's sweep) |
| `blocked_principals` (`deleted`) | stale tokens cannot bootstrap | one hour past provider verification |
| registry markers | restores re-erase the account | only by P6a's `canClearMarker` once no copy can hold the account |

A sign-in with the same provider login after the hold lapses is a new person
with a new, empty account.

### Failures and alerts

Retryable failures back off (30 s × 2^attempt, at most 1 hour) for up to 20
attempts; the request stays pending - never "complete". Permanent provider
failures (`provider_forbidden`, `provider_rejected`) and exhausted retries
leave a visible `failed` job. Every 5 minutes the worker logs:

- `deletion worker: N deletion(s) open for over 20 hours` - **alert**: the
  24-hour target is at risk;
- `deletion worker: N deletion job(s) failed terminally` - **alert**: follow
  this runbook.

Stuck deletions (migration/admin connection; never expose payloads):

```sql
SELECT r.request_id, r.requested_at, r.marker_recorded_at, r.provider_verified_at, r.objects_swept_at,
       j.status, j.attempts, j.last_error, j.run_after
  FROM deletion_requests r JOIN jobs j ON j.account_id = r.account_id AND j.kind = 'account_deletion'
 WHERE r.purged_at IS NULL
 ORDER BY r.requested_at;
```

After fixing the cause, requeue the failed job (`UPDATE jobs SET status =
'queued', attempts = 0, run_after = now(), last_error = NULL, finished_at =
NULL, updated_at = now() WHERE id = '<job id>' AND status = 'failed'`); it
resumes at the first unfinished stage. Never delete a `deleted` hold, a
deletion request or account rows by hand: that skips provider cleanup or lets
an old login sign in again.

## The erasure registry

Written by `PostgresErasureRegistry` (role `gogospend_erasure_registry`, schema
`erasure_registry`, INSERT and SELECT only - append-only). No API, worker or
leased-read login can read or write it (tested). Each marker is exactly P6a's
contract (`scripts/ops/erasure-markers.mjs`):

```
{ marker_id, account_id, subject_lookups: [base64url HMAC-SHA256(lookup key,
  "gogospend-erasure-subject-v1\0<issuer>\0<subject>")], lookup_key_id, recorded_at }
```

`lookup_key_id` is HMAC-SHA256(key, `gogospend-erasure-key-id-v1`), first 16
bytes as hex. No email, raw subject, token or amount. `record` is idempotent (a
marker covering every alias is reused; otherwise a new one is appended).
`listMarkers()` returns the complete set and throws when it cannot read -
never `[]`.

Locally the schema lives in the same database (P5's privacy migration).
**Production must place it in an independent store** - outside the main
database and its backups, as P6a requires (`independent: true`) - with its
own credentials and lookup-key custody. That placement and its hosted proof are
SKIPPED (E1). Never rotate the lookup key without re-keying every marker: P6a
refuses markers made with another key.

## Restores (P6a)

`gogospend_reapply_erasure(account_id, new_job_id)` is granted to no role; the
restore operator (database owner) runs it on the private copy for every
account a marker names and every account holding a marked alias created no
later than the marker. Under the account lock it applies a deletion request's
transition (deleting, both generations, bindings revoked, aliases held, open
jobs cancelled), resets the request's stages and makes sure one
`account_deletion` job is open: `requeued`, `running` or `absent`. Running the
deletion worker against the copy then repeats provider cleanup (harmless when
already done: revoke and delete answer done, confirmation answers 404), the
object sweep and the purge. This is what re-queues provider cleanup for a
deletion that was still in progress when the backup was taken: P6a's own
row-level erase would remove the identities the provider calls need.
Decision for P6a: use the reapply routine and drain the worker before the
"no erased-owner rows" check, rather than deleting rows directly.

Provider-event receipts (`auth_event_receipts`) and reconcile checks of the
erased principals **are purged** at erasure (by principal digest and by
account): they are pseudonymous identifiers of the person, and the registry
markers plus the lapsing `deleted` hold are the lasting authority. A restored
copy can bring them back; the reapplied erasure purges them again.

## Hosted proof (SKIPPED until E1/E2)

- [ ] Grant `read:users` and `delete:users` to the maintenance application;
      record the plan and entitlement.
- [ ] Delete a synthetic account with two devices and an Apple login: both
      devices lose access at once, the initiating device shows accepted and
      discards its copy, the other locks and keeps its drafts.
- [ ] Prove primary Apple token revocation through Auth0's managed deletion
      (and a linked identity's once F6c ships); record the evidence.
- [ ] Measure active-server deletion within 24 hours on the authorized
      synthetic tenant and storage, including a forced provider outage that
      stays pending and alerts.
- [ ] Provision the independent registry store and its key custody; prove the
      API and other workers cannot reach it.
- [ ] Publish the exact retention and offline-copy wording after E2 approval.
