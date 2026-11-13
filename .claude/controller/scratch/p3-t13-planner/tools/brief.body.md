# Brief P3-T13: The add tray records how each record was made

You are the implementer for plan P3, Task P3-T13. The add tray's save now carries how the entry was made: the record's `source` on the create and on the device entry (`typed`; `tell_bun` from P2's Tell Bun sheet; or an AI draft's own `tell_bun` or `photo`), and the same source in `record_saved` with a `has_photo` flag. A new host call, `useAddTray().applyAiDraft(draft, meta)`, lays an AI draft over the open entry as the sheet's draft is laid (its rows Bun's guesses) and records its origin; each AI draft is then reviewed exactly once through P3-T5's `useDraftReview`: `kept` or `edited` (with its count) when saved, `dropped` when the tray closes unsaved or a new draft replaces it. The legacy Quick add still sends no source (H9). You also carry P3-T5's review m1: a draft tally that throws at once never fails a review. The planner wrote every file below and proved it in a scratch copy of the integration head `2062b89a` with P2-T17's files laid in, which is byte for byte the `apps/app` and `packages` of today's head `4c095ad6` (P2-T17 has since merged unchanged): RED on typed stubs (3 of 17 Node cases and 7 of 38 render cases fail, each on an assertion), GREEN, 48 mutants (all killed, every failing case an `AssertionError`), the focused neighbours, the routes tests, the catalogue's wallet sections and the fast local gate of R100. Do exactly what this brief says.

**This task builds on P2-T17 (the saved moment), merged as #451.** It changes one line of `AddTray.render.test.tsx`, and this brief builds on P2-T17's version of that file. Its other dependencies (P2-T5, P2-T16, P3-T2, P3-T5, 1D-T7) are in the head too. Step 0 checks the head by content.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 5), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P3-T13.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p3-photos-bun-ai.md`, `### Task P3-T13` (lines 653 to 685); H9 and H11 (lines 30 and 32); its Global Constraints (lines 56 to 71); P3-T5 (lines 303 to 351), whose review this task wires; and, for what later calls `applyAiDraft`, P3-T15 (line 773), P3-T17 (line 856) and P3-T18 (line 897).
3. The receipts this task builds on: `docs/implementation/receipts/P2-T16.md` and `P2-T16-fix.md` (the host: the save in flight, private mode, the refused save's line), `P3-T2.md` (`source`), `P3-T5.md` (the review and the tally), `1D-T7.md` (`record_saved` in `finish`), and `P2-T17.md` (the saved moment, whose host reads `onSaved`).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p3-t13` (branch `p3/t13-draft-origin`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t13`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t13-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the 10 files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED form (typed stubs) of `draftOrigin.ts`, `quickAddModel.ts`, `entrySave.ts` and `AddTrayHost.tsx`;
  - `orig/`: the eight existing files this task changes, as the base has them (`AddTray.render.test.tsx` is P2-T17's version, as merged; the other seven are as at `2062b89a` and still at `4c095ad6`);
  - `diffs/`: one diff per changed existing file (named `<path with / as _>.diff`, with repo paths and full blob ids), and `p3-t13.patch` (the whole task, for reading). `logs/applycheck.log` shows the patch turns `orig/` into `real/` byte for byte. The controller's state sync trims the single space on a diff's blank context lines in this page, so apply a diff only from `PL/diffs/`;
  - `tools/`: `files.sh` (the file lists), `stage.sh` and `run.sh` (how the planner staged and ran each stage on its copy), `mutants.py` (the mutant runner), `merge_mutants.py` (joins batch outputs), `first_errors.py` (checks every failing case of a kill is an `AssertionError`), `red_list.py` (the RED list of a log), `diffs.sh`, `diffcheck.sh`, `sums.sh`, `build/` (the Python that wrote `AddTrayHost.tsx`, its stub and the tray's suite from `orig/`), `fill_brief.py` and `brief.body.md` (how this brief was built: every code block in the Appendix is the kit's file byte for byte);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (everything in `logs/`, which the state commits leave out: `base-*`, `red-*`, `green-*`, `gate-*`, `try-*` (the planner's working runs), `mutants.out`, `mutant-batches/`, `mutant-logs/`, `first-errors.out`, `applycheck.log`, `red-render.list`, `red-unit.list`, `npm-ci.log`);
  - outside both sums: `tree/`, the planner's proof copy (the head with P2-T17's files, left at GREEN; its `node_modules` folders were deleted once the kit was ready, to free disk), and `proof/`, a dry run of this brief on a second copy (`proof/dryrun.py` ran the brief's own commands from Steps 0 to 5, git and `npm ci` skipped; `proof/dryrun.log` is its output and `proof/dryrun-s/` its scratch folder: the base counts, both RED lists, GREEN, all four mutant batches with `diff` against `logs/mutants.out` empty, and the gate, each as this brief expects).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- The shell is zsh, which does not split a `$LIST` in a `for` loop: every command below lists its files.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only counts that may differ from this brief's are the base counts U, R, K8, RT, RS and C (Step 1.3), and only as Step 0 says; and a load flake (a case that times out under load in a file this task does not touch: rerun that file alone once and record both runs).
- Every render log may hold one or more `ExperimentalWarning: localStorage is not available` lines: that is Node 26's own warning, at the base too. It is not one of the noise patterns below.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/add/draftOrigin.ts` | **new** (37 lines), pure (a Node test reads it). `DraftOrigin`, `TYPED_ORIGIN`, `draftFieldsOf`, exactly the plan's (P6). |
| `apps/app/src/wallet/add/draftOrigin.test.ts` | **new**, Node (38 lines). The plan's one case. |
| `apps/app/src/spend/v1/redesign/quickAddModel.ts` | **shared**. `buildQuickAdd(draft, { today, tc, source? })`: the source goes last on the create and the device entry, only when given (P5). 202 lines before, 207 after. |
| `apps/app/src/spend/v1/redesign/quickAddModel.test.ts` | **shared**. One case at the end: the plan's. 215 lines before, 233 after. |
| `apps/app/src/screens/redesign/entry/entrySave.ts` | **shared** (P2-T5's; 1D-T7 edited it). `EntryTrack.source: RecordSource`, `EntryTrack.hasPhoto?: boolean`; `save` takes `source?: TransactionSource` and hands it to `buildQuickAdd`; `finish`'s `trackRecordSaved` passes `hasPhoto`. 211 lines before, 217 after. |
| `apps/app/src/screens/redesign/entry/entrySave.render.test.tsx` | **shared**. The probe takes a `source`; one case, the plan's (P12). 296 lines before, 330 after. |
| `apps/app/src/wallet/add/AddTrayHost.tsx` | **shared** (P2-T16's). `AiDraftMeta`; `AddTray` gains `applyAiDraft`; the entry's origin, its reviews and the save's source (P4 to P8). 505 lines before, 596 after. |
| `apps/app/src/wallet/add/AddTray.render.test.tsx` | **shared** (P2-T16's, with P2-T17's one line). Six cases: the plan's five and the lock case (P8, P12), their helpers, and a header paragraph. 1113 lines before, 1374 after. |
| `apps/app/src/spend/v1/ai/draftReview.ts` | **shared** (P3-T5's). The tally call inside `try`/`catch` (followups line 607, m1). 37 lines before, 43 after. |
| `apps/app/src/spend/v1/ai/draftReview.test.ts` | **shared**. One case: "a tally that throws at once never fails the review". 93 lines before, 107 after. |
| `docs/implementation/receipts/P3-T13.md` | **new**. Your receipt (R87). |

Not in this task: `useDraftReview.ts` and `dev/draftTally.ts` (unchanged: m2); `analytics/events.ts` (`trackRecordSaved` already takes `hasPhoto`, and `RecordSource` is already `TransactionSource`); `QuickAddScreen.tsx` (the legacy Quick add sends no source: H9); `addFlow.ts`, `AmountStep.tsx`, `ConfirmStep.tsx` and the other steps; the catalogue (no section); `apps/edge` (followups line 637 is not carried: P9); `en.json` and `th.json` (no copy); any route, the app entry, a package or the lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready.** Starts after P2-T5 (merged; `premium-progress.md`, "P2 Task 5"), P2-T16 (#439, with R117's fix round), P3-T2 (#420), P3-T5 (#418) and 1D-T7 (#444, after two fix rounds): all in the head. It shares one file with P2-T17: `AddTray.render.test.tsx`, whose sections case's last id P2-T17 changed to `bw-saved-toast` (line 1096). The brief was built on P2-T17's `real/` version of that file while P2-T17 was building; P2-T17 has since merged (#451, merge `9cdc1f85`) with that file, and its other 12, exactly as its kit's `real/` has them (checked file by file). Step 0.4 checks the head's copy by content. No package, Cloudflare resource, owner decision or account setting is needed.
- **P2. The proof's base** is `2062b89a` (code `437743e2`, #449's merge, plus controller state; the head when planning began) with P2-T17's 13 `real/` files laid in. P2-T17's kit was intact (`shasum -a 256 -c SHA256SUMS` all OK) and its `orig/` equalled that head. Since then #451 (P2-T17) and #452 (P4-T3, `apps/edge` only) have merged: at `4c095ad6`, the head when this brief was finished, `git diff --stat 2062b89a 4c095ad6 -- apps/app packages` lists exactly P2-T17's 13 files, each equal to its kit's `real/`, so the proof tree's `apps/app` and `packages` are the head's byte for byte. `orig/` holds the eight files this task changes as that base has them.
- **P3. Names and files beyond the plan's list.**
  - a. `draftReview.ts` and `draftReview.test.ts`: P3-T5's review m1 (followups line 607), for "the first importer of `useDraftReview`", which this task is.
  - b. In the host: `AddTray` is written one member per line now that it gains `applyAiDraft`; internal `ApplyAi` (the rule's type), `SHEET_ORIGIN` (the sheet's origin), `settledMinor` (a keypad's amount as Save settles it), `fromSheet` and `applyAi` (the two ways a draft gets its origin), `dropUnsaved` (the dropped review) and an `onApplier` prop on the entry (P4). `fill` now returns what the entry shows, for the review's original (P6).
  - c. `entrySave.render.test.tsx`'s probe gains a `source` prop.
  - d. No catalogue section: the plan names none. The host's three sections (P2-T16's `bw-tray-saving`, `bw-tray-unconfirmed`, `bw-tray-add-large`) still open: Step 3.2's catalogue run.
- **P4. How `applyAiDraft` reaches the entry.** The host keeps the open entry's rule in a ref. The entry hands its latest rule up after every draw (an effect with no dependency list) and hands up null when it goes. Outside a host, `applyAiDraft` does nothing: no entry is open to fill. It fills through the sheet's own `fill` (`applyDraft`; the rows it filled become Bun's guesses; Bun's place for R117; its amount as a fill, R106) and does not move the step: its callers choose one (P3-T17's ใช้ข้อมูลนี้ opens confirm, แก้ไข the amount step). Before the entry has started (its lists loading) it does nothing.
- **P5. The origin, and the source it gives (H9).** Each opening starts at `TYPED_ORIGIN`. P2's sheet gives `{ source: 'tell_bun', review: null }`: the sheet does not say which model read the sentence. `applyAiDraft` gives the meta's source with a review (`original`, `model`, `escalated`). Quick chips and every edit leave the origin as it is (H9: set once, at create; a chip is the person's own logged entry). The save passes the origin's source as the record's `source` (on the create and the device entry, through `buildQuickAdd`) and as the track's (`record_saved`), with `hasPhoto: false` until P3-T15. `buildQuickAdd` puts `source` last and only when given, so a create without one (the legacy Quick add, and every existing parity row) is the JSON it always was, and a resend's command key is unchanged. Followups line 785 (P2-T16's reviews: "`track.source` is `tell_bun` only while a Bun guess stands"): that rule is gone. The existing case "a draft from Tell Bun marks its fields guessed and saves with source tell_bun" is unchanged and passes (it changes one guess); the new sheet case changes every guess and still saves `tell_bun`, which is what kills the plan's H1 mutant on the sheet's path.
- **P6. The review's original (`draftFieldsOf`).** The entry as the tray shows it right after the fill: the filled draft, and the amount Save would settle on (Bun's amount; when Bun read none, what the keypad already settles on, so an amount the person had typed stands and saving it unchanged is `kept`). At save the review compares `draftFieldsOf(saved.draft, saved.draft.amountMinor)`: the same settled amount. `draftFieldsOf`: the type's category (none for a move); the wallet (for a move, `fromWalletId`, the one it leaves); the amount is the parameter, never the draft's own `amountMinor`, which the tray leaves stale (it keeps the amount on its keypad).
- **P7. When each review is sent, once.**
  - Saved: in the entry's `useEntrySave` `onSaved`, after the device commit or the server's acknowledgement, before the host is told. The pending review is taken (cleared) first, so a second `onSaved` (P2-T16's PROBE-4 double save) sends nothing more, and the close that follows a landed save finds nothing to drop.
  - Dropped: when the tray closes unsaved (an effect on `visible`: close, the backdrop, escape, a swipe, a conflict's Done), and when a new AI draft or the sheet's draft takes its place. `fieldsEdited` is 0: a dropped draft has no saved record to compare with.
  - A host that goes away with its tray open (a sign-out) sends nothing: that review would land after the session changed, under the next person's consent (1D-T7's lesson, R119).
- **P8. A draft never lands on a save in flight.** While `useEntrySave` locks the entry (saving, unconfirmed, conflict), `applyAiDraft` takes nothing. So a review always describes the draft that was saved, and Try again resends exactly what the person checked. Beyond the plan; its case is "an AI draft handed over while a save is on its way, or while its answer is unknown, changes nothing".
- **P9. The followups that name this task** (`grep -n "P3-T13" followups.md`: lines 607, 637 and 785).
  - Line 607 (P3-T5's review). m1: carried (`try`/`catch` around the tally call; `reviewDraft` stays synchronous; the case). m2: `useDraftReview.ts:23-26` is unchanged, and the host reaches the tally only through it; the kept-and-edited case checks that `AddTrayHost.tsx` names neither `draftTally` nor `trackAiDraftReviewed`. The `__DEV__` note: the tray's reviews write `jotbun.dev.draft-tally` to the suite's AsyncStorage (`window.localStorage` on the web); no case reads the storage's keys.
  - Line 637 (P3-T2's reviews, m1, edge pins): **not carried.** It belongs to an edge-only follow-up (a `P3-T2-followup`), which the controller can dispatch now from the head: P4-T3, which changed that file's upgrade case, merged as #452. Why not here: P3-T13 changes no edge code, so the pins would test nothing it does; carrying them would add an edge install and Workers runs under the heavy lock to an app task's gate while P3-T3 (an edge task) is building on that lock; and the reviews' probes show the code is right today. No later plan task edits that file (P4-T7 keeps it unchanged), so it needs its own dispatch. P4-T11 owns `statement` in the import confirmation.
  - Line 785 (P2-T16's reviews): carried (P5).
  - Not carried, since they name other tasks: line 784 (the double save; 1D-T7's followers: P7 keeps the review once regardless); P3-T5's n1 to n3 (`events.test.ts`, `draftTally.test.ts`, which this task does not edit); P3-T2's n1 and n3 (`diaryRepository.test.ts`, `events.ts`).
- **P10. Release (P3-T2's review m2, for the owner and P6C).** This is the first build whose add tray sends a `source`. A 0.1.0 build's `isTransactionSnapshot` refuses a snapshot carrying one, so the server's client minimum (`MIN_CLIENT_VERSION_IOS`, `MIN_CLIENT_VERSION_ANDROID`, or the KV config's `client_versions`) must be at least `0.2.0` (`AI_MIN_CLIENT_VERSION`; `app.json` is already `0.2.0`) before a build with this task ships. The receipt repeats it (the plan's Global Constraints, "Contracts").
- **P11. Money and privacy.** No new text is drawn. `record_saved` and `ai_draft_reviewed` carry only the allow-list's properties (`source`, `has_photo`; `outcome`, `fields_edited`, `model`, `escalated`); the kept-and-edited case checks that no amount, place, note or wallet name reaches analytics (1D-T7's `recordProps.ts` is the boundary). An AI draft fills through `fill(…, true)`, so R117's private-mode rules (Bun's place and guessed note not drawn on confirm) apply to it as to the sheet's. The amount stays a satang string: the review compares strings, and `settleForSave` is the keypad's own exact rule.
- **P12. The cases beyond the plan's**, each pinning a ruling or a guard the mutation check needs:
  - The tray: "an AI draft handed over while a save is on its way, or while its answer is unknown, changes nothing" (P8; H16, H17). In the kept-and-edited case: an Opus draft sent online with two fields changed (the model and escalated reach the review; H6 to H8, H20, H21), and a draft with no amount over a typed one (P6; H24, H25). In the second-draft case: the sheet over an AI draft (P5; H13 to H15). In the typed case: a quick chip saved online. In the close case: escape, and a typed entry closed (nothing to review).
  - `entrySave.render.test.tsx`: the online create, and Quick add's way (a track and no source: no key; E2).
  - `quickAddModel.test.ts`: the move, and a refused draft.
  - `draftOrigin.test.ts`: income, a move, and an empty entry.
  - `draftReview.test.ts`: m1's case.
- **P13. 48 mutants, all killed,** every failing case an `AssertionError` (`first_errors.py`). The plan's two are H1 (the source from the guessed marks again) and H2 (the dropped review on every render). Two edits are not in the list because no case can tell them apart from the code, and why: dropping the clear in `dropUnsaved` (after a drop the origin is always replaced, or the entry goes; the line keeps "once" for later callers such as P3-T18's row removal), and dropping the entry's `onApplier(null)` when it goes (a gone entry's rule only touches its own unmounted state, and the next entry hands up its own before any call can reach it).
- **P14. The gate (R100).** `typecheck:app`, `test:app`, `test:unit` (the Hermes guards), the three Node files with six Node neighbours, the round's two render files, the eight kit render files that import the wallet catalogue index, the four routes tests (`entrySave.ts` is imported by Quick add, which a route loads), the rest (Quick add, the add steps, `useDraftReview`'s own suite, the saved moment, the catalogue route) and the catalogue's wallet sections. Not run: `typecheck:routes` and `export:web` (no route, config or app-entry change); the full render suite, the iOS export, `test:ops`, and the API, edge and database suites (CI; nothing outside `apps/app` changes; Docker is stopped).
- **P15. Clear of the work in flight** (each open branch's files under `apps/app` and `packages`, checked against the head). #456 (P2-T26, `p2/t26-record-detail`) calls `useAddTray()` and mounts `AddTrayHost`; the new member changes neither, and it shares none of this task's files (its `SpendRoutes.render.test.tsx` and record sections may move RT and C: Step 1.3 allows for it). #454 (P3-T8, `p3/t8-slip-escalation`) changes `fakeAiResources.ts`'s default slip answer and the contracts' `ai.ts`; these cases use the fake only for `{ companion: true }` (Bun's sheet) and call no slip read. P3-T3 (`p3/t3-ai-gate`) changes nothing under `apps/app` or `packages`. P2-T17 and P4-T3 have merged (P2).
- **P16. Notes for later tasks** (the receipt carries them):
  - **P3-T15:** pass `hasPhoto: true` in the host's track for a kept photo (`EntryTrack.hasPhoto`; `finish` already sends it). A photo the person attaches is not an origin: the record stays `typed` with `has_photo: true` unless Bun read it (H9).
  - **P3-T17:** call `applyAiDraft(draft, { source: 'photo', model, escalated })`, then choose the step. A read that fails is no draft: do not call it.
  - **P3-T18:** one draft goes through `applyAiDraft(draft, { source: 'tell_bun', model, escalated })`; a `DraftItem`'s `original` is `draftFieldsOf` of the row's draft as the list shows it, with its amount; review a removed row, and each row left at the close, `dropped` with `fieldsEdited: 0`, once (P7). When the tell step replaces `TellBunSheet`, `fromSheet` and `SHEET_ORIGIN` go with it.
  - **The owner and P6C:** P10.
  - **Device checks:** none new (no new screen or gesture).

---

## Step 0: Sync and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a fast-forward.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it as the base in the receipt.
3. P2-T17 is in the head: `ls WT/apps/app/src/wallet/saved/SavedToastHost.tsx WT/apps/app/src/dev/catalogue/wallet/savedSections.tsx`. Expected: both listed. If either is missing, report BLOCKED: "P2-T17 is not in the head".
4. The eight shared files:
   ```bash
   cd WT && shasum -a 256 apps/app/src/spend/v1/redesign/quickAddModel.ts apps/app/src/spend/v1/redesign/quickAddModel.test.ts apps/app/src/screens/redesign/entry/entrySave.ts apps/app/src/screens/redesign/entry/entrySave.render.test.tsx apps/app/src/wallet/add/AddTrayHost.tsx apps/app/src/wallet/add/AddTray.render.test.tsx apps/app/src/spend/v1/ai/draftReview.ts apps/app/src/spend/v1/ai/draftReview.test.ts
   ```
   Expected: each equals its `orig/...` line in `PL/SHA256SUMS`. If any differs, report BLOCKED with the file and both checksums (another merge changed it, and the controller rebases this brief).
5. `ls WT/apps/app/src/wallet/add/draftOrigin.ts WT/apps/app/src/wallet/add/draftOrigin.test.ts`. Expected: both missing.
6. `/usr/bin/git -C WT diff --stat 4c095ad6 HEAD -- apps/app packages`. Expected: nothing (at `4c095ad6`, the head when this brief was finished, `apps/app` and `packages` are the proof tree's: P2). If it lists files (#456 or #454 may have merged since), record each in the receipt; Step 1's base counts then show whether anything this task's runs read has moved (Step 0.4 has already checked this task's own files).
7. `cd PL && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0` (every file in the kit is as the planner left it).

## Step 1: Install and record the base

1. `mkdir -p S`.
2. If `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: `0`, and the log ends with "added 1416 packages". If `WT/node_modules` is there, skip this and say so in the receipt.
3. The base, each with its log in S:
   - `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: `0`.
   - `cd WT/apps/app && npm run test:unit -- src/spend/v1/redesign/quickAddModel.test.ts src/spend/v1/ai/draftReview.test.ts src/wallet/add/addFlow.test.ts src/spend/v1/redesign/recordModel.test.ts src/wallet/saved/savedMoment.test.ts src/dev/draftTally.test.ts src/analytics/events.test.ts src/storage/diaryRepository.test.ts > S/base-unit.log 2>&1; echo $?`. Expected: `0`, `ℹ tests 74`, `ℹ fail 0`. Record the tests count as U.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/entry/entrySave.render.test.tsx src/wallet/add/AddTray.render.test.tsx > S/base-round.log 2>&1; echo $?`. Expected: `0`, `Test Files  2 passed (2)`, `Tests  31 passed (31)`. Record it as R.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > S/base-kit8.log 2>&1; echo $?`. Expected: `0`, `Test Files  8 passed (8)`, `Tests  142 passed (142)`. Record it as K8.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/base-routes4.log 2>&1; echo $?`. Expected: `0`, `Test Files  4 passed (4)`, `Tests  17 passed (17)`. Record it as RT.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/QuickAddScreen.render.test.tsx src/wallet/add/AddSteps.render.test.tsx src/spend/v1/ai/useDraftReview.render.test.tsx src/wallet/saved/SavedMoment.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > S/base-rest.log 2>&1; echo $?`. Expected: `0`, `Test Files  5 passed (5)`, `Tests  123 passed (123)`. Record it as RS.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: `0`, `Tests  110 passed | 572 skipped (682)`. Record the passed count as C.
   If Step 0.6 listed files and a count here differs from this brief's, use your own as U, R, K8, RT, RS or C from here on and say so in the receipt; every later Expected line names them. With no files listed, a different count is a BLOCKED.

## Step 2: The tests and the typed stubs (plan Step 1)

1. Copy the five test files in their final form, and the four typed stubs:
   ```bash
   cp PL/real/apps/app/src/wallet/add/draftOrigin.test.ts WT/apps/app/src/wallet/add/draftOrigin.test.ts
   cp PL/real/apps/app/src/spend/v1/redesign/quickAddModel.test.ts WT/apps/app/src/spend/v1/redesign/quickAddModel.test.ts
   cp PL/real/apps/app/src/screens/redesign/entry/entrySave.render.test.tsx WT/apps/app/src/screens/redesign/entry/entrySave.render.test.tsx
   cp PL/real/apps/app/src/wallet/add/AddTray.render.test.tsx WT/apps/app/src/wallet/add/AddTray.render.test.tsx
   cp PL/real/apps/app/src/spend/v1/ai/draftReview.test.ts WT/apps/app/src/spend/v1/ai/draftReview.test.ts
   cp PL/stubs/apps/app/src/wallet/add/draftOrigin.ts WT/apps/app/src/wallet/add/draftOrigin.ts
   cp PL/stubs/apps/app/src/spend/v1/redesign/quickAddModel.ts WT/apps/app/src/spend/v1/redesign/quickAddModel.ts
   cp PL/stubs/apps/app/src/screens/redesign/entry/entrySave.ts WT/apps/app/src/screens/redesign/entry/entrySave.ts
   cp PL/stubs/apps/app/src/wallet/add/AddTrayHost.tsx WT/apps/app/src/wallet/add/AddTrayHost.tsx
   ```
   `draftReview.ts` stays as the head has it: its m1 guard is what RED tests. The stubs carry the plan's signatures and none of its behaviour: `draftFieldsOf` reads nothing, `buildQuickAdd` and `save` ignore `source`, `finish` drops `hasPhoto`, and `applyAiDraft` fills through `applyDraft` only while the save keeps P2's source rule (the plan's Step 1).
2. `cd WT && shasum -a 256 apps/app/src/wallet/add/draftOrigin.test.ts apps/app/src/spend/v1/redesign/quickAddModel.test.ts apps/app/src/screens/redesign/entry/entrySave.render.test.tsx apps/app/src/wallet/add/AddTray.render.test.tsx apps/app/src/spend/v1/ai/draftReview.test.ts apps/app/src/wallet/add/draftOrigin.ts apps/app/src/spend/v1/redesign/quickAddModel.ts apps/app/src/screens/redesign/entry/entrySave.ts apps/app/src/wallet/add/AddTrayHost.tsx apps/app/src/spend/v1/ai/draftReview.ts`. Expected: the first five equal their `real/...` lines, the next four their `stubs/...` lines, and the last its `orig/...` line in `PL/SHA256SUMS`. If a `cp` source is missing or a checksum differs, report BLOCKED.

## Step 3: RED (plan Step 2), then GREEN (plan Steps 3 and 4)

### 3.1 RED

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: `0`, with no `error TS` line.
2. `cd WT/apps/app && npm run test:unit -- src/wallet/add/draftOrigin.test.ts src/spend/v1/redesign/quickAddModel.test.ts src/spend/v1/ai/draftReview.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: `1`, `ℹ tests 17`, `ℹ pass 14`, `ℹ fail 3`, and `grep -c "code: 'ERR_ASSERTION'" S/red-unit.log` prints `3`. Then `python3 -I PL/tools/red_list.py unit S/red-unit.log | LC_ALL=C sort > S/red-unit.list` and `diff S/red-unit.list PL/logs/red-unit.list`: no output (the three failing cases and their first lines).
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/screens/redesign/entry/entrySave.render.test.tsx src/wallet/add/AddTray.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: `1`, `Test Files  2 failed (2)`, `Tests  7 failed | 31 passed (38)`, and `grep -c '^AssertionError' S/red-render.log` prints `7`. This prints `0`: `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError|Not implemented|Unhandled' S/red-render.log`. Then `python3 -I PL/tools/red_list.py render S/red-render.log | LC_ALL=C sort > S/red-render.list` and `diff S/red-render.list PL/logs/red-render.list`: no output. The seven:
   - entrySave: "the create carries its source, and record_saved its source and photo flag";
   - the tray: "a typed save sends source typed", "a Tell Bun sheet draft saves as tell_bun without a review", "an AI draft saved as filled is reviewed kept, and one changed is edited with its count", "closing the tray with an unsaved AI draft reviews it dropped, once", "a second AI draft over an unsaved one reviews the first dropped", and "an AI draft handed over while a save is on its way, or while its answer is unknown, changes nothing".
   The 31 that pass are the two files' cases from before this task; their code paths are unchanged at RED.

### 3.2 GREEN

1. Copy the code. The eight shared files all matched `orig/` at Step 0.4, so each is a `cp`:
   ```bash
   cp PL/real/apps/app/src/wallet/add/draftOrigin.ts WT/apps/app/src/wallet/add/draftOrigin.ts
   cp PL/real/apps/app/src/spend/v1/redesign/quickAddModel.ts WT/apps/app/src/spend/v1/redesign/quickAddModel.ts
   cp PL/real/apps/app/src/screens/redesign/entry/entrySave.ts WT/apps/app/src/screens/redesign/entry/entrySave.ts
   cp PL/real/apps/app/src/wallet/add/AddTrayHost.tsx WT/apps/app/src/wallet/add/AddTrayHost.tsx
   cp PL/real/apps/app/src/spend/v1/ai/draftReview.ts WT/apps/app/src/spend/v1/ai/draftReview.ts
   ```
2. `cd WT && shasum -a 256` the same ten files as Step 2.2 (the ten in Scope, all but the receipt). Expected: each now equals its `real/...` line in `PL/SHA256SUMS`.
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: `0`, no `error TS` line.
4. `cd WT/apps/app && npm run test:unit -- src/wallet/add/draftOrigin.test.ts src/spend/v1/redesign/quickAddModel.test.ts src/spend/v1/ai/draftReview.test.ts src/wallet/add/addFlow.test.ts src/spend/v1/redesign/recordModel.test.ts src/wallet/saved/savedMoment.test.ts src/dev/draftTally.test.ts src/analytics/events.test.ts src/storage/diaryRepository.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: `0`, `ℹ tests 77` (U + 3), `ℹ fail 0`.
5. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/screens/redesign/entry/entrySave.render.test.tsx src/wallet/add/AddTray.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: `0`, `Test Files  2 passed (2)`, `Tests  38 passed (38)` (R + 7), and `grep -cE 'stderr \||Unhandled|not wrapped in act' S/green-render.log` prints `0`.
6. The neighbours, with Step 1.3's commands, each into `S/green-<name>.log`: kit8 `Tests  142 passed (142)` (K8); routes4 `Tests  17 passed (17)` (RT); rest `Tests  123 passed (123)` (RS); catalogue `Tests  110 passed | 572 skipped (682)` (C). Each exits `0`, unchanged from the base.

## Step 4: Mutation check (plan Step 5)

1. `mkdir -p S/mutant-batches`. Run the four batches, each in the foreground (a batch takes a few minutes; do not run them in the background), each into its own file:
   ```bash
   python3 -I PL/tools/mutants.py WT S/mutant-logs O1 O2 O3 O4 O5 O6 O7 O8 O9 O10 Q1 Q2 Q3 R1 E1 E2 E3 E4 > S/mutant-batches/batch-1.out 2>&1; echo $?
   python3 -I PL/tools/mutants.py WT S/mutant-logs H1 H2 H3 H4 H5 H6 H7 H8 H9 H10 > S/mutant-batches/batch-2.out 2>&1; echo $?
   python3 -I PL/tools/mutants.py WT S/mutant-logs H11 H12 H13 H14 H15 H16 H17 H18 H19 H20 > S/mutant-batches/batch-3.out 2>&1; echo $?
   python3 -I PL/tools/mutants.py WT S/mutant-logs H21 H22 H23 H24 H25 H26 H27 H28 H29 H30 > S/mutant-batches/batch-4.out 2>&1; echo $?
   ```
   Expected: each prints `0`; the batches end "18 killed, 0 survived, 0 not as expected", then "10 killed, 0 survived, 0 not as expected" three times. Each mutant runs alone and its file is restored byte for byte ("restored sha256 equal").
2. `python3 -I PL/tools/merge_mutants.py PL/tools/mutants.py S/mutant-batches S/mutants.out`. Expected: `48 lines; 48 killed, 0 survived, 0 not as expected`.
3. `diff S/mutants.out PL/logs/mutants.out`. Expected: no output (each line: the id, KILLED, the description and file, the test summary, the first failing case, the AssertionError count and "restored sha256 equal").
4. `python3 -I PL/tools/first_errors.py S/mutant-logs`. Expected: `48 logs, 0 with a failing case that is not an AssertionError`.
5. The ten files' checksums again (Step 3.2.2) and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 3.2; `git status` lists the eight shared files as modified (` M`) and `apps/app/src/wallet/add/draftOrigin.ts` and `apps/app/src/wallet/add/draftOrigin.test.ts` as new (`??`), and nothing else.

## Step 5: Gate (R100's fast local gate; plan Step 6)

From WT, in this order, each with its log in S:

1. `cd WT && npm run typecheck:app > S/gate-1-typecheck.log 2>&1; echo $?`: `0`.
2. `cd WT && npm run test:app > S/gate-2-test-app.log 2>&1; echo $?`: `0`, and the log says `ℹ fail 0`.
3. `cd WT && npm run test:unit > S/gate-3-test-unit.log 2>&1; echo $?`: `0`, and the log says `ℹ fail 0` (the Hermes guards included).
4. The focused files once more, as Steps 3.2.4 to 3.2.6, into `S/gate-4-*.log`: the same Expected lines.
5. `/usr/bin/git -C WT diff --check` (before the commit): no output. After the commit, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output (in your final message).

Not run, and why (put this in the receipt): `typecheck:routes` and `export:web` (no route, config or app-entry change); the full render suite (CI's `render` and `sections-1` to `sections-3` jobs); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped). Device checks: none new (P16).

## Step 6: Receipt

Write `docs/implementation/receipts/P3-T13.md` in the house style (as `docs/implementation/receipts/P2-T16.md` is written), with your own numbers where they differ from these. Start from:

```markdown
# P3-T13: The add tray records how each record was made

- **Status:** built and verified locally on `p3/t13-draft-origin` (`.claude/worktrees/p3-t13`), from `<base>`. Committed locally, not pushed. The independent reviews are the controller's (Opus, then Sonnet: money and privacy). Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<base>`. The brief was proven at `2062b89a` with P2-T17's files laid in, the `apps/app` and `packages` of `4c095ad6`; `git diff --stat 4c095ad6 HEAD -- apps/app packages` lists <nothing | the files>. Step 0.4 found the eight shared files at their `orig/` checksums.
- **Client minimum (P3-T2's review m2, for the owner and P6C):** this is the first build whose add tray sends a `source`. A 0.1.0 build refuses a snapshot carrying one, so the server's client minimum must be at least `0.2.0` (`AI_MIN_CLIENT_VERSION`) before a build with this task ships.
- **Files:** created `apps/app/src/wallet/add/draftOrigin.ts`, `draftOrigin.test.ts` (1 case) and this receipt; modified `apps/app/src/spend/v1/redesign/quickAddModel.ts` and `quickAddModel.test.ts` (1 case), `apps/app/src/screens/redesign/entry/entrySave.ts` and `entrySave.render.test.tsx` (1 case, the probe's `source`), `apps/app/src/wallet/add/AddTrayHost.tsx` and `AddTray.render.test.tsx` (6 cases), `apps/app/src/spend/v1/ai/draftReview.ts` and `draftReview.test.ts` (1 case).
- **What changed:** (the origin and the source it gives: typed, the sheet's tell_bun, an AI draft's own; `applyAiDraft` and how it reaches the entry; the review once: kept or edited at save, dropped at a close or a replacement, nothing when the host goes; no draft while a save is in flight; `buildQuickAdd`'s source, last and only when given; `record_saved`'s photo flag; m1.)
- **RED to GREEN:** (Step 3.1 and 3.2's numbers, with the failing cases; the base counts U, R, K8, RT, RS and C from Step 1.)
- **Mutation check:** 48 mutants, all killed (`mutants.out`: "48 killed, 0 survived, 0 not as expected"), every failing case an `AssertionError` (`first_errors.py`: 0), each file restored with its sha256 checked; `diff` against the planner's `mutants.out` prints nothing. The plan's two: H1 and H2. (One line per group, with the case that kills most.)
- **Gate** (worktree root; R100, so no whole-suite count): (every command in Step 5 with its result.)
- **Followups:** line 607 m1 carried, m2 kept (the host reaches the tally only through `useDraftReview`); line 785 carried (the origin replaces P2's guessed rule); line 637 not carried: an edge-only follow-up after P4-T3 (the brief's P9).
- **Deviations:** the controller accepted the planner's rulings P1 to P16 (`.claude/controller/briefs/P3-T13.md`). The ones that shape this work: P3 (names and files beyond the plan's list), P4 (how applyAiDraft reaches the entry; no step change), P5 (chips and edits keep the origin), P6 (the original as the tray shows it), P7 (when each review is sent; none when the host goes), P8 (no draft while a save is in flight), P9 (line 637).
- **SKIPPED:** typecheck:routes and export:web (no route or app-entry change); the full render suite, the iOS export, test:ops, the API, edge and database suites (CI; nothing outside apps/app changes; Docker is stopped).
- **Risks:** an unconfirmed save the person closes is reviewed dropped, though its command may have committed; a host that goes with its tray open (a sign-out) sends no review for an unsaved AI draft (P7).
- **Notes for later tasks:** (P16's list: P3-T15, P3-T17, P3-T18, the owner and P6C.)
```

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/add/draftOrigin.ts apps/app/src/wallet/add/draftOrigin.test.ts apps/app/src/spend/v1/redesign/quickAddModel.ts apps/app/src/spend/v1/redesign/quickAddModel.test.ts apps/app/src/screens/redesign/entry/entrySave.ts apps/app/src/screens/redesign/entry/entrySave.render.test.tsx apps/app/src/wallet/add/AddTrayHost.tsx apps/app/src/wallet/add/AddTray.render.test.tsx apps/app/src/spend/v1/ai/draftReview.ts apps/app/src/spend/v1/ai/draftReview.test.ts docs/implementation/receipts/P3-T13.md`
2. `/usr/bin/git -C WT status --short`. Expected: those eleven staged, nothing else (no log, no `dist/`).
3. Write the message to `S/commit-message.txt`:
   ```
   Save each record with how it was made, and review every AI draft once as kept, edited or dropped

   The add tray saves the entry's origin as the record's source: typed,
   tell_bun from Bun's sheet, or an AI draft's own source, handed over
   through useAddTray().applyAiDraft. record_saved carries the same source
   and the photo flag. Each AI draft is reviewed once: kept, or edited with
   its count, when saved; dropped when the tray closes unsaved or a new
   draft replaces it. The legacy Quick add still sends no source, and a
   draft tally that throws at once no longer fails a review.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 11 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; the files changed; the RED and GREEN counts; mutants (48 killed, none survived); each gate command with its result and the focused counts; SKIPPED items; deviations (the accepted rulings), and what the reviewer should look at first: when each review is sent and that it is sent once (P7), the lock guard (P8), the review's original and its settled amount (P6), the sheet's origin replacing P2's guessed rule (P5), and that nothing but the allow-list's properties reaches analytics (P11).

---

## Appendix: the files, byte for byte

Each block is the kit's file as it is (`real/`, `stubs/` or `diffs/`). For the three shared files that have a stub, the stub is shown as a diff from `orig/`, for reading only: Step 2 copies the stub itself.
