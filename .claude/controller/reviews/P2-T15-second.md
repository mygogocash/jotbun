# P2-T15 second review (money and privacy): The transfer, confirm and pick steps

- **Reviewer:** Claude Sonnet 5.5, the independent second reviewer. I did not read the first review before writing this one (no `reviews/P2-T15*.md` file existed when I looked, before I started writing).
- **Subject:** PR #427 (`mygogocash/jotbun`, base `claude/p1a-vault-core`), commit `fd41909c` on `p2/t15-transfer-confirm-pick`, range `origin/claude/p1a-vault-core...fd41909c`. `git fetch` first; the PR head on GitHub is `fd41909cbd2e` (same commit). Read-only: the worktree is untouched (`git status` clean after my work); every probe and mutant ran in a scratch copy, `.claude/controller/scratch/p2-t15-second/tree` (`git archive` of the commit, `node_modules` symlinked).
- **Read:** the protocol (R87, R100, Reviewers), the plan's `### Task P2-T15` (line 940), W10, W12, W14, W15, Review Focus 2 and 3, the Global Constraints, the brief and its rulings (P1 to P19), the receipt, the three new step files, `copy.ts`, the catalogue diff, the committed test, and the code they call (`addFlow.ts`, `walletMoney.ts`, `WalletAmount.tsx`, `keypadExpression.ts`, `dateStep.ts`, `quickText.ts`, `tellBun.ts`, `quickAddModel.ts`, `recordModel.ts`, the vault's wallet rules).
- **Code identity:** the seven committed files are byte-identical to the planner's `real/` files (sha256 compared against `PL/SHA256SUMS`: all seven match). So this review judges the planner's design as shipped.

## Result in one paragraph

The money path is sound and I could not break it: every amount is BigInt satang end to end, balances past 2^53 stay exact on screen and in spoken labels, move all is refused one satang above the cap and offered at the cap, the swap swaps both the wallets and their balances-after, and no log, analytics call or test id carries an amount or an identifier. The privacy work is good for balances, after lines, move all and the wallet pick. **One privacy claim does not hold: the "what Bun read" line masks digits only, and Tell Bun's own parser also reads Thai number words ("ห้าสิบ", "สามหมื่น") and scale words ("2 พัน", "1.5k"), which reach the screen in private mode (major, M1).** Two minors (Next ignores the archived filter the cards apply; five mutation survivors, among them the minus sign on a negative balance) and a few nits follow. CI on `fd41909c` is green in all nine jobs.

## CI (R100)

`gh pr checks 427 --repo mygogocash/jotbun` (run 43139059876, head `fd41909c`), all nine jobs pass:

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | pass (2m23s); Node tests 35, 1037 and 7, `fail 0` each |
| Render (every file but the per-section suites) | pass (2m45s); 120 files, 1489 tests passed |
| Render, per-section suites (3 shards) | pass; 232, 176 and 224 passed (the rest of each shard skipped by sharding, 632 per shard). The logs do not list section ids, so I could not see the four new sections by name; the receipt records each passing in both suites locally |
| Exports (web and iOS bundles) | pass (2m3s) |
| Edge Worker, SQL integration and ops, Release image | pass |

Locally, in the scratch copy (R100, focused files only; the first two rows are my runs):

- `AddSteps.render.test.tsx` on the unmodified commit: 14 of 14 passed.
- The eight kit render files that import the wallet catalogue index (`CardStack`, `WalletLooks`, `PrivateMode`, `walletHarness`, `Tray`, `Lock`, `AmountStep`, `WalletsList`): **two runs.** First run 137 of 138: `WalletLooks.render.test.tsx` threw ENOENT reading a board file, because my scratch copy lacked `docs/design/bun-wallet` (my archive had only `apps/app`, `packages/contracts` and `package.json`). That was my copy's fault, not load and not the code. After adding the boards: **8 files, 138 of 138 passed** (the brief's N = 138). Logs: `kit-eight.log`, `kit-eight-rerun.log`.
- Not run, and why: the four routes tests, `test:unit` and `test:app` (CI's, and this change touches no screen an `app/` route imports; the receipt records them green); database suites (Docker stopped; none apply).
- The catalogue rule in the dispatch (lazy sections): `addSections.tsx` imports kit steps statically, as P2-T14's version already did; the files that use `lazy()` (`walletListSections`, `recordSections`, `recapSections`) lazy-load full screens. The new steps pull no `expo-crypto` (`Ranking` is a type import; `rankRecentCategories` comes from `recentCategories.ts`), and the eight kit files above pass. No concern.

## What I checked against the four focus items

**1. Exact money: holds.**
- `grep` for `Number(`, `parseInt`, `parseFloat`, `toFixed`, `toLocaleString`, `Intl.`, `Math.`, a unary `+` on a `...Minor` value and `parseAmount` over `TransferStep.tsx`, `ConfirmStep.tsx` and `PickSteps.tsx`: no match (exit 1). Balances-after is `addFlow.balancesAfter` (BigInt); text is `formatMinor` (BigInt); words are `spokenMoney` (BigInt, `ติดลบ` below zero).
- My probe (PROBE 4) with balances `9007199254740993` and `-9007199254740993` (one past 2^53) moving ฿500: cards read `฿90,071,992,547,409.93` to `฿90,071,992,546,909.93` and `−฿90,071,992,547,409.93` to `−฿90,071,992,546,909.93`; spoken labels are exact too (`90,071,992,547,409 บาท 93 สตางค์`, `ติดลบ ...`); the wallet pick's radio labels are exact; move all is not offered. The committed test pins only the visual text of the positive case; my probe adds the spoken labels and the negative side (all correct).
- Cap: `moveAllOffer` is `BigInt(all) <= MINOR_AMOUNT_MAX` (`TransferStep.tsx:75`; `MINOR_AMOUNT_MAX = 99_999_999_999n`). My mutants M1 (`<`) and M2 (`<= MAX + 1n`) both die on "move all is offered only for a known balance above zero and within the amount cap": the boundary is pinned both ways (`'99999999999'` offered, `'100000000000'` not, `'0'` and `'-500'` not).

**2. The transfer's two sides: holds.**
- Swap exchanges the two draft wallets (`TransferStep.tsx:111`); each card's balance and after line are looked up by its own wallet id, so they follow. Planner's X1 (the plan's mutant) dies; my M4 (swap leaves one wallet on both sides) and M5 (`balancesAfter` sides reversed) die.
- Next waits on `from === to` and on a missing side (planner's F1 dies). `WalletPick` swaps instead of duplicating (P15 dies). The save path re-checks (`checkEntryFields`: "Choose two different wallets").
- Gap: see m1 (an archived wallet).

**3. Private mode: holds for every stored amount; one gap in Bun's sentence (M1).**
- Balances, after lines, move all and the wallet pick are `WalletAmount`s (`฿••••`) with the label `ซ่อนยอดเงินอยู่`; no minus sign leaks for a negative balance (PROBE 4, private run: the only digits in the whole tray are the typed `฿500` and its `500 บาท`, which is R106's rule: what the person typed shows).
- A fill (move all, Bun's reading, a chip) is masked on the amount line and its spoken label (`masked = hidden && isFilled(keypad)`); my mutants M11 and M12 (labels ignore the mask) both die.
- Test ids are constants (`transfer-from-balance`, `confirm-row-wallet`, ...); none carries a wallet name, an amount or an id.
- The transfer amount line sits in a polite live region (`TransferStep.tsx:118`). In private mode a typed amount's label says the amount (R106's rule) but it never changes on this step (no keypad), so nothing is announced; tapping move all flips it to `ซ่อนยอดเงินอยู่` (PROBE 7). Fine as built.

**4. Logging: holds.** No `console.*`, logger, analytics, Sentry or PostHog call in the four source files or `addSections.tsx` (`grep` exit 1); the diff adds no event (W27). The only side channels are `playHaptic(<moment name>)` and `useAnnouncement('Choose two different wallets')`, fixed words.

**Not applicable here:** auth, points and payment code (none in this PR).

## Findings

### Blocker

None.

### Major

**M1. Private mode masks digits only: Thai number words and scale words in "what Bun read" show the amount.**
- Where: `ConfirmStep.tsx:60` (`NUMBER = /(?:฿\s?)?[0-9๐-๙]+(?:[.,][0-9๐-๙]+)*/g`) and `:92` (`bunSentence.replace(NUMBER, HIDDEN_AMOUNT)`), drawn at `:108`.
- Claim it breaks: brief P8(c) and the receipt ("every number in it is masked, Thai digits included"), W10, plan Review Focus 2, and the controller's focus 3 ("no amount reaches the screen").
- Evidence (PROBE 1, the real `ConfirmStep` in private mode, with the real `parseQuickText` from `packages/contracts/src/v1/quickText.ts` saying what Bun read; full table in `probe-out-committed.json`). Tell Bun reads Thai number words on purpose (`THAI_UNITS`, `THAI_MULTIPLIERS`, `thaiWordsToNumber`, `quickText.ts:42-59`; "Thai has no spaces between words", `:95`), so the sentences below are ones Bun reads an amount from, and the confirm step shows them in clear next to a masked `฿••••`:

  | The person told Bun | Bun read | Shown in private mode |
  | --- | --- | --- |
  | ข้าวมันไก่ห้าสิบบาท | ฿50 | บันอ่านจาก “ข้าวมันไก่ห้าสิบบาท” |
  | ข้าวมันไก่ ห้าสิบ | ฿50 | บันอ่านจาก “ข้าวมันไก่ ห้าสิบ” |
  | กาแฟ ร้อยห้าสิบ | ฿150 | บันอ่านจาก “กาแฟ ร้อยห้าสิบ” |
  | ค่าเช่า สองพันห้าร้อยบาท | ฿2,500 | บันอ่านจาก “ค่าเช่า สองพันห้าร้อยบาท” |
  | เงินเดือน สามหมื่น | ฿30,000 | บันอ่านจาก “เงินเดือน สามหมื่น” |
  | โอนค่าเทอม หนึ่งแสนสองหมื่นบาท | ฿120,000 | บันอ่านจาก “โอนค่าเทอม หนึ่งแสนสองหมื่นบาท” |
  | ค่าเช่า 2 พัน | ฿1,000 | บันอ่านจาก “ค่าเช่า ฿•••• พัน” (scale shows) |
  | ค่าเช่า 1.5k | ฿1,500 | บันอ่านจาก “ค่าเช่า ฿••••k” (scale shows) |

  The committed private-mode case only feeds digits (`฿50`, `1,250.50`, `๒๐`), so it cannot see this.
- Why it matters beyond this task: the P2-T37 sweep is specified as "Bun's sentence has no digit in private mode" (brief P18, receipt). A digit check passes on every row above, so nothing later will catch the leak.
- Fix (small, either one):
  1. Mask Thai number-word runs and the scale words next to a number, with the same word lists as `quickText.ts`. I prototyped this in my scratch copy only: `(?:฿\s?)?(?:[0-9๐-๙]+(?:[.,][0-9๐-๙]+)*(?:\s?(?:k|K|พัน|หมื่น|แสน))?|(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน)+)`. With it every row above is masked, all 14 committed cases still pass, and 7 of 7 probes pass (`probe-out-with-prototype-fix.json`). It over-masks a word such as "ห้าง" (harmless; a leak is worse than an ugly mask).
  2. Or do not draw the sentence in private mode at all, and keep the violet line with words that do not quote it. This cannot miss a form the parser later learns, so I prefer it; it needs one draft copy line.
- Add the number-word rows to the private-mode case either way.

### Minor

**m1. Next ignores the archived and unknown wallets that the cards refuse.**
- Where: `TransferFooter` (`TransferStep.tsx:174-176, 195`) disables Next on draft ids only (`from === null || to === null || from === to`); the cards use `listed()` (`:97`), which hides an archived wallet and asks for one.
- Evidence (PROBE 2): draft `fromWalletId: 'w-old'` (archived): the card says `จาก เลือกกระเป๋า`, but Next is enabled (no `aria-disabled`), and confirm then shows `จาก กระเป๋าเก่า` with no hint. Same for the to side. Brief P4(e) says such a side "asks for one" and P6 says a side with no wallet "keeps Next waiting"; the committed archived case (`AddSteps.render.test.tsx:449-452`) asserts the card and move all, not Next.
- Reach: small. A copy nulls closed wallets (`recordModel.ts:152`), so this needs a wallet archived while the tray is open (or the edit tray, P2-T27). The vault then refuses a newly referenced archived wallet (`apps/edge/src/vault/domain/transactions.ts:161`, `errors.wallet_archived`); the phone's `checkEntryFields` does not check it, so a device save of such a move would fail only when it syncs.
- Fix: give `TransferFooter` the wallets (or a `listed` result) so Next waits as the cards ask, or record it as the host's gate in P2-T16 and add the Next assertion to the archived case.

**m2. Mutation survivors: five behaviours no committed case pins (protocol step 5: add a test for every survivor).** My own mutants, run against the committed `AddSteps.render.test.tsx` (`own-mutants.py`, `own-mutants.out`): 12 run, 7 killed, 5 survived.
- **M6 (survived):** an after line below zero loses its minus (`sign="balance"` to `none` at `TransferStep.tsx:253`).
- **M7 (survived):** a balance below zero loses its minus (`:249`). Brief P4(b) says "a card below zero reads −฿". No committed balance or after line is negative (the move-all case ends at `฿0`; `'-500'` is only used for the move-all offer). My probe shows the code is right today; a regression would show a negative balance as positive, so I would pin it: a from balance of `'30000'` moving ฿500 reads `−฿200` and says `ติดลบ 200 บาท`.
- **M8 (survived):** `WalletPick` with `balances` null (offline) is never rendered; `PickSteps.tsx:150` guards it correctly today, but removing the `balances === null` guard crashes offline and no test would notice. The offline state is the one the brief makes a rule (P4f).
- **M14 (survived):** `useAnnouncement(problem)` (`TransferStep.tsx:177`, "also said on iOS", P6) can be deleted unseen.
- **M18 (survived):** the confirm wallet row draws the from wallet's material instead of the entry wallet's (`ConfirmStep.tsx:93`); the probe draft has `walletId === fromWalletId`, so the case cannot tell. Cosmetic.

### Nit

**n1. `DatePick` clamps a draft dated before `earliest` but not one dated after `today`.** PROBE 5: a draft dated 2026-10-30 (today 2026-10-24) opens on `ศุกร์ 30 ต.ค.` with the forward arrow disabled, and เสร็จ keeps it. Nothing produces such a draft today (Tell Bun's offsets are 0, -1, -2; a copy keeps a past day), and `checkEntryFields` refuses a future date at Save ("This date is in the future."). Clamp to `today` on open for symmetry with `earliest`.

**n2. `TransferFooter` does not look at the amount.** PROBE 3: with a zero amount (`keypadFromMinor('0')`) the step shows `฿0` with move all offered, Next is enabled, and confirm shows `฿0`. By design the amount step guards the amount, and Save refuses zero (`amountProblemOf`), so no wrong money is written; it only means a late refusal if the host ever enters this step without an amount. `TransferFooter` already receives `keypad`, so `evaluateKeypad(keypad).ok` is one more clause. See the P2-T16 note below.

## Notes for later tasks

- **P2-T16 (host):**
  - `TellBunSheet.onUse` hands over only the `AiDraft` (`TellBunSheet.tsx:76, 182`), not the sentence. `bunSentence` must be captured from the sheet's text separately, and be `null` for a slip.
  - Today's Tell Bun sheet, rendered inside the tray, draws the typed sentence and the draft card's amount with no private-mode masking (`TellBunSheet.tsx:201` and `DraftCard`). The mask on confirm is moot if the sheet is open in front of the same onlooker one step earlier; decide whether the sheet masks too.
  - Never enter the transfer step with an empty or zero keypad (a switch to transfer on the amount step must stay on the amount step), or take n2.
  - Gate Next for archived wallets if m1 is left to the host.
- **P2-T37 (the sweep):** test Bun's sentence for number words and scale words, not only digits (M1). Also decide the title and the note row: `applyDraft` puts `draft.merchant` and `draft.note` into the draft (`tellBun.ts:49-50`), and confirm shows them as typed. The phone's rules strip the amount out of the merchant (`quickText.ts` `rest`) and set `note: null`, but the server AI's merchant and note are model text, so a number could reach the title in private mode.
- **P2-T27 (edit tray):** a record keeps an archived wallet it already references (vault rule, `newlyReferenced`), so the cards will ask for a wallet on such a record while the server would accept it; settle what the edit tray does.

## Evidence index (all under `.claude/controller/scratch/p2-t15-second/`)

- `probe-head.tsx` and `probe-body.tsx` (the probes, built on the committed test's own harness), `probe-out-committed.json` (their output on `fd41909c`), `probe-run-committed.log`.
- `probe-out-with-prototype-fix.json` and `fix-prototype.log` (M1's prototype: 21 of 21 pass, all parser-readable sentences masked).
- `own-mutants.py`, `own-mutants.out`, `own-mutant-logs/` (my 12 mutants).
- `planner-sample.out`, `mutant-logs/` (10 of the planner's mutants, rerun with the planner's own runner pointed at the scratch tree: X1, X3, X4, X5, X8, X12, F1, C7, P15, P18: **10 killed, 0 survived**, each restored sha256-equal).
- `baseline-addsteps.log`, `kit-eight.log`, `kit-eight-rerun.log`.
- After the mutants and the prototype I restored the scratch files; a final `diff -q` of all seven files this commit touches (scratch against the worktree) shows them identical, and `git status --short` in the worktree prints nothing: the worktree was never written to. The only file I added to the scratch tree is my own `SecondProbe.render.test.tsx`.

VERDICT: Needs fixes
