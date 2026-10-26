# Phase 6C: Release, operations and the closed beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Jotbun releasable without deploying anything: staging and production for the one Worker, deploy jobs that stay off until the owner says yes, the pages and association files the stores and passkeys need, the final emails, a break-glass tool with vault restores and staff deletions behind Cloudflare Access, release builds and store records, the owner's setup checklists with tested scripts, and the beta gate.

**Architecture:** `apps/edge/wrangler.jsonc` keeps the local environment at its top level and gains `env.staging` and `env.production`, built with `CLOUDFLARE_ENV` and checked against the owner's D33 values in `release/identity.json`. Hosted steps are scripts that print their commands and run them only with `--apply`, behind a preflight that refuses placeholders. Support access is a second Worker, `jotbun-breakglass`, behind Cloudflare Access: a read-only vault view, point-in-time restores and deletions asked by email, each grant audited by hashed user id in its own D1 database.

**Tech Stack:** wrangler 4.152.0 (environments, D1, KV, R2, Workflows, rollback); `@cloudflare/vite-plugin` 1.65.0; `@cloudflare/vitest-plugin` 1.4.7; Durable Object point-in-time recovery and synchronous KV; Cloudflare Access with jose 6.2.12; Email Service and Resend; Better Auth 1.6.33; PostHog's REST API and HogQL; `@posthog/cli` 0.18.10 and `posthog-react-native` 4.83.0; EAS; GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md): §8 item 6's release half, with §6.11, §6.14, §6.15, §7, §10, §5.2's account-deleted email and §5.3's `ox-email-deleted` fix.

## Shared files

Other plans edit these too; every P6C edit is additive and named in its task.
- `apps/edge/wrangler.jsonc` (P6C-T1, T2, T14b). **A later task that adds a top-level binding, var, queue, Workflow or Cron trigger adds it to both environment blocks in the same commit** (A20; `environments.test.ts` names what is missing), staging names suffixed `-staging`, switches off.
- `apps/edge/src/server.ts` (T2), `src/vault-worker.ts` (T1b), `src/cloudflare-workers.d.ts` (T3, T4, T10b), `src/vault/user-vault.ts` (T8, T10b), `src/auth/mailer.ts`, `email-copy.ts`, `env.ts` (T4, T5), `create-auth.ts` (T5, T10a), `src/deletion/steps.ts`, `test/workers/deletion.test.ts`, `test/workers/auth/mailer.test.ts` (T4), `src/deletion/request.ts`, `account-status.ts`, `account-plugin.ts`, `src/v1/account-gate.ts`, `migrations/auth/`, `test/workers/auth/schema.test.ts` (T10a), `src/routes/index.tsx` (T14), `vitest.workers.config.ts` (T9), `test/c1-worker.db.test.ts` (T2, T14), `test/release/environments.test.ts` (T1, T1b, T2, T9, T9b, T14b), `scripts/release/kv-seed.mjs` (T6; a later task adding a higher `*_MIN_CLIENT_VERSION`, such as P6B-T10, raises `RELEASE_CLIENT_MINIMUMS` in its commit), `apps/edge/package.json` scripts, `README.md`.
- Root `package.json` (`test:ops`: T7, T15); `.github/workflows/` (T7 adds `deploy.yml`, T9 one step; `backend.yml` untouched), `scripts/ci/backend-workflow.test.mjs` (T7); `apps/app/app.config.js`, `eas.json` (T12 to T14), `package.json` (T11, T12), `metro.config.js` (T12).
- `docs/operations/*.md`; `docs/implementation/handover.md` (T15), `beta-receipts.md` (1D-T15 first); `docs/implementation/premium-progress.md` (receipts under `## P6C: Release, operations and the closed beta`).

## Calls made in this plan

The builder's calls; the owner can overturn any.
- **Y1. Environments.** The top level stays local; each block repeats every non-inheritable key and the top level's `triggers` (A20), and inherits `limits`, `observability` and `migrations`. Workers `jotbun-edge-staging` and `jotbun-edge-production`; staging resources take `-staging`, production keeps the base names; each block sets `account_id` (the Jotbun account, D33), `workers_dev` and `preview_urls` false, and one custom domain.
- **Y2. `release/identity.json` holds every D33 value once,** with `confirmed_by_owner`. Placeholders are `.invalid` hosts, ids zero but for their last two hex digits, empty strings and the temporary bundle id; empty Google and survey ids are a choice (the button and the surveys stay hidden). Tests keep the Wrangler configs, `eas.json` and the store records in step with it.
- **Y3. Secrets are names only** (`release/secrets.json`, `docs/operations/secrets.md`). `/ready`'s three are `secrets.required` per environment, so `wrangler deploy` refuses a Worker without them; never at the top level, where it would stop local `.dev.vars` loading.
- **Y4. Workers Logs drop query strings,** because `/v1/history?query=` carries note and merchant text.
- **Y5. Environment builds** are `CLOUDFLARE_ENV=<env> vite build`, deployed with plain `wrangler deploy`; the break-glass Worker is bundled by Wrangler and takes `--env`.
- **Y6. Deploys live in `deploy.yml`,** skipped until the repository variable `JOTBUN_DEPLOYS` is `on`: staging after a green `backend` run of a push to this repository's `main`, production only by hand from `main` through the GitHub environment `production`, whose reviewers are the owner's approval.
- **Y7. Hosted scripts print, and apply only with `--apply`** after the preflight; resources are created by the owner from printed commands.
- **Y8. Pages are plain HTML from the Worker** (Thai then English, no script or external resource), served in staging and production only after E2.
- **Y9. One text per policy** feeds both its page and `config:v1`; production refuses draft text.
- **Y10. Association files serve passkeys only** (A21: `webcredentials`, `get_login_creds`); no v1 flow opens the app from a web link. A file with any missing id is 404.
- **Y11. One email layout from the boards:** inline styles, no image or remote resource, light only; only the deletion email has a reply-to.
- **Y12. App review signs in with one review address** whose six-digit code is a secret, never mailed or logged.
- **Y13. Break-glass** (A23, A37): its own Worker on an Access-protected host, JSON only, email lists for requesters and approvers; approved, audited `view` (`health` unless `records` is asked), `restore` and `delete` grants (P6C-T9, T10b, T9b), 30 minutes once approved; self-approval recorded; removing `ACCESS_AUD` is its off switch (every request 503), since it binds no `CONFIG` for C12's gates.
- **Y14. Restores hold the account** (A22; P6C-T10a: a D1 migration and five 1C files): `held` answers vault calls and sign-outs 503 while sign-in stays open; the high-water mark is stored on the grant before arming; a marker the restore removes proves it happened before the settle, which moves the revision and retention line past the mark, so every phone resyncs and no revision is reused; each finished stage is recorded once on the grant, so neither a resumed nor a repeated run restores twice.
- **Y15. Dashboards are one module;** a script makes the dashboards and trends insights through PostHog's API; funnels, retention, the HogQL insights, breakdowns and alerts are made by hand from the same module (their API shapes are unverified).
- **Y16. EAS builds with remote versions;** symbols upload only from store builds (the `production` profile), with `@posthog/cli` 0.18.10 (1D's L8) installed on the build machine, never in the repository; JavaScript source maps get their chunk ids from `metro.config.js`.
- **Y17. The north star** averages, over consenting people (at least one app event other than `$exception` and `account_deleted`) in the last 7 complete Bangkok days, their distinct Bangkok dates with `record_saved` or `slip_review_confirmed`.
- **Y18. Store records claim no more than is true:** never that Jotbun cannot read records, cashback as a count (D42), and `usesNonExemptEncryption` unset (SQLCipher; counsel answers).
- **B27 applied** (controller): no global Anthropic limiter; spend alerts (P6C-T11), the 429 watch (P6C-T15) and Q11.

## Owner questions

Each default is followed where used, marked "default pending owner Qn" (R26).
- **Q1. D33:** the Jotbun Cloudflare account on Workers Paid with the domain, a Zero Trust organisation, the Email Service domain, the Apple team id, the final app ids and Android signing fingerprints, the App Store Connect and Play apps, the EAS project, APNs and FCM, the PostHog EU project, the Anthropic key. Default: placeholders, `confirmed_by_owner: false`, every hosted step SKIPPED.
- **Q2. Hosts.** Default: production on the domain's apex, staging on `staging.`, break-glass on `ops.` and `ops-staging.`.
- **Q3. C9, the support address.** Default: empty; contact lines are left out, the production preflight refuses it and staging allows it.
- **Q4. Counsel:** the privacy notice and terms (with the operator's legal name), consent wording, crash reports without consent, held events, survey answers, the break-glass disclosure, Anthropic retention and zero retention, encryption export answers, the analytics copy. Default: drafts; production refuses them.
- **Q5. Listing text and the Play account type.** Default: drafts approved at E2; a personal account runs the closed test with at least 12 testers for 14 days in a row (Play help 14151465).
- **Q6. Spend alerts (B27).** Default: 50%, 80% and 100% of US$100 a month, for Cloudflare and for Anthropic.
- **Q7. The R2 analytics copy.** Default: a 90-day lifecycle rule, pending counsel.
- **Q8. Break-glass approvers.** Default: the owner, in `BREAKGLASS_APPROVERS` behind an Access group; self-approval recorded.
- **Q9. Grant length and audit retention.** Default: 30 minutes approved, 24 hours pending, audit kept 365 days.
- **Q10. EAS Build and `eas-cli`** (not in §4). Default: `eas.json` committed and tested; the owner runs `eas-cli`; builds SKIPPED.
- **Q11. A global Anthropic limiter (B27).** Default: none; revisit if the beta shows 429s.
- **Q12. The review sign-in.** Default: built, off until both secrets exist, the code changed after each review.
- **Q13. The north star (Y17).** Default: as Y17.
- **Q14. When a vault is restored.** Default: only to undo damage the person reports, with their written yes cited as the grant's ticket reference, after telling them what is lost.

## Global Constraints

- **Nothing is deployed and no cloud resource is created** (§4, D33); hosted, native, store and device checks are **SKIPPED** with their reason; anything touching Cloudflare, PostHog, EAS or a store runs only with `--apply`, after the owner's yes.
- **Packages (§4):** no new repository package; `posthog-cli` (approved) only on build machines; the Tech Stack's versions as installed; no lockfile regeneration.
- **D33:** every environment names the Jotbun account. **Identity (§6.2):** a vault is named only from a verified `sub` or an approved grant, `idFromName` with `locationHint: 'apac'`. **C17:** no tool creates `account_state`, opens, or restores a deleting, deleted, erased or unknown account.
- **Logging (§4):** `failureName` only; never an email, user id, code, token, key or body; audit rows hold hashed user ids.
- **Never sent to PostHog** (§7); dashboards name only 1D-T1's `APP_EVENTS`, the server events and PostHog's own.
- **Gates (C12):** kill switches stay in `config:v1`; the seed writes only its three keys and keeps the paused scopes it finds. New main-Worker routes are public `GET` pages and files; the break-glass Worker's staff routes sit behind Access and its off switch instead (Y13).
- **Copy (§4, §5.1):** Thai first, English beside it, no emojis, no em-dashes, board lines verbatim, other lines drafts until E2 (P6C-T14); Bangkok time, Buddhist year in Thai.
- **Migrations:** D1 numbers are taken at integration: `migrations/auth/NNNN_account_hold.sql`; the new database starts at `migrations/breakglass/0001_breakglass.sql`.
- **Process (handover §4):** behavioural RED on typed stubs (R52), its counts recorded; GREEN, a mutation check, the gate, a receipt, a local commit with the attribution trailer, an independent read-only review; never a bare `git stash`; nothing under `vendor/`.
- **Gates to run:** edge `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge && npm run test:edge:db`; app `npm run typecheck:app && npm run test:unit && npm run test:render -w gogospend-app && npm run export:web -w gogospend-app -- --max-workers 2`; `npm run test:ops`; `git diff --check`.

## Review Focus

1. **A staging deploy touching production data, or a deploy to the wrong account** (P6C-T1 `staging names no production resource, and production no staging one`; P6C-T6 `the account must be the identity's`).
2. **Note or merchant text in a URL reaching Workers Logs** (P6C-T1 `observability redacts query strings in every environment`).
3. **A break-glass grant used by someone else, after 30 minutes, or with a forged or other-application token** (P6C-T9's access cases and `another person cannot read someone's grant`).
4. **A restored vault while phones hold later cursors, or a vault restored twice or never** (P6C-T10b `after a restore every older cursor is 410, and no revision is used twice`; `a run that stopped after releasing the hold never restores again`; `a prepare that fails before arming is never settled, and the grant stays running`).
5. **A deleted or erased person reopened, restored or deleted again by tooling** (P6C-T8 `a never-used vault is unknown, and nothing is created`; P6C-T9 `a deleting or erased account cannot be opened`; P6C-T9b `a delete grant for a held, deleting, deleted or erased account is refused`; P6C-T10b `a restore is refused for a deleting, deleted, erased or unknown account`).

---

## File structure

```
release/                   identity.json, secrets.json (T1; T5, T9 add rows)
apps/edge/                 wrangler.jsonc blocks (T1, T2); wrangler.breakglass.jsonc (T9, T9b); content/policies (T3); migrations/breakglass (T9), migrations/auth/NNNN_account_hold.sql (T10a)
apps/edge/scripts/release/ jsonc, identity, check-environments (T1); preflight, kv-seed, d1-migrate, provision (T6); smoke, rollback (T7)
apps/edge/src/             background/queue-kind (T1b); web/ (T2, T3); server/web.ts (T2, T3); auth/email-layout (T4), review-access (T5); vault/support (T8), restore (T10b); breakglass/ (T9, T9b, T10b)
apps/app/                  eas.json, metro.config.js, releaseConfig.js, scripts/eas-pre-install.mjs (T12); store/ (T13); src/analytics/dashboards.ts, scripts/posthog-dashboards.mjs (T11)
.github/workflows/deploy.yml, scripts/ci/workflow-yaml.mjs (T7); scripts/ops/beta-gate.mjs (T15)
docs/operations/           secrets (T1), deletion (T4, T9b), release (T6), rollback (T7), breakglass (T9), restore (T10b), owner-setup, retention, incident (T11), beta (T15); deleted: auth0-runbook (T6), e1-setup (T11)
```

**Lanes:** T1, T8, T10a and T11 first; then T1b (after P4-T5 (P4:push)), T2, T4, T5, T12; T3, T6, T7 in turn; T9 after T7 and T8; T9b after T9 and T4; T10b after T9 and T10a; T13 after T3, T5, T12; T14 after T4 and T13; T14b after T7 and T14; T15 last.

---

### Task P6C-T1: Staging and production in the Worker's configuration, the D33 values and the secrets inventory

**Starts after:** 1B-T13, 1C-T10b, 1C-T11
The configuration half of `P6C-T7 (P6C:environments)`; P6C-T7 delivers it.

**Files:**
- Create: `release/identity.json`, `release/secrets.json`, `apps/edge/scripts/release/jsonc.mjs`, `identity.mjs`, `check-environments.mjs`, `docs/operations/secrets.md`
- Modify: `apps/edge/wrangler.jsonc` (both blocks; top-level vars `SUPPORT_EMAIL: ""` and `ANTHROPIC_BASE_URL: ""`; `observability.redact_query_string: true`), `apps/edge/package.json` (`"check:envs": "node scripts/release/check-environments.mjs"`; 1B-T13's `deploy` becomes a `node -e` that prints `deploys run from .github/workflows/deploy.yml; see docs/operations/release.md` and exits 1), `apps/edge/README.md` ("Environments")
- Test: `apps/edge/test/release/environments.test.ts` (Node)

**Interfaces:**
- Consumes: 1B-T13's `wrangler.jsonc` (comments on their own lines, no trailing commas); 1C's databases, `send_email`, Workflow, vars and secrets; P3's `ANTHROPIC_BASE_URL` (`""` is the SDK default); 1C-T2's `scripts/check-dist.mjs`.
- Produces (`.mjs` files; the types are JSDoc):
  ```ts
  // scripts/release/jsonc.mjs
  export function readJsonc(path: string): unknown        // JSON.parse after dropping whole-line // comments
  // scripts/release/identity.mjs
  export const ENVIRONMENTS = ['staging', 'production']
  export const IDENTITY_PATH                              // <repo>/release/identity.json, from import.meta.url
  export function readIdentity(path = IDENTITY_PATH): Identity   // the shape below
  export function isPlaceholderId(id: string): boolean    // /^0{30}[0-9a-f]{2}$/ or /^00000000-0000-0000-0000-0000000000[0-9a-f]{2}$/
  export function isPlaceholderHost(host: string): boolean   // '' or ending '.invalid'
  export function placeholderFields(identity: Identity, env?: 'staging' | 'production'): string[]   // dotted paths still placeholders, 'confirmed_by_owner' while false; with env, only those it needs (staging: confirmed_by_owner, cloudflare_account_id, hosts.staging, hosts.ops_staging, email_from.staging; production: all)
  export function hostFor(identity: Identity, env: 'staging' | 'production'): string   // hosts.staging or hosts.production
  export function googleClientIds(identity: Identity): string   // the non-empty google_client_ids, web then ios, joined with ','; '' while both are empty
  // scripts/release/check-environments.mjs
  export function assertFlattened(env, built, identity): string[]   // problems in a built dist/server/wrangler.json
  ```
- `release/identity.json` (default pending owner Q1 to Q3): `{ "confirmed_by_owner": false, "cloudflare_account_id": "00000000000000000000000000000000", "hosts": { "staging": "staging.jotbun.invalid", "production": "jotbun.invalid", "ops_staging": "ops-staging.jotbun.invalid", "ops_production": "ops.jotbun.invalid" }, "email_from": { "staging": "Jotbun <no-reply@staging.jotbun.invalid>", "production": "Jotbun <no-reply@jotbun.invalid>" }, "support_email": "", "app_scheme": "gogospend", "ios_bundle_id": "co.gogocash.jotbun.localcheck", "android_package": "co.gogocash.spend", "apple_team_id": "", "android_cert_sha256": [], "app_store_id": "", "access_team_domain": "", "google_client_ids": { "web": "", "ios": "" }, "eas_project_id": "", "eas_owner": "", "posthog_project_token": "", "posthog_survey_ids": {} }` (P6A's temporary ids; the bundle id counts as a placeholder, empty Google and survey ids do not, Y2; the survey ids are P6B-T13's `SurveyIds`).
- The blocks (Y1); production differs from staging only by base names, its host, the `production` values and ids ending `21`, `22`, `23` where staging's end `11`, `12`, `13`:

  | Key | `env.staging` |
  | --- | --- |
  | `name`, `account_id`, `workers_dev`, `preview_urls` | `jotbun-edge-staging`, the identity account, `false`, `false` |
  | `routes` | `[{ "pattern": hosts.staging, "custom_domain": true }]` |
  | KV, R2 | `CONFIG` id `00000000000000000000000000000011`; `OBJECTS` `jotbun-private-objects-staging` |
  | D1 | `jotbun-auth-staging`, `jotbun-erasure-staging` and P4's `jotbun-catalog-staging` (when present at the top level, A20), ids `00000000-0000-0000-0000-000000000011` to `...13`, the top level's `migrations_dir` |
  | Workflows, queues, containers, Durable Objects, `send_email`, `triggers` | the top level's entries (P4's `PUSH_QUEUE` and P5-T7's Cron when present, A20); each Workflow and queue name suffixed `-staging`, bindings and class names unchanged (P6C-T1b dispatches queues by kind) |
  | `secrets` | `{ "required": ["BETTER_AUTH_SECRET", "COMMAND_DIGEST_KEY", "ERASURE_KEY"] }` |
  | `vars` | `JOTBUN_ENV` `staging`; `AUTH_BASE_URL`, `AUTH_ISSUER` `https://` + host; `AUTH_AUDIENCE` `jotbun-v1`; `AUTH_TRUSTED_ORIGINS` app_scheme + `://`; `EMAIL_FROM`, `SUPPORT_EMAIL`, `APPLE_BUNDLE_ID` from identity; `GOOGLE_CLIENT_IDS` `googleClientIds(identity)`; `EMAIL_SECONDARY` `off`; every switch (`AI_ENABLED`, `GOGOCASH_BRIDGE_ENABLED`, `IMPORT_UPLOADS_ENABLED`) `"false"` until P6C-T14b; `ANTHROPIC_BASE_URL` `https://gateway.ai.cloudflare.com/v1/<account>/jotbun-staging/anthropic`; when present at the top level (A20), P4's `SLIP_IMPORT_ENABLED` and `PUSH_SEND_ENABLED` `"false"`, P5's `FX_FEED` `fixture` (production `""` until D31's provider, P5-T7) and any other plan's var |

- `release/secrets.json` rows `{ name, where: 'edge' | 'breakglass' | 'github' | 'eas', required, source: 'generated' | 'D33' | 'owner', task, note }`: edge `COMMAND_DIGEST_KEY` (generated, required, 1A-T3), `COMMAND_DIGEST_PREVIOUS_KEYS` (rotation), `BETTER_AUTH_SECRET` (generated, required, 1C-T1), `ERASURE_KEY` (generated, required, 1C-T4), `RESEND_API_KEY` (1C-T2), `APPLE_CLIENT_SECRET` and `GOOGLE_CLIENT_SECRET` (D33, 1C-T3), `ANTHROPIC_API_KEY` (D33, 1B-T7), `AI_GATEWAY_TOKEN` (P3's gateway question), `POSTHOG_PROJECT_TOKEN`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` (D33, 1D-T3, 1D-T13), `ANALYTICS_ID_KEY` (generated, never rotated, 1D-T11), P4's `EXPO_ACCESS_TOKEN` (owner), P5's `FX_API_KEY` (D31, only if the provider needs one); github `CLOUDFLARE_API_TOKEN`; eas `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID`. A secret a later task adds joins the file in that task.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs (R52): `readIdentity` returns `{}`, `placeholderFields` and `assertFlattened` return `[]`; the two JSON files are data. `environments.test.ts`:
  - `every non-inheritable binding and var at the top level is declared in each environment`: for `vars` keys, `kv_namespaces`, `r2_buckets`, `d1_databases`, `workflows`, `durable_objects.bindings`, `queues.producers`, `queues.consumers` (count), `send_email`, `containers` and `triggers.crons`, each block's set equals the top level's; the message names the key and the block.
  - `staging names no production resource, and production no staging one`: every bucket, database, Workflow and queue name in staging ends `-staging`, none in production does; the KV and D1 ids of the three levels are pairwise different.
  - `each environment names its Worker, the identity account and its own custom domain, and never workers.dev`.
  - `observability redacts query strings in every environment`: the top level has `{ enabled: true, redact_query_string: true }`; no block sets `observability`.
  - `required secrets are declared per environment and only there`: no top-level `secrets`; each `secrets.required`, sorted, equals the required `edge` names of `release/secrets.json`.
  - `no secret name is ever a plain var`.
  - `the hosts, sender, support address, Google client ids and app ids come from release/identity.json` (`GOOGLE_CLIENT_IDS` is `""` while both ids are empty, and one id alone has no comma).
  - `AI goes through this account's AI Gateway in staging and production`: each block's `ANTHROPIC_BASE_URL` matches `^https://gateway\.ai\.cloudflare\.com/v1/<account>/jotbun-<env>/anthropic$` with the identity account; the top level's is `""`.
  - `every placeholder is reported`: `placeholderFields(readIdentity())` includes `confirmed_by_owner`, `cloudflare_account_id`, `hosts.production`, `email_from.production`, `support_email`, `ios_bundle_id`, `apple_team_id`, `android_cert_sha256`, `app_store_id`, `access_team_domain`, `eas_project_id`, `eas_owner` and `posthog_project_token`, and never `google_client_ids` or `posthog_survey_ids`.
  - `a built staging configuration that names a production resource is refused`: on a fixture whose bucket is `jotbun-private-objects`, `assertFlattened('staging', …)` returns one problem naming `OBJECTS`; a correct fixture gives `[]`.
  - `no package script deploys without an environment`: `deploy` exits 1 naming `docs/operations/release.md`, and no script runs `wrangler deploy` without `--env` or `CLOUDFLARE_ENV`.
- [ ] **Step 2: Run it and see it fail.** Run: `npm run test:edge -- test/release/environments.test.ts`. Expected: every case fails on its assertions against the stubs, except `no secret name is ever a plain var` (a guard).
- [ ] **Step 3: Implement.** `check-environments.mjs`, per environment: `npx vite build` with `CLOUDFLARE_ENV=<env>`; `node scripts/check-dist.mjs`; `assertFlattened` on `dist/server/wrangler.json`; `npx wrangler deploy --dry-run --containers-rollout none --outdir .wrangler/release/<env>`; a copy of the built config to `.wrangler/release/<env>.wrangler.json`. It ends with a plain `npx vite build` so `dist/` is the local build again, prints `check:envs ok <env>`, and exits 1 on any problem.
- [ ] **Step 4: Run it and see it pass,** then `npm run check:envs --prefix apps/edge` and the edge gate (`c1-shape.test.ts` unchanged).
- [ ] **Step 5: Mutation check.** Drop `PARSE_QUEUE` from staging; give staging the production bucket; remove `redact_query_string`; move `secrets` to the top level: each fails its case.
- [ ] **Step 6: Docs.** `secrets.md`: per secret, what it is, where it is set (`wrangler secret put <NAME> --env <env> -c wrangler.jsonc`, a GitHub environment secret, an EAS secret), who provides it, rotation, generated values from `openssl rand -base64 48`, and that `wrangler deploy` refuses a Worker missing a required one. README: the blocks, Y1's names, `npm run check:envs`, nothing deployed before the owner's yes.
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: every hosted resource (Q1). `git commit -m "Describe staging and production for the one Worker, with the D33 values and secret names in one place"`

---

### Task P6C-T1b: Queue batches dispatched by kind, so staging's suffixed queues reach their consumers

**Starts after:** P6C-T1, P4-T5 (P4:push)

**Files:**
- Create: `apps/edge/src/background/queue-kind.ts` (pure)
- Modify: `apps/edge/src/vault-worker.ts` (its `queue` handler), `test/release/environments.test.ts`
- Test: `apps/edge/test/queue-kind.test.ts` (Node)

**Interfaces:**
- Consumes: P4-T5's `queue` handler (`jotbun-push` to `handlePushBatch`, any other name to 1B-T5's `handleParseBatch`); `MessageBatch.queue`; `logFailure`.
- Produces:
  ```ts
  export type QueueKind = 'push' | 'parse'
  export function queueKindOf(queueName: string): QueueKind | null   // one trailing '-staging' stripped; 'jotbun-push' push, 'jotbun-statement-parse' parse, else null
  export function dispatchQueueBatch<M>(batch: MessageBatch<M>, env: V1Env, handlers: Record<QueueKind, (batch: MessageBatch<M>, env: V1Env) => Promise<void>>): Promise<void>   // null: each message acked, logFailure('queue_unknown', new UnknownQueue())
  ```

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `queueKindOf` returns `null`, `dispatchQueueBatch` resolves. With spy handlers and fake batches:
  - `a staging-named push batch reaches the push consumer` (`jotbun-push-staging`, and `jotbun-push`).
  - `a staging-named parse batch reaches the parse consumer` (`jotbun-statement-parse-staging`).
  - `an unknown queue is acknowledged and logged by failureName` (`jotbun-other`: every message acked, no handler called, one line `{ event: 'queue_unknown', failure: 'UnknownQueue' }`).
  - `environments.test.ts`: `every consumer queue of each block maps to a kind`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/queue-kind.test.ts test/release/environments.test.ts`. Expected: every new case fails against the stubs.
- [ ] **Step 3: Implement** `queueKindOf` and `dispatchQueueBatch` in `src/background/queue-kind.ts`; `vault-worker.ts`'s `queue` calls `dispatchQueueBatch(batch, env, { push: handlePushBatch, parse: handleParseBatch })`.
- [ ] **Step 4: Run them and see them pass,** then the Workers suite (P4's push and 1B's parse cases unchanged) and the edge gate.
- [ ] **Step 5: Mutation check.** Compare the raw queue name: both staging cases fail.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Dispatch queue batches by kind, so staging's suffixed push and parse queues reach their consumers"`

---

### Task P6C-T2: The association files for passkeys

**Starts after:** P6C-T1, P6A-T1 (P6A:native-ids)
**Delivers:** P6C:association-files

**Files:**
- Create: `apps/edge/src/web/association.ts` (pure), `apps/edge/src/server/web.ts` (glue: `env` from `cloudflare:workers`, as 1C's `src/server/auth.ts`)
- Modify: `apps/edge/src/server.ts` (`const web = handleWeb(request); if (web) return web`, after 1D-T2's proxy and 1C's `/api/auth/*`), `wrangler.jsonc` (top-level vars `APPLE_TEAM_ID`, `ANDROID_PACKAGE`, `ANDROID_CERT_SHA256`, `PASSKEY_ORIGINS` `""` and `PASSKEY_RP_ID` `"localhost"`, as 1C-T1's default; both blocks from identity), `scripts/release/identity.mjs` (`passkeyOrigins`), `test/c1-worker.db.test.ts`, `test/release/environments.test.ts`
- Test: `apps/edge/test/association.test.ts` (Node)

**Interfaces:**
- Consumes: `readIdentity`, `hostFor` (P6C-T1); 1C-T1's `APPLE_BUNDLE_ID`, `PASSKEY_RP_ID`, `PASSKEY_ORIGINS`; P6A-T1's `IOS_BUNDLE_ID_PATTERN` and `ANDROID_PACKAGE_PATTERN` (A36), imported from `apps/app/src/wallet/outside/outsideIds.ts`, never copied. P6B's passkey offer reads these files (B22).
- Produces:
  ```ts
  // scripts/release/identity.mjs
  export function passkeyOrigins(identity: Identity, env: 'staging' | 'production'): string   // 'https://' + host, then per android_cert_sha256 'android:apk-key-hash:' + base64url (no padding) of its 32 bytes, joined with ','
  // src/web/association.ts
  export type AssociationSettings = { APPLE_TEAM_ID?: string; APPLE_BUNDLE_ID?: string; ANDROID_PACKAGE?: string; ANDROID_CERT_SHA256?: string }
  export const AASA_PATH = '/.well-known/apple-app-site-association'
  export const ASSETLINKS_PATH = '/.well-known/assetlinks.json'
  export function appleAssociation(s: AssociationSettings): { webcredentials: { apps: string[] } } | null
  export function androidAssociation(s: AssociationSettings): { relation: string[]; target: { namespace: 'android_app'; package_name: string; sha256_cert_fingerprints: string[] } }[] | null
  export function serveAssociation(request: Request, s: AssociationSettings): Response | null   // null: not one of the two paths
  // src/server/web.ts
  export function handleWeb(request: Request): Response | null    // P6C-T3 adds pages
  ```
- Rules (Y10): the team id is `/^[A-Z0-9]{10}$/`, the bundle id and package match P6A-T1's patterns, and `ANDROID_CERT_SHA256` is a comma list of `/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/`; anything missing or malformed makes that file `null`, answered 404 `{ code: 'NOT_FOUND' }`. `GET` and `HEAD` answer 200 with `content-type: application/json` and `cache-control: public, max-age=3600`; other methods 405; exact paths only, never a redirect. Block values: the three ids from identity (fingerprints joined with `,`), `PASSKEY_RP_ID` the host, `PASSKEY_ORIGINS` `passkeyOrigins`.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs return `null`. With `S = { APPLE_TEAM_ID: 'ABCDE12345', APPLE_BUNDLE_ID: 'th.co.jotbun.app', ANDROID_PACKAGE: 'th.co.jotbun.app', ANDROID_CERT_SHA256: `${FP1},${FP2}` }`:
  - `the Apple file names the team and the bundle for passkeys`: `{ webcredentials: { apps: ['ABCDE12345.th.co.jotbun.app'] } }`.
  - `the Android file names the package and every signing fingerprint`: `[{ relation: ['delegate_permission/common.get_login_creds'], target: { namespace: 'android_app', package_name: 'th.co.jotbun.app', sha256_cert_fingerprints: [FP1, FP2] } }]`.
  - `a missing or malformed id serves 404, never a wrong file` (team `ABC`, an empty bundle, the package `th.co.jotbun-app`, fingerprint `zz`; the package `th.co.jotbun_check` is served).
  - `the files are JSON at the exact paths`: both headers; `HEAD` 200; `POST` 405; `/.well-known/apple-app-site-association.json` and `/.well-known/assetlinks` give `null`.
  - `environments.test.ts`: `passkeys and association ids come from release/identity.json, and the top level keeps localhost` (the fingerprint `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C` adds the origin `android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w`).
  - `c1-worker.db.test.ts`: `the built Worker serves the association files when configured, and 404 when not`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/association.test.ts test/release/environments.test.ts`, then `npm run build:edge && npm run test:edge:db -- test/c1-worker.db.test.ts`. Expected: every case fails against the `null` stubs.
- [ ] **Step 3: Implement** `appleAssociation`, `androidAssociation` and `serveAssociation` in `src/web/association.ts`, `handleWeb` in `src/server/web.ts`, `passkeyOrigins`, the `server.ts` line and the vars.
- [ ] **Step 4: Run them and see them pass,** then the edge gate and `npm run check:envs --prefix apps/edge`.
- [ ] **Step 5: Mutation check.** Serve the Apple file without a team id; accept the `.json` variant; drop the second fingerprint; check the package with the iOS pattern; pad the Android origin: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** SKIPPED: Apple's and Google's checks on the real domain (D33). `git commit -m "Serve the passkey association files from the Worker, only when every id is real"`

---

### Task P6C-T3: The privacy, account deletion and support pages, and one text for each policy

**Starts after:** P6C-T2

**Files:**
- Create: `apps/edge/content/policies/privacy.th.md`, `privacy.en.md`, `terms.th.md`, `terms.en.md`, `status.json`; `apps/edge/src/web/layout.ts`, `policy-text.ts`, `policies.ts`, `page-copy.ts`, `pages.ts` (pure)
- Modify: `apps/edge/src/server/web.ts` (pages after the association files), `src/cloudflare-workers.d.ts` (`declare module '*.md?raw' { const text: string; export default text }`)
- Test: `apps/edge/test/pages.test.ts` (Node)

**Interfaces:**
- Consumes: `handleWeb` (P6C-T2); `SUPPORT_EMAIL` (P6C-T1); §5.1's tokens.
- Produces:
  ```ts
  // content/policies/status.json: { "terms": { "version": 1, "status": "draft" }, "privacy": { "version": 1, "status": "draft" } }
  // src/web/policy-text.ts: no imports at all, so P6C-T6's Node scripts load it by type stripping
  export type PolicyKind = 'terms' | 'privacy'
  export function withSupport(source: string, supportEmail: string | null): string  // replaces {support}; null drops each line holding it (default pending owner Q3)
  export function plainPolicyText(source: string): string    // drops '## ', turns '- ' into '• '
  export function policyHtml(source: string): string          // blocks on blank lines: '## ' a heading, all-'- ' a list, else a paragraph; escaped
  // src/web/policies.ts
  export function policySource(kind: PolicyKind, locale: 'th' | 'en'): string       // the ?raw file
  // src/web/layout.ts
  export function escapeHtml(text: string): string
  export function pageDocument(o: { title: string; th: string; en: string; draft: boolean }): string
  // src/web/pages.ts
  export const PAGE_PATHS = { privacy: '/privacy', deletion: '/delete-account', support: '/support' } as const
  export type PageId = keyof typeof PAGE_PATHS
  export const APPROVED_PAGES: readonly PageId[] = []         // P6C-T14 fills it after E2
  export const PAGE_HEADERS: Readonly<Record<string, string>>
  export function servePage(request: Request, env: { JOTBUN_ENV?: string; SUPPORT_EMAIL?: string }): Response | null
  ```
- `servePage` (Y8): `null` for other paths; 405 unless `GET` or `HEAD`; outside `APPROVED_PAGES`, 404 unless `JOTBUN_ENV` is `local` or `test`, where it renders with the ribbon `ร่าง · Draft`; else 200 with `content-type: text/html; charset=utf-8`, `cache-control: public, max-age=300`, `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
- `pageDocument`: `<html lang="th">`, a viewport meta, §5.1's light tokens and, under `prefers-color-scheme: dark`, its dark ones; `'Anuphan', 'DM Sans', system-ui, sans-serif`, nothing loaded; the `lang="th"` section before the `lang="en"` one; a mailto button at least 44 px tall.
- Copy (drafts for E2 in `page-copy.ts`; board lines verbatim). **Deletion:** `ลบบัญชี Jotbun`; in the app `ฉัน › ความเป็นส่วนตัวและข้อมูล › ลบบัญชี`; st-delete's `บันทึกรายจ่ายทุกรายการ และรูปใบเสร็จ`, `กระเป๋าเงิน งบประมาณ และการตั้งค่า`, `ลบเสร็จภายใน 24 ชั่วโมงหลังส่งคำขอ`, and `บัญชี Jotbun ของคุณ` (a draft); `ข้อมูลในสำเนาสำรองจะหมดอายุไปเองภายใน 30 วัน`; the hashed account number kept 60 days (C17); without the app, an email from the sign-in address to `{support}` with the subject `ขอลบบัญชี Jotbun`, confirmed with that address before anything is deleted (P6C-T9b); ox-email-deleted's GoGoCash line. **Support:** `ช่วยเหลือ`; `ติดต่อทีม Jotbun` as the mailto button; send the code the app shows (es-error-generic), the time and the screen; sign-in codes last 10 minutes; offline records stay on the phone and send later (§5.1); export at `ฉัน › ความเป็นส่วนตัวและข้อมูล › ส่งออกข้อมูล`; links to both other pages. **Privacy notice** (default pending owner Q4): the operator `[ชื่อผู้ให้บริการ]`; what is kept; no bank connection, never sold, no ads; Cloudflare (vaults hinted to Asia Pacific), PostHog in the EU (analytics only after `ช่วยพัฒนา Jotbun` is yes, replay masked; while the crash switch is on, scrubbed crash and error reports, never records, go without that yes), Anthropic (Bun AI only once turned on; slip images never kept), Expo (push without amounts), Resend (sign-in and deletion email, only if turned on), Apple and Google when used; export, deletion in 24 hours, the backups line, 60 days for the hashed number; staff never open records except an owner-approved, logged support opening (Y13), its audit kept 365 days under a keyed hash; PDPA rights and `{support}`. **Terms** (default pending owner Q4): a diary, never a bank; Bun's drafts are checked before saving; no investment or loan advice; GoGoCash is a sister service with its own account; cashback as a count.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `servePage` returns `null`, renderers `''`, content files one line. `pages.test.ts` (`get(path, env)` calls `servePage`):
  - `a draft page is served locally with its ribbon and refused in production`.
  - `pages load nothing from outside and run nothing`: no `<script`, `src=`, `url(` or `http://`; every `href` relative or `mailto:`; the CSP exact.
  - `Thai comes first, then English`.
  - `the privacy notice names every processor, region and period, in both languages`: `Cloudflare`, `PostHog`, `Anthropic`, `Expo`, `Resend`, `24`, `30`, `60`, `365`; Thai `ช่วยพัฒนา Jotbun`; English `EU`.
  - `the privacy notice discloses crash reports sent without consent, in both languages`: Thai `รายงานแอปขัดข้อง` and `โดยไม่ต้องตอบว่าใช่`; English `crash reports` and `without your yes`.
  - `no page or policy says Jotbun cannot read records`: nothing matches `/cannot read|can't read|ไม่สามารถอ่าน|อ่านไม่ได้|end-to-end/i`.
  - `no page or policy shows a cashback amount`: nothing matches P6C-T13's `/(เงินคืน|แคชแบ็ก|cashback)[^.]*฿|฿[^.]*(เงินคืน|แคชแบ็ก|cashback)/i`.
  - `the deletion page gives the in-app path, what goes, the timing and the way without the app` (with `SUPPORT_EMAIL` `help@jotbun.test`: `mailto:help@jotbun.test?subject=` and the GoGoCash line).
  - `without a support address the contact lines are left out, not broken`: no `mailto:`, no `{support}`.
  - `policy text: headings, lists and escaping`: `policyHtml('## A\n\n- x\n- y\n\n<b>')` is `'<h2>A</h2><ul><li>x</li><li>y</li></ul><p>&lt;b&gt;</p>'`; `plainPolicyText('## A\n\n- x')` is `'A\n\n• x'`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/pages.test.ts`. Expected: every case fails against the stubs, except the two anti-goal cases (records, cashback), which pass as guards.
- [ ] **Step 3: Write the drafts and implement.**
- [ ] **Step 4: Run them and see them pass,** then the edge gate.
- [ ] **Step 5: Mutation check.** Serve unapproved pages in production; drop escaping; put English first: each fails its case.
- [ ] **Step 6: Receipt, commit.** Drafts until E2 (P6C-T14) and counsel (default pending owner Q4). `git commit -m "Add the privacy, account deletion and support pages as drafts, with one text per policy"`

---

### Task P6C-T4: The final emails: the boards' HTML, the deletion email's reply-to, and the deletion runbook

**Starts after:** 1C-T11, 1C-T13, 1D-T13, P6C-T1, P6B-T0 (P6B:deletion-code)

**Files:**
- Create: `apps/edge/src/auth/email-layout.ts` (pure)
- Modify: `apps/edge/src/auth/email-copy.ts` (both emails' `html`; the deletion email's lines), `mailer.ts` (`replyTo`; `DeletionNotice`), `env.ts` (`SUPPORT_EMAIL?: string`), `src/cloudflare-workers.d.ts` (`EmailBinding.send`'s message gains `replyTo?: string`), `src/deletion/steps.ts` (`sendDeletionEmail` passes `fromApp`, and the row's `requested_at` unless 1C-T11 already does), `docs/operations/deletion.md` (rewritten)
- Test: `apps/edge/test/email-copy.test.ts` (Node); two cases in `test/workers/auth/mailer.test.ts`; in `test/workers/deletion.test.ts`, one new case, and 1C-T11's case `the deletion email follows ox-email-deleted …` updated: it passes `fromApp: true` and expects `deletionShortCode(requestId)` where it expected the reference

**Interfaces:**
- Consumes: 1C-T2's `EmailMessage`, `cloudflareTransport`, `resendTransport`, `transportMailer`, `mailerFromEnv`, `signInCodeEmail`; 1C-T11's `DeletionNotice`, `deletionEmail`, `sendDeletionEmail` and `deletion_requests.requested_at` and `client_id`; `deletionShortCode(requestId: string): string` from `@gogospend/contracts` (P6B-T0, A12).
- Produces:
  ```ts
  // src/auth/email-layout.ts
  export function emailDocument(o: { lang: 'th' | 'en'; title: string; card: string; footer: string }): string
  export function emailHeading(text: string): string                       // 22px/700, line-height 1.4
  export function emailText(text: string, tone?: 'ink' | 'quiet'): string  // 14px/1.55; quiet #4A4756
  export function emailList(items: readonly string[]): string
  export function emailBox(strong: string, quiet: string): string          // #F4F3F9, radius 16, padding 10px 12px
  export function emailCode(code: string): string                          // DM Sans 700, letter-spacing 0.02em
  export function emailReference(label: string, value: string): string
  // mailer.ts: EmailMessage gains replyTo?: string; cloudflareTransport passes replyTo, resendTransport reply_to
  // mailer.ts: DeletionNotice = { to: string; locale: 'th' | 'en'; reference: string; requestedAt: number; fromApp: boolean }
  //   requestedAt: the row's requested_at (epoch ms); fromApp: false when its client_id is 'breakglass' (P6C-T9b)
  // email-copy.ts: deletionEmail(notice: DeletionNotice, replyTo?: string | null): EmailMessage
  ```
- Layout (Y11, from ox-email-code and ox-email-deleted): a full-width table on `#F4F3F9`; a white card (`border-radius:22px`, `padding:16px 18px 14px`, at most 560 px) headed by a 30 px `#D9CCFF` tile beside `Jotbun` in DM Sans 17/700; ink `#111014`; the footer outside the card, 12px `#6B6878`; `'Anuphan', 'DM Sans', -apple-system, 'Segoe UI', sans-serif`; inline styles; `<meta name="color-scheme" content="light">`; no image and no link but `mailto:`; all text escaped.
- The deletion email, `text` and `html` alike, carries ox-email-deleted's Thai lines verbatim and in order: subject `ลบบัญชี Jotbun ของคุณแล้ว`; `ลบบัญชีของคุณแล้ว`; `เราได้รับคำขอเมื่อ {requested} ขอบคุณที่ให้บันช่วยจดมาตลอดนะ`; `สิ่งที่ถูกลบ` with `บันทึกรายจ่ายทุกรายการ และรูปใบเสร็จ`, `กระเป๋าเงิน งบประมาณ และการตั้งค่า`, `บันทึกในโทรศัพท์เครื่องที่ส่งคำขอ` (only when `fromApp`) and `บัญชี Jotbun ของคุณ` (a draft; the request keeps no sign-in method); `ลบถาวรภายใน {deadline}` and `หลังจากนั้นกู้คืนไม่ได้ คุณไม่ต้องทำอะไรเพิ่ม`; then §5.3's `ข้อมูลในสำเนาสำรองจะหมดอายุไปเองภายใน 30 วัน`; `emailReference('หมายเลขคำขอ', deletionShortCode(notice.reference))`; the reply lines; the GoGoCash line. `{requested}` is `requestedAt` and `{deadline}` 24 hours later, in Bangkok time as the board writes them (`24 ต.ค. 2569 เวลา 14:32 น.`). English is the same parts as `// DRAFT` lines for E2 (P6C-T14). The request id itself is never printed.
- `mailerFromEnv` hands `env.SUPPORT_EMAIL` (trimmed, empty is none; default pending owner Q3) to the deletion notice. The reply line (`ถ้าคุณไม่ได้ขอลบบัญชี หรือมีคำถาม`, `ตอบกลับอีเมลนี้ พร้อมหมายเลขคำขอ ทีมงานจะติดต่อกลับ`) appears only with a reply-to; the code email never has one.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs return `''`. With `N = { to: 'a@example.test', locale: 'th', reference: '0b3f2c1e-6a4d-4f6e-9a51-2f3c4d5e6f70', requestedAt: Date.parse('2026-10-24T07:32:00.000Z'), fromApp: true }`:
  - `the deletion email follows ox-email-deleted in order`: the subject `ลบบัญชี Jotbun ของคุณแล้ว`; then `เราได้รับคำขอเมื่อ 24 ต.ค. 2569 เวลา 14:32 น.`, `สิ่งที่ถูกลบ`, `ลบถาวรภายใน 25 ต.ค. 2569 เวลา 14:32 น.`, the backups line, `DEL-1CZJ-R7KA`, `ตอบกลับอีเมลนี้` and the GoGoCash line at increasing positions of `deletionEmail(N, 'help@jotbun.test').html` and of its `text`; the `html` holds `#F4F3F9` and `border-radius:22px`.
  - `the deletion email names the request time and the 24-hour deadline`: `requestedAt` `2026-12-31T16:30:00.000Z` gives `31 ธ.ค. 2569 เวลา 23:30 น.` and `ลบถาวรภายใน 1 ม.ค. 2570 เวลา 23:30 น.`.
  - `the deletion email prints the request number the app shows, never the request id`: `DEL-1CZJ-R7KA`, and no `0b3f2c1e` in `text` or `html`.
  - `a deletion asked through support leaves out the phone line` (`fromApp: false`).
  - `the English deletion email has the same parts in order, with the backups line` (`locale: 'en'`).
  - `the deletion email replies to the support address, and says so only then`: `replyTo` set and the line present; with `null`, neither, in `text` and `html`.
  - `the code email keeps its board lines, Thai first, with no reply-to`.
  - `email HTML loads nothing from outside and runs nothing`: no `<img`, `<script`, `src=`, `url(` or `http`.
  - `text is escaped`: `emailText('<b>')` renders `&lt;b&gt;`.
  - `mailer.test.ts`: `Email Service gets replyTo` and `Resend gets reply_to` (the recorded call and JSON body).
  - `deletion.test.ts`: `the deletion email carries the request time from its row` (the captured notice's `requestedAt` is the row's `requested_at`, and `fromApp` is true).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/email-copy.test.ts` and `npm run test:edge:workers -- test/workers/auth/mailer.test.ts test/workers/deletion.test.ts`. Expected: every case fails against the `''` stubs, except `email HTML loads nothing from outside and runs nothing` (a guard).
- [ ] **Step 3: Implement** the layout functions in `email-layout.ts`, both emails' `html` and the deletion lines in `email-copy.ts`, `replyTo` in `mailer.ts`, and `fromApp` (with `requestedAt` if missing) in `sendDeletionEmail`.
- [ ] **Step 4: Run them and see them pass,** then 1C's deletion and mailer suites and the edge gate.
- [ ] **Step 5: Mutation check.** Always set the reply-to; move the backups line after the reference; print the request id instead of its code; drop escaping: each fails its case.
- [ ] **Step 6: Docs.** `deletion.md` for `DeletionWorkflow`: the 24-hour target; `DELETION_STEPS` as 1C-T13 and 1D-T13 leave them; `npx wrangler workflows instances list jotbun-deletion --env production -c wrangler.jsonc` (staging: `jotbun-deletion-staging`), `describe` and `restart` for an errored instance; the alerts on `apple_token_revocation_failed` and `analytics_person_deletion_abandoned`; the email (reply-to C9, the D33 domain); the 60-day registry; never restoring `ERASURE_DB` backwards; matching a request number: a `DEL-` code is the first 10 hex digits of `request_id` (dashes removed) in Crockford base32, so `deletionShortCode` over the open and recent `deletion_requests` rows finds it.
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: real sending through Email Service and Resend (Q1); drafts until E2 (P6C-T14). `git commit -m "Give both emails the boards' HTML, let the deletion email reply to support, and rewrite the deletion runbook"`

---

### Task P6C-T5: The review sign-in for App Review and Play's app access

**Starts after:** 1C-T2, P6C-T1

**Files:**
- Create: `apps/edge/src/auth/review-access.ts` (pure)
- Modify: `src/auth/create-auth.ts`, `src/auth/env.ts` (`REVIEW_ACCOUNT_EMAIL?`, `REVIEW_ACCOUNT_CODE?`), `release/secrets.json` (both: edge, optional, owner)
- Test: `apps/edge/test/workers/auth/review-access.test.ts`

**Interfaces:**
- Consumes: 1C-T1's `createAuth`, `testAuth(deps, env)`, `requestCode`; 1C-T2's send path, `recordCodeSend`; Better Auth 1.6.33's email OTP option `generateOTP(data: { email: string; type: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email' }, ctx?) => string | undefined` (`undefined` keeps the random code).
- Produces:
  ```ts
  export type ReviewAccess = { email: string; code: string }
  export function reviewAccess(env: { REVIEW_ACCOUNT_EMAIL?: string; REVIEW_ACCOUNT_CODE?: string }): ReviewAccess | null   // both set, the email trimmed and lower-cased with one '@', the code /^\d{6}$/
  export function reviewOtp(access: ReviewAccess | null): (data: { email: string; type: string }) => string | undefined   // the code for type 'sign-in' and that email only
  export function isReviewAddress(access: ReviewAccess | null, email: string): boolean
  ```
- In `createAuth` (Y12, default pending owner Q12): `generateOTP: reviewOtp(reviewAccess(env))`; the send path still records the send (the cap counts) and, for the review address, sends nothing and logs nothing.

- [ ] **Step 1: Stub, then write the failing tests.** Stub: `reviewAccess` returns `null`. With `R = { REVIEW_ACCOUNT_EMAIL: 'review@jotbun.test', REVIEW_ACCOUNT_CODE: '402917' }`:
  - `the review address signs in with the review code, and no email goes out`.
  - `the review code opens no other address` (refused with Better Auth's invalid-code status, pinned at RED as 1C's M16 asks).
  - `after three wrong codes the review code is refused until another code is asked for, then it signs in again` (the fourth try with `402917` answers Better Auth's too-many-attempts status, pinned at RED (M16); after one more code request, `402917` signs in).
  - `the review address keeps the five-codes cap` (the sixth request is 429 `CODE_LIMIT`).
  - `without both secrets, or with a code that is not six digits, it is an ordinary address`.
  - `the review code is never logged` (`JOTBUN_ENV: 'local'`, `console.log` spied: no `402917`, no address).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/auth/review-access.test.ts`. Expected: every case fails against the `null` stub, except `without both secrets …` and `the review code is never logged` (guards).
- [ ] **Step 3: Implement** `reviewAccess`, `reviewOtp` and `isReviewAddress` in `src/auth/review-access.ts`; in `create-auth.ts`, `generateOTP` and a send path that records the send and sends nothing for the review address.
- [ ] **Step 4: Run them and see them pass,** then 1C's email-code and mailer suites unchanged, and the edge gate.
- [ ] **Step 5: Mutation check.** Give every address the code; send the email anyway; skip `recordCodeSend`: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** SKIPPED: setting the secrets for a review (Q12). `git commit -m "Let App Review and Play's app access sign in with one review address and a secret code"`

---

### Task P6C-T6: The release preflight, the config seed, remote D1 migrations, provisioning commands and the release runbook

**Starts after:** P6C-T2, P6C-T3, P3-T2 (P3:source), P5-T2 (P5:currency)

**Files:**
- Create: `apps/edge/scripts/release/preflight.mjs`, `kv-seed.mjs`, `d1-migrate.mjs`, `provision.mjs`
- Modify: `apps/edge/package.json` (`release:preflight`, `release:kv-seed`, `release:d1`, `release:provision`), `docs/operations/release.md` (rewritten)
- Delete: `docs/operations/auth0-runbook.md` (D23)
- Test: `apps/edge/test/release/preflight.test.ts`, `kv-seed.test.ts`, `d1-migrate.test.ts`, `provision.test.ts` (Node)

**Interfaces:**
- Consumes: P6C-T1's helpers and P6C-T2's `passkeyOrigins`; `withSupport`, `plainPolicyText` (P6C-T3's import-free `src/web/policy-text.ts`), `policySource` (tests only), `status.json`; `readEdgeConfig` (`src/v1/config.ts`, base; tests only); `apps/app/app.json`'s `expo.version`; from `@gogospend/contracts` (tests only), `compareVersions` and every export named `*_MIN_CLIENT_VERSION`: P3-T2's `AI_MIN_CLIENT_VERSION`, P5-T2's `CURRENCY_MIN_CLIENT_VERSION` and, once it lands, P6B-T10's `SNAPSHOT_COUNT_MIN_CLIENT_VERSION`.
- Produces:
  ```js
  // preflight.mjs: CLI `<env>`: 'preflight ok <env>' and exit 0, or one 'preflight: <problem>' line each and exit 1
  export function preflight(env, { config, breakglass, identity, policyStatus }) // string[]; every CLI passes breakglass null while wrangler.breakglass.jsonc is absent
  // kv-seed.mjs: CLI `<env> [--paused <scope,...>] [--unpause <scope,...>] [--published-at <ISO>] [--apply]`
  export const RELEASE_CLIENT_MINIMUMS = { ios: '0.3.0', android: '0.3.0' }   // the highest *_MIN_CLIENT_VERSION when T6 runs: P5-T2's today, P6B-T10's 0.4.0 if it came first
  export function readLiveConfig(env, run) // config:v1 parsed; null when the read fails with '404: Not Found' (no key yet); throws on any other failure or text that is not JSON; run(args) => { status, stdout, stderr }
  export function mergePaused(live, { paused, unpause }) // config:v1's gates: the live paused scopes and retry_after_seconds, plus paused, less unpause; live null gives { paused }
  export function buildConfigV1(env, { identity, policyStatus, publishedAt, gates })
  // d1-migrate.mjs: CLI `<env> [--apply]`
  export function d1MigrationCommands(env, config, breakglass) // string[][]
  // provision.mjs: CLI `<env>`, prints only
  export function provisionCommands(env, config, breakglass) // string[][]
  ```
- `preflight` problems, each naming its field: `placeholderFields(identity, env)` (default pending owner Q3); `account_id` not the identity's; a KV, D1 or R2 binding without its id or name or with a placeholder id, in either Wrangler config; a route not the identity host; `AUTH_BASE_URL`, `AUTH_ISSUER`, `EMAIL_FROM`, `SUPPORT_EMAIL`, `APPLE_BUNDLE_ID`, `APPLE_TEAM_ID`, `ANDROID_PACKAGE`, `ANDROID_CERT_SHA256`, `GOOGLE_CLIENT_IDS` (`googleClientIds`), `PASSKEY_RP_ID` or `PASSKEY_ORIGINS` (`passkeyOrigins`) not matching identity; `AI_ENABLED` `true` without `ANTHROPIC_BASE_URL` matching `^https://gateway\.ai\.cloudflare\.com/v1/<account>/[a-z0-9-]+/anthropic$`; in production, an `FX_FEED` var that is `""` or `fixture` (D31) and any draft policy (default pending owner Q4).
- `buildConfigV1` returns exactly `{ gates, policies: [terms, privacy], client_versions: RELEASE_CLIENT_MINIMUMS }`, each policy `{ kind, version, required: true, published_at, text: { th, en } }`, `text` from `plainPolicyText(withSupport(source, identity.support_email || null))`, `source` being `content/policies/<kind>.<locale>.md` read with `readFileSync`. The CLI writes `.wrangler/release/config-v1.<env>.json` and prints `npx wrangler kv key put config:v1 --path <file> --binding CONFIG --remote --env <env> -c wrangler.jsonc`; `--apply`, after `preflight` passes, first reads the live value with `readLiveConfig` (`npx wrangler kv key get config:v1 --binding CONFIG --remote --text --env <env> -c wrangler.jsonc`) and keeps its paused scopes through `mergePaused` unless `--unpause` names them (C12).
- `d1MigrationCommands`: each D1 database of the block, then, when a break-glass config is given, its `BREAKGLASS_DB`: `['npx', 'wrangler', 'd1', 'migrations', 'apply', <database_name>, '--remote', '--env', env, '-c', <config>]`; `--apply` runs them in order, stops at the first failure, and refuses when `preflight` fails.
- `provisionCommands` (Y7), each `npx wrangler … --env <env> -c wrangler.jsonc`: `d1 create <name> --location apac`; `kv namespace create jotbun-config-<env>`; `r2 bucket create <bucket> --location apac`; `queues create <name>`; `r2 bucket lifecycle add <bucket> expire-<prefix> <prefix>/ --expire-days 1 -y` for `sync_snapshot`, `export`, `import_quarantine`, `import_image` (1B's rules; none for `receipt/`); production also `r2 bucket create jotbun-analytics-copy --location apac` and `r2 bucket lifecycle add jotbun-analytics-copy expire-all "" --expire-days 90 -y` (default pending owner Q7). P6C-T9 adds the break-glass database.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs return `[]`, `{}` or `null`, and `RELEASE_CLIENT_MINIMUMS` is `0.0.0` for both. Fixtures `filledIdentity()` (confirmed, real-looking) and `filledConfig()` (the repository's config with ids and vars from it):
  - `preflight.test.ts`: `today's placeholders fail both environments, each named` (`confirmed_by_owner`, `account_id`, `kv CONFIG`); `staging needs only its own identity fields; production needs every field` (an empty support address fails production only); `a filled identity and matching blocks pass`; `the account must be the identity's`; `a binding without an id or name fails`; `an empty or fixture rate feed fails production only`; `production refuses draft policy text, staging allows it`; `AI on without this account's gateway fails`.
  - `kv-seed.test.ts`: `the seed passes the Worker's own config reader` (a `Map`-backed KV: no paused scope, both policies, minimums `RELEASE_CLIENT_MINIMUMS`); `the published privacy text is the privacy page's text`; `client minimums never exceed the app's version`; `the seeded minimum is at least every contract floor` (each `*_MIN_CLIENT_VERSION` export by `compareVersions`, `AI_MIN_CLIENT_VERSION` and `CURRENCY_MIN_CLIENT_VERSION` among them); `a re-seed keeps every paused scope it finds unless told to unpause it` (`mergePaused({ gates: { paused: ['ai', 'jobs'] } }, { paused: [], unpause: ['jobs'] })` keeps `ai` only; `mergePaused(null, { paused: ['ai'], unpause: [] })` is `{ paused: ['ai'] }`); `the first seed finds no live value, and any other failed read stops it` (an injected runner: exit 1 with `404: Not Found` gives `null`; exit 1 with `500`, or text that is not JSON, throws); `nothing but the reader's three keys`.
  - `d1-migrate.test.ts`: `staging migrates staging databases only`.
  - `provision.test.ts`: `every resource the staging block binds is created, with the apac hint`; `every prefix but receipt/ expires after one day`; `the analytics copy is production only and kept 90 days`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/release`. Expected: every case fails against the stubs, except `a filled identity and matching blocks pass` and `client minimums never exceed the app's version` (guards).
- [ ] **Step 3: Implement** the four scripts.
- [ ] **Step 4: Run them and see them pass.** Then `npm run release:preflight --prefix apps/edge -- production`: expected exit 1 naming today's placeholders (into the receipt).
- [ ] **Step 5: Mutation check.** Skip the account check; seed a fourth key; drop `--location apac`; drop the live paused scopes; take every failed read for no value; seed `0.2.0`: each fails its case.
- [ ] **Step 6: Docs.** `release.md` for Workers: provisioning (print, run, paste ids, `confirmed_by_owner`), secrets, preflight, D1 migrations before code (each readable by the previous release, §6.2), `CLOUDFLARE_ENV=<env> npm run build --prefix apps/edge` then `npx wrangler deploy --strict --message <sha>`, the break-glass Worker, seeding `config:v1` (reading paused scopes first; `--unpause` only on purpose), client minimums (`RELEASE_CLIENT_MINIMUMS`, the highest `*_MIN_CLIENT_VERSION`, raised in the commit that adds a higher one), `release:smoke`, staged enablement by the release switches (P6C-T14b), KV gates and P6B's flags; the PostgreSQL-era `scripts/ops/*` and their `test:ops` suites stay until `apps/api` goes. Remove `auth0-runbook.md` and its links in `docs/operations/` and the READMEs (not `apps/api`'s comment or the progress files); P6C-T15 rewrites handover's list.
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: every `--apply` and provisioning command (Q1). `git commit -m "Add the release preflight, the config seed, remote D1 migrations and provisioning commands"`

---

### Task P6C-T7: Deploy jobs that stay off until the owner says yes, the smoke check and rollback

**Starts after:** P6C-T6
**Delivers:** P6C:environments

**Files:**
- Create: `.github/workflows/deploy.yml`, `scripts/ci/workflow-yaml.mjs`, `scripts/ci/deploy-workflow.test.mjs`, `apps/edge/scripts/release/smoke.mjs`, `rollback.mjs`
- Modify: root `package.json` (`test:ops` gains the workflow test), `scripts/ci/backend-workflow.test.mjs` (imports `workflowRuns`), `apps/edge/package.json` (`release:smoke`, `release:rollback`), `docs/operations/rollback.md` (rewritten), `release.md` (the `production` environment's deployment branch rule is `main`)
- Test: `scripts/ci/deploy-workflow.test.mjs` (node:test), `apps/edge/test/release/smoke.test.ts`, `rollback.test.ts`

**Interfaces:**
- Consumes: the `release:*` scripts and `check:envs`; `hostFor`; `backend.yml`'s name (`backend`), pinned action commits and `NODE_VERSION`.
- Produces:
  ```js
  // scripts/ci/workflow-yaml.mjs: structural, no YAML library
  export function workflowRuns(text)   // moved unchanged from backend-workflow.test.mjs
  export function workflowJobs(text)   // { [job]: { if, environment, steps: { name, uses, run, env }[] } }
  // smoke.mjs: CLI `<env | base URL>`; a PASS or FAIL line each; exit 1 on any FAIL
  export async function smokeChecks(baseUrl, { fetchImpl = fetch, client = 'ios/0.2.0', pages = false, association = false } = {}) // { name, pass, detail }[]
  // rollback.mjs: CLI `<env> --reason <text> [--to <version id>] [--apply]`
  export function rollbackCommand(env, reason, versionId) // string[]
  ```
- `smokeChecks`: `/live` 200 `{ status: 'live' }`; `/ready` 200; `/` 200 with `คำสัญญาของเรา`; `/v1/policies` 200 with `x-gogospend-client`; `/api/auth/jwks` 200 with a non-empty `keys`; when asked, both `.well-known` files and the three pages 200.
- `rollbackCommand`: `['npx', 'wrangler', 'rollback', ...(versionId ? [versionId] : []), '--name', `jotbun-edge-${env}`, '--env', env, '-c', 'wrangler.jsonc', '--message', reason, '-y']`, so the account is the block's (D33); no version rolls back to the one uploaded before the latest; an empty reason throws.
- `deploy.yml` (Y6): `on:` `workflow_run` of `backend` (`types: [completed]`, `branches: [main]`) and `workflow_dispatch` with a choice input `environment`; `permissions: contents: read`; `concurrency: deploy-<environment>`, never cancelling; jobs `staging` (`if:` `vars.JOTBUN_DEPLOYS == 'on'` and either that run with `conclusion == 'success'`, `event == 'push'`, `head_branch == 'main'` and `head_repository.full_name == github.repository`, or a dispatch of `staging` with `github.ref == 'refs/heads/main'`) and `production` (`if:` the variable, a dispatch of `production` and `github.ref == 'refs/heads/main'`), each with `environment:` its name; steps: checkout of `github.event.workflow_run.head_sha || github.sha` without persisted credentials, setup-node, `npm ci --ignore-scripts --no-audit --no-fund`, `npm run install:edge`, `npm run typecheck:edge`, `npm run test:edge`, `npm run test:edge:workers`, `npm run release:preflight --prefix apps/edge -- <env>`, `npm run release:d1 --prefix apps/edge -- <env> --apply`, `npm run build --prefix apps/edge` with `CLOUDFLARE_ENV: <env>`, `npx wrangler deploy --strict --message "<sha>"` (`working-directory: apps/edge`; P6C-T9 adds the break-glass deploy after it), `npm run release:smoke --prefix apps/edge -- <env>`. Only the D1 and deploy steps get `CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}`.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs return `[]`; `deploy.yml` is one job with `run: echo stub`.
  - `deploy-workflow.test.mjs`: `every job is off until the repository variable says on`; `every deploy runs from main after the full gate` (each `if:` above, `event`, `head_branch` and `head_repository.full_name` included; each job runs the Workers suite before its first Cloudflare step); `each job checks, migrates, builds for its environment, deploys and smoke-tests, in that order`; `the only secret is the Cloudflare token, given only to the steps that call Cloudflare`; `read-only permissions, and every action pinned by commit`.
  - `smoke.test.ts` (a fake fetch): `a healthy Worker passes every check`; `a /ready 503 is one FAIL naming /ready`; `pages and association files are checked only when asked`.
  - `rollback.test.ts`: `the rollback reads the environment's block, so it names the Jotbun account and the environment's Worker`; `a version id goes before the flags`; `an empty reason is refused`.
- [ ] **Step 2: Run them and see them fail.** Run: `node --test scripts/ci/deploy-workflow.test.mjs` and `npm run test:edge -- test/release/smoke.test.ts test/release/rollback.test.ts`. Expected: every case fails against the stubs, except `the only secret is the Cloudflare token …` (a guard).
- [ ] **Step 3: Implement** `workflowJobs` (and move `workflowRuns`) in `scripts/ci/workflow-yaml.mjs`, `deploy.yml`, `smokeChecks` in `smoke.mjs` and `rollbackCommand` in `rollback.mjs`, with their CLIs.
- [ ] **Step 4: Run them and see them pass,** then `npm run test:ops` (the backend workflow's tests unchanged) and the edge gate.
- [ ] **Step 5: Mutation check.** Drop the variable from production's `if`; drop staging's `event == 'push'`; deploy before the preflight; give the token to the smoke step; drop `--env` from the rollback: each fails its case.
- [ ] **Step 6: Docs.** `rollback.md`: `release:rollback`; what a rollback cannot cross (a Durable Object class change, a deleted bound resource; Cloudflare docs, "Rollbacks"); D1 migrations never roll back, so each stays readable by the previous release; `config:v1` is re-seeded separately; when to roll forward.
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: the variable, both GitHub environments and production's reviewers and branch rule, the token, every run (the owner's yes). `git commit -m "Add deploy jobs that stay off until the owner's yes, a smoke check and a rollback command"`

---

### Task P6C-T8: The vault's read-only support snapshot

**Starts after:** 1B-T2, 1B-T13, 1C-T11, 1D-T10

**Files:**
- Create: `apps/edge/src/vault/support.ts`
- Modify: `apps/edge/src/vault/user-vault.ts` (one RPC method)
- Test: `apps/edge/test/workers/support-snapshot.test.ts`

**Interfaces:**
- Consumes: the 0000 and 0001 tables; `account_state` and 1B-T2's erased marker (`deleted`, empty `account_id`); `markDeleting` (1C-T11); `openLive` (1D-T10); 1A's `startV1`, `newUser`, `vaultOf`, `sqlRows`.
- Produces:
  ```ts
  // src/vault/support.ts
  export type SupportScope = 'health' | 'records'
  export const SUPPORT_RECORD_LIMIT = 200
  export const SUPPORT_TABLES = ['wallets', 'categories', 'transactions', 'monthly_budgets', 'command_receipts', 'entity_changes', 'vault_objects', 'import_uploads'] as const
  export type SupportUnavailable = { unavailable: 'unknown' | 'deleting' | 'deleted' }
  export type SupportSnapshot = {
    scope: SupportScope; account: { status: 'active'; not_before: number }
    revision: string; pruned_through: string; database_bytes: number
    counts: Record<(typeof SUPPORT_TABLES)[number], number>
    schedule: { job: string; due_at: number }[]
    records?: { wallets: unknown[]; categories: unknown[]; transactions: unknown[] }   // 'records' only
  }
  export function readSupportSnapshot(sql: SqlStorage, accountId: string, scope: SupportScope, databaseBytes: number): SupportSnapshot | SupportUnavailable
  // UserVault (RPC)
  supportSnapshot(accountId: string, scope: SupportScope): SupportSnapshot | SupportUnavailable
  ```
- Rules: never through `call()` or `afterCall`, never `ensureAccount`, no `transactionSync`, only `SELECT`s. `deleted` and `deleting` are read before the account id is compared, so an erased vault (empty `account_id`) is `deleted` (C17); then no `account_state` row, or another `account_id`, is `unknown`. Revisions and amounts read with `CAST(... AS TEXT)`; `records` holds every wallet and category and the newest 200 transactions by `(occurred_on, id)` descending, deleted ones with their `deleted_at`; `database_bytes` is `ctx.storage.sql.databaseSize`.

- [ ] **Step 1: Stub, then write the failing tests.** The stub returns `{ unavailable: 'unknown' }`. With a wallet named `NAME-SENTINEL`, a record of `987654` satang noted `NOTE-SENTINEL`, and an alarm set:
  - `the health view counts without changing anything`: counts match `sqlRows`; before and after, the revision, the counts of `command_receipts`, `entity_changes` and `audit_events`, the `account_state` row and `getAlarm()` are equal.
  - `a phone's live socket hears nothing`: an `openLive` socket holds no message 200 ms after the call.
  - `the health view holds no names, notes or amounts`: neither sentinel nor `987654` in its JSON.
  - `the records view holds every wallet and the newest 200 records`: 201 records give 200, newest first, amounts as strings.
  - `a never-used vault is unknown, and nothing is created`: no `account_state` row and `getAlarm()` null after the call.
  - `an erased vault is deleted, a deleting one deleting, and another account's name unknown`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/support-snapshot.test.ts`. Expected: every case fails against the stub, except `a phone's live socket hears nothing` and `a never-used vault is unknown, and nothing is created` (guards).
- [ ] **Step 3: Implement** `readSupportSnapshot` in `src/vault/support.ts` and the `supportSnapshot` RPC in `user-vault.ts`.
- [ ] **Step 4: Run them and see them pass,** then the Workers suite unchanged.
- [ ] **Step 5: Mutation check.** Call `ensureAccount` first; route through `call()`; return wallet names in `health`: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add a read-only support snapshot to the vault that writes, receipts and pokes nothing"`

---

### Task P6C-T9: The break-glass Worker behind Cloudflare Access

**Starts after:** P6C-T7, P6C-T8, 1C-T4

**Files:**
- Create: `apps/edge/wrangler.breakglass.jsonc`, `migrations/breakglass/0001_breakglass.sql`, `src/breakglass/env.ts`, `access.ts`, `grants.ts`, `handler.ts`, `worker.ts`, `log.ts`, `test/workers/support/breakglass.ts`, `docs/operations/breakglass.md`
- Modify: `apps/edge/vitest.workers.config.ts` (`BREAKGLASS_DB` and its migrations, as 1C adds `AUTH_DB`), `release/secrets.json` (`breakglass`: `BREAKGLASS_AUDIT_KEY` and `ERASURE_KEY`, required and generated, the latter the edge's value), `test/release/environments.test.ts`, `scripts/release/check-environments.mjs` (the two dry runs below), `preflight.mjs`, `d1-migrate.mjs`, `provision.mjs` and their tests (the real break-glass config), `.github/workflows/deploy.yml` and `scripts/ci/deploy-workflow.test.mjs` (its deploy step), `apps/edge/README.md`
- Test: `apps/edge/test/workers/breakglass.test.ts`

**Interfaces:**
- Consumes: `supportSnapshot`, `SupportScope` (P6C-T8); `readAccountStatus`, `isErased` (1C-T4; no `@api/` import may reach this Wrangler-bundled Worker); `readIdentity`; jose 6.2.12 (`jwtVerify`, `createRemoteJWKSet`, `createLocalJWKSet`, `SignJWT`, `generateKeyPair`, `exportJWK`).
- Produces:
  ```ts
  // access.ts
  export type AccessSettings = { teamDomain: string; aud: string }
  export function accessSettings(env: BreakGlassEnv): AccessSettings | null   // /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/ and /^[0-9a-f]{64}$/
  export function remoteAccessKeys(teamDomain: string): JWTVerifyGetKey       // createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)), one per isolate
  export function verifyAccess(request: Request, s: AccessSettings, keys: JWTVerifyGetKey): Promise<{ email: string } | null>
  // grants.ts
  export const GRANT_MINUTES = 30, PENDING_HOURS = 24, AUDIT_KEEP_DAYS = 365   // default pending owner Q9
  export const REASON = /^[A-Za-z0-9 #._-]{4,80}$/             // a ticket reference, never free text
  export function auditSubject(key: string, userId: string): Promise<string>   // base64url HMAC-SHA256(key, 'jotbun-breakglass-v1\0' + userId)
  // handler.ts
  export type VaultReader = { supportSnapshot(userId: string, scope: SupportScope): Promise<unknown> }
  export function handleBreakGlass(request: Request, env: BreakGlassEnv, deps: { keys: JWTVerifyGetKey; now?: () => number; reader?: VaultReader }): Promise<Response>
  // log.ts: src/v1/log.ts imports @api, so the Worker keeps its own
  export function logFailure(event: string, error: unknown): void   // { level: 'error', event, failure: the error's class name }
  // env.ts
  export type BreakGlassEnv = { BREAKGLASS_DB: D1Database; AUTH_DB: D1Database; ERASURE_DB: D1Database; VAULT: DurableObjectNamespace<UserVault>; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; BREAKGLASS_REQUESTERS?: string; BREAKGLASS_APPROVERS?: string; BREAKGLASS_AUDIT_KEY?: string; ERASURE_KEY?: string }
  ```
- `0001_breakglass.sql`: `grants (grant_id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('view','restore','delete')), scope TEXT CHECK (scope IN ('health','records')), restore_at INTEGER, started_at INTEGER, armed_at INTEGER, settled_at INTEGER, high_water TEXT, session_state TEXT, undo_bookmark TEXT, locale TEXT CHECK (locale IN ('th','en')), subject_hash TEXT NOT NULL, user_id TEXT, reason TEXT NOT NULL, requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL, decided_by TEXT, decided_at INTEGER, expires_at INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','approved','refused','expired','closed','used')), CHECK ((kind = 'view') = (scope IS NOT NULL)), CHECK ((kind = 'restore') = (restore_at IS NOT NULL)), CHECK ((kind = 'delete') = (locale IS NOT NULL)), CHECK (status IN ('pending','approved') OR (user_id IS NULL AND session_state IS NULL)))` with an index on `(status, requested_at)`; `grant_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, grant_id TEXT, event TEXT NOT NULL CHECK (event IN ('requested','lookup_missed','unavailable','approved','self_approved','refused','viewed','restored','restore_refused','deletion_started','closed','expired')), actor TEXT NOT NULL, at INTEGER NOT NULL)` with an index on `(at)`. P6C-T9b uses the delete columns, P6C-T10b the restore ones.
- `wrangler.breakglass.jsonc` (Y5, Y13): `jotbun-breakglass`, `main` `src/breakglass/worker.ts`, 1B's date and flags, `workers_dev` and `preview_urls` false, `observability` with `redact_query_string`; `VAULT` `{ class_name: 'UserVault', script_name: 'jotbun-edge' }`; D1 `BREAKGLASS_DB` (`jotbun-breakglass`, id `00000000-0000-0000-0000-000000000003`, `migrations/breakglass`) plus the main config's `AUTH_DB` and `ERASURE_DB`; vars `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `BREAKGLASS_REQUESTERS`, `BREAKGLASS_APPROVERS` (`""`). Each block: `jotbun-breakglass-<env>`, `script_name` `jotbun-edge-<env>`, its database names per Y1 (`BREAKGLASS_DB` `jotbun-breakglass-staging`, and `jotbun-breakglass` in production) and ids (break-glass `...14`, `...24`), the `ops` host as custom domain, the identity account and `access_team_domain`, `secrets.required` `["BREAKGLASS_AUDIT_KEY", "ERASURE_KEY"]`.
- Routes, JSON with `cache-control: no-store`; settings missing: 503 (Y13); no valid Access identity on either list: 403 `FORBIDDEN`; a failed D1 or vault call: 503 `SERVICE_UNAVAILABLE`, logged by `logFailure`. No response or event holds the subject's email or user id, and a grant holds the user id only while pending or approved; staff Access emails (`requested_by`, `decided_by`, `actor`) are kept and shown to approvers. Each request first expires grants past `expires_at` (clearing `user_id`, event `expired` by `system`), except a restore grant whose run has started (`started_at` set) until it is used or refused; clears `user_id` on open grants whose subject `isErased`; and deletes rows older than `AUDIT_KEEP_DAYS`.
  - `POST /grants` `{ email, kind: 'view', scope?, reason }` (requesters, approvers; `scope` defaults to `health`, Y13): `SELECT id FROM "user" WHERE email = ?` on the trimmed, lower-cased address; none: 404 `NOT_FOUND` and a `lookup_missed` event with no grant; not `active` or `isErased`: 409 `ACCOUNT_UNAVAILABLE` and `unavailable`; a bad body or reason: 422 `VALIDATION_FAILED`; else 201 `{ grant_id, status: 'pending', expires_at }` (24 hours; `grant_id` is `crypto.randomUUID()`). P6C-T9b and P6C-T10b add the delete and restore bodies.
  - `GET /grants?status=pending` (approvers): `{ grants: [{ grant_id, kind, scope, reason, requested_by, requested_at, expires_at }] }`; `?status=running`: the same fields, `started_at`, `armed_at` and `settled_at` for approved restore grants that have started and are not yet used.
  - `POST /grants/:id/approve` and `/refuse` (approvers, a pending unexpired grant): approval sets `expires_at` 30 minutes on, event `self_approved` when its requester approves (default pending owner Q8); refusal clears `user_id`.
  - `GET /grants/:id/view` (its requester or an approver; an approved, unexpired `view` grant): `reader.supportSnapshot(user_id, scope)` (default reader: `env.VAULT.get(env.VAULT.idFromName(userId), { locationHint: 'apac' })`), event `viewed`, 200 `{ grant_id, snapshot }`; otherwise 403 `GRANT_NOT_ACTIVE`.
  - `POST /grants/:id/close` (its requester or an approver): `closed`, `user_id` cleared.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `verifyAccess` returns `null`, `handleBreakGlass` answers 501. `support/breakglass.ts`: an RS256 pair, `createLocalJWKSet` over its JWK, `accessToken(claims)` (`iss` `https://jotbun-test.cloudflareaccess.com`, `aud` `['a'.repeat(64)]`, `type: 'app'`, `email`, 10 minutes), an env with `support@jotbun.test` a requester and `owner@jotbun.test` an approver, and `bg(method, path, token?, body?)`. `breakglass.test.ts`:
  - Access: `no Access token is 403 and writes nothing`; `a token signed by another key is 403`; `a token for another application is 403`; `an expired token is 403`; `an org token is 403`; `someone on neither list is 403`; `without the Access settings every request is 503`.
  - Grants: `a requester asks, an approver approves, and the requester reads the health view` (no `scope` given; 403 `GRANT_NOT_ACTIVE` before approval; after it, the real vault's counts through `env.VAULT`); `a grant read after 30 minutes is refused, and its user id is forgotten`; `another person cannot read someone's grant`; `a pending request expires after 24 hours`; `an unknown address is 404 and logged without a subject`; `a deleting or erased account cannot be opened`; `an open grant forgets its subject once the account is erased`; `an approver approving their own request is recorded as self_approved`; `a reason that is not a ticket reference is 422`; `a failed database read is 503 and logs only its class name`; `the audit keeps hashed user ids only` (with the subject's address and id as sentinels: after close, no grant, event or response holds either; `subject_hash` is `auditSubject(key, userId)`; `requested_by` stays the staff address); `the pending list shows staff addresses but never the subject's address or id`.
  - `environments.test.ts`: `the break-glass Worker binds this environment's vault, databases and ops host`. `preflight.test.ts`: `a placeholder break-glass database id fails`. `d1-migrate.test.ts`: `the break-glass database migrates last`. `provision.test.ts`: `the break-glass database is created with the apac hint` (`d1 create jotbun-breakglass-staging --location apac` in staging and `d1 create jotbun-breakglass --location apac` in production, each with `-c wrangler.breakglass.jsonc`). `deploy-workflow.test.mjs`: `each job deploys the break-glass Worker right after the main one`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/breakglass.test.ts`, `npm run test:edge -- test/release` and `node --test scripts/ci/deploy-workflow.test.mjs`. Expected: every new case fails against the 501 stub and the unchanged scripts.
- [ ] **Step 3: Implement.** `verifyAccess` reads `cf-access-jwt-assertion`, calls `jwtVerify(token, keys, { issuer: s.teamDomain, audience: s.aud, algorithms: ['RS256'], clockTolerance: 30 })`, and requires `type === 'app'` and a string `email` (Cloudflare Access, "Application token"); then `accessSettings`, `auditSubject`, `handleBreakGlass` (the sweep and the routes), `logFailure`, `worker.ts`'s `fetch`, the config, the three release scripts and the deploy step (`npx wrangler deploy -c wrangler.breakglass.jsonc --env <env> --strict --message "<sha>"`).
- [ ] **Step 4: Run them and see them pass.** Then `cd apps/edge && npx wrangler deploy -c wrangler.breakglass.jsonc --env staging --dry-run --outdir .wrangler/release/breakglass-staging` and the same for production exit 0 (added to `check:envs`).
- [ ] **Step 5: Mutation check.** Drop the audience check; skip expiry; write the email as the subject: each fails its case.
- [ ] **Step 6: Docs.** `breakglass.md`: the Access application on the `ops` hosts (one Access group, a 1-hour session), `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, the off switch (remove `ACCESS_AUD` or the application), the lists, calls through `cloudflared access curl`, the scopes and the 30-minute window, the privacy notice's disclosure.
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: the Access application, the hosts, a rehearsal on staging (Q1). `git commit -m "Add the break-glass Worker behind Access, with approved, time-boxed grants and a read-only vault view"`

---

### Task P6C-T9b: Deleting an account for a person without the app

**Starts after:** P6C-T9, P6C-T4, 1C-T11

**Files:**
- Create: `apps/edge/src/breakglass/staff-delete.ts`
- Modify: `src/breakglass/env.ts` (`DELETION_WORKFLOW?: Workflow<DeletionParams>`), `handler.ts`, `wrangler.breakglass.jsonc` (each level's `DELETION_WORKFLOW` with `class_name` `DeletionWorkflow` and `script_name`, wrangler 4.152.0's binding to another Worker's Workflow: `jotbun-deletion` on `jotbun-edge` at the top level and `jotbun-edge-production` in production, the `-staging` pair in staging), `test/release/environments.test.ts`, `docs/operations/deletion.md`
- Test: `apps/edge/test/workers/staff-delete.test.ts`

**Interfaces:**
- Consumes: P6C-T9's grants, handler and test support; 1C-T11's `deletion_requests` (`client_id` and `proof_id` required), its `deleting` upsert, `deletion_requests_open_idx`, `DeletionParams` and `DeletionWorkflow`; `readAccountStatus`, `isErased` (1C-T4); P6C-T4's `fromApp`; `deletionShortCode` (P6B-T0, tests).
- Produces:
  ```ts
  export function runStaffDeletion(env: BreakGlassEnv, grant: { grant_id: string; user_id: string; locale: 'th' | 'en' }, nowMs: number): Promise<'started' | 'refused'>
  ```
- `POST /grants` also takes `{ email, kind: 'delete', locale, reason }` (`locale` the language the person wrote in; `reason` their confirming reply's ticket), with the view's lookup and refusals. `POST /grants/:id/delete` (its requester or an approver; an approved, unexpired delete grant) runs `runStaffDeletion`: the account must still be `active` and not erased (else event `unavailable`, grant `closed`, 409 `ACCOUNT_UNAVAILABLE`); unless the grant's request row exists, one `AUTH_DB.batch` writes it (`request_id` and `proof_id` the grant id, `session_id` null, `client_id` `breakglass`, the user's email, `locale`, `accepted`, now) with 1C-T11's `deleting` upsert (refused by `deletion_requests_open_idx`: 409); the Workflow starts as 1B-T4's `createOnce` does (`create`, else `get`), a failure answering 503 with the grant still approved, so the resend starts it; then grant `used`, `user_id` cleared, event `deletion_started`, 202 `{ grant_id, request_id }`.

- [ ] **Step 1: Stub, then write the failing tests.** Stub: `runStaffDeletion` answers `'refused'`. With P6C-T9's support:
  - `an approved delete grant starts the deletion once` (the row's `request_id` is the grant id, `deletionShortCode` of it matches `/^DEL-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/`, and it has `client_id` `breakglass` and the grant's locale; `account_status` is `deleting`; one instance; running the grant again answers 403 `GRANT_NOT_ACTIVE` and starts nothing).
  - `a delete grant for a held, deleting, deleted or erased account is refused` (409; no row, no instance).
  - `a Workflow that cannot start answers 503, and the resend starts it`.
  - `environments.test.ts`: `the break-glass Worker reaches this environment's deletion Workflow`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/staff-delete.test.ts` and `npm run test:edge -- test/release/environments.test.ts`. Expected: every case fails against the stub, except the refusal case (a guard).
- [ ] **Step 3: Implement** `runStaffDeletion` in `src/breakglass/staff-delete.ts`, the delete body and route in `handler.ts`, and the bindings.
- [ ] **Step 4: Run them and see them pass,** then 1C's deletion suite and the break-glass suite unchanged, and `npm run check:envs --prefix apps/edge`.
- [ ] **Step 5: Mutation check.** Skip the status check; start the Workflow before the batch: each fails its case.
- [ ] **Step 6: Docs.** `deletion.md` gains the staff procedure: a request by email (P6C-T3's page) is answered from the support address to the account's sign-in address, and nothing is requested until the person confirms from that address; the confirming reply's ticket is the grant's reason; an approver approves; running it sends the person the deletion email with its `DEL-` code.
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: a staff deletion rehearsed on staging (Q1). `git commit -m "Let support delete the account of a person without the app through an approved break-glass grant"`

---

### Task P6C-T10a: Holding an account while its vault is restored (A22)

**Starts after:** 1C-T4, 1C-T10a, 1C-T11

**Files:**
- Create: `apps/edge/migrations/auth/NNNN_account_hold.sql` (the integrator numbers it and updates the journal)
- Modify: `src/auth/account-status.ts`, `src/v1/account-gate.ts`, `src/auth/create-auth.ts` (the session hook), `src/auth/account-plugin.ts` (its three sign-out routes), `src/deletion/request.ts` (its step 4), `test/workers/auth/schema.test.ts`
- Test: `apps/edge/test/workers/account-hold.test.ts`

**Interfaces:**
- Consumes: `account_status` (1C-T1); `readAccountStatus`, `isErased`, the `session.create.before` hook and `jotbunAccount`'s sign-out routes (1C-T4); `accountGate` (1C-T10a); `handleDeletionRequest` (1C-T11).
- Produces:
  ```ts
  // src/auth/account-status.ts: AccountStatus gains 'held'
  export function holdAccount(db: D1Database, userId: string, nowMs: number): Promise<boolean>   // 'held' over no row, 'active' or 'held'; false when deleting or deleted
  export function releaseHold(db: D1Database, userId: string): Promise<void>                     // deletes only a 'held' row
  ```
- The migration rebuilds `account_status` with `CHECK (status IN ('active', 'deleting', 'deleted', 'held'))` (create, copy, drop, rename; nothing references it, 1C's K17). The gate answers `held` with 503 `SERVICE_UNAVAILABLE`, `retryAfterSeconds` 60; the session hook refuses only `deleting`, `deleted` and erased accounts, so a held person still signs in; the deletion request and 1C-T4's three sign-out routes answer `held` with the same 503 and record nothing (no vault call, no session row deleted), since a restore would roll their revocation back.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `holdAccount` resolves `false`, `releaseHold` resolves; the migration is empty.
  - `schema.test.ts`: `account_status accepts active, deleting, deleted and held` (replaces 1C's case).
  - `holding takes an active or absent account, never a deleting or deleted one, and releasing frees only a held one`.
  - `a held account's calls answer 503 with a retry`.
  - `a held account can sign in` (an email-code sign-in while held).
  - `a deletion request during a hold is 503 with a retry and records nothing`.
  - `a sign-out during a hold is 503 and revokes nothing` (each of the three routes: the recording vault is not called and every session still works).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/account-hold.test.ts test/workers/auth/schema.test.ts`. Expected: every case fails against the stubs and the empty migration.
- [ ] **Step 3: Implement** the migration, `holdAccount` and `releaseHold`, the gate's `held` answer, the hook's narrower refusal and the deletion and sign-out routes' `held` answer.
- [ ] **Step 4: Run them and see them pass,** then 1C's auth, auth-vault and deletion suites unchanged, and the edge gate.
- [ ] **Step 5: Mutation check.** Let the hook refuse `held`; let `holdAccount` overwrite `deleting`; answer `held` with 403 at the gate; let sign-out everywhere through a hold: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add a held account status that pauses vault calls and sign-outs with a retry, while sign-in stays open and deletion waits"`

---

### Task P6C-T10b: Restoring one vault with point-in-time recovery

**Starts after:** P6C-T9, P6C-T10a

**Files:**
- Create: `apps/edge/src/vault/restore.ts`, `src/breakglass/restore-run.ts`
- Modify: `src/vault/user-vault.ts` (four RPCs), `src/breakglass/handler.ts`, `src/cloudflare-workers.d.ts` (`getCurrentBookmark`, `getBookmarkForTime`, `onNextSessionRestoreBookmark`, `kv`, `abort`), `docs/operations/restore.md` (rewritten)
- Test: `apps/edge/test/workers/restore.test.ts`

**Interfaces:**
- Consumes: `holdAccount`, `releaseHold` (P6C-T10a); `accountRowFor`, `raiseNotBefore`, `revokeSessionIds` (1C-T10a); `readAccountStatus`, `isErased` (1C-T4); `syncChanges`' 410 rule (1A-T8a); P6C-T9's grants, handler and test support.
- Produces:
  ```ts
  // src/vault/restore.ts
  export type PitrPort = { currentBookmark(): Promise<string>; bookmarkForTime(ms: number): Promise<string>; restoreOnNextSession(bookmark: string): Promise<string>; abort(reason: string): void }
  export function storagePitr(ctx: DurableObjectStateLike): PitrPort   // ctx.storage's getCurrentBookmark, getBookmarkForTime, onNextSessionRestoreBookmark; ctx.abort (Durable Objects docs, "PITR")
  export const RESTORE_WINDOW_MS = 29 * 86_400_000, RESTORE_MIN_AGE_MS = 60_000
  export const RESTORE_MARKER_KEY = 'restore-marker'   // in ctx.storage.kv, which a restore brings back with the SQL data
  export type RestoreRefused = { outcome: 'refused'; reason: 'unknown' | 'deleting' | 'deleted' | 'out_of_window' | 'high_water_moved' | 'not_restored' }
  export type RestoreMark = { outcome: 'marked'; high_water: string; not_before: number; revoked: string[]; undo_bookmark: string; created_at: number }   // Date.parse of account_state.created_at (ISO text)
  export type RestoreSettled = { outcome: 'settled'; revision: string }
  // UserVault (RPC); its pitr field defaults to storagePitr(ctx), replaced by tests in runInDurableObject
  restoreHighWater(accountId: string): Promise<RestoreMark | RestoreRefused>                     // reads only
  placeRestoreMarker(accountId: string, highWater: string, grantId: string): Promise<{ outcome: 'placed' } | RestoreRefused>
  prepareRestore(accountId: string, atMs: number, highWater: string): Promise<RestoreRefused>   // otherwise arms the bookmark and aborts in this call
  settleRestore(accountId: string, mark: { high_water: string; not_before: number; revoked: string[] }, grantId: string): RestoreSettled | RestoreRefused
  // src/breakglass/restore-run.ts
  export type RestoreVault = { [K in 'restoreHighWater' | 'placeRestoreMarker' | 'prepareRestore' | 'settleRestore']: (...a: Parameters<UserVault[K]>) => Promise<Awaited<ReturnType<UserVault[K]>>> }
  export function runRestore(env: BreakGlassEnv, grant: RestoreGrant, vault: RestoreVault, nowMs: number): Promise<'restored' | 'refused' | 'running'>   // RestoreGrant: the row's grant_id, user_id, restore_at, started_at, armed_at, settled_at, high_water, session_state
  ```
- `restoreHighWater` refuses an absent, other-owner (`unknown`), `deleting` or `deleted` account; else it returns the revision as text, `not_before`, the unexpired `revoked_sessions` ids, `currentBookmark()` (the undo point) and `account_state.created_at`. `placeRestoreMarker` refuses the same and, as `high_water_moved`, a revision above `highWater`; else it puts `grantId` under `RESTORE_MARKER_KEY` and resolves. `prepareRestore` refuses the same, an `atMs` outside `[now - RESTORE_WINDOW_MS, now - RESTORE_MIN_AGE_MS]` and, as `high_water_moved`, a revision above `highWater`, arming nothing; else `bookmarkForTime(atMs)`, `restoreOnNextSession(bookmark)` and `abort('point-in-time restore')` in one call. `settleRestore` refuses a non-active account and, as `not_restored`, a marker still holding `grantId` (nothing was restored); else, in one `transactionSync`, sets `revision` and `pruned_through` to `max(revision, high_water) + 1` (BigInt, bound as text) (Y14) and re-applies `not_before` (`raiseNotBefore`) and the revoked ids (`revokeSessionIds`).
- `runRestore` records each finished stage on the grant, and a resumed run skips it: (1) with `settled_at` set, only (6)'s release and batch; (2) not yet started: a `restore_at` before the user's `createdAt` (AUTH_DB) or outside the window is `restore_refused` before any hold; then `started_at`, written only while no other restore grant of the subject has started and is still approved (else `restore_refused`, before any hold), then `holdAccount` (false: `restore_refused`; a resumed run takes the hold again); (3) no `high_water`: `restoreHighWater`; a `restore_at` before its `created_at` plus `RESTORE_MIN_AGE_MS` (bookmarks are approximate) is `restore_refused`; else `high_water`, `session_state` (`{ not_before, revoked }`) and the first `undo_bookmark` go on the grant; (4) no `armed_at`: `placeRestoreMarker` with the stored mark (on `high_water_moved`, the one re-read: nothing was armed yet, so the mark is read and stored again and the marker placed; a second is `restore_refused`), then `armed_at`, then `prepareRestore`, whose rejection is expected (the abort); (5) `settleRestore` with the stored mark; on `not_restored`, `prepareRestore` and `settleRestore` once more, and if still `not_restored` the grant stays running and the route answers 503 with a retry; once `armed_at` is set, any refusal from `prepareRestore`, `high_water_moved` included, is `restore_refused`, never a re-read; (6) `settled_at`, then `releaseHold`, then one `BREAKGLASS_DB.batch`: grant `used` (`user_id`, `session_state` cleared) and event `restored` unless the grant has one. The mark and `armed_at` are written only while `armed_at` is null, and `settled_at` only while it is null: when D1 changes no row, another run of the grant is ahead, so this one stops and answers 503 with a retry. A refusal releases the hold only once this run took it, closes the grant (clearing `user_id` and `session_state`) and writes `restore_refused`; no other event is written. `POST /grants` also takes `{ email, kind: 'restore', restore_at: <ISO>, reason }`; `POST /grants/:id/restore` (its requester or an approver) runs an approved grant, unexpired or already started.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs answer `refused` `unknown`, `runRestore` `'refused'`. With a fake `PitrPort` answering `undo-1`, `bm-1` and `undo-2`, recording each call, whose `abort` deletes the marker as the restore would and throws, as `ctx.abort` ends the call:
  - `a restore is refused for a deleting, deleted, erased or unknown account, and nothing is created`.
  - `a restore point older than 29 days, newer than one minute or before the account existed is refused before anything is armed` (the window and the user's `createdAt` before any hold; a point before the vault's `created_at` after the mark, the hold released, no marker).
  - `the high-water read changes nothing and reports the mark, the sessions, the undo point and the vault's creation`.
  - `prepare asks for the bookmark at the restore point and restarts in the same call` (`bookmarkForTime(atMs)`, `restoreOnNextSession('bm-1')`, then `abort`).
  - `a write that lands after the high-water read is caught before anything is armed` (`high_water_moved` from `placeRestoreMarker` and from `prepareRestore`; no marker; the port records nothing).
  - `settling before the restore is refused` (`not_restored` while this grant's marker is there, nothing changed; another grant's marker does not count).
  - `after a restore every older cursor is 410, and no revision is used twice`: at revision R, mark, marker, prepare, `evictAllDurableObjects`, settle with `String(R + 5n)`: revision and `pruned_through` are `R + 6`; a cursor at R gets 410 `RESYNC_REQUIRED`; the next write commits `R + 7`.
  - `a session signed out before the restore stays signed out after it`.
  - `the tool restores in order and releases the hold` (a fake `RestoreVault`: hold, mark, marker, `armed_at`, prepare, settle, `settled_at`, release; no `account_status` row after; one `restored` event).
  - `a prepare that fails before arming is never settled, and the grant stays running` (prepare rejects with a network error and settle answers `not_restored` twice: 503 with a retry, the hold kept, `settled_at` null, no event).
  - `a run that died before arming settles above the original high water`.
  - `a resumed run that has armed never reads the high water again` (the vault now below the stored mark: no `restoreHighWater` call; settle gets the stored mark; with `armed_at` set, settle comes before any prepare, and `high_water_moved` from prepare is `restore_refused`).
  - `a run that stopped after settling only releases the hold when resumed` (`settled_at` set, the hold on: `releaseHold`, `used` and one `restored` event; no vault call).
  - `a run that stopped after releasing the hold never restores again` (`settled_at` set, no hold, the vault above the mark: no vault call, no hold taken, `used` and one `restored` event).
  - `a restore grant past its 30 minutes keeps its subject while the account is held, and resuming it finishes and releases the hold` (meanwhile `?status=running` lists it).
  - `two runs of one grant arm it, settle it and record restored once` (two resumed runs at once over one fake `RestoreVault`: one `prepareRestore`, one `settled_at`, one `restored` event; the other answers 503 with a retry).
  - `a restore grant is refused while another of the subject runs, and that hold stays` (another started, approved restore grant: `restore_refused` before any hold, the `held` row kept, no vault call).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/restore.test.ts`. Expected: every case fails against the stubs, except the refusal case (a guard).
- [ ] **Step 3: Implement** `storagePitr` and the four RPCs (`src/vault/restore.ts`, `user-vault.ts`), `runRestore` in `src/breakglass/restore-run.ts`, and the restore body and route in `handler.ts`.
- [ ] **Step 4: Run them and see them pass,** then 1C's auth-vault and deletion suites unchanged, the break-glass suite, and the edge gate.
- [ ] **Step 5: Mutation check.** Settle without `pruned_through`; settle with the marker still there; prepare before settling on a resumed run; read the high water again on resume; write `armed_at` without its null check; let the sweep expire a started restore grant: each fails its case.
- [ ] **Step 6: Docs.** `restore.md`: when (default pending owner Q14); the restore grant; what the person loses; receipts deleted after the point stay missing and later uploads stay under the prefix until deletion (R2 has no history); a stuck hold, found through `GET /grants?status=running` or `SELECT user_id FROM account_status WHERE status = 'held'` (`npx wrangler d1 execute`), released by resuming its grant, and by hand only when the grant is gone (never while it has `armed_at` without `settled_at`); undoing a mistaken restore (a new restore grant to the first one's `started_at`; its `undo_bookmark` names the exact point); D1 by `npx wrangler d1 time-travel restore <db> --timestamp <RFC3339> --env <env> -c wrangler.jsonc`, deleting every `session` row after restoring `AUTH_DB` so revived sessions mint nothing; never `ERASURE_DB` or `BREAKGLASS_DB` backwards; `CATALOG_DB` freely; `config:v1` re-seeded.
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: a real restore on staging (Q1). `git commit -m "Restore one vault by point-in-time recovery, holding the account and moving every phone to a resync"`

---

### Task P6C-T11: The owner's setup: PostHog, the dashboards, spend alerts, AI Gateway and retention

**Starts after:** 1D-T1, 1D-T3

**Files:**
- Create: `apps/app/src/analytics/dashboards.ts` (pure, no imports: the script loads it by type stripping), `apps/app/scripts/posthog-dashboards.mjs`, `docs/operations/owner-setup.md`
- Modify: `apps/app/package.json` (`"posthog:dashboards": "node scripts/posthog-dashboards.mjs"`), `docs/operations/retention.md`, `incident.md` (rewritten)
- Delete: `docs/operations/e1-setup.md` (replaced by `owner-setup.md`)
- Test: `apps/app/src/analytics/dashboards.test.ts` (Node)

**Interfaces:**
- Consumes: `APP_EVENTS: Readonly<Record<AppEventName, Readonly<Record<string, PropRule>>>>` (1D-T1); 1D-T3's server events and its common `origin` (`app` or `server`); PostHog's `$ai_total_cost_usd` on `$ai_generation`; PostHog's REST API on `https://eu.posthog.com` with `Authorization: Bearer <personal API key>`: `POST /api/projects/:project_id/dashboards/` `{ name, description, tags }` (`dashboard:write`), `POST /api/projects/:project_id/insights/` `{ name, query, dashboards }` (`insight:write`).
- Produces:
  ```ts
  // src/analytics/dashboards.ts
  export type InsightSpec = { name: string; kind: 'trends' | 'funnel' | 'retention' | 'stickiness' | 'hogql'; events: readonly string[]; breakdown?: string; windowDays?: number; hogql?: string }
  export type DashboardSpec = { name: string; insights: readonly InsightSpec[]; alert: { insight: string; decreasesByPercent: number } }
  export const SERVER_EVENT_NAMES = ['record_saved', 'sync_failed', 'resync_required', 'account_deleted'] as const
  export const POSTHOG_EVENT_NAMES = ['$exception', '$ai_generation', '$screen'] as const
  export const NORTH_STAR_HOGQL: string
  export const DASHBOARDS: readonly DashboardSpec[]
  // scripts/posthog-dashboards.mjs: CLI `[--apply]`, with POSTHOG_DASHBOARD_API_KEY (only dashboard:write and insight:write; never the Worker's POSTHOG_PERSONAL_API_KEY) and POSTHOG_PROJECT_ID
  export function dashboardBody(spec)                       // { name, description: '§7 dashboard', tags: ['jotbun'] }
  export function trendsInsightBody(insight, dashboardId)   // { name, query: { kind: 'InsightVizNode', source: { kind: 'TrendsQuery', interval: 'week', series: [{ kind: 'EventsNode', event, math: 'total' }, ...] } }, dashboards: [dashboardId] }
  ```
- `DASHBOARDS` (Y15), each insight named for what §7 shows: **Activation** (funnel `Activation funnel`: `signed_up`, `budget_set`, `record_saved`; funnel `First record within a day`: `signed_up`, `record_saved`, `windowDays` 1); **Habit** (retention `Retention` and stickiness `Stickiness` on `record_saved`; hogql `Logging days per week`, the north star); **Capture mix** (trends `Records by source`: `record_saved` by `source`; hogql `Seconds to save`: the median `seconds_to_save` of the app's `record_saved` this week); **Bun AI quality** (trends `LLM analytics`: `$ai_generation`, `ai_draft_reviewed` by `outcome`; hogql `Cost per kept record`: the week's `$ai_total_cost_usd` over its `ai_draft_reviewed` with outcome `kept`); **Slip import** (funnel `Slip import funnel`: `albums_connected`, `slip_scan_finished`, `slip_review_confirmed`); **Travel** (trends `Travel trends`: `home_currency_set`, `trip_started`, `rate_overridden`, `cash_exchanged`); **Reliability** (hogql `Crash-free sessions`: the share of the week's app sessions with no `$exception`; trends `Sync failures` (`sync_failed`, `resync_required`), `Conflicts` (`conflict_shown`), `AI down` (`ai_unavailable`)); **Recap and bridge** (trends `Recaps opened and shared`: `recap_opened`, `recap_shared`; `Cashback card taps`: `cashback_card_tapped`). Each alert: a 30% week-on-week decrease.
- `NORTH_STAR_HOGQL` (Y17, default pending owner Q13), with `B = toDate(toTimeZone(now(), 'Asia/Bangkok'))`: `SELECT avg(days) FROM (SELECT person_id, count(DISTINCT if(event IN ('record_saved', 'slip_review_confirmed'), toDate(toTimeZone(timestamp, 'Asia/Bangkok')), NULL)) AS days FROM events WHERE timestamp >= now() - INTERVAL 8 DAY AND toDate(toTimeZone(timestamp, 'Asia/Bangkok')) >= subtractDays(B, 7) AND toDate(toTimeZone(timestamp, 'Asia/Bangkok')) < B GROUP BY person_id HAVING countIf(properties.origin = 'app' AND event NOT IN ('$exception', 'account_deleted')) > 0)`, `B` written out in full.
- The script prints every request; with `--apply` it posts each dashboard, reads its `id`, posts its trends insights, then prints the manual list (funnels, retention, stickiness, every hogql insight, breakdowns, alerts).

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `DASHBOARDS = []`, bodies `{}`.
  - `there are exactly §7's eight dashboards, each with a drop alert on one of its insights`.
  - `each of §7's Shows items has an insight`: the fixture copies §7's "Shows" column item by item (with Activation's "first record within a day") as dashboard and insight-name pairs, and each pair is in `DASHBOARDS`.
  - `every event is one Jotbun sends or PostHog makes` (a key of `APP_EVENTS`, or in either name list).
  - `every breakdown is a property its event allows` (`source` in `APP_EVENTS.record_saved`, `outcome` in `APP_EVENTS.ai_draft_reviewed`).
  - `the north star counts 7 complete Bangkok days with a record or a confirmed slip, for consenting people only`: `toTimeZone(timestamp, 'Asia/Bangkok')`; no `toDate(timestamp,` or `toDate(now(),`; both day bounds; both events; the `origin = 'app'` filter in `HAVING`.
  - `a trends insight is the documented query`: `trendsInsightBody({ name: 'Travel trends', kind: 'trends', events: ['trip_started'] }, 7)` deep-equals the shape above.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/analytics/dashboards.test.ts`. Expected: every case fails against the stubs, except the two vacuous guards (`every event …`, `every breakdown …`).
- [ ] **Step 3: Implement** `DASHBOARDS`, `NORTH_STAR_HOGQL` and the name lists in `dashboards.ts`, and `dashboardBody`, `trendsInsightBody` and the CLI in `posthog-dashboards.mjs`.
- [ ] **Step 4: Run them and see them pass,** then the app gate.
- [ ] **Step 5: Mutation check.** Add an event outside the allow-list; drop the Bangkok time zone; count today; drop the `origin` filter: each fails its case.
- [ ] **Step 6: Docs.** `owner-setup.md`, in order, each with who, where and its SKIPPED status: D33 and `release/identity.json`; provisioning (P6C-T6); secrets; the Email Service domain; the Access application; **AI Gateway** per environment (`jotbun-staging`, `jotbun-production`; logs and caching off, no rate limit (B27), authentication per P3's gateway question) and `ANTHROPIC_BASE_URL`; **spend alerts (B27)**: Cloudflare billing notifications and Anthropic's console limit and alerts at 50%, 80% and 100% of US$100 a month each (default pending owner Q6); **PostHog EU**: the project with 1D's settings, the keys (`POSTHOG_DASHBOARD_API_KEY` with the two write scopes only), the batch export to `jotbun-analytics-copy` (`https://<account>.r2.cloudflarestorage.com`, a token for that bucket, JSON lines, 90 days, default pending owner Q7), `npm run posthog:dashboards -w gogospend-app -- --apply` then the manual list, and a check that `$ai_generation` for `claude-haiku-5-5` and `claude-opus-5-5` gets `$ai_total_cost_usd` (else P3-T10's allow-list gains PostHog's custom price properties, P3 H8); P6B-T13's `pmf`, `slip_accuracy` and `leaving` as single-choice API surveys with its choice keys, their survey and question UUIDs into identity's `posthog_survey_ids` (`SurveyIds`) and `eas.json`; P6B-T14's flags by their exact keys (`ROLLOUT_FLAGS`, and each `EXPERIMENTS` flag with `control` and its variant); EAS and the stores. `retention.md`: what is kept where and how long (soft deletes and changes 30 days; R2 prefixes 1 day, receipts until deleted; `ERASURE_DB` 60 days; the break-glass audit 365 days by keyed hash, kept after a deletion (counsel, G1); the analytics copy 90 days; Workers Logs without query strings; AI Gateway logs off). `incident.md`: pausing through `config:v1` gates (`kv key get`, edit, `kv key put`), Workers Logs by `failureName`, a support code (P6B-T9: the first eight hex digits of a problem's `request_id`, in Workers Logs only on the Worker's 500 line with `route` and the error class; else the time and screen), PostHog errors, AI Gateway 429s (B27), `rollback.md`, `breakglass.md`, telling people (C9).
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: every console step and `--apply` (Q1). `git commit -m "Add the owner's setup checklist, the eight dashboards as a tested module, and the retention and incident runbooks"`

---

### Task P6C-T12: Release builds: EAS profiles, versions, signing and crash symbols

**Starts after:** P6C-T1, 1C-T7, 1D-T6

**Files:**
- Create: `apps/app/eas.json`, `apps/app/metro.config.js` (`module.exports = getPostHogExpoConfig(__dirname)` from `posthog-react-native/metro`), `apps/app/releaseConfig.js` (CommonJS, Node built-ins only), `apps/app/scripts/eas-pre-install.mjs`
- Modify: `apps/app/app.config.js` (`withRelease` applied last, after 1C-T7's plugins and P6A's `withOutside` when present), `apps/app/package.json` (`"eas-build-pre-install": "node scripts/eas-pre-install.mjs"`), `docs/operations/release.md` ("App builds")
- Test: `apps/app/src/release/releaseConfig.test.ts` (Node)

**Interfaces:**
- Consumes: `release/identity.json`; every `EXPO_PUBLIC_*` name below (base, 1C, 1D-T6, P6B) and P6A's `JOTBUN_IOS_BUNDLE_ID`, `JOTBUN_ANDROID_PACKAGE`, `JOTBUN_APPLE_TEAM_ID`; `posthog-react-native` 4.83.0's `/metro` `getPostHogExpoConfig(projectRoot, options?)` (1D-T6); EAS's `EAS_BUILD_PROFILE`.
- Produces:
  ```js
  // releaseConfig.js
  function withRelease(config, env) {}   // adds ['posthog-react-native/expo', { uploadNativeSymbols: true, skipOnConflict: true }] only when env.POSTHOG_SYMBOL_UPLOAD === '1'; sets extra.eas.projectId and owner from JOTBUN_EAS_PROJECT_ID and JOTBUN_EAS_OWNER when set; never sets ios.config.usesNonExemptEncryption
  module.exports = { withRelease }
  // scripts/eas-pre-install.mjs
  export const POSTHOG_CLI = '@posthog/cli@0.18.10'
  export function preInstallPlan(env) // { problems: string[]; install: string[] | null }
  ```
- `eas.json` (Y16, default pending owner Q10): `cli.appVersionSource` `remote`; profiles `staging` (`distribution: internal`) and `production` (`distribution: store`, `autoIncrement: true`), each `env` (H its host): `EXPO_PUBLIC_V1_API_URL`, `EXPO_PUBLIC_AUTH_URL`, `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_FRONTEND_URL` `https://` + H (the last two for the legacy screens; empty means localhost); `EXPO_PUBLIC_ENABLE_SPEND` `1`; `EXPO_PUBLIC_LEGACY_SPEND` `0`; `EXPO_PUBLIC_REDESIGN` `""`; the two Google ids from identity's `google_client_ids` and `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` `""` (hidden until §4's development-build check); `EXPO_PUBLIC_POSTHOG_KEY` identity's `posthog_project_token`; `EXPO_PUBLIC_POSTHOG_HOST` `""` (1D's proxy); `EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT` `1` (default pending owner Q4); P6B's names (privacy URL `""` until P6C-T14 serves the page, passkey domain H, the support address, `EXPO_PUBLIC_POSTHOG_SURVEYS` the JSON text of identity's `posthog_survey_ids` or `""` while it is empty, both store links `""` until P6C-T13); P6A's ids and `JOTBUN_EAS_PROJECT_ID`, `JOTBUN_EAS_OWNER` from identity; `POSTHOG_SYMBOL_UPLOAD` `1` in production only; `POSTHOG_CLI_HOST` `https://eu.posthog.com`. `submit.production`: `ios.ascAppId`, `ios.appleTeamId` from identity; `android.track` `alpha`, `android.releaseStatus` `completed`. `POSTHOG_CLI_API_KEY` and `POSTHOG_CLI_PROJECT_ID` are EAS secrets.
- `preInstallPlan`: for `production`, a problem for an `.invalid` host, the temporary id `co.gogocash.jotbun.localcheck`, an empty team id, PostHog key or EAS project id; `install` `['npm', 'install', '--global', POSTHOG_CLI]` when `POSTHOG_SYMBOL_UPLOAD` is `1`. The CLI prints problems and exits 1, or installs. `expo.version` is the version people see and `config:v1`'s minimums compare (P6C-T6); build numbers are EAS's remote counters.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `withRelease` returns `config`; `preInstallPlan` `{ problems: [], install: null }`. Through `createRequire`:
  - `store builds add PostHog's symbol upload and other builds do not`, and `only the production profile uploads symbols`.
  - `the Metro config injects PostHog chunk ids`: `metro.config.js` requires `posthog-react-native/metro` and exports `getPostHogExpoConfig(__dirname)`.
  - `no build claims the app uses no encryption` (unset in every result and in `app.json`, Y18).
  - `every EXPO_PUBLIC name the app reads is set in both profiles`: the names matched by `/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g` in `apps/app/src`, `apps/app/app` and `app.config.js`, test files skipped, are a subset of each profile's `env` keys.
  - `no store profile points at localhost`, and `each profile points at its own host`.
  - `both profiles carry the PostHog project token and survey ids from release/identity.json`, and `store builds carry the EAS project id from release/identity.json`.
  - `store builds carry no unapproved screens or pages` (`EXPO_PUBLIC_REDESIGN` and `EXPO_PUBLIC_PRIVACY_URL` `""`).
  - `Android builds go to the closed testing track`.
  - `every extension target signs under the app's bundle id`: each `extra.eas.build.experimental.ios.appExtensions[].bundleIdentifier` in the evaluated config starts with the identity's `ios_bundle_id` and a dot (none until P6A's targets exist: the receipt records the check SKIPPED until then).
  - `the pre-install hook refuses a production build with placeholders, and installs the PostHog CLI only for symbol uploads`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/release/releaseConfig.test.ts`. Expected: every case fails against the stubs, except `no build claims …` and the extension-target case (guards).
- [ ] **Step 3: Implement** `withRelease` in `releaseConfig.js`, `metro.config.js`, `eas.json`, `preInstallPlan` and its CLI in `eas-pre-install.mjs`, and the `app.config.js` line.
- [ ] **Step 4: Run them and see them pass,** then the app gate.
- [ ] **Step 5: Mutation check.** Add the plugin always; set `usesNonExemptEncryption: false`; drop the staging API URL; leave the Metro config on Expo's default: each fails its case.
- [ ] **Step 6: Docs.** "App builds": the profiles, `npx eas-cli build --profile <name> --platform <ios|android>` and `npx eas-cli submit --profile production` on the owner's machine (default pending owner Q10), EAS-managed signing for the app and every extension target P6A adds (from `npx expo config --type introspect`), the version rule, `ios.privacyManifests` filled from Xcode's privacy report of the first archive, checking a symbolicated JavaScript test crash and a native one in PostHog, a new app's first Play upload made by hand in the Play Console, and `releaseStatus: draft` while the Play app is still a draft.
- [ ] **Step 7: Gate, receipt, commit.** SKIPPED: the EAS project, credentials, builds, submissions, symbol upload (Q1, Q10). `git commit -m "Add EAS release profiles with remote versions, crash symbol upload for store builds only, and a pre-install check"`

---

### Task P6C-T13: The store records: listing text, privacy answers, review access and store links

**Starts after:** P6C-T3, P6C-T5, P6C-T12
**Delivers:** P6C:store-listings

**Files:**
- Create: `apps/app/store/listing.json`, `apps/app/store/privacy.json`
- Modify: `apps/app/eas.json` (both store links)
- Test: `apps/app/src/release/storeListing.test.ts` (Node)

**Interfaces:**
- Consumes: `release/identity.json`; `PAGE_PATHS` (P6C-T3); the review sign-in (P6C-T5); `docs/design/bun-wallet/*.dc.html`.
- Produces (P6B's store link reads the two URLs):
  - `listing.json`: `{ status: 'draft', apple: { name, subtitle, promotional_text, description, keywords, support_url, privacy_url }, google: { title, short_description, full_description }, review: { notes }, screenshots: [{ board, locale, theme }] }`, every text `{ th, en }`, the URLs the production host's `/support` and `/privacy`.
  - `privacy.json`: `{ status: 'draft', tracking: false, processors: [{ name, purpose, region? }], apple_labels: [{ data, purposes, linked }], play_data_safety: { collected: [{ data, purposes, optional }], shared: [], encrypted_in_transit: true, deletion: { in_app: true, url } }, encryption: { uses_encryption: true, answer: 'pending counsel', notes } }`; processors `Cloudflare` (hosting, storage), `PostHog` (`EU`; analytics after consent, crash reports), `Anthropic` (Bun AI once turned on), `Expo` (push delivery), `Resend` (email, only if turned on). Draft answers (default pending owner Q4): Apple `Email Address` (App Functionality, linked); `Other Financial Info`, `Other User Content` and `Photos or Videos` (records, notes, receipt photos: App Functionality, linked); `User ID` and `Product Interaction` (Analytics, linked, after consent); `Crash Data` (App Functionality, not linked, sent without consent while the switch is on). Play `Email address` (App functionality, Account management); `Other financial info`, `Other user-generated content` and `Photos` (App functionality); `User IDs` and `App interactions` (Analytics, optional); `Crash logs` and `Diagnostics` (App functionality); nothing shared, nobody tracked.
  - `eas.json` production: `EXPO_PUBLIC_APP_STORE_URL` `https://apps.apple.com/app/id<app_store_id>`, `EXPO_PUBLIC_PLAY_STORE_URL` `https://play.google.com/store/apps/details?id=<android_package>`, each `""` while its id is a placeholder or `confirmed_by_owner` is false.
- Copy (drafts, default pending owner Q5): name `Jotbun`; subtitle `บันจดเงิน สมุดจดเงินส่วนตัว` / `A private money diary`; the description from the trust page's six promises and §5.2's flows; review notes say sign-in is by email code and that the owner enters the review address and code in each console's review fields, never in this file.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: both files `{ "status": "draft" }`.
  - `listing text fits each store's limits, in both languages`: App Store name and subtitle 30 characters, promotional text 170, keywords 100, description 4000; Play title 30, short description 80, full description 4000.
  - `listing text is Thai and English, with no emojis or dashes`.
  - `the listing never says Jotbun cannot read records, never shows a cashback amount, never says AI saves for you`: no match for `/cannot read|ไม่สามารถอ่าน|end-to-end/i`, `/(เงินคืน|แคชแบ็ก|cashback)[^.]*฿|฿[^.]*(เงินคืน|แคชแบ็ก|cashback)/i` or `/AI บันทึกให้/`.
  - `support, privacy and deletion URLs are the production pages`.
  - `the privacy answers name Cloudflare, PostHog in the EU, Anthropic, Expo and Resend, track nobody, and give the deletion page`.
  - `the draft privacy answers declare each data type with its purpose` (each Apple and Play entry above, deep-equal).
  - `nobody declares the app free of encryption`.
  - `the store links are built from the store ids, and empty until the owner confirms`.
  - `every screenshot names an existing board`, and `review notes hold no six-digit number`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/release/storeListing.test.ts`. Expected: every case fails against the stubs, except the anti-goal case (a guard).
- [ ] **Step 3: Write the records** and the two `eas.json` values.
- [ ] **Step 4: Run them and see them pass,** then the app gate.
- [ ] **Step 5: Mutation check.** Add `Jotbun cannot read your records`; drop Expo from the processors: each fails its case.
- [ ] **Step 6: Receipt, commit.** SKIPPED: the App Store Connect and Play Console records, screenshots, age rating, reviewer fields (Q1, Q5). `git commit -m "Add the store records: listing text, privacy and Data safety answers, review access notes and the store links"`

---

### Task P6C-T14: E2: approve the pages, the emails and the listing text, then serve the pages

**Starts after:** P6C-T3, P6C-T4, P6C-T13; Steps 2 to 7 also wait on the owner's E2 approval of the pages, emails and listing text (Step 1), with any changes applied first.

**Files:**
- Create: `apps/edge/test/previews.test.ts`
- Modify: `apps/edge/src/web/pages.ts` (`APPROVED_PAGES`), `src/routes/index.tsx` (the trust page's footer links the three pages), `src/auth/email-copy.ts` (approved lines lose `// DRAFT`), `apps/app/store/listing.json` (`status: 'approved'`), `apps/app/eas.json` (both `EXPO_PUBLIC_PRIVACY_URL`s), `apps/app/src/release/releaseConfig.test.ts`, `test/pages.test.ts`, `test/c1-worker.db.test.ts`

**Interfaces:**
- Consumes: `servePage`, `PAGE_PATHS` (P6C-T3); `signInCodeEmail`, `deletionEmail` (P6C-T4); `listing.json` (P6C-T13); 1B-T13's trust-page case.
- Produces: `APPROVED_PAGES = ['privacy', 'deletion', 'support']` once approved; `previews.test.ts` renders every page and email and, only with `WRITE_PREVIEWS=1`, writes `apps/edge/.wrangler/previews/<name>.html`.

- [ ] **Step 1: The E2 checkpoint (a controller step).** Screenshots of the three pages from `npm run dev:edge` at 320 and 390 px, light and dark; `WRITE_PREVIEWS=1 npm run test:edge -- test/previews.test.ts`, then the email previews (the code email; the deletion email in Thai and English, with and without a reply-to) in a browser; the listing text. The owner's words go into the receipt and rewritten lines into the files first. The policies stay `draft` until counsel (default pending owner Q4).
- [ ] **Step 2: Write the failing tests.** `pages.test.ts`: `approved pages are served in staging and production, without the ribbon`. `c1-worker.db.test.ts`: `the built Worker serves the approved pages`, and the trust-page case gains `href="/privacy"`, `href="/support"` and `href="/delete-account"`. `previews.test.ts`: `every page and email renders`. `releaseConfig.test.ts`: its pages case now expects each profile's privacy URL to be `https://` + its host + `/privacy`.
- [ ] **Step 3: Run them and see them fail.** Run: `npm run test:edge -- test/pages.test.ts test/previews.test.ts`, then `npm run build:edge && npm run test:edge:db -- test/c1-worker.db.test.ts`, and `npm run test:unit -w gogospend-app -- src/release/releaseConfig.test.ts`. Expected: the approval, footer and privacy URL cases fail; `every page and email renders` passes (a guard).
- [ ] **Step 4: Implement:** `APPROVED_PAGES`, the footer links (`นโยบายความเป็นส่วนตัว · Privacy`, `ช่วยเหลือ · Help`, `ลบบัญชี · Delete account`, approved at Step 1), the `// DRAFT` marks, the listing status, both privacy URLs.
- [ ] **Step 5: Run them and see them pass,** then the edge and app gates.
- [ ] **Step 6: Mutation check.** Leave `support` out of `APPROVED_PAGES`: the built-Worker case fails.
- [ ] **Step 7: Receipt, commit.** `git commit -m "Serve the approved pages, link them from the trust page, and mark the approved emails and listing text"`

---

### Task P6C-T14b: The beta's release switches

**Starts after:** P6C-T7, P6C-T14; Step 6 also waits on the owner's yes per switch and environment.

**Files:**
- Modify: `apps/edge/scripts/release/check-environments.mjs`, `test/release/environments.test.ts`, `docs/operations/release.md` ("Release switches", with each switch's needs); at Step 6, `apps/edge/wrangler.jsonc`

**Interfaces:**
- Produces: `switchProblems(config): string[]`: `AI_ENABLED`, `IMPORT_UPLOADS_ENABLED`, `GOGOCASH_BRIDGE_ENABLED`, `SLIP_IMPORT_ENABLED` and `PUSH_SEND_ENABLED` are each `"true"` or `"false"` in a block, `"true"` in production only when staging's is, and `SLIP_IMPORT_ENABLED` `"true"` only beside `AI_ENABLED` `"true"`.
- Needs: `AI_ENABLED`, the gateway URL and `ANTHROPIC_API_KEY`; `IMPORT_UPLOADS_ENABLED`, P6C-T6's R2 lifecycle rules; `GOGOCASH_BRIDGE_ENABLED`, none (a live list adds `GOGOCASH_CATALOGUE_URL`, A20); `SLIP_IMPORT_ENABLED`, P4-T24's approval and P3-T12's decoder in the store builds (A24, P4 S13); `PUSH_SEND_ENABLED`, `EXPO_ACCESS_TOKEN` and APNs and FCM in the EAS project.

- [ ] **Step 1: Stub, then write the failing test.** Stub: `[]`. `environments.test.ts`: `a release switch goes on in staging first, and slip import only with Bun AI` (production's `AI_ENABLED` `"true"` beside staging's `"false"`, `SLIP_IMPORT_ENABLED` `"true"` without `AI_ENABLED`, and `"yes"` each give one problem naming the switch; the repository's config `[]`).
- [ ] **Step 2: Run it and see it fail.** Run: `npm run test:edge -- test/release/environments.test.ts`. Expected: the three fixtures fail; the repository case passes (a guard).
- [ ] **Step 3: Implement** `switchProblems`.
- [ ] **Step 4: Run it and see it pass,** then the edge gate, which every deploy job runs.
- [ ] **Step 5: Mutation check, receipt, commit.** Compare production with itself: the staging-first fixture fails. `git commit -m "Check that each release switch goes on in staging first"`
- [ ] **Step 6: The owner's release (a controller step, staging first).** With the yes and the needs met, the switches become `"true"` in one block per commit (`git commit -m "Turn on <switches> in <environment>, as the owner approved"`), deployed by `deploy.yml`. SKIPPED until then (Q1).

---

### Task P6C-T15: The closed beta: its runbook, its gate and the release proof

**Starts after:** P6C-T1b, P6C-T7, P6C-T9b, P6C-T10b, P6C-T11, P6C-T14, P6C-T14b, 1C-T13, 1D-T15

**Files:**
- Create: `scripts/ops/beta-gate.mjs`, `scripts/ops/beta-gate.test.mjs`, `docs/operations/beta.md`
- Modify: `docs/implementation/beta-receipts.md` (1D-T15's run-sheet stays first; the retired stack's P6b sections become `## Beta gate` and `## Owner questions`), `docs/implementation/handover.md` (section 1's operations list: the runbooks P6C writes, without `auth0-runbook.md` and `e1-setup.md`), root `package.json` (`test:ops`), `docs/implementation/premium-progress.md` (the closing receipt)
- Test: `scripts/ops/beta-gate.test.mjs` (node:test)

**Interfaces:**
- Consumes: every P6C script; `docs/superpowers/plans/2026-10-25-jotbun-*.md`; 1C-T12's `auth-proof.mjs` and `dev.mjs`; `NORTH_STAR_HOGQL` (P6C-T11).
- Produces:
  ```js
  // scripts/ops/beta-gate.mjs: CLI prints each problem; exit 0 only when none
  export const PLAN_IDS = { p1a: '1A', p1b: '1B', p1c: '1C', p1d: '1D', p2: 'P2', p3: 'P3', p4: 'P4', p5: 'P5', p6a: 'P6A', p6b: 'P6B', p6c: 'P6C' }
  export function planIdOf(fileName)     // '2026-10-25-jotbun-p6c-release-beta.md' is 'P6C'; others null
  export function planQuestions(text)    // ['Q1', ...]: every **Q<n> and 'Q<a> to Q<b>' range in the question block, from the first '## Owner questions|answers|decisions', '**Open questions for the owner**' or '**Owner questions**' line to the next '## '
  export function parseGate(markdown)    // { rows: { id, item, status, evidence }[], questions: { key, answer }[] }
  export function gateProblems(markdown, plans) // plans { file, text }[]: a row not PASS or without evidence; a question unanswered ('decided <date>: …' or 'default accepted <date>'); a '<plan> Q<n>' missing
  ```
- Gate rows: **G1** counsel signs off every Q4 item (Q4, Q7, §6.11); **G2** the Anthropic retention decision and zero retention (§6.7); **G3** the break-glass tool live behind Access with one view, one restore and one staff deletion rehearsed on test accounts in its audit (P6C-T9, T9b, T10b); **G4** Apple token revocation proven on a device (1C-T13); **G5** every receipt PASS: each SKIPPED hosted or device check in the receipts of 1A to P6C is PASS or waived in writing; **G6** every E2 checkpoint of every plan approved (the owner's screenshots); **G7** D33 done, `confirmed_by_owner` true, `release:preflight production` passing; **G8** the C9 address reaching a person; **G9** staging and production deployed, `release:smoke` passing on both; **G10** spend alerts (B27), AI Gateway, the PostHog project, priced AI generations, dashboards, alerts and batch export; **G11** a TestFlight build and a Play closed-track release with symbols uploaded, listings and review access in place; **G12** every owner question answered or its default accepted; **G13** each release switch set as the owner decided, staging first (P6C-T14b).
- The question table holds every question of every plan. Decided ones carry their decision and date (1B's Q1 to Q4; 1C's Q1, Q3, Q4, Q5, Q7; 1D's Q1 to Q18, decided 2026-10-25, the owner actions behind its Q4 to Q9 staying under G1, G6, G10 and G11). Still open: 1C's Q2 and Q6; P2's Q1 to Q3; every question of P3, P4, P5, P6A and P6B by its final number (boundaries §6's topics); P6C's Q1 to Q14 (B27's limiter is Q11). One more row covers the controller's calls B1 to B27 and the plans' own calls, which the owner may overturn.
- `beta.md`: TestFlight (an internal group, then an external one after Beta App Review); Play closed testing (`alpha`), with at least 12 testers for 14 days in a row if the account is personal (default pending owner Q5); each tester answers the consent question (D34); feedback through C9, P6B's surveys and TestFlight; the weekly watch (each new PostHog error class triaged before the next build, `sync_failed`, AI Gateway 429s and errors, B27: 429s bring back Q11, spend alerts); stopping (KV gates, then `rollback.md`); the north-star baseline (`NORTH_STAR_HOGQL` weekly from the first full week with at least 20 consenting testers; targets set from it, §1).

- [ ] **Step 1: Stub, then write the failing tests.** Stubs return `[]`, `null` or empty tables. `planQuestions reads every question in the block` (bullets and numbers, each heading form, `**Q3. a** … **Q4. b**`; a `**Q9` after the block is not read); `a range Q4 to Q7 yields four questions`; `two questions on one line yield both`; `planIdOf maps the plan files and ignores others`; `an open gate row fails, naming it`; `a PASS without evidence fails`; `a question missing from the table fails, naming plan and number`; `an unanswered question fails`; `a complete fixture passes`.
- [ ] **Step 2: Run them and see them fail.** Run: `node --test scripts/ops/beta-gate.test.mjs`. Expected: every case fails against the stubs, except `a complete fixture passes` (a guard).
- [ ] **Step 3: Implement** the script, write `beta.md`, rewrite `beta-receipts.md` with every row open, and update handover's list.
- [ ] **Step 4: Run them and see them pass,** then `npm run test:ops`.
- [ ] **Step 5: Mutation check.** Accept `SKIPPED` as passing; read only the first question of a line: each fails its case.
- [ ] **Step 6: The release proof, locally.** Record each: `npm run check:envs --prefix apps/edge` (PASS, the break-glass bundles included); `npm run release:preflight --prefix apps/edge -- production` (exit 1 naming today's placeholders: the guard holds); `node scripts/auth-proof.mjs` from `apps/edge` (1C-T12, PASS) and, while 1C-T12's `dev.mjs` serves the Worker, `npm run release:smoke --prefix apps/edge -- http://127.0.0.1:8092` (PASS for every default check); the break-glass, staff deletion and restore suites (PASS); `node scripts/ops/beta-gate.mjs` (exit 1, every row open). **SKIPPED**, each with its reason (Q1, the owner's yes): provisioning, secrets, remote migrations, the `config:v1` seed, the Access application, both deploys and their smoke checks, the release switches, break-glass, staff deletion and restore rehearsals on staging, EAS builds, TestFlight and the Play closed track, a real phone signing in against staging, the beta's start and its baseline.
- [ ] **Step 7: Receipt, commit, review.** The closing receipt: what each task proved, the mutants, the proof's output, every SKIPPED item and what it waits for, each owner question with its default, B27 as applied. `git commit -m "Add the closed beta runbook, a checked beta gate that names every open owner question, and the local release proof"`. Then the independent read-only review of the whole P6C range (handover §4 step 8), fixing findings test-first.

---

## Self-review notes (for the executor)

- **Spec coverage.** §6.11 (T8 to T10b, G1); §6.14 (T1, T1b, T7, T11, T12); §6.15 and §7 (T11: every "Shows" item); §10 (T1, T3, T4, T6, G7, G8); §5.2 and §5.3 (T4); §8 item 6 (T14b, T15).
- **Applied:** R26, R52, R23 to R25, R57, C12, C17, §4 Logging; A12 (T4), A20 (Shared files, T1), A21 (Y10), A22 (Y14, T10a), A23 and A37 (Y13, T9b), A36 (T2); B22 (T2), B27.
- **For the controller:** P6C-T10a edits 1C's `create-auth.ts`, `account-plugin.ts` and `deletion/request.ts` (A22); P6C-T4 edits 1C-T11's deletion email case (the DEL code, `fromApp`) and 1C-T1's `EmailBinding`; P6B-T10, if it lands after P6C-T6, raises `RELEASE_CLIENT_MINIMUMS` to its `0.4.0`; P6C-T14b is P4's release step for the var switches (`slips` joins `APPROVED` in P4-T24).
