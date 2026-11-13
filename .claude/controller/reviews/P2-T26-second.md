# P2-T26 second review (Claude Sonnet 5.5, money, wallet and privacy path): The record: detail, actions and Undo

- **Reviewed:** commit `52110318` on `p2/t26-record-detail` (worktree `.claude/worktrees/p2-t26`), PR #456 (mygogocash/jotbun, base `claude/p1a-vault-core`), range `origin/claude/p1a-vault-core...52110318`, after `git fetch`. The worktree was clean and at `52110318`.
- **Independence:** I read the spec (`### Task P2-T26`, line 1313), the brief, the receipt, the protocol (R87, R100, "Reviewers"), the three new components, `useRecordActions`, the Tray and `RecordReceipt`. I read no other review of this task before writing these findings.
- **Method:** read-only on the worktree and the main checkout. All probes and mutants ran in a `git archive` copy at `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-second/tree` (node_modules symlinked from the worktree). Probe files, logs and one prototype diff are in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t26-second/`. Per R100 I ran no whole suite: only the committed record file once (baseline), my own probe files, and 14 of the planner's mutants plus 10 of mine. Database suites were skipped (Docker stays stopped; CI runs them).

## Verdict in one paragraph

The page, the tray and the undo bar are well built: private mode is held everywhere I could find except one place, the receipt photo (R123), where the page draws, downloads and opens the slip with private mode on. Money paths (delete, Undo, Restore, their keys and versions, the two events) are correct and I could not break them. R123 is a controller ruling the build does not meet, so this is **Needs fixes** with one major finding. The rest are minor and nit items for the same fix round.

## CI (R100), PR #456, run 43348356153

Read with `gh pr checks 456 --repo mygogocash/jotbun`, `gh run view` and the job logs once the run completed (`scratch/p2-t26-second/ci-job-*.log`). **All 9 jobs passed.**

| Job | State and counts from its log |
| --- | --- |
| Typecheck, unit, API, build | pass, 2m8s: `typecheck`, `typecheck:app` and `typecheck:routes` ran green; `test:app` 37 of 37; `test:unit` (the Hermes guards) 1109 of 1109; `test:dev` 7 of 7; API build, release graph and parser sandbox green |
| Exports (web and iOS bundles) | pass, 2m2s |
| Edge Worker | pass, 2m31s |
| SQL integration and ops | pass, 3m16s |
| Release image and smoke | pass, 19s |
| Render (every file but the per-section suites) | pass, 3m23s: 132 files, 1722 tests, no `stderr |` line; includes `WalletRecord.render.test.tsx` 25, `RecordScreen.render.test.tsx` 65 (unchanged), `WalletDeleted.render.test.tsx` 15, `SpendRoutes.render.test.tsx` 5 |
| Render, per-section suites (ids of length 3n) | pass, 2m57s: 196 passed, 496 skipped (692) |
| Render, per-section suites (ids of length 3n+1) | pass, 3m9s: 236 passed, 456 skipped (692) |
| Render, per-section suites (every other test) | pass, 4m42s: 260 passed, 432 skipped (692) |

The three per-section jobs together pass 196 + 236 + 260 = 692, every catalogue test once, so the five record sections are covered. The last job waited about 22 minutes for a runner before it started.

CI cannot see M1: the committed suite stubs `RecordReceipt`, so a green CI says nothing about the receipt photo in private mode.

## Findings

### Blocker

None.

### Major

**M1. In private mode the wallet record page draws, downloads and opens the receipt photo (R123).**

Evidence:

- `apps/app/src/wallet/records/WalletRecordScreen.tsx:376` mounts `RecordReceipt` on every live record with no private-mode check. `RecordReceipt.tsx:64-67` checks only the `import` area, which is on by default (`featureFlags.ts`, `APPROVED`). `HeldReceipt` (`RecordReceipt.tsx:414-421`) draws `ReceiptThumbnail` (`ReceiptParts.tsx:170-196`), and the thumbnail opens `ReceiptViewer` full screen (`ReceiptParts.tsx:215-295`).
- Probe, real `WalletRecordScreen` with the real `RecordReceipt` (no stand-in), a record that holds a receipt, private mode on (the page title reads `Food`, the category, which proves it was on). File `tree/apps/app/src/wallet/records/ProbeReceipt.render.test.tsx`, log `probe-r123.log`:
  - `PROBE: thumbnail buttons drawn = 1 | <img> sources = ["data:image/png;base64,"] | grant calls = 1 | file (bytes) calls = 1`
  - tapping the thumbnail: `full-screen slip drawn from the private-mode page = 1`
  - 2 of 3 probe cases fail on `AssertionError` ("no 'Open the receipt photo' button while hidden: expected [ <button> ] to have a length of +0 but got 1"). The third, private mode off, passes as the baseline.
- Why the committed suite cannot see it: `WalletRecord.render.test.tsx:34-42` replaces `RecordReceipt` with a stand-in for the whole file, and the private-mode case (`:499-527`) never meets the real panel. No mutant of the 106 covers it, because there is no check to remove.

What the page should draw in its place: **the section's frame with its heading and ซ่อนอยู่, and nothing else.** Concretely:

- A card in the wallet look with the heading `tc('Receipt photo')` (catalog line `redesignReceiptPhoto`, Thai รูปใบเสร็จ) and the words ซ่อนอยู่ / Hidden. Add one draft key beside `records.noteHidden` (for example `records.receiptHidden`, same words) so E2-B's copy review reads cleanly.
- No image, no `Open the receipt photo`, no Attach, Replace or Remove, and **nothing fetched**: the panel must not mount while hidden, so the grant and the bytes are never requested. (The probe shows both requests happen today.)
- The same frame for every record while hidden, with or without a receipt: do not branch on `attachment_id`. That way private mode does not reveal whether a slip exists, and an attach cannot put a fresh photo on screen while amounts are hidden.
- Only when `isRedesignEnabled('import')` is true, so W15 ("today's receipt section unchanged when the import area is on") and the area-off case are unchanged.
- It follows `hidden` live: `hidden` is true until the setting is read (`PrivateModeProvider.tsx:41-42`), so the panel never mounts and flashes a slip before the read.
- Design hint for E2-B, not a requirement: `bw-record.dc.html` (lines 40-48) draws the receipt as a row, with a drawn slip glyph (an illustration, not the photo), "ใบเสร็จ 1 รูป", "แตะเพื่อดูเต็มจอ · ถ่ายเมื่อ 12:11" and a chevron. W15 keeps today's panel instead, so that row is E2-B's to reconcile. The hidden frame may borrow the glyph tile with ซ่อนอยู่ as its second line, with no chevron and no press target. No board draws the record in private mode (`bw-private.dc.html` is Home only), so this is a draft.

Where to fix it, the smaller safe fix: **the wallet page only, not `RecordReceipt`.**

1. No screen outside `src/wallet/` reads private mode (`grep usePrivateMode` outside `/wallet/` is empty). The legacy `RecordScreen` draws its amount on its slip regardless; hiding only its photo would be inconsistent.
2. `WalletRoot.tsx:18-30` mounts `PrivateModeProvider` even with the wallet area off, and the setting persists in the device store. A check inside `RecordReceipt` would hide the legacy page's photo for someone who turned private mode on and later runs a build with the wallet area off, with no eye on the legacy screens to turn it back.
3. Blast radius: `RecordReceipt.render.test.tsx` and `RecordScreen.render.test.tsx` (65 cases, "unchanged" in the plan) would both be in play. The page fix is about 15 lines.
4. Not mounting the panel stops the download for free; inside `RecordReceipt` it would need guards in `loadPhoto`, `showFresh` and the viewer as well, not only in what it draws.

`RecordScreen.tsx:214` therefore goes to P2-T37 (or never: legacy has no private mode at all). It does not have to be fixed here.

Proved feasible: I applied a prototype to the scratch copy only (`r123-prototype.diff`, saved beside the probes). It is a local `HiddenReceipt` card and a three-way branch at `:376`: `hidden ? (isRedesignEnabled('import') ? <HiddenReceipt /> : null) : <RecordReceipt ... />`. With it the probe reads `thumbnail buttons drawn = 0 | <img> sources = [] | grant calls = 0 | file (bytes) calls = 0`, and the 3 probe cases plus all 25 committed cases pass (28 of 28, `proto-existing.log`). A fourth probe (`ProbeToggle.render.test.tsx`, `probe-toggle.log`) flips private mode through `usePrivateMode().toggle` while the photo and its full-screen viewer are showing: on, the viewer, the thumbnail and every `<img>` go and the frame shows; off, the panel mounts again and asks for the photo again (grant calls 1, then 2). The scratch file was then restored to the committed bytes (`cmp` equal).

Tests the fix round should add:

- A separate file (the main file stubs `RecordReceipt` module-wide), for example `WalletRecordReceipt.render.test.tsx`, built like `ProbeReceipt.render.test.tsx`: the real panel in `ReceiptPortsProvider` with `createFakeAttachments(...).seedReceipt`, `device: { 'private-mode': '1' }`, Thai and English, light and dark. Assert the frame and its words once; no `receipt-thumbnail`, no `<img>`, no `receipt-full-image`, no Attach, Replace or Remove button; `callsOf('grant')` and `callsOf('file')` empty; no `data:image` in the page HTML.
- The same frame for a record with no receipt (no `Attach a receipt photo`).
- Private mode off: the thumbnail and one grant call (the probe's baseline).
- `EXPO_PUBLIC_REDESIGN=-import`: neither the frame nor the panel.
- Private mode switched on while the photo shows: the photo goes; switched off: it returns.
- In `WalletRecord.render.test.tsx`'s private-mode case, assert the stand-in's `receipt of ...` text is absent while hidden, so the branch is held in the main file too.

### Minor

**m1. Four behaviours are right but unheld by any test (my own mutants survive).** I probed each against the committed code (`ProbeRefusals.render.test.tsx`, `probe-refusals.log`): the behaviour is correct, only the guard is untested.

| Mutant | What it removes | Probe of the committed code |
| --- | --- | --- |
| OM7 (`WalletRecordScreen.tsx:377`) | the notice after a definitely refused delete on the live page | `conflict`, `deleted`, `not_found` and `invalid` each show their words ("This entry changed on another device.", "This entry was already deleted.", "This entry could not be saved."), keep Edit and Delete, send once and read the record again (2 reads). The same from the actions tray, with the tray gone. |
| OM8 (`:306`) | the notice when a draft's Remove or Discard fails | a failing `removeDraft` shows "Couldn't change this device's copy. Try again." and does not go back |
| OM1 (`:309`) | the draft view stacking at the largest text size | a draft at `AX5` has `flexDirection: column` |
| OM2 (`:310`) | the draft buttons' `grow={!large}` | same case |

The plan's sentence "`pending` freezes with Try again, `gone` and `notice` show today's words" has its definite-refusal branch (a refused ลบ) untested; only the unconfirmed one is. Add: a refused delete from the page and from the tray (the four outcomes above, one `deleteTransaction` call, the page still live); a failed draft Remove and Discard; a draft at `AX5` stacked.

**m2. The tray-to-edit and tray-to-copy hand-off has no bound if iOS never reports the dismissal.** `Tray.tsx:26-32,158-177`: on iOS `onClosed` comes only from the Modal's `onDismiss`, and `AddTrayHost.tsx:49-52,114-117,303-308` documents that UIKit may never end a dismissal and bounds its own entries with `CLOSED_BOUND_MS` (R117). `WalletRecordScreen.tsx:297-300` relies on `onClosed` alone, so in that case the person's แก้ไข or ทำซ้ำ from the tray is silently dropped (nothing is lost or deleted; they tap again). I could not reproduce UIKit here. It is the existing "device check before P2-T18" item, and it will matter more once P2-T27's EditTray runs from the same `onClosed`. See Notes.

### Nit

- **n1.** `after.current` is not cleared once `actionsClosed` has used it (`WalletRecordScreen.tsx:297-300`). Not reachable today, since every opening resets it (`:289-292`) and the Tray calls `onClosed` once per exit. Clearing it in `actionsClosed` is one line of defence.
- **n2.** The record's tile and the wallet swatch are not under any test for "decorative" (my mutants OM19 and OM20 survive: removing `{...DECORATIVE}` at `:135` and `:182`). An unknown category's tile draws a letter as text, which a screen reader would read before the title.
- **n3.** `recordScreens.tsx:38-39` imports a value (`WALLET_RECORD_TITLES`) back from `recordSections.tsx`, which lazy-loads `recordScreens`: a static cycle through the lazy edge. `deletedSection.tsx` avoids it. Harmless at run time (the registry is always evaluated first, and C1 and the suites pass); moving the titles to the stage or a tiny shared module removes it.
- **n4.** `WalletUndoBar.tsx:26,71` use literals (`rgba(255, 255, 255, 0.12)`, a shadow). P10 says "the toast's words at 12%", and in dark mode `onToast` is `#F4F2FA`, not white. Cosmetic; for P2-T37's palette sweep.
- **n5.** `useScreenReaderRunning` (`WalletUndoBar.tsx:29-38`) has no `live` guard on the first answer (today's `UndoBar` has one), so a change event that lands before `isScreenReaderEnabled()` resolves could be overwritten by the older answer. Theoretical (milliseconds); no failing probe.

## What I checked and found sound

Private mode (P3, R114), beyond the photo. `ProbeSweep.render.test.tsx` (`probe-sweep.log`, `probe-control.log`), Thai and English, scans the whole `document.body.outerHTML`, attributes included (aria-labels and test ids), for `฿` plus a digit, `50.75` and `5075`, the spoken `50 บาท` and `50 baht`, the merchant, the note, and a transfer's merchant, note and amount:

- the confirmed page; the open actions tray; the undo bar after a delete from the tray; a transfer; a draft on the phone; a record deleted elsewhere; a frozen (unconfirmed) delete: **none of them appears**.
- Control: with private mode off the same scan finds the amount, the merchant and the note, so the sweep can fail.
- iOS announcements (`Platform.OS = 'ios'`, spy on `announceForAccessibility`) over delete then Undo: exactly `["Deleted Food"]`.
- Copy from the page into the add tray in private mode (`ProbeCopy.render.test.tsx`): `add-amount` reads `฿••••` and the page HTML has no merchant, note or amount.
- `saveProblem` and `classifyLoadProblem` messages are fixed catalog lines with no quoted data. The new files log nothing, send no event, touch no storage (grep).

Undo and the money path:

- A double-tapped ลบ sends one `deleteTransaction`; a double-tapped Undo sends one `restoreTransaction`; the events are exactly `['record_deleted', 'undo_used']` (the hook's `acting` guard; `ProbeSweep`).
- Exactly one 6000 ms timer for the bar (`motion.duration.toastLong`, `motion.ts:113`). A second delete after an Undo sends the new version (3, then 5) under a new key and gets its own bar.
- Keys: `useCommandKeys.keyFor` returns the same key for the same payload until `settle`, so the frozen delete's Try again and the bar's Undo resend the same key and version (`parts.tsx:213-227`; the committed tests hold it).
- Restore from a record deleted elsewhere sends the record's own version; the bar's Undo sends the version the delete returned (`recordActions.ts:437-441,461-470`).
- `walletMoneyText` (`walletMoney.ts`) drops `.00` only for zero satang, so the bar's and the page's amounts are exact (`฿50.75` in my fixtures).

The tray (P6, P7, R69): copy and edit run from `onClosed` (S10 and S11 killed), a tray opened again forgets the leaving action (S9 killed), a backdrop close runs nothing (my OM21 killed), `more` does something (OM22 killed), outside a host copy pushes `/spend/add` with `copyOf` (test, line 368).

The route (P16): `[id].tsx` picks `WalletRecordScreen` only when `isRedesignEnabled('wallet')` with `key={id}` and the same `mode` rule; the routes test covers eight flag and param cases plus a new mount per id (R1 to R3 in the planner's log). `useWalletLooks` outside a provider falls back to derived looks (`WalletLooksProvider.tsx:98-100`), so the route works before P2-T18 mounts the shell.

The catalogue (P15): the five sections load through `lazy(() => import('./recordScreens'))`; I reran C1 and it is killed by `walletHarness.render.test.tsx` failing to load, as the runner expects. I also ran the two catalogue suites for the five sections in the scratch copy (`-t "section bw-record"`, `catalogue-record.log`): 10 passed (5 sections in each of `CatalogueScreen` and `screenReader`, light and dark, en, th and vi, "every control has a name, nothing hidden takes focus"), no `stderr |`. CI's last render job (ids of length 3n+2, which are `bw-record-deleted`, `bw-record-actions` and `bw-record-undo`) is the same check on a clean machine.

Kit and hygiene: all 11 files of the planner's kit (`scratch/p2-t26-planner/real/`) are byte-identical to the commit (`cmp` for each); `git diff --check origin/claude/p1a-vault-core...52110318` is clean; 12 files; the trailer is `Co-Authored-By: Claude Haiku 5.5`; the receipt is its own file and `premium-progress.md` is untouched (R87); `RecordScreen.render.test.tsx` is unchanged. The committed `WalletRecord.render.test.tsx` passes 25 of 25 in my scratch copy with no `stderr |` line (`baseline-record.log`).

## Mutants

Planner's, a sample of 14 of 106 rerun on the scratch copy with the planner's own runner: **S1 and S2 (the plan's two), S4, S36, S39, S44, T2, S9, S10, S32, S33, U3, U7, C1: 14 killed, 0 survived**, every kill on `AssertionError`s only except C1 (suite fails to load, as the runner expects), every file restored (sha256 equal). My 14 result lines are identical to the planner's lines for the same ids (`diff` of `mutants/b1.out`, `b2.out` and `b3.out` against `p2-t26-planner/logs/mutants.out`: no difference).

Mine (`own_mutants.py`, 10 run): 2 killed, 8 survived.

| Id | Mutation | Result | Class |
| --- | --- | --- | --- |
| OM21 | the tray's backdrop close runs the copy | killed | held |
| OM22 | the page's more button opens no tray | killed | held |
| OM7 | no notice after a refused delete (live page) | survived | m1, behaviour right |
| OM8 | no notice after a failed draft Remove or Discard | survived | m1, behaviour right |
| OM1 | the draft view never stacks at AX5 | survived | m1, behaviour right |
| OM2 | a draft's buttons keep growing at AX5 | survived | m1, behaviour right |
| OM19 | the tile is not decorative | survived | n2 |
| OM20 | the swatch is not decorative | survived | n2 |
| OM3 | `gone` never reads as deleted elsewhere | survived | equivalent today: only P2-T27's edit flows set `gone` |
| OM24 | the bar's timer also restarts when its words change | survived | equivalent in practice: the words change only if private mode flips |

## Notes for later tasks

- **P2-T27 (and E2-B):** until `EditTray` exists, the page's แก้ไข, the tray's แก้ไข and a `?mode=edit` deep link set `editing` and draw nothing (P8, by design). Do not switch the wallet area on in any build before P2-T27 lands. P2-T27 must also draw `choicePanel` and offer `discardChoice` beside the deleted notices (P8), and should give the tray hand-off the bound from m2 if the device check shows UIKit can stall.
- **Tray follow-up, device check before P2-T18 (m2):** one shared way to run "what the person chose" after a tray's Modal has gone, with a bound like R117's, would serve the record page, P2-T27 and History's actions tray (P2-T28) instead of each host relying on `onClosed` alone.
- **R123 as a rule for every later task that embeds a legacy part in the wallet look:** the receipt panel is the first such part. Each of P2-T27 (EditTray, ChoicePanel), P2-T28 and P2-T37 should ask "does this legacy part draw a slip, a note or Bun's words?" and keep it behind `usePrivateMode()` at the wallet page, not inside the legacy part.
- **P2-T37 (sweep):** legacy `RecordScreen.tsx:214` (no private mode on legacy screens at all); the two literals in the bar (n4); decorative tile and swatch under test (n2).
- **E2-B copy:** the new receipt-hidden draft line from M1; the English lines and the Thai drafts ซ่อนอยู่ and ลบ {title} แล้ว (as the receipt says); the saved toast's Undo link against this bar's pill (P10).

## Where things stand

CI is green on all 9 jobs (see above). The code is otherwise sound. One major finding (M1, the receipt photo in private mode under R123) blocks approval; the fix is about 15 lines in the wallet page plus one draft copy key and the new tests listed under M1, and the minor and nit items can ride in the same round.

VERDICT: Needs fixes
