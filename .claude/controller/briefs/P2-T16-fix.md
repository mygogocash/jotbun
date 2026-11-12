# Brief P2-T16 fix round: a conflict and Bun's words in private mode, the bound on a tray that never says it has gone, and the reviews' pins

You are the fixer for the P2-T16 fix round. PR #439 (branch `p2/t16-add-tray-host`, head `81f66c0e`) adds the Bun Wallet's add tray host. CI is green 9 of 9, and:
- the second review (`reviews/P2-T16-second.md`, Sonnet, money, the wallet and privacy) approved, with four minors (m1 to m4);
- the first review (`reviews/P2-T16.md`, Opus) says **Needs fixes**: one major (M1), two minors (m1, m2) and one nit (n1).

The controller ruled **R117** (quoted in P22 below). The planner wrote every file below and proved it in a scratch copy of `81f66c0e` (`git archive 81f66c0e`, its own `npm ci`):
- RED: the round's render suite over `81f66c0e`'s code, with no stub. `typecheck:app` exits 0, and 3 of 22 cases fail, each on an `AssertionError`;
- GREEN;
- 126 mutants, all killed, every failing case on an `AssertionError`;
- R100's fast local gate, with the eight kit render files, `test:unit` and the four routes tests, each file named.

You copy the planner's files, check them by checksum, prove RED, GREEN and the mutants in the worktree, run the gate, check the two receipts and commit. The planner wrote both receipts; you copy them and do not edit them. Do exactly what this brief says.

Read first:
1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only, and no whole-suite total as an expected value anywhere. R87 applies: the round's receipt is its own new file, `docs/implementation/receipts/P2-T16-fix.md`, and `P2-T16.md` takes the planner's correction; do not edit `premium-progress.md`.
2. The reviews: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T16.md` and `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/P2-T16-second.md`.
3. The first round's brief, `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T16.md`. Its rulings P1 to P21 stand, except where this brief's P22 to P35 change them.

## Paths and rules

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16` (branch `p2/t16-add-tray-host`, head `81f66c0e`, installed). Work only here. Do not merge the integration branch into it: the controller merges up (P23).
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix`, your scratch folder. Create it with `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix`. Your logs, the mutant runs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the round's five files at their repo paths: the host, the add tray's draft lines (`copy.ts`), the render suite, `P2-T16.md` corrected and `P2-T16-fix.md` (new);
  - `orig/`: the four of them that `81f66c0e` has, as it has them;
  - `diffs/`: one diff per file (`orig/` to `real/`, or nothing to `real/` for the new receipt), with repo paths `a/<path>` and `b/<path>` and full blob ids, and `p2-t16-fix.patch`, the whole round. `PL/logs/applycheck.log` proves the patch turns `orig/` into `real/` byte for byte. The Appendix prints them;
  - `tools/`: `files.sh` and `focused.sh` (the file lists), `stage.sh` (the planner's stages: base, RED, GREEN), `run.sh` (the planner's runs), `mutants.py` (the runner), `merge_mutants.py` (joins the runner's batches), `first_errors.py` (each failing case's error kind), `diffs.sh`, `diffcheck.sh`, `sums.sh`, `fill_brief.py` and `brief.template.md` (how this brief was built: every diff below is the `diffs/` file, and the mutant lines are `logs/mutants.out`, byte for byte);
  - `SHA256SUMS` (the kit, 27 files; check it from PL) and `SHA256SUMS.logs` (the planner's `logs/`);
  - three lists to check WT with `shasum -a 256 -c`, paths relative to WT:
    - `SHA256SUMS.orig-in-wt`: the four files as `81f66c0e` has them;
    - `SHA256SUMS.red-in-wt`: the three files as RED leaves them (the suite from `real/`, the two code files as `81f66c0e` has them);
    - `SHA256SUMS.real-in-wt`: the round's five files in their final form.
  - There is no `stubs/`: RED needs no stub (P31). `work/` is the planner's proof tree and `drafts/` its working notes and earlier runs; neither is in `SHA256SUMS`, and you never use them.
- Every shell call starts in a fresh directory, so every command below is written with full paths. Type each exactly. Git: `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 <command>`, one git command per call.
- Run one step at a time, in the foreground. Never run a test while a mutant batch (Step 4) is running: the runner changes the code files while it runs.
- No heavy lock is needed: no database suite and no workers pool. Docker is stopped and stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests, code or receipts to make them pass. One exception, a load flake: a case that times out near 5 s under load in a file this round does not touch. Rerun that file alone once, and record both runs. (The round's own bound case takes about 5 s by design and has a 20 s limit.)
- Every count you report comes from your own log in S. Never copy the planner's logs in place of one.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/add/AddTrayHost.tsx` | In private mode a conflict's line masks the amount Jotbun holds and says it is hidden (P24), and confirm draws none of Bun's words (P25). A hidden entry closes once, when its Modal says so or after 1.5 s (P26). 464 lines before, 505 after. |
| `apps/app/src/wallet/add/copy.ts` | One draft line, `add.noteHidden` (ซ่อนอยู่, Hidden), and the table's comment (P25). 52 before, 55 after. |
| `apps/app/src/wallet/add/AddTray.render.test.tsx` | 22 cases (17 before): five new (P24, P25, P26, P28) and four with a new part (P27, P28); a Modal that holds its dismissal back when a case asks, and two helpers (P26, P28). 875 before, 1113 after. |
| `docs/implementation/receipts/P2-T16.md` | The planner's correction: a line pointing to the fix round, the Risks line R117 makes untrue (with the first review's m2), and the P2-T37 note (P30). 51 before, 52 after. |
| `docs/implementation/receipts/P2-T16-fix.md` | **New**: the round's receipt (R87), written by the planner with the proven numbers (P30). 82 lines. |

Not in this round: `entrySave.ts` (R117.1: 1D-T7 edits it); `Tray.tsx` (the refused present is a tray follow-up, R117.3); `ConfirmStep.tsx`, `AmountStep.tsx`, `PickSteps.tsx` and `addFlow.ts` (the host hands confirm its title and rows, so P25 needs none of them); `TellBunSheet.tsx`; the sections, `addHostSection.tsx` and their tests; `en.json`, `th.json` (the masked conflict line is today's catalog line); any package or lockfile; `premium-progress.md`.

## Planner rulings (what this round decides, with the reason for each)

- **P22. R117, the controller's ruling of 12 November, quoted:**
  1. **M1 (both reviews): in private mode no save message carries an amount.**
     - While private mode is on and the save's status is `conflict`, the host draws and announces the conflict words with no amount: today's line with the masked amount (฿••••) drawn and `common.amountHidden` spoken, or a draft line in `add/copy.ts` (Thai first, a draft for E2-B). Your choice; say which and why.
     - Check every message `useEntrySave` can hand the host, and mask any other that carries an amount.
     - **The fix lives in `AddTrayHost.tsx` and `add/copy.ts` only. `entrySave.ts` stays unchanged:** 1D-T7 is building and edits it.
     - Pin: the reviews' PROBE-5 / P5 shape (no digit in `add-save-problem` or in the announcement, with private mode on), and a mutant that drops the private-mode branch.
  2. **Sonnet m3: in private mode, a merchant or note that Bun filled is not drawn verbatim at confirm.**
     - R114's reasoning applies: no mask keeps up with every form of an amount, and Bun's fills come from the same sentence.
     - Draw the tray's own title instead of a Bun-filled merchant, and a neutral note row for a guessed note. A merchant or note the person typed stays as typed (R106).
     - The owner may overrule this at E2-B. Pin it with probe P4a's shape.
  3. **Both reviews' m1: bound the iOS wedge in the host.** After `close()` on iOS, if `closed()` has not run within about 1.5 s, run it anyway.
     - It must stay idempotent per entry: a dismissal that arrives late changes nothing.
     - Pin it with a Modal that never ends, as the reviews' wedge probes do.
     - The refused present (no `onShow`, `visible: true` with nothing on screen) stays a tray follow-up with the device check before P2-T18. Say so in the receipt's Risks.
  4. **Opus n1:** pin "above Save": in `tray-footer`, `add-save-problem` comes before the button. Kills R8.
  5. **Sonnet m4:** pin the six unpinned guards with the reviewer's probes. One mutant per guard.
  6. **Opus m2 (no code change):** in the receipt's Risks, say that the lock's cover loses what the person typed into Tell Bun, and that this host is the first of the "later Sheet hosts" (followups.md line 509). The controller carries it to P2-T34, P3-T18 and E2-B.
- **P23. The base is `81f66c0e`, with no merge.** The fix commit goes on top of PR #439's reviewed head, and the controller merges the integration branch up afterwards. The planner proved every stage in `PL/work`, a `git archive 81f66c0e` with `.claude/` removed and its own `npm ci --ignore-scripts` (1416 packages). The worktree's four files match `orig/` (the planner compared them without git), and its lockfile is the proof's. The kit holds no git repository: `find PL -name .git` prints nothing, and the apply check ran with `GIT_CEILING_DIRECTORIES` in a folder that was then removed.
- **P24. M1: a conflict in private mode (R117.1).**
  - The choice: **today's line, masked.** While private mode is on and the status is `conflict`, the host draws `tc('This entry is already saved in Jotbun as {amount}. Check it in History.', { amount: HIDDEN_AMOUNT })`, gives the alert those words with `t('common.amountHidden')` in the amount's place (its `accessibilityLabel`), and announces the words (`useAnnouncement(said)`). Out of private mode, and for every other problem, the drawn line and its words are the hook's, as before.
  - Why not a new draft line:
    - it is R115's shape for the refused archive's ฿0 (P2-T21-fix's `ArchiveRefused`), the controller's last ruling of this kind;
    - it adds nothing to E2-B's copy pass, since the Thai is today's catalog line;
    - the sentence is the same in both modes with only the amount hidden, as every other amount in private mode is (R106).
    The `tc(...)` literal stays inline in both calls, so a scan of `tc` literals finds it. In English the words read "as Amount hidden", a draft for E2-B, as P2-T21-fix's line does.
  - The host does not need the held amount: `status === 'conflict'` is set only with that message (`entrySave.ts`, the `isOwnCreate` branch), so the host replaces the whole line.
  - **Every message `useEntrySave` can hand the host** (`problem` is its `message`, else the first check error, else the first server field error):
    - `message`: the conflict's line (masked here), `saveProblem`'s eight fixed lines and `localSaveProblem`'s three. No other holds a figure.
    - The check's errors (`buildQuickAdd`, and the tracking start). Its amount lines (the cap, an example, above zero) are deleted whenever the keypad refuses the amount (`if (!settled.outcome.ok) delete next.amount_minor`). The keypad refuses whatever they would, so none reaches the host. The rest name a field, a date or a length (120 and 500 characters).
    - The server's field errors (`FIELD_PROBLEMS`). `MINOR_OUT_OF_RANGE` holds the cap, ฿999,999,999.99, and `INVALID_MINOR` an example, 65 or 65.50. Both are constants, not the person's amount, and neither can reach this host: the keypad caps the amount and sends a plain satang string. The cap's words are already the sweep's exemption (P2-T14's note).
    So no other message is masked; the receipt names these constants for P2-T37.
  - `entrySave.ts` does not change.
  - The case (new): `in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden`. It runs in Thai and English, on both reviews' probe:
    - first, an answer lost says its usual words in private mode;
    - then the resend finds the entry saved as ฿99.00, on iOS. The drawn line, its words and the announcement are exact, and none holds a digit (`\p{Nd}`, so Thai digits too).
  - Mutants F1 (the private-mode branch dropped, R117's), F2 (every conflict masked, private or not), F3 (every problem in private mode is the conflict's), F4 (the line drawn with the words, not ฿••••), F5 (the words with ฿••••), F6 (no words of its own) and F7 (iOS told the drawn line).
- **P25. The second review's m3: Bun's words on confirm in private mode (R117.2).**
  - The rule follows `confirmTitle`'s own order (the merchant, else the note, else the category, else the tray's title). In private mode a title that would be a merchant Bun filled, or (with no merchant) a note Bun guessed, is the tray's own title (`t(trayTitleKey(type))`: จดรายจ่าย, จดรายรับ or โอนเงิน). A guessed note's row reads `add.noteHidden`, ซ่อนอยู่, and keeps its บันเดา.
  - What the person typed shows, out of private mode and in it (R106): a name typed in income's name field, and a note written in the note pick. A note stops being Bun's when the person changes it: `stillGuessed` drops it from `guessed`, as before.
  - The merchant has no row, so it has no guess in `guessed`. Adding one would change the track's `source` and the บันเดา marks. The host keeps `bunMerchant`, the place Bun last named: a merchant is Bun's while it is still that text. A later draft of Bun's that names no place keeps the earlier one (`filled.merchant ?? was`), as `applyDraft` keeps the field.
  - `add.noteHidden` is a draft line in `add/copy.ts`, Thai first, for E2-B: ซ่อนอยู่, Hidden. "Neutral" means it says a note is there and not what it says. The table's comment names the line.
  - Not in R117's scope, and recorded (receipt Risks, P2-T37, E2-B): Bun's words still show where the person edits them, in the open sheet (P10d), income's name field and the note pick's field. A note Bun guessed that is only spaces, with no merchant, gives the tray's title rather than the category; that is harmless.
  - The case (new): `in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows`. Its parts:
    - a note alone from Bun, which out of private mode is the title, then the person's own note, which shows;
    - the second review's P4a: a merchant and a note, each with the amount in it. No digit is left in confirm's text or its words;
    - Bun told again of the amount only;
    - a name typed for income, which shows.
  - Mutants F8 to F17 and K2.
- **P26. Both reviews' m1: the bound (R117.3).**
  - `CLOSED_BOUND_MS = 1500`. In `AddEntry`, an effect on `visible` arms a timer once the tray is hidden. It runs the entry's close, `leave`, which is `onClosed(entry)`; the tray's own `onClosed` is `leave` too. The host's `closed(gone)` does nothing unless `gone` is still the entry, so each entry closes once. A dismissal that comes late, after the bound or after a new tray opened, changes nothing (R117's "idempotent per entry").
  - The bound counts from the hide, so it covers `close()` and the close after a save lands.
  - It is armed on every platform, not only iOS. Off iOS the tray calls `onClosed` after its 220 ms exit (150 ms under Reduce Motion). That ends the entry, and the effect's clean-up clears the bound first. A platform check would be a guard no case could see, so its mutant would survive as equivalent. On iOS it is exactly R117's bound.
  - `show` and `closed` are `useCallback`s that keep one identity, so `leave` does too. Without that, every draw of the host's parent would restart the bound, and a busy parent could hold it off for ever.
  - The bound lives and dies with the entry. A host that goes away (a sign-out) while its tray leaves runs nothing queued: no stray `record_started` from an open that would never show.
  - Not settled here, and named in the receipt's Risks: the refused present (no `onShow`, the host `visible: true` with nothing on screen). Later opens are ignored and nothing on screen closes it. It is the tray follow-up's, with its device check before P2-T18. Also named: 1.5 s is a judgment, and a dismissal slower than that would end the entry while the Modal is still leaving.
  - The test's Modal (new, at the top of the suite) passes everything through unless a case sets `dismissals.hold`. Then it keeps the Modal's `onDismiss`, which is the tray's, instead of calling it, as UIKit does with a dismissal it never ends, so the case can send it late. `onIos(true)` switches to iOS for what follows, and gives react-native-web the `sendAccessibilityEvent` it lacks as a no-op, so a tray opened on iOS does not throw; `onIos(false)` and `afterEach` undo both.
  - The case (new): `on iOS a tray whose Modal never says it has gone closes anyway once the bound has passed: what waited runs once, and a late word changes nothing`. Its parts:
    - the tray is closed on iOS with its dismissal held. A queued run (P2-T30's kind) waits, and so does an open (the +);
    - past the bound, the entry goes: the income tray opens, and the run runs once;
    - the first tray's dismissal comes at last, and 1.6 s later the new tray is still open;
    - a host unmounted while its tray leaves sends nothing more.
    The timing never rests on a margin. Each check comes after a timer that falls due after the event it checks (the bound falls due 1500 ms after the close; the case's waits fall due at 250 and 1750 ms, then 1600 ms after the late dismissal and after the unmount). Timers fire in order of when they fall due, so a loaded machine delays the case but cannot reorder it. It takes about 5 s and has a 20 s limit.
  - Mutants F18 (no bound), F19 (no per-entry check: the late dismissal closes the new tray), F20 (the bound armed while open) and F21 (no clean-up: the bound outlives its entry).
- **P27. The first review's n1: "above Save" (R117.4).** The copy case (`a copy opens on the copied entry ...`) now checks, after Save is refused, that `add-save-problem` and the Save button are both in `tray-footer` and that the problem comes first (`compareDocumentPosition`). The first review's R8 is killed.
- **P28. The second review's m4: its six survivors (R117.5),** each pinned on its own probe. The code was already right, so these pass at RED:
  - M3 (P11): the Tell Bun case gains a last part, in which a note Bun wrote reads `โน้ต ค่าข้าวกับพี่ บันเดา`.
  - M4 and M5 (P2, P1): the case `the track names the category's key, income's own and none for a move, and a move keeps its amount and wallets exactly` (new). Income online (`3`, `000`, `0`, so ฿30,000 sent as `3000000`) has the key `salary`; a move kept on the phone (`50000`, main account to cash) has `null`.
  - M6 (P8): the case `Save refuses a day before the wallet started tracking, in today's words, and keeps nothing` (new), with a helper `walletRadio` for a pick's radio, which is named by the wallet and its balance.
  - M8 (P12): the waiting case gains a part in which an opening that names income is named จดรายรับ while its lists load.
  - M10 (P13): the `whenClosed` case gains a last part, in which an open that waited asks again when it runs and, blocked by then, opens nothing. It sits there, after that case's own checks, so the first round's H9 (a `whenClosed` that runs at once, which turns an open asked during a leave into an endless loop) still dies on an assertion first.
  - The runner also holds both reviews' other mutants (P32).
- **P29. The first review's m2 (R117.6), no code.** The lock's cover loses what the person typed into Tell Bun (the review's PROBE-L), and this host is the first of the "later Sheet hosts" (`followups.md`). Both receipts' Risks say so, as R115 put its m3 in both. The controller carries it to P2-T34, P3-T18 and E2-B.
- **P30. The receipts.** The planner wrote both, with the numbers this brief expects. You copy them in Step 3 and check them by checksum.
  - `P2-T16.md` gains the fix round's line after Status. Its Risks line is corrected, since a dismissal that never ends no longer holds later opens while a refused present still does, and it gains m2 (P29). Its P2-T37 note is corrected, since in private mode confirm no longer draws Bun's words.
  - `P2-T16-fix.md` is the round's receipt in the house style (see `P2-T21-fix.md`). Every number in it is an Expected line below: if one of your runs differs, you stop BLOCKED before the commit, so the receipt you commit is true.
- **P31. RED needs no stub.** The new cases use nothing `81f66c0e`'s code does not export: the new test ids, words and behaviour are runtime, not types. So RED is the round's suite over `81f66c0e`'s code:
  - `typecheck:app` exits 0 (proven, `PL/logs/red-typecheck.log`);
  - 3 of 22 cases fail, each on an `AssertionError` (Step 2).
  The 19 that pass are the first round's 17 cases, their new parts included, and the two new cases that pin code that was already right (P28).
- **P32. 126 mutants, all killed.**
  - The first round's 86 (`tools/mutants.py` of `scratch/p2-t16-planner`). H28, H30 and H41 are re-pointed at the lines this round moves.
  - The first review's R1 to R8, re-pointed where the code moved.
  - The second review's M2 to M8, M10, M11 and M13. Not run: M1, M9 and M12, the same edits as R1, R2 and H68; and M14, which that review found equivalent (a check error and a server error are never both present).
  - One mutant for each new guard: F1 to F21 and K2.
  - None survives and none is marked equivalent. Every failing case in every mutant's run fails on an `AssertionError` (`tools/first_errors.py`), as in the first round.
  - The runner takes about 28 minutes for the 126, so it runs in eleven foreground batches of twelve or fewer (Step 4), and `merge_mutants.py` joins them in the runner's order.
- **P33. The gate (R100, and R117's "as before, plus").** As the first round's, with each file named, in four render runs:
  - the round's suite;
  - the eight kit render files that import the wallet catalogue index (CardStack, WalletLooks, PrivateMode, walletHarness, Tray, Lock, AmountStep, WalletsList);
  - the four routes tests (SpendRoutes, AccountRoutes, InsightsRoutes, PlanningRoutes);
  - the first round's other render files (AddSteps, entrySave, QuickAddScreen, catalogueRoute).
  Then `typecheck:app`, `test:app`, `test:unit`, the add flow's and the tray's Node files with the draft check, and `git diff --check`. GREEN (Step 3) also runs the catalogue's wallet sections and the registry rule. `typecheck:routes` and `export:web` are not run: no route, config or app entry changes, as in the first round. CI runs `export:web`, the full render suite, the iOS export, the database, edge and image jobs and `test:ops`.
- **P34. Not carried, and why.** R117 rules on six items. The second review's n1 (a refused save's words stay until the next Save), n2 (`fill()` has no guard where `keypadOf()` has one) and n3 (an `onSaved` that throws leaves a dead Save) stay as it recorded them, as do both reviews' notes for later tasks: PROBE-4 for 1D-T7, P2-T17, P2-T26, P2-T30, P3-T13, and closing from `unconfirmed`. The receipt names them.
- **P35. Commit.** One commit on `81f66c0e`: `Mask a conflict's amount and Bun's words in private mode, and bound closing`, with the body in Step 7 and the trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

---

## Step 1: Check the base

1. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 status --short`. Expected: no output.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 rev-parse --short HEAD`. Expected: `81f66c0e`. Then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 branch --show-current`. Expected: `p2/t16-add-tray-host`.
3. `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix`
4. The kit, checked from PL: `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0`. Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner && shasum -a 256 -c SHA256SUMS | grep -c ': OK$'`. Expected: `27`.
5. The base files: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/SHA256SUMS.orig-in-wt`. Expected: four `OK` lines, exit 0. Then `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/docs/implementation/receipts/P2-T16-fix.md`. Expected: "No such file or directory".
6. `ls /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/node_modules/.package-lock.json`. Expected: the path is printed. Only if it is missing: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && npm ci --ignore-scripts --no-audit --no-fund > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/npm-ci.log 2>&1; echo $?`. Expected: 0.
7. The focused base:
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/base-typecheck.log 2>&1; echo $?`. Expected: 0.
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/tray/trayGesture.test.ts src/wallet/copy/draftText.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/base-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 19`, `ℹ pass 19`.
   - `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddTray.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/base-round.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  17 passed (17)`.

   Compare with `PL/logs/base-typecheck.log`, `base-unit.log` and `base-round.log`.

## Step 2: RED (the round's suite over `81f66c0e`'s code)

1. Copy the suite:
   ```bash
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/real/apps/app/src/wallet/add/AddTray.render.test.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app/src/wallet/add/AddTray.render.test.tsx
   ```
   Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/SHA256SUMS.red-in-wt`. Expected: three `OK` lines, exit 0.
2. The RED typecheck: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/red-typecheck.log 2>&1; echo $?`. Expected: 0.
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddTray.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/red-render.log 2>&1; echo $?`. Expected:
   - exit 1, `Test Files  1 failed (1)`, `Tests  3 failed | 19 passed (22)`;
   - `grep -c '^AssertionError' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/red-render.log` gives 3;
   - `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError|Not implemented' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/red-render.log` gives 0;
   - `grep -c '^stderr |' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/red-render.log` gives 0.

   The 3 failing cases, each on an `AssertionError`:
   - `in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden`: `th: expected [ …(3) ] to deeply equal [ …(3) ]`
   - `in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows`: `expected [ 'ข้าวมันไก่ 65 บาท', …(1) ] to deeply equal [ 'จดรายจ่าย', 'โน้ต ซ่อนอยู่ บันเดา' ]`
   - `on iOS a tray whose Modal never says it has gone closes anyway once the bound has passed: what waited runs once, and a late word changes nothing`: `a dialog named จดรายรับ: expected null not to be null`

   Compare with `PL/logs/red-typecheck.log`, `PL/logs/red-render.log` and `PL/logs/red-render.list`.

## Step 3: GREEN

1. Copy the code and the receipts:
   ```bash
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/real/apps/app/src/wallet/add/AddTrayHost.tsx /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app/src/wallet/add/AddTrayHost.tsx
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/real/apps/app/src/wallet/add/copy.ts /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app/src/wallet/add/copy.ts
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/real/docs/implementation/receipts/P2-T16.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/docs/implementation/receipts/P2-T16.md
   cp /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/real/docs/implementation/receipts/P2-T16-fix.md /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/docs/implementation/receipts/P2-T16-fix.md
   ```
   Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/SHA256SUMS.real-in-wt`. Expected: five `OK` lines, exit 0.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 status --short`. Expected: these five lines, in any order, and nothing else:
   ```
    M apps/app/src/wallet/add/AddTray.render.test.tsx
    M apps/app/src/wallet/add/AddTrayHost.tsx
    M apps/app/src/wallet/add/copy.ts
    M docs/implementation/receipts/P2-T16.md
   ?? docs/implementation/receipts/P2-T16-fix.md
   ```
3. The code, for reference: the Appendix prints every diff. Read them before Step 7.
4. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. The add flow's and the tray's Node files, with the draft check: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/tray/trayGesture.test.ts src/wallet/copy/draftText.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 19`, `ℹ pass 19`, `ℹ fail 0`.
6. The round's suite: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/add/AddTray.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  1 passed (1)`, `Tests  22 passed (22)`, and `grep -c '^stderr |' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-render.log` gives 0.
7. The eight kit render files, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-kit8.log 2>&1; echo $?`. Expected: 0, `Test Files  8 passed (8)`, `Tests  142 passed (142)`.
8. The four routes tests, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-routes4.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  15 passed (15)`.
9. The first round's other render files, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AddSteps.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-rest.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  110 passed (110)`.
10. The catalogue's wallet sections, in both suites: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-catalogue.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  96 passed | 572 skipped (668)`. Then the registry rule: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/green-registry.log 2>&1; echo $?`. Expected: 0, `Tests  1 passed | 343 skipped (344)`.

   Compare with `PL/logs/green-*.log`.

## Step 4: Mutation check

Run the 126 mutants in eleven batches, one batch per call, each in the foreground (about three minutes each; nothing else may run meanwhile). First `mkdir -p /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches`. Then, one at a time:

```bash
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs H1 H2 H3 H4 H5 H6 H7 H8 H9 H10 H11 H12 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-00.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs H13 H14 H15 H16 H17 H18 H19 H20 H21 H22 H23 H24 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-01.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs H25 H26 H27 H28 H29 H30 H31 H32 H33 H34 H35 H36 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-02.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs H37 H38 H39 H40 H41 H42 H43 H44 H45 H46 H47 H48 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-03.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs H49 H50 H51 H52 H53 H54 H55 H56 H57 H58 H59 H60 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-04.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs H61 H62 H63 H64 H65 H66 H67 H68 H69 H70 H71 H72 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-05.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs H73 H74 H75 H76 H77 K1 S1 S2 S3 S4 S5 S6 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-06.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs R1 R2 R3 R4 R5 R6 R7 R8 M2 M3 M4 M5 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-07.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs M6 M7 M8 M10 M11 M13 F1 F2 F3 F4 F5 F6 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-08.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs F7 F8 F9 F10 F11 F12 F13 F14 F15 F16 F17 K2 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-09.out 2>&1; echo $?
python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs F18 F19 F20 F21 T1 C1 > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches/batch-10.out 2>&1; echo $?
```

Expected after each: 0, and `tail -1` of its file prints `12 killed, 0 survived, 0 not as expected` (batch 10: `6 killed, 0 survived, 0 not as expected`). After each batch, `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/SHA256SUMS.real-in-wt` gives five `OK` lines. If a call is cut short, a mutant may be left in a file: run that check, and if a file fails it, `cp` that file again from `PL/real/` as Step 3.1 does, check again, and rerun the whole batch.

Then join them: `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/merge_mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/mutants.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-batches /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutants.out`. Expected: `126 lines; 126 killed, 0 survived, 0 not as expected`. `tail -1 /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutants.out` prints:
```
126 killed, 0 survived, 0 not as expected
```
and `grep -c 'restored sha256 equal' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutants.out` gives 126. Then `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/first_errors.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs`. Expected: `126 logs, 0 with a failing case that is not an AssertionError`.

The planner's lines follow (from `PL/logs/mutants.out`, shortened to the mutant and the first case it fails), for comparison:
```
H1 KILLED: the tray is not locked while it saves (the plan's mutant) -> a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands
H2 KILLED: source typed after a Bun draft (the plan's mutant) -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H3 KILLED: the sheet rendered beside the tray (the plan's mutant) -> Tell Bun's sheet opens inside the tray
H4 KILLED: open ignores blocked -> while blocked, open does nothing
H5 KILLED: blocked is read only as it was first given -> while blocked, open does nothing
H6 KILLED: an open asked while the tray is open starts another entry -> open() shows the amount tray named จดรายจ่าย and sends one record_started
H7 KILLED: an open asked while a tray leaves opens at once -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
H8 KILLED: an open asked while a tray leaves is dropped -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
H9 KILLED: whenClosed runs at once with a tray open -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
H10 KILLED: what waited for a close runs again at the next -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
H11 KILLED: what waited for a close never runs -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
H12 KILLED: the host's close ignores a save in flight -> a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands
H13 KILLED: a save in flight is never reported to the host -> a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands
H14 KILLED: a copy's start says spending -> a copy opens on the copied entry with its amount as a fill and today's date, and sends no kind; a closed category is left to choose, and Save says so
H15 KILLED: the start ignores the request's type -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
H16 KILLED: no record_started -> open() shows the amount tray named จดรายจ่าย and sends one record_started
H17 KILLED: isOpen always false -> open() shows the amount tray named จดรายจ่าย and sends one record_started
H18 KILLED: outside a host open does nothing -> outside a host, open pushes today's Quick add with the request
H19 KILLED: outside a host the request's params are dropped -> outside a host, open pushes today's Quick add with the request
H20 KILLED: outside a host whenClosed never runs -> outside a host, open pushes today's Quick add with the request
H21 KILLED: the tray stays open after a save lands -> saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track
H22 KILLED: the host is not told of a save -> saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track
H23 KILLED: offline ignores the diary's last outcome -> saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track
H24 KILLED: offline ignores where the save went -> a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands
H25 KILLED: a save kept on the phone plays Quick add's queued tap -> saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track
H26 KILLED: no category key in the track -> saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track
H27 KILLED: openedAt is when Save is pressed -> saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track
H28 KILLED: a save's field error is not said -> Save refuses a day before the wallet started tracking, in today's words, and keeps nothing
H29 KILLED: the save problem is not an alert -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
H30 KILLED: the save problem is not said on iOS -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
H31 KILLED: Try again despite a refused resend -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
H32 KILLED: Try again does not resend -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
H33 KILLED: Done does not close a conflict -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
H34 KILLED: Save is not busy while saving -> a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands
H35 KILLED: Save despite a refusal that blocks it -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
H36 KILLED: a new entry ignores the request's type -> the track names the category's key, income's own and none for a move, and a move keeps its amount and wallets exactly
H37 KILLED: a new entry ignores the request's wallet -> Save refuses a day before the wallet started tracking, in today's words, and keeps nothing
H38 KILLED: a move does not leave the request's wallet -> open with a type and a wallet starts there: the wallet spent from or paid into, or the one a move leaves
H39 KILLED: a move's other side stays on the request's wallet -> open with a type and a wallet starts there: the wallet spent from or paid into, or the one a move leaves
H40 KILLED: a copy's amount opens as typed, not a fill -> a copy opens on the copied entry with its amount as a fill and today's date, and sends no kind; a closed category is left to choose, and Save says so
H41 KILLED: Bun's rows are not its guesses -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H42 KILLED: a chip's rows are taken for Bun's -> the quick chips are the type's often-logged entries, named by place and filled as fills; Bun's sheet offers none of its own
H43 KILLED: Bun's amount goes in as typed, not a fill -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H44 KILLED: an amount Bun could not read clears what was typed -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H45 KILLED: an empty field of Bun's counts as its guess -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H46 KILLED: Bun's day is not its guess -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H47 KILLED: the first touch fixes nothing -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H48 KILLED: no defaults from the recent-use read before the first touch -> until the first touch the default category follows the recent-use read; after it, nothing moves
H49 KILLED: a key is not a touch -> until the first touch the default category follows the recent-use read; after it, nothing moves
H50 KILLED: a step change is not a touch -> until the first touch the default category follows the recent-use read; after it, nothing moves
H51 KILLED: a change to the draft is not a touch -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H52 KILLED: a row opens its pick while the entry is frozen -> a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands
H53 KILLED: the step that opened a pick is not kept -> a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step
H54 KILLED: a new type keeps every step -> a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step
H55 KILLED: a pick counts as itself, not its opener, for a new type -> a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step
H56 KILLED: the type can change while the entry is frozen -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
H57 KILLED: back on the amount step -> open() shows the amount tray named จดรายจ่าย and sends one record_started
H58 KILLED: back while the entry is frozen -> a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands
H59 KILLED: back from confirm and the transfer step goes to confirm -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
H60 KILLED: back from a pick goes to confirm -> a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step
H61 KILLED: the switch is always the header -> at AX5 the tray is full height, its title pinned, and the type is chosen under the amount
H62 KILLED: at AX5 the step gets no switch -> at AX5 the tray is full height, its title pinned, and the type is chosen under the amount
H63 KILLED: the keypad's problem is not shown -> a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step
H64 KILLED: the name field's focus is ignored -> a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step
H65 KILLED: the transfer footer without the wallets (R114.2) -> the track names the category's key, income's own and none for a move, and a move keeps its amount and wallets exactly
H66 KILLED: no balances on the transfer step -> a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step
H67 KILLED: confirm quotes a sentence the sheet never gave -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
H68 KILLED: the day has no lower bound -> a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step
H69 KILLED: Tell Bun's sheet cannot be closed -> Tell Bun's sheet opens inside the tray
H70 KILLED: Bun's sheet gets the often-logged entries -> the quick chips are the type's often-logged entries, named by place and filled as fills; Bun's sheet offers none of its own
H71 KILLED: chips of every type -> the quick chips are the type's often-logged entries, named by place and filled as fills; Bun's sheet offers none of its own
H72 KILLED: only the three often-logged entries of every type -> the quick chips are the type's often-logged entries, named by place and filled as fills; Bun's sheet offers none of its own
H73 KILLED: a chip named by the often-logged label, which ends with its amount -> the quick chips are the type's often-logged entries, named by place and filled as fills; Bun's sheet offers none of its own
H74 KILLED: the loading spinner says nothing -> the tray says while its lists load, offers Try again on a load problem and a new entry for a copy that is gone, and says when there is no wallet
H75 KILLED: no Try again on a load problem -> the tray says while its lists load, offers Try again on a load problem and a new entry for a copy that is gone, and says when there is no wallet
H76 KILLED: no new entry for a copy that is gone -> the tray says while its lists load, offers Try again on a load problem and a new entry for a copy that is gone, and says when there is no wallet
H77 KILLED: no words for no wallet -> the tray says while its lists load, offers Try again on a load problem and a new entry for a copy that is gone, and says when there is no wallet
K1 KILLED: Save's busy words lose their ellipsis -> a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands
S1 KILLED: the saving section lets the save land -> the host's sections come after the steps', and each opens in its state
S2 KILLED: the unconfirmed section's save is answered -> the host's sections come after the steps', and each opens in its state
S3 KILLED: the script never presses Save -> the host's sections come after the steps', and each opens in its state
S4 KILLED: the saving section under another id -> the host's sections come after the steps', and each opens in its state
S5 KILLED: the list imports the host -> the host's sections come after the steps', and each opens in its state
S6 KILLED: the stage never opens the tray -> the host's sections come after the steps', and each opens in its state
R1 KILLED: closed() leaves the entry in place -> open with a type and a wallet starts there: the wallet spent from or paid into, or the one a move leaves
R2 KILLED: closed() runs the queue before the entry goes -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
R3 KILLED: every touch takes the latest ranking (the first touch fixes nothing for the pick) -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
R4 KILLED: a row the person changes stays Bun's guess -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
R5 KILLED: one AddEntry reused across openings (no key) -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
R6 KILLED: the host's save flag never clears after a save -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
R7 KILLED: the tray locked while unconfirmed or in conflict too -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
R8 KILLED: the save's problem below Save, not above (the first review's n1) -> a copy opens on the copied entry with its amount as a fill and today's date, and sends no kind; a closed category is left to choose, and Save says so
M2 KILLED: every opening reuses the first entry key -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
M3 KILLED: a note Bun filled is not its guess -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
M4 KILLED: an income's analytics key is read from spending's category -> the track names the category's key, income's own and none for a move, and a move keeps its amount and wallets exactly
M5 KILLED: a move's analytics key is spending's category -> the track names the category's key, income's own and none for a move, and a move keeps its amount and wallets exactly
M6 KILLED: the save is not told the wallets (no check of the date against a wallet's start) -> Save refuses a day before the wallet started tracking, in today's words, and keeps nothing
M7 KILLED: the lookups handed on hold no categories -> saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track
M8 KILLED: the loading tray's title ignores the request's type -> the tray says while its lists load, offers Try again on a load problem and a new entry for a copy that is gone, and says when there is no wallet
M10 KILLED: an open that waited for a leaving tray ignores blocked once it runs -> whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)
M11 KILLED: the first touch does not carry the defaults into the draft -> until the first touch the default category follows the recent-use read; after it, nothing moves
M13 KILLED: the quick chips' drafts are applied with Bun's amount path off -> the quick chips are the type's often-logged entries, named by place and filled as fills; Bun's sheet offers none of its own
F1 KILLED: the conflict's amount drawn and said in private mode (the private-mode branch dropped) -> in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden
F2 KILLED: every conflict masked, in private mode or not -> an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes
F3 KILLED: every problem in private mode is the conflict's words -> in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden
F4 KILLED: the drawn line says the amount is hidden in words, not the mask -> in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden
F5 KILLED: the line's words draw the mask -> in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden
F6 KILLED: the problem has no words of its own -> in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden
F7 KILLED: iOS is told the drawn line, not its words -> in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden
F8 KILLED: the title quotes Bun in private mode -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
F9 KILLED: the title gives way to the tray's own out of private mode too -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
F10 KILLED: a name the person typed gives way too -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
F11 KILLED: a note Bun wrote is the title when Bun named no place -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
F12 KILLED: the place Bun named is never kept -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
F13 KILLED: a later draft that names no place forgets the one Bun named -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
F14 KILLED: Bun's guessed note drawn in private mode -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
F15 KILLED: a guessed note reads as hidden out of private mode too -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
F16 KILLED: every note reads as hidden in private mode, the person's own too -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
F17 KILLED: every row Bun guessed reads as hidden -> a draft from Tell Bun marks its fields guessed and saves with source tell_bun
K2 KILLED: the hidden note's words lose their Thai -> in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows
F18 KILLED: no bound: a hidden tray waits for its Modal for ever -> on iOS a tray whose Modal never says it has gone closes anyway once the bound has passed: what waited runs once, and a late word changes nothing
F19 KILLED: a late word from a gone entry closes the next one (no entry check) -> on iOS a tray whose Modal never says it has gone closes anyway once the bound has passed: what waited runs once, and a late word changes nothing
F20 KILLED: the bound runs while the tray is open -> on iOS a tray whose Modal never says it has gone closes anyway once the bound has passed: what waited runs once, and a late word changes nothing
F21 KILLED: the bound outlives its entry (no clean-up) -> on iOS a tray whose Modal never says it has gone closes anyway once the bound has passed: what waited runs once, and a late word changes nothing
T1 KILLED: the end calls the onClosed captured when the Modal hid (tray-hardening's c-n1, mutant M3) -> on iOS the end calls the onClosed given while the dismissal was under way, once, and never the earlier one
C1 KILLED: Bun's line quotes the sentence beside a typed amount in private mode (P2-T15's confirm m1, R3) -> private mode hides every balance, after line and move all and a fill on the amount line, and draws none of what the person told Bun; a typed amount shows
```
Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/SHA256SUMS.real-in-wt` again: five `OK` lines. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 status --short`: unchanged from Step 3.2.

## Step 5: The fast local gate (R100, with R117's files)

In this order, each with its log in S:

1. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && npm run typecheck:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/gate-1-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && npm run test:app > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/gate-2-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`. (No count is expected: CI holds the whole suites, R100.)
3. `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && npm run test:unit > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/gate-3-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ fail 0`.
4. The add flow's and the tray's Node files, with the draft check: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npm run test:unit -- src/wallet/add/addFlow.test.ts src/wallet/add/amountStepNative.test.ts src/wallet/add/addStepsNative.test.ts src/wallet/tray/trayGesture.test.ts src/wallet/copy/draftText.test.ts > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/gate-4-unit.log 2>&1; echo $?`. Expected: 0, `ℹ pass 19`, `ℹ fail 0`.
5. The round's suite: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AddTray.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/gate-5-round.log 2>&1; echo $?`. Expected: 0, `Tests  22 passed (22)`.
6. The eight kit render files, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/card/CardStack.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/lock/Lock.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/gate-6-kit8.log 2>&1; echo $?`. Expected: 0, `Tests  142 passed (142)`.
7. The four routes tests, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/gate-7-routes4.log 2>&1; echo $?`. Expected: 0, `Tests  15 passed (15)`.
8. The first round's other render files, each named: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/add/AddSteps.render.test.tsx src/screens/redesign/entry/entrySave.render.test.tsx src/screens/redesign/QuickAddScreen.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/gate-8-rest.log 2>&1; echo $?`. Expected: 0, `Tests  110 passed (110)`.
9. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 diff --check`. Expected: no output, exit 0. (After the commit, Step 7.5 checks the range.)

A case that times out near 5 s in a file this round does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.

Not run, and why (the receipt says so): `typecheck:routes` and `export:web` (no route, config or app entry changes; CI runs `export:web`); the full render suite (CI, R100; its per-section jobs open `bw-tray-saving`, `bw-tray-unconfirmed` and `bw-tray-add-large`); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` and the receipts changes; Docker is stopped); and the device checks, SKIPPED: a close and a quick reopen on an iPhone with the bound in place; a present that UIKit refuses (the tray follow-up's check, before P2-T18); VoiceOver hearing the masked conflict line in private mode; and the first round's list.

## Step 6: The receipts

The planner wrote both, and you copied them in Step 3.1 (P30). Check that they are unchanged:
`cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 && shasum -a 256 docs/implementation/receipts/P2-T16.md docs/implementation/receipts/P2-T16-fix.md`. Expected: the same two sums as their lines in `PL/SHA256SUMS.real-in-wt`. Every number in `P2-T16-fix.md` is one of this brief's Expected lines, which your runs matched. Do not edit either file.

## Step 7: Commit

1. Stage the five files:
   `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 add apps/app/src/wallet/add/AddTrayHost.tsx apps/app/src/wallet/add/copy.ts apps/app/src/wallet/add/AddTray.render.test.tsx docs/implementation/receipts/P2-T16.md docs/implementation/receipts/P2-T16-fix.md`
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 status --short`. Expected: four `M ` lines and one `A ` line (the five files), and nothing else: no log.
3. Write the message to `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/commit-message.txt`, exactly:
   ```
   Mask a conflict's amount and Bun's words in private mode, and bound closing

   In private mode a conflict's words mask the amount Jotbun holds and
   say it is hidden, and confirm draws none of Bun's words: a title they
   would make is the tray's own, and a note Bun guessed reads as hidden.
   A hidden tray whose Modal never says it has gone closes anyway after
   1.5 s, once per entry, so a later open and a queued run never wait
   for ever. Pin the save's problem above Save and the second review's
   six survivors, and correct P2-T16's receipt.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 commit -F /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/commit-message.txt`, then `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 log --oneline -2` (your commit on `81f66c0e`) and `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 show --stat HEAD` (5 files).
5. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t16 diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output, exit 0.

## Your final message

The orchestrator reads only this:
- First line: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker and its output).
- The commit SHA and branch: `p2/t16-add-tray-host`, one commit on `81f66c0e`.
- Files: 5 (the host, `copy.ts`, the render suite, `P2-T16.md` corrected, `P2-T16-fix.md` new); checksums: all five equal `real/`.
- RED: `typecheck:app` 0; 3 of 22 failed, each on an `AssertionError`.
- GREEN: 22 of 22, the Node files 19 of 19, the eight kit files 142 of 142, the four routes tests 15 of 15, the rest 110 of 110, the catalogue 96, the registry rule 1.
- Mutants: 126 killed, 0 survived; every failing case an `AssertionError`.
- The gate: each command and its result, with no whole-suite count (R100).
- SKIPPED: Step 5's list.
- Deviations: none from the brief's rulings (or each, with why).
- For the reviewer, first: the conflict's mask and the message sweep (P24), Bun's words and `bunMerchant` (P25), the bound, its per-entry check and why it is armed on every platform (P26).

---

## Appendix: the diffs

Each block is the file in `PL/diffs/`, byte for byte. Copy the `real/` files as Steps 2 and 3 say; do not apply these.

`apps/app/src/wallet/add/AddTrayHost.tsx`:
```diff
diff --git a/apps/app/src/wallet/add/AddTrayHost.tsx b/apps/app/src/wallet/add/AddTrayHost.tsx
index b60e6c665d49aa95371b01673077523f9892c5e3..ea65b9e63aa4d19839199687cdc104a3efb1a8fa 100644
--- a/apps/app/src/wallet/add/AddTrayHost.tsx
+++ b/apps/app/src/wallet/add/AddTrayHost.tsx
@@ -24,7 +24,10 @@
 //   content, so iOS presents it from the tray's window (R69). Its draft fills
 //   the entry through applyDraft, its amount as a fill (R106), and the rows it
 //   filled are Bun's guesses (บันเดา) until the person changes them. The sheet
-//   hands back no sentence, so confirm quotes none (P3-T18's step does). The
+//   hands back no sentence, so confirm quotes none (P3-T18's step does). Nor,
+//   in private mode, any of Bun's words (R117, as R114 hides its sentence): a
+//   title that would be a merchant or a note Bun filled is the tray's own, and
+//   a note it guessed reads as hidden; what the person typed shows (R106). The
 //   amount step's quick chips are the type's often-logged entries, named by
 //   their place only (R106), so the sheet offers none of its own.
 // - Saving is useEntrySave's save with the track (W27): Tell Bun's source while
@@ -34,14 +37,18 @@
 //   Focus 1); when it lands the host is told, with the lookups and whether it
 //   stayed on the phone unsynced, and the tray closes. An unconfirmed online
 //   save keeps today's frozen Try again, which resends the same command; a
-//   conflict says today's words with Done; either can be closed. A refused save
-//   says why above Save in today's words.
+//   conflict says today's words with Done; either can be closed. A conflict's
+//   words quote the amount Jotbun holds, so in private mode they mask it
+//   (฿••••) and say it is hidden (R117). A refused save says why above Save in
+//   today's words.
 // - One tray at a time (R69): whenClosed runs once the tray's Modal has hidden
 //   (onClosed), or at once with no tray; an open asked while a tray leaves
-//   waits for it. On iOS onClosed can come twice for two hides, and a second
-//   call finds nothing queued. It does not come at all for a Modal that never
-//   presented (the tray-hardening review's R-f): the entry then stays, hidden,
-//   and an open waits for it, which a device check is to settle.
+//   waits for it. Each entry closes once: an onClosed for an entry that has
+//   gone changes nothing. iOS hears onClosed only from the Modal's onDismiss,
+//   which never comes for a dismissal UIKit never ends (the tray-hardening
+//   review's R-f), so a hidden entry goes anyway once CLOSED_BOUND_MS has
+//   passed (R117). A present UIKit refused (shown, with nothing on screen) is
+//   still the tray follow-up's, with its device check before P2-T18.
 import type { AiDraft, CategoryDto, WalletSnapshot } from '@gogospend/contracts';
 import { useRouter } from 'expo-router';
 import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
@@ -70,6 +77,8 @@ import { EMPTY_KEYPAD } from '@mobile/ui/keypadExpression';
 import type { KeypadState } from '@mobile/ui/keypadExpression';
 import { COMMON_COPY } from '../common/copy';
 import { useDraftCopy } from '../copy/useDraftCopy';
+import { HIDDEN_AMOUNT } from '../money/walletMoney';
+import { usePrivateMode } from '../privacy/PrivateModeProvider';
 import { PrimaryButton } from '../tray/PrimaryButton';
 import { TextLink } from '../tray/TextLink';
 import { Tray } from '../tray/Tray';
@@ -100,6 +109,13 @@ const NONE: ReadonlySet<string> = new Set();
 const NO_WALLETS: readonly WalletSnapshot[] = [];
 const NO_CATEGORIES: readonly CategoryDto[] = [];

+/**
+ * How long a hidden tray waits for its Modal to say it has gone before its
+ * entry goes anyway (R117). iOS hears it only from UIKit's dismissal, which
+ * may never end; elsewhere the tray says so after its 220 ms exit.
+ */
+const CLOSED_BOUND_MS = 1500;
+
 /** Outside a host: today's Quick add, with what the request names as its params. */
 function quickAddParams(request: AddRequest): Record<string, string> {
   return Object.fromEntries(Object.entries(request).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
@@ -138,12 +154,12 @@ export function AddTrayHost({ children, onSaved, blocked = false }: {
   }, [blocked]);
   const queue = useRef<(() => void)[]>([]);
   const keys = useRef(0);
-  const show = (next: Entry | null, shown: boolean) => {
+  const show = useCallback((next: Entry | null, shown: boolean) => {
     now.current.entry = next;
     now.current.visible = shown;
     setEntry(next);
     setVisible(shown);
-  };
+  }, []);
   const value = useMemo<AddTray>(() => {
     const whenClosed = (run: () => void) => {
       if (now.current.entry === null) run();
@@ -170,11 +186,12 @@ export function AddTrayHost({ children, onSaved, blocked = false }: {
   const saving = useCallback((inFlight: boolean) => {
     now.current.saving = inFlight;
   }, []);
-  /** The tray's Modal has hidden: the entry goes, and what waited for it runs, once. */
-  const closed = () => {
+  /** The tray's Modal has hidden, or the bound ran out (R117): this entry goes, and what waited for it runs. Once per entry. */
+  const closed = useCallback((gone: Entry) => {
+    if (now.current.entry !== gone) return;
     show(null, false);
     for (const run of queue.current.splice(0)) run();
-  };
+  }, [show]);
   return (
     <AddTrayContext.Provider value={value}>
       {children}
@@ -231,7 +248,7 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
   entry: Entry;
   visible: boolean;
   onClose(): void;
-  onClosed(): void;
+  onClosed(gone: Entry): void;
   onSaving(inFlight: boolean): void;
   onSaved(saved: SavedEntry, context: SavedContext): void;
 }) {
@@ -241,6 +258,7 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
   const diaryView = useDiaryView();
   const canTellBun = useCanTellBun();
   const inHeader = useSwitchInHeader();
+  const { hidden } = usePrivateMode();
   const references = useEntryReferences({ copyOf: entry.request.copyOf ?? null });
   const ready = references.state === 'ready' ? references : null;
   const today = ready?.today ?? todayInBangkok(new Date());
@@ -263,6 +281,8 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
   const [guessed, setGuessed] = useState<ReadonlySet<string>>(NONE);
   const [naming, setNaming] = useState(false);
   const [telling, setTelling] = useState(false);
+  // The place Bun last filled (R117): while the entry's merchant is still it, private mode does not draw it on confirm.
+  const [bunMerchant, setBunMerchant] = useState<string | null>(null);
   // The entry starts once its lists are ready (a copy once it has loaded).
   if (ready !== null && live !== null && draft === null) {
     setDraft(startDraft(ready, entry.request, live));
@@ -280,9 +300,21 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
   useEffect(() => {
     onSaving(inFlight);
   }, [inFlight, onSaving]);
-  // The save's problem in today's words: its message, else the first field the check refused.
-  const problem = entrySave.message ?? Object.values(entrySave.errors)[0] ?? Object.values(entrySave.serverErrors)[0] ?? null;
-  useAnnouncement(problem);
+  // This entry's close: the tray's onClosed, or the bound's (R117), whichever comes first; the host takes it once.
+  const leave = useCallback(() => onClosed(entry), [onClosed, entry]);
+  useEffect(() => {
+    if (visible) return undefined;
+    const timer = setTimeout(leave, CLOSED_BOUND_MS);
+    return () => clearTimeout(timer);
+  }, [visible, leave]);
+  // The save's problem in today's words: its message, else the first field the check refused. A conflict's words
+  // quote the amount Jotbun holds, so in private mode they mask it, and say it is hidden (R117).
+  const conflictMasked = hidden && status === 'conflict';
+  const problem = conflictMasked
+    ? tc('This entry is already saved in Jotbun as {amount}. Check it in History.', { amount: HIDDEN_AMOUNT })
+    : entrySave.message ?? Object.values(entrySave.errors)[0] ?? Object.values(entrySave.serverErrors)[0] ?? null;
+  const said = conflictMasked ? tc('This entry is already saved in Jotbun as {amount}. Check it in History.', { amount: t('common.amountHidden') }) : problem;
+  useAnnouncement(said);

   /** The first touch fixes the category order and the draft's defaults (Quick add's rule). */
   const touch = () => {
@@ -301,7 +333,11 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
     if (current === null) return;
     const applied = applyDraft(current, filled);
     edit({ ...current, ...applied.fields });
-    if (bun) setGuessed((now) => new Set([...now, ...guessedBy(filled)]));
+    if (bun) {
+      setGuessed((now) => new Set([...now, ...guessedBy(filled)]));
+      // A draft that names no place keeps the one Bun named before, as applyDraft does.
+      setBunMerchant((was) => filled.merchant ?? was);
+    }
     if (applied.amountMinor !== null) setKeypad(filledKeypad(applied.amountMinor));
   };
   const goTo = (next: AddStep) => {
@@ -331,7 +367,7 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {

   if (current === null || ready === null || live === null) {
     return (
-      <Tray visible={visible} onClose={onClose} onClosed={onClosed} title={t(trayTitleKey(entry.request.type ?? 'expense'))} step="amount">
+      <Tray visible={visible} onClose={onClose} onClosed={leave} title={t(trayTitleKey(entry.request.type ?? 'expense'))} step="amount">
         <Waiting references={references} />
       </Tray>
     );
@@ -354,6 +390,11 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
     .filter((item) => item.draft.type === current.type)
     .flatMap((item) => (item.draft.amount_minor === null ? [] : [{ label: item.draft.merchant ?? '', amountMinor: item.draft.amount_minor, apply: () => fill(item.draft, false) }]));
   const rows = confirmRows(current, { lookups, today, dateLocale: locale, guessed, tc });
+  // Private mode draws none of Bun's words on confirm (R117, as R114 hides its sentence): a note it guessed reads as
+  // hidden, and a title that would be a merchant or a note it filled is the tray's own. What the person typed shows.
+  const shownRows = hidden ? rows.map((row) => (row.key === 'note' && row.guessed ? { ...row, value: t('add.noteHidden') } : row)) : rows;
+  const quotesBun = current.merchant.trim() !== '' ? current.merchant === bunMerchant : guessed.has('note');
+  const shownTitle = hidden && quotesBun ? t(trayTitleKey(current.type)) : confirmTitle(current, rows, t);

   // Inside the tray's content, so iOS presents it from the tray's window (R69).
   const tellBun = canTellBun ? (
@@ -390,11 +431,11 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
     middle = <TransferStep {...props} wallets={wallets} balances={ready.balances} />;
     footer = <TransferFooter {...props} wallets={wallets} />;
   } else if (step === 'confirm') {
-    middle = <ConfirmStep {...props} rows={rows} title={confirmTitle(current, rows, t)} bunSentence={null} type={current.type} lookups={lookups} />;
+    middle = <ConfirmStep {...props} rows={shownRows} title={shownTitle} bunSentence={null} type={current.type} lookups={lookups} />;
     footer = (
       <View style={{ gap: 8 }}>
         {problem === null ? null : (
-          <WalletText testID="add-save-problem" role="label" accessibilityRole="alert" aria-live="polite" style={{ textAlign: 'center' }}>
+          <WalletText testID="add-save-problem" role="label" accessibilityRole="alert" aria-live="polite" accessibilityLabel={said ?? undefined} style={{ textAlign: 'center' }}>
             {problem}
           </WalletText>
         )}
@@ -421,7 +462,7 @@ function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
     <Tray
       visible={visible}
       onClose={onClose}
-      onClosed={onClosed}
+      onClosed={leave}
       title={t(trayTitleKey(current.type))}
       header={inHeader ? typeSwitch : undefined}
       onBack={locked || step === 'amount' ? undefined : () => setStep(isPickStep(step) ? back : 'amount')}
```

`apps/app/src/wallet/add/copy.ts`:
```diff
diff --git a/apps/app/src/wallet/add/copy.ts b/apps/app/src/wallet/add/copy.ts
index cac4459b9d7b42996d8c2788482dc3882f3d97b6..046570eddccc3f461fd1129b88685d7aaa05199e 100644
--- a/apps/app/src/wallet/add/copy.ts
+++ b/apps/app/src/wallet/add/copy.ts
@@ -6,10 +6,11 @@ import type { DraftTable } from '../copy/draftText.ts';
  * ประเภทรายการ), the wallet chip, Tell Bun, income's name field and its budget
  * note, a quick chip's spoken words and the keypad's delete key (P2-T14); the
  * transfer step, the confirm step's rows and Bun's marks, and the pick steps
- * (P2-T15); Save's busy words (P2-T16). Data only: read through
- * `useDraftCopy`, with COMMON_COPY where a part also says an amount. Default
- * pending owner Q3: built as written; the English lines, and the Thai lines
- * marked draft (no board shows them), are drafts for E2-B.
+ * (P2-T15); Save's busy words (P2-T16), and a hidden note's (its fix round,
+ * R117). Data only: read through `useDraftCopy`, with COMMON_COPY where a
+ * part also says an amount. Default pending owner Q3: built as written; the
+ * English lines, and the Thai lines marked draft (no board shows them), are
+ * drafts for E2-B.
  */
 export const COPY = {
   'add.titleExpense': { th: 'จดรายจ่าย', en: 'Add spending' },
@@ -47,6 +48,8 @@ export const COPY = {
   'add.today': { th: 'วันนี้', en: 'Today' },
   // bw-tray-confirm's note row with nothing written.
   'add.addNote': { th: 'เพิ่มโน้ต', en: 'Add a note' },
+  // Draft (R117): in private mode a note Bun filled is not drawn, as its sentence is not (R114); one the person wrote shows.
+  'add.noteHidden': { th: 'ซ่อนอยู่', en: 'Hidden' },
   // P2-T16: Save while the save is in flight.
   'add.saving': { th: 'กำลังบันทึก…', en: 'Saving…' },
 } as const satisfies DraftTable;
```

`apps/app/src/wallet/add/AddTray.render.test.tsx`:
```diff
diff --git a/apps/app/src/wallet/add/AddTray.render.test.tsx b/apps/app/src/wallet/add/AddTray.render.test.tsx
index ae6ce411f3c901cd918c7d7cffc16072122b0b12..9d684f8705942f5ca50df7e336aa703a52c9ea06 100644
--- a/apps/app/src/wallet/add/AddTray.render.test.tsx
+++ b/apps/app/src/wallet/add/AddTray.render.test.tsx
@@ -19,12 +19,22 @@
 // nothing out, so every element is given a box (the P2-T13 review's probe 1).
 // Each haptic moment is recorded by name. react-native-web omits
 // aria-disabled when it is false.
+//
+// The fix round (R117) adds the cases for #439's reviews: a conflict in private
+// mode (both reviews' M1 and m2, their probes PROBE-5 and P5), Bun's words on
+// confirm in private mode (the second review's m3, its probe P4a), the bound on
+// a tray whose Modal never says it has gone (both reviews' m1, their wedge
+// probes), the save's problem above Save (the first review's n1, its R8), and
+// the second review's six survivors (M3 to M6, M8 and M10, its probes P1, P2,
+// P8, P11, P12 and P13). For the bound the Modal holds its dismissals back when
+// a case asks (`dismissals.hold`), as UIKit may.
 import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { readFileSync } from 'node:fs';
 import { dirname, join } from 'node:path';
 import { fileURLToPath } from 'node:url';
 import type { ReactElement } from 'react';
 import { AccessibilityInfo, Platform } from 'react-native';
+import type { ModalProps } from 'react-native';
 import { afterEach, expect, test, vi } from 'vitest';

 // The real safe-area package loads React Native itself, which vitest cannot run.
@@ -47,6 +57,23 @@ vi.mock('@mobile/screens/redesign/ai/TellBunSheet', async (importOriginal) => {
   return { ...actual, TellBunSheet: RecordedSheet };
 });

+// The Modal, which says it has gone at once unless a case holds its dismissals back (`hold`): a held one keeps the
+// Modal's own onDismiss (the tray's), as UIKit does with a dismissal it never ends, so the case can send it late.
+const dismissals = vi.hoisted(() => ({ hold: false, held: [] as (() => void)[] }));
+vi.mock('react-native', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('react-native')>();
+  const { createElement, forwardRef } = await import('react');
+  const Modal = forwardRef<unknown, ModalProps>(({ onDismiss, ...props }, ref) => createElement(actual.Modal as never, {
+    ...props,
+    ref,
+    onDismiss: onDismiss && (() => {
+      if (dismissals.hold) dismissals.held.push(onDismiss);
+      else onDismiss();
+    }),
+  }));
+  return { ...actual, Modal };
+});
+
 import type { AiDraft, TransactionDto, WalletSnapshot } from '@gogospend/contracts';

 import { COMMON_RULES } from '@mobile/analytics/catalog';
@@ -78,6 +105,8 @@ afterEach(() => {
   vi.clearAllMocks();
   bun.props = null;
   probe.tray = null;
+  Object.assign(dismissals, { hold: false, held: [] });
+  delete (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent;
 });

 /** Lets the stores, the lists, the phone's answer and Bun's AI preferences arrive. */
@@ -122,6 +151,19 @@ const chipLabels = () => [...found('quick-chips').querySelectorAll('[role="butto
 const alertIn = (testID: string) => found(testID).querySelector('[role="alert"]')?.textContent ?? null;
 const escape = () => act(() => { document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })); });
 const source = (file: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), 'utf8');
+/** iOS for what follows (the conflict case's way), with a no-op for the focus call react-native-web has not; or the web. */
+function onIos(ios: boolean) {
+  Object.defineProperty(Platform, 'OS', { value: ios ? 'ios' : os, configurable: true, writable: true });
+  if (ios) Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', { value: () => undefined, configurable: true, writable: true });
+  else delete (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent;
+}
+
+/** A wallet's radio in a pick, named by the wallet and its balance: the one whose name starts with `name`. */
+function walletRadio(name: string): HTMLElement {
+  const element = screen.queryAllByRole('radio').find((each) => (each.getAttribute('aria-label') ?? '').startsWith(name));
+  expect(element, `a radio for ${name}`).toBeDefined();
+  return element as HTMLElement;
+}

 /** Each record_started sent, without the properties every event carries. */
 const starts = (sent: readonly Recorded[]) => sent
@@ -131,8 +173,8 @@ const starts = (sent: readonly Recorded[]) => sent
 const LOCALES = ['th', 'en'] as const;
 const MODES = ['light', 'dark'] as const;
 const WORDS = {
-  th: { spending: 'จดรายจ่าย', expense: 'รายจ่าย', next: 'ถัดไป', save: 'บันทึก', back: 'กลับ', food: 'อาหาร' },
-  en: { spending: 'Add spending', expense: 'Spending', next: 'Next', save: 'Save', back: 'Back', food: 'Food' },
+  th: { spending: 'จดรายจ่าย', expense: 'รายจ่าย', next: 'ถัดไป', save: 'บันทึก', back: 'กลับ', food: 'อาหาร', tryAgain: 'ลองอีกครั้ง', amountHidden: 'ซ่อนยอดเงินอยู่' },
+  en: { spending: 'Add spending', expense: 'Spending', next: 'Next', save: 'Save', back: 'Back', food: 'Food', tryAgain: 'Try again', amountHidden: 'Amount hidden' },
 } as const;
 const PRIVATE = { [PRIVATE_MODE_NAME]: '1' };
 const TODAY = todayInBangkok(new Date());
@@ -342,6 +384,36 @@ test('saving with a ready diary keeps the entry on the phone, closes the tray an
   }
 });

+test("the track names the category's key, income's own and none for a move, and a move keeps its amount and wallets exactly", async () => {
+  // Income, online: its own category's key, and the 000 key's satang (the second review's P2, its M4).
+  const fake = resources();
+  const onSaved = vi.fn();
+  await mount(<Host onSaved={onSaved} />, { resources: fake.resources, diary: null });
+  await openTray({ type: 'income' });
+  press('3', '000', '0');
+  expect(text('add-amount')).toBe('฿30,000');
+  tap(named('button', 'ถัดไป'));
+  tap(named('button', 'บันทึก'));
+  await settle();
+  expect(onSaved).toHaveBeenCalledTimes(1);
+  const income = fake.callsOf('createTransaction')[0]?.args[0] as Record<string, unknown>;
+  expect([income.amount_minor, (onSaved.mock.calls[0] as [SavedEntry])[0].track?.categoryKey]).toEqual(['3000000', 'salary']);
+  cleanup();
+  // A move kept on the phone: from and to as chosen, the amount exact, and no category, so no key (P1, its M5).
+  const diary = readyDiary();
+  const moved = vi.fn();
+  await mount(<Host onSaved={moved} />, { diary: diary.diary });
+  await openTray({ type: 'transfer' });
+  press('5', '0', '0');
+  tap(named('button', 'ถัดไป'));
+  tap(found('transfer-next'));
+  tap(named('button', 'บันทึก'));
+  await settle();
+  expect(diary.saves).toEqual([expect.objectContaining({ type: 'transfer', amount_minor: '50000', source_wallet_id: MAIN.id, destination_wallet_id: CASH.id })]);
+  expect(moved).toHaveBeenCalledTimes(1);
+  expect((moved.mock.calls[0] as [SavedEntry])[0].track?.categoryKey).toBeNull();
+});
+
 test('a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands', async () => {
   boxes();
   const fake = resources();
@@ -462,6 +534,41 @@ test("an unconfirmed online save keeps today's Try again, which resends the same
   expect(named('button', 'บันทึก').getAttribute('aria-disabled')).toBe('true');
 });

+test("in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden", async () => {
+  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
+  for (const locale of LOCALES) {
+    const words = WORDS[locale];
+    const other = resources();
+    other.fail('createTransaction', 'network');
+    await mount(<Host />, { locale, resources: other.resources, diary: null, device: PRIVATE });
+    await openTray();
+    press('5', '0');
+    tap(named('button', words.next));
+    tap(named('button', words.save));
+    await settle();
+    // Private mode changes no other words: an answer lost is said as it always is.
+    expect(text('add-save-problem'), locale).toBe(translateCopy('Not confirmed yet. Your entry is kept; try again.', locale));
+    // The resend finds the entry saved with ฿99.00 (both reviews' probe, PROBE-5 and P5), on iOS, which says it too.
+    const sent = other.callsOf('createTransaction')[0]?.args[0] as Record<string, unknown>;
+    other.fail('createTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT', current: { ...sent, amount_minor: '9900' } });
+    announce.mockClear();
+    onIos(true);
+    tap(named('button', words.tryAgain));
+    await settle();
+    onIos(false);
+    const line = 'This entry is already saved in Jotbun as {amount}. Check it in History.';
+    const said = translateCopy(line, locale, { amount: words.amountHidden });
+    expect([text('add-save-problem'), label('add-save-problem'), announce.mock.calls.map(([each]) => each)], locale).toEqual([
+      translateCopy(line, locale, { amount: '฿••••' }),
+      said,
+      [said],
+    ]);
+    // No digit of it anywhere: drawn, in its words, or said (Review Focus 2).
+    expect([text('add-save-problem'), label('add-save-problem'), ...announce.mock.calls.map(([each]) => each)].join(' '), locale).not.toMatch(/\p{Nd}/u);
+    cleanup();
+  }
+});
+
 test('a draft from Tell Bun marks its fields guessed and saves with source tell_bun', async () => {
   const diary = readyDiary();
   const onSaved = vi.fn();
@@ -509,6 +616,54 @@ test('a draft from Tell Bun marks its fields guessed and saves with source tell_
   tap(named('button', 'ถัดไป'));
   expect([text('confirm-amount'), screen.queryByTestId('confirm-bun')]).toEqual(['฿45', null]);
   expect(rowLabels()[0]).toBe('หมวด การเดินทาง บันเดา');
+  cleanup();
+  // A note Bun wrote is one of its guesses too (the second review's P11, its M3).
+  await mount(<Host />, { ai: bunOn() });
+  await openTray();
+  tap(named('button', 'บอกบัน'));
+  useBun({ ...BUN_DRAFT, note: 'ค่าข้าวกับพี่' });
+  tap(named('button', 'ถัดไป'));
+  expect(rowLabels()[3]).toBe('โน้ต ค่าข้าวกับพี่ บันเดา');
+});
+
+test("in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows", async () => {
+  // Bun named no place, only a note: out of private mode that note would be the title (R117).
+  await mount(<Host />, { ai: bunOn(), device: PRIVATE });
+  await openTray();
+  tap(named('button', 'บอกบัน'));
+  useBun({ ...BUN_DRAFT, merchant: null, note: 'ข้าวมันไก่ 65 บาท' });
+  tap(named('button', 'ถัดไป'));
+  expect([text('confirm-title'), rowLabels()[3]]).toEqual(['จดรายจ่าย', 'โน้ต ซ่อนอยู่ บันเดา']);
+  // A note the person writes is theirs: it shows, and is the title.
+  tap(found('confirm-row-note'));
+  fireEvent.change(named('textbox', 'โน้ต'), { target: { value: 'ข้าวกลางวัน' } });
+  tap(found('pick-note-done'));
+  expect([text('confirm-title'), rowLabels()[3]]).toEqual(['ข้าวกลางวัน', 'โน้ต ข้าวกลางวัน']);
+  cleanup();
+  // Bun named the place and wrote a note, each with the amount in it (the second review's P4a): confirm draws and
+  // says none of it, and no digit at all.
+  await mount(<Host />, { ai: bunOn(), device: PRIVATE });
+  await openTray();
+  tap(named('button', 'บอกบัน'));
+  useBun({ ...BUN_DRAFT, merchant: 'ข้าวมันไก่ 65', note: 'ข้าวมันไก่ 65 บาท' });
+  tap(named('button', 'ถัดไป'));
+  expect([text('confirm-title'), text('confirm-amount')]).toEqual(['จดรายจ่าย', '฿••••']);
+  expect(rowLabels()).toEqual(['หมวด การเดินทาง บันเดา', 'กระเป๋า เงินสด บันเดา', 'วันที่ วันนี้ บันเดา', 'โน้ต ซ่อนอยู่ บันเดา']);
+  const step = found('confirm-step');
+  const spoken = [...step.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label'));
+  expect([step.textContent, ...spoken].join(' ')).not.toMatch(/\p{Nd}/u);
+  // Told again, of the amount only: the place is still the one Bun named, and still not drawn.
+  tap(named('button', 'กลับ'));
+  tap(named('button', 'บอกบัน'));
+  useBun({ ...BUN_DRAFT, amount_minor: '7000', merchant: null, note: null });
+  tap(named('button', 'ถัดไป'));
+  expect(text('confirm-title')).toBe('จดรายจ่าย');
+  // A name the person types (income's name field) is theirs: it shows.
+  tap(named('button', 'กลับ'));
+  tap(radio('รายรับ'));
+  fireEvent.change(named('textbox', 'ชื่อรายการ'), { target: { value: 'ค่าจ้าง' } });
+  tap(named('button', 'ถัดไป'));
+  expect([text('confirm-title'), rowLabels()[3]]).toEqual(['ค่าจ้าง', 'โน้ต ซ่อนอยู่ บันเดา']);
 });

 test("Tell Bun's sheet opens inside the tray", async () => {
@@ -628,6 +783,27 @@ test('a transfer goes amount, transfer, confirm; back goes to the amount; a pick
   found('add-amount');
 });

+test("Save refuses a day before the wallet started tracking, in today's words, and keeps nothing", async () => {
+  // A day three days back, chosen for cash (tracked since January); then the main account, which started two days
+  // ago (the second review's P8, its M6).
+  const diary = readyDiary();
+  await mount(<Host />, { diary: diary.diary });
+  await openTray({ walletId: CASH.id });
+  press('5', '0');
+  tap(named('button', 'ถัดไป'));
+  tap(found('confirm-row-date'));
+  const previous = named('button', translateCopy('Previous day', 'th'));
+  tap(previous);
+  tap(previous);
+  tap(previous);
+  tap(found('pick-date-done'));
+  tap(found('confirm-row-wallet'));
+  tap(walletRadio(MAIN.name));
+  tap(named('button', 'บันทึก'));
+  await settle();
+  expect([text('add-save-problem'), diary.saves]).toEqual([translateCopy('This date is before the wallet started tracking.', 'th'), []]);
+});
+
 test('open with a type and a wallet starts there: the wallet spent from or paid into, or the one a move leaves', async () => {
   await mount(<Host />);
   const closeTray = async () => {
@@ -655,7 +831,7 @@ test('open with a type and a wallet starts there: the wallet spent from or paid
 test("whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)", async () => {
   const recorded = await recordAnalytics();
   try {
-    await mount(<Host />);
+    const view = await mount(<Host />);
     // No tray: at once.
     const first = vi.fn();
     act(() => { tray().whenClosed(first); });
@@ -685,11 +861,59 @@ test("whenClosed runs once the tray's Modal has hidden, or at once with no tray;
     startAnimations();
     named('dialog', 'จดรายรับ');
     expect(starts(recorded.sent)).toEqual([...Array(3).fill({ kind: 'expense', source: 'typed' }), { kind: 'income', source: 'typed' }]);
+    // An open that waited asks again when it runs: blocked by then, nothing opens (the second review's P13, its M10).
+    fireEvent.click(named('button', 'ปิด'));
+    act(() => { tray().open(); });
+    view.rerender(<Host blocked />);
+    await wait(250);
+    startAnimations();
+    expect([screen.queryByTestId('tray'), starts(recorded.sent).length]).toEqual([null, 4]);
   } finally {
     recorded.restore();
   }
 });

+test('on iOS a tray whose Modal never says it has gone closes anyway once the bound has passed: what waited runs once, and a late word changes nothing', async () => {
+  const recorded = await recordAnalytics();
+  try {
+    const view = await mount(<Host />);
+    await openTray();
+    // iOS hears the close only from the Modal's onDismiss, and this dismissal never ends (both reviews' wedge probes).
+    // A run queued for after the close (P2-T30's) and the + wait for it, as R69 says.
+    dismissals.hold = true;
+    onIos(true);
+    fireEvent.click(named('button', 'ปิด'));
+    const later = vi.fn();
+    act(() => { tray().whenClosed(later); });
+    expect(later).not.toHaveBeenCalled();
+    act(() => { tray().open({ type: 'income' }); });
+    // The card's exit has ended and the Modal has hidden, but no word has come: nothing has run.
+    await wait(250);
+    onIos(false);
+    expect([dismissals.held.length, screen.queryByTestId('tray'), later.mock.calls.length, starts(recorded.sent).length]).toEqual([1, null, 0, 1]);
+    // Past the bound, 1.5 s from the close (R117), the entry goes: the income tray opens, and the run runs, once.
+    await wait(1500);
+    startAnimations();
+    named('dialog', 'จดรายรับ');
+    expect([tray().isOpen, later.mock.calls.length, starts(recorded.sent)]).toEqual([true, 1, [{ kind: 'expense', source: 'typed' }, { kind: 'income', source: 'typed' }]]);
+    // The first tray's word comes at last: it changes nothing, and the open tray stays open past another bound.
+    act(() => { dismissals.held[0]?.(); });
+    named('dialog', 'จดรายรับ');
+    await wait(1600);
+    startAnimations();
+    named('dialog', 'จดรายรับ');
+    expect([tray().isOpen, later.mock.calls.length, starts(recorded.sent).length]).toEqual([true, 1, 2]);
+    // A host that goes away (a sign-out, say) while its tray leaves runs nothing more, past the bound too.
+    fireEvent.click(named('button', 'ปิด'));
+    act(() => { tray().open(); });
+    view.unmount();
+    await wait(1600);
+    expect(starts(recorded.sent)).toHaveLength(2);
+  } finally {
+    recorded.restore();
+  }
+}, 20_000);
+
 test("outside a host, open pushes today's Quick add with the request", async () => {
   await mount(<Probe />);
   act(() => { tray().open({ copyOf: '0000000b-0000-4000-8000-000000000001' }); });
@@ -750,6 +974,17 @@ test('the tray says while its lists load, offers Try again on a load problem and
   startAnimations();
   expect(text('add-amount')).toBe('฿0');
   cleanup();
+  // An opening that names its type is named for it while it loads (the second review's P12, its M8).
+  const slower = resources();
+  const income = slower.hold('wallets');
+  await mount(<Host />, { resources: slower.resources, diary: null });
+  await openTray({ type: 'income' });
+  named('dialog', 'จดรายรับ');
+  await act(async () => {
+    income();
+    await new Promise((resolve) => setTimeout(resolve, 0));
+  });
+  cleanup();
   // A load that fails: what happened, in today's words, and Try again.
   const failing = resources();
   failing.fail('wallets', 'network');
@@ -838,6 +1073,9 @@ test("a copy opens on the copied entry with its amount as a fill and today's dat
     await settle();
     expect(text('add-save-problem')).toBe(translateCopy('Choose a category', 'th'));
     expect(diary.saves).toEqual([]);
+    // Above Save, in the tray's pinned footer (P9e; the first review's n1, its R8).
+    const [footer, problem, save] = [found('tray-footer'), found('add-save-problem'), named('button', 'บันทึก')];
+    expect([footer.contains(problem), footer.contains(save), Boolean(problem.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING)]).toEqual([true, true, true]);
     // Back on the amount, the first key starts it over, and what is typed shows.
     tap(named('button', 'กลับ'));
     press('9');
```

`docs/implementation/receipts/P2-T16.md`:
```diff
diff --git a/docs/implementation/receipts/P2-T16.md b/docs/implementation/receipts/P2-T16.md
index 03fa58960fc652def8244f2ae84ab28659df28cf..75a6f4a39caa2a0627e10b3def7238e1ae50a845 100644
--- a/docs/implementation/receipts/P2-T16.md
+++ b/docs/implementation/receipts/P2-T16.md
@@ -1,6 +1,7 @@
 # P2-T16: The add tray host: open, Tell Bun, save

 - **Status:** built and verified locally on `p2/t16-add-tray-host` (`.claude/worktrees/p2-t16`), from `afab7fd5`. Committed locally, not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
+- **Fix round:** PR #439's first review said Needs fixes (M1, m1, m2, n1), and the second approved (m1 to m4). The controller ruled R117, and `receipts/P2-T16-fix.md` records the round: in private mode a conflict draws and says no amount, and confirm draws none of Bun's words; a hidden tray whose Modal never says it has gone closes anyway after 1.5 s; and the reviews' survivors are pinned. The lines below that R117 makes untrue are corrected.
 - **Base:** `afab7fd5`. The brief was proven at `f034185e`. The branch was fast-forwarded from `7a29bc70` to `afab7fd5`, which brought only controller state under `.claude/controller/` (this brief, the planner's folder, and two state files) and no app or package code. `git log --oneline f034185e..HEAD` lists one merged pull request since the proof: #435 (P3-T7, merge `bfce84ed`, commit `088b346a`). Its change under `packages/` is a comment in `packages/contracts/src/v1/ai.ts` (5 insertions and 3 deletions, all inside the JSDoc of `AI_ROUTE_DEADLINE_MS`), as the brief's Step 0.3 expects. Step 0.4 found the five shared files at their `orig/` checksums, so each was copied from `real/` and no `git apply --3way` was needed.
 - **Files:** created `apps/app/src/wallet/add/AddTrayHost.tsx` (464 lines), `apps/app/src/wallet/add/AddTray.render.test.tsx` (875 lines, 17 cases), `apps/app/src/dev/catalogue/wallet/addHostSection.tsx` (45 lines) and this receipt. Modified `apps/app/src/wallet/add/copy.ts` (50 lines before, 52 after: `add.saving`), `apps/app/src/dev/catalogue/wallet/addSections.tsx` (208 before, 273 after: the three sections), `apps/app/src/wallet/wallets/WalletsList.render.test.tsx` (562 before and after: one line, the sections case's first id is now `bw-tray-add-large`), `apps/app/src/wallet/add/AddSteps.render.test.tsx` (759 before, 764 after: one mount in its private-mode case, P2-T15's confirm m1) and `apps/app/src/wallet/tray/Tray.render.test.tsx` (850 before, 870 after: one case, tray-hardening's c-n1; 27 cases before, 28 after).
 - **What changed:**
@@ -38,7 +39,7 @@
   - Step 1.1 (`npm ci`) was skipped, as the controller's note directs, since the worktree's `node_modules` was ready: 439 top-level entries, with `tsc` and `vitest` present. The brief's Expected line "added 1416 packages" therefore does not appear. `typecheck:app` passed on that install.
   - Step 0.3's diff lists `packages/contracts/src/v1/ai.ts` alone; I read it, and it is a comment.
 - **SKIPPED:** `npm ci` (see Deviations). `typecheck:routes` and `export:web` (no route, config or app-entry change; CI runs `export:web`). The full render suite (CI's `render` and `sections-1` to `sections-3` jobs; the catalogue's every-section and screen-reader suites pick up the three sections there, and the large-text suite does not open them). The iOS export (CI). `test:ops` (no package or lockfile change). The API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped). Device and simulator checks, from P19's list: Tell Bun's sheet over the tray on iOS and its keyboard; a swipe during a save, and Android's back, on a phone; a quick reopen while UIKit's dismissal ends; whether UIKit sends a dismissal for a present it refused; VoiceOver hearing the save's problem. E2-B's screenshots are the controller's, after P2-T28.
-- **Risks:** on iOS a tray whose present was refused gets no `onClosed`, so a later open waits for it (P5d; the device check asks). In private mode the open Tell Bun sheet still shows the person's own words and Bun's reading of them (P10d), a note for E2-B and P2-T37.
+- **Risks:** on iOS a tray whose present UIKit refused stays open in the host with nothing on screen, so a later open is ignored and nothing on screen can close it (P5d; the device check asks, before P2-T18). A tray whose dismissal never ends no longer holds later opens: since the fix round its entry goes after 1.5 s (R117). In private mode the open Tell Bun sheet still shows the person's own words and Bun's reading of them (P10d), a note for E2-B and P2-T37. The lock's cover loses what the person typed into Tell Bun, since the sheet keeps it in its own state and the cover unmounts the tray's content; this host is the first of the "later Sheet hosts" (`followups.md`), which the controller carries to P2-T34, P3-T18 and E2-B (R117).
 - **Notes for later tasks** (ruling P19):
   - **P2-T17 (the saved moment):** `SavedContext` is `{ lookups, offline }`, and `onSaved` fires once per landed save, before the tray closes. Open a toast from it, never a second tray, or wait with `whenClosed`.
   - **P2-T18 (the wallet shell):** mount `AddTrayHost` inside `SavedToastHost`, pass `blocked`, and give Magic Tap and the + `useAddTray().open`. `isOpen` is true from the opening until close is asked.
@@ -46,6 +47,6 @@
   - **P2-T24 and P2-T26:** `open({ walletId })` starts on that wallet; `open({ copyOf })` copies as Quick add copies.
   - **P3-T13:** this host decides `track.source` from Bun's standing guesses (P9a), as the plan says. P3-T13 replaces that with the draft's origin and wires `useDraftReview`.
   - **P3-T18:** the tell step brings the sentence for confirm's line (P10b).
-  - **P2-T37 (the sweep):** the open Tell Bun sheet shows what the person types and Bun's reading of it (P10d). Confirm's title and note row are the model's text when Bun filled them (P2-T15's note).
+  - **P2-T37 (the sweep):** the open Tell Bun sheet shows what the person types and Bun's reading of it (P10d). Out of private mode, confirm's title and note row are the model's text when Bun filled them (P2-T15's note); in private mode, since the fix round, neither is drawn (R117).
   - **A tray follow-up:** at AX5, scroll the middle to its top when the type changes, or give the tray a pinned place under its header (P2-T14's P10 and its confirm review's P1; P7d).
   - **Device checks (SKIPPED):** as listed under SKIPPED.
```

`docs/implementation/receipts/P2-T16-fix.md`:
```diff
diff --git a/docs/implementation/receipts/P2-T16-fix.md b/docs/implementation/receipts/P2-T16-fix.md
new file mode 100644
index 0000000000000000000000000000000000000000..3c8712e22f8bbd8819b4fc71ec06ba46f087069d
--- /dev/null
+++ b/docs/implementation/receipts/P2-T16-fix.md
@@ -0,0 +1,82 @@
+# P2-T16-fix: a conflict and Bun's words in private mode, the bound on a tray that never says it has gone, and the reviews' pins
+
+- **Status:** built and verified locally on `p2/t16-add-tray-host` (`.claude/worktrees/p2-t16`), one commit on PR #439's reviewed head `81f66c0e`. Not pushed. This is the fix round on PR #439 after two reviews:
+  - the first (`.claude/controller/reviews/P2-T16.md`) said Needs fixes: one major (M1), two minors (m1, m2) and one nit (n1);
+  - the second (`P2-T16-second.md`, money, the wallet and privacy) approved, with four minors (m1 to m4). Its m2 is the first's M1, and its m1 is the first's m1.
+
+  The controller ruled R117, and the planner's brief is `.claude/controller/briefs/P2-T16-fix.md`. Under R87 this receipt is its own file; `P2-T16.md` is corrected and points here.
+- **Base:** `81f66c0e`, with no merge: the controller merges the integration branch up.
+- **Files:** modified `apps/app/src/wallet/add/AddTrayHost.tsx` (464 lines before, 505 after), `apps/app/src/wallet/add/copy.ts` (52, 55: one draft line), `apps/app/src/wallet/add/AddTray.render.test.tsx` (875, 1113; 17 cases before, 22 after) and `docs/implementation/receipts/P2-T16.md` (a line pointing here, and the lines R117 makes untrue); created this receipt. `entrySave.ts` is unchanged, since 1D-T7 edits it. No route, package or lockfile changes.
+- **M1, a conflict in private mode (R117.1):**
+  - A conflict's words quote the amount of the record Jotbun holds. `useEntrySave` builds them with `useAmountWords`, which does not know private mode.
+  - While private mode is on and the save's status is `conflict`, the host draws today's line with the amount masked (฿••••). The line has its own words, with `common.amountHidden` (ซ่อนยอดเงินอยู่) in the amount's place, and iOS is told those words.
+  - Today's line, masked, rather than a new draft line: it is R115's shape for the refused archive's ฿0 (P2-T21-fix), it adds nothing to E2-B's copy pass, and the sentence is the same in both modes with only the amount hidden, as every other amount in private mode is.
+  - Every other message `useEntrySave` can hand the host was checked, and none holds an amount of the person's:
+    - `saveProblem`'s and `localSaveProblem`'s messages are fixed words.
+    - The check's own amount lines are dropped whenever the keypad refuses the amount, and the keypad refuses whatever they would. Its other lines name a field, a date or a length.
+    - The server's field errors hold constants only: the cap (฿999,999,999.99) and an example amount (65 or 65.50). Neither can reach this host: the keypad caps the amount and sends a plain satang string.
+  - The case runs in Thai and English, on both reviews' probe (PROBE-5 and P5). An answer lost says its usual words in private mode. The resend finds the entry saved as ฿99.00, and the case checks the line drawn, its words and what iOS is told: today's words, masked, with no digit in any of them.
+- **The second review's m3, Bun's words on confirm in private mode (R117.2):**
+  - R114's reasoning applies: no mask keeps up with every form of an amount, and Bun's merchant and note come from the same sentence.
+  - In private mode a title that would quote Bun is the tray's own (จดรายจ่าย, จดรายรับ or โอนเงิน). That is a merchant Bun filled, or with no merchant, a note Bun filled. A note Bun guessed reads as ซ่อนอยู่ (`add.noteHidden`, a draft line for E2-B) and keeps its บันเดา.
+  - What the person typed shows (R106): a name typed in income's name field, and a note written in the note pick. The host keeps the place Bun last named (`bunMerchant`), so a later draft of Bun's that names none still leaves the place Bun's, as `applyDraft` keeps it.
+  - The case, on the second review's probe P4a: a note alone from Bun, which out of private mode would be the title; a merchant and a note, each holding the amount, with no digit left in confirm's text or its words; Bun told again of the amount only; and what the person writes and types, which shows.
+- **m1, the bound on a tray that never says it has gone (R117.3):**
+  - Once a tray is hidden, its entry goes when the Modal says so (`onClosed`), or after 1.5 s (`CLOSED_BOUND_MS`), whichever comes first. iOS hears `onClosed` only from the Modal's `onDismiss`, which never comes for a dismissal UIKit never ends, so a later open and a `whenClosed` run no longer wait for ever.
+  - It stays idempotent per entry: the host's `closed` takes the entry and does nothing once that entry has gone. A dismissal that comes after the bound, or after a new tray has opened, changes nothing.
+  - The bound is armed on every platform. Off iOS the tray reports its close after its 220 ms exit, which ends the entry and clears the bound first, so a platform check would be a guard no case could see.
+  - The bound lives in the entry, so it ends with it, and a host that goes away (a sign-out) runs nothing queued. `show` and `closed` keep one identity across renders, so a parent that draws again cannot restart the bound.
+  - The case uses a Modal that holds its dismissal back, as the reviews' wedge probes do. It checks that the queued run and the open wait, then that the bound lets both through once; that a late dismissal and another 1.6 s leave the new tray open; and that a host unmounted while its tray leaves sends nothing more.
+- **n1, the save's problem above Save (R117.4):** the copy case now checks that, in the tray's pinned footer, `add-save-problem` comes before the button. The first review's R8 is killed.
+- **The second review's m4, its six survivors (R117.5),** each pinned on its own probe. The code was already right:
+  - M3 (P11): a note Bun wrote is one of its guesses, `โน้ต ค่าข้าวกับพี่ บันเดา`. This is in the Tell Bun case.
+  - M4 and M5 (P2, P1): income's track has its own category's key (`salary`), and a move's has none. The move is kept exactly: `50000` from the main account to cash. This is a new case.
+  - M6 (P8): a day chosen for cash, then the main account, which started later, is refused on Save with today's words, and nothing is kept. This is a new case.
+  - M8 (P12): an opening that names income is named จดรายรับ while its lists load. This is in the waiting case.
+  - M10 (P13): an open that waited for a leaving tray asks again when it runs, so a host blocked by then opens nothing. This is in the `whenClosed` case.
+- **The first review's m2 (R117.6, no code):** the lock's cover loses what the person typed into Tell Bun, and this host is the first of the "later Sheet hosts". Both receipts' Risks say so.
+- **RED to GREEN:**
+  - RED is `81f66c0e`'s code with the round's suite. No stub is needed: the new cases use nothing the code does not already export.
+    - `npm run typecheck:app`: exit 0.
+    - The suite: `Tests 3 failed | 19 passed (22)`. Each failure is an `AssertionError`, with no load or lookup error and no `stderr |` block:
+      - the conflict in private mode (`th: expected [ …(3) ] to deeply equal [ …(3) ]`);
+      - Bun's words on confirm (`expected [ 'ข้าวมันไก่ 65 บาท', …(1) ] to deeply equal [ 'จดรายจ่าย', 'โน้ต ซ่อนอยู่ บันเดา' ]`);
+      - the bound (`a dialog named จดรายรับ: expected null not to be null`).
+    - The 19 that pass are the first round's 17 cases, with their new parts, and the two new cases that pin code that was already right (the track's keys, and the day before a wallet started).
+  - GREEN:
+    - `typecheck:app`: exit 0.
+    - The suite: `Tests 22 passed (22)`, with no `stderr |` block.
+    - The add flow's and the tray's Node files with the draft check: 19 of 19.
+    - The eight kit render files: 142 of 142. The four routes tests: 15 of 15. The first round's other render files (AddSteps, entrySave, QuickAddScreen, catalogueRoute): 110 of 110. Each is the same as at `81f66c0e`.
+    - The catalogue's wallet sections (`-t "bw-"`, both suites): 96 passed. The registry rule: 1 passed.
+- **Mutation check:** 126 mutants: 126 killed, 0 survived. Each file was restored, with its SHA-256 checked, and every failing case in every mutant's run fails on an `AssertionError`.
+  - The first round's 86 (H1 to H77, K1, S1 to S6, T1, C1). H28, H30 and H41 are re-pointed at the lines this round moves.
+  - The first review's R1 to R8, R8 being its n1. The second review's M2 to M8, M10, M11 and M13, with M3 to M6, M8 and M10 being its m4. Some are re-pointed where the code moved. Not run: M1, M9 and M12, which are the same edits as R1, R2 and H68; and M14, which the second review found equivalent.
+  - This round's F1 to F21 and K2: the conflict's mask (F1 to F7), Bun's words on confirm (F8 to F17, K2), and the bound (F18 to F21).
+- **Gate (R100, with R117's files, each named):**
+  - `npm run typecheck:app`: exit 0.
+  - `npm run test:app`: exit 0, `ℹ fail 0`.
+  - `npm run test:unit`: exit 0, `ℹ fail 0`, the Hermes guards included.
+  - The add flow's and the tray's Node files with the draft check (`addFlow`, `amountStepNative`, `addStepsNative`, `trayGesture`, `draftText`): 19 of 19.
+  - The round's suite: 22 of 22.
+  - The eight kit render files that import the wallet catalogue index (CardStack, WalletLooks, PrivateMode, walletHarness, Tray, Lock, AmountStep, WalletsList): 142 of 142.
+  - The four routes tests (SpendRoutes, AccountRoutes, InsightsRoutes, PlanningRoutes): 15 of 15.
+  - The first round's other render files (AddSteps, entrySave, QuickAddScreen, catalogueRoute): 110 of 110.
+  - `git diff --check`: clean before the commit, and against `origin/claude/p1a-vault-core...HEAD` after it.
+- **Deviations:** none from the brief's rulings.
+- **SKIPPED and CI:**
+  - In CI on the PR (R100): the full render suite, whose per-section jobs open `bw-tray-saving`, `bw-tray-unconfirmed` and `bw-tray-add-large`; `export:web` and the iOS export; the database, edge and image jobs; and `test:ops`.
+  - Not needed: `typecheck:routes` (no route changes), and the API and edge suites, since nothing outside `apps/app` and the receipts changes.
+  - SKIPPED until a device: a close and a quick reopen on an iPhone with the bound in place; a present that UIKit refuses (the tray follow-up's check, before P2-T18); VoiceOver hearing the masked conflict line in private mode; and the first round's list.
+- **Risks:**
+  - A present that UIKit refuses stays a risk (R117.3): the tray is open in the host with nothing on screen, so later opens are ignored and nothing on screen closes it. It is the tray follow-up's, with its device check before P2-T18.
+  - The bound's 1.5 s is a judgment, and no device has measured it. If UIKit's dismissal ever takes longer (a slow phone, or the app sent away mid-close), the entry goes while the Modal is still leaving, and the next present may be refused: the risk above.
+  - The lock's cover loses what the person typed into Tell Bun (the first review's m2, R117.6). Today's sheet keeps its sentence, its phase and Bun's result in its own state, inside the tray's content, which the cover unmounts; the cover also comes when the app goes inactive. This host is the first of the "later Sheet hosts" in `followups.md`. The controller carries it to P2-T34, P3-T18 and E2-B.
+  - In private mode Bun's words still show where the person edits them: the open sheet (P10d), income's name field on the amount step, and the note pick's field.
+- **Notes for later tasks:**
+  - **P2-T18:** the bound frees a tray whose Modal never says it has gone, but not one whose present was refused (Risks). That device check comes before the + and Magic Tap reach the host.
+  - **P2-T26 and P2-T30:** open another Modal from the add tray's `whenClosed`, or from its own tray's `onClosed`, as both reviews say. The bound orders only this host's trays.
+  - **1D-T7:** `entrySave.ts` is unchanged. Two saves in one React batch both write (the first review's PROBE-4); a ref guard in `save` would hold that for any caller.
+  - **P2-T37:** in private mode the conflict line is masked and confirm draws none of Bun's words. The sweep's exemptions must know the constant figures in the save's words (the cap, the example amount 65 or 65.50, and the 120- and 500-character limits) and the editable fields under Risks.
+  - **E2-B (the owner):** in private mode, the tray's own title in place of Bun's merchant, and ซ่อนอยู่ for its note (R117.2, which the owner may overrule); the masked conflict line's words, which read "as Amount hidden" in English.
+  - **Not in R117,** left as the second review recorded them: its n1 (a refused save's words stay until the next Save), n2 (`fill()` has no guard where `keypadOf()` has one) and n3 (an `onSaved` that throws leaves the tray open with a dead Save), and its notes for P2-T17, P2-T26, P3-T13 and closing from `unconfirmed`.
```
