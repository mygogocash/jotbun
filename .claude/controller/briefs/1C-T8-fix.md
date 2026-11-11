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
- **Gate:** test:app 34, test:unit 912, render 102 files and 1812 tests, web 4788 modules.

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
  - `SHA256SUMS`: the checksums of all of the above (51 lines, paths relative to PL);
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

1. `cd PL && shasum -a 256 -c SHA256SUMS; rc=$?; echo rc=$rc`. Expected: 51 lines, every one `OK`, and `rc=0`. Anything else: BLOCKED.
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
4. `npm run test:unit`. Expected: `rc=0`, `tests 912`, `pass 912`, `fail 0` (911 + 1: RV7's case).
5. FOCUSED render and CATALOGUE again: the same counts as Steps 3.4 and 3.6.
6. `npm run test:render -w gogospend-app > S/render-full.log 2>&1`. Expected: `rc=0`, `Test Files  102 passed (102)`, `Tests  1812 passed (1812)`. The arithmetic: `5e8b70e` has 102 files and 1802 tests; this round adds no file, 8 cases to existing files, and the new section's every-section and screen-reader cases (1802 + 8 + 2). A case that times out near 4 to 5 s in a file this round does not touch, and passes alone on a rerun, is a known flake: record both runs.
7. `npm run export:web -w gogospend-app -- --max-workers 2 > S/export-web.log 2>&1`. Expected: `rc=0`, `Exported: dist` and `(4788 modules)`, `5e8b70e`'s count: no module is added or removed. `apps/app/dist` is gitignored.
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
--- a/apps/app/src/screens/redesign/signin/SessionEndedScreen.tsx
+++ b/apps/app/src/screens/redesign/signin/SessionEndedScreen.tsx
@@ -9,8 +9,11 @@
 //   sign-in, and everything already sent is in the account.
 // - The main button names the account's own method (ดำเนินการต่อด้วย Apple);
 //   on a build without that method, the email code to the account's address
-//   (C14). ใช้วิธีอื่น lists the other methods this build offers. Email opens
-//   the code step on this screen.
+//   (C14). ใช้วิธีอื่น lists the other methods this build offers, and when the
+//   main button is the email code to the account's own address, an email code
+//   to another address too (R98), so another account is always within reach,
+//   even on a build that offers only the email code. Email opens the code step
+//   on this screen.
 // - After a sign-in (`afterEndedSignIn`): the same account resumes, and its
 //   outbox sends the records; another account never gets them, and when any
 //   wait the keep-or-erase choice shows (OtherAccountRecords), where erasing
@@ -62,6 +65,9 @@
   | { readonly kind: 'email'; readonly fixedEmail: string | undefined }
   | { readonly kind: 'other_account'; readonly previousAccountId: string; readonly unsent: number };

+/** One of ใช้วิธีอื่น's ways: a method this build offers, to any account (an email code to any address). */
+type OtherWay = { readonly key: string; readonly method: SignInMethod; readonly label: string };
+
 const FAILED: SignInResult = { outcome: 'failed', methods: [], created: false };

 export function SessionEndedScreen({ view, unsentRows, provider, eraseAccount, onResumed }: SessionEndedScreenProps) {
@@ -85,7 +91,13 @@

   const offered = provider.methods();
   const main: SignInMethod | null = view.method !== null && offered.includes(view.method) ? view.method : offered.includes('email') ? 'email' : null;
-  const others = offered.filter((method) => method !== main);
+  // R98: when the main button is the email code to the account's own address,
+  // ใช้วิธีอื่น also offers an email code to another address, so a failure
+  // always has another way (spec §5.2) and another account can sign in (D37).
+  const others: readonly OtherWay[] = [
+    ...offered.filter((method) => method !== main).map((method) => ({ key: method, method, label: labels[method] })),
+    ...(main === 'email' ? [{ key: 'email-other', method: 'email' as const, label: sc('Email a code to another address') }] : []),
+  ];

   const settle = (result: SignInResult) => {
     if (result.outcome === 'active') {
@@ -209,18 +221,19 @@
             />
           ) : null}
           {phase.otherWays
-            ? others.map((method) => (
+            ? others.map((way) => (
               <PillButton
-                key={method}
+                key={way.key}
+                testID={`session-ended-way-${way.key}`}
                 kind="secondary"
-                label={labels[method]}
-                busy={busy === method}
+                label={way.label}
+                busy={busy === way.method}
                 busyLabel={tc('Signing in…')}
-                disabled={busy !== null && busy !== method}
-                onPress={() => void start(method, false)}
+                disabled={busy !== null && busy !== way.method}
+                onPress={() => void start(way.method, false)}
               />
             ))
-            : others.length > 0 ? <TextButton label={sc('Use another way')} onPress={() => setPhase({ kind: 'ended', otherWays: true })} /> : null}
+            : others.length > 0 ? <TextButton testID="session-ended-other-ways" label={sc('Use another way')} onPress={() => setPhase({ kind: 'ended', otherWays: true })} /> : null}
         </ActionFooter>
       ) : null}
     </View>
```

### `apps/app/src/screens/redesign/account/OnboardingScreen.tsx`

```diff
--- a/apps/app/src/screens/redesign/account/OnboardingScreen.tsx
+++ b/apps/app/src/screens/redesign/account/OnboardingScreen.tsx
@@ -15,13 +15,13 @@
 // - With the `signin` area on (1C-T8, K16, C15): the first step also offers
 //   bw-welcome's sign-in link, and the story (Skip, or "Let's start!") ends
 //   at sign-in from onboarding (`afterStory`); the reminder question moves
-//   to right after sign-in (R55, ReminderQuestionScreen), so it never shows
-//   here.
+//   to right after sign-in (R55, ReminderQuestionScreen). With a session
+//   already, today's reminder step still follows the story here: nothing
+//   goes to `/onboarding/reminder` before 1C-T9 adds that route (R99).
 //
 // The bun: a pose on the stage at Full. Quiet and Off leave the stage plain,
 // as Home's stage does: Quiet keeps the bun for empty states only.
 import { useRouter } from 'expo-router';
-import type { Href } from 'expo-router';
 import { useEffect, useRef, useState } from 'react';
 import { ScrollView, View } from 'react-native';

@@ -106,12 +106,12 @@

   const finish = () => router.replace(afterOnboarding(isAuthed));

-  // The `signin` area: the story ends at sign-in from onboarding, or with a
-  // session already at the reminder question (1C-T9 routes it; until then
-  // typed routes do not know it, and the area is off).
+  // The `signin` area: the story ends at sign-in from onboarding. With a
+  // session already, today's reminder step follows the story here until 1C-T9
+  // adds `/onboarding/reminder` and ends the story there (R99).
   const endStory = () => {
-    if (!isAuthed) router.replace(afterStory(false));
-    else router.replace(afterStory(true) as unknown as Href);
+    if (isAuthed) setStep('reminder');
+    else router.replace(afterStory(false));
   };
   const skip = () => (signin ? endStory() : setStep(SKIP_TO));
   const next = () => (signin && step === 'first-coffee' ? endStory() : setStep(stepAfter(step)));
```

`afterStory` and `afterSignInAttempt` in `onboardingModel.ts` do not change: `afterStory(true)` and `afterSignInAttempt('active', 'onboarding')` still answer `/onboarding/reminder`, for 1C-T9. No screen calls either of them with those arguments now.

### `apps/app/src/screens/redesign/signin/draftCopy.ts`

```diff
--- a/apps/app/src/screens/redesign/signin/draftCopy.ts
+++ b/apps/app/src/screens/redesign/signin/draftCopy.ts
@@ -57,7 +57,7 @@
   'or because it was signed out from another phone': 'หรือมีการออกจากระบบจากอีกเครื่อง',
   'Records still on this phone: {count}': 'ยังอยู่ในเครื่องนี้ {count} รายการ',
   'Not sent yet. They send by themselves after you sign in.': 'ยังไม่ได้ส่ง จะส่งให้เองหลังเข้าสู่ระบบ',
-  'Records waiting to send': 'รายการที่รอส่ง',
+  'Records waiting to send': 'รายการที่รอส่ง', // DRAFT
   'Everything you already sent is in your account.': 'บันทึกที่ส่งแล้วอยู่ในบัญชีของคุณครบ',
   'Use another way': 'ใช้วิธีอื่น',
   // The session-ended screen: the board's "ใช้บัญชี Apple เดิมของกานต์" without a name, the account-unavailable variant
@@ -65,6 +65,7 @@
   'Use the same Google account, so the records go to the same place.': 'ใช้บัญชี Google เดิม รายการจึงจะส่งเข้าที่เดิม', // DRAFT
   'Use the same email, so the records go to the same place.': 'ใช้อีเมลเดิม รายการจึงจะส่งเข้าที่เดิม', // DRAFT
   'Sign in to the same account, so the records go to the same place.': 'เข้าสู่ระบบบัญชีเดิม รายการจึงจะส่งเข้าที่เดิม', // DRAFT
+  'Email a code to another address': 'ส่งรหัสไปที่อีเมลอื่น', // DRAFT
   'This account is not available': 'บัญชีนี้ใช้งานไม่ได้', // DRAFT
   "This account can't be used right now. If you asked to delete it, the deletion is under way.": 'บัญชีนี้ใช้งานไม่ได้ในตอนนี้ ถ้าคุณขอลบบัญชีไว้ ระบบกำลังลบอยู่', // DRAFT
   "This account can't be used right now.": 'บัญชีนี้ใช้งานไม่ได้ในตอนนี้', // DRAFT
@@ -120,8 +121,7 @@
   "Couldn't confirm it's you. Try again, or use another way.": 'ยืนยันตัวตนไม่สำเร็จ ลองอีกครั้งหรือใช้วิธีอื่น', // DRAFT
   // bw-welcome
   'Already have an account? Sign in': 'มีบัญชีแล้ว เข้าสู่ระบบ',
-  // sa-terms
-  'Our promises': 'คำสัญญาของเรา',
+  // sa-terms (its title, "Our promises", is approved copy and stays on useCopy)
   'Three things Jotbun always does for you': 'สามข้อที่ Jotbun ทำให้คุณเสมอ',
   'No bank connection': 'ไม่ผูกบัญชีธนาคาร',
   'Jotbun never connects to your bank. You write down every record yourself.': 'Jotbun ไม่เชื่อมต่อกับธนาคารของคุณ คุณเป็นคนจดเองทุกรายการ',
```

### `apps/app/src/screens/redesign/signin/TermsScreen.tsx`

```diff
--- a/apps/app/src/screens/redesign/signin/TermsScreen.tsx
+++ b/apps/app/src/screens/redesign/signin/TermsScreen.tsx
@@ -2,8 +2,9 @@
 // awaiting E2, shown by TermsGate in place of the screens while required
 // policy versions are pending.
 //
-// - The board's title and line, and its three promises as a PromiseList,
-//   each row the promise's title, a line break, then its line.
+// - The board's title (today's approved "Our promises") and line, and its
+//   three promises as a PromiseList, each row the promise's title, a line
+//   break, then its line.
 // - Today's TermsCheckbox, unticked, with the board's sentence; under it the
 //   two policy names, each opening today's Sheet with that kind's published
 //   text in the active language (English for Vietnamese).
@@ -114,7 +115,7 @@
   return (
     <View testID="terms-screen" style={{ flex: 1, backgroundColor: colors.background }}>
       <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.lg }}>
-        <StageHeader title={sc('Our promises')} subtitle={sc('Three things Jotbun always does for you')} />
+        <StageHeader title={tc('Our promises')} subtitle={sc('Three things Jotbun always does for you')} />
         <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
           <PromiseList items={promises} />
           <TermsCheckbox label={sc('I accept the Jotbun Terms of Service and Privacy Policy')} checked={ticked} onToggle={() => setTicked((now) => !now)} />
```

### `apps/app/src/dev/catalogue/account/signinSections.tsx`

```diff
--- a/apps/app/src/dev/catalogue/account/signinSections.tsx
+++ b/apps/app/src/dev/catalogue/account/signinSections.tsx
@@ -1,9 +1,10 @@
 // 1C-T8's drafts in each of their states (development only), for the owner's
 // E2 screenshots: the email code, account exists, session ended with the
-// keep-or-erase choice, devices and methods, confirm it's you, the reminder
-// question after sign-in, the terms step and the welcome link. The `signin`
-// area is not approved yet; only the welcome link reads it, and its section
-// turns it on. The copy is a draft (signin/draftCopy.ts).
+// keep-or-erase choice and an email account's other way (R98), devices and
+// methods, confirm it's you, the reminder question after sign-in, the terms
+// step and the welcome link. The `signin` area is not approved yet; only the
+// welcome link reads it, and its section turns it on. The copy is a draft
+// (signin/draftCopy.ts).
 //
 // Every section is drawn on fakes: no sign-in, no network, no notification
 // prompt. Draft labels are not in the catalogs, so the scripts reach controls
@@ -47,6 +48,8 @@
   readonly code?: CodeOutcome;
   readonly signIn?: SignInResult['outcome'];
   readonly fresh?: FreshOutcome;
+  /** The methods this build offers; every method unless named. */
+  readonly methods?: readonly SignInMethod[];
 };

 /** A credential provider that only answers as scripted: it never signs anyone in. */
@@ -54,7 +57,7 @@
   let current: StoredSession | null = script.account ?? APPLE_ACCOUNT;
   return {
     account: () => current,
-    methods: () => EVERY_METHOD,
+    methods: () => script.methods ?? EVERY_METHOD,
     sendEmailCode: async () => script.code ?? 'sent',
     async signIn() {
       const outcome = script.signIn ?? 'active';
@@ -133,11 +136,11 @@
 const withTerms = (accept: 'ok' | 'never' | 'fails' = 'ok') => (): TermsFixture => ({ resources: createFakeResources().resources, diary: null, policies: fakePolicies(accept) });

 const nothing = () => undefined;
-const ended = (kind: SessionEndedView['kind'] = 'signed_out_elsewhere'): SessionEndedView => ({ kind, accountId: APPLE_ACCOUNT.accountId, method: 'apple', unsent: 3 });
+const ended = (kind: SessionEndedView['kind'] = 'signed_out_elsewhere', account: StoredSession = APPLE_ACCOUNT): SessionEndedView => ({ kind, accountId: account.accountId, method: account.method, unsent: 3 });

 const emailCode = ({ provider }: DraftFixture) => <EmailCodeScreen provider={provider} mode="sign_in" onDone={nothing} onBack={nothing} />;
-const sessionEnded = (kind?: SessionEndedView['kind']) => ({ provider }: DraftFixture) => (
-  <SessionEndedScreen view={ended(kind)} unsentRows={UNSENT} provider={provider} eraseAccount={async () => undefined} onResumed={nothing} />
+const sessionEnded = (kind?: SessionEndedView['kind'], account?: StoredSession) => ({ provider }: DraftFixture) => (
+  <SessionEndedScreen view={ended(kind, account)} unsentRows={UNSENT} provider={provider} eraseAccount={async () => undefined} onResumed={nothing} />
 );
 const devicesScreen = ({ port, provider }: DevicesFixture) => (
   <DevicesScreen port={port} freshSignIn={async () => 'cancelled'} account={provider.account() ?? APPLE_ACCOUNT} />
@@ -224,6 +227,13 @@
     script: () => [...toOtherAccount(), { call: 'onPress', on: { testID: 'other-account-erase' } }, { waitFor: 'sheet-panel' }],
     render: sessionEnded(),
   }),
+  screenSection({
+    id: 'signin-session-ended-email',
+    title: 'Sign-in drafts: session ended, an email account, another way (R98)',
+    fixture: drafts({ account: EMAIL_ACCOUNT, methods: ['email'] }),
+    script: () => [{ call: 'onPress', on: { testID: 'session-ended-other-ways' } }, { waitFor: 'session-ended-way-email-other' }],
+    render: sessionEnded('signed_out_elsewhere', EMAIL_ACCOUNT),
+  }),
   screenSection({ id: 'signin-devices', title: 'Sign-in drafts: devices, three of them', fixture: withDevices(APPLE_ACCOUNT, ['apple', 'email']), script: () => [{ waitFor: 'devices-list' }], render: devicesScreen }),
   screenSection({
     id: 'signin-devices-methods',
```

## Appendix B: the test edits

For reading only; Step 2 copies the verified files.

### `apps/app/src/screens/redesign/signin/SessionEndedScreen.render.test.tsx`

```diff
--- a/apps/app/src/screens/redesign/signin/SessionEndedScreen.render.test.tsx
+++ b/apps/app/src/screens/redesign/signin/SessionEndedScreen.render.test.tsx
@@ -36,26 +36,26 @@
 ];
 const view = (unsent = 3): SessionEndedView => ({ kind: 'signed_out_elsewhere', accountId: ENDED.accountId, method: 'apple', unsent });

-/** The ended account until a sign-in that goes through, then `signInAs`. */
-function provider({ signInAs = ENDED, methods = ['apple', 'google', 'email'] }: { signInAs?: StoredSession; methods?: readonly SignInMethod[] } = {}) {
-  let current: StoredSession = ENDED;
+/** `account` (the ended one) until a sign-in that goes through, then `signInAs`; every sign-in answers `answer`. */
+function provider({ account = ENDED, signInAs = ENDED, methods = ['apple', 'google', 'email'], answer = ACTIVE }: { account?: StoredSession; signInAs?: StoredSession; methods?: readonly SignInMethod[]; answer?: SignInResult } = {}) {
+  let current: StoredSession = account;
   return {
     account: vi.fn((): StoredSession | null => current),
     methods: vi.fn((): readonly SignInMethod[] => methods),
     signIn: vi.fn(async (_request: SignInRequest): Promise<SignInResult> => {
-      current = signInAs;
-      return ACTIVE;
+      if (answer.outcome === 'active') current = signInAs;
+      return answer;
     }),
     sendEmailCode: vi.fn(async (_email: string): Promise<CodeOutcome> => 'sent'),
     freshSignIn: vi.fn(async (_request: SignInRequest): Promise<FreshOutcome> => 'fresh'),
   } satisfies SessionEndedProvider;
 }

-async function open(options: { fake?: ReturnType<typeof provider>; unsent?: number; rows?: readonly UnsentRow[] } = {}) {
+async function open(options: { fake?: ReturnType<typeof provider>; unsent?: number; rows?: readonly UnsentRow[]; view?: SessionEndedView } = {}) {
   const fake = options.fake ?? provider();
   const eraseAccount = vi.fn(async (_accountId: string) => undefined);
   const onResumed = vi.fn();
-  const mounted = mountInApp(<SessionEndedScreen view={view(options.unsent ?? 3)} unsentRows={options.rows ?? ROWS} provider={fake} eraseAccount={eraseAccount} onResumed={onResumed} />);
+  const mounted = mountInApp(<SessionEndedScreen view={options.view ?? view(options.unsent ?? 3)} unsentRows={options.rows ?? ROWS} provider={fake} eraseAccount={eraseAccount} onResumed={onResumed} />);
   await settle();
   return { fake, eraseAccount, onResumed, mounted };
 }
@@ -83,6 +83,8 @@
   press('Use another way');
   expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
   expect(screen.getByRole('button', { name: 'Continue with email' })).toBeTruthy();
+  // The main button is Apple's, so the email code here already goes to any address: no second email way (R98).
+  expect(screen.queryByRole('button', { name: 'Email a code to another address' })).toBeNull();
   // The same account resumes at once: nothing is asked, nothing erased.
   await signInAgain();
   expect(fake.signIn).toHaveBeenCalledWith({ method: 'apple', signUp: false });
@@ -137,3 +139,67 @@
   expect(eraseAccount).not.toHaveBeenCalled();
   expect(onResumed).toHaveBeenCalledTimes(1);
 });
+
+// ---------------------------------------------------------------------------
+// The 1C-T8 fix round (R98, review M1 and m1's RV5): when the main button is
+// the email code to the account's own address, ใช้วิธีอื่น also offers an email
+// code to another address, so another account is within reach even on a build
+// that offers only the email code (today's), and a refused sign-in still has
+// another way (spec §5.2).
+
+const EMAIL_ENDED: StoredSession = { ...ENDED, email: 'kanya@gmail.com', method: 'email' };
+const EMAIL_VIEW: SessionEndedView = { kind: 'signed_out_elsewhere', accountId: EMAIL_ENDED.accountId, method: 'email', unsent: 3 };
+const UNAVAILABLE: SignInResult = { outcome: 'account_unavailable', methods: [], created: false };
+const typeInto = (name: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
+
+test("the email button sends the code to the account's own address", async () => {
+  const fake = provider({ account: EMAIL_ENDED });
+  await open({ fake, view: EMAIL_VIEW });
+  press('Continue with email');
+  // No address field: the code goes to the account's own address, masked.
+  expect(screen.queryByRole('textbox', { name: 'Email address' })).toBeNull();
+  expect(screen.getByTestId('email-code-address').textContent).toBe('k•••@gmail.com');
+  press('Send the code');
+  await flush();
+  expect(fake.sendEmailCode).toHaveBeenCalledTimes(1);
+  expect(fake.sendEmailCode).toHaveBeenCalledWith('kanya@gmail.com');
+});
+
+test('an email account on a build with only the email code can sign in to another account, which asks keep or erase', async () => {
+  const fake = provider({ account: EMAIL_ENDED, signInAs: OTHER, methods: ['email'] });
+  const { eraseAccount, onResumed } = await open({ fake, view: EMAIL_VIEW });
+  expect(screen.getByRole('button', { name: 'Continue with email' })).toBeTruthy();
+  press('Use another way');
+  press('Email a code to another address');
+  // An empty address field: the code can go to any address.
+  typeInto('Email address', 'Ploy@Gmail.com');
+  press('Send the code');
+  await flush();
+  expect(fake.sendEmailCode).toHaveBeenCalledWith('ploy@gmail.com');
+  typeInto('6-digit code', '135790');
+  await flush();
+  expect(fake.signIn).toHaveBeenCalledWith({ method: 'email', email: 'ploy@gmail.com', code: '135790' });
+  // Another account with records waiting: D37's keep-or-erase choice.
+  expect(screen.getByRole('heading', { name: 'Records from your other account' })).toBeTruthy();
+  expect(onResumed).not.toHaveBeenCalled();
+  expect(eraseAccount).not.toHaveBeenCalled();
+});
+
+test("an Apple account on a build with only the email code: its own address first, and when the account is unavailable another way still shows", async () => {
+  const fake = provider({ methods: ['email'], answer: UNAVAILABLE });
+  await open({ fake, view: { ...view(), kind: 'account_unavailable' } });
+  expect(screen.getByRole('heading', { name: 'This account is not available' })).toBeTruthy();
+  press('Continue with email');
+  press('Send the code');
+  await flush();
+  expect(fake.sendEmailCode).toHaveBeenCalledWith('karn@icloud.com');
+  typeInto('6-digit code', '246810');
+  await flush();
+  // The server refuses the account: the screen says so, with the records-safe line, and offers another way.
+  expect(screen.getByText("This account can't be used right now.")).toBeTruthy();
+  expect(screen.getByText('Your records are still on this phone.')).toBeTruthy();
+  press('Use another way');
+  press('Email a code to another address');
+  expect(screen.getByRole('textbox', { name: 'Email address' })).toBeTruthy();
+  expect(fake.signIn).toHaveBeenCalledTimes(1);
+});
```

### `apps/app/src/screens/redesign/signin/useFreshSignIn.render.test.tsx`

```diff
--- a/apps/app/src/screens/redesign/signin/useFreshSignIn.render.test.tsx
+++ b/apps/app/src/screens/redesign/signin/useFreshSignIn.render.test.tsx
@@ -125,3 +125,22 @@
   fireEvent.click(screen.getByRole('button', { name: 'Use another way' }));
   expect(screen.getByTestId('email-code-address').textContent).toBe('k•••@icloud.com');
 });
+
+// The 1C-T8 fix round (review m1, RV1): an answer is never handed out twice.
+test('a later fresh sign-in never reuses an earlier answer: a new sheet and a new sign-in', async () => {
+  const fake = provider(APPLE, ['fresh', 'fresh']);
+  const { outcomes, sheet } = await open(fake);
+  fireEvent.click(within(sheet).getByRole('button', { name: 'Continue with Apple' }));
+  await flush();
+  expect(outcomes).toEqual(['fresh']);
+  expect(screen.queryByRole('dialog', { name: "Confirm it's you" })).toBeNull();
+  // The next sensitive action asks again: nothing answers until the new sheet's sign-in does.
+  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
+  await flush();
+  expect(outcomes).toEqual(['fresh']);
+  const again = await screen.findByRole('dialog', { name: "Confirm it's you" });
+  fireEvent.click(within(again).getByRole('button', { name: 'Continue with Apple' }));
+  await flush();
+  expect(fake.freshSignIn).toHaveBeenCalledTimes(2);
+  expect(outcomes).toEqual(['fresh', 'fresh']);
+});
```

### `apps/app/src/screens/redesign/signin/TermsGate.render.test.tsx`

```diff
--- a/apps/app/src/screens/redesign/signin/TermsGate.render.test.tsx
+++ b/apps/app/src/screens/redesign/signin/TermsGate.render.test.tsx
@@ -246,4 +246,26 @@
   fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
   expect(router.push).toHaveBeenCalledWith('/settings');
   expect(client.accept).not.toHaveBeenCalled();
+});
+
+// The 1C-T8 fix round (review m1, RV2 and RV3): one read at a time, and an answer during a read is not lost.
+test('a policy_required answer during a read waits for it, then one more read shows the terms', async () => {
+  let release: (value: PendingPolicy[]) => void = () => undefined;
+  const first = new Promise<PendingPolicy[]>((resolve) => { release = resolve; });
+  const { client } = policyClient([first, [TERMS]]);
+  const { events } = await open(client);
+  expect(client.pending).toHaveBeenCalledTimes(1);
+  // Two answers while the first read is out: no second read starts yet.
+  await events.fire();
+  await events.fire();
+  expect(client.pending).toHaveBeenCalledTimes(1);
+  // The first read answers none (it began before the policy changed); one more read follows, and it shows the terms.
+  await act(async () => {
+    release([]);
+    await Promise.resolve();
+  });
+  await flush();
+  expect(client.pending).toHaveBeenCalledTimes(2);
+  expect(await screen.findByRole('heading', { name: COPY.title })).toBeTruthy();
+  expect(screens()).toBeNull();
 });
```

### `apps/app/src/screens/redesign/signin/EmailCodeScreen.render.test.tsx`

```diff
--- a/apps/app/src/screens/redesign/signin/EmailCodeScreen.render.test.tsx
+++ b/apps/app/src/screens/redesign/signin/EmailCodeScreen.render.test.tsx
@@ -162,3 +162,19 @@
   expect(fake.signIn).not.toHaveBeenCalled();
   expect(onDone).toHaveBeenCalledWith('fresh');
 });
+
+// The 1C-T8 fix round (review m1, RV4): one code per press, however fast it lands.
+test('a double tap on Send the code sends one code', async () => {
+  const fake = provider();
+  fake.sendEmailCode.mockImplementation(() => new Promise<CodeOutcome>(() => undefined));
+  mountInApp(<EmailCodeScreen provider={fake} mode="sign_in" onDone={vi.fn()} onBack={vi.fn()} />);
+  await settle();
+  fireEvent.change(screen.getByRole('textbox', { name: COPY.address }), { target: { value: 'kanya@gmail.com' } });
+  const send = button(COPY.send);
+  act(() => {
+    fireEvent.click(send);
+    fireEvent.click(send);
+  });
+  await flush();
+  expect(fake.sendEmailCode).toHaveBeenCalledTimes(1);
+});
```

### `apps/app/src/screens/redesign/signin/DevicesScreen.render.test.tsx`

```diff
--- a/apps/app/src/screens/redesign/signin/DevicesScreen.render.test.tsx
+++ b/apps/app/src/screens/redesign/signin/DevicesScreen.render.test.tsx
@@ -153,3 +153,15 @@
   await open({ linked: ['apple', 'google', 'email'] });
   expect(screen.getAllByRole('button', { name: /^Remove / }).map((button) => button.getAttribute('aria-label'))).toEqual(['Remove Apple', 'Remove Google']);
 });
+
+// The 1C-T8 fix round (review m1, RV6): Link is offered only for a method this build runs.
+test('linking is offered only for a method this build runs', async () => {
+  // A build with Google and no Apple (Android, K15), and an account that already has Google: nothing to link.
+  const fake = setup({ linked: ['google', 'email'] });
+  const port = { ...fake.port, methods: ['google', 'email'] as const } satisfies DevicesPort;
+  mountInApp(<DevicesScreen port={port} freshSignIn={fake.freshSignIn} account={{ ...ACCOUNT, email: 'karn@gmail.com', method: 'google' }} />);
+  await settle();
+  await screen.findByTestId('devices-list');
+  expect(screen.getByText('Sign in with Google')).toBeTruthy();
+  expect(screen.queryByRole('button', { name: /^Link / })).toBeNull();
+});
```

### `apps/app/src/screens/redesign/account/OnboardingScreen.render.test.tsx`

```diff
--- a/apps/app/src/screens/redesign/account/OnboardingScreen.render.test.tsx
+++ b/apps/app/src/screens/redesign/account/OnboardingScreen.render.test.tsx
@@ -338,20 +338,36 @@
   first.unmount();
   // Skip leaves the story for sign-in too.
   nav.router.replace.mockReset();
-  const skipped = mount(<OnboardingScreen reminders={service} />);
+  mount(<OnboardingScreen reminders={service} />);
   await settle();
   press(COPY.skip);
   expect(nav.router.replace).toHaveBeenCalledWith('/login?from=onboarding');
   expect(screen.queryByRole('heading', { name: COPY.reminder })).toBeNull();
-  skipped.unmount();
-  // With a session already, the story ends at the reminder question, which now follows sign-in.
-  nav.router.replace.mockReset();
+  expect(service.setPreference).not.toHaveBeenCalled();
+});
+
+// The 1C-T8 fix round (R99): nothing goes to /onboarding/reminder before 1C-T9 adds that route.
+test("with a session, today's reminder step still follows the story until 1C-T9 adds its route", async () => {
+  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'signin');
   setSession({ access_token: 'session-token', userId: 'user-1' });
-  mount(<OnboardingScreen reminders={service} />);
+  const service = reminders('scheduled');
+  const skipped = mount(<OnboardingScreen reminders={service} />);
   await settle();
   press(COPY.skip);
-  expect(nav.router.replace).toHaveBeenCalledWith('/onboarding/reminder');
+  expect(heading(COPY.reminder)).toBeTruthy();
+  skipped.unmount();
+  mount(<OnboardingScreen reminders={service} />);
+  await settle();
+  press(COPY.next);
+  press(COPY.next);
+  press(COPY.start);
+  expect(heading(COPY.reminder)).toBeTruthy();
+  expect(nav.router.replace).not.toHaveBeenCalled();
   expect(service.setPreference).not.toHaveBeenCalled();
+  // Its answer then goes on to Quick add, as today.
+  press(COPY.notNow);
+  expect(nav.router.replace).toHaveBeenCalledTimes(1);
+  expect(nav.router.replace).toHaveBeenCalledWith('/spend/add');
 });

 test("with 'signin' off the order is today's", async () => {
```

### `apps/app/src/spend/v1/policies.test.ts`

```diff
--- a/apps/app/src/spend/v1/policies.test.ts
+++ b/apps/app/src/spend/v1/policies.test.ts
@@ -131,3 +131,16 @@
   assert.deepEqual(await client.pending(), []);
   assert.equal(required, 1);
 });
+
+// The 1C-T8 fix round (review m1, RV7): published() checks every field of every version it is given.
+test('a malformed published list is invalid_response', async () => {
+  const invalid = (error: unknown) => error instanceof V1Error && error.outcome === 'invalid_response';
+  const terms = { kind: 'terms', version: 2, required: true, published_at: '2026-10-01T00:00:00.000Z', text: { th: 'ข้อกำหนด', en: 'Terms' } };
+  for (const entry of [{ ...terms, kind: 'cookies' }, { ...terms, version: 0 }, { ...terms, required: 'yes' }, { ...terms, published_at: 1 }, { ...terms, text: null }, { ...terms, text: { th: 'ข้อกำหนด' } }]) {
+    replies = [{ status: 200, body: [entry] }];
+    await assert.rejects(createPolicyClient(transport()).published(), invalid, JSON.stringify(entry));
+  }
+  replies = [{ status: 200, body: [terms] }];
+  assert.deepEqual(await createPolicyClient(transport()).published(), [terms]);
+  assert.deepEqual(seen.map((request) => `${request.method} ${request.url}`).at(-1), 'GET /v1/policies');
+});
```

## Appendix C: the receipt edits (`docs/implementation/receipts/1C-T8.md`)

```diff
--- a/docs/implementation/receipts/1C-T8.md
+++ b/docs/implementation/receipts/1C-T8.md
@@ -20,7 +20,7 @@
   - `export:web`: exit 0, `Exported: dist`, `(4788 modules)`. `apps/app/dist` is gitignored.
   - `git diff --check` (working tree, and the staged set before the commit): no output.
 - **SKIPPED:**
-  - The owner's E2 screenshots (plan Step 5, P14): no simulator or browser here. Started with `EXPO_PUBLIC_REDESIGN=catalogue npm run web -w gogospend-app`, then `/dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&chrome=off` (app: `gogospend://dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&tour=3000`) for `signin-email-address`, `signin-email-code`, `signin-email-wrong-code`, `signin-email-rate-limited`, `signin-account-exists-apple`, `signin-account-exists-email`, `signin-session-ended`, `signin-session-ended-unavailable`, `signin-session-ended-other-account`, `signin-session-ended-erase`, `signin-devices`, `signin-devices-methods`, `signin-confirm-apple`, `signin-confirm-google`, `signin-confirm-email`, `signin-reminder`, `signin-terms`, `signin-terms-ticked`, `signin-terms-accepting`, `signin-terms-failed`, `signin-terms-policy` and `signin-welcome-link`, light and dark, Thai and English, at 320 pt and at the default width. For the owner: the copy is a draft for approval; in today's `core` layout the terms gate sits inside `SpendTabShell` (1C-T9), so the tab bar and its add button stay, each leading to the terms (the one deviation from sa-terms).
+  - The owner's E2 screenshots (plan Step 5, P14): no simulator or browser here. Started with `EXPO_PUBLIC_REDESIGN=catalogue npm run web -w gogospend-app`, then `/dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&chrome=off` (app: `gogospend://dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&tour=3000`) for `signin-email-address`, `signin-email-code`, `signin-email-wrong-code`, `signin-email-rate-limited`, `signin-account-exists-apple`, `signin-account-exists-email`, `signin-session-ended`, `signin-session-ended-unavailable`, `signin-session-ended-other-account`, `signin-session-ended-erase`, `signin-session-ended-email` (added by the fix round below), `signin-devices`, `signin-devices-methods`, `signin-confirm-apple`, `signin-confirm-google`, `signin-confirm-email`, `signin-reminder`, `signin-terms`, `signin-terms-ticked`, `signin-terms-accepting`, `signin-terms-failed`, `signin-terms-policy` and `signin-welcome-link`, light and dark, Thai and English, at 320 pt and at the default width. For the owner: the copy is a draft for approval; in today's `core` layout the terms gate sits inside `SpendTabShell` (1C-T9), so the tab bar and its add button stay, each leading to the terms (the one deviation from sa-terms).
   - The edge, API and database suites (no edge, API or database code changed). The real server routes (`/v1/me`, `/v1/policies`, `/v1/me/policy-acceptances`, the devices and link routes) are tested in their own tasks; these clients and screens run on a local `node:http` server and fakes.
 - **Not applicable:** no route, no `en.json` or `th.json` key, no package or lockfile change.
 - **Deviations** (the planner's rulings P1 to P16 in `.claude/controller/briefs/1C-T8.md`, accepted by the controller):
@@ -35,7 +35,27 @@
   - "Confirm it's you" shows before Apple's or Google's own sheet, one tap more than the boards (P5). Dropping it for Apple and Google is a small change in `useFreshSignIn`.
   - The account-exists screen and the account-unavailable variant have no board; the devices rows, linking and removing, the keep-or-erase choice and every failure line are drafts.
   - The open deletion question (an unconfirmed deletion stays unconfirmed on Try again once its token is over 10 minutes old) does not touch these screens.
+  - The account-unavailable variant (`signin-session-ended-unavailable`; review m2, added by the fix round): it keeps the signed-out lines, which are not true for a deleted or deleting account ("Not sent yet. They send by themselves after you sign in.", "Everything you already sent is in your account." and "Use the same Apple account, so the records go to the same place."), and it leads with the same account's sign-in, which the server refuses for such an account. Since the fix round, ใช้วิธีอื่น always offers a way to another account (R98). Decide the variant's lines and its main action.
+  - K24's terms box (review m4, added by the fix round): today's sign-in screen keeps its terms box, which records nothing (approved at E2 checkpoint 4), until P6B's sa-signin replaces that screen, unless you drop it when approving these screenshots. The terms step now records each acceptance.
 - **Notes for later tasks:**
   - 1C-T9: route `/login/email`, `/login/account-exists`, `/session-ended`, `/settings/devices` and `/onboarding/reminder`; then delete the `as unknown as Href` cast in `OnboardingScreen.tsx`. `AccountExistsScreen` reports one choice per visit, so leave the screen on each choice. `SessionEndedScreen` takes `view` from `sessionEndedView(...)`, the rows from the open diary, and `eraseAccount` as the diary's discard for that account. Render `useFreshSignIn`'s `sheet` on Settings, Privacy and Devices. Move every `DRAFT_TH` line the owner approves into the catalogs, switch `sc` to `useCopy`, empty `AWAITING_E2` (the second catalogs test can go then).
   - 1D-T8: add its sections after `...SIGNIN_SECTIONS` in `ACCOUNT_SECTIONS`, and `'analytics'` after `'signin'`.
   - P6B-T7 and P6B-T8 move these screens' rules into hooks; their render tests should run unchanged.
+
+## Fix round (9 November 2026): the session-ended screen reaches another account (R98), nothing goes to `/onboarding/reminder` before 1C-T9 (R99), and the review's pins
+
+- **Status:** built and verified locally on `p1/1c-t8-account-drafts`, on `5e8b70e`, not merged with the integration head (CI tests the merge; `git merge-tree` against the head was clean). Not pushed. The controller's confirming review follows.
+- **Review findings fixed** (`.claude/controller/reviews/1C-T8.md`; the controller's rulings of 9 November):
+  - **M1, ruling R98 (amends the planner's call P6):** on the session-ended screen, whenever the main button is the email code to the account's own address, ใช้วิธีอื่น also offers "Email a code to another address" (ส่งรหัสไปที่อีเมลอื่น, a DRAFT line): the code step with an empty address field. So a failure always offers another way (plan Task 8, line 1014; spec §5.2), and another account can sign in and reach D37's keep-or-erase choice, on a build that offers only the email code too (today's). The other ways and ใช้วิธีอื่น get test ids, and a new catalogue section, `signin-session-ended-email`, draws an email account on such a build with ใช้วิธีอื่น open, for the E2 screenshots (23 sections now; the list above names it).
+  - **P4, ruling R99:** nothing goes to `/onboarding/reminder` before 1C-T9 adds that route. With the `signin` area on, a person with a session who ends the story (Skip or "Let's start!") gets today's reminder step on the onboarding screen and then Quick add, as with the area off; without a session, the story still ends at `/login?from=onboarding`. The `as unknown as Href` cast and its `Href` import are gone, so there is no cast and no unmatched route with `signin` or `all` on. `afterStory(true)` and `afterSignInAttempt(…, 'onboarding')` stay in the model for 1C-T9.
+  - **m1:** a test for each of the seven guards no test pinned (the review's RV1 to RV7): a later fresh sign-in never reuses an earlier answer; `TermsGate` reads `/v1/me` one at a time, and a `policy_required` answer during a read brings one more read; a double tap on "Send the code" sends one code; the session-ended email button codes the account's own address; Link is offered only for a method this build runs; `published()` refuses a malformed list.
+  - **m3:** "Records waiting to send" is marked `// DRAFT` (no board shows it), and the terms step's title is `tc('Our promises')`, today's approved copy (`redesignOurPromises`), so `DRAFT_TH` no longer drafts it. `DRAFT_TH` still has 99 lines: 71 marked DRAFT and 28 board lines.
+  - **m2 and m4** joined the owner's list above (the account-unavailable variant, and K24's terms box). The controller records the nits n1 to n5.
+- **Files:** `apps/app/src/screens/redesign/signin/SessionEndedScreen.tsx` (R98's other way, the test ids), `draftCopy.ts` (the new line, the DRAFT mark, "Our promises" out), `TermsScreen.tsx` (`tc('Our promises')`), `apps/app/src/screens/redesign/account/OnboardingScreen.tsx` (R99), `apps/app/src/dev/catalogue/account/signinSections.tsx` (the new section); tests: `SessionEndedScreen.render.test.tsx` (3 new cases and one new check), `useFreshSignIn.render.test.tsx`, `TermsGate.render.test.tsx`, `EmailCodeScreen.render.test.tsx`, `DevicesScreen.render.test.tsx` (1 new case each), `OnboardingScreen.render.test.tsx` (1 new case, R99's; the end-at-sign-in case loses its last part, which expected a session to go to `/onboarding/reminder`), `apps/app/src/spend/v1/policies.test.ts` (1 new case); this receipt.
+- **RED to GREEN:** with the new tests on `5e8b70e`'s code: render (the `signin` folder and OnboardingScreen) `Test Files 2 failed | 6 passed (8)`, `Tests 3 failed | 66 passed (69)`: the two R98 cases ("Use another way" not offered) and the R99 case (no reminder step), 3 `TestingLibraryElementError`, none a missing module; unit (four files) `tests 37`, `pass 37` (RV7's case passes there; its RED is mutant RV7). With the fix: render `Tests 69 passed (69)`, unit `tests 37`, `pass 37`, catalogue (`signin`) `Tests 50 passed | 512 skipped (562)`.
+- **Mutation check:** the fix round's runner (`mutants.py`), 15 mutants, each applied, run against its focused tests, required to fail its named cases, and restored (SHA-256 checked): RV1 to RV7 (the review's), N1 to N3 (R98's other way: never offered, offered beside another main method, sent to the account's own address), K1 (the new section's test id), Q1 and Q2 (R99: a session's story end goes to the missing route, or to sign-in), C1 and C2 (the terms title back on the draft hook, the new line without Thai). 15 killed, 0 survived.
+- **Gate** (worktree root): `typecheck:app` exit 0; `typecheck:routes` exit 0; `test:app` `tests 34`, `pass 34`; `test:unit` `tests 912`, `pass 912` (911 + 1); focused render `Tests 69 passed (69)`, catalogue (`signin`) `Tests 50 passed | 512 skipped (562)`; `test:render` (full, once) `Test Files 102 passed (102)`, `Tests 1812 passed (1812)` (1802 + 10: 8 new cases and 2 for the new section); `export:web` exit 0, `(4788 modules)`; `git diff --check` clean.
+- **SKIPPED:** the owner's E2 screenshots, as above (now 23 sections); the edge, API and database suites (no such code changed).
+- **Notes for later tasks:**
+  - 1C-T9 (this replaces the first round's note about the cast): add `/onboarding/reminder`, `SignInScreen`'s `from=onboarding` handling and the switch in `OnboardingScreen`'s `endStory` (a session goes to `afterStory(true)` instead of today's reminder step) in one change. Until then, with the `signin` area on, a first run without a session skips the reminder question, because today's `SignInScreen` ignores `from`.
+  - 1C-T9: the session-ended screen's other ways have test ids (`session-ended-other-ways`, `session-ended-way-<method>`, `session-ended-way-email-other`).
```

## Appendix D: the commit message (`PL/commit-msg.txt`)

```
Let the session-ended draft reach another account and drop the onboarding route cast

Review fixes for the 1C-T8 drafts. R98: when the session-ended screen's
main button is the email code to the account's own address, "Use another
way" also offers an email code to another address, so a failure always
has another way and another account can sign in, even on a build that
offers only the email code; a catalogue section shows it for E2. R99:
nothing goes to /onboarding/reminder before 1C-T9 adds the route, so a
session keeps today's reminder step and the cast is gone. New tests pin
seven guards the review found unpinned, the terms title uses its
approved copy, and the receipt's E2 list gains two owner questions.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

## Appendix E: the planner's proof (in `PL/proof`)

On a `git archive` of `5e8b70e` (`PL/tree`, with the worktree's root `node_modules` linked and its own `apps/app/node_modules` holding only the `@better-auth` link, so Vitest's cache stays in the planner's folder):

- `red-*.log`: the 7 test files on `5e8b70e`'s code (`PL/red`): typecheck `rc=0`; render `Test Files 2 failed | 6 passed (8)`, `Tests 3 failed | 66 passed (69)`, three `TestingLibraryElementError`, no missing module; unit `tests 37`, `pass 37`.
- `green-*.log` and `catalogue.log`: with the fix, render `Tests 69 passed (69)`, unit `tests 37`, `pass 37`, catalogue `Tests 50 passed | 512 skipped (562)`.
- `mutants.out` and `mutant-logs/`: 15 of 15 `KILLED`, `restored=True`, `rc=0`; every kill an assertion or a missing element, none a syntax or module error.
- `gate-*.log` and `gate-status.txt`: typecheck:app and typecheck:routes `rc=0`; test:app 34; test:unit 912; render 102 files and 1812 tests; export:web 4788 modules.
- The diffs in `PL/diffs` turn `PL/orig` into `PL/real` exactly with `git apply`.
