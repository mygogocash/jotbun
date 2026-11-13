# P3-T13 second review (money path, privacy, analytics): Claude Sonnet 5.5

Commit `14da2b4e` on `p3/t13-draft-origin` (PR #460), range `origin/claude/p1a-vault-core...14da2b4e` (merge base `4f1f7445`; the integration branch has since moved to `fb6aa0bd` with #457 merged, which shares no file). I did not read any other review of this task. Read-only: every probe ran in a `git archive` copy (`.claude/controller/scratch/p3-t13-second/tree`, `node_modules` linked entry by entry from the worktree, the three workspace links re-pointed). The worktree is clean at `14da2b4e` and the main checkout was not touched.

## Summary

The commit is right on every money, wallet, auth and privacy point the dispatch names. No path sends two reviews for one draft from a person's taps, none sends `kept` for a save that did not commit, the source on the create, the device entry, a resend and `record_saved` agree, and nothing but the allow-list's properties can reach an event. I found **no blocker and no major**.

Two minors: the guards that hold P7's "once" and R119's "nothing after the host goes away" are not pinned by the committed suite. Six mutants of my own survive its 28 cases, and the receipt's two "no case can tell them apart" edits (P13) are told apart by a probe each. Three nits. **CI on #460 has not started** (nine jobs queued), so the merge still waits for it.

| id | rank | finding |
|---|---|---|
| m1 | minor | R119 is unpinned: a review on unmount, and dropping `onApplier(null)` (the receipt's "equivalent" edit #2), both survive; PROBE-8 and PROBE-13 kill them |
| m2 | minor | Four more guards unpinned: the clear in `dropUnsaved` (the receipt's "equivalent" edit #1, which is not), the not-ready guard, the conflict leg of P8, the outside-host no-op |
| n1 | nit | P8's lock reads the last drawn render: a draft handed over in the same batch as Save lands over the save (PROBE-7) |
| n2 | nit | `dropUnsaved()` runs before a `fill` that can throw; a 12-digit AI amount does (PROBE-17) |
| n3 | nit | A draft handed to a tray that is leaving is shown nowhere and reviewed never (PROBE-5) |

## CI (R100)

`gh pr checks 460 --repo mygogocash/jotbun`, run 43426086916 (created 2026-11-13T12:32:52Z, head `14da2b4e`): all nine jobs (`checks`, `exports`, `render`, `sections-1` to `sections-3`, `database`, `edge`, `image`) are `queued`, with no steps, at 12:41Z, 12:56Z and 13:01Z. The run before it (`promote/p3-t3`, 12:16Z) is queued too, and the last completed run is from 02:21Z, so GitHub is not starting jobs. There are no counts to report. PR #460 holds exactly this commit and its 11 files. `git diff --check origin/claude/p1a-vault-core...14da2b4e`: exit 0, no output.

## What I ran (scratch tree, focused only)

- The ten changed files: the six source files I mutate are byte-equal to the commit's blobs (sha256 checked), and all ten match the planner's `real/` (`shasum` against `git show`).
- Node, three files (`draftOrigin`, `draftReview`, `quickAddModel`): tests 17, pass 17, fail 0. The Hermes globals guard: 1 of 1.
- Render, `entrySave.render.test.tsx` and `AddTray.render.test.tsx`: `Test Files 2 passed (2)`, `Tests 38 passed (38)`, no warning line but Node 26's localStorage notice.
- The live money path the commit touches: `QuickAddScreen.render.test.tsx` and the four routes tests (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`, `PlanningRoutes`): `Test Files 5 passed (5)`, `Tests 103 passed (103)`.
- `npm run typecheck:app`: exit 0. (My first run failed on two errors in `src/auth/betterAuthClient.ts`: my tree lacked the `apps/app/node_modules/@better-auth` link. Linked, rerun, exit 0. Nothing in the commit's files.)
- 13 of the planner's 48 mutants, through its own `mutants.py` pointed at my tree (H1, H2, H4, H5, H6, H12, H16, H17, H23, H27, E1, Q1, R1): **13 killed, 0 survived**, each with the implementer's counts and first failing case, each file restored sha256-equal (`logs/planner-sample-1.out`, `planner-sample-2.out`).
- 6 mutants of my own (`tools/my_mutants.py`, `logs/my-mutants-1.out`, `my-mutants-2.out`): **all 6 survive the committed `AddTray.render.test.tsx` (28 of 28 pass)** and each is killed by one probe, on an `AssertionError` (m1, m2).
- 19 probes (`probes/probes-part.tsx`, appended to a copy of `AddTray.render.test.tsx`): all 19 pass on the commit (`logs/probes-all.log`, plus PROBE-19 in `probes-6.log`). Observations that are not pass or fail are in `logs/probe-out.txt`.

## The dispatch's questions

**P7, each review sent once.**
- **Saved** (`AddTrayHost.tsx:341-349`): the pending review is read at `:343` and cleared at `:345` before it is sent at `:346`. `onSaved` is reached only from `finish` (`entrySave.ts:110`), which runs after the device commit (`:194-195`), the server's acknowledgement (`:124-126`) or an own-create match (`:136-137`).
  - A refused local save (`saveDraft` rejects, `:196-200`) sends nothing and the retry that lands is `kept` once (PROBE-18).
  - A conflict closed with Done is `dropped` once, never `kept`, and sends no `record_saved` (PROBE-11).
  - An own-create match on a resend is `kept` once (PROBE-12).
  - A resend after an unknown outcome sends the same create, source and all, under the same key (`calls[1].args` deep-equals `calls[0].args`, `source: 'photo'`), and the review is sent once, still one after waiting past the 1.5 s close bound (PROBE-3).
- **Two reviews:** none from a person's taps. A double tap on Save makes 2 saves and 2 `record_saved` (the old P2-T16 double save, not this task's) and **one** review (PROBE-6). The one way I found to two reviews around one record is n1, which a tap cannot do.
- **Dropped, once** (`:364-374`): cleared at `:367` before it is sent. Close, escape, conflict Done and the replacing draft all go through it.
  - Nothing is sent when the host goes away: PROBE-8 passes. That holds, but no committed case holds it (m1).
- **The receipt's risk is real and small** (PROBE-4): an unconfirmed save the person closes is sent once, the create may have committed, and the review is `dropped` (Haiku, 0 fields) with no `record_saved`. It is wrong in one direction only (a committed record reviewed `dropped`), never `kept` for an uncommitted one, and it touches analytics only. I would leave it. If it is ever worth fixing, send no review while `status === 'unconfirmed'`.

**The source on the wire (P5, H9).**
- `buildQuickAdd` puts `source` last and only when given (`quickAddModel.ts:197-200`): mutant Q1 (key always present) is killed, so the legacy Quick add's JSON and its resend key are unchanged. The Quick add suite plus the four routes pass (103 of 103).
- The create and the device entry carry the same source: both come from the one `built` (`entrySave.ts:178`), and `toPendingEntry` spreads the input (`quickAddModel.ts:205-207`). A move carries it too (`resources.ts:232` posts `{ ...input, type: 'transfer' }`; PROBE-9 saved a typed move with `source: 'typed'`).
- The server and the diary accept it: the vault's `createTransaction` lists `'source'` as a known field for entries and moves (`apps/edge/src/vault/domain/transactions.ts:239`, parsed at `:256`), and `assertDraft` allows it (`diaryRepository.ts:110-111, 151-155`).
- `ownCreateMatches` compares every field of the input, `source` included, with the server's copy (`screens/v1/parts.tsx:200-204`), and the server's `toDto` returns `source` (`transactions.ts:93`), so the own-create match holds with a source (PROBE-12).
- Quick chips call `fill(item.draft, false)` and edits go through `edit`; neither touches `origin`, so the origin stays as it was (PROBE-9: a draft switched to income keeps `photo`).

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

**m1. R119's "nothing after the host goes away" is unpinned, and the receipt's second "equivalent" edit is not equivalent.**
The code is right today. But two edits to `AddTrayHost.tsx` leave the 28-case suite green, and each breaks R119, which the brief names (P7: "no review lands under the next person's consent"):
- **MA1**, a cleanup that reviews the draft `dropped` when the entry unmounts (`useEffect(() => () => dropUnsaved(), [dropUnsaved])` after `:374`). It survives. PROBE-8 (an unsaved AI draft, the host unmounted, 1.7 s later no `ai_draft_reviewed`) kills it: `expected [ { outcome: 'dropped', ... } ] to deeply equal []`. That is the sign-out case.
- **MB1**, dropping `return () => onApplier(null)` (`:456`). The receipt's P13 lists it as an edit "no case can tell apart from the code". It survives, and it is observable. PROBE-13 takes `useAddTray()`'s handle, unmounts the host with the draft unsaved, then calls `applyAiDraft` through the old handle. With the cleanup nothing is sent. Without it, the gone entry's `applyAi` runs `dropUnsaved()` and sends `dropped` after the host is gone (`expected [ { outcome: 'dropped', ... } ] to deeply equal []`). That late call is what an in-flight slip read (P3-T17) or tell read (P3-T18) makes after a sign-out, so this one line is the whole of R119 for them.

*Fix* (test only, about 25 lines): add PROBE-8 and PROBE-13 to `AddTray.render.test.tsx` as one case ("a host that goes away sends no review, and a draft handed over late through an old handle changes nothing"), and correct P13's wording in the receipt.

**m2. Four more guards are unpinned.** Each survives the committed suite and dies on one probe (protocol step 5: a test for every survivor).

| mutant | guard | probe and kill |
|---|---|---|
| MB2 | the clear in `dropUnsaved` (`:367`), the receipt's other "equivalent" edit ("after a drop the origin is always replaced, or the entry goes") | PROBE-14: an AI draft, then close with the Modal's dismissal held so the entry stays mounted, then a second draft handed over. Expected one `dropped`. Without the clear the late call re-sends the first draft's: `expected [ dropped, dropped ] to deeply equal [ dropped ]`. Two reviews of one draft, which P7 forbids. |
| MA2 | `if (shown === null) return;` (`:424`), P4's "before the entry has started it does nothing" | PROBE-1: without it `applyAiDraft` throws `TypeError: Cannot read properties of null (reading 'draft')` while the lists load. |
| MA16 | the conflict leg of P8 (`:421`, `locked` is saving, unconfirmed and conflict): `if (locked && status !== 'conflict') return;` | PROBE-15: with a conflict standing, an Opus draft handed over lands (`expected '฿77' to be '฿65'`). The committed case covers saving and unconfirmed only (H16, H17). |
| MA27 | `useAddTray()` outside a host does nothing (`:160`, P4) | PROBE-16: `applyAiDraft` throws when mutated, and no case calls it outside a host. |

*Fix* (test only): fold PROBE-1, PROBE-15 and PROBE-16 into the "handed over while a save is on its way, or while its answer is unknown" case, and PROBE-14 into the "closing" case. `probes/probes-part.tsx` has all of them ready to adapt.

### Nits

**n1. P8's lock is the last drawn render's.** `applyAi` reads `locked` from the closure of the last committed render (`:421`), and the host's ref is refreshed by a passive effect with no dependency list (`:454-457`). PROBE-7 hands a draft over in the same `act` as the Save press: it lands over the save in flight. The create saved is the first draft (`amount_minor: '6500'`, `source: 'photo'`), but the reviews sent are `dropped` (Haiku) then `edited` with 2 fields (Opus, escalated), and `record_saved` says `photo`: two reviews, neither of the saved record. A tap cannot do this (a discrete event's effects flush before the next task), and P3-T17's read ends in its own task, so I rank it a nit. A ref set synchronously in `save()` would make P8 exact.

**n2. `dropUnsaved()` runs before a `fill` that can throw** (`:422-423` in `applyAi`, `:415-416` in `fromSheet`). An AI draft whose `amount_minor` has 12 digits passes the app's `isAiDraft` (`aiResources.ts:32` and `:45-52`, `MINOR` allows 12 digits) but not `keypadFromMinor` (`keypadExpression.ts:211`, at most 99,999,999,999 satang), so `filledKeypad` throws inside `fill` after `edit` and `setGuessed` were queued. PROBE-17 (the second draft, `amount_minor: '100000000000'`): `applyAiDraft` throws `TypeError: Expected canonical non-negative satang within the amount cap.`, the entry takes the second draft's fields but keeps the first amount (`6500`, saved as such, with the new place), the first draft is reviewed `dropped`, and the origin keeps the first draft's source with no review, so the saved record says `photo` and no review describes it. The server's `bahtToSatang` caps at the same `MINOR_MAX` (`apps/edge/src/server/ai/drafts.ts:42`), so a correct server never sends one, and the sheet path had the same throw before this task. A hardening: make `fill` compute before it queues (or catch it), and drop and replace the origin only once it has not thrown; or align `isAiDraft`'s regex with `MINOR_AMOUNT_MAX`.

**n3. A draft handed to a tray that is leaving is shown nowhere and reviewed never.** PROBE-5: the tray closes (Modal dismissal held), then `applyAiDraft`. The still-mounted entry takes it and sets a pending review, which no one sends, since the effect on `visible` has run and the entry then goes. P7's "dropped once" does not cover a draft that arrives after the close. Harmless today (no caller); see the notes for P3-T17 and P3-T18.

## Notes for later tasks

- **P3-T17 and P3-T18 (`applyAiDraft` is addressed to "the open entry", and answers `void`).**
  - It does nothing, silently, when no entry is open, when its lists are still loading (P4), and while the entry is locked.
  - A draft meant for a tray that has closed lands in **the next tray that opens**: PROBE-19 held a handle from tray A, closed A, opened B, called the handle: B showed `฿65`, saved as `photo`, reviewed `kept`.
  - A read that outlives its tray therefore needs the entry's identity: capture `entry.key` when the read starts and apply only while it is still the open entry. And `applyAiDraft` could answer whether it took the draft, so the caller can keep the result or send its own `dropped`.
  - Either change makes m1 and m2's cases the contract; add them first.
- **P3-T15:** pass `hasPhoto: true` in the host's track for a kept photo, as the receipt says. Until then a `photo` source says `has_photo: false`, as the plan has it.
- **Release (P10, for the owner and P6C).**
  - Today `AddTrayHost` is mounted only by the catalogue section (`dev/catalogue/wallet/addHostSection.tsx:41`); the legacy Quick add sends no source. P2-T18's `WalletShell` is what first mounts it.
  - The first build that ships it sends `source` on **every** tray save, `typed` included, so (a) the server must carry P3-T2 first (`assertKnownFields` refuses an unknown field, `transactions.ts:239`), and (b) the client minimum must be at least `0.2.0` (the receipt's P10; `app.json` reads `0.3.0`). The receipt names (b) only. Put both in P2-T18's receipt.
- **P5-T18e** edits `draftOrigin.ts` (`DraftFields.currency`): `draftOrigin.test.ts` is the place to pin it.

## Files

Everything is under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t13-second/`:
- `tree/`: the scratch tree (the probe file `AddTrayProbe.render.test.tsx` lives only there).
- `probes/probes-part.tsx`: PROBE-1 to PROBE-19, ready to adapt.
- `tools/my_mutants.py`: my six mutants.
- `logs/`: `base-render.log`, `probes-*.log`, `probe-out.txt`, `planner-sample-1.out`, `planner-sample-2.out`, `my-mutants-1.out`, `my-mutants-2.out`, `typecheck-app-2.log`, `quickadd-routes.log`.
- `mutant-logs/`: each mutant's suite and probe log.

VERDICT: Approved
