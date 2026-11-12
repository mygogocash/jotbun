# P2-T21 second review (money, wallet, privacy): A new wallet, editing a wallet and the correction tray

- **Reviewer:** Claude Sonnet 5.5, the independent second reviewer. Written before I read `reviews/P2-T21.md`, as asked.
- **Reviewed:** commit `2411001e` on `p2/t21-wallet-edit` (PR #429, base `claude/p1a-vault-core`), range `origin/claude/p1a-vault-core...2411001e`: one commit, 19 files. `git fetch` first. The PR head on GitHub is `2411001e6b3f`, the same commit.
- **Read-only:** nothing edited, committed or run in any worktree, and the main checkout untouched. Probes and mutants ran in a `git archive` copy with `node_modules` symlinked (`.claude/controller/scratch/p2-t21-second/tree`); its sources equal the commit's (sha256 checked after every mutant). Docker stays stopped, so database suites are CI's.
- **Against:** plan `### Task P2-T21` (line 1158), the Global Constraints, W1, W6, W7, W10, W25, W27, W30, Review Focus 2 and 3, the brief's rulings P1 to P21, the protocol, and the controller's four focus points.

## Summary

No blocker and no major. Money is exact (BigInt satang end to end, proven past 2^53), the writes are held one per press with a resend under the same key, private mode leaks no stored or created amount anywhere in the DOM, and the only event the PR adds is one `wallet_added` per wallet with three enumerated properties. I found three minors and four nits. Two minors are about code and tests (the edit screen's navigation is not held; four guards on the writes path survive my mutants because the PR's tests do not pin them), and one is a plan-level gap that needs an owner call (what a credit card's opening balance means). None blocks the merge; m1 and m2 are cheap to fix in the next task that touches these files, or in a small fix round if the controller prefers.

## CI (R100)

All nine jobs pass at head `2411001e` (run 43142446821):

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | pass: `typecheck`, `typecheck:app`, `typecheck:routes`, `test:api`, `test:app` 35 of 35, `test:unit` 1037 of 1037, `test:dev` 7 of 7, `build`, release graph, parser sandbox, `git diff --check` |
| Exports (web and iOS bundles) | pass |
| Render (every file but the per-section suites) | pass, 121 files, 1502 tests |
| Render, per-section suites (3n, 3n+1, every other test) | pass, 178 + 220 + 236 passed, 456 + 414 + 398 skipped (634 each, by design) |
| SQL integration and ops, Edge Worker, Release image and smoke | pass |

Local, focused files only: `NewWallet` + `WalletEdit` render 21 of 21; the four shared files (`PlanningRoutes`, `WalletsList`, `walletCommands`, `useWalletMotion`) 49 of 49; the other three routes tests (`SpendRoutes`, `AccountRoutes`, `InsightsRoutes`) 8 of 8; `draftText.test.ts` 4 of 4; `git diff --check` clean. No whole suite, export or database suite was run (rule; CI has them). No load flake. The base has moved to `eadcf3f1` (#428 and state syncs); none of this PR's 19 files is among the 439 changed since `150cfb82`, so no textual conflict is expected.

## Findings

### Blockers

None.

### Major

None.

### Minor

**m1. The edit screen's navigation is not held: one press can pop two screens.**

- Evidence: `WalletEditScreen.tsx:285` (the header's Back is never disabled); `:168-171` (a `done` calls `onBack()`, that is `router.back()`, after the await whatever happened meanwhile); `:211-214` (an unchanged save calls `onBack()` with no `held` check). The new-wallet flow holds its own back while a command is out (`NewWalletFlow.tsx:210`, `disabled: locked`); the edit screen does not.
- Failing probes (scratch `ProbeSecond.render.test.tsx`): **W3** holds `updateWallet`, presses บันทึก, presses กลับ, releases: `router.back` is called twice (once by the press, once by the save's `done`). **W4** clicks บันทึก twice in one `act` with nothing changed: `router.back` twice. Control **W3b**: the flow's back is `aria-disabled` while a create is out.
- Effect: not money. The person leaves, then a second pop takes them off the screen under it (Home instead of the wallets list), and a refusal or lost answer arrives on a screen they already left. An archive is not hit (`dismissTo` is idempotent).
- Fix: `disabled={locked}` on the header Back (the flow's rule), and guard the unchanged path with `held`. Pin with W3 and W4.

**m2. Four guards on the writes path are not pinned by the PR's tests (my mutants survive; the code is right).** Each was killed by a probe of mine on the same file, so none is equivalent.

| Mutant (my id) | Where | PR tests | My probe that kills it |
| --- | --- | --- | --- |
| EF1: drop `if (held.current) return;` from the edit screen's `retry` | `WalletEditScreen.tsx:229-232` | `WalletEdit` 9 of 9 pass | S3: two clicks on Try again in one `act` must send one resend |
| FF5a, FF5b: drop `disabled={locked}` from the faces and from the materials | `WalletFields.tsx:157`, `:190` | `NewWallet` + `WalletEdit` 21 of 21 pass | FF5: with a create unconfirmed, all ten radios are `aria-disabled` |
| NF5: `useState(newId)` becomes `newId()` (a new wallet id every render) | `NewWalletFlow.tsx:104` | `NewWallet` 12 of 12 pass | NF5: with no account open, the derived look stays one look across nine key presses |

- Why they matter: plan P9 says that while a command is out or its answer unknown "the name, the faces, the materials and the keys do not change, so Try again sends what the person saw"; the tests pin the name, the keys and the button only. NF5 is the plan's "one wallet id per flow" write rule; with no account the card would change material on every key, and the no-account case cannot see it because it spies `crypto.randomUUID` to one fixed value. The flow's own Try again guard is pinned (NF1 killed by the two-press case); the edit screen's is not.
- Also unpinned: no case has a balance past 2^53 (the largest value in the tests is the cap, 99,999,999,999). The code is exact (M1 below), and `ArchiveLater` and the preview are where an unbounded balance is drawn (`isMinor` allows 40 characters), so it is worth one case.
- The "109 mutants, all killed" claim holds for the planner's set (the ten I reran were all killed); it does not cover these four.

**m3. A credit card's opening balance cannot say "what I owe" (plan gap; needs an owner decision, not a code fix).**

- Evidence, probe **C1**: a new credit card with 5,000 typed as ยอดเริ่มต้น is created with `opening_minor: '500000'`; the preview and the ceremony card speak "Visa, 5,000 baht left" while the card's visible kind line reads "Amount spent" (`card/copy.ts:14`, `WalletCard.tsx:99`). `walletCardWords` words "spent" only at or below zero (`WalletCard.tsx:81`), and `walletsSummary` counts a positive balance of any kind as money held (`walletsList.ts:33-36`). The contract allows no negative opening balance (`packages/contracts/src/v1/wallets.ts:56`, `^(0|[1-9][0-9]{0,10})$`) and the keypad has no minus (W29), so an existing card debt cannot be entered, and step 2 does not say to start a card at ฿0 and record what was spent.
- A person who types what they owe gets a wallet that holds that money: the totals are wrong in the opposite direction, under a card that visibly says "Amount spent". The boards (`wc-wallet-type`, `wc-wallet-edit`) draw one generic label for every kind, and the PR follows them, so this is the plan's gap, and the wallet area is off. Recorded for E2-B and the owner before P2-T38 (a card-specific hint on the field, or the opening fixed at ฿0 for a card).

### Nits

- **n1. A reason chosen once is reused after a refusal, without asking again.** `WalletEditScreen.tsx:198` defaults `reason` to `form.reason` and `:219-223` keeps it in the form. After a refused send (the `problem` phase), a different correction goes out with the earlier reason and no tray. Probe **R1**: ฿5 with "Match my real balance", refused (`signed_out`), then ฿57: the second update is `{ opening_minor: '5700', correction_reason: 'balance_reconciliation' }`, no dialog. Mutant EF3 (the reason not kept in the form) also survives, so neither rule is pinned. Either rule is defensible; the plan says the tray asks first. Decide, then pin (for example clear `form.reason` on a refusal).
- **n2. A wallet whose tracking start is after the phone's Bangkok date cannot be saved at all on this screen.** `checkWalletForm` (`walletsModel.ts:170-174`) fails an unchanged tracking start in the future, the screen shows "วันที่นี้ยังมาไม่ถึง" (`WalletFields.tsx:228`) on a field it does not let the person change, and every save, a rename included, is refused (probe **T1**: no update sent). Needs a wrong device clock; the legacy Wallets screen has the date field. Validating only a changed tracking start on the edit path would remove the dead end.
- **n3. The drop's distance is the card's place plus 200, not "one card's height".** `SlideInUp` animates `originY` from `-values.windowHeight` to `values.targetOriginY` (`react-native-reanimated/src/layoutReanimation/defaultAnimations/Slide.ts:249-259`), so `originY` is a coordinate in the same space as the card's place, not an offset from it, and `withInitialValues({ originY: -200 })` starts the card at -200 in that space. The ceremony's card sits below the close button, so it travels its own place plus 200, and the "about 44 pt of overshoot" in P4e (worked out from 200) is an underestimate. No money; E2-B's simulator check will show it.
- **n4. Going back to the kinds and choosing again resets the face and material the person picked** (`NewWalletFlow.tsx:128-131`, even for the same kind); the name and the amount are kept. Harmless.

## What I checked, by the controller's four points

**1. Exact money (BigInt satang, past 2^53, no JS number).**
- No `Number(`, `parseInt`, `parseFloat`, `toFixed`, `toLocaleString` or `Math.` in the four parts, the two routes or the hook. A typed amount goes keypad, `evaluateKeypad` (BigInt, canonical satang string), `buildCreateWallet` / `buildWalletUpdate` (canonical string compare), then `createWallet` / `updateWallet`. A balance goes `walletPreview` (BigInt) and `formatMinor` (BigInt, canonical check).
- **M1:** a wallet with `balance_minor` `9007199254740993` (2^53 + 1) and opening 99,999,999,999. Preview "90,071,992,547,409 baht 93 satang"; archive line "฿90,071,992,547,409.93" (a double would end `.92`); after one key press "90,070,992,547,414 baht 94 satang", which is `9007199254740993 + 500 - 99999999999` exactly. Thai and English.
- **M2:** an opening of ฿24,860.05 shows "฿24,860.05" on the filled keypad; an unchanged save sends nothing; a rename sends `{ name }` only; a key starts over in whole baht; delete clears to 0 and the correction goes as `'0'`. **M3:** the cap on edit; nine 9s on a new wallet create `opening_minor: '99999999900'`.
- `filledKeypad` throws on a non-canonical or over-cap opening, but `isWalletSnapshot` holds a read to `^(0|[1-9][0-9]{0,10})$`, which is the cap, so the edit screen cannot crash on a read.

**2. The writes.**
- One command per press: `held` refs (`NewWalletFlow.tsx:113`, `WalletEditScreen.tsx:146`) are set synchronously inside `send`, before its first await. Two clicks in one `act` send one for create, Try again (flow), save and archive (PR cases) and for Try again (edit) and a tray reason (my S3, S3b).
- Try again resends the same command under the same key (`useCommandKeys.keyFor(slot, JSON.stringify(payload))`, settled only on a decided outcome). **A3:** lost answer, then the retry meets its own wallet: same key, one event, ceremony shows. **A4:** refused for good, then fixed and sent again: same wallet id, a fresh key, one event, one wallet. The blocked resend offers no Try again (PR case).
- A correction asks why first: `correctionNeedsReason` is true for a known-entries wallet and while that is unknown or failed; nothing is sent on close; Jotbun's own `correction_reason` field reopens the tray (PR cases, E2 killed). A rename never asks. The look is kept after `done` only (N1 killed). Archive is offered only at exactly ฿0 (BigInt equality, E1 killed) and a refused archive says so and re-reads.

**3. Private mode.**
- **P3, P4** scan the whole DOM HTML (attributes, values, styles, not just text and labels) for the stored and created amounts in every format, on the edit screen (before a key, after a key, with the correction tray open) and on the ceremony: none. **P3-control** finds them without private mode, so the scan is not vacuous. The preview, the ceremony card, the summary and both amounts of the archive line are masked, and spoken as "Amount hidden".
- What the person types is shown, and spoken by `wallet-opening`'s label (`WalletFields.tsx:212`), as `AmountStep` does (R106). That is the ruling, not a leak; P2-T37's sweep must exempt it.
- `PrivateModeProvider` reads as hidden until the store answers (`UNREAD`, line 42), so no amount flashes at launch. No test id carries an amount or a wallet id (all are enumerations).

**4. Logging and analytics.**
- The diff adds no `console`, logger or capture but one call, `trackWalletAdded` (`walletCommands.ts:57`), with `wallet_type`, `material` and `bun_face` only, each an enumeration in the allow-list (`analytics/catalog.ts:66-71`). No name, amount or id.
- Once per wallet: sent after `attempt` returns `done` for a create; a lost answer sends nothing until the retry's `done`. The PR's two-press case and my A1, A3, A4 each count one. An emitter that throws is caught outside the save's `try` (H1, H2 killed).

## Probes and mutants

- **Probes:** 22 in `scratch/p2-t21-second/tree/apps/app/src/wallet/wallets/ProbeSecond.render.test.tsx` (full run: `probe-all.log`). 18 pass and assert correct or exact behaviour or a control (M1 to M3, R2, A1 to A4, E1, S3, S3b, FF5, NF5, W3b, P3, P4, P3-control, C1). 4 fail by design and are findings: W3 and W4 (m1), R1 (n1), T1 (n2).
- **My mutants** (`mut.py`, `mutants1.json`, `mutants2.json`, logs in `mutant-logs/`): 6 applied to the PR's tests; NF1 killed; NF5, EF1, EF3, FF5a, FF5b survived (m2, n1). The four m2 survivors were then killed by my probes.
- **Planner's mutants, a sample of 10** (`tools/mutants.py` pointed at the scratch tree, logs in `planner-mutant-logs/`): N1, N3, N6, N27, F15, E1, E2, E26, H3, H4: 10 killed, 0 survived, each file restored with an equal sha256.

## Notes for later tasks

- **E2-B / owner (m3):** decide what a credit card's opening balance means before P2-T38. Today a positive opening on a card reads "left" aloud, "Amount spent" on screen, and counts as money held.
- **P2-T18 (shell) and P2-T24:** while a create is unconfirmed the flow disables Back and เพิ่มกระเป๋า (`locked`), and when the resend is blocked there is no Try again either. The way out is then the layout's auth redirect or the system back. There is no back handler on the fields (the receipt's own risk), so leaving mid-create on a phone can leave the wallet created and unseen, and a new flow would then add a second one (a new id). Check the shell keeps an exit on `/spend/wallet/new`, and consider a handler that holds the system back while a create is out.
- **P2-T22 and P2-T24:** the edit screen's archive uses the server's confirmed balance, as the list does, not `availableBalances` (balance less waiting drafts), so a wallet at ฿0 with a waiting draft can be archived. Decide the rule when the detail shows an available balance.
- **P2-T37 sweep:** `wallet-opening` (text and spoken label) shows what the person types in private mode by ruling R106; the stored opening is masked until a key is pressed (`isFilled`). Exempt only that.
- **A test task or a fix round:** lift probes W3, W4 (m1), S3, FF5, NF5 and M1 (m2) from the scratch file as pins, and settle n1 with R1.
- **E2-B:** n3 (the drop's real distance), and the receipt's own list of differences from the boards (P20).

VERDICT: Approved
