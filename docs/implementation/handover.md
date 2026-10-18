# Backend handover — 18 October 2026

This page lets another engineer or AI agent continue the GoGoSpend v1 backend and app work without the earlier conversation. Read it first, then the documents it links. Per-task evidence (RED, GREEN, gates, mutants, deviations) lives in [backend-progress.md](backend-progress.md). This page summarises it and lists what is left.

**Development is on hold at the owner's request.** Resume only when the owner says so, and start with "Work queue" below.

## 1. Where things are

| Item | State |
| --- | --- |
| Integration branch | `claude/gogospend-backend-plan-review-3c7544`, head `d036e75` plus this handover commit |
| On GitHub | PR [mygogocash/gogospend#1](https://github.com/mygogocash/gogospend/pull/1) was merged into `main` at `ccd3fb0` (through P2b's merge). **Every later commit is local only**, on the owner's machine, until someone pushes it. |
| Phases built and merged locally | F1–F6c, M1–M5, S1–S4, P1, P2a, P2b, P2c, P3, P4, P5, P6a, P6b (local parts) |
| Migrations | `apps/api/drizzle/0001`–`0018`; **next free number: `0019`**. None has been applied to a deployed database. |
| Last full gate (at `d036e75`) | typecheck, typecheck:app, test:api 825, test:db 630, test:app 28, test:unit 241, test:dev 7, test:ops 107 (`GOGOSPEND_OPS_REQUIRE_DB=1`), test:render 66, build, release-graph check, export:web, `git diff --check`: all PASS. Release image smoke PASS on Node 24.22.0 (linux/arm64). |
| Never done | No provider resource, credential or paid service used. Nothing deployed. Hosted CI never ran. Every hosted, native and device check is recorded SKIPPED. |
| Flags that stay off | Uploads (`IMPORT_UPLOADS_ENABLED`); account linking; password-reset recovery; the import review screen is not routed. |

**Paused work.** Both branches are local on the owner's machine. Each has a worktree under `.claude/worktrees/`. Both are built on `d036e75`.

| Work | Branch | Commits | State |
| --- | --- | --- | --- |
| P2b review fixes | `worktree-agent-a4f763a959b4acb0e` | `adc4bad`, `1edc37a` (both WIP) | Stopped mid-work; not gated; RED/GREEN not recorded |
| P2c review fixes | `worktree-agent-a17fd82c4e2f7c6e0` | `9614abe` (WIP) | Stopped mid-work; not gated |

The P3 independent review was stopped before it reported and must be run again.

## 2. Orientation

- **Monorepo layout:**
  - `apps/api`: NestJS 12 API and workers. Hand-written SQL migrations in `apps/api/drizzle/` with `drizzle/meta/_journal.json`.
  - `apps/app`: Expo SDK 58 app. Pure unit tests run through `test:unit`; render tests use vitest.
  - `packages/contracts`: shared v1 contracts, consumed as TypeScript source.
- **Plans** (`docs/superpowers/plans/`):
  - [master](../superpowers/plans/2026-10-17-gogospend-backend.md): global constraints, migration table, authority gates;
  - [01 foundation/auth](../superpowers/plans/2026-10-17-gogospend-01-foundation-auth.md);
  - [02 money](../superpowers/plans/2026-10-17-gogospend-02-money.md);
  - [03 offline sync](../superpowers/plans/2026-10-17-gogospend-03-offline-sync.md);
  - [04 jobs/privacy/release](../superpowers/plans/2026-10-17-gogospend-04-jobs-privacy-release.md).
- **Operations docs** (`docs/operations/`): `release.md`, `rollback.md`, `incident.md`, `restore.md`, `retention.md`, `deletion.md` and `auth0-runbook.md`. Also [beta-receipts.md](beta-receipts.md).
- **Environment:**
  - Local: Node 26.10.0 (`.nvmrc` says 24).
  - Release image and CI: Node 24.22.0, pinned by digest.
  - Run `npm ci` in every new worktree.
- **Local database:**
  - PostgreSQL 17 in Docker, container `gogospend-postgres-v1-local` on 127.0.0.1:55432, from `compose.postgres.yml`. `npm run db:v1:up` starts the container only.
  - Each test run creates and drops its own `gogospend_test_*` database.
  - `npm run dev:v1` also migrates the `gogospend_v1` dev database, so don't run it casually (see section 6).

**Full gate**, from the repository root. Run it before every commit that lands on the integration branch:
```bash
npm run typecheck
npm run typecheck:app
npm run test:api
npm run test:db
npm run test:app
npm run test:unit
npm run test:dev
GOGOSPEND_OPS_REQUIRE_DB=1 npm run test:ops
npm run test:render -w gogospend-app
npm run build -w gogospend-api
node apps/api/scripts/release-graph.mjs check
npm run export:web -w gogospend-app -- --max-workers 2
git diff --check
```

**Release image check**, after changes to workers, parsers or packages:
```bash
docker build -f apps/api/Dockerfile -t gogospend-local-check .
docker run --rm gogospend-local-check node scripts/release-smoke.cjs
```

## 3. Ground rules (set by the owner; keep them)

- **Git:**
  - Commit locally on the integration branch, or on a task branch merged into it.
  - Don't push, open PRs, merge on GitHub or deploy unless the owner asks for that specific action. PR #1 was one such request.
- **No provider resources or paid services** without the owner's explicit E1 authorization. This means no Auth0, Neon, R2, Railway or Cloudflare, and no provider MCP tools (including Neon's).
- **Hosted, native and device checks** are recorded **SKIPPED**, never as passes.
- **No dependency changes without authorization:** no new packages and no lockfile changes. Regenerating the lockfile with Linux native bindings needs the owner's approval, and so does changing the Node base image or CI version.
- **No changes under `vendor/`.** Keep legacy Mongo/`/spend` code and data; no automatic Mongo fallback.
- **Never use a bare `git stash`.** The stash is shared across worktrees. Use WIP commits.
- **Databases:**
  - Never drop test databases or roles you didn't create; other runs may be using them. Four `gogospend_test_*` databases dated 17 October predate this work, so leave them alone.
  - Confirm `gogospend_v1` is empty before recreating it.
- **Copy and UI:** user-facing copy and new screens need the owner's visual approval (E2) before they are routed or added to the locale catalogs.

## 4. How every task was done

1. Start from a green harness.
2. Write a behavioural **RED**: tests that fail on assertions against compile-safe seams (stub routines or services that return wrong but typed values). A missing module or a missing database is not a RED. Record the RED counts.
3. Make it **GREEN**.
4. Run a **mutation check**: copy a guard, mutate it, run the focused tests, restore, and verify checksums. Add a test for every survivor; say when a survivor is equivalent.
5. Run the **full gate**.
6. Add **receipts**: a section in `backend-progress.md` in the existing style. Cover status, migration, routes and contracts, RED→GREEN, mutants, the gate, deviations, SKIPPED items, risks and notes for the integrator. Keep the master plan's migration table current.
7. **Commit locally.** This project's commits end with an attribution trailer for the AI that wrote them.
8. Get an **independent read-only review** of the merged commit. Run it in a separate agent that probes only in a scratch copy (`git archive <sha> | tar -x`), and ask for findings ranked blocker, major, minor, nit, each with evidence.
9. **Fix findings test-first**, then gate, commit and merge.

**Parallel work and integration:**
- Each writer works in its own git worktree, branched from the current integration head.
- One integrator merges with `git merge --no-ff`, resolves conflicts and runs the gate.
  - If the task branch already contains the integration head and the merged tree is byte-identical (`git diff --cached <branch>` is empty), the branch's own gate applies.
- Tell running writers when the integration head moves, so they merge it before their final gate.

**Migration rules:**
- A migration takes the next free number when it is integrated.
- At each merge, update all of these: the file name, the journal (contiguous `idx`, increasing `when`), the prefix list in `apps/api/src/database/migrations.spec.ts`, the master plan's table, and the receipt.
- Undeployed migrations are edited in place. `0009` and `0015` were edited this way, and P2b's paused fixes edit `0016`.
- A merged migration must not recreate a `jobs` policy or routine from an older base. The security kinds stay out of every `gogospend_jobs` policy:
  - `auth0_revoke_grants`
  - `auth0_security_reconcile`
  - `auth0_link_identities`
  - `account_deletion`
- The app-only kinds stay out of the worker insert policy:
  - `sync_snapshot`
  - `export`
  - `import_parse`
  - `import_expire`

**Operational conventions (P6b):**
- **Route gates:**
  - Mutating routes carry `@Gated(...)`, with scopes `writes`, `imports`, `ocr`, `uploads` and `jobs`.
  - `operational-safety.spec.ts` fails until a new mutating route is gated or listed as exempt.
  - `JOB_KIND_GATES` gates worker kinds.
- **Logging:**
  - Logs use `failureName(error)`. Only a `ConfigurationError` prints its message, and `error.message` is never logged.
- **Release graph:**
  - New runtime packages go in `apps/api/release-graph.json`, after the dependency gate.
  - Processes spawned by path, such as P2b's parser children, are release entries of their own.
- **Job release:** `release(lease, reason)` returns a job without spending an attempt.

## 5. Status by task

"Local" means built test-first and passing the full local gate. Hosted, native and device checks are SKIPPED everywhere; the "Still open" column lists the main ones.

| Task | Local | Review | Still open |
| --- | --- | --- | --- |
| F1–F3 | done | done | — |
| F4 | done (server) | done | Native bootstrap spike (E1/E2); the challenge/proof contract stays provisional until then |
| F5 | done | done | Native SDK install; device proofs (E1/E2); login UX approval (E2) |
| F6a | done | done | Tenant/native proof: two-device logout, Apple token revocation (E1/E2) |
| F6b | done | done | Tenant proof (E1). Recovery stays off. |
| F6c | done | done | Tenant proof (E1/E2); joint F6a–F6c security review of that evidence. Linking stays off. |
| M1–M4 | done (server) | done | — |
| M5 | done | done | Device journeys; visual review (E2) |
| P1 | local gate | done | **Hosted R2 gate** (E1). This blocks uploads, S1's storage contract and beta. |
| S1 | done (server) | done | Real R2/Neon (E1) |
| S2 | done | done | Device checks; iOS backup-exclusion native step |
| S3 | done | done | Network-cut against the real API; devices |
| S4 | done | done | Visual approval; devices. Reminder settings and needs-review screens not built. |
| P2a | done | done | Real R2 quarantine (needs P1 hosted) |
| P2b | done | done | **Review fixes paused (WIP).** Includes the Node 24 network blocker. OCR/QR SKIPPED. |
| P2c | done | done | **Review fixes paused (WIP).** Real R2 copy/grant (E1); client UI and copy (E2). |
| P3 | done | **review stopped, rerun** | Screen visual approval (E2); device-backed review draft store; route/locale wiring after approval |
| P4 | done | done | Real R2 (E1); export screen (E2) |
| P5 | done | done, fixes merged | Apple revocation, 24 h deletion, real R2 deletion, independent registry store (E1/E2); privacy screen (E2) |
| P6a | done (local) | done, fixes merged | Hosted PITR/backup RPO/RTO, R2 recovery, hosted registry and inventory (E1) |
| P6b | done (local) | done, fixes merged | Hosted CI, staging performance smoke, devices, hosted receipts, E3/E4, deployment |

## 6. Work queue, in order

Items 1–3 need no provider access. They are independent of each other, but all three touch shared files: `worker.ts`, `privacy-steps.ts`, `operational-safety.spec.ts`, `release.md`. Merge them one at a time and re-gate after each.

### 1. Finish the P2b review fixes

**Branch:** `worktree-agent-a4f763a959b4acb0e`, WIP `adc4bad` + `1edc37a` on `d036e75`.

**Already touched:**
- `parser-runner.ts`, `parsers/sandbox-check.ts` (new), `child-io.ts`, `image.ts`, `table.ts`, `amount.ts`, `date.ts`, `xlsx.ts`, `protocol.ts`, `receipt.ts`;
- `parse-handler.ts`, `preview-query.ts`, `import-parsing.ts`, `jobs/handlers.ts`, `worker.ts`;
- `0016_import_candidates.sql`, contracts `v1/imports.ts`;
- the preview and parser specs, the privacy step specs.

**Do this:**
1. Read the diff.
2. Run the focused specs.
3. Check each finding below against a test that fails without the fix.
4. Finish what's missing.
5. Squash the WIP commits into one `P2b review fixes:` commit.
6. Run the gate and the image smoke, add receipts (`## Review fixes for P2b`), then merge.

**Blocker**
- **B1. On Node 24.22.0 (the image and CI runtime), `--permission` does not restrict sockets.**
  - The parser child can open network connections. Node ≥25 has network permission, and P2b was only proven on 26.
  - **Fix:** fail closed. At worker startup and in `ParserRunner`, run the sandbox probe with the real flags. Don't register or claim `import_parse` unless the child is denied network access, file writes, child processes and workers. Log a fixed redacted line, and throw `ConfigurationError` if the message must stay readable.
  - **Tests** must prove both runtimes without skipping:
    - Node ≥25 denies the network;
    - on Node 24 the runner reports the sandbox as unsupported and the worker doesn't claim parse jobs.
  - **Evidence:** run the parser-runner spec on Node 24.22.0 inside the pinned image `node:24-bookworm-slim@sha256:a5f4366e…` with `docker run --network none`.
  - **Owner decision:** imports only work once the worker runs on Node ≥25 (section 7). Update any doc that claims the child has no network.

**Majors**
- **M1. Duplicate advice in `preview-query.ts` is quadratic.**
  - A 5,000-row file of identical rows, or 5,000 identical existing records, makes the preview hit the 15 s statement timeout (500) every time. One account can also tie up the 10-connection pool.
  - It also happens with *non-identical* rows when planner statistics predate the import. To reproduce:
    1. Parse a small import.
    2. `ANALYZE import_candidates`.
    3. Parse a 5,000-row generic CSV.
    4. GET its preview: 500.
  - **Fix:**
    - Use a window function partitioned by `(occurred_on, type, amount_minor, wallet_label, merchant, note)`, excluding rows with a null date, type or amount. Matches are `(array_remove(array_agg(source_row_id) OVER (… ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING), source_row_id))[1:5]`.
    - For existing records, use `LATERAL … LIMIT 5` backed by an index on `transactions (account_id, occurred_on, type, amount_minor)`, added in `0016`.
    - Keep P2c's `summary.image.attachment_id` and `attachable_until`.
  - **Test:** both the identical-rows case and the stale-statistics case return 200 well within budget, with at most 5 matches per row.
- **M2. Layout inference in `table.ts` guesses day/month order and direction.**
  - A `category` column alone makes a file "Spendee", so its dates are read day-first.
  - `account` + `currency` + `category` makes it "Money Lover", which is a signed layout, so an unsigned positive amount becomes income.
  - **Fix:** match legacy layouts by their exact header sets. Never apply day-first or sign-as-direction to an inferred or generic layout.
  - **Tests:**
    - `Date,Category,Amount,Wallet,Type` with `03/04/2026` gives `ambiguous_date`.
    - `Date,Account,Currency,Category,Amount` with `250.00` gives `missing_type`.
- **M3. A WebP inside the limits exceeds the 512 MiB budget.**
  - Measured peaks: noisy 20 MP about 730 MiB; noisy 12 MP 516 MiB.
  - WebP effort 4 peaks at 627 MiB. Effort 0–2, or JPEG output, stays near 419 MiB.
  - The budget is only checked after the fact.
  - **Fix:**
    - Lower the effort or the pixel cap.
    - Use `sharp.concurrency(1)` and `sharp.cache(false)` in the child.
    - Add a hard per-child memory limit if one can be had portably; otherwise document why not.
  - **Test:** a 5000×4000 noisy WebP stays under budget with stated worker headroom, or is clearly refused. Record JPEG, PNG and WebP peaks.
- **M4. The 7-day preview expiry has no backstop.**
  - A disabled account at the due time, or three transient failures of the single expiry job, leaves candidates forever. The route still serves `ready` past `expires_at`.
  - **Fix:**
    - Add a retention step in `defaultPrivacySteps()` that expires every preview past `expires_at`, whatever the account's status. Use a SECURITY DEFINER routine granted to `gogospend_jobs`, with SKIP LOCKED and batching.
    - The route treats a past `expires_at` as expired.

**Minors**
1. **Repeated sheet entries:** repeated `<sheet r:id="rId1"/>` entries re-inflate the same part, so a 29 KB workbook pins the parser for 30 s. Reject repeated relIds or targets, and cap the sheet count.
2. **Sign in generic layouts:** a negative amount becomes `expense` in the generic layout. The sign may give direction only in signed layouts.
3. **Amount separators** are judged per row (`"12,50"` is ambiguous, but `"1,500"` is accepted in the same file). Detect the convention per file, as dates do.
4. **Retention side effect to verify:** the P5 fixes' `imports.uploads` retention step now removes old upload rows and, by cascade, expired previews. Check that P5's 30-day prune of the parse job doesn't make P2a's maintenance flip a parsed upload to `expired`.
5. **Preview size:** a 5,000-row preview is a 12.6 MB response, recomputed on every GET. Keep the response shape, because P3 reads it. Optional paging must be additive.
6. **Image child read roots** include any `node_modules` that contains `detect-libc`. Narrow them to the resolved sharp, `@img/*`, detect-libc and semver directories. The image smoke must still parse a PNG.

**Nits:**
- unchecked times inside day/month dates (`99:99`, `:61`);
- `expense` with `+50.00` isn't a conflict, while `income` with a negative amount is;
- external relationships in worksheet `_rels`, and embedded OLE objects, are accepted;
- the parent trusts the child's image size, row shape and memory report, doesn't check issue codes against the known list, and doesn't re-check metadata stripping;
- a failed `spawn` is a permanent `parse_failed`, not a retry;
- no `sharp.block()` restricts libvips to the JPEG, PNG and WebP loaders;
- preview totals include `excluded_in_source` rows;
- a Latin-1 CSV decoded as Windows-874 gets no per-row review flag.

**Also in this area:**
- **Optional:** the parse handler can call `release(lease, 'ocr_paused')` for image formats while `ocr` is paused, which gives a narrower pause. Today pausing `ocr` stops only new image uploads (see `incident.md`).
- **Log line clash:** the P2a info line `job worker: import maintenance failed N stale upload(s) …` matches the `import maintenance failed` alert prefix. Reword it.

### 2. Finish the P2c review fixes

**Branch:** `worktree-agent-a17fd82c4e2f7c6e0`, WIP `9614abe` on `d036e75`.

**Already touched:**
- `storage/object-store.ts`, `s3-object-store.ts` (server-side copy work);
- `attachments/attachment-limits.ts` and `receipt-cleanup.ts` (both new), `attachments.module.ts`;
- `sync/snapshot-grants.ts`;
- the attachments spec.

**To finish:** same procedure as item 1, ending with a `P2c review fixes:` commit.
- P3's confirm calls `AttachmentService.prepare/attachIn/release`, so keep its tests green.
- `0017_attachments.sql` may be edited in place.

**Majors**
- **M1. The copy holds the whole image in API memory twice, with no per-process limit, and the 4-in-flight account limit isn't enforced under concurrency.**
  - **Where:**
    - `s3-object-store.ts` `collectBody` and `new Uint8Array(body)`;
    - the reservation count in `0017`, read without a lock.
  - **Measured:** 10 concurrent 12 MiB copies peaked at 241 MiB; 12 copies in flight across 3 accounts; 12 of 12 reservations from one account.
  - **Fix:**
    - Prefer a server-side copy: add `ObjectStore.copy`, implemented with `CopyObjectCommand` and metadata directive COPY, followed by a HEAD that verifies size and digest. Keep registry-before-copy and fencing.
    - Add a process-wide semaphore that answers 503 with `retry_after` *before* reserving.
    - Lock inside `gogospend_reserve_receipt_copy`.
    - Remove the double buffering.
- **M2. Every refused retain or replace still copies the full image.** Six 422s produced six PUTs.
  - **Fix:**
    - In `prepare`, mirror the command's state checks (already holds a receipt, no-op replace, schema, consent) before copying.
    - Reuse an in-flight reservation for the same `attachment_id`.
    - Add a per-account copy budget.
- **M3. One account can occupy every download slot.** There are 8 per process, so a victim gets 503.
  - **Fix:** add a per-account cap (for example 2) on top of the global cap, plus idle and total response time limits.

**Minors**
1. **Downloads use Nest's default `StreamableFile` errors:**
   - a corrupted object is served as a complete 200, because the digest is checked after the last byte;
   - a pre-first-byte failure returns 400 with the raw `err.message` as `image/jpeg`;
   - unavailable storage gives 500, not 503.

   **Fix:**
   - hold back the final chunk until the digest matches;
   - send an `ApiProblem` 503 before headers, and `res.destroy()` after;
   - never send `err.message`.
2. **Grant binding:** a grant is bound to the account, not the session. Add the binding id and session generation to the MAC context. S1 snapshot grants share `snapshot-grants.ts`; change those only with tests.
3. **Orphan sweep cost:** it lists all of `receipt/` every 15 minutes, and the cost grows forever. Exclude `receipt/` from the global listing, sweep only accounts with recent reservations, and stream listing pages.
4. **No overdue alert:** add an "overdue for deletion" alert for released receipts. Use one small `try` block in `worker.ts`.
5. **One copy deadline:** GET, PUT and HEAD can together exceed 60 s. Use one deadline for the whole copy.
6. **Cross-owner tests:** pin them for replace and remove. They already pass.

**Nits:**
- the SQL size and digest check is circular, because `prepare` passes registry values instead of measured ones;
- `ATTACHMENT_GRANT_MINUTES` is unused;
- the 429 says 60 s while abandoned reservations block for up to 10 minutes;
- pausing `uploads` or `imports` doesn't stop API copies; consider `@Gated('imports','writes')`;
- a receipt held only by a deleted record can be re-attached by its id;
- the `remove_no_undo` copy requirement says "permanently" while shared and recovery copies outlive removal;
- `0017` lacks the long-lock note that `release.md` asks for;
- `0017` recreates P1's CHECK validated instead of `NOT VALID` + `VALIDATE`.

### 3. Run the P3 review, then fix its findings

Review `git diff e14669f 9e1a857` read-only, in a scratch copy. Focus:
1. **Review focus 3 (overlapping retries after some rows commit):**
   - durable progress, unique on `(job_id, source_row_id)`;
   - a kill after commit and before the response, then a retry with the same key and body;
   - two devices confirming at once;
   - freeze and confirm racing;
   - the pinned `second_batch_uses_same_frozen_selection`.
2. **Frozen selection:**
   - idempotent and non-financial;
   - the common review revision;
   - caps: 5,000 per selection and 500 per batch;
   - no rows outside the set and no field changes;
   - expired previews refused.
3. **Money and mapping:**
   - M3 validation under the account lock;
   - only owned, active wallets and categories;
   - transfers refused;
   - exact totals;
   - nothing guessed.
4. **Ownership and leaks:**
   - identical 404s;
   - SECURITY DEFINER routines (`search_path`, PUBLIC revoked, owner checks);
   - no raw candidate fields in receipts, sync or logs.
5. **The P2c receipt hook:**
   - consent required;
   - only this import's own image;
   - atomic with the record insert;
   - no copy leaks on refusal, crash or retry.
6. **Sync and compatibility:**
   - new synced types `import_review` and `import_selection`;
   - older clients and the rollback-floor claim;
   - a 30-day compact-record purge versus 7-day frozen data.
7. **Gating:**
   - `@Gated('imports')` on patches and freeze, `@Gated('imports','writes')` on confirm;
   - release graph, redaction, and P5 registration.
8. **Client** (`apps/app/src/spend/v1/{imports,importReview}.ts`, `ImportReviewScreen.tsx`, raw-body uploads in `apps/app/src/api/client.ts`):
   - explicit review of every field;
   - drafts kept until the outcome is known;
   - `COMMAND_TOO_LARGE` handling versus unknown outcomes;
   - the transport not weakened (refresh, account switch, timeouts);
   - the screen not routed and locale catalogs untouched.

### 4. Smaller follow-ups (local)

- **Rollback floor:** raise it and the minimum client versions at the import release step. New synced types and `attachment_id` in record snapshots are rejected by older apps and APIs (`rollback.md`).
- **P3 drafts:** a device-backed store for the review draft, which is in memory today.
- **S4 screens:** the reminder settings and needs-review screens, once visuals are approved.
- **S2:** the iOS backup-exclusion native step.
- **OCR:** if wanted, pin its model assets and checksums at build time.
- **Dev database:** recreate the local `gogospend_v1` before the next `dev:v1`, because migrations it may already have applied (for example `0009` and `0015`) changed in place, and the journal check will refuse it. Confirm it holds no data first.
- **Image cleanup:** the local image `gogospend-local-integration` was built for the P6b merge check and can be removed.

### 5. After items 1–3: push and PR (only when the owner asks)

Push the integration branch and open a PR against `main`. It will carry every commit since `ccd3fb0`.

## 7. Decisions waiting for the owner

1. **Worker runtime ≥ Node 25 (recommended: 26).** Without it, the parser child can't be denied network access, and imports must fail closed. This changes the Docker base image and CI's Node version (a new digest pin).
2. **Lockfile regeneration with Linux native bindings** (`@swc/core`, `unrs-resolver`, `sharp`). Until it happens, Linux builds and hosted CI rely on `scripts/ci/linux-native-bindings.mjs`.
3. **Pushing** the local commits (integration branch and any task branches), and the next PR.
4. **Recreating `gogospend_v1`** (local dev data, if any).
5. **E1–E4 authority** (next section) for every hosted, native and release step.
6. **Visual approvals** (E2): M5 states, the S4 banner, sign-out confirmation, F5 login UX, the P4 export screen, the P5 privacy and deletion screen, the P3 import review and progress screens, receipt copy (P2c), and the S4 settings and needs-review screens.

## 8. Waiting for authority

Gates are defined in the [master plan](../superpowers/plans/2026-10-17-gogospend-backend.md#authority-secrets-and-rollout-gates).

| Gate | Needed for |
| --- | --- |
| **E1: hosted test resources.** A non-production Auth0 tenant with native client and connections; a Neon project and roles; R2 test scopes; a staging target. | <ul><li>F4 native spike</li><li>F5/F6a/F6b/F6c tenant proofs</li><li>P1 hosted R2 gate (`npm run test:storage-contract`), which unblocks P2a uploads, S1, P4, P2c, P5 deletion and P6a recovery</li><li>P6a measured PITR and backup restore</li><li>P6b staging performance smoke</li></ul> |
| **E2: product and devices.** iOS bundle id, callback domain, Apple and Google config, iOS/Android development builds, visual approvals. | Every device journey (F5, M5, S2–S4, P3); the approvals in section 7 |
| **E3: release.** | P6b's release package; production secrets by name and role; alert routing; budget alerts at 50/80/100% of US$100; log retention; deployment. `/ready` stays failing until hosted receipts exist. Deploy health uses `/live`, and receipts are enforced by the release preflight (`scripts/ops/readiness-receipts.mjs --min-valid-days 7`). |
| **E4: Git delivery.** | Every push and PR. Hosted CI first runs once `.github/workflows/backend.yml` is on GitHub. |

Beta needs every privacy and restore gate to pass, including a passing P6a restore rehearsal. Imports stay off until P1's hosted gate, P2a's hosted check, the parser dependency/security gate, the P2b/P2c/P3 review fixes and the Node runtime decision are all done.
