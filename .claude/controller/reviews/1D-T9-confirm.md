# Confirming review: 1D-T9 fix round (M1, m1, m2, m3, m6; R94), PR #354

- Reviewer: Opus, independent confirming review, 9 Nov 2026. Read-only. Every probe ran in a scratch copy. The worktree was never edited: `git status --short` is empty, and HEAD is `03da870`.
- Commits reviewed on `p1/1d-t9-conflict-choice`, after the reviewed `7f25a65`:
  - `36adb96`, the merge of `5dbd7be`;
  - `ddc9317`, the fix;
  - `03da870`, the controller's Status-line correction.
- Spec: the first review `reviews/1D-T9.md`, the brief `briefs/1D-T9-fix.md` (P1 to P4 and the rulings), the dispatch amendments `scratch/dispatch/1D-T9-fix.prompt.md`, and the protocol.
- Integration head:
  - `git fetch` gave `4291bf7`. During the review it moved to `e52e1ae`, which changes 4 files, all under `.claude/` (controller state).
  - Since `5dbd7be`, nothing under `apps/app`, `packages/`, `package.json` or `package-lock.json` has changed (#356 is `apps/edge` only).
  - `git merge-tree --write-tree --name-only 03da870 origin/claude/p1a-vault-core` exits 0 with no conflicted paths against both heads (trees `18370dc` and `b89fd8f`). The two trees differ only in those 4 `.claude/` files.
- Scratch folder: `.claude/controller/scratch/1d-t9-confirm/`.
  - `merged/` is the merge tree `18370dc`, used for the gate.
  - `mut/` and `probe-fix/` are `03da870`. `base84/` is `84ee167`, `int/` is `4291bf7`, and `r7f/` is `7f25a65`.
  - `r7f-plus/` is `7f25a65` plus the round's two files.
  - Each copy symlinks the worktree's `node_modules`. #358's lockfile change only flips `peer` flags, so the same install serves every tree.
  - Probes are in `probes/` and their output in `probe-out/`. Mutant logs are in `mutant-logs*/`, and the gate logs are `gate-*.log`.

**VERDICT: Approved.** There is no blocker, major or minor finding.

- **M1 is fixed on every path.** A MutationObserver that records any insertion of today's `ConflictPanel` saw none on the fix, with or without a held drop, across eight scenarios. The same probe on `7f25a65` reproduces the first review's probe A, including the second `updateTransaction` sent through "Apply my change".
- **m1 and m2 are fixed with the guards the brief names.** The area-off promise holds byte for byte in 19 states against `84ee167` and against the integration head.
- **The rest checks out:** the merge resolution is a correct union, the gate and CI match the receipt, and every receipt number checks out.
- **Five nits.** None blocks the merge. Two of them predate this round.

---

## Findings

### Blocker

None.

### Major

None.

### Minor

None.

### Nits

**n1. A refused "Discard my change" followed by Restore brings the discarded choice back on the same screen, with "Yours" chosen.**

- **Cause:** `declined` is set only by `useServer` (`recordActions.ts:404`). `discardChoice` is `dropOpen` itself (`:538`).
- **Probe C3** (`probe-out/on-fix/on-C3-refused-discard-then-restore.txt`): a kept choice on a deleted record, with the diary refusing drops.
  1. Discard my change: `held=1`, and Restore is offered.
  2. Restore: `panel=yes`, with "Yours" ฿12,000.00 chosen and "Use yours" live.
- **Not a regression:** the probe gives the same result on `7f25a65` (`probe-out/on-r7f/`). With a working drop, the record shows without the panel (C4).
- **Scope:** this is m2's class, but narrower. It needs a diary write failure and a Restore in the same visit.
- **Possible fix (later task):** set `declined.current = true` in the discard path too, with a pin test.

**n2. m1's accepted narrow case (P2) leaves the harmful default in place.**

- **When:** an edit is open when the diary first shows a stale choice.
- **What happens:**
  - The re-read is correctly skipped, and the edit is kept (probe B4; X6 pins it).
  - After the save, its read offers the stale choice with "Yours" chosen, against the record just saved.
- **Probe B5:** the user saves ฿9,900.00, then sees "Yours ... changed 09:14, ฿12,000.00", with "Use yours" live. Pressing it would overwrite the save with the older change.
- **Status:** the brief accepts this ("In that narrow case the choice is shown by the read after the save, as before"). It is recorded here only so that it stays visible.
- **Possible later fix:** the first review's alternative, where an acknowledged ordinary edit settles a stored choice for the same record.

**n3. No test pins `heldHere`'s record filter.**

- **Mutant Y1:** `pendingChoices.some((choice) => choice.recordId === id)` changed to `pendingChoices.length > 0`. It survives all 111 focused tests.
- **Effect:** an extra read when another record's choice appears. There is no screen change, because `storedChoice()` filters by id.
- **The fix is correct here:** probe B7 shows `reads=1` and no panel.
- **Fix:** a one-case pin.

**n4. Carried over from the first review (M1's "related window").**

- **When:** "Use yours" is refused without a usable record (server misbehaviour only).
- **What happens:** the old receipt shows with live Edit and Delete while the record is read again. An edit begun there is replaced by the panel when the read lands.
- **Probe A8:** pressing Edit there opens the form, and the read then shows `panel=yes`.
- **Why it is still open:** the brief fixed M1 "by order alone" (P1) and did not take this window. It is unchanged since `7f25a65`, and today's panel never shows in it.

**n5. Receipt clarity: the fix round's Gate bullet does not name the tree its first figures came from.**

- **The figures:** 876; 88 files and 1664 tests. They are the planner's, from `7f25a65` merged with `ad1fe18`.
- **Why it reads wrong:** after the amended Status line, the receipt no longer names `ad1fe18`, and "(worktree root)" reads as if the figures were measured on this branch.
- **They are true:** on `7f25a65` plus the round's two files I measured `test:unit` 876 and `vitest list` 1664 in 88 files.
- **The rest of the bullet matches:** the "Run again at 5dbd7be" sentence agrees with the gate below.
- **Fix:** wording only.

### Observation (not a finding)

- **What "Use the server's" shows while it works:** the record as it was loaded before the edit (฿12,268.00 in probe A1), with live Edit and Delete. This lasts through the drop and the read after it.
- **Why it is acceptable:** today's Reload (`cancelEditing(); load()`) behaves the same way, and nothing harmful can be sent. A stale Delete or Edit is refused by version.
- **For later:** P2-T27 may want to show `editing.conflict` there instead.

---

## 1. The merge `36adb96` (controller's resolution)

- **Parents:** `7f25a65` and `5dbd7be`.
- **Recomputed merge:** `git merge-tree --write-tree 7f25a65 5dbd7be` gives tree `2bf64a7`, with exactly two conflicted paths: `featureFlags.ts` and `featureFlags.test.ts` (stages 1, 2 and 3).
- **Commit tree against that merge:** `git diff --stat 2bf64a7 36adb96^{tree}` lists only those two files. Everywhere else the commit's tree is the automatic merge.
- **`featureFlags.ts`:**
  - The union is `... | 'companion' | 'conflict' | 'wallet'`.
  - Both comment paragraphs are kept, conflict first.
  - `APPROVED` is unchanged, so neither new area is approved.
  - The rest of the file is identical to both sides.
- **`featureFlags.test.ts`:** both sides' new tests are appended, conflict first. The shared part is unchanged.
- **Check against the controller's files:** `shasum -c scratch/1d-t9-merge/SHA256SUMS` gives OK for both.
- **The tests:** `node scripts/test-unit.mjs src/config/featureFlags.test.ts` passes 11 of 11, including both `conflict is off by default...` and `the wallet area is off unless named`.
- **The pin still works:** mutant F1 (conflict approved) is killed on the merged file (`pass 10 | fail 1`, at the conflict test).
- **What the merge brought:** only #355, #359 and #358 touched `apps/app` or the lockfile since `84ee167` (`git log --first-parent`). The 28 paths equal the implementer's `step1-2-names.txt`, and none is one of this round's three files.
- **This round's files after the merge:** they still match the planner's `base/` checksums.

## 2. The fix `ddc9317` and the receipt fix `03da870`

- **Files:** exactly three, 262 insertions and 7 deletions.
  - `recordActions.ts` is byte-identical to `PL/real/` (`437fdb5a…`).
  - `RecordScreen.render.test.tsx` is byte-identical to `PL/real/` (`96dedcd7…`). It has 13 new cases after the `// C16 fix round` rule, plus `controlledDiary`. Nothing above the rule changed.
  - At `ddc9317`, the receipt is `PL/real/` plus exactly the two edits the amendments allow: `ad1fe18` becomes `5dbd7be`, and the "Run again at 5dbd7be..." sentence is added.
  - `03da870` replaces only the fix round's Status line. Its new text is accurate: #355, #359 and #358 changed `apps/app` and none of this round's files, and the conflicts were resolved by keeping both areas.
- **The hook's six edits** are exactly the brief's Edits 1 to 6.
- **Commit messages:**
  - The fix's message is the brief's text, with the Haiku trailer.
  - The merge's message keeps git's `# Conflicts:` list in its body, because `--no-edit` does not strip it. That is harmless.

## 3. M1 (focus 1)

- **The code:**
  - `useServer` runs `declined = true; cancelEditing(); await dropOpen(); void load()` (`:402-410`).
  - `sendYours`, once acknowledged, runs `setEditing(null); setNotice(null); await dropOpen()` (`:364-368`).
- **Why nothing else can show the old panel:** `dropOpen` is the only place `open` becomes null, and every one of its callers now clears the edit first:
  - load's settled path;
  - "Use yours";
  - "Use the server's";
  - Discard my change, which is offered only in the deleted and missing branches, where `editing` is already null.
- **Is it reachable?** No render can see `open === null` with `editing.conflict` set, so `RecordScreen.tsx:171`'s fallback to today's `ConflictPanel` cannot be reached in the area.
- **Probes** (`probes/AreaOnProbe.render.test.tsx`): a MutationObserver counts every insertion of `[data-testid="conflict"]` or of "Apply my change" text.

| Probe | Fix `03da870` | `7f25a65` |
| --- | --- | --- |
| A1: "Use the server's", drop held; press "Apply my change" if present | never added; during the drop: the record, `updates=1`; after: ฿13,000.00, `updates=1` | today's panel with a live Apply; pressing it sends **`[RENT,2,{amount_minor:"1200000"}]`** (`updates=2`) |
| A2: acknowledged "Use yours", drop held | never added; during the drop: the record with Edit and Delete **disabled** (busy) | today's panel |
| A3, A4: the same two without a hold (the fake answers in a microtask) | never added | added once each: a one-commit flash the old tests could not see |
| A5: reopened choice, "Use the server's", drop held | never added; during the drop: the fresh ฿13,000.00 | today's panel, Apply live |
| A6: refusal and reopen, each with a held keep | never added; during the refusal's keep: the busy edit form; during the reopen's keep: the panel | (not run) |
| A7: settled choice, drop held | never added | (not run) |
| A8: the "related window" (n4) | never added | (not run) |

- **What the probes show:** the fix closes M1 completely, including the sub-frame flash that the held-drop tests do not need.
- **The tests:** X1 and X2 (the old orders) are killed by the two new held-drop tests with assertion failures (`expected <div aria-live="polite" …> to be null`).

## 4. m1, the re-read (focus 2)

The code: `heldHere = choicesOn && phase === 'ready' && pendingChoices.some(recordId === id)`. Its effect (`:279-282`) reads again only when `heldHere` turns true and neither `openRef` nor `editingRef` is set.

What each guard needs, and what holds it:

| Guard | Evidence |
| --- | --- |
| Fires when the diary later holds a choice for this record | Test plus X3. Probe B6: the diary opens while the first read is still on its way, giving `reads=2`; the generation guard drops the first read, and the panel shows. |
| Not with the area off | Test plus X4. Area-off states 17 and 18 show `reads=1` and are identical to `84ee167`. Z1 (X4's change under my area-off probe) changes 7 states. |
| Not while a choice is open | X5. Probe B3: with the panel up, the diary locks and opens again, and `reads=1`. Probe B2: a refusal's own keep (false to true while editing) gives `reads=1`. |
| Not while an edit is in progress | Test plus X6. Probe B4: the edit stays; after Cancel the record shows with `reads=1`, and the choice waits for the next read. |
| No double read at mount | X5's test (edit mode, `transaction` once). Probe B1 (view mode): `reads=1`. Mutant Y3 (the effect declared before the load effect) is killed by 5 tests, so the order is pinned. |

- **P2's premise holds:** the real diary emits `ready` with no choices, then its choices in the next `refresh` (`spendDiary.ts:214-217`).
- **Survivors:**
  - Y1 is n3.
  - Y2 (without the phase check) is equivalent: `storedChoice()` itself requires `ready`, and the real diary's choices are empty until it is ready.

## 5. m2 (focus 3)

- **`dropOpen`:** it now asks the diary whenever a choice is open (`:226`). X7 is killed.
- **`declined`:** it stops the reload after "Use the server's" from adopting a copy the diary would not drop. X8 and X9 are killed.
- **The next open still offers it:** the test, plus probe C1's "next open: `panel=yes`".
- **The flag never re-adopts on this screen. Both cases are correct:**
  - **A new refusal on the same screen is still offered** (probe C2: "Yours" ฿9,900.00, and the next open offers it after Decide later), because `load` reads `openRef` first.
  - **A successful new edit after a refused drop shows no stale panel on this screen** (C1). The next open offers the leftover copy again, as P7 rules.
- **What is left:** the Discard path (n1).

## 6. The area-off promise and R94 (focus 4)

- **The probe:** `probes/AreaOffProbe.render.test.tsx`, run unchanged in the default environment (area off) on `84ee167`, on `4291bf7` and on `03da870`. It covers the first review's 16 states:
  - view (en, th) and edit;
  - today's conflict, then Apply my change, and today's conflict, then Reload;
  - unconfirmed, then Try again;
  - deleted with a stored choice; not found with a stored choice;
  - refused as deleted; refused without a record;
  - view, offline and edit with a stored choice;
  - History with a stored choice.
- **Three more states:**
  - the diary opens late with a choice, in view and in edit;
  - unavailable with a stored choice.
- **What each state records:** `document.body.innerHTML`, the `updateTransaction` arguments with keys as first-seen indices, the reads and restores, and the diary's keep and drop counts.
- **Result:**
  - `diff -r` shows all three outputs identical in all 19 states.
  - `keep=0 drop=0` everywhere.
  - Key reuse holds: Try again reuses K0, and Apply my change takes a new K1.
- **The probe is sensitive:** Z1 (above) proves it.
- **R94:**
  - The pin `an edit refused for a record deleted elsewhere keeps no choice (R94)` asserts four things: Restore is offered with the deleted notice, `kept` is 0, there is no Discard my change, and there is no panel.
  - Q94 (keeping a choice there) is killed with `expected [ { …(6) } ] to have a length of +0`.
  - The code is unchanged: the gone branch at `:326` still precedes the choice branch.

## 7. The tests pin the fix (focus 5)

- **Committed files:** byte-identical to `PL/real/` (section 2).
- **RED and GREEN, reproduced** in `r7f-plus/`:
  - With the new test file on `7f25a65`'s hook: `Tests 5 failed | 54 passed (59)`. These are the brief's five cases, every one an `AssertionError` or a `TestingLibraryElementError`, with 0 `Cannot find module` or `Failed to resolve`.
  - With the fixed hook: `59 passed (59)`.
- **The planner's runner, 27 rerun on `mut/`:**
  - The mutants: X1 to X9, Q4, Q6, Q7, Q9, Q11, Q94, U3, C1, C2, P1, P3, F2, E2, K1, O2, D1, F1 and H1.
  - Results: **27 killed**, every file restored by SHA-256.
  - Each kill is an assertion or `TestingLibraryElementError` in the named test, with 0 syntax, module or reference errors.
  - Note on U3: it is killed by `once use yours is acknowledged...` only. `use yours sends...` passes under it, because the reload's settled path drops the choice. The brief's table names both, but one killer suffices.
- **My mutants** (`mutants_confirm.py`, all restored by SHA-256):
  - **Y1 survived:** `heldHere` matches any record's choice. 111/111 pass (n3).
  - **Y2 survived:** `heldHere` without the phase check. This is equivalent (section 4).
  - **Y3 killed:** the re-read effect declared before the load effect. 5 tests fail with assertions.
  - **Y4 survived:** in "Use yours", `setNotice(null)` after the drop. This is benign: the edit is still closed first, so no conflict shows without the panel, and only the notice's removal moves.
  - **Z1:** a probe-sensitivity check, described above.

## 8. Gate on the merged tree (focus 6)

Run in `merged/`. Its app is identical to `03da870` and to the merge with `e52e1ae`.

| Command | Result | Expected |
| --- | --- | --- |
| `npm run typecheck:app` | exit 0 | exit 0 |
| `npm run test:app` | `tests 32, pass 32, fail 0` | 32 |
| `npm run test:unit` | `tests 882, pass 882, fail 0` (880 at `4291bf7`, plus the task's 2) | 882 |
| The six focused render files | `Test Files 6 passed (6)`, `Tests 111 passed (111)` | 111 |
| `npm run test:render -w gogospend-app` (full, once) | `Test Files 90 passed (90)`, `Tests 1694 passed (1694)`; no failures and no reruns, under a load average near 20 | 90 and 1694 |
| `npm run export:web -w gogospend-app -- --max-workers 2` | exit 0, `Exported: dist`, `Web Bundled … (4778 modules)` | exit 0 |
| `git diff --check origin/claude/p1a-vault-core...03da870` | no output | clean |

- **Render baseline:** `vitest list` at `4291bf7` gives 1649 tests in 89 files. Adding the task's 32 and this round's 13 gives 1694; the extra file is `ChoicePanel.render.test.tsx`.
- **Bundle:** `5dbd7be` bundled 4775 modules. 4775 + 3 = 4778, the task's three new source modules: `ChoicePanel.tsx`, `conflictCopy.draft.ts` and `conflictSections.tsx`. CI bundled 4778 as well.

## 9. The receipt (focus 7)

- **m6, corrected deviation 9:**
  - `vitest list` at `84ee167`: **1619 in 87 files**.
  - At `7f25a65`: **1651 in 88 files**.
  - Per file: ChoicePanel 0→5, RecordScreen 32→46, HistoryScreen 33→34, CatalogueScreen 262→268, screenReader 242→248. That is 32 cases, as written.
- **Fix-round RED, GREEN, mutants and focused count:** they match the implementer's logs and my reruns (5 failed and 54 passed; 59; 45 killed per `mutants.out`; 111).
- **The planner's 876, 88 and 1664:** true on `7f25a65` plus the round's files (n5 covers only their missing label).
- **"Run again at 5dbd7be (after #355, #359 and #358): test:app 32, test:unit 882, and the full render suite 90 files and 1694 tests":** matches section 8 exactly.
- **"the reviewer's 16-state probe gives the same output on `84ee167` and on the fix":** confirmed by section 6's equivalent probe, a superset of 19 states.

## 10. CI

`gh pr checks 354 --repo mygogocash/jotbun`: run `42550236377`, `pull_request` on `headSha 03da870`. All three checks pass:

- **"Typecheck, unit, render, build, export":** 9m48s. Its log shows `test:app` 32, `test:unit` 882, render `90 passed (90)` and `1694 passed (1694)`, and export `4778 modules`.
- **"SQL integration and ops":** 4m43s.
- **"Release image and smoke":** 52s.

GitHub reports the PR `MERGEABLE` and `CLEAN`.

VERDICT: Approved
