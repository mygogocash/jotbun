# Backend handover — 18 October 2026

This page lets another engineer or AI agent continue the GoGoSpend v1 backend and app work without the earlier conversation. Read it first, then the documents it links. Per-task evidence (RED, GREEN, gates, mutants, deviations) lives in [backend-progress.md](backend-progress.md). This page summarises it and lists what is left.

**Development resumed (owner: 18 October 2026).** Local queue items 1–3 are done. Next steps need owner decisions (Node runtime, push/PR, E1–E4).

## 1. Where things are

| Item | State |
| --- | --- |
| Integration branch | `claude/gogospend-backend-plan-review-3c7544`; last code commit `d16c528` (the docs commit after it ends the branch; use `git log`) |
| On GitHub | PR [mygogocash/gogospend#1](https://github.com/mygogocash/gogospend/pull/1) was merged into `main` at `ccd3fb0` / merge commit `afd5dff`. **Every later commit is local only**, on the owner's machine, until someone pushes it. |
| Phases built and merged locally | F1–F6c, M1–M5, S1–S4, P1, P2a, P2b (+ review fixes), P2c (+ review fixes), P3 (+ review fixes), P4, P5, P6a, P6b (local parts) |
| Migrations | `apps/api/drizzle/0001`–`0018`; **next free number: `0019`**. None has been applied to a deployed database. In-place edits this session: `0016`, `0017`, `0018`. |
| Last full gate (at `d16c528`) | typecheck, typecheck:app, test:api 928, test:db 676, test:app 28, test:unit 257, test:dev 7, test:ops 107 (`GOGOSPEND_OPS_REQUIRE_DB=1`), test:render 66, build, release-graph check (145 files), export:web, `git diff --check`: all PASS. |
| Image smoke | On Node 26.9.0 (owner decision §7.1, 19 October 2026): `ok: true`, and both parser children parse inside the sandbox (`csv: parsed`, `png: parsed`). arm64 only; x64 not run. Re-run after worker, parser or package changes. |
| Never done | No provider resource, credential or paid service used. Nothing deployed. Hosted CI never ran. Every hosted, native and device check is recorded SKIPPED. |
| Flags that stay off | Uploads (`IMPORT_UPLOADS_ENABLED`); account linking; password-reset recovery; the import review screen is not routed. |

**Finished this session (local only):**

| Work | Commit | Notes |
| --- | --- | --- |
| P2b review fixes | `fdf92ce` → merge `4d53ef3` | Fail-closed sandbox on Node 24; linear duplicate advice; exact legacy headers; WebP memory; preview expiry backstop |
| P3 confirmation timeout | `9606a3c` | 120 s bound on the 5,000-row second-batch test (was flaking at 30 s under load) |
| P2c review fixes | `857bc47` → merge `7930d12` | Store-level copy; bounded copies/downloads; session-bound grants; overdue alert |
| P3 review + fixes | `6367a9e` | Independent review re-run; skip unknown sync entities; re-freeze skips committed rows; prune starvation |
| Local follow-ups | `001ef70`, `28b520f`, `d16c528` | Receipt pre-checks before the copy; `ocr_paused` release; device import draft store (see [backend-progress.md](backend-progress.md#local-follow-ups-after-the-p2b-p2c-p3-review-fixes)) |

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
  - Local: Node 26.10.0 (`.nvmrc` says 26).
  - Release image and CI: Node 26.9.0, pinned by digest (owner decision §7.1). The parser children are denied the network, so imports can read files; they stay off until the rest of the import gates (section 8).
  - **E1 run-sheet:** [beta-receipts.md](beta-receipts.md) lists each hosted check with its exact command. Every one is SKIPPED until E1 exists.
  - Run `npm ci` in every new worktree.
- **Local database:**
  - PostgreSQL 17 in Docker, container `gogospend-postgres-v1-local` on 127.0.0.1:55432, from `compose.postgres.yml`. `npm run db:v1:up` starts the container only.
  - Each test run creates and drops its own `gogospend_test_*` database.
  - `npm run dev:v1` also migrates the `gogospend_v1` dev database, so don't run it casually (see section 6). Recreate it before the next `dev:v1` if it has applied `0009`/`0015`/`0016`/`0017`/`0018` (edited in place).

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
node apps/api/scripts/parser-sandbox-check.cjs
npm run export:web -w gogospend-app -- --max-workers 2
git diff --check
```

**Release image check**, after changes to workers, parsers or packages:
```bash
docker build -f apps/api/Dockerfile -t gogospend-local-check .
docker run --rm gogospend-local-check node scripts/release-smoke.cjs
```
The smoke requires Node 26 or later (owner decision §7.1) and expects both parser outcomes `parsed`. `parser-sandbox-check.cjs` runs the same self-check from `dist` on the host, in the gate and in CI.

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
- Undeployed migrations are edited in place. `0009`, `0015`, `0016`, `0017` and `0018` were edited this way.
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
| P2b | done | **fixes merged** | Node 26 runtime **done** (owner §7.1, image smoke parses both kinds). OCR/QR SKIPPED. Optional: preview paging; `ocr_paused` release |
| P2c | done | **fixes merged** | Real R2 CopyObject/`if-none-match` (E1); client UI and copy (E2). Optional: `remove_no_undo` wording; re-attach-by-id during undo window |
| P3 | done | **fixes merged** | Screen visual approval (E2); device-backed review draft store; route/locale wiring after approval; raise client floor at import release; optional: post-prune replay shape; receipt-before-batch reorder |
| P4 | done | done | Real R2 (E1); export screen (E2) |
| P5 | done | done, fixes merged | Apple revocation, 24 h deletion, real R2 deletion, independent registry store (E1/E2); privacy screen (E2) |
| P6a | done (local) | done, fixes merged | Hosted PITR/backup RPO/RTO, R2 recovery, hosted registry and inventory (E1) |
| P6b | done (local) | done, fixes merged | Hosted CI, staging performance smoke, devices, hosted receipts, E3/E4, deployment |

## 6. Work queue, in order

Local items 1–3 from the prior handover are **done**, and so are the follow-ups marked below. What remains:

### 1. Smaller follow-ups (local; no provider)

- ~~**Rollback floor / client versions:** raise them at the import release step~~ **Checklist written** ([`rollback.md`, Import release checklist](../operations/rollback.md#import-release-checklist)): preconditions, `MIN_CLIENT_VERSION_IOS`/`_ANDROID` to the first build with the unknown-entity skip plus the `attachment_id` validators, the rollback floor past P2c/P3 (`0017`, `0018`), then `IMPORT_UPLOADS_ENABLED`. **Not executed:** the env values are still `1.0.0` and uploads are still off; that happens only at the import release.
- ~~**P3 drafts:** a device-backed store for the review draft~~ **Done locally** (`d16c528`): `importDraftStore.ts` / `deviceImportDraftStore.ts`, erased with the diary at explicit sign-out. Since decision 7 (below) the draft lives in the encrypted diary, not AsyncStorage.
- **S4 screens:** reminder settings and needs-review, once visuals are approved.
- **S2:** iOS backup-exclusion native step. Still open (needs authorization for a config plugin or package); a `TODO(S2)` marks the seam in `storage/deviceDiary.ts`.
- **OCR:** if wanted, pin model assets and checksums at build time (needs dependencies).
- ~~**Dev database:** recreate local `gogospend_v1` before the next `dev:v1`~~ **Done:** confirmed 0 accounts, 0 transactions and 0 wallets, then dropped and recreated the empty database. Every `gogospend_test_*` database was left alone. The next `dev:v1` applies the current migrations (including the in-place edits of `0009` and `0015`–`0018`).
- ~~**Image cleanup**~~ **Done:** removed local images `gogospend-local-integration` and `gogospend-local`. The unrelated `ghcr.io/mygogocash/gogocash-app-web` image was left in place.
- **Optional P3 leftovers:** post-prune confirmation replay shape (open; owner decision). ~~Move receipt `prepare` after batch pre-checks~~ **Done locally** (`001ef70`).
- **Optional P2b leftovers:** ~~additive preview paging~~ **Done locally:** `GET /v1/imports/:id/preview?offset=&limit=` (limit 1-500, offset 0-5,000; either alone is enough) pages `candidates` only and adds `page: { offset, limit, total, next_offset }` to a ready preview; `summary`, `issues` and `review_revision` stay whole-file; `duplicate_advice` covers the page's rows. No parameters is today's whole response, with no `page` key. The app has `preview(jobId, paging?)` and `fetchWholePreview` (no screen uses them yet). ~~`release(lease, 'ocr_paused')` for a narrower OCR pause~~ **Done locally** (`28b520f`; `release` takes a bounded delay so a paused gate does not spin).
- ~~**Stale `release.md` file count**~~ **Done:** `release.md` says 145, matching the graph check.
- ~~**Release image smoke**~~ **Done** on the paging follow-up tree: `ok: true` on Node 24.22.0 with parsers `sandbox_unsupported`. **Re-run on Node 26.9.0** (19 October 2026): `ok: true`, `csv` and `png` both `parsed`, after the image child was allowed the missing `package.json` files Node reads on its way to sharp's hoisted dependencies. The check image was removed. Re-run again only if workers, parsers or packages change.

### 2. Push and PR (only when the owner asks)

Push the integration branch and open a PR against `main`. It will carry every commit since `ccd3fb0` / `afd5dff`.

### 3. After push (or instead): E1 critical path

Beta stays blocked without hosted evidence. The next product-critical gate is **E1**, especially **P1's hosted R2 contract**, which unblocks uploads, S1, P2a, P2c, P4, P5 deletion and P6a recovery.

## 7. Decisions waiting for the owner

1. ~~**Worker runtime ≥ Node 25 (recommended: 26).**~~ **Decided 19 October 2026: Node 26, done locally.** The Docker base image is `node:26.9.0-bookworm-slim` pinned by its index digest (built 19 September, past the dependency-age wait); CI and `.nvmrc` follow, and a test keeps the three in step. The image smoke parses both kinds.
2. ~~**Lockfile regeneration with Linux native bindings**~~ **Decided 19 October 2026: done locally.** The lockfile pins the Linux glibc x64/arm64 bindings of `@swc/core`, `unrs-resolver` and `sharp` (eight entries, integrity included, nothing else changed). `npm ci` installs them in the Docker build and CI, and the helper script is removed.
3. **Pushing** the local commits (integration branch and any task branches), and the next PR.
4. ~~**Recreating `gogospend_v1`**~~ **Done** (empty: 0 accounts, 0 transactions, 0 wallets). The next `dev:v1` applies the current migrations.
5. **E1–E4 authority** (next section) for every hosted, native and release step.
6. **Visual approvals** (E2): M5 states, the S4 banner, sign-out confirmation, F5 login UX, the P4 export screen, the P5 privacy and deletion screen, the P3 import review and progress screens, receipt copy (P2c), and the S4 settings and needs-review screens.
7. ~~**Import draft at rest.**~~ **Decided 19 October 2026: the draft moves into the encrypted diary (done locally).**
   - Diary migration 2 adds an `import_drafts` table. The import screen takes the open diary's draft store (`spendDiary.importDraftStore()`); nothing is written to AsyncStorage any more.
   - With no diary open (the web, or a locked diary), the import is kept in memory for this visit only, and the screen says so.
   - A plain-text draft left by an older build is erased before the diary draft's first use, and again at the sign-out erase.
   - Like the rest of the diary, the file is still not backup-excluded until S2's native step; its key never leaves the device.

## 8. Waiting for authority

Gates are defined in the [master plan](../superpowers/plans/2026-10-17-gogospend-backend.md#authority-secrets-and-rollout-gates).

| Gate | Needed for |
| --- | --- |
| **E1: hosted test resources.** A non-production Auth0 tenant with native client and connections; a Neon project and roles; R2 test scopes; a staging target. | <ul><li>F4 native spike</li><li>F5/F6a/F6b/F6c tenant proofs</li><li>P1 hosted R2 gate (`npm run test:storage-contract`), which unblocks P2a uploads, S1, P4, P2c, P5 deletion and P6a recovery</li><li>P6a measured PITR and backup restore</li><li>P6b staging performance smoke</li></ul> |
| **E2: product and devices.** iOS bundle id, callback domain, Apple and Google config, iOS/Android development builds, visual approvals. | Every device journey (F5, M5, S2–S4, P3); the approvals in section 7 |
| **E3: release.** | P6b's release package; production secrets by name and role; alert routing; budget alerts at 50/80/100% of US$100; log retention; deployment. `/ready` stays failing until hosted receipts exist. Deploy health uses `/live`, and receipts are enforced by the release preflight (`scripts/ops/readiness-receipts.mjs --min-valid-days 7`). |
| **E4: Git delivery.** | Every push and PR. Hosted CI first runs once `.github/workflows/backend.yml` is on GitHub. |

Beta needs every privacy and restore gate to pass, including a passing P6a restore rehearsal. Imports stay off until P1's hosted gate, P2a's hosted check, the parser dependency/security gate, the P2b/P2c/P3 review fixes (**done locally**) and the Node runtime (**Node 26, done locally**) are all done.
