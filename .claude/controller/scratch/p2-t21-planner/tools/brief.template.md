# Brief P2-T21: A new wallet, editing a wallet and the correction tray

You are the implementer for plan P2, Task P2-T21. You add the Bun Wallet's new-wallet flow (`NewWalletFlow`: the kind, wc-wallet-type; the fields; the ceremony, bw-adding), the fields both screens share (`WalletFields`), editing a wallet (`WalletEditScreen`, wc-wallet-edit, with archiving) and the correction tray (`CorrectionTray`), their draft copy (`wallets/copy.ts`), two routes (`app/spend/wallet/new.tsx` and `app/spend/wallet/[id]/edit.tsx`) and five catalogue sections; you point the wallets list's add tile at the flow so it comes back to the list, move P2-T19's `wallet_added` out of the save's way, and shorten a new wallet's drop. The planner wrote every file below and proved it in a scratch copy of the integration head `964f6c0e` (ruling P2): RED on typed stubs (25 of 70 render cases fail, each on an assertion; the 45 that pass are the changed shared files' cases that pin what does not change), GREEN, 109 mutants (all killed), the focused neighbours, the catalogue's wallet sections, and the fast local gate of R100. Do exactly what this brief says.

**This task is ready** (ruling P1): P2-T9, P2-T14 and P2-T20 have merged. Step 0 checks for them by content.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. R100 applies: the fast local gate only (Step 6), and no whole-suite total anywhere; CI runs the whole suites on the PR. R87 applies: your receipt is its own file, `docs/implementation/receipts/P2-T21.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T21` (lines 1158 to 1185); W1, W6, W7, W10, W25, W27 and W30 (lines 38, 43, 44, 47, 62, 64 and 67); Review Focus 2 and 3 (lines 115 and 116); its Global Constraints (lines 82 to 108: copy and E2 on line 85, accessibility on line 87, colour on line 88, money on line 89, analytics on line 92, the R72 test traps on lines 94 to 99, both modes and both languages on line 106, time on line 108); what later tasks take from this one: P2-T22 (from line 1189: the detail's แก้ไข opens the edit route, and `wallet.gone`), P2-T35 (`?setup=1`, the plan's `returnTo`).
3. The boards: `docs/design/bun-wallet/wc-wallet-type.dc.html`, `wc-wallet-edit.dc.html` and `bw-adding.dc.html`.
4. The receipts this task builds on: `docs/implementation/receipts/P2-T20.md` (the list), `P2-T19.md` (the wallet command hook), `P2-T14.md` and `P2-T14-fix.md` (the keypad, `filledKeypad`, R106), `P2-T13.md` and `tray-hardening.md` (the tray), `P2-T11.md` and `wallet-looks-unstored.md` (the kept looks), `P2-T9.md` (motion), `P2-T10.md` (money text and private mode) and `P2-T8.md` (how to mount through `mountWallet`).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t21` (branch `p2/t21-wallet-edit`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t21-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the eighteen files this task creates or changes, at their repo paths (the receipt is yours);
  - `stubs/`: the RED forms (typed stubs) of the four parts and the two routes;
  - `orig/`: the ten existing files this task changes, as they are at `964f6c0e`;
  - `diffs/`: one diff per changed existing file, paths `a/<repo path>` and `b/<repo path>` with full blob ids, so `git apply --3way` can merge them (`<repo path>` with `/` as `_`, then `.diff`). The planner checked that each turns `orig/` into `real/` byte for byte (`PL/logs/diffs-apply.log`);
  - `tools/`: `files.sh` (the file lists), `stage.sh` (puts a tree at the base, RED or GREEN), `mutants.py` (the mutant runner), `derived.mjs` (the derived looks the tests' fixed ids were picked by), `fill_brief.py` and `brief.template.md` (how this brief was built: every code block below is the `real/` or `stubs/` file or the `diffs/` file, byte for byte, and the mutant lines are `logs/mutants.out`), and `sums.sh`;
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (everything in `logs/`, which the state commits leave out: `base-*`, `red-*`, `green-*`, `gate-*` (the fast gate), `dev-*` (the planner's working runs), `probe-*` (the planner's probes), `diffs-apply.log`, `npm-ci.log`, `mutants.out` and `mutant-logs/`; `superseded/`, the planner's first mutant round, before three more pins were added, P17).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused Node files: `cd WT/apps/app && npm run test:unit -- <files>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`.
- This task needs no heavy lock: no database suite and no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`). Quote paths with `[id]` in them.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The only counts that may differ from this brief's are N and C (Step 1.3), and only as Step 0 says; and a load flake (a case that times out under load in a file this task does not touch: rerun that file alone once and record both runs).

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/wallets/NewWalletFlow.tsx` | **new** ({{LINES:apps/app/src/wallet/wallets/NewWalletFlow.tsx}} lines). `NewWalletFlow`, the plan's props widened (P3b), `NewWalletReturn`, `KIND_MATERIAL` (P5 to P8). |
| `apps/app/src/wallet/wallets/WalletFields.tsx` | **new** ({{LINES:apps/app/src/wallet/wallets/WalletFields.tsx}} lines). `WalletFields`, the plan's props and two more (P3a, P9). |
| `apps/app/src/wallet/wallets/WalletEditScreen.tsx` | **new** ({{LINES:apps/app/src/wallet/wallets/WalletEditScreen.tsx}} lines). `WalletEditScreen`, the plan's props and `now` (P3c, P10, P12). |
| `apps/app/src/wallet/wallets/CorrectionTray.tsx` | **new** ({{LINES:apps/app/src/wallet/wallets/CorrectionTray.tsx}} lines). `CorrectionTray`, exactly the plan's props (P11). |
| `apps/app/src/wallet/wallets/NewWallet.render.test.tsx` | **new**, render suite ({{LINES:apps/app/src/wallet/wallets/NewWallet.render.test.tsx}} lines). 12 cases: the plan's five for the flow and seven more (P16). |
| `apps/app/src/wallet/wallets/WalletEdit.render.test.tsx` | **new**, render suite ({{LINES:apps/app/src/wallet/wallets/WalletEdit.render.test.tsx}} lines). 9 cases: the plan's two for editing and seven more (P16). |
| `apps/app/app/spend/wallet/new.tsx` | **new route** (P13). |
| `apps/app/app/spend/wallet/[id]/edit.tsx` | **new route** (P13). |
| `apps/app/src/wallet/wallets/copy.ts` | **extended** (P2-T20's file; the plan says so). The plan's lines and three more (P3d). {{LINES:orig:apps/app/src/wallet/wallets/copy.ts}} lines before, {{LINES:apps/app/src/wallet/wallets/copy.ts}} after. |
| `apps/app/src/dev/catalogue/wallet/walletListSections.tsx` | **extended** (P2-T20's list; the plan says so). Five sections after `bw-wallets-reorder` (P14). `index.ts` does not change. |
| `apps/app/src/wallet/wallets/WalletsListScreen.tsx` | **shared** (P2-T20's). The add tile opens the flow with `returnTo`, and its cast goes (P4a). |
| `apps/app/src/wallet/wallets/WalletsList.render.test.tsx` | **shared** (P2-T20's). The navigation case's new href, and P2-T20's review pins PA, PB and PF (P4b). 12 cases before, 15 after. |
| `apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx` | **shared** (the routes rule). Mocks of the two new screens, the two routes, one case (P3f). 4 cases before, 5 after. |
| `apps/app/src/dev/catalogue/routerTestStub.tsx` | **shared**. `dismissTo` recorded (P3g). |
| `apps/app/src/screens/redesign/planning/walletCommands.ts` | **shared** (P2-T19's hook). `wallet_added` sent once the outcome is decided, guarded (P4c). |
| `apps/app/src/screens/redesign/planning/walletCommands.render.test.tsx` | **shared**. One case (P4c). 21 cases before, 22 after. |
| `apps/app/src/wallet/motion/useWalletMotion.ts` | **shared** (P2-T9's). A new wallet's card drops about one card's height (P4e). |
| `apps/app/src/wallet/motion/useWalletMotion.render.test.tsx` | **shared**. One case (P4e). 6 cases before, 7 after. |
| `docs/implementation/receipts/P2-T21.md` | **new**. Your receipt (R87). |

Not in this task: `src/wallet/card/` (P2-T11's and P2-T12's: `WalletCard` and `walletCardWords` are read, never changed; `cardNativeProps.test.ts` already holds P2-T11's n3 case), `src/wallet/looks/` (read: `useWalletLooks`, `derivedLook`, `WALLET_KINDS`, `BUN_FACES`), `src/wallet/add/` (read: `WalletKeypad`, `filledKeypad`, `isFilled`), `src/wallet/tray/` (read: `Tray`, `PrimaryButton`, `TextLink`), `src/wallet/motion/` other than `useWalletMotion.ts` (`GrowBar` stays P2-T24's or P2-T30's, P4e), `walletsModel.ts` (read, never changed), `WalletsScreen.tsx` (R4's form: its suite runs unchanged), `src/dev/catalogue/wallet/index.ts`, `walletHarness.tsx`, `screenSection.tsx`, `draftText.test.ts` (every Thai line here holds Thai letters, so `LATIN_LINES` does not change), `en.json` and `th.json` (no catalog line is added; today's lines are reused through `tc`), `app/spend/_layout.tsx`, `app/spend/wallets.tsx`, the route `/spend/wallet/[id]` (P2-T22's) and `/spend/setup` (P2-T35's), any other route, the app entry or native code, any package or lockfile, `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready.**
  - Starts after P2-T9 (#368, merged `860990f`), P2-T14 (#407, `7cf4927`, after its R106 fix round) and P2-T20 (#416, `0bfd58a`), all in `964f6c0e`. wallet-looks-unstored (#391, `76b329c`), which `followups.md` (line 275) says must land before P2-T21 calls `setLook`, is in too; so are P2-T19 (#355, `daf8a63`: the hook), P2-T11 (#382) and P2-T13 (#383) with tray-hardening (#392, `37a0d2f`).
  - No package, lockfile change, Cloudflare resource, account setting or owner decision is needed. The copy follows owner Q3's default (P3d, P20).
- **P2. The proof's base is `964f6c0e`.** `git fetch` found `origin/claude/p1a-vault-core` at `964f6c0e`; its app code is `ab9f2c10` (#411, P2-T32, merged after #416 and #418); the commit after it touches only `.claude/`. The planner built the copy with `git archive 964f6c0e` (without `.claude/`) and `npm ci` (1416 packages); every stage ran on that tree, staged with `PL/tools/stage.sh`.
- **P3. The names and files beyond the plan's list.**
  - (a) `WalletFields` takes the plan's eight props and two more: `today` (Bangkok's today: the tracking line is a date through `src/ui/dateStep.ts`, which needs today to say วันนี้, and a screen passes it as it passes `now`), and `locked` (P9). It also exports `WalletFieldsProps`, `FACE_NAMES`, `MATERIAL_NAMES` and `chosenRing`.
  - (b) `NewWalletFlow`'s `returnTo` is `NewWalletReturn` (`'/spend/setup' | '/spend/wallets'`): the plan's `/spend/setup` and the list it was opened from (P4a). It also takes `now?: Date`, as P2-T22's `WalletDetailScreen` and today's `WalletsScreen` do, so the tests own the day. It exports `KIND_MATERIAL`. Private: `FlowPage`, `KindList`, `KindIcon`, `Added`.
  - (c) `WalletEditScreen` takes `now?: Date` (as above). Private: `EditForm`, `EditHeader`, `SaveButton`, `Archiving`, `ArchiveLater`, `LoadProblem`.
  - (d) `copy.ts`: the plan's lines as written (its Thai, English drafts), the faces' and materials' names as `wallets.faceSmile` … `wallets.faceWow` and `wallets.materialSilk` … `wallets.materialPeach`, and three changes: `wallets.archiveLater` writes the plan's ฿0 as `{zero}` (the Thai on screen is the same; both of the line's amounts are then drawn as amounts, "with both amounts", and spoken in words); `wallets.archiveLaterBelow` (draft: "เก็บได้เมื่อยอดเหลือ {zero} ตอนนี้ติดลบ {amount} โอนเงินเข้ามาก่อนนะ"), because the plan's line tells a wallet below zero to move its money out (P12); and `wallet.gone`, P2-T22's own line as its plan writes it, which an archived or unknown wallet's edit says first (P10).
  - (e) The sections are P2-T20's list's (`walletListSections.tsx`, the plan's file), after `bw-wallets-reorder`, so `index.ts` keeps its one spread (P14).
  - (f) The routes rule: no routes test loads the two new routes yet, so `PlanningRoutes.render.test.tsx` (the wallets route's, R4 Planning's) takes them: it mocks `NewWalletFlow` and `WalletEditScreen` as it mocks the list (a `Text` saying where the flow returns, or which wallet is edited, with the shared resources' marker), imports both routes, and gains one case. Its four cases run unchanged.
  - (g) `routerTestStub.tsx` records `dismissTo` (P8); no other case reads it.
- **P4. The follow-ups that name this task, each carried or said why not.**
  - (a) P2-T20's review (`followups.md` lines 592 to 594; `reviews/P2-T20.md` lines 142 to 144; the second review's line 72):
    - the add tile opens `{ pathname: '/spend/wallet/new', params: { returnTo: '/spend/wallets' } }`, so a wallet added from the list comes back to it; the cast on that href goes, since the route now exists (`walletHref` keeps its cast until P2-T22);
    - "read the list again on return": it is read again, because it mounts again. The spend layout draws its routes in a `Slot` (`app/spend/_layout.tsx:20`, and P2-T18's `WalletShell` keeps the `Slot`, plan line 1073), and expo-router's `Slot` is a stack that draws only the route in front (`node_modules/expo-router/build/views/Navigator.js:164-170`), so going back to the list unmounts the flow and mounts the list, whose `useLoad` reads at mount. No focus listener is added; the list's header says why.
  - (b) P2-T20's review pins (line 588: "P2-T24, or the next task that edits `WalletsList.render.test.tsx`"): this task edits that file, so it adds PA, PB and PF from `scratch/p2-t20-review/` on the file's own helpers. PC (R111, the held line) and PD stay P2-T24's.
  - (c) P2-T19's review (line 202; `reviews/P2-T19.md`):
    - m1 (`wallet_added` twice for one wallet): every press here is held by a ref, never React state, and the two-press cases count one create and one event (P6, P10);
    - m2 (the emitter inside the save's `try`): 1D-T6's client has landed, so `walletCommands.ts` now sends `wallet_added` once the outcome is decided, outside the save's `try`, and an emitter that throws is caught there, so a saved wallet is never read as a refusal and `send` never rejects; one hook case pins it (mutants H1 to H4);
    - m3 and m4 ("Untested: a create meeting its own wallet without a look drops its event; a made-up look passes; `sending` stuck true after a refusal; `resend()` choosing the older of two unconfirmed commands"): not carried. They are today's form's no-look path and the hook's `sending` and `resend()`, which this task's screens do not use (they hold presses with their own ref and resend their own command). Recorded for a hook test task (P21).
  - (d) wallet-looks-unstored's review (lines 354 and 356): each `setLook` gets a fresh object; nothing waits on a setter or seeds one from an effect.
  - (e) P2-T12's planner (lines 57 and 372 to 376) and P2-T9's review: the new wallet's drop is this task's ceremony. `walletAddedEntering(false)` now starts the card about one card's height above its place (`.withInitialValues({ originY: -200 })`, the stack's and full card's 200 pt), not a window's height, so the bouncy spring overshoots by about 44 pt, not about 190; tested in `useWalletMotion.render.test.tsx` (M1, M2). The simulator check is E2-B's. P2-T9's m-1 (GrowBar, "whichever task next edits `motion/`, P2-T24 or P2-T30") is not carried: this task changes only `walletAddedEntering`, and GrowBar's pins stay with the task that draws GrowBar.
  - (f) P2-T11's review (lines 286 and 287): n3's ready case is already in `cardNativeProps.test.ts` (P2-T12's fix round took it). The web role: the two cards this task draws with no `onPress` (the preview and the new wallet's card) are each wrapped in one element with the `image` role (`role="img"` on the web, as wc-wallet-edit's preview is) and its own label. With no account open the look's fields are not drawn (P9).
  - (g) tray-hardening's n-3 (line 409, any host tray): `CorrectionTray` passes no `onClosed` and opens nothing after it.
- **P5. The kind (wc-wallet-type).**
  - §5.2's four in `WALLET_KINDS`' order (the board's without the e-wallet, W25), each a 76 pt row that says its name and line; บัตรเดินทาง also says BTS / MRT (`card.kindTransit`), as the board writes it.
  - A kind starts the look on the material its tile is drawn in (`KIND_MATERIAL`: cash on paper, bank on silk, card on titanium, travel card on sky), with Bun smiling: "ชื่อและหน้าตาเปลี่ยนเองได้ในขั้นถัดไป". The name starts empty (`newWalletForm`): a name in the screen's language would become stored data.
  - Each step says กระเป๋าใหม่ · ขั้นที่ n จาก 3 and draws the three-step bar (decorative). Step 1's heading is the question; step 2's is the kind's name.
- **P6. Creating.**
  - เพิ่มกระเป๋า (`wallets.add`) builds the create with `buildCreateWallet` (one wallet id per flow, today's tracking start, the keypad's exact satang) and sends `{ kind: 'create', slot: 'create', input }` with `{ walletType: kind, material, bunFace: face }` through `useWalletCommand`. After `done` only, `setLook(id, { kind, material, face })`; a refused or lost create keeps nothing (the plan's mutant, N1).
  - One command at a time, held by a ref (P2-T19's review): two presses before React draws again send one create and one `wallet_added`.
  - Unconfirmed: the hook's words as an alert, the fields and เพิ่มกระเป๋า held, and Try again, which sends the same command: the same slot and payload give the same key (`useCommandKeys`). A blocked resend (the session changed) offers no Try again. Refused: on its fields when it names them ("Check the highlighted fields." above), else the hook's words; one that waits on an update holds เพิ่มกระเป๋า. Each field's problem clears as that field changes.
  - Analytics (R61, W27): the hook sends the one `wallet_added`; the screens send nothing. The case asserts no name or amount reaches the event.
- **P7. The ceremony (bw-adding).**
  - Close and เสร็จ both leave (P8). The card is the full `WalletCard` as one image with the card's own words; it drops in with `walletAddedEntering(reduced)`, built once at mount with the wallet's one reduced-motion answer (W6), and the `walletAdded` moment's haptic plays once (`motionFor`, the same under Reduce Motion). The plan plays success for every new wallet; the board's "success on the first wallet" is E2-B's (P20).
  - เพิ่มกระเป๋าแล้ว and {name}พร้อมให้จดแล้ว are one polite live region (the board's `role="status"`), then a summary of the name and the opening balance (`WalletAmount`, masked in private mode).
  - It follows the mode: bw-adding is drawn dark, and by day it is the light palette (P20).
- **P8. Where the flow goes.**
  - Close and เสร็จ: `router.dismissTo(returnTo ?? '/spend')`, which goes back to that screen when it is under the flow (the list that opened it, or the setup checklist) and otherwise replaces the flow with it, so the list is not drawn twice in the stack. Back on the first step: back, or, with nothing to go back to, `replace` with the same place. Back on the second step returns to the kinds, keeping what was typed; it is held while a create is out.
  - `/spend/setup` is P2-T35's route. Until it lands typed routes do not know it, so the destination is typed by hand in one place, with a comment (`PL/logs/probe-routes-uncast.log`: `typecheck:routes` without the cast). P2-T35 can drop it.
- **P9. The fields (`WalletFields`; wc-wallet-edit).**
  - The preview card first (P4f; "ตัวอย่างการ์ด {name} ยอด {amount}", with no gap for a missing name, and in private mode only that its amount is hidden). Then the name (a filled field with its own label, 44 pt), then the look on one card: the five faces (48 pt, on `raised`) and the five materials (56 × 44 pt), each a radio in a named radio group, the chosen one ringed in violet over a gap of the card's colour, as the board rings it.
  - Then the opening balance: its label and the tracking start (`wallets.trackingFrom` with `dayLabel`: เริ่มจด วันนี้ for a new wallet, เริ่มจด พฤหัส 1 ต.ค. for wc-wallet-edit's), the amount at 22 pt (DM Sans 700) with its own spoken words, the keypad's refusal (a key past ฿999,999,999.99, today's words) or the field's problem, then the tray's keypad (W29). What the person types is never masked; an amount they did not type (an edit's opening balance) is masked in private mode until a key is pressed (R106).
  - The tracking start is walletsModel's (`newWalletForm(today)`, or the wallet's): shown, not changed here; today's Wallets screen keeps its date chip (P20).
  - With no account open nothing could be kept (W7, P2-T20's P5), so the look's card is not drawn; the new wallet then shows the look derived from its id, which the preview and the ceremony draw (P4f).
  - `locked`: while a command is out or its answer unknown, the name, the faces, the materials and the keys do not change, so Try again sends what the person saw.
- **P10. Editing (`WalletEditScreen`; wc-wallet-edit).**
  - It reads the wallets and whether this one has entries (`history` from `TRACKING_START_MIN` to today, one row, as today's form does); while that is not known, or the read failed, a correction asks why too (`correctionNeedsReason`).
  - The header: back, แก้ไขกระเป๋า, and บันทึก (a 44 pt pill in the main button's colours; busy, it says กำลังบันทึก…). Then `WalletFields`, the entries note (`wallets.hasRecords`, only once it has entries), and archiving (P12).
  - Saving: nothing changed goes back with nothing sent. A rename sends only the name. A correction to a wallet with entries opens the correction tray first, and nothing is sent until a reason is chosen; then the correction goes with it. If Jotbun asks for the reason itself (`needsReason`), the tray opens. Done goes back (or to the list, with nothing to go back to). One command at a time, held by a ref.
  - Unconfirmed: Try again sends the same command under the same key, held meanwhile, none when blocked. Refused: as P6. Changed on another device: today's "This wallet changed on another device.", the wallets read again, and the form starts over from the newer version (it is keyed by id and version), so nothing the person did not change is sent back over theirs.
  - Looks are kept at once (`setLook`, a fresh object per press) and need no command (the plan).
  - The keypad starts as `filledKeypad(opening_minor)`. An opening balance is never below zero or past the cap: the API's wallets are read through `isWalletDto` (`resources.ts:182`), and `isWalletSnapshot` holds it to `^(0|[1-9][0-9]{0,10})$`.
  - An archived or unknown wallet says `wallet.gone`; loading and load problems are today's words, with Try again when it can help.
- **P11. The correction tray.** It hosts P2-T13's `Tray`, named by today's question (แก้ไขเพราะอะไร, "Why are you changing this?"), says why it asks (today's line), and offers today's two reasons in `CORRECTION_REASONS`' order, each a 56 pt button. A reason sends the correction with it; closing sends nothing. Every line is a catalog line through `tc`.
- **P12. Archiving.**
  - Only at exactly ฿0 (`canArchive`, the server's rule): เก็บกระเป๋านี้ถาวร with the archive icon, as the board draws it. It archives at once, with no confirmation: the board draws none, and the list's archived section brings it back. Archived, `router.dismissTo('/spend/wallets')`, since the wallet's own screens no longer exist.
  - Otherwise `wallets.archiveLater` with both amounts (฿0 and what it holds, each a `WalletAmount`, and the sentence its own spoken words), or, below zero, `wallets.archiveLaterBelow` with what it is below zero (P3d).
  - An archive refused because the balance moved says today's "{name} wasn't archived: its balance is no longer {zero}." and the wallet is read again, so the screen then says why it waits.
- **P13. The routes.** Each: the legacy build goes back to `/spend` (as `wallets.tsx` does); with the `wallet` area off, `<Redirect href="/spend/wallets" />` (the plan); otherwise the screen inside `SpendV1Provider` with the shared resources, as every spend route does. `new.tsx` passes `/spend/setup` for `?setup=1` (the plan), `/spend/wallets` for `?returnTo=/spend/wallets` (P4a), and nothing for any other value (no route a link names is followed). `[id]/edit.tsx` passes its `id`.
- **P14. The sections.**
  - `bw-wallet-new-type` (the kinds), `bw-wallet-new-form` (the bank account บัญชีหลัก at ฿24,860, typed by the script), `bw-wallet-added` (once it is created), `bw-wallet-edit` (wc-wallet-edit's บัญชีหลัก: opened at ฿30,000 on 1 October with ฿5,140 spent, so ฿24,860) and `bw-wallet-correction` (its opening balance changed and บันทึก pressed: the tray asks why), each the real screen on fakes, on the catalogue's own account with the board's looks (P2-T20's fixture), loaded when the section opens.
  - The scripts press by test id, and the keys by their digits, so they run in every language.
  - Titles: `Bun Wallet: new wallet, its kind`, `Bun Wallet: new wallet, its fields`, `Bun Wallet: new wallet, added`, `Bun Wallet: editing a wallet`, `Bun Wallet: editing a wallet, correction tray` (R72: unique, never a heading the screen draws).
- **P15. The test seams, each explained in the test file's header or beside its use.**
  - `expo-router` is the catalogue's `routerTestStub` (recorded `push`, `replace`, `back`, `dismissTo`, `canGoBack`; `useLocalSearchParams` reads its `LocalRouteParamsContext`); `expo-crypto` is mocked as the catalogue suites mock it; `@mobile/api/sharedV1` hands the route the case's own fake.
  - Reanimated keeps an entering view unseen until an `animationstart` that happy-dom never fires: `startAnimations()` fires it, as `Tray.render.test.tsx` does; the ceremony's card is asserted unseen before it, which pins that it enters.
  - The haptics (`playHaptic`) and the drop's builder (`walletAddedEntering`, which still builds the real animation) are recorded.
  - react-native-web drops `numberOfLines`, so the props reaching `@mobile/theme/AppText`'s `Text` are recorded, as `WalletCard.render.test.tsx` does.
  - `recordAnalytics()` installs a recording client before the mount; the event's `origin` and `ai_enabled`, which every capture carries, are left out of the comparison.
  - The no-account case fixes the wallet id (`crypto.randomUUID`), so its derived look (peach, happy) differs from the bank's (silk, smile) every run (`PL/tools/derived.mjs`).
  - Two presses inside one `act` reach the same rendered handler, with no render between them, which is how the ref rules are pinned.
- **P16. The cases beyond the plan's.**
  - `NewWallet.render.test.tsx`: the plan's five (the whole flow in light and dark, Thai and English, with the create, the kept look, one `wallet_added` with no name or amount, the ceremony's drop and haptic and เสร็จ; the refusal that keeps no look; four kinds and no e-wallet; `?setup=1`; 44 pt and named), plus: two presses and a lost answer with Try again under the same key and a blocked resend; a name and an opening balance it cannot take; private mode (Review Focus 2); no account open; Reduce Motion; AX5 (nothing clamped, the faces and materials wrap); and the five sections.
  - `WalletEdit.render.test.tsx`: the plan's two (a correction asks why first, with a rename, a wallet with no entries, entries not yet known and Jotbun asking; archive only at ฿0, with the line below zero), plus: the screen in light and dark, Thai and English; looks kept at once; nothing changed, two presses, a blank name; a lost answer, a blocked resend, a refusal naming a field, one waiting on an update, one for good, a change on another device and a refused archive; private mode; gone and load problems; 44 pt and the tray's reasons named.
  - `PlanningRoutes.render.test.tsx`: one case for both routes (P13). `WalletsList.render.test.tsx`: the navigation case's href, and PA, PB and PF (P4b). `walletCommands.render.test.tsx`: one case (P4c). `useWalletMotion.render.test.tsx`: one case (P4e).
- **P17. 109 mutants, all killed.** They cover the flow (N1 to N32; N1 is the plan's "keep the look before the acknowledgement", and fails the refusal case), the fields (F1 to F20), editing (E1 to E31; E1 is the plan's "offer archive at a non-zero balance", and fails the archive case among others), the tray (T1 to T4), the copy (K1, K2), the sections (C1 to C4), the routes (R1 to R9), the list's add tile (L1), the hook (H1 to H4) and the drop (M1, M2). None survives and none is marked equivalent. The planner's first round (`PL/logs/superseded/`) left three: N11 and E21 (a refusal that names a field said in the hook's words: for `invalid` those are the same words, so the field cases now use the terms' refusal, whose words differ, as the hook's own case does), and E23 (the entries note shown while the entries are not known: that case now looks); `PL/tools/pins-round2.py` is that change.
- **P18. Clear of the work in flight; merge order.** At `964f6c0e`, none of #412 (P2-T25), #420 (P3-T2), #421 (P2-T31) or #423 (P2-T29) touches a file this task creates or changes (each branch's `git diff --name-only` against the head), so they merge in any order. #423 adds a spread to `index.ts`, which this task does not edit. #420 changes `packages/contracts`' transactions; this task's record fixtures are `as TransactionDto` casts, as `walletCommands.render.test.tsx`'s are, so a new field does not break them. If any of them lands first and Step 0.4 lists one of this task's shared files, Step 2 or Step 4 applies that file's diff with `git apply --3way`.
- **P19. The gate (R100).** Run: `typecheck:app`; `typecheck:routes` (routes change); the focused files RED to GREEN; the focused neighbours (today's Wallets screen, the tray, the harness, private mode, the looks, the add tray, the card and the stack) with the other three routes tests (the routes rule: `SpendRoutes`, `AccountRoutes`, `InsightsRoutes`; `PlanningRoutes` is among the focused files); the catalogue's wallet sections in the every-section and screen-reader suites (`-t "bw-"`) and the registry rule; `test:app`; `test:unit`; `export:web` (routes change); `git diff --check`. CI runs the full render suite, `export:web` and the iOS export. Nothing outside `apps/app` changes, so there is no API, edge or database suite; no package changes, so no `test:ops`.
- **P20. For E2-B (the owner's look at the daily loop), the differences from the boards:**
  - wc-wallet-type: the e-wallet row is dropped (W25); the back button is the wallet's round 44 pt one; the step line is the label role (15 pt; the board draws 14); the travel card's BTS / MRT is in the line's type, not DM Sans;
  - the fields: the preview is the kit's full card (200 pt, Bun 38 pt, the amount 22 pt top right, the kind line), not the board's 176 pt card with "Jotbun" and a 30 pt amount; the fields are white cards (the board's #E9E7F1 is not in the palette); the tracking start reads as every date chip does (เริ่มจด วันนี้, เริ่มจด พฤหัส 1 ต.ค.: the weekday, and the year only when it is not this year), not "1 ต.ค. 2569", and it is not a link (walletsModel sets it; changing it stays today's Wallets screen's); the entries note sits under the keypad; new step 2's heading is the kind's name, and its button เพิ่มกระเป๋า;
  - bw-adding: it follows the mode (the board is drawn dark); the summary shows the name and the opening balance (the card shows the face and the material), with the name's label ชื่อกระเป๋า, not ชื่อ; success plays for every new wallet (the plan), where the board's note says the first;
  - wc-wallet-edit: archiving has no confirmation; the archive line's amounts are 13 pt `WalletAmount`s; below zero it has its own draft line;
  - with no account open, no faces or materials are offered;
  - every English line is a draft.
- **P21. Notes for later tasks** (the receipt carries them):
  - **P2-T22:** `wallet.gone` is already in `wallets/copy.ts`; the edit route is `/spend/wallet/<id>/edit`, so the detail's แก้ไข and its more tray push it; once `/spend/wallet/[id]` exists, drop `walletHref`'s cast in `WalletsListScreen.tsx`. An edit that saves goes back (to the detail), and one that archives goes to the list.
  - **P2-T24:** a new wallet opened from Home is `/spend/wallet/new` with no `returnTo`, so the ceremony goes back to Home.
  - **P2-T35:** the checklist opens `/spend/wallet/new?setup=1`; once `/spend/setup` exists, drop the `as Href` on `destination` in `NewWalletFlow.tsx`.
  - **P2-T37:** every stored amount here is a `WalletAmount` or masked by `isFilled`; the sweep's exemptions must know the keypad's keys and the cap's words (P2-T14's note) on both screens, and the archive line's ฿0, which `WalletAmount` masks too.
  - **A hook test task:** P2-T19's review's m3 and m4 (P4c).
  - **P2-T24 or P2-T30:** P2-T9's m-1 (GrowBar) is still open.
  - **E2-B:** P20's differences; capture `bw-wallet-added` and check the drop on the simulator (about 44 pt of overshoot), and `bw-wallet-correction` from a fresh launch.

---

## Step 0: Sync, and what this task waits for

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date.", or a fast-forward. Then `/usr/bin/git -C WT rev-parse --short HEAD`, and record it.
2. The tasks this one builds on have merged:
   - `grep -c "const NEW_WALLET_HREF = '/spend/wallet/new' as Href;" WT/apps/app/src/wallet/wallets/WalletsListScreen.tsx`. Expected: `1` (P2-T20).
   - `grep -c "export function WalletKeypad" WT/apps/app/src/wallet/add/WalletKeypad.tsx` and `grep -c "export function filledKeypad" WT/apps/app/src/wallet/add/addFlow.ts`. Expected: `1` and `1` (P2-T14).
   - `grep -c "export function walletAddedEntering" WT/apps/app/src/wallet/motion/useWalletMotion.ts`. Expected: `1` (P2-T9).
   If one prints `0`, report BLOCKED with the output.
3. `/usr/bin/git -C WT diff --stat 964f6c0e HEAD -- apps/app packages package.json package-lock.json`. Expected: nothing, or only files of the pull requests in flight (P18).
   - If it lists a file this task creates (`PL/tools/files.sh`'s NEW list: the four parts, the two new test files, `apps/app/app/spend/wallet/`), report BLOCKED with the output.
   - If it lists one of the ten shared files (`files.sh`'s SHARED list), go on: Step 2 or Step 4 applies that file's diff with `git apply --3way`.
   - If it lists a file this task's code calls into, go on, but name it in the receipt; a differing Expected line later is then a BLOCKED with this list: `apps/app/src/spend/v1/redesign/planning/walletsModel.ts`, `apps/app/src/screens/v1/parts.tsx`, `apps/app/src/wallet/card/WalletCard.tsx`, `apps/app/src/wallet/card/copy.ts`, `apps/app/src/wallet/looks/WalletLooksProvider.tsx`, `apps/app/src/wallet/looks/walletLooks.ts`, `apps/app/src/wallet/looks/BunFace.tsx`, `apps/app/src/wallet/looks/MaterialFill.tsx`, `apps/app/src/wallet/add/WalletKeypad.tsx`, `apps/app/src/wallet/add/addFlow.ts`, `apps/app/src/wallet/add/copy.ts`, `apps/app/src/wallet/tray/Tray.tsx`, `apps/app/src/wallet/tray/PrimaryButton.tsx`, `apps/app/src/wallet/tray/TextLink.tsx`, `apps/app/src/wallet/controls/IconButton.tsx`, `apps/app/src/wallet/money/WalletAmount.tsx`, `apps/app/src/wallet/money/walletMoney.ts`, `apps/app/src/wallet/privacy/PrivateModeProvider.tsx`, `apps/app/src/wallet/motion/walletMotion.ts`, `apps/app/src/wallet/motion/reducedMotion.tsx`, `apps/app/src/wallet/common/copy.ts`, `apps/app/src/wallet/testing/walletHarness.tsx`, `apps/app/src/ui/dateStep.ts`, `apps/app/src/ui/keypadExpression.ts`, `apps/app/src/dev/catalogue/screenSection.tsx`, `apps/app/src/spend/v1/testing/fakeResources.ts`, `apps/app/src/spend/v1/testing/fakeDiary.ts`, `apps/app/src/analytics/events.ts`, `apps/app/src/analytics/bus.ts`, `apps/app/src/config/featureFlags.ts`.
   - `packages/contracts/src/v1/transactions.ts`, `ai.ts` or `index.ts` (P3-T2, #420): go on (P18). Anything else under `packages/`, or `package.json` or `package-lock.json`: BLOCKED.
   - Any other file: go on. The focused counts this task does not change (N, C) are then your own Step 1.3 base, and the receipt names each merge.
   - Then run `/usr/bin/git -C WT log --oneline 964f6c0e..HEAD`, and keep the merged PRs it lists for the receipt.
4. The ten shared files: `shasum -a 256` each (the SHARED list in `PL/tools/files.sh`) and compare with its `orig/` line. Each equals it, except a file Step 0.3 listed. `ls WT/apps/app/src/wallet/wallets/NewWalletFlow.tsx WT/apps/app/app/spend/wallet` says "No such file or directory" twice. If anything else differs, report BLOCKED.

## Step 1: Install and the focused base

1. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages".
2. `cd WT && npm run typecheck:app > S/base-typecheck.log 2>&1; echo $?`. Expected: 0.
3. The focused base (the per-file counts this task's Expected lines build on; R100: no whole-suite count):
   - `cd WT/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > S/base-draft.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`.
   - The shared test files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/PlanningRoutes.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/screens/redesign/planning/walletCommands.render.test.tsx src/wallet/motion/useWalletMotion.render.test.tsx > S/base-shared.log 2>&1; echo $?`. Expected: 0, `Test Files  4 passed (4)`, `Tests  43 passed (43)` (4 + 12 + 21 + 6).
   - The neighbours, with the other three routes tests: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/screens/redesign/SpendRoutes.render.test.tsx src/screens/redesign/account/AccountRoutes.render.test.tsx src/screens/redesign/insights/InsightsRoutes.render.test.tsx src/screens/redesign/planning/WalletsScreen.render.test.tsx src/wallet/tray/Tray.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/looks/WalletLooks.render.test.tsx src/wallet/add/AmountStep.render.test.tsx src/wallet/card/WalletCard.render.test.tsx src/wallet/card/CardStack.render.test.tsx > S/base-neighbours.log 2>&1; echo $?`. Expected: 0, `Test Files  11 passed (11)`, `Tests  179 passed (179)` at the brief's base; more if a merged task added cases to one of them (#412 adds to `SpendRoutes`, #421 to `InsightsRoutes`). Call this count N.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx -t "bw-" > S/base-catalogue.log 2>&1; echo $?`. Expected: 0, `Tests  50 passed` (twenty-five wallet sections, two suites), or more by two for each wallet section a merged task added. Call this count C. Ignore the `skipped` count: it moves with the head.
   - `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/dev/catalogue/CatalogueScreen.render.test.tsx -t "registry has a section" > S/base-registry.log 2>&1; echo $?`. Expected: 0, `Tests  1 passed`.

## Step 2: The tests, the copy, the router stand-in and the typed stubs (plan Step 1)

1. Copy (quote the `[id]` paths as shown):
   ```bash
   mkdir -p "WT/apps/app/app/spend/wallet/[id]"
   cp PL/real/apps/app/src/wallet/wallets/NewWallet.render.test.tsx WT/apps/app/src/wallet/wallets/NewWallet.render.test.tsx
   cp PL/real/apps/app/src/wallet/wallets/WalletEdit.render.test.tsx WT/apps/app/src/wallet/wallets/WalletEdit.render.test.tsx
   cp PL/stubs/apps/app/src/wallet/wallets/NewWalletFlow.tsx WT/apps/app/src/wallet/wallets/NewWalletFlow.tsx
   cp PL/stubs/apps/app/src/wallet/wallets/WalletFields.tsx WT/apps/app/src/wallet/wallets/WalletFields.tsx
   cp PL/stubs/apps/app/src/wallet/wallets/WalletEditScreen.tsx WT/apps/app/src/wallet/wallets/WalletEditScreen.tsx
   cp PL/stubs/apps/app/src/wallet/wallets/CorrectionTray.tsx WT/apps/app/src/wallet/wallets/CorrectionTray.tsx
   cp PL/stubs/apps/app/app/spend/wallet/new.tsx WT/apps/app/app/spend/wallet/new.tsx
   cp "PL/stubs/apps/app/app/spend/wallet/[id]/edit.tsx" "WT/apps/app/app/spend/wallet/[id]/edit.tsx"
   cp PL/real/apps/app/src/wallet/wallets/copy.ts WT/apps/app/src/wallet/wallets/copy.ts
   cp PL/real/apps/app/src/dev/catalogue/routerTestStub.tsx WT/apps/app/src/dev/catalogue/routerTestStub.tsx
   cp PL/real/apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx WT/apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx
   cp PL/real/apps/app/src/wallet/wallets/WalletsList.render.test.tsx WT/apps/app/src/wallet/wallets/WalletsList.render.test.tsx
   cp PL/real/apps/app/src/screens/redesign/planning/walletCommands.render.test.tsx WT/apps/app/src/screens/redesign/planning/walletCommands.render.test.tsx
   cp PL/real/apps/app/src/wallet/motion/useWalletMotion.render.test.tsx WT/apps/app/src/wallet/motion/useWalletMotion.render.test.tsx
   ```
   For a shared file Step 0.3 listed, use this in place of its `cp`: `/usr/bin/git -C WT apply --3way PL/diffs/<repo path with / as _>.diff`. It must apply with no conflict; otherwise report BLOCKED.
2. `shasum -a 256` the fourteen files and compare: the `real/` lines for the two new tests, `copy.ts`, `routerTestStub.tsx` and the four shared tests (only those copied), the `stubs/` lines for the six stubs. If a `cp` source is missing or a checksum differs, report BLOCKED. (`PL/tools/stage.sh <tree> red` does the same copies; you may read it, but run the `cp` lines above.)
3. The stubs, for reference. Each part has the plan's (or P3's) props and draws nothing that the cases look for; each route draws nothing. `WalletsListScreen.tsx`, `walletCommands.ts`, `useWalletMotion.ts` and `walletListSections.tsx` stay as at the start until Step 4.

{{CODE:stubs:apps/app/src/wallet/wallets/NewWalletFlow.tsx}}

{{CODE:stubs:apps/app/src/wallet/wallets/WalletFields.tsx}}

{{CODE:stubs:apps/app/src/wallet/wallets/WalletEditScreen.tsx}}

{{CODE:stubs:apps/app/src/wallet/wallets/CorrectionTray.tsx}}

{{CODE:stubs:apps/app/app/spend/wallet/new.tsx}}

`[id]/edit.tsx` is the same with `SpendWalletEditRoute` (`PL/stubs/apps/app/app/spend/wallet/[id]/edit.tsx`).

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/wallets/NewWallet.render.test.tsx src/wallet/wallets/WalletEdit.render.test.tsx src/screens/redesign/planning/PlanningRoutes.render.test.tsx src/wallet/wallets/WalletsList.render.test.tsx src/screens/redesign/planning/walletCommands.render.test.tsx src/wallet/motion/useWalletMotion.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  6 failed (6)`, `Tests  25 failed | 45 passed (70)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 25 and `grep -cE 'Cannot find module|Failed to resolve|SyntaxError|is not a function|TestingLibraryElementError|TypeError|ReferenceError' S/red-render.log` gives 0. Passing: the shared files' old cases (4 + 11 + 21 + 6) and PA, PB and PF, which pin what this task keeps. Failing, each on an `AssertionError`:
{{RED_RENDER}}
   Compare with `PL/logs/red-render.log` and `PL/logs/red-render.list`.

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/wallets/NewWalletFlow.tsx WT/apps/app/src/wallet/wallets/NewWalletFlow.tsx
   cp PL/real/apps/app/src/wallet/wallets/WalletFields.tsx WT/apps/app/src/wallet/wallets/WalletFields.tsx
   cp PL/real/apps/app/src/wallet/wallets/WalletEditScreen.tsx WT/apps/app/src/wallet/wallets/WalletEditScreen.tsx
   cp PL/real/apps/app/src/wallet/wallets/CorrectionTray.tsx WT/apps/app/src/wallet/wallets/CorrectionTray.tsx
   cp PL/real/apps/app/app/spend/wallet/new.tsx WT/apps/app/app/spend/wallet/new.tsx
   cp "PL/real/apps/app/app/spend/wallet/[id]/edit.tsx" "WT/apps/app/app/spend/wallet/[id]/edit.tsx"
   cp PL/real/apps/app/src/wallet/wallets/WalletsListScreen.tsx WT/apps/app/src/wallet/wallets/WalletsListScreen.tsx
   cp PL/real/apps/app/src/screens/redesign/planning/walletCommands.ts WT/apps/app/src/screens/redesign/planning/walletCommands.ts
   cp PL/real/apps/app/src/wallet/motion/useWalletMotion.ts WT/apps/app/src/wallet/motion/useWalletMotion.ts
   cp PL/real/apps/app/src/dev/catalogue/wallet/walletListSections.tsx WT/apps/app/src/dev/catalogue/wallet/walletListSections.tsx
   ```
   For a shared file Step 0.3 listed, apply its diff with `--3way` in place of its `cp`, as in Step 2.1.
2. `shasum -a 256` the eighteen files against their `real/` lines in `PL/SHA256SUMS` (all equal, except a file applied with `--3way`). `/usr/bin/git -C WT status --short` shows exactly ten ` M` lines (the SHARED list), `?? apps/app/app/spend/wallet/`, and `?? ` for the six new files under `apps/app/src/wallet/wallets/` (`M ` in the first column, staged, for a file `git apply --3way` wrote).
3. The code, for reference: the Appendix holds every new file and every diff (read them before the receipt; their headers say why). `NewWalletFlow.tsx`: P5 to P8; `WalletFields.tsx`: P9; `WalletEditScreen.tsx`: P10 and P12; `CorrectionTray.tsx`: P11; the routes: P13; the sections: P14; `copy.ts`: P3d; `WalletsListScreen.tsx`: P4a; `walletCommands.ts`: P4c; `useWalletMotion.ts`: P4e.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0. Then `cd WT && npm run typecheck:routes -w gogospend-app > S/green-typecheck-routes.log 2>&1; echo $?`. Expected: 0.
5. `cd WT/apps/app && npm run test:unit -- src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0` (P2-T3's check of every draft table reads this task's lines too).
6. The Step 3.2 render command with `S/green-render.log`. Expected: 0, `Test Files  6 passed (6)`, `Tests  70 passed (70)` (12 + 9 + 5 + 15 + 22 + 7), each case marked `✓`, and `grep -c '^stderr |' S/green-render.log` gives 0 (no `act(...)` warning and no `console.error`).
7. The neighbours, unchanged: the Step 1.3 neighbours command with `S/green-neighbours.log`. Expected: 0, `Tests  N passed (N)` (179 at the brief's base). Today's `WalletsScreen.render.test.tsx` is among them: P2-T19's hook still answers its form.
8. The catalogue's wallet sections: the Step 1.3 catalogue command with `S/green-catalogue.log`. Expected: 0, `Tests  C + 10 passed` (60 at the brief's base: thirty sections, two suites). Then the registry rule: the Step 1.3 registry command with `S/green-registry.log`. Expected: 0, `Tests  1 passed`.

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its test file, and restores the file with its SHA-256 checked. It takes twenty to forty minutes, by the machine's load. Expected: exit 0, and these lines (each line in your file also gives its file's counts, the AssertionError count and "restored sha256 equal"; compare with `PL/logs/mutants.out`):
   ```
{{MUTANTS}}
{{MUTANT_TOTAL}}
   ```
   N1 and E1 are the plan's two mutants. C2 and C3 wait for their section's script to stop (about 8 s each). R5 and R9 fail on the screen's own "useSpendV1 needs a SpendV1Provider." rather than an assertion (`AssertionError x0`), as P2-T20's R6 did: without the provider the route cannot draw at all.
2. `shasum -a 256` the eighteen files against `real/` again, and run `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2.

## Step 6: The fast local gate (R100)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run typecheck:routes -w gogospend-app`: exit 0 (routes change).
3. `npm run test:app`: exit 0, `ℹ fail 0`. (No count is expected here: CI holds the whole suites, R100.)
4. `npm run test:unit`: exit 0, `ℹ fail 0`.
5. The focused files once more: Step 4.5 (`ℹ pass 4`, `ℹ fail 0`) and the render command of Step 4.6 with the neighbours added (the eleven files of Step 1.3): exit 0, `Test Files  17 passed (17)`, `Tests  70 + N passed` (249 at the brief's base). `grep -c '^stderr |'` gives 1: `walletHarness.render.test.tsx`'s own case that fails to save on purpose ("Bun setting could not be saved."), unchanged by this task (`PL/logs/probe-harness-stderr.log`). A case that times out near 5 s in a file this task does not touch is a load flake: rerun that file alone once, record both runs, and do not change it.
6. `npm run export:web -w gogospend-app -- --max-workers 2 > S/gate-export-web.log 2>&1; echo $?`: exit 0, with a `Web Bundled` line (routes change; the module count moves with the head, so none is expected).
7. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): the full render suite (CI, R100; the catalogue's every-section and screen-reader suites pick up the five sections there); the iOS export (CI); `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped); and device and simulator checks, all SKIPPED: VoiceOver on the kinds, the preview's image, the faces' and materials' radios and the ceremony's announcement; a quick double tap on เพิ่มกระเป๋า, บันทึก, a reason and เก็บกระเป๋านี้ถาวร on a phone; the drop on the simulator (about 44 pt of overshoot) and under Reduce Motion; the keyboard over the name field and the pinned footer; `dismissTo` back to the list, the checklist and Home on a development build with the wallet area on; the system back during the flow; AX5 on a phone; and E2-B's screenshots (the controller's, after P2-T28).

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T21.md` in the house style (see `docs/implementation/receipts/P2-T20.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T21: A new wallet, editing a wallet and the correction tray

- **Status:** built and verified locally on `p2/t21-wallet-edit` (`.claude/worktrees/p2-t21`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`. (The brief was proven at `964f6c0e`. Name each merged PR from `git log --oneline 964f6c0e..HEAD`, and any shared file applied with `--3way`.)
- **Files:** created `apps/app/src/wallet/wallets/NewWalletFlow.tsx`, `WalletFields.tsx`, `WalletEditScreen.tsx`, `CorrectionTray.tsx`, `NewWallet.render.test.tsx` (12 cases), `WalletEdit.render.test.tsx` (9 cases), `apps/app/app/spend/wallet/new.tsx`, `apps/app/app/spend/wallet/[id]/edit.tsx` and this receipt; modified `apps/app/src/wallet/wallets/copy.ts` (the plan's lines and three more), `apps/app/src/dev/catalogue/wallet/walletListSections.tsx` (five sections), `apps/app/src/wallet/wallets/WalletsListScreen.tsx` (the add tile's `returnTo`), `WalletsList.render.test.tsx` (its href, and PA, PB, PF), `apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx` (the two routes, 1 case), `apps/app/src/dev/catalogue/routerTestStub.tsx` (`dismissTo`), `apps/app/src/screens/redesign/planning/walletCommands.ts` and its test (`wallet_added` after the outcome, 1 case), and `apps/app/src/wallet/motion/useWalletMotion.ts` and its test (the drop, 1 case).
- **What changed:** (the kinds and their looks; creating, kept looks after done only, the ref; the ceremony; where the flow goes; the fields; editing, the correction tray and archiving; the routes; the copy; the sections; the list's add tile; the hook's emitter; the drop.)
- **RED to GREEN:** ... (Steps 3 and 4: the 25 render failures and their messages; GREEN 4 and 70; the neighbours N unchanged; the catalogue's wallet sections C to C + 10.)
- **Mutation check:** 109 mutants, all killed ... (one line per group, with the case that kills it; N1 and E1 are the plan's.)
- **Gate** (worktree root): ... (Step 6, each command with its result; no whole-suite count, R100.)
- **Follow-ups carried:** (ruling P4, each, and why m3, m4 and GrowBar's m-1 are not.)
- **Deviations:** the names and props beyond the plan's (P3); the list read again by mounting again (P4a); the kinds' looks and the empty name (P5); the ceremony following the mode (P7); `dismissTo` and the hand-typed `/spend/setup` (P8); the tracking start shown, not changed (P9); the form starting over after a conflict (P10); archiving with no confirmation and the line below zero (P12); the E2-B differences (P20).
- **SKIPPED:** the full render suite (CI); the iOS export (CI); `test:ops`; the API, edge and database suites; device and simulator checks (Step 6).
- **Risks:** with no account open a new wallet keeps no look and shows the derived one (P9); `/spend/setup` does not exist until P2-T35, so `?setup=1` would end on expo-router's unmatched route, though nothing opens it before P2-T35 (P8); the system back on the fields leaves the flow, not the step (no back handler; the device check is SKIPPED).
- **Notes for later tasks:** (ruling P21, each.)
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/wallets/NewWalletFlow.tsx apps/app/src/wallet/wallets/WalletFields.tsx apps/app/src/wallet/wallets/WalletEditScreen.tsx apps/app/src/wallet/wallets/CorrectionTray.tsx apps/app/src/wallet/wallets/NewWallet.render.test.tsx apps/app/src/wallet/wallets/WalletEdit.render.test.tsx apps/app/app/spend/wallet apps/app/src/wallet/wallets/copy.ts apps/app/src/dev/catalogue/wallet/walletListSections.tsx apps/app/src/wallet/wallets/WalletsListScreen.tsx apps/app/src/wallet/wallets/WalletsList.render.test.tsx apps/app/src/screens/redesign/planning/PlanningRoutes.render.test.tsx apps/app/src/dev/catalogue/routerTestStub.tsx apps/app/src/screens/redesign/planning/walletCommands.ts apps/app/src/screens/redesign/planning/walletCommands.render.test.tsx apps/app/src/wallet/motion/useWalletMotion.ts apps/app/src/wallet/motion/useWalletMotion.render.test.tsx docs/implementation/receipts/P2-T21.md`
2. `/usr/bin/git -C WT status --short`: those nineteen staged (the two routes under `apps/app/app/spend/wallet/`), nothing else (no log, no `dist/`).
3. Write the message to `S/commit-message.txt`:
   ```
   Add the Bun Wallet new-wallet flow with its look, wallet editing and the correction tray

   Add a new wallet in three steps: its kind (cash, a bank account, a credit
   card or a travel card, each starting on its own material), its fields
   (name, Bun's face, material and opening balance on the tray's keypad,
   with a live preview), and the ceremony, where the card drops in. The
   create goes through the wallet command hook one press at a time, and
   the look is kept only once Jotbun has the wallet. Edit a wallet: looks
   are kept at once, a correction to a wallet with entries asks why first
   in the correction tray, and archiving is offered only at zero, otherwise
   the screen says why with both amounts. Add the two routes, five
   catalogue sections, the list's way back from the flow, wallet_added
   sent after the outcome, and a shorter drop for a new wallet's card.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 19 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (109 killed); each gate command with its result (no whole-suite count, R100); SKIPPED items; deviations (P3 to P14, P20); and what the reviewer should look at first: the create (P6: the look after done only, the ref, Try again's key, one `wallet_added`), editing's correction and the tray (P10, P11), the archive rule and its line (P12), where the flow goes (P8: `dismissTo`, the hand-typed `/spend/setup`), the fields' masking and locking (P9), the hook's emitter (P4c), the drop (P4e), and the list's `returnTo` and why no focus listener (P4a).

---

## Appendix: the code

Every block is the file in `PL/real/`, or the diff in `PL/diffs/`, byte for byte. The two new test files are in `PL/real/` only (copy them; their headers say what each seam is).

`apps/app/src/wallet/wallets/NewWalletFlow.tsx`:
{{CODE:apps/app/src/wallet/wallets/NewWalletFlow.tsx}}

`apps/app/src/wallet/wallets/WalletFields.tsx`:
{{CODE:apps/app/src/wallet/wallets/WalletFields.tsx}}

`apps/app/src/wallet/wallets/WalletEditScreen.tsx`:
{{CODE:apps/app/src/wallet/wallets/WalletEditScreen.tsx}}

`apps/app/src/wallet/wallets/CorrectionTray.tsx`:
{{CODE:apps/app/src/wallet/wallets/CorrectionTray.tsx}}

`apps/app/app/spend/wallet/new.tsx`:
{{CODE:apps/app/app/spend/wallet/new.tsx}}

`apps/app/app/spend/wallet/[id]/edit.tsx`:
{{CODE:apps/app/app/spend/wallet/[id]/edit.tsx}}

The ten diffs (`PL/diffs/`):

{{DIFF:apps_app_src_wallet_wallets_copy.ts.diff}}

{{DIFF:apps_app_src_dev_catalogue_wallet_walletListSections.tsx.diff}}

{{DIFF:apps_app_src_wallet_wallets_WalletsListScreen.tsx.diff}}

{{DIFF:apps_app_src_screens_redesign_planning_walletCommands.ts.diff}}

{{DIFF:apps_app_src_wallet_motion_useWalletMotion.ts.diff}}

{{DIFF:apps_app_src_dev_catalogue_routerTestStub.tsx.diff}}

{{DIFF:apps_app_src_screens_redesign_planning_PlanningRoutes.render.test.tsx.diff}}

{{DIFF:apps_app_src_wallet_wallets_WalletsList.render.test.tsx.diff}}

{{DIFF:apps_app_src_screens_redesign_planning_walletCommands.render.test.tsx.diff}}

{{DIFF:apps_app_src_wallet_motion_useWalletMotion.render.test.tsx.diff}}
