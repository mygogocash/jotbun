# Second confirming review: 1D-T7 second fix round (R120), PR #444

- Reviewer: Claude Opus 5.5, second confirming review, 13 Nov 2026. Read-only: nothing edited, committed or pushed in any worktree; the main checkout was never touched.
- Reviewed: the fix-round commits after the reviewed head `d8d7364a` on `p1/1d-t7-app-events`, head `bf79af59` (after `git fetch`; GitHub's PR head is the same):
  - `b76116c0`, the fix (7 files);
  - `bf79af59`, the controller's merge of the integration branch. Outside `.claude/`, `git diff b76116c0 bf79af59` is empty.
  - Since then the integration head moved to `217e6192` by controller state only (`fcd7501c`, `217e6192`; nothing outside `.claude/`).
- Spec: plan 1D `### Task 7` (line 699), with L4 (line 29), Task 1's controller rules (the held rule: "any other change drops them") and the Global Constraints (consent, D34). The brief is `briefs/1D-T7-fix2.md` (R120, P34 to P47). The review it answers is `reviews/1D-T7-confirm.md` (CM1, n1). The receipts are `receipts/1D-T7-fix2.md` and line 7 of `receipts/1D-T7-fix.md`.
- Scratch folder `.claude/controller/scratch/1d-t7-confirm2/`:
  - `tree/` is `git archive bf79af59` (its `.claude/` removed). Its `node_modules` is a linkfarm (`linkfarm.sh`) onto the worktree's, with the workspace links pointing into `tree/`.
  - `probes/` holds my probes. `swap-run.sh` runs a command with `d8d7364a`'s `controller.ts` and `AnalyticsUpkeep.tsx` swapped in (the planner's `orig/`), then restores them and checks them by sha256.
  - `mutants/` and `mutants-sample.out` hold the planner's sample; `own-mutants.py`, `own-mutants/`, `own-mutants.out` and `own-mutants-root.out` hold mine; `ci-*.log` are the nine CI job logs.
- After every probe and mutant the tree was restored. At the end:
  - all 793 files under `apps/app/src` and `apps/app/app` hash to `bf79af59`'s blobs, with no extra file (`tree-check.py`);
  - the worktree is clean at `bf79af59`.

**VERDICT: Approved.** No blocker and no major. One minor and one nit, both missing test pins; the code they guard is right.

- **CM1 is closed.**
  - The first confirming review's U1 and U2 probes now pass through the real `AnalyticsUpkeep` and install, and so do the round's U1 to U3.
  - Through the real credential provider I built six more orders that leak at `d8d7364a`: a server-ended session, a sign-in beside an active session, a read that fails twice across a foreground return, a read still in flight at a switch or at a sign-out, and a launch answered before hydration. None leaks at `bf79af59`.
- **P38 (U3) is right, and L4 needs it.** The provider takes a sign-in beside an active session (`bootstrapped` from `active`: the epoch moves with no null between). Without the flag there, A's save leaves under B.
- **R119 holds:** the signed-out first launch and the restored session pass. They also pass through the real provider, with a cancelled sign-in and two foreground returns in between.
- **The flag's reach:** one caller, `AnalyticsUpkeep`. A repeated null is plain. m1: the line that makes it plain is not pinned.
- CI is green, 9 of 9, and every number in the receipt reproduces.

---

## CI (R100)

Run `43292579278` (event `pull_request`, merge ref `2fd633a4`: `bf79af59` into `f490f10e`), 9 of 9 jobs green.

- **Typecheck, unit, API, build:**
  - `typecheck`, `typecheck:app` and `typecheck:routes`;
  - `test:api`: 47 suites, 1000 tests;
  - `test:app` 36 of 36; `test:unit` 1087 of 1087 (the confirming review's 1085, plus L1 and L2); `test:dev` 7 of 7;
  - the API build, `release-graph.mjs check` and `git diff --check`.
- **Render (every file but the per-section suites):** 129 files, 1657 tests. That is the confirming review's 1654, plus U1 to U3.
- **Render, per-section suites:** 248, 190 and 230 passed, 668 in all.
- **Exports:** web (4887 modules) and iOS (5853 modules), both `Exported: dist`.
- **Edge:**
  - `test:edge`: 20 files, 205 tests;
  - `test:edge:workers`: 34 files, 804 tests and 1 todo;
  - `test:edge:db`: 3 files, 12 tests.
- **SQL integration and ops:** `test:db`: 41 suites, 694 tests; `test:ops`: 111 of 111.
- **Release image and smoke:** passed.

## What I ran

- **The fixer's logs** (`scratch/1d-t7-fix2/`) match every Expected line of the brief:
  - kit: 62 `OK`; base: 38 of 38 and 96 of 96;
  - RED: 2 of 40 Node cases fail (L1, L2) and 3 of 99 render cases (U1 to U3), all on assertions;
  - GREEN: 40 of 40 and 99 of 99;
  - mutants: `89 of 89 killed; equivalent ['QE']`, with 89 `killed (assertion` and 90 `restored sha256 equal`;
  - gate: routes 17 of 17, the analytics render files 13 of 13, `test:app` 36 of 36, `test:unit` 1087 of 1087.
- **The round's 7 files in `tree/`** equal the planner's `real-check.sha256` (7 `OK`).
- **The focused files in `tree/`:**
  - `controller.test.ts`: 40 of 40;
  - the three render files (`appAnalytics`, `AnalyticsUpkeep`, Quick add): `Tests  99 passed (99)`, 0 `stderr`.
  - No whole suite was run (R100).
- **The first confirming review's probes** (`zzConfirmLeak*`), at `bf79af59`:
  - **Render U1 and U2: 2 of 2 pass.**
    - U1's client saw `reset, reset, identify:bb, screen:/spend`. At `d8d7364a` it was `reset, reset, identify:bb, capture:record_saved, screen:/spend`.
    - U2's saw `reset, reset, reset, identify:bb, screen:/spend`.
  - **Controller L1 and L2 still fail, by design.**
    - They call a plain `setAccount(null)`, which R120 keeps for a launch.
    - The controller cannot tell a launch's null from a sign-out; the follower can, and passes the flag.
    - The round's own L1 and L2 are the same scenarios with the flag, and they pass.
- **My probes:**
  - **`zzConfirm2Provider.render.test.tsx`: 11 cases, C1 to C11.**
    - They run through the real `AnalyticsUpkeep`, install and credential provider (its session machine), with a stand-in port, a server answer per account, and `/v1/me` offline or held in flight.
    - At `bf79af59`: 11 of 11 pass.
    - With `d8d7364a`'s two files swapped in (`swap-run.sh`, restored by sha256):
      - C4, C5, C6, C8, C9 and C10 leak A's save under B (`identify:bb, capture:record_saved`);
      - C3 changes (see "The flag's reach");
      - C1, C2, C7 and C11 pass at both.
  - **`zzConfirm2Order.test.ts`:** 5 controller cases that document what the flag does and does not reach. 5 of 5 pass.
- **The planner's mutants, a sample of 10** (`mutants-sample.out`): CS1, CS1s, CS2u, CS3u, CS4, UP2, UP3, UP4, UP5 and QN1.
  - All 10 are killed by assertions, each by the case the brief names:
    - CS1 by L1 and L2, and CS4 by L2's reset count;
    - CS1s and UP5 by U3;
    - CS2u by U2;
    - CS3u, UP3 and UP4 by U1;
    - UP2 by the signed-out first launch;
    - QN1 by Quick add's income-and-move scan.
  - Every file was restored.
- **My own mutants** (`own-mutants.out`, `own-mutants-root.out`):
  - OWN-2 (a session counts as seen only once its account is read: `seenEpoch = epoch` after the read) is killed by U1 to U3.
  - OWN-3 (`seenEpoch !== null` dropped from the switch branch, so it fires at the first session after a null) is killed by R119's two cases. So R119 is pinned against P38's new flag.
  - OWN-5 (the controller ignores the flag while it is still `undefined`) is killed by L1.
  - OWN-1 and OWN-4 survive every file that renders `AnalyticsUpkeep`: see m1 and n1.
- **Whitespace:** `git diff --check` is clean on `origin/claude/p1a-vault-core...bf79af59` and on `d8d7364a..b76116c0`.
- **Not run:**
  - the whole suites and exports (CI);
  - the database suites (Docker is stopped; CI's SQL and edge jobs passed);
  - native and device checks (SKIPPED: no PostHog project, Q5).

---

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. No test holds the line that keeps a repeated null harmless (`AnalyticsUpkeep.tsx:42`).**

- **What the line does.**
  - Since R120, a null carries the flag whenever `seenEpoch !== null`.
  - `seenEpoch = null` at line 42 makes the next null plain again, and keeps the next session's arrival from counting as a switch.
  - That is the controller's "repeated null" question, and the code answers it correctly.
- **No test holds it.** OWN-1 removes that one line:
  - `appAnalytics.render.test.tsx` and `AnalyticsUpkeep.render.test.tsx` still pass, 13 of 13;
  - `RootLayout.render.test.tsx`, the other file that renders `AnalyticsUpkeep`, still passes, 8 of 8.
- **What it would break.**
  - After A signs out, the next person's signed-out events (their onboarding and sign-in, which R119 keeps for that person's yes) are dropped at the next foreground return.
  - They are dropped again when B's session arrives.
  - This is consent-safe, but it loses the events R119 exists to keep.
- **Probe C2 kills it** (`expected [] to deeply equal [ 'capture:step:coffee', ... ]`):
  - A, named and never asked, saves, then signs out;
  - a step is tracked, the app returns to the foreground, and another step is tracked;
  - B signs in with a yes. B's yes sends both steps, and nothing of A's.
- **Fix:** add one case like C2 to `appAnalytics.render.test.tsx`.
  - Its steps: a session seen and ended, a step tracked while signed out, a foreground return, and B's yes sending the step.
  - It can use the legacy seam, as U1 to U3 do, with `AppState`'s listener captured.
  - It can ride with 1D-T15 or the next round that touches the follower.

### Nit

**n1. A lock lifted at the same epoch depends on another line no test holds (`AnalyticsUpkeep.tsx:43`, older than this round).**

- **What the line does.**
  - `heldEpoch = null` at a null lets the follower read the account again when a lock lifts.
  - `token_refreshed` returns to `active` at the same epoch (`sessionMachine.ts:86-87`).
  - Without the line, `heldEpoch === epoch` returns early, and the controller stays `signed_out` while A is signed in. Nothing is sent, and A's events wait until the next session change.
- **No test holds it.**
  - OWN-4 removes it, and the three files above still pass.
  - The suites drive the session through the legacy seam, where every change moves the epoch, so they cannot show a same-epoch return.
  - My C11, through the real provider, kills it.
- The line predates the round, but P39 leans on locks. Pin it with m1 if convenient.

---

## The controller's focus points

**CM1: neither U1 nor U2 sends the first person's events.**

- The first confirming review's U1 and U2 render probes pass at `bf79af59`, with A's `record_saved` absent (traces above). The round's U1 to U3 pass in the suite.
- **Why the controller-level L1 and L2 probes still fail, and why that is right.**
  - A plain `setAccount(null)` from `undefined` still keeps what is held. R119.1 needs that for a first launch.
  - R120 puts "a session ended" where it can be seen: the follower, which flags a null only after a session.

**P38: a switch with no sign-out between drops what is held (U3).**

- **The path is real.**
  - The provider runs a sign-in beside an active session (`credentialProvider.ts:213-215`; `sessionMachine.ts:36` accepts `bootstrapped` from `active`).
  - The epoch moves with no null between.
- **C4 drives it through the real provider.** At `d8d7364a`, B's yes sent A's save (`identify:bb, capture:record_saved`). At `bf79af59`, nothing of A's leaves.
- **C8 does the same with A's read still in flight at the switch.** A's late answer is ignored by the `call !== latest` guard, and A is never identified.
- **I agree with the planner's extension.**
  - It goes past R120's letter, but L4 ("dropped on ... an account switch") requires it.
  - For a named account it changes nothing: A to `null` already dropped.
- **Consequence.** The same person's fresh sign-in ("Confirm it's you") also moves the epoch, so what an unnamed account held is dropped there too. That is consent-safe, and it matches a named account.

**R119: a signed-out first launch keeps onboarding's first step until the sign-in and a yes; a restored session is unaffected.**

- The suite's two cases pass.
- **C1 drives a first launch through the real provider:**
  - `hydrate_empty`;
  - a step before the install, which goes to the bus's early list, and a step after it;
  - a cancelled sign-in (`authenticating` and back, the binding null throughout);
  - two foreground returns, then a third step;
  - a real sign-in and a yes.
  - All three steps are sent, in order, after `identify:aa`. Every null the follower sends before any session is plain.
- **C7:** a restored session whose read fails offline keeps A's save until a foreground return names A. A's own yes then sends it.
- **C10:** a launch answered while the provider still hydrates is a plain null. A's session, when it arrives, counts as seen.
- **OWN-3** shows R119's cases keep the new switch flag from firing at a first sign-in.

**The flag's reach: does any other caller, or a repeated null, now drop something it should keep?**

- **Callers.**
  - Only `AnalyticsUpkeep` passes the flag (`AnalyticsUpkeep.tsx:44` and `:53`).
  - Every other caller passes an account and no flag: `testing/recordAnalytics.ts:39`, `testing/fakeConsent.ts:87`, `neverSent.test.ts:39` and the render tests.
  - No app code drives the legacy seam while the provider is installed: `SettingsParts.tsx:65` calls `setSession(null)` only without one.
- **A repeated null: no.**
  - The follower flags a null only when it has seen a session since the last null, and it clears that mark at once (`:41-43`). A second null is plain and hits the no-change guard.
  - `zzConfirm2Order` case 1: a flagged null, a step, two plain nulls, then B. The step is sent.
  - Case 2: a second flagged null would drop it, but only the follower sends one, and only after a session.
  - C2 shows the same through the real provider and a foreground return.
  - The pin is missing (m1).
- **What the flag newly drops, beyond U1 to U3.** It drops the held events of an account the app never named, at three moments:
  - a lock, and a server-ended session (P39);
  - the same account's fresh sign-in (P38).
  - That includes onboarding's steps when the first account read after the sign-in also failed.
- **What that costs (C3).**
  - The setup: A's session is restored and unread offline, and A saves. A refused refresh locks the session (`auth_denied`), and a later refresh lifts it. Then A's own yes arrives.
  - At `d8d7364a`, A's save went out under A's own yes. Now it is dropped.
- **Why I accept P39.**
  - A lock needs the server to refuse the refresh; an unreachable service is not a denial (`credentialProvider.ts:346-348`, `:372`).
  - A server-ended session needs the server to end it.
  - Either way the person must sign in again, possibly as someone else. Dropping is the consent-safe reading of L4, and it is what a named account already did (A to `null`).
- **The type allows more than its callers use.**
  - `setAccount(A, { signedOut: true })` would act as a change even for the same account: it drops, resets and loads again (`zzConfirm2Order` case 5).
  - No caller does this, and it errs toward dropping. No action.

**Does any order of sign-in, sign-out, read failure, foreground return and restart still let one person's held event go out under another person's yes?**

None I could build does at `bf79af59`. A's account is unread unless the order says otherwise.

| Order | Probe | `d8d7364a` | `bf79af59` |
| --- | --- | --- | --- |
| A's session restored; the read fails; A saves and signs out; B signs in | review U1, round U1 | leak | none |
| a signed-out launch; A's session; the read fails; A saves and signs out; B | review U2, round U2 | leak | none |
| restored; the read fails; A saves; B signs in beside A | round U3, C4 (real provider) | leak | none |
| restored; the read fails; A saves; the server ends the session; B | C5 | leak | none |
| the read fails at launch and again at a foreground return; A saves; A signs out; B | C6 | leak | none |
| A's read in flight when B signs in beside A | C8 | leak | none |
| A's read in flight when A signs out, answering late; B | C9 | leak | none |
| the follower answers while the provider hydrates; A's session; the read fails; A saves and signs out; B | C10 | leak | none |
| A named and never asked; A saves and signs out; steps while signed out; a foreground return; B | C2 | B gets the steps only | the same |

- **Restart:** the controller's held list and the bus's early list live in memory only (`controller.ts:85`, `bus.ts:32`). Only the stored answer survives, and it is per account.
- **What remains is not reachable by a person: the launch window before the follower's first run.**
  - The window is the install loading PostHog's module, then one render.
  - Events tracked then sit in the bus's early list, or are held with no session attached. A sign-out and another account's sign-in inside that window would carry them.
  - `AnalyticsUpkeep` mounts once (`_layout.tsx:47`; the fonts and `ready` only ever go from false to true). So no later remount can forget a session it has seen.
- **Events tracked after a session ends** are held under `signed_out`.
  - By the plan's rule "a change from no account to an account keeps the held events", they go with the next account's yes (`zzConfirm2Order` case 4).
  - In today's flows those events are the next person's onboarding and sign-in. The rule matters for 1D-T14 (below).

## Notes for later tasks

- **m1 and n1's pins:** C2 and C11 are in `scratch/1d-t7-confirm2/probes/zzConfirm2Provider.render.test.tsx`. C11 needs a same-epoch return, so it needs the real provider, or a provider stand-in in `appAnalytics.render.test.tsx`.
- **1D-T14 (account events):**
  - Its plan already sends `signed_out` "first, before anything else" in `signOut()`. Keep that order, now for a second reason:
    - tracked before the session change, an unnamed account's `signed_out` is held, then dropped with the rest (`zzConfirm2Order` case 3);
    - tracked after it, it is held under `signed_out`, and the next account's yes sends it (case 4).
  - Its stand-in subscriber "calls `analytics.setAccount(null)` on each notification (as `AnalyticsUpkeep` does)". It should pass `{ signedOut: true }` after a session, as `AnalyticsUpkeep` now does, or use `AnalyticsUpkeep` itself.
- **1D-T15:** besides the receipt's two device checks, a lock that lifts (a refused refresh, then a working one) should bring A's answer back.
- **R120.3 / P42 (unchanged):**
  - Recalling the verified account when `/v1/me` cannot be reached stays with 1D-T15 or a follow-up.
  - Until then, an unread account stays unread until the next session change or foreground return (C6 shows the retry at the foreground).

VERDICT: Approved
