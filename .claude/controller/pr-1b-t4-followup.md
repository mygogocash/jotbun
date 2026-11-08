## Summary
- Closes the vault registry's publish and delete race that 1B-T4's review found (minor 1). A publish that landed while the alarm's R2 delete was in flight could lose the object.
  - `publishObject` refuses a reservation past its deadline (`AND delete_after > now`).
  - The success path's DELETE and UPDATE take `AND delete_after <= now`.
  - A test with an interleaving bucket covers the review's probes 2a and 2b, and the re-marked tombstone.
- `reserveObject` refuses a key outside this vault's prefix (`vaultPrefix(purpose, c.vaultId)`), with a test (minor 2).
- Tests that kill mutants G1 to G4, which pin deviations 3, 4 and 6 and the failure path's guard (minor 3).
- `putConcatenated` checks the object key and that its parts add up to `totalBytes` (nit).
- The `deleteDueObjects` doc comment is corrected.
- The receipt is its own file under R87: `docs/implementation/receipts/1B-T4-followup.md`. It notes for 1B-T5 that overlapping runs may start an item twice, and that `finishUpload`'s publish needs the same deadline rule.
- This must land before 1B-T11, which first calls `deleteDueObjects` from the alarm.

## Test plan
- [x] RED 4 failed and 24 passed. GREEN 28 of 28. 12 of 13 mutants killed; F3 is the documented equivalent.
- [x] `typecheck:edge`, `test:edge` 162, `test:edge:workers` 369 passed and 4 todo (under the heavy lock), and `build:edge`.
- [ ] CI on this pull request is green. `test:edge:db` was skipped locally because Docker is stopped.
- [ ] Independent review.

Follow-up to 1B-T4 (#108, closed when #341 merged).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
