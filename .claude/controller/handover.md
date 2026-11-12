# Controller handover (9 Nov 2026, 22:15 Bangkok)

Durable folder: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/` (protocol.md, briefs/, reviews/, scratch/, followups.md, ledger_union.py, wait_ci.sh, watch_prs.sh, backlog/). Never use /private/tmp for anything kept; macOS cleared it once (late Oct). Only the heavy lock lives there: `/private/tmp/claude-501/jotbun-heavy.lock`.

Integration branch `claude/p1a-vault-core` (worktree `.claude/worktrees/p1a-vault-core`), head 0bd5659 (controller state after 1D-T8's dispatch). Nothing outside `.claude/` changed since 606e131. No PR is open into the integration branch; only #70 into main.

## 11 Nov 20:30 Bangkok: HOLD LIFTED (owner: "Resume the build"); three builders on Claude Code

The owner answered the controller's question at about 20:20 with "Resume the build": three lanes, each to merge on green CI after review and then be promoted.

**Antigravity is out of quota until about 18 Nov, 08:10 Bangkok** ("Usage Limit Reached ... reset in 6 days, 11 hours"; T3 snoozed the failed threads until 2026-11-18T01:11Z).
- The first two launches failed before any tool call: P2-T14 `mcp:launch:461f0741…` and P2-T33 `mcp:launch:3e68ad43…`. Do not reuse them.
- Under the owner's rule ("if run out of ai credit please use other"), every role runs with `make_prompt.py --claude-code` until then. Implementers are Claude Code Haiku 5.5 at max effort.

**In flight** (launched threads don't wake the controller: use `t3_thread_read` or `t3_thread_wait`):

| Task | Thread | Worktree and head | Notes |
| --- | --- | --- | --- |
| P2-T14 implementer | `mcp:launch:ed82a2d8ff3f16d67c03fe23fb284697aeab3460660cb368f946fae09413c391` | `p2-t14`, fast-forwarded to `96a52c2a`, installed | P1 to P17 accepted. P2-T12 merged first, which is the brief's P15 case: a 3-way apply of `index.ts` must equal `scratch/p2-t14-rebase/` (sha256 `f74fa284…`). |
| P2-T33 implementer | `mcp:launch:ff142b9fea7604cb9452ecf629f7038a00093a215b4264199366d3779a40b20f` | `p2-t33`, fast-forwarded to `96a52c2a`, not installed (Step 1.1 installs) | P1 to P20 accepted. See the planner-rebase and `WalletCard.tsx` notes below. |
| 1B-T13 implementer | `mcp:launch:45eecdab3fa9e75c94c5c040acf48efaa67ad965a4dab26050b3f29f1a70b462` | `p1-1b-t13`, new at `96a52c2a`, with `install-edge` | The controller reviewed the brief: P1 to P25 accepted. `--lock`. Step 0.5 was pre-checked (54 of 54 OK). #396 merged first, which is the brief's P21 case. |

**P2-T33 notes:**
- **No planner rebase was needed after all.** `check_kit` flagged `index.ts` because its plain patch fails, but the head's `index.ts` is byte-identical to the planner's `PL/merge/index.p2-t12.ts`. Step 4.1's `git apply --3way` must give `PL/merge/index.t12-t33.ts` (sha256 `a3acf233…`).
- **Controller ruling for P2-T33:** Step 0.2 will list `WalletCard.tsx`, which is on its BLOCKED list. The implementer goes on. P2-T12's fix round only added `onAccessibilityTap={onPress}` to the `Pressable` branch, plus comments, and the lock preview (`LockSetupView.tsx:105`) passes no `onPress`.

**06:25 (12 Nov): CLAUDE CODE'S WEEKLY LIMIT IS SPENT until 14 Nov 03:00 Bangkok. All planning, building and reviewing moved to Antigravity Gemini.**
- **The limit.** At 03:24 every Claude Code thread failed with "You've hit your weekly limit · resets Nov 14 at 3am (Asia/Bangkok)", and T3 snoozed them until 2026-11-13T20:00Z.
  - Antigravity's Claude pool is empty until about 17 Nov.
  - Gemini 4 Argon was nearly spent on 11 Nov but accepts runs.
  - Gemini 3.8 Flash has room in each 5-hour window.
  - Cursor and Grok are nearly spent.
- **#416 (P2-T20).** CI passed 10 of 10 at `f6a2b681` after one rerun; the iOS export's hermesc crashed with SIGSEGV, and the same job had passed at `4eb15b3e` (lessons.md). The Flash second review approves.
  - **It waits for its Opus first review**, `mcp:launch:c782b7d9…`, which paused mid-probe and should resume at the reset.
  - The owner's 10 Nov routing gives money and privacy PRs an Opus review, so it does not merge on Gemini reviews alone.
- **Handed to Antigravity**, each with a resume note `scratch/dispatch/<task>-resume-20261112.md` that points at the Opus transcript and kit:

| Task | New thread | Model | Old Opus thread (archived) | Writes |
| --- | --- | --- | --- | --- |
| P3-T2 planner | `mcp:launch:8cb4f47f44c01b8510bc491c4486e3e5e2a5ef513362fa05bc05a4f0810d794a` | Argon High | `8ab58bd4…` | `briefs/P3-T2.md` |
| P3-T5 planner | `mcp:launch:84eaaf1cd7050581391d4970335f3f9b46b517b1d2a3a1b88fb9f90ca666bef3` | Argon High | `38f3e353…` | `briefs/P3-T5.md` |
| P2-T25 fix planner | `mcp:launch:a1379136a12b30ce073d8ddf8f5b909010a7d5eeef95dbd4ea857406da57084a` | Flash High | `79936cd9…` | `briefs/P2-T25-fix.md` |
| P2-T32 fix planner | `mcp:launch:ea440e4957db9462feb9a9bfa33c89ea06f523b15a19318d7f6a8725176e342e` | Flash High | `3bc47b4b…` | `briefs/P2-T32-fix.md` |
| P2-T29 brief review | `mcp:launch:ace87dce42421318826d8890e57ae2508b26992f7d04509a85b471baffa8e523` | Argon High | (none) | `reviews/P2-T29-brief.md` |
| P2-T31 brief review | `mcp:launch:a569ea765b0df6c9b03b8e2b0a6f229e7afcf5329d146fa878f016c06eefa795` | Argon High | (none) | `reviews/P2-T31-brief.md` |

- **06:35: P2-T25 fix brief READY.**
  - Flash wrote `briefs/P2-T25-fix.md` from the Opus kit, whose proofs had finished before the cutoff. The kit sums are 96 of 96 OK, and #412's head is still `b840c195`.
  - The controller accepted P1 to P18.
  - **Fixer dispatched (Flash):** `mcp:launch:8439970203930e74e21addc5f60a722f9fcc769db43c899310e3b366ea70e00b`, in worktree `p2-t25`. Step 1 merges `a00fff7c`.
  - The controller pushes its commit and updates #412's body. The Opus confirming review follows after 14 Nov 03:00.
- **20:50: #441 (P6A-T2) opened; Opus and Sonnet reviews and CI running.**
  - The implementer reported DONE at `cf538e69` on `c7f947c5` (RED 20 of 32 on assertions; GREEN 32; 51 of 51 mutants, identical to the planner's; `test:app` 36, `test:unit` 1069, routes 15). 7 of 8 `real/` files byte-identical, the receipt differing only in its base SHA. PR body `pr-p6a-t2.md`, issue #269.
  - Reviews (notes `scratch/dispatch/P6A-T2-review-notes.md`): Opus xhigh `mcp:launch:0cf9531fd1361da2de2fc162476de87ff9aaeb6395910485bdaf911e6bec4484`; Sonnet high `mcp:launch:0bc0f68e23cae5bef9d7fe692765992cb3abe0b6264f5655b5a266515a7c7222`.
  - **Open task PRs:** #439 (P2-T16), #440 (P3-T14), #441 (P6A-T2), each with two reviews running. Planners still running: 1D-T11 and 1D-T7.
- **20:45: P6A-T2 brief READY (Opus); its implementer is building (Haiku).**
  - Size M: `widgetSnapshot.ts`, `outsideCopy.draft.ts`, `useOutsideCopy.ts` and their tests (new), and `dateStep.ts` plus its test (shared; three functions appended after P2-T31's). RED 20 of 32 on assertions, GREEN 32, 51 of 51 mutants; a dry run of the brief on a fresh copy of the head.
  - `check_kit.sh` at `88f14203`: 24 of 24 sums, `orig/` 2 of 2; no code change since its base `7a29bc70`. **P1 to P20 accepted.** P17: with the Face ID lock on, every lock-screen face shows ฿•••• and no gauge figure; home-screen faces follow private mode only, and masking them under the lock is the owner's Q9.
  - Worktree `p6a-t2` on `p6a/t2-widget-snapshot` at `88f14203`, installed. Implementer `mcp:launch:100b5a534576c8646c453f2683233c58bdf8d106b96b324fcb3c6ec915e35c31`. The planner thread is archived.
  - **Reviews when it is done:** Opus (xhigh) and a Sonnet second review (the snapshot leaves the app: money and privacy).
- **20:40: #440 (P3-T14) opened; Opus and Sonnet reviews and CI running.**
  - The implementer reported DONE at `1247404f` on `2dec12ea` (RED 2 of 16 Node and 27 of 104 render on assertions; GREEN 16 and 104; 74 of 74 mutants; gate `typecheck:app`, `typecheck:routes`, `test:app` 36, `test:unit` 1052, catalogue 56, routes 16, kit eight 141, `export:web`). All 22 `real/` files byte-identical. PR body `pr-p3-t14.md`, issue #198. The consent lines stay drafts until counsel answers Q11.
  - Reviews (notes `scratch/dispatch/P3-T14-review-notes.md`): Opus xhigh `mcp:launch:0a80e83071e3e845c989029752a96be7bd872829cbe844e2cc638bae86ca8389`; Sonnet high `mcp:launch:0d57842bdc7e390e75392fffa9cbe019cceea8264cc889a6da0e3d31910025e5`.
  - Watchers: CI on #439 and #440 (`ci_watch.sh`, one each); the four verdicts and the 1D-T11, 1D-T7 and P6A-T2 kits.
- **20:35: #439 (P2-T16) opened; Opus and Sonnet reviews and CI running.**
  - The implementer reported DONE at `81f66c0e` on `afab7fd5` (RED 17 of 17 on assertions; GREEN 17, neighbours 249, catalogue 96; 86 of 86 mutants, matching the planner's line for line; gate 266 focused, routes 18, `test:app`, `test:unit`). All 8 `real/` files byte-identical. PR body `pr-p2-t16.md`, issue #162.
  - Reviews (notes `scratch/dispatch/P2-T16-review-notes.md`): Opus xhigh `mcp:launch:88a0e699c24bc48811976bdda3343e73218ab55fc6485ff6837dccc151f53021`; Sonnet high `mcp:launch:17fb31020a5887e548e5873c681fb2a989bf30291e09742ba7239b368df9ec18`.
- **20:25: P3-T14 brief READY (Opus); its implementer is building (Haiku).**
  - Size L: 14 new files under `apps/app/src/wallet/bunai/`, the route `app/settings/ai.tsx`, `bunaiSections.tsx` and `bunaiScreens.tsx`, and edits to `featureFlags.ts`, the catalogue `index.ts`, `SettingsScreen.tsx`, `CompanionSettings.tsx`, `AiConsentSheet.tsx` and `AccountRoutes.render.test.tsx`. Re-proved at `afab7fd5` after #436 and #435 (the controller first told it wrongly that it need not; corrected within the minute, lessons.md). RED 2 of 16 Node and 27 of 104 render on assertions, GREEN, 74 of 74 mutants.
  - `check_kit.sh` at `afab7fd5`: 81 of 81 sums, `orig/` 8 of 8 identical. **P1 to P19 accepted** (P3 `onDetails`; P5 `ai_enabled` = `companion && available`; P12 `bunaiScreens.tsx`; P13 the route's case in `AccountRoutes`).
  - The controller's pre-flight on the new worktree: the kit eight plus `AiConsent`, `WalletAiSettings` and `SettingsScreen` 242, routes 16, `test:unit` 1052, `typecheck:app` and `typecheck:routes`; then reset clean.
  - Worktree `p3-t14` on `p3/t14-ai-consent-settings` at `afab7fd5`, installed. Implementer `mcp:launch:b5a94c5a83095e919947f7387aec6c59fb5ea4f0e17cc416f9d51ac90c254955`. The planner thread is archived.
  - **Reviews when it is done:** Opus (xhigh) and a Sonnet second review (consent, a privacy path).
- **20:10: P2-T16 brief READY (Opus); its implementer is building (Haiku).**
  - Size L: `AddTrayHost.tsx` and `AddTray.render.test.tsx` (new), `addHostSection.tsx` (new), and one-line or one-case edits to `copy.ts`, `addSections.tsx`, `WalletsList.render.test.tsx`, `AddSteps.render.test.tsx` and `Tray.render.test.tsx`. No route, `index.ts`, package or catalog change. RED 17 of 17 on assertions, GREEN, 86 of 86 mutants.
  - `check_kit.sh` at `7a29bc70`: 28 of 28 sums, `orig/` 5 of 5 identical. **P1 to P21 accepted.**
    - Tell Bun: `TellBunSheet` stays unchanged (the plan; P3-T18 keeps its tests), so confirm shows no บันอ่านจาก line after Tell Bun, an E2-B difference. P2-T15's confirm m1 is pinned in `AddSteps.render.test.tsx`. `useDraftReview` is P3-T13's.
    - Open risk: on iOS a tray that never presented gets no `onClosed`, so later opens would wait for it (a device check).
  - The controller's pre-flight on the new worktree: the kit eight plus `AddTray` and `AddSteps` 176, routes 15, `test:unit` 1049, `typecheck:app`; then reset clean.
  - Worktree `p2-t16` on `p2/t16-add-tray-host` at `7a29bc70`, installed. Implementer `mcp:launch:7faf443aa0909c6ce4c6fbbe050c5198d88da0b1aa2988afb17847addada5ca8`. The planner thread is archived.
  - **Reviews when it is done:** Opus (xhigh) and a Sonnet second review (it saves money records).
- **20:05: two more Opus planners started** (common notes `scratch/dispatch/planner-common-notes-20261112e.md`, head `9e72d8b4`):
  - 1D-T7, the phase 1 app events (depth 7, App; privacy, so Opus and Sonnet reviews): `mcp:launch:24efbf37def9dc4a9da04ef516a46fa5dc1ba244cffe2a698dc0c2b299f25c96`, WT `p1-1d-t7` on `p1/1d-t7-app-events`. Carries followups lines 111, 177 to 180 and 601.
  - P6A-T2, the widget snapshot (depth 7, App): `mcp:launch:e1931d4fd1e7cb20880a0bed309c13878880522a6ecf72419167625881b21aa2`, WT `p6a-t2` on `p6a/t2-widget-snapshot`.
  - Live now: five Opus planners (P2-T16, P3-T14, 1D-T11, 1D-T7, P6A-T2). The server tasks P4-T3, P3-T3, P4-T2 and P5-T9 wait for 1D-T11's lane (they share `v1/routes.ts` and its neighbours).
- **20:00: #435 (P3-T7) MERGED as `bfce84e`; the head is `bfce84e`.**
  - Both reviews approved with no blocker or major (Opus: m1, m2, n1; Sonnet: m1 to m3, n1, n2), and CI was 9 of 9 at `088b346a`. A person cannot abort a model call; only the transport's deadline and the SDK's timer can.
  - Issue #191 is closed, the worktree and branch are removed, and it is promoted as **#438** (stack #379 holds 33).
  - **R116:** a request whose last call is a `sent: false` timeout gives the use back only when no earlier call in it answered; P3-T9 pins it (followups).
  - P3-T8 must carry the "refunds once" pin; P3-T9 the ask 503 refund, the rejection pin and R116. Refund caps and a per-refund log line are owner questions (followups).
  - **1D-T11 is unblocked:** its kit is planned on P3-T7's `real/` files, which are byte-identical to the merge.
  - Live now: the P2-T16, P3-T14 and 1D-T11 planners. No open task PR.
- **19:45: #436 (P5-T2) MERGED as `f034185`; the head is `f034185`.**
  - Both reviews approved with no blocker or major (Opus: m1, m2, n1; Sonnet: m1 to m3, n1 to n4), and CI was 9 of 9 at `f4041406`.
  - Issue #235 is closed, the worktree and branch are removed, and it is promoted as **#437** (stack #379 holds 32). The promotion step was cut off once after pushing its branch; the rerun opened the PR.
  - Followups for P5-T5, T10, T11, T13, T14, T17, T18a, T18b and T21 are in followups.md. The release rule is refined in the owner list (item 7): 0.3.0 is only a reading floor.
  - #435 (P3-T7): CI 9 of 9 at `088b346a`; both reviews still running.
- **19:20: #435 (P3-T7) and #436 (P5-T2) opened; four reviews and CI running.**
  - P3-T7: the implementer reported DONE at `088b346a` (RED 2 of 10 Node and 10 of 62 workers, all assertions; GREEN 10 and 62; 35 of 35 mutants; `test:edge` 196; all 12 `real/` files byte-identical). PR body `pr-p3-t7.md`, issue #191.
  - P5-T2: DONE at `f4041406` (RED 9 of 9 and 2, all assertions; GREEN; the API contract spec 95; 57 of 57 mutants; `test:edge` 204, `test:app` 36, `test:unit` 1049, the routes tests; 14 of 15 `real/` files byte-identical, the receipt differing only in its base SHA `54e889b5`). PR body `pr-p5-t2.md`, issue #235.
  - Reviews (notes `scratch/dispatch/P3-T7-review-notes.md` and `P5-T2-review-notes.md`):
    - P3-T7 Opus xhigh `mcp:launch:7dcf75a7f1e9dc736f49abf0306d6ba098a96e05cd31d18d9c063eaeea434c43`; Sonnet high `mcp:launch:0f28e064fb0947cad941e338005f4c4d8440da9913bbcbc2b20b565fe3ef80d5`.
    - P5-T2 Opus xhigh `mcp:launch:5045ae39d7fda101002e18a8ff27564e8160bfc13de44915270e4edbc1980567`; Sonnet high `mcp:launch:976e93424e3099f790bb845261ec64262b0e998a35aa08b19281a52324ad73eb`.
  - Watchers: CI `br0i27tc5` (`ci_watch.sh 115 435 436`, exits on the first to finish); verdicts and the three planners' kits `b85mh7vzf`.
  - The implementer threads are archived.
- **19:15: two more Opus planners started** (common notes `scratch/dispatch/planner-common-notes-20261112d.md`, head `27256cba`):
  - P3-T14, AI consent and settings in the Bun Wallet look (depth 9, App): `mcp:launch:f1aeaa9d8dbec3da51b62c5e5e19ee71c01815a2dfb50b11ced4142ca7b91ea7`, WT `p3-t14` on `p3/t14-ai-consent-settings`.
  - 1D-T11, server events and the analytics id (depth 8, Server): `mcp:launch:51bcdaff8cfb191a6cb11997a097b7f8d56ff29bfc4ddb8a2f1a51833e7c927b`, WT `p1-1d-t11` on `p1/1d-t11-server-events`. It shares `vault/routes.ts`, `v1/protocol.ts` and `v1/routes.ts` with P3-T7, so it plans on P3-T7's `real/` files and builds only after P3-T7 merges.
  - Live now: the P2-T16, P3-T14 and 1D-T11 planners (Opus xhigh), and the P3-T7 and P5-T2 implementers (Haiku). Next Opus work: the reviews of P3-T7 and P5-T2 (Opus and Sonnet each).
  - Not started, because they share hot edge files with P3-T7: P4-T3, P3-T3, P4-T2 and P5-T9. Ready with no overlap: 1D-T7 and P6A-T2 (depth 7).
- **19:10: #429 (P2-T21) MERGED as `c053999`; the head is `c053999`.**
  - The confirming review (Opus) approved with three minors and two nits (`reviews/P2-T21-confirm.md`), and CI was 9 of 9 at `001babaa`.
  - Issue #167 is closed, the worktree and branch are removed, and it is promoted as **#434** (stack #379 holds 31).
  - Followups: P2-T18 must carry m2 (the flow's once-only `leave()`) first, and with it m1 (the drop's `nativeID`), n1 and n2. P2-T22 gets the kind. m3 (a lost look on leaving) is an E2-B owner item.
  - The review threads are archived.
- **19:05: P3-T7 brief READY (Opus); its implementer is building (Haiku).**
  - Size S, edge only: `uses.ts` (new), `vault/ai.ts`, `vault/routes.ts` (the `ai.refund` step), `v1/protocol.ts`, `v1/routes.ts`, `ai/service.ts`, `ai/transport.ts`, and tests. RED on assertions, GREEN, 35 of 35 mutants. It carries P3-T4's m1 and P3-T6's X4 pin and n1 comment.
  - `check_kit.sh` at `9e77a022`: 48 of 48 sums, `orig/` 9 of 9 identical. **P1 to P14 accepted.**
    - P2: the refund step runs after the session ends; it has no HTTP route, and `ensureAccount` still refuses an erased vault.
    - P4: the refund runs on the catch paths only. **P3-T9 must also call `giveBack`** where `askWithEscalation` returns facts after an outage (a followup).
    - P14: no client minimum. A timed-out call may still be billed by Anthropic though its use comes back; B27 and P6C's spend alerts are the guards (owner FYI).
  - Worktree `p3-t7` on `p3/t7-ai-use-refund` at `9e77a022`, installed with the edge. Implementer `mcp:launch:de1242b6e2007e5c0a4c4112f9f4e90964e6491000d74467a1d04c59efb6e439` (notes `scratch/dispatch/P3-T7-implementer-notes.md`). The planner thread is archived.
  - **Reviews when it is done:** Opus (xhigh) and a Sonnet second review, as P3-T6 had (AI uses are counted per person per day).
- **19:15: P5-T2 brief READY (Opus); its implementer is building (Haiku).**
  - Size M: the currency fields in the contract (`wallets.ts`, `categories.ts`, `transactions.ts`, `history.ts`, `policies.ts`, `privacy.ts`, `auth.ts`, `index.ts`), the app's `resources.ts`, `diaryRepository.ts` (types only, P3) and `app.json` to 0.3.0, plus two new tests. RED on assertions, GREEN, 57 of 57 mutants, and a dry run of every brief command on a fresh copy of the head.
  - `check_kit.sh` at `9e77a022`: 60 of 60 sums, `orig/` 12 of 12 identical. **P1 to P14 accepted.**
  - The controller's pre-flight: `real/` over the new worktree passed the eight kit files (138) and `typecheck:app`, then the worktree was reset clean.
  - Worktree `p5-t2` on `p5/t2-currency-fields` at `9e77a022`, installed with the edge. Implementer `mcp:launch:4cd560a5b0e38a7c4fa76f64aa1591e626da44d13ef16e1236621fead105f16b`. The planner thread is archived. Watcher `blg6eotl6`.
  - **Reviews when it is done:** Opus (xhigh) and a Sonnet second review (money path).
  - **New owner item (deploy time):** before any server sends a phase 5 key, raise the server's minimum client versions to at least 0.3.0. Builds 0.1.0 and 0.2.0 refuse those keys and stop syncing. This joins the 0.2.0 rule for sources.
  - The planner added two notes to the controller's memory (`kit-tree-traps.md`: raw U+2028 from the Write and Edit tools, and dry-run path swaps).
- **18:50: #429 (P2-T21) fix round in; confirming review (Opus high) and CI running.**
  - The fixer reported DONE: `de3e6363` on `2411001e`, 6 files, all byte-identical to the kit; RED 5 of 31, GREEN 31, 134 of 134 mutants (the log identical to the planner's). Its thread is archived.
  - The controller merged the head as `001babaa`. One conflict, in `PlanningRoutes.render.test.tsx`: the header comment, and two tests added at the same place (P2-T21's new-wallet and edit routes, P2-T29's categories route). Both kept whole.
  - The gate on the merged tree (`scratch/p2-t21-merge/gate.out`), all passing:
    - `typecheck:app` and `typecheck:routes` 0, `test:unit` 1047;
    - the round and neighbours 143, the kit eight 141, the routes 15;
    - catalogue `bw-` 90, and the registry rule;
    - the head's wallet screens 121;
    - `export:web`, and `git diff --check` on the range.
  - Pushed; the PR body is updated.
  - Confirming review: `mcp:launch:929604ab2ee0e99fe5bb66eea6f8f8a3d039cf5f61d64b036e86312a94af97c1` (notes `scratch/dispatch/P2-T21-confirm-notes.md`), writing `reviews/P2-T21-confirm.md`.
  - Watchers: CI `b6c7ch3y4` (`ci_watch.sh 115 429`); the review file and the planners' kits `bafgl5y3u`.
  - **On approval and green CI:** `merge_task_pr.sh 429 001babaa P2-T21`, then `promote_pr.sh P2-T21 429`, then remove the `p2-t21` worktree and branch. Record the minors in `followups.md`; m3 and the credit card's opening balance are already owner items for E2-B.
- **18:20: the 5-hour window reset; work resumed.** The 13:20 window ran out at 14:36, two minutes after the planners started, and every Claude thread paused until 18:20.
  - At the reset T3 sent "Continue where you left off." to every thread the limit had paused, finished ones included. The controller stopped and archived the 8 finished ones (the P2-T15 planner, fixer and confirming review; the P2-T29 and P2-T31 confirming reviews; the P2-T21 planner, reviewer and second reviewer), and archived the two finished P3-T6 reviewers.
  - Live now: the P2-T21 fixer (Haiku, writing its gate logs in `scratch/p2-t21-fix`), and the P2-T16, P3-T7 and P5-T2 planners (Opus xhigh, their kits still empty).
  - Reran the cancelled promotion run for #422 (`43127891515`); the three runners were idle.
  - Watcher `b9amnxm2o`: the fixer's commit on `p2-t21` (from 2411001e) or any planner's `SHA256SUMS`.
  - **Pace:** the window 18:20 to 23:20 carries three Opus planners at once. Add no more Opus until one of them finishes; reviews of their builds will fall in the next window.
- **14:34: three Opus planners started** (notes: `scratch/dispatch/planner-common-notes-20261112c.md` plus each task's own):
  - P2-T16, the add tray host (critical path, depth 15): `mcp:launch:31e4a93d4ac5f5fc0a9af51e4d3a3e38ff01e4ba1d766921cf35ac613dd10c41`, WT `p2-t16` on `p2/t16-add-tray-host`.
  - P3-T7, the AI use refund: `mcp:launch:4e18771db0cf98dece123a9c66694aece9ef83fc57dbb4027900d1265737e8ba`, WT `p3-t7` on `p3/t7-ai-use-refund`.
  - P5-T2, the currency fields: `mcp:launch:442d08c63e00481b35fe57a412ce92640a0cc2e1bc10ace358bb14cade39887f`, WT `p5-t2` on `p5/t2-currency-fields`.
  - **Pace:** the 5-hour window started at 13:20. Three Opus planners plus the reviews that follow should fit; do not add more Opus until these finish.
- **14:40: P2-T21 fix brief READY (Opus, R115); its fixer is building (Haiku).** Size S, 134 of 134 mutants. The fixer is on worktree `p2-t21` at `2411001e`, with no sync merge. P22 to P35 accepted; the round continues the first round's numbering. P25 chooses leave-once over holding back, and receipts list the risk.
- **14:35: #423 (P2-T29) MERGED as `59edd56`; the head is `59edd56`.** The confirming review (Opus) approved after R113, and CI was 9 of 9 at `f7f47fa4`. Issue #175 is closed, and it is promoted as **#433** (stack #379 holds 30). The categories follow-ups are in followups.md. `index.ts` on the head now has ADD, LIST, RECORD, CATEGORY, INSIGHTS, RECAP, LOCK.
- **14:30: #427 (P2-T15) MERGED as `9860750`; the head is `9860750`.** The confirming review (Opus) approved after R114, and CI was 9 of 9 at `334847d3`. Issue #161 is closed, and it is promoted as **#432** (stack #379 holds 29). The confirm's m1 pin rides P2-T16 (followups.md).
- **14:15: #427 (P2-T15) fix round DONE and merged up.**
  - Fix `a4947e62` (Haiku, R114; amended once for the receipt line): all 9 `real/` files byte-identical, 120 of 120 mutants.
  - The controller merged the head as `334847d3`, with no conflicts. On the merged tree: tsc 0, 168 of 168, and `test:unit` 1047 of 1047.
  - Pushed, and the body is updated. CI is running.
  - Opus confirming review (Opus high): thread "P2-T15 confirming review (#427 fix)". It writes `reviews/P2-T15-confirm.md`.
- **14:05: #423 (P2-T29) fix round DONE and merged up.**
  - Fix `ed1da2aa` (Haiku, R113): all 12 `real/` files byte-identical, 119 of 119 mutants; gate kit 138, routes 13, `export:web`.
  - The controller merged the head as `f7f47fa4`. `index.ts` goes ADD, LIST, RECORD, CATEGORY, INSIGHTS, RECAP, LOCK. On the merged tree: tsc 0, 312 of 312, and `test:unit` 1044 of 1044.
  - Pushed, and the body is updated. CI is running.
  - Opus confirming review (Opus high): thread "P2-T29 confirming review (#423 fix)". It writes `reviews/P2-T29-confirm.md`.
- **13:55: P2-T15 fix brief READY (Opus, R114); its fixer is building (Haiku).**
  - Private mode quotes none of Bun's sentence. Next waits on archived or unknown wallets (`inUse`; `TransferFooter` takes `wallets`, which P2-T16 must pass). Every gap is pinned, and the sections are lazy.
  - 120 of 120 mutants. Kit sums 32 of 32.
  - Fixer on worktree `p2-t15` at `fd41909c`, with no sync merge. P1 to P33 accepted.
- **13:50: #429 (P2-T21): Opus says NEEDS FIXES** (Sonnet approved; CI 9 of 9).
  - **M1:** after an unconfirmed create, especially with a blocked resend, every control on step 2 is held, and on iOS in the wallet area nothing leaves the screen.
  - The minors: m1 (a late save goes back twice), m2 (six unheld guards, Y7 on money), m3 (the tracking start cannot be changed in the wallet area, an owner call at E2-B), n1 (the card drop) and n2 (a ฿0 in private mode).
  - **R115:** back is held only while saving and leaves the flow while unconfirmed or blocked; one navigation; the pins PR1, PR4, PR7, PR8, Y6, Y8 and Y9; m3 stays text with the consequence stated (owner); n1 and n2 fixed.
  - The fix round went back to the original Opus planner `a35bacd7…` (run 4), writing `briefs/P2-T21-fix.md` with the kit at `scratch/p2-t21-fix-planner/`, on `2411001e`.
- **13:45: #421 (P2-T31) MERGED as `ce165ed`; the head is `ce165ed`.**
  - The confirming review (Opus) approved after the R112 round, and CI was 9 of 9 at `f72ad233`.
  - Issue #177 is closed, and it is promoted as **#431** (stack #379 holds 28). The insights follow-ups (m1 before E2-C, and 14 pins) are in followups.md.
  - `index.ts` on the head is now ADD, LIST, RECORD, INSIGHTS, RECAP, LOCK. **#423 (P2-T29)** needs CATEGORY between RECORD and INSIGHTS when its fix lands.
- **13:40: #428 (P3-T6) MERGED as `d0f1897`; the head is `d0f1897`.** Opus and Sonnet approved, and CI was 9 of 9 on attempt 3 (R-B twice). Issue #190 is closed, and it is promoted as **#430** (stack #379 holds 27). m1 must ride P3-T8 (followups.md).
- **13:30: P2-T29 fix brief READY (Opus, R113); its fixer is building (Haiku).**
  - 119 of 119 mutants. The gate holds the 12 Nov rules. `index.ts` is unchanged (`911e4ce0…`), so the controller resolves RECORD and RECAP at merge.
  - Fixer on worktree `p2-t29` at `cee7eff5`, with no sync merge. P1 to P28 accepted.
  - Risk: no route mounts `WalletLooksProvider` until P2-T18, so a picked icon is not kept on a phone before then.
- **13:25: Claude Code's 5-hour limit stopped everything from about 09:41 to 13:20, the controller included.** At 13:20 T3 resumed every paused thread.
  - **Stopped 7 resumed threads that had already finished:**
    - the P3-T6, P2-T15 and P2-T21 implementers;
    - the P2-T31 fix planner and the P2-T21 planner;
    - both P2-T15 reviewers.
  - Archived the old P2-T20 implementer, which was snoozed to resume on 14 Nov after its PR had merged.
  - **Continuing legitimately:**
    - Opus: P3-T6 reviewer, P2-T21 reviewer, P2-T31 confirmer, P2-T29 fix planner, and P2-T15 fix planner (`f193feb1`, run 3);
    - Sonnet: the P3-T6 and P2-T21 second reviewers.
  - That load (5 Opus plus 2 Sonnet plus the controller) is the one that ran the window out; launch no more Opus until some finish.
  - Heavy lock free. Runners online. The `node --test` process seen is another project's.
  - **CI:** #421 9 of 9 at `f72ad233` (waiting for the confirming review); #427 9 of 9 (fix round); #429 9 of 9 (reviews running).
    - #428 hit R-B twice (attempts 1 and 2), and attempt 3 is running on idle runners.
    - **R-B is the owner's item 0:** an `apps/api` migration `0020_receipt_copy_once.sql` that needs the API's migration step, so it is a deploy decision.
  - Background watchers now run with `timeout 7200000`; the default 30 minutes killed the last ones.
- **10:15: #429 (P2-T21) opened.** Head `2411001e`, built by Haiku. The controller checked all 18 `real/` files byte-identical; 109 of 109 mutants; the gate passed (routes, `export:web` and the kit files).
  - Opus reviewer: thread "P2-T21 reviewer (#429)". It writes `reviews/P2-T21.md`.
  - Sonnet second reviewer: thread "P2-T21 second reviewer (#429)". It writes `reviews/P2-T21-second.md`.
- **10:10: #421 (P2-T31) fix round DONE and merged up.**
  - Fix `91d7e926` (Haiku, R112): all 16 `real/` files byte-identical, 127 of 127 mutants.
  - The controller merged the head as `f72ad233`. `index.ts` goes ADD, LIST, RECORD, INSIGHTS, RECAP, LOCK. On the merged tree: tsc 0, 217 of 217 focused, and `test:unit` 1042 of 1042.
  - Pushed, and the PR body is updated. CI is running.
  - Opus confirming review (Opus high, chosen over make_prompt's Sonnet because this round was big and money and privacy are at stake): see the thread titled "P2-T31 confirming review"; it writes `reviews/P2-T31-confirm.md`.
- **#428 (P3-T6):** the SQL job hit the R-B flake again (P3-T6 touches no `apps/api`), so it was rerun once. **R-B now costs a rerun on most PRs**; the owner decision on the prepared `apps/api` migration fix is still open.
- **10:00: #427 (P2-T15): both reviews say NEEDS FIXES** (CI green 9 of 9).
  - **M1, in both:** private mode masks digits only, so Thai number words in Bun's sentence show the amount.
  - Also: m1 (Next ignores an archived side), pins for survivors and accessibility, and nits including n4 (eager sections).
  - **R114:** in private mode do not draw Bun's sentence at all (a line that does not quote it). Next waits on archived or unknown sides. Pin every survivor and gap. Load the sections lazily.
  - The fix round went back to the original Opus planner `f193feb1…` (run 2), writing `briefs/P2-T15-fix.md` with the kit at `scratch/p2-t15-fix-planner/`, on `fd41909c`.
- **09:50: #428 (P3-T6) opened.** Head `8b528df1`, built by Haiku. The controller checked 20 of 21 `real/` files byte-identical (the receipt only adds "as accepted by the controller"); 30 of 30 mutants.
  - Opus reviewer `mcp:launch:7af3cde0bab339da1916635e5abc6cb2713cd4fab4cfb1ad2caa7d968955eb0a` writes `reviews/P3-T6.md`.
  - Sonnet second reviewer `mcp:launch:7f8ac96f0cd5645510cb20962d374acd6306b633e8d67d1da87e4154feb9e037` writes `reviews/P3-T6-second.md`.
  - CI is running (`ci_watch.sh 115 427 428`).
- **09:40: P2-T31 fix brief READY (Opus, R112); its fixer is building (Haiku).**
  - 127 of 127 mutants. The gate includes the catalogue-index kit files and `test:unit`. Sections load lazily. `dateStep.ts` gains `monthShortLabel` and `shortDateLabel` (additive).
  - Fixer on worktree `p2-t31` at `afc19276`, with no sync merge. P1 to P23 accepted.
  - **After its commit:** check the kit, push, then merge the head into the branch. `index.ts` goes KIT, STACK, TRAY, ADD, LIST, RECORD, (CATEGORY when #423 lands), INSIGHTS, RECAP, LOCK. Then CI, then the Opus confirming review.
- **09:35: #427 (P2-T15) opened; P2-T21 building.**
  - **#427 (P2-T15):** head `fd41909c`, built by Haiku. The controller checked all 7 `real/` files byte-identical; 104 of 104 mutants, matching the planner.
    - Opus reviewer `mcp:launch:4b36bd564c682ce13a5243d00f8858d781da321e1c4af0788974d581bdae37b2` writes `reviews/P2-T15.md`.
    - Sonnet second reviewer `mcp:launch:62f8743d31ad1a4718ee4ef32ae02cd8c170392370e42a1a3c34397c9e024d28` writes `reviews/P2-T15-second.md`.
    - CI is running.
  - **P2-T21 brief READY (Opus):** kit sums 55 of 55, 109 of 109 mutants, new routes `app/spend/wallet/new.tsx` and `[id]/edit.tsx`.
    - The controller's pre-flight on the kit over the head: tsc 0; the eight catalogue-index kit files, the new suites and the routes 175 of 175; `test:unit` 1037 of 1037. Then the worktree was reset.
    - Worktree `p2-t21` (`p2/t21-wallet-edit`) at `150cfb82`, installed. P1 to P21 accepted. Implementer: Haiku 5.5 max.
  - **The pre-flight is now routine for UI briefs.** Lay `real/` over a fresh worktree, run the catalogue-index files, the routes and `test:unit`, then `git checkout -- . && git clean -fd apps docs` before dispatch.
- **09:20: #420 (P3-T2) MERGED as `25ce266`; the head is `25ce266`.**
  - Opus approved, the second review (Claude Sonnet 5.5) approved, and CI was 9 of 9.
  - Issue #186 is closed and it is promoted as **#426** (stack #379 holds 26). The release rule (client minimum 0.2.0) is in followups.md for the owner and P6C.
  - **P3-T6 is building (Haiku 5.5 max, `--lock`).** Worktree `p3-t6` on `p3/t6-haiku-first` at `25ce2661`, with `install-edge`. The kit holds there (72 of 72 sums, 16 of 16 originals). P1 to P13 accepted.
- **09:10: P2-T15 brief READY (Opus) and building on Haiku.**
  - Kit sums 25 of 25, 104 of 104 mutants. Its sections join `addSections.tsx`, and `index.ts` is untouched.
  - **The controller's pre-flight:** the kit's `real/` laid over the head gave the eight catalogue-index kit files plus `AddSteps` 152 of 152, and `test:unit` 1035 of 1035. Then the worktree was reset clean.
  - Worktree `p2-t15` (`p2/t15-transfer-confirm-pick`) is new at `9a7b767e`, installed. P1 to P19 accepted.
  - Implementer (Haiku 5.5 max): see the thread titled "P2-T15 implementer".
- **09:00: GEMINI FLASH IS OUT OF QUOTA TOO** ("Error 429, Individual quota reached", from 07:46 until about 14 Nov 09:58 Bangkok, per T3's snooze of 2026-11-14T02:57:58Z). With Argon and Antigravity's Claude also out, **every lane runs on Claude Code**: `make_prompt.py --claude-code`, which means Haiku 5.5 max builds and fixes, Opus plans and reviews, and Sonnet 5.5 confirms.
  - The failed Flash threads were archived so they do not resume on 14 Nov: P3-T2's second review, P2-T29's second review, and P2-T31's second review, which had already approved.
  - **#420 (P3-T2):** CI is now 9 of 9 at `182f3054` (the R-B rerun passed), and Opus approved. The second review was moved to Claude Sonnet 5.5 high to keep two reviews on the vault migration: `mcp:launch:79573ece84af1bbfd409afb9d5ed95afa3d9284c922d090333949b8195a242d1`, writing `reviews/P3-T2-second.md`. **It merges when that approves.**
  - **P3-T6 brief READY** (Opus; kit `scratch/p3-t6-planner`, 72 sums; 30 of 30 mutants; built on `964f6c0e` plus #420's `182f3054`). Its builder (Haiku) starts once #420 merges, from a new worktree `p3-t6` on `p3/t6-haiku-first`.
    - Rulings P2 to P5 go beyond the plan: type-only fixture edits in `companionSections.tsx` and three render tests; `ai.test.ts`'s env case; the deadline clock; and fake-clock carries.
- **08:50: #412 (P2-T25) MERGED as `82b9669`; the head is `82b9669`.**
  - The confirming review approved, and CI was 9 of 9 at `6e2541a2`.
  - Issue #171 is closed and it is promoted as **#425** (stack #379 holds 25).
  - `index.ts` on the head is now ADD, LIST, RECORD, RECAP, LOCK (`a07ed204…`). #421 (P2-T31) and #423 (P2-T29) each need a merge of the head once their fix rounds land: CATEGORY goes after RECORD, and INSIGHTS after CATEGORY, before RECAP.
- **08:40: #423 (P2-T29): Opus says NEEDS FIXES**, with 4 blockers and 12 majors (`reviews/P2-T29.md`).
  - The blockers:
    - B1: the Hermes guard (`globalThis.crypto`) fails `test:unit`;
    - B2: eight kit render files can't load the eager catalogue import of `expo-crypto`;
    - B3: unnamed text fields;
    - B4: an unconfirmed save makes a duplicate category.
  - CI was red; the run was cancelled.
  - **R113:** fix every blocker, major and minor; m2 and m6 are required; the files may be rewritten. The gate is widened: `test:unit`, the eight kit files, the catalogue's `bw-categor` suites and the routes tests.
  - Fix planner (Opus): `mcp:launch:aba488d99e4d62e1879dd2e40b416acd0351c31a6dded1e13b422ad157f50fd5`, writing `briefs/P2-T29-fix.md` with the kit at `scratch/p2-t29-fix-planner/`, on `cee7eff5`.
  - **Routing (lessons.md):** UI screens are planned on Opus from now on. A Flash brief review is not enough.
- **08:30: #411 (P2-T32) MERGED as `ab9f2c1`; the head is `ab9f2c1`.**
  - The confirming review approved, and CI was 9 of 9 at `764ea0ac`.
  - Issue #178 is closed and it is promoted as **#424** (stack #379 holds 24). Its carriers are in followups.md (n3 must land before E2-C).
  - **#412 (P2-T25):** the head was merged again as `6e2541a2`. `index.ts` is the kit's final `a07ed204…`: ADD, LIST, RECORD, RECAP, LOCK. On the merged tree: tsc 0, and 61 of 61.
    - The stale run on `a6aaee0b` was cancelled, and CI is running at `6e2541a2`. It merges when green.
  - **#420 (P3-T2):** the SQL job hit the documented R-B flake (`attachments.integration.spec.ts`, expected 1, got 2; P3-T2 touches no `apps/api`). Rerun once with `--failed`. Its Flash second review is still running.
  - **CI watching:** the new `C/ci_watch.sh <cap> <prs...>` reports each PR head once as its checks finish.
- **08:20: #421 (P2-T31): Opus says NEEDS FIXES**, with 8 majors (`reviews/P2-T31.md`).
  - The majors: sync blanks the screen, the budget line is off-scale, private mode marks empty days, wrong early-state dates, money not exact (`Math.round(Number())`), a failed compare month drawn as ฿0, hard-coded Thai, and 15 unheld guards. There are 11 minors and 7 nits.
  - Both Flash reviews (brief and second) had approved it, so an Opus gate on Flash-planned UI stays required.
  - **R112:** fix every major and minor as the review proposes, and stop BLOCKED where the plan cannot settle a question. The notes are in `scratch/dispatch/P2-T31-fix-planner-notes.md`.
  - Fix planner (Opus): `mcp:launch:107b72851c10606aeb3ce21e75bea5afcdbf24b0ee096246265d90f6839874ba`. It writes `briefs/P2-T31-fix.md`, with the kit at `scratch/p2-t31-fix-planner/`, on `afc19276`.
- **08:15: CI was the bottleneck. A third local runner is up (`runners.sh up 3`, `jotbun-runner-3`).**
  - Six runs of 9 jobs were queued behind two busy runners. The Colima VM has 10 CPUs and 32 GiB, thermal pressure was 0 and 58% of memory was free.
  - The promotion run for #422 was cancelled to let task PRs go first. **Rerun it when the queue is idle:** `gh run rerun 43127891515 --repo mygogocash/jotbun`.
  - **#420 (P3-T2): Opus APPROVED** (m1, m2, n1 to n3). Flash's second review is running.
  - **m2's release rule, for the owner and P6C:** raise the server's client minimum (`MIN_CLIENT_VERSION_IOS` and `_ANDROID`, or KV `client_versions`) to at least 0.2.0 before any build sends a source. A 0.1.0 build's `isTransactionSnapshot` refuses a snapshot carrying `source`.
- **08:05: #423 (P2-T29) opened, and three Opus planners started.**
  - **#423 (P2-T29):** head `cee7eff5`. The controller checked 9 of 10 `real/` files byte-identical, and `index.ts` equals the proven `911e4ce0…`.
    - Opus reviewer `mcp:launch:951238c9df0e081ca25bf00475e6972b6668ed55dfa3b4629c55c1e187ca6d4d` writes `reviews/P2-T29.md`.
    - Flash second reviewer `mcp:launch:d895f4ff7d236dd310b34a7fdeabe9795753f784f38ab6b5fdcd11f44f2c8f1b` writes `reviews/P2-T29-second.md`.
  - **#421 (P2-T31):** Flash's second review APPROVED. The Opus review is running.
  - **Planners (Opus, `--claude-code`, notes `scratch/dispatch/planner-common-notes-20261112b.md` plus each task's own):**
    - P2-T15, transfer, confirm and pick (critical path, depth 16): `mcp:launch:f193feb1faa3da6812da774bd19f8122914f790daec19c9b6cc1b9ecf483d6f4`, WT `p2-t15` on `p2/t15-transfer-confirm-pick`.
    - P2-T21, new wallet, edit and correction (depth 13): `mcp:launch:a35bacd79458b3a708da5497d4601a20d85ec522f8962d523e0d752b77823853`, WT `p2-t21` on `p2/t21-wallet-edit`.
    - P3-T6, Haiku first (depth 10): `mcp:launch:a0660c57000d5b119f09062b69f6e70ffd61008c30f6be47b759e78fe374a45a`, WT `p3-t6` on `p3/t6-haiku-first`. It plans on P3-T2's `real/` for `ai.ts` and `index.ts`, and starts after #420 merges.
- **07:55: #411 (P2-T32): the confirming review APPROVED at `9add4415`** (m1 to m3, n1 to n3 in followups.md; n3 must land before E2-C).
  - The controller merged the head as `764ea0ac`. `index.ts` is the kit's proven `merge/index.t20-t32.ts` (`ddd2e6a0…`): ADD, LIST, RECAP, LOCK.
  - On the merged tree: tsc 0, and 98 of 98. CI is running.
  - **#412 and #411 conflict with each other in `index.ts`.** Whichever merges second needs one more merge of the head. Use the final file `a07ed2049044…` (`scratch/p2-t25-fix-planner/merge/orders/*/3-*.ts` or `scratch/p2-t32-fix-planner/merge/index.t20-t25-t32.ts`).
- **07:55: P2-T29 brief reworked and building.**
  - The controller checked each review fix in `real/`: wrapping, the 56 × 44 switch, no hex, `tc` fallbacks, and `ThaiPackTray`'s error.
  - `index.ts` takes the planner's proven `logs/merge/index.t20-t29.ts` (`911e4ce0…`), amended in the notes.
  - The worktree was fast-forwarded to `8434af6`. P1 to P11 accepted.
  - Implementer (Flash): `mcp:launch:202e13d53adef2adef762589c06f4250fcf19739da8ba6cea3f60960c07e4cd1`.
- **07:45: #418 (P3-T5) MERGED as `8434af6`; the head is `8434af6`.**
  - Opus approved (m1 to m3, n1 to n5), Flash approved, and CI was 9 of 9.
  - Issue #189 is closed and it is promoted as **#422** (stack #379 holds 23). Its minors go to P3-T13, P3-T17, P3-T18, P3-T20, P3-T21 and P3-T22 in followups.md.
  - #420 (P3-T2) shares `events.ts`, and the 3-way merge was proven clean.
- **07:44: #412 (P2-T25): the confirming review APPROVED at `272aa84b`** (m1, n1 to n3 in followups.md).
  - The controller merged the head as `a6aaee0b`. `index.ts` is the kit's proven file for #416 then #412 (`6a4b1644…`): ADD, LIST, RECORD, LOCK.
  - On the merged tree: tsc 0, and 65 of 65.
  - CI is running on `a6aaee0b`. It merges when green.
- **07:40: two more PRs open, each with an Opus review and a Flash second review.**
  - **#420 (P3-T2)**, head `182f3054`.
    - The controller checked 17 of 18 `real/` files byte-identical. The receipt corrects the brief's worker total from 34 to 33; the planner's own red log shows 33.
    - Opus reviewer `mcp:launch:1694057e88c94de16d1ec26cf1914dc3c8298b0e87ec229e8ecd2f32ec94fb7e` writes `reviews/P3-T2.md`.
    - Flash second reviewer `mcp:launch:e828ca97f02d672488efd6a19c60f30b4020cc13f63b6620a53f8d774721bf25` writes `reviews/P3-T2-second.md`.
  - **#421 (P2-T31)**, head `afc19276`, the controller's merge of the head with #416.
    - `index.ts` is the kit's proven `index.t20-then-t31.ts` (`7e85c123…`). On the merged tree: tsc 0, and 45 of 45 in 7 files. All 15 `real/` files are byte-identical.
    - Opus reviewer `mcp:launch:ef3aeec45b9cf96c3dd96d0b62119cef25672ae4c223a557dde368b5ea363fa6` writes `reviews/P2-T31.md`.
    - Flash second reviewer `mcp:launch:d051e1237a455348fb57c93bad3c46ba2bd7aaa8c7a816aaaee40870b5ab6f1c` writes `reviews/P2-T31-second.md`.
  - **#418 (P3-T5):** Flash's second review approved, and CI is green 9 of 9 at `9a6722c3`. The Opus first review is running.
- **07:30: #416 (P2-T20) MERGED as `0bfd58a`; the head is `0bfd58a`.**
  - Opus approved at `4eb15b3e` (m1 to m3, n1). Flash's second review approved, and CI was green at `f6a2b681`.
  - Issue #166 is closed, the worktree and branch are removed, and it is promoted as **#419** (stack #379 holds 22).
  - followups.md has R111 for m1: the held line shows only when it reconciles (P2-T24). The pins PA, PB and PF go to P2-T24.
  - **Next for #412 and #411:** each now conflicts in `index.ts` (LIST is on the head). After each confirming review approves, the controller merges the head into the branch.
    - #412's resolution is ADD, LIST, RECORD, LOCK; check it against Appendix B of `briefs/P2-T25-fix.md`.
    - #411's is ADD, LIST, RECAP, LOCK; check it against `scratch/p2-t32-fix-planner/logs/merge-proofs.log`.
    - Then CI, then merge with the merge commit as the head (as #416 was).
- **07:25: P2-T31 brief reworked and building.**
  - The Flash planner fixed B1 and M1: `InsightsRoutes` stubs `WalletInsightsScreen`, and there is a wallet-flag case.
  - The controller checked it: kit sums 44 of 44, and the merge with #411's `9add4415` is clean both ways (`f4e1b70f…`).
  - The worktree `p2-t31` was fast-forwarded from `36830ebb` to `fae273e5`; the lockfile is unchanged. P1 to P11 accepted.
  - Implementer (Flash): `mcp:launch:904824422d85d7a97dbd0aeb5ccb72b3f9676a679ce2097e71e90da2cdfe9298`.
  - The P2-T29 rework is still running on its planner `11bf3529…`.
- **07:20: CLAUDE IS BACK.** The owner said "Credit already reset"; the resumed #416 reviewer ran, which confirms it. None of the archived Opus planners resumed. The SPREAD routing applies again: Opus for first and confirming reviews, Flash for builds and second reviews.
  - **#416 (P2-T20):** the Opus reviewer `c782b7d9…` resumed with its context, run 3. It was told CI is green and to add the routes tests. It had X1, X2, X3, X7 and X7r surviving among its own mutants. Writes `reviews/P2-T20.md`.
  - **#418 (P3-T5, new):** opened from `9a6722c3`. The controller checked it: all 8 `real/` files are byte-identical.
    - Opus reviewer `mcp:launch:54fa02e388e7c24995fef27b9f553bd0d55b42e19de51cfdaffdcbb9c81729e5` writes `reviews/P3-T5.md`.
    - Flash second reviewer `mcp:launch:bf5a4e3d2bab40fcb9085d869cdecd167932a6b9ebf4eda364ebcc8da8d6bf1f` writes `reviews/P3-T5-second.md`.
  - **#412 confirming review (Opus):** `mcp:launch:b4d281284fb77de1442b6cfddacc53585b681922a1c9b0c5d10a13c4d81b890b`, at `272aa84b`. Writes `reviews/P2-T25-confirm.md`.
  - **#411 confirming review (Opus):** `mcp:launch:11dd823100b91dbaec2b4dbbf2ec7387ac549d183047e61f5bde8a488c0e0c65`, at `9add4415`. Writes `reviews/P2-T32-confirm.md`.
  - Each confirming review checks the controller's routes-test stub commit independently.
- **07:15: #411 green 9 of 9 at `9add4415`, and #412 green 9 of 9 at `272aa84b`.** Both wait only for their Opus confirming reviews (14 Nov from 03:00), as does #416's first review.
  - The P3-T2 kit's two nested repositories had been committed as gitlinks. They are now plain files (`15a32561`), and `sync_state` and `check_kit` skip nested `.git` sums (lessons.md).
- **07:10: two builders on Flash, two Flash briefs back with their planners.**
  - **P3-T5 built:** brief READY (21 of 21 sums, P1 to P8 accepted). Worktree `p3-t5` (`p3/t5-draft-review`) is new at `e8de291d`. Implementer `mcp:launch:ac24bb4fba73b7eb7efbf6c5250f4d862ad9ada2eb9ab26c9cb7020e1adcb8b1`.
  - **P3-T2 built:** brief READY (224 of 224 sums, P1 to P9 accepted). Worktree `p3-t2` (`p3/t2-transaction-source`) has `install-edge`. Implementer `mcp:launch:999ef88c17e1038764bf0574381259d14a12621076fb1cb7c26758f9641961d5`, `--lock`.
    - The notes amend Step 0.3 to 224 lines; the brief says 222.
    - The `expo.version` bump to 0.2.0 is the plan's own Step 3.
    - `events.ts` with P3-T5 merges cleanly both ways (`git merge-file`, same result).
  - **P2-T29 brief review (Flash): Needs fixes.** It found a one-line clamp, 38 pt and 28 pt controls, raw hex, English fallbacks, and a silent `ThaiPackTray` failure. Sent back to its planner `11bf3529…` (run 4).
  - **P2-T31 brief review (Flash): Needs fixes.** B1: `InsightsRoutes` cannot load the unstubbed `WalletInsightsScreen`. Sent back to its planner `92c37c30…` (run 4), with merge proofs required against #411's `9add4415` stub in the same file.
- **07:00: Gemini 4 Argon's quota is spent too, until about 14 Nov 07:49 Bangkok** ("Usage Limit Reached ... reset in 2 days, 1 hour", 06:19). All four Argon threads failed within minutes and were archived. They are relaunched on **Gemini 3.8 Flash High**, which is now the only lane with quota, with their prompts amended:

| Task | Flash thread | Writes |
| --- | --- | --- |
| P3-T2 planner (resume) | `mcp:launch:2f9c7b68c3e87852698db3fb669e72effcbd0c7315daef0e80cba8e68fec20fe` | `briefs/P3-T2.md` |
| P3-T5 planner (resume) | `mcp:launch:e786e23313d4506ef35cd8d8622ceeb9b4da7276bd3228c86b52671c2397fc35` | `briefs/P3-T5.md` |
| P2-T29 brief review | `mcp:launch:14bce5dde6d43967daa65f0861fa29211e339703d8c10928c2eb13487c5d32c0` | `reviews/P2-T29-brief.md` |
| P2-T31 brief review | `mcp:launch:0721e78bb0fc927712f72ce1bf002e5bcf3ac0db6c52779a1018c7dc90a83cae` | `reviews/P2-T31-brief.md` |

- **The routes tests (lessons.md, make_prompt RULES).**
  - #412's CI went red: `SpendRoutes.render.test.tsx` could not load the real `WalletDeletedScreen` after the fix gave it `useSafeAreaInsets`. The controller fix `272aa84b` stubs that screen, and CI is rerunning.
  - #411 had the same fault in `InsightsRoutes`, caught before the push. The controller fix is `9add4415`, on top of the Flash fix `b4a99b6e` (all 16 kit files byte-identical). It is pushed, and CI is running.
  - The fast gate now always runs the four routes tests when a screen a route imports changes.
- **06:50: P2-T25 fix DONE and pushed: #412 head `0be9ba27`.**
  - The commit sits on the merge `52d647bf` of `a00fff7c`.
  - The controller checked it: all 8 `real/` files are byte-identical, and the merged `index.ts` equals the kit's `merge/index.ts`.
  - The fixer reports RED 8 of 15 plus 2 catalogue cases (all assertions), 6 of 6 pins, GREEN, 48 of 48 mutants, and the gate passing.
  - The PR body is updated. CI is running.
  - **It merges after the Opus confirming review (14 Nov, from 03:00) with CI green.**
- **06:42: P2-T32 fix brief READY.**
  - Flash wrote `briefs/P2-T32-fix.md` from the Opus kit. It reran and restored the 91 mutants, and found no mutant left in the proof tree.
  - The kit sums are 69 of 69 OK, and #411's head is still `71b2255e`.
  - The controller accepted P1 to P16.
  - **Fixer dispatched (Flash):** `mcp:launch:48767a615b887ee875265631e807ec99f364f3bb21aeec672b248e4654225235`, in worktree `p2-t32`. Step 1 merges the moving head, which differs from `a00fff7c` only in `.claude/`.
  - The Opus confirming review follows after 14 Nov 03:00.
- **The old Opus planner threads.** `t3_thread_interrupt` gave `no_active_run`, so they were archived instead. **At 03:00 on 14 Nov, check that none resumed, and stop any that did**; otherwise they would overwrite the Gemini briefs.
- **Next steps:**
  - **A brief lands:** run check_kit, rule on its P-calls, create the worktree, then dispatch a Flash implementer (`make_prompt.py implementer <task> --spread`).
  - **A brief review says Needs fixes:** send it to the same Flash planner thread (P2-T29 `11bf3529…`, P2-T31 `92c37c30…`).
  - **A fix brief lands:** dispatch a Flash fixer, push, and update the PR body. The confirming review waits for Opus on 14 Nov.
- **This controller session still answers** during the weekly limit, so it may be drawing paid extra usage. The owner was told at 06:25.

**03:25 (12 Nov): Claude Code's 5-hour limit stopped everything from 01:15 to 03:10, the controller included. #406 (P2-T33) MERGED; the head is `a00fff7`.**
- **The limit.** At 01:15 every Claude Code thread paused with "resets 3:10am", and the controller's session ended.
  - At 03:10 T3 resumed them all, including the finished P2-T14 confirming review and the DONE P2-T20 builder. Both were stopped.
  - The Mac stayed awake (caffeinate), and CI ran on.
- **#406:** CI passed 9 of 9 at `c07be421`. Merged as `a00fff7` and promoted as **#417**. Stack #379 holds 21 PRs. The followups are marked merged.
- **#416 (P2-T20):** the integration head was merged in as `f6a2b681`.
  - `index.ts` is ADD, LIST and then LOCK, in plan order (sha256 e086e8a0).
  - On the merged tree: tsc exit 0, and walletHarness, WalletsList, Lock and Tray pass 86 of 86.
  - CI is restarting on it. The Opus reviewer (resumed) was told the head moved.
  - The **Flash second review** is dispatched: `mcp:launch:ea82daf6f5087aab2ff4633f122542ab465c51e41f8ec00d1d201c04015de3d4`, writing `reviews/P2-T20-second.md`.
- **Antigravity is back** (its quota reset at about 02:43). The P2-T29 and P2-T31 Flash planners were resumed with `scratch/dispatch/flash-ui-planner-checklist-20261112.md`.
  - That file gives the new head and merge proofs with #416, and the ten things the 11 Nov Flash UI plans missed.
  - **Each brief gets an Opus brief review before any build**, to save the Opus budget (lessons.md).
- **Running on Opus** (resumed at 03:10):
  - the P2-T25 fix planner;
  - the P2-T32 fix planner (told `a00fff7`, and merge proofs with #416 and #412);
  - the P3-T2 planner;
  - the P3-T5 planner;
  - the P2-T20 reviewer.

**01:17 (12 Nov): P2-T20 is built and opened as #416, with its Opus review running.**
- **The build:** the Haiku builder reported DONE at `4eb15b3e`.
  - RED was all assertions. GREEN: Node 8, render 16, neighbours 177, catalogue 32. All 84 mutants were killed, and the R100 gate passed (193 focused render tests and the web export).
  - The controller checked all 10 `real/` files: byte-identical, with `index.ts` matching the 3-way copy.
- **PR #416** (body `pr-p2-t20.md`, issue #166).
- **First review**, on Opus xhigh: `mcp:launch:c782b7d9ee6e9c21d706235b3b7e799bfcf60fc89cc1ea25052d3721f4ad437f`. It writes `reviews/P2-T20.md`.
- **Second review** (the list shows balances and private mode): Gemini 3.8 Flash after about 02:43, when Antigravity's quota resets (`make_prompt.py second P2-T20 --spread`).
- **When #406 merges first:** merge the head into `p2/t20-wallets-list`, with `index.ts` giving ADD, LIST and then LOCK. Push, then merge on green and approved.

**01:10 (12 Nov): #407 (P2-T14) and #410 (P3-T4) MERGED; the head is `431ea63`. Antigravity's Gemini quota ran out at 00:48 (it resets at about 02:43), so work runs on Claude Code.**
- **#407:** merged as `7cf4927` at `28b9d5ac` and promoted as **#414**. Its carried notes are in followups.md (P2-T16, P2-T27, P2-T37, P2-T15, E2-B).
- **#410:** the rerun was green, 9 of 9. Merged as `431ea63` at `a68fcd81` and promoted as **#415**. Stack #379 holds 20 PRs.
- **#406 (P2-T33):** the integration head was merged in as `c07be421`.
  - `index.ts` came from the kit's `merge/index.t14-t12-t33.ts` (sha256 6b9dda7e).
  - `draftText.test.ts` auto-merged to exactly `merge/draft.t14-t33.ts` (80eba034).
  - On the merged tree: app typecheck clean, walletHarness 9 of 9, draftText 4 of 4.
  - CI is running (background `wait_ci.sh 406`). **Merge on green with `merge_task_pr.sh 406 c07be421 P2-T33`, then `promote_pr.sh P2-T33 406`.** Its carried notes are already in followups.md.
- **#408 (promote/1b-t13):** its SQL job failed on `shared-rate-limit` "two API replicas share one write budget" while the head changed nothing in `apps/api`. Rerun once; it is a candidate flake in lessons.md.
- **Antigravity out:** the P2-T29 and P2-T31 Flash planners stopped at "Usage Limit Reached" with no brief.
  - Both threads are stopped. Their partial scratch folders are unused.
  - **Replan both on Opus** (`--claude-code`; they are UI tasks) once the two fix planners finish. Before the new planner starts, move `scratch/p2-t29-planner` and `scratch/p2-t31-planner` aside as `*-flash-partial`.
- **Dispatched on Claude Code:**
  - **P2-T20 build**, on Haiku 5.5 max: `mcp:launch:27ea997159a686c7a55050530618263d9e26b05f5a6019b8ede6563e5d506331`. WT `p2-t20` (installed), branch `p2/t20-wallets-list`, from `7cf4927`.
    - Its kit held at `7cf4927`. The `index.ts` 3-way copy is in `scratch/p2-t20-rebased/`. P1 to P15 are accepted.
    - The builder must not merge the head in; the controller does that at PR time, because #406's LOCK spread lands first.
  - **P3-T2 planner** (record source; depth 10), on Opus xhigh: `mcp:launch:8ab58bd4ae7bbfaac790e5ea057b76bc965bda96f7316d266eaa1e121f85f3f3`. Notes `scratch/dispatch/P3-T2-planner-notes-full.md`; it carries P5-T4's vault-migration followups.
  - **P3-T5 planner** (the Bun AI emitters and the draft review; depth 10), on Opus xhigh: `mcp:launch:38f3e35386a8880a778c846fb661b0491232bd80247bdb478a03fa82ae8546fd`.
  - P3-T2 and P3-T5 share `apps/app/src/analytics/events.ts`. Each keeps its edit to one additive block, and the second to merge takes a base merge from the controller.
- **Still running:** the P2-T25 fix planner (Opus; told that the second review adds nothing beyond R109) and the P2-T32 fix planner (Opus; told to rebase `index.ts` onto `7cf4927`).
  - Their fixers go to Haiku (`--claude-code`) while Antigravity is out, or to Flash after about 02:43.

**00:45 (12 Nov): the Mac slept from 23:08 to 00:31, stalling CI and one agent. It is held awake now. #407 and #406 have their confirming reviews approved; #410 reruns its lost jobs.**
- **The sleep.** `pmset` shows `sleep 1` (one minute). At 23:08 the Mac entered Idle Sleep, then fell back asleep at each dark wake with "Dark Wake Thermal Emergency".
  - Both runners went offline. Jobs were cancelled or abandoned, and runner-1 hung, so it was recreated (`docker rm -f` plus `runners.sh up 2`; the image re-registers it with `--replace`).
  - The P2-T25 second reviewer's turn stopped ("Antigravity sent nothing for 15 minutes"). It was resumed with a message.
- **Held awake:** `caffeinate -i -s -t 28800` (pid in `scratch/caffeinate.pid`). It started at 00:37 and ends by itself at about 08:37; the display can still sleep. Stop it with `kill $(cat scratch/caffeinate.pid)`.
  - **For the owner:** thermal pressure read 2 ("heavy") at 00:35. `hybridsearchd` (Spotlight's indexer) used about 3.2 cores, which the worktrees and scratch trees feed. Excluding `~/Developer` from Spotlight (System Settings, Spotlight, Search Privacy) would cut that heat. That is the owner's setting to change.
- **CI cancelled** on heads that will change: #411 and #412 (fix rounds) and #406 (it must merge the integration head after #407). This keeps the two runners for #410 and #407.
- **#407 (P2-T14):** the confirming review is Approved (`reviews/P2-T14-confirm.md`: m1, m2, n1, n2; carry them at merge). Waiting on CI at `28b9d5ac` (background `wait_ci.sh 407`).
- **#406 (P2-T33):** the confirming review is Approved (`reviews/P2-T33-confirm.md`: m1, n1 to n3). After #407 merges, merge the integration head in (`index.ts` as `merge/index.t14-t12-t33.ts`, `draftText.test.ts` merged), push, then wait for CI and merge.
- **#410 (P3-T4):** the SQL job was "The operation was canceled" at 17:31 UTC (the sleep), and 3n+1 was cancelled. The new `rerun_then_wait.sh 410 43051770978` reruns them once the run ends, then waits.
- **#411 (P2-T32):** the Flash second review is Approved, with one nit, the first review's m1. The fix round goes ahead (R110).
- **Watcher:** `verdict:P2-T25-second`, plus `file:` for the briefs of P2-T29, P2-T31, P2-T25-fix and P2-T32-fix.

**23:45: #410 (P3-T4) has both reviews approved and waits on CI. #411 and #412 need fixes, with Opus fix planners running. UI-heavy planning goes back to Opus.**
- **#410:** both reviews approved (Opus `reviews/P3-T4.md`, with m1 to m4 carried; Flash `reviews/P3-T4-second.md`). The carriers are in followups.md (P3-T6, P3-T7, P3-T8, P3-T10, P3-T3, P4-T6, P6C).
  - **Deployment note:** set `AI_GATEWAY_TOKEN` only together with `ANTHROPIC_BASE_URL`.
  - CI is at 6 of 9. A background `wait_ci.sh 410` is running; merge on green with `merge_task_pr.sh 410 a68fcd81 P3-T4`, then `promote_pr.sh P3-T4 410`.
- **#412 (P2-T25):** the first review says Needs fixes, with 2 majors.
  - **R109:** the wallet screen words a restore without the amount while private mode is on (the old screen keeps its words); the `trackRecordRestored` call is removed, since nothing was carried (1D-T7 #138 has not merged).
  - Fix planner, on Opus: `mcp:launch:79936cd9fbcf6cb46b7f9d2e01dbae02206a44f460bb1162ee8d6dcad42710dc`, writing `briefs/P2-T25-fix.md` with the kit `scratch/p2-t25-fix-planner/`, on `b840c195`.
- **#411 (P2-T32):** the first review says Needs fixes, with 8 majors (M1 to M8).
  - **R110:** fix each as the review proposes, and stop BLOCKED on anything the plan can't settle.
  - Fix planner, on Opus: `mcp:launch:3bc47b4b91a6048f51f2d075bef60ef6144af6c677e5f4e9bc9e8d53c240c60a`, writing `briefs/P2-T32-fix.md` with the kit `scratch/p2-t32-fix-planner/`, on `71b2255e`.
- **Routing change (lessons.md):** Flash plans well-specified logic; UI-heavy tasks are planned on Opus. The running Flash planners for P2-T29 and P2-T31 (UI) finish, but each of their briefs gets an **Opus brief review** against the plan's test list, the boards and the wallet kit before any build.

**23:30: #409 (P2-T23) MERGED, promoted as #413. The #406 fix is pushed, with its confirming review running.**
- **#409 merged as `f22c5a8`,** with no owner yes (ruling of 21:25): CI 9 of 9, and both reviews approved (Opus, Flash). Issue #169 is closed, and WT `p2-t23` and its branches are removed. Promotion PR **#413**.
  - Review m2 (the receipt's `TODAY_PAGES`) is fixed in `7c2682b5`.
  - Review m1 is **ruled R108** for P2-T24: the front card's "today" counts today's waiting expense drafts once (P2-T16's definition), following rh-offline and P2-T12's spec. See followups.md.
- **#406 (P2-T33).**
  - The fix commit `8e270766` was checked: 12 files on `5844e4c1`, all 11 fix-kit files identical, 166 of 166 mutants killed, `git diff --check` clean.
  - Pushed as a fast-forward, so #406's head is `8e270766` and CI reruns. The body has a fix-round section.
  - The confirming review, on Claude Code Opus high, writes `reviews/P2-T33-confirm.md`: `mcp:launch:5c1c18c7a547ab3ae26469e0c628d2321262c50bd957fd180c256c52b25654db`.
  - **Merge only after #407:**
    1. Merge the integration head into `p2/t33-face-id-lock`, with `index.ts` as `merge/index.t14-t12-t33.ts` and `draftText.test.ts` merged.
    2. Push, wait for CI, then `merge_task_pr.sh 406 <that head> P2-T33`. The head differs from the confirmed `8e270766` only by that planned merge.

**23:25: two more Flash planner lanes, since the Mac's load is about 7 and planning doesn't use Claude Code.**
- **P2-T29** (categories, the category tray and the Thai pack tray): `mcp:launch:11bf352998e7f62f46eef5950d167ee15f667c8eff10ac068d5b8efb523eb960`. WT `p2-t29` on `p2/t29-categories`, pre-made with `npm ci`.
- **P2-T31** (insights): `mcp:launch:92c37c30c475ed6ce1e646a9d352a02fabb84d1e44f1c8e9c6fbf0ed8207ba8e`. WT `p2-t31` on `p2/t31-insights`, pre-made.
- Both carry the Flash notes: asserting lookups, a mutant per guard, BLOCKED rather than guessing.
- **Check their kits with all three checks before accepting:** the kit, the RED failure types, and RED typecheck proof against the brief's steps.

**23:20: P2-T32 → PR #411 and P2-T25 → PR #412, both in review. #409's second review (Flash) approved.**
- **P2-T32:** commit `71b2255e` (14 files, all 13 `real/` identical; message in `feat(wallet):` style because the Flash brief named no commit line; cosmetic, left). RED 15 assertions; 31 of 31 mutants (`scratch/p2-t32/mutants.out`).
  - PR **#411** (closes #178).
  - Reviews: Opus `mcp:launch:ac27ecb0493487a364a155a0994619f5a18fbf27bc936d8b38255fb4c0a4a070`, Flash `mcp:launch:f17bed097f0ba34de8d89e4491d1ec77b1d3d009e4af15bbd04aace72bce2a21`.
- **P2-T25:** commit `b840c195` (9 files, all 8 `real/` identical). RED 9 assertions; 19 of 19 mutants.
  - PR **#412** (closes #171).
  - Reviews: Opus `mcp:launch:ea088c4bc10e24ec71537ff8456f74b50e9d86066a800c1e00df839dad5bee93`, Flash `mcp:launch:f9d3b090f96b34c8a69734048ff20870054cb835d38d2937c8d768b9ec07beaf`.
- **#409's second review** (`reviews/P2-T23-second.md`): Approved. Its first review (Opus) is still running.
- **Load:** five Opus reviews on Claude Code at once (#407 confirm, #409, #410, #411, #412), so no new lanes until some clear.
- **Merge order on approvals:**
  1. #407 first (its confirm, then the P2-T20 build, then the #406 update).
  2. #409, #410, #411 and #412 are independent of each other, except `index.ts`: #411 and #412 both add a spread. The second to merge needs a 3-way update and a CI rerun.

**23:10: the #407 fix is pushed and its confirming review is running. P2-T25's reworked plan is accepted, and its builder is running.**
- **#407 (P2-T14).**
  - The fix commit `28b9d5ac` was checked: 11 files on `18876253`, all 10 fix-kit files identical, 138 of 138 mutants killed (`scratch/p2-t14-fix/mutants.out`), `git diff --check` clean.
  - Pushed as a fast-forward, so #407's head is `28b9d5ac` and CI reruns. The body (`pr-p2-t14.md`) has a fix-round section.
  - The confirming review, on Claude Code Opus high, writes `reviews/P2-T14-confirm.md`: `mcp:launch:f2e760bb45aaac343b9114eeef25fabb58506f32a10fe9fad03da67d43ad7351`.
  - **Merge when it approves and CI is green at `28b9d5ac`:** `merge_task_pr.sh 407 28b9d5ac P2-T14`, then `promote_pr.sh P2-T14 407`, then dispatch the P2-T20 build (check its kit with the 3-way fallback first) and update #406.
- **P2-T25, reworked by its Flash planner.**
  - The kit checks at `647cb4a0` with 27 OK.
  - RED is 9 of 9, all `AssertionError` from asserting helpers, with 0 lookup errors.
  - 19 of 19 mutants (was 9). Typechecks are at the gate, with 0 errors.
  - P1 to P6 accepted.
  - The builder, on Flash: `mcp:launch:ef2026572fc37bc0230281552abc5b919928679520452f0d9b462148810e348b`, in WT `p2-t25`.

**23:05: P2-T32's Flash plan (steered) is READY and accepted. Its Flash builder is running.**
- **The brief:** `briefs/P2-T32.md`, 13 files. The kit `scratch/p2-t32-planner/` checks at `8c6263a4` with 36 OK, and its 3 `orig/` files are identical.
- **All three checks passed:**
  - RED is all `AssertionError` (render 11, `recapShare` 2, `biggestDay` 2), with 0 lookup errors and 0 timeouts;
  - the brief's RED typecheck has a proof log with 0 TS errors;
  - 31 mutants, one per guard.
- **The steer worked:** P2 is the asserting-lookup rule and P3 the mutant coverage. P1 to P8 accepted.
- `index.ts` merge proofs with #407 and #406 are in `PL/merge/`.
- **The builder,** on Flash: `mcp:launch:35f26db3b389fe300f117c36979e97ebfcab68954c88f6648f5e203bd2605ee2`, in WT `p2-t32` (pre-made).
- **After DONE:** a first review (Opus) and a second review (Flash): P5's private mode applies to the share text.

**23:00: P3-T4 DONE (planned and built on Flash) → PR #410, both reviews running.**
- Commit `a68fcd81`. The controller checked it: 14 files (3 A, 11 M), `git diff --check` clean, 13 of 14 `real/` identical. The receipt differs only by its Deviations (P1 to P5, and the two RED rulings). Trailer: Gemini 3.8 Flash.
- Reported:
  - RED: 8 assertions and the one ruled timeout;
  - GREEN: unit 38, `ai.test.ts` 43, `test:edge` 189;
  - 8 of 8 mutants.
- PR **#410** (closes #188 by hand), body `pr-p3-t4.md`.
- Reviews:
  - the first, on Claude Code Opus, adding mutants for the `service.ts`, `handler.ts` and `routes.ts` wiring: `mcp:launch:b72fdba54026ab286a2e8c2034ffadf2bfdfad744abe5f4b9d368aec77411fce`;
  - the second, on Flash, on privacy and secrets (prompts go through a third party): `mcp:launch:4d601c4e04e5f7d552c81072732a06109adf1088b8dacf52711d706347d6c94f`.

**22:55: P2-T23 DONE (the first Gemini 3.8 Flash build) → PR #409, both reviews running.**
- Commit `0c3bbeb7`. The controller checked it: 11 files (9 A, 2 M), `git diff --check` clean, all 10 `real/` files byte-identical. The trailer is `Co-Authored-By: Gemini 3.8 Flash`.
- Reported: RED all assertions (14 Node, 6 render), GREEN, 77 of 77 mutants, `test:unit` 988, focused render 158.
- PR **#409** (closes #169 by hand), body `pr-p2-t23.md`.
- Reviews, with focus notes in `scratch/dispatch/P2-T23-{reviewer,second}-notes.md`:
  - the first, on Claude Code Opus: `mcp:launch:b18ce1bdf17f225f43c4649ef8b1345e479582a419cb3c83f77f10873bc9bab5`;
  - the second, on Flash (a different family): `mcp:launch:560d32a0e4159d3fa5e9ba14a7bdfac5e4b7484f717e02279cf80183a022bd30`.
- Merge when CI is green and both approve (no owner yes; ruling of 21:25). Then promote.

**22:50: the P2-T33 fix brief is READY and accepted. Its Flash fixer is running. Both P2 fix rounds are now building.**
- **The brief:** `briefs/P2-T33-fix.md`. The kit `scratch/p2-t33-fix-planner/` checks against `5844e4c1` with 55 OK, and its 9 `orig/` files are identical.
- **RED:** Node 2 of 18 and render 9 of 40, all on assertions, plus 1 expected unhandled `TypeError` ("reading 'step'"), which is the n4 bug. 166 of 166 mutants killed, twice.
- **What it does:**
  - M1: `ReceiptViewer` draws the cover. `lockCover.test.ts` is a source test that keeps the Modal sweep. Three Modals are covered; the four legacy ones are shown only under the development-only `EXPO_PUBLIC_LEGACY_SPEND=1`, and are recorded.
  - The gate's fixes: the first ask waits for the phone read; an opening counts only when its prompt starts; `try/finally`; port types are fail-closed; turning on is stored fail-closed (new copy `lock.notStored`); quiet on iOS under the cover (a flag in `ui/a11y.ts`); the keyboard is dismissed; n6 fixed.
- **Calls accepted:** `sync/announce.ts` (one line, `announceStatus` quiet under the cover; R107's intent though unnamed) and `Sheet.tsx` (a comment only).
- **The fixer,** on Flash: `mcp:launch:a413c405816e916a6f8b87a55cb29807ed99ec8c4aa4d89adefb8b2323e880fd`, in WT `p2-t33` on `5844e4c1`, with no merge.
- **After DONE:**
  1. Verify, push, update #406's body and run CI.
  2. Run a confirming review on Claude Code Opus.
  3. Merge after #407. That needs the `index.ts` resolution (`merge/index.t14-t12-t33.ts`) and `draftText.test.ts` merged, then CI rerun on the merge commit.

**22:45: P3-T4's builder was BLOCKED at RED; ruling sent.**
- At Step 1.3, `typecheck:edge` returned rc 2: the stub and the test need `env.ts`'s new optional `AI_GATEWAY_TOKEN` type, which the brief copies only at GREEN. The planner's `run-red.sh` ran `vitest` only, which never typechecks.
- **Ruling, sent with `t3_thread_send` to `mcp:launch:bd268f71…`:**
  - copy `real/…/v1/env.ts` at Step 1 (a type-only change);
  - Step 2 expects 9 failed: 8 `AssertionError` and 1 `Test timed out in 5000ms` in exactly "a call that outlives its time fails as a timeout and is recorded" (the stub has no deadline). The planner's `proof/red/red-node.log` shows the same.
- lessons.md now says to check the planner's proof script against the brief's RED steps.

**22:40: the P2-T14 fix brief is READY and accepted. Its Flash fixer is running (#407 is the critical path).**
- **The brief:** `briefs/P2-T14-fix.md`. The kit `scratch/p2-t14-fix-planner/` checks against `18876253` with 42 OK, and its 11 `orig/` files are identical. RED has no non-assertion failures (render 10, unit 2).
- **The proofs:** 138 of 138 mutants killed; the reviews' 11 survivors survive on `18876253`'s own tests.
- **R106 amended (the planner's P1, accepted):** at large text the type switch sits under the amount and its problem. At the top of the middle it would cover the whole amount at AX5 on a 667 pt phone; mutant L2 is that layout.
- **The rest:**
  - masking, and a fill restarting on the first key, so no `too_precise` and no bare `฿65.`;
  - income's name above Tell Bun (rh-income), with a 72 pt name row;
  - the name field blurs when the keyboard hides;
  - the chip-label rule is a header line plus P2-T16's note.
- **The fixer,** on Flash: `mcp:launch:2a6e6ee8c4c365544d454083494aee8e47667d8fa251421de1c6df59026bf980`, in WT `p2-t14` on `18876253`, with no sync merge.
- **After DONE:**
  1. Verify against `real/` and push to `p2/t14-add-flow`.
  2. Update #407's body and rerun CI.
  3. Run a **confirming review on Claude Code Opus** (new logic on money and privacy work).
  4. Merge, promote, then start P2-T20 and update #406.
- `watch_agents.sh` gained `moved:<wt>:<sha>`, for a fixer on a branch that already has its own commits.

**22:35: P2-T25's Flash plan was sent back for a rework. P2-T32's Flash planner was steered before writing its tests.**
- **P2-T25 READY, not accepted.**
  - The kit checks at `d16bc1d0` (27 OK, 3 `orig/` identical), but its RED `logs/red.log` is 7 `TestingLibraryElementError` out of 8, against P14(d)'s rule.
  - Its 9 mutants are thin.
  - Sent back with `t3_thread_send` (run 2) to the same Flash thread `mcp:launch:b7caf9c09b556ad44fb73e8d705c7ee2dac680aebe6c48f4b7e50212f7ca86f8`: asserting lookups, one mutant per guard, re-prove, new sums, READY again. Its WT `p2-t25` is ready.
- **P2-T32's planner** (`mcp:launch:9ff21d2cf9701cfc761338a5ce383b6978ad2f8c6a551f6ab31665478fbd357e`) was steered with the same two rules.
- `planner-flash-notes-20261111.md` and lessons.md now state the rule ("check the RED failure types before accepting any plan").
- `watch_agents.sh` gained `newer:<path>:<epoch>`, for a reworked brief that already exists.

**22:25: P2-T23 READY (Claude Code Opus planner). P1 to P15 accepted; its Flash builder is running.**
- **The brief:** `briefs/P2-T23.md`, 59 KB, size M. The kit `scratch/p2-t23-planner/` checks at `29aba3dd` with 34 OK, and its 2 `orig/` files are identical.
- **The proofs:** RED 14 of 14 Node and 6 of 6 render cases, all assertions; 77 of 77 mutants killed.
- **No files in common** with #407 and #406 (or their R106 and R107 scope), P2-T20 or P2-T25. `merge/README.txt` holds the sha256s with #407 and #406 laid over.
- **Calls to keep in mind:**
  - P3: `availableBalances` moves to a pure module, and `entryHelpers.ts` re-exports it;
  - P4: a private copy of P2-T20's `frontFirst`, which P2-T24 swaps for an import;
  - P8: `headline` is the month's spending estimate, and private mode says no number.
- **The builder,** on Flash: `mcp:launch:8bd4778b30ac1c7143b668103927cad751e1fec60e84e554656fd86ec86d4a91`, in WT `p2-t23` (pre-made, installed). The brief was written for Haiku; Flash follows it unchanged.
- **After DONE:** a first review (Opus) and a second review (Flash), since Home shows balances, budgets and private mode.

**22:20: P3-T4's Flash plan is READY and the controller accepted it. Its Flash builder is running.**
- **The brief:** `briefs/P3-T4.md`, 14.6 KB, size M, 14 files: 3 new, and 11 shared edge files that #406 and #407 do not touch. The kit `scratch/p3-t4-planner/` checks at `5e514bf0` with 48 OK, and its 11 `orig/` files are identical.
- **The controller's review of the Flash plan:**
  - RED is real: 9 of 9 fail, 8 of them on assertions.
  - The 8 mutants all target `transport.ts` (gateway logging and caching off, the 2 s floor, 529 and rate limits, the gateway token, env gating) and are all killed.
  - Weak spots for the reviewer: no mutant covers `service.ts`'s `tracedSend` and `AiDeadline(25_000)` wiring, or `handler.ts`'s `transportFromEnv` fallback; the 43 `ai.test.ts` cases cover them behaviourally. P1's auth-header test accepts either header, but the SDK 1.2.0 chooses it.
  - P1 to P5 accepted.
- **The builder,** on `antigravity` `gemini-3.8-flash-high`: `mcp:launch:bd268f71aa52ecb259c0e12f7106b76a8cd58f06ced7c5777063f210b7f1d4f6`, in WT `p3-t4` (pre-made, installed), with the lock.
- **After DONE:**
  1. Verify the commit against `real/`.
  2. Run `open_task_pr.sh`.
  3. Dispatch the first review on Claude Code Opus. Focus on the wiring above, and add mutants for `service.ts` and `handler.ts`.
  4. Dispatch the **second review** (privacy: user prompts go to a third party through the gateway, with logging and caching off) on Flash.
- **The watcher's planner signal is now the brief file, not the kit's `SHA256SUMS`.** The Flash planner wrote its sums mid-run, and the watcher fired early. SKILL.md and `watch_agents.sh` say so.

**22:10: the four new lanes' worktrees are pre-made, so builders start without an install.** `new_task_worktree.sh` made them at `675569e2` (controller-state commits only since the planners' bases):
- `p2-t23` (`p2/t23-home-data`), `p2-t25` (`p2/t25-recently-deleted`) and `p2-t32` (`p2/t32-month-recap`), each with `npm ci`;
- `p3-t4` (`p3/t4-gateway-transport`), with `npm ci` and `install:edge`.
- Dispatch their builders with `--installed`.
- Notion setup is deferred by the owner ("let's do notion later"); its state is in the auto-memory `notion-setup-pending`.

**21:50: Antigravity's Gemini pool is now used to the full (owner: "Antigravity still have a lot of usages please find the way to maximize").**
- **The owner's usage screen, 21:34:**
  - Antigravity Gemini: weekly 55% left, 5-hour 100%;
  - Gemini 4 Argon: weekly 1%;
  - Antigravity Claude and GPT: 0%, resetting in 6d 10h;
  - Cursor models: 2%; Grok: 3%.
- **`make_prompt.py --spread` now routes:**
  - builders, fixers, second reviews and the simpler lanes' planners to `antigravity` `gemini-3.8-flash-high`;
  - first and confirming reviews to Claude Code Opus (confirm on Opus high, no longer Sonnet);
  - hard or money and privacy planners with `--claude-code`.
  - Flash planners get `scratch/dispatch/planner-flash-notes-20261111.md`: fully mechanical briefs, and BLOCKED rather than guessing a design call.
- **Planners moved:** the two Grok planners were stopped before writing anything (Cursor at 2%). They were relaunched on Flash, and one lane was added:
  - **P3-T4:** `mcp:launch:f08a12db4a0746d271a6d5a447fc8efdbeb7035e6adb24b236ce1c513137e2b5`;
  - **P2-T25:** `mcp:launch:b7caf9c09b556ad44fb73e8d705c7ee2dac680aebe6c48f4b7e50212f7ca86f8`;
  - **P2-T32** (month recap, App, its own folder): `mcp:launch:9ff21d2cf9701cfc761338a5ce383b6978ad2f8c6a551f6ab31665478fbd357e`. WT `p2-t32`, branch `p2/t32-month-recap`.
- **Still on Claude Code Opus:** P2-T23's planner and both fix-round planners.
- **Flash is new in two roles, planner and builder.** The controller checks every Flash kit with `check_kit` and every Flash commit against its kit. If Flash planning proves weak, move those planners to `--claude-code`.

**21:45: both P2 PRs need fix rounds. Rulings R106 and R107; two fix planners are running on Claude Code Opus.**
- **#407 (P2-T14).**
  - The first review (`reviews/P2-T14.md`) says **Needs fixes**: M1 (at AX5, and with the keyboard up, the pinned header and footer leave the scrolling middle no room), m1 to m5, n1 to n4.
  - The second (`reviews/P2-T14-second.md`): no major; m1 (private mode shows filled amounts), m2 (a chip label carries the amount), m3 = first m4, m4 = first m2; n1 to n3.
  - **R106:**
    - follow the board: at large text the switch goes into the scroll area; the problem line leaves the pinned footer; the keys hide while the name field has focus; no `Tray.tsx` change;
    - a filled amount (chip, Bun, copy, move all, edit) is masked in private mode until the first key, which narrows P9;
    - a chip `label` holds the name only;
    - plus the minors and pins.
  - Fix planner: `mcp:launch:fb95e212d234c490f9f777d551bbb44fa814ef689d4781e553eb39fec3a59efb`, writing `briefs/P2-T14-fix.md` with the kit `scratch/p2-t14-fix-planner/`, on `18876253`.
- **#406 (P2-T33).**
  - The second review (`reviews/P2-T33-second.md`) says **Needs fixes**: M1, the receipt photo (`ReceiptViewer`, a Modal of its own) stays drawn over the locked app. The controller checked it: `ReceiptParts.tsx:230` has a `Modal` with no `useLockCover`.
  - **R107:**
    - `ReceiptViewer` draws the cover like `Sheet`, and every reachable `Modal` is swept (`CustomerSpendScreen`, `SpendMediaPermissionPrimer`, `SpendNewCategorySheet`, `SpendDatePicker`);
    - the first review's m2, m3, m4 and n4;
    - the second's m2 to m5 and n1 (fail-closed write, no iOS speech under the cover, keyboard dismissed, the port's types hardened);
    - pins for the first's n1 to n3 and n5.
  - Carried, not fixed:
    - the first's m1 (Android) to P2-T34;
    - the second's m1 (sheet children's state) under R63, to later sheet hosts and P2-T34;
    - the second's m6 (native sheets) is owner Q1.
  - Fix planner: `mcp:launch:adbc392633ee790391d70d51a197633159f9a9b43fb6d75066203400f2b027e7`, writing `briefs/P2-T33-fix.md` with the kit `scratch/p2-t33-fix-planner/`, on `5844e4c1`.
- **After each fix brief is READY:**
  1. Dispatch the fixer with `make_prompt.py fixer P2-T14 --wt p2-t14 --branch p2/t14-add-flow --spread` (Haiku).
  2. Push, update the PR body, rerun CI.
  3. Run a **confirming review on Claude Code Opus**, not the spread table's Sonnet, because both fixes write new logic on money and privacy work.
  4. Merge #407, then promote it. Start P2-T20, then update #406 (`index.ts` as `merge/index.t14-t12-t33.ts`), and merge #406.
- **Tooling:**
  - The reviewer template now requires the review *file* to end with an exact `VERDICT:` line. These reviewers wrote `## Verdict`, which the watcher missed for about 20 minutes.
  - The watcher is now `scripts/watch_agents.sh`, documented in SKILL.md's fast paths.

**21:30: the owner said "find the way to speed up development without my approval". Recorded in SKILL.md.**
- **Rulings:**
  - Integration-branch merges no longer wait on the owner's yes, money-path and privacy PRs included, once CI is green and the reviews approve. The owner still reviews each task in its promotion PR into main.
  - The build's own speed-ups (more lanes, spreading providers, script and process changes) go ahead without asking, recorded here.
  - Main merges, deploys, secrets, production data, new paid services and scope changes stay the owner's.
- **Pipeline:** 20 tasks were ready and only 2 in flight. Planners started for three lanes that share no files, with common notes in `scratch/dispatch/planner-common-notes-20261111.md` (retired-file translation, merge proofs for shared files, Haiku-shaped briefs):
  - **P2-T23** (App, depth 12), on Claude Code Opus xhigh: `mcp:launch:8f1c451f13692d19dca5302a5293f08abd423eae341d53969f592c50c7cb946d`. WT `p2-t23`, branch `p2/t23-home-data`.
  - **P3-T4** (Server, depth 11), on Cursor Grok 4.7 xhigh: `mcp:launch:a53aa556c034ab3b8abbcb9ecb151bdac593f8897fe097679632067ea0945c7a`. WT `p3-t4`, branch `p3/t4-gateway-transport`. It is the only server lane: server tasks share `handler.ts`, `env.ts`, `routes.ts` and the vault schema.
  - **P2-T25** (App, depth 10), on Cursor Grok 4.7 xhigh: `mcp:launch:30ccfbc19eee12e1d6b7e82e7e8bcf1a340044e0dc1ad34afe592467c8d542fb`. WT `p2-t25`, branch `p2/t25-recently-deleted`.
- **Providers while Antigravity is out:**
  - Cursor's included usage covers Grok but **not Claude Opus 5.5** ("not included in your weekly usage ... buy credits or switch to a Grok model"). Buying credits is the owner's call, so it was not done. The first three Cursor Opus launches failed on it and are not to be reused.
  - `make_prompt.py --spread` now gives: planners and the second review on `cursor` `grok-4.7` (xhigh, fastMode off; Grok is the different family the second review wants), builders on Claude Code Haiku, first reviews on Claude Code Opus, and the confirming review on Claude Code Sonnet.
  - **Planners on Grok are a trial.** Judge them by `check_kit` and the first review before trusting the kits. If a Grok kit fails, fall back to `--claude-code` for planners.
- **Next lanes, once P2-T14 (#407) merges:**
  - P2-T20's brief is READY, waiting only on #407.
  - App lanes with no shared files are still open: P2-T29, P2-T31, P2-T32, P3-T5, P6A-T2.
  - Server lanes wait their turn after P3-T4.

**21:20: the owner said "if ci pass merge it". #405 (1B-T13) is MERGED; the 1B plan's last task is in.**
- **How the instruction was read:** the owner's yes for #405, #407 and #406, each merging once its CI is green *and* its reviews approve. Review approval stays the gate.
- **#405 merged as `3d4f783`** at `7eeff709`. Issue #117 is closed, and WT `p1-1b-t13` and branch `p1/1b-t13-vault-http` are removed locally and on origin.
  - It is promoted as **#408** (`promote/1b-t13`, based on `promote/fix-download-aborts`); stack #379 now holds 17 PRs.
  - The receipt's stale `uploads.ts:50/:61` line (the first review's n1) is fixed in `b64993a5`.
- **Next for 1B:** P22's read-only review of the whole 1B range, which the controller schedules. It is deferred until the three running reviews finish, to spare Claude Code's limit.
- **#407:** merge when both reviews approve, then promote it.
- **#406, after #407:**
  1. merge the integration head into `p2/t33-face-id-lock`, resolving `index.ts` byte-identical to `PL/merge/index.t14-t12-t33.ts` (`draftText.test.ts` merges by itself);
  2. push, rerun CI;
  3. merge at that head when CI is green and the second review approves. The head then differs from the reviewed `5844e4c1` only by that planned merge.
  - Its first review's m2, m3 and m4 go to P2-T34 with m1 (followups.md), unless the second review asks for a fix round.

**21:16: CI is green on all three PRs (9 of 9): #405 on `7eeff709`, #406 on `5844e4c1` (R-B flake passed on rerun), #407 on `18876253`.**
- #406's first review approved, with four minors (followups.md, P2-T33 entry). Its second review is still running.
- #407's two reviews are still running.
- For #406, the controller will put two options to the owner:
  - fold m2, m3 and m4 (plus n4's `try/finally`) into a small fix round when #406 is updated after #407's merge, with a confirming review;
  - or carry them to P2-T34 with m1.

**21:05: #405 (1B-T13) is ready for the owner's yes. #406 is rerunning a flaky job.**
- **#405:** CI 9 of 9 on `7eeff709`, and both reviews approve.
  - The first review (`reviews/1B-T13.md`): m1 (no CI test of the live socket through TanStack Start's `/v1/$`), m2 (the `/api/auth` dispatch is unpinned), m3 (`/ready`'s empty-setting rule is untested), and five nits.
  - The second review (`reviews/1B-T13-second.md`): six nits. Its n3 and n5 are the first's m3 and m2.
  - All are carried in followups.md: m1 and m2 to 1D-T12, m3 to 1C-T10b, the rest to a clean-up task. The code is right in every case.
  - **The controller recommends merging.** The owner must say yes (auth and the vault). Then run `merge_task_pr.sh 405 7eeff709 1B-T13` and `promote_pr.sh 1B-T13 405`. P22's whole-1B read-only review comes after the merge.
- **#406:** the SQL job failed on the documented R-B flake (`attachments.integration.spec.ts`, "two records retaining one image at once keep one receipt", expected 1, got 2). P2-T33 does not touch `apps/api`. `gh run rerun 43031794055 --failed` is running (attempt 2).

**20:55: P2-T14 DONE → PR #407, both reviews running. Every builder is done; three PRs are in review.**
- Commit `18876253`. The controller checked it: 12 files (10 A, 2 M), `git diff --check` clean, 10 of 11 `real/` files identical, and `index.ts` = the planner's merge proof (`aa2a47bf…`).
- Reported: RED and GREEN as briefed, 92 of 92 mutants, `test:unit` 980, focused render 70 of 70.
- PR **#407** (closes #160 by hand), body `pr-p2-t14.md`.
- P2-T14 is treated as money and privacy work: the add flow enters money, and its P9 decides private-mode masking. So it gets a second review and needs the owner's yes.
- Reviewers, with notes in `scratch/dispatch/P2-T14-{reviewer,second}-notes.md`:
  - the first: `mcp:launch:793ee1ddb5d2396f86aa194e994e36bff66cf035f58b94ad80df93b6e77bf614`;
  - the second: `mcp:launch:25bdc28467450436e429bd3f64e143183a69c385664fb7ea12d24b68e401fef7`.
- **Merge order once approved, CI is green and the owner says yes:**
  1. #407 (P2-T14);
  2. #406 (P2-T33), after resolving `index.ts` and `draftText.test.ts` and rerunning CI;
  3. #405 (1B-T13) is independent (edge only).
  - Promote each after its merge.

**20:50: P2-T33 DONE → PR #406, both reviews running.**
- Commit `5844e4c1`. The controller checked it: 21 files (13 A, 8 M), `git diff --check` clean, 19 of 20 `real/` files byte-identical, and `index.ts` = `merge/index.t12-t33.ts` (`a3acf233…`).
- Reported: RED and GREEN as briefed, 121 of 121 mutants (output identical to the planner's), `typecheck:routes` and `export:web` clean (4830 modules).
- PR **#406** (closes #179 by hand), body `pr-p2-t33.md`.
- Reviewers on Claude Code, with notes in `scratch/dispatch/P2-T33-{reviewer,second}-notes.md`:
  - the first, Opus xhigh: `mcp:launch:ae4fcff346a05feb84db47f6b3dab6a687746786e7ce6ef07db241bedd6e7ad9`;
  - the second (privacy), Opus high: `mcp:launch:10563bbdefd61c0c57d6f5fbfcf9eb3ace1078a116d0d8562c6f6724bb187679`.
- Merge needs: green CI, both reviews approved, **the owner's yes** (privacy), and **P2-T14 merged first** (P17). Then resolve `index.ts` as `merge/index.t14-t12-t33.ts`, merge `draftText.test.ts` (`merge/draft.*`), and rerun CI.
- Five agents are now running on Claude Code: the P2-T14 implementer and four Opus reviewers. Watch for a 429 (the "usage-limit cutoff" steps in SKILL.md). Cursor is the next provider.

**20:45: 1B-T13 DONE → PR #405, both reviews running.**
- Commit `7eeff709`. The controller checked it: 60 paths (25 M, 1 R, 6 A, 28 D), all 31 `real/` files byte-identical, `git diff --check` clean.
- Reported: RED and GREEN as briefed, 28 of 28 mutants killed, `test:edge` 180, no PostgreSQL drivers in `dist/server`.
- PR **#405** (closes #117 by hand), body `pr-1b-t13.md`.
- Reviewers on Claude Code, with focus notes in `scratch/dispatch/1B-T13-{reviewer,second}-notes.md`:
  - the first, Opus xhigh: `mcp:launch:74c1a575f433844ce72a14b6d2b9cb21a6423bb9f0a91ad01a17ca83f83a3873`;
  - the second (auth, privacy and money), Opus high: `mcp:launch:5110865ae9b0f22bcacd33251d02f93f799f3a2175b04b1a2e58cf883688fb88`. It is told not to read the first review before writing its own.
- Merge needs: green CI on `7eeff709`, both reviews approved, then **the owner's yes** (auth and the vault). Then promote.
- Housekeeping: `promote_pr.sh` no longer doubles the task-id prefix in titles. #400's and #403's titles are fixed. #403 and #404 passed CI, 9 of 9.

**20:40: P2-T14 was BLOCKED at Step 4.2, correctly.**
- The controller's rebased `index.ts` (`f74fa284…`) put the add spread before the tray's. `check_kit.sh`'s patch fuzz misplaced the hunk.
- The implementer's `git apply --3way` gave `aa2a47bf…`, which is right: P3f, the planner's `logs/merge/merged-*.ts` and the render test's section order all agree.
- Ruling sent with `t3_thread_send`: keep its file and continue from Step 4.4. C = 22 is right (the note had said "above 22").
- `scratch/p2-t14-rebase/` is corrected. `check_kit.sh` now patches with `-F0` and falls back to a 3-way `git merge-file` (lessons.md).
- P2-T33's `a3acf233…` was checked with the fixed script and holds.

**After each DONE:**
1. Write `pr-<id>.md` and run `open_task_pr.sh`.
2. Dispatch the reviewer with `make_prompt.py reviewer … --claude-code` (Opus xhigh).
3. **P2-T33 (the app lock) is a privacy PR,** and 1B-T13 touches the auth dispatch and the vault. Each gets the second review too: `make_prompt.py second … --claude-code`. While Antigravity is out, that review is Claude Opus, the same family as the first review. Tell the owner that when asking for the merge yes.
4. **Merge order:** P2-T14 before P2-T33 (P17). The second to merge needs `index.ts` resolved to `PL/merge/index.t14-t12-t33.ts` and `draftText.test.ts` merged (`PL/merge/draft.*`).
5. P2-T20 waits on P2-T14's merge. P2-T16 still needs a planner.

## 11 Nov 20:25 Bangkok: #395 and #396 promoted; held briefs checked against the new head

- **Promotions, made with the live skill's `promote_pr.sh`:**
  - **#403** `promote/p2-t12` at `ecc10df`, based on `promote/alarm-hardening`;
  - **#404** `promote/fix-download-aborts` at `72cdd02`, based on `promote/p2-t12`.
  - Stack #379 now holds 16 PRs. Their CI runs on the local runners.
  - The earlier steps in this thread used a stale copy of the skill: the T3 worktree's, which matches main. Its `merge_task_pr.sh` is identical to the live one, but it had no `promote_pr.sh`. **A controller in a T3 worktree should load the main checkout's `.claude/skills/jotbun-controller/`.**
- **`check_kit.sh` at `cb76c174`:**
  - **P2-T14:** the kit is intact (29 OK). `apps/app/src/dev/catalogue/wallet/index.ts` differs, because P2-T12 added its import and spread there, but the kit's diff applies cleanly. Dispatch with `--rebase-out`, and tell the implementer that P2-T12's `bw-stack` sections are now on the head.
  - **P2-T33:** the kit is intact (68 OK), but its `index.ts` diff does NOT apply after P2-T12. Send the brief back to its planner to rebase (P17's merge order still holds: P2-T14 first).
  - **1B-T13:** the kit is intact (144 OK), and its 26 `orig/` files are identical at the head. The brief still needs the controller's review (P1 to P5) before dispatch.
- At 20:15 the owner said "ok continue". The controller did not read that as lifting the hold and asked first. The hold was lifted at 20:20 (see the section above).

## 11 Nov 20:10 Bangkok: #396 merged; the local runners are up again

The owner said: "start the runners and rerun 396".

- **Runners:** the Mac had rebooted at about 19:23, and Colima was stopped.
  - `colima start --cpu 10 --memory 32 --disk 100` restarted the runner containers, but they crash-looped: their registration token had expired.
  - `runners.sh down` then `up` recreated them. Both are online with the label `jotbun-local`, and they are **left running**.
  - Starting Colima also brought back Supabase's `tbh-local` containers, which have restart policies.
  - To free the Mac: `bash .claude/controller/local-ci/runners.sh down` (and `colima stop` if nothing else needs it).
- **#396 fix-download-aborts: MERGED** as `72cdd02`, at `763edb3f`.
  - `gh run rerun 42992817954 --failed` passed the SQL job, so all 9 checks are green.
  - The controller checked the test-only fix instead of a second review. It changes only `download-aborts.test.ts` and the receipt, and the test's sha256 `07dbb573…` equals the planner's kit `real/` file.
  - The edge job of #396's run is confirm-n6's read (#396 merged last of #394, #396 and #398): `test:edge:db` 68 of 68, workers 774 passed and 1 todo, `test:edge` 176.
  - The PR body was updated and the PR marked ready. WT `fix-download-aborts` and branch `fix/download-aborts` are removed locally and on origin.
  - The receipt's stale "Not pushed." is corrected in `60bc7413`. The flake is recorded in lessons.md and followups.md.
- **No PR is open into the integration branch now.** Neither #395 nor #396 is promoted (no `promote/*` PR). The promotion stack into main and #70 are untouched.

## 11 Nov 19:50 Bangkok: #395 merged on the owner's word; #396 waits on a flake rerun

In a new T3 thread, the owner said: "check for pending pr if ci pass merge it then cleanup worktree and branch". This was taken as the go-ahead for the parked integration PRs. The rest of the hold stands: no thread or lane was started, nothing was merged into main, and the CI runners were not touched.

- **#395 P2-T12: MERGED** as `ecc10df`, at the reviewed head `af61e89a`.
  - CI was 9 of 9 green on the local runners.
  - The controller (Opus 5.5) ran the confirming review inline and approved the fix commit: `reviews/P2-T12-confirm.md`. Its one minor, c-m1 (the receipt's stale Status line), is fixed in `0cc9191f`.
  - Before the merge, the PR body was updated (`pr-p2-t12.md`) and the PR marked ready.
  - Issue #158 is closed. WT `p2-t12` and branch `p2/t12-card-stack` are removed, both locally and on origin.
  - **Not promoted yet:** there is no `promote/p2-t12` PR. It would stack on #402.
- **#396 fix-download-aborts: NOT merged, still a draft.**
  - CI on `763edb3f` passed 8 of 9 jobs. The red job is "SQL integration and ops": in `attachments.integration.spec.ts`, the case "copying is bounded › serializes reservations: five at once from one account reserve exactly four" gave `retry_after` 181 where it expects at most 180. The log is `scratch/ci/396-130429559951.log`.
  - #396 touches only `apps/edge` and its receipt, and the same job passed on #395's run, so this is an `apps/api` flake. It belongs with R-B and followups.md's "API database-suite concurrency flakes".
  - Both local runners are **offline**, so a rerun would only queue. The Mac's load average was 73 over 1 minute and 178 over 5, with GoGoCash using it.
  - **Next, once the owner says so:**
    1. Start Colima, then `bash .claude/controller/local-ci/runners.sh up`.
    2. `gh run rerun 42992817954 --failed`, then wait with `C/wait_ci.sh 396`.
    3. On green: update the PR body (`pr-fix-download-aborts.md`) and run `gh pr ready 396`.
    4. `merge_task_pr.sh 396 763edb3f` (no task issue). The fix is test-only from its planner's kit, so it needs no second review.
- **Untouched:**
  - The promotion stack (#373 up to #402) waits on the owner's merge into main. All of it is green except #393, the billing refusal.
  - #70 is not to be merged.

## 11 Nov 13:07 Bangkok: HOLD (Fronk). Build capacity moved to GoGoCash

Start no new threads or lanes on any provider. The 13:17 batch is disabled. The held items, their state and their next steps are in `scratch/held-2026-11-11.md`. #395 and #396's fix rounds are DONE but not pushed, and the 1B-T13 brief is READY but unreviewed. Still allowed: watching main for real CI reds and reporting them.

**Parked 16:10 Bangkok (Tee's ask; hold still on).**

- **#395** https://github.com/mygogocash/jotbun/pull/395: fix commit pushed to `p2/t12-card-stack` as a plain fast-forward from `90b50793`. Head is now `af61e89a3413f32478f233179c04999d8e31cac6`. Marked **draft**.
- **#396** https://github.com/mygogocash/jotbun/pull/396: fix commit pushed to `fix/download-aborts` as a plain fast-forward from `d0cc479c`. Head is now `763edb3f5c180171a89025c824b4ea54bb033acc`. Marked **draft**.
**Post-restart gate, 16:11 to 16:12 (Tee's standard after the 16:05 T3 restart).** The addendum arrived after the 16:09 pushes, so the gate ran right after them, on the pushed heads. Both pass. Scripts and logs are in `scratch/park-gate/` (`gate-395.sh`, `gate-396.sh`, `395/`, `396/`). jotbun has no lint script, so lint was not run. Secrets: `gitleaks git` over each PR's commits (`origin/claude/p1a-vault-core..HEAD`).
- #395 at `af61e89a` (app): `typecheck:app` exit 0; `test:app` 34 of 34; `test:unit` 974 of 974; render, focused on `src/wallet/card/`, 24 of 24 in 2 files; `git diff --check` clean; gitleaks "no leaks found". No app build applies: no route, config or entry change, so no `export:web`; CI runs the full render suite and the exports.
- #396 at `763edb3f` (edge): `typecheck:edge` exit 0; `build:edge` exit 0; `test:edge` 176 of 176 in 15 files and the focused workers file `download-aborts.test.ts` 7 of 7, both under the heavy lock (16:11:33 to 16:11:47, released); `git diff --check` clean; gitleaks "no leaks found".
- Nothing else was done: no PR body updates, no reviews, no CI follow-up, no merges. The pushes may trigger CI on the local runners; nobody is watching it. On resume, the "push" part of these two rows is done: start from updating the PR bodies and marking each PR ready for review.

(A copy of `scratch/held-2026-11-11.md`, which `sync_state.sh` does not carry, so it can resume from GitHub alone.)

### Held items

| Task | State at the hold | Next step on resume |
| --- | --- | --- |
| **#395 P2-T12 fix round** (card stack) | **MERGED 11 Nov 19:50 as `ecc10df`; see the top section.** Earlier: DONE, committed locally, not pushed. Branch `p2/t12-card-stack` in WT `p2-t12`. Fix commit `af61e89a`, on top of merges `3e3f515f` and `37e366aa` (the second only brings in `.claude/` changes). Cursor Auto, thread `mcp:launch:daac26a1…`. Every RED, GREEN and mutant Expected line held, and the review's eight survivors are killed. The earlier run's test edits matched the kit and were kept. | Push to `p2/t12-card-stack`, update #395's body, run an Opus-High confirming review (the fix writes new logic), get green local CI, then merge into the integration branch only once Fronk confirms the low-risk merge rule. Promote, then clean up. |
| **#396 fix-download-aborts fix round** | **MERGED 11 Nov 20:10 as `72cdd02`; see the top section.** Earlier: DONE, committed locally, not pushed. Branch `fix/download-aborts` in WT `fix-download-aborts`. Fix commit `763edb3f`, on top of merges `bbb63e18` and `75b450e1`. Cursor Auto, thread `mcp:launch:352d7abf…`. Test-only (`download-aborts.test.ts` and the receipt): GREEN 7 of 7, the five review mutants each fail their own case, 14 of 14 killed. The earlier run's test edit matched the kit's `real/` and was kept. | Push to `fix/download-aborts`, update #396's body, and get green local CI. It is test-only from its planner's kit, so the controller checks it instead of a second review. Then merge once Fronk confirms, promote, and clean up. |
| **P2-T14 build** (add flow, keypad, amount step) | **Not started.** WT `p2-t14` on `p2/t14-add-flow`, clean at `f218796d`. Prompt `scratch/dispatch/P2-T14-implementer.prompt.md`, notes `P2-T14-implementer-notes.md`. P1 to P17 accepted. | Launch with `t3_thread_launch` in the jotbun project (`cc4b9cae-2d3c-4aeb-b98f-affe256dcb86`), `workspaceStrategy: {type: "root"}`, on Antigravity `claude-sonnet-5-5-high`, falling back to Claude Code then Cursor. After DONE: open the PR and run an Opus-High review. P2-T20 waits on its merge. |
| **P2-T33 build** (Face ID lock) | **Not started.** The brief is READY on `b8095b99` (`briefs/P2-T33.md`, kit `scratch/p2-t33-planner/`). WT `p2-t33` on `p2/t33-face-id-lock` was made at `b8095b99`. Prompt `scratch/dispatch/P2-T33-implementer.prompt.md`, notes `P2-T33-implementer-notes.md`. | Launch as for P2-T14. **Merge order (ruling P17):** P2-T14 first. In `apps/app/src/dev/catalogue/wallet/index.ts` the lock's spread goes last (`...WALLET_ADD_SECTIONS,` then `...WALLET_LOCK_SECTIONS,`). The second PR to merge resolves the one-line conflict as `scratch/p2-t33-planner/merge/index.t33-t14-conflict.ts` shows, or applies the `after-p2-t14` diff if P2-T14 has merged first. If the head moved with code changes, regenerate the prompt (`make_prompt.py implementer P2-T33 --wt p2-t33 --branch p2/t33-face-id-lock --head <head> --notes …`) and recreate the WT. |
| **1B-T13 build** (vault into the HTTP Worker) | **The planner posted READY at 12:55** (Claude Code Opus, thread `mcp:launch:9ebaef6c…`): `briefs/1B-T13.md`, no unfilled placeholders, kit `scratch/1b-t13-planner/` with 144 SHA256SUMS lines, check clean. Size L, 60 paths, rulings P1 to P5 (the plan is out of date on Better Auth and the PostHog proxy). Proofs: RED Node 12 of 18, `c1-worker` 2 of 6, both m-1 cases; GREEN Node 48, `c1-worker` 6, workers 134, the three smokes; 28 of 28 mutants killed. **The controller has not reviewed the brief yet.** No WT has been created. | Review the brief (rulings P1 to P5 first). If accepted: create WT `p1-1b-t13` on `p1/1b-t13-vault-http` from the integration head, then `make_prompt.py implementer 1B-T13 --wt p1-1b-t13 --branch p1/1b-t13-vault-http --head <head> --lock`, and launch on Antigravity `claude-opus-5-5-high` (a hard task) under the heavy lock. |
| P2-T20 | Waits on P2-T14's merge. | Plan it after P2-T14 merges. |
| P2-T16 | Unheld but not planned. Carries tray-hardening's c-n1 (`followups.md`). | Dispatch a planner. |

### PRs (no merges by the controller)

- **#393** (promotion of wallet-looks-unstored): Fronk merges it himself, on the task PR's green CI. The thread still watches it passively. After it merges: check that #399 and the PRs above it rebase cleanly and stay green.
- **#70** (redesign plan, base main): green on the local runners at `8cf44d34`. Not to be merged; its plan content is already on main. Fronk may close it.
- **The promotion stack (#373 up to #402):** all green except #393 (a billing refusal). Each waits on Fronk's merge into main, bottom-up from #373.

### Infrastructure left running

- Two local CI runners (`jotbun-runner-1` and `-2`, label `jotbun-local`) and the repo variable `CI_RUNNER=jotbun-local`. main's own workflow still says `ubuntu-24.04` until the promotion stack lands, so a push to main runs on GitHub-hosted runners, and while billing refuses it fails in about 3 seconds. That is a billing refusal, not a real red.
- To free the Mac fully: `bash .claude/controller/local-ci/runners.sh down`. PR CI then stops until billing is fixed or the runners come back.

## 11 Nov 12:05 Bangkok: #395 and #396 fix rounds pulled forward onto Cursor

Fronk wants the Mac Studio used; it was nearly idle (load about 2 on 18 cores). Jot pulled part of the 13:17 batch forward:
- **#395 fixer (P2-T12):** Cursor Auto (`cursor` / `default`), thread `mcp:launch:daac26a10154da8570c4fb1aa7559780d8de1c067aad7f2884961f0f916aa432`, WT p2-t12, prompt `scratch/dispatch/P2-T12-fixer.prompt.md`.
- **#396 fixer (fix-download-aborts):** Cursor Auto, thread `mcp:launch:352d7abf218297cb7df80fcac22d8b34cb1b2daca14350de6a74de042059850d`, WT fix-download-aborts, prompt `scratch/dispatch/fix-download-aborts-fixer.prompt.md`. It takes the heavy lock.
- Each first keeps the leftover uncommitted edits from the 08:16 run only if they match the brief's kit byte for byte, discards them otherwise, and says which in the receipt. Trailer: `Co-Authored-By: Cursor Auto <noreply@cursor.com>`. Local commits only.
- **13:17 (scheduled wake-up):** P2-T14 and P2-T33 on Antigravity Sonnet 5.5 High; 1B-T13 on Antigravity Opus 5.5 High if READY and reviewed. #395 and #396 are skipped there while their Cursor runs are active.
- **Merging is paused:** nothing merges, even under the low-risk rule, until Fronk confirms that rule in the controller's chat. #393 stays watched for Fronk's own merge.

## 11 Nov 12:00 Bangkok: 1B-T13's proofs passed; its planner stopped before finishing

The 1B-T13 planner (Claude Code thread `mcp:launch:9ebaef6c…`) hit its Claude Code 5-hour limit, which resets at 12:50 ICT, before posting a verdict. No jotbun test process is alive and the heavy lock is free.

**Its chained proof run finished, and every proof passed** (`scratch/1b-t13-planner/proof/run-all.out`, 09:07:48 to 09:55:12):
- RED: Node 12 of 18 failed, `c1-worker` 2 of 6, and both m-1 cases in `ai.test.ts`. Every failure is an assertion (501 or 503 where 200 or 503 was expected, route lists, the workers config's `main`); none is a load error.
- GREEN: Node 48 of 48, `c1-worker` 6 of 6, the focused workers files 134 of 134, the money smoke 1 of 1, the files smoke 4 of 4, the live smoke 1 of 1. The build passed at RED and at GREEN.
- Mutants: 28 of 28 killed, no survivors, none left unrestored (`proof/mutants.out`).

**What the planner did not finish:**
- `briefs/1B-T13.md` (assembled 09:06) still has 14 unfilled placeholders: `RED_C1`, `RED_AI`, `GREEN_C1`, `GREEN_WORKERS`, `GREEN_MONEY`, `GREEN_FILES`, `GREEN_LIVE`, `MUTANTS_KILLED`, `MUTANTS_TOTAL`, `MUTANT_MINUTES`. There is no `brief-values.json`, and `assemble-brief.py` has not been rerun.
- There is no `SHA256SUMS` or `SHA256SUMS.logs`: `make-sums.sh` has not run.
- There is no READY or BLOCKED verdict.

**12:53:** T3 resumed the planner at 12:50 (run 3, limit cleared). It confirmed the proofs and that no code changed since b8095b99. The controller's finishing message (fill the values, assemble, make the sums, post a verdict, no reruns) was steered into that run. Waiting for READY or BLOCKED.

**After 12:50:** send the planner one message to finish without rerunning any proof. It should fill `brief-values.json` from `proof/run-all.out` and `proof/mutants.out`, rerun `assemble-brief.py` (expecting no unfilled placeholders), run `make-sums.sh`, and post READY or BLOCKED. Then the controller reviews the brief and, if READY, adds the 1B-T13 build to the 13:15 batch with `--lock`.

## 11 Nov 10:15 Bangkok: Fronk's decisions on #393 and #70

- **#393:** Fronk merges it himself, on the task PR's green CI. Do not rerun or change it. After it merges, check that #399 and the PRs stacked above it rebase cleanly and still show green CI. The controller watches #393.
- **#70 (redesign plan, base main): fixed, not to be merged.**
  - Root cause: its red run is from 26 Oct. Two render tests timed out under load: HistoryReturn's record-and-back case hit the 5 s test timeout, and QuickAdd's "already saved" text lookup gave up early.
  - #70's content is already on main: its head tree equalled main's bf1215c4, so a fresh run tests main's own tree. main has since given HistoryReturn a 20 s budget (2876fc91), and main's afcf8846 passed CI on 9 Nov.
  - Fix, in WT `redesign-plan-ci`: a merge of origin/main (27accdb9, no diff against main), then 8cf44d34, which applies the integration branch's `runs-on: ${{ vars.CI_RUNNER || 'ubuntu-24.04' }}` switch to main's three jobs. `backend-workflow.test.mjs` passes 6 of 6. Pushed to `claude/jotbun-redesign-plan` as a fast-forward. The PR's diff is now that one workflow file. The controller watches #70.
  - **10:20: all 3 checks passed on 8cf44d34** (local runners). Watch removed. Left for Fronk: it is not to be merged; closing it is an option, since the plan is already on main.
  - If #70 ever merges before the promotion stack, main's backend.yml meets the stack's nine-job version in one conflict. Fronk's call is not to merge it.

## 11 Nov 10:00 Bangkok: the 13:15 relaunch batch, open PRs, the lock

**Relaunch at or after 13:15 ICT, on Antigravity `claude-sonnet-5-5-high`.** Each is a `t3_thread_launch` in the jotbun project (`cc4b9cae-2d3c-4aeb-b98f-affe256dcb86`) with `workspaceStrategy: {type: "root"}`, so it runs in `/Users/kunanonjarat/Developer/jotbun`, not a T3 worktree. The message for each is the `prompt:` line its prompt file was made with.
1. The #395 fixer (P2-T12): `scratch/dispatch/P2-T12-fixer.prompt.md`, WT p2-t12. See the leftovers note below.
2. The #396 fixer (fix-download-aborts): `scratch/dispatch/fix-download-aborts-fixer.prompt.md`, WT fix-download-aborts. See the leftovers note below.
3. The P2-T14 implementer: `scratch/dispatch/P2-T14-implementer.prompt.md`, WT p2-t14 (clean).
4. **The P2-T33 implementer (the Face ID lock):** `scratch/dispatch/P2-T33-implementer.prompt.md`. Its notes are in `P2-T33-implementer-notes.md`. The brief is READY on b8095b99 (Claude Code planner thread `mcp:launch:08bd63e5…`), with the kit at `scratch/p2-t33-planner/`. WT p2-t33 on `p2/t33-face-id-lock` was made at 10:00 from b8095b99, which was still the head.
   - **Merge order against P2-T14 (ruling P17):** merge P2-T14 first. Both add their spread last in `apps/app/src/dev/catalogue/wallet/index.ts`, and the lock's goes last: `...WALLET_ADD_SECTIONS,` then `...WALLET_LOCK_SECTIONS,`. The second PR meets a one-line conflict; resolve it as `scratch/p2-t33-planner/merge/index.t33-t14-conflict.ts` shows. If P2-T14 merges before P2-T33 reaches Step 4.1, the implementer applies the `after-p2-t14` diff instead.
5. **The 1B-T13 implementer:** pending the planner's READY or BLOCKED (Claude Code thread `mcp:launch:9ebaef6c…`). When it lands, review the brief, make the prompt with `make_prompt.py implementer 1B-T13 --wt p1-1b-t13 --branch p1/1b-t13-vault-http --head <head> --lock`, and add it to this batch. It needs the heavy lock, so it runs its database suites one at a time behind the other agents.

**Heavy lock, 09:55:** `/private/tmp/claude-501/jotbun-heavy.lock` had been held since 08:14 by the fix-download-aborts fixer, which died at the 08:20 quota cutoff. `ps` showed no jotbun test process, only the 1B-T13 planner's `locked.sh` waiting in its loop; the running Postgres and Supabase containers are unrelated (system postgresql@16, and `tbh-local`). Cleared under lessons.md ("A killed run can leave the heavy lock held"). The planner's chained proof run took the lock at once.

**Open PRs, 10:00:**

| PR | Base | CI | Waiting on |
| --- | --- | --- | --- |
| #373 1D-T8 (privacy) | main | green, 3 of 3 | Owner's merge (bottom of the promotion stack) |
| #378 P4-T13, #380 1B-T8, #381 P4-T12 | stacked | green, 3 of 3 | The PR below, then the owner (#378 and #381 are slip and privacy work: read closely) |
| #384, #386, #388, #389, #390 | stacked | green, 9 of 9 | The PR below, then the owner |
| #393 wallet-looks-unstored | stacked | red, billing refusal only | Owner's decision (see 08:20 below) |
| #399 tray-hardening, #400 1B-T12 | stacked | green, 9 of 9 | #393, then the owner |
| #401 download-pins | stacked | **green, 9 of 9** at 7b336d80 (local runners) | The stack below, then the owner |
| #402 alarm-hardening | stacked | **green, 9 of 9** at 8e9b9823 (local runners) | The stack below, then the owner |
| #395 P2-T12 | integration | red (old billing runs) | The 13:15 fix round, a confirming review, a fresh CI run |
| #396 fix-download-aborts | integration | red (old billing runs) | The 13:15 fix round, a fresh CI run |
| #70 Jotbun redesign plan | main | red (typecheck, unit, render) | Owner: fix, rebase or close (untouched since 26 Oct) |

## Fixers dispatched, 11 Nov 08:15 Bangkok (Cursor Auto controlling; owner: "continue")

- **#396 fix-download-aborts:** the fixer runs on Antigravity `claude-sonnet-5-5-high`, T3 task `fix-download-aborts-fixer-20261111b`, in WT fix-download-aborts. Its assignment is `scratch/dispatch/fix-download-aborts-fixer.prompt.md`, with notes on the moved head.
- **#395 P2-T12:** the fixer runs on Antigravity `claude-sonnet-5-5-high`, T3 task `p2-t12-fixer-20261111b`, in WT p2-t12. Its assignment is `scratch/dispatch/P2-T12-fixer.prompt.md`.
- Both merge the head first (dry merges were clean). Totals may differ from the briefs; their own files' Expected lines must hold.
- **P2-T14:** the implementer runs on Antigravity `claude-sonnet-5-5-high`, T3 task `p2-t14-implementer-20261111b`, in a new WT p2-t14 on p2/t14-add-flow from a1376d9f. P1 to P17 are accepted, and check_kit gave 29 OK with both orig/ files identical. Its assignment is `scratch/dispatch/P2-T14-implementer.prompt.md`. After DONE: open its PR and dispatch an Opus-High reviewer. P2-T20 waits on its merge.
- **Planners on Antigravity `claude-opus-5-5-high`, from a1376d9f:**
  - 1B-T13 (T3 task `1b-t13-planner-20261111b`; WT p1-1b-t13 on p1/1b-t13-vault-http; heavy lock);
  - P2-T33 (T3 task `p2-t33-planner-20261111b`; WT p2-t33 on p2/t33-face-id-lock).
  - Assignments are in `scratch/dispatch/*-planner.prompt.md`.
- **08:20, Antigravity quota exhausted** ("Usage Limit Reached"; resets about 13:15 ICT). Per Jot (project lead):
  - The two planners were relaunched on Claude Code Opus 5.5 at xhigh as jotbun-project threads: 1B-T13 `mcp:launch:9ebaef6c1e804f526fa77041ab4422b877197854c952055a788252390cced555`, P2-T33 `mcp:launch:08bd63e532b6ccb4664d7df6e24e4523c252f5081e05d368976fcb044621a1af`.
  - **Waiting on the Antigravity quota reset (not before 13:15 ICT):** the #395 fixer (P2-T12), the #396 fixer (fix-download-aborts) and the P2-T14 implementer. Relaunch them on Antigravity Sonnet 5.5 High with the same prompt files.
  - Leftovers from the stopped runs: `worktrees/p2-t12` has a local merge of the integration branch (3e3f515f) plus uncommitted edits to `CardStack.render.test.tsx` and `cardStackNative.test.ts`, and a new `cardNativeProps.test.ts`. `worktrees/fix-download-aborts` has a local merge (bbb63e18) plus an uncommitted edit to `download-aborts.test.ts`. Tell the relaunched fixers to inspect these and either keep or discard them before starting. `worktrees/p2-t14` is clean.
  - #393 (promotion of wallet-looks-unstored) is red only because of the 10 Nov billing refusal. Its branches predate the `CI_RUNNER` workflow change, so a rerun would be refused again. The owner decides whether to merge on the task PR's green CI or to have the change pushed into that promotion branch.
- Both delegate_task rounds (ids ending `a`, then `b` with the projectId) stopped unread: a delegated child runs in the parent's checkout, and Antigravity sandboxed it there. At 08:17 all five were relaunched as top-level threads in the jotbun project root (no completion wake; check with `t3_thread_read`):
  - #395 fixer `mcp:launch:d7e0a83e0ef6e4bd7688b3a1cccadfcceda5c6b07c99188530bad3efe07c0334`
  - #396 fixer `mcp:launch:3a4fd6fcc70a9915e49e6982ba2ce277534e955440cc88a7345089734bab66b3`
  - P2-T14 implementer `mcp:launch:84b315171b6c1aa0757c7cbb846efd7cd2a074d5402ab2bc8d19ba4226be8a66`
  - 1B-T13 planner `mcp:launch:b688b714ca91ab804d633e3f355f40b768964574c7780ce3664d1b217b0a96a4`
  - P2-T33 planner `mcp:launch:f9e1ed3c9454b26791079fc057e8792506672bf1d78527c4f13c7ec4d225d8c7`
- **Do not dispatch these again.** After DONE: push, update the PR body, and run an Opus-High confirming review (#395's fix writes new logic, so it gets one; #396's is test-only from its planner's kit). Then merge on green local CI and promote (owner: "if CI pass merge it"; the merge script cleans up the worktree and branches).

## Routing moved to Antigravity, 11 Nov 07:50 Bangkok (owner: Antigravity's credits are unused, "maximize it")

- Every delegated role now runs on Antigravity, and Claude Code's limit is for the controller only. This replaces the 10 Nov routing below. `make_prompt.py` prints the targets:
  - planners, first reviews and confirming reviews: `claude-opus-5-5-high`;
  - implementers and fixers: `claude-sonnet-5-5-high`;
  - the second review of money-path or privacy PRs: `gemini-4-argon-high`, a different model family;
  - scouting: `gemini-3.8-flash-high`.
- `--claude-code` runs a role on Claude Code if Antigravity is down or out of credit. `--claude-limited` is gone.

## Merged 11 Nov 07:45 Bangkok (owner: "if CI pass merge it")

- On green local CI and approved reviews, at their exact heads (each head is the reviewed commit plus receipt corrections; #392's is the reviewer's own COMBO patch):
  - #392 tray-hardening at 99ce506, merged as 37a0d2f; promotion #399. c-n1 goes to P2-T16 (followups.md). **P2-T16 is off held.txt.**
  - #394 1B-T12 at d853122, merged; issue #116 closed; promotion #400.
  - #397 download-pins at ac61350, merged as 7b336d8; promotion #401.
  - #398 alarm-hardening at 3707c29, merged as 8e9b982; promotion #402. Download-pins' kit mutant V3 no longer applies after #398: rerun it with A1's text (followups.md).
- The round-two tray brief (`briefs/tray-hardening-fix2.md`) is no longer needed; its c-n1 is P2-T16's.
- Still open: #395 (P2-T12) and #396 (fix-download-aborts), each with a READY fix brief and no fixer yet. Next by the plan: dispatch P2-T14, then P2-T20 once P2-T14 merges.

## CI runs on this Mac now, 11 Nov 06:05 Bangkok (owner's approval)

- GitHub-hosted runners still refuse every job (billing). The workflow's nine jobs now run on the runner the repo variable `CI_RUNNER` names (2945a783 on the integration branch). It is set to `jotbun-local`: two self-hosted Linux arm64 runners in Colima, each with its own Docker daemon on a private socket.
- **Manage them:** `bash .claude/controller/local-ci/runners.sh up|down|status`. Colima must be running (`colima start --cpu 10 --memory 32 --disk 100`). To go back to GitHub's runners, delete the variable: `gh variable delete CI_RUNNER --repo mygogocash/jotbun`.
- **A PR picks the change up on its next run:** a push, or close and reopen, because pull-request runs read the workflow from the merge with the base. A `gh run rerun` of an old run still targets ubuntu-24.04 and is refused.
- **The owner approved starting Docker for CI.** Agents' local gates still skip database suites; CI runs them on these runners.
- **The first run, #392 at 99ce506, passed all nine jobs** (23:05 to 23:38 UTC, 33 minutes with two runners). #392 is not merged: the plan above still has a fixer bring it to the fix2 kit.
- #394, #397 and #398 were reopened at 06:40 for local runs. #395 and #396 run on their fixers' pushes.

## Cursor Auto stepped back, 11 Nov 05:57 Bangkok: two things it left for this controller

- **#392 has a commit the round-two planner does not know about: 99ce506** (pushed 10 Nov about 14:40). It is the confirming review's validated COMBO guard (`if (!shown && !showing.current) closed.current?.()`, the `showing` ref restored), the HIDE-END case and c-n2's receipt lines.
  - RED: 1 failed | 26 passed on fc78376's code. GREEN: 27 of 27. `tsc` exit 0, `test:app` 34, `test:unit` 970.
  - Its five guard mutants G1 to G5 are killed, and 35 of the planner's 37 that still apply are killed (`scratch/tray-hardening-fix2/`).
  - c-n1 is not in it. Either keep 99ce506 and narrow the round-two brief (`wf_41e3ff21-3b6`) to c-n1, or revert it with a new commit.
  - Its CI run 42777094800 was refused for billing.
- **The model routing below** is the owner's rule for new dispatches, so the #395 and #396 fixers go to Antigravity Argon. The owner has not yet answered whether money-path and privacy PRs need their approval to merge into the integration branch.
- This thread no longer watches #392 to #398.

## Model routing changed, 10 Nov 14:40 Bangkok (owner's ask: "maximize AI resources")

- The skill's new "Model routing" section and `make_prompt.py` (which now prints a `delegate_task` target) apply to every dispatch from now on:
  - planners stay on Claude Code Opus xhigh;
  - builds, fixes, reviews and confirming reviews move to Antigravity Gemini 4 Argon (High);
  - money-path and privacy PRs also get a second review on Antigravity Claude Opus 5.5 (Medium), and the owner approves their merge;
  - scouting and CI triage go to Antigravity Gemini 3.8 Flash (High);
  - Fable 5.2 is an advisor only, about once a day.
- The sources are `/Users/kunanonjarat/ai-agent-workflow.md` and gogocash's `knowledge/practice/model-routing.md`.
- Agents already running (#392 to #398) keep their models. The routing starts with the next dispatch, e.g. #396's test-only fixer and its confirming review.
- `make_prompt.py --size` is gone; `second` and `--claude-limited` are new.

## Takeover in T3 Code (9 Nov, 22:05 Bangkok): READ THIS FIRST

The Orca controller (session 121af0e6) hit its 5-hour usage limit at 22:04; the limit resets at 01:50 on 10 Nov. Its agents died with it, and its background jobs were killed. **Do not let that Orca session continue when its limit resets**, including through its "Continue automatically when limits reset" option: two controllers would collide in the same worktrees.

New controller: a T3 Code thread (Claude Code session 22c24cd3). Its own checkout, `/Users/kunanonjarat/.t3/worktrees/jotbun/t3-d9c08cd1-928de148f4930c37`, is main at afcf884; the controller works on the main checkout's `.claude/controller` and the task worktrees by absolute path.
- **Dispatch:** T3's `delegate_task`, which pins model and effort (Opus xhigh, Haiku max, Sonnet xhigh), with `ultracode: false` for every child (SKILL.md).
- **Cleanup at takeover:**
  - 1D-T8's killed mutant runner had left mutant P8 in `PrivacyScreen.tsx`. The controller copied the kit's `real/` file back (checksum verified).
  - The heavy lock, held since 21:53 by 1B-T8's killed final proof, was removed; no test process was alive.
  - `inflight_agents.py` now lists agents that failed on a usage limit; it had missed the P4-T12 and P4-T13 planners.
- **Resumed at about 22:15**, with resume notes in `scratch/takeover/*.resume.md`. The T3 task ids end with the uuid shown.
  - **1D-T8: merged as 30fb26b (#372, at 22:50).** Issue #139 is closed, and the worktree and branches are removed.
    - The Opus review (`reviews/1D-T8.md`) approved with one minor and five nits. They are in followups.md under the analytics-consent-hardening task, which must land before `analytics` is approved, plus P2-T18's swap.
    - CI on 2ff0b8d: render 108 files and 1865 cases, `test:unit` 927, `test:app` 34, `export:web` 4794.
    - **CI has no iOS export and no `typecheck:routes`** (review n5). The controller ran the iOS export on 2ff0b8d before the merge (exit 0, 5760 modules); receipt corrected in 8979ad6.
    - protocol.md now says so, and the ci-parallel-jobs planner was told to add both steps. Until that merges, run the iOS export (baseline.sh's command) before merging any task that changes routes, the app entry or native code.
    - **Promotion PR #373** (`promote/1d-t8`, base main) is the first of the stack; the next promotion stacks on it. The owner merges into main.
    - The P2-T11 planner was told 1D-T8's files are now on the head.
  - **App baseline at 30fb26b** (CI): render 108 files and 1865 cases, `test:unit` 927, `test:app` 34, web 4794, iOS 5760.
- **P2-T13: brief READY at 712574d** (L, depth 18): the tray, main button, text link and lock cover.
  - Files: 9 new. Shared: `dev/catalogue/wallet/index.ts` (one spread; its sections are in its own `traySections.tsx`, to stay clear of P2-T11's `kitSections.tsx`), a comment in `theme/motion.ts`, and one extended case in `useWalletMotion.render.test.tsx`.
  - P1 to P19 are accepted. P5 keeps the two animation systems one per surface. P6 pins P2-T9's m-2 (drop it from followups.md once merged; m-1 stays). In P17, P10 is equivalent (Pressable reports `disabled` itself).
  - The planner proved it also laid over P2-T11's final files, so it works in either merge order. Kit `scratch/p2-t13-planner/`: check_kit at ee12d43 gives 27 OK, and the 3 `orig/` files are identical. 98 of 99 mutants are killed and one is equivalent.
  - The implementer (Haiku max, 094336d2) was dispatched at about 06:20 in a pre-installed p2-t13 from ee12d43. No iOS export is needed.
  - For E2-A, see P19 (button sizes, the title's alignment, the backdrop without a fade).
  - **DONE at 2f0e40e; PR #383 opened at 06:35 (issue #159).**
    - RED: Node 4 of 4, render 16 of 16. GREEN: 4 and 22, neighbours 42. 98 of 99 mutants killed, with P10 equivalent; the output matches the planner's.
    - A server restart cut off the first mutation run at R31. The implementer restored `Tray.tsx` from `real/` and reran all 99.
    - The controller checked the 11 files against the kit and the clean merge with the head.
    - **The review runs as a workflow** (run wf_74d1e17e-476): two Opus lenses (closing, the lock, the exit and motion; names, focus, buttons, the test traps, shared edits and CI), a skeptic for each blocker or major, and a synthesizer writing `reviews/P2-T13.md`.
    - On approval and green CI: `merge_task_pr.sh 383 2f0e40e P2-T13`, then `promote_pr.sh P2-T13 383`. No iOS export is needed.
    - #382 (P2-T11) and #383 share no file. Whichever merges second, CI tests the merge ref; read the PR through the API first (lessons.md: a stale merge ref).
  - **1B-T8: brief READY at 0bd5659** (L, 16 files under apps/edge). P1 to P17 are accepted, with P4 recorded as R101.
    - Kit `scratch/1b-t8-planner/`: check_kit at db19056 gives 47 OK, and the 13 `orig/` files are identical.
    - The planner's proof: RED 38 of 53 failing, GREEN 52 plus 1 todo, 62 of 62 mutants. In the ten-times memory case, `peakHeldBytes` was at most 20,644,143 against a bound of 20,644,976.
    - For CI: workers +1 file, +37 passed and -2 todo; `test:edge` +0.
    - The implementer (Haiku max, a4857037) was dispatched about 22:34 in a pre-installed p1-1b-t8 from db19056. Its workers runs hold the heavy lock.
    - **DONE at f416f24; PR #374 opened at 22:53 (issue #112).** RED 38 of 53, GREEN 52 plus 1 todo, 62 of 62 mutants, `test:edge` 15 files and 176 tests, and `build:edge` with no driver markers. In the ten-times case, `peakHeldBytes` was 20,644,119 against a bound of 20,644,976.
    - The controller checked the 16 files against the kit and the clean merge with the head.
    - **Merged as 1c14dd1 (#374, at 23:18).** Issue #112 is closed, and the worktree and branches are removed.
      - The Opus review approved with three minors and two nits; all seven focus items hold, including R101's retry ending `failed` on real repeated throws.
      - m-1 (a resync can stall for a day after a stale snapshot is pruned) goes to 1B-T11, before pruning goes on the alarm.
      - m-2 (the memory proof's spy can be bypassed with a spread), m-3, n-1 and n-2 go to fix-download-aborts, with the reviewer's ready cases in `scratch/1b-t8-review/`.
      - Also from the review: 1B-T12 must expect a deleted snapshot's 404 against the API's `expired` (or 1B-T11's fix changes it); the 64 MiB snapshot cap is not proven against 128 MB (a hosted check).
    - **Edge baseline now (CI):** workers 28 files, 675 passed and 1 todo; `test:edge` 15 files and 176 tests.
    - **Promotion PR #380** is stacked on #378 (stack #379: #373, #378, #380).
- **Server lane, dispatched at 23:20 from 1c14dd1 (Opus xhigh, in parallel; no shared file in their listings):**
  - **1B-T7: brief READY at 712574d** (M), the AI routes. New: `vault/ai.ts`, `v1/ai/service.ts`, `v1/ai/routes.ts`, `test/workers/ai.test.ts`. It also edits nine shared files, including three minimal `handler.ts` edits, none on a `headOf` line.
    - P1 to P18 are accepted. P2: a signed-out session with a malformed body gets 422 where the PostgreSQL edge gave 401; the token is still verified first, and these routes are edge-only. P5: every step rechecks the session, the policy and that the account is active.
    - The vault bundle grows to about 1,645 kB (gzip 377 kB), mostly the Anthropic SDK, by the plan's design.
    - Kit `scratch/1b-t7-planner/`: check_kit at d340ffe gives 44 OK, and the 9 `orig/` files are identical. The planner's proof: 99 of 99 mutants. For CI: workers +1 file and +38 tests.
    - The implementer (Haiku max, 603c183d) was dispatched at 06:38 in a pre-installed p1-1b-t7 from d340ffe, under the heavy lock for workers runs.
    - **DONE at 6223843 (synced to e469d8b); PR #385 opened at 06:56 (issue #111).**
      - RED and GREEN 38 of 38, and 99 of 99 mutants in four batches. `test:edge` 15 files and 176 tests. `build:edge` gives 1,645.04 kB with every driver marker at 0.
      - The controller checked the 13 files against the kit and the clean merge with the head. It is the first task PR in the nine-job CI.
    - **The review runs as a workflow** (run wf_529f455b-229): two Opus lenses (the AI service's order, sessions, fallbacks and privacy; the edge wiring, shared files, bundle and CI), a skeptic for each blocker or major, and a synthesizer writing `reviews/1B-T7.md`.
    - **Merged as 365ec2e (#385, at 07:58).** Issue #111 is closed, and the worktree and branches are removed.
      - The review workflow approved: no blocker or major, five minors and nine nits (followups.md).
        - m-1, the `budget_status` guard for months before 1970, goes to 1B-T13.
        - m-2, the `ai.consume` session pin, goes to fix-download-aborts.
        - m-3 to m-5 go to the test-only ai-service-pins follow-up.
      - CI: nine jobs on 6223843 into c764cf2, with workers 29 files and 713 passed. Only P2-T11's app files merged after that base.
      - **Promotion PR #388** is stacked on #386; stack #379 now holds seven PRs.
  - **fix-download-aborts: not yet planned.** It is held until a review workflow finishes, to keep about six local agents (the thermal lesson). Plan it on top of `scratch/1b-t7-planner/real/src/v1/handler.ts`, carrying the full list in followups.md (R97, plus the review cases from 1B-T6, 1B-T8, 1B-T9 and 1B-T10).
  - **1B-T11: brief READY at 712574d** (M), files on the vault alarm.
    - Files: new `jobs.ts`, migration `0003_alarm_indexes.sql` and `files-alarm.test.ts` (23 cases). Shared: `user-vault.ts`, `retention.ts`, `executor.ts`, `migrations/index.ts`, and 1B-T8's `snapshots.ts` and `snapshots.test.ts`.
    - P1 to P19 are accepted, with P2 recorded as R104 (a one-minute floor for writes). P1 fixes 1B-T8's m-1 (a stale snapshot keeps its row and reads `expired`), with a residual accepted.
    - Kit `scratch/1b-t11-planner/`: check_kit at 55b5781 gives 29 OK, and the 6 `orig/` files are identical. The planner's proof: RED 25 of 72, GREEN 72, 32 of 32 mutants; the AFFECTED 14 workers files gave 414 passed and 1 todo.
    - The implementer (Haiku max, 2bc80cea) was dispatched at 07:08 in a pre-installed p1-1b-t11 from 55b5781, under the heavy lock.
    - **DONE at a9a7d27; PR #387 opened at 07:20 (issue #115).**
      - RED 25 of 72, GREEN 72, 32 of 32 mutants. AFFECTED: 14 files, 414 passed and 1 todo. `test:edge` 176. `build:edge` gives 722 kB with every driver marker at 0.
      - The controller checked the 9 files against the kit and the clean merge with the head.
    - **The review runs as a workflow** (run wf_1b001b01-c31): two Opus lenses (the alarm rules, R104 and the rearm wiring; the snapshot fix, the migration, shared files and CI), a skeptic for each blocker or major, and a synthesizer writing `reviews/1B-T11.md`.
    - **1B-T7 merged first.** At about 07:59 #387's branch was updated through the update-branch API (`expected_head_sha` = the reviewed a9a7d27).
      - The new head 2f46822 is "Merge branch 'claude/p1a-vault-core' into p1/1b-t11-files-alarm". The task's files are unchanged, and the PR's diff is the same 10 files (+1110, -98).
      - A fresh nine-job run tests 1B-T11 together with 1B-T7.
    - **Merged as c8929f2 (#387, at 08:14).** Issue #115 is closed, and the worktree and branches are removed.
      - The review workflow approved: no blocker or major, four minors and ten nits.
      - CI was green alone (29 files and 698 passed) and together with 1B-T7 (30 files and 736 passed).
      - The findings (followups.md):
        - m1, m2 and m4 plus nits go to the new **alarm-hardening** follow-up, not yet dispatched;
        - m3 and n6 go to fix-download-aborts;
        - n8 (the 30-day expired window) goes to 1B-T12;
        - n10 to 1B-T13, and n7 to 1C-T11.
      - **Promotion PR #390** is stacked on #389; stack #379 now holds nine PRs.
    - **Edge baseline now (CI):** workers 30 files, 736 passed and 1 todo; `test:edge` 15 files and 176 tests.
    - fix-download-aborts is then planned on top of 1B-T7 and 1B-T11 once both merge (followups.md).
  - **fix-download-aborts** is planned next, on top of 1B-T7's `real/` `handler.ts`. It must land before 1B-T13; its list in followups.md now includes 1B-T8's review cases.
  - **ci-parallel-jobs: brief READY at 857b9f2** (M), with the controller's amendment (the iOS export and `typecheck:routes` in CI).
    - Nine parallel jobs; the expected median wall time is about 4.4 minutes, against 10.4.
    - Shared files: `backend.yml`, `backend-workflow.test.mjs`, `docs/implementation/handover.md` (two Full gate lines), `apps/app/package.json` (the `export:ios` script) and `README.md` (the CI paragraph).
    - P1 to P14 are accepted. Kit `scratch/ci-parallel-jobs-planner/`: 46 OK, and the 5 base files are identical at 857b9f2.
    - The implementer (Haiku max, a5529d6c) was dispatched at 23:08 in a pre-installed ci-parallel from 857b9f2.
    - **DONE at 46b30a0; PR #377 opened at 23:14 (no task issue).**
      - The workflow test: RED 4 of 9 passing, GREEN 9 of 9. All 19 mutants failed as expected.
      - `SPLIT OK`: parts 162, 196 and 218 of 576. `test:unit` 927, and `typecheck:routes` passed.
      - The controller checked the 5 shared files against the kit and the clean merge with the head.
    - **The review runs as a workflow** (run wf_1346c5d6-527): two Opus lenses (the split and the test's pins; the workflow and CI evidence), a skeptic for each blocker or major, and a synthesizer writing `reviews/ci-parallel-jobs.md`.
    - #377's own CI is the first nine-job run, including the iOS export's first Linux build. Its measured times go in the receipt's "After, measured" line.
    - **The review approved** (`reviews/ci-parallel-jobs.md`, two-lens workflow, resumed after the stop): no blocker or major, three minors and seven nits (followups.md; m2 and m3 go to P6C-T7). The render split is whole, every old step still runs once, and the iOS export passes on Linux.
    - **Before merging (review m1):** #377's only CI run was on the old base 4850463. Once the owner answers, close and reopen #377 for a fresh nine-job run on the current base and check its totals. Only then run `merge_task_pr.sh 377 46b30a0` (no task id). Each extra run costs about 33 billable minutes, which is why it waits for the answer.
    - **The owner answered on 10 Nov at 06:2x: "keep the nine-job CI, merge".**
      - The controller closed and reopened #377 at 06:24, but that run (42720201154, green, 256 s wall) checked out the stale merge commit `c56e0e4` (into 4850463), so it proved nothing new (lessons.md).
      - An API read then rebuilt the merge ref as 97f299c (base b272f0c, which holds P4-T13, 1B-T8 and P4-T12). The PR was reopened again at 06:32, for run 42721236288.
      - Run 42721236288 checked out `97f299c` = `46b30a0` into `b272f0c`, and its nine jobs were green in 288 s wall.
      - The render job had 107 files and 1291 tests, and the sections jobs 162, 196 and 218 of 576, for the full 1867. The exports built web 4806 and iOS 5772. Workers had 28 files.
    - **Merged as e469d8b (#377, at 06:39).** No task issue; the worktree and branches are removed.
      - **Promotion PR #384** (`promote/ci-parallel-jobs`) is on top of stack #379: #373 → #378 → #380 → #381 → #384.
      - The receipt's "After, measured" line, with nits n1 and n6, is in 9ed39fa.
      - protocol.md now states the nine-job layout (the iOS export is CI's again), and followups.md drops 1A-T10's minor 1 from P6C-T7 and closes 1D-T8's n5.
    - **From now on every PR's CI runs the nine jobs** (about 4.75 minutes, about 33 billable minutes). The controller no longer runs the iOS export by hand.
    - **Its merge waits on the owner's Actions-minutes answer** (Owner decisions waiting).
    - After the merge: P6C-T7 no longer carries 1A-T10's minor 1, briefs that say "CI's database job runs `test:edge:db`" now mean the `edge` job, and the protocol's iOS-export correction can be lifted.
  - **P4-T12: brief READY on 606e131's code** (M; 18 new files in `src/slips/` and ten placeholder routes under `app/spend/slips/`).
    - Shared files: `sharedV1.ts`, `DeviceDiaryProvider.tsx` and its test, and one line in `bunSettingsErase.render.test.tsx`. P1 to P15 are accepted, with P2 recorded as R102.
    - Kit `scratch/p4-t12-planner/`: check_kit at c1637ec gives 51 OK, SHA256SUMS.base 4 OK, and the 4 `orig/` files identical.
    - The planner's proof: 64 of 64 mutants. For CI: `test:unit` +11, web +12 modules, render +1 file and +2 cases.
    - The implementer (Haiku max, 30b6286d) was dispatched about 22:46 in a pre-installed p4-t12 from c1637ec. Its notes allow exactly 1D-T8's shift if #372 merges before its sync.
    - **DONE at 8b9e16e; PR #376 opened at 22:57 (issue #220).** RED: Node 11 of 11, render 3 of 10; GREEN 11 and 10; 64 of 64 mutants. `test:unit` 933, `export:web` 4803, `typecheck:routes` passed.
    - Its sync did not pick up 1D-T8; CI tests the merge ref. The controller checked the 21 files against the kit and the clean merge with the head.
    - **iOS export (the controller, CI has none):** exit 0, 5769 modules on 8b9e16e.
    - **The review runs as a workflow** (ultracode; run wf_b4bc3a66-c98).
      - Three Opus xhigh lenses: the contract, privacy, and integration (which includes a scratch merge with 1D-T8).
      - An Opus skeptic tries to refute each blocker or major.
      - A synthesizer writes `reviews/P4-T12.md` with the verdict.
    - **Merged as 712574d (#376, at 23:27).** Issue #220 is closed, and the worktree and branches are removed.
      - The review workflow approved: no lens raised a blocker or major, with six minors and eleven nits.
      - CI on the merge ref: `test:unit` 938, render 109 files and 1867 cases, web 4806. The synthesizer's scratch merge with a915f95 (P4-T13) was clean.
      - The minors go to P4-T14 (followups.md). Two of them are privacy rules for the first hasher: m1, a salt fetch in flight during the sign-out erase writes the salt back; m2, the hasher must belong to the open diary's account.
    - **Promotion PR #381** (`promote/p4-t12`, based on `promote/1b-t8`). Stack #379 is now #373 → #378 → #380 → #381.
- **App baseline at 712574d** (CI on #376's merge ref plus P4-T13): `test:unit` 956 (927 + 18 + 11), render 109 files and 1867 cases, web 4806; iOS not measured at the head (computed 5772: 5760 with 1D-T8 plus P4-T12's 12 modules).

## New model routing (the owner's rule of 10 Nov, in SKILL.md since about 14:36): READ THIS FIRST
`SKILL.md`, `scripts/make_prompt.py` and `references/prompts.md` were rewritten at 14:36 to 14:37 by the owner (the edit names the owner's setup). The rule: route each task to the cheapest model that does it well.
- **Planners:** `claudeAgent` Opus xhigh (unchanged).
- **Implementers, fixers, first reviews and confirming reviews:** T3's `antigravity` provider, `gemini-4-argon-high`.
- **Money-path or privacy PRs** (wallet, cashback, points, payments, auth, private mode, privacy migrations):
  - a second review on `antigravity` `claude-opus-5-5-medium` (`make_prompt.py second`);
  - **ask the owner, with a recommendation, before merging**, even on green CI.
- **While T3 is down, Antigravity is unreachable.** Builds, fixes and reviews wait for the reconnection rather than spending Claude quota.
  - Already running on Claude before the change, and allowed to finish: the reviews of #397 and #398.
  - Planners run on Claude in workflows: tray-hardening fix2 (wf_41e3ff21-3b6). **1C-T9's planner (wf_313426aa-c35) reported BLOCKED at 14:50:** the plan (p1c :1052) starts it after the owner's E2 approval of 1C-T8's screenshots, and none is recorded. 1C-T9 is now HELD in held.txt (Owner decisions waiting).
- **Waiting on T3, for Argon:**
  - the fixers of P2-T12, fix-download-aborts and tray-hardening (round two), once their briefs are READY;
  - P2-T14's and P2-T20's implementers, after #392 merges;
  - 1C-T9's implementer, after its brief.
- **The open PRs under the new merge rule:**
  - **Wallet, so ask the owner before merging:** #392 (tray-hardening) and #395 (P2-T12). Each also needs the Opus second review.
  - **#398 (alarm-hardening):** its migration 0004 changes how receipt retention is scheduled. Treat it as privacy-adjacent and ask the owner.
  - **The rest merge on green CI and approval as before:** #394 (1B-T12, parity tests), #396 (fix-download-aborts) and #397 (download-pins).
- **Verify before relying:** re-check each review finding against the code before ruling on it.

## T3's MCP server lost its authorization, 10 Nov 14:39: READ THIS FIRST
- `t3_thread_send` failed: "MCP server t3-code rejected the Authorization header in its config (update it, then run /mcp to reconnect)". **Only the owner can reconnect it** (`/mcp`).
- **Until then, these T3 tools are unavailable:**
  - `delegate_task` and `t3_thread_send`;
  - `link_pull_request` and `watch_pull_request`, so PR updates may not wake the controller.
- **Threads T3 already runs may finish on their own:** the P2-T12 fix-brief planner (e328d240, run 4) and the fix-download-aborts fix-brief planner (46ff8a6d, run 3). Their notices may still arrive; if not, read their briefs from `briefs/` and their kits from `scratch/`.
- **New agents go through Claude Code's Workflow tool,** which sets `model` and `effort` per agent: Opus xhigh plans and first-reviews M and L tasks; Haiku max implements; Sonnet xhigh reviews S tasks and confirming rounds. Each prompt must name every file, since a fresh agent has no thread context.
- Check PRs yourself with `gh pr checks` and `status.sh`.

## Fourth usage-limit stop, 10 Nov about 09:50 to 13:50 (RESUMED at 13:50)
- The previous account (sub5) hit its 5-hour limit; the session continues on another account.
- **Failed at the stop:**
  - the review workflows of #395 (P2-T12), #396 (fix-download-aborts) and #397 (download-pins);
  - #392's fix-round confirmation;
  - the 1B-T12 planner's fix-brief run (run 3).

  alarm-hardening's implementer finished first (DONE at 14844b9).
- **At 13:50:** the heavy lock was free, no jotbun test process was alive, and there had been no thermal sleep since 06:05.
- **Resumed at 13:50.** Finished agents replay from cache.
  - Review workflows:
    - P2-T12: run wf_0cba99e1-318, task wlxc90ll5. The stack lens and ST1's skeptic are done; the frames lens and the synthesizer rerun.
    - fix-download-aborts: run wf_49c67ce8-b3f, task wvpaxxksg. The fix lens is done (3 findings, none serious).
    - download-pins: run wf_e153ae48-9d5, task wqohgoiyi. Everything reruns.
    - #392's confirmation: run wf_4739381a-1ab, task wneoycf3d. Everything reruns.
  - **The 1B-T12 planner** was restarted by T3 at the reset (run 4, a `limit-resume` task) and steered with the cutoff note.
- **P2-T12's stack lens found a MAJOR, ST1, and its skeptic confirmed it.**
  - The bug: on iOS with VoiceOver, double-tapping a card behind the front one opens the card in front. Each card's 200 pt accessibility frame is activated at its midpoint, which the next card covers.
  - The web suite cannot see it. A fix round is expected once the synthesizer writes the verdict: likely `onAccessibilityTap`, so activation calls `onOpen` directly.

## Third usage-limit stop, 10 Nov about 08:23 (RESUMED at 08:27)
- The previous account hit its 5-hour limit (it resets at 12:00). The session continues on another account.
- Failed at the stop:
  - all five planners: tray-hardening 351b244a, P2-T14 deda1216, P2-T12 e328d240, fix-download-aborts 46ff8a6d and 1B-T12 373c38a4;
  - the wallet-looks-unstored review workflow (run wf_c0db7db8-830).
- At 08:26 the heavy lock was free and no test process was alive. The last thermal sleep was at 06:05.
- At 08:27 each planner was steered on its own thread (run 2) with the cutoff note: background runs are dead, rerun unfinished checks, restore mutated files from `real/`, the lock is free, and the head moved only in controller files. **Do not respawn them.**
- The review workflow was resumed from run wf_c0db7db8-830 (task wskvqzln0).
- #391's CI is green on 8c997d8 (nine jobs); its merge waits only on the review.

## T3 server restart, 10 Nov about 07:21 (RESUMED at 07:22)
- The restart cancelled the three running review workflows. They were resumed from their runs, and finished agents replay from cache:
  - P2-T13: run wf_74d1e17e-476, task w29wpu2c7;
  - 1B-T7: run wf_529f455b-229, task w9t0fclqe;
  - 1B-T11: run wf_1b001b01-c31, task wfyqetxeu.
- At 07:22 the heavy lock was free and no test process was alive. No delegated thread was running.
- **If they are cancelled again, resume the same runs.** Each run's `journal.jsonl` is under the session's `subagents/workflows/<run>/`.

## Second usage-limit stop, 10 Nov about 07:00 (RESUMED at 07:05)
**Resumed at 07:05,** after the owner reset the credit early. Do not resume these again:
- the P2-T11 review (task wmhduu9mn), the P2-T13 review (w3202gbyx) and the 1B-T7 review (wms605bju), each from its saved run;
- the 1B-T11 planner, steered on run 5 with the cutoff note.

The list below is kept for the record.
- **Review workflows** (they do not restart themselves). Resume each with `Workflow({scriptPath, resumeFromRunId})`: agents that finished replay from cache.
  - **P2-T11 (#382):** run wf_4e503333-e15, script `review-p2-t11-wf_4e503333-e15.js`. Both lenses are done (data: 5 findings; build: 4; no blocker or major), so only the synthesizer reruns.
  - **P2-T13 (#383):** run wf_74d1e17e-476, script `review-p2-t13-wf_74d1e17e-476.js`. The behaviour lens is done (6 findings, no blocker or major); the surface lens and the synthesizer rerun.
  - **1B-T7 (#385):** run wf_529f455b-229, script `review-1b-t7-wf_529f455b-229.js`. All three agents rerun.
  - The scripts are under `~/.claude/projects/-Users-kunanonjarat--t3-worktrees-jotbun-t3-d9c08cd1-928de148f4930c37/22c24cd3-aa0d-449a-b3ad-bdc2f5954699/workflows/scripts/`.
- **The 1B-T11 planner** (thread 6407a432) failed again. T3 restarts it at the reset, as it did at 03:10; then steer it with the cutoff note (background runs are dead, rerun unfinished checks, restore mutated files from `real/`).
- **CI is green on all three PRs:**
  - #382: render 111 files and 1894 tests, with the whole `CatalogueScreen` file passing (301 tests, R103's record).
  - #383: render 110 files and 1891 tests.
  - #385, the first task PR in the nine-job layout (checkout `6223843` into `c764cf2`): workers 29 files and 713 passed plus 1 todo, exactly +1 file and +38 tests.

  Each merge waits only on its review.

## Usage-limit stop, 9 Nov 23:28 to 10 Nov 03:10
- The controller's own session and every agent hit the 5-hour limit at about 23:28: the P2-T11 implementer, the P2-T13, 1B-T7 and 1B-T11 planners, and the ci-parallel-jobs review workflow.
- At 03:10, T3 restarted each delegated thread itself, on the same thread with its context (run 2, task ids starting `limit-resume`). **Do not respawn them.** The controller steered each with the cutoff note: background runs are dead, rerun any check not seen to finish, restore any mutated file from `real/`, the lock is free, and P4-T12 merged as 712574d, sharing no file with them.
- The ci-parallel-jobs review workflow does not restart itself; it was resumed with `resumeFromRunId` wf_1346c5d6-527 (task wrhzd95p0). All three of its agents run again.
- Checks at 03:11: the heavy lock was free; no test process was alive; the load came from macOS indexing; and the Orca controller's transcript had not been written since 22:04 on 9 Nov (it did not resume at 01:50).
  - **P4-T13: brief READY at 0bd5659** (S, 7 new files in `src/slips/`, none shared; no package or lockfile change).
    - P1 to P18 are accepted. The Q1 and Q2 adapters wait on the owner (P18).
    - Kit `scratch/p4-t13-planner/`: check_kit at d579f94 gives 31 OK, SHA256SUMS.base 2 OK, and both `base/` files identical.
    - The planner's proof: 84 of 84 mutants. For CI: `test:unit` +18, everything else +0.
    - The implementer (Haiku max, c5f063e0) was dispatched about 22:44 in a pre-installed p4-t13 from d579f94.
    - **Merged as a915f95 (#375, at 23:16).** Issue #221 is closed, and the worktree and branches are removed.
    - The Sonnet review approved with two minors (pin the type and base64 guards byte for byte; pin NFC before the album's cut) and four nits, all in followups.md under P4-T14 and P4-T18.
    - CI on 9d38cbd: `test:unit` 945 on the merge ref, everything else unchanged. No iOS export was needed.
    - **Promotion PR #378** (`promote/p4-t13`, based on `promote/1d-t8`) is stacked on #373 with `gh stack` (stack #379), so native stacks work. The owner merges the stack bottom-up.
  - The old P2-T10 planner (a0363fb1, "waiting on its own background work") is obsolete: P2-T10 merged as #370.
- **P2-T11: brief READY at 30fb26b** (L, depth 18). Wallet looks, Bun faces, materials, category icons and the wallet card. Shared files: `categoryIcons.tsx`, `walletHarness.tsx` and its test, and `kitSections.tsx`.
  - P1 to P16 are accepted. P3 is the provider's one-queue rule: a change never drops another, and an unreadable name is never written over.
  - For the owner at E2-A: the food and gift glyphs keep today's drawings (P4); private mode masks amounts in place (P7); and the board calls in P9.
  - It folds in P2-T8's m-1 (harness cases H6 and H7, mutants HA2 to HA4) and m-2's harness sentence.
  - Kit `scratch/p2-t11-planner/`: check_kit at 6e51a3d gives 41 OK, and the 4 `orig/` files are identical. The planner's proof: 119 of 119 mutants.
  - The implementer (Haiku max, 3b2e8ff2) was dispatched at 23:24 in a pre-installed p2-t11 from 6e51a3d. No iOS export is needed (no route, entry or native change).
  - **DONE at 31d9d59 (base e7fad50); PR #382 opened at 06:29 (issue #157).**
    - RED: Node 10 of 10, render 19 of 27. GREEN: 14 and 27. 119 of 119 mutants. `test:unit` 955, `test:app` 34.
    - It was BLOCKED once, on the whole-file `CatalogueScreen` run, by the Mac's thermal sleeps. Under ruling R103 that run went to CI, on the per-case evidence (298 and 300 of 301, then 4 of 4 targeted).
    - The controller checked the 18 files against the kit and the clean merge with the head.
    - **The review runs as a workflow** (run wf_4e503333-e15): two Opus lenses (the data rules and card words; the drawings, harness, catalogue and CI), a skeptic for each blocker or major, and a synthesizer writing `reviews/P2-T11.md`.
    - **CI on #382 is R103's record** for the whole `CatalogueScreen` file.
    - **Merged as 5a33820 (#382, at 07:15).** Issue #157 is closed, and the worktree and branches are removed.
      - The review workflow approved: no blocker or major, two minors and seven nits.
      - CI tested `31d9d59` into `d2bdb17`: render 111 files and 1894 tests, and the whole `CatalogueScreen` file 301 of 301 (R103's record).
      - The base moved only by #377 (CI files and one script line) before the merge, so its green run stood.
    - **m1 becomes the follow-up task wallet-looks-unstored:** a change that was never stored drops from view at the next stored change, which breaks brief P3.
      - P2-T20, P2-T21 and P2-T29 are HELD in held.txt until it lands. Its ready cases are D1, D2 and D8b.
      - The other minors and nits are in followups.md (P2-T12, P2-T21, P2-T22, P2-T29, P2-T35, E2-A).
    - **Promotion PR #386** is stacked on #384; stack #379 now holds six PRs.
    - **P2-T13 (#383) merges second.** Its merge ref stayed stale, so at 07:25 the controller updated its branch with the base through GitHub's update-branch API (`expected_head_sha` = the reviewed 2f0e40e).
      - The new head 9b3196d is "Merge branch 'claude/p1a-vault-core' into p2/t13-tray". The task's files are unchanged from 2f0e40e, and the PR's diff is the same 12 files (+1246, -4).
      - A fresh nine-job run on a true merge with P2-T11 is under way.
      - **Merged as 08e0566 (#383, at 08:01).** Issue #159 is closed, and the worktree and branches are removed.
        - The review workflow approved: no blocker or major, six minors and five nits.
        - CI run 42728251106 was on a true merge with P2-T11: render 112 files and 1918 tests, `test:unit` 970, web 4807, iOS 5773.
      - **The tray-hardening follow-up** (P2-T13's m1 guard, m2, m3's reset, m4, n1, n3; ready probes) must land before P2-T16, which is HELD in held.txt.
        - P2-T33 inherits a plan gap: an open tray's lock cover hides LockedScreen.
        - Everything is in followups.md.
      - **Promotion PR #389** is stacked on #388; stack #379 now holds eight PRs.
      - A new lesson: only `CatalogueScreen` and `screenReader` open every catalogue section, so the large-text suite does not pick up new sections.
- **wallet-looks-unstored: brief READY** (S): P2-T11's review m1.
  - Files: the shared `WalletLooksProvider.tsx` and `WalletLooks.render.test.tsx`, and the receipt. The fix keeps unstored changes per account in a ref, laid over each read.
  - P1 to P13 are accepted. P4: never folded into a write, so an unreadable name is never written over. P6: D8 is not taken, since it fails only on the store's call order.
  - Kit `scratch/wallet-looks-unstored-planner/`: check_kit at 6db889a gives 46 OK, SHA256SUMS.base 2 OK, and the 2 `orig/` files are identical. The planner's proof: 37 of 37 mutants; for CI, +4 render cases.
  - The implementer (Haiku max, 7b8c794a) was dispatched at 08:11 in a pre-installed wallet-looks-unstored from 6db889a.
  - **DONE at 8c997d8 (base 9a24180); PR #391 opened at 08:20 (no task issue).** RED 4 of 13, GREEN 13 of 13, neighbours 38 of 38, 37 of 37 mutants, `test:unit` 970. The controller checked the 2 files against the kit and the clean merge with the head.
  - **The review runs as a small Sonnet workflow** (run wf_c0db7db8-830): one reviewer, a skeptic for any blocker or major, and a synthesizer writing `reviews/wallet-looks-unstored.md`.
  - On approval and green CI: `merge_task_pr.sh 391 8c997d8` (no task id), then `promote_pr.sh wallet-looks-unstored 391`. **Then take P2-T20, P2-T21 and P2-T29 off held.txt.**
  - **Merged as 76b329c (#391, at 08:56). No task issue; the worktree and branches are removed.**
    - The Sonnet workflow approved, resumed after the third stop: no blocker or major, one minor and five nits.
    - All five of P2-T11's P3 rules hold, checked against 5,450 random schedules and a differential with the head's provider.
    - CI run 42735086363 tested 8c997d8 merged into 7508e44, which already held 1B-T11. Only `.claude/` changed after that, so the green run stood through the billing stop.
    - **P2-T20, P2-T21 and P2-T29 are off held.txt.**
    - The findings are in followups.md:
      - m1 (PE, PE2 and PF; mutant OM1) and n2 go to the test-only **wallet-looks-pins** follow-up;
      - n3 goes to P2-T20 and P2-T21;
      - n4 to P2-T20;
      - n5 to P2-T18, P2-T20, P2-T21, P2-T29 and P5-T19;
      - n1 (PX) to P5-T19.
    - **Promotion PR #393** is stacked on #390; stack #379 now holds ten PRs. Its CI cannot start until the billing is fixed.
- **The wallet lane: three planners dispatched at 08:04 from 3091b41 (Opus xhigh, no shared files):**
  - **tray-hardening** (351b244a; WT tray-hardening on fix/tray-hardening): P2-T13's review m1 guard, m2, m3 reset, m4, m5, m6, n1, n3, with ready probes. m5 and m6 were moved here from P2-T14 because they edit the same tray test files. It unblocks P2-T16.
    - **Brief READY at 6db889a (rehearsed on b5aa2a7)** (S): `Tray.tsx`, `Tray.render.test.tsx`, `trayGesture.test.ts` and the receipt; no shared file.
      - P1 to P16 are accepted.
      - P3: m2's guard reads a ref of `shown`, not `visible`. With `visible`, a reopen and close before the late end would call `onClosed` twice (mutant H3).
      - P4: `shown` is not held until `onDismiss`.
      - P5: P-J stays with P2-T33.
      - P11: the catalogue case no longer needs the tray's sections last. The P2-T14 and P2-T12 planners were told at 08:43; each of their tasks starts after tray-hardening merges.
      - Kit `scratch/tray-hardening-planner/`: check_kit at 58be2e2 gives 37 OK, SHA256SUMS.base 3 OK, and the 3 `orig/` files are identical.
      - The planner's proof: RED 5 of 22, GREEN 22 of 22 and 4 of 4, 34 of 34 mutants. For CI: render +6 cases.
    - The implementer (Haiku max, af5c01aa) was dispatched at 08:43 in a pre-installed tray-hardening from 58be2e2.
    - **DONE at 784667b (base ecc00b7); PR #392 opened at 08:50 (no task issue).**
      - RED 5 of 22, GREEN 22 of 22 and 4 of 4, catalogue `bw-` 18. 34 of 34 mutants, with output identical to the planner's. `test:unit` 970, `test:app` 34.
      - The controller checked the 3 files against the kit's `SHA256SUMS.real` and the clean merge with the head.
    - **The review runs as a small Sonnet workflow** (run wf_fa4458e5-3d3, task woa7ka514): one reviewer, a skeptic for any blocker or major, and a synthesizer writing `reviews/tray-hardening.md`.
    - On approval and green CI: `merge_task_pr.sh 392 784667b` (no task id), then `promote_pr.sh tray-hardening 392`. **Then take P2-T16 off held.txt.**
    - **CI run 42738781210 (08:52) never started: GitHub billing** (Owner decisions waiting, first item). Once the owner fixes it, run `gh run rerun 42738781210 --repo mygogocash/jotbun` and check the nine jobs (render +6 cases).
    - **The review approved at 09:25** (`reviews/tray-hardening.md`): no blocker or major, two minors and three nits. The reviewer reran 22 of 22 four times and 11 of the 34 mutants.
    - **The controller folded m-1, m-2, n-1 and n-2 into a fix round on #392**, since CI cannot run before billing is fixed anyway. A separate follow-up PR would cost another CI run later.
      - m-1 is a real but rare bug: a batched iOS end plus reopen calls `onClosed` while the tray is open. The fix is one line: read `shown`, not the ref.
      - The others are test pins for surviving mutants X1, D2 and X4.
      - n-3 goes to P2-T16 and P2-T20 (followups.md).
    - **The tray-hardening planner** (thread 351b244a, run 3, from 09:25) writes `briefs/tray-hardening-fix.md`, with kit `scratch/tray-hardening-fix-planner/`, proven on 784667b merged with the head.
    - **Fix brief READY at 10:01** (`briefs/tray-hardening-fix.md`; kit `scratch/tray-hardening-fix-planner/`, its sums 0 not OK, SHA256SUMS.base 3 OK on 784667b).
      - Files: `Tray.tsx`, `Tray.render.test.tsx` (+4 cases, 26 for CI) and the receipt.
      - F1 to F10 are accepted.
        - F1: `if (!shown) closed.current?.()`, and the `showing` ref goes.
        - F2: the Modal seam ends a held dismissal as `Modal.js` does.
        - F3: m-1's case queues both updates in one `act`. The two-task form flaked once in about 110 loaded runs, and on correct code.
      - RED 1 of 26 (m-1), GREEN 26, 40 of 40 mutants, proven on 784667b merged with d1111f8.
    - **The fixer (Haiku max, 9c6f9ed4) was dispatched at 10:01** in the tray-hardening worktree; it merges the head into the branch first (Step 1.2).
    - After DONE: push `fix/tray-hardening`, update #392's body (+4 cases, the fix round), and run a confirming Sonnet review. Then merge at the new head on green CI.
    - **Fix round DONE: merge 33edab1 (the head at 6a727dc into the branch), then fix commit fc78376**, pushed at 10:11; #392's body is updated.
      - RED 1 of 26 (m-1), GREEN 26 of 26 and 4 of 4, catalogue 18. 40 of 40 mutants, with output byte-identical to the planner's. `test:unit` 970, `test:app` 34.
      - The controller checked both files against the fix kit's `real/` and the clean merge with the head.
    - **The confirming Sonnet review runs as a workflow** (run wf_4739381a-1ab, task wv1qqqe83), writing `reviews/tray-hardening-confirm.md`.
    - **The confirming review approved at 14:38** (`reviews/tray-hardening-confirm.md`; resumed after the fourth stop as task wneoycf3d).
      - m-1 is fixed: all 19 first-review probes pass, and the one-`act` case fails on 784667b.
      - The Modal seam is faithful, X1, D2 and X4 are killed, and 10 of 40 mutants rerun and killed.
    - **c-m1 (minor):** F1 opens a mirrored window. An earlier end rendered in the same commit as the next hide still says closed, so a later hide's end says it again.
      - In the reviewer's model of 141 length-8 sequences: 44 deviations on 784667b, 22 on fc78376, and 0 with the validated guard `!shown && !showing.current` (the ref restored).
      - **Folded into a second fix round on #392**, with c-n1 (one iOS case for the fresh `onClosed`, mutant M3) and c-n2 (four stale receipt lines). P2-T16 builds `whenClosed` on this guard.
      - **The request to the old planner thread (351b244a) was never delivered:** T3's MCP server rejected this session's authorization at 14:39. The second round's brief is written instead by a fresh Opus xhigh planner in a Claude Code workflow (run wf_41e3ff21-3b6, task wkxjum826), from `scratch/dispatch/tray-hardening-fix2-planner.prompt.md`. Output: `briefs/tray-hardening-fix2.md`, with kit `scratch/tray-hardening-fix2-planner/`.
    - **The second-round brief is written** (`briefs/tray-hardening-fix2.md`; kit `scratch/tray-hardening-fix2-planner/`, its sums OK).
      - G1 and G2: the guard `!shown && !showing.current`, with the ref restored; 0 of 141 deviations in the model.
      - HIDE-END and the c-n1 case are added; receipt lines 3, 4, 29 and 53 are fixed; 45 of 45 mutants; CI render 26 to 28.
    - **But its planner reported BLOCKED at 15:17: #392's branch had moved to 99ce506.**
      - 99ce506 was pushed at 14:41 by an agent with the trailer `Co-Authored-By: Cursor`, matching thread 351b244a's run 4. So the `t3_thread_send` that returned an auth error was in fact delivered, and that thread committed and pushed although it was a planner.
      - 99ce506's `Tray.tsx` has exactly the kit's guard (comments differ). It adds HIDE-END and edits the receipt, but has no c-n1 case and no proof.
      - **The controller's ruling: keep 99ce506 (no force push).** The fixer brings all three files to the kit's `real/` (see `scratch/dispatch/tray-hardening-fix2-notes.md`), reruns the c-n1 RED under M3, GREEN, the 45 mutants and the gate, and commits on top.
      - **When T3 is back, read thread 351b244a first** and cancel it if it is still running, so there are never two writers on the branch.
    - Then: the fixer (Argon under the new routing), push, update #392's body, a confirming review (Argon), the Opus second review (wallet), and the owner's yes before the merge.
    - **Rule:** a third failing round means telling the owner. This round answers an approval's minor, not a failed review.
    - **On approval and green CI:** `merge_task_pr.sh 392 fc78376` (no task id), then `promote_pr.sh tray-hardening 392`. Then:
      - take P2-T16 off held.txt;
      - dispatch P2-T14;
      - fix the receipt's stale Status and Base lines in a one-line commit if the confirming review lists them.

      The push's CI run 42747590350 was refused for billing (0 steps run). After the fix, rerun that one: `gh run rerun 42747590350 --repo mygogocash/jotbun`.
    - **Then:**
      1. dispatch a Haiku fixer on `fix/tray-hardening`;
      2. push the new head and update #392's body;
      3. run a confirming Sonnet review;
      4. merge at the new head on green CI.

      The rerun command above then no longer applies; the push starts a fresh run.
    - P2-T14 (held) tolerates the changed tray files: its Step 0.2 records a hash difference and goes on. P2-T20's planner was told to check tray-hardening by content.
    - New lesson: `git apply` run inside `scratch/` can silently apply nothing.
  - **P2-T14** (deda1216; WT p2-t14 on p2/t14-add-flow), the add flow, keypad and amount step, depth 17. It plans against today's `Tray` props, without editing `Tray.tsx`.
    - **Brief READY at 09:09 (L), proven on b5aa2a7 with tray-hardening's three files laid over.**
      - New: 9 files under `src/wallet/add/` and `dev/catalogue/wallet/addSections.tsx`. Shared:
        - `index.ts`: import and spread right after the tray's; it merges cleanly with P2-T12's in either order;
        - `draftText.test.ts`: `add.chip` joins `LATIN_LINES`.
      - P1 to P17 are accepted.
        - P3: `AmountFooter` goes in the tray's pinned footer; `AddStep` gains `transfer`; `confirmRows` takes `tc`.
        - P9: the typed amount is never masked.
        - P10: at AX5 the amount scrolls (no tray slot under the header).
      - Kit `scratch/p2-t14-planner/`: check_kit at dbfde7d gives 29 OK, and the 2 `orig/` files are identical. RED 6 of 6 Node and 12 of 12 render; 92 of 92 mutants.
    - **HELD until tray-hardening (#392) merges.** Its Step 0.2 checks tray-hardening's own lines, since its spread after the tray's fails the head's `ids.slice(-4)` case.
      - When #392 merges: check_kit, create WT p2-t14 (install), and dispatch the implementer with P1 to P17 accepted.
      - If #391's 13 `WalletLooks` cases are counted, N is 53 (its P15).
  - **P2-T12** (e328d240; WT p2-t12 on p2/t12-card-stack), the card stack and frames, depth 15. It takes P2-T11's K5 and decides P2-T9's spring overshoot.
    - **Brief READY at 08:55 (M), proven on b5aa2a7's app tree:**
      - New: `CardStack.tsx`, `cardFrames.tsx`, `CardStack.render.test.tsx` (12 cases), `cardStackNative.test.ts` (1) and `stackSections.tsx`. Shared: one import and one spread in `dev/catalogue/wallet/index.ts`, placed between the kit's sections and the tray's (plan order).
      - It passes with tray-hardening's files laid over (34 of 34) and with #391's (43 of 43), so it waits on nothing in flight. 59 of 59 mutants.
      - No drop is played on a new wallet: the drop and its overshoot go to P2-T21. The derived-look flash is the caller's (P2-T23, P2-T24).
    - Its completion notice never reached the controller; the result was read from the thread. At 08:58 the controller told it that #391 merged (run 3, to confirm the proof on the new head).
    - **Run 3 rebuilt the proof on 76b329c** (after #391): the same RED messages, 59 of 59 mutants with the same lines in all three runs, and the focused files at 59.
      - P1 to P18 are accepted. P3: the spread sits before the tray's, so the task waits on nothing. P11: the drop goes to P2-T21. P12: K5 is in the stack's test file.
      - Kit `scratch/p2-t12-planner/`: check_kit at a58ea2a gives 17 OK, and the 2 `orig/` files are identical.
    - The implementer (Haiku max, 5fcc0b84) was dispatched at 09:07 in a pre-installed p2-t12 from a58ea2a.
    - **DONE at 90b5079 (base dbfde7d); PR #395 opened at 09:17 (issue #158).**
      - RED 13 of 13, GREEN 12 of 12 and 1 of 1, neighbours 47, catalogue `bw-` 22.
      - 59 of 59 mutants, with output byte-identical to the planner's.
      - The controller checked the 6 files against the kit's `real/` and the clean merge with the head.
    - **The review runs as a two-lens Opus workflow** (run wf_0cba99e1-318, task wy3myeu97). The lenses run one after the other, to keep about six agents: the stack and the press; then the frames, the catalogue merges, the tests and CI. A skeptic checks each blocker or major, and a synthesizer writes `reviews/P2-T12.md`.
    - On approval and green CI: `merge_task_pr.sh 395 90b5079 P2-T12`, then `promote_pr.sh P2-T12 395`.
    - **The review says Needs fixes (14:27; `reviews/P2-T12.md`):** one major, four minors and four nits. Everything else holds: the shape, the press, P10's frames, the `index.ts` merges in either order with tray-hardening, P2-T14 and P2-T20, and 15 of 59 mutants rerun and killed.
      - **M1 (ST1):** under VoiceOver a double tap on a back card opens the card in front. **The controller verified it against the code at 14:50** (the new verify-before-relying rule): `WalletCard.tsx:162` is a plain Pressable with no `onAccessibilityTap`, and `CardStack.tsx`'s `stackFrame` puts each 200 pt card at `top: 54 × index`, under the next card. The fix is `onAccessibilityTap={onPress}` on `WalletCard`'s Pressable, with a Node pin. **The controller granted leave to edit `WalletCard.tsx`** (P2-T11's file); no task in flight edits it.
      - **The fix round also takes m3, m4, n2, n3 and n4:** pins for the surviving mutants L1, L10, MF7, L3, L4, MF9, MF6 and MF4, and `frames.delete(view)` in `forget()`.
      - m1 and n1 go to P2-T24, and m2 to P2-T17 (followups.md).
    - **The P2-T12 planner** (thread e328d240, run 4, from 14:27) writes `briefs/P2-T12-fix.md`, with kit `scratch/p2-t12-fix-planner/`. Then:
      1. a Haiku fixer on `p2/t12-card-stack`;
      2. push, and update #395's body;
      3. a confirming review: Opus, since the first round was M and found a major;
      4. merge at the new head on green CI.
    - **Fix brief READY** (found on disk at 15:18; its T3 notice never arrived): `briefs/P2-T12-fix.md`, kit `scratch/p2-t12-fix-planner/` (26 OK; `SHA256SUMS.orig-in-wt` 6 OK on 90b5079).
      - F1 to F9 are accepted.
        - F1: `onAccessibilityTap={onPress}`.
        - F3: n2 needs two lines.
        - F4: 3 new cases (12 to 15).
        - F6: 73 of 73 mutants.
        - F9: VoiceOver on a real iPhone stays SKIPPED, a device check.
      - **The fixer waits on T3** (Argon under the new routing); WT p2-t12 on `p2/t12-card-stack`.
      - Then: a confirming review (Argon), the Opus second review (wallet), and the owner's yes.
    - CI run 42741688287 never started (billing, 0 steps run). Once the owner fixes it: `gh run rerun 42741688287 --repo mygogocash/jotbun`.
  - Each task's catalogue sections go in a list file of its own, with one spread in `dev/catalogue/wallet/index.ts` at its own anchor (not in `kitSections.tsx`).
- **P2-T20** (4be9ff30; WT p2-t20 on p2/t20-wallets-list), the wallets list, the archived list and reorder, depth 14 (the deepest ready task). The planner (Opus xhigh) was dispatched at 09:09, when P2-T14's planner finished.
  - It carries #391's `setOrder` caller notes (n3, n4, n5), P2-T19's double-send note and the host-tray rules.
  - It plans `ReorderTray` on tray-hardening's `real/` files, and its `index.ts` spread after P2-T14's, proven to merge in either order or stacked on P2-T14.
  - `app/spend/wallets.tsx` is a route, so its gate has `typecheck:routes`; CI runs the exports.
  - **Brief READY at 10:05 (L), proven on dbfde7d with tray-hardening's and P2-T14's files laid over.**
    - New: 6 files under `src/wallet/wallets/` and `walletListSections.tsx`. The route `app/spend/wallets.tsx` changes.
    - Shared:
      - `index.ts`: its spread goes after P2-T14's, so its diff applies only once P2-T14 has merged;
      - `PlanningRoutes.render.test.tsx`: it mocks the new screen, since the route now loads `expo-crypto`.
    - P1 to P18 are accepted.
      - P4: one order, `frontFirst`. Each press calls `setOrder` once with a new array, and nothing seeds it from an effect.
      - P6: unarchive goes through P2-T19's hook with a ref guard.
      - P9: two `as Href` casts stay until P2-T21 and P2-T22 add their routes.
      - P5: จัดเรียง is hidden with no account open.
    - Kit `scratch/p2-t20-planner/`: 38 OK; its `index.ts` diff applies on P2-T14's `real/`. RED 4 of 4 Node and 13 of 16 render; 84 of 84 mutants. The gate includes `typecheck:routes` and `export:web`.
  - **HELD until tray-hardening (#392) and P2-T14 merge** (Step 0 checks both by content). When both have merged: check_kit, create WT p2-t20, and dispatch the implementer with P1 to P18 accepted.
- **The server lane: two planners dispatched at 08:15 from c8929f2 (Opus xhigh):**
  - **fix-download-aborts** (46ff8a6d; WT fix-download-aborts on fix/download-aborts): R97's `waitUntil` fix for every vault download, with a `wrangler dev` proof, plus every review pin followups.md gives it. It may split the test-only pins into `briefs/download-pins.md`. It must land before 1B-T13.
    - **READY at 09:39 as two briefs that share no file** (they can run in parallel and merge in either order; together: 12 workers files, 392 passed and 1 todo):
      - **A, `briefs/fix-download-aborts.md` (M).**
        - Files: new `src/v1/files/slots.ts` (`untilReturned`) and `test/workers/download-aborts.test.ts` (5 cases); shared `downloads.ts`, `receipts.ts`, `uploads.ts` and `handler.ts` (awaited `headOf` returns).
        - The `wrangler dev` proof: on the base, export, snapshot-chunk and receipt downloads each answer 503 after four aborted GETs; with the fix each is served whole (3 of 3).
        - Retains and uploads do not leak locally (wrangler runs a handler on after its client leaves). Their wrappers rest on Cloudflare's documented cancellation (P3, P4).
        - P1 to P11 are accepted, **P4 included**: the upload's place takes the wrapper too. Kit `scratch/fix-download-aborts-planner/`: check_kit at d1111f8 gives 31 OK, and the 4 `orig/` files are identical. 9 of 9 mutants.
        - The implementer (Haiku max, c5d323ab) was dispatched at 09:39 in a pre-installed (`install-edge`) fix-download-aborts from d1111f8, under the heavy lock.
        - **DONE at d0cc479 (base e7b61d7); PR #396 opened at 09:49 (no task issue).** RED 5 of 5, GREEN 5 of 5, 9 of 9 mutants; AFFECTED 11 files, 335 passed and 1 todo; `test:edge` 176; `build:edge` with every driver marker at 0. The `wrangler dev` proof on its tree: export, chunk and receipt served whole after four aborted GETs; retain 200 after four aborted; upload 202 after sixteen aborted. The controller checked the 6 files against the kit's `real/` (edge-relative paths) and the clean merge with the head.
        - **The review runs as a two-lens Opus workflow** (run wf_49c67ce8-b3f, task wp4pexu50), lenses one after the other: the fix and its proof; the tests, shared files and CI. On approval and green CI: `merge_task_pr.sh 396 d0cc479` (no task id), then `promote_pr.sh fix-download-aborts 396`. CI run 42745408105 never started (billing, 0 steps run); rerun it once the owner fixes billing.
        - **The review approved at 14:33** (`reviews/fix-download-aborts.md`): no blocker or major, one minor and seven nits.
          - The `wrangler dev` proof reproduces on the commit, Cloudflare's docs are quoted correctly, and 9 of 9 mutants are killed.
          - #394, #396, #397 and #398 change disjoint files; the merged runs pass.
        - **The controller folded m1, n2, n3 and n4 into a test-only fix round on #396:** probes PB, PA and PC kill R14, R11 and R13, and the slot cases' `take()` moves inside the `try`.
          - The fix-download-aborts planner (thread 46ff8a6d, run 3, from 14:33) writes `briefs/fix-download-aborts-fix.md`, with kit `scratch/fix-download-aborts-fix-planner/`.
          - n1 is a hosted check; n5 and n6 go to 1B-T13; n7 (#398's receipt lines) is in followups.md.
        - **Fix brief READY** (found on disk at 15:18): `briefs/fix-download-aborts-fix.md`, kit `scratch/fix-download-aborts-fix-planner/` (9 OK; its `orig/` test file equals the branch at d0cc479).
          - P1 to P7 are accepted.
            - P1: PC becomes a line in each download case.
            - P2: PB is made deterministic.
            - P4: the case takes its own slots inside the `try`.
            - P5: 7 cases; CI's delta becomes workers +1 file and +7 passed.
            - P6: 14 of 14 mutants.
          - **The fixer waits on T3** (Argon); then a confirming review (Argon). #396 is not money or privacy, so it merges on green CI.
      - **B, `briefs/download-pins.md` (L, test-only).**
        - It edits `test/workers/exports.test.ts`, `attachments.test.ts`, `snapshots.test.ts`, `imports-review.test.ts` and `ai.test.ts`, with every review pin from the followups entry (the table in brief A).
        - Kit `scratch/download-pins-planner/`: check_kit at d1111f8 gives 20 OK, and the 5 `orig/` files are identical. GREEN 242 of 242, 20 of 20 mutants.
        - **Waits for a free slot.** Suggested WT download-pins on fix/download-pins. Read its planner calls before dispatch.
        - It pins `attachmentsDueAt`'s guards, which alarm-hardening's m4 rewrites: whichever merges second keeps both.
        - P1 to P11 are accepted. **The implementer (Haiku max, e43773f5) was dispatched at 10:05** in a pre-installed (`install-edge`) download-pins on fix/download-pins from 6a727dc, under the heavy lock. Its RED and mutation runs mutate source files: after a cut-off run, restore them with `git checkout`.
        - **DONE at 3894e58 (base 402c1df); PR #397 opened at 10:16 (no task issue).**
          - RED: the 17 review mutants together fail exactly 20 cases. GREEN 242 of 242. 20 of 20 mutants.
          - `test:edge` 176; `build:edge` with every driver marker at 0. No source file changed.
          - The controller checked the 5 files against the kit's `real/` and the clean merge with the head.
        - **The review runs as a two-lens Opus workflow** (run wf_e153ae48-9d5, task wrj8alejz), lenses one after the other:
          - do the pins pin what the reviews asked;
          - robustness, and the merges with #396 and with alarm-hardening's `real/` files.
        - On approval and green CI: `merge_task_pr.sh 397 3894e58` (no task id), then `promote_pr.sh download-pins 397`. CI run 42748341937 never started (billing, 0 steps run); rerun it once the owner fixes billing.
        - **The review approved at 15:04** (`reviews/download-pins.md`): no blocker or major, one minor and three nits.
          - Every home-table row has its case, each failing under its review's mutant; RED gives exactly the 20.
          - The merges with #396 and #398 are clean (247, 165 and 247 passed).
          - The controller fixed n3 (receipt, **ac61350**, now #397's head). m1, n1 and n2 are in followups.md.
        - **Merge on green CI** (not money or privacy; the usual rule): `merge_task_pr.sh 397 ac61350`, then `promote_pr.sh download-pins 397`. Expect workers +0 files and +19 passed.
  - **1B-T12** (373c38a4; WT p1-1b-t12 on p1/1b-t12-files-parity), the files parity session against NestJS.
    - Docker stays stopped: CI's edge job runs `test:edge:db`. The planner reports BLOCKED if it truly needs a local PostgreSQL.
    - It decides n8 (the vault's 404 against NestJS's 30-day `expired`).
    - **Brief READY at 08:58 (S; proven on c8929f2's edge tree). It changes no vault code**: with background work off, the vault already gives the 40 answers the planner traced through the API's code.
      - Files: new `test/support/files-session.ts` and `test/vault-parity-files.db.test.ts`; modified `test/parity-files.db.test.ts` and the shared `test/support/vault-worker.ts`; the receipt.
      - P1 to P11 are accepted.
        - P1: the vault half is proven by local smokes in workerd. The NestJS comparison itself runs only in CI's `edge` job (`test:edge:db`).
        - P3: n8 is listed, not changed (optional follow-up in followups.md).
        - P4: a third case pins B13's config.
      - Kit `scratch/1b-t12-planner/`: check_kit at cb9913c gives 58 OK, and the 2 `orig/` files are identical. The planner's proof: 12 of 12 mutants.
      - Its completion notice never reached the controller either; the result was read from the thread.
    - The implementer (Haiku max, 86c3bab3) was dispatched at 09:00 in a pre-installed (`install-edge`) p1-1b-t12 from cb9913c, under the heavy lock for workerd runs.
    - **DONE at ef37c41 (base a58ea2a); PR #394 opened at 09:12 (issue #116).**
      - RED: 2 of 4, with steps 3, 5, 15 and 17 listed and B13 failing on `workflows`. GREEN: 4 of 4 in three runs.
      - The money smoke gives 49 statuses. 12 of 12 mutants. `test:edge` 15 files and 176 tests. `build:edge` with every PostgreSQL marker at 0.
      - The controller checked the 4 files against the kit's `real/` and the clean merge with the head.
    - **The real NestJS comparison runs only in CI's `edge` job (`test:edge:db`),** which waits on the billing fix. Do not merge before that job is green, even with an approving review.
    - CI run 42741146172 never started (billing: every job has GitHub's annotation, with 0 steps run). Once the owner fixes it: `gh run rerun 42741146172 --repo mygogocash/jotbun`.
    - **The review runs as a Sonnet workflow** (run wf_0443a275-2f4, task wfw8gewvt), with two lenses one after the other:
      - A re-derives NestJS's 40 answers from `apps/api`, without trusting Appendix B;
      - B covers the tests and the harness.

      A skeptic checks each blocker or major, and a synthesizer writes `reviews/1B-T12.md`.
    - On approval and a green CI: `merge_task_pr.sh 394 ef37c41 1B-T12`, then `promote_pr.sh 1B-T12 394`.
    - **The review approved at 10:11** (`reviews/1B-T12.md`): no blocker or major, one minor and eight nits. Lens A re-derived all 40 NestJS answers; they hash identically to `expected-nest.json`. One link is unobserved: that NestJS answers what its code reads as. That is CI's `edge` job.
    - **The controller folded m1, n4, n5 and n6 into a fix round on #394,** since CI cannot run before billing is fixed:
      - m1: six sanity assertions, so a comparison cannot pass when both sides fail alike (probe V1);
      - n4: the R92 message;
      - n5: pin the default background `'on'`;
      - n6: `persistTo` is no longer leaked.

      The 1B-T12 planner (thread 373c38a4, run 3, from 10:11) writes `briefs/1B-T12-fix.md`, with kit `scratch/1b-t12-fix-planner/`. The other nits are in followups.md (1B-T13; snapshot-parity-window).
    - The merge then waits for the fix round's confirming review and a green `edge` job, at the fix round's head (not ef37c41).
    - **Fix brief READY at 14:00** (`briefs/1B-T12-fix.md`; kit `scratch/1b-t12-fix-planner/`, 64 OK, and its 4 `orig/` files equal the branch at ef37c41). It is test-only.
      - m1 and n4 go in `vault-parity-files.db.test.ts`; n5 is a new case in `vault-parity.db.test.ts` (CI count 3); n6 is in `vault-worker.ts`. The receipt's P3 is corrected.
      - F1 to F6 are accepted. F1: `nestRun[i]?.status`.
      - Proven through a scratch-only harness that replays NestJS's answers:
        - RED on ef37c41: V1 passes 3 of 3, and O1 fails nothing;
        - GREEN: V1 fails with `expected 404 to be 202`, and O1 fails the new case;
        - 19 of 19 mutants.
    - **The fixer (Haiku max, 45781f76) was dispatched at 14:00** in the p1-1b-t12 worktree, under the heavy lock (`test:edge` included).
    - After DONE: push, update #394's body, and run a confirming Sonnet review. Then merge at the new head once the `edge` job is green.
    - **Fix round DONE: merge 68fcbc8, then fix commit 317cf3a**, pushed at 14:16; #394's body is updated.
      - RED on ef37c41: V1 and O1 survive, and the n6 probe leaks a store. GREEN; 19 of 19 mutants; `test:edge` 176 under the lock.
      - The three test files match the fix kit's `real/`. The receipt differs only by its merge line and Deviations bullet.
    - **The confirming Sonnet review runs as a workflow** (run wf_765ee63d-ccc, task w4x5ksd33), writing `reviews/1B-T12-confirm.md`.
    - **The confirming review approved at 14:42** (`reviews/1B-T12-confirm.md`): all five fixes hold, V1 and O1 are killed, and there is no minor; six nits.
      - The controller fixed the receipt's stale Files line in **d853122** (docs only), now #394's head.
      - **Merge once the `edge` job is green:** `merge_task_pr.sh 394 d853122 1B-T12`, then `promote_pr.sh 1B-T12 394`. Expect `test:edge:db` to list vault-parity-files 3, parity-files 1 and vault-parity 3.
      - **The merge order (confirm-n6):** read the `edge` job of whichever of #394, #396 and #398 merges last, on a head that holds all three.
      - The real NestJS comparison is still unobserved until that job runs.
    - **On approval and a green `edge` job:** `merge_task_pr.sh 394 317cf3a 1B-T12`, then `promote_pr.sh 1B-T12 394`. The push's CI run 42774078632 was refused for billing (0 steps run); rerun that one after the fix.
  - **alarm-hardening** (a37bdb47; WT alarm-hardening on fix/alarm-hardening), 1B-T11's m1, m2, m4 and nits n1 to n5 and n9. The planner (Opus xhigh) was dispatched at 08:58, when #391's review freed a slot.
    - It edits `jobs.ts`, `user-vault.ts` and `files-alarm.test.ts`, and for m4 `attachments.ts` (`attachmentsDueAt`) and `previews.ts` (`importsDueAt`).
    - fix-download-aborts pins those two functions' guards in its own test files. The planner was told to keep the guards exactly and to name the lines it changes, so the two merges can be ordered.
    - **Brief READY at 10:07 (M), proven on cb9913c's edge tree.**
      - Files: `jobs.ts`, `user-vault.ts`, `attachments.ts` and `previews.ts`; new migration `0004_alarm_bounds.sql`, with `migrations/index.ts` and `schema.ts`; `cloudflare-workers.d.ts` (`rowsRead`); `files-alarm.test.ts` and `vault-schema.test.ts`; the receipt.
      - P1 to P14 are accepted, with **P6 recorded as R105** (`attachment_checks`, filled by four triggers).
        - P1: `pruneSnapshots` runs last.
        - P4: a held guard reports `delete_objects`.
        - P5: `rearm`'s `.catch` clears `alarmAt` only if it still names that alarm.
        - P7: `entity_heads_imports_idx`.
        - P10: the prune list calls its functions at run time.
      - At the review's sizes, `reschedule`'s per-write block goes from 1.7 ms to 0.04 ms (rows read 10,001 to 2, and 6,006 to 6).
      - Kit `scratch/alarm-hardening-planner/`: check_kit at 402c1df gives 45 OK, and the 9 `orig/` files are identical. RED 9 of 49, GREEN 49, 28 of 28 mutants. The vault bundle grows by 5.53 kB.
      - Lines changed against download-pins' pins: `attachments.ts` 346, 354, 365 and 369 (DU-1's guard at 370 untouched); `previews.ts` after 328, and 333, 344-345 and 347 (188 untouched). DU-1 and DU-2 pass on its code.
    - **The implementer (Haiku max, 949cad13) was dispatched at 10:07** in a pre-installed (`install-edge`) alarm-hardening on fix/alarm-hardening from 402c1df, under the heavy lock.
    - Housekeeping later: its P11 correction of 1B-T11's P14 (n9; `receipts/1B-T11.md:82`). This task's receipt carries it; a one-line note in 1B-T11's receipt is optional.
    - **DONE at 14844b9 (base 06fdd97); PR #398 opened at 13:51 (no task issue).**
      - RED 9 of 49 (on a table-only 0004 stub), GREEN 49 of 49, 28 of 28 mutants with verdicts matching the planner's.
      - AFFECTED: 9 files, 261 passed and 1 todo. `test:edge` 176. The vault bundle is 1,676.57 kB.
      - The controller checked the 10 files against the kit's `real/` (edge-relative paths) and the clean merge with the head.
    - **The review runs as a two-lens Opus workflow** (run wf_3bcd2a1e-88c, task w64paq5ys), lenses one after the other:
      - the alarm rules and 0004's schema change (R105);
      - the tests, and the merges with #397, #396 and #394.
    - On approval and green CI: `merge_task_pr.sh 398 14844b9` (no task id), then `promote_pr.sh alarm-hardening 398`. CI run 42771332803 never started (billing, 0 steps run); rerun it once the owner fixes billing.
    - **The review approved at 15:01** (`reviews/alarm-hardening.md`): no blocker or major, one minor and six nits.
      - 0004's triggers cover every event the vault's statements make, and the backfill is right on an upgraded vault.
      - The merges with #397, #396 and #394 are clean, and 1B-T12's session answers the same with 0004 applied.
      - The controller fixed n1 and n2 (R105 and R104), n5 (receipt, **3707c29**, now #398's head) and n6 (this file).
      - m1, n3 and n4 are test-only: the alarm-pins follow-up, or a fix round once T3 is back (followups.md).
    - **Merge, under the new rule** (privacy-adjacent: receipt retention): when CI is green, ask the owner with a recommendation, then `merge_task_pr.sh 398 3707c29`. The money and privacy second review (Opus on Antigravity) also applies.

## PR #371: the integration branch into main. The owner merged it on 9 Nov, 21:30 Bangkok, as afcf884
- It was merged with a merge commit, so history is kept. The controller then fast-forwarded claude/p1a-vault-core to afcf884, which adds main's README and CHANGELOG, so the two branches were level.
- **From now on (owner's ask, 9 Nov): one small PR into main per merged task**, not one big integration PR.
  - Right after `merge_task_pr.sh`, run `bash scripts/promote_pr.sh <task-id> <pr>`. It pushes `promote/<task>` at the task's merge commit and opens the PR into main, with the task's summary, review and CI.
  - The owner merges them in order. Never merge into main as the controller.
  - `.claude/**` is marked `linguist-generated` (f4cb34b), so controller files collapse in those diffs.
  - **Stacked (owner's ask, "maximize github stack"):** each promotion PR is based on the newest open one and linked with `gh stack link` (github/gh-stack v0.3.0 is installed), so its diff is one task. The owner merges bottom-up, or with `gh stack merge <pr>`, an atomic merge up to that PR.
  - If the repo turns out not to support native stacks, the chained bases still form a manual stack and the script warns.
  - Repo settings were left as they are (`delete_branch_on_merge` is false). The controller deletes merged branches itself.
- **#70** (claude/jotbun-redesign-plan) is superseded and still open. Closing it is the owner's call.
- **The main checkout's uncommitted reminder edits** need no commit. They are #359's work, apart from the `previewDay` TODO stub that #359 filled in.

## Takeover on the owner's machine (9 Nov, from 08:40 Bangkok): READ THIS FIRST

New controller: session 121af0e6, in the Orca app (Claude Code 2.1.319; transcripts under `~/Library/Application Support/orca/claude-profiles/c0f6e42a-811f-4ea2-9daa-9fb9378005cf/home/projects/-Users-kunanonjarat-Developer-jotbun/`). The owner calls the old controller "the session from Super Engineering" (the app behind `~/.superconductor`).

- **The old controller is dead.** Nothing has reached GitHub since 20:19 on 8 Nov: 5dbd7be, and #356 at 020aa84. On this machine, Super Engineering session 66ebaff3 ("continue what you left", 06:36 today) saw only this machine's stale 8 Nov 17:10 state, because gh auth had failed. It restarted three agents (the 1C-T5 round-3 check, the 1A-T8b follow-up brief and the parser-regex brief). All three were stopped at 06:41, and their work had already merged elsewhere, so none of it is used.
- **Local state was replaced from GitHub.** This machine's old `.claude/controller` (the 17:10 state plus 9.8 GB of scratch) is now `.claude/controller-stale-20261108-1710`. The committed state from 5dbd7be was extracted in its place, with `.claude/skills`. Delete the stale folder when nothing more is wanted from it.
- **Worktrees.** The worktrees of eight merged tasks are removed with their local branches: fix-flaky-tests, p1-1b-t4, p1-1c-t1, p1-1c-t5, p2-t5, p4-t10, p5-t4 and p6a-t1. `agent-a4e4cbbb8ea6b2a9c` is not a controller task and holds 11 uncommitted edits, so it is left for the owner.
- **Harness: no effort setting.** Orca's Agent tool takes `model` but has no `effort` parameter, so agents run at the session's effort. Opus still plans and reviews and Haiku still implements. To restore per-agent effort, add `.claude/agents/*.md` definitions with `effort:` in the frontmatter; they load at session start.
- **sync_state.sh drops `*.log` files** (they are gitignored). The 1B-T6 kit lost its 8 proof logs (`proof/*.log`); every other line of its SHA256SUMS verifies (49 OK). Tell 1B-T6's implementer to check the sums without those lines.
- **App-suite baseline at 5dbd7be**, measured in p1-1c-t6 before dispatch (`scratch/baseline-5dbd7be/summary.txt`): test:app 32, test:unit 880, render 89 files and 1649 tests, web 4775 modules, iOS 5563 modules. The old controller's adjusted 1D-T6 totals were low by 2 (unit) and by 1 (web, iOS).
- **Task deltas** (from the briefs, P2-T2's receipt and 1D-T9's corrected receipt):

  | Task | app | unit | render files | render tests | web | iOS |
  | --- | --- | --- | --- | --- | --- | --- |
  | 1D-T9 and its fix | 0 | +2 | +1 | +45 | | |
  | 1C-T6 | +1 | +7 | +1 | +11 | | |
  | 1D-T6 | +1 | +12 | +3 | +12 | +7 | +185 |

  Whichever of these merges second gets the first one's tests on top.

In flight (this controller; dispatched 09:05 to 09:10, prompts in `scratch/dispatch/` and in this session's transcript):
- **#356 1B-T5:** merged 38361b1 (09:2x). The confirming review approved (`reviews/1B-T5-confirm.md`; two nits are in followups.md). Issue #109 is closed and the worktree and branches are removed.
- **1B-T6 (Haiku), worktree p1-1b-t6, branch p1/1b-t6-exports, base 38361b1.** Prompt in `scratch/dispatch/1B-T6.prompt.md`. Its amendments:
  - Check the kit's sums without the 8 missing `proof/*.log` lines: 49 OK.
  - #352 changed `test/vault-route-coverage.test.ts` and `test/workers/sync.test.ts`. The controller's pre-applied copies (planner diffs plus #352's lines) are in `scratch/1b-t6-rebased/`, with SHA256SUMS.
  - Gate: test:edge 15 files and 176 tests; workers 25 files, 521 passed and 3 todo.
  - It BLOCKED at Step 6.4 on the `node-postgres` count (1, from #352's comment). Ruled R95 and resumed with SendMessage. Everything before that passed: 176 / 521 + 3 todo, 27 of 27 mutants.
  - DONE at 34798c8. PR #362 is open (issue #110) and the Opus review is under way (`reviews/1B-T6.md`).
- **Planners dispatched (Opus, ~09:55):**
  - **P2-T8**, the wallet test harness (depth 20, the deepest ready task): brief READY, P1 to P12 accepted.
    - The implementer was dispatched about 15:45 in p2-t8 from cc859ad (generated prompt).
    - Expected: app 33, unit 894, render 94 files and 1712 tests, web 4785.
  - **1B-T9**, receipt attachments (depth 15): planned on top of 1B-T6's 34798c8, and starts after #362 merges. `briefs/1B-T9.md`, kit `scratch/1b-t9-planner/`, WT p1-1b-t9 on p1/1b-t9-receipt-attachments. It also answers whether the vault has the API's R-B copy race.
  - **1A-T10**, CI, docs and the phase 1A receipt: `briefs/1A-T10.md`, kit `scratch/1a-t10-planner/`, WT p1-1a-t10 on p1/1a-t10-ci-docs.

  Prompts are in `scratch/dispatch/`. Planners keep `*.log` out of the SHA256SUMS the implementer checks.
- **Usage-limit cutoff, 9 Nov about 10:15 to 13:30.** Every agent failed with a 429 and was resumed with SendMessage at 15:15, from its saved context.
- **1B-T6: merged de738f9 (#362, about 17:45) under R97.** The confirming review (`reviews/1B-T6-confirm.md`) found the fix round correct, re-proved under `wrangler dev`, and raised MA-1, now a follow-up task. Issue #110 is closed and the worktree and branches are removed. The receipt was corrected in housekeeping commit 2e65476.
- **1B-T9: merged 5b7609e (#366, about 19:30).** The review approved; its minors m-1 to m-3 are folded into fix-download-aborts with ready probes. Issue #113 is closed and the worktree and branches are removed. **Edge baseline now:** test:edge 15 files and 176 tests; workers 26 files, 576 passed and 3 todo.
- **Planners dispatched about 19:35 (Opus, generated prompts):**
  - **P2-T9** (motion, depth 19): WT p2-t9 on p2/t9-motion.
  - **P2-T10** (money text and private mode, depth 19): WT p2-t10 on p2/t10-money-text.
  - **1B-T10** (import review, depth 14): WT p1-1b-t10 on p1/1b-t10-import-review.

  P2-T9 and P2-T10 share no files with each other or with 1C-T8. 1B-T8 and 1B-T7 share 4 route files with 1B-T10, so they follow it in order. fix-download-aborts is still to plan, before 1B-T13.
- **Second usage-limit cutoff, about 18:00 to 18:40.** The P2-T8 reviewer and the 1C-T8 planner were resumed with SendMessage at 18:45. The lock was free and no processes were left.
- **#362 history:** review Needs fixes (`reviews/1B-T6.md`, M-1: a HEAD on the download route keeps a download slot for good).
  - R96, as amended: `headOf` reads the dropped body to its end.
  - The fix round (Haiku) was dispatched about 16:20 in p1-1b-t6 at 34798c8, with a generated prompt.
    - Brief: `briefs/1B-T6-fix.md`; kit: `scratch/1b-t6-fix-planner/` (12 OK at 34798c8).
    - Expected: RED 1 failed of 36; GREEN 36 of 36; 4 of 4 mutants; test:edge 15 files and 176 tests; workers 25 files, 524 passed and 3 todo.
  - Fix round DONE at 2cf8315: RED 1 of 36, GREEN 36 of 36, 4 of 4 mutants, workers 524 + 3 todo. Pushed to #362 and the PR body updated.
  - The confirming Opus review is under way, writing `reviews/1B-T6-confirm.md`. Merge on its approval and green CI with `merge_task_pr.sh 362 2cf8315 1B-T6`, then dispatch 1B-T9 (amend its Step 0.4 to `pipeTo(`).
  - The fixer's zsh `status=$?` aborted a lock release; make_prompt's lock text now says to use `rc`.
- **1A-T10: merged 4407025 (#363, about 16:40).** The review approved with 2 minors and 7 nits; issue #104 is closed and the worktree and branches are removed. Phase 1A's tasks are all merged.
  - The receipt's open items were completed in housekeeping commit 9cc31cb.
  - Minor 1 (workflow `if`/`continue-on-error`) is carried to P6C-T7.
  - Waiting on the owner: whether to run the plan's whole-1A-range review (P11). Epic #83 stays open until 1D-T15's phase proof.
  - P11: the plan's whole-1A-range review is the controller's to schedule after 1A-T10's own review.
  - Closing epic #83 is the owner's call.
- **Third usage-limit cutoff, about 19:45.** The owner's credit reset at 19:50. 1C-T8's implementer and the 1B-T10 planner were resumed; the P2-T9 and P2-T10 planners had stayed alive.
- **1B-T10: merged 2ffd195 (#369, about 23:45).** The review approved; m-1 and m-2 are folded into fix-download-aborts. Issue #114 is closed and the worktree and branches are removed.
  - **Edge baseline now:** test:edge 15 files and 176 tests; workers 27 files, 638 passed and 3 todo.
  - The 1B-T8 planner was told its base has merged.
- **1B-T10 history:** brief READY (L; P1 to P19 accepted). The implementer (Haiku) was dispatched about 21:50 in p1-1b-t10 from 9d48ba3.
  - Expected: test:edge 15 files and 176 tests; workers 27 files, 638 passed and 3 todo.
  - P2 widens `confirmPrepare`'s answer with `refused`, for the API's 503.
  - P19 extends 1A-T8a's and 1B-T5's pinned lists additively.
  - 1B-T8 and 1B-T7 follow in this lane, after its `// 1B-T10` entries.
- **P2-T10: merged 51be132 (#370, about 00:05).** The review approved. m1 (a failed read shows hidden amounts) and m2 go to the private-mode-hardening follow-up, before the wallet area's E2 approval. Issue #156 is closed and the worktree and branches are removed.
  - **App baseline now**, measured by P2-T10's reviewer on its merge with 5c7a380, which holds 1C-T8 and P2-T9: app 34, unit 922, render 106 files and 1842 tests.
  - Web is not measured on the combined head. 1C-T8 and P2-T10 each added 3 modules to 4785, so measure it with `scripts/baseline.sh` before the next app dispatch.
- **P2-T10 history:** brief READY (M; P1 to P16 accepted). The implementer (Haiku) was dispatched about 21:40 in p2-t10 from bf7bc20.
  - Expected: app 34, unit 907, render 97 files and 1741 tests, web 4788.
  - E2-A notes (P9): the hidden eye has no filled state; the tip uses toast colours, not the board's #3A57E8; P2-T9's 150 ms fade is not wired yet.
- **P2-T9: merged 860990f (#368, about 22:00).** The review approved; m-1 and m-2 go to the next wallet/motion task. Issue #155 is closed and the worktree and branches are removed.
  - **App baseline now** (CI on #368's merge ref): test:app 34, test:unit 905, render 97 files and 1735 tests, web 4785.
  - #367 (1C-T8) touches none of P2-T9's files.
- **P2-T9 history:** brief READY (M; P1 to P14 accepted); the implementer (Haiku) was dispatched about 20:15 in p2-t9 from f9d32b4.
  - Expected: app 34, unit 905, render 97 files and 1735 tests, web 4785.
  - E2-D note: fades keep Reanimated's default curve, while the board says ease-out and the plan names durations only.
- **1C-T8: merged 6fbe9a8 (#367, about 23:20)** after the fix round R98 and R99. The confirming review approved; its m1 is carried to 1C-T9. Issue #125 is closed and the worktree and branches are removed.
  - **App baseline, computed** (4aa6cf1's counts plus P2-T9's): app 34, unit 916, render 104 files and 1824 tests, web 4788.
- **1D-T8: brief READY** (M, 18 files; P1 to P13 accepted). The implementer (Haiku) was dispatched about 01:05 in a pre-installed p1-1d-t8 from ba916cb, with the R100 fast gate.
  - It adds `pendingNo()` to 1D-T1's controller, because the plan's caption had no source.
  - **E2 note:** "stopped on this phone" shows briefly while a no is being sent.
  - Privacy's transport gains the analytics-off header. The receipt and import transports are left for P4.
  - Deltas for CI: unit +5, render +2 files and +23 cases, web +3.
- **#367 history:** review Needs fixes (`reviews/1C-T8.md`; CI green on 5e8b70e).
  - M1: the session-ended screen strands an email-only account. R98 offers an email code to another address under "Use another way".
  - R99: no navigation to 1C-T9's unbuilt route; the in-place reminder step stays.
  - The round also covers m1 (seven guard tests), m3 (copy slips) and the receipt's E2 owner questions (m2, m4).
  - The fix brief is READY (`briefs/1C-T8-fix.md`, kit `scratch/1c-t8-fix-planner/`, 51 OK at 5e8b70e). The fixer (Haiku) was dispatched about 22:15 in p1-1c-t8.
    - Expected: app 34, unit 912, render 102 files and 1812 tests, web 4788; 15 of 15 mutants.
    - Fix round DONE at 4aa6cf1, with every count matching. Pushed to #367 and the PR body updated.
    - The confirming Opus review is under way. Merge on its approval and green CI with `merge_task_pr.sh 367 4aa6cf1 1C-T8`. Then 1D-T8 can be planned in this lane.
- **1C-T8: brief READY** (L, 31 files; P1 to P16 accepted). The implementer (Haiku) was dispatched about 20:35 in p1-1c-t8 from 1ddc7f7, with a generated prompt.
  - Expected: app 34, unit 911, render 102 files and 1802 tests, web 4788. E2 screenshots are SKIPPED, with 22 catalogue deep links listed.
  - The brief's "For the controller": 1C-T5's leftover-cookie recovery needs a `credentialProvider.ts` change that amends R86; the "Sign in again" flicker comes from the sync outcome. Both are for a later 1C task.
  - 1D-T8 follows it in the same lane (registry.tsx, featureFlags.ts).
- **1B-T8 planner (Opus), dispatched about 23:00.** It is planned on top of 1B-T10's dcdb773 (#369) and starts after #369 merges.
  - Brief `briefs/1B-T8.md`, kit `scratch/1b-t8-planner/`, WT p1-1b-t8 on p1/1b-t8-snapshots.
  - It carries the R96, R92, R95 and R97 notes, and the vault-active checks at read and publish.
- **P4-T12 (slip core) and P4-T13 (photos) planners (Opus), dispatched about 00:40 under R100.**
  - WT p4-t12 on p4/t12-slip-core; WT p4-t13 on p4/t13-photos.
  - P4-T12 carries 1D-T6's m4 (the analytics-off header on slip transports).
- **ci-parallel-jobs planner (Opus), dispatched about 00:55** at the owner's go-ahead: halve PR CI time by splitting jobs and sharding render, with no suite dropped.
  - It also takes 1A-T10's minor 1 (no `if:` or `continue-on-error:`), which was assigned to P6C-T7.
  - WT ci-parallel on chore/ci-parallel-jobs.
- **Owner's speed approvals (9 Nov):**
  - Sonnet for confirming and S-task reviews (`make_prompt.py --size S`).
  - `new_task_worktree.sh ... install|install-edge` pre-installs, so dispatch with `--installed`. A clone cache was dropped, because npm ci already takes about 15 s.
  - Faster CI, as above.
- **Held:**
  - 1B-T7 (AI routes) follows 1B-T8 in the server lane (the same route files).
  - fix-download-aborts follows 1B-T8 (downloads.ts). 1C-T2 and P3-T12 are still held on owner answers.
- **#354 1D-T9: merged 687e764 (about 10:00).** The confirming review approved (`reviews/1D-T9-confirm.md`; nits n1 to n4 are in followups.md for the m5 task). Issue #140 is closed and the worktree and branches are removed. The receipt's n5 was fixed in housekeeping commit 8a1f587.
  - **App baseline at 687e764**, measured by the confirming reviewer on the same tree: test:app 32, test:unit 882, render 90 files and 1694 tests, export:web 4778 modules. iOS was not measured: 5563 at 5dbd7be, plus 1D-T9's modules.
- **#354 history (fix round, Haiku, worktree p1-1d-t9):**
  - The merge now conflicts on `featureFlags.ts` and its test (#358). The controller resolved both, keeping both areas, in `scratch/1d-t9-merge/` (SHA256SUMS; `node --test` passes 11 of 11). The fixer copies them in Step 1.3.
  - Fix round DONE: merge 36adb96 (5dbd7be), fix ddc9317, and the controller's receipt correction 03da870. Every count matched: unit 882, render 90 files and 1694 tests, 45 of 45 mutants.
  - Pushed to #354 (MERGEABLE) and the PR body updated.
  - Confirming Opus review under way, writing `reviews/1D-T9-confirm.md`. Merge on its approval and green CI with `merge_task_pr.sh 354 03da870 1D-T9`.
- **1C-T6: merged f544c28 (#364, about 17:10).** The review approved: m1 is carried to 1C-T7, and an owner question is below. Issue #123 is closed and the worktree and branches are removed.
  - **App baseline now:** test:app 34, test:unit 901, render 94 files and 1717 tests (the reviewer and CI on the merged tree); web 4785.
- **P2-T8: merged 1502e65 (#365, about 19:00).** The review approved: m-1 is carried to P2-T11, m-2 to P2-T35. Issue #154 is closed and the worktree and branches are removed.
  - **App baseline now** (CI on #365's merge ref): test:app 34, test:unit 901, render 95 files and 1723 tests, web 4785 modules.
- **1B-T9: brief READY** (size L; kit `scratch/1b-t9-planner/`, with SHA256SUMS and SHA256SUMS.logs). It starts only after #362 merges with R96's fix round; its Step 0 checks that `headOf` cancels the body.
  - Expected: workers = the head's own count plus 1 file and 52 cases; Node +0.
  - R-B does not reach the vault (one transaction).
  - Planner calls to rule on at dispatch: P1 (the copy's 3-minute deadline is checked before publish), P3 (copy slot before prepare, as the API does), P11 (imports `attachments.service`, +33 kB, no driver).
- **1C-T6 history (Haiku), worktree p1-1c-t6:** base files are byte-identical at 5dbd7be (20 of 20). Expected: app 33, unit 887, render 90 files and 1660 tests.
- **1D-T6: merged 9a4a2f1 (#361, about 10:25).** The review approved with minors m1 to m4 (`reviews/1D-T6.md`; all in followups.md, and m1 is an owner question, below). Issue #137 is closed and the worktree and branches are removed.
  - **Baseline measured at cecf3a5** (app code as at 9a4a2f1) with `scripts/baseline.sh`; summary in `scratch/baseline-cecf3a5/`:
    - test:app 33, test:unit 894, render 93 files and 1706 tests;
    - web 4785 modules, iOS 5751 modules;
    - test:edge 14 files and 174 tests; workers 24 files, 488 passed and 3 todo.

    These match the earlier computed values exactly.
  - **1C-T6 will conflict with it** in `api/client.ts` and `client.test.ts`, additively; keep both sides.
- **Shared file:** 1C-T6 and 1D-T6 both edit `api/client.ts` and its test, in different places. Whichever merges second merges the other first.
- **State push held:** no `sync_state.sh` push until the three implementers have passed their sync steps, because their prompts pin the head at 5dbd7be.

## Migration to another machine (8 Nov, about 21:20 Bangkok)

The owner moved to another machine. Every agent below ran on the old machine and dies with it; restart each from its brief or review (skill `.claude/skills/jotbun-controller`, "Taking over"). Nothing of value is only local: every task commit is pushed, and this folder (without the 25 GB scratch trees) is committed in the repo. Scratch kept: only `scratch/1d-t6-planner/` (final, orig, stubs, tools, registry, lockfiles, SHA256SUMS), because 1D-T6's ready brief needs it. Paths in these files are absolute (`/Users/kunanonjarat/Developer/jotbun`); if the repo lives elsewhere, `grep -rl /Users/kunanonjarat/Developer/jotbun .claude/` and fix them.

Integration head when this was written: a88fc84 (#357), after #355 (daf8a63) and #352 (e893255).

Open PRs and what each needs:
- #354 1D-T9: fix round dispatched (briefs/1D-T9-fix.md, proven: 45 of 45 mutants, full render 1664). If its commit is not on the PR, rerun the brief from the worktree (branch p1/1d-t9-conflict-choice). Then push, and a confirming review against reviews/1D-T9.md. Merge on green.
- #356 1B-T5: fix round pushed (merge be2f8f8, fix 020aa84: rejected photo keeps its issue, 13 tests, 11 of 11 mutants, workers 488 + 3 todo); confirming review by the original reviewer (aca49a5e) under way; CI running. Merge on green + approval, then dispatch 1B-T6.
- #358 P2-T2 merged 7273ee9 (issue #148 closed). Review note: iOS/Android builds made before it no longer launch (Gesture Handler's native module); the next device check needs `expo run:ios` or `expo run:android`. #354 will conflict on featureFlags.ts and its test: keep both (`'companion' | 'conflict' | 'wallet'`, both comments, both tests).
- 1D-T6 dispatched (Haiku) in worktree p1-1d-t6, branch p1/1d-t6-posthog-phone, base 7273ee9; adjusted totals: unit 890, render 92 files 1661, web 4781, iOS 5747 modules. If no commit is on that branch, rerun the brief.
- #359 reminder wording merged 4702c20 (the owner's uncommitted main-checkout work; the main checkout on claude/premium-ai-edge still shows those edits uncommitted on the old machine; they are now in claude/p1a-vault-core). The `previewDay` rule (TODO(owner)) is "the next reminder the person gets"; the owner may change it.

1B-T6 brief READY (briefs/1B-T6.md, kit scratch/1b-t6-planner/; built on 52632f2 + 1B-T5; dispatch only after #356 merges; Step 0 falls back to Appendix A for sync.test.ts and vault-route-coverage.test.ts, which #352 changed; planner calls P1-P14 accepted, including P2: the API export service's two names restated in exports.ts with a Node pin test, since it imports pg). 1C-T6 brief READY (briefs/1C-T6.md, kit scratch/1c-t6-planner/; P1-P17 accepted); Haiku implementer dispatched in worktree p1-1c-t6, branch p1/1c-t6-fresh-sign-in, base 4702c20. If no commit is on that branch, rerun the brief. 1C-T6 and 1D-T6 both edit api/client.ts in different places; whichever merges second rebases. After 1B-T6's brief: 1B-T9 (receipt attachments, also creates downloads.ts). Next ready tasks: `python3 -I .claude/skills/jotbun-controller/scripts/ready_tasks.py --inflight <ids>`.

## Takeover, 8 Nov 18:50
The controller session d32ab8e7 (chat "Resume Subagent Controller Merges") died at 18:41:46 with 9 agents in flight. New controller: session 2c0f7a73 (same superconductor profile, transcripts in `~/.superconductor/profiles/claude/926dc4b0-.../projects/-Users-kunanonjarat-Developer-jotbun/2c0f7a73-.../subagents/`). Each agent was restarted with its original prompt (saved in `scratch/takeover/<name>.prompt.md`), its predecessor's transcript (`tail_transcript.py` reads one) and its scratch folder:
- reviews: #350 parser regex (a3b125e5), #351 P5-T3 (abd2b493), #352 1A-T9 (a036e534; CI's parity test failed on steps 44/45, likely JSON key order, logs in scratch/takeover/), #353 1D-T10 (ab4449b0; its SQL job hit the R-B attachments flake, rerun it)
- briefs: 1B-T5 (rebased on 3ab4d0a, done 20:05; implementer a00dcda0 on Haiku in worktree p1-1b-t5, branch p1/1b-t5-uploads, base 52632f2, P1-P17 accepted), 1D-T9 (done 19:10; implementer af4bbd11 on Haiku in worktree p1-1d-t9, branch p1/1d-t9-conflict-choice, base 84ee167, P1-P13 accepted), P2-T19 (done 19:15; implementer ac8ad975 on Haiku in worktree p2-t19, branch p2/t19-wallet-commands, base 84ee167, C1-C8 accepted), P2-T2 (done 19:40; implementer aaa4e502 on Haiku in worktree p2-t2, branch p2/t2-packages, base 3ab4d0a; __DEV__ define and extra tests accepted; lands BEFORE 1D-T6), 1D-T6 (brief READY 20:55 on 3ab4d0a + P2-T2's patch; dispatch only after P2-T2 merges; R93 accepted)
To stop a chat session in the app: `sc chat stop <thread_id>` cancels its turn only; `sc chat list --worktree <path> --json` lists thread ids.

## Merged 8 Nov
#337 1D-T1, #330 keyboard fix, #338 test:ops date fix, #335 P2-T6, #331 P5-T1, #339 1A-T7, #344 1A-T8b, #336 P3-T1, #334 1C-T1, #343 P5-T4, #345 P4-T10, #342 flaky-test fix (R85, R88), #333 P2-T5, #341 1B-T4, #346 1A-T8b follow-up, #340 P6A-T1, #348 1B-T4 follow-up, #347 1C-T5, #349 API DB flakes. Issues closed, worktrees and branches removed.

## Open PRs (updated 19:05)
- #350 fix-parser-regex merged 52632f2 (worktree and branch removed; no task issue). Its review's six surviving mutants (X1-X4, X9, X10) go in a test-only follow-up under R89: brief being written by the reviewer (a3b125e5) at briefs/fix-parser-regex-followup.md, worktree fix-parser-regex-tests, branch fix/parser-regex-tests.
- #352 1A-T9 merged e893255 (issue #103 closed, worktree and branch removed); receipt housekeeping ad1fe18. Integration head ad1fe18.
- #357 parser-regex test follow-up (worktree fix-parser-regex-tests, no task issue): opened at b47bc6b; test-only, spec byte-identical to #350's reviewer's verified copy, so controller-checked instead of a second review; merge on green CI.
- New planners: 1B-T6 (aa86ac2f; built on top of 1B-T5's real/, starts after 1B-T5 merges; 1B-T9 is planned after it, both create downloads.ts), 1C-T6 (ad1c215e).
- P2-T19 and P2-T2 implementers hit the HistoryReturn load flake; told to rerun the full suite once (followups.md).
- Skill: .claude/skills/jotbun-controller/ (SKILL.md, references/, scripts/) holds the loop, templates, lessons and helper scripts.
- #356 1B-T5 (worktree p1-1b-t5, issue #109): opened 21:00 at d232654; review aca49a5e (reviews/1B-T5.md).
- #355 P2-T19 (worktree p2-t19, issue #165): opened 20:50 at 3a26545; review ab303690 (reviews/P2-T19.md).
- #354 1D-T9: review Needs fixes (M1: the old ConflictPanel flashes, live, while dropChoice is awaited; m1 missed choice when the diary is not ready; m3 five untested behaviours; m6 receipt arithmetic). R94 (narrow reading kept). Fix brief being written by the reviewer ab1a40dd (briefs/1D-T9-fix.md); CI green on 7f25a65.
- #352 1A-T9: R92 fix round done (6a4faf3) plus a receipt status correction (1df7551), pushed; PR body updated; CI running on 1df7551; confirming review a78301f7 (reviews/1A-T9-confirm.md).
- #353 1D-T10 merged 3ab4d0a (issue #141 closed, worktree and branch removed; minors in followups.md).
- #351 P5-T3 merged 84ee167 (issue #236 closed, worktree and branch removed; minors in followups.md).

## In flight
- Briefs: fix-parser-regex (R89, extended to readDateStyles), fix-api-db-flakes (3 API DB concurrency flakes, CI logs only), 1B-T5 (critical path), 1A-T9, 1D-T10, P5-T3, 1D-T9, P2-T19.
- Held: P2-T2 and 1D-T6 wait for #347 (lockfile, _layout). P3-T12 waits on owner Q1. 1C-T2 waits on the owner's lockout answer, and its brief must first pin 1C-T1's six untested security options (followups.md).

## Rulings this session
R104 (10 Nov, 1B-T11's P2): a write never arms the vault alarm sooner than a minute ahead (`CALL_ALARM_DELAY_MS`, 60,000 ms), and never postpones an alarm already set sooner. The alarm's own rearm is exact, or a minute out after a failed job (P3).
  - Why: workerd refuses `setAlarm` at or before 0, which every release asks for (`delete_after = 0`), and in the Workers tests an alarm due at once fires itself, racing about 40 existing cases.
  - A person never sees the minute, and a burst of writes becomes one alarm. Because a write can only move the alarm earlier, a stream of writes cannot starve the jobs.
  - Later vault tasks that reason about alarm timing must expect it.
  - **One exception (alarm-hardening's review, n2):** after a refused `setAlarm`, `rearm`'s catch sets `alarmAt` to null. The next write then skips the keep rule once, and an idle vault can be left with no alarm until its next call. Only a storage failure causes this, and the base was worse.

R105 (10 Nov, alarm-hardening's P6): the vault's `attachment_checks` table (migration 0004) lists every retained receipt that may have no holder, and `attachmentsDueAt` reads its safety net from that table alone.
- Four triggers fill the table, on every SQL statement: a receipt inserted before any record holds it, a receipt set back to retained, a last holder deleted, and a last holder moved.
- `pruneAttachments`' full pass over every retained receipt stays, once per alarm, and empties the table in the same block. A statement that bypassed the triggers is still found at the next alarm.
- A migration that rebuilds `attachments` or its holders' table must recreate the four triggers.
- **Not covered (alarm-hardening's review, n1):** `INSERT OR REPLACE`, `REPLACE INTO` and `UPDATE OR REPLACE` on `transaction_attachments` remove a holder without firing a delete trigger (`recursive_triggers` is 0). B20 and 0004 both miss such a receipt until the next full pass. No vault statement uses these forms today; do not add one without a trigger for it.
- `importsDueAt` reads the partial index `entity_heads_imports_idx`, whose terms its WHERE names literally (`LIVE_IMPORT_HEADS`).

R103 (10 Nov, P2-T11's gate): when a local whole-file run cannot finish because the machine sleeps (`pmset -g log`: "Dark Wake Thermal Emergency"), and every case has a passing run, the whole-file run goes to CI under R100.
  - "Every case has a passing run" means the failures are timeouts across recorded sleeps, and a targeted rerun of the failing cases passes.
  - The receipt records each run, the targeted rerun and the sleep times.
  - First used for `CatalogueScreen.render.test.tsx` (301 cases): runs of 298 and 300, then 4 of 4 targeted.
R102 (9 Nov, P4-T12's P2; binds P4-T6): the phone sends a slip batch as the UTF-8 bytes of its JSON, typed `application/octet-stream`, as the import upload sends its file.
  - P4-T6's handler reads at most 8 MiB of `w.stream`, accepts `application/octet-stream`, and parses the text with the contract's `parseSlipBatchRequest`.
  - A body typed `application/json` cannot work: the dispatcher's `readRouteBody` parses it (`readJsonBody`, capped at 2 MiB, 413 `COMMAND_TOO_LARGE` above that), and a stream route is then left with no stream. P4-T13's batches are up to 8 MiB.
  - P4-T6's planner decides what a JSON-typed body answers.
R101 (9 Nov, 1B-T8's P4): a snapshot build whose view was read below the purge watermark throws instead of answering the plan's `skipped`. SnapshotWorkflow's step then retries with a fresh read after the purge, as the API retries `snapshot_not_recorded`. A skip would leave the snapshot `pending` with its Workflow complete, so clients poll it until they give up and it stays stuck until `pruneSnapshots` fails it a day later. The other two refusals stay `skipped`: a snapshot no longer pending, and a vault no longer active. 1B-T12's parity session should expect the throw.
R100 (9 Nov, the owner's ask to speed up): CI is the gate for whole suites. That covers the full render suite, the full workers suite, export:web (unless routes or the entry change), the iOS export, the database suites and test:ops.
  - Agents run only the fast local gate in `protocol.md`, and no whole-suite totals appear in briefs, prompts or receipts. Reviewers read CI instead of re-running suites.
  - The running planners of 1B-T8 and 1D-T8 were told to adopt it.
  - Fix rounds that apply the first reviewer's verified patch byte for byte merge on green CI without a confirming review.
  - Up to about 6 agents.
R98 (9 Nov, 1C-T8 review M1, amends 1C-T8's P6): on the session-ended screen, whenever the main button is the email code to the account's own address, "Use another way" also offers an email code to another address. This keeps "every failure offers another way" on email-only builds, and reaches keep-or-erase for another account.
R99 (9 Nov, 1C-T8 review, P4): nothing navigates to `/onboarding/reminder` before 1C-T9 adds it. OnboardingScreen keeps today's in-place reminder step until then, so there is no cast and no unmatched route with the signin or all area on. 1C-T9 adds the route, the `from=onboarding` handling and the switch in one change.
R97 (9 Nov, 1B-T6 confirming review MA-1): in workerd, a GET whose client goes away mid-download keeps its download slot, because the cancel never reaches the stream behind FixedLengthStream. This is a follow-up task, not a blocker for #362, since the vault routes are not live before 1B-T13.
  - The follow-up, "fix-download-aborts", applies the proven fix to every vault download (exports now, receipts from 1B-T9, snapshots from 1B-T8): each `serve*File` hands `w.waitUntil` a promise that its `release` settles. Prove it under `wrangler dev` (four aborted GETs, then a GET answers 200), before 1B-T13.
  - Same leak, retiring code: the PostgreSQL edge's routes.ts:341-346 and 429-437.
R96 (9 Nov, 1B-T6 review M-1, amended the same day): `headOf` in src/v1/handler.ts reads the response body it drops to its end, with `pipeTo` into a discarding WritableStream and errors swallowed, before answering the HEAD. A HEAD on any HEAD-able route then releases what that body holds.
  - The first wording, "cancels the body", fails in workerd. The request ends before the cancel reaches the stream behind FixedLengthStream, so the slot is never returned (proved under `wrangler dev`; the test runtime hides it). The case checks that each HEAD reads the whole file.
  - handler.ts joins 1B-T6's fix round. The fix covers 1B-T8's and 1B-T9's downloads.
  - **1B-T9's brief still checks for `cancel(` (Step 0.4 and P13).** At its dispatch, amend Step 0.4 to `grep -c 'pipeTo('` printing 1.
R95 (9 Nov, 1B-T6: the build check "no PostgreSQL code in the vault bundle" counts driver markers, not the word `node-postgres`, because #352's `jsonbOrder` doc comment names node-postgres in prose; the bundle keeps that one comment line, and every driver marker counts 0),
R84 (P4-T10 fixtures), R85 (two API test-only fixes), R86 (token sid must match the provider's session; sign out on a failed finish), R87 (receipts in docs/implementation/receipts/<task-id>.md), R88 (upload-intake deadline reason), R89 (+ extension: parser regex and readDateStyles DoS in frozen apps/api), R90 (API tests may add the legacy session header), R91 (two API database test races, test-only: command order and export downloads; R-B migration waits on the owner), R94 (1D-T9: a refused edit keeps a choice only with a usable current record; the broader C16 reading goes to the owner at E2), R93 (1D-T6: posthogOptions sets `rageClickConfig: { enabled: false }`, beyond the plan's options, because the iOS SDK sends $rageclick itself outside before_send and before consent, and repeated keypad taps reveal amounts), R92 (the vault serves sync snapshots in PostgreSQL jsonb key order, shortest key first then bytewise, nested too, via `jsonbOrder` in src/vault/reads/sync.ts; the parity normalizer stays byte-exact; 1B reads of jsonb-backed values use it too).

## Merge routine
Merge each PR when its CI on the current head is green; close its issue by hand (backlog-map.json); remove worktree and branch (local and remote). Open PRs that conflict only in docs/implementation/premium-progress.md: merge the head and run ledger_union.py (keeps both sides), except 1C (hand-merge: one `## 1C:` heading) and P4 (one `## P4` heading). New tasks write receipts under R87, which avoids those conflicts.

## Owner decisions waiting
- **OPEN (10 Nov, 14:50): 1C-T9 waits on E2 for 1C-T8** (plan p1c :1052).
  - Approve the 23 sign-in catalogue sections (the deep links in `receipts/1C-T8.md`), and answer:
    - P5: keep the extra "Confirm it's you" tap before Apple's and Google's sheets (item 6 below);
    - m2: the session-ended "account unavailable" variant's wording and main button;
    - m4: keep or drop the terms box on today's sign-in screen.

    Any changes land first, as a 1C-T8 follow-up.
  - **Why it waits:** 1C-T9 moves all 99 draft Thai lines into `en.json` and `th.json`, 71 of which you have never seen, and adds `'signin'` to `APPROVED`, which turns the area on by default.
  - **An option, for speed (a plan change, so the owner decides):** split 1C-T9.
    - Now: `getSharedPolicyClient`, `onPolicyRequired`, the five routes, the session-ended guards and the TermsGate wiring, all behind the `'signin'` area left off, with the drafts kept.
    - After E2: the copy move and `APPROVED`.
  - The controller recommends the split only if E2 will take more than a day.
- **OPEN (10 Nov, 08:52): GitHub Actions stopped for billing.** Every job of #392's run 42738781210 failed without starting. Each carries GitHub's annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings".
  - The last green run was #391's at 08:20 (42735086363). The Free plan's 2,000 minutes a month are used up: about 1,400 by 6 Nov, then about 11 nine-job runs at about 33 billable minutes each since #377 merged.
  - **Effect:** no PR can get CI, so nothing new can merge. #391 can still merge on its review, because its run was green before the stop. Planners, implementers and reviews go on, and PRs are opened, but they wait for CI.
  - **Owner's options:**
    - add a payment method or raise the Actions spending limit for the account that owns the repo;
    - or cut CI cost first. Each merged task runs CI twice today: the task PR, and its promotion PR into main on the same tree. P11's cheaper layouts are another way: fold `image` into `exports`, or split the section suites two ways.
    - Otherwise CI waits for the minutes to reset at the next billing date.
  - **After the fix:** rerun each refused run (`gh run rerun <run> --repo mygogocash/jotbun`) and merge as each goes green. Refused so far: 42747590350 (#392 at fc78376; its older 42738781210 on 784667b no longer matters), 42774078632 (#394 at 317cf3a; its older 42741146172 on ef37c41 no longer matters), 42741688287 (#395), 42745408105 (#396), 42748341937 (#397) and 42771332803 (#398).
- **ANSWERED (10 Nov, 06:2x): keep the nine-job CI, merge.** Below is the question as it was asked. The owner accepted about 33 billable minutes a run.
- **(was) Actions minutes before ci-parallel-jobs merges.** The repo is private on the Free plan, which includes 2,000 Actions minutes a month.
  - Usage: 80 pull-request runs have happened since 1 Nov, about 1,400 billable minutes at today's roughly 18 per run, and each merged task now adds a promotion PR run. The controller cannot read the actual usage: GitHub's timing API reports 0, and the billing endpoint needs `admin:org`.
  - The parallel layout costs about 31 billable minutes a run (P11). If the minutes run out with no payment method, Actions stop, and every merge stops with them.
  - **Measured on #377's own run (42652925056, all nine green):**
    - wall time 285 s (4.75 minutes), against 10 to 12 minutes before (#372's longest job was 12 min 14 s);
    - job times 158 to 283 s, plus 58 s for `image`; about 1,730 s of runner time, or about 33 billable minutes once each job is rounded up, against about 24 for #372's three-job run;
    - the render total adds up (1289 + 162 + 196 + 218 = 1865);
    - the iOS export passed on Linux (5760 modules).
  - Owner: check the org's billing page, and confirm the trade-off before the controller merges ci-parallel-jobs. Cheaper variants are in P11: fold `image` into `exports`, or split the section suites two ways.
0. R-B (apps/api migration 0020_receipt_copy_once.sql, prepared in scratch/fix-api-db-flakes/files/): gogospend_reserve_receipt_copy (migration 0017) checks "receipt exists" and "copy in flight" in two statements, so two requests can each reserve a copy (one wasted copy, deleted at the next sweep). The fix is a new migration replacing the function with one combined check; it needs the API's migration step wherever the API runs. Until then attachments.integration.spec.ts "two records retaining one image ... one copy" stays a rare known flake.
1. Sign-in lockout: no per-email lockout, only per code (about 1,440 guesses a day against one address at Task 2's 5 codes per 15 min). Needed before 1C-T2 sends real mail.
2. Q1 (QR decoder package) gates P3-T12.
4. Deletion retry with an expired token (1C-T6 review, for Tasks 8 and 11): an unconfirmed deletion stays unconfirmed on every Try again once its token is over 10 minutes old (401). The plan requires reusing those credentials, so the person must leave and start over, and if the first request had landed, the new attempt says "Nothing was deleted". Decide whether a retry may use a fresh sign-in's new credentials.
6. E2, from 1C-T8's P5: the new "Confirm it's you" sheet opens for every sign-in method, so Apple and Google take one more tap before their own sheet. Keep that, or skip the sheet for Apple and Google?
5. Whether to run the plan's whole-1A-range review (1A-T10's P11). It is an expensive Opus pass; every 1A task had its own review, but the reviews of Tasks 1 to 6 and 8a were lost with /private/tmp.
3. Before Q5's PostHog key is set (1D-T6 review m1): with crash reports on before consent (Q4's default), the native SDK sends native crash reports unscrubbed (outside `before_send`), and a feature-flags request at every launch carrying the stored analytics id. Native requests also carry no `$geoip_disable` (Q6). Nothing is sent today, because there is no key. Decide, with counsel, whether crash reports before consent stay on, or whether the native SDK must start only after a yes.
7. Release rules for the server's minimum client version (deploy time): raise it to at least 0.2.0 before any build sends a source (P3-T2's m2), and to at least 0.3.0 before any server sends a phase 5 key (P5-T2's P14). Builds 0.1.0 and 0.2.0 refuse those keys with exact-key validators and stop syncing. **0.3.0 is only a reading floor** (#436's reviews): a 0.3.0 build cut before P5-T18a and T18b shows wrong wallet balances for foreign records, so gate the phase 5 server's first build on P5-T18a, T18b, T18d and T21, or bump the app's minor after them and raise the minimum to it (followups.md).
