## Summary
- **P5-T2: currency fields on wallets, categories and records, in the contract and the app's validators.**
  - The v1 contract (`packages/contracts/src/v1/{wallets,categories,transactions,history,policies,privacy,auth}.ts` and `index.ts`) gains the currency keys, the looks, icons and pack keys, in place. Older shapes still read as before.
  - The app's `resources.ts` validators take the new keys.
  - `app.json` moves to 0.3.0, with `CURRENCY_MIN_CLIENT_VERSION` (P11).
- **Older records read as THB** (P7): a record with no money key is valid as before, and so is a row the P5-T4 migration filled (`currency 'THB'`, `rate '1'`, the home amount equal to the amount).
- **The amount bounds** (P5, Q10's default): the home amount 0 to the cap, never null; the wallet amount null or 0 to the cap; the exchanged amount null or 1 to the cap. The cap counts minor units of each amount's own currency, so the check needs no scale.
- **`rate_date` is a real date from 1970** (P4), checked as P5-T3 checks a trip's dates.
- **No rule across fields in the snapshot check** (P6). One refused snapshot fails a whole sync page, so those rules belong to the vault's commands (P5-T10).
- **One file beyond the plan** (P3): `diaryRepository.ts` declares its edit rules as `Record<keyof UpdateTransactionRequest, ...>`. With the new money keys, `typecheck:app` fails, so it is retyped to the eight fields the phone edits today. Types only; nothing changes at run time.
- **The lists are pinned** (P8): the five contract lists equal P2's and 1D's today, value for value and in order.
- **The controller accepted the planner's calls P1 to P14.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: 14 of 15 `real/` files are byte-identical. The receipt differs only in its base SHA (`54e889b5`, a controller-state sync).
  - The controller's pre-flight before the build: the kit over the head passed the eight wallet catalogue kit render files and `typecheck:app`.
  - The receipt is its own file under R87: `docs/implementation/receipts/P5-T2.md`.
  - No package, lockfile, route, edge code or database change.
- **Release rule, for the owner (P14):** before any server sends a phase 5 key (from P5-T5 and P5-T10/T11), raise the server's minimum client versions to at least 0.3.0. Builds 0.1.0 and 0.2.0 refuse those keys with exact-key validators and stop syncing.

## Test plan
- [x] RED, every failure an assertion, with the three typechecks passing on the stubs:
  - `shapes.test.ts` 9 of 9;
  - app 2 (`totals may name their currency`, and the client-version case).
- [x] GREEN: `shapes.test.ts` 9, the two app files, and the API's contract spec 95 of 95.
- [x] 57 of 57 mutants killed, each by the case it names.
- [x] R100's fast gate:
  - `typecheck`, `typecheck:app` and `typecheck:edge`;
  - `test:edge` (20 files, 204), `test:app` 36 and `test:unit` 1049;
  - `build:edge`;
  - the four routes tests;
  - `git diff --check`.
- [x] CI at `f4041406`: 9 of 9, including the full render suite and the database suites.
- [ ] Independent review (Opus), and a second review: the money fields, their bounds and the older shapes.
- [ ] SKIPPED: none beyond R100's whole suites, which CI runs.

Closes #235 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
