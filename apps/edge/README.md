# Jotbun edge (`apps/edge`)

The Jotbun v1 backend on Cloudflare: every v1 route, Bun's AI help and the GoGoCash bridge served by **TanStack Start** on **Workers**, and the API's background workers as Workers of their own. See the plan: [premium, AI and edge plan](../../docs/superpowers/plans/2026-10-24-jotbun-premium-ai-edge.md).

- **Database:** the same PostgreSQL 17 as the NestJS API, through **Hyperdrive**. It keeps the same migrations, row-level security, roles and SQL routines.
- **Objects:** R2 (`OBJECTS`), through the binding: never a public URL.
- **Background work:** PostgreSQL stays the job queue. Cron Triggers and Queues (wake-ups only) start the background Workers.
- **Web:** a public trust page at `/`. The `/v1/*` server routes go through one dispatcher.

## The Workers

Each Worker has its own least-privilege logins and secrets, as each was its own process in the API. A leak of one never exposes another's credentials.

| Worker | Config | What it runs | Logins (Hyperdrive) | Secrets |
| --- | --- | --- | --- | --- |
| `jotbun-edge` | `wrangler.jsonc` | Every v1 route, the AI routes, the bridge, the trust page | `gogospend_app` + `gogospend_bootstrap` | Auth0 API settings, the read-profile client, event signing, rate-limit and command-digest keys, Anthropic |
| `jotbun-jobs` | `wrangler.jobs.jsonc` | Snapshots, exports, import expiry, the sweep (retention, overdue objects, backlog); wakes the parser | `gogospend_jobs`; `gogospend_leased_read` | The parser container's login and R2 S3 token |
| `jotbun-security` | `wrangler.security.jsonc` | Provider cleanup after a global logout or credential change, provider links, reconciliation | `gogospend_jobs` + `gogospend_security` | The Auth0 maintenance client |
| `jotbun-deletion` | `wrangler.deletion.jsonc` | Account deletion | `gogospend_jobs` + `gogospend_security`; `gogospend_erasure_registry` | `ERASURE_REGISTRY_LOOKUP_KEY`, the Auth0 maintenance client |
| Parser container | `ImportParser` in `jotbun-jobs` | `import_parse` only, then exits when idle | `gogospend_jobs` (a direct URL) | R2 S3 token |

Import parsing needs things a Worker isolate cannot give it: a Node child process under Node's permission model (no network, no file writes, no processes) and libvips for receipt images, within the reviewed 512 MiB budget. So it runs in a **Cloudflare Container** built from the API's own release image (`apps/api/Dockerfile`), started as `node dist/imports/parse-worker.js`. The jobs Worker wakes it when a parse is due, and it exits once nothing has been due for a minute.

## How it reuses the API

The Workers import the API's domain code from `apps/api/src` unchanged: the SQL, the command executor, receipts, the change writer, validation, services, job handlers and repositories. Those modules use NestJS only for decorators and constructor injection, so at build time:
- `@nestjs/*` is swapped for no-op stand-ins (`src/server/compat`, `api-seams.ts`);
- the edge builds the same object graph by hand (`src/server/app/container.ts`, `src/server/jobs/roles.ts`).

Three runtime gaps are closed on the edge, not in the API:
- **Sockets:** each request (and each Cron or queue run) gets its own small `pg` pool on Hyperdrive (`src/server/db/request-pool.ts`), because a Worker cannot share a socket between invocations.
- **`fetch`:** the shared clients call a stored `fetch` as a method, and Workers do not implement `redirect: "error"`, which the Auth0 Management client uses to never follow a redirect. `src/server/http/fetch.ts` calls the global as a function and emulates `error` mode as the Fetch standard defines it. Without it, sign-in bootstrap and every Auth0 maintenance call fail on Workers; `test/workerd-roles.db.test.ts` catches that.
- **Storage:** `src/server/storage/r2-object-store.ts` implements the API's `ObjectStore` on the R2 binding with the S3 adapter's rules: conditional puts that never overwrite, and the SHA-256 kept as `sha256` custom metadata (S3's `x-amz-meta-sha256`), so the container's S3 writes and the Workers' binding reads agree.

## Routes

- **Ported** (`V1_ROUTES` in `src/server/app/routes.ts`): all of them. Each mirrors its NestJS controller: same access class, gates, status code and service call. This includes sign-in challenges, ID-token bootstrap and proofs, linking, global logout, deletion and its receipt, signed provider events, snapshots, exports, uploads, review and confirmation, and receipts.
- **Edge only** (`EDGE_ONLY_ROUTES`):
  - `GET/PUT /v1/me/ai-preferences`
  - `POST /v1/ai/parse`
  - `POST /v1/ai/slip`
  - `GET /v1/ai/note`
  - `POST /v1/ai/ask`
  - `GET /v1/bridge/gogocash/catalogue`
- **Forwarded** (`FORWARDED_V1_ROUTES`): none. The forwarder to `LEGACY_V1_ORIGIN` stays for a route the API gains before the edge does.

`test/route-coverage.test.ts` reads every NestJS controller and fails if a route is neither ported nor forwarded, or if a ported route's access, gates or status drift.

A route that may queue background work names its role (`wakes`), and a success sends that role's queue a wake-up after the response. The job row is already committed, so a lost message only waits for the next Cron Trigger.

## Run it locally

```bash
npm run install:edge
npm run dev:edge
```

`dev:edge` does four things:
1. Starts the v1 PostgreSQL container and migrates it.
2. Creates a least-privilege login per role (the HTTP Worker's, jobs, leased read, security, erasure registry) with fresh random passwords.
3. Writes `apps/edge/.dev.vars`.
4. Runs `vite dev`: the HTTP Worker on http://127.0.0.1:8092 and the background Workers beside it. Cron Triggers do not fire in `vite dev`, and the parser container stays off (`dev.enable_containers` in `wrangler.jobs.jsonc`).

Optional environment:
- `ANTHROPIC_API_KEY` turns on Bun's AI help.
- The `AUTH0_*` settings point at a non-production tenant.

Point the app at the edge with `EXPO_PUBLIC_V1_API_URL=http://127.0.0.1:8092`.

## Tests

| Command | What it runs |
| --- | --- |
| `npm run typecheck:edge` | Types of the Workers and of every API module they import |
| `npm run test:edge` | Unit tests: route coverage, HTTP parsing, the Workers fetch, the R2 store contract (Miniflare's R2), the sentence parser, AI grounding and drafts, the bridge |
| `npm run build:edge` | The client and all four Worker bundles |
| `npm run test:edge:db` | PostgreSQL suites (below). Needs `npm run build -w gogospend-api` and `npm run build:edge` first. |

The PostgreSQL suites:
- **Dispatch:** the access pipeline, commands, RLS, gates, bodies and the forwarder.
- **Parity:** three scripted sessions (money; sign-in and privacy; files and background requests) against the built NestJS v1 server and the edge, every response compared.
- **AI** with a scripted model: consent, quotas, grounding, tools, and no account identifiers sent.
- **Jobs:** each role's run end to end: a snapshot, an export download (and a tampered file refused), the sweep, a provider revocation, a deletion with its receipt, and an import parsed by the container's entry, then reviewed and confirmed.
- **workerd:** the built Workers in `wrangler dev`: the HTTP Worker's money session and sign-in, and each background Worker's Cron run sharing R2 with it.

## Deploy (not done yet)

Hosted Cloudflare resources are recorded as SKIPPED until the owner asks for a deployment. The steps:

1. Create one Hyperdrive config per login, with caching off:
   ```bash
   npx wrangler hyperdrive create jotbun-v1-app --connection-string "<gogospend_app + gogospend_bootstrap login>" --caching-disabled
   ```
   Repeat for the jobs, leased-read, security (used by security and deletion) and erasure-registry logins. Put the ids in the four `wrangler*.jsonc` files.
2. Create the R2 bucket `jotbun-private-objects`, and the queues `jotbun-jobs`, `jotbun-security-jobs` and `jotbun-deletion-jobs`.
3. Set each Worker's secrets with `npx wrangler secret put <NAME> -c <config>`:
   - `jotbun-edge`:
     - `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_ALLOWED_CLIENT_IDS`
     - `AUTH0_PROFILE_LINK_CLIENT_ID`, `AUTH0_PROFILE_LINK_CLIENT_SECRET`
     - `AUTH0_EVENTS_SIGNING_SECRETS`
     - `RATE_LIMIT_KEY`, `COMMAND_DIGEST_KEY` (the API's values, so replays stay valid)
     - `MIN_CLIENT_VERSION_IOS`, `MIN_CLIENT_VERSION_ANDROID`
     - `READINESS_RECEIPTS`
     - optionally `ANTHROPIC_API_KEY` with `AI_ENABLED=true`
     - `GOGOCASH_BRIDGE_ENABLED`, `GOGOCASH_CATALOGUE_URL`
     - `IMPORT_UPLOADS_ENABLED` once the hosted R2 gate has passed
   - `jotbun-jobs`: `PARSER_DATABASE_URL`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - `jotbun-security`:
     - `AUTH0_ISSUER`, `AUTH0_ALLOWED_CLIENT_IDS`
     - `AUTH0_MAINTENANCE_CLIENT_ID`, `AUTH0_MAINTENANCE_CLIENT_SECRET`
     - `AUTH0_PROFILE_LINK_CLIENT_ID`, `AUTH0_PROFILE_LINK_CLIENT_SECRET` (links)
   - `jotbun-deletion`:
     - `AUTH0_ISSUER`, `AUTH0_ALLOWED_CLIENT_IDS`
     - `AUTH0_MAINTENANCE_CLIENT_ID`, `AUTH0_MAINTENANCE_CLIENT_SECRET`
     - `ERASURE_REGISTRY_LOOKUP_KEY`
4. Run `npm run deploy --prefix apps/edge`. It builds, then deploys the four Workers; the parser image is built from `apps/api/Dockerfile` (Docker needed).
