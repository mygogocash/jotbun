## Summary
- `scripts/ops/readiness-receipts.test.mjs`'s CLI test ran the preflight against the real clock, using a receipt valid until 2026-11-15. From 8 November that date falls inside the 7-day release window, so `test:ops`, run by CI's "SQL integration and ops" job, fails on every branch, the integration head included.
- The receipt that must stay valid is now recorded a day ago and valid for 29 more days. That keeps it within the 31-day maximum and the "not in the future" rule. The lapsed `storage_contract` receipt and every assertion are unchanged.
- This is a test-only change; the preflight code is untouched.

## Test plan
- [x] `node --test scripts/ops/readiness-receipts.test.mjs`: 4 of 4. Before the change, the CLI test failed today with `failing=restore_rehearsal,storage_contract`.
- [x] `npm run test:ops`: 106 passed, 1 skipped.
- [ ] CI on this pull request is green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
