# Brief 1C-T8 fix round: the session-ended screen reaches another account (R98), nothing goes to `/onboarding/reminder` before 1C-T9 (R99), and the review's pins

You are the implementer (Haiku) for the 1C-T8 fix round. PR #367 (branch `p1/1c-t8-account-drafts`, head `5e8b70e`) adds the 1C account drafts. Its review (`/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1C-T8.md`) found:

- **One major (M1).** The session-ended screen never offers a way to another account when its main button is the email code to the account's own address. Today's build offers only the email code, so every account sees one button, and for an unavailable account (being deleted, deleted or disabled) that button can never succeed: a dead end, against the plan's "Every failure ... offers another way" (Task 8, line 1014).
- **Four minors.**
  - m1: seven guards no test pins (the review's mutants RV1 to RV7).
  - m2: the account-unavailable variant's lines that are false for a deleted account, and its lead with a sign-in the server refuses (an owner question).
  - m3: two copy-rule slips in `draftCopy.ts` and `TermsScreen.tsx`.
  - m4: K24's owner question (today's sign-in terms box) is missing from the E2 hand-off.

The controller's rulings (9 November 2026), quoted:

> **R98 (M1, amends planner call P6).** On the session-ended screen, whenever the main button is the email code to the account's own address, "Use another way" also offers "Email a code to another address". This keeps the plan's "every failure offers another way" (line 1014) on email-only builds, and reaches the keep-or-erase path for another account. Add:
> - a test for an email account and for an Apple account on an email-only build;
> - a catalogue section for an email account, so the E2 screenshots show it.
>
> **R99 (P4).** Nothing navigates to `/onboarding/reminder` before 1C-T9 adds that route. OnboardingScreen keeps today's in-place reminder step until then, so there is no cast and no unmatched route with the `signin` or `all` area on. Note it for 1C-T9, which adds the route, the `from=onboarding` handling and the switch in one change.
>
> **Also in this round:**
> - **m1:** tests for the seven unpinned guards (RV1 to RV7). Each must kill its mutant.
> - **m3:** mark `draftCopy.ts:60`'s "Records waiting to send" as `// DRAFT`, and keep TermsScreen's "Our promises" on `tc`, the approved copy.
> - **The receipt's E2 hand-off (for the owner)** gains m2 and m4. P5 is already there.
>
> The nits are not in this round; the controller records them.

The reviewer, as fix planner, wrote every file below and proved it in a scratch copy of `5e8b70e`:

- **RED:** 3 new cases fail on `5e8b70e`'s code (the two R98 cases and the R99 case).
- **GREEN:** with the fix, every focused case passes.
- **Mutants:** 15 of 15 killed, each on the cases it names.
- **Gate:** test:app {{APP}}, test:unit {{UNIT}}, render {{RENDER_FILES}} files and {{RENDER_TESTS}} tests, web {{WEB}} modules.

Do exactly what this brief says.

Read first:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Under **R87**, your receipt is the existing `docs/implementation/receipts/1C-T8.md`, which Step 7 replaces with the planner's final copy; do not edit `premium-progress.md`.
2. The review: "Major" (M1) and "Minor" (m1 to m4).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t8` (branch `p1/1c-t8-account-drafts`, head `5e8b70e`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t8-fix`, your scratch folder. Create it with `mkdir -p`. Logs and your commit message go only there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t8-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the verified final copy of the 13 files this round changes, at their paths from the repository root (`files.txt`; `files-code.txt` lists the 5 code files, `files-tests.txt` the 7 test files);
  - `orig/`: the same 13 files as they are at `5e8b70e`;
  - `diffs/`: one diff per file, `orig` to `real`, named `<path with / as _>.diff`, with `a/` and `b/` prefixes; Appendices A to C quote them;
  - `SHA256SUMS.orig`, `SHA256SUMS.red`, `SHA256SUMS.green` and `SHA256SUMS.final`: the 13 files' checksums at each step, with paths relative to WT, for `shasum -a 256 -c` run from WT;
  - `mutants.py`: the mutant runner;
  - `commit-msg.txt`: your commit message;
  - `brief-template.md`, `assemble_brief.py` and `gate.sh`: how this brief and the planner's gate run were made (reference only);
  - `SHA256SUMS`: the checksums of all of the above ({{PL_SUMS}} lines, paths relative to PL);
  - the planner's proof, `proof/` (logs and `mutants.out`), with its checksums in `SHA256SUMS.logs`. It is reference only; never check `SHA256SUMS.logs`. `tree/` and `red/` are the planner's scratch copies, also reference only.

  If PL is missing, or a line of `PL/SHA256SUMS` does not match, stop: BLOCKED.
- **The shell is zsh.** Keep an exit code in `rc` (`<command>; rc=$?; echo rc=$rc`), never in `status`: zsh's `status` is read-only.
- Every shell call starts in a fresh directory, so type full paths. Git: `/usr/bin/git -C <WT> <command>`, one git command per call. Below, WT, S and PL stand for the full paths above: type them out.
- No database or workers suite runs in this round, so there is no lock to take. Docker is stopped and stays stopped.
- **FOCUSED render** (from `WT/apps/app`): `npx vitest run --config vitest.render.config.ts src/screens/redesign/signin src/screens/redesign/account/OnboardingScreen.render.test.tsx`
- **FOCUSED unit** (from `WT/apps/app`): `node scripts/test-unit.mjs src/i18n/catalogs.test.ts src/config/featureFlags.test.ts src/spend/v1/redesign/account/onboardingModel.test.ts src/spend/v1/policies.test.ts`
- **CATALOGUE** (from `WT/apps/app`): `npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "signin"`
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The one exception: a render case that times out under load in a file this round does not touch is a known flake (protocol). Rerun that file alone once; if it passes alone, record both runs and go on.

## Scope

| File (under `apps/app/src/` unless named) | Change |
| --- | --- |
| `screens/redesign/signin/SessionEndedScreen.tsx` | R98: ใช้วิธีอื่น's ways become `{ key, method, label }` entries. When the main button is the email code (`main === 'email'`), one more way, "Email a code to another address", opens the code step with an empty address field. The ways get test ids `session-ended-way-<key>`, and ใช้วิธีอื่น gets `session-ended-other-ways`. Its header comment says so. |
| `screens/redesign/signin/draftCopy.ts` | The new DRAFT line `'Email a code to another address': 'ส่งรหัสไปที่อีเมลอื่น'`; `// DRAFT` on "Records waiting to send"; "Our promises" leaves `DRAFT_TH` (m3). Still 99 lines. |
| `screens/redesign/signin/TermsScreen.tsx` | `tc('Our promises')` (approved copy, `redesignOurPromises`) instead of `sc(...)`; its header comment says so. |
| `screens/redesign/account/OnboardingScreen.tsx` | R99: with the `signin` area on and a session, the story's end (Skip, "Let's start!") sets today's in-place reminder step instead of going to `/onboarding/reminder`. The cast and the `Href` type import go. Without a session nothing changes: `/login?from=onboarding`. |
| `dev/catalogue/account/signinSections.tsx` | The fake provider takes `methods`; `ended` and `sessionEnded` take an account; the new section `signin-session-ended-email` after `signin-session-ended-erase` (23 sections). |
| `screens/redesign/signin/SessionEndedScreen.render.test.tsx` | Its `provider` and `open` helpers take an account, an answer and a view (defaults keep every old case as it was); one new check in the first case (no second email way beside Apple's main button); 3 new cases (RV5 and R98's two). |
| `screens/redesign/signin/useFreshSignIn.render.test.tsx`, `TermsGate.render.test.tsx`, `EmailCodeScreen.render.test.tsx`, `DevicesScreen.render.test.tsx` | One new case each, at the end (RV1; RV2 and RV3; RV4; RV6). |
| `screens/redesign/account/OnboardingScreen.render.test.tsx` | `the story ends at sign-in with from=onboarding` loses its last part (a session going to `/onboarding/reminder`); a new case after it pins R99. |
| `spend/v1/policies.test.ts` | One new Node case at the end (RV7). |
| `docs/implementation/receipts/1C-T8.md` (repository root) | The E2 list names the new section, the owner list gains m2 and m4, and a fix-round section is appended (Step 7, Appendix C). |

Nothing else: no other file, no `en.json` or `th.json` key, no route, no package, no lockfile, no merge.

## The new and changed cases

All of them are already written in `PL/real`; Appendix B quotes their diffs.

| File | Case | Pins |
| --- | --- | --- |
| SessionEndedScreen | `it lists the unsent records and names the account's method` (one new check) | R98's condition: with Apple's main button, ใช้วิธีอื่น has no second email way (mutant N2) |
| SessionEndedScreen | `the email button sends the code to the account's own address` | RV5: the email main button codes the account's own address, with no address field |
| SessionEndedScreen | `an email account on a build with only the email code can sign in to another account, which asks keep or erase` | R98 for an email account on an email-only build: Use another way, then "Email a code to another address", an empty field, a code to `ploy@gmail.com`, a sign-in into another account, and D37's keep-or-erase choice |
| SessionEndedScreen | `an Apple account on a build with only the email code: its own address first, and when the account is unavailable another way still shows` | R98 for an Apple account on an email-only build: the main button codes `karn@icloud.com`; the server answers `account_unavailable`; the screen says so with the records-safe line, and Use another way still offers "Email a code to another address" |
| useFreshSignIn | `a later fresh sign-in never reuses an earlier answer: a new sheet and a new sign-in` | RV1 |
| TermsGate | `a policy_required answer during a read waits for it, then one more read shows the terms` | RV2 and RV3 |
| EmailCodeScreen | `a double tap on Send the code sends one code` | RV4 |
| DevicesScreen | `linking is offered only for a method this build runs` | RV6 |
| OnboardingScreen | `with a session, today's reminder step still follows the story until 1C-T9 adds its route` | R99: Skip, and Next, Next, "Let's start!", each show the reminder step with no navigation; Not now then goes to `/spend/add` |
| policies (Node) | `a malformed published list is invalid_response` | RV7 |

The two R98 cases and the R99 case fail on `5e8b70e`; they are this round's RED. The others pass there, because the code they pin is right; their RED is the mutation check (Step 5).

---

## Step 0: Check the folders

1. `cd PL && shasum -a 256 -c SHA256SUMS; rc=$?; echo rc=$rc`. Expected: {{PL_SUMS}} lines, every one `OK`, and `rc=0`. Anything else: BLOCKED.
2. `mkdir -p S`.
3. `/usr/bin/git -C WT status --short`. Expected: no output.
4. `/usr/bin/git -C WT rev-parse --short HEAD`. Expected: `5e8b70e`.
5. `test -d WT/node_modules || (cd WT && npm ci --ignore-scripts --no-audit --no-fund)`. It must not change a lockfile.
6. `cd WT && shasum -a 256 -c PL/SHA256SUMS.orig; rc=$?; echo rc=$rc`. Expected: 13 lines `OK`, `rc=0`. Any `FAILED`: BLOCKED.

## Step 1: The base (no merge)

This round stays on `5e8b70e` and does not merge the integration head; CI tests the merge.

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`.
2. `/usr/bin/git -C WT merge-tree --write-tree HEAD origin/claude/p1a-vault-core; rc=$?; echo rc=$rc`. Expected: one tree id and `rc=0` (a clean merge). At planning the head was `f9d32b4` and the tree `b95d173`; a newer head gives another id, which is fine. `rc=1` (a conflict): BLOCKED, with the output.
3. Do not run `git merge`.

## Step 2: The new tests (RED)

1. Copy the 7 test files: `while read -r f; do cp "PL/real/$f" "WT/$f"; done < PL/files-tests.txt` (type the full paths of PL and WT).
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.red; rc=$?; echo rc=$rc`. Expected: 13 lines `OK`, `rc=0`.
3. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; rc=$?; echo rc=$rc`. Expected: `rc=0`.
4. FOCUSED render into `S/red-render.log` (`... > S/red-render.log 2>&1; rc=$?; echo rc=$rc`). Expected:
   - `rc=1`, `Test Files  2 failed | 6 passed (8)` and `Tests  3 failed | 66 passed (69)`;
   - `grep -E "^ *×" S/red-render.log` prints exactly these three:
     - `an email account on a build with only the email code can sign in to another account, which asks keep or erase`;
     - `an Apple account on a build with only the email code: its own address first, and when the account is unavailable another way still shows`;
     - `with a session, today's reminder step still follows the story until 1C-T9 adds its route`;
   - `grep -c "^TestingLibraryElementError" S/red-render.log` prints `3`: twice `... role "button" and name "Use another way"`, once `... role "heading" and name "Daily reminder"`;
   - `grep -cE "Cannot find module|Failed to resolve" S/red-render.log` prints `0`.
5. FOCUSED unit into `S/red-unit.log`. Expected: `rc=0`, `tests 37`, `pass 37`, `fail 0`. RV7's new case passes here; its RED is mutant RV7.

## Step 3: The fix (GREEN)

1. Copy the 5 code files: `while read -r f; do cp "PL/real/$f" "WT/$f"; done < PL/files-code.txt` (full paths).
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.green; rc=$?; echo rc=$rc`. Expected: 13 lines `OK`, `rc=0` (12 final files, and the receipt still as at `5e8b70e`).
3. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; rc=$?; echo rc=$rc`, then `cd WT && npm run typecheck:routes -w gogospend-app > S/green-typecheck-routes.log 2>&1; rc=$?; echo rc=$rc`. Expected: `rc=0` both times. `typecheck:routes` now passes with no cast at all.
4. FOCUSED render into `S/green-render.log`. Expected: `rc=0`, `Test Files  8 passed (8)`, `Tests  69 passed (69)`: EmailCodeScreen 6, AccountExistsScreen 3, SessionEndedScreen 7, DevicesScreen 7, ReminderQuestionScreen 2, TermsGate 9, useFreshSignIn 5, OnboardingScreen 30.
5. FOCUSED unit into `S/green-unit.log`. Expected: `rc=0`, `tests 37`, `pass 37`, `fail 0`.
6. CATALOGUE into `S/catalogue.log`. Expected: `rc=0`, `Test Files  2 passed (2)`, `Tests  50 passed | 512 skipped (562)`: the 22 earlier sections and `signin-session-ended-email` in both suites, and 1C-T6's two `settings-everywhere-signin-unreachable` cases the filter also matches.

## Step 4: Before the mutants

`cd WT/apps/app && shasum -a 256 src/screens/redesign/signin/SessionEndedScreen.tsx src/screens/redesign/signin/useFreshSignIn.tsx src/screens/redesign/signin/TermsGate.tsx src/screens/redesign/signin/TermsScreen.tsx src/screens/redesign/signin/EmailCodeScreen.tsx src/screens/redesign/signin/DevicesScreen.tsx src/screens/redesign/signin/draftCopy.ts src/spend/v1/policies.ts src/screens/redesign/account/OnboardingScreen.tsx > S/before-mutants.txt` (full paths for WT and S).

## Step 5: Mutation check

`python3 -I PL/mutants.py WT/apps/app S > S/mutants.out 2> S/mutants.err; rc=$?; echo rc=$rc` (full paths). The runner:

- applies each mutant (exact edits, each matching once);
- runs its focused tests;
- restores the file byte for byte and checks its SHA-256;
- prints `KILLED` only when the run fails **and** every case the mutant names is among the failures, else `SURVIVED`;
- writes each run's output to `S/mutant-logs/<id>.log`;
- exits 1 on any `SURVIVED`, `NOT APPLIED` or restore that differs.

It took the planner under a minute; allow a few minutes under load. Expected: `rc=0`, and 15 lines in `S/mutants.out`, each `KILLED: ... restored=True`. Then:

- `cd WT/apps/app && shasum -a 256 -c S/before-mutants.txt`: 9 lines `OK`;
- `/usr/bin/git -C WT status --short`: exactly the 12 code and test files modified, nothing else.

| Mutant | File | Change | Must fail (the planner's run) |
| --- | --- | --- | --- |
| RV1 | `useFreshSignIn.tsx` | `done` keeps the waiting promise, so a later `freshSignIn()` gets the earlier answer | `a later fresh sign-in never reuses an earlier answer: ...` (1 failed: `expected [ 'fresh', 'fresh' ] to deeply equal [ 'fresh' ]`) |
| RV2 | `TermsGate.tsx` | no one-read-at-a-time guard | `a policy_required answer during a read waits for it, ...` (1 failed: `pending` called 3 times, not 1) |
| RV3 | `TermsGate.tsx` | a `policy_required` answer during a read is dropped | the same case (1 failed: `pending` called once, not twice) |
| RV4 | `EmailCodeScreen.tsx` | `send` without its busy guard | `a double tap on Send the code sends one code` (1 failed: 2 calls, not 1) |
| RV5 | `SessionEndedScreen.tsx` | the email main button asks for a typed address | `the email button sends the code to the account's own address` (2 failed with the Apple account's R98 case: an address field shows) |
| RV6 | `DevicesScreen.tsx` | Link offered for a method this build cannot run | `linking is offered only for a method this build runs` (1 failed: a Link button shows) |
| RV7 | `policies.ts` | `published()` accepts any array | `a malformed published list is invalid_response` (1 failed: `Missing expected rejection`) |
| N1 | `SessionEndedScreen.tsx` | "Email a code to another address" never offered | both R98 cases (2 failed: no "Use another way") |
| N2 | `SessionEndedScreen.tsx` | it is offered beside any main button | `it lists the unsent records and names the account's method` (1 failed: it shows beside Apple's) |
| N3 | `SessionEndedScreen.tsx` | every email code goes to the account's own address | both R98 cases (2 failed: no address field) |
| K1 | `SessionEndedScreen.tsx` | ใช้วิธีอื่น without `testID="session-ended-other-ways"` | `section signin-session-ended-email renders without errors in light and dark, in en, th and vi` (1 failed: its script never reaches its last wait) |
| Q1 | `OnboardingScreen.tsx` | a session's story end goes to `/onboarding/reminder` | `with a session, today's reminder step still follows the story ...` (1 failed: no reminder step) |
| Q2 | `OnboardingScreen.tsx` | a session's story end goes to sign-in | the same case (1 failed: no reminder step) |
| C1 | `TermsScreen.tsx` | the title back on `sc('Our promises')` | `every literal the signin folder passes to its copy hook has a Thai draft` (1 failed: `lines with no Thai draft`) |
| C2 | `draftCopy.ts` | the new line loses its Thai draft | the same catalogs case (1 failed: `lines with no Thai draft`) |

Any `SURVIVED` or `NOT APPLIED`: BLOCKED, with its log. The `// DRAFT` mark on "Records waiting to send" is a comment, so it has no mutant.

## Step 6: The gate

From `WT`, in order, saving each output under `S/` and keeping each exit code in `rc`:

1. `npm run typecheck:app`. Expected: `rc=0`.
2. `npm run typecheck:routes -w gogospend-app`. Expected: `rc=0`.
3. `npm run test:app`. Expected: `rc=0`, `tests 34`, `pass 34`, `fail 0` (`5e8b70e`'s 34; this round adds no `src/api` test).
4. `npm run test:unit`. Expected: `rc=0`, `tests {{UNIT}}`, `pass {{UNIT}}`, `fail 0` (911 + 1: RV7's case).
5. FOCUSED render and CATALOGUE again: the same counts as Steps 3.4 and 3.6.
6. `npm run test:render -w gogospend-app > S/render-full.log 2>&1`. Expected: `rc=0`, `Test Files  {{RENDER_FILES}} passed ({{RENDER_FILES}})`, `Tests  {{RENDER_TESTS}} passed ({{RENDER_TESTS}})`. The arithmetic: `5e8b70e` has 102 files and 1802 tests; this round adds no file, 8 cases to existing files, and the new section's every-section and screen-reader cases (1802 + 8 + 2). A case that times out near 4 to 5 s in a file this round does not touch, and passes alone on a rerun, is a known flake: record both runs.
7. `npm run export:web -w gogospend-app -- --max-workers 2 > S/export-web.log 2>&1`. Expected: `rc=0`, `Exported: dist` and `({{WEB}} modules)`, `5e8b70e`'s count: no module is added or removed. `apps/app/dist` is gitignored.
8. `/usr/bin/git -C WT diff --check` and, after Step 8.1's `add`, `/usr/bin/git -C WT diff --cached --check`; after the commit, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`. Expected: no output each time.

Not run: the edge, API and database suites (no such code changed). Record them SKIPPED with that reason.

## Step 7: Receipt

1. `cp PL/real/docs/implementation/receipts/1C-T8.md WT/docs/implementation/receipts/1C-T8.md` (full paths). The planner's copy is `5e8b70e`'s receipt with three edits (Appendix C): the E2 screenshot list names `signin-session-ended-email`; the owner list gains m2 and m4; a fix-round section is appended. Its counts are this brief's Expected lines; you only got here if your results matched them.
2. `cd WT && shasum -a 256 -c PL/SHA256SUMS.final; rc=$?; echo rc=$rc`. Expected: 13 lines `OK`, `rc=0`.
3. Do not touch `premium-progress.md`.

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src docs/implementation/receipts/1C-T8.md`.
2. `/usr/bin/git -C WT status --short`. Expected: exactly the 13 paths of `PL/files.txt`, staged (`M `), and nothing else: no `dist/`, no `.expo/`. Anything else: stop and report.
3. `cp PL/commit-msg.txt S/commit-msg.txt` (full paths). Its text is in Appendix D; its last line is the Haiku trailer.
4. `/usr/bin/git -C WT commit -F S/commit-msg.txt` (full path).
5. `/usr/bin/git -C WT status --short` must print nothing. Do not push.

## Your final message

As the protocol says:

- `STATUS: DONE`, or `STATUS: BLOCKED` with the blocker, on the first line;
- the fix commit SHA (on `p1/1c-t8-account-drafts`, on top of `5e8b70e`);
- the 13 files changed;
- the RED and GREEN counts;
- the 15 mutants, each killed by what;
- each gate command with its result and counts;
- SKIPPED items;
- what the reviewer should look at first:
  - R98's way in `SessionEndedScreen.tsx` (`others`), and the two R98 cases;
  - R99's `endStory` in `OnboardingScreen.tsx`, with no cast left.

---

## Appendix A: the code edits (`orig/` at `5e8b70e` to `real/`)

For reading only; Step 3 copies the verified files.

### `apps/app/src/screens/redesign/signin/SessionEndedScreen.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/signin/SessionEndedScreen.tsx}}
```

### `apps/app/src/screens/redesign/account/OnboardingScreen.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/account/OnboardingScreen.tsx}}
```

`afterStory` and `afterSignInAttempt` in `onboardingModel.ts` do not change: `afterStory(true)` and `afterSignInAttempt('active', 'onboarding')` still answer `/onboarding/reminder`, for 1C-T9. No screen calls either of them with those arguments now.

### `apps/app/src/screens/redesign/signin/draftCopy.ts`

```diff
{{DIFF:apps/app/src/screens/redesign/signin/draftCopy.ts}}
```

### `apps/app/src/screens/redesign/signin/TermsScreen.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/signin/TermsScreen.tsx}}
```

### `apps/app/src/dev/catalogue/account/signinSections.tsx`

```diff
{{DIFF:apps/app/src/dev/catalogue/account/signinSections.tsx}}
```

## Appendix B: the test edits

For reading only; Step 2 copies the verified files.

### `apps/app/src/screens/redesign/signin/SessionEndedScreen.render.test.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/signin/SessionEndedScreen.render.test.tsx}}
```

### `apps/app/src/screens/redesign/signin/useFreshSignIn.render.test.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/signin/useFreshSignIn.render.test.tsx}}
```

### `apps/app/src/screens/redesign/signin/TermsGate.render.test.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/signin/TermsGate.render.test.tsx}}
```

### `apps/app/src/screens/redesign/signin/EmailCodeScreen.render.test.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/signin/EmailCodeScreen.render.test.tsx}}
```

### `apps/app/src/screens/redesign/signin/DevicesScreen.render.test.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/signin/DevicesScreen.render.test.tsx}}
```

### `apps/app/src/screens/redesign/account/OnboardingScreen.render.test.tsx`

```diff
{{DIFF:apps/app/src/screens/redesign/account/OnboardingScreen.render.test.tsx}}
```

### `apps/app/src/spend/v1/policies.test.ts`

```diff
{{DIFF:apps/app/src/spend/v1/policies.test.ts}}
```

## Appendix C: the receipt edits (`docs/implementation/receipts/1C-T8.md`)

```diff
{{DIFF:docs/implementation/receipts/1C-T8.md}}
```

## Appendix D: the commit message (`PL/commit-msg.txt`)

```
{{COMMIT}}
```

## Appendix E: the planner's proof (in `PL/proof`)

On a `git archive` of `5e8b70e` (`PL/tree`, with the worktree's root `node_modules` linked and its own `apps/app/node_modules` holding only the `@better-auth` link, so Vitest's cache stays in the planner's folder):

- `red-*.log`: the 7 test files on `5e8b70e`'s code (`PL/red`): typecheck `rc=0`; render `Test Files 2 failed | 6 passed (8)`, `Tests 3 failed | 66 passed (69)`, three `TestingLibraryElementError`, no missing module; unit `tests 37`, `pass 37`.
- `green-*.log` and `catalogue.log`: with the fix, render `Tests 69 passed (69)`, unit `tests 37`, `pass 37`, catalogue `Tests 50 passed | 512 skipped (562)`.
- `mutants.out` and `mutant-logs/`: 15 of 15 `KILLED`, `restored=True`, `rc=0`; every kill an assertion or a missing element, none a syntax or module error.
- `gate-*.log` and `gate-status.txt`: typecheck:app and typecheck:routes `rc=0`; test:app 34; test:unit {{UNIT}}; render {{RENDER_FILES}} files and {{RENDER_TESTS}} tests; export:web {{WEB}} modules.
- The diffs in `PL/diffs` turn `PL/orig` into `PL/real` exactly with `git apply`.
