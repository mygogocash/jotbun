## Summary
- Adds vault migration `0002_currencies_trips.sql` (P5-T4). It rebuilds the wallets table so a wallet can hold any currency, and adds currency columns, `trips` and `settings`, with the home currency defaulting to THB. It imports nothing from P5-T1 (#331).
- Independent Opus review of `eaedc63`: Approved, no blocker or major. The review filled a vault through the real 1A routes on the old schema, then upgraded it:
  - every other table is unchanged: foreign keys, indexes, columns and rows;
  - wallets, transactions and categories keep every value;
  - `foreign_key_check` is empty, `quick_check` says ok, and a fresh vault ends with the same schema;
  - every 1A read answers exactly as before, and the writes still succeed;
  - a failed upgrade leaves the old shape, and the next wake retries;
  - the cost is linear: 100,000 records in 1.03 s and 500,000 in 4.66 s locally.
- Follow-ups, not folded in:
  - Two tests break when P3-T2's or P4's vault migrations land, in either order. They should match only this migration's columns, compare only tables that existed before, and fail on an unseeded referencing table.
  - Add an assertion that every foreign key to `wallets` is `ON DELETE NO ACTION`, since the rebuild would fire SET NULL or CASCADE.
  - The receipt's guidance for the next migration needs correcting; the review's checklist covers it.
- The branch is one task commit on `800680d` and a merge of the integration head `239c3a1`; the receipts ledger kept both sides. This branch and P5-T1 both add `## P5: Travel and currencies`; whichever merges second leaves two, to fold in the ledger consolidation.

## Test plan
- [x] RED 12 of 24 on a `SELECT 1` stub; GREEN 24 of 24; 31 of 31 mutants killed, the plan's three included
- [x] `typecheck:edge`, `test:edge` 156, `test:edge:workers` 258 under the heavy lock, and `build:edge`; `typecheck:edge` again after the merge
- [ ] CI on this pull request is green (`test:edge:db` was skipped locally because Docker is stopped)

Closes #237 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
