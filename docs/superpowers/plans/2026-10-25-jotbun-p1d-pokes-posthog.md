# Phase 1D: live pokes, the pending choice, PostHog and the phase 1 proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A change saved on one phone reaches the person's other phones within seconds through a hibernating WebSocket poke from their UserVault; an edit refused with `VERSION_CONFLICT` is kept on the phone until the person chooses; PostHog runs behind consent with the privacy line enforced by tests; and the phase 1 proof runs on two phones against local `wrangler dev`.

**Architecture:** `GET /v1/sync/live` goes through 1A's front door (`handleVaultV1`), which hands the upgrade to the caller's vault at the point where any other route would call it. The vault accepts the socket with the Hibernation API, compares `sync_state.revision` before and after every call and alarm, and sends `{"revision":"<n>"}` to the person's other sessions; the phone then runs its ordinary sync. Refused record edits live in a new table of the encrypted diary and are shown by 1D's `ChoicePanel` (board `rh-conflict`). PostHog sits behind the app's `analytics/` bus: 1D owns the allow-list, the typed emitters every plan calls, the consent controller (the server's answer is the truth) and PostHog's `before_send` gate. The Worker proxies PostHog EU at `/ingest/*` and sends a few server events with `posthog-node`, flushed with `waitUntil`.

**Tech Stack:** Cloudflare Workers and SQLite Durable Objects (WebSocket Hibernation API), Workflows; `@cloudflare/vitest-plugin` 1.4.7 (installed); wrangler 4.152.0; `posthog-node` (Worker); Expo SDK 58 with React Native 0.88.0, `expo-router`, `expo-secure-store`; `posthog-react-native` and `@posthog/react-native-plugin` (app); Node's test runner and Vitest 4.1 (render tests).

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md). This plan implements the last part of §8 phase 1: §3 (C16, D26, D32, D34), §4 (packages, copy, logging), §6.5, §6.11, §6.12 step 6, §7 and the phase 1 proof. It builds on [the 1A plan](2026-10-25-jotbun-p1a-vault-core.md) and the code 1A has landed (`src/v1/*`, `src/vault/*`), and uses their names exactly.

**Phase 1 plans and phase 2.** 1A is the vault core. 1B adds files and background work (1B-T3 adds Worker routes, `UserVault#erased` and `claims.authTime`; 1B-T13 folds the vault into the HTTP Worker). 1C brings Better Auth: the app's port (1C-T5), the vault join with `accountGate` and the revocation RPCs (1C-T10a, wired into the HTTP Worker by 1C-T10b), the `created` flag on a sign-in (1C's K23), and the `DeletionWorkflow` whose step 6 hook this plan fills (1C-T11). **1D (this plan)** adds live pokes, the C16 pending choice, PostHog and the two-phone proof. Phase 2 (`2026-10-25-jotbun-p2-bun-wallet-core.md`) emits its screens' events through 1D's API and restyles 1D's conflict component (the controller's rulings R23 to R25).

**Shared files** (other plans' tasks edit these too; 1D's edits are additive):
- 1A's Worker side: `apps/edge/src/v1/protocol.ts`, `routes.ts` (where `VaultRoute` lives), `handler.ts`, `env.ts`. 1A's vault side: `apps/edge/src/vault/user-vault.ts`, `src/vault/routes.ts`.
- Runtime and build: `apps/edge/src/cloudflare-workers.d.ts`, `src/server.ts` (1D-T2, 1D-T12), `src/routes/v1/$.ts` and `src/vault-worker.ts` (after 1B-T13; 1D-T12), `apps/edge/package.json` (1D-T3's `posthog-node`, 1D-T12's `proof:live`) and `package-lock.json` (1D-T3 only). 1D sets no analytics secret in `vitest.workers.config.ts` (1D-T11).
- Edge tests and docs: `apps/edge/test/workers/support/v1-client.ts`, `test/vault-route-coverage.test.ts` (and, after 1B-T13, `test/route-coverage.test.ts`), `apps/edge/README.md`, `docs/implementation/premium-progress.md`, `docs/implementation/beta-receipts.md`.
- 1C's files that 1D fills: `apps/edge/src/deletion/hooks.ts`, `src/deletion/workflow.ts`, `test/workers/deletion.test.ts` (1D-T13); the RPCs 1C adds to `src/vault/user-vault.ts` (1D-T12 closes sockets at their end); `apps/app/src/auth/credentialProvider.ts` and its test (1D-T14). 1D-T12 adds `apps/edge/scripts/local-auth.mjs`, which 1C-T12's `auth-proof.mjs` may import.
- The app, with 1C: the root `package-lock.json` and `apps/app/package.json` (1D-T6 only), `src/api/client.ts`, `src/api/sharedV1.ts`, `src/spend/v1/DeviceDiaryProvider.tsx`, `app/_layout.tsx`, `app/spend/_layout.tsx`, `src/screens/redesign/account/OnboardingScreen.tsx` (1C-T8 adds its welcome link). 1C-T5 keeps `subscribeSession`, `getV1SessionSnapshot` (`src/auth/session.ts`, comments only) and `V1Credentials.getAccessToken()`, which 1D calls.
- The app, with phase 2 (R23 to R25): `QuickAddScreen.tsx` and `entry/entrySave.ts` (P2-T5), `RecordScreen.tsx` and `record/recordActions.ts` (P2-T6), `RecentlyDeletedScreen.tsx` and `deleted/deletedData.ts` (P2-T25), `HistoryScreen.tsx` and `history/historyData.ts` (P2-T28), `HomeScreen.tsx` (P2-T23), `planning/WalletsScreen.tsx` and `planning/walletCommands.ts` (P2-T19), `planning/BudgetScreen.tsx` and `planning/budgetCommands.ts` (P2-T30), all under `apps/app/src/screens/redesign/`; `app/spend/_layout.tsx` (P2-T18's wallet branch, where 1D-T8's question takes `WalletShell`'s place, R82); `src/spend/v1/redesign/shared.ts`; `src/config/featureFlags.ts`; `src/dev/catalogue/registry.tsx`. P2-T7's `thaiPack.ts` is read, not edited. Phase 2 has no event module of its own: its emitters call 1D's `src/analytics/events.ts` (R23).
- Not touched by 1D: `RemindersScreen.tsx` and `src/notifications/*` (another session's until its commit, then P2-T36's).
- Within this plan, tasks that may run at the same time touch: `src/spend/v1/spendDiary.ts` and `src/storage/diaryRepository.ts` (1D-T4, 1D-T5), `HistoryScreen.tsx` and `HomeScreen.tsx` (1D-T5, 1D-T7, and 1D-T9 for History), `RecordScreen.tsx` (1D-T7, 1D-T9), `src/sync/types.ts`, `syncEngine.ts` and `deviceSync.ts` (1D-T5, 1D-T7), `src/sync/syncEngine.test.ts` (1D-T4, 1D-T5), `src/api/client.ts` (1D-T5, 1D-T6).

**Calls made in this plan** (the builder's, not the owner's; listed so a reviewer can check them):
- **L1. The live socket is a `/v1` route through 1A's pipeline.** `handleVaultV1` runs every check it runs before any vault call (request id, route, gates, client version, token, and 1C-T10a's `accountGate`, whichever lands second), then hands the upgrade to `UserVault#fetch` on a fresh internal request whose only claim carrier is one header the Worker writes (`x-vault-claims`, every `VaultClaims` field). `fetch` refuses an erased vault and runs `call()`'s account and session checks before accepting. One socket per session (a newer one closes the older with 4409), at most 20 open per vault, close 4401 when the session ends. A socket may outlive its token: it carries no data and closes only when its session ends, its session opens another, or the phone closes it. Keepalive is `ping`/`pong` through `setWebSocketAutoResponse`, so it never wakes the vault. In the HTTP Worker, one `serveV1(request, env, ctx?)` holds `handleVaultV1`'s deps for `src/routes/v1/$.ts`, `src/vault-worker.ts` and the `src/server.ts` bypass that keeps TanStack Start away from the 101 response.
- **L2. Pokes follow the revision, not the command code.** The vault reads `sync_state.revision` before its transaction and again after it commits, pokes every other session when it grew, and closes ended sessions after every call whatever the outcome; retention purges poke too. On the phone, a poke or a successful (re)connect runs a `live` flush that lifts the failure pause like coming to the foreground (a reachable vault proves the network is back), never the server's 429 pacing; a queued follow-up runs with the strongest trigger asked for; Home and History refresh in place when the diary's applied revision moves.
- **L3. C16 covers record edits** (decided, Q14). A refused edit is kept in diary migration 3 (`pending_choices`, one row per record), never in the outbox, and a choice the server already holds clears itself. 1D owns the `rh-conflict` component, `ChoicePanel`; phase 2's P2-T27 restyles it instead of building its own (R24). The screens sit behind a new redesign area, `conflict`, until the owner approves them (E2).
- **L4. Consent is enforced in PostHog's `before_send`, not with `optOut()`,** so scrubbed crash reports can still be sent without consent behind a build switch (§7). The server's answer is the truth, read at every sign-in and every return to the foreground; only a "no" this phone has not delivered yet outranks it. A "no", given here or on another phone, stops replay and resets the identity at once; the identity is reset whenever the new state is not yes (every no, every never-asked answer, every account change), whatever this run believed before. Events tracked before the answer (sign-in and onboarding included) are held in memory only (at most 50), sent on yes and dropped on no, an account switch or restart. Every request carries `X-GoGoSpend-Analytics: off` unless this phone's answer is yes, which stops server events for that request.
- **L5. The analytics id comes from a new route,** `GET /v1/me/analytics`: `{ analytics_id, weeks_since_signup, consent }`, where `analytics_id` is the HMAC-SHA256 of `sub` under `ANALYTICS_ID_KEY` (or null while the key is unset) and `consent` is `yes`, `no` or `unasked` from the vault's consents row. `/v1/me` keeps its v1 shape (C2). A person who said no is not asked again on a new phone (decided, Q13).
- **L6. Server events come from the vault's change log.** `record_saved` only for `transactions.create` (imports never count, decided, Q16), `resync_required` for a 410 and `sync_failed` for a 500 `INTERNAL_ERROR` on the outbox's routes. Error counts are anonymous class names (random distinct id, `$process_person_profile: false`), only for a 500 `INTERNAL_ERROR` or an unexpected Worker exception, never for a deliberate refusal. Deletion sends `account_deleted` as an anonymous count that can never recreate the person (decided, Q11).
- **L7. The proxy is `/ingest/*` on the HTTP Worker.** It forwards to `eu.i.posthog.com` (`/static/` and `/array/` to `eu-assets.i.posthog.com`), strips cookies, auth and every client-IP and Cloudflare header (decided, Q12; PostHog's own guide forwards the IP for GeoIP), and bounds bodies at 5 MiB. The app sets `disableGeoip`.
- **L8. Development builds may reach `wrangler dev` on the LAN.** With `__DEV__`, the transport accepts `http://` (and the live channel `ws://`) to a private IPv4 address (10/8, 172.16/12, 192.168/16); release builds stay HTTPS-only. Packages: the newest stable release published at least 7 days before the install day, through the dependency gate (master plan line 136), pinned exactly.

## Owner decisions (25 October 2026)

The owner accepted every default below on 25 October 2026, so each is now the decided value. The tasks mark them "decided, Qn". Tasks 2 to 5, which are being built from the earlier text, still say "default pending owner Qn": read that as decided.

- **Q1. `expo-device`.** PostHog's Expo guide installs it; `posthog-react-native` 4.83.0 marks it an optional peer. Decided: not added (1D-T6).
- **Q2. `posthog-cli` and its EAS secrets**, for symbol and source-map upload at build time. Approved: spec §4 names the `posthog-cli` build tool (owner, 25 October 2026). 1D does not add it: P6C-T12 does, and crash reports arrive unsymbolicated until then (1D-T6).
- **Q3. A network-state package.** Decided: none; the live socket's reconnect loop notices the network coming back (1D-T5).
- **Q4. Counsel:** the PDPA notice naming PostHog EU, the consent wording, crash reports without consent, and sending events held before consent once the person says yes. Decided until counsel says otherwise: draft wording (1D-T8), crash reports on (1D-T6), held events sent on yes (1D-T1).
- **Q5. The PostHog EU project and its keys,** and `ANALYTICS_ID_KEY`, which must never rotate. Decided: unset until the project exists, so nothing is sent (1D-T3, 1D-T6, 1D-T11).
- **Q6. PostHog project settings** (listed under "Owner-side configuration").
- **Q7. The batch export to R2, and the dashboards with their alerts** (owner-side configuration).
- **Q8. Development builds on two phones (EAS), the Wi-Fi and the Mac's firewall, and any `app.json` cleartext change** (1D-T15).
- **Q9. E2 approval** of the consent and Privacy drafts (1D-T8) and the conflict drafts (1D-T9); 1C's sign-in screens are 1C's.
- **Q10. The Thai translation pass and the Vietnamese copy** (1D-T8, 1D-T9). Decided: Thai drafts; Vietnamese falls back to English.
- **Q11. `account_deleted`.** Decided: an anonymous server count from deletion (1D-T13).
- **Q12. GeoIP.** Decided: client IPs stripped (1D-T2).
- **Q13. Asking again on a new phone after a "no".** Decided: no (1D-T1, 1D-T11).
- **Q14. C16's scope.** Decided: record edits only (1D-T9).
- **Q15. Deletion when PostHog keeps failing.** Decided: steps 7 and 8 still run, and the PostHog deletion is retried once a day for 7 days after the final sweep (1D-T13).
- **Q16. Imports as `record_saved`.** Decided: not counted (1D-T11).
- **Q17. Native replay's tap recording.** Decided: off, as touch capture; replay is not started while the SDK cannot turn it off (1D-T6).
- **Q18. Pack keys in `category_key`.** Decided: accepted now, as §7 allows (1D-T1).

## Global Constraints

- **Owner approvals:** the spec approves `posthog-react-native`, `@posthog/react-native-plugin`, `posthog-node`, `@posthog/ai` and the `posthog-cli` build tool (§4). 1D installs the first three; `@posthog/ai` waits for phase 3 and `posthog-cli` for P6C (Q2). Any other package is an owner question (Q1, Q3). No lockfile regeneration with Linux bindings; `node --test scripts/ci/lockfile-bindings.test.mjs` passes after every install.
- **No cloud resources and no PostHog project yet (D33).** With `POSTHOG_PROJECT_TOKEN`, `ANALYTICS_ID_KEY` or `EXPO_PUBLIC_POSTHOG_KEY` unset, nothing is sent and nothing fails. Hosted, native and device checks are recorded **SKIPPED**, never as passes.
- **Process for every task** (handover §4): a behavioural RED with counts, GREEN, a mutation check, the gate, a receipt in `docs/implementation/premium-progress.md` under a new heading "## 1D: live pokes, the pending choice, PostHog and the proof", a local commit ending with the attribution trailer, and an independent read-only review. Do not push. Never run a bare `git stash`. No changes under `vendor/`. Reference code stays read-only: `apps/api`, `packages/contracts`, and `apps/edge/src/server/**` and `src/roles/**` except the entry files a task names.
- **The edge gate** is 1A's, as the integration branch defines it when the task merges: `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge`, plus `npm run test:edge:db` while it exists.
- **The app gate:** `npm run typecheck:app && npm run test:app && npm run test:unit && npm run test:render -w gogospend-app && npm run export:web -w gogospend-app -- --max-workers 2 && git diff --check`.
- **Never sent to PostHog (§2, §7), from any path (events, screen names, exceptions, device properties, replay, tap positions):** amounts, balances or budgets, not even in buckets; payee, merchant or wallet names; notes or custom category names; slip, receipt or photo content; email, phone or real name; AI prompts or answers. A category is sent only as a built-in key or a pack key, otherwise `custom`.
- **Consent (D34, §7):** one clear yes or no, not pre-ticked ("ช่วยพัฒนา Jotbun"), covering analytics, replay and surveys, changeable in Privacy at any time. Nothing analytic is sent before yes. Scrubbed crash reports are sent without consent behind a switch that makes them consent-only. Changing the answer stops sending at once, on this phone and at each other phone's next foreground. Deleting the account deletes the PostHog person.
- **Identity (§7):** anonymous until sign-in, then the analytics id: the lowercase hex HMAC-SHA256 of the user id under `ANALYTICS_ID_KEY`, both read as UTF-8. The key never rotates (a new key would give every person a new id, and deletion would miss the old persons). Never an email or phone; reset on every account change (sign-out included), on "no" and on a never-asked answer (1D-T1).
- **One API, one emitter per action (R23, R25):** every plan sends §7 events through 1D's typed emitters (`src/analytics/events.ts`) and allow-list. Each user action is tracked once, from the rule that performs it (the save, delete, restore or undo function), never from a screen's render or a tray.
- **Replay (D26):** only after yes; all text and images masked; touch capture off, including native replay's tap positions; sampled in the PostHog project settings.
- **Sockets never carry record data (§6.5).** The server sends only `{"revision":"<decimal>"}` and `pong`; the phone sends only `ping`. The fallbacks stay: sync on launch, on foreground, after writes, on pull-to-refresh and on the 60-second foreground timer.
- **C16:** only new records are queued offline; a refused edit is never sent by itself, and no outbox kind is added (`outbox.kind` stays `transaction.create`).
- **Exactness:** a revision is read as `CAST(revision AS TEXT)` and compared as `BigInt`, never as a JavaScript number.
- **Vault queries (R57):** Durable Object SQLite binds at most 100 parameters per query. An id list of unbounded size binds as one JSON parameter, `WHERE x IN (SELECT value FROM json_each(?))` with `JSON.stringify(ids)`, never one `?` per id (1D-T10's session check); a change-log read is a revision range (1D-T11).
- **Copy (§4, handover §3):** Thai first, English beside it, no emojis, the voice of §5.1. New strings live in a `*.draft.ts` module and stay out of `en.json` and `th.json` until the owner approves the screenshots (E2); new screens and rows stay behind their redesign area until then.
- **Logging:** `failureName(error)` only. Never `error.message`, a request body, a token, a key or an analytics id.

## Review Focus

1. **A phone wakes from the background with a dead socket, or changes networks.** The keepalive must notice within 35 seconds and reconnect with a fresh token, and every (re)connect must pull at once, so a change never waits for the 60-second timer (1D-T5, `no pong within 10 seconds closes and reconnects; the open runs a live flush` and `each reconnect reads the token again`).
2. **Analytics turned off on another phone, or while offline.** This phone must stop at its next foreground, and records synced after an offline "no" must send no server event (1D-T1 `a no given on another phone stops this phone at its next foreground`, 1D-T6 `requests carry X-GoGoSpend-Analytics: off unless this phone's answer is yes`, 1D-T11 `nothing is sent for a person who said no, or while their phone says off`).
3. **"Sign out everywhere" while sockets stay open.** Every socket must close with 4401 and the phone's next request must find the sign-out, keeping unsent records (D37) (1D-T10 for 1A's sign-out and `not_before`; 1D-T12 for 1C's three sign-out paths and deletion).
4. **Thai text, amounts and emails typed into notes and merchant names.** They must not reach PostHog through event properties, screen names built from route params, exception messages, raw stack strings or the device name (1D-T1 `neverSent.test.ts`, 1D-T6 `the client is built with replay masked…`, 1D-T11 `an unexpected failure sends its class name only, without the person`).
5. **A conflict choice left for days while the record changes again or is deleted.** It must compare against the current record, clear itself when the server already holds the change, and offer Restore or Discard when the record is gone (1D-T9 `a choice the server already holds clears itself`, `a deleted record offers Restore and Discard my change`).

---

## File structure

```
apps/edge/
  src/analytics/posthog-proxy.ts        /ingest/* to PostHog EU, headers stripped, bodies bounded (1D-T2)
  src/analytics/server-analytics.ts     analyticsIdFor, server events, anonymous counts, person deletion (1D-T3; by id, 1D-T13)
  src/vault/live.ts                     hibernating sockets: accept, poke, close ended sessions (1D-T10)
  src/vault/analytics.ts                consent, the create event from the change log, weeks since sign-up (1D-T11)
  src/v1/serve.ts                       serveV1: handleVaultV1 with its deps, for every /v1 entry (1D-T12)
  scripts/local-auth.mjs, live-proof.mjs  email-code sign-in on a local Worker; the live socket proved on the built Worker (1D-T12)
  test/posthog-proxy.test.ts, test/server-analytics.test.ts            (Node)
  test/workers/live.test.ts, test/workers/server-events.test.ts, test/workers/live-revocation.test.ts (workerd)
  Modified: src/vault/user-vault.ts, src/vault/routes.ts, src/v1/protocol.ts, src/v1/routes.ts, src/v1/handler.ts,
    src/v1/env.ts, src/cloudflare-workers.d.ts, src/server.ts, src/routes/v1/$.ts, src/vault-worker.ts,
    test/workers/support/v1-client.ts, test/vault-route-coverage.test.ts (route-coverage.test.ts after 1B-T13),
    package.json, package-lock.json, README.md; 1C's src/deletion/hooks.ts, workflow.ts and test/workers/deletion.test.ts
apps/app/
  src/analytics/catalog.ts              the event allow-list and property rules (1D-T1)
  src/analytics/events.ts               the typed emitters every plan calls (1D-T1)
  src/analytics/controller.ts           consent, identity, the held events, track and screen (1D-T1)
  src/analytics/gate.ts                 before_send: consent and the crash scrub (1D-T1)
  src/analytics/bus.ts                  (modified) the single entry point, routed to the controller
  src/analytics/testing/recordAnalytics.ts  test helper: a controller that records what it would send
  src/analytics/posthogOptions.ts       the PostHog client options, pure (1D-T6)
  src/analytics/analyticsServer.ts      the consent and identity calls over the v1 transport, pure (1D-T6)
  src/analytics/consentStorage.ts       this phone's answer, in the secure store (1D-T6)
  src/analytics/posthogClient.ts        the only importer of posthog-react-native (1D-T6)
  src/analytics/appAnalytics.ts         the app's controller with its real stores and calls (1D-T6)
  src/analytics/AnalyticsUpkeep.tsx     screens, session changes, foreground refresh (1D-T6)
  src/analytics/recordProps.ts          a record's kind and category key, pure (1D-T7)
  src/analytics/useAnalyticsConsent.ts  the answer for the consent screens (1D-T8)
  src/sync/liveChannel.ts               the live socket: connect, parse pokes, keepalive, backoff (1D-T5)
  src/sync/syncTelemetry.ts             sync outcomes as sync_failed and resync_required, once each (1D-T7)
  src/spend/v1/redesign/pendingChoice.ts  the pending choice model (1D-T4)
  src/screens/redesign/useRefreshOnRevision.ts  refresh a screen when the applied revision moves (1D-T5)
  src/screens/redesign/conflict/ChoicePanel.tsx, conflictCopy.draft.ts  (1D-T9)
  src/screens/redesign/account/AnalyticsConsentScreen.tsx, analyticsConsentCopy.draft.ts (1D-T8)
  src/dev/catalogue/conflictSections.tsx, src/dev/catalogue/account/analyticsSections.tsx
  Modified: src/storage/migrations.ts, types.ts, diaryRepository.ts; src/spend/v1/spendDiary.ts;
    src/sync/types.ts, retryPolicy.ts, scheduler.ts, deviceSync.ts, syncEngine.ts; src/api/client.ts, sharedV1.ts;
    src/config/env.ts, featureFlags.ts; app/_layout.tsx, app/spend/_layout.tsx; src/spend/spendTelemetry.ts,
    src/consent/systemPermissionTelemetry.ts; the redesign screens and hooks named per task; 1C's credentialProvider.ts
docs/implementation/premium-progress.md, docs/implementation/beta-receipts.md
```

---

### Task 1: The app's analytics core: the allow-list, the typed emitters, consent, the held events and the outgoing gate

**Starts after:** base

**Files:**
- Create: `apps/app/src/analytics/catalog.ts`, `events.ts`, `controller.ts`, `gate.ts`, `testing/recordAnalytics.ts`
- Modify: `apps/app/src/analytics/bus.ts`
- Test: `apps/app/src/analytics/catalog.test.ts`, `events.test.ts`, `controller.test.ts`, `gate.test.ts`, `neverSent.test.ts`

These are pure modules (relative `.ts` imports, no `react-native`, no `@mobile/` alias), so `npm run test:unit` runs them under Node's test runner, as `src/sync/*.test.ts` are. This task owns the §7 names, properties and consent for every plan (R23).

**Interfaces:**
- Consumes: `BUILTIN_CATEGORIES` from `@gogospend/contracts`.
- Produces:
  ```ts
  // catalog.ts
  export type PropRule =
    | { kind: 'enum'; values: readonly string[] }
    | { kind: 'bool' }
    | { kind: 'count'; max: number }   // an integer from 0 to max
    | { kind: 'code' }                 // /^[A-Z][A-Z0-9_]{0,63}$/, class names such as VERSION_CONFLICT
    | { kind: 'currency' }             // /^[A-Z]{3}$/
    | { kind: 'version' }              // /^\d{1,6}\.\d{1,6}\.\d{1,6}$/
    | { kind: 'screen' }               // isScreenPattern
  export const PACK_KEYS: readonly ['family_out', 'merit', 'delivery', 'motorbike_rail', 'topup', 'seven', 'lottery', 'pets', 'family_in']
  export type AppEventName = /* the 40 names in the table below */
  export const APP_EVENTS: Readonly<Record<AppEventName, Readonly<Record<string, PropRule>>>>
  export type CommonProps = { app_version: string; platform: 'ios' | 'android'; language: 'th' | 'en' | 'vi'; home_currency: string; ai_enabled: boolean; weeks_since_signup: number }
  export const COMMON_RULES: Readonly<Record<keyof CommonProps, PropRule>>
  export type CleanProps = Record<string, string | number | boolean>
  export function cleanEvent(name: string, properties?: Record<string, unknown>): { name: AppEventName; properties: CleanProps } | null
  export function cleanCommon(common: Partial<CommonProps>): CleanProps
  export function isScreenPattern(name: string): boolean   // /^\/$|^(\/([a-z][a-z-]*|\[[a-z]+\]))+$/, at most 64 characters
  export function screenPattern(segments: readonly string[]): string | null   // drops "(group)" segments, joins with "/"
  // events.ts: the API every plan calls (R23); each maps to §7's snake_case names and calls trackClientEvent, nothing else
  export type RecordKind = 'expense' | 'income' | 'transfer'
  export type RecordSource = 'typed' | 'tell_bun'
  export type SignInMethodName = 'apple' | 'google' | 'email' | 'passkey'
  export function trackRecordStarted(p: { kind?: RecordKind; source: RecordSource }): void
  export function trackRecordSaved(p: { kind: RecordKind; source: RecordSource; categoryKey: string | null; offline: boolean; secondsToSave: number }): void   // has_photo: false; seconds rounded, kept within 0..3600
  export function trackRecordEdited(p: { kind: RecordKind; categoryKey: string | null }): void
  export function trackRecordDeleted(p: { kind: RecordKind; categoryKey: string | null }): void
  export function trackRecordRestored(p: { kind: RecordKind }): void
  export function trackUndoUsed(p: { kind: RecordKind }): void
  export function trackOnboardingStepViewed(p: { step: string }): void
  export function trackBudgetSet(p: { set: boolean }): void                     // budget: 'set' or 'skipped'
  export function trackWalletAdded(p: { walletType?: string | null; material?: string; bunFace?: string }): void
  export function trackSetupCompleted(): void
  export function trackInsightsViewed(p: { tab: string }): void                  // period: 'month'
  export function trackRecapOpened(): void                                      // period: 'month'
  export function trackRecapShared(): void                                      // period: 'month'
  export function trackPrivateModeToggled(): void                               // no properties: §7 lists none for it
  export function trackReminderSet(p: { hour: number }): void
  export function trackConflictShown(p: { screen: string }): void                // reason_code: 'VERSION_CONFLICT'
  export function trackSyncFailed(p: { reasonCode: string }): void
  export function trackResyncRequired(): void                                   // reason_code: 'RESYNC_REQUIRED'
  export function trackPermissionDenied(p: { permission: 'camera' | 'photos' }): void   // reason_code: 'CAMERA_DENIED' or 'PHOTOS_DENIED'
  export function trackSignedIn(p: { method: SignInMethodName }): void
  export function trackSignedUp(p: { method: SignInMethodName }): void
  export function trackSignedOut(p: { method?: SignInMethodName }): void
  // controller.ts
  export type ConsentAnswer = 'yes' | 'no'
  export type ConsentStatus = 'signed_out' | 'loading' | 'unanswered' | 'yes' | 'no'
  export type ServerConsent = 'yes' | 'no' | 'unasked'
  export type ServerAnalyticsState = { consent: ServerConsent; analyticsId: string | null; weeksSinceSignup: number | null }
  export type StoredConsent = { accountId: string; answer: ConsentAnswer; pendingServer: boolean }
  export type PostHogLike = {
    capture(event: string, properties?: CleanProps): void
    screen(name: string, properties?: CleanProps): void
    identify(distinctId: string): void
    reset(): void
    startSessionRecording(resumeCurrent?: boolean): unknown
    stopSessionRecording(): unknown
  }
  export type AnalyticsDeps = {
    client: PostHogLike | null   // null: no PostHog project configured, nothing is ever sent
    replay: boolean              // false: replay is never started (1D-T6, decided, Q17)
    store: { read(): Promise<StoredConsent | null>; write(value: StoredConsent): Promise<void>; erase(): Promise<void> }
    server: { read(): Promise<ServerAnalyticsState>; setConsent(analytics: boolean): Promise<void> }
  }
  export interface Analytics {
    setAccount(accountId: string | null): Promise<void>   // the signed-in account, or null
    answer(answer: ConsentAnswer): Promise<void>         // 'yes' rejects when the server could not save it
    status(): ConsentStatus
    allowsAnalytics(): boolean                            // status() === 'yes'
    subscribe(listener: () => void): () => void
    setCommon(patch: Partial<CommonProps>): void
    track(name: string, properties?: Record<string, unknown>): void
    screen(segments: readonly string[]): void
    refresh(): Promise<void>                              // at every return to the foreground
  }
  export const HELD_LIMIT = 50
  export function createAnalytics(deps: AnalyticsDeps): Analytics
  // gate.ts
  export type OutgoingEvent = { event: string; properties?: Record<string, unknown> }
  export type GatePolicy = { analytics: boolean; crashReportsWithoutConsent: boolean }
  export function gateOutgoing<E extends OutgoingEvent>(event: E, policy: GatePolicy): E | null
  // bus.ts (trackClientEvent keeps its signature)
  export function setAnalytics(analytics: Analytics | null): void
  export function getAnalytics(): Analytics | null
  export function trackClientEvent(event: string, properties?: Record<string, unknown>): void
  export function setConsentedTelemetrySink(sink: ((event: string, properties: CleanProps) => void) | null): void   // kept as a tests-only seam: it receives every event after cleanEvent, whatever the consent, and never reaches PostHog
  // testing/recordAnalytics.ts (tests only)
  export type Recorded = { kind: 'capture' | 'screen' | 'identify' | 'reset'; name: string; properties: CleanProps }
  export function recordAnalytics(options?: { consent?: ServerConsent }): Promise<{ analytics: Analytics; sent: Recorded[]; restore(): void }>
  ```
  `recordAnalytics` builds a controller on a recording fake client, with `replay: true` and a server answering the given consent (default `'yes'`) and the analytics id `'a'.repeat(64)`, signs in account `00000000-0000-4000-8000-0000000000aa`, installs it with `setAnalytics` and then empties `sent`, so a test sees only what it causes; `restore()` puts back what was there.

The allow-list is the §7 table, every event of a group accepting the group's properties. It holds no rule that can carry free text, and no amount rule of any kind. Where phase 2 names the values, the enum uses phase 2's names (R23).

| Group and events | Properties and rules |
| --- | --- |
| Account: `signed_up`, `signed_in`, `signed_out`, `passkey_created`, `account_deleted` | `method`: enum `apple`, `google`, `email`, `passkey` |
| First open: `onboarding_step_viewed`, `budget_set`, `wallet_added`, `setup_completed` | `step`: enum `coffee`, `private`, `first_coffee`, `reminder`, `analytics_consent` (today's story and 1D's question), `language`, `wallet`, `budget`, `lock` (P2-T35's `SetupStep`); `wallet_type`: enum `cash`, `bank`, `credit_card`, `transit` (spec §5.2's four, P2-T11's `WalletKind`, its call W25; R81); `material`: enum `silk`, `paper`, `titanium`, `sky`, `peach`; `bun_face`: enum `smile`, `wink`, `calm`, `happy`, `wow` (P2-T11's `BunFaceName`); `budget`: enum `set`, `skipped` |
| Recording: `record_started`, `record_saved`, `record_edited`, `record_deleted`, `record_restored`, `undo_used` | `kind`: enum `expense`, `income`, `transfer`; `source`: enum `typed`, `photo`, `slip_import`, `tell_bun`, `statement`, `share_extension`, `siri`; `category_key`: enum of the `BUILTIN_CATEGORIES` keys, `PACK_KEYS` (decided, Q18) and `custom`; `has_photo`, `offline`: bool; `seconds_to_save`: count 3600 |
| Bun AI: `ai_consent_changed`, `tell_bun_sent`, `ai_draft_reviewed`, `ask_bun_asked`, `ask_bun_rated` | `outcome`: enum `kept`, `edited`, `dropped`; `fields_edited`: count 20; `model`: enum `claude-haiku-5-5`, `claude-opus-5-5`, `rules`; `escalated`: bool |
| Slip import: `albums_connected`, `slip_scan_finished`, `slip_review_confirmed`, `albums_disconnected` | `albums`: count 50; `found`, `duplicates`, `unreadable`, `confirmed`, `escalated`: count 100000 |
| Insight and habits: `insights_viewed`, `recap_opened`, `recap_shared`, `private_mode_toggled`, `reminder_set`, `widget_added` | `tab`: enum `spending`, `in_out`, `calendar`; `period`: enum `week`, `month`, `year`; `reminder_hour`: count 23; `widget_size`: enum `small`, `medium`, `large`, `lock_screen` |
| Travel and cashback: `home_currency_set`, `trip_started`, `rate_overridden`, `cash_exchanged`, `cashback_card_tapped` | `currency_code`: currency; `trip_length_days`: count 366; `eligible_records`: count 100000 |
| Reliability: `sync_failed`, `conflict_shown`, `permission_denied`, `ai_unavailable`, `resync_required` | `reason_code`: code; `screen`: screen; `retry_count`: count 1000; `network_type`: enum `wifi`, `cellular`, `none`, `unknown` |
| Common, added by the controller to every event | `app_version`: version; `platform`: enum `ios`, `android`; `language`: enum `th`, `en`, `vi`; `home_currency`: currency; `ai_enabled`: bool; `weeks_since_signup`: count 1040; and `origin: 'app'` |

The controller's rules, which the tests pin:
- `track` cleans the event (an unknown event is dropped; an unknown property or a value outside its rule is dropped), adds the common properties and `origin: 'app'`, then: `yes` captures at once; `signed_out`, `loading` and `unanswered` hold it in memory (at most `HELD_LIMIT`, the oldest dropped first); `no` drops it.
- **`reset()` runs whenever the new state is not yes:** on every applied no, on every entry into `unanswered`, and on every account change, whatever the in-memory status. PostHog's SDK keeps the distinct id of an earlier run, so after a restart the status is `loading` while the client may still carry the person's analytics id.
- `setAccount(id)` with the current id does nothing. Every other change (no account to an account, one account to another, or to `null`) first calls `client.reset()` and `stopSessionRecording()`. A change from no account to an account keeps the held events (they come from the onboarding and the sign-in that led here); any other change drops them. Then, for an account, it loads.
- Loading (at `setAccount` and at every `refresh()`): read the stored answer and `server.read()`.
  - A stored answer for this account with `pendingServer: true` (a "no" this phone has not delivered) wins: status `no`, and `setConsent(false)` is sent again; once it lands, `pendingServer` becomes false.
  - Otherwise the server's consent is the truth. `yes`: store it and enter yes. `no`: store it and apply no. `unasked`: erase the stored answer, call `client.reset()` and open the question (`unanswered`); the held events stay. The vault's consents row tells a "no" from "never asked", so a person who said no on another phone is not asked again (decided, Q13).
  - When the server cannot be reached, the stored answer for this account stands; with none, the status stays `loading` until the next `refresh()`.
- Entering yes: when the server state has an `analyticsId` and the client has not been identified with it since its last `reset()`, `identify(analyticsId)` with no person properties (PostHog links earlier anonymous events to the person at `identify`, posthog.com/docs/libraries/react-native); set `weeks_since_signup` when known; when `replay` is true, `startSessionRecording(false)`; then send the held events in order. A stored yes with the server unreachable enters yes without an identity; the next read that reaches the server identifies the person.
- Applying no (an answer here, or the server's at launch or later): `stopSessionRecording()` and `client.reset()` whatever the previous status, so crash reports sent later are never linked to the person; drop the held events.
- `answer('no')` applies no at once, stores `{ accountId, answer: 'no', pendingServer: true }`, then sends `setConsent(false)`. `answer('yes')` sends `setConsent(true)` first: on success it stores yes, reads the server state again and enters yes; on failure it rejects and changes nothing.
- `screen(segments)` sends `client.screen(pattern, common)` only in `yes`, and only when `screenPattern(segments)` is not null.
- `setAccount`, `answer` and `refresh` resolve only after their server calls have finished, so a test can await them.

The gate's rules (PostHog's `before_send`):
- `$exception` is rebuilt from an allow-list: `$exception_list` keeps, for each item, `type`, `value` set to that `type` (or `Error`), `mechanism`, and `stacktrace` with its `type` and frames reduced to `function`, `filename`, `lineno`, `colno`, `in_app` and `platform`. Every other property whose name starts with `$exception` or `$issue` is removed (for example `$exception_message`, `$exception_values`, `$exception_steps`, `$exception_stack_trace_raw`, `$issue_description`). Without analytics consent it also gets `$process_person_profile: false`, and it is dropped when `crashReportsWithoutConsent` is false.
- Without analytics consent every other event is dropped.
- With consent, the `APP_EVENTS` names, `$screen`, `$identify` and `$snapshot` pass; every other event (`$feature_flag_called`, `Application Opened`, `$autocapture`, `$pageview`, survey events) is dropped.
- From every event that passes, `$device_name`, `$set` and `$set_once` are removed from `properties`, and `$set` and `$set_once` from the event itself.

- [ ] **Step 1: Write the modules as typed stubs** (exports present, `cleanEvent` returning its input unchanged, `gateOutgoing` returning its input, the controller capturing everything), so the tests compile and fail on behaviour.

- [ ] **Step 2: Write the failing tests.**
  - `catalog.test.ts`:
    - `the allow-list holds exactly the 40 events of the spec's table`: `Object.keys(APP_EVENTS).sort()` equals the sorted names of the table.
    - `no rule can carry free text`: every rule in `APP_EVENTS` and `COMMON_RULES` has a kind among `enum`, `bool`, `count`, `code`, `currency`, `version` and `screen`; every enum value matches `/^[a-z0-9_.-]+$/`; and no property is named `amount_minor`, `balance_minor`, `budget_minor`, `amount`, `merchant`, `payee`, `note`, `label`, `wallet_name`, `category_name`, `email`, `phone`, `name`, `prompt`, `answer` or `slip_text`.
    - `cleanEvent drops unknown events, unknown properties and values outside their rule`:
      ```ts
      assert.deepEqual(cleanEvent('record_saved', { kind: 'expense', category_key: 'food', has_photo: false, seconds_to_save: 12, amount_minor: '4500', note: 'ข้าวมันไก่' }),
        { name: 'record_saved', properties: { kind: 'expense', category_key: 'food', has_photo: false, seconds_to_save: 12 } })
      assert.deepEqual(cleanEvent('record_saved', { kind: 'gift', seconds_to_save: 3601 })?.properties, {})
      assert.equal(cleanEvent('spend_tx_added', { source: 'manual' }), null)
      assert.deepEqual(cleanEvent('sync_failed', { reason_code: 'VERSION_CONFLICT', retry_count: 2.5, network_type: 'wifi' })?.properties, { reason_code: 'VERSION_CONFLICT', network_type: 'wifi' })
      assert.deepEqual(cleanEvent('sync_failed', { reason_code: 'version conflict' })?.properties, {})
      ```
    - `a category is a built-in key, a pack key or custom` (decided, Q18): `category_key` keeps `'food'`, `'merit'` and `'custom'`, and drops `'ค่าขนมแมว'` and `'Art'`. When P2-T7 has merged, the test also asserts `PACK_KEYS` equals `THAI_EVERYDAY_PACK.map((item) => item.key)`.
    - `phase 2's wallet types, materials and faces are accepted`: `wallet_added` keeps `{ wallet_type: 'transit', material: 'sky', bun_face: 'wow' }` and drops `wallet_type: 'boat'` and `wallet_type: 'ewallet'` (R81).
    - `screen names are route patterns, never values`: `screenPattern(['spend', 'record', '[id]'])` is `'/spend/record/[id]'`; `screenPattern([])` is `'/'`; `screenPattern(['(tabs)', 'settings'])` is `'/settings'`; `screenPattern(['spend', 'record', '0b3f2c1e-6a4d-4f6e-9a51-2f3c4d5e6f70'])`, `screenPattern(['spend', 'recap', '2026-10'])` and `screenPattern(['ค่าเช่า'])` are all `null`.
  - `events.test.ts`, through the `setConsentedTelemetrySink` seam: `the typed emitters send §7's names and nothing else`:
    - `trackRecordSaved({ kind: 'expense', source: 'typed', categoryKey: 'merit', offline: false, secondsToSave: 4000 })` sends `['record_saved', { kind: 'expense', source: 'typed', category_key: 'merit', has_photo: false, offline: false, seconds_to_save: 3600 }]`;
    - `trackBudgetSet({ set: false })` sends `['budget_set', { budget: 'skipped' }]`;
    - `trackConflictShown({ screen: '/spend/record/[id]' })` sends `['conflict_shown', { reason_code: 'VERSION_CONFLICT', screen: '/spend/record/[id]' }]`;
    - `trackWalletAdded({ walletType: 'transit', material: 'sky', bunFace: 'wow' })` sends `['wallet_added', { wallet_type: 'transit', material: 'sky', bun_face: 'wow' }]`;
    - `trackInsightsViewed({ tab: 'calendar' })` sends `['insights_viewed', { tab: 'calendar', period: 'month' }]`, and `trackPrivateModeToggled()` sends `['private_mode_toggled', {}]`;
    - `trackPermissionDenied({ permission: 'camera' })` sends `['permission_denied', { reason_code: 'CAMERA_DENIED' }]`.
  - `controller.test.ts`, on a recording fake client, an in-memory store and a scripted server:
    - `signed out, events are held and never sent`
    - `events tracked before sign-in are held across the sign-in and sent after a yes`: three tracks while signed out, `setAccount(A)` with the server answering `unasked`, then `answer('yes')`: all three are captured in order.
    - `held events are dropped when another account signs in, and on no`
    - `the server's yes sends at once, identifies with the analytics id and starts replay`: one `identify('a'.repeat(64))`, one `startSessionRecording(false)`, and, after `setCommon({ app_version: '1.2.3', platform: 'ios', language: 'th', home_currency: 'THB' })` with the server answering `{ consent: 'yes', analyticsId: 'a'.repeat(64), weeksSinceSignup: 3 }`, `track('record_saved', { kind: 'expense' })` captures `('record_saved', { kind: 'expense', origin: 'app', app_version: '1.2.3', platform: 'ios', language: 'th', home_currency: 'THB', weeks_since_signup: 3 })`.
    - `replay never starts when it is not allowed`: with `replay: false`, a yes never calls `startSessionRecording`.
    - `never asked: the question is open, events wait in memory, and the identity is reset`
    - `a no read at launch after an earlier yes resets the identity`: a store holding `{ accountId: A, answer: 'yes', pendingServer: false }` from an earlier run and a new controller (status `loading`); `setAccount(A)` with the server answering `no`: the status is `no`, `reset()` was called twice (at the account change and when the no was applied), the store holds `no`, and a later track captures nothing.
    - `a no given on another phone stops this phone at its next foreground`: status `yes`; the server now answers `no`; after `refresh()` the status is `no`, `stopSessionRecording()` and `reset()` were each called once more than before it, the store holds `no`, and a later track captures nothing.
    - `a pending no is kept until the server has it`: a stored `{ answer: 'no', pendingServer: true }` and a server still answering `yes`: the status is `no`, `setConsent(false)` is sent again at each `refresh()` while it fails, and once it succeeds the store holds `pendingServer: false`.
    - `saying no stops replay and resets the identity`
    - `a no from another phone is not asked again on this one`: the server answers `no` and nothing is stored: the status is `no`, never `unanswered`.
    - `a yes the server could not save rejects and changes nothing`
    - `offline with nothing known waits, then asks`
    - `the held events stop at 50, oldest first out`: 60 tracks, then yes: 50 captures, the first being the 11th tracked.
    - `screens are sent only as patterns and only after yes`
    - `without an analytics id the person stays anonymous, and a later refresh identifies them`
  - `gate.test.ts`:
    - `before yes, only scrubbed exceptions leave, without a person profile`: an `$exception` whose item value is `'Cannot read ฿1,234 from note สมชาย'`, with a frame carrying `context_line` and `vars`, and with `$exception_message`, `$exception_steps`, `$exception_stack_trace_raw` and `$device_name: "Kan's iPhone"`, comes back with `value: 'TypeError'`, frames holding only the six kept keys, `mechanism` unchanged, none of the removed keys, and `$process_person_profile: false`; `record_saved`, `$screen`, `$snapshot` and `$identify` come back `null`.
    - `with the switch off, exceptions also wait for yes`
    - `after yes, allow-listed events, screens, identify and replay pass; anything else is dropped`
    - `the device name, $set and $set_once never leave`
  - `neverSent.test.ts`, the whole path a value would take: a controller in `yes` tracks every `APP_EVENTS` name with each of its rule keys set to a sentinel string, plus `amount_minor: '123456'`, `balance_minor: '987654'`, `budget_minor: '18000'`, `merchant: 'ร้านป้าแดง'`, `payee: 'สมชาย ใจดี'`, `wallet_name: 'บัญชีออมทรัพย์กสิกร'`, `note: 'ค่าเช่าเดือนตุลา'`, `label: 'ค่าขนมแมว'`, `email: 'kan@example.com'`, `phone: '0812345678'`, `name: 'กานต์'`, `prompt: 'เดือนนี้ใช้ไปเท่าไหร่'`, `answer: 'คุณใช้ไป ฿4,500'` and `slip_text: 'PromptPay 0812345678'`. It also sends screens built from concrete ids, and an `$exception` whose message, `$exception_stack_trace_raw` and one frame's `context_line` hold every sentinel. Each outgoing event goes through `gateOutgoing` as `before_send` would. Assert that the JSON of everything that leaves contains none of: `123456`, `987654`, `18000`, `ร้านป้าแดง`, `สมชาย`, `บัญชีออมทรัพย์`, `ค่าเช่า`, `ค่าขนมแมว`, `kan@example.com`, `0812345678`, `กานต์`, `เดือนนี้`, `4,500`, `PromptPay`, `0b3f2c1e`.

- [ ] **Step 3: Run them and see them fail.**
  Run: `npm run test:unit -w gogospend-app -- src/analytics/catalog.test.ts src/analytics/events.test.ts src/analytics/controller.test.ts src/analytics/gate.test.ts src/analytics/neverSent.test.ts`
  Expected: failures on assertions in all five files. Record the counts.

- [ ] **Step 4: Implement** the catalogue as data (the table above), the emitters, the controller and the gate as their rules say, and route `trackClientEvent` through `cleanEvent` to the test seam and to `getAnalytics()?.track(...)`.

- [ ] **Step 5: Run them and see them pass.** Then run `npm run test:unit -w gogospend-app` whole.

- [ ] **Step 6: Mutation check.**
  - Let unknown properties through `cleanEvent`: `cleanEvent drops…` and `neverSent` fail.
  - Apply the server's yes over a pending no: `a pending no is kept…` fails.
  - Skip `reset()` when a "no" arrives: `a no given on another phone…` and `saying no…` fail.
  - Reset on a no only when the in-memory status was yes: `a no read at launch after an earlier yes…` fails.
  - Keep a frame's `context_line`: the gate test and `neverSent` fail.
  - Let `$feature_flag_called` through after yes: `after yes, allow-listed…` fails.

- [ ] **Step 7: Gate, receipt, commit.** Run the app gate. Commit: `Own the app's analytics: one allow-list and typed emitters, consent from the server, events held until yes, and a scrubbing before_send`.

---

### Task 2: The PostHog proxy on the Worker

**Starts after:** base

**Files:**
- Create: `apps/edge/src/analytics/posthog-proxy.ts`
- Modify: `apps/edge/src/server.ts` (dispatch `/ingest/` before TanStack Start)
- Test: `apps/edge/test/posthog-proxy.test.ts` (Node)

**Interfaces:**
- Produces:
  ```ts
  export const POSTHOG_PROXY_PREFIX = '/ingest'
  export const POSTHOG_API_HOST = 'eu.i.posthog.com'
  export const POSTHOG_ASSET_HOST = 'eu-assets.i.posthog.com'
  export const POSTHOG_PROXY_BODY_LIMIT_BYTES = 5 * 1024 * 1024
  export function isPostHogProxyPath(pathname: string): boolean   // '/ingest/' followed by at least one character
  export function proxyPostHog(request: Request, fetchImpl?: typeof fetch): Promise<Response>
  ```
- The pattern is PostHog's Cloudflare proxy guide (posthog.com/docs/advanced/proxy/cloudflare): `/static/` and `/array/` go to the asset host, everything else to the API host, and `cookie` and `authorization` are deleted. Unlike the guide, the client IP is not forwarded (L7, default pending owner Q12).

- [ ] **Step 1: Write the failing tests** in `test/posthog-proxy.test.ts`, with a recording fake `fetch`:
  - `a batch is forwarded to PostHog EU with the same bytes, without cookies, auth, client addresses or app headers`: `POST /ingest/batch/` with body `{"api_key":"phc_test","batch":[]}`, `content-type: application/json`, `cookie: a=1`, `authorization: Bearer x`, `x-forwarded-for: 1.2.3.4`, `cf-connecting-ip: 1.2.3.4`, `cf-ipcountry: TH`, `x-real-ip: 1.2.3.4` and `x-gogospend-client: ios/1.0.0`. The upstream request is `POST https://eu.i.posthog.com/batch/` with the same body bytes and content type and none of the other headers. The upstream status and body pass through, and its `set-cookie` header is removed.
  - `assets and remote config go to the asset host, with the query kept`: `GET /ingest/static/recorder.js?v=1` goes to `https://eu-assets.i.posthog.com/static/recorder.js?v=1`, and `GET /ingest/array/phc_test/config` to `https://eu-assets.i.posthog.com/array/phc_test/config`.
  - `the target host never comes from the request`: a `host: evil.example` header still reaches `eu.i.posthog.com`.
  - `a body over 5 MiB is 413 before anything is sent`: once by `content-length`, once streamed without one; the fake `fetch` is never called.
  - `only GET, HEAD and POST under /ingest/ are proxied`: `DELETE /ingest/batch/` is 405; `isPostHogProxyPath('/ingest')`, `('/ingestx/batch')` and `('/v1/ingest/x')` are false.
  - `an unreachable PostHog is 502 with no body`.
- [ ] **Step 2: Run it and see it fail.** Run `npm run test:edge -- test/posthog-proxy.test.ts` against a stub that answers 404. Record the counts.
- [ ] **Step 3: Implement `proxyPostHog`.** Build the upstream headers from the request's, minus `cookie`, `authorization`, `host`, `content-length`, `connection`, `forwarded`, `x-real-ip`, `true-client-ip`, every `x-forwarded-*`, every `cf-*` and every `x-gogospend-*`. Read a POST body with a byte counter that stops past the limit (the edge's `readBounded` in `src/server/http/request.ts` is module-private reference code, so write a short local one). Fetch with `redirect: 'manual'`. Copy the response without `set-cookie`. On a fetch error, log `posthog_proxy_failed` with `failureName` and answer 502.
- [ ] **Step 4: Dispatch it in `src/server.ts`.** The default export's `fetch` calls `proxyPostHog(request)` when `isPostHogProxyPath(new URL(request.url).pathname)`, and `handler.fetch` with the same arguments otherwise. Run `npm run build:edge`.
- [ ] **Step 5: Run it and see it pass.**
- [ ] **Step 6: Mutation check.** Forward `x-forwarded-for`: the first test fails. Take the host from the request: the host test fails. Drop the body limit: the 413 test fails.
- [ ] **Step 7: Gate, receipt, commit.** Commit: `Proxy PostHog EU at /ingest without cookies, auth or client addresses`.

---

### Task 3: Server analytics as a module: the analytics id, server events, anonymous counts and person deletion

**Starts after:** base

**Files:**
- Create: `apps/edge/src/analytics/server-analytics.ts`
- Modify: `apps/edge/package.json` and `apps/edge/package-lock.json` (`posthog-node`, exact)
- Test: `apps/edge/test/server-analytics.test.ts` (Node)

**Interfaces:**
- Produces:
  ```ts
  export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com'
  export const POSTHOG_EU_APP_HOST = 'https://eu.posthog.com'   // the private API, for person deletion
  export type ServerAnalyticsEnv = { POSTHOG_PROJECT_TOKEN?: string; ANALYTICS_ID_KEY?: string; POSTHOG_PERSONAL_API_KEY?: string; POSTHOG_PROJECT_ID?: string }
  export function analyticsIdFor(userId: string, key: string): Promise<string>   // lowercase hex HMAC-SHA256; key and id read as UTF-8 (TextEncoder)
  export type ServerEventName = 'record_saved' | 'sync_failed' | 'resync_required'
  export type ServerEvent = { name: ServerEventName; properties: Record<string, string | number | boolean> }
  export type CaptureMessage = { distinctId: string; event: string; properties: Record<string, unknown> }
  export type PostHogPort = { captureImmediate(message: CaptureMessage): Promise<unknown> }
  export type ServerAnalytics = {
    capture(analyticsId: string, event: ServerEvent): void        // the caller has checked consent
    captureFailure(failureName: string, routeId: string): void    // anonymous: needs no consent
    captureAnonymous(event: 'account_deleted'): void              // anonymous count (default pending owner Q11)
  }
  export function createServerAnalytics(env: ServerAnalyticsEnv, waitUntil: (promise: Promise<unknown>) => void, port?: (token: string) => PostHogPort): ServerAnalytics | null
  export type PersonDeletion = 'queued' | 'nothing_to_delete'
  export class AnalyticsDeletionFailed extends Error {}
  export function deletePostHogPerson(env: ServerAnalyticsEnv, userId: string, fetchImpl?: typeof fetch): Promise<PersonDeletion>
  ```
- Rules:
  - `ANALYTICS_ID_KEY` never rotates: a new key gives every person a new analytics id, and deletion would then miss the persons made under the old one. The README says so beside the secret.
  - `createServerAnalytics` returns `null` when `POSTHOG_PROJECT_TOKEN` is unset. The default port is `new PostHog(token, { host: POSTHOG_EU_HOST, flushAt: 1, flushInterval: 0, requestTimeout: 5000, fetchRetryCount: 1, disableGeoip: true, privacyMode: true })`, and every capture is `waitUntil(port.captureImmediate(message))`. PostHog's Workers guide (posthog.com/docs/libraries/cloudflare-workers) uses `flushAt: 1`, `flushInterval: 0` and `ctx.waitUntil(posthog.captureImmediate(...))`. `privacyMode: true` is the TypeScript SDK switch that `@posthog/ai` reads (posthog.com/docs/ai-observability/privacy-mode); it is set now so phase 3 cannot build this client without it.
  - `capture` drops unknown names and properties: `record_saved` takes `kind` (`expense`, `income`, `transfer`) and `category_key` (a `BUILTIN_CATEGORIES` key or `custom`; the vault knows no pack keys until phase 5); `sync_failed` and `resync_required` take `reason_code` (`/^[A-Z][A-Z0-9_]{0,63}$/`). It adds `origin: 'server'`.
  - `captureFailure` sends event `$exception` with a fresh `crypto.randomUUID()` as its distinct id and exactly these properties: `$exception_list` (one item `{ type, value: type, mechanism: { handled: true, synthetic: true } }`), `$exception_fingerprint` (the type and the route joined by a colon, for example `RangeError:wallets.list`), `route`, `origin: 'server'` and `$process_person_profile: false`. `type` is the failure name when it matches `/^[A-Za-z][A-Za-z0-9_]{0,63}$/`, else `Error`; `route` is the route id when it matches `/^[a-z][a-z_.]{0,63}$/`, else `worker`. The `$exception` schema is PostHog's (posthog.com/docs/error-tracking/installation/manual); anonymous events use `$process_person_profile: false` with a random id (posthog.com/docs/data/anonymous-vs-identified-events).
  - `captureAnonymous('account_deleted')` sends that event with a fresh random distinct id and exactly `{ origin: 'server', $process_person_profile: false }`, so it can never recreate or join the deleted person.
  - `deletePostHogPerson`: with no `ANALYTICS_ID_KEY`, no analytics id could ever have been sent (`/v1/me/analytics` answers a null id and the app stays anonymous), so it answers `nothing_to_delete` without a request. With the key but without `POSTHOG_PERSONAL_API_KEY` or `POSTHOG_PROJECT_ID`, it throws `AnalyticsDeletionFailed` (a misconfiguration, logged and retried). Otherwise it sends `POST ${POSTHOG_EU_APP_HOST}/api/projects/${projectId}/persons/bulk_delete` with `Authorization: Bearer <personal key>`, `Content-Type: application/json` and `{ "distinct_ids": [<analytics id>], "delete_events": true, "delete_recordings": true }`. A 202 whose `deletion_errors` is empty answers `queued`; anything else throws `AnalyticsDeletionFailed`. The endpoint and its 202 contract are PostHog's persons API (posthog.com/docs/api/persons, posthog.com/docs/privacy/data-storage). The personal key and the analytics id are never logged.

- [ ] **Step 1: Install the package.** On the install day, pick the newest stable `posthog-node` published at least 7 days earlier (L8; on 25 October 2026 the newest release was 5.57.1, published 23 October). Run the dependency gate (master plan line 136: transitive changes, install scripts, provenance, licence and advisories, with `npm audit --omit=dev --json`).
  ```bash
  npm view posthog-node@<version> dependencies engines
  npm install --prefix apps/edge --save-exact posthog-node@<version>
  npm ls --prefix apps/edge wrangler        # still one wrangler, 4.152.0
  ```
  Record the version and the size of the lockfile change in the receipt.
- [ ] **Step 2: Write the failing tests** in `test/server-analytics.test.ts`:
  - `the analytics id is the HMAC of the user id under the key, never the id`: for three user ids (one with Thai characters) and two keys, `analyticsIdFor` equals `createHmac('sha256', key).update(userId, 'utf8').digest('hex')` from `node:crypto`, matches `/^[0-9a-f]{64}$/`, differs between keys and never contains the user id.
  - `a server event carries only its allow-listed properties and origin`, on a fake port: `capture('a'.repeat(64), { name: 'record_saved', properties: { kind: 'expense', category_key: 'food', amount_minor: '4500', merchant: 'ร้านป้าแดง' } })` sends one message `{ distinctId: 'a'.repeat(64), event: 'record_saved', properties: { kind: 'expense', category_key: 'food', origin: 'server' } }`, and `waitUntil` received its promise.
  - `an unknown server event is dropped`
  - `a failure is an anonymous class-name count`: `captureFailure('RangeError', 'wallets.list')` sends exactly the properties listed above; two calls use two different UUID distinct ids; `captureFailure('ร้าน ฿1,234', 'x y')` sends type `Error` and route `worker`.
  - `a deletion count can never recreate the person`: `captureAnonymous('account_deleted')` sends exactly `{ origin: 'server', $process_person_profile: false }` under a UUID that is not any analytics id passed to `capture`.
  - `without a project token there is no client`
  - `the real client sends to PostHog EU`: with `globalThis.fetch` replaced (`vi.stubGlobal`) by a recorder answering 200 `{"status":1}`, a capture through the default port makes one request whose URL starts with `https://eu.i.posthog.com/` (the body is not inspected; the SDK may compress it). Before writing it, confirm in the installed package's built source (`apps/edge/node_modules/posthog-node`) that it sends with the global `fetch`; if it does not, test the host through the port factory's options instead and say so in the receipt.
  - `person deletion asks PostHog to delete the person, its events and its recordings`: the fake fetch sees `https://eu.posthog.com/api/projects/12345/persons/bulk_delete`, method `POST`, `authorization: Bearer phx_test` and the JSON body above with the HMAC id. A 202 with `deletion_errors: []` answers `queued`; a 202 with one error, a 500 and a network error each throw `AnalyticsDeletionFailed`; without `ANALYTICS_ID_KEY` it answers `nothing_to_delete` with no request; with the key but no personal key it throws.
- [ ] **Step 3: Run them and see them fail** against stubs. Run: `npm run test:edge -- test/server-analytics.test.ts`. Record the counts.
- [ ] **Step 4: Implement** the module as the rules say. `analyticsIdFor` imports `new TextEncoder().encode(key)` with `crypto.subtle.importKey('raw', …, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])` and signs `new TextEncoder().encode(userId)` with `crypto.subtle.sign('HMAC', …)`.
- [ ] **Step 5: Run them and see them pass.** Run `npm run build:edge` to prove `posthog-node` bundles for workerd.
- [ ] **Step 6: Mutation check.** Pass properties through unfiltered: the event test fails. Reuse one distinct id for failures: the failure test fails. Accept a 202 with deletion errors: the deletion test fails. Decide "nothing to delete" on the project token instead of the key: the deletion test fails.
- [ ] **Step 7: Gate, receipt, commit.** Commit: `Add server analytics: the HMAC analytics id, allow-listed server events, anonymous counts and PostHog person deletion`.

---

### Task 4: Pending choices kept in the diary (C16, storage and model)

**Starts after:** base

**Files:**
- Modify: `apps/app/src/storage/migrations.ts` (migration 3), `apps/app/src/storage/types.ts`, `apps/app/src/storage/diaryRepository.ts`
- Create: `apps/app/src/spend/v1/redesign/pendingChoice.ts`
- Modify: `apps/app/src/spend/v1/spendDiary.ts`
- Test: `apps/app/src/storage/diaryRepository.test.ts`, `apps/app/src/spend/v1/redesign/pendingChoice.test.ts`, `apps/app/src/spend/v1/spendDiary.test.ts`, `apps/app/src/sync/syncEngine.test.ts`

**Interfaces:**
- Consumes: `TransactionDto`, `UpdateTransactionRequest` and `isTransactionSnapshot` from `@gogospend/contracts`; `EditDraft`, `editDraftFrom` and `rebaseEdit` from `recordModel.ts`.
- Produces:
  ```ts
  // storage/types.ts
  export type PendingChoice = {
    recordId: string
    original: TransactionDto            // the record as the person opened it to edit (the edit's base)
    changes: UpdateTransactionRequest   // only the fields the person changed, as buildEditChanges made them
    server: TransactionDto              // the record the VERSION_CONFLICT answer carried, or a fresher read
    editedAt: string                    // ISO 8601, when the person pressed Save
    refusedAt: string                   // ISO 8601
  }
  // DiaryStore (storage/diaryRepository.ts), each a write under the store's epoch guard
  keepChoice(choice: PendingChoice): Promise<void>   // one per record: a second choice for the record replaces the first
  readChoices(): Promise<PendingChoice[]>            // oldest refusal first; a row that fails validation is left out
  dropChoice(recordId: string): Promise<void>        // a missing row is not an error
  // spend/v1/redesign/pendingChoice.ts
  export function draftFromChoice(choice: PendingChoice): EditDraft
  export function choiceAgainst(choice: PendingChoice, fresh: TransactionDto | null): TransactionDto
  export function choiceSettled(choice: PendingChoice, current: TransactionDto): boolean
  export function resendForChoice(choice: PendingChoice, current: TransactionDto): { id: string; version: number; changes: UpdateTransactionRequest }
  // spend/v1/spendDiary.ts
  DiaryView.pendingChoices: PendingChoice[]
  SpendDiary.keepChoice(choice: PendingChoice): Promise<void>   // rejects when no diary is open
  SpendDiary.dropChoice(recordId: string): Promise<void>
  ```
- Migration 3, appended (never edit 1 or 2):
  ```sql
  CREATE TABLE pending_choices (
    record_id TEXT PRIMARY KEY,
    original TEXT NOT NULL,
    changes TEXT NOT NULL,
    server TEXT NOT NULL,
    edited_at TEXT NOT NULL,
    refused_at TEXT NOT NULL
  ) STRICT
  ```
- `keepChoice` refuses (TypeError) a `recordId` that is not a UUID, an `original` or `server` that fails `isTransactionSnapshot` or names another id, and `changes` that is empty or holds a key outside `UpdateTransactionRequest`. Like the drafts, a choice lives only in the encrypted diary, goes with it at the sign-out erase, and stays (locked) when the phone is signed out elsewhere (D37).
- The model: `draftFromChoice` is `editDraftFrom(original)` with `changes` applied to its fields; `choiceAgainst` prefers the fresh record; `choiceSettled` is true when every changed field already equals the current record's value; `resendForChoice` keeps `changes` (measured against `original`) on `current.version`, as `rebaseEdit` does, and throws for another record.

- [ ] **Step 1: Write the failing tests.**
  - `diaryRepository.test.ts`:
    - `a pending choice is kept, replaced per record and dropped`: `keepChoice(a)` then `readChoices()` deep-equals `[a]`; a second `keepChoice` for the same record with a newer `server` leaves one row holding the newer one; `dropChoice(a.recordId)` leaves `[]`; dropping again does not throw.
    - `a choice for a mismatched record is refused`: `server.id` differing from `recordId` rejects with a TypeError, and so does `changes: {}`.
    - `a choice written after the session moved is refused` (StaleEpochError, as other writes).
    - `choices survive a lock and reopen, and go with the erase`.
    - `migration 3 adds the table and keeps a version 2 diary's drafts`: open a diary with `DIARY_MIGRATIONS.slice(0, 2)`, save one draft, reopen with all migrations: `PRAGMA user_version` is 3 and the draft and its command are still there.
  - `pendingChoice.test.ts`:
    - `the draft shows the person's change over the record they opened` (amount and note changed; the other fields as `original`)
    - `use yours resends the same changes on the server's current version`: `resendForChoice(choice, { ...server, version: 7 })` deep-equals `{ id: choice.recordId, version: 7, changes: choice.changes }`; another record's id throws.
    - `a fresh server record wins over the stored one`
    - `a choice the server already holds is settled`: true when the current amount and note equal the changed ones; false when any changed field differs.
  - `spendDiary.test.ts`: `a kept choice appears in the view and leaves when dropped`.
  - `syncEngine.test.ts`: `a pending choice is never sent by the sync engine`: keep a choice, save one draft, flush; the fake server received exactly one create and no update, and `readChoices()` still holds the choice.
- [ ] **Step 2: Run them and see them fail** against stub methods that resolve without writing. Run: `npm run test:unit -w gogospend-app -- src/storage/diaryRepository.test.ts src/spend/v1/redesign/pendingChoice.test.ts src/spend/v1/spendDiary.test.ts src/sync/syncEngine.test.ts`. Record the counts.
- [ ] **Step 3: Implement** migration 3, the three store methods (through the store's `write` helper, JSON in and out, `isTransactionSnapshot` on read), the model, and the diary view: `refresh` reads `readChoices()` beside the outbox, and the view starts with `pendingChoices: []`.
- [ ] **Step 4: Run them and see them pass.** Then run `npm run test:unit -w gogospend-app` whole (the migration count tests read `DIARY_MIGRATIONS`).
- [ ] **Step 5: Mutation check.** Insert without `ON CONFLICT`, so a second choice for a record fails or doubles: the replace test fails. Skip the id check: the mismatch test fails. Let `resendForChoice` keep `original.version`: the resend test fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `Keep an edit refused with VERSION_CONFLICT in the encrypted diary as a pending choice`.

---

### Task 5: The app's live channel, the live flush, screens that follow the revision, and LAN development

**Starts after:** base

**Files:**
- Create: `apps/app/src/sync/liveChannel.ts`, `apps/app/src/screens/redesign/useRefreshOnRevision.ts`
- Modify: `apps/app/src/sync/types.ts` (`FlushTrigger` gains `'live'`), `src/sync/retryPolicy.ts`, `src/sync/scheduler.ts`, `src/sync/syncEngine.ts` (the follow-up's trigger), `src/sync/deviceSync.ts`, `src/storage/diaryRepository.ts` (`appliedRevision()`), `src/api/client.ts` (`allowLanHttp`), `src/api/sharedV1.ts`, `src/spend/v1/spendDiary.ts` (`DiaryView.appliedRevision`), `src/screens/redesign/HomeScreen.tsx`, `src/screens/redesign/HistoryScreen.tsx`
- Test: `apps/app/src/sync/liveChannel.test.ts`, `src/sync/syncEngine.test.ts`, `src/storage/diaryRepository.test.ts`, `src/api/client.test.ts`, `src/screens/redesign/HistoryScreen.render.test.tsx`, `src/screens/redesign/HomeScreen.render.test.tsx`

**Interfaces:**
- Consumes: `V1ClientVersion` and `createV1Transport` (`src/api/client.ts`).
- Produces:
  ```ts
  // sync/liveChannel.ts (pure)
  export type LiveSocket = {
    send(data: string): void
    close(code?: number, reason?: string): void
    onopen: (() => void) | null
    onmessage: ((event: { data: unknown }) => void) | null
    onclose: ((event: { code: number }) => void) | null
    onerror: (() => void) | null
  }
  export type LiveTarget = { baseUrl: string; client: V1ClientVersion | null; token: () => Promise<string | null> }
  export type LiveChannelDeps = {
    target: LiveTarget
    connect: (url: string, headers: Record<string, string>) => LiveSocket
    appliedRevision: () => Promise<string>
    onLive: () => void              // a poke or a (re)connect: run a 'live' flush
    setTimer: (fn: () => void, ms: number) => unknown
    clearTimer: (handle: unknown) => void
    random: () => number
  }
  export interface LiveChannel { start(): void; stop(): void }
  export const LIVE_PING_MS = 25_000
  export const LIVE_PONG_WAIT_MS = 10_000
  export const LIVE_BACKOFF_CAP_MS = 15_000
  export const LIVE_CLOSE = { sessionEnded: 4401, replaced: 4409 } as const
  export function liveUrl(baseUrl: string): string        // http to ws, https to wss, then /v1/sync/live
  export function parsePoke(data: unknown): string | null  // the revision of exactly {"revision":"<decimal>"}, at most 64 characters
  export function createLiveChannel(deps: LiveChannelDeps): LiveChannel
  // sync/scheduler.ts
  SchedulerDeps.channel?: { start(): void; stop(): void }
  SyncScheduler.live(): Promise<void>
  // storage/diaryRepository.ts
  DiaryStore.appliedRevision(): Promise<string>           // one diary_meta read; '0' before any change
  // api/client.ts
  createV1Transport options gain allowLanHttp?: boolean    // true: http:// to a private IPv4 literal is accepted, as loopback is
  // api/sharedV1.ts
  export function getSharedLiveTarget(): LiveTarget       // the transport's base URL, client version and credentials
  // spend/v1/spendDiary.ts
  DiaryView.appliedRevision: string                       // '0' when no diary is open
  // screens/redesign/useRefreshOnRevision.ts
  export function useRefreshOnRevision(revision: string, refresh: () => void): void   // refresh when it grows; never on the first value
  ```
- The channel's rules:
  - `start()` and every reconnect read `target.token()` afresh; with no client version (the web) or no token the channel does nothing until the next `start()`. Otherwise it connects to `liveUrl(target.baseUrl)` with headers `Authorization: Bearer <token>` and `X-GoGoSpend-Client: <platform>/<version>`.
  - Every handler acts only for the current socket: an event from a socket the channel has already replaced or closed is ignored (a late 4409 from the vault closing an old socket must not stop the new one).
  - On open: reset the backoff, call `onLive()` once (catch up), and send `ping` every `LIVE_PING_MS`. With no `pong` within `LIVE_PONG_WAIT_MS` of a ping, close and reconnect.
  - A message that `parsePoke` reads as a revision greater than `appliedRevision()` (compared as `BigInt`) calls `onLive()`. Anything else is ignored and the socket stays open.
  - Close 4401: no reconnect until the next `start()`, and one `onLive()` so a flush meets the ended session. Close 4409 on the current socket: no reconnect. Any other close or error: reconnect after `min(cap, 1000 × 2^(n−1))` milliseconds, kept between half and all of it by `random()`. No network-state package is used; the reconnect loop notices the network coming back (default pending owner Q3).
  - `stop()` closes with 1000, clears every timer and ignores late events. The channel only ever sends `ping`.
- `retryPolicy.gate` treats `'live'` as it treats `'foreground'`: it lifts the failure pause and the backoff, never the 429 pacing.
- `syncEngine.flush`: while a follow-up waits, it remembers the strongest trigger asked for (`'manual'`, `'foreground'` and `'live'` outrank `'write'`, which outranks `'timer'` and `'launch'`), and the follow-up runs with it, so a poke that joins a queued follow-up still lifts the pause.
- `scheduler.launch()` and `foreground()` call `channel?.start()`; `background()` and `stop()` call `channel?.stop()`; `live()` runs a flush with trigger `'live'`.
- `createDeviceSync` builds the channel with `connect: (url, headers) => new WebSocket(url, undefined, { headers })` (React Native 0.88's `WebSocket(url, protocols, options)` passes `options.headers` to `NativeWebSocketModule.connect`; read in `node_modules/react-native/Libraries/WebSocket/WebSocket.js`), `appliedRevision: () => store.appliedRevision()`, `onLive: () => void scheduler.live()`, and the platform timers and `Math.random`.
- `getSharedLiveTarget().token` uses the same `V1Credentials` the transport uses (`v1SessionCredentials` today, 1C-T5's port after it), and `sharedV1` passes `allowLanHttp: __DEV__` to `createV1Transport` (L8): release builds never accept a LAN `http://` address.

- [ ] **Step 1: Write the failing tests.**
  - `liveChannel.test.ts`, on a fake socket factory and manual timers:
    - `it connects with the token and the client header to the live URL`: `liveUrl('https://api.example/')` is `wss://api.example/v1/sync/live`; `liveUrl('http://localhost:8787')` is `ws://localhost:8787/v1/sync/live`; `liveUrl('http://192.168.1.20:8787')` is `ws://192.168.1.20:8787/v1/sync/live`; the factory saw the URL with `Authorization: Bearer t1` and `X-GoGoSpend-Client: ios/1.2.3`.
    - `without a token or a client version it stays quiet`
    - `the open runs a live flush, and a newer revision runs another`: applied revision `'41'`: open, then `{"revision":"42"}`, gives two `onLive` calls; `{"revision":"42"}` with `'42'` applied gives none.
    - `anything but an exact poke is ignored and the socket stays open`: `{"revision":42}`, `{"revision":"4x"}`, `{"revision":"1","note":"x"}`, a 65-character string, an `ArrayBuffer` and `pong` call no `onLive` and close nothing.
    - `no pong within 10 seconds closes and reconnects; the open runs a live flush`
    - `each reconnect reads the token again`: the first connect used `t1`; the token source now answers `t2`; after a close 1006 and the backoff, the new socket carries `Bearer t2`.
    - `a late close from a replaced socket changes nothing`: after a pong timeout opened socket 2, socket 1's close 4409 neither stops socket 2 nor schedules a reconnect.
    - `an ended session stops reconnecting and flushes once`: close 4401 gives one `onLive`, and no new socket after any timer; `start()` connects again.
    - `a replaced socket does not come back`: close 4409 on the current socket, no new socket.
    - `other closes back off from 1 second to 15 seconds`: with `random()` 1, reconnect delays 1000, 2000, 4000, 8000, 15000, 15000; an open resets to 1000.
    - `stop closes the socket and ignores late events`
    - `the channel sends nothing but ping`
  - `syncEngine.test.ts`:
    - `a live flush lifts the failure pause but waits out the server's pacing`: after five failed runs (paused), `flush(session, 'live')` runs; inside a 429 `Retry-After`, it answers `rate_limited` without a request.
    - `a poke that joins a queued follow-up still lifts the pause`: while a run is held open and paused afterwards, a `'timer'` call queues the follow-up and a `'live'` call joins it; the follow-up runs (not `paused`).
    - Characterization (it passes before the change, and pins today's coalescing for pokes): `twenty pokes during a flush run one follow-up`: twenty `flush(session, 'live')` calls while one run is held open lead to exactly two runs on the fake server.
  - `diaryRepository.test.ts`: `the applied revision is read without loading the diary`: `appliedRevision()` answers `'0'` on a new diary and the revision of the last applied group afterwards.
  - `client.test.ts`: `a development build may reach wrangler dev on the LAN; a release build may not`: with `allowLanHttp: true`, `http://192.168.1.20:8787`, `http://10.0.0.5:8787` and `http://172.16.4.2:8787` are accepted; `http://172.32.0.1:8787`, `http://8.8.8.8` and `http://jotbun.local:8787` are refused with `CONFIG_REQUIRED`; with `allowLanHttp` false or absent, every non-loopback `http://` URL is refused.
  - `HistoryScreen.render.test.tsx`: `a change pulled from another phone refreshes the list in place`: the diary view's `appliedRevision` moves from `'5'` to `'7'` and the history resource is read once more; a view update with the same revision reads nothing.
  - `HomeScreen.render.test.tsx`: the same, for Home's load.
- [ ] **Step 2: Run them and see them fail** against a stub channel that never connects, a `gate` that ignores `'live'` and a transport that refuses LAN addresses. Run: `npm run test:unit -w gogospend-app -- src/sync/liveChannel.test.ts src/sync/syncEngine.test.ts src/storage/diaryRepository.test.ts`, `npm run test:app` and `npm run test:render -w gogospend-app -- src/screens/redesign/HistoryScreen.render.test.tsx src/screens/redesign/HomeScreen.render.test.tsx`. Record the counts (the characterization test passes; say so).
- [ ] **Step 3: Implement** the channel as its rules say; `'live'` in `FlushTrigger`, `gate` and the follow-up's trigger; `live()` and the channel hooks in the scheduler; `appliedRevision()` in the store; the wiring in `createDeviceSync` and `getSharedLiveTarget()`; `allowLanHttp`; `appliedRevision` in the diary view (from `state.appliedRevision`); and `useRefreshOnRevision(diaryView.appliedRevision, …)` in Home (its `loaded.refresh`) and History (`loadRef.current(true)`).
- [ ] **Step 4: Run them and see them pass.** Then the app gate.
- [ ] **Step 5: Mutation check.** Let `'live'` keep the pause: the pause test fails. Keep the first caller's trigger for the follow-up: the joined-poke test fails. Reconnect after 4401: the ended-session test fails. Cache the token across reconnects: the token test fails. Accept `172.32.0.1`: the LAN test fails. Refresh History on every view update: the in-place test fails (it counts reads).
- [ ] **Step 6: Gate, receipt, commit.** Commit: `Listen for live pokes in the foreground and pull at once, refresh Home and History when the revision moves, and let development builds reach the LAN`.

---

### Task 6: PostHog on the phone: the client, identity, screens and the consent calls

**Starts after:** 1D-T1

**Files:**
- Modify: `apps/app/package.json` and the root `package-lock.json` (`posthog-react-native`, `@posthog/react-native-plugin`, exact)
- Create: `apps/app/src/analytics/posthogOptions.ts` (pure), `src/analytics/analyticsServer.ts` (pure), `src/analytics/consentStorage.ts`, `src/analytics/posthogClient.ts`, `src/analytics/appAnalytics.ts`, `src/analytics/AnalyticsUpkeep.tsx`
- Modify: `apps/app/app/_layout.tsx` (render `<AnalyticsUpkeep />` beside `LocaleUpkeep`), `src/api/client.ts` (the `analyticsOff` option), `src/api/sharedV1.ts`, `src/config/env.ts`, `src/spend/v1/ai/AiCompanionProvider.tsx` (`ai_enabled`), `src/spend/v1/DeviceDiaryProvider.tsx` (`eraseWithDiary` also erases the stored answer)
- Test: `apps/app/src/analytics/posthogOptions.test.ts`, `src/analytics/analyticsServer.test.ts`, `src/api/client.test.ts`, `src/analytics/AnalyticsUpkeep.render.test.tsx`

**Interfaces:**
- Consumes: `createAnalytics`, `gateOutgoing`, `setAnalytics`, `getAnalytics`, `ServerAnalyticsState`, `StoredConsent` (1D-T1); `V1Transport`; `subscribeSession` and `getV1SessionSnapshot` (`src/auth/session.ts`); `fetchAccountId` (`src/api/sharedV1.ts`); `useActiveLocale`; `useAiCompanion().enabled`.
- Produces:
  ```ts
  // analytics/posthogOptions.ts (pure; a type-only import of posthog-react-native at most)
  export const REPLAY_TOUCHES_CAN_BE_OFF: boolean   // set in Step 1 from the installed types
  export function posthogOptions(input: { host: string; beforeSend: (event: OutgoingEvent) => OutgoingEvent | null; crashReportsWithoutConsent: boolean; replayTouchesCanBeOff: boolean }): Record<string, unknown>
  export function dropDeviceName(properties: Record<string, unknown>): Record<string, unknown>
  // analytics/analyticsServer.ts (pure)
  export function createAnalyticsServer(transport: V1Transport): AnalyticsDeps['server']
  // analytics/consentStorage.ts (SecureStore on native, key 'gogospend.analytics-consent'; no-ops on the web)
  export function readStoredConsent(): Promise<StoredConsent | null>
  export function writeStoredConsent(value: StoredConsent): Promise<void>
  export function eraseStoredConsent(): Promise<void>
  // analytics/appAnalytics.ts
  export function installAppAnalytics(): Promise<Analytics>   // once per app run; on the web the client is null
  // api/client.ts
  createV1Transport options gain analyticsOff?: () => boolean   // true adds 'X-GoGoSpend-Analytics: off'
  // api/sharedV1.ts
  export function getSharedAnalyticsServer(): AnalyticsDeps['server']
  // config/env.ts: getMobileEnv() gains
  posthogKey: string                     // EXPO_PUBLIC_POSTHOG_KEY, '' until the PostHog project exists (decided, Q5)
  posthogHost: string                    // EXPO_PUBLIC_POSTHOG_HOST, else `${v1ApiUrl}/ingest` (1D-T2's proxy)
  crashReportsWithoutConsent: boolean    // EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT !== '0' (on, as §7 proposes; decided, Q4)
  ```
- `posthogOptions` answers exactly (every option name is from posthog.com/docs/libraries/react-native and its session replay and error tracking pages):
  ```ts
  {
    host,
    defaultOptIn: true,                         // consent is the gate's job (L4); optOut() would also stop crash reports
    captureAppLifecycleEvents: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,            // no flags in phase 1, so no /flags traffic at all
    disableGeoip: true,
    enableSessionReplay: false,                 // started by the controller after yes, and only when allowed
    sessionReplayConfig: { maskAllTextInputs: true, maskAllImages: true, maskAllSandboxedViews: true, captureLog: false, captureNetworkTelemetry: false, /* captureTouches: false, only when replayTouchesCanBeOff */ },
    errorTracking: { autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: [], nativeCrashes: crashReportsWithoutConsent, androidNdkCrashes: crashReportsWithoutConsent } },
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    customAppProperties: dropDeviceName,
    before_send: beforeSend,
  }
  ```
  `captureLog` and `captureNetworkTelemetry` default to on, and push capture defaults to on with the plugin, so each is set off on purpose. Touch capture in events is off because the client is used without `PostHogProvider`'s `captureTouches` (off by default; it would record the view hierarchy's text). Native replay records tap positions by default, and on Jotbun's keypad a tap position gives away the amount; PostHog documents `sessionReplayConfig.captureTouches = false` for its native SDKs (posthog-android 3.64.0 and posthog-ios 3.74.0, docs session-replay privacy), so replay runs only when the installed React Native types expose it (decided, Q17). Native crash reports may not pass through JavaScript's `before_send`, so native capture follows the crash switch: off when crash reports are consent-only.
- `createAnalyticsServer(transport)`: `read()` sends `GET /v1/me/analytics` (1D-T11) and requires `analytics_id` to be `null` or `/^[0-9a-f]{64}$/`, `weeks_since_signup` an integer from 0 to 1040 and `consent` one of `yes`, `no`, `unasked`; it answers `{ consent, analyticsId: analytics_id, weeksSinceSignup: weeks_since_signup }`. A 404 `NOT_FOUND` (a server without 1D-T11) falls back to `GET /v1/me`: `privacy.analytics` true reads `yes`, false reads `unasked`, with no analytics id. `setConsent(analytics)` sends `PUT /v1/me/privacy-preferences` with `{ analytics }` and requires the answer `{ analytics }` back.
- `installAppAnalytics()` returns the installed instance when `getAnalytics()` already has one (tests install theirs with `recordAnalytics()`). Otherwise, on iOS and Android with a non-empty `posthogKey`, it imports `posthogClient.ts` lazily and builds `new PostHog(posthogKey, posthogOptions({ host: posthogHost, beforeSend: (event) => gateOutgoing(event, { analytics: analytics.allowsAnalytics(), crashReportsWithoutConsent }), crashReportsWithoutConsent, replayTouchesCanBeOff: REPLAY_TOUCHES_CAN_BE_OFF }))`, then `createAnalytics({ client, replay: REPLAY_TOUCHES_CAN_BE_OFF, store: { read: readStoredConsent, write: writeStoredConsent, erase: eraseStoredConsent }, server: getSharedAnalyticsServer() })`, `setCommon({ app_version, platform, home_currency: 'THB' })` (the version from `expo-application`) and `setAnalytics(analytics)`. Elsewhere (the web, tests, no key) the client is `null`.
- `AnalyticsUpkeep` (rendered once in the root layout) calls `installAppAnalytics()` on mount and works on the instance it resolves. It sends `analytics.screen(useSegments())` when the segments change (`useSegments` returns file segments such as `["spend", "record", "[id]"]`, never the values; `usePathname` would give the values and is not used; docs.expo.dev/versions/latest/sdk/router); keeps `language` current with `setCommon`; on every `subscribeSession` notification calls `setAccount(null)` when `getV1SessionSnapshot().binding` is null, else `setAccount(await fetchAccountId())` (a failed read leaves the account as it was until the next try); also sets the account that way once as soon as the instance resolves, from the current `getV1SessionSnapshot()`, because a session restored before it subscribed sends no notification; and on coming to the foreground repeats that, then calls `refresh()`, so a "no" given on another phone applies here.
- `sharedV1` passes `analyticsOff: () => getAnalytics()?.allowsAnalytics() !== true` to `createV1Transport`.

- [ ] **Step 1: Install the packages and read their types.** On the install day, pick for each the newest stable release published at least 7 days earlier (L8; on 25 October 2026 the newest were `posthog-react-native` 4.83.0 and `@posthog/react-native-plugin` 2.12.6; native NDK crash capture needs at least 4.78.0 and 2.12.0). Run the dependency gate.
  ```bash
  npm view posthog-react-native@<version> peerDependencies peerDependenciesMeta
  npm install --workspace gogospend-app --save-exact posthog-react-native@<version> @posthog/react-native-plugin@<version>
  node --test scripts/ci/lockfile-bindings.test.mjs
  grep -rn "captureTouches" node_modules/posthog-react-native --include=*.d.ts
  ```
  Every peer must be met or marked optional. `expo-device` is optional in 4.83.0 and is not added (decided, Q1); if the chosen version makes it required, stop and ask the owner. Set `REPLAY_TOUCHES_CAN_BE_OFF` to whether the replay config's type declares `captureTouches`, and record the answer in the receipt.
- [ ] **Step 2: Write the failing tests.**
  - `posthogOptions.test.ts`: `the client is built with replay masked, logs and network capture off, no lifecycle, flag, push or GeoIP traffic, and console errors not captured`: `posthogOptions({ host: 'https://edge.test/ingest', beforeSend, crashReportsWithoutConsent: true, replayTouchesCanBeOff: true })` deep-equals the object above with `captureTouches: false` (the two functions compared by identity); `replayTouchesCanBeOff: false` leaves `captureTouches` out; `crashReportsWithoutConsent: false` turns `nativeCrashes` and `androidNdkCrashes` off; and `dropDeviceName({ $device_name: "Kan's iPhone", $os_name: 'iOS' })` deep-equals `{ $os_name: 'iOS' }`.
  - `analyticsServer.test.ts`, on a fake transport as `resources.test.ts` uses: `read answers the consent, the analytics id and the weeks`; `a null analytics id is accepted, a malformed one is invalid_response` (63 hex characters, `weeks_since_signup: -1` and `consent: 'maybe'` each fail); `a server without the route falls back to /v1/me` (404 then `privacy.analytics: false` reads `unasked` with a null id); `setConsent sends exactly { analytics } and checks the answer`.
  - `client.test.ts`: `requests carry X-GoGoSpend-Analytics: off unless this phone's answer is yes`: with `analyticsOff: () => true` the request has the header with value `off`; with `() => false` and with no option it has no such header.
  - `AnalyticsUpkeep.render.test.tsx`, with `recordAnalytics()` installed and `expo-router`'s `useSegments`, `@mobile/api/sharedV1`'s `fetchAccountId` and `react-native`'s `AppState` mocked; unless a case says otherwise, the session is already restored with a binding and `fetchAccountId` answers `recordAnalytics`'s account, so the set at start changes nothing:
    - `screens are sent as route patterns`: segments `['spend', 'record', '[id]']` send one screen `/spend/record/[id]`.
    - `a sign-out resets identity`: a session notification with no binding records one `reset`.
    - `a session already restored at start sets the account`: with `getV1SessionSnapshot()` already holding a binding when `AnalyticsUpkeep` mounts, no session notification sent and `fetchAccountId` answering another account, `sent` holds one `reset`, then one `identify`, once the instance resolves.
    - `coming to the foreground reads the answer again`: in place of `recordAnalytics()`, whose server answer changes only through `setConsent` (so another phone's "no" cannot reach it), the case installs its own controller, as `controller.test.ts`'s harness builds one: 1D-T1's `createAnalytics` with a recording `PostHogLike` client, `replay: true`, an in-memory store and a server whose `read()` answers `{ consent: remote, analyticsId: 'a'.repeat(64), weeksSinceSignup: null }` for a `remote` the test sets, `yes` at first. It awaits `setAccount('00000000-0000-4000-8000-0000000000aa')`, the restored account `fetchAccountId` answers, so the set at start changes nothing; installs it with `setAnalytics` (putting the previous one back afterwards) and empties its record. Then `remote` becomes `no`, as another phone's answer would make it, and an `AppState` change to `active` leads to one `reset`, the status `no`, and no capture for a `track` after it. 1D-T1's files stay as built.
- [ ] **Step 3: Run them and see them fail** against stubs. Run: `npm run test:unit -w gogospend-app -- src/analytics/posthogOptions.test.ts src/analytics/analyticsServer.test.ts`, `npm run test:app` and `npm run test:render -w gogospend-app -- src/analytics/AnalyticsUpkeep.render.test.tsx`. Record the counts.
- [ ] **Step 4: Implement** the modules and wiring above. In `AiCompanionProvider`, call `getAnalytics()?.setCommon({ ai_enabled: value.enabled })` when `enabled` changes. In `eraseWithDiary`, add `eraseStoredConsent()` to the settings erased with the diary.
- [ ] **Step 5: Run them and see them pass**, then the app gate (the root layout's render test proves the web build installs analytics with no client).
- [ ] **Step 6: Mutation check.** Set `captureLog: true`: the options test fails. Keep native crash capture on with the switch off: the options test fails. Send the header when the answer is yes: the header test fails. Skip `refresh()` on foreground: the foreground test fails. Send `usePathname()` instead of segments: the screen test fails. Skip the set when the instance resolves: the restored-session case fails.
- [ ] **Step 7: Native checks, recorded SKIPPED.** `@posthog/react-native-plugin` is native code, so replay and native crash capture run only in a development build (never Expo Go), which the app's SQLCipher diary already requires; without the plugin, native capture is a no-op and JavaScript capture still works (posthog.com/docs/error-tracking/installation/react-native). SKIPPED until the owner's Expo/EAS project and PostHog project exist (Q5, Q8): a development build that compiles the plugin against Expo SDK 58 and React Native 0.88 on iOS and Android; replay masking and the absence of tap positions seen in a real recording; whether a native crash report passes through `before_send` (scrubbed) or not; a native crash symbolicated. Symbol and source-map upload is P6C-T12's, for store builds only (decided, Q2).
- [ ] **Step 8: Gate, receipt, commit.** Commit: `Wire PostHog into the app behind the analytics bus: masked replay only after yes, scrubbed crash reports, route-pattern screens and consent read from the server`.

---

### Task 7: The phase 1 app events, from the rules that perform each action

**Starts after:** 1D-T1, P2-T7

**Files:**
- Create: `apps/app/src/analytics/recordProps.ts` (pure), `apps/app/src/sync/syncTelemetry.ts` (pure)
- Modify: `apps/app/src/sync/types.ts` (`SyncOutcome.reason`), `src/sync/syncEngine.ts` (sets it), `src/sync/deviceSync.ts` (reports sync events), `src/consent/systemPermissionTelemetry.ts` (a relative import of the bus; `permission_denied`), `src/spend/spendTelemetry.ts` (the legacy calls become documented no-ops), and each rule in the table below, in the file that holds it when this task runs
- Test: `apps/app/src/analytics/recordProps.test.ts`, `src/sync/syncTelemetry.test.ts`, `src/consent/systemPermissionTelemetry.test.ts`, and the render tests of the screens named below

**Interfaces:**
- Consumes: the typed emitters and `recordAnalytics` (1D-T1); `analyticsCategoryKey` (P2-T7, `src/spend/v1/redesign/planning/thaiPack.ts`).
- Produces:
  ```ts
  // analytics/recordProps.ts
  export function categoryKeyOf(categoryId: string | null | undefined, categories: Iterable<CategoryDto>): string | null
  // null for no category (a transfer); else analyticsCategoryKey of the category found; an unknown id is 'custom'
  // sync/types.ts
  SyncOutcome.reason: string | null   // the V1Error code of the run's failure (NETWORK_ERROR, TIMEOUT, HTTP_502, INTERNAL_ERROR, LOCAL_ERROR), else null
  // sync/syncTelemetry.ts
  export function syncEvents(previous: SyncOutcome | null, next: SyncOutcome): { name: 'sync_failed' | 'resync_required'; properties: Record<string, string> }[]
  ```
- One emitter per action (R25). Each call sits in the rule that performs the action, after the server's acknowledgement or the device commit, never in a render or a tray. Several of these rules move into phase 2 hooks. When this task runs, put each call where its rule is at that moment: in the phase 2 hook if that file exists, otherwise in today's screen, where phase 2's move then carries it along unchanged. Either way the old screens' render tests below keep passing, because each phase 2 move keeps those suites unchanged. Phase 2's trays and screens never add a second call for the same action; where they need to add properties (Tell Bun's source, a wallet's look), they pass them into the rule.

  | Event | The rule today | Where phase 2 moves the rule |
  | --- | --- | --- |
  | `record_saved` `{ kind, source, category_key, has_photo: false, offline, seconds_to_save }` | Quick add's `finish` (the success path after the device commit or the server's acknowledgement) in `QuickAddScreen.tsx` | `finish` in `useEntrySave`, `entry/entrySave.ts` (P2-T5). The save input gains `track: { source: RecordSource; categoryKey: string | null; openedAt: number }`; P2-T16's tray host passes it and sends no `record_saved` of its own. `offline` is true when the save stayed on the phone (`via: 'device'`) while the diary's last outcome is not `synced`; `seconds_to_save` is whole seconds since `openedAt`. |
  | `record_started` `{ source: 'typed' }` | `QuickAddScreen` opening | none: P2-T16's tray `open` sends its own start for an entry it starts; one entry is started in one place |
  | `undo_used` `{ kind }` (the saved toast) | Quick add's undo of the draft it just saved | none: P2-T17's toast sends its own for its own undo |
  | `record_edited` `{ kind, category_key }` | `RecordScreen.submitEdit`, on acknowledgement | `useRecordActions`, `record/recordActions.ts` (P2-T6); P2-T26 and P2-T27 send none of their own |
  | `record_deleted` `{ kind, category_key }` and its `undo_used` | `RecordScreen.remove` and the undo bar's restore | the same hook |
  | `record_restored` `{ kind }` | `RecordScreen.restore` from Restore; `RecentlyDeletedScreen`'s restore | the same hook; `useRecentlyDeleted`, `deleted/deletedData.ts` (P2-T25) |
  | `record_deleted` and its `undo_used` (History) | `HistoryScreen.remove` and its undo | `history/historyData.ts` (P2-T28) |
  | `wallet_added` `{}` | `WalletsScreen`'s create, on acknowledgement; Home's first-wallet form | `useWalletCommand().send` for a create, `planning/walletCommands.ts` (P2-T19), whose `send` takes an optional `track: { walletType, material, bunFace }` so the new-wallet flow sends its look through this one call; Home's form keeps its own |
  | `budget_set` `{ budget: 'set' }` | `BudgetScreen`'s editor send, on acknowledgement | `useBudgetCommand().send`, `planning/budgetCommands.ts` (P2-T30); its "ยังไม่ตั้ง" sends `trackBudgetSet({ set: false })` from its own skip |
  | `onboarding_step_viewed` `{ step }` | today's `OnboardingScreen`, each story step shown (`first-coffee` sent as `first_coffee`); held until the answer (1D-T1) | none: P2-T35's setup sends its own steps |
  | `sync_failed` `{ reason_code }`, `resync_required` | `createDeviceSync`'s outcome report, through `syncEvents`: `sync_failed` once on entering the failure set (`waiting` or `paused`) from a status outside it, so waiting to paused sends nothing; `resync_required` once on entering `resync_pending` | unchanged |
  | `permission_denied` `{ reason_code }` | `systemPermissionTelemetry`, outcome `deny`; other outcomes send nothing | unchanged |

  Not in 1D: `conflict_shown` (1D-T9), the account events (1D-T14), and `reminder_set`, `insights_viewed`, `recap_opened`, `recap_shared`, `private_mode_toggled` and `setup_completed`, which phase 2's new screens send through 1D's emitters (`RemindersScreen.tsx` belongs to another session until its commit). The legacy `trackSpendImportStarted` and `trackSpendTxAdded` (dev-only legacy screens) send nothing, as they sent nothing before (the old sink was never set).

- [ ] **Step 1: Write the failing tests.**
  - `recordProps.test.ts`: a `food` expense gives `'food'`; a category named `ทำบุญ` gives `'merit'`; another custom category gives `'custom'`; an unknown id gives `'custom'`; no category gives `null`.
  - `syncTelemetry.test.ts`: `a failing run is counted once, not on every retry`: outcomes synced, waiting (`NETWORK_ERROR`), waiting, paused, synced give exactly one `sync_failed` `{ reason_code: 'NETWORK_ERROR' }`; entering `resync_pending` gives one `resync_required`.
  - `systemPermissionTelemetry.test.ts`: a camera deny records `permission_denied` `{ reason_code: 'CAMERA_DENIED' }`; a grant records nothing.
  - One render test per site, with `recordAnalytics()`, each asserting its row of the table, exactly one event per action, and that the JSON of `sent` holds no amount, note or name from the fixture:
    - `QuickAddScreen.render.test.tsx`: `saving an expense records record_started then one record_saved with its kind and category, and never the amount or the note`: after saving ฿45 "ข้าวมันไก่" as food, `sent` holds `record_started` and then one `record_saved` with `kind: 'expense'`, `category_key: 'food'`, `source: 'typed'`, `has_photo: false`, `offline: false` and a numeric `seconds_to_save`, and contains neither `45` nor `4500` nor `ข้าวมันไก่`; and `the saved toast's Undo records undo_used`.
    - `RecordScreen.render.test.tsx`: `an acknowledged edit records record_edited`, `a delete records record_deleted and its undo records undo_used`, `Restore records record_restored`.
    - `HistoryScreen.render.test.tsx`: `a delete from History records record_deleted, and its undo undo_used`.
    - `RecentlyDeletedScreen.render.test.tsx`: `a restore records record_restored`.
    - `OnboardingScreen.render.test.tsx`: `each story step records onboarding_step_viewed`, in the order `coffee`, `private`, `first_coffee`, `reminder`.
    - `planning/WalletsScreen.render.test.tsx` and `HomeScreen.render.test.tsx`: `creating a wallet records one wallet_added, without its name or opening balance`.
    - `planning/BudgetScreen.render.test.tsx`: `saving the month's budget records one budget_set, without the amount`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/analytics/recordProps.test.ts src/sync/syncTelemetry.test.ts src/consent/systemPermissionTelemetry.test.ts` and `npm run test:render -w gogospend-app -- src/screens/redesign`. Record the counts.
- [ ] **Step 3: Implement** the helpers, `reason` in `summarize` (from the run's failure, `null` on success), the reporting wrapper in `createDeviceSync` (it keeps the previous outcome and sends each item of `syncEvents` through `trackSyncFailed` or `trackResyncRequired`, never through `trackClientEvent` directly), the relative import in `systemPermissionTelemetry.ts` (`../analytics/events.ts`, which Node's test runner can load), the legacy no-ops, and the calls at each rule.
- [ ] **Step 4: Run them and see them pass**, then the app gate.
- [ ] **Step 5: Mutation check.** Count `sync_failed` on every waiting outcome: the once-only test fails. Send the category label instead of the key: the Quick add test fails. Call `trackRecordSaved` from the render as well as from `finish`: the exactly-one assertion fails. Send `amount_minor` from Quick add: the allow-list drops it and the test still passes, which proves the bus guards the screen (record this as the equivalent mutant).
- [ ] **Step 6: Gate, receipt, commit.** Commit: `Send the phase 1 app events once each, from the rules that save, delete, restore and undo`.

---

### Task 8: The consent question and the Privacy switch (D34)

**Starts after:** 1D-T1

**Files:**
- Create: `apps/app/src/screens/redesign/account/AnalyticsConsentScreen.tsx`, `apps/app/src/screens/redesign/account/analyticsConsentCopy.draft.ts`, `apps/app/src/analytics/useAnalyticsConsent.ts`, `apps/app/src/dev/catalogue/account/analyticsSections.tsx`
- Modify: `apps/app/app/spend/_layout.tsx` (the question in place of what `CompanionBoundary` wraps: `<Slot />` today, and P2-T18's whole `<WalletShell>…</WalletShell>` in the wallet branch, R82), `src/screens/redesign/account/PrivacyScreen.tsx`, `src/config/featureFlags.ts` (area `analytics`), `src/dev/catalogue/registry.tsx` (`ACCOUNT_SECTIONS`)
- Test: `apps/app/src/screens/redesign/account/AnalyticsConsentScreen.render.test.tsx`, `src/screens/redesign/account/PrivacyScreen.render.test.tsx`, `src/screens/redesign/SpendLayout.render.test.tsx` (and `src/wallet/home/spendLayoutOrder.test.ts` once P2-T18 has merged), `src/config/featureFlags.test.ts`, `src/dev/catalogue/CatalogueScreen.render.test.tsx` (its `SHOWS` table)

**Interfaces:**
- Consumes: `getAnalytics()`, `Analytics.answer`, `status` and `subscribe`, `trackOnboardingStepViewed` and `recordAnalytics` (1D-T1); `ReminderSwitch` (`src/screens/redesign/insights/RemindersParts.tsx`); `PillButton`; the draft-copy pattern of `src/screens/v1/importReviewCopy.draft.ts`.
- Produces:
  ```ts
  export function useAnalyticsConsent(): { status: ConsentStatus; installed: boolean; answer(answer: ConsentAnswer): Promise<void> }   // installed: getAnalytics() holds an instance (P2-T35 reads it)
  export function AnalyticsConsentScreen(): JSX.Element
  export type RedesignArea = /* existing */ | 'analytics'   // not in APPROVED until E2
  ```
- Behaviour, all of it only while `isRedesignEnabled('analytics')` (the Privacy screen is in the approved `account` area, so the new row would otherwise route draft copy before E2):
  - `useAnalyticsConsent` answers `signed_out` with `installed: false` while no analytics is installed (before 1D-T6 merges; 1D-T6 installs it on the web too, with a null client), and otherwise follows `subscribe`, with `installed: true` (`getAnalytics() !== null`, read at each render; 1D-T6 installs it at app start, before a first run reaches the spend layout, though a relaunch partway through the first run can reach the layout first, P2's W34). A new controller is `loading` until its first `setAccount` (1D-T1), so `signed_out` with `installed: true` means the controller was last told no one is signed in (1D-T6's `AnalyticsUpkeep` calls `setAccount(null)` for a session without a binding) and has not yet been given the signed-in account: P2-T35's setup redirect waits through it and through `loading` (P2's W34).
  - The question shows inside the signed-in spend layout when the status is `unanswered` (the server says never asked), as `CompanionBoundary`'s only child, in place of what it wraps: `<Slot />` in today's `screens` element, and in P2-T18's wallet branch the whole `<WalletShell>…</WalletShell>` (R82), never inside the shell. Whichever of this task and P2-T18 lands second writes the wallet branch's swap and P2-T18's two consent cases. `loading` never blocks the screens.
  - Two buttons of equal weight (`PillButton kind="secondary"`, same size, neither chosen), so the answer is not pre-ticked. This departs from §5.1's single black main button on purpose (D34); the screenshots say so. "No" applies at once and leaves; "Yes" waits for the server, and on failure the screen stays with a calm line and both buttons. The screen sends `trackOnboardingStepViewed({ step: 'analytics_consent' })` (held until the answer, sent only on yes).
  - Privacy gains one switch row (the `ReminderSwitch`) labelled "ช่วยพัฒนา Jotbun", on when the status is `yes`. Off applies at once; on waits for the server and shows the same failure line. While a "no" is still pending to the server, a caption says it is stopped on this phone.
- Draft copy (`analyticsConsentCopy.draft.ts`, Thai first, English beside; the Thai is a first draft for the owner's or a translator's pass, and Vietnamese falls back to English until approval; decided, Q4, Q9 and Q10):

  | Key | Thai | English |
  | --- | --- | --- |
  | `title` | ช่วยพัฒนา Jotbun | Help improve Jotbun |
  | `body` | ให้ Jotbun เห็นว่าคุณใช้แอปอย่างไร เช่น หน้าที่เปิดและวิธีที่จด เพื่อปรับให้ใช้ง่ายขึ้น | Let Jotbun see how you use the app, such as the screens you open and how you record, so we can make it easier. |
  | `replay` | รวมถึงการบันทึกหน้าจอที่ซ่อนข้อความและรูปทั้งหมด และแบบสอบถามสั้น ๆ บางครั้ง | This includes screen recordings with every word and picture hidden, and an occasional short survey. |
  | `never` | เราไม่เคยส่งยอดเงิน ชื่อร้าน ชื่อกระเป๋า โน้ต อีเมล หรือรูปสลิป | We never send amounts, shop or wallet names, notes, your email or slip photos. |
  | `later` | เปลี่ยนได้ทุกเมื่อในความเป็นส่วนตัว | You can change this any time in Privacy. |
  | `yes` | ได้ ช่วยเลย | Yes, I'll help |
  | `no` | ไม่ ขอบคุณ | No, thanks |
  | `saveFailed` | บันทึกคำตอบไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง | Couldn't save your answer. Check your connection and try again. |
  | `switchLabel` | ช่วยพัฒนา Jotbun | Help improve Jotbun |
  | `stoppedHere` | หยุดส่งจากเครื่องนี้แล้ว จะแจ้ง Jotbun เมื่อออนไลน์ | Stopped on this phone. Jotbun will be told when you're online. |

- [ ] **Step 1: Write the failing tests.**
  - `AnalyticsConsentScreen.render.test.tsx`: `neither answer is chosen before the person taps`; `no applies at once and leaves the question`; `yes waits for the server and stays with a calm line when it fails`; `the screen names what is never sent` (the `never` line is on screen in Thai and in English); `useAnalyticsConsent says whether analytics is installed` (with nothing installed, `signed_out` and `installed: false`; after `recordAnalytics()`, `installed: true` and the controller's status).
  - `PrivacyScreen.render.test.tsx`: `the switch shows the answer and turns off at once`; `turning it on waits for the server`; `a pending no says it stopped on this phone`; `with the analytics area off there is no switch`.
  - `SpendLayout.render.test.tsx`: `a never-asked question takes the screens' place only in the analytics area`. Once P2-T18 has merged, also P2-T18's two consent cases: `in the wallet area, a never-asked consent question renders in place of the wallet shell` in this file, and `the consent question takes the shell's place inside CompanionBoundary` in `spendLayoutOrder.test.ts`.
  - `featureFlags.test.ts`: `analytics` is off by default, on when named, on with `all`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** the hook, the screen, the switch row, the layout gate and the flag. Every string comes from the draft module; nothing is added to `en.json` or `th.json`.
- [ ] **Step 4: Add the catalogue sections** `analytics-consent`, `analytics-consent-failed`, `privacy-analytics-on`, `privacy-analytics-off` and `privacy-analytics-pending`, on fakes, with their lines in the every-section test's `SHOWS` table.
- [ ] **Step 5: Run them and see them pass**, then the app gate.
- [ ] **Step 6: Mutation check.** Pre-select yes: the first test fails. Make "no" wait for the server: the at-once test fails. Answer `installed: true` with nothing installed: the installed case fails. Render the switch with the area off: its test fails. Route the question with the area off: the layout test fails. With P2-T18 merged, render the question inside `WalletShell`: both consent cases fail.
- [ ] **Step 7: Screenshots for the owner (E2).** Open each new section with its `chrome=off` link at 320 pt and at 390 pt, light and dark, in Thai and English: in the simulator when a development build exists, otherwise in the web catalogue (`npm run web -w gogospend-app`, then `/dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&chrome=off`), as the companion area's sections were checked. Put the contact sheet in the receipt with two notes: the copy is a draft for approval, and the two equal buttons depart from §5.1's single black main button so the answer is not nudged. Leave `analytics` out of `APPROVED`.
- [ ] **Step 8: Gate, receipt, commit.** Commit: `Add the consent question and the Privacy switch behind the unapproved analytics area, with draft Thai and English copy`.
- [ ] **After the owner approves (a later commit, with the owner's words in the receipt):** move the strings into `th.json` and `en.json` (Vietnamese from the translator, else English), use `useCopy()`, delete the draft module, add `analytics` to `APPROVED`, run the app gate, commit.

---

### Task 9: The conflict choice: 1D's `ChoicePanel`, the record's choice flow and its mark in History (C16, `rh-conflict`)

**Starts after:** 1D-T4, 1D-T1

**Files:**
- Create: `apps/app/src/screens/redesign/conflict/ChoicePanel.tsx`, `apps/app/src/screens/redesign/conflict/conflictCopy.draft.ts`, `apps/app/src/dev/catalogue/conflictSections.tsx`
- Modify: the record's edit rule where it lives when this task runs (`apps/app/src/screens/redesign/RecordScreen.tsx` today; `apps/app/src/screens/redesign/record/recordActions.ts` once P2-T6 has merged, with `RecordScreen.tsx` rendering), `src/spend/v1/redesign/shared.ts` (`DiaryRow.choicePending`, `RowContext.pendingChoiceIds`), `src/spend/v1/redesign/historyModel.ts`, `src/screens/redesign/HistoryParts.tsx` (the caption), `src/screens/redesign/HistoryScreen.tsx` (passes the ids), `src/config/featureFlags.ts` (area `conflict`), `src/dev/catalogue/registry.tsx`
- Test: `apps/app/src/screens/redesign/RecordScreen.render.test.tsx`, `src/screens/redesign/conflict/ChoicePanel.render.test.tsx`, `src/spend/v1/redesign/historyModel.test.ts`, `src/screens/redesign/HistoryScreen.render.test.tsx`, `src/config/featureFlags.test.ts`, `src/dev/catalogue/CatalogueScreen.render.test.tsx` (its `SHOWS` table)

**Interfaces:**
- Consumes: `PendingChoice`, `SpendDiary.keepChoice` and `dropChoice`, `DiaryView.pendingChoices`, `draftFromChoice`, `choiceAgainst`, `choiceSettled` and `resendForChoice` (1D-T4); `conflictModel` and `ConflictModel` (`recordModel.ts`); `useCommandKeys` and `saveProblem` (`src/screens/v1/parts.tsx`); `trackConflictShown` and `recordAnalytics` (1D-T1; the event is held until consent).
- Produces:
  ```ts
  // screens/redesign/conflict/ChoicePanel.tsx: 1D owns it; P2-T27 restyles it in place instead of building ConflictChoice (R24)
  export type ChoicePanelProps = {
    model: Extract<ConflictModel, { kind: 'changed' }>
    yoursAt: string | null        // "HH:MM" on Bangkok's clock, from the choice's editedAt
    busy: boolean
    canSendYours: boolean         // false offline: "use yours" disabled with the offline line
    note: string | null           // the cannot-keep line, when the phone cannot keep the choice
    onUseYours(): void
    onUseServer(): void
    onDecideLater?: () => void    // absent: no "Decide later" (a phone that cannot keep the choice; phase 2's own uses)
  }
  export function ChoicePanel(props: ChoicePanelProps): JSX.Element
  // screens/redesign/record/recordActions.ts, once useRecordActions exists (P2-T6); P2-T27 reads it by this name
  RecordActionsState.choicePanel: ChoicePanelProps | null   // the open choice's panel props, or null
  // spend/v1/redesign/shared.ts
  DiaryRow.choicePending: boolean                       // false unless the row's record has a pending choice
  RowContext.pendingChoiceIds?: ReadonlySet<string>     // confirmedRow reads it; History passes it, Home leaves it out
  export type RedesignArea = /* existing */ | 'conflict'   // not in APPROVED until E2
  ```
- The board, `docs/design/bun-wallet/rh-conflict.dc.html`: the heading, a line saying the change stays on this phone until the person chooses, two cards ("ของคุณ" with "เครื่องนี้ · แก้ <time>", and "ในเซิร์ฟเวอร์" with "อีกเครื่อง") chosen as radio buttons with "ของคุณ" selected first, a "ไม่ตรงกัน" mark on each differing field, a note on what using yours replaces, one black main button following the chosen card, and "ตัดสินใจทีหลัง" as a text link below. Each radio card is at least 44 pt; a differing field is marked in words as well as weight, never in red or green; at the largest text sizes the cards stack, as today's `ConflictPanel` stacks its values.
- The flow, with the `conflict` area on (with it off, today's `ConflictPanel` with Apply and Reload stays, and no choice is kept). It lives in the record's edit rule: `RecordScreen.submitEdit` and its load today; `useRecordActions` once P2-T6 has merged, exposing the panel's props to the screen as `choicePanel`. If P2-T6 lands after this task, its move carries the flow along; `RecordScreen.render.test.tsx` passes in either order.
  - An edit refused with `VERSION_CONFLICT` and a usable current record keeps a choice (`keepChoice` with the edit's `original`, its `changes`, the refusal's record, `editedAt` and `refusedAt`), shows the panel and sends `trackConflictShown({ screen: '/spend/record/[id]' })` once, from the rule.
  - Opening a record that has a choice reads the record: when the choice is settled, it is dropped and the record shows as usual; otherwise the panel compares against the fresh record, which is also kept as the choice's `server`. Offline, it compares against the stored `server`, with `canSendYours` false.
  - "Use yours" sends `resendForChoice(choice, current)` under its own command key (slot `choice:<id>`). Acknowledged: drop the choice and reload. Another conflict: keep the choice with the newer record and show it again. An unknown outcome: freeze with "Try again", as today's edit does, and keep the choice until confirmed.
  - "Use the server's" drops the choice and sends nothing. "Decide later" leaves the screen and keeps the choice.
  - When the server's record is deleted: the deleted notice and Restore as today, plus "Discard my change", which drops the choice.
  - When the choice cannot be kept (no diary open, as on the web, or a locked diary): the panel shows without `onDecideLater`, with the cannot-keep note.
  - History marks a record that has a choice with the waiting caption; a tap opens the record as usual.
  - C16 covers record edits only (decided, Q14): wallet and budget edits keep today's in-screen comparison.
- Draft copy (`conflictCopy.draft.ts`; the Thai of the heading, cards, mark and buttons is the board's, and "ตัดสินใจทีหลัง" is C16's; decided, Q9 and Q10):

  | Key | Thai | English |
  | --- | --- | --- |
  | `heading` | รายการนี้ถูกแก้ในอีกเครื่อง | This entry was changed on another phone |
  | `keptHere` | ข้อมูลไม่ตรงกัน เลือกว่าจะเก็บแบบไหน การแก้ไขของคุณยังเก็บอยู่ในเครื่องนี้จนกว่าคุณจะเลือก | The details don't match. Choose which to keep. Your change stays on this phone until you choose. |
  | `yours` / `yoursAt` | ของคุณ / เครื่องนี้ · แก้ {time} | Yours / This phone · changed {time} |
  | `server` / `serverAt` | ในเซิร์ฟเวอร์ / อีกเครื่อง | On the server / Another phone |
  | `differs` | ไม่ตรงกัน | Differs |
  | `replaces` | ถ้าใช้ของคุณ ช่องที่ไม่ตรงกันในเซิร์ฟเวอร์จะถูกแทนที่ | If you use yours, the fields that differ on the server are replaced. |
  | `useYours` / `useServer` | ใช้ของคุณ / ใช้ในเซิร์ฟเวอร์ | Use yours / Use the server's |
  | `decideLater` | ตัดสินใจทีหลัง | Decide later |
  | `offline` | ต้องต่ออินเทอร์เน็ตก่อนจึงจะส่งของคุณได้ | Connect to the internet to send yours. |
  | `discardMine` | ทิ้งการแก้ไขของฉัน | Discard my change |
  | `cannotKeep` | เครื่องนี้เก็บตัวเลือกไว้ไม่ได้ กรุณาเลือกตอนนี้ | This phone can't keep this choice, so please choose now. |
  | `waiting` | รอคุณเลือก | Waiting for your choice |

- [ ] **Step 1: Write the failing tests.**
  - `RecordScreen.render.test.tsx`, on the existing fakes with the `conflict` area on (`EXPO_PUBLIC_REDESIGN=conflict` set in the test):
    - `a refused edit is kept as a choice and both versions are shown, yours chosen`
    - `decide later keeps the choice, and reopening the record shows it again`
    - `use yours sends the same changes on the server's version once, then drops the choice` (one `updateTransaction` with the current version and the edit's changes)
    - `choosing the server's version sends nothing and drops the choice`
    - `offline, the choice compares with the kept record and cannot send yours`
    - `a choice the server already holds clears itself`
    - `a deleted record offers Restore and Discard my change`
    - `a phone that cannot keep the choice asks for it now` (no "Decide later")
    - `conflict_shown is sent once, from the edit rule, with the class name and the route pattern only` (with `recordAnalytics()`)
    - `with the conflict area off, today's comparison stays and nothing is kept`
  - `ChoicePanel.render.test.tsx`: `without onDecideLater there is no Decide later link`; `each radio card is at least 44 pt and says whether it is chosen`; `the main button follows the chosen card`.
  - `historyModel.test.ts`: `a record waiting for a choice is marked` (`choicePending: true` for an id in `pendingChoiceIds`, false otherwise, never on a draft).
  - `featureFlags.test.ts`: `conflict` is off by default, on when named, on with `all`.
- [ ] **Step 2: Run them and see them fail.** Record the counts.
- [ ] **Step 3: Implement** the panel, the flow in the edit rule, the History mark and the flag. Every string comes from the draft module.
- [ ] **Step 4: Add the catalogue sections** `record-choice`, `record-choice-server`, `record-choice-offline`, `record-choice-deleted`, `record-choice-cannot-keep` and `history-choice-waiting`, reached with the same steps as the render tests (the golden rent changed elsewhere, as `record-conflict` does today), with their lines in the `SHOWS` table.
- [ ] **Step 5: Run them and see them pass**, then the app gate.
- [ ] **Step 6: Mutation check.** Send yours on the original version: the use-yours test fails. Drop the choice on "Decide later": the reopen test fails. Show the panel against the stored record while online: the settled and fresh-record tests fail. Send `conflict_shown` on every render of the panel: the once test fails.
- [ ] **Step 7: Screenshots for the owner (E2),** as in 1D-T8 Step 7, for every new section, beside the board for comparison. Mark the copy as a draft; leave `conflict` out of `APPROVED`.
- [ ] **Step 8: Gate, receipt, commit.** Commit: `Keep a refused record edit as a choice on 1D's rh-conflict panel behind the unapproved conflict area`.
- [ ] **After the owner approves:** move the strings into the catalogs, delete the draft module, add `conflict` to `APPROVED`, gate, commit.

---

### Task 10: Live pokes from the vault: `GET /v1/sync/live` on the Hibernation API

**Starts after:** 1A-T3, 1A-T5, 1A-T8, 1B-T3

**Files:**
- Create: `apps/edge/src/vault/live.ts`
- Modify: `apps/edge/src/vault/user-vault.ts` (`fetch`, the WebSocket handlers, the auto-response, and the poke and close around `call()` and `alarm()`), `src/v1/routes.ts` (`VaultRoute.live`, the route, `VAULT_ADDED_ROUTES`), `src/v1/handler.ts` (the live branch), `src/cloudflare-workers.d.ts`, `test/workers/support/v1-client.ts` (`openLive`), `test/vault-route-coverage.test.ts` (after 1B-T13, `test/route-coverage.test.ts`)
- Test: `apps/edge/test/workers/live.test.ts`

**Interfaces:**
- Consumes: `UserVault`, `VaultContext`, `ensureAccount`, `assertSession`, `RateBuckets`, `toProblemReply`, `handleVaultV1`, `VAULT_V1_ROUTES` and `VaultRoute` (`src/v1/routes.ts`), `VaultClaims` (1A-T2, with 1B-T3's `authTime`); commits under `sync_state.revision` (1A-T3); `UserVault#alarm` and the retention change groups (1A-T8); `UserVault#erased` (1B-T2) and `call()`'s erased refusal (1B-T3); `newUser`, `startV1`, `member`, `vaultOf` and `TestUser = { sub, sid }` (1A's test support), `createLunch` (1A-T5).
- Produces:
  ```ts
  // src/vault/live.ts
  export type LiveAttachment = { sessionId: string; issuedAt: number; openedAt: number }
  export const LIVE_CLOSE = { sessionEnded: 4401, replaced: 4409, unexpected: 1008 } as const
  export const MAX_LIVE_SOCKETS = 20
  export function currentRevision(sql: SqlStorage): string                   // CAST(revision AS TEXT); '0' without a row
  export function pokeMessage(revision: string): string                      // '{"revision":"<r>"}'
  export function pokeOthers(state: DurableObjectStateLike, revision: string, exceptSession: string | null): number
  export function closeEndedSessions(state: DurableObjectStateLike, sql: SqlStorage, erased: boolean): number
  export function parseLiveClaims(header: string | null): VaultClaims | null  // every VaultClaims field checked
  export function acceptLive(state: DurableObjectStateLike, claims: VaultClaims, nowMs: number): Response
  // UserVault
  fetch(request: Request): Promise<Response>      // only GET https://vault.internal/live with upgrade: websocket and x-vault-claims
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void
  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): void
  webSocketError(ws: WebSocket, error: unknown): void
  private afterCall(before: string, sessionId: string | null): void   // poke when the revision grew, then close ended sessions; never throws
  // src/v1/routes.ts (where VaultRoute lives)
  VaultRoute gains live?: true                    // answered by UserVault#fetch as a WebSocket: no vault call, no Worker handler
  export const VAULT_ADDED_ROUTES: readonly string[]   // routes the PostgreSQL edge never had: ['GET /v1/sync/live']; 1D-T11 adds 'GET /v1/me/analytics'
  // test/workers/support/v1-client.ts
  export type LiveTestSocket = { messages: string[]; next(timeoutMs?: number): Promise<string>; closed: Promise<{ code: number }>; send(data: string): void; close(): void }
  export function openLive(client: V1Client, user: TestUser, opts?: { client?: string }): Promise<{ status: number; body?: unknown; socket?: LiveTestSocket }>
  ```
- The Hibernation API calls are Cloudflare's (developers.cloudflare.com/durable-objects/api/state and /best-practices/websockets): `ctx.acceptWebSocket(ws, tags)` (at most 10 tags of 256 characters), `ctx.getWebSockets(tag?)`, `ctx.getTags(ws)`, `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))` (answered without waking the object), `ws.serializeAttachment(value)` and `ws.deserializeAttachment()` (at most 16,384 bytes, kept through hibernation), and `new Response(null, { status: 101, webSocket: client })` from the object's `fetch`. With a compatibility date from 2026-04-07 on, the runtime answers a Close frame itself, so `webSocketClose` need not call `close`.
- Rules:
  - The route `{ method: 'GET', path: '/v1/sync/live', access: 'bound_session', live: true }`, with no gate, is in `VAULT_V1_ROUTES` and in `VAULT_ADDED_ROUTES`.
  - **The branch in `handleVaultV1` sits immediately before the vault call,** after every check that comes before one: route, body, gates, client version, token, and 1C-T10a's `accountGate` (whichever of 1D-T10 and 1C-T10a lands second keeps this order; 1B-T3's Worker-route dispatch stays where 1B put it). An erased or deleting account therefore never reaches `UserVault#fetch`, whose `ensureAccount` would re-create `account_state` (C17). The `!route.vault` guard lets a `live` route through. A `live` route requires `upgrade: websocket` (compared case-insensitively), else 400 `VALIDATION_FAILED` (never 426, which the app reads as "update the app"). It then returns `stub.fetch(new Request('https://vault.internal/live', { headers: { upgrade: 'websocket', 'x-vault-claims': JSON.stringify(claims) } }))` unchanged. The token never reaches the vault, and only the Worker can build this request: the object has no public route.
  - **`UserVault#fetch`** answers 404 to anything else. An erased vault answers 403 `ACCOUNT_UNAVAILABLE` before it touches a table, as 1B-T3's `call()` does. `parseLiveClaims` requires `accountId` and `sessionId` to be UUIDs, `issuedAt` an integer, `clientId` a non-empty string and `authTime` an integer when present; otherwise 400. Then, inside one `transactionSync` as `call()` runs them: the `VaultContext` (policies `null`), `ensureAccount`, the `principal` charge, `assertSession` and the `read` charge, on the same `RateBuckets`. A refusal answers `toProblemReply`'s problem as JSON with its status and never upgrades. Then `acceptLive`.
  - **`acceptLive`** closes this session's earlier sockets with 4409 (`getWebSockets(sessionId)`), accepts the new one with tags `[sessionId]` and its attachment, then, while more than `MAX_LIVE_SOCKETS` sockets are open (`readyState === WebSocket.OPEN`; a closing socket does not count), closes the oldest by `openedAt` with 4409.
  - The constructor sets the `ping`/`pong` auto-response. `webSocketMessage` closes with 1008 whatever reaches it (a `ping` never does). `webSocketClose` and `webSocketError` do nothing.
  - **Around `call()`** (and 1D-T11's `callWithAnalytics`), in this order: refuse an erased vault (1B-T3); read `before = currentRevision(sql)` outside the transaction; run the transaction and its `catch` unchanged; then, whatever the outcome, `afterCall(before, claims.sessionId)`: read `after`, and when `BigInt(after) > BigInt(before)` (only a committed transaction moves it) call `pokeOthers(ctx, after, claims.sessionId)`; then `closeEndedSessions(ctx, sql, false)`. `afterCall` never throws: a failure is logged as `live_after_call_failed` with `failureName`, and the reply goes back unchanged. So a refused call (a raised `not_before`, a revoked session, an account being deleted) still closes the sockets it ended.
  - `alarm()` does the same around its work, with `exceptSession` `null`, so a retention purge pokes every phone.
  - **`closeEndedSessions(state, sql, erased)`:** with `erased`, every socket closes with 4401 and no table is read. Otherwise it reads `account_state`'s `status` and `not_before` (a missing row counts as not active). When the account is not `active`, every socket closes with 4401. Otherwise a socket closes with 4401 when its attachment's `issuedAt` is before `not_before` or its session is in `revoked_sessions`. The revoked check is one query that binds the open sockets' session ids as one JSON parameter: `SELECT session_id FROM revoked_sessions WHERE session_id IN (SELECT value FROM json_each(?))` with `JSON.stringify(ids)` (R57).
  - A send or close that throws (a socket already closing) is skipped, and the loop goes on.
  - A socket may outlive its token: it carries no data, and it closes only when its session ends, its session opens another, or the phone closes it (L1).
  - `cloudflare-workers.d.ts` gains only: on `DurableObjectStateLike`, `acceptWebSocket`, `getWebSockets`, `getTags` and `setWebSocketAutoResponse`; the globals `WebSocketPair` and `WebSocketRequestResponsePair`; on `WebSocket`, `accept`, `readyState`, `serializeAttachment` and `deserializeAttachment`; `webSocket` on `ResponseInit` and `Response`.
  - **The route coverage test** accepts the added routes. Each `VAULT_ADDED_ROUTES` key is served, absent from the PostgreSQL route table, and never shadowed by a legacy route (`matchRoute` over the legacy table finds none of them). `listed.filter((key) => !legacy.has(key))` equals the added keys instead of `[]`. The access, gates and status loop, and the list of ported routes, skip them. A `live` route has neither `vault` nor `worker`, so 1B-T3's "exactly one of" rule gains this exception beside `GET /v1/policies`. After 1B-T13 these checks move into `test/route-coverage.test.ts`, beside `VAULT_EDGE_ONLY_ROUTES`.

- [ ] **Step 1: Write the failing tests** in `test/workers/live.test.ts` with `openLive`. It signs the token as `client.as(user)` does, sends `upgrade: websocket` and `x-gogospend-client`, calls `accept()` on the returned socket and records its messages (Cloudflare's pattern, developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects). A second session of the same person is `{ ...user, sid: crypto.randomUUID() }`, as 1A's logout test makes one.
  - `the other phone hears the new revision, and the saving phone hears nothing`: sessions A and B, both open; A creates a wallet; B's next message is exactly `{"revision":"<the ack's committed_revision>"}`; A has received nothing 200 ms later.
  - `a poke reaches a phone whose socket hibernated`: B open, `evictDurableObject(vaultOf(user), { webSockets: 'hibernate' })` (in 1.4.7's types), then A writes and B gets the poke.
  - `sockets never carry record data`: across a create, an update and a delete, every message B receives matches `/^\{"revision":"(0|[1-9][0-9]*)"\}$/`.
  - `ping is answered, even after the vault sleeps`: `ping` gives `pong` before and after the eviction.
  - `signing out closes that phone's socket with 4401 and leaves the other open`: B posts `/v1/me/logout`; B's socket closes with 4401; A still gets `pong`.
  - `a refused call still closes the sockets it ended`: raise `account_state.not_before` through `runInDurableObject`; A's next call is refused with 401 `SESSION_REQUIRED`, and A and B both close with 4401. A second case sets `status = 'deleting'`: the call is 403 and both close.
  - `an ended session cannot open a socket`: after logout, `openLive` answers 401 `SESSION_REQUIRED` and no socket.
  - `an erased vault cannot open a socket, and nothing is re-created`: after `vaultOf(user).erase()` (1B-T2), `openLive` answers 403 `ACCOUNT_UNAVAILABLE` with no socket.
  - `without a token it is 401, an outdated client 426, and a plain GET 400`
  - `a session's second socket replaces its first`: the first closes with 4409.
  - `only open sockets count toward 20`: twenty sessions open; one phone closes its socket; two more sessions open: exactly one socket closes with 4409, the oldest still-open one.
  - `a retention purge pokes every phone`: with the vault clock moved past 30 days, `runDurableObjectAlarm` gives A and B the purge's revision.
  - `a message other than ping closes the socket with 1008`
  - In the coverage test: `an added route is served, is not in the legacy table, and shadows no legacy route`, and `a live route has neither a vault call nor a Worker handler`.
- [ ] **Step 2: Run them and see them fail** (the route is 404). Run: `npm run test:edge:workers -- test/workers/live.test.ts` and `npm run test:edge -- test/vault-route-coverage.test.ts`. Record the counts.
- [ ] **Step 3: Implement** `live.ts`, the vault methods, the order around `call()` and `alarm()`, the Worker branch and the coverage rules, as above. Until 1B-T13 lands, `/v1/*` reaches `handleVaultV1` through `src/roles/vault.ts`; 1D-T12 adds the HTTP Worker's entry.
- [ ] **Step 4: Run them and see them pass.** Then the whole Workers suite: 1A's and 1B's tests pass unchanged.
- [ ] **Step 5: Mutation check.** Poke the sender too: the first test fails. Close ended sessions inside the `try`, so only a successful call closes them: the refused-call test fails. Put the snapshot in the poke: the no-record-data test fails. Accept before `assertSession`: the ended-session test fails. Check `erased` after `ensureAccount`: the erased test fails (500, the tables are gone). Count closing sockets toward the limit: the limit test fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `Poke a person's other phones from their UserVault over hibernating WebSockets after each commit, and close ended sessions after every call`.

---

### Task 11: Server events and the analytics id

**Starts after:** 1D-T3, 1D-T10, 1B-T3

**Files:**
- Create: `apps/edge/src/vault/analytics.ts`
- Modify: `apps/edge/src/vault/user-vault.ts` (`callWithAnalytics`), `src/vault/routes.ts` (`me.analytics`), `src/v1/protocol.ts` (`VaultRouteId` gains `'me.analytics'`; `VaultAnalytics`), `src/v1/routes.ts` (the route; `VAULT_ADDED_ROUTES` gains it), `src/v1/handler.ts` (the `analytics` dep, the analytics id, the emission), `src/v1/env.ts` (the four secrets), `test/workers/support/v1-client.ts` (`startV1`'s options gain `analytics`), `test/vault-route-coverage.test.ts` (after 1B-T13, `test/route-coverage.test.ts`), `apps/edge/README.md` (the four secrets, and that `ANALYTICS_ID_KEY` never rotates)
- Test: `apps/edge/test/workers/server-events.test.ts`

**Interfaces:**
- Consumes: `analyticsIdFor`, `createServerAnalytics`, `ServerAnalytics`, `ServerEvent`, `ServerAnalyticsEnv` (1D-T3); `currentRevision` and `afterCall` (1D-T10); `categoryById` (1A-T4), the `entity_changes` rows (1A-T3), `account_state.created_at` and the `consents` row (1A-T2); `deps.waitUntil` and `startV1`'s options object (1B-T3).
- Produces:
  ```ts
  // src/v1/protocol.ts
  export type VaultAnalytics = { consent: 'yes' | 'no' | 'unasked'; events: ServerEvent[]; failure: string | null }
  // UserVault
  callWithAnalytics(call: VaultCall): { reply: VaultReply; analytics: VaultAnalytics }   // call(x) returns callWithAnalytics(x).reply
  // src/vault/analytics.ts
  export function analyticsConsent(c: VaultContext): 'yes' | 'no' | 'unasked'   // the ('analytics', 0) consents row: granted 1, granted 0, or no row
  export function committedEvents(c: VaultContext, route: VaultRouteId, before: string, after: string): ServerEvent[]
  export function weeksSinceSignup(c: VaultContext): number                     // whole weeks since account_state.created_at, at most 1040
  // src/v1/handler.ts
  V1Deps gains analytics?: (env: V1Env) => ServerAnalytics | null   // default: createServerAnalytics(env, deps.waitUntil ?? waitUntil)
  // src/v1/env.ts: V1Env gains POSTHOG_PROJECT_TOKEN?, ANALYTICS_ID_KEY?, POSTHOG_PERSONAL_API_KEY?, POSTHOG_PROJECT_ID? (secrets, wrangler secret put)
  // test/workers/support/v1-client.ts
  startV1(config?, options?: { env?: Partial<V1Env>; fetchCatalogue?: typeof fetch; analytics?: V1Deps['analytics'] })
  ```
- Rules:
  - **The route** `{ method: 'GET', path: '/v1/me/analytics', access: 'bound_session', vault: 'me.analytics' }` joins `VAULT_ADDED_ROUTES`. The vault handler answers `200 { weeks_since_signup, consent }`. For this route only, the Worker adds `analytics_id`: `await analyticsIdFor(claims.accountId, env.ANALYTICS_ID_KEY)` when the key is set, else `null` (the app then stays anonymous, and 1D-T3's deletion has nothing to delete). The answer is `{ analytics_id, weeks_since_signup, consent }`; `/v1/me` keeps its v1 shape (C2).
  - **`callWithAnalytics`** runs `call()`'s steps in 1D-T10's order and returns, beside the reply, what it read after the transaction (a refusal commits nothing, so those reads see the state before): `consent` (`'unasked'` whenever the account could not be read), `events` from `committedEvents(c, call.route, before, after)`, and `failure`, the `failureName` that `toProblemReply` logs for a 500 `INTERNAL_ERROR` reply, else `null`. 1A's tests that call `call()` see no change.
  - **`committedEvents`** answers nothing unless the route is `transactions.create` (imports and other writers never count, decided, Q16). For that route it reads `SELECT snapshot FROM entity_changes WHERE entity = 'transaction' AND version = 1 AND state = 'active' AND revision > CAST(?1 AS INTEGER) AND revision <= CAST(?2 AS INTEGER)`: a revision range with two parameters, never an id list (R57). Each row gives one `record_saved` `{ kind, category_key }`, with `kind` from the snapshot's `type` and `category_key` from `categoryById(c, id)?.builtin_key ?? 'custom'` (one id per call); a transfer sends `{ kind: 'transfer' }` with no category. A resent command commits nothing, so it sends nothing.
  - **`handleVaultV1`** calls `callWithAnalytics` instead of `call` and never puts `analytics` or `failure` into the response. Then, with `const analytics = (deps.analytics ?? defaultAnalytics)(env)` non-null:
    - When `consent` is `'yes'`, `request.headers.get('x-gogospend-analytics') !== 'off'` and `ANALYTICS_ID_KEY` is set, it captures each event under the analytics id, plus `resync_required` `{ reason_code: 'RESYNC_REQUIRED' }` for a 410 `RESYNC_REQUIRED` reply and `sync_failed` `{ reason_code: 'INTERNAL_ERROR' }` for a 500 `INTERNAL_ERROR` reply on `transactions.create` or `sync.changes`. Server events carry `origin: 'server'`, so dashboards tell them from the app's events of the same name.
    - `captureFailure(failure ?? 'Error', route.vault)` runs only for a 500 `INTERNAL_ERROR` reply, whatever the consent (an anonymous class-name count). In the outer `catch`, an error that is not a `ProblemException` runs `captureFailure(failureName(error), 'worker')`. A deliberate refusal (a paused gate's 503, 401, 403, 426, 429) is never counted.
  - **No Workers test reaches PostHog.** No analytics secret is set in `vitest.workers.config.ts`. Each test that needs them passes them per test: `startV1(config, { env: { POSTHOG_PROJECT_TOKEN: 'phc_test', ANALYTICS_ID_KEY: 'test-analytics-key' }, analytics: (env) => createServerAnalytics(env, (p) => pending.push(p), () => fakePort) })`, where `fakePort` records each `captureImmediate` message. Without a token the default dep builds no client. This also keeps `ANALYTICS_ID_KEY` unset for 1C's deletion tests, whose step 6 then answers `nothing_to_delete` without a request (1D-T13).

- [ ] **Step 1: Write the failing tests** in `test/workers/server-events.test.ts`:
  - `the analytics id is the HMAC of the caller's id, with the weeks and the consent`: `GET /v1/me/analytics` answers `analytics_id` equal to an HMAC-SHA256 computed in the test with `crypto.subtle` under `'test-analytics-key'`, `weeks_since_signup: 0` and `consent: 'unasked'` for a new person; after `PUT /v1/me/privacy-preferences` with `{ analytics: true }` it is `'yes'`, and after `false` it is `'no'`; no body contains `user.sub`.
  - `without the key the analytics id is null`, and `an ended session cannot read it` (401 `SESSION_REQUIRED`).
  - `a record saved by a person who said yes sends one record_saved with kind and category only`: consent yes, then `createLunch`: exactly one message `{ distinctId: <hmac>, event: 'record_saved', properties: { kind: 'expense', category_key: 'food', origin: 'server' } }`.
  - `a resent command sends no second event`
  - `nothing is sent for a person who said no, or while their phone says off`: consent no; then consent yes with `x-gogospend-analytics: off` on the create; no message either time.
  - `an edit, a delete or an import is not a record_saved`: an update and a delete send nothing; once 1B-T10 has merged, an import confirmation of three rows sends nothing too.
  - `a stale cursor sends resync_required`: with `sync_state.pruned_through` raised through `runInDurableObject`, `GET /v1/sync/changes` with an old cursor answers 410, and one `resync_required` is sent.
  - `a deliberate refusal is never an error count`: with a gate the route uses paused through the test config (503 `SERVICE_UNAVAILABLE`, as 1A's gate tests pause one), and with a missing token (401), no `$exception` is sent.
  - `an unexpected failure sends its class name only, without the person`: with `VAULT_HANDLERS['wallets.list']` made to throw `new RangeError('ร้านป้าแดง ฿1,234')` (`vi.spyOn`, restored after), `GET /v1/wallets` answers 500 `INTERNAL_ERROR` and sends one `$exception` whose type and value are `RangeError`, with `route: 'wallets.list'`, `$process_person_profile: false` and a distinct id that is not the HMAC; the message's JSON contains neither `ร้านป้าแดง` nor `1,234`.
  - `the reply sent to the phone never carries analytics fields`: no `analytics` or `failure` key in any response body.
  - In the coverage test: `GET /v1/me/analytics` is an added route with a vault handler.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/server-events.test.ts` and `npm run test:edge -- test/vault-route-coverage.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the vault side, the route and the Worker's emission as the rules say. Add the four secret names to `apps/edge/README.md`, with the never-rotate note beside `ANALYTICS_ID_KEY`.
- [ ] **Step 4: Run them and see them pass**, then the whole Workers suite.
- [ ] **Step 5: Mutation check.** Ignore the header: the off test fails. Count edits as `record_saved`: the edit test fails. Pass the error message as the value: the failure test fails. Count every 5xx as a failure: the refusal test fails. Answer 503 without the key: the null-id test fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `Send server events from the change log for people who said yes, anonymous error class names for real failures, and the HMAC analytics id`.

---

### Task 12: The live socket in the real stack: one `serveV1`, the HTTP Worker's entry, and 1C's revocations

**Starts after:** 1D-T10, 1C-T10a, 1C-T10b, 1C-T11 (1B-T13 comes with 1C-T10b)

**Files:**
- Create: `apps/edge/src/v1/serve.ts`, `apps/edge/scripts/local-auth.mjs`, `apps/edge/scripts/live-proof.mjs`
- Modify: `apps/edge/src/server.ts` (the live path before TanStack Start), `src/routes/v1/$.ts` (calls `serveV1`), `src/vault-worker.ts` (its `fetch` calls `serveV1`), `src/vault/user-vault.ts` (closing sockets at the end of 1C's `revokeSessions`, `signOutEverywhere` and `markDeleting`, and of 1B's `erase`), `apps/edge/package.json` (`"proof:live": "node scripts/live-proof.mjs"`), `apps/edge/README.md` (the live route and `proof:live`)
- Test: `apps/edge/test/workers/live-revocation.test.ts`

**Interfaces:**
- Consumes: `handleVaultV1` and its deps (1A-T2, 1B-T3, 1D-T11); `verifierFor`, which 1C-T10a moves out of `handler.ts` into `src/v1/auth-verifier.ts`, and which `serve.ts` imports from there (it builds the verifier that reads Better Auth's keys in process whenever `AUTH_DB` is bound, 1C's K7 and R50); `accountGate` (1C-T10a) as wired into the HTTP Worker (1C-T10b); the vault RPCs `revokeSessions` and `signOutEverywhere` (1C-T10a) and `markDeleting(accountId)` (1C-T11); `erase()` (1B-T2); `closeEndedSessions`, `openLive` (1D-T10); `testAuth()`, `subjectHash` and the `erasure_registry` seeding of 1C-T10a's tests; `startDevWorker` (`apps/edge/test/support/wrangler-dev.ts`); `build:local` and the local code log (1C-T2); the sign-out-everywhere route (1C-T4).
- Produces:
  ```ts
  // src/v1/serve.ts: the one place that holds handleVaultV1's deps, for every /v1 entry
  export function isLivePath(pathname: string): boolean   // exactly '/v1/sync/live'
  export function serveV1(request: Request, env: V1Env, ctx?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response>
  // handleVaultV1(request, env, { verifier: { verify: (authorization, clientId) => verifierFor(env).verify(authorization, clientId) }, ...(ctx ? { waitUntil: (p) => ctx.waitUntil(p) } : {}) })
  // verifierFor (1C-T10a) runs inside verify, so a public route never builds a verifier and a settings error is still handleVaultV1's 503
  ```
- Rules:
  - **Before Step 1,** re-check the signatures of `revokeSessions` and `signOutEverywhere` as 1C-T10a merged them (R44 moved the revocation's expiry onto `REVOCATION_KEEP_SECONDS`, so the expiry may no longer be a parameter), and call them as merged.
  - `src/server.ts`'s default `fetch` checks, in order: `isPostHogProxyPath` (1D-T2), then `isLivePath` → `serveV1(request, env, ctx)`, and otherwise `handler.fetch` with the same arguments. TanStack Start never sees the 101 response.
  - `src/routes/v1/$.ts` calls `serveV1(request, env as unknown as V1Env)` for every method (no `ctx`; `waitUntil` then comes from `cloudflare:workers`, 1B-T3's default). `src/vault-worker.ts`'s `fetch`, which the Workers tests load as `main`, calls `serveV1(request, env, ctx)` for `/v1/*`. No entry calls `handleVaultV1` itself, so a dep added later reaches every entry at once.
  - Each vault method that ends sessions outside `call()` closes their sockets after its transaction commits: `revokeSessions`, `signOutEverywhere` and `markDeleting` call `closeEndedSessions(this.ctx, this.ctx.storage.sql, false)`, and `erase()` calls `closeEndedSessions(this.ctx, this.ctx.storage.sql, true)` after erasing.
  - **`local-auth.mjs`** signs in on a local Worker by email code, with the headers 1C-T2's tests send to Better Auth: `POST /api/auth/email-otp/send-verification-otp` with `{ email, type: 'sign-in' }`; the code read from the line `{"event":"jotbun-local-sign-in-code",…}` for that address in `worker.logs()` (1C-T2's local code log); `POST /api/auth/sign-in/email-otp` with `{ email, otp }`, keeping the session cookie it sets; then `GET /api/auth/token` with that cookie for the JWT (Better Auth docs: plugins/email-otp and plugins/jwt). It does not wait for 1C-T12, whose `auth-proof.mjs` may import it.
  - **`live-proof.mjs`** (`npm run proof:live --prefix apps/edge`) proves the built HTTP Worker. In order: `npm run build:local` (1C-T2); `npx wrangler d1 migrations apply jotbun-auth --local --persist-to <tmp> -c wrangler.jsonc` and the same for `jotbun-erasure` (`AUTH_DB`, and `ERASURE_DB` under R56); `npx wrangler kv key put config:v1 '<json>' --binding CONFIG --local --persist-to <tmp> -c dist/server/wrangler.json` with `{ "policies": <1A's TEST_POLICIES> }` copied (Node cannot load `v1-client.ts`); without it the wallet write answers 503; `startDevWorker({ config: 'dist/server/wrangler.json', persistTo: <tmp>, vars: { JOTBUN_ENV: 'local', BETTER_AUTH_SECRET: <random>, ERASURE_KEY: <random>, COMMAND_DIGEST_KEY: <random, at least 32 characters>, MIN_CLIENT_VERSION_IOS: '1.0.0', MIN_CLIENT_VERSION_ANDROID: '1.0.0' } })` (each random value 64 hex characters from `crypto.randomBytes(32)`); two sign-ins of one person through `local-auth.mjs`, A and B; A accepts terms v1 as 1A's `member()` does (`POST /v1/me/policy-acceptances` with `{ kind: 'terms', version: 1 }`: 204); B opens `ws://127.0.0.1:<port>/v1/sync/live` with Node 24's global `WebSocket` and the undici extension `new WebSocket(url, { headers })` (undici docs, api/WebSocket; if the global ignores `headers`, stop and report); `ping` gives `pong`; A creates a wallet with the request 1A's wallet tests send, and B receives `{"revision":"<the ack's committed_revision>"}` within 5 seconds; a third, fresh sign-in signs out everywhere (`POST /api/auth/jotbun/sign-out-everywhere` with its cookie, 1C-T4's route), and B's socket closes with 4401. It prints `PASS` and exits 0, or names the failing step and exits 1, and always stops the Worker and runs `npm run build` to restore the production `dist/`.

- [ ] **Step 1: Write the failing tests** in `test/workers/live-revocation.test.ts`, one per path, with sockets opened by `openLive`:
  - `signing out one device closes only that device's socket`: `vaultOf(user).revokeSessions(...)` for `B.sid`, called as 1C-T10a merged it: B closes with 4401; A still gets `pong`.
  - `signing out everywhere closes every socket`: `signOutEverywhere(...)` for the account, called as merged: A and B close with 4401.
  - `an account being deleted closes every socket`: `markDeleting(user.sub)`: both close with 4401.
  - `erasing the vault closes every socket`: `erase()`: both close with 4401.
  - `an erased person's still-valid token cannot open a socket, and the vault stays empty` (C17, through 1C-T10a's gate): with `ERASURE_DB`'s `erasure_registry` holding `subjectHash(ERASURE_KEY, userId)` and a future `expires_at` (seeded as 1C-T10a's tests seed it), `openLive` answers 403 `ACCOUNT_UNAVAILABLE`, and the vault's `account_state` count is 0.
  - `an account being deleted cannot open a socket`: `account_status` `deleting`: 403 `ACCOUNT_UNAVAILABLE`.
  - `the Worker's own fetch serves the socket with Better Auth's keys`: sign in through `testAuth()`; `SELF.fetch` of `/v1/sync/live` with that token, `upgrade: websocket` and `x-gogospend-client` answers 101 with a `webSocket`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/live-revocation.test.ts`. A path that already passes is recorded with its reason (for example, a method that happens to reach `call()`). Record the counts.
- [ ] **Step 3: Implement** `serve.ts`, the three entries and the closing at the end of the four vault methods.
- [ ] **Step 4: Run them and see them pass**, then the whole Workers suite and `npm run build:edge`.
- [ ] **Step 5: Write and run the live proof.** Run `npm run proof:live --prefix apps/edge` against a tree without the `server.ts` live path first and see it stop at the socket's open; then with it. Expected: `PASS`. Record both runs.
- [ ] **Step 6: Mutation check.** Drop the closing from `revokeSessions`: the one-device test fails. Drop it from `erase()`: the erase test fails. Remove the `server.ts` live path: the proof fails. Drop A's terms acceptance: the proof stops at the wallet step with 403 `POLICY_ACCEPTANCE_REQUIRED`.
- [ ] **Step 7: Gate, receipt, commit.** Commit: `Serve every /v1 entry through one serveV1, keep the live socket away from TanStack Start, and close sockets on 1C's revocations and on erase`.

---

### Task 13: Account deletion deletes the PostHog person (1C's step 6), retried daily after the sweep

**Starts after:** 1D-T3, 1C-T11

**Files:**
- Modify: `apps/edge/src/analytics/server-analytics.ts` (exports `deletePostHogPersonById`, the request part of 1D-T3's `deletePostHogPerson`, which then calls it; 1D-T3's tests stay unchanged and green), `apps/edge/src/deletion/hooks.ts` (1C's no-op hook replaced), `apps/edge/src/deletion/workflow.ts` (`DeletionEnv` gains the four secrets; step 6 becomes `analytics-id` and `delete-analytics-person`; the retry loop after `final-sweep`)
- Test: `apps/edge/test/server-analytics.test.ts` (one case), `apps/edge/test/workers/deletion.test.ts` (1C's file: new cases, and any case that lists `DELETION_STEPS` updated in the same commit)

**Interfaces:**
- Consumes: `analyticsIdFor`, `deletePostHogPerson`, `AnalyticsDeletionFailed`, `PersonDeletion`, `createServerAnalytics`, `PostHogPort`, `ServerAnalyticsEnv` (1D-T3); `DeletionWorkflow`, `DeletionEnv`, `DELETION_STEPS`, `STEP_CONFIG`, the reader 1C-T11's steps use to get the user id from `deletion_requests` by request id, and the deletion test helpers (1C-T11).
- Produces:
  ```ts
  // src/analytics/server-analytics.ts (1D-T3's module)
  export function deletePostHogPersonById(env: ServerAnalyticsEnv, analyticsId: string, fetchImpl?: typeof fetch): Promise<'queued'>
  // the bulk_delete request of 1D-T3 for an id already computed; throws AnalyticsDeletionFailed, also when POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID is unset
  // src/deletion/hooks.ts (1C declared a no-op deleteAnalyticsPerson(userId); 1D replaces it)
  export type DeletionHooks = {
    /** Inside step 'analytics-id': reads the user id from deletion_requests by request id; null without ANALYTICS_ID_KEY or for an unknown request. */
    analyticsIdOf(env: DeletionEnv, requestId: string): Promise<string | null>
    /** Inside 'delete-analytics-person' and each retry: takes only the analytics id; null deletes nothing. */
    deleteAnalyticsPerson(env: ServerAnalyticsEnv, analyticsId: string | null, deps?: { fetch?: typeof fetch; port?: (token: string) => PostHogPort }): Promise<PersonDeletion>
  }
  export const deletionHooks: DeletionHooks
  // src/deletion/workflow.ts
  export type DeletionEnv = /* 1C-T11's bindings */ & ServerAnalyticsEnv
  export const DELETION_STEPS = ['mark-account-deleting', 'mark-vault-deleting', 'purge-objects', 'erase-vault', 'delete-sign-in-records', 'analytics-id', 'delete-analytics-person', 'send-deletion-email', 'final-sweep'] as const
  export const ANALYTICS_STEP_CONFIG = { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '1 minute' } as const
  export const ANALYTICS_RETRY_DAYS = 7
  ```
- Rules:
  - **`analytics-id`** is `step.do('analytics-id', STEP_CONFIG, () => deletionHooks.analyticsIdOf(this.env, requestId))`. Inside the step, the user id is read from `deletion_requests` by the request id, never from Workflow state (1C's K17), and the step answers `analyticsIdFor(userId, ANALYTICS_ID_KEY)`, or `null` without the key (then no analytics id was ever sent, 1D-T3). The analytics id is an HMAC, never the user id. It is the only value tied to the person that the Workflow keeps in its state, so the retries can still run after the final sweep has made `deletion_requests` forget the user id.
  - **`delete-analytics-person`** is `step.do('delete-analytics-person', ANALYTICS_STEP_CONFIG, () => deletionHooks.deleteAnalyticsPerson(this.env, analyticsId))` inside `try`/`catch`. Cloudflare documents that catching a step's error lets the Workflow continue (developers.cloudflare.com/workflows/build/sleeping-and-retrying, "Catch Workflow errors"). Five retries from 30 seconds take about 15 minutes. A caught failure logs `{ event: 'analytics_person_deletion_failed', request_id }` (the deletion request id only, never the user id or the analytics id), and steps 7 and 8 run whatever PostHog does (decided, Q15).
  - **`deleteAnalyticsPerson(env, analyticsId, deps)`:** with `null` it answers `nothing_to_delete` without a request. Otherwise it awaits `deletePostHogPersonById(env, analyticsId, deps?.fetch)` and lets `AnalyticsDeletionFailed` propagate, so the step retries. After a delete, or with nothing to delete, it sends the anonymous count: when `createServerAnalytics(env, (p) => sends.push(p), deps?.port)` is not null, `captureAnonymous('account_deleted')` and `await Promise.allSettled(sends)` (decided, Q11: a random distinct id and `$process_person_profile: false`, so the count can never recreate or join the deleted person). The step body, not the hook, then logs `analytics_person_deletion_queued` or `analytics_person_deletion_skipped` with the `request_id`; no log line carries an id of the person.
  - **After `final-sweep`,** only when `delete-analytics-person` failed: for `n` from 1 to `ANALYTICS_RETRY_DAYS`, `step.sleep(\`analytics-retry-wait-${n}\`, '1 day')` and then `step.do(\`retry-analytics-person-${n}\`, ANALYTICS_STEP_CONFIG, () => deletionHooks.deleteAnalyticsPerson(this.env, analyticsId))` inside `try`/`catch`. The loop ends at the first success. Each failure logs `analytics_person_deletion_failed` with the `request_id`; after the last one, `analytics_person_deletion_abandoned` with the `request_id`, which the owner's alert watches. The receipt (`completed`) does not wait for these retries.
  - **With 1C-T13:** 1C-T13 adds `'revoke-apple-token'` between `'erase-vault'` and `'delete-sign-in-records'`, and whichever of the two tasks lands second keeps both entries. Once both have landed, `DELETION_STEPS` is `['mark-account-deleting', 'mark-vault-deleting', 'purge-objects', 'erase-vault', 'revoke-apple-token', 'delete-sign-in-records', 'analytics-id', 'delete-analytics-person', 'send-deletion-email', 'final-sweep']`. The `retry-analytics-person-<n>` steps are named at run time after `final-sweep` and are never entries.

- [ ] **Step 1: Write the failing tests.**
  - In `test/server-analytics.test.ts`: `deleting by analytics id sends the same request`: `deletePostHogPersonById(env, 'a'.repeat(64), recorder)` sends the `bulk_delete` of 1D-T3's test with `distinct_ids: ['a'.repeat(64)]`, and rejects with `AnalyticsDeletionFailed` without a request when the personal key is unset.
  - In `test/workers/deletion.test.ts`:
    - `the hook deletes the PostHog person by its analytics id and counts the deletion anonymously`: `deletionHooks.deleteAnalyticsPerson({ POSTHOG_PERSONAL_API_KEY: 'phx_test', POSTHOG_PROJECT_ID: '12345', POSTHOG_PROJECT_TOKEN: 'phc_test' }, 'a'.repeat(64), { fetch: recorder, port: () => fakePort })`, with the recorder answering 202 `{ "deletion_errors": [] }`, resolves `'queued'`; the recorder saw one `bulk_delete` with that id; `fakePort` saw one `account_deleted` with `$process_person_profile: false` under a distinct id that is not the analytics id.
    - `the hook fails on a refusal and on a misconfiguration, and counts nothing`: a 500 rejects with `AnalyticsDeletionFailed`; a missing personal key rejects without a request; `fakePort` saw nothing either time.
    - `the analytics id is computed from the deletion request, never from the Workflow's state`: after an accepted deletion request (sleeps left on, so the run waits before the sweep), `deletionHooks.analyticsIdOf({ ...env, ANALYTICS_ID_KEY: 'k' }, requestId)` equals the HMAC of the user id under `'k'` computed in the test with `crypto.subtle`; an unknown request id gives `null`.
    - `with no analytics key, step 6 completes without a request`: a deletion run (the suite sets no analytics secret, 1D-T11) gives `waitForStepResult({ name: 'delete-analytics-person' })` equal to `'nothing_to_delete'`, and the run completes.
    - `a run whose PostHog deletion keeps failing still finishes the deletion and retries after the sweep`: `mockStepResult({ name: 'analytics-id' }, 'a'.repeat(64))`, `mockStepError` on `delete-analytics-person` and on `retry-analytics-person-1` with no `times` (every attempt), `mockStepResult({ name: 'retry-analytics-person-2' }, 'queued')`, `disableRetryDelays()` and `disableSleeps()`. The instance reaches `complete`; the request row is `completed`; `console.log` (spied) holds exactly one `jotbun-local-deletion-email` line for this request's reference and `analytics_person_deletion_failed` lines carrying the request id, and never the user id or the analytics id; `waitForStepResult({ name: 'retry-analytics-person-1' })` rejects and `retry-analytics-person-2` gives `'queued'`; and `waitForStepResult({ name: 'retry-analytics-person-3' })` raced against 500 ms gives nothing (the loop stopped at the first success).
    - `a step 6 that succeeds is not retried after the sweep`: a run without the key completes, and `waitForStepResult({ name: 'retry-analytics-person-1' })` raced against 500 ms gives nothing.
  These use the helpers 1C's suite uses (`introspectWorkflowInstance`, `modify`, `mockStepError`, `mockStepResult`, `disableRetryDelays`, `disableSleeps`, `waitForStepResult`, `waitForStatus`; all in the installed `@cloudflare/vitest-plugin` 1.4.7 types).
- [ ] **Step 2: Run them and see them fail** against 1C's no-op hook. Run: `npm run test:edge -- test/server-analytics.test.ts` and `npm run test:edge:workers -- test/workers/deletion.test.ts`. Record the counts.
- [ ] **Step 3: Implement** `deletePostHogPersonById`, the hooks, the env type, the two steps, the retry loop and the step list.
- [ ] **Step 4: Run them and see them pass**, then 1C's deletion cases and the edge gate.
- [ ] **Step 5: Mutation check.** Return the user id instead of its HMAC from `analyticsIdOf`: the analytics-id test fails. Let `delete-analytics-person`'s failure end the Workflow (no `catch`): the keeps-failing test fails (the instance errors). Keep retrying after a success: the keeps-failing test fails at `retry-analytics-person-3`. Retry after a successful step 6: the not-retried test fails. Log the analytics id on a failure: the keeps-failing test fails.
- [ ] **Step 6: Hosted check, recorded SKIPPED:** the first real `bulk_delete` against PostHog EU waits for the project and its personal API key (Q5). PostHog's API reference lists `ids` beside `distinct_ids`; the first hosted run confirms that `distinct_ids` alone is accepted.
- [ ] **Step 7: Gate, receipt, commit.** Commit: `Delete the PostHog person in step 6 of account deletion by its analytics id, retry daily after the sweep, and count the deletion anonymously`.

---

### Task 14: The account events, from 1C's credential provider

**Starts after:** 1D-T1, 1C-T5

**Files:**
- Modify: `apps/app/src/auth/credentialProvider.ts` (1C-T5's)
- Test: `apps/app/src/auth/credentialProvider.test.ts` (1C-T5's)

**Interfaces:**
- Consumes: `trackSignedIn`, `trackSignedUp`, `trackSignedOut` and `recordAnalytics` (1D-T1); `createCredentialProvider`, `SignInRequest`, `SignInResult` with `created`, `ServerSession.created`, `StoredSession` and `createFakeAuthServer` (1C-T5, from 1C's K23).
- Rules:
  - `signIn(request)` with an `active` result sends one event: `signed_up` with `request.method` when the result's `created` is true, otherwise `signed_in` with `request.method`. `created` comes from the server (1C's K23, carried as `ServerSession.created` and `SignInResult.created`), because Better Auth's own sign-in answers do not say whether they registered the account. A request's `signUp: true` never decides it: a returning Apple user may send it too. If the merged port does not expose `created` yet, every method sends `signed_in` until it does.
  - `signOut()` sends `signed_out` with `account()?.method` first, before anything else, so it is captured before `AnalyticsUpkeep` resets the identity on the session change (1D-T6). A sign-out from elsewhere (D37), a session that ends by itself and sign out everywhere send nothing in phase 1.
  - `passkey_created` is deferred: 1C records the app's passkey offer as SKIPPED, so phase 1 has nowhere that creates a passkey. The event stays in the allow-list for the phase that adds one.
  - These events are tracked before the analytics account is known; 1D-T1 holds them across the first sign-in and sends them only after yes.
  - The provider imports the emitters relatively (`../analytics/events.ts`), as Node's test runner cannot resolve the `@mobile/` alias.

- [ ] **Step 1: Write the failing tests** with `recordAnalytics({ consent: 'yes' })` and 1C's fake server:
  - `the first email-code sign-in records signed_up, a later one signed_in`: 1C's fake server answers `created: true` the first time an address signs in and `false` after (K23): `signed_up` `{ method: 'email' }`, then `signed_in` `{ method: 'email' }`.
  - `a returning Apple user signing in with signUp: true records signed_in`: with a fake native Apple sign-in whose subject has signed in before, `{ method: 'apple', signUp: true }` answers `created: false` and records `signed_in` `{ method: 'apple' }`; a sign-up that answers `account_exists` records nothing.
  - `an explicit sign-out records signed_out before identity is reset`: a provider subscriber that calls `analytics.setAccount(null)` on each notification (as `AnalyticsUpkeep` does) leaves `sent` with the `signed_out` capture before the `reset`.
  - `a sign-out from elsewhere records nothing`
  - `the email address never reaches analytics`: the JSON of `sent` does not contain the test's address.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/auth/credentialProvider.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the two calls in the provider.
- [ ] **Step 4: Run them and see them pass**, then the app gate.
- [ ] **Step 5: Mutation check.** Send `signed_out` after the port's sign-out: the order test fails. Send `signed_up` whenever `signUp` is true: the returning-Apple test fails. Ignore `created`: the first-sign-in test fails.
- [ ] **Step 6: Gate, receipt, commit.** Commit: `Send the sign-in and sign-out events from the Better Auth credential provider`.

---

### Task 15: The phase 1 proof on two phones

**Starts after:** 1D-T5, 1D-T9, 1D-T12, 1C-T9, 1C-T12

(1C-T9 routes the approved email-code screens and the terms step after the owner's E2; 1C-T12 brings the local stack and `auth-proof.mjs`. The proof does not need 1D-T6, T7, T8, T13 or T14: PostHog stays off. The LAN change is 1D-T5's.)

**Files:**
- Modify: `docs/implementation/beta-receipts.md` (the run-sheet rows), `docs/implementation/premium-progress.md` (the closing 1D receipt), `apps/app/README.md` (development builds against `wrangler dev` on the LAN)

- [ ] **Step 1: Run the server-side proofs.** `node scripts/auth-proof.mjs` from `apps/edge` (1C-T12) and `npm run proof:live --prefix apps/edge` (1D-T12). Expected: checks 1 to 7 PASS from the first, `PASS` from the second. They stand in for the server side while the phones are SKIPPED.
- [ ] **Step 2: Write the run-sheet** into `beta-receipts.md`, each row SKIPPED until it is done on devices:
  1. On the Mac, with the migrations and settings 1C-T12's `auth-proof.mjs` uses (copy them from it; these are their names at the time of writing): `npm run build:local --prefix apps/edge`; `npx wrangler d1 migrations apply jotbun-auth --local --persist-to .wrangler/proof -c apps/edge/wrangler.jsonc` and the same for `jotbun-erasure` (`ERASURE_DB`, R56); `npx wrangler kv key put config:v1 '<json>' --binding CONFIG --local --persist-to .wrangler/proof -c apps/edge/dist/server/wrangler.json`, the JSON being `{ "policies": … }` with 1A's `TEST_POLICIES` (`apps/edge/test/workers/support/v1-client.ts`: terms v1 required, privacy v1), since an absent `config:v1` leaves the policies unpublished and every write answers 503, and row 3's terms step needs a published version to accept; then `npx wrangler dev -c apps/edge/dist/server/wrangler.json --ip 0.0.0.0 --port 8092 --persist-to .wrangler/proof --var JOTBUN_ENV:local --var BETTER_AUTH_SECRET:<random> --var ERASURE_KEY:<random> --var COMMAND_DIGEST_KEY:<random> --var MIN_CLIENT_VERSION_IOS:1.0.0 --var MIN_CLIENT_VERSION_ANDROID:1.0.0` (each random value from `openssl rand -hex 32`, 64 characters, so `COMMAND_DIGEST_KEY` has the 32 characters it needs at least). Port 8092 matches 1C's `AUTH_BASE_URL`. If Better Auth refuses requests addressed to the LAN host, add `--var AUTH_BASE_URL:http://<the Mac's LAN IPv4>:8092` and the same for `AUTH_ISSUER`, and record it. `--ip`, `--port`, `--persist-to` and `--var` are wrangler's, as are `kv key put`'s `--binding` and `--local` (developers.cloudflare.com/workers/wrangler/commands; checked in the installed wrangler 4.152.0). No PostHog key: analytics stays off.
  2. Two phones with a development build (Q8), `EXPO_PUBLIC_V1_API_URL=http://<the Mac's LAN IPv4>:8092`, and `EXPO_PUBLIC_REDESIGN=conflict` while that area awaits E2. Check that the build allows cleartext to the LAN address (iOS: `NSAllowsLocalNetworking` in the built `Info.plist`; Android: cleartext allowed in the debug manifest). If it does not, stop and ask the owner before changing `app.json`.
  3. Sign in on phone A, then on phone B, to the same account with email codes read from the `wrangler dev` log (two sessions). A, the account's first sign-in, shows 1C's terms step (1C's K24) for terms v1: tick the box and continue; B, signed in after that, shows no terms step.
  4. **Offline save:** History open on B. A in airplane mode; on A, Quick add ฿45 "ค่ากาแฟ": A shows it kept on the phone (`rh-offline`). Turn A's network back on at T0; note T1, when B's History shows the record. Pass: T1 − T0 is at most 20 seconds (A's socket reconnects within 15 seconds, then one flush and one poke). Three runs; record each time.
  5. **Conflict:** open the same record's edit screen on both phones. A changes the amount to ฿50 and saves. B changes it to ฿55 and saves: B shows the choice with "ของคุณ" ฿55 and "ในเซิร์ฟเวอร์" ฿50. B taps "ตัดสินใจทีหลัง": B's History shows the waiting mark; B reopens the record and the choice is still there. B chooses "ใช้ของคุณ": A's History shows ฿55 within seconds.
  6. **Sign-out:** on A, sign out everywhere from Account (a fresh sign-in by email code first). B's socket closes; B's next request shows it signed out, with any unsent record kept (D37).
  7. Screenshots of each phone at each step, in the receipt.
- [ ] **Step 3: Run what can run locally.** If development builds exist for two simulators (or a simulator and an Android emulator), run rows 3 to 6 against `wrangler dev` (the iOS Simulator reaches `http://127.0.0.1:8092`; the Android emulator reaches the host as `http://10.0.2.2:8092`, inside 10/8, which 1D-T5's rule accepts) and record the timings, marked as simulators. Real phones stay SKIPPED until the owner provides the builds (decided, Q8).
- [ ] **Step 4: The closing 1D receipt** in `premium-progress.md`: what each task proved, the mutants, the timings, every SKIPPED item with what it waits for (devices, native PostHog checks, the hosted `bulk_delete`, symbol upload), and each owner question with its default and status.
- [ ] **Step 5: Commit, then the independent review of the whole 1D range** (handover §4 step 8), fixing findings test-first. Commit: `Record the phase 1 proof: the server-side proofs, the two-phone run-sheet and the 1D receipts`.

**What the proof needs from the owner (Q8):**
- Development builds of the app on two phones: the Expo/EAS project (owed), and for iPhones the Apple Developer team (ready) with both devices registered; an Android phone needs only USB debugging. The final bundle id and package name are not needed for development builds.
- The two phones on the same Wi-Fi as the Mac, and the Mac's firewall open on port 8092.
- E2 approval of 1C's email-code screens and terms step (1C-T9) and, to see the choice screen as designed, of 1D-T9's drafts (the proof can run them behind the `conflict` area before approval).
- Not needed for this proof: FCM and APNs (pokes are WebSockets, not push), the PostHog project, Apple and Google sign-in (email codes are used; 1C proves the others once the D33 accounts exist).

---

## Owner-side configuration (listed, not built)

These need the owner's accounts (D33) and are configuration, not code. Each is recorded SKIPPED in the receipt until done.
- **The PostHog EU project (Q5):** its project token (`EXPO_PUBLIC_POSTHOG_KEY` in the app build, `POSTHOG_PROJECT_TOKEN` as a Worker secret), its project id (`POSTHOG_PROJECT_ID`), a personal API key that may delete persons (`POSTHOG_PERSONAL_API_KEY`), and a random `ANALYTICS_ID_KEY` (a Worker secret, never in the app, never rotated).
- **Project settings (Q6):** session replay on with a sample rate (§9 leaves the rate to the builder; start at 10%), masking left on, replay console logs off and replay network telemetry off (the app also sets both off), exception autocapture on (it gates both JavaScript and native capture), and "discard client IP data" on, matching L7.
- **Symbolicated crashes (Q2), built by P6C-T12:** the `posthog-react-native/expo` plugin with `uploadNativeSymbols`, added by `withRelease` for store (`production`) builds only, never in `app.json`; `POSTHOG_CLI_API_KEY` and `POSTHOG_CLI_PROJECT_ID` as EAS secrets, `POSTHOG_CLI_HOST` in `eas.json` (posthog.com/docs/error-tracking/upload-source-maps/react-native).
- **Our own copy (Q7):** the scheduled batch export to R2 (§7), set up in PostHog with an R2 bucket and token the owner creates.
- **Dashboards and their alerts (Q7)** (§7: activation, habit, capture mix, Bun AI quality, slip import, travel, reliability, recap and bridge), with an alert on the Worker log `analytics_person_deletion_abandoned`, which carries the deletion request id (Q15).
- **Counsel (Q4, §6.11, before the beta):** the PDPA notice naming PostHog EU, the consent wording (the drafts in 1D-T8), whether scrubbed crash reports may be sent without consent (the switch `EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT`), and whether events held before consent may be sent once the person says yes.

## Self-review notes (for the executor)

- **Spec coverage for 1D:**
  - §6.5 live pokes: 1D-T10 (vault and Worker), 1D-T5 (the phone), 1D-T12 (the HTTP Worker, 1C's revocations and erase, the built-stack proof). The fallbacks are untouched.
  - C16: 1D-T4 (kept in the diary, never in the outbox) and 1D-T9 (the `rh-conflict` panel and flow).
  - §7: the app core and its tests (1D-T1), the client (1D-T6), the proxy (1D-T2), the server (1D-T3, 1D-T11), identity (1D-T1, 1D-T6, 1D-T11), errors (1D-T1's gate and 1D-T6 for the app, 1D-T3 and 1D-T11 for the Worker), consent (1D-T1, 1D-T6, 1D-T8, and 1D-T11's header rule), the events (1D-T1's allow-list and emitters; 1D-T7 and 1D-T14 for phase 1's emitters), the never-sent list (1D-T1, 1D-T6, 1D-T11), deletion (1D-T13).
  - §8 phase 1 proof: 1D-T12 (built stack) and 1D-T15 (phones).
- **The controller's rulings:** R23: 1D-T1 owns the names, properties and consent, with phase 2's values in the enums and pack keys accepted (Q18); phase 2 keeps no event module of its own and calls `src/analytics/events.ts`. R24: 1D-T9's `ChoicePanel` is the one `rh-conflict` component; P2-T27 restyles it. R25: 1D-T7 puts each emitter in the rule that performs the action, in both landing orders; P2-T16's tray host sends no second `record_saved`. R26: Q1 to Q18 were settled as their defaults on 25 October 2026, and each task carries its decided value. R57: vault queries bind id lists as one JSON parameter (1D-T10's revoked-session check); 1D-T11's change-log read is a revision range. R81: 1D-T1's `wallet_type` is spec §5.2's four, without `ewallet`. R82: 1D-T8's question takes the place of P2-T18's `WalletShell`, inside `CompanionBoundary`, and its hook's `installed` lets P2-T35's setup redirect wait for a settled status (P2's W34).
- **Requests to other plans:** 1C: `ServerSession.created` and `SignInResult.created` (its K23), which 1D-T14 reads; 1D-T13 replaces `DeletionHooks` (`analyticsIdOf(env, requestId)` and `deleteAnalyticsPerson(env, analyticsId)`), adds the step `analytics-id` to `DELETION_STEPS`, and runs daily retries after `final-sweep`. 1B: after 1B-T13, `VAULT_ADDED_ROUTES` sits beside `VAULT_EDGE_ONLY_ROUTES` in `route-coverage.test.ts`. Phase 2: the revisions R23 to R25 name (`budget_set` takes `budget`, screens are route patterns, trays pass `track` into the save rule, `ConflictChoice` is not built).
- **Not in 1D, on purpose:** `@posthog/ai` and LLM analytics (phase 3); surveys, flags and experiments (phase 6; phase 1 sets `disableRemoteFeatureFlags`, which phase 6 turns off when it uses flags); the events of later features (their emitters come with the features, through 1D's API); `reminder_set` until the reminders screen is free (P2-T36); `passkey_created` until a phase creates passkeys.

---
