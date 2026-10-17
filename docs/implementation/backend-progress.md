# Backend implementation progress

Receipts for the [backend implementation plan](../superpowers/plans/2026-10-17-gogospend-backend.md). Each task records its RED, GREEN and full-gate results. A required FAIL or SKIPPED blocks that task's milestone.

## Execution decisions — 17 October 2026

- **E0 starting code:** option (a). Baseline commit `2b5ee60` on `feat/standalone-client-local` holds the 94 previously uncommitted extraction files, `package-lock.json`, the spec and the plans. Work continues on branch `claude/gogospend-backend-plan-review-3c7544` (a worktree fast-forwarded to `2b5ee60`).
- **E4 scope:** commit each finished task locally on that branch. No push, PR or merge.
- **Run scope:** F1–F3, then check in. No provider resource, credential or paid service is used.

## Environment

macOS (Darwin 27), Node 26.10.0, npm 11.19.1, TypeScript 6.0.3, Docker 29.8.2. Dependencies installed with `npm ci` from the committed lockfile.

## Baseline before F1

All existing verification commands passed on `2b5ee60` with no source changes:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run typecheck:app` | PASS |
| `npm run test:api` | PASS — 16 suites, 122 tests |
| `npm run test:app` | PASS — 6 tests |
| `npm run test:render -w gogospend-app` | PASS — 1 file |
| `npm run test:dev` | PASS — 2 tests |
| `npm run build -w gogospend-api` | PASS |
| `npm run export:web -w gogospend-app -- --max-workers 2` | PASS |
| `git diff --check` | PASS |

## F1 — v1 contracts and test baseline

- **Seam:** `packages/contracts/src/v1/{common,auth,errors,validation}.ts` with compile-safe stubs; `apps/app/scripts/test-unit.mjs` dispatcher (`npm run test:unit`), proven green on the 6 existing pure tests and failing closed for a missing path.
- **RED:** `npm run test -w gogospend-api -- --runTestsByPath src/v1/contracts.spec.ts` → 64 failed, 5 passed of 69; the pinned `parses_satang_without_float_conversion` failed with expected `6500n`, received `0n`. `npm run test:unit -w gogospend-app -- src/api/v1Contracts.test.ts` → 5 of 5 failed on `AssertionError`. No import or module errors.
- **GREEN:** the same commands → 69 of 69 and 5 of 5.
- **Runtime load:** after `npm run build -w gogospend-api`, `node -e "require('@gogospend/contracts').parseMinor"` from `apps/api` returns a function and parses `'6500'`. `erasableSyntaxOnly` is on in `packages/contracts/tsconfig.json`; an `enum` probe fails typecheck with TS1294.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (17 suites, 191 tests), test:app PASS (11), test:unit PASS (11), test:render PASS (3 tests), test:dev PASS, build PASS, export:web PASS, `git diff --check` PASS.
- **Consumers:** v1 names are new exports beside the legacy `spend.ts` exports; no existing import changed. Legacy exports stay until M5/P6b.
- **Independent review:** no blockers. Fixed: sparse arrays produced invalid canonical JSON (now rejected by an index loop); `compareVersions` silently ordered malformed versions, which could let a mistyped minimum pass every client (now throws `TypeError`); payload numbers must be safe integers, so distinct large JSON numbers can no longer share a digest; `bangkokDate` throws outside years 0001–9999; `test-unit.mjs` no longer follows symlinks; `ApiProblem.code` is `string` as in the master plan so clients tolerate unknown codes. The command-ID test was rewritten to claim only what normalization guarantees (keeping two commands apart is M1's receipt key). Tests for these were added with the fixes; the reviewer confirmed each bug with a probe, and a separate RED run was not captured. After fixes: contracts spec 75 of 75, test:unit 11 of 11, both typechecks PASS.
- **Decision recorded:** `isUuid` accepts lower-case canonical UUIDs only, so one ID has one spelling in receipts and keys; app ID generation must stay lower-case.

Observed, not changed (pre-existing):

- Node prints `MODULE_TYPELESS_PACKAGE_JSON` when the API loads `packages/contracts/src/*.ts`, because the package has no `"type"` field and is reparsed as ESM. Adding `"type": "module"` needs checking against Jest/SWC and Metro first; left for P6b's container proof.
- `swc src -d dist` also compiles `*.spec.ts` files into `apps/api/dist`. Harmless locally; P6b's image build should exclude them.

## F2 — PostgreSQL migrations, role isolation and v1 startup

- **Dependencies (reviewed, exact pins):** `pg` 8.23.1 and `@types/pg` 8.23.1; `drizzle-orm` 0.45.3 rather than 0.45.4, which was 9 days old. The lockfile added only the `pg` family and `drizzle-orm`; none has an install script, and no advisory hits a new package. The 28 production advisories (9 moderate, 19 high) are the pre-existing ones.
- **Deviation from the plan, for review:** `drizzle-kit` and `apps/api/drizzle.config.ts` were not added. `drizzle-kit` 0.31.11 brings `esbuild`'s install script and the deprecated `@esbuild-kit/esm-loader`, and it cannot generate this project's migrations (roles, RLS, `SECURITY DEFINER` routines). Migrations are reviewed hand-written SQL applied by `drizzle-orm`'s migrator. `readJournal` checks numbering, file/journal parity and strictly increasing `when`, and `verifyAppliedMigrations` refuses an applied file that was edited; Drizzle checks neither. `schema.ts` mirrors the SQL, and a test fails on drift.
- **Local database:** `compose.postgres.yml` pins `postgres:17.11-bookworm@sha256:3645570c…` to `127.0.0.1:55432` with volume `gogospend-postgres-v1-local-data`, managed by `scripts/dev-v1.mjs` (`npm run db:v1:up`, `npm run dev:v1`). The launcher refuses a container or volume under those names that it did not create, and never references the Mongo container/volume.
- **Seam then RED:** the seam migration had the tables, roles and a `NULL`-returning resolver, but no RLS and broad grants. `npm run test:db -w gogospend-api` → 11 failed, 17 passed of 28, all failures assertions on isolation behaviour. The pinned `pool_reuse_does_not_inherit_owner` received 3 leaked rows. A first RED run also exposed Nest calling `process.exit(1)` on a configuration error; `createV1App` now uses `abortOnError: false` so startup errors reject.
- **GREEN:** `npm run test:db -w gogospend-api -- --runTestsByPath src/database/owner-transaction.integration.spec.ts src/database/migrations.integration.spec.ts` → 26 of 26. Covered:
  - fresh and repeat migration, and refusal of an edited applied migration;
  - missing or wrong owner context sees nothing, and pool reuse inherits no owner;
  - a forged cross-owner insert or update changes nothing;
  - jobs/security/bootstrap roles cannot read rows;
  - the bootstrap routine resolves only through `SECURITY DEFINER` with a fixed search path, and a decoy schema is ignored;
  - `lockAccount` serializes a second locker;
  - rollback works, a handle is unusable after its transaction, and transaction-control/context statements (including comment-prefixed and multi-statement forms) are refused.
- **Launcher:** `node --test scripts/dev-v1.test.mjs` (in `npm run test:dev`) → 5 of 5. A conflicting container or volume leaves everything untouched, no command references Mongo or deletes anything, and the dev login password goes over stdin only. Manual `npm run dev:v1`:
  - migrations applied and the API listened on `127.0.0.1:8091`;
  - an unregistered route returned 404;
  - the password was absent from process arguments;
  - SIGTERM stopped the API;
  - the dev login has neither superuser nor `BYPASSRLS`.
- **Full gate:** typecheck PASS, typecheck:app PASS, test:api PASS (20 suites, 225 tests), test:db PASS (3 suites, 28 tests), test:app PASS, test:unit PASS (11), test:render PASS, test:dev PASS (7), build PASS, export:web PASS, `git diff --check` PASS. A crashed early RED run had left 4 test databases and logins in the local container; they were dropped, and normal runs leave none.
- **Independent review:** 1 blocker, 5 should-fix, 4 nits, each probed. For every fix, a test was added and shown failing first (12 integration, 1 unit and 1 launcher test failed); all pass after the fixes:
  - **Blocker:** `lockAccount` joined `accounts` in the locking statement, so a request that waited behind a deletion/logout got the old status and generation with the new revision. It now locks, then reads the account in a second statement. The test commits `deleting` while the request waits.
  - A connection dropped mid-transaction crashed the process (no `error` listener while checked out). One is now attached, and the connection is destroyed.
  - The statement filter could be bypassed (`;COMMIT`, nested comments, parameterized or `DO`-block `set_config`). Two additions, in the same round trips:
    - Before COMMIT, `gogospend_assert_owner_tx(token, account)` checks the transaction token, owner and role.
    - After COMMIT, a connection that kept a session-level owner or role is destroyed. The test proves this by backend PID: the poisoned connection was reused before the fix and is replaced after.
    - Documented as a guard against mistakes in trusted code, not a sandbox.
  - Concurrent `CREATE ROLE` from two databases raced; duplicates are now tolerated and the role's attributes re-checked.
  - A journal entry older than the newest applied migration but never applied was skipped silently; it is now refused.
  - The API refuses to start on a superuser, `BYPASSRLS` or table-owner-member login. The launcher forces `NOSUPERUSER NOBYPASSRLS` and sends only a SCRAM verifier, so no log can contain the password.
  - Nits fixed: `TEMPORARY` revoked from `PUBLIC` (a temp table could shadow the lock row), and default `EXECUTE` on new functions revoked from `PUBLIC`.
- **Interface note for F3/F4:** binding lookup needs `auth_sessions`, which the migration table assigns to F4. F3 therefore defines a session-resolver port that fails closed; F4 supplies the SQL implementation.
- **Not run against Neon:** no hosted database was used (E1).
