# 1B-T13 second review: money, auth and privacy (Claude Opus 5.5)

- **Reviewed:** commit `7eeff709` on `p1/1b-t13-vault-http`, range `origin/claude/p1a-vault-core...7eeff709` (merge base `43f438f0`; the base has since moved to `9acb166d` with controller files only, so the range is unchanged). PR #405.
- **Against:** plan 1B `### Task 1B-T13` (line 1091), B13, B15, B16, B18, the Global Constraints, the brief `briefs/1B-T13.md` (P1 to P25) and the protocol (R87, R100). Written before reading the first review.
- **Result:** no blocker, no major, no minor. Six nits: five are test pins that are missing (each shown by a surviving mutant), and one is a gap in the deploy docs. The fold keeps every route's guard, adds no secret, leaves no live PostgreSQL path, and P14's guard is correct.

## CI on PR #405 (run 43031128612): all nine jobs pass

- `edge` (1m37s):
  - `test:edge`: `Test Files 16 passed (16)`, `Tests 180 passed (180)`;
  - `test:edge:workers`: `Test Files 31 passed (31)`, `Tests 776 passed | 1 todo (777)`;
  - `build:edge`: passed;
  - `test:edge:db`: `Test Files 3 passed (3)`, `Tests 12 passed (12)`: `vault-parity-files.db` 3, `c1-worker.db` 6, `vault-parity.db` 3. So the NestJS comparisons and the cross-account case `isolates people in the runtime too` ran on the one Worker's `dist/server`.
- `checks`, `exports`, `render`, `sections-1` to `sections-3`, `database` and `image`: all pass.

## What I checked, by focus

1. **Auth after the fold.**
   - `src/server.ts` keeps its dispatch byte for byte (`/ingest/*`, then `/api/auth/*` at line 21, then TanStack Start). It only adds the re-exports and `queue: vaultWorker.queue` (line 25).
   - In my own build, the `/api/auth/*` dispatch survives bundling. Probe P1 (built Worker): `GET /api/auth/ok` and `/api/auth/jwks` answer Better Auth's own `503 {"code":"SERVICE_UNAVAILABLE"}` with `no-store` (no `BETTER_AUTH_SECRET`), never TanStack Start's page.
   - `VAULT_V1_ROUTES` changes only in comments. The only addition is the `VAULT_EDGE_ONLY_ROUTES` list.
   - Every served NestJS route is compared with its controller (`route-coverage.test.ts`). I checked that no controller puts `@Access` or `@Gated` at class level, which the per-handler parser would miss.
   - The seven edge-only routes keep the PostgreSQL edge's access: `bound_session` for the three preference and note routes, `current_policy` for parse, slip and ask, `public` for the catalogue. I compared them with the base `src/server/app/routes.ts:453-465`.
   - Probe P2 (built Worker): with no token or a bogus one, `GET /v1/me`, `GET /v1/me/ai-preferences`, `POST /v1/ai/ask`, `GET /v1/transactions/<id>`, `GET /v1/export-files/<grant>` and `GET /v1/sync/live` all answer `401 UNAUTHENTICATED`. `GET /V1/me` is also 401: TanStack's match ignores case like `matchRoute`.
   - No route became public or reachable by another account. `handleVaultV1` still names the vault only from `claims.accountId`.
2. **Secrets and settings.**
   - `wrangler.jsonc` `vars` (from line 17) hold only non-secrets, and my built `dist/server/wrangler.json` has the same eight vars.
   - `scripts/dev.mjs` only removes code. It writes a fresh random `COMMAND_DIGEST_KEY`, and `ANTHROPIC_API_KEY` only when the developer exports one, to `apps/edge/.dev.vars`, which `apps/edge/.gitignore:4` ignores.
   - `/ready`'s 503 body has exactly `code`, `message_key`, `request_id` and `retry_after_seconds`, and names no setting (probe P4). A KV failure logs only its class (`ready.test.ts`; my mutant N7 that logs the message is killed).
3. **Data paths.**
   - No `hyperdrive`, no `JOBS`, `SECURITY_JOBS` or `DELETION_JOBS` producers, and no `triggers`.
   - My own build of `7eeff709` has 0 of each marker: `pg-protocol`, `pg-pool`, `pg-types`, `drizzle-orm/node-postgres`, `from "pg"`, `api/src/database`, `HYPERDRIVE`, `LEGACY_V1_ORIGIN`.
   - What is left under `src/server` is pure helpers (R2 store, HTTP helpers, AI text, bridge, compat shims, Better Auth glue). No page, loader or server function reads `env`.
   - The built default export's `queue` is vault-worker's own `queue(batch, env) { return handleParseBatch(batch, env) }` (`dist/server/index.js`). My rerun of M28 confirms the parse tests run the renamed module.
4. **Money.**
   - `src/vault/ai.ts:287` returns `{ result: null, figures: [] }` exactly where `parseMonth` refuses: the same regex, and `< '1970-01'` on a fixed-width `YYYY-MM`. `summary()` has no other refusal.
   - Probe P7 (workers): an Ask Bun turn calling `budget_status` for `1969-12`, then `0001-01`, answers 200. `remaining` afterwards equals `AI_DAILY_LIMITS` with `ask` one lower.
   - `ASK_TOOLS` and `ToolInputError` moved byte for byte; only their doc comments are new. `src/v1/ai/service.ts` changes only its import and a comment, so use accounting is unchanged.
5. **Logging.**
   - Added lines: `ready_config_unreadable` (failure class only). Moved: the console log sink, now set at the HTTP Worker's load. The PostgreSQL edge's container set the same sink.
   - Probe P6: the built Worker's own JSON lines were `{"level":"error","event":"auth_unavailable","failure":"AuthConfigError"}` only, with no token, subject, path id or setting value. The path ids in `[wrangler:info]` lines come from `wrangler dev`'s request log, not the Worker.

## Findings

### Blocker

None.

### Major

None.

### Minor

None.

### Nit

- **n1. The coverage test no longer pins the seven edge-only routes' access, gates and status.**
  - The deleted `vault-route-coverage.test.ts` compared them with the PostgreSQL edge's `EDGE_ONLY_ROUTES`. Now `test/route-coverage.test.ts:95` skips every route NestJS lacks (`if (!theirs) return []`).
  - Evidence: mutant N1 (`GET /v1/me/ai-preferences` made `public`) and mutant N2 (`POST /v1/ai/ask` made `bound_session`) both pass `route-coverage` (8 of 8).
  - Both are killed behaviourally by `ai.test.ts`: N1 by `AI is off until the user agrees to the current notice` (line 130) and others; N2 by `each AI route is refused at its first step when a newer policy is pending...` (line 631). So nothing is unguarded today.
  - Suggestion: a seven-row `{ access, gates, status }` table in `route-coverage.test.ts` would restore the static pin the retirement removed. The plan does not require it.
- **n2. "Spends no extra use" (P14) is not pinned.**
  - Mutant N5 makes the guard call `consumeAi(c, 'ask')` before returning. It passes all 43 cases of `ai.test.ts`.
  - My probe P7, which asserts `remaining` after the pre-1970 question, kills it and passes on `7eeff709`.
  - Suggestion: add the `remaining` check to the Ask Bun m-1 case (`ai.test.ts:461`).
- **n3. P4's "an empty setting counts as unset" is not pinned.**
  - Mutant N3 (`env.AUTH_ISSUER === undefined` instead of `!env.AUTH_ISSUER`) passes `ready.test.ts` (8 of 8).
  - The `it.each` at `ready.test.ts:54` only sets each setting to `undefined`. Adding `''` there would pin it.
- **n4. Nothing pins "no secret in `vars`".**
  - Mutant N4 (adds `"COMMAND_DIGEST_KEY": "..."` to `wrangler.jsonc` vars) passes `c1-shape`.
  - Suggestion: one assertion in `c1-shape.test.ts` that `vars` has none of `COMMAND_DIGEST_KEY`, `BETTER_AUTH_SECRET`, `ERASURE_KEY` or `ANTHROPIC_API_KEY`.
- **n5. No committed test sends `/api/auth/*` through the real entry.** This is a pre-existing gap from 1C-T1, but this PR edits both `src/server.ts` and the Node test that loads it.
  - Mutant N6 deletes `src/server.ts:21` (`if (isAuthPath(pathname)) return handleAuth(request)`). It passes `posthog-proxy.test.ts` (9 of 9) and `c1-shape`.
  - `c1-worker` has no `/api/auth` case, and the workers suite runs `src/vault-worker.ts` as `main`, so CI would not catch it either.
  - Suggestion: with the new `cloudflare:workers` mock (`env: {}`), a `posthog-proxy.test.ts` case could pin the dispatch. `worker.fetch(new Request('http://x/api/auth/ok'))` should answer Better Auth's `503 {"code":"SERVICE_UNAVAILABLE"}`, which is what probe P1 shows on the built Worker.
- **n6. The README's deploy steps would give an un-ready Worker.**
  - `apps/edge/README.md:90-101` lists the secrets but not `AUTH_JWKS_URL`. Until 1C-T10b, `/ready` and every token check need it: `tokenVerifierFromEnv` throws `ConfigurationError`, and probe P4's `/ready` is 503 without it.
  - The steps also never say to replace `wrangler.jsonc`'s localhost `AUTH_ISSUER` and `AUTH_BASE_URL` (lines 26-27).
  - Both fail closed, and nothing is deployed. Line 21 does name the three settings.

## Probes and mutants

All runs were in my scratch copy (`git archive 7eeff709`, `node_modules` symlinked), each under the heavy lock.

- **Focused Node tests:** `c1-shape`, `route-coverage`, `ready`, `request` and `posthog-proxy`: `Tests 48 passed (48)`, matching the receipt.
- **Probe file** `scratch/1b-t13-second/tree/apps/edge/test/zz-c1-probe.db.test.ts`, on my own build: 6 of 6 pass on the third run. The first failure was my probe (Node's `fetch` refuses an `upgrade` header), and the second run only added log capture.
  - Recorded answers: `scratch/1b-t13-second/probe-c1-run3.json`.
  - Also recorded: `OPTIONS /v1/wallets` answers the trust page (200 `text/html`, no `no-store`). See the notes below.
- **Probe** `zz-ai-probe.test.ts -t PROBE` (workers): 1 passed. This is P7 above.
- **My mutants** (`scratch/1b-t13-second/mymutants.py`, `mymutants/results.json`): every runner behaved as predicted, and every file was restored and compared with `git show 7eeff709:<path>`.
  - N1 and N2 survive `route-coverage` and are killed by `ai.test.ts`.
  - N3, N4 and N6 survive (n3, n4, n5).
  - N5 survives `ai.test.ts` and is killed by probe P7.
  - N7 (`/ready` logs the message) is killed by `ready.test.ts`.
- **The planner's mutants, a sample of 7** (`mutants.py --tree <my scratch>`): M2, M3 (killed in `c1-worker`'s 503 case and in `ready.test`), M13 (killed in the policy-list and 404 cases), M21, M23, M25 and M28. 7 of 7 were killed and restored.

## Notes for later tasks

- **Account deletion does not exist on the one Worker until 1C-T11.**
  - `POST /v1/me/deletion` and `POST /v1/auth/deletion-receipt` answer `404 NOT_FOUND` (probe P3), and the PostgreSQL deletion Worker retires here.
  - This is B16 and nothing is deployed, but the one Worker should not take real accounts before 1C-T11 ships deletion. Gate any deployment on it.
- **`limits.cpu_ms` 120000 now covers every route of the one Worker,** including the unauthenticated `/api/auth/*`, `/ingest/*` and the pages, where the old HTTP Worker had the default. Worth a rate-limit or WAF decision at deploy time.
- **`AUTH_ISSUER` and `AUTH_AUDIENCE` are now one setting** for Better Auth (which issues tokens) and the vault (which verifies them), as 1C intends. 1C-T10a and 1C-T10b should pin that they stay one.
- **The workers suite runs `src/vault-worker.ts`'s fetch, not the deployed path.** That fetch forwards every method and checks `/v1/` lower-cased. The deployed path forwards only six methods through TanStack Start, and any other method on `/v1/*` gets the trust page (pre-existing, unchanged by this PR).
  - Anything that must hold on the deployed path (the `/api/auth` dispatch, method handling, CORS preflight once a web client needs it) needs a built-Worker case.
  - `zz-c1-probe.db.test.ts` in my scratch folder can serve as a template.
- **Cleanup:** besides the receipt's leftovers (P16 to P18), `src/server/env.ts`'s `EdgeSettings` still lists `AUTH0_*`, `RATE_LIMIT_KEY` and `OPERATIONAL_PAUSE*`, which nothing on the one Worker reads now. The vault's gates come from `config:v1`. Worth the same cleanup.

VERDICT: Approved
