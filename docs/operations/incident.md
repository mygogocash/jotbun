# Incident runbook (P6b)

Status: **local package only.** Alert routing, the owner and the destination
are configured at deployment (E3); until then this is the reference for what
each line means and what to do first.

**Owner:** the founder (alert destination and a backup contact are recorded
in the release record at E3). Every alert below goes to that owner.

## First moves

1. Read the alert line and match it to the table below.
2. If users' data could be harmed, **pause the scope** (below) before
   investigating; pausing never loses a draft.
3. Check `GET /ready` and the API's `readiness` log line (it names the
   failing check; the response does not), and the workers' heartbeat lines.
4. Decide: fix forward, pause longer, or roll back ([rollback.md](rollback.md)).
5. Record what happened (below).

## Pausing

Set `OPERATIONAL_PAUSE` on the service and restart it (on Railway, changing
the variable redeploys). The redeploy goes live on the deploy health check,
`GET /live`, so a pause takes effect even while the database check fails or a
readiness receipt has lapsed; only a full database outage keeps a new API
deploy from starting (its startup checks the database login), and then the
current deployment keeps serving. Scopes are independent; list several with
commas. An unknown scope stops startup, so a typo cannot silently pause
nothing.

| Scope | API effect (503, `retry_after_seconds`, `Retry-After`) | Worker effect | Still works |
| --- | --- | --- | --- |
| `writes` | wallets, categories, records, budgets, identity linking → `WRITES_PAUSED` | none | every read, sign-in/out, global logout, policy acceptance, privacy preferences, export request and download, deletion request |
| `imports` | `POST /v1/imports` → `IMPORTS_PAUSED` (P3 confirmation joins it) | the job worker does not claim `import_parse` (queued jobs wait, no attempt spent) | import status reads, the import maintenance pass, the 24-hour quarantine expiry and sweeps |
| `ocr` | image uploads (`image/jpeg`, `png`, `webp`) → `OCR_PAUSED`; CSV/XLSX continue | new image parsing cannot be queued. P2b uses one `import_parse` kind for images and spreadsheets, so the worker still claims it; its handler **releases** each queued image parse (`release(lease, 'ocr_paused')`) instead of running it. A release gives the attempt back and holds the job for the retry-after (`OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS`, default 300), so a pause spends no attempt and does not spin; spreadsheets keep parsing and nothing is read or recorded for the parked images. Reopening the scope lets them run as their first attempt on the next claim after the delay (to run them sooner, set `run_after = now()` on the `ocr_paused` jobs). A raw file about to expire is still failed visibly (`import_unavailable`), not parked | everything else |

**Parser sandbox (P2b review fixes):** the job worker registers `import_parse` only when each real parser child, started with a parse's flags, is denied network access, file writes, child processes and workers (and the rest of the self-check). Node's permission model denies the network only from Node 25 on, so on Node 24.22.0 (the image and CI runtime today) the worker logs `job worker: import parsing disabled (parser sandbox unsupported: …)` and never claims parse jobs. Imports stay off until the worker runs on Node ≥25 (owner decision) or the pause gates above apply.
| `uploads` | `POST /v1/imports` → `UPLOADS_PAUSED` | none | parsing and confirmation of files already received |
| `jobs` | `POST /v1/exports`, `POST /v1/sync/snapshots` → `JOBS_PAUSED` | every worker (job, security, deletion) stops claiming; running jobs finish; maintenance, sweeps, retention, reports and alerts continue | deletion and global-logout requests are still accepted (their jobs wait; holds keep the accounts locked, so a pause fails closed) |

Gates answer before authentication and before any database work, so nothing
is reserved and the app resends the same request (same Idempotency-Key and
body) later. The exception is `ocr`: it depends on the file type, so the
upload controller checks it after authentication (still before any byte of
the body is read or stored). A refused request whose body was not read is
answered with `Connection: close`. An unreleased feature stays `404` even while paused
(`IMPORT_UPLOADS_ENABLED=0` keeps the upload route hidden). Retry time:
`OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS` (default 300). A paused worker logs
`<worker>: paused <scopes>` on each report, and its `queue_age` alerts will
fire while it is paused; that is expected.

To stop one worker completely, stop its service; queued work waits. A
stopping worker (SIGTERM, a redeploy) releases the job it was running: the
job is queued again, due at once, with its attempt given back
(`last_error = worker_stopped`), so a restart never spends or exhausts an
attempt. The security worker finishes the job in hand instead and claims
nothing more.

## Alert lines

Workers print plain text: alerts and failures on stderr, the heartbeat and
summaries on stdout. The API prints JSON lines. They carry counts, kinds,
codes and seconds only.

| Line (prefix) | Source | Threshold | Meaning | First action |
| --- | --- | --- | --- | --- |
| `<worker>: alert queue_age kind=K due=N oldest_due_seconds=S threshold_seconds=300` | job, security, deletion workers | a due job waited **over 5 minutes** | the worker is behind, stuck, paused or short of capacity | check the worker's heartbeat and `claim failed` lines; scale or fix; see the query below |
| `<worker>: queue due=N oldest_due_seconds=S` | each worker, every minute (its own timer, not the sweep) | **absent** for 5 minutes | heartbeat; its absence means the worker is down | restart the service; check `startup failed` and `crashed` |
| `recovery: alert backup_age reason=… backup_age_hours=H threshold_hours=26` | operator cron (`scripts/ops/backup-age.mjs` on the inventory, run with the recovery key) | newest verified daily backup **over 26 hours** (`too_old`), none (`no_backup`), or none verified (`unverified`: run the inventory with `--key-fd`); a partial write from a failed backup never counts | backups stopped | run the backup by hand ([restore.md](restore.md)); fix the schedule |
| `job worker: N export object(s) overdue for deletion` | job worker | any | an export file is past its 24-hour deletion (cleanup failure) | check storage credentials and `object sweep failed`; the next sweep retries |
| `job worker: N quarantine object(s) overdue for deletion` | job worker (P2a review fix) | any | a quarantined upload is past its deletion (cleanup failure) | same as above |
| `job worker: N receipt object(s) overdue for deletion` | job worker (P2c review fix) | any | a retained-receipt image is past its deletion by over an hour (released, erased or abandoned copy; cleanup failure) | check storage credentials and `object sweep failed`; the next sweep retries |
| `job worker: import maintenance failed (…)` | job worker (P2a review fix) | repeats | stale uploads, ended imports or file names are not being cleared | check the database login and the routine; nothing is lost, the next pass retries |
| `job worker: retention step(s) failed: <names>` | job worker | repeats | a retention deadline is slipping (cleanup failure) | [retention.md](retention.md) |
| `job worker: N <kind> job(s) failed` | job worker | any (user-caused codes excluded) | a job exhausted its attempts | runbook query, fix, requeue |
| `job worker: N <kind> job(s) queued with no handler in this worker` | job worker | any | a kind has no worker (wrong revision or not yet built) | deploy the worker that handles it |
| `security worker: N security job(s) failed terminally` | security worker | any | a user cannot sign in until fixed | [auth0-runbook.md](auth0-runbook.md) |
| `deletion worker: N deletion(s) open for over 20 hours` | deletion worker | any | the 24-hour deletion target is at risk | [deletion.md](deletion.md) |
| `deletion worker: N deletion job(s) failed terminally` | deletion worker | any | a deletion stopped (cleanup failure) | [deletion.md](deletion.md) |
| `… failed (<Class> [code])` (sweep, check, report, claim, batch) | any worker | repeats over 3 reports | a step keeps failing | the code is a SQLSTATE or system code; check the dependency |
| `<name> startup failed: …` | any process | any | it cannot start (configuration or dependency) | fix the named setting; only a configuration error prints its (fixed) message, which never contains a value |
| `<name> crashed: <Class>[ code]` | any process | any | an uncaught exception or unhandled rejection; the process exited 1 and the platform restarts it | find the class or code in the change log of the revision; repeats → roll back |
| `<name>: shutdown timed out after N ms` | any process | any | a drain exceeded `SHUTDOWN_TIMEOUT_SECONDS` | check for stuck requests or jobs |
| `{"event":"readiness","status":"not_ready","checks":{…}}` | API (on each change) | persists 5 min (also: an external monitor sees `/ready` 503 for 5 min) | the API is not ready (receipts, database or draining); deploys still go live on `/live` | fix the named check (`database`, `receipt.*`, `process: draining`) |
| `{"event":"receipt_expiring","receipt":K,"hours_left":H,"warning_days":7}` | API (startup, then at most daily per receipt) | any | a readiness receipt expires within 7 days | renew it ([beta-receipts.md](../implementation/beta-receipts.md)) before `/ready` fails |
| request lines with `"status":5xx` | API | **over 1%** of requests for 5 minutes | server or dependency errors | read `{"level":"error",…,"status":500,"error":"<Class>"}` and the `source:"nest"` lines |
| provider budget alerts at **50%, 80%, 100%** of the US$100 envelope | Railway, Neon, Cloudflare, Auth0 | each threshold | spend is tracking above plan | review usage; these are alerts, **not caps** |

Requests the API refuses on purpose are not incidents: `426` (old app),
`429 UPLOAD_LIMIT_REACHED` (including P2a's limit of 2 uploads streaming per
account and the daily byte and parse limits), `408 UPLOAD_INCOMPLETE` (P2a's
30-second idle or 8-minute receive bound for a stalled upload), and the
`503 *_PAUSED` answers while a scope is paused.

Queue detail (migration/admin connection; never select payloads):

```sql
SELECT kind, status, count(*), min(run_after) AS oldest_due, max(attempts) AS max_attempts
  FROM jobs
 WHERE status IN ('queued', 'leased', 'failed')
 GROUP BY kind, status ORDER BY kind, status;
```

## Logs: what they hold and how long

Kept **7 days**, then deleted; only the operator role can read them. They
hold request id, method, route template, status and latency per request,
and counts, kinds, codes and seconds from workers. They never hold request
bodies, query strings, tokens, session bindings, amounts, notes, merchant
names, object keys, signed URLs, provider subjects or account ids (worker
lines), or driver/provider error text: startup failures, crashes and Nest's
own errors pass through `describeFailure`, which prints the class name and a
SQLSTATE or system code, and a message only for a `ConfigurationError` (fixed
text naming a setting, never its value). `operational-safety.spec.ts` and
`operational-hardening.spec.ts` inject synthetic credentials and money values
into API and worker failures and check that those shapes stay out of the
lines; that is a test of known shapes, not a guarantee. If a secret is ever
found in a log, treat it as exposed: rotate it, then purge the log.

## Recording an incident

Within a day: start and end time (Asia/Bangkok), the alert lines, scopes
paused and for how long, the revision(s), what changed, user impact (counts
only), and the follow-up. Never copy user data, tokens or log excerpts with
identifiers into the record.
