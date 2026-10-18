# Auth0 operations runbook

Status: **local implementation only.** No Auth0 tenant, machine-to-machine
application or native build has been used yet (E1/E2 not authorized). Every
step marked *Tenant proof* is SKIPPED until then and must be done before beta.

## Applications and credentials

| Application | Used by | Management API scopes | Settings |
| --- | --- | --- | --- |
| Native iOS / Android | the app | none | `AUTH0_ALLOWED_CLIENT_IDS` |
| Read-profile/link M2M | API process | `read:users`, `update:users` (account linking, F6c) | `AUTH0_PROFILE_LINK_CLIENT_ID/SECRET` |
| Maintenance M2M | security worker and deletion worker (P5) only | `read:device_credentials`, `delete:device_credentials`, `delete:users`, `read:users` (only `last_password_reset`, or `user_id` to confirm a deletion, is requested) | `AUTH0_MAINTENANCE_CLIENT_ID/SECRET` |
| Post Change Password Action | Auth0 | none | secret `JOTBUN_EVENTS_SECRET` = one of the API's `AUTH0_EVENTS_SIGNING_SECRETS` |

- The maintenance credentials go only to the worker deployment
  (`apps/api/.env.worker.example`). The API never receives them, and the
  worker refuses a configuration that reuses the read-profile client.
- The worker's database login is a member of `gogospend_jobs` and
  `gogospend_security` only; the worker refuses to start otherwise. A login
  with only `gogospend_jobs` (P1's generic workers) cannot see, create or
  change security jobs.
- Neither process logs subjects, job payloads, tokens or Management API URLs.
  Job errors are short codes (`provider_unavailable`, `provider_forbidden`, …).

## Global logout ("sign out everywhere")

`POST /v1/me/global-logout` with a fresh `global_logout` proof (Idempotency-Key
= the proof's command id) returns `202 {generation, provider_cleanup: "pending"}`.
In one transaction under the account lock it:

1. bumps the account's session generation and sets `reauth_after` to the next
   whole second; every binding stops working at once, including requests that
   had already passed the access guard and were waiting on the lock;
2. revokes every binding row;
3. puts a `revocation_pending` hold on every alias that names this call's
   job; new sign-ins and proofs get `403 ACCOUNT_UNAVAILABLE` until that job
   succeeds. No other job can lift it, whatever its payload says;
4. queues an `auth0_revoke_grants` job (20 attempts). The queue stores no
   provider subjects; the worker reads them per lease from the database.

The security worker claims one job at a time (each gets its full lease) and:

- skips it as **stale** if its lease was lost or has expired; the database
  refuses every step on an expired lease, and provider calls stop 5 seconds
  before it expires;
- marks it **superseded** without calling Auth0 if no hold names it any more
  (deletion or an operator replaced the hold);
- otherwise revokes each held alias's refresh-token device credentials for
  every native client (`AUTH0_ALLOWED_CLIENT_IDS` plus any that held
  sessions), then lifts the holds that name this job.

`POST /v1/me/logout` revokes only the calling device's binding; it does not
touch Auth0.

Global logout does not sign the user out of Google or Apple, and does not end
the Auth0 browser session (SSO cookie). The next sign-in is a fresh login: an
ID token whose `auth_time` predates `reauth_after` is refused.

## Running the worker

```bash
npm run build -w gogospend-api
```

```bash
npm run worker:security -w gogospend-api
```

`-- --once` runs one batch and exits (non-zero if the batch failed), for
manual recovery. Polling interval: `SECURITY_WORKER_INTERVAL_SECONDS` (15).

## Holds and failed jobs

A provider outage never falls back to the old grants: the hold stays.

- Retryable failures (`provider_unavailable`, `provider_rate_limited`,
  `provider_incomplete`, `provider_bad_response`, `lease_expired`,
  `worker_error`) back off 30 s × 2^attempt, capped at 1 hour, for up to 20
  attempts (about 15 hours).
- Permanent failures (`provider_forbidden`, `provider_rejected`,
  `invalid_payload`, `no_client_ids`) and exhausted retries leave a visible
  `failed` job. A lease that expires on its last attempt fails with
  `lease_expired`.
- **Alert** on the worker log line `security worker: N security job(s) failed
  terminally`: each one is a user who cannot sign in. The full alert list is
  in [incident.md](incident.md).

Find stuck cleanup (migration/admin connection; never expose payloads):

```sql
SELECT id, account_id, status, attempts, max_attempts, last_error, run_after, updated_at
  FROM jobs
 WHERE kind = 'auth0_revoke_grants' AND status IN ('queued', 'leased', 'failed')
 ORDER BY created_at;
```

After fixing the cause (for example a missing Management API scope), requeue a
failed job; its hold is still in place and is lifted only by a successful run:

```sql
UPDATE jobs
   SET status = 'queued', attempts = 0, run_after = now(), last_error = NULL, finished_at = NULL, updated_at = now()
 WHERE id = '<job id>' AND status = 'failed';
```

Never delete a `revocation_pending` hold by hand to "unblock" a user: that
would let a sign-in reuse refresh grants the user asked to revoke.

## Disabling or deleting users

All user-disable and delete operations must update GoGoSpend's state first
(account status, holds, jobs) and then Auth0. Account deletion does exactly
this through `POST /v1/me/deletion` and the deletion worker
([deletion.md](deletion.md)); never delete an Auth0 user by hand for it. Changes made directly in the
Auth0 dashboard are not promised to revoke app sessions instantly; a signed
`user_blocked` event (below), sent by the operator tooling, ends them.

## Password changes and other provider security events (F6b)

`POST /v1/auth/provider-events` accepts one signed envelope per event:

- header `x-gogospend-event-signature: t=<unix seconds>,v1=<hex HMAC-SHA256>`
  over `<t>.<raw body>`, keyed by a secret in `AUTH0_EVENTS_SIGNING_SECRETS`
  (several `v1=` values and several configured secrets allow rotation:
  add the new secret to the API, switch the Action, then remove the old one);
- body, exactly `{"id","type","issuer","subject","occurred_at"}`: `type` is
  `password_changed` or `user_blocked`; `issuer` must equal `AUTH0_ISSUER`;
  `occurred_at` is at most 60 s ahead and 7 days old; the signature time is
  within 5 minutes; at most 8 KiB.

Answers: `200 {"result":"applied"|"duplicate"}`, `401 UNAUTHENTICATED`
(signature or replay window), `422 VALIDATION_FAILED`, `409
IDEMPOTENCY_MISMATCH` (an id reused for different content), `404` when no
secret is configured. Retry only on 5xx or a network error, with the same id.

Effect, under the principal and account locks, when the change is newer
than the account's last applied one (an older or repeated event changes
nothing; any account status, so re-enabling a disabled account revives no
old session):

1. every session signed in before the change (auth time, rounded up to the
   next whole second) ends at once, and `reauth_after` moves past the change
   (never back), so no login from before it can bind again - including one
   replayed from an old refresh grant;
2. every alias is held and `auth0_revoke_grants` is queued (the global-logout
   cleanup, same hold and retry rules), so old refresh grants cannot even
   reach the token-only routes; sessions signed in after the change wait for
   that cleanup.

A change for a principal with no account yet is kept as its watermark:
a first sign-in with a login from before the change is refused
(`REAUTH_REQUIRED`), and the new account starts with that watermark.
Event ids starting with `reconcile:` are reserved.

Post Change Password Action (Node 18 runtime; synthetic until E1). Set the
Action secrets `JOTBUN_EVENTS_SECRET`, `JOTBUN_ISSUER` (exactly the API's
`AUTH0_ISSUER`, including any regional or custom domain) and
`JOTBUN_EVENTS_URL`:

```js
exports.onExecutePostChangePassword = async (event, api) => {
  const crypto = require('crypto');
  const now = Date.now();
  const body = JSON.stringify({
    // Unique per change, short whatever the user id length.
    id: `pcp_${crypto.createHash('sha256').update(`${event.user.user_id}:${now}`).digest('hex').slice(0, 48)}`,
    type: 'password_changed',
    issuer: event.secrets.JOTBUN_ISSUER,
    subject: event.user.user_id,
    // The Action runs just after the change; this may be up to a few seconds late.
    occurred_at: new Date(now).toISOString(),
  });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const t = Math.floor(Date.now() / 1000);
    const mac = crypto.createHmac('sha256', event.secrets.JOTBUN_EVENTS_SECRET).update(`${t}.${body}`).digest('hex');
    try {
      const response = await fetch(event.secrets.JOTBUN_EVENTS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-gogospend-event-signature': `t=${t},v1=${mac}` },
        body,
      });
      if (response.ok) return;
      if (response.status < 500) {
        console.log(`jotbun event refused: ${response.status}`);
        return; // not retryable; reconciliation still finds the change
      }
    } catch (error) {
      // network error: retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  console.log('jotbun event not delivered; reconciliation will find the change');
};
```

An `occurred_at` a little later than the real change can end a legitimate
login made within that same second; the user signs in again.

### Lost events: reconciliation

The security worker queues an `auth0_security_reconcile` pass at most every
`SECURITY_RECONCILE_INTERVAL_SECONDS` (default 300). Each pass reads
`last_password_reset` for the `SECURITY_RECONCILE_BATCH` (default 200)
longest-waiting identities that still have a live session - ordered by when
each was last checked, or, never checked, since its earliest live session
began, so new sign-ins cannot starve older ones - and applies any change
newer than the account's last one exactly as an event would, except that a
change found more than a day after every live session began ends nothing and
revokes nothing.

- **Propagation bound for a lost event:** each identity waits behind at most
  everyone who was waiting before it, so a change is found within about
  `ceil(identities with live sessions / batch) × interval` plus one pass
  (about 10 minutes for up to 200 signed-in identities with the defaults).
  Raise the batch or lower the interval as the user base grows; the bound is
  recorded with the tenant proof. The pass runs after the worker's revocation
  jobs and shares the Management API rate limit with them.
- **One bad identity cannot stop a pass:** a time that is not a real instant,
  is before 2000 or is ahead of now is treated as unknown, and a permanent
  refusal for one identity is skipped; both are marked checked.
- **Provider outage:** the pass fails as retryable (`provider_unavailable`)
  and sessions stay as they are - nothing is guessed; it runs again with
  backoff, and a terminal failure is logged like any security job.
- **Retention:** receipts and check rows are pruned 30 days after they were
  written (past the 7-day event window) by the job worker's
  `auth.security_records` step, and at once for an erased account (P5; see
  [retention.md](retention.md) and [deletion.md](deletion.md)).
- Do not claim that access-token expiry alone ends a compromised refreshable
  session: recovery relies on the binding revocation above.

## Account linking (F6c)

`POST /v1/me/identities` (recent proof plus the current terms; Idempotency-Key
= the command id of both `link` challenges) adds a second sign-in method to
the signed-in account. The app:

1. issues two `link` challenges for one command (`POST /v1/auth/challenges`);
2. proves the signed-in identity with the first (`/v1/auth/proofs`, fresh
   login with `max_age=0`);
3. signs in with the other method using the second challenge's nonce and
   sends that ID token with the proof.

The API checks the other identity exactly as its own sign-in would: a fresh
login for this challenge, nonce and client; Auth0 reports it unblocked with a
verified email (read-profile client); and the login postdates its own
account's `reauth_after` and every credential change recorded for it (F6b).
Then one transaction under the account lock decides everything:

- both proofs are consumed;
- the other identity becomes an alias of this account; its own account is
  folded in if it holds no data (untouched built-in categories do not count),
  otherwise `409 ACCOUNT_LINK_CONFLICT`;
- every binding ends through global logout (hold + refresh-grant revocation);
- an `auth0_link_identities` job is queued to merge the two Auth0 users.

Nothing irreversible happens at Auth0 before that commit. The security worker
runs the merge with the profile/link application (`update:users`; set
`AUTH0_PROFILE_LINK_CLIENT_ID/SECRET` in the worker environment; without them
merge jobs stay queued and visible). Until the merge runs - or if it fails -
either login already reaches the account through its alias.

- Auth0 outage (incl. 401, 429, 5xx): the merge retries with backoff.
- `provider_forbidden` (403, scope missing) or `provider_rejected`: the job
  fails visibly; fix the configuration and requeue it (see "Holds and failed
  jobs"). The database link stays in force.
- A merge whose identities are no longer both aliases is superseded.
- Revoking refresh grants of an Auth0 user that a merge has already removed
  (Auth0 answers 404) counts as done.
- Unlinking is not offered. If an operator unlinks at Auth0, remove the alias
  row only after confirming the account holds no data for it.

## Tenant proof (SKIPPED until E1/E2)

- [ ] Create the maintenance M2M application with exactly the scopes above;
      record the plan and Management API entitlement used.
- [ ] Confirm which device-credential types the tenant reports for native
      refresh tokens (`refresh_token` and/or `rotating_refresh_token`) and that
      `DELETE /api/v2/device-credentials/{id}` revokes them. If the plan offers
      `DELETE /api/v2/users/{id}/refresh-tokens`, decide whether to switch.
- [ ] Two devices signed in; global logout; both lose access at once; refresh
      on either device fails after the worker runs; a fresh login succeeds.
- [ ] Primary Apple token revocation through Auth0's managed deletion path.
- [ ] Independent auth/security review of the above evidence.
- [ ] F6b: deploy the Post Change Password Action with a test secret; change a
      test user's password with two devices signed in; both lose access at
      once and a fresh login works after cleanup. Record the delivery delay.
- [ ] F6b: disable the Action, change the password again, and confirm the
      reconciliation pass applies it within the documented bound; record the
      plan's `last_password_reset` behaviour (set on reset and on change).
- [ ] F6c: grant `update:users` to the profile/link application and give
      its credentials to the security worker; link an Apple login into an
      email login on test identities; both sign in to the same account;
      delete the account and confirm Auth0's managed deletion revokes the
      linked Apple token. Record the evidence.
- [ ] F6c: confirm the link request body for the `auth0` provider when the
      tenant has several database connections (`connection_id`), how Auth0
      reports `user_id` types, what happens to the merged user's refresh
      tokens, and that `device-credentials` answers 404 (or an empty list)
      for a merged user.
- [ ] F6b: decide whether Auth0 itself revokes refresh tokens on password
      change on the selected plan; if recovery cannot be reconciled within a
      stated bound, stop the release path for a design decision.
