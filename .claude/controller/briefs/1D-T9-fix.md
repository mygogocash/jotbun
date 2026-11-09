# Brief 1D-T9 fix round: the conflict choice after its review (M1, m1, m2, m3, m6; R94)

You are the implementer for the 1D-T9 fix round. PR #354 (branch `p1/1d-t9-conflict-choice`, head `7f25a65`) adds C16's conflict choice behind the unapproved `conflict` area. The independent review (`.claude/controller/reviews/1D-T9.md`) found:

- one major: resolving a choice briefly draws today's `ConflictPanel`, whose live "Apply my change" can send the person's change after they chose the server's version;
- three minors to fix in code or tests (m1, m2, m3);
- one receipt error (m6).

The planner wrote every change below and proved it on `7f25a65` merged with `ad1fe18`:

- RED: the new tests on today's hook;
- GREEN: the fixed hook;
- all 45 mutants killed (the planner's 30, three of them rewritten, and 15 new);
- the app gate;
- the reviewer's area-off probe, which gives the same output as on `84ee167` in all 16 states.

You copy the files, verify them, run the proof again, commit, and report. Do exactly what this brief says.

## Controller rulings (8 November 2026)

- **Fixed in this round:**
  - M1;
  - m1;
  - m3 (five pinning tests);
  - m6 (the receipt's arithmetic);
  - m2 (the planner judged it small and safe; see P3).
- **m5** (sign-out erases waiting choices without counting them) becomes a follow-up task before the conflict area is approved. The controller records it. Not in this round.
- **Nits** n1 to n4: not in this round (none is a change without its own test).
- **R94:** keep the narrow reading as built.
  - A choice is kept only with a usable current record.
  - An edit refused for a record deleted elsewhere keeps nothing and shows today's deleted notice and Restore.
  - A reopen that finds a kept choice's record deleted offers Discard my change; that meets the plan's deleted bullet.
  - The broader "never lose the change" reading goes to the owner at E2 as a product question. This round changes no code for it, and adds one test pinning today's behaviour (review probe H) so that a later change is deliberate.

## Planner calls (what this brief decides, and why)

- **P1. M1 is fixed by order alone, in the hook.**
  - The cause: until `diary.dropChoice` returns, a conflict was left on screen without the panel.
  - "Use the server's" (`useServer`) now calls `cancelEditing()` before `await dropOpen()`. `cancelEditing` still sees `editing.conflict`, so P2-T6's notice rule holds.
  - An acknowledged "Use yours" (`sendYours`) now runs `setEditing(null); setNotice(null);` before `await dropOpen()`.
  - While the drop runs, the screen shows the record. After "Use yours", Edit and Delete stay disabled while busy.
  - `RecordScreen.tsx` does not change.
- **P2. m1's re-read follows the diary's choices, not its phase.**
  - The real diary emits `ready` with no choices first, and its choices with the next refresh (`spendDiary.ts` `switchTo`), so a trigger on the phase alone would miss them.
  - The hook derives `heldHere`: the area is on, the diary is ready, and it holds a choice for this record.
  - When `heldHere` changes to true, the hook calls `load()` again, unless a choice is already open on screen (`openRef`) or an edit is open (`editingRef`).
  - **An edit in progress is never replaced.** In that narrow case the choice is shown by the read after the save, as before.
  - With the area off, `heldHere` is always false, so the area-off screens do not change.
  - At mount, the first `load()` opens a stored choice synchronously, before this effect runs, so a record is never read twice.
- **P3. m2 is two small changes.**
  - `dropOpen` asks the diary to drop any open choice, not only one this screen kept. The diary may still hold an earlier copy that a re-keep failed to replace. A drop with nothing to delete is harmless, and a refusal is still swallowed (P7).
  - A per-screen `declined` flag, set by "Use the server's", stops `load` adopting the diary's copy that a refused drop left behind. The next open still offers it (P7). A choice newly refused on this screen is unaffected, because `load` reads the open choice first.
- **P4. Pins have no RED of their own.** The m3 tests, the R94 pin and m1's two guard tests (an edit in progress; the area off) pin behaviour `7f25a65` already has, so they pass there. Each one's RED is the mutant it kills (Step 4).

Read first:

1. The protocol `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. It is binding. Under R87 your receipt is `docs/implementation/receipts/1D-T9.md`, which already exists; do not edit `premium-progress.md`.
2. The review `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1D-T9.md`: M1, m1, m2, m3, m6, and probes A to L.

## Paths

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1d-t9` (branch `p1/1d-t9-conflict-choice`, head `7f25a65`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t9-fix`. Create it with `mkdir -p`. Logs and the commit message go there.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1d-t9-fix-planner`. Read it and `cp` from it; never write into it. It holds:
  - `base/`: the three files this round changes, as they are at `7f25a65`;
  - `real/`: their final versions;
  - `recordActions.diff`: `base` to `real` for the hook, for reading;
  - `mutants.py`: the runner (45 mutants);
  - `SHA256SUMS`;
  - `logs/`, `mutant-logs/` and `mutants.out`: the planner's runs;
  - `tree/`, `work/`, `probe/` and `gate/`: the planner's proof trees (`7f25a65` merged with `ad1fe18`), which you do not need.
- Every shell call starts in a fresh directory, so type full paths.
- Git: `/usr/bin/git -C WT <command>`, one git command per call.
- npm: `cd WT && npm run <script>`.
- Render tests: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- No lock is needed: no database or workers suite. Docker stays stopped.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass.

## Step 1: Sync and check the base

1. `/usr/bin/git -C WT status --short`. Expected: no output. Then `/usr/bin/git -C WT rev-parse --short HEAD`. Expected: `7f25a65`.
2. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT diff --stat 84ee167 origin/claude/p1a-vault-core -- apps/app packages package.json package-lock.json`.
   - Expected: no output; nothing the app uses has changed since the task's base.
   - The planner checked this at `ad1fe18`, which brings #352 (1A-T9), #353 (1D-T10) and #350 (parser), all outside `apps/app`.
   - If anything is listed: BLOCKED with the output.
3. `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: a clean merge. Any conflict: BLOCKED. Record the merge commit (`/usr/bin/git -C WT rev-parse --short HEAD`) and the integration head it brought (`/usr/bin/git -C WT rev-parse --short origin/claude/p1a-vault-core`).
4. `node_modules` is already installed from the first round; step 2 showed no package change, so do not reinstall.
5. Base checksums, after the merge: `cd WT && shasum -a 256 apps/app/src/screens/redesign/record/recordActions.ts apps/app/src/screens/redesign/RecordScreen.render.test.tsx docs/implementation/receipts/1D-T9.md`. Compare them with the three `base/` lines of `PL/SHA256SUMS`. Expected: all three equal.

## Step 2: The tests first (RED)

1. `cp PL/real/apps/app/src/screens/redesign/RecordScreen.render.test.tsx WT/apps/app/src/screens/redesign/RecordScreen.render.test.tsx` (full paths). `shasum -a 256` it and compare with its `real/` line in `PL/SHA256SUMS`.
   - The file gains 13 cases at its end, after a `// C16 fix round` rule, plus one helper, `controlledDiary` (a fake diary whose `dropChoice` can be held or refused, and whose `keepChoice` can be refused). Nothing above that rule changes.
2. `cd WT && npm run typecheck:app`. Expected: exit 0.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/RecordScreen.render.test.tsx > S/red-record.log 2>&1`.
   - Expected: `Test Files  1 failed (1)`, `Tests  5 failed | 54 passed (59)`.
   - The five failures, each an `AssertionError` or a `TestingLibraryElementError`:
     - `choosing the server's version never shows today's comparison while the diary drops the choice` (`expected <div aria-live="polite" …> to be null`: today's panel is drawn);
     - `an acknowledged "use yours" never shows today's comparison while the diary drops the choice` (the same);
     - `a choice the diary finds after the record has loaded is offered, against the fresh record` (no `choice-panel`);
     - `choosing the server's when the diary cannot drop the choice shows the record, and the next open offers the choice again` (no `Amount, Expense ฿13,000.00`: the panel came back);
     - `a reopened choice this phone cannot keep again still leaves the diary when the server's is chosen` (`expected [ … ] to have a length of +0 but got 1`).
   - `grep -c "Cannot find module\|Failed to resolve" S/red-record.log` prints 0.
   - The other eight new cases pass here; they pin behaviour `7f25a65` already has (P4).

## Step 3: The fix (GREEN)

1. `cp PL/real/apps/app/src/screens/redesign/record/recordActions.ts WT/apps/app/src/screens/redesign/record/recordActions.ts` (full paths). `shasum -a 256` it and compare with its `real/` line.
2. `diff -u PL/base/apps/app/src/screens/redesign/record/recordActions.ts WT/apps/app/src/screens/redesign/record/recordActions.ts`. Expected: exactly the six edits below (the hunks of `PL/recordActions.diff`).

   **Edit 1 (m2), after the `offline` state.** After

   ```ts
     const [offline, setOffline] = useState(false);
   ```

   add

   ```ts
     /** C16: "Use the server's" was chosen here. A copy the diary failed to drop waits for the next open (P7), not this screen's reload. */
     const declined = useRef(false);
   ```

   **Edit 2 (m2), `dropOpen`.** Replace

   ```ts
     /** Drops the open choice. A diary that refuses keeps its copy: the next open finds it settled, or offers it again. */
     const dropOpen = useCallback(async () => {
       const current = openRef.current;
       setOpen(null);
       if (current?.kept && diary) await diary.dropChoice(current.choice.recordId).catch(() => undefined);
     }, [diary, setOpen]);
   ```

   with

   ```ts
     /**
      * Drops the open choice, and this phone's copy of it: also when this screen could not keep it again, since the diary
      * may still hold an earlier copy. A diary that refuses keeps its copy: the next open finds it settled, or offers it again.
      */
     const dropOpen = useCallback(async () => {
       const current = openRef.current;
       setOpen(null);
       if (current && diary) await diary.dropChoice(current.choice.recordId).catch(() => undefined);
     }, [diary, setOpen]);
   ```

   **Edit 3 (m2), in `load`.** Replace

   ```ts
       // C16: the record's choice, open on this screen or kept in the diary.
       const choice = choicesOn ? openRef.current?.choice ?? storedChoice() : null;
   ```

   with

   ```ts
       // C16: the record's choice, open on this screen or kept in the diary (unless the server's was chosen here).
       const choice = choicesOn ? openRef.current?.choice ?? (declined.current ? null : storedChoice()) : null;
   ```

   **Edit 4 (m1), after the load effect.** After

   ```ts
     useEffect(() => {
       if (!fromDevice && !leaving.current) void load();
     }, [load, fromDevice]);
   ```

   add (one blank line before it)

   ```ts
     // C16: a diary that opens after this screen's first read may hold a choice for this record. Read again when it shows
     // up, unless a choice or an edit is already on screen (an edit in progress is never replaced). Only in the area.
     const heldHere = choicesOn && diaryView.phase === 'ready' && diaryView.pendingChoices.some((choice) => choice.recordId === id);
     useEffect(() => {
       if (heldHere && !openRef.current && !editingRef.current) void load();
     }, [heldHere, load]);
   ```

   **Edit 5 (M1), `sendYours`'s acknowledged branch.** Replace

   ```ts
         keys.settle(slot);
         await dropOpen();
         setEditing(null);
         setNotice(null);
       } catch (problem) {
   ```

   (the one inside `sendYours`) with

   ```ts
         keys.settle(slot);
         // Close the edit before the diary's drop: no conflict may stay on screen without the panel.
         setEditing(null);
         setNotice(null);
         await dropOpen();
       } catch (problem) {
   ```

   **Edit 6 (M1, m2), `useServer`.** Replace

   ```ts
       if (acting.current || editingRef.current?.unconfirmed) return;
       await dropOpen();
       cancelEditing();
       void load();
   ```

   with

   ```ts
       if (acting.current || editingRef.current?.unconfirmed) return;
       declined.current = true;
       // Leave the edit before the diary's drop (P2-T6's notice rule still sees the conflict): no conflict may stay on
       // screen without the panel, and today's panel never offers "Apply my change" here.
       cancelEditing();
       await dropOpen();
       void load();
   ```

3. `cd WT && npm run typecheck:app`. Expected: exit 0.
4. The same command as Step 2.3, into `S/green-record.log`. Expected: `Test Files  1 passed (1)`, `Tests  59 passed (59)`.

The 13 new cases and what each proves:

| Finding | Case | RED on `7f25a65` |
| --- | --- | --- |
| M1 | `choosing the server's version never shows today's comparison while the diary drops the choice` | fails |
| M1 | `an acknowledged "use yours" never shows today's comparison while the diary drops the choice` | fails |
| m1 | `a choice the diary finds after the record has loaded is offered, against the fresh record` (review probe E; the diary turns ready, then its choices arrive) | fails |
| m1 guard | `a choice the diary finds while an edit is open never replaces the edit in progress` | mutant X6 |
| m1 guard | `with the conflict area off, a diary that opens with a kept choice changes nothing` | mutant X4 |
| m2 | `choosing the server's when the diary cannot drop the choice shows the record, and the next open offers the choice again` (probe D) | fails |
| m2 | `a reopened choice this phone cannot keep again still leaves the diary when the server's is chosen` (probe C) | fails |
| m3 (R6) | `use yours meeting a record deleted elsewhere offers Restore and Discard my change, and keeps the choice until one is used` (probe I) | mutant Q6 |
| m3 (R11) | `a choice for a record that is no longer there offers Discard my change` (probe J) | mutant Q11 |
| m3 (R7) | `conflict_shown is sent again when "use yours" meets yet another change` (P8) | mutant Q7 |
| m3 (R4) | `a server that is unavailable counts as offline: the choice compares with the kept record and cannot send yours` (probe K) | mutant Q4 |
| m3 (R9) | `History's Edit on a record with a choice opens the choice first, and choosing the server's lands on the record` (probe L; it also checks one read at mount) | mutants Q9, X5 |
| R94 | `an edit refused for a record deleted elsewhere keeps no choice (R94)` (probe H) | mutant Q94 |

## Step 4: Mutation check

Run the planner's runner once. For each mutant it applies one exact replacement in WT, runs its focused tests, restores the file and checks the SHA-256:

```
MUTANT_LOGS=S/mutant-logs python3 -I PL/mutants.py WT/apps/app > S/mutants.out 2>&1; echo exit=$?
```

(Type the full paths.)

- Expected: `exit=0` and 45 lines, every one `KILLED` and `restored=True`.
- Then `/usr/bin/git -C WT status --short` shows only the two files from Steps 2 and 3, and `recordActions.ts` still matches its `real/` checksum.
- Any `SURVIVED` or `NOT APPLIED`: BLOCKED with its log.

| Mutant | Change | Killed by |
| --- | --- | --- |
| P1 to P4, F1, F2, S1, S2, H1, H2, K1 to K3, U1, U2, O1, O2, D1, E1, E2, C3, V1 to V6 | the first round's 27, unchanged | as in the first round |
| U3 | Use yours keeps the choice after the acknowledgement (rewritten: the drop removed after the new order) | `use yours sends ...`, `once use yours is acknowledged ...` |
| C1 | Use the server's keeps the choice (rewritten) | `choosing the server's version sends nothing ...` |
| C2 | Use the server's leaves without `cancelEditing` (rewritten) | `use yours refused without a usable record ...` |
| X1 | M1: Use the server's drops before it leaves the edit | `choosing the server's version never shows ...` |
| X2 | M1: an acknowledged Use yours drops before it closes the edit | `an acknowledged "use yours" never shows ...` |
| X3 | m1: no read when the diary shows a choice later | `a choice the diary finds after the record has loaded ...` |
| X4 | m1: the re-read runs with the area off | `with the conflict area off, a diary that opens ...` |
| X5 | m1: the re-read ignores a choice already open (two reads at mount) | `History's Edit on a record with a choice ...` |
| X6 | m1: the re-read replaces an edit in progress | `... never replaces the edit in progress` |
| X7 | m2: a choice not kept again is never dropped from the diary | `a reopened choice this phone cannot keep again ...` |
| X8 | m2: the reload re-adopts the choice declined here | `choosing the server's when the diary cannot drop ...` |
| X9 | m2: Use the server's never marks the choice declined | the same |
| Q4 | an unavailable read not offline | `a server that is unavailable counts as offline ...` |
| Q6 | Use yours on a deleted record not treated as gone | `use yours meeting a record deleted elsewhere ...` |
| Q7 | no `conflict_shown` when Use yours meets another change | `conflict_shown is sent again ...` |
| Q9 | the choice path leaves `autoEdit` on | `History's Edit on a record with a choice ...` |
| Q11 | no Discard my change on a missing record (`RecordScreen.tsx`) | `a choice for a record that is no longer there ...` |
| Q94 | R94: an edit refused for a deleted record keeps a choice | `an edit refused for a record deleted elsewhere keeps no choice (R94)` |

## Step 5: Gate

Run from WT, in order, each into a log in S, and record each result.

1. `cd WT && npm run typecheck:app`. Expected: exit 0.
2. `cd WT && npm run test:app`. Expected: `tests 32`, `pass 32`, `fail 0`.
3. `cd WT && npm run test:unit`. Expected: `tests 876`, `pass 876`, `fail 0` (unchanged: this round adds no unit test).
4. The focused render files, together: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/conflict/ChoicePanel.render.test.tsx src/screens/redesign/RecordScreen.render.test.tsx src/screens/redesign/HistoryScreen.render.test.tsx src/screens/redesign/record/recordActions.render.test.tsx src/screens/redesign/RecordReceiptReload.render.test.tsx src/screens/redesign/HistoryReturn.render.test.tsx`.
   - Expected: `Test Files  6 passed (6)`, `Tests  111 passed (111)` (98 before, plus the 13 new).
5. The full render suite, once, in the background: `cd WT && npm run test:render -w gogospend-app > S/render-full.log 2>&1`.
   - Expected: `Test Files  88 passed (88)`, `Tests  1664 passed (1664)` (1651 plus the 13 new).
   - `HistoryReturn.render.test.tsx` is a known load flake: a case there can time out at 5 s on a busy machine. If that file (and only that file) fails with a timeout, rerun it alone once (`cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/HistoryReturn.render.test.tsx > S/historyreturn-rerun.log 2>&1`, expected 6 passed), and record both runs.
   - Any other failure: BLOCKED.
6. `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` after the commit (or `/usr/bin/git -C WT diff --check` before it). Expected: no output.

Not run: `export:web`, `typecheck:routes`, and the edge, API and database suites. This round changes one hook and one test file (no route, config or app entry).

## Step 6: Receipt

1. `cp PL/real/docs/implementation/receipts/1D-T9.md WT/docs/implementation/receipts/1D-T9.md` (full paths). `shasum -a 256` it and compare with its `real/` line. It does two things:
   - It corrects deviation 9 (m6): the base at `84ee167` is 1619 render cases in 87 files, and the task added 32 (ChoicePanel 5, RecordScreen 14, History 1, CatalogueScreen 6, screenReader 6).
   - It appends `## Fix round (review of 7f25a65; ruling R94)`: Status, the findings fixed, R94, Files, RED to GREEN, Mutation check, Gate, Not changed, and Notes for later tasks.
2. The receipt names the integration head as `ad1fe18`. If Step 1.3 brought a later head, change that one `ad1fe18` (in the fix round's Status line) to the short SHA you merged. Change nothing else.
3. Every number in the fix-round section is the planner's. Check each against your logs: RED `5 failed | 54 passed (59)`, GREEN `59 passed (59)`, `45 killed, 0 survived`, `876`, `111`, `88` and `1664`. If one differs, stop: BLOCKED with the log. Do not edit the number.
4. If you reran `HistoryReturn` in Step 5.5, add one sentence at the end of the fix round's Gate bullet: `The full run timed out once in HistoryReturn.render.test.tsx (<case>); the file alone then passed 6 of 6.`

## Step 7: Commit

1. `/usr/bin/git -C WT add apps/app/src/screens/redesign/record/recordActions.ts apps/app/src/screens/redesign/RecordScreen.render.test.tsx docs/implementation/receipts/1D-T9.md`
2. `/usr/bin/git -C WT status --short`. Expected: those three paths staged, nothing else.
3. Write the message to `S/commit-message.txt` with the Write tool, then `/usr/bin/git -C WT commit -F S/commit-message.txt`:

```
Keep today's comparison off the conflict choice, and offer a choice the diary finds late

Resolving a choice closes the edit before the diary drops it, so today's
panel and its Apply my change never show in the conflict area. A choice
the device diary only holds once it opens is offered then, unless an
edit is open. Use the server's no longer comes straight back when the
diary refuses the drop. Five tests pin what the plan names, and one pins
ruling R94; the receipt's render count is corrected.

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

4. `/usr/bin/git -C WT status --short`. Expected: no output. Do not push.

## Your final message

As the protocol says:

- `STATUS: DONE` or `STATUS: BLOCKED` (with the exact blocker) on the first line;
- the merge and fix commit SHAs, and the integration head merged;
- the files changed;
- RED and GREEN counts;
- the mutants (45 killed, with any line that differs from the table);
- each gate command with its counts, including any `HistoryReturn` rerun;
- anything the reviewer should look at first.
