# Brief 1C-T5 CI fix: the API's app adapter spec sends the legacy session header (R90)

- **Implementer:** Haiku. Read `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` first; it is binding.
- **What you fix:** CI's "SQL integration and ops" job on PR #347 (run 42472379471, job 128705978529, head `e98c4ec`) failed `apps/api/src/v1/app-adapter.integration.spec.ts`, test `the golden journey through the app adapter reconciles exactly`, with `V1Error: SESSION_REQUIRED (401)` at `apps/app/src/api/client.ts:414`. `test:db` finished with 1 failed and 693 passed (41 suites). That spec drives the app's own `createV1Transport` against the real NestJS API. The NestJS API still requires `X-GoGoSpend-Session`, but plan 1C's K13 stopped the app sending it (`docs/superpowers/plans/2026-10-25-jotbun-p1c-better-auth.md`, line 55).
- **Ruling R90 (controller, 8 November 2026):**
  - K13 stands: the app does not send the header.
  - `apps/api` is frozen and retiring. Its tests that drive the app's transport may send the legacy header themselves, test only, with the binding the test already uses.
  - No production change in `apps/api` or `apps/app`.
- **Worktree:** `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5`, branch `p1/1c-t5-app-auth`, at `e98c4ec`. Called `WT` below.
- **Scratch (verified files, read-only for you):** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-ci-fix/`. Called `S` below. It holds `files/` (the exact files to copy), `SHA256SUMS`, `insert-receipt.py`, `mutants.py` and the CI log `ci-job.log`. Do not use `S/tree/`: it is the planner's probe copy. Do not edit anything in `S`.
- **Shell:** the directory resets between calls.
  - Start every npm, node or python command with `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 && `.
  - Run git as `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 <args>`, one git command per call.
  - `WT` and `S` are shorthand here: always write the full paths.
- **Never:** `git stash`, `git reset --hard`, `git clean`, `git checkout -- <path>`, rebase, amend, push, delete a branch.
- **Never start Docker** (it is stopped and must stay stopped). Do not run `npm run test:db`, `test:edge:db` or `test:edge:workers`. You need no heavy lock.
- **No packages:** no `npm install`; no lockfile or manifest change.

## Why only this one spec, and why the edge is not a regression (for you and the reviewer)

- **The only test that drives the app's code from `apps/api` or `apps/edge`** is `apps/api/src/v1/app-adapter.integration.spec.ts`. It has two transports: `appFor()` and the 426 test.
  - Searched: `grep -rln -E "app/src/|gogospend-app|createV1Transport|createSpendV1Resources"` over `apps/api`, `apps/edge`, `packages` and `scripts`.
  - The other hit, `apps/api/src/spend/spend-compare-readiness.spec.ts`, only names an app file path. It does not use the transport.
  - CI ran all of `test:db`, and this was its only failure.
- **Specs that send the header with their own requests**, so K13 does not reach them:
  - `apps/api/src/testing/v1-client.ts:18`, used by the API's integration specs.
  - `apps/edge/test/support/edge-harness.ts:95`, used by the edge's `*.db.test.ts`.
  - `scripts/ops/performance-smoke.mjs:166`.
  - This branch changes nothing under `apps/edge`, and no edge file imports app code. The later steps of the database job (`test:ops`, the edge typecheck, `test:edge`, `test:edge:workers`, `build:edge`, `test:edge:db`) did not run in CI, but nothing on this branch reaches them. The 1C-T5 receipt records `test:ops` 106 passed, 1 skipped.
- **Server-side checks of the header:**
  - `apps/api/src/auth/application-session.guard.ts:51-54` (`bindingFrom`) and `:76-81` (`ApplicationSessionGuard.bind`: 401 `SESSION_REQUIRED` on every bound route). The NestJS access guard calls it at `apps/api/src/auth/auth.module.ts:76`.
  - `apps/api/src/privacy/deletion.controller.ts:45` (the deletion receipt, token only).
  - The edge's PostgreSQL path: `apps/edge/src/server/app/dispatch.ts:58` (`c.sessions.bind`, the same API guard, wired at `container.ts:155`) and `apps/edge/src/server/app/routes.ts:225` (`bindingFrom`, deletion receipt).
  - The vault path (`apps/edge/src/v1/handler.ts`, `tokens.ts:63-67`) reads `sid` from the JWT and never reads the header.
- **The edge's PostgreSQL path is not a production regression.** It cannot serve the app after 1C-T5, with or without the header:
  - It verifies Auth0 tokens (`container.ts:135-138`, `Auth0AccessTokenGuard`).
  - It accepts only 43-character F4 bindings (`BINDING = /^[A-Za-z0-9_-]{43}$/`).
  - The app now holds Better Auth JWTs and a UUID session id (36 characters, `credentialProvider.ts:203,241,287`).
  - Nothing is deployed, and the path retires at 1B-T13 (C1).

## Files (exactly these; nothing else)

1. Create `apps/api/src/testing/legacy-session-fetch.ts`: `legacySessionFetch(binding, inner = fetch)`. It returns a `typeof fetch` that sets `V1_HEADERS.session` (from `@gogospend/contracts`) on a copy of `init.headers` and passes everything else through to `inner`.
2. Create `apps/api/src/testing/legacy-session-fetch.spec.ts`. It runs in the non-database suite `npm run test:api` and has three tests:
   - The wrapper sets the header and keeps the method, body, redirect and other headers.
   - The app transport alone sends no session header (K13).
   - Through the wrapper, the app's real `createV1Transport` sends its binding as `X-GoGoSpend-Session`, next to `Authorization` and `X-GoGoSpend-Client`.
3. Modify `apps/api/src/v1/app-adapter.integration.spec.ts`: one import, plus `fetchImpl: legacySessionFetch(user.binding)` in both transports. The full diff:

```diff
@@ -16,6 +16,7 @@ import type { SignedUp } from '../testing/auth-fixtures';
 import { acceptPolicies, publishPolicies, startV1App } from '../testing/command-fixtures';
 import { startJwksFixture } from '../testing/jwks-server';
 import type { JwksFixture } from '../testing/jwks-server';
+import { legacySessionFetch } from '../testing/legacy-session-fetch';
 import { createTestDatabase } from '../testing/postgres-harness';
 import type { TestDatabase } from '../testing/postgres-harness';

@@ -34,6 +35,8 @@ function appFor(user: SignedUp): SpendV1Resources {
       getAccessToken: () => issuer.accessToken({ sub: user.who.subject }),
       getSessionSnapshot: () => ({ binding: user.binding, epoch: 1 }),
     },
+    // R90: this API still needs the session header the app no longer sends (K13).
+    fetchImpl: legacySessionFetch(user.binding),
   }));
 }

@@ -103,6 +106,7 @@ test('an app build below the minimum version is told to upgrade, not signed out'
     baseUrl,
     client: { platform: 'android', version: '0.9.0' },
     credentials: { getAccessToken: () => issuer.accessToken({ sub: user.who.subject }), getSessionSnapshot: () => ({ binding: user.binding, epoch: 1 }) },
+    fetchImpl: legacySessionFetch(user.binding),
   }));
```

4. Modify `docs/implementation/premium-progress.md`. Add one bullet to the existing `### 1C Task 5` section, right after its `- **Review round 3**` bullet, using `S/insert-receipt.py`. The controller asked for it there, because this task's receipt already lives in that file. It is not a new `receipts/` file.

The helper's text, exactly as you will copy it:

```ts
// Test use only (ruling R90). The app's v1 transport no longer sends
// X-GoGoSpend-Session (plan 1C, K13): the vault reads the session from the
// token's `sid`. This API is frozen and retiring and still requires the
// header, so a spec that drives the app's own transport against it passes
// this as the transport's `fetchImpl`, with the binding it already uses.
import { V1_HEADERS } from '@gogospend/contracts';

/** A fetch that sends `binding` as the legacy session header, then calls `inner`. */
export function legacySessionFetch(binding: string, inner: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set(V1_HEADERS.session, binding);
    return inner(input, { ...init, headers });
  };
}
```

## Steps

1. **Sync** (protocol step 1):
   - Run `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`.
   - At planning time this merge was clean (`git merge-tree` against `47665f0`; it adds edge files and docs only).
   - If `premium-progress.md` conflicts, keep both sides. Any other conflict: `STATUS: BLOCKED`.
   - `node_modules` is installed; no install is needed.
2. **Check the inputs:**
   - Run `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-ci-fix && shasum -a 256 -c SHA256SUMS`. Expect 8 lines, all `OK`.
   - Run `shasum -a 256 WT/apps/api/src/v1/app-adapter.integration.spec.ts`. Expect `500b163bce28b37482407e2eab98ce53aa360d0f8e4be6009b020d4e85ac4030`, the pre-image the diff applies to.
   - If either check fails: `STATUS: BLOCKED`.
3. **RED:**
   - `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-ci-fix/files/legacy-session-fetch.stub.ts /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5/apps/api/src/testing/legacy-session-fetch.ts`. This is the typed stub (R52): it returns `inner` unchanged.
   - `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-ci-fix/files/apps/api/src/testing/legacy-session-fetch.spec.ts /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5/apps/api/src/testing/legacy-session-fetch.spec.ts`.
   - Run `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 && npm run test -w gogospend-api -- src/testing/legacy-session-fetch.spec.ts`.
   - Expect `Tests: 2 failed, 1 passed, 3 total`, each failure an `expect` mismatch, not a load error. The failures are the wrapper test and the through-the-wrapper test; `the app transport alone sends no session header (K13)` passes. Record the counts.
4. **GREEN:**
   - `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-ci-fix/files/apps/api/src/testing/legacy-session-fetch.ts /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5/apps/api/src/testing/legacy-session-fetch.ts`.
   - Rerun the step 3 command. Expect `3 passed, 3 total`.
5. **Adapter spec:**
   - `cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-ci-fix/files/apps/api/src/v1/app-adapter.integration.spec.ts /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5/apps/api/src/v1/app-adapter.integration.spec.ts`.
   - Check that `shasum -a 256` prints `e62b446a2d782e06fdd516450bcdd35b7ec1b02d2c3f6e7102c64619c0a4afdb`.
6. **Mutation check:**
   - Run `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 && python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-ci-fix/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5`.
   - Expect 4 lines ending `killed` (2, 1, 2 and 2 failed), then `restored ...: OK`, and exit code 0.
   - The script keeps its backup in `S` and deletes it afterwards. If it exits 1: `STATUS: BLOCKED` with its output.
7. **Gate** (from `WT`):
   - `npm run typecheck`: passes. It covers the new files and the app files the adapter spec imports.
   - `npm run test:api`: expect 46 suites and 984 tests, all passed (the base's 981 and these 3). Record the counts printed.
   - `npm run build -w gogospend-api`: passes.
   - `node apps/api/scripts/release-graph.mjs check`: `"problems": []`.
   - `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after the commit, plus `/usr/bin/git -C WT diff --check` before it: no output.
   - SKIPPED: `npm run test:db`. Docker is stopped and was not started; CI runs it. This is the suite that proves the fix end to end.
   - Planner's evidence, on a copy of the merged tree:
     - typecheck passed; focused spec 3 passed; RED 2 failed and 1 passed; mutants 4 of 4 killed.
     - A wire probe through Node's real `fetch` to an HTTP server saw the binding on a GET and on a POST command, with method, body and `Idempotency-Key` intact.
     - Build and release graph passed (`problems: []`).
     - The full `test:api` there had 2 suites fail (`imports/parse-server.spec.ts`, `imports/parser-runner.spec.ts`, `sandbox_unsupported`). That came only from the copy's symlinked `node_modules`, outside the Node permission sandbox's roots; they do not import these files. In `WT` they must pass. If they fail there, report it.
8. **Receipt:**
   - Run `cd WT && python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-ci-fix/insert-receipt.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 <suites> <tests>`, with the `test:api` counts you recorded (expected `46 984`). It prints `inserted after line N`.
   - The bullet's text is `S/files/receipt-bullet.md`. It states the RED, GREEN and mutant counts above. If your measured RED, GREEN or mutant counts differ, stop and report `STATUS: BLOCKED`; do not edit the text.
9. **Commit:**
   - `/usr/bin/git -C WT add apps/api/src/testing/legacy-session-fetch.ts apps/api/src/testing/legacy-session-fetch.spec.ts apps/api/src/v1/app-adapter.integration.spec.ts docs/implementation/premium-progress.md`.
   - `/usr/bin/git -C WT status --short` must list exactly those four files.
   - Then commit with this message, exactly (summary 66 characters):

```text
Send the legacy session header in the API's app adapter spec (R90)

The app no longer sends X-GoGoSpend-Session (K13), and the frozen NestJS
API still requires it, so its spec that drives the app's own transport
failed with SESSION_REQUIRED in CI. A test-only fetch wrapper,
legacySessionFetch, adds the binding the spec already uses. No
production change in apps/api or apps/app.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

## Final message

Follow the protocol's format:
- `STATUS: DONE` or `STATUS: BLOCKED`.
- The merge commit (if any) and this commit's SHA, on `p1/1c-t5-app-auth`.
- The four files.
- RED, GREEN and mutant counts.
- Each gate command with its counts.
- `test:db` SKIPPED (Docker stopped).
- Anything that differed from this brief.
