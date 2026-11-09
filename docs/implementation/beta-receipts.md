# Beta receipts (P6b)

The controlled beta needs every receipt below **PASS**, recorded with its
command, target, date and a SHA-256 of its stored redacted output. A required
FAIL or SKIPPED blocks beta. Local green, hosted CI, the deployed commit and
production readiness are reported separately; none implies another.

Status at P6b's local package: every hosted, native and approval item is
**SKIPPED** (E1/E2/E3/E4 not authorized). Nothing below has been claimed from
code or YAML alone.

## Readiness receipts (format- and time-checked attestations)

A receipt is an attestation, not proof: the API checks its format, target,
digest shape and dates, and whoever writes `READINESS_RECEIPTS` vouches that
the evidence it names exists and passed. `/ready` reports not ready until
each of these is `passed` and current (rules in
`apps/api/src/health/readiness-receipts.ts`). The platform's deploy health
check is `/live`, so receipts never block a deploy (an emergency pause or a
rollback must go live); instead the release preflight enforces them
(`scripts/ops/readiness-receipts.mjs --min-valid-days 7` must exit 0, see
[release.md](../operations/release.md#preflight-every-release)), and the API
logs `receipt_expiring` 7 days before a passed receipt expires. `/ready`'s
response names no check; the states are in the API's `readiness` log line.
Source: `READINESS_RECEIPTS` (inline JSON) or `READINESS_RECEIPTS_FILE` (an
absolute path to the same JSON), read once at startup; never both. Locally
neither is set, so `/ready` answers 503 by design.

```json
{
  "restore_rehearsal": {
    "status": "passed",
    "recorded_at": "2026-11-02T03:00:00Z",
    "valid_until": "2026-12-02T03:00:00Z",
    "target": "isolated-synthetic",
    "evidence_sha256": "<64 hex: SHA-256 of the stored redacted RestoreReceipt>"
  },
  "storage_contract": {
    "status": "passed",
    "recorded_at": "…",
    "valid_until": "…",
    "target": "r2-test",
    "evidence_sha256": "<64 hex>"
  }
}
```

Rules (an entry that breaks one is `invalid`, and the API is not ready):

- exactly these five fields; `status` is `passed` or `failed` (a `failed`
  receipt blocks readiness until a passing one replaces it);
- `target` is the hosted target: `isolated-synthetic` for the restore
  rehearsal (a `local-isolated-synthetic` receipt never counts) and
  `r2-test` for the storage contract;
- `evidence_sha256` is 64 lowercase hex digits and not all zeros;
- `recorded_at` and `valid_until` are UTC timestamps exactly as
  `toISOString()` prints them (`2026-11-02T03:00:00.000Z`; the zero
  milliseconds may be left out), so hour 24 or a date like 30 February is
  refused rather than rolled over;
- `recorded_at` not in the future; `valid_until` after it and at most **31
  days** later (rehearse at least monthly); past `valid_until` the state is
  `expired`;
- an unknown receipt kind or malformed JSON stops startup.

| Receipt | Produced by | Status |
| --- | --- | --- |
| `restore_rehearsal` | P6a: `node scripts/ops/restore-rehearsal.mjs --target isolated-synthetic` on the authorized isolated target; restore a pre-deletion backup, reapply markers, `erased_owner_rows: []`, `missing_retained_objects: []`, measured RPO/RTO | SKIPPED (E1) |
| `storage_contract` | P1: `STORAGE_CONTRACT_TARGET=r2-test npm run test:storage-contract -w gogospend-api` (private access, ownership, expiry, denial, worker kill against R2) | SKIPPED (E1) |

## Beta checklist (reviewed by people at E3)

| Area | Receipt | Command / target | Status |
| --- | --- | --- | --- |
| Local gate | full gate, Docker build and release smoke on the release commit | `docs/implementation/backend-progress.md`, P6b section | PASS locally (this branch) |
| Hosted CI | `.github/workflows/backend.yml` green on the release commit | GitHub Actions after an authorized push/PR (E4) | first run green: [PR #70](https://github.com/mygogocash/jotbun/pull/70) at `f8058b5`, all three jobs (gate, SQL and ops, release image and smoke on x64); re-run on the release commit |
| Storage | P1 hosted R2 gate | above | SKIPPED (E1) |
| Uploads | P2a: one real bounded quarantine upload, stall timeout and expiry | R2 test scope | SKIPPED (E1); uploads stay off |
| Imports | P2b, P2c, P3 local and hosted gates; dependency audit of parser packages | their plans | built locally and merged (P2b, P2c, P3); hosted gates SKIPPED (E1); uploads stay off |
| Auth | F4 native bootstrap spike; F5 native session; F6a two-device logout and Apple revocation; F6b provider events; F6c linking | tenant and devices (E1/E2) | SKIPPED |
| Offline | S2–S4 encrypted diary, restart, account switch on iOS and Android builds | devices (E2) | SKIPPED |
| Money UI | M5 native writes, Thai/English, accessibility, visual approval | devices (E2) | SKIPPED |
| Export | P4 private export, grant, expiry on real R2 | E1 | SKIPPED |
| Deletion | P5 Apple revocation, active-server deletion within 24 hours, independent registry and its key custody, fd delivery on the platform | E1/E2 | SKIPPED |
| Recovery | P6a hosted restore, PITR RPO ≤ 1 h / RTO ≤ 4 h, daily fallback RPO ≤ 24 h, complete inventory | E1 | SKIPPED |
| Performance | `node scripts/ops/performance-smoke.mjs --target staging-synthetic …` from a named Thailand location: warm p95 reads < 800 ms, writes < 1,200 ms, ≤ 1% failed, at 20 req/s over ≥ 20 synthetic accounts | authorized staging target | SKIPPED (no authorized target) |
| Native journeys | stage-1 smoke in [release.md](../operations/release.md#staged-enablement) on both platforms | release builds | SKIPPED (E2) |
| Operations | alert routing for every line in [incident.md](../operations/incident.md), provider budget alerts at 50/80/100% of US$100, 7-day log retention, the deploy health check on `/live`, an external monitor on `/ready` | provider consoles (E3) | SKIPPED |
| Lockfile | Linux bindings recorded in `package-lock.json` | `scripts/ci/lockfile-bindings.test.mjs` | done locally (19 October 2026) |
| Approvals | E3 release (exact target, revision, secrets by name, alert owner, rollback) and E4 Git delivery | founder | not given |

## Performance receipt (template)

`performance-smoke.mjs` prints this; store it, then put its SHA-256 in the
release record. It never contains a token, binding, amount or account id.

```json
{
  "receipt": "gogospend-performance-smoke-v1",
  "target": "staging-synthetic",
  "origin_host": "<staging host>",
  "location": "bangkok-<site>",
  "node": "v24.22.0",
  "accounts": 20,
  "load": { "rate_per_second": 20, "warmup_seconds": 30, "measured_seconds": 120, "write_share": 0.2 },
  "thresholds": { "read_p95_ms": 800, "write_p95_ms": 1200, "max_failure_rate": 0.01 },
  "started_at": "…", "finished_at": "…", "sent": 3000,
  "reads": { "count": 0, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0 },
  "writes": { "count": 0, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0, "expected": true },
  "failed": 0, "errors": {}, "pass": false, "failure_rate": 0, "reasons": []
}
```

The authorization record it requires (from a descriptor, never an argument):
`{"target": "staging-synthetic", "environment": "staging", "synthetic_data":
true, "origin": "https://<staging host>", "approved_by": "<role>",
"approved_at": ISO, "valid_until": ISO ≤ 7 days later}`. Accounts come from
another descriptor: at least 20 `{access_token, binding, client, wallet_id,
category_id}` entries for synthetic accounts, issued just before the run
(access tokens last 5 minutes at most).
