## Summary
- The phone's slip core (P4-T12). `createSlipResources` makes twelve slip calls over the one shared transport.
  - Confirm and dismiss are commands on the vault's `slip_inbox` entity.
  - The account update is a plain write, sent as a command only so that it carries `If-Match`.
  - An id that is not a UUID is refused before anything is sent.
- **R102 (controller):** the slip batch read goes as its JSON's UTF-8 bytes, typed `application/octet-stream`, as the import upload sends its file. The edge's dispatcher parses any `application/json` body itself, capped at 2 MiB, and then leaves a stream route no stream; batches are up to 8 MiB. P4-T6 will read the batch from `w.stream`.
- **The salted hash (`slipRefs.ts`):** the reference is normalized with P3-T1's rules, then hashed with SHA-256 through expo-crypto. One salt load serves every hash of a hasher. A locked keychain never falls back to fetching the salt from the server (mutant H13).
- **The salt store:** one SecureStore item per account, readable only while the phone is unlocked and never restored to another device (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, B12 and S16). A stored value that is not a salt reads as none, so the salt is fetched again.
- **The sign-out erase** forgets that account's salt on iOS and Android; the web keeps none (P8). The exact keychain-delete list pinned in `bunSettingsErase.render.test.tsx` gains its key.
- **1D-T6's m4 for slips:** every slip call goes over the shared transport, which sends `X-GoGoSpend-Analytics: off` unless the answer is yes, and `sharedSlipResources.render.test.tsx` pins that. The import screens' two transports are not slip clients; they stay open in followups.md.
- Ten placeholder routes under `app/spend/slips/`, each redirecting to `/spend` and naming its board and the screen task that fills it. `slipRoutes.ts` holds the plan's `Href` constants, which `typecheck:routes` checks.
- A fake slip server (`testing/fakeSlipResources.ts`) answers in the contract's shapes and refuses as P4-T3 and P4-T7 will.
- The controller accepted the planner's calls P1 to P15 (receipt, Deviations). No package or lockfile change (`expo-secure-store` and `expo-crypto` are installed), and no edge, API or database change. The receipt is its own file under R87: `docs/implementation/receipts/P4-T12.md`.

## Test plan
- [x] RED on typed stubs: Node 11 of 11 failing, render 3 of 10, every one an assertion. GREEN: Node 11 of 11, render 10 of 10 in 4 files.
- [x] 64 of 64 mutants killed, each file restored; the 21 files match the planner's verified copies.
- [x] R100's fast gate: `typecheck:app`, `typecheck:routes`, the neighbouring render files (SpendLayout, HistoryReturn, AccountRoutes) 25 of 25, `test:app` 34, `test:unit` 933, `export:web` 4803 modules, `git diff --check`.
- [ ] CI on this pull request is green, on its merge with the head (which includes 1D-T8): the full render suite (+1 file, +2 cases) and the database suites.
- [ ] The iOS export (CI has none; the controller runs it before the merge, since this adds routes and native-module imports).
- [ ] Independent review.
- [ ] SKIPPED: the real keychain and network on a phone (no device here).

Closes #220 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
