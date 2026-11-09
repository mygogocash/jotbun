## Summary
- Gives the UserVault its object registry (1B-T4). It covers:
  - reservations, publishing and tombstones for stored objects;
  - purpose-bound grants with derived keys;
  - pending-work starts for routes marked `starts`;
  - `readGates`, which fails closed;
  - the download slots that 1B-T6, T8 and T9 will fill.
- This is on the critical path: 1B-T3, then 1B-T4, then 1B-T5, then 1B-T10.
- Independent Opus review of `d04a4f3`: Approved, with no blocker or major. Its checks:
  - every value is bound and every key list goes through one `json_each` parameter;
  - a grant for one account cannot read another account's object;
  - a rejected start is retried, never lost;
  - the durable erase still removes every registry row;
  - deviation 2 is right (a Worker route marked `starts` also hands off its work, because 1B-T5's upload route is one).
- Follow-ups to fix before 1B-T11 calls `deleteDueObjects` from the alarm, not folded in:
  - A publish that lands while the alarm's R2 delete is in flight loses the object. The fix is to guard `publishObject` with `delete_after > now`, and the success-path delete and update with `delete_after <= now`.
  - `reserveObject` should check the key is under this vault's prefix.
  - Three deviations have no test (mutants G1 to G3 survive).
  - `putConcatenated` trusts `totalBytes`.
- The branch is one task commit on `800680d` and a merge of the integration head `5650669`; the receipts ledger kept both sides. It merges cleanly with 1A-T8b (4ada8f8); the combined workers suite passes 282 plus 3 todo.

## Test plan
- [x] RED 20 of 20 on typed stubs; GREEN 20 of 20; 25 of 25 mutants killed
- [x] `typecheck:edge`, `test:edge` 156, `test:edge:workers` 268 under the heavy lock, `build:edge`; `typecheck:edge` again after the merge
- [ ] CI on this pull request is green (`test:edge:db` was skipped locally because Docker is stopped)

Closes #108 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
