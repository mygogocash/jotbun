# Brief P2-T20: The wallets list, the archived list and reorder

You are the implementer for plan P2, Task P2-T20. You add the Bun Wallet's wallets list (`WalletsListScreen`: back and จัดเรียง, the heading, the summary card, a 68 pt row per wallet in the kept front-first order, the add tile, and the archived wallets, each brought back through P2-T19's wallet command hook), the reorder tray (`ReorderTray`: move-up and move-down buttons that name each wallet and keep the new order on the phone at once), the pure rules they share (`walletsList.ts`), the area's draft copy (`wallets/copy.ts`), the route's wallet branch (`app/spend/wallets.tsx`, with `?reorder=1` opening the tray) and three catalogue sections. The planner wrote every file below and proved it in a scratch copy of the integration head `dbfde7d` with tray-hardening's three files and P2-T14's eleven laid over it, since this task starts after both merge (ruling P1): RED on typed stubs (4 of 4 Node cases and 13 of 16 render cases fail, each on an assertion; the three that pass are the routes file's old cases), GREEN, 84 mutants (all killed), the focused neighbours, the catalogue's wallet sections, merge proofs for `index.ts`, and the fast local gate of R100. Do exactly what this brief says.

**This task starts after tray-hardening (PR #392) and P2-T14 merge** (ruling P1). Step 0.2 and Step 0.3 check both by content; until then, report BLOCKED.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T20.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T20` (lines 1129 to 1154); W1, W7, W10, W25, W28 and W30 (lines 38, 44, 47, 62, 65 and 67); Review Focus 2 and 3 (lines 115 and 116); its Global Constraints (lines 82 to 108: copy and E2 on line 85, accessibility on line 87, money on line 89, the R72 test traps on lines 94 to 99, both modes and both languages on line 106, pure modules on line 107); what later tasks take from this one: P2-T21 (lines 1158 to 1185), P2-T22 (line 1208), P2-T23's `homeWallets` (line 1240) and P2-T24's จัดเรียง (line 1270).
3. The board: `docs/design/bun-wallet/wc-wallets.dc.html`.
4. The receipts this task builds on: `docs/implementation/receipts/P2-T19.md` (the wallet command hook), `P2-T11.md` and `wallet-looks-unstored.md` (the kept looks and order), `P2-T13.md`, `tray-hardening.md` and `P2-T14.md` (the tray; once merged), `P2-T10.md` (money text and private mode) and `P2-T8.md` (how to mount through `mountWallet`).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t20` (branch `p2/t20-wallets-list`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t20`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t20-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the ten files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED forms (typed stubs) of `walletsList.ts`, `WalletsListScreen.tsx` and `ReorderTray.tsx`;
  - `orig/`: the three existing files this task changes, as they are at the start (P2-T14's `index.ts`, and the head's `app/spend/wallets.tsx` and `PlanningRoutes.render.test.tsx`);
  - `base/`: what the proof laid over `dbfde7d`: tray-hardening's `Tray.tsx`, `Tray.render.test.tsx` and `trayGesture.test.ts` (784667b) and P2-T14's eleven files (ruling P2);
  - `diffs/`: one diff per changed existing file, paths `a/<repo path>` and `b/<repo path>` with full blob ids, so `git apply --3way` can merge them: `apps_app_src_dev_catalogue_wallet_index.ts.diff`, `apps_app_app_spend_wallets.tsx.diff` and `apps_app_src_screens_redesign_planning_PlanningRoutes.render.test.tsx.diff`. The planner checked that they turn `orig/` into `real/` byte for byte;
  - `tools/`: `mutants.py` (the mutant runner), `stage.sh` (puts a tree at the base, RED or GREEN), `fill_brief.py` and `brief.template.md` (how this brief was built: every code block below is the `real/` or `stubs/` file, byte for byte, and the mutant lines are `logs/mutants.out`);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (everything in `logs/`, which the state commits leave out: `base-*`, `red-*`, `green-*`, `gate-*` (the fast gate), `probe-*` (the planner's probes: what loads unmocked, and typed routes without the casts), `probes/` (the import probe's source), `merge/` (the `index.ts` merge proofs), `mutants.out` and `mutant-logs/`; `superseded/`, the planner's first round, before the sections case waited for its script and three more pins were added).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...`, `orig/...` or `base/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only counts that may differ from this brief's are N and C (Step 1.3), and only as Step 0 says; and a load flake (a case that times out under load in a file this task does not touch: rerun that file alone once and record both runs).

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/wallets/walletsList.ts` | **new**, pure ({{LINES:apps/app/src/wallet/wallets/walletsList.ts}} lines). `WalletsSummary`, `walletsSummary` (the plan's signature), `frontFirst`, `moveWallet` (rulings P3a, P4). |
| `apps/app/src/wallet/wallets/walletsList.test.ts` | **new**, Node ({{LINES:apps/app/src/wallet/wallets/walletsList.test.ts}} lines). 4 cases: the plan's one and three more (P13). |
| `apps/app/src/wallet/wallets/copy.ts` | **new** ({{LINES:apps/app/src/wallet/wallets/copy.ts}} lines). `COPY`: the plan's fifteen lines and two more (P3f). |
| `apps/app/src/wallet/wallets/WalletsListScreen.tsx` | **new** ({{LINES:apps/app/src/wallet/wallets/WalletsListScreen.tsx}} lines). `WalletsListScreen`, exactly the plan's props (P5 to P9). |
| `apps/app/src/wallet/wallets/ReorderTray.tsx` | **new** ({{LINES:apps/app/src/wallet/wallets/ReorderTray.tsx}} lines). `ReorderTray`, exactly the plan's props, and `Chevron` (P3c, P4). |
| `apps/app/src/wallet/wallets/WalletsList.render.test.tsx` | **new**, render suite ({{LINES:apps/app/src/wallet/wallets/WalletsList.render.test.tsx}} lines). 12 cases: the plan's five and seven more (P13). |
| `apps/app/app/spend/wallets.tsx` | **route** (only this task edits it). The wallet area's branch, between the legacy build's redirect and R4 Planning's screen; `?reorder=1` opens the tray (P10). {{LINES:orig:apps/app/app/spend/wallets.tsx}} lines before, {{LINES:apps/app/app/spend/wallets.tsx}} after. |
| `apps/app/src/dev/catalogue/wallet/walletListSections.tsx` | **new**, development only ({{LINES:apps/app/src/dev/catalogue/wallet/walletListSections.tsx}} lines). `WALLET_LIST_SECTIONS`: `bw-wallets`, `bw-wallets-archived`, `bw-wallets-reorder` (P11). |
| `apps/app/src/dev/catalogue/wallet/index.ts` | **shared** (P2-T8's list). One import after the add tray's import, one spread after the add tray's spread (P3d, P15). {{LINES:orig:apps/app/src/dev/catalogue/wallet/index.ts}} lines before, {{LINES:apps/app/src/dev/catalogue/wallet/index.ts}} after. |
| `apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx` | **shared** (R4 Planning's route test, which imports this route). A mock of the new screen, `useLocalSearchParams` in its router stand-in, and one case (P3e). {{LINES:orig:apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx}} lines before, {{LINES:apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx}} after; its three cases unchanged. |
| `docs/implementation/receipts/P2-T20.md` | **new**. Your receipt (R87). |

Not in this task: anything under `apps/app/src/wallet/tray/` (tray-hardening's and P2-T13's), `src/wallet/add/` (P2-T14's), `src/wallet/card/` (P2-T11's and P2-T12's: `walletCardWords` is read, never changed), `src/wallet/looks/` (P2-T11's and #391's: `useWalletLooks` is read, never changed), `walletCommands.ts` and `WalletsScreen.tsx` (P2-T19's and R4's: read, never changed; `WalletsScreen.render.test.tsx` runs unchanged), `walletHarness.tsx`, `routerTestStub.tsx`, `screenSection.tsx`, `registry.tsx`, `kitSections.tsx`, `traySections.tsx`, `addSections.tsx`, `draftText.test.ts` (every Thai line here holds Thai letters, so `LATIN_LINES` does not change), `en.json` and `th.json` (no catalog line is added; today's lines are reused through `tc`), `app/spend/_layout.tsx` and `WalletShell` (P2-T18's), the routes `/spend/wallet/new` and `/spend/wallet/[id]` (P2-T21's and P2-T22's), any other route, the app entry or native code, any package or lockfile, `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready, and it starts after tray-hardening and P2-T14.**
  - Starts after P2-T11 (#382, merged `5a33820`), P2-T13 (#383, `08e0566`) and P2-T19 (#355, `daf8a63`), all in `dbfde7d`. wallet-looks-unstored (#391, `76b329c`), which `followups.md` said must land before this task calls `setOrder`, is in too.
  - No package, lockfile change, Cloudflare resource, account setting or owner decision is needed. The copy follows owner Q3's default (P3f, P17).
  - tray-hardening (PR #392): `ReorderTray` hosts P2-T13's `Tray`, so it starts after tray-hardening merges (the controller's rule). Its fix round (`reviews/tray-hardening.md`: m-1 reads the rendered `shown` in `dismissed`; new cases m-2, n-1, n-2 and R-d5b's order) changes no prop, export or host rule; this task relies only on the tray's title naming the dialog, its close button, its card unseen until its entering animation starts, and its exit ending within 300 ms. Step 0.2 checks for tray-hardening by content and records a changed tray file.
  - P2-T14 (brief READY, after tray-hardening): this task's sections go after the add tray's in `index.ts`, in plan order (that file's rule), and P2-T14's spread is the array's last element, so both edits would insert at the same place and cannot merge in either order. This brief plans on top of P2-T14's `index.ts` (`PL/orig/`, byte for byte `scratch/p2-t14-planner/real/`) and starts after P2-T14 merges (the controller's second option). Step 0.3 checks for it by content.
- **P2. The proof's base is `dbfde7d` with tray-hardening's and P2-T14's files laid over it.** `git fetch` found `origin/claude/p1a-vault-core` at `dbfde7d`. The planner built the copy with `git archive dbfde7d` and `npm ci` (1416 packages), then laid `PL/base/` over it: tray-hardening's three files at `784667b` (the PR's branch; byte for byte `scratch/tray-hardening-planner/real/`) and P2-T14's eleven files (`scratch/p2-t14-planner/real/`, checked against that folder's `SHA256SUMS`). Every stage ran on that tree.
- **P3. The names and files beyond the plan's list.**
  - (a) `walletsList.ts` also exports `frontFirst(wallets, order)` (the one front-first order, P4) and `moveWallet(ids, id, by)` (one wallet one place; a new array each time). Both are pure and Node-tested. The summary's type is exported as `WalletsSummary`.
  - (b) `WalletsListScreen.tsx` keeps every part private except the screen: `WalletsBody`, the header's `ReorderButton`, `SummaryCard`, `WalletRow`, `AddTile`, `ArchivedWallets`, `UnarchiveButton` and `LoadProblem`.
  - (c) `ReorderTray.tsx` also exports `Chevron` (the boards' up, down and right chevrons, decorative), which the screen's rows and archived row use; the screen imports the tray, so the tray holds the glyph and there is no import cycle.
  - (d) The sections are their own list, `WALLET_LIST_SECTIONS` in `walletListSections.tsx` (the plan's file), spread after the add tray's (P1, P15).
  - (e) `PlanningRoutes.render.test.tsx` imports this route. The route now imports the new screen, which reaches `screens/v1/parts.tsx` (it loads `expo-crypto`) through P2-T19's hook, and that file mocks neither; it would fail to load. So it mocks `WalletsListScreen` as it mocks the three planning screens (a `Text` that says whether it was asked to open the tray), its `expo-router` stand-in gains `useLocalSearchParams`, and one case pins the route's wallet branch (P10). Its three cases run unchanged.
  - (f) `copy.ts` exports `COPY`, as `card/copy.ts` does: the plan's fifteen lines, as written, and two more. `wallets.rowLabelSpent` ({name} ใช้ไป {amount}) is the board's own label for a credit card's row ("บัตรเครดิต ใช้ไป 3,920 บาท"), which the plan's one template cannot say (P8). `wallets.unarchiveLabel` (นำ{name}กลับมาใช้, Thai draft) names the wallet each นำกลับมาใช้ brings back, as today's "Unarchive {name}" does, since several look alike to a screen reader. The English lines are drafts for E2-B.
- **P4. The order (W7, W28).**
  - Front first: the kept order's first id is the front card. P2-T23's `homeWallets` reads the same kept order as "front-first, and wallets not in it follow by name" (plan line 1240), and the plan's mutant here is "Save the order last-first". `frontFirst` is that one rule: the kept ids first, in their order; then every wallet in use the order does not name, by name and then id (as the device diary lists wallets, `spendDiary.ts:105`); an id the order names that is archived or unknown here is passed over, and one named twice is listed once.
  - The list's rows follow it, so a move shows on the list behind the tray at once, and P2-T23 can take `frontFirst` and reverse it for the stack (the front card drawn last).
  - Each press calls `setOrder` once, with the whole order the tray shows after the move: once per press (followups #391 n4) and a new array each time, which nothing changes after (n3). No effect seeds `setOrder` (n5). There is no Save button: the order is kept at once, so no close, swipe or lock cover can lose a move.
  - The tray draws a move at once, ahead of the kept order (the provider writes after a queued store read), and the next press reads a ref of what the last press made, so two presses before React draws again move a wallet two places (the plan's interface has no other way to order presses; the controller's ref rule for presses).
  - Each opening starts from the kept order: closing forgets what the tray made, so when the diary opens another account, the tray opens on that account's order.
  - Until the account's first read lands, the kept order is empty (n5) and the tray, like the list, follows the provider live until the first press. A press in those few milliseconds keeps the order it showed (the provider has no ready flag: P2-T11's review). Recorded as a risk in the receipt.
  - An archived wallet's id leaves the kept order the next time the tray keeps one, since the tray lists wallets in use only; brought back, it follows the kept ones by name.
- **P5. With no account open nothing could be kept**, so จัดเรียง is not drawn, the tray is not mounted, and `?reorder=1` opens nothing. "No account" is `useDiaryView().accountId === null`: the web, a diary opening, locked or signed out (the provider's own test for keeping nothing). The list still shows, with derived looks. P2-T11's review asked P2-T21 and P2-T29 the same question for looks and icons.
- **P6. Unarchive is P2-T19's rule, through its hook.**
  - Each archived wallet's นำกลับมาใช้ calls `useWalletCommand().send({ kind: 'unarchive', slot: 'unarchive:<id>', id, version })`, the plan's call.
  - Presses are held by a ref, never by React state (P2-T19's review, the controller's note): two presses before React draws again send one command.
  - Outcomes. Done: the list is read again in place (`useLoad`'s `refresh`), and the wallet is back among the rows. Unconfirmed: the hook's words as an alert, and Try again (`common.tryAgain`), which sends the same command again, as today's list page does (`WalletsScreen.tsx`, `ListPage`): the same slot and version give the same key (`useCommandKeys`), so it is exactly what the hook's `resend()` would send (P2-T19's receipt names `resend()`), with no "nothing to resend" answer to handle, and the case pins the key. Every นำกลับมาใช้ is held meanwhile, and a blocked one (the session changed) offers no Try again. Refused: the hook's words, nothing held, no Try again. Conflict: today's "This wallet changed on another device." through `tc`, and the list is read again as it is now.
  - Every message is a catalog line reused through `tc` (Global Constraints, line 85).
- **P7. The summary card (wc-wallets).** `walletsSummary`'s figures: the total (a balance: below zero it reads −฿ and ติดลบ), ใช้อยู่ {n} ใบ, and the held line (เงินที่มี ฿X · หักบัตรเครดิตที่ใช้ไป ฿Y). The held line shows only once a credit card has spent: otherwise it repeats the total, or, beside an overdrawn account that is not a card, says more than the total without saying why. Each amount is a `WalletAmount` (its own label, masked in private mode).
- **P8. The rows (wc-wallets).**
  - 68 pt, radius 20, on the wallet's material, with Bun's face (36 pt), the name, the kind line (`card.kind*`) and the amount; a credit card that has spent shows ใช้ไป before its spending. The words come from P2-T11's `walletCardWords`, so the list says what the card says.
  - Labels (the board's): `{name} {kind} ยอด {amount}`, and a credit card that has spent `{name} ใช้ไป {amount}` (P3f). With no kind kept the gap closes. In private mode the amount's place says ซ่อนยอดเงินอยู่. A balance below zero says ติดลบ.
  - Sizes: `WalletAmount` has no 19 (the board's row amount), so rows use 17, its list size. The name is the label role at 700 (15 pt, as on the card; the board draws 16), ใช้ไป the caption role (13; the board draws 12).
  - At the largest text sizes the amount moves under the name, and nothing is clamped to a line, so an 80-code-point Thai name and ฿999,999,999.99 wrap (Review Focus 3's rule, on this list too).
- **P9. Typed routes.** A row opens `/spend/wallet/<id>` (P2-T22's route) and the add tile `/spend/wallet/new` (P2-T21's). Neither exists yet, and `typecheck:routes` refuses an href it does not know (the planner's probe without the casts: `PL/logs/probe-routes-uncast.log`). So the two hrefs are typed by hand in one place, with a comment; P2-T22 can drop the casts. Until those tasks land, a development build with the wallet area on shows expo-router's unmatched route for them.
- **P10. The route.**
  - The order: the legacy build redirects to `/spend` (as before); then the wallet area shows the Bun Wallet's list; then R4 Planning's screen under `planning`; else the redirect. The wallet area is its own area (W1) and does not need `planning`.
  - `?reorder=1` (Home's จัดเรียง, P2-T24) passes `openReorder`; any other value does not. The tray opens once the wallets are read.
  - The branch wraps the screen in `SpendV1Provider` with the shared resources, as every spend route does; P2-T18's `WalletShell` nests the same singleton.
  - The kept looks' provider is `WalletShell`'s (P2-T18, plan line 1075; the harness mounts it innermost, as the shell will). The route mounts none: a second provider would keep its own memory, and Home would not see a new order. Until P2-T18 lands, a development build with the wallet area on shows derived looks here and keeps no order (`setOrder` outside a provider keeps nothing). Recorded for P2-T18.
- **P11. The sections.**
  - `bw-wallets` (the board), `bw-wallets-archived` (the archived list opened) and `bw-wallets-reorder` (the tray open over the list), each `screenSection` drawing the real screen on fakes: wc-wallets' four wallets and one archived at ฿0.
  - The looks belong to the catalogue's own account (`0000000c-0000-4000-8000-00000000ca7a`), never the person's: the section's fake diary opens that account, and its `prepare` writes the board's looks and order before the screen mounts, so every opening starts from the board and the tray's presses change only that account. On a development build those three keys stay in the device's store under that id.
  - The screen is loaded when a section opens (`React.lazy` and `Suspense`), not when the list is read. It reaches `expo-crypto` (through P2-T19's hook) and `expo-router`, which fail to load unmocked in the render suite (`PL/logs/probe-imports.log`), and the wallet tests that read the wallet's list (`walletHarness`, `Tray`, `PrivateMode`, `WalletLooks`, `AmountStep`, and P2-T12's `CardStack`) mock neither. The catalogue's own suites mock both. The web export builds the dynamic import (Step 6).
  - The titles are `Bun Wallet: wallets`, `Bun Wallet: wallets, archived opened` and `Bun Wallet: wallets, reorder tray` (R72: unique, never a heading the screen draws). No section imports the harness.
- **P12. The test seams, each explained in the test file's header or beside its use.**
  - `expo-router` is the catalogue's `routerTestStub` (recorded `push`, `replace`, `back`, `canGoBack`; `useLocalSearchParams` reads its `LocalRouteParamsContext`); `expo-crypto` is mocked as the catalogue suites mock it; `@mobile/api/sharedV1` hands the route the case's own fake.
  - Reanimated keeps the tray's card unseen until an `animationstart` that happy-dom never fires: `startAnimations()` fires it, as `Tray.render.test.tsx` does.
  - react-native-web drops `numberOfLines`, so the props reaching `@mobile/theme/AppText`'s `Text` are recorded, as `WalletCard.render.test.tsx` does.
  - `settle()` waits three act-wrapped ticks: the wallets' read, the kept looks' read, and a read again after a command.
  - Two presses inside one `act` reach the same rendered press handler, with no render between them, which is how the ref rules are pinned.
  - The fake diary's `set({ accountId })` opens another account.
  - react-native-web omits `aria-disabled` when it is false, so an enabled button has none.
- **P13. The cases beyond the plan's.**
  - `walletsList.test.ts`: the plan's summary case, plus: archived wallets count nowhere, a card paid ahead is money held, an overdrawn wallet that is not a card counts in the total only, exact past 2^53, and no wallets is zero; `frontFirst` (kept order, then by name and id; archived, unknown and repeated ids); `moveWallet` (one place, the ends, an unknown id, a new array, the input untouched).
  - `WalletsList.render.test.tsx`: the plan's five (the list, unarchive, reorder, `?reorder=1`, 44 pt and named arrows), plus: an unconfirmed, a blocked, a refused and a changed-elsewhere unarchive; a total below zero; navigation (a row, the add tile, back or home); private mode (Review Focus 2); the largest text sizes (Review Focus 3); loading and load problems; and the sections. The cases that draw colour or size run light and dark in Thai and English; those about words run in Thai and English; the rest run in Thai by day (Global Constraints, line 106).
  - `PlanningRoutes.render.test.tsx`: one case for the route's wallet branch (P10).
- **P14. 84 mutants, all killed.** They cover the pure rules (S1 to S7, O1 to O6, M1 to M3, the Node file; S1 is the plan's "count a credit card's debt as held money"), the screen (L1 to L41), the tray (T1 to T13; T1 is the plan's "save the order last-first"), the copy (K1, K2), the catalogue (C1 to C6) and the route (R1 to R6). None survives and none is marked equivalent.
- **P15. Clear of the work in flight; merge order.**
  - tray-hardening merges first, then P2-T14 (P1); this task touches nothing under `src/wallet/tray/` or `src/wallet/add/`.
  - P2-T12 (being built) shares only `index.ts`, at another anchor (between the kit's lines and the tray's). `git merge-file` merges the two edits cleanly in either order and both orders give the same file, and `git apply --3way` of this task's diff onto a head that already has P2-T12 gives that file too (`PL/logs/merge/`). P2-T12's catalogue case reads its sections after the kit's, so this task's spread does not touch it.
  - P2-T14's catalogue case reads the add tray's sections right after the tray's (`ids.slice(at - 4, at + 2)`), and this task's come after them, so it passes unchanged (Step 4.7).
  - P2-T21 and P2-T22 extend `wallets/copy.ts` and add the two routes P9 names.
  - The edge lane (1B-T12, fix-download-aborts, alarm-hardening) touches nothing here.
- **P16. The gate (R100).** Run: `typecheck:app`; `typecheck:routes` (a route changes); the focused files RED to GREEN; the focused neighbours (the eight render files that read the hook, the tray, the harness, private mode, the looks, the add tray, the card, or today's Wallets screen); the catalogue's wallet sections in the every-section and screen-reader suites (`-t "bw-"`) and the registry rule; `test:app`; `test:unit`; `export:web` (a route changes: the protocol's fast gate); `git diff --check`. CI runs the full render suite, `export:web` and the iOS export. Nothing outside `apps/app` changes, so there is no API, edge or database suite; no package changes, so no `test:ops`.
- **P17. For E2-B (the owner's look at the daily loop), the differences from wc-wallets:**
  - the sizes in P8 (row name 15 pt, amount 17, ใช้ไป 13) and the total's label at the caption's 13 (the board draws 14);
  - no soft shadow under the rows (the wallet card has none either);
  - the add tile's dashed ring is `hairline` (the board's #C9C5D8 is not in the palette);
  - the held line shows only once a credit card has spent (P7);
  - labels: cash says its kind line (the board's label leaves it out), and BTS / MRT keeps its slash;
  - the archived list opens in place under its row (the board draws it closed), each wallet with นำกลับมาใช้ (Thai draft) and its kind line;
  - the reorder tray has no board (W28): rows on `raised` with the wallet's material, its name and two 44 pt arrows; the first can go no higher, the last no lower; every press is kept at once, so there is no Save;
  - จัดเรียง is not drawn with no account open (P5);
  - every English line is a draft.
- **P18. Notes for later tasks** (the receipt carries them):
  - **P2-T18:** `WalletShell` mounts `WalletLooksProvider` (plan line 1075); until it does, the wallet area's list keeps no order on a device (P10). The route keeps its own `SpendV1Provider`, which is harmless under the shell's.
  - **P2-T21:** extend `wallets/copy.ts`; the add tile already opens `/spend/wallet/new`.
  - **P2-T22:** a row already opens `/spend/wallet/<id>`; once both routes exist (P2-T21's and P2-T22's), drop the two casts in `WalletsListScreen.tsx` (P9).
  - **P2-T23:** build `homeWallets`' order with `frontFirst(wallets, order)` reversed (the front card last), so the list, the tray and the stack agree.
  - **P2-T24:** Home's จัดเรียง is `/spend/wallets?reorder=1`.
  - **P2-T37:** every amount on the list is a `WalletAmount`, and each row's label says ซ่อนยอดเงินอยู่ in private mode.
  - **The reorder tray passes no `onClosed`** and opens nothing after it, so tray-hardening's n-3 (on iOS `onClosed` can come twice for two hides, or not at all for a Modal that never presented) does not touch it.
  - **E2-B:** P17's differences; capture `bw-wallets-reorder` from a fresh launch (P2-T13's n2).

---

## Step 0: Sync, and what this task waits for

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date.", or a fast-forward. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. tray-hardening has merged:
   - `grep -c "const first = ids.indexOf('bw-tray-short');" WT/apps/app/src/wallet/tray/Tray.render.test.tsx`. Expected: `1`. If it prints `0`, report BLOCKED: "tray-hardening has not merged; P2-T20 starts after it (brief P1)".
   - `shasum -a 256 WT/apps/app/src/wallet/tray/Tray.tsx WT/apps/app/src/wallet/tray/Tray.render.test.tsx WT/apps/app/src/wallet/tray/trayGesture.test.ts`. Compare each with its `base/` line in `PL/SHA256SUMS`. If one differs (tray-hardening's fix round), go on, record which in the receipt, and take N from your own Step 1.3 (ruling P1 says what this task relies on).
3. P2-T14 has merged:
   - `grep -c "import { WALLET_ADD_SECTIONS } from './addSections';" WT/apps/app/src/dev/catalogue/wallet/index.ts` and `grep -c "  ...WALLET_ADD_SECTIONS," WT/apps/app/src/dev/catalogue/wallet/index.ts`. Expected: `1` and `1`. If either prints `0`, report BLOCKED: "P2-T14 has not merged; P2-T20 starts after it (brief P1)".
   - `ls WT/apps/app/src/wallet/add/AmountStep.tsx WT/apps/app/src/dev/catalogue/wallet/addSections.tsx`: both exist.
4. `/usr/bin/git -C WT diff --stat dbfde7d HEAD -- apps/app packages package.json package-lock.json`. Expected: tray-hardening's three files under `apps/app/src/wallet/tray/`; P2-T14's files under `apps/app/src/wallet/add/`, `apps/app/src/dev/catalogue/wallet/addSections.tsx`, `apps/app/src/dev/catalogue/wallet/index.ts` and `apps/app/src/wallet/copy/draftText.test.ts`; and perhaps P2-T12's (`apps/app/src/wallet/card/` new files, `apps/app/src/dev/catalogue/wallet/stackSections.tsx`, and `index.ts` again).
   - If it lists a file this task creates, report BLOCKED with the output: anything under `apps/app/src/wallet/wallets/`, or `apps/app/src/dev/catalogue/wallet/walletListSections.tsx`.
   - If it lists `apps/app/app/spend/wallets.tsx` or `apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx`, go on: Step 2.1 or Step 4.1 applies that file's diff with `git apply --3way`. `index.ts` is listed by P2-T14 itself; Step 0.5 says whether it is P2-T14's exactly.
   - If it lists a file this task's code calls into, go on, but name it in the receipt; a differing Expected line later is then a BLOCKED with this list: `apps/app/src/screens/redesign/planning/walletCommands.ts`, `apps/app/src/screens/v1/parts.tsx`, `apps/app/src/wallet/looks/WalletLooksProvider.tsx`, `apps/app/src/wallet/looks/walletLooks.ts`, `apps/app/src/wallet/card/WalletCard.tsx`, `apps/app/src/wallet/card/copy.ts`, `apps/app/src/wallet/common/copy.ts`, `apps/app/src/wallet/money/WalletAmount.tsx`, `apps/app/src/wallet/money/walletMoney.ts`, `apps/app/src/wallet/privacy/PrivateModeProvider.tsx`, `apps/app/src/wallet/controls/IconButton.tsx`, `apps/app/src/wallet/tray/TextLink.tsx`, `apps/app/src/wallet/testing/walletHarness.tsx`, `apps/app/src/dev/catalogue/screenSection.tsx`, `apps/app/src/dev/catalogue/routerTestStub.tsx`, `apps/app/src/spend/v1/testing/fakeResources.ts`, `apps/app/src/spend/v1/testing/fakeDiary.ts`, `apps/app/src/config/featureFlags.ts`. Anything under `packages/`, or `package.json` or `package-lock.json`: BLOCKED.
   - Any other file: go on. The focused counts this task does not change (N, C) are then your own Step 1.3 base, and the receipt names each merge.
   - Then run `/usr/bin/git -C WT log --oneline dbfde7d..HEAD`, and keep the merged PRs it lists for the receipt.
5. The three existing files: `shasum -a 256 WT/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/app/spend/wallets.tsx WT/apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx`. Each equals its `orig/` line, except `index.ts` when P2-T12 merged first (its stack lines are then in it too: Step 4.1 applies the diff), and except a file Step 0.4 listed. `ls WT/apps/app/src/wallet/wallets WT/apps/app/src/dev/catalogue/wallet/walletListSections.tsx` says "No such file or directory" twice. If anything else differs, report BLOCKED.

## Step 1: Install and the focused base

1. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
2. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The focused base (the per-file counts this task's Expected lines build on; R100: no whole-suite count):
   - `cd WT/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > S/base-draft.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/base-routes.log 2>&1; echo $?`. Expected: 0, `Tests  3 passed (3)`.
   - The neighbours: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/WalletsScreen.render.test.tsx src/screens/redesign/planning/walletCommands.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/card/WalletCard.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  8 passed (8)`, `Tests  169 passed (169)` at the brief's base (74 + 21 + 22 + 9 + 9 + 13 + 12 + 9, with tray-hardening's 784667b files); more if tray-hardening's fix round added cases to `Tray.render.test.tsx`. Call this count N.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  22 passed` (eleven wallet sections, two suites), or 26 if P2-T12 merged first (its two sections). Call this count C. Ignore the `skipped` count: it moves with the head.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > S/base-registry.log 2>&1; echo $?`. Expected: 0, `Tests  1 passed`.

## Step 2: The tests, the copy, the routes test and the typed stubs (plan Step 1)

1. Copy:
   ```bash
   mkdir -p WT/apps/app/src/wallet/wallets
   cp PL/real/apps/app/src/wallet/wallets/walletsList.test.ts WT/apps/app/src/wallet/wallets/walletsList.test.ts
   cp PL/real/apps/app/src/wallet/wallets/WalletsList.render.test.tsx WT/apps/app/src/wallet/wallets/WalletsList.render.test.tsx
   cp PL/real/apps/app/src/wallet/wallets/copy.ts WT/apps/app/src/wallet/wallets/copy.ts
   cp PL/stubs/apps/app/src/wallet/wallets/walletsList.ts WT/apps/app/src/wallet/wallets/walletsList.ts
   cp PL/stubs/apps/app/src/wallet/wallets/WalletsListScreen.tsx WT/apps/app/src/wallet/wallets/WalletsListScreen.tsx
   cp PL/stubs/apps/app/src/wallet/wallets/ReorderTray.tsx WT/apps/app/src/wallet/wallets/ReorderTray.tsx
   cp PL/real/apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx WT/apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx
   ```
   If Step 0.4 listed `PlanningRoutes.render.test.tsx`, use this in place of its `cp`: `/usr/bin/git -C WT apply --3way PL/diffs/apps_app_src_screens_redesign_planning_PlanningRoutes.render.test.tsx.diff`. It must apply with no conflict; otherwise report BLOCKED.
2. `shasum -a 256` the seven files and compare: the `real/` lines for the two new tests, `copy.ts` and `PlanningRoutes.render.test.tsx` (only when it was copied), the `stubs/` lines for the three others. If a `cp` source is missing or a checksum differs, report BLOCKED.
3. The stubs, for reference. `walletsList.ts` has the real types and wrong answers; the screen draws an empty view with its test id; the tray draws nothing. The route, the sections and `index.ts` stay as at the start until Step 4.

{{CODE:stubs:apps/app/src/wallet/wallets/walletsList.ts}}

{{CODE:stubs:apps/app/src/wallet/wallets/WalletsListScreen.tsx}}

{{CODE:stubs:apps/app/src/wallet/wallets/ReorderTray.tsx}}

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT/apps/app && npm run test:unit -- src/wallet/wallets/walletsList.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: 1, `ℹ tests 4`, `ℹ pass 0`, `ℹ fail 4`, each an `AssertionError [ERR_ASSERTION]`:
   - `the summary splits money held from credit-card spending`: strictly deep-equal, actual `{ activeCount: 0, totalMinor: '0', heldMinor: '0', creditUsedMinor: '0' }`, expected `{ activeCount: 4, totalMinor: '2236600', heldMinor: '2628600', creditUsedMinor: '392000' }`;
   - `archived wallets count nowhere, a card paid ahead is money held, and a wallet below zero that is not a card counts in the total only`: actual the same zeros, expected `{ activeCount: 4, totalMinor: '9007199254640993', heldMinor: '9007199254790993', creditUsedMinor: '0' }`;
   - `front first: the kept order, then every wallet it does not name by name; archived and unknown ids are passed over`: actual `[]`, expected `[ 'w-card', 'w-main', 'w-a', 'w-b', 'w-cash' ]`;
   - `a move takes one wallet one place, keeps every other in its place, and never changes the order it was given`: actual `[ 'a', 'b', 'c', 'd' ]`, expected `[ 'a', 'c', 'b', 'd' ]`.
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/wallets/WalletsList.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  2 failed (2)`, `Tests  13 failed | 3 passed (16)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 13 and `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError' S/red-render.log` gives 0. Passing: the routes file's three old cases. Failing, each on an `AssertionError`:
{{RED_RENDER}}
   (At RED the route is still today's, so `?reorder=1 opens the reorder tray` draws today's Wallets screen; it fails on its first assertion.) Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/wallets/walletsList.ts WT/apps/app/src/wallet/wallets/walletsList.ts
   cp PL/real/apps/app/src/wallet/wallets/WalletsListScreen.tsx WT/apps/app/src/wallet/wallets/WalletsListScreen.tsx
   cp PL/real/apps/app/src/wallet/wallets/ReorderTray.tsx WT/apps/app/src/wallet/wallets/ReorderTray.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/walletListSections.tsx WT/apps/app/src/dev/catalogue/wallet/walletListSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/src/dev/catalogue/wallet/index.ts
   cp PL/real/apps/app/app/spend/wallets.tsx WT/apps/app/app/spend/wallets.tsx
   ```
   If Step 0.5 found `index.ts` differing from its `orig/` line (P2-T12 merged first), use this in place of its `cp`: `/usr/bin/git -C WT apply --3way PL/diffs/apps_app_src_dev_catalogue_wallet_index.ts.diff`. It must apply with no conflict, `import { WALLET_LIST_SECTIONS } from './walletListSections';` must come right after `import { WALLET_ADD_SECTIONS } from './addSections';`, and `...WALLET_LIST_SECTIONS,` right after `...WALLET_ADD_SECTIONS,`, as the last spread; otherwise report BLOCKED. Likewise, if Step 0.4 listed `app/spend/wallets.tsx`, apply `PL/diffs/apps_app_app_spend_wallets.tsx.diff` with `--3way` in place of its `cp`.
2. `shasum -a 256` the ten files against their `real/` lines in `PL/SHA256SUMS` (all equal; `index.ts`, `wallets.tsx` and `PlanningRoutes.render.test.tsx` only when they were copied). `/usr/bin/git -C WT status --short` shows exactly ` M apps/app/app/spend/wallets.tsx`, ` M apps/app/src/dev/catalogue/wallet/index.ts`, ` M apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx`, `?? apps/app/src/dev/catalogue/wallet/walletListSections.tsx` and `?? apps/app/src/wallet/wallets/` (`M ` in the first column, staged, for a file `git apply --3way` wrote).
3. The code, for reference: the Appendix holds every file (read them before the receipt; their headers say why). `walletsList.ts`: P3a and P4; `WalletsListScreen.tsx`: P5 to P9; `ReorderTray.tsx`: P3c and P4; `wallets.tsx`: P10; `walletListSections.tsx` and `index.ts`: P3d and P11; `copy.ts`: P3f.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0. Then `cd WT && npm run typecheck:routes -w gogospend-app > S/green-typecheck-routes.log 2>&1; echo $?`. Expected: 0.
5. `cd WT/apps/app && npm run test:unit -- src/wallet/wallets/walletsList.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0` (4 + 4: P2-T3's check of every draft table reads this task's copy too).
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/wallets/WalletsList.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  16 passed (16)` (12 + 4), each case marked `✓`, and `grep -c '^stderr |' S/green-render.log` gives 0 (no `act(...)` warning and no `console.error`).
7. The neighbours, unchanged: the Step 1.3 neighbours command with `S/green-neighbours.log`. Expected: 0, `Tests  N passed (N)` (169 at the brief's base). P2-T14's `AmountStep.render.test.tsx` is among them: its sections case still finds the add tray's sections right after the tray's.
8. The catalogue's wallet sections: the Step 1.3 catalogue command with `S/green-catalogue.log`. Expected: 0, `Tests  C + 6 passed` (28 at the brief's base: fourteen sections, two suites). Then the registry rule: the Step 1.3 registry command with `S/green-registry.log`. Expected: 0, `Tests  1 passed`.

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its suite (the Node file for S, O and M; the routes file for R; the render file for the rest), and restores the file with its SHA-256 checked. It takes ten to thirty minutes, by the machine's load. Expected: exit 0, and these 85 lines (each line in your file also gives its suite's counts, the AssertionError count and "restored sha256 equal"; compare with `PL/logs/mutants.out`):
   ```
{{MUTANTS}}
{{MUTANT_TOTAL}}
   ```
   S1 and T1 are the plan's two mutants. C6 waits for its section's script to stop (about 15 s).
2. `shasum -a 256` the ten files against `real/` again, and run `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2.

## Step 6: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run typecheck:routes -w gogospend-app`: exit 0 (a route changes).
3. `npm run test:app`: exit 0, `ℹ fail 0`. (No count is expected here: CI holds the whole suites, R100.)
4. `npm run test:unit`: exit 0, `ℹ fail 0`.
5. The focused files once more: Step 4.5 (`ℹ pass 8`, `ℹ fail 0`) and the render command of Step 4.6 with the neighbours added (the eight files of Step 1.3): exit 0, `Test Files  10 passed (10)`, `Tests  16 + N passed` (185 at the brief's base). A case that times out near 5 s in a file this task does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.
6. `npm run export:web -w gogospend-app -- --max-workers 2 > S/gate-export-web.log 2>&1; echo $?`: exit 0, with a `Web Bundled` line (a route changes; the module count moves with the head, so none is expected).
7. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): the full render suite (CI, R100; the catalogue's every-section and screen-reader suites pick up the three sections there, and the large-text suite does not open them); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped); and device and simulator checks, all SKIPPED: VoiceOver on the rows' labels, the archived row's expanded state and each arrow's name; a quick double tap on นำกลับมาใช้ and on an arrow on a phone; the reorder tray at AX5 on a phone; the list on a development build with the wallet area on (P10: until P2-T18, no kept looks there); and E2-B's screenshots (the controller's, after P2-T28).

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T20.md` in the house style (see `docs/implementation/receipts/P2-T13.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T20: The wallets list, the archived list and reorder

- **Status:** built and verified locally on `p2/t20-wallets-list` (`.claude/worktrees/p2-t20`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`, after tray-hardening and P2-T14 merged. (The brief was proven at `dbfde7d` with tray-hardening's three files and P2-T14's eleven laid over it. Name each merged PR from `git log --oneline dbfde7d..HEAD`, say whether P2-T12 merged first, and name any tray file whose checksum differed from the brief's base.)
- **Files:** created `apps/app/src/wallet/wallets/walletsList.ts`, `walletsList.test.ts` (4 cases), `copy.ts`, `WalletsListScreen.tsx`, `ReorderTray.tsx`, `WalletsList.render.test.tsx` (12 cases), `apps/app/src/dev/catalogue/wallet/walletListSections.tsx` and this receipt; modified `apps/app/app/spend/wallets.tsx` (the wallet area's branch), `apps/app/src/dev/catalogue/wallet/index.ts` (one import, one spread, after the add tray's) and `apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx` (a mock of the new screen, `useLocalSearchParams`, and 1 case).
- **What changed:** (the summary's figures; the front-first order and the moves; the list and its rows; unarchive through P2-T19's hook; the reorder tray; the route; the copy; the sections.)
- **RED to GREEN:** ... (Steps 3 and 4: the 4 Node and 13 render failures and their messages; GREEN 8 and 16; the neighbours N unchanged; the catalogue's wallet sections C to C + 6.)
- **Mutation check:** 84 mutants, all killed ... (one line per group, with the case that kills it; S1 and T1 are the plan's.)
- **Gate** (worktree root): ... (Step 6, each command with its result; no whole-suite count, R100.)
- **Deviations:** the names and files beyond the plan's list (rulings P3a to P3f: `frontFirst`, `moveWallet`, `Chevron`, `WALLET_LIST_SECTIONS`, the routes test, the two extra copy lines); the order kept at once, with no Save (P4); no จัดเรียง with no account open (P5); the held line only once a card has spent (P7); the row sizes (P8); the two hand-typed hrefs (P9); the route's order and no looks provider in it (P10); the lazily loaded screen and the catalogue's own account (P11); the E2-B differences (P17).
- **SKIPPED:** the full render suite (CI); the iOS export (CI); `test:ops`; the API, edge and database suites; device and simulator checks (Step 6).
- **Risks:** a press in the few milliseconds before the account's first read lands keeps the order the tray showed then (P4); until P2-T18 mounts the kept looks' provider in `WalletShell`, the wallet area's list keeps no order on a device (P10); a row and the add tile open routes P2-T22 and P2-T21 add (P9).
- **Notes for later tasks:** (ruling P18, each.)
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/wallets/walletsList.ts apps/app/src/wallet/wallets/walletsList.test.ts apps/app/src/wallet/wallets/copy.ts apps/app/src/wallet/wallets/WalletsListScreen.tsx apps/app/src/wallet/wallets/ReorderTray.tsx apps/app/src/wallet/wallets/WalletsList.render.test.tsx apps/app/app/spend/wallets.tsx apps/app/src/dev/catalogue/wallet/walletListSections.tsx apps/app/src/dev/catalogue/wallet/index.ts apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx docs/implementation/receipts/P2-T20.md`
2. `/usr/bin/git -C WT status --short`: those eleven staged, nothing else (no log, no `dist/`).
3. Write the message to `S/commit-message.txt`:
   ```
   Add the Bun Wallet wallets list with archived wallets and reorder

   Add the wallet area's wallets list: the summary card (every wallet in
   use added up exactly, and what the credit cards have spent taken off
   what is held), a row per wallet in the kept front-first order, the add
   tile, and the archived wallets, each brought back through the wallet
   command hook, one press at a time. Add the reorder tray: move-up and
   move-down buttons that name each wallet and keep the new order on the
   phone at once. The route shows the list while the wallet area is on,
   and ?reorder=1 opens the tray. Add its three catalogue sections after
   the add tray's.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 11 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (84 killed); each gate command with its result (no whole-suite count, R100); SKIPPED items; deviations (P3 to P11, P17); and what the reviewer should look at first: the order and the moves (P4: front first, once per press, a fresh array, the ref, each opening from the kept order), unarchive's press guard and outcomes (P6), the no-account rule (P5), the held line (P7), the row labels (P8), the hand-typed hrefs (P9), the route's order and why it mounts no looks provider (P10), the lazily loaded screen in the sections and the catalogue's own account (P11), and the routes test's new mock (P3e).

---

## Appendix: the code

Every block is the file in `PL/real/`, byte for byte.

`apps/app/src/wallet/wallets/walletsList.ts`:
{{CODE:apps/app/src/wallet/wallets/walletsList.ts}}

`apps/app/src/wallet/wallets/copy.ts`:
{{CODE:apps/app/src/wallet/wallets/copy.ts}}

`apps/app/src/wallet/wallets/ReorderTray.tsx`:
{{CODE:apps/app/src/wallet/wallets/ReorderTray.tsx}}

`apps/app/src/wallet/wallets/WalletsListScreen.tsx`:
{{CODE:apps/app/src/wallet/wallets/WalletsListScreen.tsx}}

`apps/app/app/spend/wallets.tsx`:
{{CODE:apps/app/app/spend/wallets.tsx}}

`apps/app/src/dev/catalogue/wallet/walletListSections.tsx`:
{{CODE:apps/app/src/dev/catalogue/wallet/walletListSections.tsx}}

The three diffs (`PL/diffs/`):
{{DIFF:apps_app_src_dev_catalogue_wallet_index.ts.diff}}
{{DIFF:apps_app_app_spend_wallets.tsx.diff}}
{{DIFF:apps_app_src_screens_redesign_planning_PlanningRoutes.render.test.tsx.diff}}

The tests are in `PL/real/` (`walletsList.test.ts`, `WalletsList.render.test.tsx`); read them before the receipt, since it names every case.
