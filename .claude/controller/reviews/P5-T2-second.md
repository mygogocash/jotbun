# P5-T2 second review: money path and privacy (Claude Sonnet 5.5)

Independent second reviewer, a different model family from the Haiku 5.5 builder and the Opus planner.

- **Under review:** `f4041406` (`f404140698009a0b03d7026d8e13810b4ce2e0b0`) on `p5/t2-currency-fields`, one commit on `54e889b5`; range `origin/claude/p1a-vault-core...f4041406`; PR #436. I ran `git fetch` first; the PR head is that SHA.
- **Read first:** the dispatch prompt, `protocol.md` (R87, R100, "Reviewers"), plan task P5-T2 (plan lines 179 to 235) with X7, X8, X18, X20, Q2, Q4, Q7, Q10 and the Global Constraints, the brief (P1 to P14), the receipt, and the planner's `mutants.py`. I opened no other review of this task before writing this one.
- **How I probed:** only in a scratch copy, `git archive f4041406` into `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p5-t2-second/tree`. Its `node_modules` is linked entry by entry from the worktree, with the workspace links re-pointed at the copy (so the tests read the copy's contracts, never the worktree's) and the caches left unlinked. The worktree is untouched (`git status --short` is empty), and every file a mutant touched was restored and compared.
- **Result:** no blocker, no major. 3 minor, 4 nit, and notes for later tasks. Every minor is a missing test or a release gate; the code matches the plan in every case I probed.

## Integrity and process

- The 14 non-receipt files of the commit are byte-identical to the planner's `real/` (`cmp` per file). The receipt differs only by `BASE_SHA` replaced with `54e889b5`.
- No lockfile, `vendor/`, `premium-progress.md` or `apps/api` path is in the range. `git diff --check` over the range is clean. The commit message and its `Co-Authored-By: Claude Haiku 5.5` trailer follow the protocol.
- No logging is added anywhere in the diff, so the "never log amounts" rule is untouched.
- The implementation follows the plan's Interfaces list name for name (wallets, categories, transactions, history, policies, privacy, auth, index): I compared each type and list against plan lines 193 to 221.

## CI on PR #436 (R100): all 9 jobs passed on the reviewed head

Run 43216225276, conclusion `success`, head `f404140698009a0b03d7026d8e13810b4ce2e0b0`.

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | `typecheck`, `typecheck:app`, `typecheck:routes`, release graph, whitespace: pass. `test:api` 47 suites, 1000 tests. `test:app` 36. `test:unit` 1049 (the Hermes guards included). `test:dev` 7. |
| Exports (web and iOS bundles) | `export:web` and `export:ios`: pass (this covers the `app.json` version change) |
| Render (every file but the per-section suites) | 125 files, 1599 tests |
| Render, per-section suites (3 jobs) | 2 files each: 188, 228 and 246 passed (the rest skipped by the id split) |
| SQL integration and ops | `test:ops` 111 passed |
| Edge Worker | `test:edge` 20 files, 204 tests. `test:edge:workers` 33 files, 792 passed and 1 todo. `test:edge:db` 3 files, 12 tests. `typecheck:edge` and `build:edge` pass. |
| Release image and smoke | pass |

## The controller's focus points

### 1. Backward and forward reading: holds

- **Today's shapes.** Probe 1 (`probes/probe1.ts`, 163 checks) runs the exact-key validators over what the vault sends today: a 7-key THB wallet (opening at the cap accepted, over it refused), a 7-key category (custom and built-in), an entry and a transfer with and without `attachment_id` and `source`. All valid. A 7-key wallet in USD or `thb` is refused (X7).
- **Older records (P7).** The P5-T4 migration's row (THB, `rate '1'`, `reference`, null `rate_date`, home equal to the amount, `wallet_amount_minor` or `to_amount_minor` null, null `trip_id`) is valid for an entry and a transfer, also with `attachment_id` and `source`.
- **All or none.** Partial money sets are refused: each of the 7 keys dropped from the full set (an entry, and a transfer), and each single key alone on an entry. An entry holding `to_amount_minor`, a transfer holding `wallet_amount_minor`, and either with an extra key are refused. All 165 ISO codes are accepted on a looked wallet; `XAU`, `XXX`, `jpy`, `JPYX`, `toString`, `__proto__` and `constructor` are refused.
- **The app.** Probe 2 (`probes/probe2.ts`, 25 checks): `isHistoryPage` accepts today's totals and totals with `currency: 'THB'` or `'JPY'`, and refuses `'jpy'`, `null`, `''`, `'XAU'`, `undefined` and an extra key; `isMonthSummary` accepts today's totals and `currency: 'JPY'`, and refuses `'jpy'` and a `count`. A page holding a full phase 5 record is valid; a record with a partial money set fails the page. `isWalletDto` takes a looked JPY wallet with its balance.
- **API contract spec.** `apps/api` is not in the range. Run in my copy: `src/v1/contracts.spec.ts` 95 passed. In CI, `test:api` is 1000 passed.
- **Older builds really refuse (the release rule's premise).** Probe 3 (`probes/probe3.ts`) loads the base contracts (`f4041406^`, `54e889b5`) beside this commit's. The base refuses a 10-key THB wallet, a JPY wallet, a 9-key category and a record with money keys, and refuses a whole change group holding any of them (`isCommittedChangeGroup`, `sync.ts`). This commit accepts all of those and today's shapes (7-key wallet and category, an entry with and without `attachment_id` and `source`).
- **The vault gates its own writes on these validators.** `apps/edge/src/vault/commands/change-log.ts:88` calls `definition.validate(snapshot)` on every change and throws "does not match its entity's persisted DTO" when it fails. So a phase 5 command that builds a snapshot these validators refuse aborts, and cannot ship an unreadable snapshot to a phone.

### 2. The bounds (P5): consistent with the vault's columns, no mismatch that matters

Migration `apps/edge/src/vault/migrations/0002_currencies_trips.sql` against the contract:

| Field | Vault column | Contract | Verdict |
| --- | --- | --- | --- |
| `currency` | not null, default `'THB'`, `GLOB '[A-Z][A-Z][A-Z]'` (line 62) | the ISO table (165 codes) | contract stricter (X6) |
| `rate` | not null, default `'1'`, length 1 to 40, digits and dots (line 64) | canonical, at most 12 significant digits | contract stricter, except length (n4) |
| `rate_source` | one of three (line 66) | `RATE_SOURCES` | same |
| `rate_date` | null or `date(rate_date) IS rate_date` (line 69) | null or a real date from 1970-01-01 | contract stricter (SQLite `date()` also takes earlier years) |
| `home_amount_minor` | null, or 0 to 99,999,999,999 (line 71) | string, 0 to the cap, never null | vault may hold null: it must read `coalesce(home_amount_minor, amount_minor)` (header, lines 15 to 18); the receipt already names this |
| `wallet_amount_minor` | null, or not a transfer and 0 to the cap (line 74) | entry only, null or 0 to the cap | same |
| `to_amount_minor` | null, or a transfer and 1 to the cap (line 77) | transfer only, null or 1 to the cap | same |
| `trip_id` | text, no check (line 80) | null or a lower-case UUID v1 to v8 | contract stricter |

- **Null versus 0:** `home_amount_minor` 0, `wallet_amount_minor` 0 and null, `to_amount_minor` null are valid; `home_amount_minor` null, `to_amount_minor` 0 and negative amounts are refused. Probe 1 pins each, and `00`, `007`, `-0`, `+1`, `1.0`, a padded or newline-ended string, a number and a bigint are refused too.
- **The cap and the currency's units:** both sides count raw minor units of the amount's own currency (11 digits, 99,999,999,999), with no scale. ¥99,999,999,999, ฿999,999,999.99 and BHD 99,999,999.999 all sit at the same cap, as the Global Constraints say, and no currency exponent can make one side accept what the other refuses. Cap plus one is refused for `amount_minor`, home, wallet and exchanged amounts.
- **Reverse direction (the vault writes, the contract refuses):** only `home_amount_minor` null (above) and the vault commands' own use of the lists, which the SQL checks only by shape (n4 and notes).

### 3. P6, no rule across fields: right call; one wrong-amount path exists, but it is not a missing rule

- **No snapshot-local rule is both exact and available.** `home_amount_minor` against `amount_minor` and `rate` needs the home currency's exponent, which is another entity (`settings`), and an own rate's charged amount is authoritative (Q11), so rounding differs by design. `wallet_amount_minor` needs the wallet's currency. `to_amount_minor` needs the destination wallet. The two single-snapshot pairings (`reference` with a null day means rate `1`; `own` and `exchange` mean a null day) change a rate's label, not an amount, and adding them would refuse rows the plan allows (one refused snapshot fails a page). So the snapshot check cannot be the guard, and the vault's commands (P5-T10) are.
- **Does a wrong amount reach a screen?** Not through a missing rule. But there is a path in this tree: the phone's local balance is currency-blind. I applied the plan's own yen example through the real `DiaryStore` (scratch test `tree/apps/app/src/storage/p5probe.test.ts`): a ¥4,620 expense with `wallet_amount_minor '106814'` on a baht wallet opening at 100000 is accepted without error, and `confirmed_wallet_totals` reads `95380` (opening minus 4620 as satang), where the vault's rule gives `-6814`. The cause is `diaryRepository.ts:253` (`BigInt(record.amount_minor)` for every record). The plan owns the fix: P5-T18a (`recomputeTotals`, test `confirmed balances follow each wallet's currency`, plan lines 785 and 791) and P5-T18b (`pendingTotals.ts`). Nothing at this head can create or receive such a record on a phone (the vault sends no phase 5 key until P5-T5 and P5-T10; the outbox refuses money keys, point 4), so this is a release-gating risk and not a defect: see m2.

### 4. P3, the `diaryRepository.ts` retype: no run-time change, still refused, but held by no test

- The diff is one type alias (`EditedField`, line 185), the `Record<EditedField, ...>` annotation (line 187) and the cast in `validChanges`. `CHANGE_FIELDS` is still `Object.keys(CHANGE_RULES)` (line 197), the same eight fields. Types are erased, so nothing runs differently.
- I confirmed it through the real store (scratch test `tree/apps/app/src/storage/p3probe.test.ts`, 3 tests passing): `keepChoice` refuses a choice whose `changes` hold `currency`, `rate_source`, `rate`, `home_amount_minor`, `home_currency`, `to_amount_minor` or `trip_id` (string and null), alone or beside `amount_minor`, and stores nothing. It keeps a choice whose `original` and `server` snapshots carry a full money set. `savePending` refuses a draft carrying any of seven money keys.
- **But no shipped test pins this:** my mutants O18 (the choice rules accept `currency` and `trip_id`) and O19 (a draft's allowed keys take five money keys) both pass all 25 `diaryRepository.test.ts` tests. The existing case refuses `{ version: 9 }` and a numeric amount, not a money key. See m3.

### 5. `privacy.ts` and `auth.ts`

- **`auth.ts`** adds only `CURRENCY_MIN_CLIENT_VERSION`; it changes no account shape. The one account-facing key is `MeDto.home_currency?` in `policies.ts:35`: optional, a preference, no new account or sign-in identifier. The app reads only `pending_policies` from `/v1/me` (`policies.ts:19, 43, 60`), so neither a 0.3.0 nor an older build validates or keeps it, and the receipt's "safe for older builds" holds.
- **`privacy.ts`** adds `VAULT_EXPORT_CSV_CURRENCY_COLUMNS` (15) and `VAULT_EXPORT_CSV_COLUMNS` (18 plus 15), in the plan's order; the header test pins both. `EXPORT_CSV_COLUMNS` is unchanged, `apps/api` is untouched, and the vault still writes `EXPORT_CSV_COLUMNS` (`apps/edge/src/vault/files/exports.ts:218`), so nothing new is exported yet. What the keys mean once P5-T14 fills them: every new column is the person's own data in their own file; the new free text is `trip_name`, which must take `csvText` (formula neutralisation) like `note` and `merchant` (n3, notes).

### 6. The release rule (P14): correct and pinned

- `CURRENCY_MIN_CLIENT_VERSION = "0.3.0"` (`auth.ts`), exported from the index. `app.json` goes from `0.2.0` to `0.3.0`; it holds no other version key (no build number or runtime version) to keep in step.
- The test (`apps/app/src/api/clientVersion.test.ts`) pins `'0.3.0'`, requires the app's version to be at least it, requires it to be above `AI_MIN_CLIENT_VERSION`, and finds the other minimums first, so it cannot pass on an empty list. Mutants V3 (a patch above P3's) and the rest of V1 to V5 are the planner's; I reran V3: killed by that case. `aiClientVersion.test.ts` still passes at 0.3.0.
- The owner action is named correctly: `config:v1`'s `client_versions`, or `MIN_CLIENT_VERSION_IOS` and `MIN_CLIENT_VERSION_ANDROID` (both exist, `apps/edge/src/v1/config.ts:15, 23, 124`). It is consistent with the later plans: P6C-T6's `RELEASE_CLIENT_MINIMUMS = { ios: '0.3.0', android: '0.3.0' }` and its test that each `*_MIN_CLIENT_VERSION` export is a floor (P6C plan lines 390, 396, 412), and P6B-T10's `0.4.0` after this `0.3.0` (P6B plan line 464, X20).

## Findings

### Blockers

None.

### Major

None.

### Minor

**m1. The month summary's currency path has no test.**

- Evidence: `isMonthSummary` strips its own keys and passes the rest to `isTotals(totals, false)` (`apps/app/src/spend/v1/resources.ts:144 to 153`); `isTotals` is at line 115. The new case `totals may name their currency` drives only `resources().history(...)`. My mutants O1 (`...(withCount && named ? ['currency'] : [])`) and O2 (`(!named || !withCount || isCurrencyCode(value.currency))`) both pass `resources.test.ts` and `clientVersion.test.ts`. The code is right today (probe 2: a month summary with `currency: 'JPY'` accepted, `'jpy'` refused, none accepted, a `count` refused).
- Impact: P5-T11 sends `currency` on `/v1/summary` (plan P5-T11 Rules: "totals carry `currency`"), and the receipt and brief P10 claim both paths take it, but only one is pinned. A later edit that splits the two paths would make every month summary `invalid_response` on a 0.3.0 build with the suite green.
- Fix (test only): extend that case with `resources().summary('2026-11')` replies: `currency: 'JPY'` valid, `'jpy'` invalid, none valid.

**m2. The 0.3.0 pin is a reading floor; the phone's arithmetic is not currency-aware until P5-T18a and T18b, and the receipt's notes do not say so.**

- Evidence: point 3 above (the yen probe: `95380` where the vault gives `-6814`), `diaryRepository.ts:238 to 263`, and plan P5-T18a (line 785) and P5-T18b. The receipt's notes for P5-T17 and P5-T21 name the outbox checks but not `recomputeTotals` or `pendingTotals`. P6C-T6 checks only that the minimums do not exceed the app's version (plan line 412), which cannot tell a 0.3.0 build that has the money arithmetic from one that has only these validators.
- Impact: not a defect of this commit. From this merge on, `app.json` reads 0.3.0, so any build cut from the integration branch before P5-T18a and T18b would pass the floor, accept foreign-currency data from a phase 5 server, and show wrong balances (the data exists only once an account used a newer build, but the version number cannot separate them).
- Fix: no change to this commit. Add to the receipt's notes, and to the P6C-T6 or release checklist: no build for a server that sends phase 5 keys until P5-T18a and T18b (and T18d, T21) have merged, or raise the minor and the minimum again when they do. This is the owner's or controller's call.

**m3. P3's "a pending choice or draft holding a money key is still refused" is held by code and by no test.**

- Evidence: point 4. Mutants O18 and O19 survive all 25 `diaryRepository.test.ts` tests; the planner's 57 mutants touch no `diaryRepository.ts` line, so nothing in the kit pins the ruling either.
- Impact: before P5-T5 and P5-T10 a vault answers these keys with 422 `UNKNOWN_FIELD` (receipt, "Release"), so a queued command carrying one would be a permanent refusal in the outbox. The guard that prevents it is untested, and P5-T17 and P5-T21 will widen it on purpose.
- Fix (test only, about 8 lines): in `diaryRepository.test.ts`, next to the `{ version: 9 }` case, assert `keepChoice` rejects `{ currency: 'JPY' }` and `{ trip_id: null }` and `savePending` rejects a draft with `currency` and one with `trip_id`. P5-T17 or P5-T21 then flips them on purpose.

### Nits

**n1. Leading zeros in the new amounts are untested.** Mutant O11 (`AMOUNT_OR_ZERO = /^[0-9]{1,11}$/`) survives `shapes.test.ts`. The code refuses `'00'` and `'007'` for home, wallet and exchanged amounts (probe 5). Add `home_amount_minor: '007'` and `wallet_amount_minor: '00'` to the refused list (`apps/edge/test/contracts/shapes.test.ts`, lines 145 to 158).

**n2. Two exact-set cases are untested.** O14 (a transfer holding `wallet_amount_minor` in place of `to_amount_minor` is checked as an entry) and O15 (a built-in skips the icon list) survive. The code refuses both (probe 5). The refused list holds a transfer with both keys and a custom category with a bad icon only. Add `{ ...transfer-without-to, wallet_amount_minor: null }` and `{ ...builtin, icon: 'boat', pack_key: null }`.

**n3. The contract's export comment does not carry the new columns' meaning.** `EXPORT_CSV_COLUMNS`'s comment still says `amount` is baht with two decimals and that spreadsheet-formula text is prefixed (`privacy.ts`, lines 70 to 77); the new block says only "the vault's export adds ... (P5-T14 fills them)". `apps/api`'s `exportRowCells` hard-codes `currency: csvLiteral('THB')` and a baht-only `minorToDecimal(row.amountMinor)` (`apps/api/src/exports/export-handler.ts:41, 44`). One sentence on `VAULT_EXPORT_CSV_CURRENCY_COLUMNS` would save P5-T14 a guess: from phase 5, `currency`, `amount_minor` and `amount` are in the record's own currency, each `*_amount` is `minorToDecimal(minor, code)` of its own currency, and `trip_name` is user text under the formula-prefix rule.

**n4. `parseRate` bounds significant digits, not length; the vault's `rate` column bounds length.** Probe 4: `'0.' + 39 zeros + '1'` (42 characters, 1 significant digit) is accepted by `parseRate` and by the snapshot validator, but fails `length(rate) BETWEEN 1 AND 40` (migration line 64). No feed and no `rateFromAmounts` result can be that long, so only a client-supplied own `rate` could reach it, and P5-T1 owns `parseRate`. Carried to P5-T10 below.

## What I ran

All under `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p5-t2-second/` (the copy is rebuilt by `linkfarm.sh`; nothing is kept under `/private/tmp`).

- **Baseline in the copy:** `shapes.test.ts` 9 passed (`base-shapes.log`); `resources.test.ts`, `clientVersion.test.ts` and `aiClientVersion.test.ts` 23 passed (`base-app.log`); `test:api -- src/v1/contracts.spec.ts` 95 passed (`api-contracts.log`).
- **Probes:** `probes/probe1.ts` (contracts, 163 checks), `probe2.ts` (app, 25), `probe3.ts` (base against this commit, plus change groups), `probe4.ts` (rate length), `probe5.ts` (the exact-set and leading-zero cases). Scratch-only tests in the copy: `tree/apps/app/src/storage/p3probe.test.ts` (3 passing) and `p5probe.test.ts` (the yen balance). Output is in `probes/*.out`.
- **Planner mutants, a sample of 10 of 57** (`mutants.out`): W1 (the older wallet takes any ISO currency; the edge case and the API spec both fail), C5, R2 (the plan's partial-keys mutant), R12, R14, R16, R17, R24, T1 (the plan's totals mutant) and V3: **10 of 10 killed, each by the case it names, all restored.**
- **My own, 11** (`mymutants.py`, `mymutants.out`, plus O18 and O19 run inline against `diaryRepository.test.ts`):

| Id | Mutant | Result |
| --- | --- | --- |
| O1 | the month summary may not name a currency | survived (m1) |
| O2 | a named currency is checked only with a count | survived (m1) |
| O11 | home and wallet amounts take leading zeros | survived (n1) |
| O12 | an exchanged amount takes leading zeros and 0 | killed |
| O13 | a rate day capped at 2026-12-31 | survived; by design, a snapshot check has no "today" |
| O14 | a transfer holding `wallet_amount_minor` is checked as an entry | survived (n2) |
| O15 | a built-in skips the icon list | survived (n2) |
| O16 | control: `wallet.archived !== undefined` on the older shape | survived, as a control must |
| O17 | a trip id is any string of 36 characters or more | killed |
| O18 | a pending choice's changes accept `currency` and `trip_id` | survived (m3) |
| O19 | a draft's keys accept five money keys | survived (m3) |

- **Not run, by R100:** whole suites (CI above), database suites (Docker stays stopped), the eight wallet catalogue kit files (no catalogue section) and `typecheck:routes` (CI ran it). No load flake: none of my runs timed out, and no rerun was needed.

## Notes for later tasks

- **P5-T5, P5-T10, P5-T11 (the vault must send what these validators accept; a refusal throws at `change-log.ts:88` on write, and fails a whole page on a phone):** `home_amount_minor` is `coalesce(...)`, never null (the column is nullable). `trip_id` must be a lower-case UUID (the column has no check). `rate_date` must be a real date from 1970 (the CHECK accepts earlier years). `currency`, looks, icons and pack keys must be checked against the contracts' lists (the SQL checks shape only, lines 27, 34 to 36, 57, 59 and 62).
- **P5-T10:** bound a request's `rate` by length or range before it reaches the column (n4), so a 42-character rate is a 422 on `rate` and not a constraint failure.
- **P5-T11 and P5-T25:** the app's `history()` writes every filter key with `String(value)` (`resources.ts:202`), so `wallet_ids: []` becomes `wallet_ids=` (probe 2). The parser must refuse an empty list (1 to 20, never with `wallet_id`) and callers must omit it. No test pins the comma-joined form yet (the receipt says so too).
- **P5-T14:** the export fork must read the record's currency (the base writes `csvLiteral('THB')`), use `minorToDecimal(minor, code)` for every decimal column, and send `trip_name` through `csvText`, `trip_id` through `csvLiteral` and `rate` through `csvNumber` (the three encoders of `apps/api/src/exports/csv-writer.ts`). See n3.
- **P5-T17 and P5-T21:** when they widen `CHANGE_RULES` and `ENTRY_KEYS` for money keys, replace the m3 tests with the positive cases in the same commit.
- **P5-T18a and P5-T18b:** `recomputeTotals` (`diaryRepository.ts:238 to 263`) and `pendingTotals.ts` add `amount_minor` as the wallet's currency today. The scratch probe `tree/apps/app/src/storage/p5probe.test.ts` (¥4,620 on a baht card: `95380` against the vault's `-6814`) is a ready RED for `confirmed balances follow each wallet's currency`.
- **P6C-T6 and the release checklist:** the minimum `0.3.0` is a reading floor (m2). Gate the first build for a phase 5 server on the app lane through P5-T18b, T18d and T21, or raise the minor and the minimum again then.

VERDICT: Approved
