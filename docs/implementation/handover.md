# Backend handover — 18 October 2026

What is left of the [backend plan](../superpowers/plans/2026-10-17-gogospend-backend.md), and how to carry it on. Per-task evidence (RED, GREEN, gates, mutants, deviations) is in [backend-progress.md](backend-progress.md); this page only points at it.

## Where things are

- **Integration branch:** `claude/gogospend-backend-plan-review-3c7544`, open as [mygogocash/gogospend#1](https://github.com/mygogocash/gogospend/pull/1) against `main` (head `ccd3fb0` at the time of writing). It holds the local work for F1–F6c, M1–M5, S1–S4, P1, P2a, P2b, P4, P5 and P6a. Every one of those except P2b has also been independently reviewed and has its review fixes merged.
- **Migrations:** `apps/api/drizzle/0001`–`0016`. **The next free number is `0017`.** None has been applied to a deployed database.
- **Two finished branches that are not merged yet.** Both exist only in the local repository on the original machine, as sub-agent worktree branches, and have not been pushed:

  | Work | Commit | Branch | Built on |
  | --- | --- | --- | --- |
  | P5 review fixes | `da9640d` | `worktree-agent-ae9fac06f573ea708` | `c68f1c0` |
  | P6b release package (local part, not yet reviewed) | `51cf41c` | `worktree-agent-ac267e65c99020b28` | `7646c43` |

- **Never done anywhere:**
  - no provider resource, credential or paid service was used;
  - nothing was deployed;
  - hosted CI has never run, because `main` has no workflow (P6b adds one).

  Every hosted, native and device check is recorded as SKIPPED, not passed.
- **Flags that must stay off:**
  - Uploads: `IMPORT_UPLOADS_ENABLED`, off by default, so the route answers 404.
  - Account linking: must not be offered to users.
  - Password-reset recovery: must not be enabled for users.

  Each stays off until its gates below pass.

## Status by task

"Local" means built test-first and passing the full local gate. "Hosted" covers the real Auth0, Neon, R2 and staging checks and the device checks; all of those were SKIPPED.

| Task | Local | Review | Still open |
| --- | --- | --- | --- |
| F1–F3 | done | done | — |
| F4 | done (server) | done | Native bootstrap spike (E1/E2). The challenge/proof contract stays provisional until it passes or the founder decides. |
| F5 | done | done | Native SDK install; PKCE/logout/refresh/cold start on devices (E1/E2); login UX approval (E2) |
| F6a | done | done | Tenant/native proof: two-device logout, Apple token revocation (E1/E2) |
| F6b | done | done | Tenant proof: Post Change Password Action delay, reconciliation bound (E1). Recovery stays off. |
| F6c | done | done | Tenant proof: Apple → email link (E1/E2); joint F6a–F6c security review of that evidence. Linking stays off. |
| M1–M4 | done (server) | done | — |
| M5 | done | done | Device journeys; visual review of the new states (E2) |
| P1 | local gate done | done | **Hosted R2 gate** (E1). This blocks uploads, S1's storage contract, and beta. |
| S1 | done (server) | done | Real R2/Neon grants and expiry (E1) |
| S2 | done | done | Encryption at rest, kill/restart, key invalidation on devices; iOS backup exclusion needs a native step |
| S3 | done | done | Network cut against the real API, then restart; device checks |
| S4 | done | done | Visual approval (E2); device and notification checks. The reminder settings and needs-review screens are not built (they wait for visuals). |
| P2a | done | done | Real R2 quarantine upload, stall and expiry (needs P1's hosted gate) |
| **P2b** | done, merged in `ccd3fb0` | **not reviewed** | OCR and QR SKIPPED (no pinned model assets); container memory limit and sharp on Linux (P6b); the client review UI is P3 |
| **P2c** | **not started** | — | Everything |
| **P3** | **not started** | — | Everything |
| P4 | done | done | Real R2 delivery (E1); the export screen and copy (E2) |
| P5 | done | done; **fixes unmerged** (`da9640d`) | Apple revocation, 24-hour deletion, real R2 deletion, an independent registry store and its key custody (E1/E2); the privacy screen (E2) |
| P6a | done (local part) | done | Hosted PITR/backup with measured RPO/RTO, the R2 recovery scope, hosted registry and inventory sources (E1); the real attachment-reference query (needs P2c) |
| **P6b** | done on its branch | **not reviewed, unmerged** (`51cf41c`) | Hosted CI, staging performance smoke, device journeys, hosted receipts, E3/E4 approvals, deployment |

## Remaining work, in order

Steps 1–6 need no provider access and can be done locally now. Steps 1, 2 and 3 are independent of each other. Steps 4 and 5 are sequential: P3 needs P2c. Everything after that waits for authority (next section).

### 1. Review P2b

Launch an independent, read-only review of P2b as merged, comparing `c68f1c0` with `ccd3fb0`. Probe the plan's review focus 2: a formula or zip bomb, or an image, overwhelming parser resources. Also check:
- the child-process restrictions;
- exact money and date parsing;
- the pinned test `parsing_has_no_financial_side_effect`.

Known gaps to confirm or fix:
- A preview expiry job for an account at a newer lifecycle generation ends `superseded`. P2a's maintenance pass doesn't know P2b's tables, so that account's candidates stay until the account is deleted.
- `import_uploads` rows lose their file names after 8 days but have no retention step of their own.
- `GET /v1/imports/:id/preview` returns all ≤5,000 candidates in one response (no paging).

Fix any findings test-first, then gate and commit.

### 2. Merge the P5 review fixes (`da9640d`)

- Conflicts expected:
  - `apps/api/src/database/schema.ts`: keep P5's deletion tables and P2b's `importPreviews` and `importCandidates`.
  - The progress log.
- The fixes edit `0015_privacy.sql` in place, which is allowed because it is undeployed. They replace `gogospend_record_snapshot` and `gogospend_apply_credential_change`. Check that no later migration (`0016`) redefines either one from an older base.
- Follow-up from its review: `PUBLICATION_PURPOSES` does not list `import_quarantine`, so the erasure orphan listing misses that prefix. Registered objects are still deleted. Add it; P2b already added `import_image`.
- Run the full gate, then commit.

### 3. Merge P6b (`51cf41c`), then review it

A trial merge onto `ccd3fb0` conflicts in `imports.controller.ts`, `package.json` and the progress log. Its "For the integrator" notes in the receipt still apply:
- **`worker.ts`** (auto-merges, but needs edits):
  - Keep P2a's maintenance pass and quarantine-overdue alarm, and P2b's handler wiring.
  - Wrap each catch with `failureName`.
  - Replace the trailing `main().catch(… error.message …)` with `runMain`.
  - `operational-safety.spec.ts` fails while any release entry still logs `error.message`.
- **`imports.controller.ts`:** put the OCR gate check inside P2a's try, after the enabled check. Keep `@Gated('uploads', 'imports')`.
- **`v1-app.module.ts`:** P2a's `V1_REQUEST_TIMEOUT_MS` and P6b's `HTTP_TIMEOUTS.requestMs` are both 540 s; keep one owner.
- **`package.json` `test:ops`:** P6a's `local-rehearsal.test.mjs` plus P6b's three new test files.
- **`upload-intake.ts`:** keep `releaseFlagFromEnv`.
- **Gating P2b:**
  - P2b added only a GET route, which is exempt.
  - `import_parse` is already gated by `imports` in `JOB_KIND_GATES`.
  - **Decide** whether image parsing should also need `ocr`. P2b reuses `import_parse` for images and does no OCR yet.
- **Release graph:** check that P2b's child entries (`parsers/table-child.ts`, `parsers/image-child.ts`) and `sharp` fit `apps/api/release-graph.json`. P6b currently forbids `sharp` in the release closure, but the worker needs it for images. Either the worker gets its own graph or the allow-list changes.

Run the full gate plus the release-graph check, commit, then launch an independent P6b review.

### 4. Build P2c: receipt attachments (migration `0017_attachments`)

Plan: [P2c](../superpowers/plans/2026-10-17-gogospend-04-jobs-privacy-release.md#task-p2c-retain-receipt-attachments-with-versioned-ownership). The pinned test is `foreign_attachment_grant_is_denied` (a foreign grant returns 404).

Inputs from earlier tasks:
- **The sanitized image** is at `import_image/<account>/<import>/<lease>/image.<jpg|png|webp>`. It is published for 24 hours, and `import_previews` holds its key and dimensions. Retaining it must re-register or copy it before that deadline. Only an `import_parse` lease can reserve the `import_image` purpose, so retention needs its own purpose.
- **The 7-day preview expiry** also makes unattached `import_image` rows due. A retained receipt must survive that.
- **P6a:** replace `rehearsal_attachment_refs` in the restore rehearsal with the real attachment-reference query.
- **P5:** register attachment retention and erasure in `defaultPrivacySteps()` (`apps/api/src/privacy/privacy-steps.ts`) and add the new tables to `ERASURE_HANDLED_TABLES`.
- **P6b:** `@Gated('writes')` on retain, replace and remove. The grant GET is exempt.
- **Client copy** must say that removing a receipt cannot be undone.

### 5. Build P3: import confirmation and client review (migration `0018_import_confirmation`)

Plan: [P3](../superpowers/plans/2026-10-17-gogospend-04-jobs-privacy-release.md#task-p3-implement-resumable-import-confirmation-and-client-review). The pinned test is `second_batch_uses_same_frozen_selection`. It covers review focus 3: an overlapping retry after some rows committed.

Inputs:
- **Candidates** are keyed `(job_id, source_row_id)` and carry an `ordinal`; `review_revision` starts at 1.
- **The app login has only SELECT** on `import_previews` and `import_candidates`. Row patches and the freeze need P3's own SQL routines.
- **Wallet and category are the file's labels.** P3 maps them to ids, and `review_required = false` still needs that mapping. An expired preview has no candidates.
- **Retained receipts** link through P2c's ownership and version rules, in the same transaction that creates the confirmed rows.
- **P6b:** `@Gated('imports')` on row patches and freeze; `@Gated('imports', 'writes')` on confirm.
- **P5:** register selection and progress retention and erasure steps.
- **The client** (`apps/app/src/spend/v1/{imports,importReview}.ts`, `ImportReviewScreen.tsx`):
  - Build the adapter and its tests now.
  - The screen and its copy need E2 visual approval before release.
  - The import flag stays off until the dependency, worker, storage and confirmation gates all pass.

### 6. Smaller follow-ups

- Regenerate `package-lock.json` with Linux native bindings (`@swc/core`, `unrs-resolver`, `sharp`). This is a dependency change, so it **needs authorization**. Until then, hosted CI and Linux builds rely on P6b's `scripts/ci/linux-native-bindings.mjs` workaround.
- S4: the reminder settings screen and the needs-review screen, once their visuals are approved.
- S2: the iOS backup-exclusion native step.
- If OCR is wanted, pin its model assets and checksums at build time (no runtime download).
- Raise the rollback floor in `docs/operations/rollback.md` (from P6b) whenever a new entity type or state joins sync.

## Waiting for authority

None of this can be done or claimed from local work. Gates are defined in the [master plan](../superpowers/plans/2026-10-17-gogospend-backend.md#authority-secrets-and-rollout-gates).

| Gate | Needed for |
| --- | --- |
| **E1: hosted test resources** (non-production Auth0 tenant with native client and connections, Neon project and roles, R2 test scopes, a staging target) | <ul><li>F4 native spike</li><li>F5, F6a, F6b, F6c tenant proofs</li><li>P1's hosted R2 gate (`npm run test:storage-contract`), which unblocks P2a uploads, S1, P4, P2c, P5 deletion and P6a recovery</li><li>P6a measured PITR and backup restore</li><li>P6b staging performance smoke</li></ul> |
| **E2: product and devices** (iOS bundle id, callback domain, Apple/Google config, iOS/Android development builds, visual approvals) | <ul><li>Every device journey (F5, M5, S2–S4)</li><li>Visual approval of: the M5 states, the S4 banner and pending lines, sign-out confirmation, F5 login UX, the P4 export screen, the P5 privacy and deletion screen, the P3 import review and progress screens, and the S4 settings and needs-review screens</li></ul> |
| **E3: release** | The release package (P6b), production secrets by name and role, alert routing, provider budget alerts at 50/80/100% of US$100, log retention, deployment |
| **E4: Git delivery** | Merging PR #1 and any later push or PR. Hosted CI first runs once P6b's workflow is on GitHub. |

Beta needs every privacy and restore gate to pass, including a passing P6a restore rehearsal. P6b's `/ready` stays failing until its hosted receipts exist.

## How the work was done

Keep this process, because the plan's interfaces have costly failure modes.

**Per task:**
1. Start from a green harness.
2. Capture a behavioural RED: assertions failing against compile-safe seams. A missing module or a missing database is not a RED.
3. Make it GREEN.
4. Run the full gate.
5. Record receipts in `backend-progress.md`.
6. Commit locally.
7. Have an independent read-only agent review the commit.
8. Fix its findings test-first, then gate and commit again.

**Full gate**, from the repository root (Node 26 locally; the image and CI use Node 24.22.0):
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
npm run export:web -w gogospend-app -- --max-workers 2
git diff --check
```

**Test database:**
- `test:db` and the `test:ops` restore rehearsal need the local PostgreSQL 17 container from `compose.postgres.yml`: `gogospend-postgres-v1-local`, loopback port 55432.
- Each test run creates and drops its own `gogospend_test_*` database. Never drop test databases or roles you didn't create; other runs may be using them.
- `npm run dev:v1` starts the container but also migrates the `gogospend_v1` dev database. Run it only when you mean to.

**Migrations:**
- A migration takes the next free number when it is *integrated*, not when it is written.
- At each merge, update together:
  - the file name;
  - `drizzle/meta/_journal.json` (contiguous `idx`, increasing `when`);
  - the prefix list in `apps/api/src/database/migrations.spec.ts`;
  - the master plan's migration table;
  - the receipt.
- Undeployed migrations are edited in place.
- When a merged migration recreates `jobs` policies or routines, check it isn't using an older base. The security kinds must stay out of every `gogospend_jobs` policy:
  - `auth0_revoke_grants`
  - `auth0_security_reconcile`
  - `auth0_link_identities`
  - `account_deletion`
- The app-only kinds must stay out of the worker insert policy:
  - `sync_snapshot`
  - `export`
  - `import_parse`
  - `import_expire`

**Parallel work:**
- Sub-agents ran in separate git worktrees. Each kept its own scratch file names.
- One integrator merged, renumbered migrations and gated.
- Never use a bare `git stash`, because the stash is shared across worktrees.

**Standing constraints:**
- No changes under `vendor/`.
- No provider resources or paid services without E1.
- No automatic Mongo fallback.
- Hosted checks are recorded SKIPPED, never as passes.
