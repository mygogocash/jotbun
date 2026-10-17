# Auth0 operations runbook

Status: **local implementation only.** No Auth0 tenant, machine-to-machine
application or native build has been used yet (E1/E2 not authorized). Every
step marked *Tenant proof* is SKIPPED until then and must be done before beta.

## Applications and credentials

| Application | Used by | Management API scopes | Settings |
| --- | --- | --- | --- |
| Native iOS / Android | the app | none | `AUTH0_ALLOWED_CLIENT_IDS` |
| Read-profile M2M | API process | `read:users` | `AUTH0_PROFILE_LINK_CLIENT_ID/SECRET` |
| Maintenance M2M | security worker only | `read:device_credentials`, `delete:device_credentials`, `delete:users` | `AUTH0_MAINTENANCE_CLIENT_ID/SECRET` |

- The maintenance credentials go only to the worker deployment
  (`apps/api/.env.worker.example`). The API never receives them, and the
  worker refuses a configuration that reuses the read-profile client.
- The worker's database login is a member of `gogospend_jobs` and
  `gogospend_security` only.
- Neither process logs subjects, job payloads, tokens or Management API URLs.
  Job errors are short codes (`provider_unavailable`, `provider_forbidden`, …).

## Global logout ("sign out everywhere")

`POST /v1/me/global-logout` with a fresh `global_logout` proof (Idempotency-Key
= the proof's command id) returns `202 {generation, provider_cleanup: "pending"}`.
In one transaction under the account lock it:

1. bumps the account's session generation and sets `reauth_after` (whole
   second); every binding stops working at once, including requests that had
   already passed the access guard and were waiting on the lock;
2. revokes every binding row;
3. puts a `revocation_pending` hold, tagged with the new generation, on every
   alias; new sign-ins and proofs get `403 ACCOUNT_UNAVAILABLE` until it clears;
4. queues an `auth0_revoke_grants` job (8 attempts).

The security worker then, per job:

- skips it as **stale** if its lease was lost (expired and reclaimed);
- marks it **superseded** without calling Auth0 if no alias still waits on its
  generation (a newer logout took over), so an old job can never revoke grants
  issued after a later cleanup;
- otherwise revokes each alias's refresh-token device credentials for the
  native clients that held sessions, then lifts that generation's hold.

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
  `provider_incomplete`, `provider_bad_response`, `worker_error`) back off
  30 s × 2^attempt, capped at 1 hour, for up to 8 attempts.
- Permanent failures (`provider_forbidden`, `provider_rejected`,
  `invalid_payload`) and exhausted retries leave a visible `failed` job. A lease
  that expires on its last attempt fails with `lease_expired`.

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
(account status, holds, jobs) and then Auth0. Changes made directly in the
Auth0 dashboard are not promised to revoke app sessions instantly; F6b adds
signed Auth0 security events for that.

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
