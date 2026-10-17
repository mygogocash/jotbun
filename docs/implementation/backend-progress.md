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
