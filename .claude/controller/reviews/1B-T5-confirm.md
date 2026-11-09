# Confirming review 1B-T5 fix round: a rejected receipt photo keeps its own issue; the upload checks pinned (PR #356)

- **Commits:** `be2f8f8` (merge of the integration head `4702c20`) and `020aa84` (the fix) on `p1/1b-t5-uploads`, on top of the reviewed `d232654`. The range `origin/claude/p1a-vault-core...020aa84` has merge base `4702c20`; the integration head is now `5dbd7be`.
- **Reviewer:** Opus, the independent confirming reviewer, read-only. The first confirming reviewer's notes and the first reviewer's scratch folder were lost with the old machine, so everything below was measured again from scratch. Probes and mutants ran only in the scratch copy `controller/scratch/1b-t5-confirm/tree` (from `git archive 020aa84`, `node_modules` symlinked from the worktree). The heavy lock was taken for each workers run and for each mutant or probe run, and released after it (`with-lock.sh` removes only a lock it took; each `*.lock` log shows when it was taken and released). The worktree is unchanged (`git status` is empty).
- **Read:** the protocol (opening notes, R87, "Reviewers (Opus)"); the first review `reviews/1B-T5.md` in full; the brief `briefs/1B-T5-fix.md`; the planner's folder `scratch/1b-t5-fix-planner/` (its `SHA256SUMS` checks 10 of 10 OK here too); plan `### Task 1B-T5` Step 4 and Step 5 (line 469 on); the API's `parse-outcome.ts`, `parse-server.ts`, `parsers/protocol.ts`, `imports.controller.ts` and `operational-safety.spec.ts`; the edge's `parse-consumer.ts`, `statement-parser.ts`, `vault/files/parse.ts`, `vault/files/intake.ts`, `vault/user-vault.ts`, `vault/session.ts`, `v1/routes.ts`, `v1/files/uploads.ts`, `v1/log.ts` and `0001_vault_files.sql`; the receipt `docs/implementation/receipts/1B-T5.md`; `controller/followups.md`.
- **Scope:** M-1, m-1 and m-2 only. m-3, m-4 and the nits of the first review were left for later by the controller and are recorded in `followups.md`; I do not hold them against this round.

## Verdict summary

The fix is right, and it is pinned. `checkedParse` keeps a rejected record as it is (`parse-consumer.ts:90`) before the presence check (`:93`), as the API's `recordFor` returns a failed result (`parse-outcome.ts:142`) before it looks for an image (`:146`). I probed both sides of the new condition, for every format, with and without an image. A rejected photo keeps `image_too_large`, `image_format_mismatch`, `image_malformed`, `parse_timeout` or `parse_resource_limit`. A readable photo record without its image, and a readable record with any image on a table format, are still the rejected preview `parse_failed`. No image is ever stored for a rejected preview.

All 11 of the planner's mutants are killed. Of my 26, the 21 that should die are killed, including the five the controller named (the old M-1 line, R2, R38, R3, R17). The committed files are byte-identical to the planner's verified copies, the receipt's counts match what I measured, the gate is green, and CI on `020aa84` passed. There are no blockers, majors or minors, and two nits, both test gaps on code that is right today.

## Gate on `020aa84` (scratch copy)

- `npm run typecheck:edge`: exit 0 (`gate-typecheck.log`).
- `npm run test:edge`: exit 0, `Test Files 14 passed (14)`, `Tests 174 passed (174)` (`gate-node.log`).
- `npm run test:edge:workers` (under the lock): exit 0, `Test Files 24 passed (24)`, `Tests 488 passed | 3 todo (491)` (`gate-workers.log`). This is the handover's expectation: 473 at `d232654`, plus 2 from #352, plus 13 here.
- `npm run build:edge`: exit 0 (`gate-build.log`). `grep -c StatementParser dist/jotbun_vault/wrangler.json` prints 1. The queue (`max_batch_size` 1, `max_concurrency` 1, `max_retries` 100, `retry_delay` 30), the container (`max_instances` 1), the migrations (`v1-user-vault`, `v2-statement-parser`) and `dev.enable_containers: false` are as the first review recorded.
- `git diff --check origin/claude/p1a-vault-core...020aa84`: clean (exit 0, no output).
- `npm run test:edge:db`: **SKIPPED**, because Docker is stopped and stays stopped. CI ran it (below).
- **Focused files** (baseline before the mutants): `Test Files 2 passed (2)`, `Tests 94 passed (94)` (`focused-baseline.log`). The stderr event lines are exactly those the brief expects: `parse_consumer_failed` 3, `parse_message_malformed` 1, `vault_owner_mismatch` 6 and `vault_call_failed` 6.
- **The merge `be2f8f8`:** its parents are `d232654` and `4702c20`. Its tree `5ccec5d` is exactly the tree `git merge-tree --write-tree d232654 4702c20` writes, so there are no hand edits. Its diff from `d232654` equals the integration side's own diff `52632f2..4702c20` (`52632f2` is the merge base) except in one file, `test/vault-route-coverage.test.ts`. There, only the `index` line and one hunk header's offset (89 against 87) differ, because 1B-T5 edits another hunk of that file (`merge-side.diff`, `integration-side.diff`). The three files of this round are unchanged by the merge (PL/orig equals both `d232654` and `be2f8f8`).
- **Trial merge with `5dbd7be`:** `git merge-tree --write-tree --name-only 020aa84 origin/claude/p1a-vault-core` is clean (tree `f49f81a`, no conflicts). `git diff --stat 020aa84 f49f81a -- apps/edge apps/api packages scripts package.json tsconfig.json` is empty. Since `4702c20`, the integration head brought only #358 (app packages, the wallet root and `featureFlags`), the controller state, `.gitattributes` (for controller paths), app-only lockfile lines and docs (two handover notes and `receipts/P2-T2.md`). So the gate above also stands for the merged tree.
- **CI on PR #356 at `020aa84` (run 42484300065, head `020aa84`, event `pull_request`): all three checks pass.**
  - "Release image and smoke (never pushed)": pass (1m1s).
  - "SQL integration and ops (local PostgreSQL 17 container)": pass (4m37s). Its steps `test:db`, `install:edge`, `typecheck:edge`, `test:edge` (174 passed), `test:edge:workers` (`24 passed`, `488 passed | 3 todo (491)`), `build:edge` and `test:edge:db` (`9 passed`, `64 passed`) all succeeded.
  - "Typecheck, unit, render, build, export": pass (9m6s).
  - GitHub reports the PR as `MERGEABLE` and `CLEAN`, head `020aa84`.
- **Byte identity:**
  - Each committed file equals its PL/real copy (paths relative to `apps/edge`):
    - `src/background/parse-consumer.ts`: `0c3b916c…`;
    - `test/workers/imports-intake.test.ts`: `bfb78218…`;
    - `test/workers/imports-parse.test.ts`: `8b0bbd55…`.
  - The commit touches only those three files and the receipt.
  - PL holds no planner logs (no `red.log`, `green.log` or `mutants.out`), so each of their claims was re-measured here.

## Findings

### Blocker

None.

### Major

None.

### Minor

None.

### Nits

1. **The `ocr` case pins JPEG only.**
   - Case 13 (`imports-intake.test.ts:887`) uploads `image/jpeg`. Two of my mutants survive: R17b, where only JPEG needs `ocr`, and R17d, where WebP passes a paused gate.
   - The code is right. My probe "while ocr is paused PNG and WebP uploads are 503 with nothing recorded, as JPEG is" passes: each answers 503 `OCR_PAUSED`, and no row or quarantine object is left.
   - This is parity, not a regression. The API's own test (`operational-safety.spec.ts:331`) also uploads only `image/jpeg`, under the same three-format condition (`imports.controller.ts:62`).
   - Optional fix: turn case 13's photo into an `it.each` over the three image types (the probe is ready).
2. **The brief's rule for a rejected record that carries an image has no test.**
   - The rule: the record keeps its code and the image is dropped. Mutant C6 lets such a record go through the image checks, and it survives.
   - The input cannot happen:
     - The parse server never sends it. Every rejection in `recordFor` has `image: null`, and `parse-server.ts:148` builds the reply's image from that.
     - The API's `ParseFailure` (`parsers/protocol.ts:63`) carries no image at all.
     - The table refuses a rejected preview with an image (`0001_vault_files.sql:170`).
   - My probes A1 and A2 pin the behaviour if wanted: a rejected JPEG with a valid image attached keeps `image_too_large`, with no `import_image` reservation or object. A rejected CSV with an image attached keeps `parse_timeout`.

## Focus items

1. **M-1, both sides of the new condition** (`confirm-probes.test.ts`, 12 of 12 pass, `probes.log`).
   - **The line.** `parse-consumer.ts:90`, `if (reply.record.preview.status === 'rejected') return { record: reply.record, image: null }`, runs before the presence check at `:93`. This is the API's order: `recordFor` returns `rejected(code)` for a failed result at `parse-outcome.ts:142`, and only a successful result reaches the image check at `:146`. It also matches the plan's Step 5.4 ("A `parsed` reply with an image is checked again"). The status union is `'ready' | 'rejected'` (`parse-outcome.ts:28`), so `=== 'rejected'` keeps exactly the rejected records. Any other value, from a malformed reply that `isParseServiceReply` (`statement-parser.ts:30`, a shape check) lets through, still meets every image check.
   - **Side A, rejected (kept with its own code, never an image).**
     - Pure: for each of `csv`, `xlsx`, `jpeg`, `png` and `webp`, three codes, and no image, a JPEG or a PNG image, `checkedParse` returns the record it was given and `image: null`.
     - End to end:
       - A1: a JPEG upload whose reply is `image_too_large` with a valid image attached is stored `rejected`, `["image_too_large"]`, with no `image_key` and no attachment id. Nothing is under `import_image/`, no `import_image` row is in `vault_objects` (no key was reserved), and the job reads `parsed` after one attempt.
       - A2: a CSV with a `parse_timeout` reply and an image attached is stored `["parse_timeout"]`, with no image.
       - A3: a PNG `image_malformed` keeps its code, and a WebP `output_too_large` is `parse_resource_limit`. An unknown child code is `parse_failed`, because the API maps it so before the reply leaves.
     - The five committed JPEG cases (`imports-parse.test.ts:611`) cover the five codes through `serverReply`, which runs the API's own `previewFromOutcome`.
   - **Side B, not rejected (every image check still applies).**
     - A readable photo record without its image is `parse_failed` for `jpeg`, `png` and `webp` (pure), end to end for PNG and WebP (B2), and for JPEG by committed case 6 (`imports-parse.test.ts:631`).
     - A readable record with any image on a table format is `parse_failed` for `csv` and `xlsx`, with a JPEG or a PNG image (pure). End to end for a CSV, it is stored with no candidate and no image (B1).
     - A readable photo with its own image still passes, and the same reply for a PNG upload is `parse_failed` (pure).
     - So no ready photo record gets through without its image, and no code is lost.
   - **On "any image on a table format must store `parse_failed`".** This holds for every readable record. For a rejected record that carries an image, the record keeps its own code and the image is dropped (probe A for `csv` and `xlsx`, and A2). The brief chose this on purpose ("Why the fix reads as it does": "if one ever came with an image, the image is dropped"), and it follows the API's order. The first review's sketch would have stored `parse_failed` there. Neither stores an image, and the parse server never sends that reply (nit 2). Not a finding.
   - **The pass-through is bounded by the table.** Table formats already passed a rejected record through before this round (the old line 94). For a reply the parse server never sends:
     - A4: a rejected photo record with a candidate is refused by the CHECK at `0001_vault_files.sql:170`. It is retried, and after three attempts the job is failed `import_unavailable`; no preview or candidate is written.
     - A5: a rejected record with no issue is refused and retried.
2. **The new tests pin the fix.**
   - **The planner's 11** (`python3 -I PL/mutants.py`, under the lock, on the scratch copy; `planner-mutants.out`, exit 0): all `KILLED`, `restored=True`.
     - F1: the five code cases (`5 failed | 89 passed (94)`, 5 `AssertionError`s and no other error, each on the stored `issues`, expected the code and received `parse_failed`). This reproduces the receipt's RED.
     - F2: case 6.
     - G1: the policy, deleting and both sign-out cases (4 failed).
     - G2 and G3: the policy case.
     - G4: the sign-out case, the deleting case and `an upload whose session ended while it streamed …` (3 failed).
     - G5: the deleting case.
     - G6: the other-account case.
     - G7: the erased case.
     - G8 and G9: the `ocr` case.
   - **Mine: 26 mutants, 21 required.** `confirm_mutants.py`, under the lock; `confirm-mutants.out`, exit 0, all 26 `restored=True`, and the logs are in `confirm-mutants/logs/`. Every kill below is assertion failures only (`other=0`).

     | Mutant | Change | Result (failing cases) |
     | --- | --- | --- |
     | C0 | **the old M-1 line restored**: `parse-consumer.ts` replaced by `d232654`'s | KILLED, the five code cases (`5 failed \| 89 passed`) |
     | C1 | the rejected check moved after the presence check | KILLED, the five code cases |
     | C2 | a rejection kept only for a table format | KILLED, the five code cases |
     | C3 | wrong reading: any record with an issue is kept (a ready receipt has `receipt_fields_unread`) | KILLED, case 6 and 7 others (8 failed) |
     | C4 | wrong reading: any reply without an image is kept | KILLED, case 6 |
     | C5 | the presence check deleted | KILLED, case 6 |
     | R2 | **the import steps skip `assertPolicyAccepted`** (begin and finish lose the policy gate) | KILLED, the policy case |
     | R2b, R2c | finish alone, begin alone skip the policy | KILLED, the policy case |
     | R38 | **`begin` alone skips `assertSession`** (its policy check kept) | KILLED, both sign-out cases and the deleting case |
     | R38b | `finish` alone skips `assertSession` | KILLED, the sign-out, deleting and session-ended-while-streaming cases |
     | R3 | **`reserveUploadPart` ignores the account status** (the check deleted) | KILLED, the deleting case |
     | R3b | `reserveUploadPart` refuses only a `deleted` account | KILLED, the deleting case |
     | R17 | **the `ocr` gate dropped** in `uploads.ts:79` | KILLED, the `ocr` case |
     | R17c | the image gate checks `imports`, not `ocr` | KILLED, the `ocr` case |
     | V1, V2 | `begin`, `finish` marked `anySession` | KILLED (5 failed each) |
     | V3, V4, V5, V6 | `reservePart`, `abort`, `discarded`, `bytesRetry` no longer `anySession` | KILLED (5, 4, 2 and 2 failed), the sign-out case each time |

     Informational, expected to survive and surviving:
     - C6 (a rejected record that carries an image goes through the image checks): nit 2.
     - R17b and R17d (PNG or WebP outside the gate): nit 1.
     - E1 and E2 (call()'s erased flag alone, or `ensureAccount`'s deleted marker alone, ignored): either one still refuses with 403 in the same instance, which is why the brief pairs them as G7, and G7 is killed.
   - **Restores.** `shasum -a 256 -c before-mutants.sha256` is OK for all eight touched files, after the planner's runner and again after mine. The scratch tree equals `020aa84` blob for blob under `apps/edge` (183 files, none differ, no stray file; the probe file was copied in for its run and removed).
3. **The committed files and the receipt.**
   - The three code files equal PL/real (above).
   - The receipt's fix-round section matches what I measured:
     - the cases rise from 81 to 94 in the two files (baseline 94, minus 7 new intake cases and 6 new parse cases);
     - RED is `5 failed | 89 passed (94)` on the old consumer, all `AssertionError` on `issues` (F1 and C0 reproduce it);
     - GREEN is 94;
     - 11 of 11 mutants are killed, each by the cases the receipt names;
     - the gate gives 174, and `24 passed`, `488 passed | 3 todo (491)`, with 473 + 2 + 13 = 488;
     - `diff --check` is clean, and the DB suite is SKIPPED.
   - Its sync line is right: `a88fc84..4702c20` touches only `apps/app`.
   - `followups.md` holds m-3, m-4, the nits and the 1B-T11 alarm note, as the receipt says.
4. **Gate:** above, all green. `test:edge:db` is SKIPPED here and passed in CI (64 passed).
5. **Privacy and logging.**
   - The change to `checkedParse` adds no log line. The consumer still logs only through `logFailure` (`parse-consumer.ts:122,180,184`), which writes the event and the error's class name, never its message (`v1/log.ts`).
   - The focused run's stderr is only the four event lines above, from three tests, with no `Uncaught` line. The new tests log nothing of their own, so no amount, name, note or slip content appears.
   - My unreachable probes A4 and A5 make workerd print `Uncaught (in promise)` with the CHECK constraint's text and no values; this is the first review's known nit 6.

## Notes for later tasks (not findings against this round)

- **1B-T10:** `import_previews.issues` now holds a rejected photo's own code, as the receipt says. A rejected record's other fields come from the parse server as they are. The table bounds them: no candidates, no image, at least one issue. Its issue codes and `layout` are not re-checked in the vault, which was already so for table formats. 1B-T10 can serve them as stored.
- Nit 1's three-type `it.each` and nit 2's probes A1 and A2 can go to `followups.md` with the first review's m-3 list.

Scratch evidence (`/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t5-confirm/`): `gate-typecheck.log`, `gate-node.log`, `gate-workers.log`, `gate-build.log`, `focused-baseline.log`, `planner-mutants.out` and `planner-mutants/mutant-logs/`, `confirm_mutants.py`, `confirm-mutants.out` and `confirm-mutants/logs/`, `confirm-probes.test.ts`, `probes.log`, `before-mutants.sha256`, `merge-side.diff`, `integration-side.diff`, `ls-tree-edge.txt`, `with-lock.sh` and the `*.lock` logs.

VERDICT: Approved
