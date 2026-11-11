# Confirming review: 1C-T8 fix round (`4aa6cf1`), PR #367

- Reviewer: Opus, confirming review, 9 Nov 2026. Read-only: only `git fetch` ran in the worktree, whose status is clean at `4aa6cf1` (only the ignored `node_modules` and `apps/app/dist`). Every probe and mutant ran in a scratch copy.
- Range: `5e8b70e..4aa6cf1` on `p1/1c-t8-account-drafts`: one commit, 13 files, no merge. After `git fetch` the integration head is `a485df9`, which includes #368 (P2-T9, `860990f`). `git merge-tree --write-tree 4aa6cf1 origin/claude/p1a-vault-core` is clean (tree `f32c63e`). #368 changes only `theme/motion.ts` and `wallet/motion/*`, none of this PR's files.
- Spec: plan 1C `### Task 8` (line 972) and its line 1014 ("Every failure says the records are safe and offers another way, as §5.2 requires"); spec §5.2 (System states: "Every failure says the records are safe and offers another way forward"); K16, K24; the controller's rulings R98 and R99; the fix brief `briefs/1C-T8-fix.md` and its kit `scratch/1c-t8-fix-planner/`; the implementer's logs `scratch/1c-t8-fix/`; `receipts/1C-T8.md`; my first review `reviews/1C-T8.md`.
- Scratch folder `.claude/controller/scratch/1c-t8-confirm/`:
  - `tree/`: `git archive 4aa6cf1`, for the gate only. `base/`: `git archive 5df51d7` (the pre-task integration base). `probe/`: `git archive 4aa6cf1`, for probes and mutants. Each links the worktree's root `node_modules`, `apps/api/node_modules` and `apps/app/node_modules/@better-auth`; each has its own `apps/app/node_modules`, so Vitest's cache stays in scratch.
  - `gate.sh` and `logs/` (gate, probes, mutants); `probes/` (four probe files); `compare_on.cjs`; `confirm_mutants.py` (my six extra mutants); `planner-mutants/`, `confirm-mutant-logs/`, `confirm-mutant-logs-ready/`.
- The commit's 13 files equal the planner's final copies (`PL/SHA256SUMS.final`: 13 OK), and the kit's own 51 checksums hold.

**VERDICT: Approved.** No blocker, no major.

- R98 holds on every build, not only on today's. A 24-state probe covers every account method on every build, signed out or unavailable. In all 24:
  - ใช้วิธีอื่น shows;
  - exactly one way opens an empty address field;
  - another account reaches keep-or-erase;
  - after the server refuses the account, the records-safe line and a free email way remain.
- R99 holds. With the area off, the 72 cases are byte-identical to the base. With the area on and a session, every step after the first and every router call match the base, so no navigation happens before `/spend/add`. No cast and no `Href` import remain.
- m1: all 15 mutants are killed again, every file restored byte for byte. RV1 to RV7 are my first round's exact replacements.
- m3 and the receipt are right. The gate reproduces the receipt exactly, and CI is green on `4aa6cf1`.
- One minor: R98's "whenever" is pinned only on email-only builds (mutant X1 survives); a ready one-case test kills it. Three nits.

---

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. R98's "whenever" is pinned only on email-only builds: mutant X1 survives the PR's tests.**

- Where: `SessionEndedScreen.tsx:99`: `...(main === 'email' ? [{ key: 'email-other', ... }] : [])`.
- Mutant X1 (`confirm_mutants.py`) narrows it to `main === 'email' && offered.length === 1`, so the way is offered only on an email-only build.
  - The PR's `SessionEndedScreen.render.test.tsx`: 7 of 7 pass, so X1 survives (`logs/confirm-mutants.out`).
  - My matrix probe: 10 of 25 fail. These are exactly the 10 states whose main button is the email code on a build that also runs Apple or Google:
    - an email account on three builds, in both kinds;
    - an Apple account on Google and email;
    - a Google account on Apple and email.
- Ready case `probes/ConfirmR98EveryBuild.render.test.tsx`: "an email account on a build with Apple and Google still gets an email code to another address".
  - It passes at `4aa6cf1` (`logs/probe-r98-every-build-head.log`).
  - It kills X1: "Unable to find an accessible element with the role "button" and name "Email a code to another address"" (`logs/confirm-mutants-ready.out`).
- Why it matters:
  - Today every build is email-only, and that case is pinned.
  - Once 1C-T7 lands native sign-in (Apple on iOS, Google on Android after Q1), an email account on such a build, or an Apple account on Android, again has the email code to its own address as the main button.
  - X1 would quietly bring M1 back there. The only other ways would be Apple or Google with `signUp: false`, which reach only an account already linked to them. For an unavailable account that is a dead end once more.
  - P6B-T7 and P6B-T8 move these rules into hooks and rely on these render tests running unchanged.
- Why minor:
  - R98 asked for exactly the two email-only cases, and both are there.
  - The code is right on every build: see the matrix under Focus 1.
- Fix: add the ready case to `SessionEndedScreen.render.test.tsx`, here or in 1C-T9.

### Nits

**n1. The condition is `main === 'email'`, not R98's "the email code to the account's own address".**

- When the ended account's record cannot be read (`endedEmail` null, `SessionEndedScreen.tsx:84-87`), the main email button already opens an empty field. "Email a code to another address" then repeats it.
- The probe's edge case records `['Continue with email', 'Email a code to another address']`, both free.
- This cannot happen today:
  - the real `account()` returns the stored record whenever the session is `locked` or `reauth_required` (`credentialProvider.ts:427-430`);
  - `sessionEndedView` only exists when that record is the ended account (`sessionEnded.ts:23-26`).
- `main === 'email' && endedEmail !== null` would match the ruling's words.

**n2. The new section's title carries a ruling id.**

- "Sign-in drafts: session ended, an email account, another way (R98)" (`signinSections.tsx:232`). It is the only one of the catalogue's 270 titles that does.
- Development only; with `chrome=off` the screenshots do not show it.

**n3. The receipt's first-round section keeps two lines the fix round supersedes.**

- "22 catalogue sections draw every state" (line 4).
- The 1C-T9 note "then delete the `as unknown as Href` cast" (line 41). There is no cast now.
- The fix-round section corrects both: "23 sections now" (line 49), and "this replaces the first round's note about the cast" (line 60). 1C-T9 should follow line 60.

---

## Focus items

### 1. R98

**The code** (`SessionEndedScreen.tsx`):

- `main` (`:93`): the account's own method when the build offers it, otherwise the email code.
- `others` (`:97-100`): the build's other methods, plus `email-other` whenever `main` is `email`.
- Each way has the test id `session-ended-way-<key>` (`:227`). ใช้วิธีอื่น (`session-ended-other-ways`) is drawn whenever `others` is not empty (`:236`).
- `start(method, ownAddress)` (`:120-125`): the main button codes the account's own address (`fixedEmail: endedEmail`); every way behind ใช้วิธีอื่น opens an empty field.
- `settle` (`:102-118`): an `account_unavailable` answer, from a native sheet or from the code step (`EmailCodeScreen.tsx:158-161` hands it to `onDone`), returns to the ended phase. It shows "This account can't be used right now." with `FailureNote`'s "Your records are still on this phone." (`SigninParts.tsx:51-60`), and ใช้วิธีอื่น is still there.
- The real port always offers email last (`betterAuthPort.ts:85-89`). So `main` is never null, and ใช้วิธีอื่น always holds an email code to any address:
  - "Continue with email" beside Apple's or Google's main button;
  - "Email a code to another address" beside the email main button.

**The tests:** the three new cases and the new check read correctly.

- The email main button codes `kanya@gmail.com` with no address field.
- An email account on an email-only build reaches an empty field, codes `ploy@gmail.com`, signs in as another account, and gets "Records from your other account" without resuming.
- An Apple account on an email-only build, unavailable:
  - the main button codes `karn@icloud.com`;
  - the refusal shows both lines;
  - ใช้วิธีอื่น then "Email a code to another address" opens an empty field, with one sign-in in total.
- Beside Apple's main button there is no second email way.

**The matrix probe** `probes/ConfirmSessionEndedMatrix.render.test.tsx` covers 3 account methods, 4 builds (`email`, `apple+email`, `google+email`, all three) and 2 kinds: 24 states plus an edge case. All 25 pass (`logs/probe-matrix.log`, table in `logs/probe-matrix-table.txt`). Across the 24 states:

| Check | States |
| --- | --- |
| ใช้วิธีอื่น at entry | 24 |
| Main button native, `{ method, signUp: false }` | 8 |
| Main button the email code to the account's own address (fixed, masked; `sendEmailCode` got that address) | 16 |
| "Email a code to another address" shown | 16, never beside a native main button |
| Exactly one way opens an empty address field | 24 |
| Another account (typed address, then the code) reaches keep-or-erase, `onResumed` not called | 24 |
| Server refuses the account: one sign-in, the unavailable line, the records-safe line, ใช้วิธีอื่น, and a free email way behind it | 24 |

So:

- On an email-only build, an email account and an Apple account (and a Google account) each get another way.
- Keep-or-erase for another account is reachable from every state.
- With the account unavailable, the screen never leaves a person without a way: neither at entry (12 states) nor after a refusal (24 states).

**The catalogue section** `signin-session-ended-email` draws an email account on an email-only build, with ใช้วิธีอื่น open (`logs/probe-catalogue-section.json`, after its script, no stop):

- Thai: "ใช้อีเมลเดิม รายการจึงจะส่งเข้าที่เดิม", with the buttons ดำเนินการต่อด้วยอีเมล and ส่งรหัสไปที่อีเมลอื่น.
- English: "Continue with email" and "Email a code to another address".
- Its two cases pass, every section and the screen-reader check (`logs/catalogue-new-section.log`).
- The 22 earlier sections are unchanged: `ended()` still defaults to the Apple account with method `apple`.

**My extra mutants** (`logs/confirm-mutants.out`; each restored and checksummed):

| Mutant | Change | PR's tests | Matrix |
| --- | --- | --- | --- |
| X1 | the way only on an email-only build | SURVIVED (7 of 7) | KILLED (10 of 25) |
| X2 | the way only for an email account | KILLED (the Apple case) | KILLED |
| X3 | no ใช้วิธีอื่น for an unavailable account | KILLED (the Apple case) | KILLED |
| X4 | the other-address way codes the account's own address | KILLED (both R98 cases) | KILLED |
| X5 | a refused account says nothing | KILLED (the Apple case) | KILLED |

### 2. R99

**The code:**

- `endStory` (`OnboardingScreen.tsx:112-115`): `if (isAuthed) setStep('reminder'); else router.replace(afterStory(false));`.
- No cast and no `Href` import: a grep of `src` and `app` finds no `as Href` or `as unknown as Href`, and `OnboardingScreen.tsx` has no `Href`.
- `afterStory(false)` has its own overload typed `'/login?from=onboarding'` (`onboardingModel.ts:92`), so `typecheck:routes` passes with no cast.
- `SKIP_TO` and `stepAfter('first-coffee')` are both `'reminder'` (`onboardingModel.ts:30`, `:33-36`). So `setStep('reminder')` is exactly today's end of the story.
- Nothing navigates to `/onboarding/reminder`:
  - both callers of `afterStory` pass `false` (`OnboardingScreen.tsx:114`, `WelcomeSignInLink.tsx:14`);
  - `SignInScreen.tsx:91` calls `afterSignInAttempt(attempt)` with no `from`.

**Area off:** my first round's 72-case probe (`probes/WelcomeRouteProbe.render.test.tsx`) ran in `base/` (`5df51d7`) and at `4aa6cf1`.

- It covers nine off values, signed in or not, English and Thai, Next and Skip.
- `cmp` says identical, 2,060,182 bytes each, the same as the first round's comparison (`logs/probe-welcome-base.json`, `logs/probe-welcome-fix.json`).

**Area on** (`signin` and `all`, 16 cases, the same probe; `logs/probe-welcome-on-compare.txt`):

- With a session, only the first step differs from the base: the welcome link.
- The second and third steps, the reminder step after Skip or "Let's start!", the end, and every router call are byte-identical to the base. Nothing navigates until Not now's `/spend/add`.
- Without a session, the story ends at `/login?from=onboarding` (K16).

**The tests:**

- The new case reads correctly. `beforeEach` resets the router mocks, and `afterEach` clears the session.
- The old end-at-sign-in case keeps every assertion except the removed session part.
- Q1 and Q2 are killed, and so is my Y1 (a session's story end shows the wrong step).

### 3. m1: the 15 mutants

- The planner's `mutants.py` ran on `probe/apps/app`: 15 KILLED, each `restored=True`, exit 0 (`logs/planner-mutants.out`).
  - A kill counts only when the run fails and every named case is among the failures.
  - Each log fails on an assertion or a missing element. None shows a timeout, a syntax error or a missing module.
- The kills and their causes:
  - RV1: `expected [ 'fresh', 'fresh' ] to deeply equal [ 'fresh' ]`.
  - RV2: `pending` called 3 times, not 1.
  - RV3: `pending` called once, not twice.
  - RV4: `sendEmailCode` called 2 times, not 1.
  - RV5: an address field shows. It kills the RV5 case and the Apple R98 case.
  - RV6: a Link button shows.
  - RV7: `Missing expected rejection`.
  - N1 and N3: both R98 cases. N2: the Apple main-button case.
  - K1: "Script stopped at step 1 of 2: call onPress on {"testID":"session-ended-other-ways"}".
  - Q1 and Q2: no reminder heading.
  - C1 and C2: `lines with no Thai draft`.
- RV1 to RV7 use the same replacements as my first round's `review_mutants.py` (an AST comparison of both runners). So the seven guards I raised are the ones now pinned.
- Restoration, byte for byte: I took SHA-256 of all 593 files under `probe/apps/app/{src,app,scripts}` before the 15 and my six. Afterwards, 0 differ. The commit's 13 files still equal `PL/SHA256SUMS.final`.
- The RV7 case checks six malformed entries one by one (kind, version, required, published_at, text null, text without `en`). So each field check of `isPolicyVersion` is pinned, not only the array check.

### 4. m3 and the receipt

- **m3:**
  - `draftCopy.ts:60` "Records waiting to send" is marked `// DRAFT`. "Our promises" has left `DRAFT_TH` (`:124` says why), and the new line is `// DRAFT` (`:68`).
  - `TermsScreen.tsx:118` draws `tc('Our promises')`. That is `en.json:844` `redesignOurPromises`, with `th.json:844` "คำสัญญาของเรา", the same Thai the draft had. `vi.json` has no entry, so Vietnamese shows the English under either hook, as `PrivacyScreen` does.
  - C1 and C2 are killed.
- **The counts:**
  - `DRAFT_TH` has 99 entries: 71 marked DRAFT and 28 unmarked.
  - My first round's `board_lines.py` finds all 28 on the boards: 26 exact nodes, the session-ended count as `{count}`, and sa-terms's sentence joined across its two links (`logs/board-lines.txt`).
  - No draft's English is approved `en.json` copy any more: 0 of 99. The first round had one, "Our promises".
- **The E2 owner list** (`receipts/1C-T8.md`):
  - P5 (line 35);
  - m2 (line 38): the unavailable variant's untrue lines and refused main action, and that ใช้วิธีอื่น now always reaches another account;
  - m4 (line 39): K24's terms box, in the plan's words.
  - All three are accurate.
- **The rest of the receipt:**
  - The E2 list names `signin-session-ended-email` (23 sections).
  - The fix-round section's counts match the implementer's logs:
    - RED: `2 failed | 6 passed (8)` and `3 failed | 66 passed (69)`, the three named cases, 3 `TestingLibraryElementError`, 0 missing module; unit 37 of 37.
    - GREEN: 69, 37, and catalogue `50 passed | 512 skipped (562)`.
  - The counts also match my rerun below. The 1C-T9 notes (lines 60 and 61) are right.
- **The commit message** equals `PL/commit-msg.txt`, Haiku trailer included.

### 5. The gate at `4aa6cf1`

| Command | Receipt | Mine (`tree/`) |
| --- | --- | --- |
| `typecheck:app` | exit 0 | exit 0 |
| `typecheck:routes` | exit 0 | exit 0 (no cast) |
| `test:app` | 34 | 34 passed |
| `test:unit` | 912 | 912 passed (911 + RV7's case) |
| Focused render (the `signin` folder and OnboardingScreen) | 69 | 8 files, 69 passed |
| Focused unit (four files) | 37 | 37 passed |
| Catalogue (`signin`) | 50 passed, 512 skipped | 50 passed, 512 skipped (562) |
| `test:render` (full, once) | 102 files, 1812 | 102 files, 1812 passed (335 s, no timeout, no rerun; load 11 to 43) |
| `export:web` | exit 0, 4788 modules | exit 0, `Exported: dist`, 4788 modules (the bundle carries "Email a code to another address") |
| `git diff --check` | clean | `5e8b70e..4aa6cf1` clean; `origin/claude/p1a-vault-core...4aa6cf1` clean |

- **Not run:** the edge, API and database suites. No such code changed, and Docker stayed stopped.
- **CI on PR #367:** run `42629425617` (`pull_request`, head `4aa6cf1`) tested the merge with a base that includes #368. All three jobs passed:
  - "Typecheck, unit, render, build, export": 9m53s;
  - "SQL integration and ops (local PostgreSQL 17 container)": 4m58s;
  - "Release image and smoke (never pushed)": 1m3s.
- The PR is MERGEABLE, with merge state CLEAN.

---

## Notes for later tasks

- **1C-T9:**
  - Add m1's ready case (`probes/ConfirmR98EveryBuild.render.test.tsx`) to `SessionEndedScreen.render.test.tsx` if it is not added here.
  - Follow the receipt's line-60 note, not line 41 (n3).
  - `main === 'email' && endedEmail !== null` is an optional tidy (n1).
- **1C-T7:** when Apple or Google sign-in becomes live, the 16 multi-method states become real. `probes/ConfirmSessionEndedMatrix.render.test.tsx` (24 states) is a ready regression net.
- **P6B-T7 and P6B-T8:** when the session-ended rules move into a hook, keep the other-address way beside the email main button on every build (m1's case).
- **The owner at E2:**
  - `signin-session-ended-email` shows the new DRAFT line ส่งรหัสไปที่อีเมลอื่น.
  - The m2 question (the unavailable variant's lines and main action) now concerns a screen that always has another way.

VERDICT: Approved
