# Confirming review: 1D-T7 fix round (R119), PR #444

- Reviewer: Claude Opus 5.5, confirming review, 13 Nov 2026. Read-only: nothing edited, committed or pushed in any worktree; the main checkout was never touched.
- Reviewed: the fix-round commits after the reviewed head `78f91ca5` on `p1/1d-t7-app-events`, head `d8d7364a` (after `git fetch`):
  - `f09af7a1`, the fix (12 files);
  - `d8d7364a`, the controller's merge of the integration branch. It brings in only base-side files (controller state, and #441's `ui/dateStep*` and `wallet/outside/*`). It touches none of the round's files (`git diff f09af7a1 d8d7364a` on them is empty).
  - Since then, the integration head moved only by `5ab4d8bb`, which is controller state.
- Spec: plan 1D `### Task 7` (line 699), with L4 (line 29), Task 1's controller rules (lines 256 to 268, the held rule at line 259), the Global Constraints (lines 58 to 75, consent at line 66). The brief is `briefs/1D-T7-fix.md` (R119, P21 to P33). The reviews are `reviews/1D-T7.md` and `reviews/1D-T7-second.md`. The receipts are `receipts/1D-T7-fix.md` and the new line in `receipts/1D-T7.md`.
- Scratch folder `.claude/controller/scratch/1d-t7-confirm/`:
  - `tree/` is `git archive d8d7364a` (its `.claude/` removed). Its `node_modules` is a linkfarm (`linkfarm.sh`): every dependency links to the worktree's copy, the workspace links point into `tree/` itself, and caches stay local.
  - `probes/` holds the reviews' probes and mine; `own-mutants.py`, `own-mutants/` and `own-mutants.out` hold my own mutants; `mutants/` and `mutants-sample.out` hold the planner's sample; `ci-*.log` are the CI job logs.
- After every probe and mutant, the tree was restored and checked:
  - all 793 files under `apps/app/src` and `apps/app/app` equal `d8d7364a`'s blobs (`git hash-object`, 0 differ, no extra file);
  - the worktree is clean and level with its remote.

**VERDICT: Needs fixes.** There is no blocker. There is one major, and one nit.

- **The round does what R119 asks.**
  - M1's onboarding step now survives a signed-out launch: every probe of both reviews passes.
  - The diary hears each sync outcome first.
  - The pins kill OM2, OM3 and K1 to K4.
  - CI is green, 9 of 9, and every number in the receipt reproduces.
- **CM1, the major:** this is the question the controller asked, whether the new rule now keeps something it should drop. It does, on a second launch.
  - A person whose account the app has not named yet signs out. The setup: the account read is a network call, which fails offline.
  - The controller takes that sign-out for "the launch's first answer" and keeps what that person did.
  - The next account to sign in and say yes then sends it, even though the first person's stored answer on this phone is no.
  - A twin of this path predates the round.
  - Both are proven through the real `AnalyticsUpkeep`. Both are closed by one small change.

---

## CI (R100)

Run `43244268718` (event `pull_request`, head `d8d7364a`), 9 of 9 jobs green. The run for `f09af7a1` (`43244253050`) was cancelled when the merge was pushed.

- **Typecheck, unit, API, build:**
  - `typecheck`, `typecheck:app` and `typecheck:routes`;
  - `test:api`: 47 suites, 1000 tests;
  - `test:app` 36 of 36; `test:unit` 1085 of 1085 (the first round's 1083, plus this round's 2 controller cases); `test:dev` 7 of 7;
  - the API build and `git diff --check`.
- **Render (every file but the per-section suites):** 129 files, 1654 tests. That is the first round's 1646, plus this round's 8 new render cases.
- **Render, per-section suites:** 248, 190 and 230 passed, 668 in all.
- **Exports:** web (4887 modules) and iOS (5853 modules), both `Exported: dist`.
- **Edge:**
  - `test:edge`: 20 files, 205 tests;
  - `test:edge:workers`: 34 files, 804 tests and 1 todo;
  - `test:edge:db`: 3 files, 12 tests.
- **SQL integration and ops:** `test:db`: 41 suites, 694 tests; `test:ops`: 111 of 111.
- **Release image and smoke:** passed.

## What I ran

- **The fixer's logs** (`scratch/1d-t7-fix/`) match every Expected line of the brief:
  - RED: 1 of 38 Node cases fails, and 2 of 220 render cases, all on assertions;
  - GREEN: 38 of 38 and 220 of 220;
  - mutants: 75 of 75, with QE equivalent;
  - routes 17 of 17;
  - `real-check` 12 `OK`.
- **The round's files in `tree/`** equal the planner's `real-check.sha256` (12 `OK`).
- **The focused files in `tree/`:**
  - `controller.test.ts`: 38 of 38;
  - the seven render files: `Tests  220 passed (220)`, 0 `stderr`.
  - No whole suite was run (R100).
- **The reviews' probes, against the fix** (`probes-reviews-*.log`):
  - Opus `zzReviewHeld` PROBE 1 and 2, and Sonnet A, B and C: 5 of 5;
  - Opus `zzReviewEarly` PROBE and CONTROL, and Sonnet probe D: 3 of 3.
  - Probe D's client saw `reset, reset, identify, capture:onboarding_step_viewed, screen:/spend/onboarding`.
- **My probes:**
  - `zzConfirmLeak.test.ts` and `zzConfirmLeak.render.test.tsx` (CM1);
  - `zzConfirmOrder.render.test.tsx` (R119.5).
  - Each was run at `d8d7364a`, and again with `78f91ca5`'s `controller.ts` or `deviceSync.ts` swapped in. The file was restored by sha256 each time.
- **The planner's mutants, a sample of 11** (`mutants-sample.out`): F1, F1u, F2, F3, D5, OM2, OM3 and K1 to K4.
  - All 11 are killed by assertions, each by the round's intended new case. For example: F1u by the signed-out first launch; OM2 by the track-less save; K4 by an income's Restore.
  - Every file was restored.
- **My own mutants** (`own-mutants.out`):
  - OWN-A (a sign-out never drops) is killed by "signing out still drops what was held".
  - OWN-B (a switch keeps) is killed by "held events are dropped when another account signs in".
  - OWN-D (`AnalyticsUpkeep` never calls `setAccount(null)`) is killed by the new signed-out first launch case, so the reviews' "pin it through `AnalyticsUpkeep`" holds.
  - OWN-C and OWN-C2 (the Sonnet form, in both suites) survive. That confirms P23's equivalence.
  - OWN-E: see n1.
- **Whitespace:** `git diff --check` is clean on `origin/claude/p1a-vault-core...d8d7364a` and on `78f91ca5..f09af7a1`.
- **Not run:**
  - the whole suites and exports (CI);
  - the database suites (Docker is stopped; CI's SQL and edge jobs passed);
  - native and device checks (SKIPPED: no PostHog project, Q5).

---

## Findings

### Blocker

None.

### Major

**CM1. Someone signs out before the app has named their account. The new rule then keeps what they did, and the next account's yes sends it, even over their own stored no. This breaks L4's "dropped on ... an account switch", Task 1's "any other change drops them" (line 259) and D34's "Nothing analytic is sent before yes" (line 66). The round opens this path on a returning launch; a twin predates the round.**

**What the controller cannot tell apart.** In `controller.ts`, `accountId` is `undefined` ("the app has not said who is signed in yet") or `null` ("signed out"). `AnalyticsUpkeep` only names an account after `fetchAccountId()`, a `GET /v1/me` over the network (`sharedV1.ts:83-89`, `AnalyticsUpkeep.tsx:49`).

- When that read fails, nothing reaches the controller (`AnalyticsUpkeep.tsx:52`). An example is an offline launch with a restored session.
- The follower runs again only on a session change or a return to the foreground (`:82-88`).
- So "a person is signed in, but unnamed" looks to the controller exactly like "no one is signed in yet".
- The held rule, `controller.ts:211`, against `78f91ca5`'s rule:

| Change seen by the controller | `78f91ca5` | `d8d7364a` |
| --- | --- | --- |
| launch (`undefined`) to `null` | drop | **keep** |
| launch to `A`, or `null` to `A` | keep | keep |
| `A` to `null`, or `A` to `B` | drop | drop |

**U1, which this round opens.** The provider has hydrated by the follower's first run, the person is offline, and the stored answer for A on this phone is no.

1. The follower sees A's binding, and `/v1/me` fails. The controller stays `loading`, with no account.
2. A saves an expense. `record_saved` is held.
3. A signs out. `signOutFlow` dispatches `signed_out` before any network call (`credentialProvider.ts:296-298`), so the follower calls `setAccount(null)`. From `undefined`, that now keeps the held events.
4. B signs in, online: `null` to `B` keeps them. B's answer on the server is yes, so `enterYes` sends A's save under B's identify.
5. A's stored no is never read, because the controller never loads A.

**U2, the twin, which predates the round** (1D-T1's rule meeting 1D-T6's follower).

1. The follower runs before the provider has hydrated, so the launch answers `null`.
2. A's session then arrives, and its read fails. A's saves are held as `signed_out`.
3. A's sign-out is `null` to `null`, which is no change.
4. `null` to `B` keeps the held events, and B's yes sends them.

**Probes** (`probes/zzConfirmLeak*.ts*`; each case asserts that A's save is not sent, so a failure is a leak):

| Case | At `d8d7364a` | With `78f91ca5`'s rule |
| --- | --- | --- |
| L1, controller (U1) | fails: `["identify:bb","capture:record_saved"]` | passes: `["identify:bb"]` |
| L2, controller (U2) | fails | fails |
| U1, through the real `AnalyticsUpkeep` and install (iOS, a key, A's stored no) | fails: `["reset","reset","identify:bb","capture:record_saved","screen:/spend"]` | passes |
| U2, the same | fails | fails |

**Why U1 is the order to expect.**

- `installAppAuth()` starts hydrating when the root layout's module loads (`_layout.tsx:21`). Hydration is local only: an epochs read, a session read and a cookie read (`credentialProvider.ts:184-205`, `betterAuthClient.ts:119-121`).
- `AnalyticsUpkeep` mounts only after the fonts and the saved language have loaded (`_layout.tsx:32-38`, `:47`).
- So on a returning launch the provider is usually `active` by the first follow. I could not measure this on a device (native checks are SKIPPED).

**Impact.**

- What leaves is allow-listed enums: no amount, name or identity of A.
- But it is A's activity, filed under B's person, after A said no on this very phone.
- The path is narrow. It needs:
  - a sign-out while the account is unread: offline, or within the read's round trip;
  - and then another account's sign-in and yes, in the same app run.
- Nothing is sent today (Q5). M1 was rated major on the same "once the key is set" footing, for missing data. This one sends data against consent.

**The round's text claims what it does not hold.**

- The receipt says "A sign-out (an account to null) and a switch (A to B) still drop what is held, so L4 and P14 hold" (`receipts/1D-T7-fix.md:7`), and the comment at `controller.ts:208-210` says the same.
- Both are true only for an account the controller has learned.

**The fix I recommend** keeps R119.1 for a real first launch and closes U1 and U2 together. It encodes L4's "a sign-out drops" where the follower can see it.

- **Where the follower sees it.** Its binding-null branch (`AnalyticsUpkeep.tsx:37-41`) already knows whether a session was seen since the last null (`seenEpoch !== null`). That is exactly "someone was signed in and has gone", whether or not their account was ever named.
- **What it does there.** In that case it calls one narrow controller entry that drops what is held and resets. Examples are `setAccount(null, { signedOut: true })` or `sessionEnded()`; this changes 1D-T1's interface, so it needs a ruling.
- **What the first launch keeps.** With no session seen yet, the follower still calls plain `setAccount(null)`, which keeps (R119.1).
- **Tests.** Add L1 and L2 as controller cases, and U1 and U2 as `AnalyticsUpkeep` cases. My probe files are ready to adapt.
- Then correct the receipt line and the comment.

**A complement, for later if not now.** When `/v1/me` cannot be reached, recall the account the server verified earlier for this binding, as the diary already does (`diarySession.ts:49-56`, `known.recall(binding)`).

- Then A's own stored answer applies offline: A's no drops at once, and A's yes sends under A.
- A's sign-out becomes `A` to `null`, which drops.
- On its own it leaves a binding that was never verified on this phone, so it does not replace the drop above.

**If the controller judges the path too narrow to hold #444,** the alternative is a ruling that defers it to a named task, with the receipt line and the comment corrected now. I rate it major because one person's activity leaves under another's yes, and because the controller asked exactly this question.

### Minor

None.

### Nit

**n1. The new Quick add case's privacy scan skips the plain typed forms of its amounts (`QuickAddScreen.render.test.tsx:1182`).**

- It scans for `2800000`, `28,000`, `150000` and `1,500`, but not for `28000` and `1500`.
- A plain number is the one form an allow-listed rule could carry. `seconds_to_save` is `count(3600)` in the recording group, which every recording event accepts (`catalog.ts:81`, `:131-133`).
- My contrived OWN-E sends the amount as `seconds_to_save` (`Number(fields.amountMinor) / 100`). It survives this case alone (`-t`, 1 passed).
- The file still kills it, through the first round's ฿45 scan and Add another's seconds. So the suite holds. Adding `'28000'` and `'1500'` would make the case stand alone, like the file's other scans (`'45'`, `'5000'`, `'1200'`).

---

## The controller's focus points

**R119.1 (M1).**

- **The reviews' probes all pass against the fix:** `zzReviewEarly` (both cases), `zzReviewHeld` PROBE 1 and 2, and the Sonnet probes A to D.
- **No path still drops onboarding's first step.** I checked:
  - a signed-out first launch (the provider's `hydrate_empty` keeps the binding null; `undefined` to `null` keeps);
  - a session restored at launch;
  - a first sign-in through `authenticating`: the binding stays null, `null` to `null` changes nothing, and `bootstrapped` gives `null` to `A`, which keeps;
  - a first account read that fails after the sign-in: the events stay held until the next follow.
  - The remaining drops are by design: an epoch move before the answer (P14), a no, and the 50-event cap.
- **Does it now keep something it should drop?**
  - A restart: no. The bus's early list and `held` live in memory only.
  - A no: no. Every no the controller reads drops (`applyNo`, `controller.ts:112-120`).
  - A second launch: yes, CM1. That includes a no the controller never reads.
- **The pins hold.**
  - F1, F1u, F2 and F3 are killed.
  - The sign-out drop holds on its own (OWN-A); so does the switch drop (OWN-B).
  - The `AnalyticsUpkeep` pin is real (OWN-D).
  - The Sonnet form is equivalent, as P23 says (OWN-C and OWN-C2).

**R119.5 (`deviceSync.ts`).**

- `report(outcome)` now runs first (`deviceSync.ts:36`). The new case pins the order, and D5 is killed.
- **Probe `zzConfirmOrder`,** with the emitters forced to throw:
  - the fix hands all three outcomes to the diary: `waiting`, `resync_pending` and `signed_out`;
  - `78f91ca5`'s order hands it only `signed_out`.
  - So `signed_out` locks the diary even if analytics throws. Strictly, it did before too: `signed_out` sends no event (`syncTelemetry.ts:19-28`). What the old order risked was losing an outcome that does send one.
- **After a throw** (unreachable while P12's guard at `bus.ts:49-54` stands), the run still rejects after the diary has heard. `previous` and the scheduler's timer re-arm are then skipped. No action is needed.
- **Re-entry:** `onOutcome` runs only after an `await` in the scheduler's `run` (`scheduler.ts:59-70`), so a stale `previous` cannot be read re-entrantly.

**R119.2 to R119.4 (the pins).**

- OM2, OM3 and K1 to K4 are killed in my sample, each by the case the brief names.
- The record screen, History and Recently deleted cases assert each event's whole property object, which is stronger than a JSON scan.
- The "Use yours" case checks the record's state as well: Food, ฿12,000.00, version 3.
- For Quick add's scan, see n1.

## Notes for later tasks

- **CM1's fix round:**
  - pin U1 and U2 through `AnalyticsUpkeep`, and L1 and L2 at the controller;
  - keep R119's pins: a signed-out first launch keeps, and a sign-out of a named account drops.
- **1D-T15:** besides the first launch's `coffee`, check an offline second launch: A saves, signs out, and B signs in and says yes. None of A's events should reach PostHog.
- **1D-T14 (the account events from the credential provider):** a `signed_out` tracked at the sign-out is exactly the kind of event this path would carry. Its tests should include the sign-out of an account the app had not named.
- **The follower:** an account unread at launch stays unread for the whole foreground session, because the read is retried only on a session change or a foreground. A fix that relies on the read should also retry it, or use the diary's verified account.

VERDICT: Needs fixes
