# P2-T14 second review (money and privacy): the add flow, the keypad and the amount step

- **Reviewer:** Claude Opus 5.5, the independent second review (money path and privacy), read-only. Written before reading `reviews/P2-T14.md`.
- **Reviewed:** PR #407, commit `18876253` on `p2/t14-add-flow` (range `origin/claude/p1a-vault-core...18876253`, one commit, 12 files, +1461 / -2), against plan P2's `### Task P2-T14` (line 901), the Global Constraints (money, line 89; anti-goals; analytics), W10, W14, W29, Review Focus 2 and 3, brief `briefs/P2-T14.md` (rulings P1 to P17) and the receipt `docs/implementation/receipts/P2-T14.md`.
- **Where:** a scratch copy, `git archive 18876253` into `scratch/p2-t14-second/copy/`, `node_modules` symlinked from the worktree. Nothing in the worktree or the main checkout was touched.

## Verdict

No blocker and no major. The money rules hold: Next takes exactly what `evaluateKeypad` accepts (never empty, zero, negative or above ฿999,999,999.99, always ฿0.01 to ฿999,999,999.99), the keypad types only through today's `applyKey`, `moveAllMinor` and `balancesAfter` stay in BigInt, and a transfer's Next can only go to the `transfer` step. No log line, analytics call, test id or label in the PR carries an amount or a wallet name. The chips' stored amounts are masked and said as hidden.

Four minors, all about hand-offs this PR sets up or paths it leaves untested. Three nits.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. Private mode: the amount line also shows amounts the person did not type, and the P2-T37 exemption would cover them all.**
- `AmountStep.tsx:76-91` draws `add-amount` (digits, and `spokenMoney` in its label) unmasked, as ruling P9 says ("the typed amount is never masked", `handover.md:662`). But the keypad also holds amounts put there by a tap.
- Probe 1 (`scratch/p2-t14-second/probes.log`): private mode on, the chip กาแฟเย็น shows `กาแฟเย็น฿••••` and says `กาแฟเย็น ซ่อนยอดเงินอยู่`. One tap (the chip's `apply` filling the keypad, as the receipt's P2-T16 note says) and the amount line reads `฿65`, labelled `65 บาท`. The stored amount the chip masked is now on screen and spoken. The catalogue's `bw-tray-amount` does the same (`addSections.tsx:77-83`).
- The same line will show:
  - P2-T15's move all: the wallet's whole balance, which private mode hides everywhere else;
  - P2-T16's Tell Bun fill and `copyOf` (`QuickAddScreen.tsx:238`, `keypadFor(source)`);
  - P2-T27's edit tray, which opens on a stored record's amount before any key is pressed.
- The receipt's P2-T37 note (and `followups.md:401`) says `add-amount` "is the one amount private mode leaves on screen, by design. The sweep must exempt it." As written, that exemption also hides these leaks from the sweep.
- **Ask:** the controller rules on the scope of P9 before P2-T15, P2-T16 and P2-T27 are briefed. Either filled amounts count as typed (then say so in the receipt and `followups.md`, and decide move all in private mode separately), or the line masks a filled amount until the first key.
- No code change is asked of this PR unless the ruling changes.

**m2. A quick chip's `label` is drawn and spoken verbatim, and today's often-logged label already ends with the amount in digits.**
- `QuickChips.tsx:65` draws `chip.label`, and `:49` speaks it, as given.
- The plan has P2-T16 build the chips from today's `oftenLogged` (plan line 982). Each `OftenLogged.label` is `` `${merchant} ${bahtWords(record.amount_minor)}` `` (`spend/v1/ai/oftenLogged.ts:65`).
- Probe 2 maps `oftenLogged()`'s own label into the chips, in private mode. The chip shows `กาแฟเย็น 65.50฿••••` and says `กาแฟเย็น 65.50 ซ่อนยอดเงินอยู่`. The digits leak past the mask, which is exactly the chip-label leak the dispatch asks about. Outside private mode the amount would also show and be said twice.
- The receipt's P2-T16 note does not say which field to use.
- **Fix (receipt note or brief):** the chip's `label` is the name only, `item.draft.merchant`, never `item.label`, and its `amountMinor` is `item.draft.amount_minor`. Also add a line to `QuickChips`' header that `label` never holds the amount. P2-T16's private-mode case should use a real `oftenLogged()` item.

**m3. After a satang fill, the keypad with no decimal key meets decimal states it cannot explain, and the `too_precise` branch is untested.**
- The keypad has no `.` (W29), but `keypadFromMinor` fills two decimals. Satang come from:
  - a chip from `oftenLogged`: `bahtWords` keeps satang;
  - Tell Bun's reading: `applyDraft`, then `keypadFromMinor`;
  - `copyOf`;
  - P2-T27's edit of any satang record.
- Probe 3 starts from `keypadFromMinor('6550')`:
  - a digit is refused with `too_precise`, shown as ใช้ทศนิยมไม่เกินสองตำแหน่ง / "Use at most two decimal places", a problem about decimals on a keypad without a decimal key;
  - delete walks `฿65.50`, `฿65.5`, `฿65.`;
  - a `0` typed at `฿65.` gives `฿65.0` (6500 satang, labelled `65 บาท`), not `฿650`.
- Nothing is saved wrong: what Next takes is what is drawn. But a person can easily mistype money here.
- Mutant R1 (`amountProblem` passes only `too_large`, dropping `too_precise`) **survives** the planner's Node and render files, and probe 3 kills it.
- The catalogue's comment "the two problems this keypad can meet" (`addSections.tsx:45-50`) holds only for its whole-baht samples.
- **Fix:**
  - add a case for a satang fill (a digit is refused with today's `too_precise` words, and Next still takes ฿65.50), which pins R1;
  - record a rule for P2-T16 and P2-T27 on how this keypad edits a satang amount. For example, delete takes the whole fraction (`฿65.50` to `฿65`), or the first digit after a fill starts a new amount (`fresh: true`). Today's `applyKey` stays unchanged either way.

**m4. A transfer's amount still shows the quick chips.**
- Ruling P4h says a transfer's amount "stands alone: no wallet chip, no บอกบัน and no name field", and rh-transfer draws no chips. But `AmountStep.tsx:97` renders `<QuickChips chips={chips} />` for every type.
- Probe 6: the catalogue's `bw-tray-amount`, switched to โอน, shows the dialog โอนเงิน with no wallet chip and no บอกบัน, but with all three chips.
- The plan's case "a transfer's amount stands alone" mounts the probe without chips, so nothing pins it.
- In P2-T16 a chip's fill goes through today's `applyDraft`, which sets `type: draft.type` (`spend/v1/ai/tellBun.ts:45`; often-logged entries are never transfers). So a tap turns the transfer into spending. That is visible, not a wrong record, but it is not the board.
- **Fix:** `{type === 'transfer' ? null : <QuickChips chips={chips} />}`, and pass `chipsOf()` in the transfer case, asserting `quick-chips` is absent. Or P2-T16 passes no chips for a transfer, and the receipt says so.

### Nit

- **n1. `moveAllMinor` above the keypad's cap is untested.** The receipt's P2-T15 note relies on `moveAllMinor` returning a balance above ฿999,999,999.99, so P2-T15 can catch `keypadFromMinor`'s throw and show `too_large`. Mutant R3, which withholds such a balance, survives the planner's files. One assertion (`moveAllMinor(new Map([['w', '100000000000']]), 'w') === '100000000000'`) pins the contract P2-T15 is told to rely on.
- **n2. `useAnnouncement(problem)` in `AmountFooter` (`AmountStep.tsx:106`) is untested.** Mutant R4, which drops it, survives. It is iOS's only way to hear the keypad's problem. A source pin, as R72 suggests for native-only behaviour, or a mocked `announcePolitely` would hold it. Accessibility, not money.
- **n3.** The catalogue's `PROBLEM_WORDS` comment; see m3. A few words, development only.

## What holds (evidence)

**Amounts (dispatch focus 1).**
- Probe 4, Next waits (`aria-disabled` true) for: nothing typed; `0`; `000`; `0 0`. The last three show today's zero words, กรอกจำนวนเงินที่มากกว่าศูนย์; nothing typed shows no words (P6, nothing nags).
- Next takes: `0 0 5` and `000 000 5` as `฿5` (leading zeros collapse); `keypadFromMinor('1')` as `฿0.01`; and `฿999,999,999.99`.
- Probe 5, the most digits: `1234567` then `000` is refused (`too_large`, จำนวนเงินสูงสุด ฿999,999,999.99) and the amount stays `฿1,234,567` with Next enabled. After one delete, `000` fits (`฿123,456,000`), and a further digit is refused.
- No minor-unit conversion happens in this PR: `draft.amountMinor` is never written. The keypad keeps satang, and `evaluateKeypad` gives canonical satang strings. No `Number(` anywhere in the new code.

**Balances (focus 2).**
- `moveAllMinor` is `null` for: no balances; a wallet that is not listed; `null`; `'0'` (F18, the plan's mutant, rerun and killed); `'-500'`. It returns a balance of `'1'`.
- `balancesAfter` is BigInt end to end (F22, the JS-number mutant, rerun and killed, on the 2^53 + 1 case). An unknown balance stays `null` (F23 rerun, killed). One wallet on both sides keeps its balance.
- A move larger than the from wallet's balance gives a negative after, as Quick add allows such a move (no refusal in today's `QuickAddScreen.tsx` or `WalletPicker.tsx`).
- No balance is drawn or used by any component in this PR.

**Private mode (focus 3).**
- The chips' amounts are `WalletAmount`'s (`฿••••`) and each chip says `{label} ซ่อนยอดเงินอยู่` (Q4, Q5 rerun and killed).
- My mutant R5 (the chip still says the amount in words while masked) is killed by the planner's private-mode case.
- The typed amount is unmasked by design. The wallet chip shows the wallet's name and material, never a balance.
- Test ids: `add-amount`, `add-wallet`, `add-tell-bun`, `add-name`, `add-problem`, `add-next`, `quick-chips`, `wallet-keypad`, `type-switch`. None carries an amount or a name.
- The announced problem words are constants.

**Transfers (focus 4).**
- `stepAfterAmount('transfer')` is `'transfer'` (F2 rerun, killed). Next uses it (A3 rerun, killed).
- A transfer's amount has no wallet chip, the only other `onStep` in the step (`AmountStep.tsx:93`).
- No path in this PR goes from a transfer's amount to `confirm`. For later hosts, see the notes.

**Logging (focus 5).** `git diff` of the range adds no `console.*`, logger, analytics emitter, Sentry or PostHog call (grep of the added lines: no match).

**The plan's mutants:** F18 and A1, both rerun and killed. **Sample of the planner's 92**, rerun in the scratch copy with its own runner: F2, F18, F22, F23, A1, A2, A3, K7, Q4 and Q5, 10 killed, every restore checksum equal (`scratch/p2-t14-second/planner-mutants.out`).

**My own mutants** (`scratch/p2-t14-second/own_mutants.py`, `own-mutants.out`):

| Mutant | Planner's files | My probes | Note |
| --- | --- | --- | --- |
| R1, drop `too_precise` | survives | killed | m3 |
| R2, Next waits while any refused key shows | killed | | |
| R3, move all withheld above the cap | survives | | n1 |
| R4, problem never announced | survives | | n2 |
| R5, the chip says the amount while masked | killed | | |
| R6, empty amount moves nothing | | | equivalent (`BigInt('')` is `0n`) |

Every restore was checked.

**Focused files in the scratch copy:** `addFlow.test.ts` and `draftText.test.ts`, 10 of 10 (`focused-unit.log`); `AmountStep.render.test.tsx`, 12 of 12 (`focused-render.log`). The new Node file is picked up by CI's `test:unit` (`scripts/test-unit.mjs` discovers every `src/**/*.test.ts`). Probes: 6 of 6 (`probes.log`).

## CI on PR #407 (run 43032132189, head `18876253`)

At the time of writing:
- **Passed (3 of 9):**
  - Exports (web and iOS bundles);
  - Render (every file but the per-section suites), which holds `AmountStep.render.test.tsx`;
  - Release image and smoke.
- **Not finished (6; at the last check, 14:05 UTC, one per-section suite was running and the rest queued):**
  - Typecheck, unit, API, build (with `test:unit`, so `addFlow.test.ts`);
  - the three per-section render suites, which open `bw-tray-amount` and `bw-tray-income`;
  - SQL integration and ops;
  - Edge Worker.

Job logs, and with them counts, are published only when the whole run completes. Read the six before merging.

## Notes for later tasks

- **P2-T16:**
  - Build each chip as `{ label: item.draft.merchant, amountMinor: item.draft.amount_minor, apply }`, never `item.label` (m2).
  - Pass no chips for a transfer, unless m4 is fixed here.
  - `TypeSwitchHeader` has no `disabled` (the plan's props, P7), so ignore `onType` while the tray is locked for a save.
  - If the switch stays in the header past the amount step, a change to `transfer` must go to the `transfer` step (or back to the amount), never stay on `confirm`, so a transfer can never skip its two wallets.
- **P2-T16 and P2-T37:** today's `TellBunSheet`, opened unchanged inside the tray (R69), knows nothing of private mode:
  - its often-logged pills show and say `entry.label`, with the amount in digits (`screens/redesign/ai/TellBunSheet.tsx:239`, `:246`);
  - Bun's reading shows `formatMinor` of the amount (`:295`).
- **P2-T15:**
  - `add.after` (หลังโอน {amount}) and `add.moveAll` (ย้ายทั้งหมด {amount}) put stored balances into placeholders. In private mode `{amount}` must be `common.amountHidden`, as `QuickChips` does for `add.chip`, and the drawn amounts must be `WalletAmount`'s.
  - Move all in private mode then puts the whole balance on the unmasked amount line (m1).
  - A move above the from wallet's balance gives a negative หลังโอน (allowed today). Red and green stay budget-only (§2).
- **P2-T27:** the edit tray reuses `AmountStep` on a stored amount: unmasked in private mode (m1) and, for a satang record, in m3's decimal states.
- **P2-T37:** scope the `add-amount` exemption to the ruling m1 asks for, not to the test id.
