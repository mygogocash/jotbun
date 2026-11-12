# P2-T15 confirming review: the fix round (R114)

- **Reviewer:** the independent confirming reviewer (Claude Opus 5.5; the dispatch named Sonnet 5.5), read-only.
- **Reviewed:** PR #427 on `p2/t15-transfer-confirm-pick`, the fix-round commits after the reviewed head `fd41909c`:
  - `a4947e62`, the fix (10 files, +472 / -219);
  - `334847d3`, the controller's merge of the integration branch (#420, #428, #421), the PR head. `origin/claude/p1a-vault-core` has since moved one controller-state commit (`c7fe7888`), which touches no code.
- **Checked against:** plan P2's `### Task P2-T15` (line 940) with its Global Constraints and Review Focus 2 and 3; ruling R114; the fix brief `briefs/P2-T15-fix.md` (P20 to P33) and the first brief's P1 to P19; both reviews (`reviews/P2-T15.md`, `reviews/P2-T15-second.md`); the receipts `receipts/P2-T15.md` and `receipts/P2-T15-fix.md`; the implementer's logs in `scratch/p2-t15-fix/`; the protocol (R87, R100, Reviewers).
- **Where:** a scratch copy, `git archive 334847d3` into `scratch/p2-t15-confirm/tree/` (its `.claude/` dropped), `node_modules` linked from the worktree. Every probe and mutant ran there. The worktree's `git status --short` is empty after the review, and the nine round files in the scratch copy match the planner's `SHA256SUMS.real-in-wt` after every mutant.

## Verdict

The fix round does what R114 asks, and I could not break it.
- **R114.1:** in private mode the confirm step draws none of Bun's sentence, in any form. The line reads only บันอ่านจากที่คุณบอก.
- **R114.2:** Next follows the cards' `inUse` rule on both sides.
- **R114.3 and R114.4:** every pin the reviews asked for kills its mutant: 12 of the planner's 120, sampled, all killed.
- **P23:** holds.
- **CI** on `334847d3`: all nine jobs pass.

There is no blocker and no major. There is one minor and two nits, all of them test gaps, not wrong behaviour:
- **m1:** R114.1's proof feeds Bun's sentence only with a filled amount. If the line were hidden only while the amount is a fill, it would pass 17 of 17, though it draws the sentence in private mode once the amount is typed. That state is reachable: Bun can return a draft with no amount (`amount_unclear`).
- **n1, n2:** two survivors of my own on P22's "says nothing" and on the from row's material.

Outside this PR, Tell Bun's on-phone rules read "ค่าเช่า 2 พัน" as ฿1,000. It is in the notes below, for the controller to route.

## CI (R100)

Run 43173001366, event `pull_request`, head `334847d38d29`, conclusion `success`. All nine jobs pass (`gh pr checks 427`; job logs saved in `scratch/p2-t15-confirm/ci-run-43173001366.log`):

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | pass (2m19s): `test:app` 35 of 35, `test:unit` 1047 of 1047, `test:dev` 7 of 7 |
| Render (every file but the per-section suites) | pass (2m44s): 121 files, 1519 of 1519. `AddSteps.render.test.tsx` 17 tests; the eight kit files 138 (Lock 38, Tray 27, AmountStep 15, CardStack 15, WalletLooks 13, WalletsList 12, PrivateMode 9, walletHarness 9); the four routes tests (SpendRoutes 3, AccountRoutes 2, InsightsRoutes 4, PlanningRoutes 4) |
| Render, per-section suites (3 shards) | pass: 240, 226 and 178 (644 of 644). The log names `bw-tray-transfer` and `bw-tray-confirm` in both suites; the reporter names only slow cases. The implementer's `green-catalogue.log` names all four sections in both suites (60 passed) |
| Exports (web and iOS bundles) | pass (2m42s) |
| Edge Worker; SQL integration and ops (`test:ops` 111 of 111); Release image | pass |

The only render `stderr` is walletHarness's own "Bun setting could not be saved", from its storage stub. It is not this round's.

Locally, R100's focused files only:
- `AddSteps.render.test.tsx`: 17 of 17 (`baseline-addsteps.log`);
- `addStepsNative.test.ts`: 3 of 3 (`baseline-native.log`);
- `git diff --check origin/claude/p1a-vault-core...334847d3`: clean.

I did not rerun the eight kit files, the routes tests, `test:unit` or `typecheck:app`. CI ran them on this head, and so did the controller on the merged tree (`ctl-merge-*.log`: tsc 0, 168 of 168, 1047 of 1047).

## What I confirmed

### 1. R114.1 (M1 of both reviews): none of Bun's sentence in private mode. Holds.

**The code.**
- `ConfirmStep.tsx:106-110` draws `t('add.bunReadHidden')` when `hidden`, and `add.bunReadFrom` with the sentence otherwise. The sentence reaches no other prop, label or text: the only other use of `bunSentence` is its null check.
- The `NUMBER` mask is gone. `copy.ts` adds one draft line: บันอ่านจากที่คุณบอก / "Bun read this from what you told it".

**The committed case** (`AddSteps.render.test.tsx:529`) feeds the reviews' thirteen sentences (`:557-567`), the English "chicken rice fifty baht" and the catalogue's `bw-tray-confirm-bun`. The line is exactly the hidden words, and no word of the sentence is left in the tray's text or labels.

**My probes** (`ConfirmProbes.render.test.tsx`, scratch only; 8 of 8 pass on the real code, `probes-final.log`):
- **PROBE-A:** twenty more sentences, in Thai and in English: 40 runs. They include colloquial and compound Thai (ร้อยนึง, สองพันห้า, ห้าร้อยกว่า, เจ็ดสิบห้า, 3.5 หมื่น), a number word glued to the next word (ห้าสิบกับ), Thai digits (๕๙๙, ๑๒๐), `3k`, `1.2K`, `THB 4,500`, `12,000.-`, a line break, an emoji, quotes, and English words (two fifty, a hundred, sixty-five).
  - Each line is exactly the hidden words, and the amount is ฿••••.
  - No token of any sentence appears anywhere in the document body: text nodes, `aria-label`, `title`, `alt`, `placeholder`, `value` or test ids. All 40 runs are clean.
- **PROBE-B:** with the sentence showing, turning private mode on while confirm is open swaps it for the hidden words at once (`ห้าสิบ` is gone from the document). Turning it off brings the sentence back.
- **PROBE-E:** `bw-tray-confirm-bun` in private mode, in English. The title is Chicken rice, the line is the hidden words, the amount is ฿••••, and there is no digit in the tray. The ฿50 in the catalogue's specimen label sits outside the tray: development text, not app copy.
- **PROBE-G:** private mode with a typed amount. The real code shows ฿50 and the hidden words. See m1.

**The receipts** carry the P2-T37 note R114.1 asks for: a sweep for digits cannot catch number words (`P2-T15-fix.md`, notes; `P2-T15.md`, corrected lines).

### 2. R114.2 (m1 of both reviews): Next by the cards' rule. Holds.

**The code.**
- One module function, `inUse` (`TransferStep.tsx:88-91`), feeds the cards (`:104-105`) and `TransferFooter` (`:189`).
- Next is disabled unless two different wallets are in use (`:210`).
- The one-wallet problem appears only when both sides hold the same wallet in use (`:191`).
- `TransferFooter`'s `wallets` is a required prop (`:182-185`), so P2-T16 cannot leave it out without a type error. Both receipts tell P2-T16 to pass `TransferStep`'s wallets.

**The committed case** asserts Next for an archived from side, a press doing nothing, and an unknown to side (`AddSteps.render.test.tsx:514-525`). X22 is killed in my sample.

**PROBE-C** covers all nine pairings, on both sides:
- archived to; unknown from; the same archived wallet, and the same unknown wallet, on both sides; archived with unknown; archived or unknown against none; one wallet in use on both sides; two wallets in use.
- Next waits exactly when a card asks for a wallet or one wallet in use is on both sides.
- The words appear only for the second of those.
- An archived from side swapped onto the to side still waits. A pick for that side, which offers the three wallets in use, lets Next go on, and confirm reads `จาก เงินสด`, `ไป บัญชีหลัก`.

### 3. R114.3 and R114.4: the pins kill their mutants. Holds.

**The planner's mutants, sampled.** I reran 12 with the planner's own `mutants.py`, pointed at my scratch copy (`planner-sample.out`):

| Mutant | What it breaks |
| --- | --- |
| X22 | Next by the draft's ids |
| X23 | the seam's `zIndex` |
| X25 | a negative balance's minus |
| X26 | the transfer amount's live region |
| F8 | `useAnnouncement` |
| C29 | the sentence quoted in private mode |
| C31 | the wallet row's material |
| C33 | the note trim |
| P36 | `isPickStep` without the wallet pick, so the chip's way back breaks |
| P38 | confirm and transfer counted as picks |
| P41 | the offline wallet pick's guard |
| P42 | the day's live region |

- **12 of 12 are killed**, each on the same first failing case as in the implementer's `mutants.out`.
- P41 dies of the `TypeError` the receipt names.
- Every file was restored sha256-equal.

**The implementer's run.**
- `mutants.out` reads "120 killed, 0 survived".
- Its RED and GREEN logs match the receipt: RED is 4 of 17 render cases and 1 of 15 Node cases, each an `AssertionError`; GREEN is 17 of 17 and 15 of 15.
- The gate logs match too: `typecheck:app` 0, `test:app` 34, `test:unit` 1038, the nine render files 155, the routes 15.

**The kit.** The nine committed files are byte-identical to the planner's `real/` (`SHA256SUMS.real-in-wt`: 9 OK).

**The lazy sections (n4).**
- `addSections.tsx:50` declares `lazy(() => import('./addStepsSection'))`, and `:141-147` wraps it in `Suspense` with the `catalogue-screen-running` fallback, as `recordSections.tsx:24` does.
- `StepStart` comes in as a type only (`:48`).
- Apart from the declared changes, `addStepsSection.tsx` is `fd41909c`'s `StepsTray` moved unchanged. I diffed the moved block: the declared changes are its own sample lines and `WALLET_ID`, `export type StepStart`, the default export, and `TransferFooter`'s `wallets`.
- The catalogue's three suites wait while the mark shows (`CatalogueScreen.render.test.tsx:572-573`, `screenReader.render.test.tsx:45-46`, `largeText.render.test.tsx:33-34`). CI's exports and section shards pass.

### 4. P23: Next does not check the amount. Holds.

`TransferFooter` reads only `draft`, `onStep` and `wallets` (`TransferStep.tsx:182-189`). Each premise checks:
- the amount step's Next waits for `evaluateKeypad(keypad).ok` (`AmountStep.tsx:142`), and a move's Next goes to the transfer step (`addFlow.ts:46-48`);
- the transfer step has no keys, and move all fills only a balance above zero and within the cap (`TransferStep.tsx:76-79`; `addFlow.ts` `moveAllMinor`);
- Tell Bun never lands here: its drafts are spending or income only (`AI_DRAFT_TYPES = ["expense", "income"]`, `packages/contracts/src/v1/ai.ts:94`);
- the save refuses zero (`checkEntryFields` and then `amountProblemOf`, `quickAddModel.ts:71-77, 145-146`).

PROBE-D shows what is left to the host. A step entered with a `'0'` keypad shows ฿0, offers move all, and Next goes on to confirm at ฿0. That is P23's stated reliance on P2-T16 ("never enter the transfer step without an amount the keypad can save"), and the receipt carries it.

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1. R114.1's proof feeds Bun's sentence only with a filled amount. Hiding the line only while the amount is a fill passes all 17 cases.**
- **The gap.** Every private-mode case with a sentence uses a fill:
  - the thirteen sentences (`AddSteps.render.test.tsx:563`, `filled`);
  - the English sentence (`filled`);
  - the catalogue section (`filled: true`).
- **My mutant R3** changes `ConfirmStep.tsx:108` from `{hidden ? … : …}` to `{masked ? … : …}`, which is the amount's own rule (R106). It survives the committed suite, 17 of 17 (`my-mutants.out`).
  - It is killed by PROBE-G (`my-mutants-vs-probes.out`). There, with private mode on and a typed ฿50, the mutant draws `บันอ่านจาก “ข้าวมันไก่ร้อยนึง”`.
  - It is a likely regression: someone lining the Bun line up with the amount line's rule would write it.
- **The state is reachable by design.** Tell Bun returns a draft with no amount when it cannot read one: `draftFromQuickText` flags `amount_unclear` with `amount_minor: null` (`quickText.ts:194`; "Bun couldn't read the amount. Type it in.", `tellBun.ts:57`).
  - The person then types the amount, and the entry is still Tell Bun's, so `bunSentence` is not null. Retyping after a fill gives the same state.
  - The sentence in that state is exactly the kind R114.1 is about: one with an amount Bun could not read. My `merchant-probe.out` gives three such sentences: ร้อยนึง, "two fifty", full-width ５０.
- **The code is right today** (`hidden`, PROBE-G passes), so this is a pin gap, not a leak.
- **Ask:** in the private-mode case, add one mount with a sentence and a typed amount (no `filled`), and assert the line is exactly the hidden words. That kills R3. If the PR is not reopened, P2-T16's host test should cover Tell Bun with `amount_unclear` in private mode.

### Nit

**n1. P22's "says nothing" for a side not in use is pinned only where the two sides differ (my R1).**
- The mutant computes `problem` from the draft's ids again (`TransferStep.tsx:191`). The same archived or unknown wallet on both sides would then show "เลือกกระเป๋าเงินสองใบที่ต่างกัน" above two cards that each ask for a wallet.
- It survives 17 of 17. PROBE-C kills it on `w-old -> w-old`.
- One more mount in the archived case (`fromWalletId: 'w-old', toWalletId: 'w-old'`, expecting no `transfer-problem`) would hold it.

**n2. The from row's material is not pinned, the mirror of the second review's M18 (my R4).**
- `ConfirmStep.tsx:92`, `key === 'from' ? draft.fromWalletId` → `draft.walletId`, survives 17 of 17. The move's probe draft keeps `walletId === fromWalletId`, so the case cannot tell the two apart.
- A draft can hold different values there, for example when spending's wallet stays as a type change makes a move. PROBE-H kills the mutant: with `walletId: 'w-main'` and `fromWalletId: 'w-cash'`, the from row must draw peach, not titanium.
- It is cosmetic, as M18 was.

## My mutants

`scripts/my_mutants.py`, each applied alone, run against the committed files and restored sha256-equal (`my-mutants.out`, `my-mutant-logs/`):

| Id | Mutant | Committed suite | My probes |
| --- | --- | --- | --- |
| R1 | the problem reads the draft's ids | survives (n1) | killed by PROBE-C |
| R2 | in private mode the sentence still goes to a screen reader (`accessibilityLabel={bunSentence}`) | killed (the private-mode case) | |
| R3 | the line is hidden only while the amount is a fill | survives (m1) | killed by PROBE-G |
| R4 | the from row draws the entry wallet's material | survives (n2) | killed by PROBE-H |
| R5 | in private mode the violet line is dropped | killed | |
| R6 | a wallet no longer listed counts as in use | killed (the unknown to side) | |
| R7 | a draft after today opens on the wallet's start | survives | killed by PROBE-F |
| R8 | an extra eager import of the steps' module through its `@mobile/...` path | survives the source pin | |

I report R7 and R8 as no finding, because neither is a likely edit:
- the committed after-today case has no start, so only a mutant that reads the start in the clamp (`earliest ?? today`) gets past it;
- the lazy-load pin reads only the relative path, which is the form a real regression (S8) takes.

## Notes for later tasks

- **P2-T16 (the host):**
  - Pass `TransferStep`'s wallets to `TransferFooter`. The prop is required.
  - Never enter the transfer step without an amount the keypad can save (P23). PROBE-D shows that ฿0 otherwise reaches confirm.
  - If m1 is not taken in this PR, test Tell Bun with an unclear amount (`amount_unclear`, then a typed amount) in private mode in the host. The confirm line must be the hidden words.
  - The host's own sections (`bw-tray-saving`, `bw-tray-unconfirmed`, `bw-tray-add-large`) reach `expo-crypto` through `AddTrayHost` and `entryHelpers.ts` (the first review's note). Load them the way `stepsSection` in `addSections.tsx` now loads the steps.
  - Test the amount chip's wallet pick and its way back in the real host (the first review's m2). This round pins it with the probe.
- **P2-T37 (the sweep) and the title:**
  - The receipt says the title and the note row are "the model's text". The phone's own rules leave amounts in the merchant too, and so in confirm's title, in private mode (`merchant-probe.out`, real `parseQuickText`):
    - `ข้าวมันไก่ห้าสิบกับน้ำ 20` reads ฿20 (a fill, masked), and the title is `ข้าวมันไก่ห้าสิบกับน้ำ`;
    - `coffee 65 and cake fifty` reads ฿65, and the title is `coffee and cake fifty`;
    - `lunch two fifty`, `ข้าวมันไก่ร้อยนึง`, `ข้าวมันไก่ ５０` and `ข้าว ٥٠` read no amount, and the whole sentence is the title.
  - A number word the rules do not read as the amount stays in the merchant: one glued to the next word, an English word, or full-width and Arabic-Indic digits. Sweep the title for absence of the sentence's number words, not only for digits.
- **Tell Bun's rules: a money bug outside this PR. Route it as its own fix.**
  - `parseQuickText` (`packages/contracts/src/v1/quickText.ts`, unchanged since `b22c41c3`) reads a digit followed by a Thai scale word as the scale word alone:
    - `ค่าเช่า 2 พัน`, `ค่าเช่า 2พัน` and `ค่าเช่า 2 พันบาท` give `100000` (฿1,000, not ฿2,000);
    - `ค่าเช่า 3 หมื่น` gives `1000000` (฿10,000, not ฿30,000);
    - each reports `amounts_found: 2` (`scale-probe.out`). `1.5k` is right.
  - The cause: `NUMBER` matches `2 พัน` as 2 × 1,000, `THAI_NUMBER_WORD` matches the same `พัน` again as 1 × 1,000, and the later match wins (`chosen` is the last of two unmarked amounts).
  - `apps/edge/test/quick-text.test.ts` covers `2.5k` and spelled-out Thai (`สองพันห้าร้อย`, `สามหมื่น`), but no digit followed by a Thai scale word. The second review's M1 table shows the same ฿1,000 for "2 พัน" without flagging it.
  - In private mode a fill is masked on confirm (R106), and since R114 the sentence is not drawn. So nothing on confirm would let the person notice ฿1,000 for "2 พัน". The edge falls back to these rules when the model fails ("falls back to the offline rules", `test/workers/ai.test.ts`).
- **P2-T27 (the edit tray)**, the device check (the swap's 44 pt on the seam) and **E2-B** (บันอ่านจากที่คุณบอก is a draft): as the fix receipt records.

## Evidence index (all under `.claude/controller/scratch/p2-t15-confirm/`)

- `tree/` (the scratch copy of `334847d3`), with my probe file `tree/apps/app/src/wallet/add/ConfirmProbes.render.test.tsx` (built from `probe-head.tsx`, the committed test's harness, and `probe-body.tsx`).
- `baseline-addsteps.log` and `baseline-native.log`; `probes-run1.log`, `probes-run2.log` and `probes-final.log` (8 of 8 on the real code).
- `scripts/my_mutants.py`; `my-mutants.out` and `my-mutant-logs/` (against the committed files); `my-mutants-vs-probes.out` and `my-mutant-logs-vs-probes/` (the survivors against my probes).
- `planner-sample.out` and `planner-sample-logs/` (12 of the planner's mutants, run with its own runner).
- `scripts/merchant-probe.mts`, `merchant-probe.out`, `scripts/scale-probe.mts` and `scale-probe.out` (the rules parser).
- `ci-run-43173001366.log` (CI's job logs) and `addSections.fd41909c.tsx` (the reviewed head's file, for the diff of the moved host).

VERDICT: Approved
