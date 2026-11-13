# P4-T3 second review (Claude Sonnet 5.5): PR #452, the vault's slip tables, the salt, slip accounts and the inbox count

- **Reviewed:** the PR head `1eb4e5ed` = `6cb8d0d1` (the implementer's commit) + R122's test-only commit. Range `origin/claude/p1a-vault-core...1eb4e5ed`; merge base `d229ebbc`. The base has since moved by one controller-state commit (`2062b89a`) that touches nothing under `apps/edge`, `apps/api` or `packages`.
- **Independence:** I read the plan (P4-T3, S1, S2, S13, S16, Global Constraints), the brief, the planner's kit, the implementer's logs and the receipt. I had not read any other review of this task when I wrote this (none was in `reviews/`).
- **Method:** a `git archive` copy of the commit in `scratch/p4-t3-second/tree` (linkfarm `node_modules`), every workers run under the heavy lock, nothing run in a worktree. Whole suites, Docker and the database suites were not run here; CI's counts are below.
- **Result:** no open blocker or major. One blocker existed at `6cb8d0d1` (CI red) and R122 fixes it. Five minors (four test gaps where the code is right, and one wording point in R122's comment), three nits.

## CI (PR #452)

| Head | Job | Result |
| --- | --- | --- |
| `6cb8d0d1` (run 43343704140) | Edge Worker | **fail** at `test:edge:workers`: 36 files, `1 failed \| 843 passed \| 1 todo (845)`; `build:edge` and `test:edge:db` then skipped. `typecheck:edge` passed; `test:edge` 20 files, 207 passed. |
| `6cb8d0d1` | the other 8 jobs | 7 passed (Exports, Release image, Render, Render 3n, Render "every other test", SQL integration and ops, Typecheck/unit/API/build); the Render 3n+1 job was still queued the last time I looked. |
| `1eb4e5ed` (run 43346222284) | Edge Worker, pass (2m57s) | `typecheck:edge` pass; `test:edge` 20 files, 207 passed; **`test:edge:workers` 36 files, `844 passed \| 1 todo (845)`**; `build:edge` pass; **`test:edge:db` 3 files, 12 passed** (never reached at `6cb8d0d1`). |
| `1eb4e5ed` | the other 8 jobs | all 8 passed (Exports, Release image, Render, Render 3n, Render 3n+1, Render "every other test", SQL integration and ops, Typecheck/unit/API/build). **9 of 9 green** at my last poll; the two render per-section jobs had been queued when I first looked, and finished green after. |

## Findings

### Blocker (resolved by R122 at `1eb4e5ed`)

**B1. `test:edge:workers` was red at `6cb8d0d1`: `test/workers/sync.test.ts:301` pins the vault registry's entity list and this task registers `slip_inbox`.**
- Evidence: CI job 131617853299, `AssertionError: expected [ Array(8) ] to deeply equal [ Array(7) ]`, diff `+ "slip_inbox"`, at `sync.test.ts:301:43`. Reproduced in my scratch copy (same assertion). Deterministic, not a load flake.
- Cause: `registry.ts` (`defineEntity({ entity: SLIP_INBOX_ENTITY ... })`, which the plan requires) adds an eighth name. The file is not in the plan's file list, the brief's P16 neighbours or the planner's gate. The test's own comment already said "phase 4 registers slip_inbox".
- Fixed by 1eb4e5ed: see "Is R122 right" below. Verified.

### Major

None.

### Minor (test gaps; the code is right in each case; suggested follow-up, not a reason to hold the PR)

My probes (`scratch/p4-t3-second/handover/review-probes.test.ts`, 17 cases) pass on the head, and each of the mutants below survives all 36 planner cases in `slips-vault.test.ts` and is killed by a probe.

**m1. The unreleased route is pinned as indistinguishable from a missing one by status and code only.**
- `slips-vault.test.ts:59-87` compares `{ status, code }` (`shape()`). A mutant that gives the unreleased 404 its own `message_key` (M1: `problemResponse(404, 'NOT_FOUND', requestId, { messageKey: 'errors.slip_import_off' })`) or an extra response header (M2) survives.
- The code is right today: `handler.ts:117` and the no-match line above it both end in `problemResponse(404, 'NOT_FOUND', requestId)`, whose body is `{ code, request_id, message_key }` and whose headers are `BASE_HEADERS` plus `x-request-id`.
- Probe P1 compares status, every header except `x-request-id`, and the body minus `request_id`, for 15 request shapes against a path that does not exist (GET with no token, with a token, with a garbage bearer and with an old client; HEAD; PUT with JSON, malformed JSON, a 3 MB body, a text body and a non-UUID id; an upper-case path; a trailing slash; a query string; POST and DELETE where no route exists), plus a paused `imports` gate and an unreadable config. All identical. Suggest lifting P1 into `slips-vault.test.ts`.

**m2. "The salt is never logged or sent to analytics" has no test.**
- M3 (`console.log` the salt when made) and M3b (`console.info` its hex on every read) survive; the planner's evidence is a manual `grep -c "stdout |"` of a run log. M9 (the Worker sends an allowed `record_saved` event when the salt is read) survives too.
- Probe P5 spies on `console.log/info/warn/error/debug` across the first read, later reads, a refused read and an erase and asserts neither the salt nor its hex appears (kills M3, M3b). Probe P2b turns analytics consent on with the PostHog secrets set, reads the salt, lists and maps an account (200, 409 and 422 paths) and asserts nothing is sent, with a `record_saved` control that is sent (kills M9).
- For the record: M9 with an invented event name is an equivalent mutant, because `allowedProperties` in `server-analytics.ts` drops any event that is not `record_saved`, `sync_failed` or `resync_required` and strips unlisted properties. `committedEvents` (`vault/analytics.ts`) also reads the change log only for `transactions.create`. Two independent guards keep a salt out of analytics.

**m3. R41's order for two faults in one request is untested.**
- `updateSlipAccount` (`accounts.ts:80-88`) reads If-Match, then the id, then the body, then the version, then the wallet, as `updateWallet` and `commandHeaders` do. The planner's cases have one fault per request, so swapping any adjacent pair survives: M4 (version before body), M5 (wallet before version), M6 (id after body), M7 (If-Match after id).
- Probes P3 (empty, non-object and malformed bodies; If-Match formats) and P3b (stale version with a bad body is 422; stale with an unknown or archived wallet is 409; current with either is 422) kill all four. The order the code has is the right one.

**m4. "`open_drafts` counts each draft once" is untested for a draft with the same account on both sides.**
- M8 (the count as the sum of a sender count and a receiver count) survives. The SQL uses `OR` (`accounts.ts:18-20`), so a draft counts once; real slips rarely carry an identical bank and last four on both sides, but two same-bank accounts with equal last four digits are possible. Probe P3 (`from` and `to` both `kbank 1234`: count 1) kills it.

**m5. R122's wording leaves out `settings`.**
- `SYNC_ENTITY_VALIDATORS` (`packages/contracts/src/v1/sync.ts:86-102`) holds ten keys; the vault will register `trip` in P5-T9 and `settings` in P5-T13. The new comment and `it.todo` name `trip` alone. The todo should read "once phase 5 registers trip (P5-T9) and settings (P5-T13)". Text only.

### Nit

- **n1.** `accounts.ts:15` copies `IF_MATCH` (`/^"([1-9][0-9]{0,8})"$/`) from `apps/api/src/commands/command-headers.ts:7`. Same regex today; export one and share it, or the two drift.
- **n2.** `route-coverage.test.ts` adds a `wranglerVars()` reader that duplicates `c1-shape.test.ts`'s, and the exact list of added routes (line 173) now sits in a case named for P4-T3, so every later task that adds an added route edits a P4-T3-named case. The plan's ruling P13 chose this; a neutral case name would age better.
- **n3.** `listSlipAccounts`'s correlated count scans `slip_drafts` once per account and `slip_accounts` is never pruned. Fine at the plan's quotas (a few accounts, a few hundred open drafts); revisit with an index on `(from_bank, from_last4)` and `(to_bank, to_last4)` only if the limits grow.

## Is R122 right?

**Yes.** Reasons and checks:
1. The failure is this task's own: the plan requires registering `slip_inbox` (P4-T3 file list: `registry.ts` "entity `slip_inbox`"), `SYNC_ENTITY_VALIDATORS` already holds it (P4-T1), and the test's comment anticipated it. Unregistering would contradict the plan; the pin has to move.
2. The diff is minimal and test-only: `'slip_inbox'` goes in sorted position (between `import_selection` and `transaction`, exactly what CI's diff shows), the second assertion (each registered entity's validator is `SYNC_ENTITY_VALIDATORS[name]`, by identity) is untouched, and the receipt gains one line.
3. I put the head's exact `sync.test.ts` in my scratch copy and ran the whole file under the lock: **17 passed, 1 todo**, as the controller's proof says.
4. I unregistered `slip_inbox` (deleted the `defineEntity` line in `registry.ts`) and ran the pin: it fails on `AssertionError: expected [ Array(7) ] to deeply equal [ Array(8) ]` (`- "slip_inbox"`); the file was restored byte for byte.
5. CI at `1eb4e5ed`: the whole workers suite 844 passed + 1 todo, `build:edge` pass, `test:edge:db` 12 passed.

Only the wording in m5 is incomplete.

## Does any other file pin the vault's entity or route lists? (grep over `apps`, `packages`, `scripts`)

None was missed at this commit.
- **`entityNames`:** `apps/edge/test/workers/sync.test.ts:301-302` (fixed) and `apps/api/src/sync/sync-api.integration.spec.ts:138`. The second reads the API's own `CommandRegistry` (PostgreSQL edge), compares it with `SYNC_ENTITY_VALIDATORS` minus `slip_inbox`, `trip` and `settings`, and is unaffected (it ran in "SQL integration and ops": pass).
- **`VAULT_ADDED_ROUTES`:** only `route-coverage.test.ts` (lines 97, 98, 127, 132, 162, 167, 173). Lines 97, 98, 132 and 162 derive from the constant; lines 127 and 167 (1D-T11's case) are `toContain`; the exact list lives in the P4-T3 case (173). All pass (Node suite 207).
- **`SYNC_ENTITY_VALIDATORS`:** only "an older reader skips unknown entities" cases that destructure the map (`slip-contracts.test.ts:173`, `contracts/trips.test.ts:78`, the app's `diaryRepository.test.ts:253`, `apps/api/src/v1/contracts.spec.ts:453`); none reads the vault registry.
- **`test:edge:db`** (`vault-parity.db.test.ts`, `vault-parity-files.db.test.ts`, `c1-worker.db.test.ts`): I read all three; none pins a list this commit changes. CI's 12 passed confirms it.
- **The same pin will trip again.** P5-T9 registers `trip` and P5-T13 registers `settings`. Neither task's file list names `sync.test.ts`; P5-T13's Step 4 even says "with ... 1A-T8a's `sync.test.ts` unchanged" (`2026-10-25-jotbun-p5-travel.md:648`). Each will hit `sync.test.ts:301`; see the notes.

## The controller's focus list

**The release check (P8; `handler.ts:117`).**
- It runs right after `matchRoute` and before `readRouteBody`, the config read, the gates, the client check and the token (`handler.ts:113-123`). An unreleased route answers the same status (404), code (`NOT_FOUND`), `message_key`, header set and body shape as a missing path; only the random `request_id` differs (P1: 15 request shapes, a paused gate, an absent config).
- Released, the same requests reach the later checks (400, 503, 426, 401): the planner's case shows it. A 3 MB body to the unreleased PUT is 404 (the body is never read).
- Timing: workerd's clock does not advance during CPU work, so a workers test cannot measure it. The only step that differs between the two requests is `matchRoute`'s loop (the route matches, or no route does); I measured it in Node over the 60 routes: 2,352 ns against 2,256 ns per call, a 95 ns difference (`review-timing.test.ts`). Everything after it is one shared call. There is no usable timing channel.
- `flag()` (`server/env.ts:52`) is `value === '1' || value === 'true'`. Probe: `TRUE`, `True`, ` true`, `true `, `0`, empty, `false`, `on`, `enabled`, `2`, `yes`, `1 `, `true\n`, `null` and a non-string `true` all give 404; `1` and `true` give 200. `wrangler.jsonc` keeps `"SLIP_IMPORT_ENABLED": "false"` and the Workers runtime reads exactly that string.
- The salt route has no `release` (`routes.ts:134`), as the plan says (S13, P4-T3 "without `release`"); it answers any live session before slips open.

**The salt (P14).**
- Made once: `slipSalt` (`salt.ts:19-25`) reads `slip_salt` and otherwise inserts `crypto.getRandomValues(32 bytes)`. It runs inside `callWithAnalytics`'s `transactionSync` block (`user-vault.ts:232`), so two first reads cannot make two (probe: 20 simultaneous first reads give one salt and one row). Nothing in `salt.ts`, `accounts.ts` or `inbox.ts` logs or throws anything that carries a value. `errorResponse` and `logFailure` log a class name (and, for a 500, the route template and request id) only. The salt is stored in `slip_salt` and nowhere else in the vault (probe: no other table's rows contain it), never enters the change log (the sync feed has no group for it), and never reaches analytics (m2).
- Access: `bound_session` (`routes.ts:134`) goes through the vault addressed by `idFromName(claims.accountId)`, `ensureAccount`, `assertSession` and the read budget. Another account's token reads its own vault, so its own salt (probe: a second account's token with the first account's id in the query and in three headers still gets its own salt). A signed-out session gets 401 with no salt in the body. `cache-control: no-store` is on every response (`BASE_HEADERS`).
- Erase: `UserVault#erase` (`user-vault.ts:109-120`) cancels the alarm, `deleteAll()`s the storage, re-runs the migrations and writes one `deleted` marker. Probe: after an erase every table is empty except `account_state` (the marker), `slip_salt` has 0 rows, and the salt, the list and the PUT all answer 403 `ACCOUNT_UNAVAILABLE`, also after the vault sleeps. A salt made later is impossible.
- Restore or snapshot to another account: no. A snapshot reads `entity_heads` and `entity_changes` only (`files/snapshots.ts:160`); `slip_salt` is not an entity and nothing reads it but `salt.ts` and the schema file. There is no vault-to-vault copy and no Durable Object bookmark or restore call in `apps/edge/src`. The only slip data that syncs is `{ id, version, open }`.

**Slip accounts (P7, P9, P10).**
- Check order: If-Match, id, body, version (404 unknown, 409 with `current`), then wallet (422 on `wallet_id`), as R41 and `updateWallet` (m3: code right, order untested). A malformed or missing If-Match is 422 on `if_match`; the formats the commands accept are the formats accepted (`"7"` only; `W/"1"`, `*`, `"01"`, `"0"`, a list, ten digits and `""` are 422).
- A wallet in another account cannot be mapped: the lookup is `SELECT archived FROM wallets WHERE id = ?` inside this vault, so another vault's wallet is unknown (probe: 422 `errors.wallet_not_found` on `wallet_id`, and their account id is 404 for the other person). An archived wallet is 422 `errors.wallet_archived`.
- `open_drafts` counts each draft once (m4, code right).
- No account is made by a read: `listSlipAccounts` and `slipAccountFor` only SELECT; the list case would fail on any extra account. `ensureSlipAccount` has no caller in `src` yet (P4-T6 will).
- Bank details in logs or errors: none. Every thrown message is static (`'If-Match must be the current version, e.g. "7".'`, `errors.wallet_*` keys); the 409's `current` goes only to the owner's own response; `logFailure` writes a class name; analytics sends only the allowlisted properties.

**The migration (P2).**
- `0006_slips.sql` is the plan's SQL verbatim: I extracted lines 236 to 266 of the plan and diffed them against the migration with comments and breakpoints removed: no difference.
- The two looser checks (`bank GLOB '[a-z]*'`; the time `GLOB` allowing hours 24 to 29) are reachable today only by test seeding. At this commit nothing in `src` writes `slip_drafts` and nothing calls `ensureSlipAccount`; `updateSlipAccount` only updates `wallet_id`, `version` and `updated_at`. The contract is strict: `TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/` (`slips.ts:105`) and `THAI_BANK_KEYS` is a closed list (`slips.ts:16`). P4-T6 must validate before writing (notes).
- Upgrade: the P12 case builds a vault at 0005, adds records (one from a statement import, one with a receipt), the import and attachment rows, upgrades, and checks every record, receipt link and import link row by row, `foreign_key_check` empty, and that the next wake changes nothing. It is not vacuous (it asserts the old vault has neither the column nor the tables first).
- Journal: `{ idx: 6, when: 1761868800000, tag: '0006_slips', breakpoints: true }`, one day after 0005 (the migrator applies an entry only when its `when` is later); `m0006` is in the migrations map; the schema test pins the tag list, the idx order, the map keys and monotonic `when`.
- `slip_ref_id` is added by `ADD COLUMN` with a NULL default (required for `ADD COLUMN ... REFERENCES`), and no `SELECT *` or `t.*` over `transactions` exists in `src`, so no DTO or snapshot gains it (C5).

**The amount as text (P3, R16).** `SLIP_DRAFT_COLUMNS` reads `CAST(amount_minor AS TEXT) AS amount_minor` (`inbox.ts:58`); `slipDraftDto` passes it through (`inbox.ts:66`). The only `Number(` in the new modules is the If-Match version digits (`accounts.ts:70`). `99999999999` round-trips as text; the C10 mutant (the amount as a number) is killed.

**P4 (`transaction-source.test.ts`).** The change keeps the intent: the first added column must be `source` (`added[0]`), the columns before it are unchanged (`expect(columns()).toEqual([...before.columns, ...added])`), every added column reads null on each old record, links and `foreign_key_check` are unchanged, and the next wake changes nothing. It no longer pins the exact set of later columns, which is the point.

## What I ran

| Run | Result |
| --- | --- |
| Baseline in the scratch copy: `slips-vault`, `vault-schema`, `transaction-source` (workers, under the lock) | 36 passed, 0 stdout or stderr lines |
| My probes (`review-probes.test.ts`), same run | 17 passed (53 in total) |
| Planner's mutants, 12 of 98 (S12, S17, S21, S24, A1, A3, B10, B11, C10, H1, H6, H8) | 12 of 12 killed on assertions, each line identical to `PL/proof/mutants-*.out`; every file restored (`cmp` against the commit) |
| My own mutants M1 to M9 and M3b (10) | all 10 survive the planner's `slips-vault.test.ts` (36 cases); all 10 killed by my probes; files restored |
| `sync.test.ts` at the head, whole file | 17 passed, 1 todo |
| R122's pin with `slip_inbox` unregistered | fails on an `AssertionError` (7 against 8); restored |
| `git diff --check origin/claude/p1a-vault-core...1eb4e5ed` | clean |

A caveat on my own method: my first local run of `sync.test.ts` showed two extra 500s (`rejects malformed, foreign and future cursors`, `refuses bad parameters`). The cause was my linkfarm: `apps/edge/node_modules/@gogospend/contracts` is a second workspace link (relative, so it resolved into the worktree), which loaded two copies of contracts and broke `instanceof ContractValidationError`. I re-pointed it at the scratch tree's `packages/contracts`, reran everything above on the corrected farm, and the two cases pass. CI at both heads passed them. Nothing in the commit is involved.

## Notes for later tasks

1. **P5-T9 (`trip`) and P5-T13 (`settings`)** each add an entity and so each break `sync.test.ts:301`. Their briefs must name that file, insert the key in sorted order (`... 'import_selection', 'settings', 'slip_inbox', 'transaction', 'trip', 'wallet'` once both land) and update the `it.todo`. P5-T13's Step 4 "`sync.test.ts` unchanged" is wrong.
2. **Every task that adds a route to `VAULT_ADDED_ROUTES`** edits `route-coverage.test.ts:173` (the exact list); every task that adds a vault table edits `vault-schema.test.ts`'s `VAULT_CORE_TABLES` and tag list. The next vault migration needs a `when` later than `1761868800000`, or vaults that already applied 0006 skip it.
3. **Planners:** when a task touches a shared registry, route table, table list, migration journal or env list, grep the edge tests for the pin before naming the gate, and run those files focused. This one-line grep would have saved a CI round: `grep -rn "entityNames\|VAULT_ADDED_ROUTES\|VAULT_CORE_TABLES\|journal.entries\|SYNC_ENTITY_VALIDATORS" apps/edge/test`.
4. **P4-T6:** validate a read's bank with `isThaiBankKey` and its time with the contract's `TIME` (hours 00 to 23) before inserting. The SQL CHECKs allow any lowercase-leading string of 2 to 16 characters and 24:00 to 29:59, so a bad value would abort the batch's block as an unexpected 500.
5. **P4-T7, P4-T16a, P5:** a mapping is checked only when it is made. A wallet archived afterwards stays mapped (nothing here clears it), so confirm and `classifySlipDraft` must treat an archived mapped wallet as unmapped or refuse. Wallets are THB-only today (`insertWalletRow` hardcodes `'THB'`), but after P5-T10 `updateSlipAccount` will map a baht slip account to a wallet of any currency (probe: a USD wallet maps, 200). Decide where a non-THB wallet is refused (422 on `wallet_id` at mapping, or at confirm).
6. **Any generated route list or OpenAPI** (none exists today) must skip routes with `release`, or it reveals the unreleased routes.
7. The probes in `scratch/p4-t3-second/handover/` (`review-probes.test.ts`, `review-timing.test.ts`, `my-mutants.py`) are ready to lift: P1 into `slips-vault.test.ts` (m1), P2b, P3, P3b and P5 beside the salt and mapping cases (m2 to m4). `my-mutants.py` runs M1 to M9 against any tree (`--tree`, `--out`, `--only`).

VERDICT: Approved
