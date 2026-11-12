# Confirming review of P2-T29's fix round: categories, the category tray and the Thai pack tray

- **Reviewer:** Claude Opus 5.5 (independent, read-only). The dispatch names the confirming reviewer as Sonnet 5.5; this run is Opus 5.5.
- **Reviewed:** the fix-round commits after the reviewed head `cee7eff5` on `p2/t29-categories` (PR #423), after `git fetch` (local head = origin = `f7f47fa4`):
  - `ed1da2aa`, the fix (Haiku 5.5, from the Opus-planned kit);
  - `f7f47fa4`, the controller's merge of the head (`1893ef1f`).
- **Against:**
  - the plan's `### Task P2-T29` (line 1403), its Global Constraints and Review Focus, and P2-T16's "the tray can be closed" (line 994);
  - ruling R113 and the planner's P1 to P28 (`briefs/P2-T29-fix.md`);
  - the first review (`reviews/P2-T29.md`), the receipts (`receipts/P2-T29-fix.md`, `P2-T29.md`) and the fixer's logs (`scratch/p2-t29-fix/`);
  - the protocol (R87, R100, Reviewers).
- **Scratch:** `.claude/controller/scratch/p2-t29-confirm/`. `head/` is `git archive f7f47fa4` (`.claude/` dropped, node_modules linked from the worktree) plus my probes. The worktree is untouched: `git status --short` was empty before and after.

## Summary

The fix round answers the first review. I checked every blocker and major in the code and probed each one, and all of them hold:
- B1: no Web Crypto global.
- B2: the eight kit render files load.
- B3: every field is named.
- B4: an unconfirmed save or pack add keeps the same ids and keys, holds Save and Add, and stays frozen after a close and a reopen, even when reopened from another tile.
- M1: the move is exact.
- M2 to M12 hold, as do the money rules (m2) and archive and unarchive (m6).

CI is green on all nine jobs at `f7f47fa4`. There is no blocker and no major.

What I found:
- **m1:** six guards that the code holds but no test holds. The most important: an unconfirmed tray must stay closable.
- **m2:** an unarchive loses its frozen Try again when the type tab changes.
- **m3:** a read window after a pack add can add an item twice. Today's screen has the same window.
- Three nits.

## Blockers

None.

## Majors

None.

## Minors

**m1. Six guards the code holds have no test that fails without them** (my mutants, `logs/my-mutants.out`).
- **MT and MU (the most important).**
  - The guards: `CategoryTray.tsx:287` (`locked={saving}`) and `ThaiPackTray.tsx:121` (`locked={commands.status === 'saving'}`).
  - The mutants lock each tray while unconfirmed too (`status !== 'idle'`), and all 38 cases still pass.
  - The rule: P2-T16 (plan line 994) and the brief's P7 say an unconfirmed tray "can be closed".
  - Why no case catches it: the two B4 cases (`WalletCategories.render.test.tsx:441-490`) press Close and then the new tile or the pack card, but never check that the tray closed. With the tray locked, the second press lands on the same open tray and the case still passes.
  - Why it matters: if a later change locks an unconfirmed tray, a person whose Try again keeps failing cannot leave it, and nothing fails.
  - Fix: after Close while unconfirmed, assert the tray is gone and the grid read again.
- **MA:** the limit field stays editable while unconfirmed (`CategoryTray.tsx:353`, `editable={!frozen}` changed to `editable`). The B4 case freezes only a new category, which has no limit field shown.
- **MC:** new opens a spending category on the รายรับ tab (`WalletCategoriesScreen.tsx:138`, `type={type}` changed to `type="expense"`). No case presses new from รายรับ.
- **MI:** an unarchive refused as changed elsewhere (not found, deleted, or an `archived` field) does not read again (`WalletCategoriesScreen.tsx:414`). Planner mutant W30 covers only the conflict's Reload.
- **MO:** a budget conflict in the tray is told as a category changed on another device (`CategoryTray.tsx:246`, `seen: budget` changed to `seen: null`). No case refuses `setBudget` with a conflict in the wallet tray, so its words ("This month's budget changed on another device.") are untested there.
- My other four mutants are killed: MB (the pack named in Thai in English), MJ and MK (the two Reload links) and ML (the over amount's sign).

**m2. An unconfirmed unarchive loses its frozen Try again when the type tab changes** (probes C3 and C3b).
- **Cause:**
  - `ArchivedCategories` owns its own `useCategoryCommands` (`WalletCategoriesScreen.tsx:406-416`).
  - It is drawn only while the type shown has archived categories (`:181`).
  - The type switch is never disabled (`:166`, `:206-245`). Switching to รายรับ, which has no archived categories, unmounts it, and the pending command and its key go with it.
  - When both tabs have archived categories, the expense category's notice and Try again show under the income list instead.
- **Probe C3:** after `loseResponse('unarchiveCategory')`, pressing รายรับ and then รายจ่าย removes the notice, and นำ Old hobby กลับมาใช้ is enabled again.
- **Probe C3b:**
  - Pressing it again sends a second, different key at version 3. The first attempt had committed (version 4).
  - So the person is told "หมวดหมู่นี้ถูกแก้ไขจากอุปกรณ์อื่น" about their own change, with Reload.
  - No data harm: unarchive is a state change, and Reload shows the category back on the grid.
- **Why it is a minor:**
  - Today's screen disables its type toggle while unconfirmed (`CategoriesScreen.tsx:253`, `disabled={locked}`), so this cannot happen there.
  - B4 (R113) speaks of saves and pack adds, and it holds. This is the new unarchive path (m6).
- **Fix:** hold the unarchive's hook above the type switch (in `CategoriesBody` or the screen), or disable the switch while the unarchive is unconfirmed, as today's toggle is.

**m3. The pack tray, opened again before the read after an add lands, offers what was just added** (probe C4; today's screen has the same window).
- **Cause:** after a successful add the tray closes and the screen refreshes in place (`WalletCategoriesScreen.tsx:100-103`). Until that read lands, `ThaiPackTray` still gets the old `data.categories` (`:141`), so the items just added are not marked มีแล้ว.
- **Probe C4:** with the read held, I picked ทำบุญ, added it, opened the pack card again, picked ทำบุญ and added it. The result is two ทำบุญ categories.
- **Today's screen has the same window:**
  - Probe `TodayPackWindowProbe` presses Add twice before the read lands, and every missing item is created twice (7 creates, then 14; two ทำบุญ).
  - So this is not a regression, and B4's unconfirmed paths hold (C1, C2 and the round's B4 cases).
- **How likely:**
  - The window is one read long: seconds on a slow network.
  - Meanwhile the pack card still names the items just added, which invites a second tap.
- **Suggested fix**, which could serve both screens: `useLoad` reports a refresh in flight and the pack card and the trays wait for it, or the screen treats the keys added since its last read as มีแล้ว.

## Nits

- **n1. After a refusal that blocks saving, a reopened tray says nothing** (probe C6). Such a refusal is an app update or a changed session.
  - First opening: the tray says อัปเดต Jotbun เพื่อบันทึกต่อ การแก้ไขของคุณยังอยู่.
  - After Close and open: Save is disabled with no words. The same holds for Add in the pack tray.
  - Cause: the opening clears the message (m3's rule; `CategoryTray.tsx:177-184`, `ThaiPackTray.tsx:70-77`), but `blocked` stays (`CategoryTray.tsx:272`, `ThaiPackTray.tsx:113`).
  - By reading its code, today's screen does the same after Cancel: its New category is `disabled={locked || blocked}`, and Cancel clears the message.
  - Fix: keep the message while `blocked`.
- **n2. Another tile opens the frozen tray** (probe C1). While a new category is unconfirmed, tapping อาหาร opens the frozen new-category tray (heading หมวดใหม่, name Boba).
  - It is safe: Try again sends Boba's create under its key, and Food is never sent.
  - Today's grid disables its tiles while unconfirmed. Worth showing at E2-C.
- **n3. Nothing is said after a change lands.** The hook keeps `done` (`categoryCommands.ts:92`, `:155`), but no wallet file shows it. A save, a pack add or an unarchive closes the tray or moves the row, and nothing is said to a screen reader. Today's screen says it on the grid. For E2-C or P2-T37.

## The controller's focus, from the code

- **B1 holds.**
  - `CategoryTray.tsx:149` makes a new category's id with `newId` (expo-crypto, `screens/v1/parts`), once per opening.
  - A grep finds no `crypto`, `randomUUID` or `Date.now` in the round's app files.
  - The Hermes guard passes in my scratch copy (1 of 1) and in CI (`test:unit` 1044 of 1044). Planner mutant T1 is killed by the guard.
- **B2 holds.**
  - `categorySections.tsx:37` loads the screen with `lazy()`.
  - The eight kit render files load and pass in my scratch copy: with the four routes tests, 12 files and 152 tests. CI's render job passes 122 files.
  - Planner mutant C1 (an eager import) is killed: both kit files it runs fail to load (`SyntaxError: Unexpected token 'typeof'`).
- **B3 holds.**
  - The only two text fields carry `accessibilityLabel`: ชื่อหมวด (`CategoryTray.tsx:309`) and วงเงินต่อเดือน (`:350`).
  - CI's per-section suites pass "every control has a name, nothing hidden takes focus" for bw-categories, bw-category-new, bw-category-limit and bw-thai-pack.
- **B4 holds for unconfirmed saves and pack adds.**
  - **Same ids and keys:** the hook keeps the pending commands, and `tryAgain` resends exactly them (`categoryCommands.ts:138`, `:188-191`). A new draft's id is made once per opening.
  - **Held while unconfirmed:**
    - the footer offers only Try again (`CategoryTray.tsx:260-261`, `ThaiPackTray.tsx:103-104`);
    - every field and picker is disabled (`frozen`);
    - the archive link is hidden.
  - **Closed and reopened:** an opening keeps the session or the picks while `status === 'unconfirmed'` (`CategoryTray.tsx:177-184`, `ThaiPackTray.tsx:70-77`).
  - **The trays stay mounted across the screen's in-place refresh**, so the frozen state survives a close. `useLoad`'s `refresh` keeps the data (`screens/v1/parts.tsx:236-258`).
  - **Evidence:**
    - the round's two B4 cases pass, and planner mutants T2 and P4 are killed;
    - my probe C1, reopened from another tile: still Boba, one create resent under the same id and key, and Food never sent;
    - my probe C2, an accepted update and then an unconfirmed budget: after reopening, only `setBudget` is resent, under the same key and version. There is one update, and the limit is stored once.
  - Outside B4's scope: m2 (unarchive) and m3 (the read window).
- **M1 holds.**
  - `categoryCommands.ts` is today's code. A scripted comparison finds `categoryProblem`, `sendCommand`, `stateChanged`, `send`, `refused` and `tryAgain` identical to `2ff43b0e`'s once the five host calls are put back. The only other change is one comment ("freezes the screen" became "freezes the sender").
  - Each host call runs where today's line ran. The reordered state setters run in one batch.
  - These files are unchanged since `2ff43b0e`: `CategoriesScreen.render.test.tsx`, `CategoryParts.tsx`, `categoriesModel.ts`, `thaiPack.ts` and the fakes.
  - Today's suite passes 56 of 56.
  - The first review's own probes A1 and A2, run unchanged, pass at the head.
  - Planner mutants H1, S1 and S4 are killed.
- **M2 holds.** A tray close refreshes in place (`WalletCategoriesScreen.tsx:100-103`), and the round's M2 case sends versions 1, then 2. Planner mutant W2 is killed (7 cases fail).
- **M3 holds.**
  - One read: `ensureBuiltinCategories`, the budget and the summary (`:92-95`).
  - Loading says กำลังโหลดบันทึกของคุณ.
  - A failure says `classifyLoadProblem`'s words, with Try again only when trying again can help.
  - Without data, no grid, pack card or new button is drawn.
- **M4 holds.** My own table (`logs/contrast.log`) covers all twelve hues:

  | Text | By day | At night |
  | --- | --- | --- |
  | Names, amounts and initials in ink, on the mode's tint | 14.14:1 or more | 9.70:1 or more |
  | The limit line (`quietOnGround`) | 6.74:1 | 4.52:1 |
  | เกิน in `over`, on its card chip | 5.86:1 | 6.77:1 |
  | The pack card's words | 8.00:1 | 4.73:1 |
  | The screen's type segments | 7.76:1 | 5.93:1 |

  On the bare tints, `over` would read only 4.18 to 4.38:1 for six hues; that is why it sits on the chip. Planner mutant W5 is killed.
- **M5 and M6 hold.**
  - The swatches are named สีส้มพีช to สีเทาม่วง, and the glyphs by the board's names, all from the draft table.
  - A built-in's tray is titled and placeheld with `draftName` (อาหาร).
- **M7 holds.** Back is `useGoBack('/spend/budget')` (`:90`), and the screen's props stay the plan's `{ now?: Date }`.
- **M8 holds.** Both trays pass `locked` while `saving`, and planner mutant T5 is killed. The converse, closable while unconfirmed, is m1.
- **M9 holds.**
  - Every amount the category tray prints goes through `money`, which gives `฿••••` in private mode:
    - the hint;
    - the total;
    - the over-total refusal, both as typed and on Save (Save uses `problems()`, not `planSave`'s unmasked words).
  - A stored limit is masked in its field until a key is pressed (R106).
  - No other path prints an amount: the conflict notice prints only the view's message, and server field errors are generic words.
  - Probe C5, in English with a new limit typed: no digit but the typed one. Planner mutant T10 is killed.
- **M10 holds.** The round's M10 case covers three mistyped amounts, a long name, an empty name and a budget already holding 100 limits, all in today's catalog words.
- **M11 holds.** The sections mount no language or theme provider of their own, and CI renders all four in light and dark, in en, th and vi.
- **M12 holds** for the plan's tests 2 and 3 and the first review's survivors. In my sample, planner mutants W10 (R1), P1 (R2) and W3 (R4) are killed.
- **The money rules (m2) hold.**
  - Spending against a limit is compared with `BigInt` (`:316`), and spending equal to its limit is not over.
  - A stored limit comes from `editCategoryDraft`'s text.
  - Words go through `walletMoneyText` and `spokenMoney`.
  - No `Number(`, `parseFloat` or `toFixed` touches an amount in the round's app files.
- **Archive and Unarchive (m6) hold.**
  - The tray's archive asks first, as its second step, with Back. A failure returns to the form.
  - The grid lists the archived categories with นำกลับมาใช้, through the same hook.
  - All 18 `tc()` lines in the three files resolve to Thai in `th.json` (scripted check).
  - No catalog file changed (E2).

## The planner's deviations

- **P5, `CategoryTray` takes `budget`: accepted.**
  - No other task's plan calls `CategoryTray`. Phase 5 edits the file but does not call it.
  - One read keeps the tiles, the tray's limit check and Save on the same budget. That fixes the first round's stale copy (M2) and its reset of typed edits (m9).
- **P9, the tile composes the kit's parts: accepted.**
  - The tile uses the kit's `iconOf`, `CategoryGlyph`, `categoryInitial` and dark-aware `tileTint`, so no rule is forked.
  - `WalletCategoryIcon` still draws the square tiles: the pack rows and the archived rows.
  - `CategoryMark` repeats the kit's choice of glyph or initial in a dozen lines, a small duplication.
- **The pack card on both tabs: accepted.** The plan binds the card to `missingPackItems(categories)`, which does not depend on the type, and C3 holds an income item (`family_in`). For E2-C.

## The known risk

- No app route mounts `WalletLooksProvider` yet. At `f7f47fa4` there is no `src/wallet/home/WalletShell.tsx`, and `app/spend/_layout.tsx` does not mention the provider.
- So on a phone with the wallet area on, the icon picker is offered but keeps nothing: the layout's `DeviceDiaryProvider` supplies an account id, while `setIcon` falls back to `OUTSIDE`.
- The plan closes this in P2-T18: line 1073 puts `WalletShell` in the spend layout, and line 764 mounts the provider innermost.
- The catalogue sections mount the provider themselves, so E2-C's captures are right.
- The receipt records the risk. It is carried below.

## CI

PR #423, run 43172287280 on `f7f47fa4`: all nine jobs pass.

| Job | Result |
| --- | --- |
| Typecheck, unit, API, build | passed: `typecheck`, `typecheck:app`, `typecheck:routes`, `test:api`, `test:app` 35 of 35, `test:unit` 1044 of 1044, `test:dev` 7 of 7, the API build, the release graph, the parser sandbox and whitespace |
| Exports (web and iOS) | passed |
| Render (every file but the per-section suites) | 122 files, 1545 tests passed |
| Per-section suites, ids of length 3n | 178 passed, 466 skipped (644) |
| Per-section suites, ids of length 3n+1 | 224 passed, 420 skipped (644) |
| Per-section suites, every other test | 242 passed, 402 skipped (644) |
| SQL integration and ops | `test:ops` 111 of 111 |
| Edge Worker | `test:edge` 19 files, `test:edge:workers` 33 files and `test:edge:db` 3 files passed |
| Release image and smoke | passed |

In the per-section suites, the four category sections pass their screen-reader and render cases.

## What I ran (scratch copy of `f7f47fa4`)

- **Focused files:** `WalletCategories` 38, `categoryCommands` 4 and `CategoriesScreen` 56: 3 files, 98 passed (`logs/focused-head.log`).
- **The four routes tests and the eight kit render files:** 12 files, 152 passed (`logs/routes-kit-head.log`).
- **`test:unit`, focused:** the Hermes guard and `draftText`, 5 of 5 (`logs/hermes-head.log`).
- **The first review's probes, unchanged:**
  - A1 and A2 (archive): 2 of 2 pass (`logs/probe-archive-head.log`).
  - P1 to P14 (wallet): 2 of 14 pass (P7 and P13). The other 12 are tied to the first round's selectors and fail on lookups, on the probe's own setup, or (P8) on a `categories()` read the new screen no longer makes (`logs/probe-review-wallet-head.log`). The round's named cases now hold each of them.
- **The planner's mutants:** a sample of 14 (H1, S1, S4, W2, W3, W5, W10, T1, T2, T5, T10, P1, P4, C1). All 14 are killed, and every file is restored by sha256 (`logs/planner-mutants.out`).
- **My mutants:** 10 (`tools/my_mutants.py`, `logs/my-mutants.out`). 4 are killed (MB, MJ, MK, ML), and 6 survive (MA, MC, MI, MO, MT, MU; m1).
- **My probes:**
  - `probes/ConfirmProbe.render.test.tsx`, 7 cases: C1, C2, C3b and C5 pass; C3, C4 and C6 fail as described (`logs/probes-final.log`).
  - `probes/TodayPackWindowProbe.render.test.tsx` fails on today's screen (`logs/probe-today-pack-window.log`).
- **Contrast:** `tools/contrast.mts`, output in `logs/contrast.log`.
- **The receipt against the fixer's logs:** all of these match.
  - RED: 33 failed and 5 passed of 38 (33 `AssertionError`), and 3 failed of 9.
  - GREEN: 38, 60 and 5.
  - The gate: kit 138, catalogue 10, routes 13.
  - Mutants: 119 of 119 killed.
  - The controller's merge: `test:unit` 1044 and render 312.
- **The commit:** `Rebuild the Bun Wallet categories on today's rules and the wallet kit` (P28), with a short body and the Haiku 5.5 trailer.
- **`index.ts` at the merge** is in plan order: KIT, STACK, TRAY, ADD, LIST, RECORD, CATEGORY, INSIGHTS, RECAP, LOCK.

## Notes for later tasks

- **P2-T18:** mount `WalletLooksProvider` in `WalletShell`, as planned. Until then the category tray's icon picker keeps nothing on a phone.
- **Hooks under a tab switch:** a screen that gives a tray or a list its own `useCategoryCommands` must keep the hook mounted across anything the person can change on the grid (tabs, filters), or hold those controls while a command is unconfirmed, as today's screens do (m2).
- **The read window:** `useLoad`'s in-place refresh leaves a window after a save in which the screen still shows the old data. A create offered from that data can run twice, here and on today's Categories screen (m3). A shared `refreshing` state would let both screens wait.
- **Testing "closable while unconfirmed":** assert the tray is gone after Close, not only that it is frozen when opened again (m1).
- **Probe files:** the first review's `WalletCategoriesProbe.render.test.tsx` is bound to the first round's selectors. For later rounds, use the round's named cases or `scratch/p2-t29-confirm/probes/ConfirmProbe.render.test.tsx`.

VERDICT: Approved
