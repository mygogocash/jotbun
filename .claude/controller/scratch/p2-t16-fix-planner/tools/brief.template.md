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
  - `SHA256SUMS` (the kit, {{KIT_FILES}} files; check it from PL) and `SHA256SUMS.logs` (the planner's `logs/`);
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
| `apps/app/src/wallet/add/AddTrayHost.tsx` | In private mode a conflict's line masks the amount Jotbun holds and says it is hidden (P24), and confirm draws none of Bun's words (P25). A hidden entry closes once, when its Modal says so or after 1.5 s (P26). {{LINES:orig:apps/app/src/wallet/add/AddTrayHost.tsx}} lines before, {{LINES:apps/app/src/wallet/add/AddTrayHost.tsx}} after. |
| `apps/app/src/wallet/add/copy.ts` | One draft line, `add.noteHidden` (ซ่อนอยู่, Hidden), and the table's comment (P25). {{LINES:orig:apps/app/src/wallet/add/copy.ts}} before, {{LINES:apps/app/src/wallet/add/copy.ts}} after. |
| `apps/app/src/wallet/add/AddTray.render.test.tsx` | 22 cases (17 before): five new (P24, P25, P26, P28) and four with a new part (P27, P28); a Modal that holds its dismissal back when a case asks, and two helpers (P26, P28). {{LINES:orig:apps/app/src/wallet/add/AddTray.render.test.tsx}} before, {{LINES:apps/app/src/wallet/add/AddTray.render.test.tsx}} after. |
| `docs/implementation/receipts/P2-T16.md` | The planner's correction: a line pointing to the fix round, the Risks line R117 makes untrue (with the first review's m2), and the P2-T37 note (P30). {{LINES:orig:docs/implementation/receipts/P2-T16.md}} before, {{LINES:docs/implementation/receipts/P2-T16.md}} after. |
| `docs/implementation/receipts/P2-T16-fix.md` | **New**: the round's receipt (R87), written by the planner with the proven numbers (P30). {{LINES:docs/implementation/receipts/P2-T16-fix.md}} lines. |

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
  - The runner takes {{MUTANT_MINUTES}} minutes for the 126, so it runs in eleven foreground batches of twelve or fewer (Step 4), and `merge_mutants.py` joins them in the runner's order.
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
4. The kit, checked from PL: `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner && shasum -a 256 -c SHA256SUMS | grep -vc ': OK$'`. Expected: `0`. Then `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner && shasum -a 256 -c SHA256SUMS | grep -c ': OK$'`. Expected: `{{KIT_FILES}}`.
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
{{RED_RENDER}}

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
{{MUTANT_TOTAL}}
```
and `grep -c 'restored sha256 equal' /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutants.out` gives 126. Then `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix-planner/tools/first_errors.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t16-fix/mutant-logs`. Expected: `126 logs, 0 with a failing case that is not an AssertionError`.

The planner's lines follow (from `PL/logs/mutants.out`, shortened to the mutant and the first case it fails), for comparison:
```
{{MUTANTS}}
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
{{DIFF:apps_app_src_wallet_add_AddTrayHost.tsx.diff}}

`apps/app/src/wallet/add/copy.ts`:
{{DIFF:apps_app_src_wallet_add_copy.ts.diff}}

`apps/app/src/wallet/add/AddTray.render.test.tsx`:
{{DIFF:apps_app_src_wallet_add_AddTray.render.test.tsx.diff}}

`docs/implementation/receipts/P2-T16.md`:
{{DIFF:docs_implementation_receipts_P2-T16.md.diff}}

`docs/implementation/receipts/P2-T16-fix.md`:
{{DIFF:docs_implementation_receipts_P2-T16-fix.md.diff}}
