- **P1. Ready, and why this half exists.** The planner split P2-T18 in two (the shell brief's P2), at the controller's question. This half carries the followups P2-T18 must land before its shell mounts `SavedToastHost` and hides the bar on `/spend/wallet/*`:
  - line 838: P2-T17's reviews' m1 and m2;
  - lines 699 to 701: P2-T21's confirming review's m2;
  - and, since this edits `src/wallet/wallets`, the rest of line 699's list: m1, n1, n2 and the housekeeping.

  Every file is merged code (P2-T17 as `9cdc1f8`, P2-T21 as `c053999`). No package, lockfile change, Cloudflare resource, account setting or owner decision is needed. No copy changes. It shares no file with the shell's brief, so both can be built at once; this one merges first.
- **P2. The proof's base** is `90006f03` (code `ab350e48`, #457's merge, plus controller state). The proof tree borrowed the shell kit tree's installed packages by symlink: the same lockfile, manifest and contracts, compared with `cmp` and `diff` (`PL/HEAD.txt`).
- **P3. Today's total, race A and the closed diary** (both P2-T17 reviews' m1).
  - **The guard.** When the read lands, the toast shows a figure only if the read and the outbox are one moment: `moved` is `now.phase === 'ready' ? BigInt(now.appliedRevision) > BigInt(page.as_of_revision) : openAtStart.current`.
  - **The two cases it covers:**
    - **Race A.** A diary that has applied a revision past the read's may have reconciled the save away: committed after the read, and gone from the outbox before the read's answer is handled. That save is then in neither.
    - **The closed diary.** A diary open when the toast began and not open now has drafts the toast cannot see. `openAtStart` is the diary's phase when the toast mounted.
  - **Why "open when the toast began".** This is the reviews' "a diary no longer ready at landing", read literally. The Opus review names a device save, which always begins with an open diary. An online save made with the diary open counts the outbox's other drafts too, so it needs the same guard.
  - **The web, which never has a diary, still shows a figure.** P2-T17's own case holds it, and mutant H5 shows that case kills a guard that treats no diary as moved.
  - **Moved means unknown.** The toast says บันทึกแล้ว, P2-T17's stance for a page with more to read (its P4). A figure once shown still never moves.
  - **Revisions compare as numbers** (BigInt), never as text. As text "9" sorts after "10", which race B's case kills (H3).
- **P4. Race B** (the second review's m1, its prototype `scratch/p2-t17-second/probes/m1-prototype-fix.diff`).
  - **The rule.** `todayOutMinor` leaves out an `acknowledged` command whose `ackedRevision` is at or before the read's `as_of_revision`: it was committed when the read was made, so a read that does not list it saw it deleted since. `ackedRevision` and `as_of_revision` are the same counter (`executor.ts`, `history.ts`, the review's evidence).
  - **The input.** `readRevision` is optional, so the plan's signature and every existing caller and case stay as they are. With no read revision, or no committed revision, a command counts as before.
  - **The Node case** reads each call through a helper that turns a throw into an answer to compare, so a mutant that makes `BigInt(null)` or `BigInt(undefined)` throw is killed on an assertion (M5).
  - **Mutant M6's form.** M6 is "no read revision reads as the command's own", the non-throwing form of the same fault. With M6 as first written (the `!== undefined` check dropped), one of P2-T17's older cases calls `todayOutMinor` with no read revision and threw a `TypeError`. That kill was not clean, so the planner rewrote M6.
- **P5. The figure stays exact.** Every sum is BigInt, as before. The two new guards only leave out, or say unknown, and add nothing.
- **P6. PV1** (both P2-T17 reviews' m2; Opus's probe PV1). The case is the review's probe: private mode on, iOS set after the mount (before it, `ThemeProvider` reads the native store), a spy on `announceForAccessibility`, an online save, then Undo.
  - **What iOS hears:** `บันทึกแล้ว · วันนี้ ซ่อนยอดเงินอยู่`, then the Undo's answer.
  - **What it holds:** no announcement, drawn text or label in the toast holds a digit or the typed place.
  - **At RED.** The code was right, so the case passes at RED. It pins the guard against the reviews' mutant (M1 / O50a, here H7: the announcement built from the unmasked words), which no committed case killed. P2-T37's sweep cannot see announcements.
- **P7. The new-wallet flow is left once** (P2-T21's confirming review m2, fix check FX1).
  - **The fix.** A `left` ref in `leave()`, as the editor's has, so two quick presses on step 1's back, or on step 2's back once a create's answer is unknown, pop one screen. The probes CP1 and CP2 (rebuilt here, since the review's tree was cleaned) become one case.
  - **No unmount effect.** The flow's ways out are `leave()` and the ceremony's own, and the review asked only for the ref. The editor's unmount effect is what n2 is about (P10).
  - **The setup case.** "opened with ?setup=1 the ceremony returns to /spend/setup" pressed step 1's back twice on one mount, to try both ways out. Its second press is now a mount of its own, as the review said, and its assertions are unchanged.
- **P8. The card's place forms a stacking context** (the confirming review's m1, fix check FX3). `nativeID="new-wallet-card-place"` beside its test id: on Fabric a test id alone does not keep the place (in React Native 0.88's `ViewShadowNode` a `testID` makes a view but not a stacking context, and Fabric hoists such a view's children into the nearest ancestor that forms one), and a `nativeID` does. react-native-web draws it as the element's `id`, which the drop case reads (probe CP7). The comment above it now says so. The device check of the drop stays SKIPPED.
- **P9. Step 2's back after a refusal** (the confirming review's n1, probes CP3 and CP4). The code is right, so this one case, which runs both outcomes, passes at RED. It pins the guards the review's Z1 and Z2 broke:
  - a refusal (`signed_out`, `upgrade_required`) leaves back enabled, and back goes to the kinds with no router call;
  - เพิ่มกระเป๋า is held only for an update.

  The mutants are W4 and W5.
- **P10. The editor's ref survives StrictMode** (the confirming review's n2, fix check FX2). `useEffect(() => { left.current = false; return () => { left.current = true; }; }, [])`. Under React's development double run the simulated unmount ran the cleanup once at mount, and nothing set the ref back, so every `leave()` did nothing. The case (probe CE2) mounts the editor in `StrictMode` and presses back twice: one `router.back`. Nothing in the app wraps it in StrictMode today (the review searched), but the wallet kit holds itself to the double run.
- **P11. P2-T21's receipts** (the confirming review's m1 and m3; followups line 699's "Correct ... the receipts' lines" and "Housekeeping").
  - **`P2-T21-fix.md`:** line 34 now says the 200 pt fall holds on a phone only since this task, and line 35's claim is corrected: a `testID` makes a view but not a stacking context, and Fabric hoists its children. m3 (leaving with an unknown answer loses the chosen look and its `wallet_added`) is added to the risks after line 78.
  - **`P2-T21.md`:** lines 67 and 80 now say "since P2-T18a's `nativeID`".
  - **Why edit another task's receipts.** These are two other tasks' receipts, edited as the review asked, each change saying it is P2-T18a's. The protocol's "never rewrite another task's section" is about `premium-progress.md`'s sections. A receipt that still claims a phone fix that did not hold would mislead E2-B.
- **P12. The cases beyond the reviews' probes:**
  - the twin of race A (applied at the read's own revision, the save listed and counted once), which kills H2 (`>=`);
  - race B with the diary at 9 behind a read at 10, which also kills H3 (revisions as text);
  - the closed diary (P3).

  Each probe the reviews named is a case: R1's shape (race A), the overcount (race B), PV1, CP1 and CP2 (one case), CP3 and CP4 (one case), CP7 (an assertion) and CE2.
- **P13. 20 mutants, all killed,** every failing case an `AssertionError` (`first_errors.py`):
  - M1 to M6: race B's guard, its comparison and its two null checks;
  - H1 to H7: race A, its comparison, the closed diary, no diary, the read's revision and PV1's announcement;
  - W1 to W5: the flow's ref, its nativeID and the review's Z1 and Z2;
  - E1 and E2: the editor's ref, both halves.

  One foreground batch, about a minute.
- **P14. The gate (R100).** Run:
  - `typecheck:app`;
  - the focused files RED to GREEN;
  - `test:app`;
  - `test:unit` (the Hermes guards);
  - the four routes tests (the flow and the editor are screens the wallet routes load);
  - the eight kit render files (they import the wallet catalogue index, whose saved and wallets sections draw these screens);
  - the catalogue's `bw-saved` and `bw-wallet` sections in the every-section and screen-reader suites;
  - `git diff --check`.

  Not run: `typecheck:routes` and `export:web` (no route changes); the full render suite, the iOS export, the database suites and `test:ops` (CI's).
- **P15. Clear of the work in flight; merge order.** The approved PRs waiting on CI touch none of this task's ten files: #460 (`wallet/add/*`, `entrySave`, `quickAddModel`, `draftReview`), #461, #462, #463, and #456 (`wallet/records/*`, its route, `SpendRoutes`, `dateStep`, the record sections). The shell's brief (P2-T18) shares no file either. This task merges before P2-T18 (the shell brief's P2). Otherwise any order works.
- **P16. Notes for later tasks** (the receipt carries them):
  - **The wallet shell (P2-T18)** mounts `SavedToastHost` once these guards are in.
  - **The next task that edits `SavedToastHost.tsx` or `SaveFlight.tsx`** still has P2-T17's reviews' test-only pins from followups lines 850 onwards: the 00:30 Bangkok day, the toast's box and touches, where the chip starts.
  - **E2-B:** P2-T21's m3 (the owner's choice on a look lost when the flow is left with an unknown answer) and its drop on the simulator, now about 200 pt from the place with the `nativeID`.
  - **Device checks (SKIPPED):** the drop on a phone, VoiceOver hearing the masked toast in private mode, and two quick presses on back on a phone.
