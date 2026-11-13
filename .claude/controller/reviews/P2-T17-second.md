# P2-T17 second review (money, Undo and private mode): The saved moment: the toast, Undo and the drop into the card

- **Reviewer:** Claude Sonnet 5.5, the independent second reviewer. I did not read any other review of this task: no `reviews/P2-T17*.md` file existed when I listed the folder, and I wrote this before looking for one.
- **Subject:** PR #451 (`mygogocash/jotbun`, base `claude/p1a-vault-core`), commit `fa09a9c0` on `p2/t17-saved-moment`, range `origin/claude/p1a-vault-core...fa09a9c0` (merge base `437743e2`, #449's merge; the integration branch has since moved to `2062b89a`, which the range does not include). `git fetch` first; the PR head on GitHub is `fa09a9c001ad`, the same commit. Read-only: the worktree was never written to (`git status --short` prints nothing, HEAD is `fa09a9c0`); every probe and mutant ran in a scratch copy made with `git archive` and a symlinked `node_modules`, under `.claude/controller/scratch/p2-t17-second/`.
- **Read:** the protocol (R87, R100, Reviewers), the dispatch notes, the plan's `### Task P2-T17` (line 1013), W6, W10, W17, W27, W31, Review Focus 2 and 4, the Global Constraints, the brief's rulings P1 to P22, the receipt, the three source files, `copy.ts`, the two catalogue files, both committed tests, the five shared-file diffs, and the code they call: `shared.ts` (`canUndoDraft`, the money groups), `spendDiary.ts` and `diaryRepository.ts` (`saveDraft`, `removeDraft`, `removePending`), `reconcile.ts` (`resolve`), `entrySave.ts`, `AddTrayHost.tsx`, `parts.tsx` (`useCommandKeys`, `saveProblem`), `client.ts` (`V1Outcome`), `resources.ts` and `fakeResources.ts`, `history.ts` and `executor.ts` on the edge, `cardFrames.tsx`, `PrivateModeProvider.tsx`, `a11y.ts`, `walletMoney.ts`, `money.ts`, `bus.ts` and `events.ts`, `recordActions.ts` (today's delete, for comparison), and `followups.md` lines 376, 447 and 783.
- **Code identity:** the 13 committed files are byte-identical to the planner's `real/` files (sha256, 13 of 13, against `PL/SHA256SUMS`). So this review judges the planner's design as shipped. `git diff --check origin/claude/p1a-vault-core...fa09a9c0` prints nothing.

## Result in one paragraph

The money path holds and I could not break it. No race I could build counts a save twice: the read's items, totals and revision come from one synchronous call on the edge, a listed record is deduped by id, a page with more to read leaves the total unknown, and the amounts go through BigInt only. Undo follows the outbox correctly in every state, the delete goes at version 1 under a key that an unconfirmed resend reuses (and the edge replays the stored answer before it looks at the version), two taps remove once, and `undo_used` goes out once, after success, with only `kind`. Private mode masks the toast and the chip and quotes nothing typed, and the iOS announcement is clean today. There is no blocker and no major. The findings are two narrow races that leave the total wrong in rare timings (m1, with a prototype of the fix), and a set of guards on a money figure and a privacy rule that no committed case holds (m2, m3), which I closed with probes of my own.

## CI (R100)

`gh pr checks 451 --repo mygogocash/jotbun` (run 43343427337, head `fa09a9c0`), read twice; the second time all nine jobs pass:

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | pass (2m34s); `test:app` pass 37, `test:unit` 1108 passed and 0 failed (the Hermes guards included), `test:dev` 7 passed |
| Render (every file but the per-section suites) | pass (3m10s); 131 files, 1696 tests passed |
| Render, per-section suites (3 shards, and "every other test") | pass; 254, 192 and 236 passed, the rest of each skipped by sharding (682 per file set). The three shards add up to 682, the receipt's 110 + 572, so the four new sections ran in both suites |
| Exports (web and iOS bundles) | pass (1m55s) |
| Edge Worker; SQL integration and ops; Release image and smoke | pass (2m36s; 2m55s; 26s) |

Locally, in the scratch copy (R100, focused files only):

- `savedMoment.test.ts`: 7 of 7 passed. `SavedMoment.render.test.tsx`: 16 of 16 passed (5.11 s). Both on the unmodified commit.
- Not run, and why: the eight kit files, the four routes tests, `test:app` and `test:unit` (CI's, all green above); database suites (Docker stays stopped; none apply to this change). The machine was loaded (load average about 28) but no case of mine timed out, so there is no flake to record.

## What I checked against the focus items

**1. Today's money out: sound; two narrow timings are wrong (m1).**

- `todayOutMinor` (`savedMoment.ts:67-75`) starts from `BigInt(summary)` and adds `BigInt(amount_minor)` of every expense command dated today that is neither refused (`needs_review`) nor listed by the read. `grep` for `Number(`, `parseInt`, `parseFloat`, `toFixed` and `Math.` over the five new source files finds nothing. The summary is validated as a minor string before it gets here (`isHistoryPage`, `resources.ts:137,166-171`), so `BigInt` cannot throw on it, and a sum stays canonical for `formatMinor`. Planner mutant P18 (a JS number) is killed on my rerun, and the committed case sums past 2^53.
- **No double count.** The edge builds the page in one call: `history()` reads the rows, the revision and the totals with no `await` between them ("all read in this call's one transaction", `apps/edge/src/vault/reads/history.ts:93-129`), so the items and the summary are one revision and a record is in both or in neither. The host dedupes by id (`confirmedIds`, `SavedToastHost.tsx:144`). A page with a `next_cursor` is never totalled (`:141`). I ran planner mutants P16 (no dedupe), H10 (count a page with more behind it) and mine O43 (the host passes no ids): all killed.
- **The sync taking the draft mid-read** (unsent to sending while the GET is out): both states are counted when the record is not listed, and deduped when it is. Exact either way.
- **An acknowledgement between the read and the outbox read:** the outbox is read in the same tick the answer is handled (`:142`), so there is no gap in the code. If the command was committed after the read's revision it is counted (acknowledged commands whose record is not listed are counted, P17 and P10 pin it); if before, the record is listed and deduped.
- **A draft acknowledged and applied at the read's revision:** the record is listed, so it is deduped (`savedMoment.test.ts`, "adds waiting drafts once"; the iOS case at `SavedMoment.render.test.tsx:584-595` counts its own listed draft once).
- **The two timings that are wrong** are in m1: an undercount (the draft finishes its whole life while the answer is in flight) and an overcount (an acknowledged command whose record was deleted since).
- **Failed read and a page with `next_cursor`:** both leave the total unknown, so the toast says `บันทึกแล้ว` (`SavedToastHost.tsx:141, 152-154`; the case at `SavedMoment.render.test.tsx:285-297`).
- **A figure once shown never moves:** `setTotal` runs once per toast, from the answer (`:143`); the outbox it read is a snapshot (`latest.current`). The effect re-reads only if `notice.offline` or `resources` changes; `resources` is the shared singleton (`getSharedV1Resources`, `SpendV1Provider`), so it does not. Planner mutants H14 and the committed "never moves" case hold it.
- **The closed diary:** with no diary open the outbox reads as empty (`:146`), so a draft kept on the phone is left out of a figure the read shows. The committed case pins it for an online save (`SavedMoment.render.test.tsx:441-445`). A device save cannot have a closed diary at the save, so this only matters if the diary closes while the toast is up. Fine.

**2. Undo: holds.**

- `undoPlan` states (`savedMoment.ts:60-64`): no command or `acknowledged` gives the delete at version 1; `unsent` with no first transmission gives the removal (it is `canUndoDraft`, `shared.ts:181-183`); `sending`, `uncertain`, `needs_review`, `paused_upgrade` and unsent-after-a-transmission give `none`. The Node cases pin each; planner mutants P12 (the plan's; I reran it) and P10 (the implementer's log) are killed.
- **No Undo for a phone-kept save with no diary open:** `SavedToastHost.tsx:164` (`notice.via === 'device' && view.phase !== 'ready'` gives `NONE`). H15 killed on my rerun (and H13, which pins the empty outbox). An online save does not wait on the diary (H16, killed in the implementer's log).
- **The removal is authoritative in the store:** `removePending` deletes only `state = 'unsent' AND first_transmission_at IS NULL` and throws on anything else (`diaryRepository.ts:488-495`), so a stale view cannot remove a draft the sync took; the host says "Couldn't change this device's copy. Try again." and offers Undo again only if the live outbox still allows it (`:169`, the committed case at `:447-458`).
- **The delete:** `resources.deleteTransaction(recordId, 1, keys.keyFor('undo:<recordId>', { version: 1 }))` (`:182`). An unconfirmed answer keeps the key (`:192`) and offers Undo again, which resends the same command. Server side, a replay returns the stored acknowledgement before the version is checked (`executor.ts:64-69`, `findReceipt` ahead of `mutate`), so the resend cannot commit twice nor fail with a conflict. H20 (a new key per tap) killed on my rerun; H30 (the key dropped) in the implementer's log.
- **Each refusal and whether Undo comes back** (outcomes from `client.ts:90-107, 193-225`; `saveProblem`, `parts.tsx:154-172`):

  | Outcome | Words | Undo again |
  | --- | --- | --- |
  | `conflict` (VERSION_CONFLICT, or any other 409) | `saved.undoConflict` | no |
  | `deleted`, `not_found` | "This entry was already deleted." | no |
  | `network`, `unavailable`, `invalid_response` | "Not confirmed yet. Your entry is kept; try again." | yes, same key |
  | `rate_limited` | "Too many changes at once..." | yes, same key |
  | `upgrade_required`, `policy_required`, `signed_out`, `session_changed` | `saveProblem`'s own line | no |
  | anything else (`purged`, `invalid`, `schema_unsupported`, `too_large`, `idempotency_mismatch`) | "This entry could not be saved." | no (n2) |

- **Two taps in one batch remove once:** `busy` is a ref set before the first await (`:173-175`); the committed case fires two clicks in one act and sees one removal; H17 killed.
- **`undo_used`:** one `trackUndoUsed({ kind })` after the device commit or the acknowledgement (`:185`), never in the catch (H23, killed in the implementer's log), carrying only `kind` (`events.ts:50-52`; `cleanEvent` drops the rest). The committed case asserts the whole JSON holds no `5000`, `฿50`, merchant, wallet name or record id. `trackClientEvent` cannot throw (`bus.ts:50-62`), so an analytics fault cannot turn a done Undo into a "failure".

**3. Private mode: holds; one path is untested (m2b).**

- The toast draws `฿••••` and its spoken text and label say `common.amountHidden` (`savedMoment.ts:83-96`); it holds no typed text at all. The chip draws `฿••••` and no title (`SaveFlight.tsx:131-134`). Until the setting is read, `hidden` is true (`PrivateModeProvider.tsx`); outside a `PrivateModeProvider` it is false (`:39`), which is why P2-T18 must mount inside `WalletRoot` (it does: `app/_layout.tsx:45`).
- My probe (iOS, private mode, a draft kept on the phone): the only announcement is `บันทึกแล้ว · วันนี้ ซ่อนยอดเงินอยู่`, then `เลิกทำแล้ว` after Undo, and `JSON.stringify` of every announcement holds no ASCII digit. A second probe (a failed read, so the plain toast, then Undo, with a title carrying `SECRET-NOTE`, in private mode and out of it): neither the title nor the note reaches the document text. Both pass on the commit.
- The chip is decorative (`DECORATIVE`: `aria-hidden`, `accessibilityElementsHidden`, `no-hide-descendants`), so it is not announced. F9 and F10 (real amount, title) killed.

**4. `show` never throws: holds.** `show` keys the notice and sets state (`SavedToastHost.tsx:91-96`). `noticeOf` (`savedMoment.ts:42-57`) calls `trim`, a `Map.get`, `categoryName` and `tc`, none with a throwing path for the values the tray hands it (the confirm step has already drawn the same category name). The toast and the chip are drawn in the host's own box, never as a Modal. This matters: `finish()` calls `onSaved` inside the device save's `try`, so a throw there would be caught as a local save problem on a draft that is already saved (`entrySave.ts:185-194`).

**5. The flight: holds, with decorative gaps (m3, n1).** It decides at the notice from `motionFor('save', reduced)` (`SaveFlight.tsx:63`), waits `TRAY_EXIT_MS`, calls `measure()` (`:72`), reads the frame on the next tick (`:73-74`) and aims at `frame.y + STACK_PEEK / 2` (`:76`). F3, F4, F5, F6, F12 are the planner's holds; the committed case moves the card with no layout and sees the chip land on the new place. `followups.md` lines 376, 377 to 378, 447 and 783 are each carried.

**6. The catalogue: holds.** `savedSections.tsx` imports only `react`, `react-native` and a type; the host loads through `lazy(() => import('./savedScreens'))` (`:29`), and a source pin plus S1 hold it. CI's `Render (every file but the per-section suites)` job runs the eight kit files that import the wallet index and passes. Section order and ids match the plan; the two neighbour lines are consistent.

**Not applicable here:** points, payment and auth code (none in this PR). Nothing logs (`grep` for `console.`, Sentry, PostHog: none), no network call is added beyond the one history read the plan names.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. Two narrow timings leave today's total wrong; no timing counts a save twice.**

- Where: `savedMoment.ts:67-75` and `SavedToastHost.tsx:141-148` (the outbox is read when the answer lands, not when the read was served, and an acknowledged command is counted whatever its revision).
- **Race A leaves a save out (undercount).** The read is served before the draft commits, so its record is not listed. The draft then finishes its whole life (POST, acknowledgement, delta pull, `resolve` removes it from the outbox) before the answer is handled. At landing the draft is in neither place. Probe `PROBE undercount` (`probe-final.render.test.tsx`; records `[฿82]`, the draft's `฿50` leaves the outbox while the read is held): the toast reads `บันทึกแล้ว · วันนี้ ฿82`, the true figure is ฿132. Plausibility: the GET and the POST leave together, and the draft needs three more round trips after the commit (the answer, the delta pull, the resolve) while the GET's answer is slower than all of them. Rare.
- **Race B counts a deleted save (overcount).** An `acknowledged` command is counted when its record is not listed (`:71`, pinned by P17 and the 800 case). A record that was committed and then deleted is also unlisted, so an acknowledged command whose record Undo (or another device) deleted counts as money out. Probe `PROBE overcount` (`acknowledged` draft of ฿50, records `[฿82]`): `บันทึกแล้ว · วันนี้ ฿132`, true ฿82. Plausibility: `reconcile.ts:52-76` resolves a command as soon as the confirmed state holds its record, active or deleted, so the command lingers only while the sync is stalled between the acknowledgement and the delta pull; and then the next save is `offline` (`AddTrayHost.tsx:296`, `outcome?.status !== 'synced'`), which reads nothing. Rare.
- Why minor: the figure is informational and lives six seconds, both timings need a stall the code mostly guards, and no money is written. But the dispatch asked for exactly this, and the rule that fixes both is cheap and uses fields that are already there.
- Fix (prototyped in `tree-fix/`, scratch only; the 7 Node and 16 render cases still pass, and both probes give the right answer): (1) in `todayOutMinor`, skip an `acknowledged` command whose `ackedRevision` is at or before the read's `as_of_revision` (it was committed by then, so not being listed means it was deleted); pass `readRevision: page.as_of_revision` (an optional input, so the plan's signature and the committed cases are unchanged); (2) in the host, leave the total unknown when `BigInt(now.appliedRevision) > BigInt(page.as_of_revision)` (the device has applied a revision the read did not see, so its outbox and the read are not one moment). With the prototype race A shows `บันทึกแล้ว` instead of a wrong figure and race B shows ฿82. `ackedRevision` and `as_of_revision` are the same counter (`executor.ts:76-81`, `history.ts:90`). Or leave it and record the two timings in the receipt.

**m2. Two guards on a money figure and a privacy rule that no committed case holds (my mutants survive).** My own mutants, run against the committed `SavedMoment.render.test.tsx` (`own_mutants.py`, `own-mutants.out`): the code is right today in both places, and my probes pin them.

- **m2a. The day.** O3a: `todayInBangkok(new Date())` (`SavedToastHost.tsx:135`) replaced by the UTC date survives all 16 render cases, whenever the run is between 07:00 and 24:00 Bangkok (the committed cases take `TODAY` from the same function). Between 00:00 and 07:00 Bangkok that slip would ask for yesterday and show yesterday's total as "today", the failure mode Review Focus 5 names (it names other tasks, but every task's "today" is Bangkok's, Global Constraints, Time). Probe `PROBE day edge` (`vi.useFakeTimers({ toFake: ['Date'] })`, `2026-11-12T17:30:00Z`): the read asks `{ from: '2026-11-13', through: '2026-11-13', type: 'expense', sort: 'date_desc' }`; it passes on the commit and kills O3a (O3b). Add it.
- **m2b. The iOS announcement in private mode.** O50a: the host announces the unmasked spoken total (`toastWords(notice, total, false, t).spoken`) survives all 16 cases. The committed iOS case runs outside private mode (`SavedMoment.render.test.tsx:584-595`) and the private case asserts the drawn text and the label (`:536-552`), not the announcement. Review Focus 2 lists a spoken label among the places no digit may reach, and the dispatch asks to check this one. Probe `PROBE iOS in private mode hears no amount` kills O50a (O50b). Add it.

**m3. The toast's box and the chip's touch handling are not held.** My mutants against the committed suite, all survive:

- **O1:** `top: insets.top + 8` to `top: 8` (`SavedToastHost.tsx:222`). On a notched phone the toast would sit under the status bar. The test stub has a 62 pt top inset, so a case can see it (my probe prints `top: 70px`).
- **O2:** drop `pointerEvents="box-none"` (`:221`). The wrapper spans the screen less 16 pt each side and is as tall as the pill, so for six seconds after every save it would take the touches beside the pill, over Home's header row (the eye, the settings button).
- **O5:** drop `pointerEvents="none"` on the chip (`SaveFlight.tsx:113`): the chip would take touches over the card's top while it flies.
- Fix: one assertion each (`style.top === '70px'` for the stub's inset; the two `pointerEvents` as source reads or a prop check). The code is right.

### Nit

**n1. The flight's travel is not asserted, and the chip's title is unbounded.** Mutants O7 (the start side flipped), O8 (no shrink), O9 (no fade), O40 (`FROM_BOTTOM = 0`) and O10 (the spring without `reduceMotion: ReduceMotion.Never`, W6, `SaveFlight.tsx:102`) all survive; the committed cases pin where the chip lands, not how it gets there. That is decorative, and the receipt lists the flight's look on a phone as SKIPPED; P2-T37's sweep should hold `ReduceMotion.Never`. Separately, the title is the merchant, else the whole note (up to 500 characters, with line breaks), drawn without a line limit in a pill sized for one line (`CHIP_HALF = 18`, `:131`): a long note makes a tall chip that lands off its middle. `numberOfLines={1}` on the title would do.

**n2. A failed Undo after "any other refusal" says "This entry could not be saved."** (`saveProblem`'s default). It is the brief's P8 and today's record delete says the same (`recordActions.ts:450-452`), but the words are about saving. For E2-B.

**n3. After an income or a move the toast still says `วันนี้ ฿…`, today's money out** (W31 says so for every save). Nothing in the line says it is spending, so after salary it can read as today's income. A question for E2-B (hide the total for a non-expense save, or word it).

**n4. On iOS, a total that lands after 600 ms is announced as a second message** (`บันทึกแล้ว`, then `บันทึกแล้ว · วันนี้ 132 บาท`, `SavedToastHost.tsx:210`), so VoiceOver hears "Saved" twice. By design (the plan's 600 ms); note it for E2-B.

**n5. `busy` is reset in `finally` before React has drawn the answer** (`:199-201`). A second tap that arrives in the few milliseconds between the two would rerun the removal on the old closure (the real diary would refuse it, so the toast would say "Couldn't change this device's copy" over a done Undo, and offer a delete of a record that never existed). I could not reproduce it (React flushes first inside `act`), and a human's second tap is hundreds of milliseconds later, so this is theoretical. Keeping `busy` set while `again` is false would close it.

## Notes for later tasks

- **P2-T18 (the wallet shell):**
  - `noticeOf` takes `tc` as a fourth argument (brief P5); the plan's text for P2-T18 (line 1075) still names three. Call `noticeOf(saved, context.lookups, context.offline, tc)` from a component below the host that reads `useSavedToast()`; `show` is stable and does nothing outside a host, so a missing host is silent.
  - The providers above the host: `SpendV1Provider` (the toast calls `useSpendV1()`, which throws on the first notice if it is missing, not at `show`), `SpendDiaryProvider` (an absent diary reads as no diary, so no Undo for a phone-kept save), `CardFramesProvider` (without it the chip never flies) and `PrivateModeProvider` (outside it amounts show). The host's box must be the whole window: the chip's `left` and `top` are in the host's box, `frameOf` answers in window coordinates, and `dy` uses the window's height and the bottom inset.
  - `frameOf` answers only while a `CardStack` is mounted, so a Home kept mounted under another screen must keep the chip from flying to a hidden card (the receipt's P20 says the same).
- **P2-T37 (the sweep):** hold the two private-mode points the toast depends on (the iOS announcement, m2b) and the day edge (m2a), the chip's dropped title, and `ReduceMotion.Never` in `SaveFlight`.
- **Phase 5 (currencies):** `summary.expense_minor` is in the home currency (contract `Totals.currency`) while a draft's `amount_minor` is in its record's currency; `todayOutMinor` adds the latter as baht, and `walletMoneyText` always draws `฿`. A draft in another currency needs its `home_amount_minor`, and the sign changes with a non-baht home. No draft can carry a currency at this base (`quickAddModel.ts` has none).
- **E2-B:** n2, n3 and n4; the six-second dwell is short for a screen-reader user who must reach Undo, so consider a longer or screen-reader-aware time; capture `bw-saved-toast` at AX5 by hand (it wraps), and the toast over elevated cards on Android (`zIndex` with no `elevation`).
- **Controller:** the planner's "94 mutants, all killed" holds for the mutants it ran (12 rerun by me, all killed), but the survivors above come from guards it did not mutate (the day, the private announcement, the toast's box and touches). The brief for any later task that touches `SavedToastHost.tsx` or `SaveFlight.tsx` should add them.

## Evidence index (all under `.claude/controller/scratch/p2-t17-second/`)

- `probe-final.render.test.tsx` (my seven probes, built on the committed test's own helpers, copied from `tree/apps/app/src/wallet/saved/Probe.render.test.tsx`), `probe-1.log` and `probe-2.log` (their output on the commit: 7 of 7 pass, with the undercount and overcount figures printed), `probe_head.txt` and `probe_body.txt`.
- `own_mutants.py` (the planner's runner with my list), `own-mutants.out`, `own-mutant-logs/` (15 mutants on the real suite: 5 killed, 10 survived; plus O3b and O50b on my probes, both killed).
- `planner-sample.out`, `planner-mutant-logs/` (12 of the planner's mutants rerun with its own `mutants.py` on my tree: P12, P15, P16, P17, P18, P22, H10, H13, H15, H17, H20, F9; 12 killed, 0 survived, each file restored sha256 equal).
- `prototype-fix.log` and `tree-fix/` (m1's prototype: 23 of 23 cases pass, the 16 committed plus my 7; the two race probes read `บันทึกแล้ว` and ฿82).
- `own-unit.log` and `own-render.log` (the focused files on the unmodified commit: 7 of 7, 16 of 16).
- After the mutants I checked that the six `saved/` sources equal the commit's blobs (`git hash-object` against `git ls-tree fa09a9c0`), and a final `git status --short` in the worktree prints nothing. The only file I added to the scratch tree is my own `Probe.render.test.tsx`.

VERDICT: Approved
