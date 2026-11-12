# P6A-T2 review: the widget snapshot

- **Reviewer:** Claude Opus 5.5, independent and read-only. Nothing was edited, committed or pushed in any worktree or in the main checkout.
  - At my last full check, `git status` in the task worktree was empty and HEAD was `cf538e69`.
  - The controller's `promote_pr.sh P6A-T2 441` (started 21:06:11) then removed the worktree. One check caught the removal mid-way (` D CHANGELOG.md`), and by 21:06:20 the folder was gone.
  - None of my commands write there: every probe and mutant ran in my scratch tree. `cf538e69` is still PR #441's head and `origin/p6a/t2-widget-snapshot`.
  - PR #441 showed `MERGED` when this review was finished, so the fix cases below would go in a follow-up.
  - Every run had already finished, but the scratch tree's `node_modules` links pointed into that worktree and now dangle. A rerun there needs relinking from a live worktree.
- **Reviewed:** `cf538e69` on `p6a/t2-widget-snapshot`, PR #441, range `origin/claude/p1a-vault-core...cf538e69`. It is one commit on `c7f947c5`, with 8 files, exactly the brief's Scope: 7 code and test files and the receipt. Since then the integration head has moved to `e6ae87ff`, but only through one controller-state sync, with no code in it (`git diff --stat c7f947c5 origin/claude/p1a-vault-core -- apps packages docs/superpowers` is empty).
- **Spec:**
  - The plan `2026-10-25-jotbun-p6a-outside-the-app.md`: Task P6A-T2 (line 151), its Global Constraints (lines 46 to 61), X2, X3, Q9 and the Review Focus (lines 63 to 70).
  - B21 (`2026-10-25-jotbun-phases-3-6-boundaries.md:173`), D41 and §6.13 (`specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md:95`, `:669`).
  - The brief `briefs/P6A-T2.md` (rulings P1 to P20), the planner's kit (`scratch/p6a-t2-planner`) and the implementer's logs (`scratch/p6a-t2`).
- **Scratch:** `.claude/controller/scratch/p6a-t2-review/`. It holds:
  - `tree/`: `git archive cf538e69` with `.claude/` removed, and `node_modules` linked entry by entry from the worktree with the planner's `linkfarm.sh` (workspace links point into the tree).
  - `probes/`: my probe files. They also sit in `tree/apps/app/review-probes/`, which is scratch only.
  - `tools/`: `review_mutants.py` (my mutants) and `ci_counts.py`.
  - `logs/`: every run below and the nine CI job logs; `planner-sample.out`, `review-mutants.out` and `review-mutants-fixprobes.out` at the scratch root.

**Summary.** The money and privacy paths hold:
- **No lock face holds a figure while the Face ID lock is on.** Probe A1 checked 25,164 lock faces in 12,582 snapshots, built with the real `spokenMoney`:
  - 8 instants, with 26 paces each (51 on 1 November, with October's too);
  - 3 amounts today, 3 counts and 3 locales;
  - private mode on and off.

  Every digit in every field is the day of the month or the count.
- **Private mode leaves no amount anywhere in the snapshot,** as §6.13 asks (probe D, every field, 36 snapshots).
- **The entries roll over at Bangkok midnight.** Probe B1 covered 20,018 instants, the millisecond either side of six midnights among them. P4's per-day figure equals `budgetPace`'s own on 1,192 day and spend pairs (probe B2).
- **Money is exact.** The only `Number()` is the capped gauge fraction (P8). The figures stay exact past 2^53 satang, and drawn and spoken amounts agree to the satang.
- **`dateStep.ts` lines 1 to 221 are byte-identical to the base;** the three functions are appended after them.

Other checks:
- Every Thai line matches the plan byte for byte (21 of 21), and so do the plan's three fixed English lines.
- The code files are byte-identical to the planner's `real/`; the receipt differs only in its base SHA.
- I reran 10 of the 51 planner mutants and all 10 died by assertion, line for line as the implementer recorded.
- CI passes 9 of 9 jobs on `cf538e69`.

I found no blocker and no major. Two minors and one nit, all test gaps where the code is right:
- **m1:** no case has a waiting draft, so nothing pins that the budget figures count estimated spending (P4).
- **m2:** no case has satang, and the spoken fake drops them, so nothing pins the wallet's exact money text for today's spending and the over figure.
- **n1:** the signed-out entry's day is never checked at an hour when the UTC and Bangkok dates differ.

`probes/fixProbes.probe.ts` passes on the real code and kills every survivor by assertion. It is written in `widgetSnapshot.test.ts`'s style, so it can be lifted in as it is.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. No case pins that the budget figures count waiting drafts (ruling P4: "budgetPace's confirmed plus waiting").**
- **The code is right.** `widgetSnapshot.ts:104` takes `pace.spent.estimatedMinor`, which is budgetPace's confirmed plus waiting, with checking drafts never added (`budgetPace.ts:117`).
- **No case holds it.**
  - Every pace in `widgetSnapshot.test.ts` is built with no outbox (`pace()` at `:28-30`), so `estimatedMinor` always equals `confirmedMinor`.
  - My mutant R3 swaps line 104 to `pace.spent.confirmedMinor`. It survives all 32 cases of the three focused files (`review-mutants.out`).
- **Impact if it regresses:** with spending that has not synced yet, the widget runs ahead of Home. Example: ฿13,360 confirmed plus a ฿500 draft waiting. The widget would say ≈ ฿580 a day and 74%, while budgetPace, which Home draws, gives 51,750 satang a day (≈ ฿517) and 77%. A phone-first diary is often offline, and on the money path the snapshot is meant to match Home (P4).
- **The other direction is unheld too:** R11 adds the drafts being checked, which budgetPace never adds, and it survives as well.
- **Fix:** add case `m1` from `probes/fixProbes.probe.ts`. It builds the pace with one `unsent` ฿500 draft and one `sending` ฿700 draft, then asserts ≈ ฿517, 77% and 0.77 today and ≈ ฿591 tomorrow. It passes on the real code and kills R3 and R11 by assertion (`review-mutants-fixprobes.out`).

**m2. No case draws or says satang, so nothing pins the wallet's exact money text for today's spending and the over figure (Global Constraints, Money; the plan's "`out` is `walletMoneyText(todayOutMinor)`", "`walletMoneyText(overByMinor)`").**
- **The code is right.** `widgetSnapshot.ts:163` and `:123` use `walletMoneyText`, which keeps satang when they are not zero. `:137` hands VoiceOver the exact `todayOutMinor`. With the real `spokenMoney`, ฿132.50 is drawn `฿132.50` and said `132 บาท 50 สตางค์` (probe C3).
- **No case holds it.**
  - Every amount in the tests is whole baht (`13200`, `1336000`, `1842000`).
  - `spokenFake` (`widgetSnapshot.test.ts:33-40`) answers `BigInt(minor) / 100n`, which drops satang, so no spoken assertion can see them.
- **Three survivors:**
  - R4: today's spending drawn with `perDayText` (whole baht, rounded down).
  - R5: the over figure drawn with `perDayText`.
  - R6: VoiceOver handed today's spending in whole baht.
  - All three survive the focused files.
- **Impact if one regresses:** the widget would read ฿132 for ฿132.50, or VoiceOver would say 132 บาท, while Home shows the satang.
- **Fix:** add case `m2`. It uses `todayOutMinor: '13250'` and spending of `'1842075'`, asserts `฿132.50` and `฿420.75`, and checks that `spoken` was handed `'13250'` and `'42075'`. It kills R4, R5 and R6.

### Nit

**n1. The signed-out entry's day is never checked when the UTC and Bangkok dates differ.**
- `widgetSnapshot.ts:225` correctly uses `bangkokDate(now)`. The only signed-out case uses `NOW` at 20:00 Bangkok, which is the same date in UTC (`widgetSnapshot.test.ts:240-245`), so mutant R1 (`now.toISOString().slice(0, 10)`) survives.
- No face draws that day today, so nothing visible depends on it.
- Case `n1` checks 01:00 on 25 October in Bangkok, which is 24 October in UTC. One line, and it kills R1.
- Entry 0's own day is already held: the same mutant there (R2) dies in the planner's month case.

## The controller's focus, answered

### The lock faces (B21, P17, Q9)

- **With the Face ID lock on, no lock face holds an amount or a gauge figure, in any field.** `widgetSnapshot.ts:201` masks the lock face when `hidden || lockOn`, in entries 0 and 1. Entry 2 has no faces (`:214`).
  - A masked face draws `฿••••` for `out` and the side value (`:163`, `:167`).
  - `gaugeText` and `gaugeFraction` are null (`:170`, `:171`).
  - It says only `outside.spokenHidden` and `outside.spokenGaugeHidden` (`:149-152`, `:172`), so `spoken` is never called for it.
  - Probe A1 confirms this over 25,164 lock faces: the only digits are the day of the month in `dayLabel` and the count. No baht sign, บาท, baht, สตางค์ or satang appears.
- **What a masked lock face still carries,** all as the plan says ("keeps the side labels", "keeps the count", P7):
  - the day (`ส. 24`), the month name (`งบ ต.ค.`) and `masked: true`;
  - today's record count (`3 รายการ`);
  - the side label with `over`, so a locked phone shows `เกินงบไป ฿••••` and `over: true` when the month is over budget (probe A2). A glance tells whether the month is over budget, though never by how much. This is no amount and is within B21. The owner may want to see it, and it is noted for E2 below.
- **Fields outside the lock faces:**
  - With the lock on and private mode off, the same snapshot holds every amount in `entries[0].home` and `entries[1].home`: `out`, `side`, `gaugeText`, `gaugeFraction` and all four spoken lines (`spoken.gauge` gives the percent in words).
  - This is Q9's default: home faces follow private mode only (`:200`).
  - So a native widget could show those amounts if it read `home` for an accessory family. Only `faceFor` (`:239-241`, pinned by its case and W28) keeps them apart. The file has to stay readable on a locked phone for the lock-screen widgets to draw. P6A-T8 must keep that rule; see the notes.
  - Every other field holds no amount: `links`, `labels`, the entries' `from` (milliseconds) and `day` (dates), `kind` and `prompt`.
- **With private mode on, nothing in the snapshot is an amount** (probe D: every field of 36 snapshots, over under budget, at the limit, over budget, no budget and a zero limit, in th, en and vi). This meets §6.13's "In private mode the snapshot carries no amounts".

### The entries (X3, Review Focus 2)

- **Midnight and the month end are Bangkok's.** `nextBangkokMidnight` (`:186-188`) and `bangkokDate` share the fixed UTC+7 offset.
  - **Probe B1:** 20,018 instants: 20,000 seeded ones over 2026 to 2028, and the millisecond before, at and after six Bangkok midnights (an ordinary one, the ends of October 2026 and February 2027, the year end, and either side of 29 February 2028).
    - Entry 0 starts at `now` on `bangkokDate(now)`.
    - Entry 1 starts at the next Bangkok midnight, at most a day later, and its `day` is that date and `stepDate(day0, 1)`.
    - Entry 2 starts exactly 24 hours after entry 1.
    - `entryAt` picks the entry whose day it is, at every boundary and three days past the last.
- **`budgetOn` (`:101-105`):** null with no pace, no limit, a limit that is not positive, or a pace for another month.
  - **P5:** a pace for another month draws no figures in any entry. Examples: October's pace at 00:30 on 1 November (the planner's case); a November pace on 31 October draws nothing on the 31st and November's own figure on the 1st (probe B3).
  - **P6:** zero and negative limits draw nothing and never throw (the test at `:148-150`, probe B3).
- **P4, each face's own day (`daysLeftOn`, `:108-111`, and `sideLine`, `:119-128`):** probe B2 checked every day of October, November and December 2026, February 2027 and February 2028, at 8 spending levels, from zero to past the limit.
  - Entry 0 always equals budgetPace's own `perDayText(perDayMinor)` or `walletMoneyText(overByMinor)`.
  - Entry 1 always equals the plan's literal `left ÷ (daysLeft − 1)`. On the last day it has no figures.
  - The gauge equals the BigInt percent and the capped thousandths.
  - On a pace from an earlier day (the 24th's, read on the 25th), entry 0 shows ≈ ฿662, the 25th's own figure (464000 ÷ 7). The plan's literal form would repeat the 24th's ≈ ฿580 under อา. 25 (probe B3). The ruling holds, and the form never divides by zero.

### Money (§4, P8)

- **Number():** the only `Number()` in `widgetSnapshot.ts` is at `:133`, over thousandths already capped at `1000n`. `Math.floor` at `:187` works on milliseconds. Nothing else converts money.
- **The wallet's money text for every amount:**
  - `out` uses `walletMoneyText` (`:163`), and so does the over figure (`:123`).
  - The left-a-day figure is `perDayText` inside `outside.about` (`:127`).
  - VoiceOver is handed canonical satang strings only (probe C5), and whole baht for the per-day figure (`wholeBaht`, `:114-116`), so it says what the face shows.
- **Exact past 2^53:** probe B4 uses a limit of 900,719,925,474,099,300 satang, month spending of 450,359,962,737,049,651 and 9,007,199,254,740,993 satang today. The face, the per-day figure, the percent and what VoiceOver is handed all match BigInt arithmetic.
- **Not pinned by the tests:** the satang and estimated-spending paths are right but unheld (m1, m2).

### `dateStep.ts`

- **The three functions change nothing above them.**
  - The diff is one hunk, `@@ -219,3 +219,35 @@`, with additions only.
  - The base file has 221 lines, and lines 1 to 221 of the new file are byte-identical to it.
  - `monthIndex` (`:224-229`) repeats `monthShortLabel`'s check and message (`:204-209`); `monthShortLabel` is untouched (ruling P3).
- **`dateStep.test.ts`:** only line 4, the import, differs in the first 133 lines. It gains `monthName` and `shortDayName` in alphabetical order, and the two cases are appended.

## Mutants

- **The planner's, a sample of 10 of the 51, rerun with its runner on my tree** (`planner-sample.out`):
  - The sample: P1 (B21), P2 (midnight), P3 (VoiceOver satang), P4 (month end), W2 and W5 (masking), W10 (spent to the limit), W14 (a zero limit), W25 (UTC−7 midnight) and D1 (`dateStep.ts`).
  - All 10 were killed by assertion in their named cases.
  - All 10 lines are identical to the implementer's `scratch/p6a-t2/mutants.out`, and every file was restored (sha256 equal).
  - The implementer's whole `mutants.out` is byte-identical to the planner's `logs/mutants.out`: 51 of 51.
- **My own, for guards no listed mutant touches** (`tools/review_mutants.py`, `review-mutants.out`, all restored):

| Id | Mutant | Focused files (32 cases) | With the fix probes |
| --- | --- | --- | --- |
| R1 | the signed-out entry dated by the UTC calendar | survived (n1) | killed |
| R2 | entry 0's day by the UTC calendar | killed (the planner's month case) | |
| R3 | the budget figures from confirmed spending only | survived (m1) | killed |
| R4 | today's spending drawn in whole baht (`perDayText`) | survived (m2) | killed |
| R5 | the over figure drawn in whole baht | survived (m2) | killed |
| R6 | VoiceOver handed today's spending in whole baht | survived (m2) | killed |
| R7 | tomorrow's lock face masked by private mode only | killed (B21 case) | |
| R8 | a masked face drops `over` | killed (over case) | |
| R9 | VoiceOver's per-day figure rounded up | killed (midnight case) | |
| R10 | a masked face shows how far over | killed (over case) | |
| R11 | the budget figures add the drafts being checked too | survived (m1) | killed |

## Probes (all pass on the real code; `logs/probes.log`, 15 cases)

- **A1, A2** (`probes/lockFaces.probe.ts`): lock faces across instants, paces, locales and both private-mode states; which fields hold amounts with the lock on.
- **B1 to B4** (`probes/entries.probe.ts`): the entries' days and starts; P4 against budgetPace on every day of five months; paces from other days and months; amounts past 2^53.
- **C1 to C5** (`probes/sameAndMoney.probe.ts`):
  - `sameSnapshot` over a JSON round trip (the read-back is the same snapshot); private mode, the lock, the language and one satang each count as a change; 16:59:59.999 is the same snapshot, 17:00 is not.
  - The signed-out day across the UTC date line.
  - Satang drawn and said alike.
  - The faces carry exactly the plan's keys.
  - `spoken` is handed only canonical satang strings.
- **D** (`probes/privateWhole.probe.ts`): private mode leaves no amount in any field.
- **m1, m2, n1** (`probes/fixProbes.probe.ts`): the fix cases above.

## The plan, the brief and the protocol

- **Interface:** every type and function in the plan's Produces block is exported with the plan's signature. The faces carry exactly the plan's keys, in its order (probe C4).
  - `useOutsideCopy()` is `useDraftCopy(OUTSIDE_DRAFT)`, the plan's `tableT(OUTSIDE_DRAFT, useActiveLocale())`, made stable by P2-T3's `useCallback` (P10).
  - `outsideT(locale)` is `tableT(OUTSIDE_DRAFT, locale)`.
- **Files:** the plan's 3 new files, its 2 test files and the 2 `dateStep` edits, plus the receipt (R87). No screen, route, catalogue, `en.json`, `th.json` or package change.
- **Purity:** `widgetSnapshot.ts` loads no React or native module. Its one package import, `bangkokDate` from `@gogospend/contracts`, follows `dateStep.ts`'s own `TRACKING_START_MIN`. Nothing is logged.
- **Copy (Global Constraints, Copy):**
  - All 21 Thai lines are byte-identical to the plan's list (line 195), and so are `Spent today`, `{count} records` and `{month} budget`.
  - P9's reuses hold: `add.titleExpense` is `จดรายจ่าย` / `Add spending`, and `en.json` has `Scan a slip`.
  - No file has an emoji, U+2013, U+2014, U+2028 or U+2029. The test's four `\u` escapes are literal in the file.
- **The implementer's run matches the brief's Expected lines:**
  - RED: `ℹ tests 32`, `ℹ pass 12`, `ℹ fail 20`, 20 `AssertionError`s and no other error; the failing names are identical to the planner's.
  - GREEN: 32 of 32.
  - Mutants: 51 of 51.
  - `test:app`: 36 passed. `test:unit`: 1069 passed, with the Hermes guard and P2-T3's draft-line check, 1 each.
  - The four routes tests: 4 files and 15 tests passed.
  - `typecheck:app`: clean.
  - I reran the three focused files in my tree: 32 of 32.
  - `git diff --check origin/claude/p1a-vault-core...cf538e69`: clean.
- **Commit and receipt:**
  - One commit, with the plan's summary line, the brief's body and the `Co-Authored-By: Claude Haiku 5.5` trailer.
  - The receipt is its own file (R87). It records CI's suites and the device checks as SKIPPED until P6A-T8, and its numbers match the logs.

## CI (R100)

Run `43230245880` (`pull_request`, head `cf538e69`) concluded success, with 9 of 9 jobs passing (job logs in `logs/ci-*.log`):

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | `typecheck` (contracts, API), `typecheck:app`, `typecheck:routes`; `test:api` 1000 of 1000 (47 suites); `test:app` 36 of 36; `test:unit` 1069 of 1069; `test:dev` 7 of 7; the API build, the release graph, the parser sandbox and `git diff --check` all passed |
| Exports | `export:web` and `export:ios` |
| Render (every file but the per-section suites) | 125 files, 1599 tests |
| Render, per-section suites (3 jobs) | 228, 246 and 188 passed, which sums to 662: each job runs its third and skips the rest |
| SQL integration and ops | `test:db` 694 of 694 (41 suites); `test:ops` 111 of 111 |
| Edge Worker | `test:edge` 205 (20 files); `test:edge:workers` 804 passed and 1 todo (34 files); `test:edge:db` 12 (3 files) |
| Release image and smoke | built; smoke `ok: true` |

CI's `test:unit` (1069) and `test:app` (36) equal the implementer's local counts. Not run locally (R100):
- every whole suite;
- the database suites (Docker is stopped; CI ran them);
- the routes tests and typechecks, which the implementer ran and CI reran.

## Notes for later tasks

- **P6A-T3a (the bridge):**
  - **Entry 0's facts must be for `now`'s day.** `WidgetFacts` has no day of its own, so entry 0 trusts that `todayCount` and `todayOutMinor` are for `bangkokDate(now)`.
    - The concrete check is Home's `model.today.day` (`DayGroup.day`, `spend/v1/redesign/shared.ts:325`). When it is not `bangkokDate(now)`, skip the write, or build from a fresh model.
    - Otherwise, a Home left open past midnight writes yesterday's count and spending under today's name (Review Focus 2).
    - The budget figures are already safe; another month's pace draws none.
  - **`buildWidgetSnapshot` can throw.**
    - It throws on an amount that is not canonical (formatMinor's `TypeError`) or an invalid `now` (bangkokDate's `RangeError`).
    - Build it inside the bridge's effect and keep the last good snapshot on a throw (Global Constraints, Logging), so Home's render never throws.
  - **Wait for private mode's `ready`** before writing `hidden` (from the receipt).
  - **Lift the fix cases** m1, m2 and n1 into `widgetSnapshot.test.ts` if no fix round does it first.
- **P6A-T3b:** `outsideT` (`useOutsideCopy.ts:14-16`) has no test until then (P10), so a mutant that pins it to Thai would survive today. Assert an English signed-out snapshot's prompt and labels in its render tests.
- **P6A-T8 (the widgets):**
  - **Accessory families must read only `faceFor(entry, family)`, or a native twin with the same rule.** With the lock on and private mode off, the snapshot file still holds every amount in `home` (Q9), and lock-screen widgets need that file readable while the phone is locked. A device check should confirm that an accessory widget with the lock on shows no digit but the day and the count.
  - **Validate a snapshot read from disk before `entryAt`.** On an empty `entries` list it returns `undefined` (P14).
  - **Let the gauge text shrink.** `gaugeText` has no upper bound when over: a ฿1 budget with ฿13,360 spent reads `1336000%`.
- **P6A-T13 and E2 (owner items next to Q9):**
  - **Masked faces still say whether the month is over budget.** They keep `เกินงบไป` and `over: true`, though never by how much (P7, "keeps the side labels"), so a locked phone with the Face ID lock on still tells it. VoiceOver's masked line says neither; for over/under to be private, the label and `over` would go too.
  - **The new month's spoken gauge may be untrue.** A new month's entry, and a face on a pace from another month, say `ยังไม่ได้ตั้งงบ` ("No budget set yet"), even when that month has a budget; the drawn face only says `งบ พ.ย.`. A neutral line would not claim what the widget cannot know. The receipt already lists this E2 item.

VERDICT: Approved
