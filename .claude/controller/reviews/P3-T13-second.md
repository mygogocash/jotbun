# P3-T13 second review (money path, privacy, analytics): Claude Sonnet 5.5

Commit `14da2b4e` on `p3/t13-draft-origin` (PR #460), range `origin/claude/p1a-vault-core...14da2b4e` (merge base `4f1f7445`; the integration branch has since moved to `fb6aa0bd` with #457 merged, which shares no file). Read-only: every probe ran in a `git archive` copy (`.claude/controller/scratch/p3-t13-second/tree`, `node_modules` linked entry by entry from the worktree, the three workspace links re-pointed). The worktree is clean at `14da2b4e` and the main checkout was not touched.

My findings were written before I read any other review of this task. I then read the first review (`reviews/P3-T13.md`), reproduced the three things it found that I had not probed (PROBE-20 to PROBE-23, mutants MA3 to MA5), and amended this file. "Cross-check" at the end says what came from where.

## Summary

The commit is right on every money, wallet, auth and privacy point the dispatch names, with one exception that is small and not live: a save already in flight when the host goes away still sends its review and its `record_saved` when it lands (m1). Nothing sends two reviews for one draft from a person's taps, nothing sends `kept` for a save that did not commit, the source on the create, the device entry, a resend and `record_saved` agree, and only the allow-list's properties can reach an event. I found **no blocker and no major**.

Three minors: m1 above; a draft handed to a tray that is leaving is taken and never reviewed (m2, one-line fix); and nine guards that hold rules the brief states are pinned by no committed case (m3: nine mutants of my own survive the 28-case suite, and the receipt's two "no case can tell them apart" edits are told apart by a probe each). Two nits. **CI on #460 has not started** (nine jobs queued), so the merge still waits for it.

| id | rank | finding |
|---|---|---|
| m1 | minor | R119: a save in flight when the host goes away sends `ai_draft_reviewed` and `record_saved` after it has gone (PROBE-20) |
| m2 | minor | A draft handed to a tray that is leaving (after a close, or after a save landed) is taken by the hidden entry and never reviewed (PROBE-5, PROBE-23) |
| m3 | minor | Nine guards unpinned, including R119's unsaved-draft half; P13's two "equivalent" edits are not (PROBE-8, 13, 14 and six more) |
| n1 | nit | P8's lock reads the last drawn render: a draft handed over in the same batch as Save lands over the save (PROBE-7) |
| n2 | nit | `dropUnsaved()` runs before a `fill` that can throw; a 12-digit AI amount does (PROBE-17) |

## CI (R100)

`gh pr checks 460 --repo mygogocash/jotbun`, run 43426086916 (created 2026-11-13T12:32:52Z, head `14da2b4e`): all nine jobs (`checks`, `exports`, `render`, `sections-1` to `sections-3`, `database`, `edge`, `image`) are `queued`, with no steps, at 12:41Z, 12:56Z and 13:01Z. The run before it (`promote/p3-t3`, 12:16Z) is queued too, and the last completed run is from 02:21Z, so GitHub is not starting jobs. There are no counts to report. PR #460 holds exactly this commit and its 11 files. `git diff --check origin/claude/p1a-vault-core...14da2b4e`: exit 0, no output.

## What I ran (scratch tree, focused only)

- The ten changed files: the six source files I mutate are byte-equal to the commit's blobs (sha256 checked), and all ten match the planner's `real/` (`shasum` against `git show`).
- Node, three files (`draftOrigin`, `draftReview`, `quickAddModel`): tests 17, pass 17, fail 0. The Hermes globals guard: 1 of 1.
- Render, `entrySave.render.test.tsx` and `AddTray.render.test.tsx`: `Test Files 2 passed (2)`, `Tests 38 passed (38)`, no warning line but Node 26's localStorage notice.
- The live money path the commit touches: `QuickAddScreen.render.test.tsx` and the four routes tests (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`, `PlanningRoutes`): `Test Files 5 passed (5)`, `Tests 103 passed (103)`.
- `npm run typecheck:app`: exit 0. (My first run failed on two errors in `src/auth/betterAuthClient.ts`: my tree lacked the `apps/app/node_modules/@better-auth` link. Linked, rerun, exit 0. Nothing in the commit's files.)
- 13 of the planner's 48 mutants, through its own `mutants.py` pointed at my tree (H1, H2, H4, H5, H6, H12, H16, H17, H23, H27, E1, Q1, R1): **13 killed, 0 survived**, each with the implementer's counts and first failing case, each file restored sha256-equal (`logs/planner-sample-1.out`, `planner-sample-2.out`).
- 9 mutants of my own (`tools/my_mutants.py`, `logs/my-mutants-1.out` to `my-mutants-3.out`): **all 9 survive the committed `AddTray.render.test.tsx` (28 of 28 pass)**, and each is killed by one probe on an `AssertionError` (m3).
- 23 probes (`probes/probes-part.tsx`, appended to a copy of `AddTray.render.test.tsx`): all 23 pass on the commit (`logs/probes-all-2.log`: `Tests 23 passed | 28 skipped (51)`). Observations that are not pass or fail are in `logs/probe-out.txt`.

## The dispatch's questions

**P7, each review sent once.**
- **Saved** (`AddTrayHost.tsx:341-349`): the pending review is read at `:343` and cleared at `:345` before it is sent at `:346`. `onSaved` is reached only from `finish` (`entrySave.ts:110`), which runs after the device commit (`:194-195`), the server's acknowledgement (`:124-126`) or an own-create match (`:136-137`).
  - A refused local save (`saveDraft` rejects, `:196-200`) sends nothing and the retry that lands is `kept` once (PROBE-18).
  - A conflict closed with Done is `dropped` once, never `kept`, and sends no `record_saved` (PROBE-11).
  - An own-create match on a resend is `kept` once (PROBE-12).
  - A resend after an unknown outcome sends the same create, source and all, under the same key (`calls[1].args` deep-equals `calls[0].args`, `source: 'photo'`), and the review is sent once, still one after waiting past the 1.5 s close bound (PROBE-3).
- **Two reviews:** none from a person's taps. A double tap on Save makes 2 saves and 2 `record_saved` (the old P2-T16 double save, not this task's) and **one** review (PROBE-6). The one way I found to two reviews around one record is n1, which a tap cannot do.
- **Dropped, once** (`:364-374`): cleared at `:367` before it is sent. Close, escape, conflict Done and the replacing draft all go through it.
- **The host goes away.** For an **unsaved** draft nothing is sent (PROBE-8), but no committed case holds that (m3). A save **already in flight** is the exception (m1): the brief's and the receipt's "a host that goes away sends nothing" is accurate for the unsaved draft only.
- **The receipt's risk is real and small** (PROBE-4): an unconfirmed save the person closes is sent once, the create may have committed, and the review is `dropped` (Haiku, 0 fields) with no `record_saved`. It is wrong in one direction only (a committed record reviewed `dropped`), never `kept` for an uncommitted one, and it touches analytics only. I would leave it. If it is ever worth fixing, send no review while `status === 'unconfirmed'`. The choice itself is unpinned (m3, MA5).

**The source on the wire (P5, H9).**
- `buildQuickAdd` puts `source` last and only when given (`quickAddModel.ts:197-200`): mutant Q1 (key always present) is killed, so the legacy Quick add's JSON and its resend key are unchanged. The Quick add suite plus the four routes pass (103 of 103).
- The create and the device entry carry the same source: both come from the one `built` (`entrySave.ts:178`), and `toPendingEntry` spreads the input (`quickAddModel.ts:205-207`). A move carries it too (`resources.ts:232` posts `{ ...input, type: 'transfer' }`; PROBE-9 saved a typed move with `source: 'typed'`).
- The server and the diary accept it: the vault's `createTransaction` lists `'source'` as a known field for entries and moves (`apps/edge/src/vault/domain/transactions.ts:239`, parsed at `:256`), and `assertDraft` allows it (`diaryRepository.ts:110-111, 151-155`).
- `ownCreateMatches` compares every field of the input, `source` included, with the server's copy (`screens/v1/parts.tsx:200-204`), and the server's `toDto` returns `source` (`transactions.ts:93`), so the own-create match holds with a source (PROBE-12).
- Quick chips call `fill(item.draft, false)` and edits go through `edit`; neither touches `origin`. PROBE-9: a draft switched to income keeps `photo`. PROBE-21: a chip over an AI draft saves `photo` and is reviewed `edited` 1. The chip half is unpinned (m3, MA3).

**Analytics (P11).**
- `record_saved` is `recording` in the allow-list (`catalog.ts:75-82`: `source` with all seven values, `has_photo`).
- `ai_draft_reviewed` is `bun` (`:84-89`, `:138`: `outcome`, `fields_edited`, `model`, `escalated`).
- `trackAiDraftReviewed` forwards only those four (`events.ts:144-146`).
- The bus wraps the controller's `track` in try and catch (`bus.ts`), so analytics cannot break a save.
- The development tally gets `(outcome, model)` and nothing else.
- No amount, place, note or wallet name can reach an event, and the host reaches the tally only through `useDraftReview`.

**P8, and `fromSheet` without a lock check: it holds, and needs no guard.**
- `onUse` is called only from `TellBunSheet`'s `use()`, which only the "Use this" press runs (`TellBunSheet.tsx`, `use` and `DraftCard`). A late read only sets `phase`; it never calls `onUse`.
- The sheet is mounted only in the amount step's `middle` (`AddTrayHost.tsx:517`).
- A save starts only from the confirm step's footer.
- Every way off the confirm step is disabled while `locked`: `goTo` returns (`:428`), `onBack` is undefined (`:559`), and the type switch is `disabled={locked}` (`:477`).
- After a refused save (`editing`, `blocked`) the entry is not locked, and using the sheet is then right.
- A guard would be dead code, and no case could reach it.

**P6, the review's original.**
- `fill` returns `applied.amountMinor ?? settledMinor(keypad)` (`:411`), the amount Save would settle on.
- At save, `saved.draft.amountMinor` is that settled minor (`entrySave.ts:177`), never the draft's stale one.
- A typed amount under a draft with none stands, and saved unchanged it is `kept`: held by the committed case, and by H24 and H25.
- PROBE-10: a draft that names no category or wallet, saved as the tray shows it, is `kept`. The defaults are in its original, because `fill` lays the draft over `current`.

**R117, private mode.** `applyAi` fills through `fill(filled, true)` (`:423`). PROBE-2 (private mode, `applyAiDraft` with a place and a note that carry digits): the title is the tray's own, the amount `฿••••`, the note row `โน้ต ซ่อนอยู่ บันเดา`, and no digit anywhere in the step's text or labels. The committed cases pin this only through the sheet.

**m1 of P3-T5** (`draftReview.ts:38-42`): held. R1 (no `try`) is killed, and `reviewDraft` stays synchronous.

## Findings

### Blockers
None.

### Major
None.

### Minor

**m1. A save in flight when the host goes away still sends its review and its `record_saved` when it lands (P7, R119).**
`finish` calls the entry's `onSaved` (`entrySave.ts:110`) whether or not the entry is still mounted, and that `onSaved` takes the pending review and sends it (`AddTrayHost.tsx:341-347`); `finish` then sends `record_saved` (`entrySave.ts:111-115`). PROBE-20: an AI draft, Save online with `createTransaction` held, `cleanup()` (the host goes away, as on a sign-out), then the create is released. Sent after the host had gone: `ai_draft_reviewed` (`kept`, 0 fields, Haiku) and `record_saved` (`photo`). The brief's P7 says such a review "would land after the session changed, under the next person's consent", and the receipt's "What changed" says "A host that goes away sends nothing". Its Risks line ("sends no review for an unsaved AI draft") is the accurate one.
Why only minor: the review describes a save that did commit; `record_saved` has had the same exposure since 1D-T7; the events carry only allow-listed properties; the window is a sign-out between Save and the save's answer (an online create whose session was revoked fails without `finish`); and the host is mounted only by the catalogue today (`dev/catalogue/wallet/addHostSection.tsx:41`).
*What to do:* correct the receipt's line to "an unsaved draft's review is not sent; a save in flight still sends its review and `record_saved` when it lands", and carry the question to the task that mounts the host (P2-T18) and to 1D's follow-ups: should a `finish` that runs after its screen is gone send either event? Both would be held under R119.

**m2. A draft handed to a tray that is leaving is taken by the hidden entry and never reviewed.**
`applyAi` refuses only while `locked` (`:421`); `locked` is saving, unconfirmed and conflict (`entrySave.ts:92`), not a hidden tray and not `saved`. The host's `applyAiDraft` (`:217`) reaches the entry until it unmounts, up to `CLOSED_BOUND_MS` (1.5 s) when iOS's dismissal does not end. The dropped review runs only when `visible` changes (`:372-374`), so a draft taken after that has no review left to send. PROBE-5: close (Modal dismissal held), then a draft: no `ai_draft_reviewed` at all, ever. PROBE-23: the same after a save landed (`kept` is the only review). Against the plan: "closing or discarding with an AI origin unsaved reviews `dropped` once".
Reach: no caller exists today. P3-T18's one-draft path calls `applyAiDraft` when the parse answers, which can be just after the person closed the tray. The cost is analytics only, but a lost review undercounts the draft outcomes the phase-3 proof reads.
*Fix:* one line and one case. `applyAi` returns while `!visible` (or the host's `applyAiDraft` while `!now.current.visible`), and a case like PROBE-5 and PROBE-23 expects the late draft to be refused (nothing filled, nothing reviewed). With this guard the clear in `dropUnsaved` (MB2 below) becomes unobservable, as P13 says it is today.

**m3. Nine guards on the review, privacy and P4/P8 paths are not pinned, and two of them are the receipt's "no case can tell" edits.**
The code is right today: every probe passes on the commit. But each of these edits to `AddTrayHost.tsx` leaves all 28 cases green, and each dies on one probe (protocol step 5: a test for every survivor). Mutant logs: `mutant-logs/<id>.suite.log` and `<id>.probe.log`.

| mutant | the guard | the rule | probe and kill |
|---|---|---|---|
| MA1 | a cleanup that reviews the draft `dropped` when the entry unmounts (added after `:374`) | P7, R119 | PROBE-8 (an unsaved AI draft, the host unmounted, 1.7 s later nothing sent): `expected [ { outcome: 'dropped', ... } ] to deeply equal []` |
| MB1 | `return () => onApplier(null)` (`:456`) | R119; P13 lists it as "no case can tell" | PROBE-13 takes `useAddTray()`'s handle, unmounts the host with the draft unsaved, then calls `applyAiDraft` through the old handle. With the cleanup nothing is sent; without it the gone entry's `applyAi` sends `dropped` after the host is gone. A slip or tell read still running after a sign-out makes exactly that call, so this line is the whole of R119 for it. |
| MB2 | the clear in `dropUnsaved` (`:367`) | P7 "once"; P13 lists it as "no case can tell" | PROBE-14: an AI draft, close with the Modal's dismissal held, then a second draft handed over. Expected one `dropped`; without the clear the late call re-sends the first draft's: `expected [ dropped, dropped ] to deeply equal [ dropped ]`. Two reviews of one draft. |
| MA2 | `if (shown === null) return;` (`:424`) | P4: before the entry has started it does nothing | PROBE-1: without it `applyAiDraft` throws `TypeError: Cannot read properties of null (reading 'draft')` while the lists load. |
| MA4 | `applier.current?.(draft, meta)` (`:217`) | P4: no entry open does nothing | PROBE-22: `applier.current!` throws with the host mounted and no tray open. |
| MA27 | `applyAiDraft: () => undefined` outside a host (`:160`) | P4 | PROBE-16: it throws when mutated; no case calls it outside a host. |
| MA16 | the conflict leg of P8 (`:421`): `if (locked && status !== 'conflict') return;` | P8: saving, unconfirmed and conflict | PROBE-15: with a conflict standing, an Opus draft lands (`expected '฿77' to be '฿65'`). H16 and H17 cover the other two. |
| MA5 | `if (!visible && !locked) dropUnsaved();` (`:373`) | the receipt's risk: a locked close is `dropped` | PROBE-4 (and PROBE-11): the `dropped` the receipt describes is a choice that nothing holds. |
| MA3 | a quick chip resets the origin: `apply: () => { fill(...); origin.current = TYPED_ORIGIN; }` (`:482`) | P5: chips leave the origin | PROBE-21: an AI draft then a chip must save `photo` and review `edited` 1; the committed chip case is typed, so it cannot tell. |

*Fix* (test only, all ready to adapt in `probes/probes-part.tsx`): PROBE-8 and PROBE-13 as one case ("a host that goes away sends no review for an unsaved draft, and a draft handed over late through an old handle changes nothing"); PROBE-1, 15, 16 and 22 into the "handed over while a save is on its way, or while its answer is unknown" case; PROBE-14 (if m2's guard is not taken), 4/11 and 21 as their own short cases. Correct P13's wording in the receipt.

### Nits

**n1. P8's lock is the last drawn render's.** `applyAi` reads `locked` from the closure of the last committed render (`:421`), and the host's ref is refreshed by a passive effect with no dependency list (`:454-457`). PROBE-7 hands a draft over in the same `act` as the Save press: it lands over the save in flight. The create saved is the first draft (`amount_minor: '6500'`, `source: 'photo'`), but the reviews sent are `dropped` (Haiku) then `edited` with 2 fields (Opus, escalated), and `record_saved` says `photo`: two reviews, neither of the saved record. A tap cannot do this (a discrete event's effects flush before the next task), and P3-T17's read ends in its own task, so I rank it a nit. A ref set synchronously in `save()` would make P8 exact.

**n2. `dropUnsaved()` runs before a `fill` that can throw** (`:422-423` in `applyAi`, `:415-416` in `fromSheet`). An AI draft whose `amount_minor` has 12 digits passes the app's `isAiDraft` (`aiResources.ts:32` and `:45-52`, `MINOR` allows 12 digits) but not `keypadFromMinor` (`keypadExpression.ts:211`, at most 99,999,999,999 satang), so `filledKeypad` throws inside `fill` after `edit` and `setGuessed` were queued. PROBE-17 (the second draft, `amount_minor: '100000000000'`): `applyAiDraft` throws `TypeError: Expected canonical non-negative satang within the amount cap.`, the entry takes the second draft's fields but keeps the first amount (`6500`, saved as such, with the new place), the first draft is reviewed `dropped`, and the origin keeps the first draft's source with no review, so the saved record says `photo` and no review describes it. The server's `bahtToSatang` caps at the same `MINOR_MAX` (`apps/edge/src/server/ai/drafts.ts:42`), so a correct server never sends one, and the sheet path had the same throw before this task. A hardening: make `fill` compute before it queues (or catch it), and drop and replace the origin only once it has not thrown; or align `isAiDraft`'s regex with `MINOR_AMOUNT_MAX`.

## Notes for later tasks

- **P3-T17 and P3-T18 (`applyAiDraft` is addressed to "the open entry", and answers `void`).**
  - It does nothing, silently, when no entry is open, when its lists are still loading (P4), and while the entry is locked. Taken into a leaving tray, a draft is lost (m2).
  - A draft meant for a tray that has closed lands in **the next tray that opens**: PROBE-19 held a handle from tray A, closed A, opened B, called the handle: B showed `฿65`, saved as `photo`, reviewed `kept`.
  - A read that outlives its tray therefore needs the entry's identity: capture `entry.key` when the read starts and apply only while it is still the open entry. And `applyAiDraft` could answer whether it took the draft, so the caller can keep the result or send its own `dropped`.
  - Either change makes m3's cases the contract; add them first. P3-T18: if the person closed the tray while the parse ran, check that it is still open before calling, unless the host has m2's guard by then. The rows' close review is the list's own: the host's close reviews only the one draft in `origin` (`:372-374`), as the brief's P16 says.
- **P3-T15:** pass `hasPhoto: true` in the host's track for a kept photo, as the receipt says. Until then a `photo` source says `has_photo: false`, as the plan has it.
- **P2-T18 (the task that mounts `AddTrayHost` in the app) and 1D's follow-ups:** m1's question (a late `finish` after the host is gone).
- **Release (P10, for the owner and P6C).**
  - Today `AddTrayHost` is mounted only by the catalogue section (`dev/catalogue/wallet/addHostSection.tsx:41`); the legacy Quick add sends no source. P2-T18's `WalletShell` is what first mounts it.
  - The first build that ships it sends `source` on **every** tray save, `typed` included, so (a) the server must carry P3-T2 first (`assertKnownFields` refuses an unknown field, `transactions.ts:239`), and (b) the client minimum must be at least `0.2.0` (the receipt's P10; `app.json` reads `0.3.0`). The receipt names (b) only. Put both in P2-T18's receipt.
- **P5-T18e** edits `draftOrigin.ts` (`DraftFields.currency`): `draftOrigin.test.ts` is the place to pin it.

## Cross-check with the first review (read after my findings were written)

Same verdict, and no disagreement on any fact. What came from where:
- **Found by both:** the leaving-tray draft (its m1, my m2: I first rated it a nit; after reading its after-save variant I reproduced it as PROBE-23 and agree with minor and with its one-line fix), the clear in `dropUnsaved` (its n2, my MB2), the not-ready guard, the outside-host no-op and the conflict leg of P8 (its M2, M3, M6; my MA2, MA27, MA16).
- **Found by the first review, which I then reproduced:** m1 above (its m2, its REVIEW-1, my PROBE-20); the no-entry `?.` (its M4, my MA4), the locked close (its M5, my MA5) and the chip over an AI origin (its M8, my MA3).
- **Mine only:** MA1 and MB1 (R119 for an unsaved draft: an unmount review, and `onApplier(null)`), PROBE-19 (a draft for a closed tray lands in the next one), PROBE-7 (n1), PROBE-17 (n2), PROBE-3, PROBE-6, PROBE-9, PROBE-10, PROBE-12 and PROBE-18 as positive checks.
- **Its n1** ("source last" is not pinned and not needed): I agree. Key order is unobservable to every case, and both properties the brief draws from "last" hold wherever `...made` sits.

## Files

Everything is under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t13-second/`:
- `tree/`: the scratch tree (the probe file `AddTrayProbe.render.test.tsx` lives only there).
- `probes/probes-part.tsx`: PROBE-1 to PROBE-23, ready to adapt.
- `tools/my_mutants.py`: my nine mutants.
- `logs/`: `base-render.log`, `probes-*.log`, `probes-all-2.log`, `probe-out.txt`, `planner-sample-1.out`, `planner-sample-2.out`, `my-mutants-1.out` to `my-mutants-3.out`, `typecheck-app-2.log`, `quickadd-routes.log`.
- `mutant-logs/`: each mutant's suite and probe log.

VERDICT: Approved
