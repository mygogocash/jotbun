# 1D-T11 second review (privacy path): Server events and the analytics id

Reviewer: Claude Sonnet 5.5, independent second reviewer. Commit `6390b20a` on `p1/1d-t11-server-events` (range `origin/claude/p1a-vault-core...6390b20a`, parent `123655cc`), PR #445. Read-only: nothing edited, committed or pushed in any worktree (the worktree is clean at `6390b20a`); every probe ran in a scratch copy under `.claude/controller/scratch/1d-t11-second/`. I did not read any other review of this task.

## Summary

The production code is sound on every privacy point the dispatch names. Consent, the event payload, the failure counting, "never throws" and `/v1/me/analytics` all hold, and I checked the payload through the real PostHog SDK in workerd, not only a fake port. The commit does break CI, though: three existing workers cases fail because two test doubles do not know the new vault method the Worker calls (B1, with a verified fix, tests only). Five smaller guards are not pinned by the planner's 19 cases (m1); each is killed by a one-case probe I wrote.

## CI on PR #445 (read with `gh pr checks 445`, job log fetched for counts)

One job failed, eight passed.

| Job | Result |
| --- | --- |
| Edge Worker (types, unit, workerd, build, PostgreSQL container), job 131435854219 | **fail**, 1m35s |
| Typecheck, unit, API, build | pass |
| Exports (web and iOS bundles) | pass |
| Render (every file but the per-section suites) | pass |
| Render, per-section suites (three jobs) | pass |
| SQL integration and ops | pass |
| Release image and smoke | pass |

The edge job ran checkout, install, `build -w gogospend-api`, `install:edge`, `typecheck:edge` (passed), `test:edge` (Node: 20 files, 206 tests passed) and `test:edge:workers`, which failed: `Test Files 2 failed | 33 passed (35)`, `Tests 3 failed | 821 passed | 1 todo (825)`, 3 unhandled errors. Its later steps (`build:edge` and the PostgreSQL container steps) did not run, so CI has not yet checked the Worker bundle or the database suites on this commit. I ran `build:edge` in my scratch copy (see "Checked and sound", item 8); the database suites stay SKIPPED here (Docker stopped) and are CI's.

## Findings

### Blocker

**B1. The commit breaks three workers cases: two test doubles intercept `call` and cannot forward `callWithAnalytics`.**

The three failures (all the same setup step, `member()` at `test/workers/support/v1-client.ts:173`, "accepting the terms answered 500"):

- `test/workers/ai.test.ts:952` and `:974`, the two cases of "the 1B-T7 review's pins" (a signed-out session with a malformed body; a signed-in person without consent who sends a malformed body);
- `test/workers/attachments.test.ts:1865`, "a second request for an image whose copy is held only waits...".

Cause, step by step:

1. `src/v1/handler.ts:151` now calls `stub.callWithAnalytics(...)` where it called `stub.call(...)`.
2. `recordingVault` (`ai.test.ts:898-925`) and `preparesSeen` (`attachments.test.ts:1678-1704`) wrap `env.VAULT` in a `Proxy`. They intercept only `p === 'call'`. Every other stub member goes through `Reflect.get(s, p)` and `value.bind(s)` (`ai.test.ts:915-916`, `attachments.test.ts:1694-1695`).
3. On a Durable Object RPC stub every property read returns a callable RPC property, so `value.bind(s)` is itself an RPC property: it makes a remote call to a method named `bind`. The vault has none: `TypeError: The RPC receiver does not implement the method "bind"` (three "Unhandled Rejection" blocks in the CI log, one per failing case).
4. `stub.callWithAnalytics` rejects, the Worker's outer catch answers 500 `INTERNAL_ERROR`, and `member()` throws.

Only the cases that sign up through a wrapped front door fail: `ai.test.ts:951-952` and `:973-974` (`member(c)` with `c` built with `VAULT: recordingVault(log)`) and `attachments.test.ts:1863-1865` (`money.member()` on `v1`, built with `VAULT: preparesSeen(prepares)`). The two other users of these wrappers pass because they sign up through an unwrapped door and use the wrapped one only for Worker routes, whose steps still go through `call`: `ai.test.ts:998` and `download-aborts.test.ts:441` (which holds an identical copy of `preparesSeen`, `:246-272`).

Proof (probes, scratch copies, under the heavy lock):

- `6390b20a`, the three cases focused with `-t`: `3 failed | 101 skipped`, the same messages as CI (`scratch/1d-t11-second/repro-ci-failures.log`).
- Parent `123655cc`, same command: `3 passed | 101 skipped` (`repro-base.log`). So this commit causes it; it is not a load flake and not pre-existing.
- Fix applied in the scratch copy (patch: `scratch/1d-t11-second/fix-wrappers.diff`): the three cases pass, plus the sibling `ai.test.ts:988` case (`repro-fix.log`); with the recording variant of the `ai.test.ts` fix, all three `recordingVault` cases and the attachments retaining cases pass (`repro-fix-recording.log`); the `download-aborts.test.ts` case at `:407` passes with the same line added (`repro-fix-download.log`).

Recommended fix (tests only, no production change; the task's own tests and the production path are unaffected):

- `ai.test.ts` `recordingVault`: add a `callWithAnalytics` branch beside `call` that records the call and forwards it with `s.callWithAnalytics(call)`. Its doc comment says it records every call the Worker makes before making it, and vault routes now arrive as `callWithAnalytics`. Recording them is safe: all three cases that use it pass (above).
- `attachments.test.ts` `preparesSeen` and `download-aborts.test.ts` `preparesSeen`: `if (p === 'callWithAnalytics') return (call: VaultCall) => s.callWithAnalytics(call)` ahead of the `.bind` fall-through. The second file passes today only because its wrapped door serves Worker routes; fix it with the others so the next vault method cannot reintroduce this.
- These three files are outside the brief's file list ("edit only the files the task names"), so the fix round needs the controller to widen its scope to them.
- Gate for the fix round: those three files focused, plus `server-events.test.ts` and `live.test.ts`; CI for the rest. A grep for other doubles over the binding finds no more: `grep -rn "VAULT:\|new Proxy(real" apps/edge/test` lists only these three files.

Why it escaped: P2 reasoned that `call(x)` is `callWithAnalytics(x).reply`, so "every Worker step that uses `call()` sees no change". True for production, and true of the planner's seven related files. But the front door's route calls moved from `call` to `callWithAnalytics`, and a test double that intercepts `call` for route calls sees that. R100 kept the full workers suite out of the local gate, so CI was the first to run these two files.

### Major

None.

### Minor

**m1. Five guards on the privacy path are not pinned by the planner's 19 cases.** The code is right today (every probe below passes on the commit), but each guard can be removed without a failing test. Protocol step 5 says to add a test for every survivor. I wrote five mutants against the commit; all five survive `server-events.test.ts` (19 cases) and each is killed by one short case (in `scratch/1d-t11-second/second-review-probes.test.ts`, about 60 lines in all, ready to adapt into `server-events.test.ts`):

| Mutant | Guard | What the commit's tests miss | Killed by my case |
| --- | --- | --- | --- |
| M-A | the off header on what a reply says (`handler.ts:220`) | H1 and H2 pin the off header for `record_saved` only. Plan Review Focus 2 (plan line 80), "records synced after an offline no must send no server event", is the case where the vault still says yes, the phone says no, and the same sync gets a 410 or a 500 on `sync.changes`. Without the guard, `resync_required` or `sync_failed` would go out under the person's id | "the off header also gates what a reply says" |
| M-B | a failed consent read fails closed (`analytics.ts:76-79`, `consent: 'unasked'`) | The only failed-read case (A16) uses a 200 `GET /v1/wallets`, where consent is never used. Mutant `consent: 'yes'` in the catch survives | "a failed consent read fails closed" (drop `consents`, create: 500, only the anonymous count, no `sync_failed`) |
| M-C | `sendServerEvents` never throws (`handler.ts:229-231`) | P4 says "nothing in analytics can change a reply", pinned by A16, which is the vault half only. No case makes the port throw; `server_events_failed` appears in no test. Without the catch a PostHog exception after the vault committed turns a committed create into a 500 | "a port that throws leaves the committed create answered 201, and is logged by its class name only" |
| M-D | `countWorkerFailure` never throws (`handler.ts:238-240`) | Same. It runs inside the outer catch, so without its catch `handleVaultV1` rejects and the v1 problem body is lost | "an analytics dep that throws while the Worker counts its own exception still answers the normal 500 problem" |
| M-E | `reply.code === 'RESYNC_REQUIRED'` (`handler.ts:201`) | `transactions.create` also answers 410, `ENTITY_PURGED`, for a purged id sent again (`money-hardening.test.ts:134`). Status-only would send a false `resync_required` | "a 410 that is not RESYNC_REQUIRED" |

I recommend adding these cases in the same fix round, since they are in the task's own file.

A sixth mutant, M-F (the vault sends a custom category's label as `category_key`), survives too, but it is equivalent in effect: the module's allow-list (`BUILTIN_KEYS` in `server-analytics.ts`) turns anything that is not a built-in key into `custom`, so two layers keep the label off the wire and either alone is enough.

### Nit

- **n1. A vault failure under a Worker route is counted under the Worker's name.** `step()` (`src/v1/ai/service.ts:68-72`) rethrows a failed vault reply as `new ProblemException(...)`; the outer catch counts it. Probe: `GET /v1/me/ai-preferences` with `ai.preferences` throwing a `RangeError` gives one `$exception`, type `ProblemException`, route `worker`. The class name and step of the real failure are lost for AI, import, attachment and snapshot routes. This is P5's reading and it is anonymous and correct; it only makes the Reliability dashboard's bucket uninformative. Carry it (Notes).
- **n2. The vault does three small reads after every `call()`** (`account_state`, `consents`, the revision), including each Worker step, whose caller drops them, and routes that can emit nothing. P8's "a request with nothing to send costs nothing more" holds for PostHog, not for the vault. Negligible.

## Checked and sound (the dispatch's focus points)

1. **Consent.**
   - A person-level event needs the vault's `('analytics', 0)` row to say yes, read after the block from the vault that holds the caller's own account (`analytics.ts:73-74`). Never asked: nothing (the planner's "never asked" step). No: nothing. Another account's vault: `'unasked'` (A15 killed in my sample). A refused first call rolls its account back: `'unasked'`.
   - The row has two writers only: `acceptPolicy` (version 1 or later, `policies.ts:63`) and `setPrivacy` (`policies.ts:75`). Nothing else can write `('analytics', 0)`.
   - A deleted account: probe, after `erase()`, `GET /v1/me/analytics` is 403 `ACCOUNT_UNAVAILABLE` with no `analytics_id`, a create is 403, and after `evictDurableObject` (only the marker row left) both are still 403; nothing is sent. `markDeleting` does not exist at this commit (1C's); whatever it adds must keep `assertSession`'s 403 ahead of any event, which today it does.
   - The off header: only an explicit `off`, in any case, stops events. The phone sends it from the shared transport (`apps/app/src/api/sharedV1.ts:45-55`, `client.ts:347`: off unless `allowsAnalytics()` is true, so off while analytics is not initialised). The receipt and import transports (`ReceiptParts.tsx:85`, `ImportDeviceParts.tsx:32`) build their own without it but reach no route that emits a person-level event, as the receipt says. The header is never forwarded to the vault (`FORWARDED_HEADERS`).
2. **What each event carries.** Probe with the real `posthog-node` client (no fake port) in workerd and `fetch` stubbed: one `POST https://eu.i.posthog.com/batch/`, gzip, user agent `posthog-edge/5.56.2`; body `{ api_key, batch: [{ event: 'record_saved', properties: { kind, category_key, origin: 'server', $lib, $lib_version, $is_server, $geoip_disable: true }, timestamp, uuid, distinct_id }], sent_at }`. `distinct_id` is the 64-hex HMAC. No amount, note, merchant, record id, wallet id, category id or account id (each asserted absent). No `$ip` and no `$set`.
3. **Failure counting (P5).** Only a 500 `INTERNAL_ERROR` counts (`isInternalError`, `handler.ts:179`; the outer catch counts what `errorResponse` answers with 500). Refusals do not: the planner's refusal case (401, 426, 403, 400, the paused gate's 503, the vault's 503) and my 410 `ENTITY_PURGED` probe; H9 and H12 killed in my sample. A Worker exception logs its class name only (U2 killed; the planner's two failure cases check that the Thai text and `1,234` are absent from what is sent and, in one of them, from the log).
4. **Never throws (P4).** Vault half: A16 and my fail-closed probe. Worker half: pinned only by my cases (m1), and they pass on the commit: a port that hangs does not hold the reply (201 inside 2 s); a port that throws leaves the create at 201 with one line `{"level":"error","event":"server_events_failed","failure":"TypeError"}` and no message text; a dep that throws during a Worker exception still gives the normal 500 problem. Five creates at once send five `record_saved`, once each (the vault call is synchronous, so the revision range cannot overlap).
5. **`/v1/me/analytics` (P7, followups line 182).** Built explicitly as `['analytics_id', 'weeks_since_signup', 'consent']` (`withAnalyticsId`, `handler.ts:193-197`); `weeks_since_signup` an integer 0 to 1040 (`analytics.ts:30-35`; A3 to A6 killed by the planner's cases, which I read); no 404 but for a missing route: the handler is registered, a refusal passes through (401 `SESSION_REQUIRED` for an ended session, 403 for an erased vault), and `HEAD` answers 200 with no body (probe). `cache-control: no-store` comes from `BASE_HEADERS`.
6. **The files shared with P3-T7.** The diff of `vault/routes.ts`, `v1/protocol.ts` and `v1/routes.ts` removes 3 lines in all (two comment lines and the `VAULT_ADDED_ROUTES` line). P3-T7's `ai.refund` is untouched: `protocol.ts:65`, `routes.ts:179` (`'ai.refund': { anySession: true }`), `vault/routes.ts:216`.
7. **P2, the hoisted context.** `now: this.clock()` moved from inside the block to just before it, in the same `try`; `c.touched` is read after the block instead of inside it; `rearm` never throws (it logs); the order stays `before`, block, rearm, `afterCall` in `finally`, then the analytics reads. A rollback reads the pre-call state, so a refusal sends nothing. `call(x)` is `callWithAnalytics(x).reply`. I found no behaviour change.
8. **Build and diff.** `npm run build` in `apps/edge` (scratch copy): rc 0; `eu.i.posthog.com` is in `dist/server/index.js` and `dist/server/assets/handler-*.js`, so `posthog-node`'s edge entry bundles (P8). `git diff --check origin/claude/p1a-vault-core...6390b20a`: clean. 13 files, 858 insertions and 34 deletions, matching the receipt. `vitest.workers.config.ts` is unchanged: no analytics secret is set there.

## Mutants

- **Planner's, sample of 10 of 41**, run in my scratch copy with `PL/mutants.py --only A2,A7,A15,A18,U2,H1,H2,H3,H9,H12`: `10 of 10 killed; survivors []; not restored []`, every one by an assertion (`mutants-sample.out`).
- **My own, 6**: `scratch/1d-t11-second/mymutants.py`, results in `mymutants.out`. M-A to M-E survive the planner's file and are killed by one case each (m1); M-F is equivalent behind the allow-list. Each file was restored byte for byte (checked by SHA-256, and again with `cmp` against the worktree).

## Probes (scratch, `second-review-probes.test.ts`: `12 passed (12)` on the unmodified commit)

An erased account (live and after sleep); a "no" with the phone off still gets the anonymous count and nothing under the person; a failed consent read fails closed; the off header on reply events; a purged-id 410; a hanging port; a throwing port; a throwing dep; a failing vault step under a Worker route; `HEAD`; five concurrent creates; the real client's wire payload. The focused files of the task run green in my scratch copy: `server-events.test.ts` and `live.test.ts`, `41 passed (41)`.

## Notes for later tasks

1. Any task that changes which vault method the Worker calls, or adds a Worker-to-vault RPC: run `grep -rn "VAULT:\|new Proxy(real" apps/edge/test` and run each file it lists, focused. Better, replace the three copied wrappers with one helper under `test/workers/support/` that forwards any member without `.bind` (`(...args) => stub[p](...args)`), so a new vault method cannot break them again.
2. **1D-T13 and P6C, consent-only switch.** The anonymous counts (`captureFailure`) go out whenever `POSTHOG_PROJECT_TOKEN` is set, whatever the consent or the off header (L6 says so; probe: a "no" with the phone off still sends one, class name and route only). The spec (section 7) lets crash reports go without consent "behind a switch that makes them consent-only if counsel says so", and Q4 hands that call to counsel. The app has its build switch (1D-T6); the Worker has none. If counsel rules consent-only, the Worker needs the same switch.
3. **Dashboards (n1).** If the Reliability dashboard needs the vault's class name for AI, import, attachment and snapshot routes, `failure` must be threaded through `vaultSession.call` and the steps' `throw new ProblemException(...)`, which drop it today.
4. **Later person-level server events** (`slip_scan_finished` and others) must go through the shared transport so they carry the off header (1D-T6's m4); the slip resources already do (`getSharedSlipResources`).
5. **The SDK's wire format** (gzip to `/batch/`; it adds `$lib`, `$lib_version`, `$is_server`, `$geoip_disable: true`, `api_key`, `uuid`, `timestamp`, `sent_at`) is what a future server-side "never sent" test should assert against.

## Method and limits

Read: the plan task, calls L4 to L6, Q5, Q13, Q16, Global Constraints, spec section 7, the brief, the receipt, the full diff and the surrounding code (`handler.ts`, `user-vault.ts`, `analytics.ts`, `server-analytics.ts`, `session.ts`, `policies.ts`, `replies.ts`, `worker-routes.ts`, the app's transport wiring). Ran, in scratch copies of `6390b20a` and `123655cc` with `node_modules` symlinked, under the heavy lock via the planner's `locked.sh`: the focused files (`41 passed`), the CI failures (reproduced), the parent (green), the fix variants, 10 planner mutants, 6 own mutants, 12 probes and `npm run build`. Not run, per R100 and the dispatch: whole suites, the database suites (Docker stopped; CI), `typecheck:edge` and `test:edge` (CI passed both), any app suite (no app file changed), and a hosted PostHog send (SKIPPED by design, D33). My first mutant run was cut off by the controller's note; it kept running and finished (`10 of 10`); I checked afterwards that the lock was released, no process was left and every source file was restored. I deleted my parent-commit copy and the build output; the `tree/` copy stays (it holds the probe file and the fixed wrappers) and nothing is left under `/private/tmp`.

VERDICT: Needs fixes
