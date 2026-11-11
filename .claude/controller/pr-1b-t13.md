## Summary
- **1B-T13 (C1): the vault moves into the HTTP Worker, and the PostgreSQL edge retires.** `jotbun-edge` is now the one Worker.
  - `wrangler.jsonc` holds every vault binding: `VAULT` and `PARSER` with their migrations, `CONFIG`, `OBJECTS`, both Workflows with `default_retention`, the parse queue's producer and consumer, the container, and `limits.cpu_ms` 120000.
  - `src/roles/vault.ts` is now `src/vault-worker.ts`, and git records the rename.
- **`src/server.ts`** re-exports `UserVault`, `StatementParser`, `ExportWorkflow` and `SnapshotWorkflow`, and adds `queue: vaultWorker.queue`. It keeps its dispatch: `/ingest/*` goes to the PostHog proxy and `/api/auth/*` to Better Auth, before TanStack Start (P1, P2; 1C's K3).
- **Routes:**
  - TanStack Start's `/v1/$` answers from the vault (`handleVaultV1`).
  - `/live` and `/ready` come from the new `src/v1/ready.ts`. `/ready` reads `config:v1` as text and logs only a failure's class name (P4).
- **Retired (28 deletions):** the PostgreSQL edge's three background Workers and their configs, its dispatcher, `src/server/worker.ts`, `app/`, `db/` and `jobs/`, the old AI service files, and its eight PostgreSQL test files.
  - `ASK_TOOLS` and `ToolInputError` move to `src/v1/ai/tools.ts`.
  - The server bundle has no PostgreSQL driver left.
- **Tests:**
  - New: `c1-worker.db.test.ts` (6 cases, in workerd), `c1-shape.test.ts` (the config's shape and the re-exports, P7) and `ready.test.ts` (8 cases, P5).
  - `route-coverage.test.ts` is rewritten against NestJS, and takes in `vault-route-coverage.test.ts` and 1D-T10's checks (P8).
  - `posthog-proxy.test.ts` mocks `cloudflare:workers` (P3).
  - `vitest.workers.config.ts` runs on `wrangler.jsonc`, with `main: './src/vault-worker.ts'` (P10).
- **Carried:**
  - The 1B-T7 review's m-1 (P14): `budget_status` for a month before 1970-01 now answers an empty result. It used to answer a 422 after the use was already spent.
  - The 1A-T10 and 1B-T12 reviews' notes: the README, `default_retention`, and the config paths.
  - **Not carried:** fix-download-aborts' n5 and n6. They go to the first task that touches `src/v1/files` (P20).
- The controller accepted the planner's calls P1 to P25 (receipt, Deviations).
  - No package, lockfile, app, API or Cloudflare resource changes. Nothing is deployed.
  - This is the closing 1B receipt, in its own file under R87: `docs/implementation/receipts/1B-T13.md`.
  - The controller schedules a read-only review of the whole 1B range after this PR (P22).

## Test plan
- [x] RED, on typed stubs and the old build. Every failure is an assertion:
  - Node: 12 of 18 failing (`c1-shape` 2 of 2, `route-coverage` 2 of 8, `ready` 8 of 8);
  - `c1-worker`: 2 of 6;
  - both m-1 cases in `ai.test.ts`.
- [x] GREEN:
  - the focused Node files: 48 of 48;
  - `c1-worker`: 6 of 6;
  - the focused workers files: 134 of 134 (7 files);
  - the three local smokes, never committed: money 1 of 1, files 4 of 4 (40 steps compared), live 1 of 1;
  - `dev.mjs`'s dry run: identical to the planner's.
- [x] 28 of 28 mutants killed, each source restored byte for byte. All 31 final files are byte-identical to the planner's verified copies, and the 60 paths are as expected.
- [x] R100's fast gate:
  - `typecheck:edge`;
  - `test:edge`: 180 of 180, in 16 files;
  - `build:edge`: `pg-protocol`, `pg-pool`, `pg-types`, `drizzle-orm/node-postgres` and `from "pg"` each count 0 in `dist/server`;
  - `git diff --check`.
- [ ] CI on this pull request is green: the nine jobs, including the edge job's workers suite and `test:edge:db` (the NestJS parity files and `c1-worker`, on the one Worker).
- [ ] Independent review (Opus). This PR touches the auth dispatch and the vault, so it gets a second review too.
- [ ] SKIPPED: the parser container run, the R2 lifecycle rules, the hosted memory and CPU limits, and hosted resources (see the receipt).

Closes #117 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
