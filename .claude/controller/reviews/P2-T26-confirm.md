# P2-T26 confirming review (Opus): the fix round, R123 and R124

- **Reviewed:** the fix round `0c062e3d` on `p2/t26-record-detail` (one commit on the reviewed head `52110318`), and the controller's merge `e4313772` (parents `0c062e3d` and `d1e636ec`), PR #456, range `origin/claude/p1a-vault-core...e4313772` (14 files), after `git fetch`.
  - The merge changes none of the task's files: `git diff --stat 0c062e3d e4313772` over the record folder, the two catalogue files, the route and the receipts is empty.
  - The integration head has since moved to `90006f03`, which changes only controller notes (`handover.md`, `pr-p2-t26.md`, `pr-p4-t2.md`, `reviews/P4-T2.md`).
- **Against:** plan P2-T26 (line 1313) and its Global Constraints; the fix brief `briefs/P2-T26-fix.md` (P22 to P31), with R123 and R124 as it quotes them; both reviews; the protocol (R87, R100, "Reviewers").
- **Method:** read-only. Every probe and mutant ran in a scratch tree:
  - `git archive e4313772` into `scratch/p2-t26-confirm/tree`, with `.claude` dropped;
  - `node_modules` linked entry by entry from the worktree by `tools/linkfarm.py` (a copy of the first reviewer's), so vitest's cache lands in the tree.

  The worktree was never written: `git status --short` is empty, and HEAD is `e4313772`. No whole suite was run (R100).
- **In short:**
  - No blocker, no major and no minor.
  - R123 and R124 are built as ruled, and each point is held by a case.
  - The earlier reviews' probes now pass as fixed, and all 13 pins fail on their mutants.
  - I found nothing the round broke.
  - Two nits on P26's new guard, each with a probe: one direction is unheld (n1), and the `active` half its sibling hooks carry was dropped for an inexact reason (n2).
  - CI on `e4313772` has not run yet: it is queued, since org-wide Actions minutes are blocked.

## CI (R100)

- **Now:** run 43474283011 on `e4313772` (`pull_request`, created 13 November at 17:35 UTC) has all nine jobs `queued`, and none has started (`gh pr checks 456`, `gh run view`). The last completed run, 43348356153 on `52110318`, passed 9 of 9 (the first review's table).
- **What CI must still show on `e4313772` before the merge:**
  - all nine jobs green;
  - in the Render job: `WalletRecord.render.test.tsx` 35 and `WalletRecordReceipt.render.test.tsx` 4, with `RecordScreen` 65, `RecordReceipt` 48 and `WalletDeleted` 15 unchanged, and no `stderr |` line;
  - the three per-section jobs, which open the five `bw-record` sections (`bw-record-undo` now carries the spoken words);
  - in the checks job: `typecheck:app`, `typecheck:routes` and `test:unit` (`fail 0`);
  - both exports, since the merge brings in P2-T17, P4-T3, P3-T8 and P3-T3.

## What I ran

- **The kit and the fixer's logs:**
  - `PL/SHA256SUMS`: 34 OK, 0 not OK.
  - `SHA256SUMS.real-in-wt` in the worktree at `e4313772`: all seven files OK.
  - The fixer's `mutants.out` is identical to the planner's (`diff` empty; 139 killed, 0 survived).
  - RED: 7 of 39 failed, each failing case an `AssertionError` (`first_errors.py`), with `typecheck:app` 0.
  - GREEN: 39 of 39.
  - The gate: 167, 18, 142, and 12 passed with 672 skipped (684), with no `stderr |` line.
- **The controller's gate on the merged tree** (`scratch/p2-t26-merge`):
  - `typecheck:app` 0; `test:unit` fail 0; the kit files with `AddTray` and `SavedMoment` 180; the routes 18; the catalogue sections 20 passed with 672 skipped (692); `diff --check` 0.
  - The five record files: `record5.log` reads 167 of 167. The `record5 ... 102` line in `gate.out` comes from the first run, before `gate.sh` was edited at 00:35:08 and that step was rerun. This is bookkeeping only.
- **My focused runs on `e4313772`** (scratch tree):
  - the round's two files: 39 of 39, no `stderr |` line;
  - the five record files and the four routes tests: 185 of 185 (167 and 18);
  - both catalogue suites with `-t "section bw-record|section bw-deleted"`: 12 passed and 680 skipped (692), no `stderr |` line.
- **Hygiene:** `git diff --check origin/claude/p1a-vault-core...e4313772` is clean. A Python scan of `git diff 52110318 0c062e3d` finds no em dash or emoji in the round's added lines.
- **The planner's mutants, a sample of 12 of the 33 new ones** (the planner's runner against the scratch tree; `logs/planner-sample.out`):
  - F1, F2, F3, F6, W1, W3, W5, W6, G1, G3, M2 and OM7;
  - 12 killed, every failing case an `AssertionError`, every file restored (sha256);
  - the 12 lines equal the planner's (sorted `diff`, empty).
- **The earlier reviews' probes on the new head:** copied into the scratch tree, with the gap probe's output re-pointed to my folder (`logs/earlier-probes.log`). The results are under "R123: confirmed".
- **My own mutants and probes:** `tools/my_mutants.py`, `probes/ConfirmProbes.render.test.tsx` and `probes/StrictSanity.render.test.tsx`. The results are under the nits and in "My mutants".

## Findings

### Blocker

None.

### Major

None.

### Minor

None.

### Nit

**n1. P26's guard is held in one direction only.**
- **The gap:** the committed case (`WalletRecord.render.test.tsx:784`) turns VoiceOver on before the first answer lands. My mutant X1 changes `changed = true;` to `if (enabled) changed = true;` (`WalletUndoBar.tsx:46`), and it passes all 35 cases.
- **What X1 would do:** suppose VoiceOver goes off, and then a stale "yes" lands. The bar stays with no time until the page is left.
  - This is not a WCAG 2.2.1 failure (that is the other direction).
  - The window is the phone's first answer, a few milliseconds: the same class as the reviews' n3 and n5.
- **The code is right:** my probe A (`ConfirmProbes.render.test.tsx`, "a late yes after VoiceOver went off does not stop the time") passes on `e4313772`. It kills X1 on one `AssertionError` (`my-mutant-logs/X1A.log`: "the old yes never stops the time").
- **Fix (optional, about 10 lines):** give the committed case the other direction too: `change(false)`, then a late `true`, asserting that the bar's timer is never cleared.

**n2. The dropped `active` half: the reason given is inexact, and both sibling hooks carry it.**
- **The claim:** P26 and the fix receipt say the unmount half "changes nothing a person or a case can see", since React 19 drops a state update on an unmounted component.
- **Why it is inexact:** that is true for an unmount. But React's development double run re-runs the effect without unmounting, so the first run's late answer still lands on the mounted bar.
- **Probe B** (`ConfirmProbes.render.test.tsx`, the bar under `<StrictMode>` at the root):
  - React asks twice;
  - the second run hears VoiceOver come on;
  - the first run's late "no" then starts the time under a screen reader: one `toastLong` timer, failing on an `AssertionError` (`logs/confirm-probes.log`).
- **The siblings:** the wallet's other two such hooks drop that answer for exactly this reason:
  - `reducedMotion.tsx:20-22`: "A run that has ended (unmounted, or React's development double run) drops its late answer";
  - `PrivateModeProvider.tsx:66-67`, the same rule for its read;
  - `WalletRoot.render.test.tsx:125-133` holds it under StrictMode.
- **No runtime path today:**
  - Expo, Expo Router and React Native's `renderApplication` mount no StrictMode (grep).
  - In React 19.3 a nested StrictMode does not double-run effects (`StrictSanity.render.test.tsx`: at the root, "setup, cleanup, setup"; nested, "setup" once), so no `mountWallet` case can see it either.
- **A prototype:** four lines in the scratch tree, `logs/active-prototype.diff`: `let active = true`, `active && !changed` on both callbacks, and `active = false` in the cleanup.
  - Probe B passes with it, and so do all 35 cases (37 of 37 with both probes, `logs/active-prototype.log`).
  - The file was then restored (sha256).
- **Optional:** carry the half for parity, or correct the receipt's sentence.

## R123: confirmed

1. **While hidden, `RecordReceipt` is not mounted.**
   - **The code:** `WalletRecordScreen.tsx:412-416` reads `hidden ? (receiptHeld && isRedesignEnabled('import') ? <HiddenReceipt /> : null) : <RecordReceipt ... />`, in the live branch. That is the only place the page mounts the panel; the draft, deleted, deleted-elsewhere and frozen branches (`:336-406`) never did.
   - **Before the setting is read:** `hidden` is true until then (`PrivateModeProvider.tsx:42`, `UNREAD`), so the panel never mounts before the setting is known. Outside the wallet's provider, the page reads as shown (`:39`), as today's record does.
   - **The first review's gap probe** (`ReviewProbeR123.render.test.tsx`) now fails as fixed, on one `AssertionError`: "the slip is drawn in private mode (the R123 gap): expected [] to have a length of 1 but got +0". It records `{"thumbnails":0,"src":[],"openButtons":0,"grants":0,"files":0}`; at `52110318` it recorded one thumbnail, one grant and one download. Its control, with private mode off, passes.
   - **The first review's fix-shape probe** (`ReviewProbeR123Fix.render.test.tsx`): 3 of 3, including the literal Thai label รูปใบเสร็จ ซ่อนอยู่.
   - **The second review's `ProbeReceipt.render.test.tsx`:** 3 of 3 (2 of 3 failed at `52110318`). It prints "thumbnail buttons drawn = 0 | <img> sources = [] | grant calls = 0 | file (bytes) calls = 0".
   - **The second review's `ProbeToggle.render.test.tsx`** passes:
     - switching private mode on while the full-screen photo is open removes the viewer, the thumbnail and every `<img>`, and shows the frame;
     - switching it off mounts the panel again, which reads the photo again (grants 1, then 2).
   - **The mutant:** F1 (private mode mounts the panel) is killed, on 2 cases.
2. **A record with a receipt, with the import area on: the one-row card, read as one element.**
   - `HiddenReceipt` (`:206-218`) is a card on `colors.card` (radius 20) holding one `Fact`, labelled รูปใบเสร็จ ซ่อนอยู่: `tc('Receipt photo')` (`th.json:866`) and `records.noteHidden`.
   - The receipt file asserts, in Thai and English, light and dark: the frame's words, that it holds exactly one labelled element with that label, and its card colour.
   - F6 is killed (and F4 and F7 to F10 in the fixer's log).
3. **No receipt, or the import area off: nothing.** The receipt file's second and fourth cases hold it; F2 and F3 are killed.
4. **Private mode off: today's panel, unchanged.**
   - The panel's line is the same JSX as at `52110318`, and `RecordReceipt.tsx` and `RecordScreen.tsx` are not in the diff.
   - The receipt file's third case: the thumbnail, one grant and no frame; Attach for a record with no receipt.
   - `RecordReceipt.render.test.tsx` (48) and `RecordScreen.render.test.tsx` (65) pass unchanged.
- **The main file and the copy:** the main file's private-mode case also asserts that the stand-in is absent (`:529`, `/^receipt of /`, which matches the stand-in's text at `:48`). No key is added: `records.noteHidden` is reused, as R123 says.

## R124: confirmed

- **The spoken words:** `deletedBarText` (`:99-108`) returns `{ text, spoken }`. `spoken` goes through `spokenMoney` (`walletMoney.ts:51-59`: `common.baht`, `common.satang` and `common.minus`), so ฿50 is read 50 บาท, and ฿50.75 would be 50 บาท 75 สตางค์. W1 is killed, on 3 cases.
- **The bar:** `WalletUndoBar`'s `spoken?` labels the words (`WalletUndoBar.tsx:94`) and is what iOS says (`:58`, `spoken ?? message`).
  - W5 is killed.
  - My X4 (no fallback to `message`) is killed by the bar-level iOS case (`:814`), so a bar with no `spoken` still says its words.
- **Private mode, unchanged:** both forms are `records.deletedBarHidden` (`:100-103`), with no amount.
  - W3 is killed, on 3 cases.
  - The private-mode case now sweeps every `aria-label` in the document for an amount, drawn or in words (`AMOUNT`, `:198`).
- **The catalogue:** `SAMPLES` spreads `COMMON_COPY` before `COPY` (`recordScreens.tsx:75-77`), the page's own order (`RECORD_COPY`). W6 is killed.
- **The new return type reaches nothing else:** only the page and the catalogue call `deletedBarText` or draw `WalletUndoBar` (grep), and `typecheck:app` is 0 on the merged tree.

## The pins and the guard on the phone's first answer

- **The pins:** all 13 (M1, M2, M24, M24b, M28, M28b, M49, OM1, OM2, OM7, OM8, OM19, OM20) are killed in the fixer's log, each on `AssertionError`s.
  - I reran M2 and OM7: both killed, and their lines equal the planner's.
  - Each is the reviewer's own edit, re-pointed: I compared them with `p2-t26-review/tools/my_mutants.py` and `p2-t26-second/own_mutants.py`.
- **P26's `changed` flag:** G1 and G3 are killed (G2 in the fixer's log), so a late "no" after VoiceOver came on never starts the time. See n1 and n2.

## What the round could have broken: nothing found

- **The undo bar's time rules:** the timer effect (`WalletUndoBar.tsx:60-69`) is unchanged. The time cases pass, and so do the U mutants, with U3, U4, U12 and U15 re-pointed at the moved lines (the same edits).
- **The tray's R69 order:** `RecordActionsTray.tsx` and `actionsClosed` (`:329-332`) are untouched. The R69 cases pass, and S9 to S13 are killed in the fixer's log.
- **The events:** the case "the screen sends no event of its own" passes: one `record_deleted` and one `undo_used`, with no amount or words. The round adds no emitter.
- **Scope and rules:**
  - the seven files the brief lists, and nothing else;
  - no copy key, catalog, route, package or lockfile change;
  - the receipt is its own file, and `premium-progress.md` is untouched (R87);
  - the trailer names Claude Haiku 5.5, as the brief says.

## My mutants

| Id | Mutation | Result | Class |
| --- | --- | --- | --- |
| X1 | the listener marks a change only when VoiceOver comes on | survived (35 of 35); killed by probe A | n1 |
| X4 | iOS says `spoken`, with no fallback to `message` | killed (1 case: the bar-level iOS case) | held |
| X5 | the frame's only row drawn with a hairline above it (`first={false}`) | survived (4 of 4) | not raised: cosmetic, and no board draws this frame |

## Notes for later tasks

- **P2-T24 (Home's eye) and P2-T18 (the shell):** R123 is in. One related leak is still open, from the first review:
  - outside an add-tray host, the record's ทำซ้ำวันนี้ pushes today's Quick add (`AddTrayHost.tsx:127-128`; `app/spend/add.tsx` draws `QuickAddScreen`);
  - no screen outside `src/wallet` reads private mode, so a copied record's amount and merchant show in the clear;
  - no route mounts an `AddTrayHost` yet.

  P2-T18's host, or a guard, should land before P2-T24 makes private mode reachable.
- **Any later copy of `useScreenReaderRunning`** (a toast, or P2-T28's tray): take `reducedMotion.tsx`'s shape with both halves (n2), and a case for each direction (n1).
- **If a later task gives the record page an eye of its own:** the second review's `ProbeToggle.render.test.tsx`, which passes on `e4313772`, is the case to add: the panel unmounts with its viewer, and mounts again on reveal. The fix receipt's risk stands: a switch cuts an attach in flight.
- **The controller's followups:** the second review's m2 (the iOS dismissal bound), n3 and n4 (P31). The handover (line 69) already names the right n1.

VERDICT: Approved
