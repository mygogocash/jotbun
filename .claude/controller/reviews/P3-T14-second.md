# P3-T14 second review: AI consent and settings in the Bun Wallet look

Reviewer: Claude Sonnet 5.5, independent second (privacy path, P19). Read-only: nothing edited, committed, pushed or merged in any worktree; probes ran in a `git archive` copy of `1247404f` at `.claude/controller/scratch/p3-t14-second/tree` (node_modules linked entry by entry, the three workspace links re-pointed at the copy). I wrote this before opening any other review of the task.

Reviewed: `1247404f` on `p3/t14-ai-consent-settings`, range `origin/claude/p1a-vault-core...1247404f` (22 files, all under `apps/app` plus the receipt; no `apps/api`, `apps/edge` or contract file). Against: the plan's Task P3-T14 (line 689), Global Constraints, Q6, Q7, Q11, Q12, B3, B8, B25, A10, the brief's rulings P1 to P19, the boards `ai-consent` and `ai-settings`, and the server code that decides what leaves the phone (`apps/edge/src/v1/ai/service.ts`, `server/ai/prompts.ts`, `vault/ai.ts`).

## Result in one paragraph

No blocker and no major; CI is green. Consent behaves as the plan and the brief say: nothing leaves before a yes, nothing is recorded before the server answers, a failed change tells the person and leaves the switch where the server last said it was, and the server enforces consent on its own. The Thai lines are byte-equal to the plan and the boards, and nothing in them promises more than the server does today. There are five minors: the note switch is inert until P3-T21 and the receipt does not say so; `-companion` leaves the new row and screen live with no provider behind them; four guards of mine survive the task's suites (the code is right, the tests do not hold it); the English consent says "never" where the Thai and B3 say "not"; and the new screen never re-reads preferences. Details below.

## CI on PR #440 (head `1247404f`, run 43228264453)

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | pass (3m16s) |
| Exports (web and iOS bundles) | pass (2m26s) |
| Render (every file but the per-section suites) | pass (3m18s) |
| Render, per-section suites: 3n / 3n+1 / every other test | pass (2m39s / 3m33s / 4m2s) |
| Edge Worker | pass (3m0s) |
| Release image and smoke | pass (22s) |
| SQL integration and ops | first attempt failed (below); the re-run, job 131226963170, **passed** (3m45s) |

All nine jobs are green on the re-run. The first attempt's failure is not this PR's: one test, `apps/api/src/attachments/attachments.integration.spec.ts:907`, `expect(limited.retry_after).toBeLessThanOrEqual(180)` received 181 ("serializes reservations: five at once from one account reserve exactly four"); 693 of 694 tests and 40 of 41 suites passed in that attempt (`Test Suites: 1 failed, 40 passed`). It is a one-second boundary on a clock-derived `retry_after` in a file the diff does not touch (no `apps/api` file is in the range), and it passed on the re-run. Log of the first attempt saved at `scratch/p3-t14-second/ci-db-job.log`.

## What I ran (scratch copy, focused files only, per R100)

| Run | Result |
| --- | --- |
| `node scripts/test-unit.mjs` on `featureFlags.test.ts`, `bunai/drafts.test.ts` | 16 of 16 |
| The four focused render files (`AiConsent`, `WalletAiSettings`, `SettingsScreen`, `AccountRoutes`) | 104 of 104 |
| `CompanionSettings.render.test.tsx`, `TellBunSheet.render.test.tsx` (unchanged files) | 14 of 14 |
| `SpendRoutes`, `InsightsRoutes`, `PlanningRoutes` routes tests (with a name filter) | 3 files pass |
| `CatalogueScreen` and `screenReader` with the brief's `bw-ai ...` filter | 56 passed, 612 skipped, as the receipt says |
| My own script `verify-drafts.mts`: every Thai line against the plan text and the two boards | all 40 keys match (below) |
| 12 of the planner's 74 mutants | 12 of 12 killed by assertion, each file restored (sha256 equal) |
| 8 of my own mutants | 4 killed, **4 survived** (m3) |
| 5 probes of mine (4 for the survivors, 1 for `-companion`) | all pass on the real code; the 4 kill their mutants |

`git diff --check origin/claude/p1a-vault-core...1247404f` is clean. The commit trailer is `Co-Authored-By: Claude Haiku 5.5`, as the brief says. The implementer's gate logs agree with the receipt (kit 141, routes 16, catalogue 56, unchanged 14, `test:unit` 1052, mutants 74 of 74). I did not rerun the typecheck, `export:web` or whole suites (CI has them, green).

## The focus, answered

### Consent (P6, P5)

- **Nothing reaches the AI before yes.** Opening `/settings/ai` or the tray only reads preferences (a GET). `เปิดใช้` is the only turn-on caller (`AiConsentTray.tsx:45-57`); `ไม่ใช่ตอนนี้`, close, backdrop and the read-only tray send nothing (cases "ไม่ใช่ตอนนี้ changes nothing and sends nothing", "read-only shows the same lines without buttons"; K1 and X5 killed). The server does not rely on the app: parse and slip refuse without consent (`service.ts:313-317`, 403 `AI_CONSENT_REQUIRED`), ask the same (`:219`), the note falls back to plain facts (`:184`), and "consent" is `companion && notice_version === AI_NOTICE_VERSION` (`vault/ai.ts:51`).
- **Nothing is recorded before the server answers.** `aiConsent.ts:37-39`: `await update(...)`, then `setCommon({ ai_enabled })`, then one `trackAiConsentChanged()`; a rejection skips both and rethrows through `finally { setBusy(false) }`. Planner mutants C1 and C3 re-run: killed. My X7 (`ai_enabled` from consent alone): killed.
- **A failed turn-off.** `AiCard.toggle` (`WalletAiSettingsScreen.tsx:211-225`) catches, plays `saveFailed`, shows today's catalog line, sends no event; the switch reads `preferences.companion`, which the provider replaces only on success (`AiCompanionProvider.tsx:47-51`), so it stays where the server last said it was. The person is told. W4 killed, and the case "a turn-off the server never took leaves AI help on and says so" holds it.
- **`ai_enabled`.** The hook writes `saved.companion && saved.available`; the provider's own effect (`AiCompanionProvider.tsx:62-64`) writes `enabled`, the same expression, so the two writers cannot disagree. A turn-on while the service rests shows the switch ON with the resting line and sends `ai_enabled: false` (P5, C3, deliberate and pinned).
- **Can a screen show Bun on while the server says off, or the reverse?** The switch shows the server's own `companion` (already `consented()`), so a read answer is never contradicted. Three ways the display can lag, none of which can send anything: (1) another device changed it and this one has not re-read (the server's 403 stops the call, and Tell Bun and Ask Bun call `refresh()` on it); (2) the first read failed, so the switch reads OFF with no uses and no hint (n2; X4 shows nothing pins this direction, m3); (3) the resting state above. The legacy `CompanionSettings` has the same rule today.

### The words (P19)

`verify-drafts.mts` (scratch) reads the table from the archive: `consentWhatLine`, `consentKeepLine`, `consentFailed` and `photoHidden` are byte-equal to the plan's text (Copy paragraph of Task P3-T14); the 13 ai-consent keys and the 22 ai-settings keys all occur in their board's visible text, in board order; the table holds 40 keys, none outside the plan's list, none missing.

What actually leaves the phone, from the server code: the typed sentence (`service.ts:127`); wallet and category ids and names (`:323-324`); the slip image (`:157`); for the note, day and month facts (`vault/ai.ts:139-182`: today's spend and record count, month spend and income, budget left and per day, the top category with its label); for Ask Bun, the question text (`:228`) and tool results with totals, category names, budget lines and `top_merchants`, which falls back to the **note** when a record has no merchant (`vault/ai.ts:280`). No account, session, device, email or phone is added by the app or the Worker. So the Thai what-line is faithful: sentence, slip with printed names and partial numbers, wallet and category names, day and month totals, budget left, category names, and on asking totals, shop names and notes. Nothing it names is untrue, and nothing sent is missing from it except the question text (n1).

Where a line promises more than the server does or will, all of it a counsel matter (Q11) because the lines are drafts:

1. **m4**: the English says "never" where the Thai says "not" (below).
2. **B3's accepted gap**: "ไม่เก็บรูปสลิป" (slip photos are not kept) is not true for a slip a person attaches without asking Bun while Q1's default stands (no native QR decoder): B3 keeps it as a receipt. Nothing attaches yet (P3-T15), so it cannot be false today; it has to be settled before P3-T15 ships.
3. **n1**: "เก็บนานแค่ไหน" answers only for Jotbun. The provider's own retention window is Q11's open question, and "ไม่ถูกนำไปฝึก AI" has no stated subject.

### Today's screens (P3, P11, R69)

`CompanionSettings` (diff read in full): the only change is that turning AI off runs through `useAiConsentChange().turnOff`, and the AI section is wrapped in `showAi` (default true, so today's card is unchanged). `AiConsentSheet`: `await turnOn()` in place of `update({ companion: true, notice_version })`, nothing else; it stays mounted whatever `showAi` says. Both now also set the common property and send one event on success, which is what the plan asks. Their unchanged suites pass (14 of 14). `SettingsScreen` with the area off is as before (flag combinations `account`, `account,wallet`, `account,bunai` show no row and today's AI card). R69's order: `AiConsentTray.details()` marks and closes, the Tray's `onClosed` then pushes `/settings/privacy` (`AiConsentTray.tsx:59-70`); T7 and T8 killed; but the flag's reset is not held (X1, m3).

### The route and the area

`app/settings/ai.tsx` calls `useBunAiArea()` unconditionally and redirects to `/settings` otherwise; `AccountRoutes` pins eight flag combinations (`undefined`, `wallet`, `bunai`, `account,companion`, `all,-wallet`, `all,-bunai` off; `wallet,bunai`, `all` on); `featureFlags.test.ts` pins `bunai` as off by default, `-bunai,all` off, `bunai,off` off. `typecheck:routes` is in CI's `checks` job and the web and iOS exports pass. The route does not test the `account` area (`settings/index.tsx` and `privacy.tsx` do; `lock.tsx` does not either): harmless, since `/settings` then redirects to `/spend`. The companion area is the gap: m2.

### The wallet kit

No `#hex` anywhere in `wallet/bunai/*`, the route or the two catalogue files (scan). The only colour literals are the two `rgba(17, 16, 20, ...)` shadow strings in `WalletAiSettingsScreen.tsx:58` and `:112`, which P15 names. Controls: back 44 (`IconButton`), text links 44 (`TextLink`), main button 54, switch rows 52, presence and haptics radios 44, สิ่งที่ AI เห็น 44; every one carries a name. At AX5 the presence cards, the uses and the haptics segments stack, and the suites record every `numberOfLines` prop on the app's Text and expect none. The sections are lazy (`bunaiSections.tsx:30`, `lazy(() => import('./bunaiScreens'))`) and `index.ts` imports only the sections file; the per-section CI jobs and the eight kit files pass. The knob and track contrast follows the palette's tested pairs (`walletPalette.test.ts` holds them).

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. The daily note's switch changes nothing yet, and the receipt does not say so.**
`useDailyNoteSetting` has one consumer, `WalletAiSettingsScreen.tsx:267` (grep over `apps/app/src` and `apps/app/app`). Today's Home note is `BunNote` (`HomeScreen.tsx:680`, under the companion area), which calls `resources.note(today, locale)` on every Home mount (`BunNote.tsx:36`); the server then words it with Claude when AI is on and spends one of the day's 3 note uses (`service.ts:179-205`). With `wallet,bunai` named and the switch off, the request still goes. The plan puts the reader in P3-T21 and keeps `bunai` off until P3-T24, so no released build is touched, and the plan's T14 case only asks that the choice be kept ("the note switch is kept on this phone"). But it is a privacy control whose off is not honoured, and the receipt's note for P3-T21 (`receipts/P3-T14.md`, "P3-T21: useDailyNoteSetting() reads the store once, at mount...") talks about re-reading, not about the switch having no effect today.
Fix, no code in this PR: say it in the receipt, and make P3-T21's brief and P3-T24's approval of `bunai` conditional on every note path (the wallet Home note and the legacy `BunNote`) reading the setting before any `resources.note` call.

**m2. `-companion` leaves the new row and screen live with no provider behind them.**
`featureFlags.ts` says of the companion area that "`-companion` switches all of it off". `SettingsScreen` shows the บันและ AI row when `useBunAiArea()` alone says so (it sits outside the `isRedesignEnabled('companion')` test that guards `CompanionSettings`), `ai.tsx` tests only `useBunAiArea()`, and `bunAiAreaOn()` is `wallet && bunai` (`aiArea.ts:12-14`, the plan's own definition, so this is a plan gap, not a slip). With `account,wallet,bunai,-companion`, `CompanionBoundary` (`app/settings/_layout.tsx`) mounts no provider; `useAiCompanion()` answers its OFF value, whose `update` throws.
Probe, run in the scratch tree with the provider replaced by a pass-through (`scratch/p3-t14-second/probe-companion-off.render.test.tsx`, copied into the tree's `src/wallet/bunai/` to run; passes on the real code, log `probe-companion-off.log`): the switch reads off, `เปิดใช้` shows `ai-consent-problem` = "เปิดตัวช่วย AI ไม่ได้ตอนนี้ ลองอีกครั้งเมื่อต่อเน็ต" with the phone online, no event is sent. It fails safe (nothing can turn on, nothing leaves), but a kill switch that still shows an AI row, and a screen that tells a connected person they are offline, is the wrong answer.
Fix for P6B-T15 or P3-T24: have `useBunAiArea()` also require the companion area, or have the row, the route and the switch require `useAiCompanion().resources !== null`.

**m3. Four of eight of my own mutants survive the task's suites.**
All four are real guards, the code is right today, and my probe (`scratch/p3-t14-second/probe-main.render.test.tsx`, 4 cases, passing on the real code) kills each. Adopt them in `WalletAiSettings.render.test.tsx`.

| Mutant | File | What it would do | Held by |
| --- | --- | --- | --- |
| X1 | `AiConsentTray.tsx:66`, drop `detailsNext.current = false` | The flag stays true after one use of อ่านรายละเอียด in a mounted tray (the settings screen keeps one mounted), so a later close, `เปิดใช้` agreeing included, would push `/settings/privacy` | probe "X1" |
| X2 | `AiConsentTray.tsx:46`, drop `setProblem(null)` in `agree` | A retry shows the old failure line while it waits | probe "X2" |
| X3 | `WalletAiSettingsScreen.tsx:212`, drop `setProblem(null)` in `toggle` | A second press keeps the old failure line | probe "X3" |
| X4 | `WalletAiSettingsScreen.tsx:209`, `preferences?.companion === true` to `!== false` | Preferences the phone could not read show AI help as ON, the direction the controller asked about; nothing pins that unreadable reads off | probe "X4" |

Killed by the task's suites: X5 (read-only flag not forwarded), X6 (`locked` dropped), X7 (`ai_enabled` from consent alone), X10 (no success tap).

**m4. The English consent says "never" where the Thai says "not".**
`drafts.ts` `bunai.consentKeepLine.en`: "Slip photos are never kept" against `th` "ไม่เก็บรูปสลิป" (the plan's words), and `bunai.consentWhatLine.en`: "Your email, phone number and Jotbun account ID are never sent" against `th` "ไม่ส่งอีเมล เบอร์โทร หรือรหัสบัญชี Jotbun ของคุณ". "Never" is an absolute the plan does not make and the server cannot keep: B3's accepted gap keeps an attached slip as a receipt until Q1's decoder exists, and a wallet name, note, merchant name or a slip's printed text can carry a phone number or an email the person put there. The legacy sheet had the same "never kept" (`AiConsentSheet.tsx:36`), so this is not a regression, but this is the line counsel will read. Suggest "Jotbun does not keep slip photos" and "Jotbun does not send your email, phone number or Jotbun account ID". English is an E2 draft, so this is a one-line edit in `drafts.ts`, and the render case that spells the English through the table follows it.

### Nit

**n1. Counsel items on the wording (Q11), none for this task to fix.** (a) The ask question is sent verbatim (`service.ts:228`) and is named only by "ประโยคที่คุณพิมพ์" (the sentence you type) and "เมื่อคุณถาม" (when you ask); say "your question". (b) The heading "How long it is kept" answers for Jotbun only; the provider's retention and the subject of "not used to train AI" are not stated.

**n2. Preferences are read once and never re-read by the new home of the switch.** Neither the hook nor the screen calls the provider's `refresh()`: not after a failed `update`, not when `/settings/ai` opens with a failed first read (then the switch reads OFF, with no uses and no hint). The legacy card has the same rule, so no regression, and the server enforces consent whatever the screen says. A `refresh()` on mount and after a failed change would make the screen true to the server in both directions.

**n3. The consent's buttons live in the scrolling body, not in the Tray's pinned `footer`.** The board pins them to the bottom of the card. From the code (`Tray.tsx` wraps children in a `ScrollView` and draws `footer` after it) on a short phone the long Thai what-line pushes `เปิดใช้` below the fold until the person scrolls; `AiConsentContent` is built to be reused inside another tray's step, so this may be a deliberate choice. I did not render it on a phone; E2-P3-A will show it.

**n4. The read-only tray keeps the question heading.** สิ่งที่ AI เห็น shows "ให้บันช่วยอ่านและตอบด้วย AI ไหม?" with no answers to give, to a person who has already said yes. The plan says "the same lines", so this is a wording call for E2.

**n5. Two tones for one failure on one screen.** The tray's failure line ends "เมื่อต่อเน็ต", the turn-off line reused from the catalog ends "เมื่อออนไลน์นะ" (`th.json` `redesignCompanionChangeFailed`). Both are the plan's or today's words.

**n6. The receipt still says "Not pushed".** The PR exists; harmless.

## Notes for later tasks

- **P3-T21 and P3-T24 (m1).** The Home note, wallet and legacy `BunNote`, must read `useDailyNoteSetting()` before any `resources.note` call, and `bunai` should not be approved before every note path does.
- **P3-T24 and Q6.** This task changes the consent's words while `AI_NOTICE_VERSION` stays 1. Two wordings now share notice 1: the wallet tray (names wallet and merchant names, notes, a slip's printed names and digits, the kept receipt) and `AiConsentSheet.tsx:33-41` (names wallets, categories and totals; no merchants, notes or slip text; "slip images are never kept"), which Tell Bun and Ask Bun still open until P3-T18 and P3-T20. B8 is met only for the tray. P3-T24 must replace the sheet's promises (the receipt already says so) and bump the notice in the same change, so a person who agreed to the narrower wording is asked again.
- **P3-T15, P3-T16, P3-T17 (B3).** Settle the "ไม่เก็บรูปสลิป" words with counsel before the attach step ships, while Q1's default (no native decoder) keeps a slip attached without asking Bun.
- **P6B-T15.** Decide the companion gate (m2) while the rollout goes inside `useBunAiArea()`.
- **Any later consent step in a tray (P3-T15, P3-T17).** Reuse `AiConsentContent` with an `onDetails` that closes its own tray first, as `AiConsentTray` does, and keep the reset of the details flag (X1).
- **Probe files.** `scratch/p3-t14-second/probe-main.render.test.tsx` (X1 to X4), `probe-companion-off.render.test.tsx`, `my-mutants.py` and `my-mutants-probe.py` (the latter runs the probe file, which must first be copied into the scratch tree's `src/wallet/bunai/`) are in the scratch folder for a fix round; nothing of mine is in the worktree, and the scratch tree is a clean extraction of `1247404f` again.

VERDICT: Approved
