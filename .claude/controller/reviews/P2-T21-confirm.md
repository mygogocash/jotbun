# P2-T21 confirming review: the fix round (R115) on PR #429

- **Reviewer:** Claude Opus 5.5, the independent confirming reviewer, read-only. Nothing was edited, committed or pushed in any worktree or in the main checkout. `git status --short` in the task worktree is empty after my runs, and its HEAD is still `001babaa`.
- **Reviewed:** the commits after the reviewed head `2411001e` on `p2/t21-wallet-edit`, after `git fetch`:
  - `de3e6363`, the fix;
  - `001babaa`, the controller's merge of the integration head, which is PR #429's head.

  The integration head has since moved to `9e77a022`, a controller state sync that touches only `.claude/`.
- **Against:**
  - plan Task P2-T21 (line 1158), its Global Constraints and the rulings it cites;
  - R115 as the brief's P22 quotes it, and the brief `briefs/P2-T21-fix.md` (P22 to P35);
  - both earlier reviews, the implementer's logs in `scratch/p2-t21-fix/`, and the receipts `P2-T21.md` and `P2-T21-fix.md`.
- **Scratch:** `.claude/controller/scratch/p2-t21-confirm/`:
  - `tree/`: `git archive 001babaa`, `.claude/` removed, and the three `node_modules` linked from the worktree;
  - `logs/` and `tools/review_mutants.py`;
  - the probe files `tree/apps/app/src/wallet/wallets/NewWalletConfirm.render.test.tsx` and `WalletEditConfirm.render.test.tsx`. Each is a copy of the round's suite with my cases appended (`CONFIRM CP1` to `CP7` and `CE1` to `CE4`), so the cases use the suite's own helpers.

**Summary.** Most of the round holds:
- **R115.1 (M1):** step 2's back is held only while a create is out, and leaves once the answer is unknown.
- **R115.2 (m1, with the second review's W3 and W4):** the editor navigates once.
- **R115.3 (m2):** every pin kills its mutant, the money one (Y7) included.
- **R115.6 (n2):** the refused archive's ฿0 is masked.
- **The merge:** it keeps both sides' tests whole, and the catalogue keeps every section.
- **The evidence:** the six files equal the planner's kit, the implementer's numbers trace to their logs, and CI passes all nine jobs.

There is no blocker and no major. I found three minors and two nits:
- **m1:** R115.5 (n1) does not reach a phone. A `testID` makes the place a host view, but on Fabric the card is mounted beside it, not inside it. The card still falls about `insets.top + 268` pt. The code comment and both receipts say otherwise.
- **m2:** the flow's `leave()` is not once-only. Two quick presses on step 2's back, once a create's answer is unknown (this round's new path), pop two screens. Step 1's back does the same. R115.2 fixed exactly this in the editor.
- **m3:** leaving after a create that committed, but whose answer was lost, loses the chosen look for good, its kind included. No `wallet_added` is sent for that wallet. The receipt's Risks do not say so.
- **n1:** step 2's back after a refusal (P24) is not pinned.
- **n2:** the editor's unmount ref breaks under React's StrictMode.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. n1 is not fixed on a phone: on Fabric a `testID` keeps the place as a view, but the card is mounted beside it, so it still drops from above the scroll content's top.**
- **The code:** `NewWalletFlow.tsx:385` wraps the card in `<View testID="new-wallet-card-place">`. The comment at `:381-384` says: "A view with a test id is never flattened away on Fabric (ViewShadowNode), so on a phone too the place stays the card's parent."
- **React Native 0.88, in `node_modules`:**
  - `ReactCommon/react/renderer/components/view/ViewShadowNode.cpp:64-69`: `testId` sets only `FormsView` (`:66`). `FormsStackingContext` (`:44-62`) needs `collapsable={false}`, a `nativeID` (`:47`), opacity, a transform, or the like.
  - `ReactCommon/react/renderer/mounting/internal/sliceChildShadowNodeViewPairs.cpp:114-163`: a view that forms a view but no stacking context is a concrete view whose children are flattened.
    - Its children go into the ancestor's list, each with `frame.origin += layoutOffset` (`:104-107`).
    - `:176-178` gives such a view no host children.
  - React Native's own test says the same: `mounting/tests/StackingContextTest.cpp:384`, `somePropsForceViewsToMaterialize2`.
    - Node B has only `testId = "42"` (`:453`). It is materialized, but its children become the root's: "The root view has all 9 subviews" (`:481-482`).
  - The ceremony's scroll content lets its children flatten:
    - `Libraries/Components/ScrollView/ScrollView.js:1844` sets `collapsableChildren={!preserveChildren}`;
    - `Added` sets neither `maintainVisibleContentPosition` nor `snapToAlignment`.
- **Reanimated 4.7.1 measures the mounted view:**
  - `LayoutAnimationsProxy.cpp:1104-1120` starts the entering animation with `node->current`. That is the mutation's view, in its mounted parent's coordinates.
  - `LayoutAnimationsProxyCommon.cpp:391-406` then sets `targetOriginY`, and `targetGlobalOriginY` too, to that frame's `y`.
  - Reanimated's own `collapsable: false` (`src/css/component/AnimatedComponent.native.tsx:189`) is set on the card. It keeps the card's children inside the card; it does not put the card under the place.
- **So on iOS and Android:**
  - The card's mounted parent is still the scroll content, and `targetOriginY` is still about `insets.top + 68`.
  - `originY: -200` still falls about `insets.top + 268` pt (about 327 pt with a 59 pt inset), with the larger overshoot, exactly as before the round.
  - Only react-native-web, which never flattens a view, matches the case.
- **Untrue as written:**
  - the comment at `NewWalletFlow.tsx:381-384`;
  - `P2-T21-fix.md:34-35`: "It now falls 200 pt", and "So on a phone too, the place stays the card's parent";
  - `P2-T21.md:67` and `:80`: the device check and the E2-B check, "200 pt from its own place since the fix round, so about 44 pt of overshoot".

  The memory note `reanimated-entering-origin` carried the same claim; I corrected it (see the notes at the end).
- **Unpinned where it matters:** the case can only see the web DOM. N36 and N37 hold the structure and the test id; neither can tell whether the place forms a stacking context.
- **Fix:** one attribute, and a case can hold it.
  - **The fix:** give the place a prop that forms a stacking context: `nativeID="new-wallet-card-place"`.
    - It does form one (`ViewShadowNode.cpp:47`).
    - react-native-web draws it as the element's `id`.
    - Reanimated ignores a `nativeID` that is not a number of at most nine digits (`LayoutAnimationsProxyCommon.cpp:105-116`).
  - **My fix check FX3:** it adds exactly that attribute. The round's 16 NewWallet cases pass. Probe CP7 (`place.id === 'new-wallet-card-place'`) fails on the round's code (`expected [ '', true ] to deeply equal [ 'new-wallet-card-place', true ]`) and passes with FX3.
  - **Alternatives:**
    - `collapsable={false}` works on a phone too, but react-native-web drops it, so no case can hold it.
    - Or make `walletAddedEntering` start from the card's own place: a custom entering from `targetOriginY - 200`. No parent can undo that.
  - **Then:** correct the comment and the receipts' lines. Until it is fixed, the E2-B simulator check should expect the old fall.

**m2. The new-wallet flow's `leave()` is not once-only. Two quick presses on step 2's back, once a create's answer is unknown, pop two screens; so do two on step 1's back, as before.**
- **The code:**
  - `NewWalletFlow.tsx:128-131`: `leave()` calls `router.back()` (or `router.replace`) on every call.
  - Step 1's back (`:191`) calls it. Since this round, so does step 2's back once the answer is unknown (`:215`).
  - The editor now leaves once (R115.2, `WalletEditScreen.tsx:150-158`); the flow does not.
- **Two calls pop twice in expo-router 58:**
  - each `router.back()` queues a `GO_BACK` (`build/global-state/router.js:219-226`);
  - the tree reducer reduces each queued operation on the state the one before it left (`build/global-state/useNavigationTreeReducer.js:182-200`).
- **Probes:** two presses in one `act`, as the editor's W4 case presses:
  - CP1, step 2's back after a lost answer: `expected [ 2, [] ] to deeply equal [ 1, [] ]`;
  - CP2, step 1's back: `expected 2 to be 1`.
- **Why it matters:**
  - From the list (`returnTo=/spend/wallets`), a double tap on back with the answer unknown leaves the flow and the list too.
  - It is the second review's W4 (and the first review's m1) in the flow. This round made "two quick presses go back once" the editor's rule, and pinned it there.
- **Fix:**
  - A `left` ref in `leave()`, as the editor has. Fix check FX1: CP1 and CP2 pass.
  - One existing case then fails by its own design: "opened with ?setup=1 the ceremony returns to /spend/setup" presses step 1's back twice on one mount, to try both ways out. Split it with a fresh mount, as this round did for the editor's nothing-changed case.

**m3. Leaving with a create's answer unknown loses the chosen look for good when the create committed, and that wallet's `wallet_added` is never sent. The receipt's Risks do not say so.**
- **The code:** R115.1 says back then "keeps no look", and the code does exactly that. But the look carries the kind, and the kind exists nowhere else:
  - Jotbun's wallet has no kind (`packages/contracts/src/v1/wallets.ts`, `WALLET_KEYS`: archived, currency, id, name, opening_minor, tracking_start, version);
  - `lookOf` falls back to `derivedLook` (`WalletLooksProvider.tsx:161`), whose kind is `null` (`walletLooks.ts:30-37`);
  - WalletFields offers no kind, so the editor cannot set one.
- **Probe CP6** passes, by design:
  - Setup: a credit card whose create commits but whose answer is lost; then back.
  - The wallet exists, no look is kept (`{}`), no `wallet_added` is sent (`[]`), and the derived kind is `null`.
- **The consequence:**
  - The wallet appears in the list as a plain wallet, with a face and material from its id. It is not the credit card the person chose, and nothing in the wallet area can make it one.
  - Analytics count no new wallet.
  - Try again keeps both: the resend lands as `done`, through the same key or `isOwnCreate`, as PR8's case shows. Only leaving loses them.
- **Fix:** no code is needed for this merge. Add it to `P2-T21-fix.md`'s Risks, next to line 78's "a second one, with a new id", and to the E2-B list. The owner may want the look kept on leaving, since it is held and equals the track, or a kind in the editor (P2-T22).

### Nit

**n1. Step 2's back after a refusal is not pinned.** P24 says "a refusal (`problem`), blocked or not, keeps the first round's back to the kinds".
- **My mutants survive the round's 16 NewWallet cases:**
  - Z1, a refusal's back leaves the flow too: `const back = sending.phase === 'idle' ? () => setStep(1) : leave;`.
  - Z2, back is held after a refusal that blocks: `disabled: sending.phase === 'saving' || stuck`.
- **The code is right:** two probes pass, and they kill Z1 and Z2:
  - CP3: a create refused as `signed_out`. Back is enabled and shows step 1, with no router call.
  - CP4: a create refused with `upgrade_required`. เพิ่มกระเป๋า is held, back is enabled, and back goes to the kinds.
- **Fix:** add CP3 and CP4 as cases. They use the suite's own helpers.

**n2. The editor's unmount ref breaks under React's StrictMode: after the development double run, every `leave()` does nothing.**
- **The code:** `WalletEditScreen.tsx:153`, `useEffect(() => () => { left.current = true; }, [])`, sets the ref only in the cleanup. StrictMode's simulated unmount runs that cleanup once at mount, and nothing sets the ref back.
- **Probe CE2:** `<StrictMode><WalletEditScreen …/></StrictMode>`, then a press on กลับ: `expected +0 to be 1`. Back, a save that lands and an archive that lands would all go nowhere.
- **Not live today:** nothing in `apps/app`, expo-router 58 or React Native's `Libraries` wraps the app in StrictMode (I searched). But the wallet kit holds itself to the double run (`WalletRoot.render.test.tsx:124-131`). `SessionEndedScreen` and `DevicesScreen` use the same pattern; there the ref only gates state updates.
- **Fix (one line):** `useEffect(() => { left.current = false; return () => { left.current = true; }; }, [])`. Fix check FX2: the round's 15 WalletEdit cases and CE1 to CE4 pass.

## The controller's focus list, each checked

1. **R115.1, M1: holds, except m2 and m3.**
   - `disabled: sending.phase === 'saving'` (`NewWalletFlow.tsx:217`) holds back while a create or a resend is out:
     - the round's case covers the first create;
     - my CP5 covers a resend: back is `aria-disabled`, a press does nothing, and the create that lands shows the ceremony.
   - Once the answer is unknown, and after a blocked resend, back calls `leave()` (`:215`): `router.back()` once, or `replace` to the destination. No look is kept. The round's case covers this, PR2 included, and Y1, N33, N34 and N35 are killed.
   - Nothing can change the look under a pending command:
     - while `saving` or `unconfirmed`, the name, the faces, the materials and the keys are held (`locked`; PR8 covers the ten radios);
     - back never goes to the kinds then;
     - `setLook` (`:151`) reads the look of the render that sent the create, which is the look the track reported.
   - The list reads again on return:
     - the spend layout is a `Slot` (`app/spend/_layout.tsx`, whose own comment says the Slot unmounts a screen it does not draw);
     - `WalletsListScreen` reads with `useLoad` on mount (`:80`).
2. **R115.2, m1, W3 and W4: holds, except n2.**
   - One `leave()` (`WalletEditScreen.tsx:152-158`) covers every way out:
     - the header's back (`:255`);
     - a save that lands (`:183`) and an archive that lands (`:182`);
     - an unchanged บันทึก (`:224`);
     - the unmount (`:153`).
   - **Pressed twice:**
     - an unchanged save goes back once (the round's case; E38 killed);
     - the header's back goes back once (my CE1);
     - archive sends one archive and one `dismissTo` (CE4);
     - after a conflict starts the form over (a new `key`, so a fresh ref), back still leaves once (CE3).
   - **Back stays enabled while saving (P25).** The choice is right for the ways out that a held button cannot hold:
     - the system back pops the route, and the `Slot` unmounts the screen;
     - the layout's sign-out `Redirect`, or the analytics question in place of the `Slot`, also unmounts it.

     Each runs the cleanup, so a save that lands afterwards navigates nothing. The round's PR1 part and its "gone" part pin this, and E34 is killed.
   - **Could the form remount during a save, and so swallow the save's own back?**
     - Only if the wallets were read again meanwhile.
     - `useLoad` reads again only on `refresh` (after a conflict or a refused archive, both settled outcomes) or on a new `resources`.
     - `getSharedV1Resources()` is one shared object. So no.
3. **R115.3, m2: every pin kills its mutant.**
   - My sample includes:
     - Y7, the money one: `1 failed | 14 passed (15)` on "delete on the stored opening balance clears it to ฿0, and ฿0 is what is sent, with its reason";
     - Y1 and Y8.
   - The implementer's log has Y2 to Y6 and Y9 killed too: 134 of 134. Its `mutants.out` equals the planner's, because the lines are deterministic. Its per-mutant logs differ from the planner's in their timings, so the mutants were run, not copied.
4. **n1 and n2:**
   - **n1:** see m1. The place is right on the web; on a phone it is not the card's parent.
   - **n2 holds:**
     - `ArchiveRefused` (`:373-387`) shows ฿•••• and says `common.amountHidden` in private mode, otherwise `walletMoneyText('0')` and `spokenMoney('0', t)`;
     - it matches `ArchiveLater` (`:389-406`) exactly;
     - the round's case covers Thai and English, with private mode off and on, and E39 is killed.
5. **The merge: holds.**
   - `PlanningRoutes.render.test.tsx` at `001babaa` has four tests: `test.each(ROUTES)`, the wallets list case, P2-T21's new-wallet and edit routes case, and P2-T29's categories case. Against each parent, the only lines removed are the header comment's, so both sides' tests are whole, with both sides' imports and mocks.
   - The six round files equal the planner's `real/` (`shasum -a 256 -c SHA256SUMS.real-in-wt` on the head tree).
   - The catalogue keeps every section:
     - the wallet index spreads every list (kit, stack, tray, add, list, record, category, insights, recap, lock);
     - `walletListSections.tsx` still holds `bw-wallet-new-type`, `bw-wallet-new-form`, `bw-wallet-added`, `bw-wallet-edit` and `bw-wallet-correction` after the list's three;
     - the only change to `WalletsList.render.test.tsx` comes from the integration side: `bw-tray-pick-category` now comes before `bw-wallets`.
   - No package or lockfile changed in the merge.
6. **Left to the owner (E2-B):**
   - The first review's m3 (the tracking start) and a credit card's opening balance are stated, with their consequences, in both receipts.
   - The second review's n1, n2 and n4 touch no money and no privacy; none should block this merge:
     - **n1:** a reason is reused after a refusal; the amount sent is what was typed, and only the reason can be stale;
     - **n2:** it needs a wrong device clock;
     - **n4:** choosing a kind again resets the look.
   - Add m3 above to the owner's list.

## Mutants

- **The planner's: a sample of 12 of 134, run in my tree.** Y1, Y7, Y8, N33, N34, N35, N37, E33, E34, E36, E38 and E39 are all killed, each on an `AssertionError`, and each file was restored with an equal sha256 (`logs/planner-sample.out`).
- **Mine** (`tools/review_mutants.py`, `logs/review-mutants.out`):
  - Z1 and Z2 survive the round's suite, and CP3 and CP4 kill them (n1).
  - Z3 (step 2's back with no fallback when nothing is under it) is killed by the round's case.
- **Fix checks:** FX1 (m2), FX2 (n2) and FX3 (m1), each as described above, each restored.
- **After every run:** the tree's code files and the round's six files still match their checksums.

## Runs (mine)

- **The round's two suites at `001babaa`:** `Test Files 2 passed (2)`, `Tests 31 passed (31)`, with no `stderr |` (`logs/base-round.log`).
- **The probes** (`logs/probes.log`), 10 cases:
  - CP1 and CP2 (m2) and CE2 (n2) fail, and are findings;
  - CP3 to CP6, CE1, CE3 and CE4 pass.

  CP7 fails on the round's code (`logs/probe-cp7-real.log`) and passes with FX3.
- **The implementer's logs agree with the receipt:**
  - RED: `5 failed | 26 passed (31)`, with 5 `AssertionError`s.
  - GREEN and the gate: 31. The kit files: 141. The routes tests: 13. The rest: 112. The catalogue: 62. The registry rule: 1.
  - `test:app` 35, `test:unit` 1037 and the draft check 4, each with `fail 0`.
  - `export:web`: one `Web Bundled`. Both `diff --check` logs are empty.
- **Not run, as R100 says:** the whole suites, the exports and the database suites (CI below). There was no load flake.

## CI at `001babaa` (PR #429, run 43211193622, on the PR's merge ref)

All nine jobs pass:
- **Typecheck, unit, API, build** (with `typecheck:routes`): `test:app` 35, `test:unit` 1047 and `test:dev` 7, each with `fail 0`.
- **Render** (every file but the per-section suites): `Test Files 125 passed (125)`, `Tests 1599 passed (1599)`.
- **The three per-section shards:** 246, 188 and 228 passed, 662 between them.
- **Exports:** web, 4877 modules; iOS, 5843 modules.
- **Edge Worker, SQL integration and ops, and the release image:** pass.

## Notes for later tasks

- **A follow-up or a small fix round:** m1, m2 and n2 are each a line or two in this task's files, and each has a fix check above. m1 also needs its comment and the receipts' lines corrected. Add CP1, CP2, CP3, CP4 and CP7 as cases.
- **P2-T18 (`walletTab`):** once the bar is hidden on `/spend/wallet/*`, step 2's back is the flow's only way out while an answer is unknown. Land m2's once-guard first.
- **P2-T22:** a wallet's kind can only be chosen in the new-wallet flow (m3).
- **E2-B:**
  - Until m1 is fixed, the drop on the simulator still falls about `insets.top + 268` pt.
  - m3's lost kind.
  - The receipts' own E2-B list.
- **Memory:** the note `reanimated-entering-origin` said a `testID` keeps a wrapper as the card's parent on Fabric. I corrected it: the wrapper must form a stacking context.

VERDICT: Approved
