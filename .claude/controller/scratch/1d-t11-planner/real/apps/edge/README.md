# Jotbun edge (`apps/edge`)

The Jotbun v1 backend on Cloudflare: one Worker serves every v1 route from the **UserVault**, Bun's AI help, the GoGoCash bridge, sign-in and the web pages, on **TanStack Start** and **Workers**. See the plans: [premium, AI and edge](../../docs/superpowers/plans/2026-10-24-jotbun-premium-ai-edge.md), [the vault core (1A)](../../docs/superpowers/plans/2026-10-25-jotbun-p1a-vault-core.md) and [files and background work (1B)](../../docs/superpowers/plans/2026-10-25-jotbun-p1b-vault-files.md).

- **Data:** the UserVault, one SQLite Durable Object per person (`src/vault`), holding that person's ledger. A route reaches only the vault named by the verified token's account.
- **Accounts:** Better Auth on D1 (`AUTH_DB`, `ERASURE_DB`), from phase 1C.
- **Objects:** one private R2 bucket (`OBJECTS`, `jotbun-private-objects`), through the binding: never a public URL.
- **Background work:** the vault's alarm, two Workflows (exports and resync snapshots), a statement-parse queue and a parser container.
- **Web:** a public trust page at `/`.

## The Worker

| Worker | Config | What it runs | Secrets |
| --- | --- | --- | --- |
| `jotbun-edge` | `wrangler.jsonc` | The TanStack Start pages; every `/v1` route on the UserVault, the live socket (`GET /v1/sync/live`) and the cashback catalogue included; Better Auth at `/api/auth/*`; the PostHog proxy at `/ingest/*`; `ExportWorkflow` and `SnapshotWorkflow`; the statement-parse queue's consumer; the parser container (`StatementParser`) | `COMMAND_DIGEST_KEY`, `BETTER_AUTH_SECRET`, `ERASURE_KEY`, for AI `ANTHROPIC_API_KEY`, `AI_GATEWAY_TOKEN`, and for PostHog EU `POSTHOG_PROJECT_TOKEN`, `ANALYTICS_ID_KEY` (never rotated), `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` |

The vault's classes and the queue handler live in `src/vault-worker.ts`, and `src/server.ts` re-exports them beside TanStack Start's entry (C1). `/live` answers without reading anything. `/ready` answers 200 once the token settings and `COMMAND_DIGEST_KEY` are set and `config:v1` can be read from KV (`src/v1/ready.ts`).

Statement parsing needs things a Worker isolate cannot give it: a Node child process under Node's permission model and libvips for receipt images. So it runs in a **Cloudflare Container** built from the API's own release image (`apps/api/Dockerfile`), started as its stateless parse server (`node dist/imports/parse-server.js`), with no secrets, no bindings and no internet. The queue's consumer sends it one file at a time and records the validated preview in the vault.

The vault checks each token itself against a JWKS (EdDSA or RS256). `AUTH_ISSUER`, `AUTH_AUDIENCE` and `AUTH_JWKS_URL` point at the issuer: Better Auth on this Worker from phase 1C (its keys at `/api/auth/jwks`), and the API's synthetic JWKS in the tests.

## How it reuses the API

The vault imports the API's pure modules from `apps/api/src` unchanged: the problem and gate rules, the client-version guard, the command digester, the object-key and grant rules, the CSV writer, the upload intake and the confirmation parsers. Some of them carry NestJS decorators, so at build time `@nestjs/*` is swapped for no-op stand-ins (`src/server/compat`, `api-seams.ts`). `src/server/storage/r2-object-store.ts` implements the API's `ObjectStore` on the R2 binding with the S3 adapter's rules: conditional puts that never overwrite, and the SHA-256 kept as `sha256` custom metadata.

## Routes

- **Served** (`VAULT_V1_ROUTES` in `src/v1/routes.ts`): every NestJS v1 route except the two deletion routes 1C builds (`VAULT_DEFERRED_ROUTES`: `POST /v1/me/deletion`, `POST /v1/auth/deletion-receipt`) and the six sign-in routes §6.4 retires (`VAULT_RETIRED_ROUTES`). Each mirrors its NestJS controller: same access class, gates and status code.
- **Edge only** (`VAULT_EDGE_ONLY_ROUTES`), which NestJS never had:
  - `GET/PUT /v1/me/ai-preferences`
  - `POST /v1/ai/parse`
  - `POST /v1/ai/slip`
  - `GET /v1/ai/note`
  - `POST /v1/ai/ask`
  - `GET /v1/bridge/gogocash/catalogue`
- **Added** (`VAULT_ADDED_ROUTES`), both 1D's:
  - `GET /v1/sync/live`, the live socket;
  - `GET /v1/me/analytics`, the analytics answer: `{ analytics_id, weeks_since_signup, consent }`. The analytics id is the HMAC-SHA256 of the account id under `ANALYTICS_ID_KEY`, or null while that key is unset.

Server events (1D-T11): after a vault call the Worker sends PostHog EU a `record_saved` (kind and category key only) for each record a `POST /v1/transactions` committed, `resync_required` for a 410 `RESYNC_REQUIRED` and `sync_failed` for a 500 on the outbox's routes, only when the person said yes, the phone did not send `X-GoGoSpend-Analytics: off` and `ANALYTICS_ID_KEY` is set. A 500 `INTERNAL_ERROR` is also counted as an anonymous `$exception` carrying its class name only, whatever the consent; a deliberate refusal never is. Without `POSTHOG_PROJECT_TOKEN` nothing is sent.

`test/route-coverage.test.ts` reads every NestJS controller and fails if a route is not placed exactly once, or if a served route's access, gates or status drift.

A route that starts background work (`starts`) hands the vault's pending work to `startPendingWork` after a 2xx answer, through `waitUntil`. A start that did not happen is made by the vault's alarm.

## R2 lifecycle rules

The owner configures these on `jotbun-private-objects` (`npx wrangler r2 bucket lifecycle add jotbun-private-objects <name> <prefix> --expire-days 1`):

| Prefix | Rule |
| --- | --- |
| `sync_snapshot/` | Expire after 1 day |
| `export/` | Expire after 1 day |
| `import_quarantine/` | Expire after 1 day |
| `import_image/` | Expire after 1 day |
| `receipt/` | None. A retained receipt lives until it is released; the vault's tombstones delete a late write there once more a day later (B19). |

The vault deletes every object at its own deadline on its alarm; the rules are a backstop.

## Run it locally

```bash
npm run install:edge
npm run dev:edge
```

`dev:edge` does two things:
1. Writes `apps/edge/.dev.vars`: a fresh `COMMAND_DIGEST_KEY` each run unless one is given, and AI only with your key.
2. Runs `vite dev`: the Worker on http://127.0.0.1:8092. The parser container stays off (`dev.enable_containers` in `wrangler.jsonc`), so a statement parse asks to be retried.

No database runs. Until a token issuer is configured (`AUTH_JWKS_URL`, or Better Auth's own keys from 1C), token-checked routes fail closed with 503.

Optional environment:
- `ANTHROPIC_API_KEY` and `AI_GATEWAY_TOKEN` turn on Bun's AI help; `ANTHROPIC_BASE_URL` points to Cloudflare AI Gateway.
- `COMMAND_DIGEST_KEY` keeps one digest key between runs.

Point the app at the edge with `EXPO_PUBLIC_V1_API_URL=http://127.0.0.1:8092`.

## Tests

| Command | What it runs |
| --- | --- |
| `npm run typecheck:edge` | Types of the Worker and of every API module it imports |
| `npm run test:edge` | Node unit tests: route coverage against the NestJS controllers, the Worker's shape (`c1-shape.test.ts`), `/live` and `/ready`, HTTP parsing, the Workers fetch, the R2 store contract (Miniflare's R2), the sentence parser, AI grounding and drafts, the bridge, the PostHog proxy and the Worker's dispatch, server analytics and the contracts |
| `npm run test:edge:workers` | The UserVault in workerd (`vitest.workers.config.ts`, through `@cloudflare/vitest-plugin`, on `wrangler.jsonc` with `src/vault-worker.ts` as its `main`, so TanStack Start is never loaded): its schema and migrations, the front door and `config:v1`, the command protocol, every v1 route, files and background work, the AI routes, retention on its alarm, live pokes and Better Auth on D1. The bindings are synthetic: no cloud resource |
| `npm run build:edge` | The client and the one Worker bundle (`dist/server`) |
| `npm run test:edge:db` | The suites that start the built Worker in `wrangler dev`, some beside the built NestJS v1 server on PostgreSQL. Needs `npm run build -w gogospend-api` and `npm run build:edge` first |

The `test:edge:db` suites:
- **Vault parity:** the money session's 49 steps, and the files session's 42 steps (40 compared; owner answer 2), against the built NestJS v1 server and the built Worker, with the policies NestJS publishes seeded into its local KV (`config:v1`). Every status, key header and normalized body is compared, and one person cannot read another's wallet.
- **C1 Worker:** the built Worker answers `/live`, `/ready` from its settings and KV (and 503 without them), the trust page, `/v1/policies` from KV, and 404 for an unknown v1 route.

## Deploy (not done yet)

Hosted Cloudflare resources are recorded as SKIPPED until the owner asks for a deployment. The steps:

1. Create the KV namespace for `config:v1`, the two D1 databases (`jotbun-auth`, `jotbun-erasure`, with the `apac` location hint), the R2 bucket `jotbun-private-objects` with the lifecycle rules above, and the queue `jotbun-statement-parse`. Put the ids in `wrangler.jsonc`, and publish `config:v1` (policies, gates and client minimums).
2. Set the secrets with `npx wrangler secret put <NAME>`:
   - `COMMAND_DIGEST_KEY` (the API's value, so replays stay valid);
   - `BETTER_AUTH_SECRET` and `ERASURE_KEY`;
   - optionally `ANTHROPIC_API_KEY` and `AI_GATEWAY_TOKEN`, with `AI_ENABLED=true` and `ANTHROPIC_BASE_URL` set to the gateway URL;
   - for PostHog EU, once its project exists (Q5): `POSTHOG_PROJECT_TOKEN` (server events), `ANALYTICS_ID_KEY` (the analytics id's HMAC key) and, for person deletion, `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID`. **`ANALYTICS_ID_KEY` is set once and never rotated:** a new key gives every person a new analytics id, and deletion would then miss the persons made under the old one. Until these are set nothing is sent.

   Set `IMPORT_UPLOADS_ENABLED` once the hosted R2 gate has passed, and `GOGOCASH_BRIDGE_ENABLED` with `GOGOCASH_CATALOGUE_URL` for the bridge.
3. Run `npm run deploy --prefix apps/edge`. It builds, then deploys the one Worker; the parser image is built from `apps/api/Dockerfile` (Docker needed).
