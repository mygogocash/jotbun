# Review of wallet-looks-unstored: Keep a look, order or icon that was never stored on screen until the app closes

- **Reviewed:** commit `8c997d8` on `fix/wallet-looks-unstored`, PR #391 (base `claude/p1a-vault-core`), range `origin/claude/p1a-vault-core...8c997d8` (merge base `9a24180`). Three files: `apps/app/src/wallet/looks/WalletLooksProvider.tsx` (153 to 173 lines), `apps/app/src/wallet/looks/WalletLooks.render.test.tsx` (418 to 542 lines, 9 to 13 cases) and the new receipt `docs/implementation/receipts/wallet-looks-unstored.md` (R87; `premium-progress.md` untouched). 214 insertions and 20 deletions in all. `git diff --check` on the range: exit 0. The worktree was only read: still at `8c997d8`, `git status` empty.
- **Reviewer:** a small workflow (size S): one read-only Sonnet reviewer, a skeptic for any blocker or major, and this synthesis. The reviewer probed and mutated in a `git archive` copy of the commit (`.claude/controller/scratch/wallet-looks-unstored-review/src`, `node_modules` symlinked; "the scratch folder" below is `.claude/controller/scratch/wallet-looks-unstored-review/`) and restored the scratch provider after every mutant (its sha256 `9429159751921109...` equals the commit blob's). No blocker or major was reported, so no skeptic ran and no finding is marked unverified.
- **Result:** no blocker, no major. One minor (a test gap: the code under it is correct) and five nits. The fix does what the brief's P2 to P8 say, every P3 rule of P2-T11 still holds against the new memory (5,450 random schedules checked against a model written from the rulings, not from the code), and CI is green on the commit. Approved. The minor and the nits go to the carriers named under each.

## CI (R100: read, not re-run)

Run 42735086363, `pull_request`, `headSha` 8c997d82a163d8439c57285f54362470fcb71da7, completed 2026-11-10T01:25:35Z, conclusion success: all nine jobs pass, nothing pending. PR #391 reports MERGEABLE and CLEAN against `claude/p1a-vault-core`. The reviewer read it, and this synthesis read it again (`gh pr checks 391`, `gh run view`, the job logs).

| Job | Result | What the log shows |
| --- | --- | --- |
| Typecheck, unit, API, build (3m34s) | pass | `typecheck`, `typecheck:app` and `typecheck:routes` ran; `test:app` 34 of 34, `test:unit` 970 of 970, `test:dev` 7 of 7, fail 0 |
| Exports, web and iOS bundles (2m37s) | pass | |
| Render, every file but the per-section suites (4m40s) | pass | 110 files, 1332 tests passed; `src/wallet/looks/WalletLooks.render.test.tsx` shows 13 tests |
| Render, per-section suites, three jobs (3m38s, 2m34s, 2m59s) | pass | 220, 166 and 204 passed: 590 of 590 across the three shards (each job skips the others' cases) |
| Edge Worker (5m3s) | pass | |
| SQL integration and ops (4m35s) | pass | the database suites and `test:ops` this review skipped (Docker stays stopped) |
| Release image and smoke (53s) | pass | |

The brief's expected deltas show: render +4 cases in the one file (13 tests in CI, 9 at the base) and no new render file; `test:app` 34 and `test:unit` 970 equal the implementer's local run in the receipt. Not run locally, by design (R100): the full render suite, `export:web`, the iOS export, the database and edge suites, `test:ops` and the typecheck steps. CI ran them.

## Findings

### Blockers

None.

### Major

None.

### Minor

**m1. No committed case has two changes in flight while an earlier one is unstored, so the line that reads the account's memory when a change runs can move without any test failing.**
- Where: `WalletLooksProvider.tsx:137` (`const earlier = unstored.current.get(accountId) ?? [];`, inside the queued step). The cases that could pin it are V1, V4, D1, D2 and "a later change wins" in `WalletLooks.render.test.tsx`.
- Evidence: the reviewer's mutant OM1 hoists that line above `return enqueue(async () => {`, so the memory is read when the setter is called, not when the step runs. Under OM1 the committed `WalletLooks.render.test.tsx` passes 13 of 13 and the planner's three files (WalletLooks, WalletCard, walletHarness) pass 31 of 31: OM1 survives both (scratch folder, `own-mutants-suite.out` and `own-mutants-planner-files.out`).
  - Why no case sees it: V4, D1, D2 and "a later change wins" each `await` a change before the next setter is called, so the memory is already filled by then; V1's `Promise.all` lets every write land, so the memory is empty.
  - What OM1 does: changes made together while writes fail overwrite each other's memory entry. The earlier unstored change drops from view (PE, PE2), or covers a later stored change to the same name at the account's next first read (PF's order).
- The committed code is correct here. The reviewer's cases PE (four changes through `Promise.all` while every write fails), PE2 (the same while no name can be read) and PF (changes called together, writes alternately failing and landing) pass on `8c997d8` and fail under OM1 (scratch folder, `mutant-logs-rp/OM1.log`: 3 failed, 11 passed of 14; in `own-mutants-probes.out` the same mutant also fails both model-check tests, besides the review's D8, which fails on the unmutated commit too). Overlapping setter calls are a pattern the file itself treats as real (V1's title: "two quick changes keep each other"); only the unstored half is unpinned. No defect in the commit.
- Fix: add PE, PE2 and PF (`src/apps/app/src/wallet/looks/ReviewProbes.render.test.tsx` in the scratch folder, lines 283, 298 and 314) to `WalletLooks.render.test.tsx`, on the file's own helpers. PF fails every other write by attempt number, which `storeOver`'s two booleans (`faults.reads`, `faults.writes`) cannot express, so it needs a small extension of that helper.
- Where it goes: a follow-up (P2-T21's look editor is the likeliest first caller to change quickly).
- Probe: `cd /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored-review/src/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/looks/ReviewProbes.render.test.tsx` (PE, PE2, PF pass). Mutant: `python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored-review/mutants_review.py /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/wallet-looks-unstored-review/src rp OM1` (then PE, PE2, PF fail).

### Nits

**n1. Nothing pins that a session where every write lands keeps nothing in memory (brief P3's last sentence), though P2's "exactly what it did before" and P8's boundedness argument lean on it.**
- Where: `WalletLooksProvider.tsx:143`, `if (!written || earlier.length > 0) unstored.current.set(accountId, edits);`.
- Evidence: mutant OM3 makes it unconditional (`unstored.current.set(accountId, edits);`). The committed file (13 of 13) and the planner's three files (31 of 31) still pass. It is unobservable while this provider is the only writer of the three names (the brief says so), but under OM3 the memory would grow with every tap of every session, not only after a failure, and any second source (P5-T19's restore or server read, or anything else that writes the names) would be covered by stale session changes at the next first read.
- The committed code is correct: reviewer case PX (all writes land, the store is then altered behind the provider, the account reopens: the first read must show exactly the store) passes on `8c997d8` and kills OM3 (`mutant-logs-rp/OM3.log`: PX alone fails, 1 of 14). The differential run (300 fault-free schedules against the head's provider: identical store calls, render sequences and stores) also shows the committed code keeps nothing when every write lands.
- Carrier: P5-T19 (the first task that adds a second source of these names), or a follow-up.
- Probe: the command under m1 with `-t 'PX:'`; mutant: `mutants_review.py ... rp OM3` (PX fails).

**n2. Brief P7's "if the account's first read has not landed yet, they show at once" is unpinned (equivalent at rest).**
- Evidence: mutant OM9 makes a change's own read lay the memory over only its own slot (`slot.put(now, slot.of(layOver(slot.put(now, slot.parse(stored.raw)), edits)))`). It survives the committed file (13 of 13), the planner's three files (31 of 31), the reviewer's 14 cases (`mutant-logs-rp/OM9.log`) and the model check (300 plain and 150 StrictMode schedules in the logged run, `mutant-logs-probes/OM9.log`). The only difference is transient: a change queued ahead of an account's first read (a child's mount effect, or a stale setter called before the switch back) shows the other names' memory a few milliseconds earlier. The state at rest is identical, so no behaviour a person sees depends on it.
- Carrier: a follow-up, optional; no action unless a caller makes changes before the first read.

**n3. The memory holds the caller's look object and ids array by reference, so a caller that mutates them after the call changes what later reads show.**
- Where: `WalletLooksProvider.tsx:134` (`edit` closes over `change`, which closes over the `look` object or the `ids` array passed to `setLook` or `setOrder`), and `:147` and `:148`. Once an account has any unstored change, every later change is kept the same way, stored or not.
- Evidence: reviewer case PM (scratch only): with every write failing, `setLook(W1, draft)` then `setOrder(ids)`, then `draft.material = 'sky'; ids.reverse()`, then away and back to the account: the next first read shows w1.material `sky` and the reversed order, though the person chose `peach` and the original order (`probe-PM.log` prints `PM after mutation: w1.material = sky`). At the head the same aliasing lasted only until the next read. `WalletLook`'s fields are not readonly (`walletLooks.ts:17`) and `setOrder`'s `readonly string[]` accepts a mutable array the caller still holds. A caller that builds a new object per change (React state updated immutably) is unaffected, which is why this is only a nit. A copy at the setters (`{ ...look }`, `[...new Set(ids)]` taken at call time) closes it.
- Carrier: P2-T21 (`setLook`) and P2-T20 (`setOrder`): pass a fresh object or array per call, or copy in the setter.
- Probe: the command under m1 with `-t 'PM:'`.

**n4. P8, the memory is not trimmed: unbounded growth is not plausible in a real session, with one call-site rule for P2-T20.**
- Evidence: the memory starts only after a change fails to store and ends when the provider unmounts; each edit is a closure over one id and a look, icon or order. Reviewer case PH: 400 changes after one unstored change took 27 to 57 ms in total across the logged runs and 197 ms on one loaded run (0.06 to 0.33 ms per change), with no growth between the first 20 and the last 20 changes. Every read replays the whole list, which is linear and cheap at tap rates. After a confirmed account deletion (`PrivacyScreen.tsx:395` erases the store) a deleted account's memory stays in RAM until the shell unmounts, but the id never opens again and it holds look choices only. The one way to make it large is a caller that calls `setOrder` on every drag tick: each call adds a retained edit and a store write, and the write cost dominates.
- Carrier: P2-T20 (call `setOrder` once per drop, not per drag tick).

**n5. Carry-forward notes for `followups.md`; none needs a change here.** They are listed with their carriers under "Notes for later tasks" below (P2-T18, P2-T20, P2-T21, P2-T29, P5-T19, and the review's D8).

## What was checked and found right, against the controller's five areas

Scope and hygiene:
- The range touches exactly the three files above. The committed provider and test file equal the planner's `SHA256SUMS.real` (2 OK, rerun for this synthesis). Line and case counts match the receipt (checked with `git show`: provider 153 to 173, test 418 to 542, cases 9 to 13). The commit message ends with the Haiku `Co-Authored-By` trailer. No exported name changes (only the internal `Edit` type and `layOver`).
- The implementer's `mutants.out` is byte-identical to the planner's (`cmp` clean; 37 `KILLED`, 37 `restored=True`).
- P12 holds. The base moved since the branch point `9a24180` by 1B-T11's edge files and controller state only (the reviewer saw `58be2e2`); nothing under `apps/app/src/wallet` or `apps/app/src/spend` changed, as far as the local ref `ecc00b7`, and GitHub reports the PR MERGEABLE and CLEAN.

1. **P2-T11's P3 rules against the new memory.**
   - (a) Each change reads its own name before it writes. In 5,450 random schedules (300 plain and 150 StrictMode, then 2,500 and 2,500 more, with random account switches, read and write fault toggles, stale setters and changes queued ahead of a switch) every attempted write equals the change applied to what the store held, with no memory folded in. The same probes fail 12 of 15 on the head's provider (`probes-on-old-provider.log`), so they discriminate. The 300-schedule differential against the head's provider (blob `c14a7a4`, fault-free, every third schedule under StrictMode) gives identical store calls, render sequences, stores and final display, so "with an empty list, byte for byte as before" holds; it kills a display mutant (OM12), so it is sensitive.
   - (b) A name the store cannot read is never written over: D2, PD8b, PE2 and the model check (no write attempted while reads fail).
   - (c) Reads for an account no longer open are dropped, with memory present: PC, PI and V3 pass, and the planner's PR9 is killed.
   - (d) Nothing of the last account shows after a switch: the render sequences in PB, PC and PI show no render under B with A's memory or looks.
   - (e) With no account open the setters keep nothing and the memory is untouched: PD (no write attempted, reopening shows only the earlier memory), and the planner's PR16 is killed in its `mutants.out`.
2. **The new memory (P2, P3, P5, P7).**
   - It is per account, in a `useRef` (`:112`; OM8, module scope, is killed by the committed file). It holds each unstored change and every change after it, in order; it is laid over the first read (`:126`) and over each change's own read (`:140`); a later change wins (OM6, OM7, WU5 and WU16 are killed); it survives a locked diary and account switches (V4's extension; WU19 and WU20 are killed).
   - Interleavings: an unstored change, then a stored one for another wallet, then the first read landing late (the D8 route, child mount effects): PA and PA2 pass, and the write payloads are exactly the read plus the change's own edit, never the earlier change. Two accounts' unstored changes: PB passes (each first read and change shows only its own memory; each attempted write holds its own account's store plus its own change). A write in flight when the account changes, then failing: PI passes. Changes made together: PE, PE2 and PF pass.
3. **P6, the review's D8 is not taken.** The review's DataLensProbes file run against the commit gives D1 to D7 and D8b passing and D8 failing on the store's call order alone (`get looks, set looks, get looks, get wallet-order, get category-icons`), as the planner recorded. PD8, PD8b, PA and PA2 show a change from a mount effect loses nothing (the store holds the read plus the change) and the screen is right, stored or not.
4. **P8, no trimming.** Growth is not plausible (n4).
5. **Tests and mutants.** V4's extension (locked, reopened, the other account's first read and change, back again, never written; after a first read that failed, a change shows what the store holds), D1, D2, D8b and "a later change wins" were read and run: 13 of 13 in the scratch copy, no `act` warning, no console error, no flake (the only stderr line is Node's `localStorage` `ExperimentalWarning`). Mutants are below.

Not exercised: a real device's AsyncStorage failing (the cases fail the store through the test backend, as the receipt says).

## Mutants

- **Planner's list, a sample of 10** (`mutants_review.py ... planner`, against the planner's three files): WU2, WU3, WU5, WU7, WU11, WU13, WU16, WU19, WU20, PR9. All `KILLED`, all `restored=True`, each with the same number of failing cases as the planner's own `mutants.out` line and the planner's first failing case among them (scratch folder, `planner-sample-mutants.out`, compared line by line for this synthesis).
- **The reviewer's own, 12** (scratch folder, `mutants_review.py`, logs `own-mutants-*.out` and `mutant-logs-*`): 8 killed by the committed file (OM2 first read lays the memory as it stood when the read was asked for, OM4 memory keeps only the last change, OM5 one memory for every account, OM6 edits laid over the base only, OM7 newest first, OM8 module-scope memory, OM10 and OM11 only one of the two unstored causes kept). OM12 (a sanity mutant: a change shows only what was read) is killed by the differential. 3 survive: OM1 (m1), OM3 (n1), OM9 (n2).
- A note on the logs: `own-mutants-probes.out` prints OM3 and OM9 as `KILLED`, but the only case failing there is the review's D8, which fails on the unmutated commit too (P6, by design). Those two lines are not kills. PX alone kills OM3 (`mutant-logs-rp/OM3.log`); nothing the reviewer wrote kills OM9.

## Notes for later tasks

- **P2-T18:** where `WalletShell` mounts the provider sets how long an unstored change shows, because the memory dies with the provider (the header says "while this provider stays mounted"). Keep it above anything that unmounts on lock, tab or route change inside the spend area.
- **P2-T20, P2-T21 and P2-T29:** a setter resolves whether or not the change was stored, and the change shows either way, so a screen cannot tell the person it was not saved. Also, `order` is `[]` and every look is derived until the account's first read lands (no ready flag, P2-T11 review), so do not seed `setOrder` from an effect keyed on an empty `order`.
- **P2-T20:** call `setOrder` once per drop, not once per drag tick (n4), and pass a fresh array per call (n3).
- **P2-T21:** pass a fresh look object per `setLook` call (n3). Its look editor is also the likeliest first caller to change quickly, which is why m1's cases are worth adding before or with it.
- **P5-T19:** the upload reads the store, so an unstored change is never uploaded. If the provider reads server values, decide whether the memory is laid over them (n1: PX is the case to carry over once a second source of these names exists).
- **The review's D8 stays unfixed by design (P6):** revisit only if a caller changes a look from a mount effect and the order of the store's calls matters.
- **A follow-up:** m1's three cases (PE, PE2, PF) into `WalletLooks.render.test.tsx`; n2 only if a caller starts making changes before the first read.

VERDICT: Approved
