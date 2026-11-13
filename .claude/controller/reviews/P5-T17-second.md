# P5-T17 second review: trips, today's rates, the home currency and the rates cache (money-path second reviewer, Claude Sonnet 5.5)

**Reviewed:** `3f5670a9` on `p5/t17-rates-client` (PR #449), range `origin/claude/p1a-vault-core...3f5670a9`, parent `87a37080`. The base has moved one commit since (`925c02f5`, a controller-state sync); nothing under `apps/app` or `packages/` changed, so nothing in this task's paths can conflict. The worktree is clean at `3f5670a9`. I made no edit, commit or push anywhere and touched nothing in the main checkout.

**Method:** I read the plan task (line 742), the rules it cites (P5-T6 line 391, P5-T9 lines 510 and 511, P5-T12 lines 599 and 605, P5-T13 lines 626 to 635, X5, X17, the Global Constraints, Review Focus 2), the brief, the receipt and followups.md line 726, then every changed file cold. Probes ran in a `git archive` copy (`.claude/controller/scratch/p5-t17-second/tree`, `node_modules` symlinked from the worktree). I did not read the other reviews of this task.

## Result

No blocker and no major. The transport, the resources, the cache and the fake do what the plan says, and every money, session and privacy question in the controller's focus list answers "held" (answers below, with probes). I found five guards that no committed test holds, by mutants of my own that the planner's 96 do not cover: three minors and two nits. The code under each is correct today, each dies to a few lines of test, and none changes the verdict.

## CI on PR #449 (all nine jobs pass; counts from the job logs)

| Job | Result | Counts |
| --- | --- | --- |
| Typecheck, unit, API, build | pass (1m52s) | API jest 47 suites, 1000 tests; `test:app` 37 of 37; `test:unit` 1101 of 1101 (the Hermes guard included) |
| Render (every file but the per-section suites) | pass | 130 files, 1680 tests |
| Render, per-section suites (every other test, ids 3n, ids 3n+1) | pass | 252 + 190 + 232 = 674 passed of 674 (the split skips the rest by design) |
| Exports (web and iOS bundles) | pass (2m6s) | the fake, which `app/dev/catalogue.tsx` reaches through the dev catalogue, now has BigInt literals and a `.ts` import path; both bundles build with it |
| Edge Worker | pass | three vitest runs: 20 files and 206 tests; 35 files and 831 tests (1 todo); 3 files and 12 tests |
| SQL integration and ops | pass | jest 41 suites, 694 tests; node tests 111 of 111 |
| Release image and smoke | pass | |

The job logs are saved under `.claude/controller/scratch/p5-t17-second/ci/`. CI's `test:app` (37) and `test:unit` (1101) equal the implementer's gate logs.

## What I ran

- **Focused files, my copy:** the five files (`client`, `resources`, `ratesCache`, `fakeResources`, `diaryRepository` tests): 71 of 71 pass.
- **Kit identity:** the nine code files are byte-identical to the planner's `real/`; the receipt differs only in `BASE_SHA` (now `87a37080`). The implementer's logs match the receipt: RED 71 / 58 / 13 with 13 `ERR_ASSERTION`, GREEN 71 / 71, mutants "96 of 96 killed; survivors []", routes 4 files and 17 tests, fake render 2 files and 41 tests.
- **Static:** `git diff --check` over the range is clean. The added code has no `Number(`, `parseFloat`, `parseInt`, `Intl`, `toFixed` or `Math.`; the only arithmetic is BigInt (`fakeResources.ts:65-77`). No log line, analytics call, storage call (beyond the `KeyValueStore` it is handed), em dash or en dash.
- **13 planner mutants rerun on my copy:** C2, C6, C8, R17, R20, R22, K1, K2, F6, S9, H1, O18, O19. 13 of 13 killed, each by an assertion alone, each restored (checked with `cmp` against the worktree's files).
- **17 mutants of my own** (`my_mutants.py`; logs in `my-mutants/`): 6 killed, 11 survived.

| Mutant | What it does | Result | Disposition |
| --- | --- | --- | --- |
| MC1 | a 304 skips the session-epoch check (`client.ts:414`) | survived | m2 |
| MF1 | the summary's `rates` read from expenses only (`fakeResources.ts:462`) | survived | m3 |
| MD1 | a transfer draft's keys take every money key | survived | m1 |
| MD2 | a choice's changes take `rate`, `rate_source`, `home_amount_minor`, `home_currency`, `to_amount_minor` | survived | m1 |
| MD3 | an entry draft's keys take `rate`, `rate_source`, `home_amount_minor`, `home_currency` | survived | m1 |
| MF14 | the fake stops returning its `trips` Map | survived | n1 |
| MF16, MF17, MF18 | the call log's arguments change order (`updateTrip`, `setHomeCurrency`) or go missing (`ratesToday`) | survived | n1 |
| MF2 | the same-currency refusal runs before the version check | survived | note N1 |
| MF4 | the version check runs before the deleted check (`lockedTrip`) | survived | note N1 |
| MF19, MD4, MD5, MK1, MK2, MR1 | `tripSummary` unlogged; `currency` or `trip_id` alone in `ENTRY_KEYS`; refresh keeps the old ETag when the new one is null (MK1) or keeps the old set beside the new ETag (MK2); a create sends `If-Match: 0` | killed | |

- **Probes** (copies in `scratch/p5-t17-second/probes/`; none committed). Against the commit, all pass: `zzProbeTransport.test.ts` A1 to A3, B1 to B6, E1, E2 (12 of 12); `zzProbeFake.test.ts` C1 to C9 (9 of 9, six of them documenting divergences from the vault, see the notes); `zzDiaryProbe.test.ts` D1 to D3 (3 of 3). Rerun against the survivors, A2, C7 and D1 to D3 kill MC1, MF1, MD1, MD2 and MD3 (`my-mutants-probe.out`).

## Answers to the controller's focus

**1. The conditional reads (`client.ts:416-421`, `:445-446`).** A 304 is `NOT_MODIFIED` only when `status === 304 && request.ifNoneMatch !== undefined`; any other 304 falls to the non-2xx branch and reads `invalid` with status 304. The validator must accept the symbol (`resources.ts:294`), or the read is `invalid_response`. `etag` is heard once, after `stillCurrent()` and after `validate(payload)`, from the same `result` as the body, so the ETag a cache stores is always the one that came with the body beside it, also after a 401 refresh and resend. It is never heard from a 304 or from a refused body. Probes: A1 (401, refresh, resend keeps If-None-Match, then 304 reads unchanged), A2 (a 304 after an epoch change is `session_changed`, not unchanged), A3 (a 200 after an epoch change is dropped and its ETag unheard), B1 (200, 304, 200 over the real transport and the cache), B2 (a 304 to a read that sent no ETag is refused and the cache stays).

*Could a stale or forged ETag make the phone keep wrong rates?* No, by the protocol. A stale ETag (an older set's) no longer equals the server's, which is the first 16 hex digits of the SHA-256 of the canonical JSON (P5-T6, line 390), so any change of content changes it: the server answers 200 and the cache is replaced. The cache cannot hold a new ETag beside an old set, because both come from one 200 (`ratesCache.ts:51`; my MK1 and MK2, which pair the old ETag with the new set and the old set with the new ETag, both die on `a refresh stores a new set with its ETag`). A forged one needs TLS broken (the transport refuses `http://` except loopback and, in development, a LAN address, `client.ts:290-294`) or a hand edit of the device store that supplies a valid set and the server's current ETag; and the set feeds estimates only, since the vault freezes the rate at save (Review Focus 2). A damaged cache reads as none and the next unconditional 200 replaces it. Residual cases, none of them a wrong keep: (a) a cached ETag that is not a legal header value would fail every refresh and keep the old set (probe B3; only a hand-edited store can produce one, n2); (b) an intermediary that rewrites a strong ETag to a weak one would make the server's equality check miss, so every read is a 200 (cost, not correctness); (c) `refreshRates` does not compare `as_of`, so a lagging replica's older 200 replaces a newer set until the next refresh. P7 chose that on purpose (the server is the source of truth) and I agree.

**2. `refreshRates` (`ratesCache.ts:42-58`).** It reads the cache (`readCachedRates` cannot throw: the `get` and the parse are inside its `try`), asks inside a `try` (a network failure, 503, `invalid_response`, `session_changed` or a synchronous throw all answer `cached`), answers `cached` for `'unchanged'`, and writes only a new set, inside its own `try` (the `JSON.stringify` too). The one write is after a validated 200. B1 to B3 run it over the real transport; K1, K2 (my sample) and K6, K7 (the planner's run) die on the guards. No finding.

**3. `setHomeCurrency` (`resources.ts:300-302`, `ackForCommand` at `:213-214`).** If-Match is sent exactly when `version !== null` (`version ?? undefined`; a `0` would go out as `"0"`, probe B6, and the contracts' versions start at 1, so the vault can only read it as a stale version, never as none). The acknowledgement is matched by command alone: a forged ack for another entity with the same command id would pass (B5), which is ruling P4 (the settings id is derived on the server); a real server does not do that. Can a lost answer, a resend or a conflict leave the phone and the server on different home currencies? Not through this client:
- *Lost answer:* the transport resends the same key, body and If-Match (probe E1) and the vault replays (P5-T13's `a resent change replays without recomputing again`).
- *Resend with another body under the same key:* 409, outcome `idempotency_mismatch` (E2).
- *Conflict:* `V1Error('conflict', 409)` with `current` handed through (E2).
- *A second command id after an unknown outcome:* refused by If-Match when a version is known, and by "If-Match required once a settings row exists" when it is null (plan line 626), so a change cannot land twice with two currencies; at worst the retry reports a conflict for a change that already landed. That is a screen concern (N2). The phone learns the home currency through sync and `/v1/me`, not from this call's answer.

**4. Exact money.** Held. The only arithmetic added is BigInt: `largerFirst`, `tripMoney` (`fakeResources.ts:65-78`); amounts and rates travel and cache as the strings the server sent, and nothing parses a rate. No `Intl`, no `Number()`.

**5. The fake against P5-T9's overlap rule and P5-T12's summary rules.**
- *Overlap (`fakeResources.ts:143-145`, `:424`, `:435`).* Inclusive at both ends (a touching day is shared), skips deleted trips and the edited trip itself, reports `starts_on` on a create, and on an edit `ends_on` when `starts_on` is not among the changes, else `starts_on`: P5-T9 line 511 word for word. F1 to F7 hold both ends and both fields; F6 reran killed.
- *Summary (`:448-480`).* I rebuilt the plan's golden trip from the figures it prints (P5-T12 line 607, P5-T28 line 1245: twelve yen expenses with their stored home amounts at 0.2317, 0.2308 and 0.2312, plus the ฿10,000 exchange) as an oracle the planner did not use. The fake answers count 13, totals `38200`, `883184`, `0`, days `14238/329894`, `17782/410409`, `6180/142881`, and rates `0.2317`, `0.2308`, `0.2312`, all reference (probe C8). Tagging Grab's ฿312 gives `other_home_minor 31200`, `spent_home_minor 914384` and day 3 at `174081` (C9). Both rules hold.
- *Where the fake still differs from the vault:* the record, balance and total methods it did not touch (notes N3), a few unpinned check orders (N1) and the zero-day question (N4). None is a rule P5-T9 or P5-T12 states for this task.

**6. Followups line 726.** The four pins are there and each dies on the right guard (O18 and O19 killed). But they hold two of the seven money keys (`currency`, `trip_id`) for an entry draft and for a choice's changes, and no transfer draft: m1.

## Findings

### Blockers

None.

### Majors

None.

### Minor

**m1. P3's refusal is pinned for two of seven money keys and for no transfer draft.** `diaryRepository.test.ts:101-103` and `:448-450`; guards `diaryRepository.ts:110` (`ENTRY_KEYS`), `:111` (`TRANSFER_KEYS`), `:187-196` (`CHANGE_RULES`). followups.md line 726 asked for exactly these four tests, so they follow it, but P3's ruling reads "a money key". Survivors: MD3 (`ENTRY_KEYS` takes `rate`, `rate_source`, `home_amount_minor`, `home_currency`), MD1 (`TRANSFER_KEYS` takes all seven), MD2 (`CHANGE_RULES` takes `rate`, `rate_source`, `home_amount_minor`, `home_currency`, `to_amount_minor`); the committed tests stay green on each. `rate` and `home_amount_minor` fix what a record is worth in the home currency, so they are the keys most worth pinning. Probe `zzDiaryProbe.test.ts` D1 to D3 loops over all seven (`currency`, `rate_source`, `rate`, `home_amount_minor`, `home_currency`, `trip_id`, `to_amount_minor`) for entry drafts, transfer drafts and choice changes: it passes on the commit and each of the three mutants fails its case. Fix: replace the two pairs of lines with loops over the seven keys and add the transfer loop. P5-T18a then flips the keys it admits to positive cases in its own commit, as the receipt already says.

**m2. Nothing holds that a 304 is dropped after the session changed.** `client.ts:414` runs `stillCurrent()` before the 304 branch, so a conditional read answered after sign-out or an account switch rejects `session_changed`. MC1 (the check skipped for a 304) survives the committed client test and `sessionEpoch.test.ts`, and none of the planner's 96 mutants moves it. Probe A2 (a `fetchImpl` that moves the epoch before answering 304) passes on the commit and kills MC1. The harm today is nil (public data), but the guard is the transport's isolation promise applied to the one new kind of answer this task adds. Fix: add that case to `client.test.ts`.

**m3. The summary's `rates` rule "of a tagged record" (any type) is not held.** `fakeResources.ts:462` reads `tagged`; P5-T12 line 605 says "of a tagged record". The fixture's income (`fakeResources.test.ts:103`) is yen on 3 November at 0.2312, the same row as expense 1, so the de-duplication hides it, and the exchange is in baht (home). MF1 (read `expenses` instead) survives; probe C7 (a tagged income alone, on a day and rate of its own) kills it. The code is right. Fix: give the income its own day or rate in the fixture.

### Nits

**n1. The fake's call-log arguments and its `trips` Map are not held.** `fakeResources.ts:430`, `:482`, `:495`, `:532`. MF16, MF17, MF18 and MF14 survive: `fakeResources.test.ts` reads `calls[].method` only and never `fake.trips`. Later tests will read `args[1]` for a version. One `deepEqual` on `fake.callsOf('updateTrip')[0].args` (and on `setHomeCurrency` and `ratesToday`) and one on `fake.trips.get(id)` close it.

**n2. `isCachedRates` takes any string as an ETag.** `ratesCache.ts:21`. A cached value that is not a legal header value (probe B3 uses a CR LF) makes every refresh fail inside the transport, and `refreshRates` then answers the old set for ever. Only a hand-edited device store can produce one; a server-sent ETag is a legal header value. Reading a shape other than an entity-tag (`"..."` or `W/"..."`) as damaged would make it read as none and heal on the next 200; add it to `a damaged cache reads as none`.

## Notes for later tasks

- **N1 (P5-T9, T13 and the fake): pin the order of checks.** The fake checks If-Match before "same currency" in `setHomeCurrency` (`fakeResources.ts:498-499`) and "deleted" before the version in `lockedTrip` (`:138-140`). Neither order is held (MF2, MF4) or stated in P5-T9 or P5-T13. When those routes exist, pin each order in the vault's test and make the fake follow. The fake's `VERSION_CONFLICT.current` is `null` before the first change (the settings row does not exist yet); say what the vault answers in that case.
- **N2 (P5-T18c, T26: callers of `setHomeCurrency`).** It has no per-request time limit, and C8 rewrites every record in one vault call (P5-T13), so the transport's 20 s limit can report `TIMEOUT` as a `network` outcome while the vault still commits. Resend with the same command id (the transport's own resends already do) or read `commandStatus([id])` before offering a retry, and read a `VERSION_CONFLICT` whose `current.home_currency` equals what was asked as done. After a commit the vault moves `pruned_through` (P5-T13 rule 7), so the phone must resync before it shows any home amount.
- **N3 (P5-T21, T22, T25 and any task whose first screen test creates records through the fake).** The fake's record, balance and total methods were not widened and differ from the vault for phase 5 records (brief ruling P8 accepts this; probes C1 to C6 show it): it stores a create's input verbatim, including the input-only `home_currency`, so the stored row fails `isTransactionSnapshot` (C1); it has no `assertTripTag`, so an unknown trip, a deleted one, or a date outside the trip is taken (C2; the vault answers `errors.trip_not_found` or `errors.trip_dates` on `trip_id`); a tagged record stored without `home_amount_minor` makes `tripSummary` throw a TypeError instead of anything the server would do (C3); `updateTrip` applies a `currency` edit handed to it at run time (C4; the vault answers UNKNOWN_FIELD); `balance()`, `history()` and `summary()` add `amount_minor` and ignore `wallet_amount_minor` and the stored home amounts, so a yen record on a baht card moves the card by yen (C5, C6). Each task should widen the fake in the commit where its first screen test leans on the rule.
- **N4 (P5-T12, T23).** P5-T12 does not say whether a day holding only an income or an exchange appears in `days` with zeros; the fake lists days that have an expense. The golden trip has an expense every day, so no figure decides it. State it in P5-T12's test and align the fake.
- **N5 (P5-T18a, T18c).** Widen the pins for every key `assertDraft` admits and keep refusing the rest (m1 has the loop). `readCachedRates` never ages a set out: read `as_of` before estimating from a set that may be days old, and do not start a refresh after sign-out has begun (the erase and a late write could interleave; the data is public, so this is tidiness only).
- **N6 (P5-T6).** The client sends the one ETag it was given and treats only a 304 as unchanged. The deployed check (SKIPPED here, ruling P15) should go through the real edge, because an intermediary that rewrites ETags would turn every conditional read into a 200: correct, but the saving is lost.
- **Followups to carry (the controller's call):** m1 with P5-T18a (it flips those pins anyway); m2, m3, n1 and n2 as optional test additions to whichever task next edits these files.

VERDICT: Approved
