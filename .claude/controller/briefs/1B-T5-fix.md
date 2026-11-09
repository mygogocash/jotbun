# Brief 1B-T5 fix round: keep a rejected receipt photo's own issue, and pin the upload checks

You are the implementer (Haiku) for the 1B-T5 fix round. PR #356 (branch `p1/1b-t5-uploads`, head `d232654`) adds statement uploads and the parse pipeline. Its review (`/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1B-T5.md`) found:

- **One major.** The parse consumer turns every rejected receipt photo into `parse_failed`. It loses the code the API keeps: `image_too_large`, `image_format_mismatch`, `image_malformed`, `parse_timeout` and `parse_resource_limit`. The app has its own words for each of these.
- **Two minors.** P1's session, policy and account checks on the upload steps have no behavioural test, and nor does the `ocr` gate on image uploads.

The controller ruled (8 November 2026) that these three go in this round. The reviewer, as fix planner, wrote every file below and proved it in a scratch copy of `d232654`:

- **RED:** the 5 image-code cases fail on `d232654`.
- **GREEN:** with the fix.
- **Mutants:** 11 of 11 killed.
- **Gate:** on `d232654` merged with the integration head `a88fc84`.

Do exactly what this brief says.

Read first:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Its opening notes apply: durable files live under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/`, and only the heavy lock is under `/private/tmp`. Under **R87**, your receipt is the existing `docs/implementation/receipts/1B-T5.md`; you add a section to it and do not edit `premium-progress.md`.
2. The review, sections "Major" (M-1), "Minor" m-1 and m-2.

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1b-t5` (branch `p1/1b-t5-uploads`, head `d232654`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t5-fix`, your scratch folder. Create it with `mkdir -p`. Logs and your commit message go only there.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t5-fix-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the verified final copy of the three files this round changes (paths relative to `apps/edge`);
  - `orig/`: the same three files as they are at `d232654`;
  - `diffs/`: one unified diff per file (`orig` to `real`), quoted in Appendix A;
  - `mutants.py`: the mutant runner; `assemble.py` and `fragments/`: how `real/` was made (for reference only);
  - `SHA256SUMS`: the checksums;
  - the planner's logs: `red.log`, `green.log`, `mutants.out`, `gate-*.log`, `base-fix-workers.log`.

  If PL is missing, or a checksum in `PL/SHA256SUMS` does not match, stop: BLOCKED.
- Every shell call starts in a fresh directory, so type full paths. Git: `/usr/bin/git -C <WT> <command>`, one git command per call. Below, WT, S and PL stand for the full paths above: type them out.
- **The heavy lock** wraps every `npm run test:edge:workers`, every focused workers run and the mutant runner:
  - Before: `until mkdir /private/tmp/claude-501/jotbun-heavy.lock 2>/dev/null; do sleep 20; done`.
  - After, and after a failure too: `rmdir /private/tmp/claude-501/jotbun-heavy.lock`.
  - Never remove a lock you did not take.
- **FOCUSED** (run from `WT/apps/edge`, under the lock):
  `cd WT/apps/edge && npx vitest run --config vitest.workers.config.ts --reporter=verbose test/workers/imports-intake.test.ts test/workers/imports-parse.test.ts`
- **Docker is stopped and must stay stopped.** `npm run test:edge:db` is recorded **SKIPPED** (CI runs it).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.

## Scope

| File (under `apps/edge`) | Change |
| --- | --- |
| `src/background/parse-consumer.ts` | `checkedParse`: one new line keeps a rejected record as it is (its own issue, no image); the doc comment is rewritten. Nothing else changes. |
| `test/workers/imports-intake.test.ts` | Imports gain `PolicyVersionDto`, `VaultCall`, `VaultReply`, `VaultRouteId`, `TINY_JPEG`, `vaultExec` and `TEST_POLICIES`. One new `describe` with 7 cases goes after the last `describe`, before the `bytesOf` helper. |
| `test/workers/imports-parse.test.ts` | One new `describe` with 6 cases (an `it.each` of 5 and one `it`) at the end of the file. No import changes. |
| `docs/implementation/receipts/1B-T5.md` | A new section at its end (Step 7). |

Nothing else. No shared file, no package, no lockfile.

**Why the fix reads as it does.** The API checks a parse in `previewFromOutcome` (`apps/api/src/imports/parse-outcome.ts`). There, a failed result returns its rejected record at line 142, before line 146 looks for an image. The plan's Step 5.4 likewise re-checks "a `parsed` reply with an image". So:

- A rejected record is kept as it is. The parse server always sends it with `image: null`, and if one ever came with an image, the image is dropped, since a rejected preview stores none.
- A readable record still goes through every image check, the presence check included, as the API's line 146 does for a successful result. A readable photo reply that lost its image stays `parse_failed`. The sixth new parse case pins this.

## The new cases

In `imports-parse.test.ts`, `describe('1B-T5 fix round: a rejected receipt photo keeps its own issue, as the API records it')`:

1. `a photo over 20 MP is stored with its own issue, never parse_failed` (`image_too_large`)
2. `a photo that is not the format it claims is stored with its own issue, never parse_failed` (`image_format_mismatch`)
3. `a photo the image child cannot decode is stored with its own issue, never parse_failed` (`image_malformed`)
4. `a photo whose child was killed at its deadline is stored with its own issue, never parse_failed` (`parse_timeout`)
5. `a photo whose child went past its memory budget is stored with its own issue, never parse_failed` (`parse_resource_limit`)
6. `a readable photo reply without its image is still the rejected preview parse_failed`

Cases 1 to 5 are one `it.each`. Each uploads a JPEG and has the fake parser answer exactly what the parse server answers for that outcome (`serverReply('jpeg', outcome)`, which runs the API's `previewFromOutcome`). The case first asserts that reply carries the code. It then asserts the stored preview is `rejected` with that code, no candidates, no image and no object under `import_image/`, and the import reads `parsed` after one attempt.

In `imports-intake.test.ts`, `describe('1B-T5 fix round: the upload steps keep the API session and policy checks (P1), and an image needs ocr (P11)')`. Each step goes straight to `UserVault#call` through a local `stepCall`, as `vaultSession` sends it.

7. `after sign-out the four cleanup steps still run; begin, finish and the status read are refused`: after `POST /v1/me/logout`:
   - refused 401 `SESSION_REQUIRED`: `begin`, `finish` and `imports.status`;
   - still running: `reservePart`, `bytesRetry`, `abort` (which hands back both part keys) and `discarded`;
   - the upload ends `failed`/`session_ended` with no name, and no live object is left.
8. `a terms version the account has not accepted refuses begin and finish; reservePart still runs`: with terms version 2 published, `begin` and `finish` answer 403 `POLICY_ACCEPTANCE_REQUIRED`, and `reservePart` still gives `part-0000`.
9. `in a deleting account reservePart gives no key, begin and finish are refused, and abort still cleans up`, with `account_state` set to `deleting` (§6.12, deletion step 2):
   - `reservePart` answers `{ key: null }`;
   - `begin` and `finish` answer 403 `ACCOUNT_UNAVAILABLE`;
   - `abort` hands back the one reserved key;
   - `parseSource` skips.
10. `another account's session reaches no upload step of this vault`: all six steps, sent with another account's claims, answer 500 (`VaultOwnerMismatch`), and nothing changes.
11. `an erased vault refuses every upload step, anySession or not`: after `erase()`, all six steps answer 403 `ACCOUNT_UNAVAILABLE`.
12. `after sign-out an upload is refused at begin and records nothing`: over HTTP, 401 `SESSION_REQUIRED`, no `import_uploads` row and nothing in quarantine.
13. `while ocr is paused an image upload is 503 with nothing recorded, and a CSV is still accepted`: config pauses `ocr` with `retry_after_seconds` 120. The JPEG upload answers `[503, 'OCR_PAUSED', 120]` and records nothing; a CSV is then 202.

Cases 7 to 13 and case 6 pass on `d232654`, because the code they pin is right there (the review's probes showed it). Their RED is the mutation check: each is the case a mutant of its guard fails (Step 5).

---

## Step 0: Check the folders

1. `cd PL && shasum -a 256 -c SHA256SUMS`. Expected: 10 lines, every one `OK`. Anything else: BLOCKED.
2. `mkdir -p S`.
3. `/usr/bin/git -C WT status --short`. Expected: no output.
4. `/usr/bin/git -C WT rev-parse --short HEAD`. Expected: `d232654`.

## Step 1: Sync and install

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`.
2. `/usr/bin/git -C WT diff --stat a88fc84 origin/claude/p1a-vault-core -- apps/edge packages`. Expected: no output (the head is `a88fc84`, or later with no change under `apps/edge` or `packages`). If it lists files, record them. If it lists any of the three files in the Scope table, stop: BLOCKED. Otherwise carry on, and expect the workers count in Step 6 to differ by what those files add; say so in the receipt.
3. `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a clean merge (the planner's `git merge-tree d232654 a88fc84` is clean). It brings:
   - #352 (1A-T9): `apps/edge/src/vault/reads/sync.ts`, `test/workers/sync.test.ts`, `test/workers/summary.test.ts`, one new case in `test/vault-route-coverage.test.ts`, the parity test support and `receipts/1A-T9.md`;
   - #355 (P2-T19, `apps/app`);
   - #357 (an `apps/api` parser spec and its receipt).

   Any conflict: BLOCKED.
4. `/usr/bin/git -C WT rev-parse --short HEAD`. Record the merge commit.
5. `test -d WT/node_modules || (cd WT && npm ci --ignore-scripts --no-audit --no-fund)`, then `test -d WT/apps/edge/node_modules || (cd WT && npm run install:edge)`. Neither may change a lockfile.
6. Check the three files are as the planner found them: `cd WT/apps/edge && shasum -a 256 src/background/parse-consumer.ts test/workers/imports-intake.test.ts test/workers/imports-parse.test.ts`. Each must equal its `orig/` line in `PL/SHA256SUMS`:
   - `3f35be87…` for `parse-consumer.ts`;
   - `cda76cb9…` for `imports-intake.test.ts`;
   - `5f8d88cf…` for `imports-parse.test.ts`.

   Any difference: BLOCKED.

## Step 2: The new tests (RED)

1. `cp PL/real/test/workers/imports-intake.test.ts WT/apps/edge/test/workers/imports-intake.test.ts` and `cp PL/real/test/workers/imports-parse.test.ts WT/apps/edge/test/workers/imports-parse.test.ts`.
2. `cd WT && npm run typecheck:edge`. Expected: exit 0. Typecheck covers `test/`.
3. Under the lock: FOCUSED, saving the output to `S/red.log`. Expected:
   - `Test Files  1 failed | 1 passed (2)` and `Tests  5 failed | 89 passed (94)`.
   - The 5 failures are cases 1 to 5 (`grep -E "^ *×" S/red.log`). Each is an `AssertionError` whose diff is the stored `issues`: expected the code, received `"[\"parse_failed\"]"`.
   - `grep -cE "^(TypeError|ReferenceError|RangeError|SyntaxError|ObjectStoreError|Error):" S/red.log` prints `0`, and `grep -c AssertionError S/red.log` prints `5`.
   - Cases 6 to 13 pass.

## Step 3: The fix (GREEN)

1. `cp PL/real/src/background/parse-consumer.ts WT/apps/edge/src/background/parse-consumer.ts`.
2. `cd WT && npm run typecheck:edge`. Expected: exit 0.
3. Under the lock: FOCUSED, saving to `S/green.log`. Expected: `Test Files  2 passed (2)`, `Tests  94 passed (94)`. The stderr event lines are exactly:
   - `parse_consumer_failed` 3 times and `parse_message_malformed` once, as before;
   - `vault_owner_mismatch` 6 times and `vault_call_failed` 6 times, from case 10.

   Check with `grep -o '{"level"[^}]*}' S/green.log | sort | uniq -c`.
4. `cd WT/apps/edge && shasum -a 256 src/background/parse-consumer.ts test/workers/imports-intake.test.ts test/workers/imports-parse.test.ts > S/green-sums.txt`. Each line must equal its `real/` line in `PL/SHA256SUMS`:
   - `0c3b916c…` for `parse-consumer.ts`;
   - `bfb78218…` for `imports-intake.test.ts`;
   - `8b0bbd55…` for `imports-parse.test.ts`.

## Step 4: Before the mutants

`cd WT/apps/edge && shasum -a 256 src/background/parse-consumer.ts src/vault/user-vault.ts src/vault/session.ts src/vault/files/intake.ts src/v1/files/uploads.ts > S/before-mutants.txt`.

## Step 5: Mutation check

Under the lock: `python3 -I PL/mutants.py WT/apps/edge S > S/mutants.out 2>&1` (full paths). The runner:

- applies each mutant (one or two exact edits);
- runs FOCUSED;
- restores every file byte for byte;
- prints `KILLED` or `SURVIVED` with the failing cases;
- exits 1 if a required case still passes or a restore differs.

Expected: exit 0, and 11 lines `KILLED ... restored=True`. Then:

- `cd WT/apps/edge && shasum -a 256 -c S/before-mutants.txt`: all `OK`.
- `/usr/bin/git -C WT status --short`: only the three Scope files modified.

| Mutant | File | Change | Must fail (planner's run) |
| --- | --- | --- | --- |
| F1 | `parse-consumer.ts` | the new rejected line removed: the old `checkedParse`, where the presence check at the old line 88 decides alone | cases 1 to 5 (5 failed) |
| F2 | `parse-consumer.ts` | the presence check runs only for an image on a table format | case 6 (1 failed) |
| G1 | `user-vault.ts` | `begin` alone skips the session check (`anySession` also true for `imports.begin`) | cases 7 and 12 (4 failed: also 8 and 9, since `begin` then skips policy and account checks too) |
| G2 | `user-vault.ts` | the upload steps skip the policy check (`begin` and `finish` too) | case 8 (1 failed) |
| G3 | `user-vault.ts` | the policy is checked on every step (`&& !anySession` removed from the policy line) | case 8 (1 failed) |
| G4 | `user-vault.ts` | the session is checked on every step (`if (!anySession)` removed) | case 7 and `an upload whose session ended while it streamed is not accepted and leaves nothing` (3 failed: also case 9) |
| G5 | `intake.ts` | `reserveUploadPart` ignores the account status | case 9 (1 failed) |
| G6 | `user-vault.ts` | the `anySession` steps skip `ensureAccount` (the owner check) | case 10 (1 failed) |
| G7 | `user-vault.ts` and `session.ts` | an erased vault's two refusals both ignored: the `erased` flag in `call()` and the `deleted` marker in `ensureAccount`. Either one alone refuses with 403, so the pair is one mutant; the vault then answers 500 for an owner mismatch, not 403. | case 11 (1 failed) |
| G8 | `uploads.ts` | an image upload skips the `ocr` gate | case 13 (1 failed) |
| G9 | `uploads.ts` | the `ocr` gate holds every format | case 13 (1 failed) |

Any `SURVIVED` or `NOT APPLIED`: BLOCKED, with its log (`S/mutant-logs/<label>.log`).

## Step 6: The gate

From `WT`, in order, saving each output under `S/`:

1. `npm run typecheck:edge`. Expected: exit 0.
2. `npm run test:edge`. Expected: exit 0; `Test Files  14 passed (14)`, `Tests  174 passed (174)` (#352 added one node case; this round adds none).
3. Under the lock: `npm run test:edge:workers`. Expected: exit 0; `Test Files  24 passed (24)`, `Tests  488 passed | 3 todo (491)`.
   - The arithmetic: `d232654` has 473 passed and 3 todo; #352 adds 2 sync cases (475); this round adds 13 (488).
   - The planner's run on `d232654` with the fix and no merge gave `486 passed | 3 todo`.
   - If `sync.test.ts` times out under load, rerun that file alone and record both runs.
4. `npm run build:edge`. Expected: exit 0, and `grep -c StatementParser WT/apps/edge/dist/jotbun_vault/wrangler.json` prints a number above 0.
5. `npm run test:edge:db`: **SKIPPED**. Docker is stopped by the controller's order; CI's database job runs it.
6. `/usr/bin/git -C WT diff --check` before the commit, and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after it. Expected: no output.

## Step 7: Receipt

Append this section to the end of `WT/docs/implementation/receipts/1B-T5.md`, with your own merge SHA, logs and counts where the brackets are. Keep the house style, change nothing above it, and do not touch `premium-progress.md`:

```markdown
## Fix round (8 November 2026): a rejected receipt photo keeps its own issue; the upload checks pinned

- **Review:** `controller/reviews/1B-T5.md`. Its major (M-1) and minors m-1 and m-2 are fixed here by the controller's ruling; m-3, m-4, the nits and the 1B-T11 alarm note are in `controller/followups.md`.
- **Sync:** merged `origin/claude/p1a-vault-core` (`a88fc84`) as `[merge SHA]`, bringing #352 (1A-T9: `src/vault/reads/sync.ts` and its tests), #355 (app) and #357 (an API parser spec). No conflict.
- **M-1, the fix:** `checkedParse` in `src/background/parse-consumer.ts` now keeps a rejected record as it is, with its own issue and no image. A rejected receipt photo is stored as the API stores it (`image_too_large`, `image_format_mismatch`, `image_malformed`, `parse_timeout`, `parse_resource_limit`), not `parse_failed`. This matches the API's `previewFromOutcome`, which returns a failed result's rejected record before it looks for an image (`parse-outcome.ts:142-146`), and the plan's Step 5.4, which re-checks "a `parsed` reply with an image". A readable reply still goes through every image check, the presence check included.
- **Tests:** 13 new cases, 81 to 94 in the two files.
  - `imports-parse.test.ts`: the five image codes through a JPEG upload, and `a readable photo reply without its image is still the rejected preview parse_failed`.
  - `imports-intake.test.ts`, P1 through `UserVault#call`:
    - after sign-out, the four cleanup steps run while begin, finish and the status read are refused;
    - a terms version not accepted refuses begin and finish while reservePart runs;
    - a deleting account;
    - another account's session;
    - an erased vault.
  - `imports-intake.test.ts`, over HTTP: an upload after sign-out records nothing, and while `ocr` is paused an image upload is 503 with nothing recorded (P11) while a CSV is accepted.
- **RED to GREEN** (focused, under the heavy lock): RED with the new tests on the old consumer, `Tests 5 failed | 89 passed (94)`, the five image-code cases, all `AssertionError` on the stored `issues` (`parse_failed` received). GREEN, `Tests 94 passed (94)`. The eight other new cases pass on both: they pin code that was already right, and the mutants below are their RED.
- **Mutants:** 11 of 11 killed, every file restored (`shasum -c` OK):
  - F1, the old `checkedParse` (the line at the old parse-consumer.ts:88 decides alone): the five image-code cases.
  - F2, the presence check only for an image on a table format: the readable-photo case.
  - G1, begin skips the session: the sign-out cases (and the policy and deleting cases).
  - G2, the upload steps skip the policy: the terms case.
  - G3, the policy on every step: the terms case.
  - G4, the session on every step: the sign-out case and `an upload whose session ended while it streamed ...`.
  - G5, reservePart ignores the account status: the deleting case.
  - G6, the anySession steps skip ensureAccount: the other-account case.
  - G7, the erased flag and the deleted marker both ignored: the erased case.
  - G8, no `ocr` gate: the ocr case.
  - G9, the `ocr` gate for every format: the ocr case.
- **Gate:**
  - `typecheck:edge`: exit 0.
  - `test:edge`: `Test Files 14 passed (14)`, `Tests 174 passed (174)`.
  - `test:edge:workers` (under the heavy lock): `Test Files 24 passed (24)`, `Tests 488 passed | 3 todo (491)`; 473 at `d232654`, plus 2 from #352, plus 13 here.
  - `build:edge`: exit 0.
  - `git diff --check`: clean.
  - `test:edge:db`: **SKIPPED**, Docker stopped (CI runs it).
- **Note for 1B-T10:** `import_previews.issues` now holds a rejected photo's own code; 1B-T10 serves it as it is (through `jsonbOrder`, R92).
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/edge/src/background/parse-consumer.ts apps/edge/test/workers/imports-intake.test.ts apps/edge/test/workers/imports-parse.test.ts docs/implementation/receipts/1B-T5.md`.
2. `/usr/bin/git -C WT status --short`. Expected: nothing unstaged or untracked.
3. Write `S/commit-msg.txt` with exactly:
   ```
   Keep a rejected receipt photo's own issue and pin the upload checks

   The parse consumer turned every rejected receipt photo into
   parse_failed, losing the code the API keeps (image_too_large,
   parse_timeout and the rest). A rejected record now passes through as
   the API's previewFromOutcome leaves it. New tests pin the session,
   policy and account checks on the upload steps and the ocr gate on
   image uploads.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-msg.txt` (full path).
5. `/usr/bin/git -C WT status --short` must print nothing. Do not push.

## Your final message

As the protocol says:

- `STATUS: DONE`, or `STATUS: BLOCKED` with the blocker, on the first line;
- the merge SHA and the fix commit SHA;
- the files changed;
- the RED and GREEN counts;
- the 11 mutants, each killed by what;
- each gate command with its result and counts;
- SKIPPED items;
- anything the reviewer should look at first: the `checkedParse` line, and the G7 pair.

---

## Appendix A: the edits (unified diffs, `orig/` at `d232654` to `real/`)

For reading only; Steps 2 and 3 copy the verified files. The full diffs are in `PL/diffs/`.

### `src/background/parse-consumer.ts`

```diff
@@ -77,12 +77,17 @@
 const REJECTED: PreviewRecord = { preview: { status: 'rejected', layout: null, issues: ['parse_failed'], image: null, header_fingerprint: null }, candidates: [] }
 
 /**
- * A `parsed` reply checked again, as the API's worker does: an image comes
- * exactly with an image format, its bytes are that format by their magic,
- * at most the upload cap, and its own header gives the size the parser claimed
- * with no metadata. Anything else is the rejected preview, with no image.
+ * A `parsed` reply checked again, as previewFromOutcome checks a parse
+ * (apps/api/src/imports/parse-outcome.ts): a rejected record is kept as it is,
+ * with its own issue (image_too_large, parse_timeout, ...), and never stores an
+ * image. A readable one has an image exactly for an image format, its bytes
+ * are that format by their magic, at most the upload cap, and its own header
+ * gives the size the parser claimed with no metadata. Anything else is the
+ * rejected preview parse_failed, with no image.
  */
 export function checkedParse(format: ParseFormat, reply: Extract<ParseServiceReply, { kind: 'parsed' }>): { record: PreviewRecord; image: { format: ImageFormat; bytes: Buffer; width: number; height: number } | null } {
+  // The API rejects before it looks for an image (parse-outcome.ts, recordFor), so a rejection keeps its code.
+  if (reply.record.preview.status === 'rejected') return { record: reply.record, image: null }
   const expectsImage = (IMAGE_FORMATS as readonly string[]).includes(format)
   const image = reply.image
   if (expectsImage !== (image !== null)) return { record: REJECTED, image: null }
```

### `test/workers/imports-intake.test.ts`

Imports (four hunks):

```diff
-import type { ImportJobDto } from '@gogospend/contracts'
+import type { ImportJobDto, PolicyVersionDto } from '@gogospend/contracts'
@@
 import { MAX_UPLOADS_PER_ISOLATE, uploadsInFlight } from '../../src/v1/files/uploads'
+import type { VaultCall, VaultReply, VaultRouteId } from '../../src/v1/protocol'
 import { VAULT_STEP_ROUTES } from '../../src/v1/routes'
@@
   MiB,
+  TINY_JPEG,
   ageSeeds,
@@
   uploadRowOf,
+  vaultExec,
   vaultIdOf,
@@
-import { member, startV1, vaultOf } from './support/v1-client'
+import { TEST_POLICIES, member, startV1, vaultOf } from './support/v1-client'
```

The new `describe`, inserted between the closing `})` of `describe('1B-T5: the vault side of uploads', ...)` and the `bytesOf` helper's doc comment. It is `PL/fragments/intake-tests.ts`, verbatim:

```ts
describe('1B-T5 fix round: the upload steps keep the API session and policy checks (P1), and an image needs ocr (P11)', () => {
  /** One upload step sent straight to the person's vault, as vaultSession sends it: a later step of a current_policy request unless the options say otherwise. */
  const stepCall = (
    user: TestUser,
    route: VaultRouteId,
    body: unknown,
    opts: { charge?: VaultCall['charge']; access?: VaultCall['access']; policies?: PolicyVersionDto[]; as?: TestUser; params?: Record<string, string> } = {},
  ): Promise<VaultReply> => {
    const who = opts.as ?? user
    return vaultOf(user).call({
      route,
      access: opts.access ?? 'current_policy',
      charge: opts.charge ?? 'step',
      claims: { accountId: who.sub, sessionId: who.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios' },
      policies: opts.policies ?? TEST_POLICIES,
      params: opts.params ?? {},
      query: {},
      headers: {},
      body,
    })
  }
  const SHA = 'ab'.repeat(32)
  const beginBody = (jobId: string, intakeToken: string) => ({ jobId, intakeToken, fileName: 'statement.csv', declaredType: 'text/csv', declaredBytes: null })
  const finishBody = (jobId: string, intakeToken: string, keys: string[]) => ({ jobId, intakeToken, format: 'csv', bytes: keys.length, sha256: SHA, parts: keys.map((key, index) => ({ index, key, bytes: 1, sha256: SHA })) })
  const keyOf = (reply: VaultReply): string => String((reply as { body: { key: string | null } }).body.key)

  it('after sign-out the four cleanup steps still run; begin, finish and the status read are refused', async () => { ... })
  it('a terms version the account has not accepted refuses begin and finish; reservePart still runs', async () => { ... })
  it('in a deleting account reservePart gives no key, begin and finish are refused, and abort still cleans up', async () => { ... })
  it("another account's session reaches no upload step of this vault", async () => { ... })
  it('an erased vault refuses every upload step, anySession or not', async () => { ... })
  it('after sign-out an upload is refused at begin and records nothing', async () => { ... })
  it('while ocr is paused an image upload is 503 with nothing recorded, and a CSV is still accepted', async () => { ... })
})
```

(The case bodies are in `PL/fragments/intake-tests.ts` and `PL/real/test/workers/imports-intake.test.ts`; they are described above under "The new cases".)

### `test/workers/imports-parse.test.ts`

Appended at the end of the file; it is `PL/fragments/parse-tests.ts`, verbatim:

```ts
describe('1B-T5 fix round: a rejected receipt photo keeps its own issue, as the API records it', () => {
  const usage = { max_rss_kb: 1024, cpu_ms: 5 }

  it.each<[string, ParserRunOutcome, string]>([
    ['a photo over 20 MP', { kind: 'result', result: { ok: false, code: 'image_too_large', usage } }, 'image_too_large'],
    ['a photo that is not the format it claims', { kind: 'result', result: { ok: false, code: 'image_format_mismatch', usage } }, 'image_format_mismatch'],
    ['a photo the image child cannot decode', { kind: 'result', result: { ok: false, code: 'image_malformed', usage } }, 'image_malformed'],
    ['a photo whose child was killed at its deadline', { kind: 'timeout' }, 'parse_timeout'],
    ['a photo whose child went past its memory budget', { kind: 'memory_limit' }, 'parse_resource_limit'],
  ])('%s is stored with its own issue, never parse_failed', async (_label, outcome, code) => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const reply = serverReply('jpeg', outcome)
    // What the parse server answers (previewFromOutcome in apps/api/src/imports/parse-outcome.ts): the rejected record with its own code, and no image.
    expect(reply).toMatchObject({ kind: 'parsed', image: null, record: { preview: { status: 'rejected', issues: [code] } } })
    expect(await deliver(user, jobId, fakeParser(reply).parser)).toMatchObject({ acked: true, retried: false })
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'rejected', layout: null, issues: JSON.stringify([code]), candidate_count: 0, image_key: null, image_attachment_id: null })
    expect(await candidatesOf(user, jobId)).toEqual([])
    expect(await imagesOf(user)).toEqual([])
    expect(await jobOf(user, jobId)).toEqual({ parse_state: 'parsed', parse_attempts: 1, parse_failure: null })
  })

  it('a readable photo reply without its image is still the rejected preview parse_failed', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const receipt = receiptReply(TINY_JPEG) as Extract<ParseServiceReply, { kind: 'parsed' }>
    expect(receipt.record.preview.status).toBe('ready')
    expect(await deliver(user, jobId, fakeParser({ ...receipt, image: null }).parser)).toMatchObject({ acked: true })
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'rejected', layout: null, issues: '["parse_failed"]', candidate_count: 0, image_key: null })
    expect(await imagesOf(user)).toEqual([])
  })
})
```

## Appendix B: the planner's proof (in PL)

- `red.log`: on `d232654` with the new tests, `Tests 5 failed | 89 passed (94)`, cases 1 to 5, 5 `AssertionError`s, error-prefix grep 0.
- `green.log`: with the fix, `Tests 94 passed (94)`; events `parse_consumer_failed` 3, `parse_message_malformed` 1, `vault_owner_mismatch` 6, `vault_call_failed` 6.
- `mutants.out`: F1, F2 and G1 to G9 all `KILLED`, `restored=True`, exit 0.
- `gate-typecheck.log`, `gate-node.log` (174), `gate-workers.log` (`24 passed`, `488 passed | 3 todo (491)`) and `gate-build.log`: on the tree of `git merge-tree d232654 a88fc84` (`db29702`) with the three files.
- `base-fix-workers.log`: `d232654` with the fix and no merge, `486 passed | 3 todo (489)`.
