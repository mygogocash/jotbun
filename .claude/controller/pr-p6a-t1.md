## Summary
- Adds the outside ids, the app group store and the account file under `apps/app/src/wallet/outside/` (P6A-T1). These are new files only, built on packages that are already installed (expo-file-system 58.0.9, expo-crypto, expo-constants). It uses the plan's `TEMPORARY_IDS` until the owner answers D33 (Q6).
- First Opus review: Approved, with minors folded into a fix round (`2304d8b`) before merge:
  - `remove` of a folder name could delete every waiting slip. expo-file-system deletes folders recursively. The test fake now models that, and a test kills mutant E34.
  - On iOS, `copyIn` onto a folder name deleted the folder. Both stores now refuse it.
  - The top-level `expo-constants` import broke render-test setup (`__DEV__ is not defined`). It is now a guarded, typed lazy `require` that falls back to `TEMPORARY_IDS`.
  - `writeAccountFile` refuses any value the reader would refuse.
- Confirming review of the fix round: Approved. 40 hostile names are refused, and about 21,700 fuzzed accepted names stay under `outside/`. No folder can be deleted or overwritten through `remove` or `copyIn`.
- Follow-ups, not folded in:
  - When `copyIn` overwrites and the source then fails, the existing copy is lost on the device (both platforms delete first). P6A-T6a and P6A-T11 should use a fresh name per hand-off.
  - A millisecond race between the folder guard and the copy is still possible, but only through a caller bug. Some comments say "never".
  - Receipt counts and the head named in its status line are out of date.
- The branch is the task commit on `bdf6b12`, the fix round, and a merge of the integration head `5650669`.

## Test plan
- [x] Round 1: RED 19 of 19, GREEN 19. Round 2: RED 3 of 23, GREEN 23. Mutants: 17 of 17 (round 1), 10 of 10 (round 2), and both render probe mutants killed.
- [x] `typecheck:app`, `typecheck:routes`, `test:app` 29, `test:unit` 757, `export:web` (round 1). The render probe loads with only the expo-crypto mock. `typecheck:app` passes after the merge.
- [ ] CI on this pull request is green

Closes #268 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
