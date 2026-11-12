# P2-T16 second review: the add tray host (money, wallet, privacy)

- **Reviewer:** Claude Sonnet 5.5, independent second look (money-path and privacy), read-only. I did not read the other reviews of this task.
- **Reviewed:** `81f66c0e` on `p2/t16-add-tray-host`, PR #439 (base `claude/p1a-vault-core`), range `origin/claude/p1a-vault-core...81f66c0e`, merge base `afab7fd5`. The integration head has since moved to `e6ae87ff`, which adds only controller-state commits (no app code), so nothing in the range has gone stale. `git diff --check` over the range is clean. The PR is open and `MERGEABLE`.
- **Spec read:** plan `### Task P2-T16` (line 972) with its Global Constraints, W10, W14, W17, W27, R61, R69, Review Focus 1 and 2; the brief `briefs/P2-T16.md` (P1 to P21); the receipt `receipts/P2-T16.md`; P2-T15's R114 notes; `protocol.md` (R87, R100, Reviewers).
- **Scratch:** `.claude/controller/scratch/p2-t16-second/`. A `git archive` of `81f66c0e` in `tree/` (node_modules linked entry by entry from the worktree, workspace links re-pointed), checked byte-identical to the commit for `AddTrayHost.tsx`. Probes and the mutant runner are in `tools/`; logs sit beside them. The worktree was never touched (`git status` clean). Nothing is under `/private/tmp`. No Docker.

## Verdict in one paragraph

No blocker and no major. The save path is exact to the satang from the keypad to the stored record, for spending, income and transfers, online and on the device, and the tray cannot be dismissed while a save is in flight. The analytics are clean. I found four minors and three nits. The two I would put in front of the owner are **m1** (on iOS the host's one-tray-at-a-time queue can wedge for good if a Modal never reports its dismissal, and a person has no way out but a relaunch) and **m2** (the conflict line draws and announces the held record's amount in digits while private mode is on). Both are rare, neither moves money wrongly, the wallet area stays off until P2-T38, and both have small fixes. I rate them minor on that basis and say below what would make m1 a major.

## CI (R100)

PR #439, run `43227971730` on head `81f66c0e`, conclusion `success`, all nine jobs passed:

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | pass (node test summaries in the log: 36, 1049 and 7 tests, 0 failed) |
| Render (every file but the per-section suites) | pass, 126 files, 1617 tests |
| Render, per-section suites (every other test) | pass, 250 passed, 418 skipped (shard) |
| Render, per-section suites (ids of length 3n) | pass, 188 passed, 480 skipped (shard) |
| Render, per-section suites (ids of length 3n+1) | pass, 230 passed, 438 skipped (shard) |
| Exports (web and iOS bundles) | pass |
| Edge Worker | pass |
| SQL integration and ops | pass |
| Release image and smoke | pass |

I did not rerun any suite. The host's own file I ran once in the scratch copy: `AddTray.render.test.tsx`, 17 of 17 passed (7 s). Database suites: SKIPPED here (Docker stopped), CI ran them.

## Answers to the controller's focus questions

### The save (P9): holds

- **One write per press.** `save()` (AddTrayHost.tsx:320-330) calls `entrySave.save` once. The button is `disabled || busy` (PrimaryButton), and `useEntrySave.save` returns early for `saving`, `saved`, `blocked`, `conflict`. A second press that beat the re-render would still be a no-op on the device (`diary.saveDraft(entry, commandId)` is idempotent on the command id, quickAddModel.ts header) and online (`keys.keyFor('create', input)` gives the same key).
- **Locked only while saving.** `locked={inFlight}` (AddTrayHost.tsx:430), and `close()` returns while `now.current.saving` (:165). Mutants H1, H12 and H13 are killed. `unconfirmed` and `conflict` stay closable (test and probe).
- **Entry frozen while `useEntrySave` holds it.** `goTo` returns on `locked` (:308), `onBack` is undefined on `locked` (:427), the switch is `disabled={locked}` (:350). The planner's H52 and H56 to H58 cover these (I re-ran H56: killed). A refused save's words sit above Save (:396-400, :284) in a polite alert, also announced on iOS (:285).
- **Money exact.** My probes (all pass, `probes-final.log`):
  - P1: a transfer, keys `5 0 0`, saves one device draft `{type:'transfer', amount_minor:'50000', source_wallet_id: MAIN, destination_wallet_id: CASH}`; the track is `{source:'typed', categoryKey:null}`.
  - P2: an online transfer with keys `1 000` sends `createTransfer` once with `amount_minor:'100000'`; an income with keys `3 000 0` shows `฿30,000` and sends `'3000000'` with `categoryKey:'salary'`.
  - P3: Bun's fills `6550`, `99999999999` and `1` save as `'6550'`, `'99999999999'`, `'1'`; nine typed 9s save `'99999999900'`; a tenth digit is refused with today's words and the amount stays `฿999,999,999`.
  - P3b: move all fills the main account's whole balance (`฿24,860`, after line `0 บาท`) and saves `'2486000'`.
  - No JS number touches an amount in the host. The only conversions are `filledKeypad` and `applyDraft`'s string, then `settleForSave` and `buildQuickAdd` in the shared hook.
- Caveat on the date guard: see m4 (M6). The code is right, but no test pins the save-time date check.

### One tray at a time (P5): holds, with one open risk (m1)

- `whenClosed` runs at once with no entry, queues otherwise, and the queue is spliced then run after `show(null, false)` (:174-177). An `open` during the exit waits (:156); an `open` while open does nothing (:154-158). The planner's H6 to H11 cover it (I re-ran H8: killed). My M1, M2 and M9 are killed too (the clear, the entry key, the order of clear and run).
- A queued `open` re-reads `blocked` when it runs (:153): true, but unpinned (see m4, M10).
- **Can a tray that never presents wedge every later open? Yes, on iOS, and there is no in-app exit.** Details in m1.

### The steps and the type (P7): holds

A change to transfer always goes to the transfer step, and `TransferFooter` gets the same `wallets` as `TransferStep` (:390-391). The planner's H54, H55, H59, H60 and H65 cover it (I re-ran H65: killed). My probes P1 and P8 drive the type switch, the pick returns and the date bound.

### Private mode (R114): filled amounts hidden, sentence not drawn; two gaps (m2, m3)

Probe P4a (private mode on, Bun fill `฿65`): `add-amount` reads `฿••••` with the label `ซ่อนยอดเงินอยู่`, and so does `confirm-amount`; typed digits show once a key is pressed (test). Chips mask their amount (test). P2-T15's confirm m1 pin is in place and C1 is killed. The conflict message and Bun's merchant and note are the gaps.

### Tell Bun (P10): the sheet is unchanged; can anything the person typed still leak? Yes, in three places

1. **The open sheet itself.** `TellBunSheet` draws what is typed in its field and Bun's reading of the amount in plain digits (`TellBunSheet.tsx:295`, `:310`), with no private-mode check. The brief records this as by design (P10d). It is visible only while the person is using the sheet. I note it because Bun's amount is a fill, which R106 masks everywhere else.
2. **Bun's merchant and note at confirm** (m3).
3. **The conflict line** (m2) is not a Tell Bun leak, but it is the other place an amount can reach the screen unmasked.

Confirm quotes no sentence (`bunSentence={null}`, :393): the plan's `add.bunReadFrom` line cannot be fed because `TellBunSheet.onUse` hands back only the draft. I agree with the planner that this is an E2-B difference, not a defect.

### Analytics: holds

Probe P1 prints the whole stream for a save: one `record_started` with `{kind:'expense', source:'typed', ai_enabled:false, origin:'app'}` and nothing else, no amount, no text. The test pins `{ source: 'typed' }` alone for a copy that names no type, and a source pin holds that `AddTrayHost.tsx` never mentions `trackRecordSaved`. `transfer` is an allowed `kind` in `analytics/catalog.ts:76`.

## Findings

### Blockers

None.

### Majors

None.

### Minor

**m1. On iOS a Modal that never reports its dismissal wedges the host for good; a person's only way out is a relaunch.**

- **Mechanism, from the installed React Native 0.88 source.** `node_modules/react-native/React/Fabric/Mounting/ComponentViews/Modal/RCTModalHostViewComponentView.mm:164-201`: `onDismiss` is emitted only inside `shouldBeHidden = _isPresented && (!_shouldPresent || !self.superview)`. A host view that never reached `_isPresented == YES` (no window when `visible` arrived, or hidden before it attached) emits nothing. `Libraries/Modal/Modal.js:315-325`: JS `isRendered` is cleared only from that event. `Tray.tsx:163`: off iOS, `onClosed` comes from a timer, so only iOS can wedge. `Tray.tsx:175`: on iOS `onClosed` comes only from `onDismiss`.
- **Effect in the host** (AddTrayHost.tsx:154-157, :174-177): the entry stays mounted and hidden; every later `open()` finds `entry !== null && !visible` and pushes `whenClosed(() => open(request))`; nothing ever runs it. Each press adds one closure.
- **Probe P6** (`tools/ReviewWedge.render.test.tsx`, the Tray suite's own iOS Modal mock with the dismissal never ended): after the close, `open({type:'income'})`, `open()` and a `whenClosed` run nothing; 1.5 s later another `open()` is still dead; no second `record_started`. When the held dismissal is then ended, the queue runs: one income tray, one `record_started`, the `whenClosed` callback once. So the queue itself is correct; it is only unbounded in time.
- **Exit for a person:** none in the app. The host state lives in `AddTrayHost`, so a relaunch, or a sign-out that unmounts the shell, clears it. The + (P2-T18) would be dead until then.
- **Related, and worse:** if UIKit refuses the present (another VC is mid-dismissal), `_isPresented` is already `YES` and `onShow` never comes. Host state then says `visible: true` with nothing on screen, and `open()` is a no-op because "an open one stays as it is". I could not settle from source whether UIKit then calls the dismiss completion. That is the brief's P5d device question, still SKIPPED.
- **Likelihood.** Low today: nothing calls `open` yet. It becomes plausible when a consumer opens the add tray while a different Modal is leaving, which `whenClosed` cannot see (it knows only this host's tray). P2-T26's `RecordActionsTray` and P2-T30 are the cases (see Notes).
- **Why minor.** The wallet area is off until P2-T38, the planner and the receipt record the risk and the device check, and no money is wrongly written.
- **What I would do.** Either make the iOS device check (P5d, plus "an open tray whose `onShow` never fires") a hard precondition of P2-T38, or add a bounded fallback now: after `close()` on iOS, if `closed()` has not run within about 1.5 s, call it anyway. About twelve lines and one test with a Modal that never ends. It cannot be verified on a device here either, so I would not call it a fix, only a bound. I would upgrade m1 to **major** if the controller wants the wallet area switched on without that device check.

**m2. Private mode: the conflict line draws and announces the held record's amount in digits.**

- `entrySave.ts:127` builds `tc('This entry is already saved in Jotbun as {amount}. Check it in History.', { amount })` from `words(held.amount_minor).shown`. `useAmountWords` (`ui/Amount.tsx:70`) reads only the money locale, never the wallet's private mode. The host draws `entrySave.message` verbatim in `add-save-problem` (AddTrayHost.tsx:284, :396-400) and announces it on iOS (:285).
- **Probe P5** (private mode on, a resend that finds the entry saved with other details): drawn `รายการนี้บันทึกไว้ใน Jotbun แล้ว ยอด ฿99.00 ตรวจสอบได้ในประวัติ`, and `announceForAccessibility` was called with the same text. Review Focus 2 and W10: no digit of an amount on the screen or in a spoken label.
- **Why minor.** It needs a conflict (a lost response whose committed record differs from the resend); the plan says to show "today's message" here, so the code follows the plan, and Review Focus 2 gives the sweep to P2-T37. But this task renders the text, so it is the host's to mask.
- **Fix.** In the host, while `hidden` and `status === 'conflict'`, show a no-amount line instead (one new draft-table line in `add/copy.ts`, Thai first, for E2-B), and announce that. Pin it with probe P5.

**m3. Private mode: what Bun filled as merchant or note is drawn verbatim at confirm, and can carry the amount.**

- R114 (P2-T15-fix) hid the quoted sentence because "no mask keeps up with every form" of an amount. The merchant and note Bun fills come from the same sentence, and `confirmTitle` plus the note row draw them (AddTrayHost.tsx:393, :356).
- **Probe P4a** (private mode, Bun draft with merchant `ข้าวมันไก่ 65`, note `ข้าวมันไก่ 65 บาท`): title `ข้าวมันไก่ 65`, note row `โน้ต ข้าวมันไก่ 65 บาท บันเดา`, while the amount reads `฿••••`.
- **Probe P4b** (the phone's own rules, `draftFromQuickText`): the amount forms it knows are cut out of the merchant (`ข้าวมันไก่ ห้าสิบ`, `กาแฟ 1.5k`, `เงินเดือน สามหมื่น`), but not all: `lunch fifty baht` gives no amount and merchant `lunch fifty`; `taxi 2 hundred` reads `200` and keeps merchant `taxi hundred`. The server path (Haiku) is cleaned by `cleanText` and is not guaranteed free of amounts either (`apps/edge/src/server/ai/drafts.ts:110-111`).
- **Why minor.** The brief records it (P10d, P19) for E2-B and P2-T37; a typed name is the person's own words (R106); the leak is partial and needs a particular sentence. But it is the same hole R114 closed one level up, so it deserves a decision, not a silent carry.
- **Options for the owner.** Accept it. Or, in private mode, draw the tray's own title instead of a Bun-filled merchant or note, and a neutral note row for a guessed note.

**m4. Guards in the host that no test holds (my own mutants).** I ran 14 mutants of my own against the host's test file. Seven were killed and one is equivalent (M14: `errors` and `serverErrors` are never both non-empty, because `save()` clears one before each attempt and a server failure leaves the other empty). Six real behaviours are unpinned: each survived all 17 cases of `AddTray.render.test.tsx` and is killed by the named probe in `tools/ReviewProbes.render.test.tsx`.

| Mutant | Guard removed | Probe that kills it |
| --- | --- | --- |
| M3 | a note Bun filled is not one of its guesses (`guessedBy`, :226; BUN_DRAFT in the suite has `note: null`) | P11: confirm row reads `โน้ต ค่าข้าวกับพี่ บันเดา` |
| M4 | an income's `categoryKey` is read from spending's category (:322) | P2: income save has `categoryKey:'salary'` |
| M5 | a transfer's `categoryKey` is not null (:322; the plan says "null for a move") | P1: transfer track is `{typed, null}` |
| M6 | the save is not given the wallets, so the date-before-tracking-start refusal is gone (:327) | P8: pick a date, then a wallet that started later; Save refuses with `This date is before the wallet started tracking.` and writes nothing |
| M8 | the loading tray's title ignores the request's type (:334) | P12: `open({type:'income'})` while the lists load is named `จดรายรับ` |
| M10 | a queued `open` ignores `blocked` when it finally runs (:153) | P13: close, queue an income open, rerender `blocked`; nothing opens |

M4 and M5 matter beyond the test: once 1D-T7 puts `record_saved` into `finish`, a wrong key goes into analytics. M6 is a money-path validity check. Add the probe assertions to `AddTray.render.test.tsx`; they are short.

### Nits

- **n1. A refused save's words stay above Save after the person has fixed the entry** (probe P7: a copy with a closed category is refused with `เลือกหมวดหมู่`; the person picks อาหาร; the alert still reads `เลือกหมวดหมู่` until the next Save). `useEntrySave` keeps `errors` until the next save and has no clear. Quick add keeps its field errors the same way, but there the text sits beside its field; here it is one global line. Clear it from the host on `edit`, or leave it for the hook's owner.
- **n2. `fill()` has no guard where `keypadOf()` has one** (AddTrayHost.tsx:305 vs :217-221). `filledKeypad` throws `TypeError` for an amount over the cap. The client's response check allows 12 digits (`aiResources.ts:32`) against an 11-digit cap (`MINOR_AMOUNT_MAX`), and the edge caps it (`drafts.ts:20`, `:42`), so a correct server cannot trigger it. A throw there would leave the press handler mid-way (the sheet's `setText('')` and `onClose()` unrun). A try/catch that leaves the typed amount is the same defence `keypadOf` already has.
- **n3. If the consumer's `onSaved` throws, the tray stays open with a dead Save** (AddTrayHost.tsx:189-192: `show(...)` follows the call). The entry is `saved`, so `save()` returns early forever; the tray can still be closed. A `try`/`finally` around the callback is enough.

## Mutants run

**Planner's, 14 of 86** (ran in the scratch copy with the planner's runner; each file restored with sha256 checked): H1, H8, H12, H13, H22, H24, H26, H40, H43, H56, H65, H67, T1 (Tray c-n1) and C1 (confirm m1). All 14 killed, each on an `AssertionError`, first failing cases as the brief records.

**Mine, 14** (`tools/own_mutants.py`, against `AddTray.render.test.tsx`): M1, M2, M7, M9, M11, M12, M13 killed; M3, M4, M5, M6, M8, M10 survived and are killed by my probes (see m4); M14 equivalent.

## Probes

`tools/ReviewProbes.render.test.tsx` (14 cases, all pass on the unmodified commit, `probes-final.log`), `tools/ReviewWedge.render.test.tsx` (P6, the iOS wedge, `probes-run3.log`), `tools/ReviewCatalog.render.test.tsx` (every reused catalog line has a Thai entry: 20 of 20, `probes-run5.log`). Re-stage with `tools/stage.sh <tree>`, copy the three files into `apps/app/src/wallet/add/`, then `npx vitest run --config vitest.render.config.ts <file>` from `apps/app`.

## Notes for later tasks

- **P2-T18 (the shell).** Mount one `AddTrayHost` only. Make the iOS device check from m1 a precondition for P2-T38, or add the bounded fallback. A second host inside a catalogue section is fine (its context is separate), but never two in the shell.
- **P2-T26 (the record screen).** `RecordActionsTray` is a `Tray`, but `whenClosed` knows only the add host's tray. Call `open({ copyOf })` from `RecordActionsTray`'s `onClosed` (R69), not from `onCopy`, or the add tray is presented while the actions tray is still leaving: the case m1 warns about.
- **P2-T30 (over-budget).** Same: open through `whenClosed` for the add tray, and from the other tray's own `onClosed` for any other Modal.
- **P2-T17 (the saved moment).** `onSaved` runs before the tray closes; keep it from throwing (n3). The toast must not assume the tray is gone yet.
- **P2-T37 (the sweep).** Add the conflict line (m2), Bun's merchant and note at confirm (m3), the open sheet's amount (the first Tell Bun leak above) and the stale save problem (n1). A digit sweep cannot catch an amount in words.
- **P3-T13.** `track.source` is `tell_bun` only while a Bun guess stands (:328). If the person changes every row Bun guessed, the entry saves as `typed` although Bun filled the amount. That is the plan's rule; P3-T13's draft origin replaces it, so check this case there.
- **Closing from `unconfirmed`.** The plan allows it, as Quick add does, but it drops the only handle on a command that may have committed. Probe P9: lose the response, close, reopen, type the same entry again: two stored records with different ids, both `5000`. Nothing to change here; worth knowing when Recently deleted or the records list shows a twin.
- **Device checks still SKIPPED** (not mine to run): Tell Bun's sheet presented over the tray on iOS and its keyboard; a swipe during a save and Android's back on a phone; a quick reopen while UIKit's dismissal ends; whether UIKit sends a dismissal for a present it refused (m1); an open tray whose `onShow` never fires; VoiceOver hearing the save's problem.

VERDICT: Approved
