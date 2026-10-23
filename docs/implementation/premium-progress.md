# Premium, AI and edge progress

Receipts for the [premium, AI and edge plan](../superpowers/plans/2026-10-24-jotbun-premium-ai-edge.md). The owner asked for it on 24 October 2026; the decisions (D12–D22) and their reasons are in the plan's §1.

**Where things stand:**
- **Built and verified locally:**
  - the backend on Cloudflare in `apps/edge`: every v1 route, AI and the GoGoCash catalogue on the TanStack Start Worker, the API's job, security and deletion workers as Workers of their own, and import parsing in a Cloudflare Container built from the API's release image;
  - migration 0019;
  - the shared contracts;
  - the app's premium layer: haptics, Tell Bun, Ask Bun, the daily note, the cashback card and the Thai everyday categories;
  - eight catalogue sections for the companion area, checked in the browser in Thai, light and dark.
- **SKIPPED:**
  - hosted Cloudflare resources: wrangler is signed in to a GoGoCash account, but deploying waits for the owner to ask (handover rule), and no hosted PostgreSQL exists yet;
  - the parser container on Cloudflare (its image builds and passes the release smoke locally; its entry is proven end to end in Node);
  - live Claude calls (no API key on this machine);
  - real-device haptics;
  - Mobbin searches (the Mobbin connector is not authorized and mobbin.com answers the in-app browser with 403; §2 of the plan names the searches to run);
  - E2 screenshot approval of the companion area (the sections exist; the owner's approval does not).

## E: the edge backend (`apps/edge`)

- **Stack:**
  - TanStack Start 1.169.4 with the Cloudflare Vite plugin 1.65.0 and Vite 8.3.5;
  - wrangler 4.152.0;
  - Hyperdrive with `pg` 8.23.1;
  - R2, Queues, Cron Triggers and a Container across four Worker configs (`wrangler.jsonc`, `wrangler.jobs.jsonc`, `wrangler.security.jsonc`, `wrangler.deletion.jsonc`), built together through the plugin's auxiliary Workers.
- **Install:** its own lockfile. Installed in the root workspace, wrangler's `miniflare` hoisted `sharp` and moved the API's pinned Linux bindings (`lockfile-bindings.test.mjs` failed), so the root workspaces are now listed explicitly and the edge installs alone.
- **Reuse:** the API's domain modules are imported unchanged. `api-seams.ts` swaps `@nestjs/*` for no-op stand-ins at build time; oxc compiles the legacy decorators. `container.ts` wires the object graph as the Nest modules do.
- **Database:** a request-scoped pool facade (AsyncLocalStorage) gives each request its own pool, closed before the response leaves, because Workers cannot share sockets across requests.
- **Readiness:** `/ready` is evaluated per request. The API's HealthService shares an in-flight promise across requests, which a Worker must not do.
- **Background roles (D21):** `src/server/jobs/roles.ts` runs the API's job, security and deletion workers per Cron Trigger or queue wake-up, each Worker with only its own logins and secrets. Routes that queue work wake their role after the response (`waitUntil`).
- **Import parsing (D22):** `apps/api/src/imports/parse-worker.ts` (new) claims `import_parse` only and exits when idle. It is in the release graph and the release smoke, and the jobs Worker starts it in the release image as a Container.
- **Runtime gaps found in workerd:** Workers do not implement `redirect: "error"`, which the Auth0 Management client uses. Sign-in bootstrap and every maintenance call would have failed on Cloudflare. `src/server/http/fetch.ts` emulates it as the Fetch standard defines it; `test/workerd-roles.db.test.ts` fails without it (sabotage-checked). The API's `*.client.ts` Auth0 clients are let through TanStack Start's client-file rule by exact path.
- **Storage:** `src/server/storage/r2-object-store.ts` implements the API's `ObjectStore` on the R2 binding, interoperable with the S3 adapter (the digest is `sha256` custom metadata).

| Suite | Result |
| --- | --- |
| `test/route-coverage.test.ts` | Every NestJS v1 route is ported; none is forwarded (4 checks + edge-only shadowing). Mutation-checked: a dropped forward, a changed access class and a POST status falling back to 201 are each caught; a PATCH without `status` is not a mutation (PATCH defaults to 200). |
| `test/dispatch.db.test.ts` | 25 passing: envelope, pipeline order (426 → 401 → session → policy), commands, replay and mismatch, stale If-Match, RLS, the money journey, bodies, gates, forwarder. Sabotage checks: removing the client-version check fails 2 tests. Removing the guard's policy check failed nothing at first, because the executor re-checks inside the transaction. A test now pins that the guard answers before body validation, and that sabotage fails it. |
| `test/parity.db.test.ts` | The built NestJS v1 server and the edge run one 49-step session on one database. Every status, key header and normalized body is identical, across 200, 201, 204, 400, 401, 403, 404, 409 and 422. Sabotage: answering policy acceptance with 200 instead of 204 is caught at step 4. |
| `test/parity-auth.db.test.ts` | 37 steps, identical on both: challenges, ID-token bootstrap (Auth0 Management fake), proofs, linking, global logout, deletion and its receipt, signed provider events (applied, duplicate, too large, malformed). Each phase has its own account, because sign-in steps are limited to 10 per identity a minute. Sabotage: a receipt answering 403 instead of 404 is caught at two steps. |
| `test/parity-files.db.test.ts` | 44 steps, identical on both: snapshot requests and status, export proofs and requests, uploads (types, names, empty, replay), status and preview, review, freeze and confirm validation, receipt retain, replace and remove. |
| `test/jobs.db.test.ts` | 7 passing, each role run as its Worker runs it: a snapshot built and served chunk by chunk with matching digests; an export streamed with its length and a UTF-8 byte-order mark, and a tampered file refused; the sweep with no error line; a provider revocation after global logout; a deletion purged with its receipt `completed`; an upload parsed by the container's entry, then reviewed, frozen and confirmed into the diary. |
| `test/workerd-roles.db.test.ts` | 4 passing in `wrangler dev` (workerd): sign-in through the Auth0 profile check; the jobs, security and deletion Workers' Cron runs, the jobs Worker sharing R2 with the HTTP Worker. |
| `test/workerd.db.test.ts` | The built Worker in `wrangler dev` (workerd). `/live`, `/ready` through Hyperdrive (503 without readiness receipts, as the API), the trust page, a signed-in money session, RLS isolation, an unserved route 404: 6 passing. |
| `test/ai.db.test.ts` | 17 passing with a scripted model:<br>• consent and the notice version;<br>• preferences under RLS;<br>• grounded drafts with `claude-opus-5-5`, `fallbacks: "default"` and `server-side-fallback-2026-07-01`, and no account id, binding, subject or balance in the request;<br>• invented amounts dropped;<br>• rules fallback on refusal, error or an empty answer;<br>• no AI configured;<br>• the daily limit (429, count stays at the limit);<br>• slips;<br>• the note grounded or replaced by facts;<br>• Ask Bun's tool loop, ungrounded answers and bad tool input;<br>• figures worded in the question's language ("อาหาร 1–29 ต.ค. 2569"), not as tool input. Sabotage: restoring the old `expense 2026-10-01…` labels fails it. |
| Unit (`npm run test:edge`) | 114 passing: request parsing (the 8 KiB raw body too), route matching, the Workers fetch, the R2 store contract on Miniflare's R2 (the API's contract cases; sabotage: dropping the precondition fails both never-overwrite cases), the sentence parser (Thai number words, "ห้าง" is not five, "5km" is not 5,000), grounding, draft sanitizing, plain facts, figure labels (Buddhist-era years in Thai), the cashback catalogue. |

Migration 0019 (`ai_preferences`, `ai_usage`, owner RLS, cascade on account deletion) passes the API's own `migrations.integration.spec.ts`: RLS on every table, Drizzle matches the SQL, repeatable. The full API suites still pass: 945 unit (the parse worker's spec added 3) and 694 PostgreSQL. The release image builds with the parse worker in its release graph, and its smoke passes: every process, the parse worker included, loads the contracts and fails closed at its first database connection.

## A: the app's premium layer

- **A1 Haptics:**
  - The engine has new verbs: light, rigid, warning, and a three-beat celebrate.
  - Twelve new moments in `motion.haptic`.
  - A Haptics setting (On, Subtle, Off) that `playHaptic` applies everywhere.
  - Wired into Keypad, TypeSwitch, the chips, DateChip, TabBar, UndoBar, FilterChips, Quick add (success online, a light tap when kept on the phone, error), delete and restore, the budget 80% and 100% crossing (session memory, once per level and month) and the good-week celebration (once per ISO week).
  - The sign-out erase forgets the setting.
- **A2 Thai and SEA ease:**
  - The "Thai everyday" pack (family support, merit making, delivery, phone and internet, pets, lottery; money from family) as ordinary custom categories, skipping any the person already has in either language.
  - Thai dates already showed Buddhist-era years, so no setting was needed.
  - Simple mode was not built: Dynamic Type up to AX5 (R8) already enlarges every screen.
- **A3 AI companion:**
  - The consent sheet.
  - Tell Bun in Quick add: typed sentences work offline through the shared rules; slips need AI help.
  - Ask Bun (`/spend/ask`), with the figures each answer used.
  - Settings controls with today's uses left.
- **A4 Daily love:**
  - Bun's daily note on Home, kept 2 hours per day and language so visits spend no new AI use.
  - The good-week celebration.
  - Rotating reminder wording is a follow-up: reminders are scheduled with fixed content, and the preview tests pin it.
- **A5 GoGoCash bridge:**
  - A count of the month's purchases at cashback shops, never a baht figure (the rule the legacy screen already wrote down).
  - Shown after 7 logged days, asked once, "No thanks" remembered.
  - "Why am I seeing this?", and Open GoGoCash with no data attached.

Gate after these changes (24 October 2026): `typecheck:app` and `typecheck:routes` pass; `test:app` 28, `test:unit` 682 and `test:render` 1,583 passing (83 files, the catalogue's 525 included); `export:web` builds; `catalogs.test.ts` passes. The edge gate on the same tree: `typecheck:edge`, 93 unit, `build:edge`, 49 PostgreSQL, and the 7 CI script tests. Every new string is in English and Thai; Vietnamese falls back to English, as decided.

## Not done, or follow-ups

- **Mobbin:** the planned searches (plan §7) once the connector is authorized; findings would refine the AI and cashback screens.
- **E2 screenshots** of the companion area. Its eight catalogue sections are in (`src/dev/catalogue/companion`): Ask Bun off and answering, Tell Bun reading a Thai sentence, Bun's note on Home, the cashback card asking and on, the Settings controls and the Thai pack. The area is on by default at the owner's request; `EXPO_PUBLIC_REDESIGN=-companion` switches it off.
- **Hosted proofs, when the owner asks for a deployment:**
  - a hosted PostgreSQL and its least-privilege logins;
  - six Hyperdrive configs with caching off;
  - R2, three queues and the parser container;
  - each Worker's secrets (apps/edge/README.md);
  - an Anthropic key (with an AI Gateway if wanted);
  - a GoGoCash catalogue URL.

  Wrangler on this machine is already signed in to a GoGoCash account.
