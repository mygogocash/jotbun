# Brief P6A-T2: The widget snapshot

You are the implementer for plan P6A, Task P6A-T2. You add:
- the widget snapshot, `widgetSnapshot.ts`: pure functions that turn Home's facts into three timed entries of display-ready faces for the home-screen and lock-screen widgets;
- the outside draft copy, `outsideCopy.draft.ts`, and its two readers, `useOutsideCopy.ts`;
- two day and month name functions in the shared `dateStep.ts`.

It is pure TypeScript with Node tests. No screen, route, catalogue, package or native code changes.

The planner wrote every file and proved them in a scratch copy of `7a29bc70`: RED on typed stubs (20 failures, all assertions), GREEN, 51 of 51 mutants killed, and the fast local gate. The head is now `88f14203`; its three newer commits change only `.claude/`. You copy the files from the planner's kit. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Two of its notes apply:
   - R87: your receipt is its own file, `docs/implementation/receipts/P6A-T2.md`.
   - R100: CI runs the whole suites; you run only the fast gate below.
2. The plan task, in `docs/superpowers/plans/2026-10-25-jotbun-p6a-outside-the-app.md`:
   - `### Task P6A-T2` (lines 151 to 215);
   - its Global Constraints (lines 46 to 61);
   - the calls X2 and X3 (lines 17 and 18) and owner question Q9 (line 38);
   - the Review Focus (lines 63 to 70).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p6a-t2` (branch `p6a/t2-widget-snapshot`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t2`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p6a-t2-planner`, the planner's kit. Read it and copy from it; never write into it. It holds:
  - `real/`: the final version of every file this task changes, at its repo path (8 files, the receipt included);
  - `stubs/`: the three implementation files in their RED form (typed stubs);
  - `orig/`: the two shared files as they are at the head;
  - `diffs/`: one diff per shared file;
  - `p6a-t2.patch`: the whole change, for reading only;
  - `tools/stage.py`, which copies a stage's files into WT and checks them;
  - `tools/mutants.py`, the mutant runner;
  - `SHA256SUMS`, `SHA256SUMS.base` (the head's copies of the shared files and of every module the new code builds on), and the planner's logs in `logs/`.
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for those full paths: type them out.
- Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`.
- This task needs no heavy lock: no database suite and no workers pool.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.
- **Load flakes:** the machine is shared. A test that times out in a file this task does not touch is a load flake: rerun that file alone once and record both runs.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/outside/widgetSnapshot.ts` | **new.** `WidgetFacts`, `WidgetFace`, `WidgetLinks`, `WidgetLabels`, `WidgetEntry`, `WidgetSnapshot`, `WidgetFamily`; `buildWidgetSnapshot(facts, links, t, spoken)`, `signedOutSnapshot(now, links, t)`, `entryAt(snapshot, nowMs)`, `faceFor(entry, family)`, `nextBangkokMidnight(nowMs)`, `sameSnapshot(a, b)`. These are exactly the plan's interface. |
| `apps/app/src/wallet/outside/outsideCopy.draft.ts` | **new.** `OUTSIDE_DRAFT`: the plan's 21 `outside.*` lines, `{ th, en }`, `as const satisfies DraftTable`. Later P6A tasks add lines here. |
| `apps/app/src/wallet/outside/useOutsideCopy.ts` | **new.** `useOutsideCopy(): WalletT` (`useDraftCopy(OUTSIDE_DRAFT)`) and `outsideT(locale): WalletT` (`tableT(OUTSIDE_DRAFT, locale)`). |
| `apps/app/src/wallet/outside/widgetSnapshot.test.ts` | **new.** 17 cases: the plan's 16 and the planner's month case (ruling P5). |
| `apps/app/src/wallet/outside/outsideCopy.test.ts` | **new.** 1 case: P2-T3's checks over `OUTSIDE_DRAFT`. |
| `apps/app/src/ui/dateStep.ts` | **shared** (P2-T31 added `monthShortLabel` and `shortDateLabel` last). 32 lines appended after `shortDateLabel` (lines 222 to 253): a private `monthIndex`, then `export function monthName(month: string, locale: DateLocale, form: 'short' \| 'long'): string` and `export function shortDayName(date: string, locale: DateLocale): string`. Nothing above them changes. |
| `apps/app/src/ui/dateStep.test.ts` | **shared.** Line 4's import gains `monthName` (after `monthLabel`) and `shortDayName` (after `shortDateLabel`). Two cases appended: `monthName gives short and long names in Thai and English` and `shortDayName gives ส. 24 and Sat 24`. |
| `docs/implementation/receipts/P6A-T2.md` | **new.** Your receipt (R87), copied from `PL/real/`. |

Not in this task:
- any screen, route, catalogue section or `index.ts`;
- `en.json`, `th.json` and the catalogs: the lines are drafts until P6A-T13;
- `featureFlags.ts`: the `outside` area is P6A-T3a's;
- the bridge that writes the snapshot (P6A-T3a);
- any package or native code (P6A-T7 and later);
- `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready.**
  - Its "Starts after" tasks are merged: P2-T3 (`wallet/copy/draftText.ts`, `useDraftCopy.ts`, `wallet/common/copy.ts`) and P2-T10 (`wallet/money/walletMoney.ts`, receipt `docs/implementation/receipts/P2-T10.md`).
  - It needs no package, Cloudflare resource, owner decision or account setting: pure functions and draft copy, and nothing native.
  - The base is `7a29bc70`. That is `9e72d8b4` plus one controller-state commit (`handover.md` only), and the three commits up to `88f14203` change only `.claude/`. No file outside `.claude/` changed, and `SHA256SUMS.base` matches the head. The planner's dry run of Steps 1 to 6 on a fresh copy of `88f14203` met every Expected line (`logs/dryrun-1.log`, `logs/dryrun-2.log`).
  - **Followups:** no note in `followups.md` names P6A-T2. One P2-T10 note reads "P6A widget: wait for `ready` before writing `hidden`". That belongs to the bridge, which reads private mode; this task takes `hidden` as a given fact and has no React. The receipt carries the note to P6A-T3a (ruling P19).
  - **Work in flight:** none shares a file with this task. P2-T16 (the add tray) and 1D-T11 (edge) touch nothing here. P3-T14 edits `AccountRoutes.render.test.tsx`, which this gate only runs, so the gate expects 4 files passed and states no case count.
- **P2. The day words.**
  - X2 says `th` reads the Thai lines and words, and `en` and `vi` the English ones. So `vi` faces read `Sat 24` and `Oct budget`.
  - `shortDayName` and `monthName` still accept every `DateLocale`. Vietnamese gets its own words there, as `dayLabel` already does: `T7, 24`, and `thg 10` or `tháng 10`.
  - Thai shortens the weekday as Thai calendars do, with a full stop: `ส. 24` (ox-widget-lock) and `อา. 25` (the plan).
- **P3. The shared `dateStep.ts`, added to and never reordered.**
  - The three functions go after P2-T31's `shortDateLabel`.
  - `monthIndex` repeats `monthShortLabel`'s exact check, error message included. `monthShortLabel` is untouched, so P2-T31's lines and tests do not move.
  - The test file's import line takes the two names in its alphabetical order, and the two cases go at the end.
- **P4. Each face works out its budget figures for its own day.**
  - The figures come from the pace's limit and estimated spending (budgetPace's confirmed plus waiting). Over is `limit − estimated < 0`, by `estimated − limit`. Otherwise the figure is `(limit − estimated) ÷ the days left in the month from that day, today included`, rounded down in BigInt. The days left come from `daysInMonth` and `daysBetween` in `spend/v1/redesign/shared.ts`, budgetPace's own formula.
  - For entry 0 this equals the plan's `perDayText(perDayMinor)` and `overByMinor` whenever Home's pace is for today: the same BigInt sums. For entry 1 it equals the plan's `leftMinor ÷ (daysLeft − 1)`.
  - The plan's literal form could go wrong on a pace from another day. `daysLeft − 1` is 0 on a pace from a later day, and BigInt throws on division by zero. On a pace from an earlier day, today's face would repeat an earlier day's figure under a new day's name. This form can do neither.
  - The plan's midnight mutant is P2 here: tomorrow's faces worked out on today's day. It is killed by the midnight case (`≈ ฿580`).
- **P5. A pace for another month draws no budget figures, in any entry.**
  - Picture 00:30 on the 1st, before Home's model moves to the new month: the widget shows no October figure under November's day (Review Focus 2).
  - The new case `a pace for another month draws no budget figures, so the 1st never shows last month's` pins it. The plan's month-end mutant (P4) is killed by both month cases.
- **P6. A limit of zero draws no budget figures.**
  - `budgets.ts` never accepts one (its `POSITIVE` check), but `budgetPace` does not check, and the gauge divides by the limit. A `RangeError` thrown in Home's bridge would be worse than a face without a gauge.
  - Pinned inside the no-budget case (mutant W14).
- **P7. What a masked face keeps (D41, B21, R114).**
  - It keeps its day, its words, its count and `over`: the plan's "keeps the side labels", and ox-widget-lock's masked `เหลือวันนี้ ฿••••`.
  - It shows `฿••••` (`HIDDEN_AMOUNT`) for `out` and the side value, and has no gauge figure.
  - It says only `outside.spokenHidden` and `outside.spokenGaugeHidden`, whatever the budget.
  - Nothing the person wrote (a note, a payee, a category or wallet name) is ever in the snapshot, so masking the amounts hides everything private (R114). The B21 and private-mode cases check the faces' JSON for every amount the month holds.
- **P8. The gauge's one number.**
  - The percent is `estimated × 100 ÷ limit`, rounded down in BigInt. It passes 100 when over (`102%`).
  - The fraction is `Number(thousandths capped at 1000n) / 1000`. That is the only `Number()` in the module, over a BigInt already capped at 1000, never money. `planning/budgetModel.ts` builds its `spentPermille` the same way.
- **P9. The copy.**
  - The Thai is the plan's, letter for letter. `outside.noBudget`, `outside.stale`, `outside.signedOut` and `outside.widgetName` are the plan's drafts.
  - Every English line is a draft for E2. The plan fixes only `Spent today`, `{count} records` and `{month} budget`.
  - `outside.record` reuses `add.titleExpense`'s `Add spending`; `outside.scan` reuses the app's `Scan a slip`.
  - The English today line ends with a full stop, because the left or over line follows it in one VoiceOver label.
  - `{count} records` reads `1 records` for one record, as P2-T31's `insights.entries` does. A singular form is an E2 copy item: Thai needs none.
- **P10. The two readers.**
  - `useOutsideCopy()` is `useDraftCopy(OUTSIDE_DRAFT)`. That is the plan's `tableT(OUTSIDE_DRAFT, useActiveLocale())`, kept stable across renders by P2-T3's `useCallback`, so P6A-T3a can put it in an effect's dependencies. `outsideT(locale)` is `tableT(OUTSIDE_DRAFT, locale)`.
  - Neither has its own test. The file imports P2-T3's hook (React and the `@mobile` alias), which Node cannot load (the planner checked: the import fails in Node). `widgetSnapshot.test.ts` reads the same table through `tableT`, and typecheck covers both. P6A-T3a's render tests are the first to run the hook.
- **P11. The copy test.**
  - `outsideCopy.draft.ts` is not named `copy.ts`, so `draftText.test.ts` never reaches it. `outsideCopy.test.ts` runs the same checks over it: Thai and English, the same placeholders, Thai letters except the two Latin lines `outside.about` and `outside.percent`, no emoji, no U+2013 or U+2014, and an `outside.` key.
  - It checks this task's 21 keys as a subset, so P6A-T4 and later tasks add lines without editing the list. Keys stay unique across tables because no other table uses the `outside.` prefix.
- **P12. The links are written by name** (`record`, `today`, `scan`), as P6A-T1's account file is, so nothing else the object carries reaches the app group (mutant W31).
- **P13. `faceFor`** gives the home face to the families named `system…` and the lock face to every other. A family added later gets the more masked face.
- **P14. `entryAt`** reads the entries oldest first, as both builders write them. An empty list cannot come from either builder.
- **P15. `sameSnapshot`** compares the JSON of both snapshots with `entries[0].from` set to 0. Both come from the same builders, so equal snapshots have equal key orders, and a snapshot read back from the app group keeps its order.
- **P16. Tests beyond the plan's named cases.**
  - The planner's month case (P5).
  - Assertions inside the named cases:
    - the English home face and its spoken lines;
    - spent exactly to the limit (`≈ ฿0`, not over, `100%`);
    - a zero limit (P6);
    - the masked face's day;
    - tomorrow's lock face;
    - the last day's own figure (`≈ ฿4,640`);
    - `entryAt`'s boundaries;
    - the stale entry's start;
    - the links copied by name.
  - The test helper `build()` turns any throw into `assert.fail`, so a mutant that crashes fails on an assertion.
- **P17. What the snapshot holds while the diary is locked** (the controller's question).
  - With the Face ID lock on (`lockOn`), every lock-screen face in every entry is masked, as P7 describes.
  - The home faces follow private mode alone (D41). Masking them whenever the lock is on is the owner's call (Q9). P6A-T8 marks home amounts privacy-sensitive, so a locked phone's StandBy and Today View redact them.
  - While the app itself is locked (`LockGate` showing), Home is not mounted, so P6A-T3a writes nothing new. The last snapshot stays, already masked on the lock face, because the bridge reads the lock again on focus and on every `AppState` change.
  - After the second Bangkok midnight with no new write, the widgets show the stale prompt and no figures. Signed out, or with the `outside` area off, they show `signedOutSnapshot`: one prompt and no figures.
- **P18. The gate is R100's fast gate for an app change with no route, entry, config, screen or catalogue change:**
  - `typecheck:app`;
  - the three focused Node files, RED to GREEN;
  - `test:app`;
  - `test:unit` (with the Hermes guard and `draftText.test.ts`);
  - `git diff --check`;
  - the four routes tests, because route screens load `dateStep.ts` (`HomeScreen`, `InsightsScreen`, `WalletsScreen`, `BudgetScreen`, `PrivacyScreen` among 28 importers). The change adds no import, but a routes test is the cheap proof that those screens still load.
  - No `typecheck:routes`, `export:web` or kit render files. The full render suite and the rest are CI's.
- **P19. Notes carried to later tasks** (in the receipt):
  - P6A-T3a must build the facts for `now`'s Bangkok day: `WidgetFacts` has no day of its own. It must also wait for private mode's `ready`.
  - `outsideT` cannot load in a Node test (P6A-T3b).
  - P6A-T4 adds lines to `outsideCopy.draft.ts`.
  - E2 items for P6A-T13.
- **P20. Size M:** one 247-line pure module with money and privacy rules, 17 cases, 51 mutants. The reviewers should be Opus and a second reviewer: the snapshot leaves the app, so the B21 masking and the money text are the review's focus.

---

## Step 1: Sync, install and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a fast-forward.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it as your head. The kit's base is `7a29bc70`; `88f14203` and any later head that passes step 5 below are fine.
3. `mkdir -p S`.
4. If `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund`. Expected: exit 0.
5. `cd WT && shasum -a 256 -c PL/SHA256SUMS.base`. Expected: 10 lines, each ending `: OK`: the two shared files and the eight modules the new code builds on. If any line says `FAILED`, report BLOCKED with the output: the planner must rebase.
6. `python3 -I PL/tools/stage.py WT verify base`. Expected: the five new files `OK (absent)`, the two shared files `OK (orig/)`, and the last line `base: 7 of 7 OK`.

## Step 2: RED (plan Steps 1 and 2)

1. `python3 -I PL/tools/stage.py WT red`. It copies the three test files and `useOutsideCopy.ts` from `PL/real/`, and `widgetSnapshot.ts`, `outsideCopy.draft.ts` and `dateStep.ts` from `PL/stubs/`. Expected: 7 `copied` lines.
2. `python3 -I PL/tools/stage.py WT verify red`. Expected: last line `red: 7 of 7 OK`.
3. The stubs, for reference:
   - `stubs/.../widgetSnapshot.ts` has the real file's exported types. Its functions answer `{ v: 1, links, labels: { record: '', scan: '', log: '' }, entries: [] }`, `snapshot.entries[0]`, `null`, `0` and `false`.
   - `stubs/.../outsideCopy.draft.ts` is `export const OUTSIDE_DRAFT = {} as const satisfies DraftTable;`.
   - `stubs/.../dateStep.ts` is the head's file plus `monthName` and `shortDayName` returning `''`.
4. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: `0`.
5. `cd WT/apps/app && node scripts/test-unit.mjs src/wallet/outside/widgetSnapshot.test.ts src/wallet/outside/outsideCopy.test.ts src/ui/dateStep.test.ts > S/red-unit.log 2>&1; echo $?`. Expected:
   - `1`, and in the log `ℹ tests 32`, `ℹ pass 12` and `ℹ fail 20`. The 12 passing are `dateStep.test.ts`'s existing cases.
   - `grep -c "AssertionError \[ERR_ASSERTION\]" S/red-unit.log` prints `20`.
   - `grep -cE "TypeError|ReferenceError|SyntaxError|RangeError|ERR_MODULE_NOT_FOUND" S/red-unit.log` prints `0`.
   - The 20 failing cases, each on its first assertion:
     - `monthName gives short and long names in Thai and English`: strictly deep-equal (`[ '', '' ]` against `[ 'ต.ค.', 'ตุลาคม' ]`).
     - `shortDayName gives ส. 24 and Sat 24`: strictly deep-equal.
     - `every outside line has Thai and English with the same placeholders, no emoji and no dash punctuation, under an outside. key`: strictly deep-equal (the 21 keys missing).
     - `no entry 0`, from the asserting lookup: `the home face reads as ox-widget-home`, `with the Face ID lock on, the lock face holds no amount, private mode or not`, `private mode masks both faces and keeps the count`, `over budget says เกินงบไป ฿420 and, masked, keeps the words`, `no budget has no side line and no gauge figure`, `each face names its day`, `on the month's last evening the next entry drops the budget figures`, `a pace for another month draws no budget figures, so the 1st never shows last month's`, `entryAt picks the newest started entry, else the first`, `faceFor gives system families the home face and accessory families the lock face` and `Vietnamese reads the English lines`.
     - `after midnight the widget shows a new day with nothing logged`: `no entry 1`.
     - `the second midnight asks to open Jotbun`: strictly equal (0 entries, not 3).
     - `nextBangkokMidnight is the next 00:00 in Bangkok, strictly after now`: strictly equal.
     - `a signed-out snapshot has no figures`: strictly deep-equal.
     - `sameSnapshot ignores only the first entry's time`: strictly equal (`false`, not `true`).
     - `both snapshots carry the link words in the person's language`: `th`.
   - Compare with `PL/logs/red-unit.log`.

## Step 3: GREEN (plan Steps 3 and 4)

1. `python3 -I PL/tools/stage.py WT green`. Expected: 7 `copied` lines, every source under `real/`.
2. `python3 -I PL/tools/stage.py WT verify green`. Expected: last line `green: 7 of 7 OK`.
3. The code, for reference: read `PL/real/apps/app/src/wallet/outside/widgetSnapshot.ts` and the tail of `PL/real/apps/app/src/ui/dateStep.ts` (lines 222 to 253) before writing the receipt. `PL/p6a-t2.patch` shows the whole change. In short:
   - `buildWidgetSnapshot` makes three entries: `[0]` from `now`; `[1]` from `nextBangkokMidnight(now)`, with count 0 and `'0'` out; `[2]` from the midnight after, `kind: 'stale'`, with no faces and the prompt `outside.stale`.
   - Each of the first two entries has `home` (masked when `hidden`) and `lock` (masked when `hidden || lockOn`).
   - The budget figures come from `budgetOn(pace, day)`: null unless the pace has a positive limit and its month is the face's month.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: `0`.
5. `cd WT/apps/app && node scripts/test-unit.mjs src/wallet/outside/widgetSnapshot.test.ts src/wallet/outside/outsideCopy.test.ts src/ui/dateStep.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: `0`, with `ℹ tests 32`, `ℹ pass 32` and `ℹ fail 0`. This is the plan's Step 4, with `dateStep.test.ts` whole.

## Step 4: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It takes about a minute. Expected: `0`. The last line of `S/mutants.out` is `51 killed, 0 not killed, of 51`, and `grep -c " KILLED: " S/mutants.out` prints `51`. Every line ends `restored sha256 equal`.
   - The runner applies each mutant alone and runs the three focused files. It counts a mutant killed only when every failing case fails on an `AssertionError` and the cases named for it are among them. Then it restores the file and checks its sha256.
   - The plan's five mutants:
     - P1: the lock face masked only in private mode.
     - P2: tomorrow's faces worked out on today's day.
     - P3: VoiceOver handed the per-day satang.
     - P4: the budget figures kept across a month end.
     - P5: the link words in Thai whatever the language.
   - The rest: W1 to W31 (masking, the side line and gauge, VoiceOver, the entries and helpers), D1 to D9 (`dateStep.ts`), C1 to C6 (the copy checks).
2. `diff S/mutants.out PL/logs/mutants.out`. Expected: no output. The lines print repo-relative paths, so they match the planner's byte for byte.
3. `python3 -I PL/tools/stage.py WT verify green`. Expected: `green: 7 of 7 OK`, so every mutant was restored.

## Step 5: Fast local gate (R100)

From WT, each with its log in S:

1. `typecheck:app`: Step 3.4 counts. The files have not changed since (Step 4.3).
2. The three focused files: Step 2.5 (RED) and Step 3.5 (GREEN).
3. `cd WT && npm run test:app > S/gate-test-app.log 2>&1; echo $?`. Expected: `0`, with `ℹ fail 0` in the log.
4. `cd WT && npm run test:unit > S/gate-test-unit.log 2>&1; echo $?`. Expected: `0`, with `ℹ fail 0`. Also `grep -c "✔ no app code reaches for the Web Crypto global, which Hermes lacks" S/gate-test-unit.log` prints `1` (the Hermes guard), and `grep -c "✔ every draft line has Thai and English, with the same placeholders" S/gate-test-unit.log` prints `1`.
5. The four routes tests:
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/gate-routes.log 2>&1; echo $?
   ```
   Expected: `0`, with `Test Files  4 passed (4)`, and `grep -c "failed" S/gate-routes.log` prints `0`.
6. `/usr/bin/git -C WT diff --check`. Expected: no output.
7. Not run locally, and why (put this in the receipt). CI runs these on the PR (R100):
   - the full render suite and sections 1 to 3;
   - `export:web` and the iOS export;
   - `test:edge:workers`;
   - the database suites;
   - `test:ops`.
   Also not run: `typecheck:routes`, `export:web` and the kit render files, since no route, app entry, config, screen or catalogue changed; and device checks, since nothing native draws the snapshot until P6A-T8.

## Step 6: Receipt

1. `mkdir -p WT/docs/implementation/receipts && cp PL/real/docs/implementation/receipts/P6A-T2.md WT/docs/implementation/receipts/P6A-T2.md`.
2. If your head from Step 1.2 is not `7a29bc70`, put it in the receipt's one mention of the base: `sed -i '' 's/from `7a29bc70`/from `<your head>`/' WT/docs/implementation/receipts/P6A-T2.md`, with your short SHA in place of `<your head>`. Then `grep -c "<your head>" WT/docs/implementation/receipts/P6A-T2.md` must print `1`.
3. Read the receipt through. Every number in it is the planner's: RED `ℹ tests 32`, `ℹ pass 12`, `ℹ fail 20`; GREEN 32 of 32; 51 of 51 mutants. Your Steps 2 to 5 must have matched them. If anything differed, you stopped at it and reported BLOCKED.

## Step 7: Commit

1. Stage the files:
   ```bash
   /usr/bin/git -C WT add apps/app/src/wallet/outside/widgetSnapshot.ts apps/app/src/wallet/outside/outsideCopy.draft.ts apps/app/src/wallet/outside/useOutsideCopy.ts apps/app/src/wallet/outside/widgetSnapshot.test.ts apps/app/src/wallet/outside/outsideCopy.test.ts apps/app/src/ui/dateStep.ts apps/app/src/ui/dateStep.test.ts docs/implementation/receipts/P6A-T2.md
   ```
2. `/usr/bin/git -C WT status --short`. Expected: exactly these eight, staged (`A ` for the six new files, `M ` for the two `dateStep` files). Nothing else: no log and no `node_modules`.
3. Write the message to `S/commit-message.txt`:
   ```
   Add the widget snapshot: display-ready faces, a lock face without amounts and entries that roll over at Bangkok midnight

   widgetSnapshot.ts turns Home's facts into three timed entries of faces a
   widget only draws: now, the next Bangkok midnight with nothing logged,
   and a prompt to open Jotbun after the midnight after. Private mode masks
   both faces and the Face ID lock masks the lock-screen faces; money is
   the wallet's text over BigInt satang. The outside lines are drafts in
   outsideCopy.draft.ts, read through useOutsideCopy, and dateStep.ts gains
   monthName and shortDayName.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`.
5. `/usr/bin/git -C WT show --stat HEAD`. Expected: 8 files changed.
6. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output.

## Your final message

Follow the protocol's format:
- `STATUS: DONE`, or `STATUS: BLOCKED` with the exact blocker, on the first line.
- The commit SHA, the branch, and the 8 files.
- RED (32 tests, 12 pass, 20 fail, all `AssertionError`) and GREEN (32 of 32).
- Mutants: 51 of 51 killed, `diff` against the planner's output empty.
- Each gate command with its result. What is CI's or SKIPPED, and why.
- Deviations: the rulings, P4 to P6 above all.
- What the reviewer should look at first:
  - the lock face's masking and the B21 case (Review Focus 1);
  - the midnight and month-end entries (Review Focus 2);
  - `Number()` only on the capped fraction (P8);
  - the `dateStep.ts` additions, appended and never reordered.
