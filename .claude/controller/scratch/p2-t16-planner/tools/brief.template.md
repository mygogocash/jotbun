# Brief P2-T16: The add tray host: open, Tell Bun, save

You are the implementer for plan P2, Task P2-T16. You add the Bun Wallet add tray's host (`AddTrayHost` and `useAddTray`): opening an entry (one `record_started`), its steps (P2-T14's amount step, P2-T15's transfer, confirm and pick steps, and the tray's back), Tell Bun (today's sheet, inside the tray), the quick chips, and saving on Quick add's own rules (P2-T5's `useEntrySave`), with the tray locked while a save is in flight and today's frozen Try again when an online save is not confirmed; one tray at a time (`whenClosed`, R69); Save's busy words in the add tray's draft copy; three catalogue sections; and three small pins in neighbouring tests (one line of the wallets list's sections case, P2-T15's confirm m1, tray-hardening's c-n1). The planner wrote every file below and proved it in a scratch copy of the integration head `f034185e` (#436 P5-T2 merged, after #429 P2-T21): RED on a typed stub (17 of 17 render cases fail, each on an assertion), GREEN, 86 mutants (all killed), the focused neighbours, the catalogue's wallet sections, the routes tests and the fast local gate of R100. Do exactly what this brief says.

**This task starts after P2-T5, P2-T7, P2-T15 and 1D-T1** (all in the head) and after tray-hardening (#392, merged as `37a0d2ff`), which the controller made P2-T16 wait for. Step 0.2 checks each by content.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T16.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T16` (lines 972 to 1011); W10, W14, W17 and W27 (lines 47, 51, 54 and 64); Review Focus 1 and 2 (lines 114 and 115); its Global Constraints (lines 82 to 108); P2-T14 and P2-T15 (lines 901 to 970), whose steps this host drives; P2-T17 and P2-T18 (lines 1013 to 1091), which use it.
3. The receipts this task builds on: `docs/implementation/receipts/P2-T14.md`, `P2-T14-fix.md`, `P2-T15.md` and `P2-T15-fix.md` (the steps and their notes for this host), `P2-T13.md` and `tray-hardening.md` (the tray), and `### P2 Task 5` in `docs/implementation/premium-progress.md` (the entry hooks).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16` (branch `p2/t16-add-tray-host`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the eight files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED form (typed stub) of `AddTrayHost.tsx`;
  - `orig/`: the five existing files this task changes, as they are in the head `f034185e` (`add/copy.ts`, `addSections.tsx`, `WalletsList.render.test.tsx`, `AddSteps.render.test.tsx`, `Tray.render.test.tsx`);
  - `diffs/`: one diff per changed existing file, paths `a/<repo path>` and `b/<repo path>` with full blob ids, so `git apply --3way` can merge them: `apps_app_src_wallet_add_copy.ts.diff`, `apps_app_src_dev_catalogue_wallet_addSections.tsx.diff`, `apps_app_src_wallet_wallets_WalletsList.render.test.tsx.diff`, `apps_app_src_wallet_add_AddSteps.render.test.tsx.diff` and `apps_app_src_wallet_tray_Tray.render.test.tsx.diff`. The planner checked that each turns `orig/` into `real/` byte for byte (`PL/logs/applycheck.log`);
  - `tools/`: `stage.sh` (puts a tree at the base, RED or GREEN), `focused.sh` (the focused set: the Node files, the neighbours, the catalogue's wallet sections, the registry rule), `gate.sh` (the planner's GREEN focused set, routes and fast gate in one run), `mutants.py` (the mutant runner), `merge_mutants.py` (how the planner joined its batched mutant runs into one `mutants.out`), `name_diffs.py`, `fill_brief.py` and `brief.template.md` (how this brief was built: every code block in the Appendix is the `real/` or `stubs/` file or the `diffs/` file, byte for byte, and the mutant lines are `logs/mutants.out`; the controller's state sync trims the single space on a diff's blank context lines in this page, so apply a diff only from `PL/diffs/`), `sums.sh`;
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (everything in `logs/`, which the state commits leave out: `base-*`, `red-*`, `green-*`, `gate-*` (the fast gate), `mutants.out`, `mutant-batches/` (the six runs it joins: the planner ran the 86 in batches of at most fifteen, each mutant still applied alone) and `mutant-logs/`, `applycheck.log`, `red-render.list` (Step 3.3's lines), `npm-ci.log`, and `superseded/`: the planner's proofs at the two earlier heads, `c7aec126` and `0bfdc014`, with three mutant rounds at `0bfdc014` that stopped short (`mutant-round1/`, 47 of 86, and `mutant-round2/`, 11, both stopped by the planner to change files; `mutant-round3-cut/`, 54, cut by a restart of the agents' server), every mutant in them killed).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only counts that may differ from this brief's are N, C and R (Step 1.3), and only as Step 0 says; and a load flake (a case that times out under load in a file this task does not touch: rerun that file alone once and record both runs).

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/add/AddTrayHost.tsx` | **new** (@@LINES real/apps/app/src/wallet/add/AddTrayHost.tsx@@ lines). `AddTrayHost`, `useAddTray`, `AddRequest` and `SavedContext`, exactly the plan's, and `AddTray`, the hook's type (P3a). |
| `apps/app/src/wallet/add/AddTray.render.test.tsx` | **new**, render suite (@@LINES real/apps/app/src/wallet/add/AddTray.render.test.tsx@@ lines). 17 cases: the plan's eight and nine more (P15). |
| `apps/app/src/dev/catalogue/wallet/addHostSection.tsx` | **new**, development only (@@LINES real/apps/app/src/dev/catalogue/wallet/addHostSection.tsx@@ lines). The three sections' stage, loaded lazily (P3b). |
| `apps/app/src/wallet/add/copy.ts` | **extended** (P2-T14's draft table). The plan's `add.saving`, and its header names this task's line. @@LINES orig/apps/app/src/wallet/add/copy.ts@@ lines before, @@LINES real/apps/app/src/wallet/add/copy.ts@@ after. |
| `apps/app/src/dev/catalogue/wallet/addSections.tsx` | **extended**, development only. The plan's three sections after P2-T15's four (P3c, P13). @@LINES orig/apps/app/src/dev/catalogue/wallet/addSections.tsx@@ lines before, @@LINES real/apps/app/src/dev/catalogue/wallet/addSections.tsx@@ after. |
| `apps/app/src/wallet/wallets/WalletsList.render.test.tsx` | **shared** (P2-T20's and P2-T21's). One line: its sections case's first id becomes `bw-tray-add-large`, the add tray's last section now (P3c). @@LINES orig/apps/app/src/wallet/wallets/WalletsList.render.test.tsx@@ lines before and after. |
| `apps/app/src/wallet/add/AddSteps.render.test.tsx` | **shared** (P2-T15's). One mount added to its private-mode case: P2-T15's confirm m1 (P10c). @@LINES orig/apps/app/src/wallet/add/AddSteps.render.test.tsx@@ lines before, @@LINES real/apps/app/src/wallet/add/AddSteps.render.test.tsx@@ after; its 17 cases otherwise unchanged. |
| `apps/app/src/wallet/tray/Tray.render.test.tsx` | **shared** (P2-T13's). One case added: tray-hardening's c-n1 (P5c). @@LINES orig/apps/app/src/wallet/tray/Tray.render.test.tsx@@ lines before, @@LINES real/apps/app/src/wallet/tray/Tray.render.test.tsx@@ after; 27 cases before, 28 after. |
| `docs/implementation/receipts/P2-T16.md` | **new**. Your receipt (R87). |

Not in this task: the steps and their rules (`addFlow.ts`, `AmountStep.tsx`, `TransferStep.tsx`, `ConfirmStep.tsx`, `PickSteps.tsx`, `TypeSwitchHeader.tsx`, `QuickChips.tsx`, `WalletKeypad.tsx`; read only); the tray (`src/wallet/tray/Tray.tsx`, read only: the new case pins it as it is); the entry hooks and helpers (`src/screens/redesign/entry/*`, read only; Quick add's suite runs unchanged); today's Tell Bun (`TellBunSheet.tsx`, `tellBun.ts`, `oftenLogged.ts`, read only and unchanged); `src/dev/catalogue/wallet/index.ts` (no spread: P3c) and `registry.tsx`; `draftText.test.ts` (the new Thai line holds Thai letters); `en.json` and `th.json` (no catalog line is added; today's lines are reused through `tc`); the wallet shell, the + button and Magic Tap (P2-T18), the saved toast (P2-T17); any route, the app entry or native code; any package or lockfile; `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready.**
  - Starts after P2-T5 (`useEntrySave`, `useEntryReferences` and the entry helpers), P2-T7 (`analyticsCategoryKey`), P2-T15 (#427, merged `98607505`, after its R114 fix round) and 1D-T1 (`trackRecordStarted`, `recordAnalytics`), all in the head; and after tray-hardening (#392, `37a0d2ff`; the controller held P2-T16 for it and took it off `held.txt` on 11 November).
  - P3-T5's `useDraftReview` (#418) is not wired here: the P3 plan gives it to P3-T13 ("P3-T13: The add tray records how each record was made", lines 653 to 687, which modifies `AddTrayHost.tsx` and consumes `useDraftReview`). This task keeps the plan's `track.source` rule (P9).
  - No package, lockfile change, Cloudflare resource, account setting or owner decision is needed. The copy follows owner Q3's default (P18).
- **P2. The proof's base is the head `f034185e`.** The dispatch named `b29e6f8e`. The head moved twice while the planner worked, and each time it built the copy again with `git archive` and `npm ci` (1416 packages) and ran every stage again: first at `c7aec126` (the same app code as `b29e6f8e`); then at `0bfdc014`, after #429 (P2-T21) merged, where only `WalletsList.render.test.tsx` among this task's files had changed (in hunks away from this task's line; its diff was rebuilt on P2-T21's file); then at `f034185e`, after #436 (P5-T2) merged, which changes none of this task's files, but changes the contract types and the app's `resources.ts` and `diaryRepository.ts` that its code reads. Every count was the same at `0bfdc014` and `f034185e`. The earlier proofs' logs are in `PL/logs/superseded/`. After the proof, #435 (P3-T7) merged as `bfce84ed` (head `7a29bc70`): outside the edge it changes only a comment in `packages/contracts/src/v1/ai.ts`, so the proof holds there, and Step 0.3 lists that file (name it in the receipt).
- **P3. The names and files beyond the plan's list.**
  - (a) **`AddTray`** (in `AddTrayHost.tsx`) is the type `useAddTray()` returns, exported so P2-T17, P2-T18 and P2-T30 can name it. The plan's four exports are exactly as written.
  - (b) **`addHostSection.tsx`** is the three sections' stage, loaded with `lazy()`, the controller's rule for sections: the host reaches Quick add's command keys (`screens/v1/parts.tsx` loads `expo-crypto`), which the eight kit suites that import the wallet catalogue index cannot load. A source pin in the sections case holds that the list loads it lazily and never imports the host (mutant S5).
  - (c) **The sections join P2-T15's list in `addSections.tsx`**, the plan's file (`WALLET_ADD_SECTIONS` gains three after `bw-tray-pick-category`), so `index.ts` is untouched. P2-T20's sections case reads the add tray's last section right before its own (`WalletsList.render.test.tsx`, `ids.slice(at - 1, at + 3)`), so its first id becomes `bw-tray-add-large`: one line. P2-T15's (`ids.slice(at - 2, at + 4)` around `bw-tray-transfer`) and P2-T14's sections cases pass unchanged.
  - (d) **No `now` prop.** The plan's props are exact, so today is the real Bangkok date (`useEntryReferences`' own rule). The tests take their dates from `todayInBangkok(new Date())`, and no case asserts a stored date, so none can break across midnight.
- **P4. Each entry lives above the tray (R63, P2-T13's notes).** The host renders one `AddEntry` per opening (keyed by the opening), which holds the entry's lists (`useEntryReferences`), draft, keypad, step, the step a pick goes back to, Bun's guesses, the name field's focus, the sheet and the save (`useEntrySave`), and renders the one `Tray`, also while the lists load, so the move from loading to the amount step never swaps Modals. Under the lock cover only the tray's content unmounts; the draft, the keypad and a frozen Try again survive.
- **P5. One tray at a time (R69; P2-T13's notes; tray-hardening's n-3 and c-n1).**
  - (a) The tray stays mounted until its `onClosed`; then the entry goes, and `whenClosed`'s queue (a ref, emptied as it runs) runs once. A second `onClosed` (iOS, two hides) finds nothing queued, since the entry has gone. With no tray mounted, `whenClosed` runs at once.
  - (b) `open` while the tray is open does nothing; `open` while it leaves waits for its `onClosed` (`whenClosed`), so a second Modal is never presented while the first is dismissing. `open` sends its `record_started` when the entry actually starts.
  - (c) c-n1 is a pin of `Tray.tsx` itself (the host's `onClosed` reads only refs and setters, so a stale callback would act the same through the host): one case in `Tray.render.test.tsx` passes a new `onClosed` while iOS's dismissal is under way and expects only the new one called (the review's mutant M3, here T1).
  - (d) A Modal that never presented gets no `onClosed` on iOS (the review's R-f). The host then keeps the entry mounted, hidden, and an `open` waits for it; whether UIKit sends a dismissal for a present it refused is the review's own device question, recorded as SKIPPED.
- **P6. Opening (the plan's rule).**
  - (a) The draft is `firstDraft` (new, or a copy as Quick add copies it) with the request's type and wallet when it names them: the wallet spent from or paid into, and the wallet a move leaves; a move's other side, when it was that wallet, becomes another listed wallet; a wallet not listed is ignored.
  - (b) A copy's amount, and every amount the person did not type (Bun's, a chip's), goes in through `filledKeypad`, so private mode masks it until a key is pressed (R106; P2-T14-fix's note for this task).
  - (c) `record_started` (`source: 'typed'`) carries the request's type, `expense` for a new entry that names none, and no `kind` for a copy that names none: its type is not known until it loads, and the emitter's `kind` is optional (1D-T1).
  - (d) While `blocked` (C5) `open` does nothing. Outside a host it pushes `/spend/add` with the request's fields as params (today's Quick add reads `copyOf`) and sends nothing: Quick add starts its own entry (1D-T7's table). That tray is one value per router, so a caller's effect keyed on it does not run again on every render.
- **P7. The steps (P2-T14's and P2-T15's notes for this host).**
  - (a) Amount, then confirm; a transfer goes amount, transfer, confirm (`stepAfterAmount`). A row opens its pick; `isPickStep` keeps the step that opened it, passed as `WalletPick`'s `back`. The tray's back goes from a pick to its opener with nothing changed, and from the transfer and confirm steps to the amount; the amount step has none.
  - (b) Footers: `AmountFooter` (with the host's `naming`, kept by the stable setter, P2-T14's m2), `TransferFooter` with the same wallets as `TransferStep` (R114.2), the confirm footer (P9), and none on a pick (its เสร็จ is in its middle).
  - (c) A new type keeps the amount step; anywhere else it goes on to the type's next step after the amount, a pick counting as the step that opened it. So a change to transfer goes to the transfer step and never stays on confirm (P2-T14's second review), and the transfer step is entered only with an amount the keypad can save (P2-T15-fix's P23): only the wallet pick the amount step's chip opens can lack one, and it counts as the amount step.
  - (d) At the largest text sizes (`useSwitchInHeader()` false) the pinned header is the tray's title and the switch is the amount step's (`typeSwitch`, R106); the other steps offer none, so the type is chosen on the amount step (an E2-B difference, P18). The two cures P2-T14's reviews name for the AX5 scroll (scroll the middle to its top on a type change, or a pinned place under the header) are the tray's: `Tray.tsx` is not this task's file and has no scroll handle. They stay with a tray follow-up (P19).
- **P8. Quick add's first-touch rule (`withDefaults`).** Until the first touch (a key, a step change, any change to the draft) the default categories follow the recent-use read (`rank` over the records as they land); the first touch fixes the ranking and the draft's defaults, so no category moves under the person. The category pick uses that ranking.
- **P9. Saving (W17, W27, R61, Review Focus 1).**
  - (a) Save calls `useEntrySave({ today, onSaved, savedHaptic: 'success' }).save({ draft, keypad, wallets, track })` with the plan's `track`: `source: guessed.size > 0 ? 'tell_bun' : 'typed'`, `categoryKey: analyticsCategoryKey(category)` (null for a move) and the opening's `openedAt`. The host sends no saved event of its own (a source pin, so 1D-T7's call in `finish` lands without touching this test).
  - (b) The tray is `locked` only while the status is `saving`. While `useEntrySave`'s `locked` holds (saving, unconfirmed, conflict) the entry is frozen, as Quick add freezes it: the switch is disabled, there is no back, and a row opens nothing. The host's own `close()` does nothing while a save is in flight.
  - (c) On `saved`: `onSaved(saved, { lookups, offline: saved.via === 'device' && diaryView.outcome?.status !== 'synced' })`, then the tray closes.
  - (d) `unconfirmed`: today's message and Try again (disabled while `resendBlocked`), which resends the very same command; `conflict`: today's words and Done, which closes the tray; `blocked`: Save disabled with today's words. In each the tray can be closed.
  - (e) The footer says the save's problem in today's words: its message, else the first field the check refused. The confirm step has no field slots, so a refused check (a copy whose category is closed) would otherwise give only a haptic. It is a polite alert, also said on iOS (`useAnnouncement`), as the steps' problems are.
- **P10. Tell Bun (R69, R106, R114).**
  - (a) บอกบัน opens today's `TellBunSheet`, unchanged, inside the tray's content on the amount step, so iOS presents it from the tray's window. Its `onUse` fills the draft through `applyDraft`; Bun's amount goes in as a fill; the rows it filled (category, wallet, day, note) become Bun's guesses (บันเดา) until the person changes them (`stillGuessed`); the step stays, and the person goes on with Next, as Quick add's form stays. An amount Bun could not read leaves what the person typed.
  - (b) No sentence: the sheet hands back only the draft, so confirm's `bunSentence` is null and its violet line is not drawn. The P3 plan brings the sentence with its own tell step (P3-T18, line 876) and keeps `TellBunSheet.render.test.tsx` unchanged, so `onUse` cannot gain an argument here. An E2-B difference (P18).
  - (c) So P2-T15's confirm m1 is pinned the other way its note offers: one mount in `AddSteps.render.test.tsx`'s private-mode case, a sentence beside a typed amount, whose line must be the hidden words (the confirm's mutant R3, here C1).
  - (d) The sheet gets no often-logged entries: their labels end with the amount in digits, past private mode (R106). The amount step's quick chips offer the same entries, masked. In private mode the open sheet still shows what the person types and Bun's reading of it, as today's sheet does: the person's own words at that moment, as a typed amount shows (R106). A note for E2-B and P2-T37 (P19).
- **P11. The quick chips (P2-T14's notes).** The current type's often-logged entries (`oftenLogged` over the recent-use read, with no top limit, then by type; `QuickChips` shows three), each named by its place (`draft.merchant`), never `OftenLogged.label`. A chip fills the entry through `applyDraft`, its amount as a fill; none of it is Bun's guess, so it saves as typed.
- **P12. Before the entry starts.** In the tray, in today's words: the lists loading (the spinner named "Loading your wallets"); a load problem's message with Try again when it can help; a copy that is gone, with Start a new entry; no wallet yet ("No wallets yet", "Add a wallet on the home screen first."). The tray's title is the request's type's.
- **P13. The sections** (`bw-tray-saving`, `bw-tray-unconfirmed`, `bw-tray-add-large`, the plan's ids). Each draws the real host on the golden fakes, online, on a screen section's stage (`screenSection`: its own fakes and a script), as a kit section beside the add tray's others, since the tray covers the page and its title names the dialog. A screen layout would need a heading of the page's own (the screen-reader suite's rule), which a tray section does not have. The stage opens the tray once; the first two scripts type 5 and 0, go on and save, with the save held (`saving`) or lost (`unconfirmed`); `bw-tray-add-large` opens the tray for an AX5 capture by hand. Titles `Bun Wallet: add tray, saving`, `Bun Wallet: add tray, not confirmed` and `Bun Wallet: add tray, largest text` (R72). No section imports the harness.
- **P14. The test seams, each explained in the test file's header or beside its use.**
  - A probe inside the host keeps the latest `useAddTray()`, so a case opens, closes and waits as P2-T17, P2-T18 and P2-T30 will.
  - Reanimated keeps the tray's card, and each new step's content, unseen until an `animationstart` that happy-dom never fires: `startAnimations()` after every opening and step change (`tap`), as the steps' tests do.
  - Today's sheet is wrapped so its props are kept; a case hands the host a draft as the sheet's Use this does (`onUse`, then `onClose`).
  - On the web every Modal is its own layer, so the sheet's place inside the tray is read through the tray: the sheet goes the moment the tray's content does, while a sheet beside the tray would stay until the entry goes (P2-T13's note; mutant H3). The lock cover cannot tell them apart, since `Sheet` hides itself under the cover too.
  - The swipe during a save goes through Gesture Handler's own web pointer path, with every element given a box (the P2-T13 review's n4 and probe 1).
  - The iOS announcement is read by switching `Platform.OS` around the save, as the private-mode suite does.
  - The fake router is the catalogue's `routerTestStub`; `expo-crypto` is mocked as the catalogue suites mock it.
- **P15. The cases beyond the plan's.** The plan's eight: open and `record_started`; a device save and the track; a save in flight closed by nothing (with the swipe through the real pointer path, n4); unconfirmed with Try again; Tell Bun's guesses and `tell_bun`; the sheet inside the tray; blocked; AX5. Nine more: the steps and the type rule (P7); a request's type and wallet (P6a); `whenClosed` and an open during the exit (P5); outside a host (P6d); the quick chips and the sheet's chips (P10d, P11); before the entry starts (P12); the first-touch rule (P8); a copy and a refused save (P6b, P9e); the sections (P13). The cases that draw words run in Thai, and the first two in English too (and the first in both modes); the rest in Thai by day.
- **P16. 86 mutants, all killed.** They cover the host (H1 to H77; H1 to H3 are the plan's three), the copy (K1), the sections (S1 to S6), the tray's c-n1 guard (T1, run against `Tray.render.test.tsx`) and the confirm's m1 guard (C1, run against `AddSteps.render.test.tsx`). Every kill is an `AssertionError`; none survives, and none is marked equivalent. The planner removed two guards that no case could reach (a copy-only branch in the first draft, and a `visible` check in `close`) rather than leave equivalent mutants. One defensive branch stays unpinned on purpose: `keypadOf`'s `catch`, for a copied amount the keypad cannot hold, which the server never sends; it opens the copy empty instead of throwing during render, as Quick add's `keypadFor` does.
- **P17. The gate (R100).** Run: `typecheck:app`; the focused file RED to GREEN; the Node files the add folder and the tray hold, and P2-T3's draft check; the eleven neighbours (the render files that read the add folder, the tray or the wallet catalogue index, the controller's eight among them, and Quick add's suite and its hooks', the plan's Step 4); the catalogue's wallet sections in the every-section and screen-reader suites (`-t "bw-"`) and the registry rule; the four routes tests (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`, `PlanningRoutes`, each named) and the catalogue's route test (`catalogueRoute.render.test.tsx`, whose route loads the wallet's sections); `test:app`; `test:unit` (the Hermes guards); `git diff --check`. No route, config or app entry changes, so there is no `typecheck:routes` and no `export:web` locally; CI runs the full render suite, `export:web` and the iOS export. Nothing outside `apps/app` changes, so there is no API, edge or database suite; no package changes, so no `test:ops`.
- **P18. For E2-B (the owner's look at the daily loop), the differences from the boards and the plan's words:**
  - at AX5 the type is chosen on the amount step only (P7d);
  - after Tell Bun's sheet, confirm marks Bun's guesses (บันเดา) but has no "บันอ่านจาก" line: today's sheet gives no sentence (P10b);
  - the saving, not-confirmed, conflict and refused footers say today's lines; Save's busy words are the plan's กำลังบันทึก… (a draft in English);
  - the waiting states in the tray have no board (P12);
  - capture `bw-tray-saving`, `bw-tray-unconfirmed` and `bw-tray-add-large` each from a fresh launch (P2-T13's n2), and `bw-tray-add-large` at AX5 by hand (the large-text suite does not open the tray sections).
- **P19. Notes for later tasks** (the receipt carries them):
  - **P2-T17 (the saved moment):** `SavedContext` is `{ lookups, offline }`, and `onSaved` fires once per landed save, before the tray closes; open a toast from it, never a second tray, or wait with `whenClosed`.
  - **P2-T18 (the wallet shell):** mount `AddTrayHost` inside `SavedToastHost`, pass `blocked`, and give Magic Tap and the + `useAddTray().open`; `isOpen` is true from the opening until close is asked.
  - **P2-T30 (the over-budget moment):** open its tray through `useAddTray().whenClosed` (R69); a run queued while no tray is mounted runs at once.
  - **P2-T24 and P2-T26:** `open({ walletId })` starts on that wallet; `open({ copyOf })` copies as Quick add copies.
  - **P3-T13:** this host decides `track.source` from Bun's standing guesses (P9a), as the plan says; P3-T13 replaces that with the draft's origin and wires `useDraftReview`.
  - **P3-T18:** the tell step brings the sentence for confirm's line (P10b).
  - **P2-T37 (the sweep):** the open Tell Bun sheet shows what the person types and Bun's reading of it, as today's sheet does (P10d); confirm's title and note row are the model's text when Bun filled them (P2-T15's note).
  - **A tray follow-up:** at AX5, scroll the middle to its top when the type changes, or give the tray a pinned place under its header (P2-T14's P10 and its confirm review's P1; P7d).
  - **Device checks (SKIPPED):** Tell Bun's sheet presented over the tray on iOS (R69) and its keyboard; a swipe during a save, and Android's back, on a phone; a quick reopen while UIKit's dismissal ends (`whenClosed` waits); whether UIKit sends a dismissal for a present it refused while another was dismissing (P5d); VoiceOver hearing the save's problem.
- **P20. The followups that name this task (`followups.md`, 16 lines), each carried:**
  - line 56 (P2-T13's planner: the sheet inside the tray cannot be read from the page): P14, mutant H3;
  - lines 307 and 324 (tray-hardening before this task; keep the tray mounted until `onClosed`, open a second from it, `locked` while saving, the swipe through the real pointer path): tray-hardening merged (P1); P4, P5, P9b and the save-in-flight case;
  - lines 394 and 398 (P2-T14's interface: `AmountFooter`, `stepAfterAmount`, `amountProblem`, `stillGuessed`, `useCanTellBun`): all used as noted (P7);
  - line 400 (a tray slot under the header, "P2-T16 or a tray task"): left to a tray follow-up (P7d, P19);
  - line 409 (n-3: `whenClosed` treats a second call as nothing, and does not assume one call per hide): P5a, P5d;
  - lines 481 and 482 (R108): not this task's. R108 is P2-T24's ruling, and `todayOutMinor` is P2-T17's (plan line 1030), though the note calls it this task's; this host only hands on `SavedContext`;
  - line 559 (c-n1): P5c, mutant T1;
  - lines 562 and 565 (P2-T14's reviews: the switch at AX5 on confirm and the picks; a change to transfer goes to the transfer step): P7c, P7d;
  - line 568 (keep `onNaming` stable; `filledKeypad` for every fill): P7b, P6b;
  - lines 674 and 675 (P2-T15's confirm m1): P10c, mutant C1;
  - line 677 (R114.2: `TransferFooter` takes the same wallets as `TransferStep`): P7b, mutant H65.
- **P21. Clear of the work in flight; merge order.** #436 (P5-T2) merged before the proof's base and #435 (P3-T7) after it (P2); no PR into `claude/p1a-vault-core` was open when the brief was written. This task does not touch `index.ts`, so it merges cleanly before or after any task that adds a spread there. 1D-T7 (in planning) puts `trackRecordSaved` into `useEntrySave`'s `finish`, reading this host's `track`; nothing here asserts that no saved event is sent, so its merge leaves this test as it is (P9a).

---

## Step 0: Sync, and what this task waits for

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date.", or a fast-forward. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. What this task builds on has merged, and this task has not:
   - `grep -c "export function useEntrySave(" WT/apps/app/src/screens/redesign/entry/entrySave.ts`, `grep -c "export function analyticsCategoryKey(" WT/apps/app/src/spend/v1/redesign/planning/thaiPack.ts`, `grep -c "export function TransferFooter(" WT/apps/app/src/wallet/add/TransferStep.tsx`, `grep -c "export function trackRecordStarted(" WT/apps/app/src/analytics/events.ts` and `grep -c "const dismissed = () => {" WT/apps/app/src/wallet/tray/Tray.tsx`. Expected: `1` five times. If any prints `0`, report BLOCKED: "a task P2-T16 starts after has not merged (brief P1)", with the file.
   - `ls WT/apps/app/src/wallet/add/AddTrayHost.tsx WT/apps/app/src/wallet/add/AddTray.render.test.tsx WT/apps/app/src/dev/catalogue/wallet/addHostSection.tsx`: "No such file or directory" three times.
3. `/usr/bin/git -C WT diff --stat f034185e HEAD -- apps/app packages package.json package-lock.json`. Expected: `packages/contracts/src/v1/ai.ts` alone (#435, a comment; P2), or that and work merged since.
   - If it lists a file this task creates, report BLOCKED with the output.
   - If it lists one of the five files this task changes, go on: Step 2.1 or Step 4.1 applies that file's diff with `git apply --3way`.
   - If it lists a file this task's code calls into, go on, but name it in the receipt; a differing Expected line later is then a BLOCKED with this list: everything under `apps/app/src/wallet/add/`, `apps/app/src/wallet/tray/`, `apps/app/src/screens/redesign/entry/`, `apps/app/src/screens/redesign/ai/TellBunSheet.tsx`, `apps/app/src/spend/v1/ai/`, `apps/app/src/spend/v1/redesign/quickAddModel.ts`, `apps/app/src/spend/v1/redesign/planning/thaiPack.ts`, `apps/app/src/spend/v1/testing/`, `apps/app/src/analytics/`, `apps/app/src/dev/catalogue/screenSection.tsx`, `apps/app/src/dev/catalogue/screenFixtures.ts`, `apps/app/src/dev/catalogue/routerTestStub.tsx`, `apps/app/src/wallet/testing/walletHarness.tsx`, `apps/app/src/messages/en.json`, `apps/app/src/messages/th.json`.
   - Under `packages/`: go on, but name each file in the receipt; a differing Expected line later is then a BLOCKED with that list. `package.json` or `package-lock.json`: BLOCKED.
   - Any other file: go on. The focused counts this task does not change (N, C, R) are then your own Step 1.3 base, and the receipt names each merge.
   - Then run `/usr/bin/git -C WT log --oneline f034185e..HEAD`, and keep the merged PRs it lists for the receipt.
4. The five existing files: `shasum -a 256 WT/apps/app/src/wallet/add/copy.ts WT/apps/app/src/dev/catalogue/wallet/addSections.tsx WT/apps/app/src/wallet/wallets/WalletsList.render.test.tsx WT/apps/app/src/wallet/add/AddSteps.render.test.tsx WT/apps/app/src/wallet/tray/Tray.render.test.tsx`. Each equals its `orig/` line, except a file Step 0.3 listed. If anything else differs, report BLOCKED.

## Step 1: Install and the focused base

1. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
2. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The focused base (the per-file counts this task's Expected lines build on; R100: no whole-suite count):
   - `sh PL/tools/focused.sh WT S/base > S/base-focused.out 2>&1; cat S/base-focused.out`. Expected: `unit exit 0`, `neighbours exit 0`, `catalogue exit 0`, `registry exit 0`, and in its four logs:
     - `S/base-unit.log`: `ℹ tests 19`, `ℹ pass 19` (`addFlow.test.ts`, `amountStepNative.test.ts`, `addStepsNative.test.ts`, `trayGesture.test.ts`, `draftText.test.ts`);
     - `S/base-neighbours.log`: `Test Files  11 passed (11)`, `Tests  248 passed (248)` (`QuickAddScreen` 81, `entrySave` 9, `AddSteps` 17, `AmountStep` 15, `CardStack` 15, `Lock` 38, `WalletLooks` 13, `PrivateMode` 9, `walletHarness` 9, `Tray` 27, `WalletsList` 15). Call this count N. One `stderr |` block is today's, from `walletHarness`' intensity case ("Bun setting could not be saved."); it is not this task's;
     - `S/base-catalogue.log`: `Tests  90 passed` (forty-five wallet sections, two suites), more if a task in flight with sections merged first. Call this count C. Ignore the `skipped` count: it moves with the head;
     - `S/base-registry.log`: `Tests  1 passed`.
   - The routes tests and the catalogue's route test: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > S/base-routes.log 2>&1; echo $?`. Expected: 0, `Test Files  5 passed (5)`, `Tests  18 passed (18)` at the brief's base (`SpendRoutes` 3, `AccountRoutes` 2, `InsightsRoutes` 4, `PlanningRoutes` 6, `catalogueRoute` 3). Call this count R.

## Step 2: The tests, the copy and the typed stub (plan Step 1)

1. Copy:
   ```bash
   cp PL/real/apps/app/src/wallet/add/AddTray.render.test.tsx WT/apps/app/src/wallet/add/AddTray.render.test.tsx
   cp PL/real/apps/app/src/wallet/add/copy.ts WT/apps/app/src/wallet/add/copy.ts
   cp PL/real/apps/app/src/wallet/add/AddSteps.render.test.tsx WT/apps/app/src/wallet/add/AddSteps.render.test.tsx
   cp PL/real/apps/app/src/wallet/tray/Tray.render.test.tsx WT/apps/app/src/wallet/tray/Tray.render.test.tsx
   cp PL/stubs/apps/app/src/wallet/add/AddTrayHost.tsx WT/apps/app/src/wallet/add/AddTrayHost.tsx
   ```
   If Step 0.3 listed `copy.ts`, `AddSteps.render.test.tsx` or `Tray.render.test.tsx`, use `/usr/bin/git -C WT apply --3way PL/diffs/<that file's diff>` in place of its `cp`. It must apply with no conflict; otherwise report BLOCKED.
2. `shasum -a 256` the five files and compare: the `real/` lines for the four copied from `real/`, the `stubs/` line for `AddTrayHost.tsx`. A file applied with `--3way` equals its `real/` line only when its start was the `orig/` one. If a `cp` source is missing or a checksum differs, report BLOCKED.
3. Why the two neighbours' pins come now: each pins code that is right today (the tray's `onClosed`, the confirm step's private mode), so both pass at RED as at GREEN. `addSections.tsx` and `WalletsList.render.test.tsx` stay as at the start until Step 4, and `addHostSection.tsx` does not exist yet.
4. The stub, for reference: the real exported names and types, and no behaviour. `AddTrayHost` renders its children; `useAddTray()` returns a tray that does nothing.

`apps/app/src/wallet/add/AddTrayHost.tsx` (stub):
```tsx
@@FILE stubs/apps/app/src/wallet/add/AddTrayHost.tsx@@
```

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/tray/trayGesture.test.ts src/wallet/copy/draftText.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 19`, `ℹ pass 19`, `ℹ fail 0` (P2-T3's draft check reads the new copy line, which holds Thai letters).
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddTray.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  1 failed (1)`, `Tests  17 failed (17)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 17 and `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError|Not implemented' S/red-render.log` gives 0. Failing, each on an `AssertionError` from an asserting lookup:
@@REDLIST@@
   Compare with `PL/logs/red-render.list`.
4. The neighbours at RED: `sh PL/tools/focused.sh WT S/red > S/red-focused.out 2>&1; cat S/red-focused.out`. Expected: four exits 0; `S/red-unit.log` 19 of 19; `S/red-neighbours.log` `Tests  N + 1 passed` (249 at the brief's base: `Tray.render.test.tsx` has 28, the new c-n1 case passing on today's tray; `AddSteps.render.test.tsx` keeps 17, the m1 mount sitting in its private-mode case); `S/red-catalogue.log` `Tests  C passed` (90 at the brief's base); `S/red-registry.log` `Tests  1 passed`.

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/add/AddTrayHost.tsx WT/apps/app/src/wallet/add/AddTrayHost.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addHostSection.tsx WT/apps/app/src/dev/catalogue/wallet/addHostSection.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/addSections.tsx WT/apps/app/src/dev/catalogue/wallet/addSections.tsx
   cp PL/real/apps/app/src/wallet/wallets/WalletsList.render.test.tsx WT/apps/app/src/wallet/wallets/WalletsList.render.test.tsx
   ```
   If Step 0.3 listed `addSections.tsx` or `WalletsList.render.test.tsx`, use `/usr/bin/git -C WT apply --3way PL/diffs/<that file's diff>` in place of its `cp`. It must apply with no conflict; otherwise report BLOCKED.
2. `shasum -a 256` the eight files against their `real/` lines in `PL/SHA256SUMS` (all equal; a file applied with `--3way` only when its start was the `orig/` one). `/usr/bin/git -C WT status --short` shows exactly ` M apps/app/src/dev/catalogue/wallet/addSections.tsx`, ` M apps/app/src/wallet/add/AddSteps.render.test.tsx`, ` M apps/app/src/wallet/add/copy.ts`, ` M apps/app/src/wallet/tray/Tray.render.test.tsx`, ` M apps/app/src/wallet/wallets/WalletsList.render.test.tsx`, `?? apps/app/src/dev/catalogue/wallet/addHostSection.tsx`, `?? apps/app/src/wallet/add/AddTray.render.test.tsx` and `?? apps/app/src/wallet/add/AddTrayHost.tsx` (`M ` in the first column, staged, for a file `git apply --3way` wrote).
3. The code, for reference: the Appendix holds every new file and every diff (read them before the receipt; their headers say why). `AddTrayHost.tsx`: P3a, P4 to P12; `addHostSection.tsx` and `addSections.tsx`: P3b, P3c, P13; `copy.ts`: P18; the test: P14, P15.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `cd WT/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/tray/trayGesture.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 19`, `ℹ pass 19`, `ℹ fail 0`.
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddTray.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  17 passed (17)`, each case marked `✓`, and `grep -c '^stderr |' S/green-render.log` gives 0 (no `act(...)` warning and no `console.error`).
7. The neighbours, the catalogue's wallet sections and the registry rule: `sh PL/tools/focused.sh WT S/green > S/green-focused.out 2>&1; cat S/green-focused.out`. Expected: four exits 0, and: `S/green-unit.log` 19 of 19; `S/green-neighbours.log` `Tests  N + 1 passed` (249 at the brief's base; P2-T20's sections case now reads `bw-tray-add-large` before its own); `S/green-catalogue.log` `Tests  C + 6 passed` (96 at the brief's base: three sections, two suites), with each of `bw-tray-saving`, `bw-tray-unconfirmed` and `bw-tray-add-large` marked `✓` in both suites; `S/green-registry.log` `Tests  1 passed`.

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs the render file that holds its guard (`AddTray.render.test.tsx`, but `Tray.render.test.tsx` for T1 and `AddSteps.render.test.tsx` for C1), and restores the file with its SHA-256 checked. It takes thirty to seventy minutes, by the machine's load; run it in the background and wait for it to end. If it is cut short, a mutant can be left in place: copy the eight files from `real/` again (Steps 2.1 and 4.1, `AddTrayHost.tsx` from `real/`, not `stubs/`) and check them as Step 4.2 does; if `/usr/bin/git -C WT diff --stat -- apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/add/ConfirmStep.tsx` prints anything, report BLOCKED (never `git checkout` them). Then run the ids it had not reached: `python3 -I PL/tools/mutants.py WT S/mutant-logs <ids...>`, and give your receipt both outputs. Expected: exit 0, and these 87 lines (each line in your file also gives the file, the suite's counts, the first failing case, the AssertionError count and "restored sha256 equal"; compare with `PL/logs/mutants.out`):
   ```
@@MUTANTS@@
   ```
   H1, H2 and H3 are the plan's three mutants.
2. `shasum -a 256` the eight files against `real/` again, and run `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2. `Tray.tsx` and `ConfirmStep.tsx` (T1's and C1's files) are unchanged too: `/usr/bin/git -C WT diff --stat -- apps/app/src/wallet/tray/Tray.tsx apps/app/src/wallet/add/ConfirmStep.tsx` prints nothing.

## Step 6: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app > S/gate-1-typecheck.log 2>&1; echo $?`: exit 0.
2. `npm run test:app > S/gate-2-test-app.log 2>&1; echo $?`: exit 0, `ℹ fail 0`. (No count is expected here: CI holds the whole suites, R100.)
3. `npm run test:unit > S/gate-3-test-unit.log 2>&1; echo $?`: exit 0, `ℹ fail 0`. It holds the Hermes guards.
4. The focused files once more: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AddTray.render.test.tsx src/wallet/add/AddSteps.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/wallet/card/CardStack.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx > S/gate-4-focused.log 2>&1; echo $?`: exit 0, `Test Files  12 passed (12)`, `Tests  17 + N + 1 passed` (266 at the brief's base). The eight kit render files that import the wallet catalogue index (the controller's rule) are among them. A case that times out near 5 s in a file this task does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.
5. The routes tests and the catalogue's route test (the controller's rule): the Step 1.3 routes command with `S/gate-5-routes.log`. Expected: 0, `Test Files  5 passed (5)`, `Tests  R passed (R)` (18 at the brief's base), unchanged.
6. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): `typecheck:routes` and `export:web` (no route, config or app entry changes; CI runs `export:web`); the full render suite (CI, R100; the catalogue's every-section and screen-reader suites pick up the three sections there, and the large-text suite does not open them); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped); and device and simulator checks, all SKIPPED (P19's list) with E2-B's screenshots (the controller's, after P2-T28).

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T16.md` in the house style (see `docs/implementation/receipts/P2-T15.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T16: The add tray host: open, Tell Bun, save

- **Status:** built and verified locally on `p2/t16-add-tray-host` (`.claude/worktrees/p2-t16`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`. (The brief was proven at `f034185e`. Name each merged PR from `git log --oneline f034185e..HEAD`, and any shared file applied with `git apply --3way`.)
- **Files:** created `apps/app/src/wallet/add/AddTrayHost.tsx`, `AddTray.render.test.tsx` (17 cases), `apps/app/src/dev/catalogue/wallet/addHostSection.tsx` and this receipt; modified `apps/app/src/wallet/add/copy.ts` (`add.saving`), `apps/app/src/dev/catalogue/wallet/addSections.tsx` (three sections), `apps/app/src/wallet/wallets/WalletsList.render.test.tsx` (one line), `apps/app/src/wallet/add/AddSteps.render.test.tsx` (one mount, P2-T15's confirm m1) and `apps/app/src/wallet/tray/Tray.render.test.tsx` (one case, tray-hardening's c-n1).
- **What changed:** (opening and its one record_started; each entry above the tray; one tray at a time and whenClosed; the steps and the type; the first-touch rule; saving, locked while in flight, Try again, Done, the refused-save words; Tell Bun inside the tray, its guesses and no sentence; the chips; the waiting states; the sections; the copy; the three pins.)
- **RED to GREEN:** ... (Steps 3 and 4: the 17 render failures and their messages, with the Node files 19 of 19 at both; GREEN 17; the neighbours N to N + 1; the catalogue's wallet sections C to C + 6.)
- **Mutation check:** 86 mutants, all killed ... (one line per group, with the cases that kill it; H1 to H3 are the plan's.)
- **Gate** (worktree root): ... (Step 6, each command with its result; no whole-suite count, R100.)
- **Deviations:** the names and files beyond the plan's list (P3: `AddTray`, `addHostSection.tsx`, the sections as kit sections on a screen section's stage, the one line in P2-T20's test, no `now` prop); confirm quotes no sentence and the confirm's m1 pinned in `AddSteps` (P10b, P10c); the type chosen on the amount step at AX5 (P7d); the save's problem said above Save (P9e); `record_started` with no kind for a copy (P6c); the pins carried into two neighbours' tests (P5c, P10c); the E2-B differences (P18).
- **SKIPPED:** `typecheck:routes`, `export:web`, the full render suite and the iOS export (CI); `test:ops`; the API, edge and database suites; device and simulator checks (P19).
- **Risks:** on iOS a tray whose present was refused gets no `onClosed`, so a later open waits for it (P5d; the device check asks); in private mode the open Tell Bun sheet still shows the person's own words and Bun's reading of them (P10d).
- **Notes for later tasks:** (ruling P19, each.)
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/add/AddTrayHost.tsx apps/app/src/wallet/add/AddTray.render.test.tsx apps/app/src/dev/catalogue/wallet/addHostSection.tsx apps/app/src/wallet/add/copy.ts apps/app/src/dev/catalogue/wallet/addSections.tsx apps/app/src/wallet/wallets/WalletsList.render.test.tsx apps/app/src/wallet/add/AddSteps.render.test.tsx apps/app/src/wallet/tray/Tray.render.test.tsx docs/implementation/receipts/P2-T16.md`
2. `/usr/bin/git -C WT status --short`: those nine staged, nothing else (no log, no `dist/`). `/usr/bin/git -C WT diff --cached --check`: no output.
3. Write the message to `S/commit-message.txt`, ending with the `Co-Authored-By:` trailer naming the model you run as (for a Claude Haiku 5.5 implementer, `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`):
   ```
   Add the Bun Wallet add tray host for spending, income and moving money, on Quick add's save rules

   Add the add tray's host: opening an entry starts it with one
   record_started, on the request's type and wallet or as a copy; the
   amount, transfer, confirm and pick steps move as the plan says, and a
   change to transfer goes to the transfer step. Tell Bun's sheet opens
   inside the tray and its draft fills the entry as Bun's guesses; the
   quick chips are the type's often-logged entries. Saving runs Quick
   add's rules with the track: nothing closes the tray while a save is in
   flight, an unconfirmed save keeps Try again with the same command, and
   the host is told what landed. One tray at a time: whenClosed waits for
   the tray's Modal to hide. Add three catalogue sections, and pin the
   tray's onClosed on iOS and the confirm step's private mode.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 9 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (86 killed); each gate command with its result (no whole-suite count, R100); SKIPPED items; deviations (P3, P5c, P6c, P7d, P9e, P10b, P10c, P18); and what the reviewer should look at first: the save in flight (P9b: `locked`, the host's `close`, the frozen entry), one tray at a time (P5: `whenClosed`, an open during the exit), the type rule and the steps (P7c), Tell Bun with no sentence and its guesses (P10), private mode on every fill (P6b, P11), and the sections' lazy stage (P3b, P13).

---

## Appendix: the code

Read these; never copy or apply from this page. The files are in `PL/real/`, `PL/stubs/` and `PL/diffs/`.

`apps/app/src/wallet/add/AddTrayHost.tsx`:
```tsx
@@FILE real/apps/app/src/wallet/add/AddTrayHost.tsx@@
```

`apps/app/src/dev/catalogue/wallet/addHostSection.tsx`:
```tsx
@@FILE real/apps/app/src/dev/catalogue/wallet/addHostSection.tsx@@
```

`apps/app/src/wallet/add/AddTray.render.test.tsx`:
```tsx
@@FILE real/apps/app/src/wallet/add/AddTray.render.test.tsx@@
```

`PL/diffs/apps_app_src_wallet_add_copy.ts.diff`:
```diff
@@FILE diffs/apps_app_src_wallet_add_copy.ts.diff@@
```

`PL/diffs/apps_app_src_dev_catalogue_wallet_addSections.tsx.diff`:
```diff
@@FILE diffs/apps_app_src_dev_catalogue_wallet_addSections.tsx.diff@@
```

`PL/diffs/apps_app_src_wallet_wallets_WalletsList.render.test.tsx.diff`:
```diff
@@FILE diffs/apps_app_src_wallet_wallets_WalletsList.render.test.tsx.diff@@
```

`PL/diffs/apps_app_src_wallet_add_AddSteps.render.test.tsx.diff`:
```diff
@@FILE diffs/apps_app_src_wallet_add_AddSteps.render.test.tsx.diff@@
```

`PL/diffs/apps_app_src_wallet_tray_Tray.render.test.tsx.diff`:
```diff
@@FILE diffs/apps_app_src_wallet_tray_Tray.render.test.tsx.diff@@
```
