# E1: hosted test resources to set up

The owner authorized this on 19 October 2026: the owner creates the
non-production resources, and the hosted proofs then run against them. Every
proof refuses a production-looking target.

**Secrets never go into chat, a commit or a log.**
- Put them in a local env file. Every `.env.*` file is ignored by git, except the `*.example` files.
- Then either run the command yourself, or say which file to use and the proof is run from it.
- Values are never printed: the proofs log only short codes.

In order of what each one unblocks:

## 1. Cloudflare R2 test bucket (P1, unblocks the most)

**Unblocks:**
- P1's hosted storage contract;
- P2a's real quarantine upload, P2c receipts and P4 export on real R2;
- P5's real deletion;
- P6a's recovery inventory.

**Create:**
- A bucket named `gogospend-test-<anything>`. The proof refuses any other name.
- An R2 API token scoped to that bucket only, with object read and write.

**File:** `apps/api/.env.e1.local`
```
R2_TEST_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
R2_TEST_BUCKET=gogospend-test-<anything>
R2_TEST_ACCESS_KEY_ID=<token's access key id>
R2_TEST_SECRET_ACCESS_KEY=<token's secret>
R2_TEST_REGION=auto
```

**Proof:**
```bash
set -a; . apps/api/.env.e1.local; set +a; STORAGE_CONTRACT_TARGET=r2-test npm run test:storage-contract -w gogospend-api
```
- What it checks: private access, ownership, expiry, denial and a worker kill against real R2.
- Pass: record the `storage_contract` receipt in [beta-receipts.md](../implementation/beta-receipts.md).

## 2. Auth0 test tenant (F4–F6)

**Unblocks:**
- the native bootstrap spike (F4);
- native sessions (F5);
- two-device logout and Apple revocation (F6a);
- provider events (F6b);
- account linking (F6c).

**Create** a non-production tenant, with the applications in [auth0-runbook.md](auth0-runbook.md#applications-and-credentials):
- a native iOS/Android client;
- the read-profile/link M2M application;
- the maintenance M2M application;
- the Post Change Password Action.

**Note:** most of these proofs also need iOS/Android development builds signed in on devices (E2).

## 3. Neon test project (P6a)

**Unblocks:** the measured point-in-time restore (RPO ≤ 1 h, RTO ≤ 4 h) and the restore rehearsal against an isolated synthetic target.

**Create:**
- a separate project with synthetic data only;
- a restore branch database named `gogospend_restore_<8–32 lowercase letters or digits>`.

**Proof:** `node scripts/ops/restore-rehearsal.mjs --target isolated-synthetic`.

## 4. Staging target (P6b)

**Unblocks:** the performance smoke from a Thailand location (warm p95 reads < 800 ms and writes < 1,200 ms at 20 req/s).

**Needs:**
- a staging deployment whose host names staging (`staging`, `stage` or `stg`);
- a signed authorization record for it, in the shape `scripts/ops/performance-smoke.mjs` checks (`approved_at`, `approved_by`, `environment`, `origin`, `synthetic_data`, `target`, `valid_until`).
