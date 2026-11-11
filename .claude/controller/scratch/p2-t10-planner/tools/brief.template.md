# Brief P2-T10: Money text, WalletAmount, the icon button and private mode

You are the implementer for plan P2, Task P2-T10. You add the Bun Wallet's money text (`walletMoney.ts`), the one component every amount is drawn with (`WalletAmount`), the wallet's round icon button (`IconButton`), and private mode: the device setting, its provider in `WalletRoot`, the eye that flips it and the tip that explains it. You also add the kit's first two catalogue sections, `bw-amounts` and `bw-private`. The planner wrote every file below and proved it in a scratch copy of `1ddc7f7` (the integration head when this brief was written): RED on typed stubs (6 of 6 Node cases and 14 of 14 render cases fail, each on an assertion), GREEN, 71 mutants (70 killed, 1 equivalent), and the app gate, the full render suite and the web export included. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Its R87 note applies: your receipt is its own file, `docs/implementation/receipts/P2-T10.md`; do not edit `premium-progress.md`.
2. The plan task: `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md`, `### Task P2-T10` (lines 714 to 753); W9 and W10 (lines 46 and 47), W30 (line 67) and Review Focus 2 (line 115); its Global Constraints (lines 82 to 108: copy and E2 on line 85, type on line 86, accessibility on line 87, money on line 89, analytics on line 92, the R72 test traps on lines 94 to 99, "both modes and both languages" on line 106, pure modules on line 107); the Shared files line for `WalletRoot.tsx` and `dev/catalogue/wallet/index.ts` (line 34); P2-T33's order in `WalletRoot` (line 1584); P2-T37's sweep (lines 1776 and 1777), whose rules every file here already keeps (44 pt controls, no `#RRGGBB` literal under `src/wallet`, `under` and `over` only in `WalletAmount.tsx`, no amount with private mode on).
3. P2-T8's receipt, its notes for later tasks: `docs/implementation/receipts/P2-T8.md` (the last section). And P2-T3's receipt, its notes: `docs/implementation/premium-progress.md`, `### P2 Task 3`, "Notes for later tasks" (the copy rule and the two store scopes).

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p2-t10` (branch `p2/t10-money-text`, made by the orchestrator from `origin/claude/p1a-vault-core`). Work only here.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t10`, your scratch folder. Create it with `mkdir -p`. Logs and the commit message go there. Never keep anything under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t10-planner`, the planner's folder. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the final version of the 13 files this task creates or changes, at their repo paths;
  - `stubs/`: the six code files in their RED form (typed stubs);
  - `orig/`: `apps/app/src/wallet/WalletRoot.tsx` and `apps/app/src/dev/catalogue/wallet/index.ts` as they are at `1ddc7f7`;
  - `diffs/`: one diff per changed shared file, `apps_app_src_wallet_WalletRoot.tsx.diff` and `apps_app_src_dev_catalogue_wallet_index.ts.diff`, for reading only (each turns `orig/` into `real/`);
  - `tools/mutants.py` (the mutant runner), `tools/prove.sh` (the planner's own stages), `tools/brief.py`, `tools/fill_brief.py` and `tools/brief.template.md` (how this brief was built: every code block below is the kit's file, byte for byte, and the numbers come from the logs);
  - `SHA256SUMS` (every file above) and `SHA256SUMS.logs` (the planner's logs in `logs/`: `summary.txt` (every stage, timed), `base-*`, `red-*`, `green-*`, `gate-*`, `mutants.out` and `mutant-logs/`, `mutants-nocache.out` (the same lines without vitest's results cache), and `superseded/` and `iter-*` (earlier runs, kept as history; `summary.txt` says what each was).
- Every shell call starts in a fresh directory, so type full paths. Below, WT, S and PL stand for the full paths above: type the full path. Git: `/usr/bin/git -C WT <command>`, one git command per call. npm: `cd WT && npm run <script>`. Focused render files: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts <files>`. The Node test: `cd WT && npm run test:unit -w gogospend-app -- <files>`.
- This task needs no heavy lock: no database suite, no workers pool. Docker is stopped and stays stopped.
- To compare checksums: `shasum -a 256 <file>` and compare with the line for the same path in `PL/SHA256SUMS` (`real/...`, `stubs/...` or `orig/...`).
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change tests or code to make them pass. The two exceptions: the whole-suite rule in Step 1.4, and a load flake in Step 6.6.

## Scope

| File | Change |
| --- | --- |
| `apps/app/src/wallet/money/walletMoney.ts` | **new**, pure. `MoneySign`, `HIDDEN_AMOUNT`, `walletMoneyText`, `perDayText`, `spokenMoney`, the plan's interface. |
| `apps/app/src/wallet/money/walletMoney.test.ts` | **new**, Node. 6 cases. |
| `apps/app/src/wallet/money/WalletAmount.tsx` | **new**. `WalletAmount`, plus the named types `WalletAmountProps`, `WalletAmountSize`, `WalletAmountTone` (P10). |
| `apps/app/src/wallet/money/WalletAmount.render.test.tsx` | **new**. 5 cases. |
| `apps/app/src/wallet/controls/IconButton.tsx` | **new**. `IconButton`, the plan's interface. |
| `apps/app/src/wallet/privacy/copy.ts` | **new**, data. `COPY`: the plan's seven `privacy.*` lines. |
| `apps/app/src/wallet/privacy/PrivateModeProvider.tsx` | **new**. `PRIVATE_MODE_NAME`, `PRIVATE_TIP_NAME`, `PrivateMode` (type), `PrivateModeProvider` (with an optional `store`, P4), `usePrivateMode`. |
| `apps/app/src/wallet/privacy/PrivateEyeButton.tsx` | **new**. `PrivateEyeButton`. |
| `apps/app/src/wallet/privacy/PrivateTip.tsx` | **new**. `PrivateTip`. |
| `apps/app/src/wallet/privacy/PrivateMode.render.test.tsx` | **new**. 9 cases. |
| `apps/app/src/dev/catalogue/wallet/kitSections.tsx` | **new**. `WALLET_KIT_SECTIONS`: `bw-amounts` and `bw-private`. |
| `apps/app/src/wallet/WalletRoot.tsx` | **shared** (plan line 34: P2-T2 made it, P2-T10 and P2-T33 each add one provider). One import, the `PrivateModeProvider` wrapper inside `WalletMotionProvider`, and the header comment. 16 lines before, 20 after. |
| `apps/app/src/dev/catalogue/wallet/index.ts` | **shared** (one spread per wallet task with sections). One import and one spread, `...WALLET_KIT_SECTIONS,`. 7 lines before, 10 after. |
| `docs/implementation/receipts/P2-T10.md` | **new**. Your receipt (R87). |

Not in this task: `registry.tsx` (the wallet list is already spread there, last, by P2-T8), `catalogueTestHarness.tsx` and the catalogue tests (ruling P3; their counts move only by the two new sections), `walletHarness.tsx` (P2-T11 edits it next), `WalletRoot.render.test.tsx` (unchanged, ruling P7), `walletPalette.ts` and `ThemeProvider.tsx` (P2-T1's), `theme/motion.ts` and `src/wallet/motion/` (P2-T9, in flight), `featureFlags.ts` and the account screens (1C-T8, in flight), any package or lockfile, `en.json` and `th.json` (draft copy stays in `privacy/copy.ts` until P2-T38), `premium-progress.md`.

## Planner rulings (the calls this brief makes, with the reason for each)

- **P1. Ready, on base `1ddc7f7`.** Starts after P2-T1 (#329, `d193a68`), P2-T3 (#79, `7e56e14`), P2-T8 (#365, `1502e65`) and 1D-T1 (#337, `5b14dfe`): all merged. No package, Cloudflare resource, owner decision, approval or account setting is needed; the copy is draft under Q3's default (plan line 80). The task was dispatched at `69c739f`; since then #366 (1B-T9, `apps/edge` and its receipt only) merged as `5b7609e`, then the controller-state commit `1ddc7f7`. `git diff --stat 69c739f 1ddc7f7 -- apps/app packages package-lock.json` prints nothing. The planner's base measured exactly the controller's: `test:app` 34, `test:unit` 901, render 95 files and 1723 tests, web 4785 modules.
- **P2. Where the provider sits.** `GestureHandlerRootView > WalletMotionProvider > PrivateModeProvider > children`. That is P2-T33's order with the `wallet` area off (plan line 1584), and P2-T33's source test looks for the literal `<PrivateModeProvider` in `WalletRoot.tsx`, so the provider is written there as JSX, not hidden in a helper.
- **P3. The catalogue suites draw sections without `WalletRoot` (followups, P2-T8's review): each wallet section brings what it needs, and `inApp` does not change.**
  - `catalogueTestHarness.tsx` is shared by 15 test files and is the Bun diary's provider order; adding the root there moves every catalogue mount.
  - The wallet parts already work outside the root: outside a provider `usePrivateMode()` answers "shown, ready, no-ops" (the plan's own rule), the motion hooks ask the phone themselves, and on the web a `GestureDetector` needs no root view.
  - A section that needs one state, as `bw-private` does (hidden, with its tip), mounts its own `PrivateModeProvider` over a store kept in memory. So neither the suites nor the development catalogue on a phone read or change the person's own setting, as the catalogue's theme and locale overrides leave the app's choices alone. (A tap on that preview's eye still sends `private_mode_toggled` when analytics is on, as a tap in any catalogue screen section runs that screen's rule.)
  - Every other section follows the private mode around it. P2-T37's sweep needs this: it mounts each section through `mountWallet` with private mode on and checks that no amount shows.
  - PrivateMode case 8 pins both halves (mutants K1 to K3).
- **P4. `PrivateModeProvider` takes an optional `store?: KeyValueStore`**, a superset of the plan's `{ children }`. With none (as `WalletRoot` mounts it) it uses `walletDeviceStore()`, taken at each read and write, so `mountWallet`'s memory backend applies. It is the seam P3 needs, and the one the "until read" case holds.
- **P5. Hidden until the setting is read, and the eye waits.** Inside a provider, `usePrivateMode()` answers `hidden: true, ready: false, tipSeen: true` until the store answers, as R66 treats an unknown motion answer: an amount the person hid never shows for a moment at launch, and no tip flashes. A tap before then changes nothing: no write, no announcement, no event. A name the store cannot read counts as unset (amounts show); a write that fails still holds until the app closes, as `BunIntensityProvider`'s does.
- **P6. The tip shows while amounts are hidden and the person has not closed it.** Its close (`dismissTip`) stores `private-tip-seen` and it never shows again. Turning amounts back on without closing it hides it until the next hide. This is how the brief reads the plan's "the tip shows the first time only" with the plan's `tipSeen` and `dismissTip`.
- **P7. What a tap says is in the app's language, read without `useIntl`.** The provider takes the locale from react-intl's `IntlContext` and falls back to English as `useActiveLocale` does. With `useDraftCopy` instead, all seven `WalletRoot.render.test.tsx` cases that draw the root fail with "[React Intl] Could not find required `intl` object", because P2-T2's test draws `WalletRoot` with no `IntlProvider`. In the app and under `mountWallet` the root sits inside the language's `IntlProvider`, so the words are the app's. P2-T2's test file is not edited.
- **P8. Money text, where the plan's interface leaves the how open.**
  - `sign: 'none'` draws the size of the amount: a negative's minus goes too, as a list row draws an expense. `'balance'` is the one sign that shows a negative, so the two never mean the same thing. `'expense'` and `'income'` draw their sign before the size. Zero is never signed.
  - `WalletAmount`'s words follow what is drawn: `spokenMoney(minor)` for a balance (`ติดลบ 3,920 บาท`), the size for every other sign. ax-voiceover reads "วันนี้ − ฿47" as "วันนี้ใช้ 47 บาท": the row's own label says what kind it is.
  - `perDayText` cuts the exact form's satang, so it is rounded down for the per-day figures it takes, which are never negative (`budgetPace` has none once over).
  - `walletMoneyText` and `spokenMoney` go through `formatMinor`, so a non-canonical string throws its `TypeError`, and satang never pass through a JS number.
- **P9. Board calls the plan does not name (for E2-A, plan line 136).**
  - `IconButton` is ax-large-home's 44 pt button: a `card` fill, a 1 pt `hairline` ring, the caller's 24 pt glyph (the plan's "24 pt glyph"). bw-home's 36 pt `#E9E7F1` circle and bw-private's filled ink circle for the hidden eye are not drawn: the plan's `IconButton` has no state prop, and the slashed eye and the label carry the state (ax-voiceover: "5 flips to แสดงยอดเงิน").
  - `PrivateTip` uses the palette's `toast` and `onToast`, not bw-private's `#3A57E8`: that blue is no palette token, `walletPalette.ts` is P2-T1's, and P2-T37's sweep refuses a `#RRGGBB` literal under `src/wallet`. It has no pointer (Home's layout, P2-T24, puts the tip under the eye). Its close is 44 pt (the board's is 32, §4). The title and body are `WalletText`'s `label` role (15 pt) at weights 700 and 400, as the board writes them.
  - `WalletAmount` spaces the mask 0.12 em, as bw-private draws it, and amounts −0.02 em at 28 pt and above (the plan). Its line height is `walletLineHeight(size, 'latin')`, the same shown and hidden, so rows never change height (W10). The mask keeps the amount's colour.
  - The `hideAmounts` fade in P2-T9's table is not drawn: P2-T10 does not start after P2-T9, so the change is instant, the reduced-motion form. A later task that has both can add it (note for the integrator).
- **P10. Names.** `privacy/copy.ts` exports `COPY`, the plan's copy rule (plan line 368) as P2-T3's receipt repeats it; `common/copy.ts`'s `COMMON_COPY` is the named exception. The kit list is `WALLET_KIT_SECTIONS`, since `registry.tsx` already imports a `KIT_SECTIONS` (the R2a kit's). `WalletAmount.tsx` also exports `WalletAmountProps`, `WalletAmountSize` and `WalletAmountTone`, and `PrivateModeProvider.tsx` the `PrivateMode` type, for later tasks.
- **P11. Cases beyond the plan's named ones**, each pinning a rule above or a guard the mutants need:
  - `walletMoney.test.ts`: the plan's values in five cases, plus `0` and `5` compact, `0` exact, a positive balance, `-5` exact, zero for every sign, `'none'` on a negative; the canonical-string case; `perDayText('58064')` and `'1800000'`; `spokenMoney` for `0`, `5005` (no leading zero) and `-5`; and `HIDDEN_AMOUNT` itself.
  - `WalletAmount.render.test.tsx`: the plan's three, plus "a tone or the colour of a material decides the colour; the label comes first, then the amount in words" (P8's words) and "a hidden amount keeps the amount's size and line, so rows never change height" (W10, P9). The clamp case also checks `maxFontSizeMultiplier` per size through the same recording mock of `@mobile/theme/AppText` that `WalletText.render.test.tsx` uses, since react-native-web drops the prop.
  - `PrivateMode.render.test.tsx`: the plan's four, plus "each tap tells VoiceOver what changed (ax-voiceover)", "until the setting is read, amounts stay hidden and the eye waits; a store that cannot answer shows them" (P5), "outside the wallet root amounts show, and the eye changes nothing" (the plan's outside rule), "the catalogue's private section pins its own preview and never touches the phone's setting" (P3) and "an icon button is 44 pt and named; a disabled one says so and does nothing".
- **P12. One equivalent mutant: the plan's own analytics mutant.** "Send `{ on }` with the event" (mutant M10 in Step 5) cannot be seen: `cleanEvent` (`src/analytics/catalog.ts`, lines 196 to 207) drops every key that `private_mode_toggled`'s rules (`insight`: `tab`, `period`, `reminder_hour`, `widget_size`) do not allow, before the test seam or the client sees it, so `on` can never be sent, and 1D-T1's catalog tests hold that allow-list. Mutant M11 sends an allowed key (`period`) instead, and the analytics case kills it.
- **P13. The sign-out erase.** It forgets `private-mode` and `private-tip-seen` (P2-T3's `eraseDeviceSettings`). The provider's state holds until the app closes, as the bun intensity's and the haptics' do after the same erase. So a person who signs out with amounts hidden leaves them hidden until the next launch (the safe way round). Note for the integrator.
- **P14. Clear of the work in flight.** P2-T9 (motion) and 1C-T8 (`registry.tsx`, `featureFlags.ts`, the account and onboarding screens) share no file with this task. The two shared files here take additive edits in named places: `WalletRoot.tsx` (P2-T33 adds `LockGate` outside this provider later) and `dev/catalogue/wallet/index.ts` (each later wallet task adds one spread after this one).
- **P15. The gate** is the plan's app gate: `typecheck:app`, `typecheck:routes`, `test:app`, `test:unit`, the focused files, the full render suite once, `export:web` and `git diff --check`. No package changes, so no `test:ops`; nothing outside `apps/app`, so no API, edge or database suite.
- **P16. Whole-suite counts are base plus this task's delta.** The delta: `test:app` +0; `test:unit` +6 (`walletMoney.test.ts`; `draftText.test.ts` keeps its 4 cases and now also reads `privacy/copy.ts`); render +2 files and +18 tests (WalletAmount 5, PrivateMode 9, and the two sections add one case each to `CatalogueScreen.render.test.tsx` and `screenReader.render.test.tsx`); web modules +3 (the release bundle gains `PrivateModeProvider.tsx` and the two modules it brings that nothing in the app imported before, `privacy/copy.ts` and `copy/draftText.ts`; the eye, the tip, `WalletAmount` and the sections are drawn only by tests and the development catalogue). The base at `1ddc7f7`, measured by the planner: `test:app` 34, `test:unit` 901, render 95 files and 1723 tests, web 4785 modules. If more app work merges before you start (P2-T9 and 1C-T8 are in flight), your Step 1.4 base differs by exactly what those merges add; then every whole-suite Expected line is your base plus the delta above, and the receipt names each merge. The per-file counts you measure in Step 1.4 are your focused baseline either way.

---

## Step 1: Sync, install and measure the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." (or a fast-forward over controller-state commits only). Then `/usr/bin/git -C WT rev-parse --short HEAD` and record it.
2. `/usr/bin/git -C WT diff --stat 1ddc7f7 HEAD -- apps/app package-lock.json`. Expected: no output. If there is output: if it lists `apps/app/src/wallet/WalletRoot.tsx`, `apps/app/src/dev/catalogue/wallet/index.ts`, `apps/app/src/dev/catalogue/wallet/kitSections.tsx`, or any path under `apps/app/src/wallet/money/`, `apps/app/src/wallet/privacy/` or `apps/app/src/wallet/controls/`, report BLOCKED; otherwise run `/usr/bin/git -C WT log --oneline 1ddc7f7..HEAD` and keep the merged PRs it lists for the receipt (whole-suite counts then follow P16).
3. `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo $?`. Expected: 0 and "added 1416 packages" (another number only if Step 1.2 listed `package-lock.json`).
4. The base, before you copy anything (whole suites; P16):
   - `cd WT && npm run test:app > S/base-test-app.log 2>&1; echo $?`. Expected: 0, `ℹ tests 34`, `ℹ pass 34`, `ℹ fail 0`.
   - `cd WT && npm run test:unit > S/base-test-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 901`, `ℹ pass 901`, `ℹ fail 0`.
   - `cd WT/apps/app && npx vitest list --config vitest.render.config.ts --json=S/base-vitest-list.json > S/base-vitest-list.log 2>&1; echo $?`, then:
     ```bash
     node -e 'const l=require(process.argv[1]);const by={};for(const t of l){const f=t.file.split("/apps/app/")[1];by[f]=(by[f]||0)+1;}console.log("files",Object.keys(by).length,"tests",l.length);for(const f of ["src/dev/catalogue/CatalogueScreen.render.test.tsx","src/dev/catalogue/screenReader.render.test.tsx","src/dev/catalogue/largeText.render.test.tsx","src/dev/catalogue/catalogueRoute.render.test.tsx","src/wallet/WalletRoot.render.test.tsx","src/wallet/testing/walletHarness.render.test.tsx","src/screens/redesign/RootLayout.render.test.tsx","src/wallet/WalletText.render.test.tsx"])console.log(f,by[f])' S/base-vitest-list.json
     ```
     Expected: 0, then exactly
     ```
     files 95 tests 1723
     src/dev/catalogue/CatalogueScreen.render.test.tsx 268
     src/dev/catalogue/screenReader.render.test.tsx 248
     src/dev/catalogue/largeText.render.test.tsx 6
     src/dev/catalogue/catalogueRoute.render.test.tsx 3
     src/wallet/WalletRoot.render.test.tsx 8
     src/wallet/testing/walletHarness.render.test.tsx 6
     src/screens/redesign/RootLayout.render.test.tsx 8
     src/wallet/WalletText.render.test.tsx 4
     ```
     (`vitest list` collects the suite without running it: about 30 seconds.)
   - `cd WT && npm run export:web -w gogospend-app -- --max-workers 2 > S/base-export-web.log 2>&1; echo $?`. Expected: 0 and `Web Bundled ... node_modules/expo-router/entry.js (4785 modules)`. (The output goes to the ignored `apps/app/dist/`.)

   If HEAD is `1ddc7f7`, or Step 1.2 printed nothing, every number must match. If merges came in, a whole-suite number may differ only by what they add (P16), and a catalogue file's count only by sections those merges add; the eight per-file counts you print are this task's focused baseline either way, and you use them in Step 4.
5. Check the base: `shasum -a 256 WT/apps/app/src/wallet/WalletRoot.tsx WT/apps/app/src/dev/catalogue/wallet/index.ts` equal the `orig/` lines in `PL/SHA256SUMS` (`5cbb7d27...` and `539dcee2...`). And `ls WT/apps/app/src/wallet/money WT/apps/app/src/wallet/privacy WT/apps/app/src/wallet/controls WT/apps/app/src/dev/catalogue/wallet/kitSections.tsx` must fail (none exists yet). If a checksum differs, report BLOCKED.

## Step 2: The tests, the copy table and the typed stubs (plan Step 1)

1. Copy:
   ```bash
   mkdir -p WT/apps/app/src/wallet/money WT/apps/app/src/wallet/privacy WT/apps/app/src/wallet/controls
   cp PL/real/apps/app/src/wallet/money/walletMoney.test.ts WT/apps/app/src/wallet/money/walletMoney.test.ts
   cp PL/real/apps/app/src/wallet/money/WalletAmount.render.test.tsx WT/apps/app/src/wallet/money/WalletAmount.render.test.tsx
   cp PL/real/apps/app/src/wallet/privacy/PrivateMode.render.test.tsx WT/apps/app/src/wallet/privacy/PrivateMode.render.test.tsx
   cp PL/real/apps/app/src/wallet/privacy/copy.ts WT/apps/app/src/wallet/privacy/copy.ts
   cp PL/stubs/apps/app/src/wallet/money/walletMoney.ts WT/apps/app/src/wallet/money/walletMoney.ts
   cp PL/stubs/apps/app/src/wallet/money/WalletAmount.tsx WT/apps/app/src/wallet/money/WalletAmount.tsx
   cp PL/stubs/apps/app/src/wallet/controls/IconButton.tsx WT/apps/app/src/wallet/controls/IconButton.tsx
   cp PL/stubs/apps/app/src/wallet/privacy/PrivateModeProvider.tsx WT/apps/app/src/wallet/privacy/PrivateModeProvider.tsx
   cp PL/stubs/apps/app/src/wallet/privacy/PrivateEyeButton.tsx WT/apps/app/src/wallet/privacy/PrivateEyeButton.tsx
   cp PL/stubs/apps/app/src/wallet/privacy/PrivateTip.tsx WT/apps/app/src/wallet/privacy/PrivateTip.tsx
   ```
   `copy.ts` goes in final at this step: it is data. `WalletRoot.tsx` and `index.ts` stay as they are, and `kitSections.tsx` comes at Step 4.
2. `shasum -a 256` the ten files and compare: the `real/` lines for the three tests and `copy.ts`, the `stubs/` lines for the six code files. If a `cp` source is missing or a checksum differs, report BLOCKED.
3. The stubs, for reference (each is the plan's interface with no behaviour; `stubs/` holds them):

`stubs/apps/app/src/wallet/money/walletMoney.ts`:

{{stub:apps/app/src/wallet/money/walletMoney.ts}}

`stubs/apps/app/src/wallet/money/WalletAmount.tsx`:

{{stub:apps/app/src/wallet/money/WalletAmount.tsx}}

`stubs/apps/app/src/wallet/controls/IconButton.tsx`:

{{stub:apps/app/src/wallet/controls/IconButton.tsx}}

`stubs/apps/app/src/wallet/privacy/PrivateModeProvider.tsx`:

{{stub:apps/app/src/wallet/privacy/PrivateModeProvider.tsx}}

`stubs/apps/app/src/wallet/privacy/PrivateEyeButton.tsx`:

{{stub:apps/app/src/wallet/privacy/PrivateEyeButton.tsx}}

`stubs/apps/app/src/wallet/privacy/PrivateTip.tsx`:

{{stub:apps/app/src/wallet/privacy/PrivateTip.tsx}}

## Step 3: RED (plan Step 2)

1. `cd WT && npm run typecheck:app > S/red-typecheck.log 2>&1; echo $?`. Expected: 0.
2. `cd WT && npm run test:unit -w gogospend-app -- src/wallet/money/walletMoney.test.ts > S/red-unit.log 2>&1; echo $?`. Expected: 1, `ℹ tests 6`, `ℹ pass 0`, `ℹ fail 6`, and `grep -c 'AssertionError' S/red-unit.log` gives 6. The six, in order, each an `AssertionError`:
   - U1 `the compact form drops .00 only when the satang are zero; the exact form keeps two decimals`: actual `'1248000'`, expected `'฿12,480'`
   - U2 `an expense takes the true minus, income a plus, a balance a minus only below zero, and zero no sign`: `'5000' !== '−฿50'`
   - U3 `only a canonical satang string is money`: `Missing expected exception (TypeError): "50.25"`
   - U4 `the per-day hint is whole baht, rounded down`: `'69099' !== '฿690'`
   - U5 `spoken money says baht, and satang only when there are some, inside minus below zero`: actual `'1248000'`, expected `'12,480 บาท'`
   - U6 `a hidden amount is ฿ and four dots`: `'' !== '฿••••'`
3. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/money/WalletAmount.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx > S/red-render.log 2>&1; echo $?`. Expected: 1, `Test Files  2 failed (2)`, `Tests  14 failed (14)`, no "Unhandled" section, `grep -c '^AssertionError' S/red-render.log` gives 14 and `grep -cE 'Cannot find module|Failed to resolve' S/red-render.log` gives 0. The fourteen, each failing first on:
   - W1 `income is violet with a plus, an expense in a list has no sign`: `th light: expected [ '3500000', '' ] to deeply equal [ '+฿35,000', …(1) ]`
   - W2 `a tone or the colour of a material decides the colour; the label comes first, then the amount in words`: `expected '' to be 'rgba(180, 54, 79, 1.00)' // Object.is equality`
   - W3 `private mode draws ฿•••• and says the amount is hidden, with no digit anywhere`: `th light: expected [ '1248000', '3500000', '-392000' ] to deeply equal [ '฿••••', '฿••••', '฿••••' ]`
   - W4 `a hidden amount keeps the amount's size and line, so rows never change height`: `shown 58: expected [ '', '', '' ] to deeply equal [ '58px', '76px', '-1.16px' ]`
   - W5 `an amount is never clamped to a line, and grows to 64 pt at most and never more than body text`: `expected [] to have a length of 9 but got +0`
   - V1 `the eye hides every amount and the choice survives a restart`: `expected [ '1248000', '3500000' ] to deeply equal [ '฿12,480', '+฿35,000' ]`
   - V2 `the eye says what it will do, at 44 pt`: `th light: expected '' to be 'ซ่อนยอดเงิน' // Object.is equality`
   - V3 `the tip shows the first time only`: `a button named ซ่อนยอดเงิน: expected null not to be null`
   - V4 `toggling sends one private_mode_toggled with no properties`: `a button named ซ่อนยอดเงิน: expected null not to be null`
   - V5 `each tap tells VoiceOver what changed (ax-voiceover)`: `a button named ซ่อนยอดเงิน: expected null not to be null`
   - V6 `until the setting is read, amounts stay hidden and the eye waits; a store that cannot answer shows them`: `expected [ '1248000', '3500000' ] to deeply equal [ '฿••••', '฿••••' ]`
   - V7 `outside the wallet root amounts show, and the eye changes nothing`: `expected [ '1248000', '3500000' ] to deeply equal [ '฿12,480', '+฿35,000' ]`
   - V8 `the catalogue's private section pins its own preview and never touches the phone's setting`: `expected [ undefined, undefined ] to deeply equal [ 'Bun Wallet: amounts', …(1) ]`
   - V9 `an icon button is 44 pt and named; a disabled one says so and does nothing`: `expected [ null, '', '' ] to deeply equal [ 'true', '0.4', '1' ]`

   U1 to U6 are `walletMoney.test.ts`, W1 to W5 `WalletAmount.render.test.tsx` and V1 to V9 `PrivateMode.render.test.tsx`, in file order; Step 5 names the cases by these ids.

   Compare with `PL/logs/red-unit.log` and `PL/logs/red-render.log`.

## Step 4: GREEN (plan Steps 3 and 4)

1. Copy the code:
   ```bash
   cp PL/real/apps/app/src/wallet/money/walletMoney.ts WT/apps/app/src/wallet/money/walletMoney.ts
   cp PL/real/apps/app/src/wallet/money/WalletAmount.tsx WT/apps/app/src/wallet/money/WalletAmount.tsx
   cp PL/real/apps/app/src/wallet/controls/IconButton.tsx WT/apps/app/src/wallet/controls/IconButton.tsx
   cp PL/real/apps/app/src/wallet/privacy/PrivateModeProvider.tsx WT/apps/app/src/wallet/privacy/PrivateModeProvider.tsx
   cp PL/real/apps/app/src/wallet/privacy/PrivateEyeButton.tsx WT/apps/app/src/wallet/privacy/PrivateEyeButton.tsx
   cp PL/real/apps/app/src/wallet/privacy/PrivateTip.tsx WT/apps/app/src/wallet/privacy/PrivateTip.tsx
   cp PL/real/apps/app/src/wallet/WalletRoot.tsx WT/apps/app/src/wallet/WalletRoot.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/kitSections.tsx WT/apps/app/src/dev/catalogue/wallet/kitSections.tsx
   cp PL/real/apps/app/src/dev/catalogue/wallet/index.ts WT/apps/app/src/dev/catalogue/wallet/index.ts
   ```
2. `shasum -a 256` the 13 files against their `real/` lines in `PL/SHA256SUMS`: all equal. `/usr/bin/git -C WT status --short` shows exactly ` M apps/app/src/dev/catalogue/wallet/index.ts`, ` M apps/app/src/wallet/WalletRoot.tsx`, `?? apps/app/src/dev/catalogue/wallet/kitSections.tsx`, `?? apps/app/src/wallet/controls/`, `?? apps/app/src/wallet/money/` and `?? apps/app/src/wallet/privacy/`.
3. The code is in the appendix (from `PL/real/`, byte for byte), with the two shared files' diffs. Read the tests before the receipt: the receipt names every case.
4. `cd WT && npm run typecheck:app > S/green-typecheck.log 2>&1; echo $?`. Expected: 0.
5. `cd WT && npm run test:unit -w gogospend-app -- src/wallet/money/walletMoney.test.ts src/wallet/copy/draftText.test.ts > S/green-unit.log 2>&1; echo $?`. Expected: 0, `ℹ tests 10`, `ℹ pass 10`, `ℹ fail 0` (6 and 4: `draftText.test.ts` now reads `privacy/copy.ts` too, and its four cases still pass). Node's `MODULE_TYPELESS_PACKAGE_JSON` warning per file is in the base log too.
6. `cd WT/apps/app && npx vitest run --config vitest.render.config.ts --reporter=verbose src/wallet/money/WalletAmount.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx > S/green-render.log 2>&1; echo $?`. Expected: 0, `Test Files  2 passed (2)`, `Tests  14 passed (14)`, each case marked `✓`. The stderr holds only notices the base logs hold too: Vite's config-loader notice, two sourcemap notices for `expo-status-bar` and Node's `ExperimentalWarning: localStorage is not available ...`, once per worker. No `act(...)` warning and no `console.error`.
7. The neighbours and the catalogue (plan Step 4), in one run:
   ```bash
   cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/money/WalletAmount.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/WalletRoot.render.test.tsx src/screens/redesign/RootLayout.render.test.tsx src/dev/catalogue/CatalogueScreen.render.test.tsx src/dev/catalogue/screenReader.render.test.tsx src/dev/catalogue/largeText.render.test.tsx src/dev/catalogue/catalogueRoute.render.test.tsx > S/green-focused.log 2>&1; echo $?
   ```
   Expected: 0, `Test Files  9 passed (9)` and `Tests  N passed (N)`, where N is 14 plus your Step 1.4 counts for the harness, `WalletRoot`, `RootLayout`, `largeText` and `catalogueRoute`, plus your `CatalogueScreen` and `screenReader` counts each + 2 (the two sections): 565 at `1ddc7f7` (14 + 6 + 8 + 8 + 270 + 250 + 6 + 3). About six minutes on a busy machine. `WalletRoot.render.test.tsx` and `RootLayout.render.test.tsx` now draw the real private-mode provider inside the root, unchanged (P7).

## Step 5: Mutation check (plan Step 5)

1. `python3 -I PL/tools/mutants.py WT S/mutant-logs > S/mutants.out 2>&1; echo $?`. It applies each mutant alone, runs its tests (the Node test for `walletMoney.ts`, the two new render files for the rest), and restores the file with its SHA-256 checked; two to five minutes on a busy machine (the planner's runs took two minutes each at load 10; a run with vitest's results cache and one without it printed the same lines). Expected: exit 0, and these 72 lines: one per mutant, each ending "restored sha256 equal", then the tally. Here a case is named by its id from Step 3 (U1 to U6, W1 to W5, V1 to V9); the file names it whole. The case named is the first that fails in the first test file, whatever order vitest runs the files in:
   ```
   N1 KILLED: the compact form keeps .00 [walletMoney.ts] -> Tests 2 failed | 4 passed (6); first failing U1; AssertionError x2; restored sha256 equal
   N2 KILLED: exact ignored (always compact) [walletMoney.ts] -> Tests 2 failed | 4 passed (6); first failing U1; AssertionError x2; restored sha256 equal
   N3 KILLED: zero is signed [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U2; AssertionError x1; restored sha256 equal
   N4 KILLED: a hyphen for the minus [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U2; AssertionError x1; restored sha256 equal
   N5 KILLED: income without its plus [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U2; AssertionError x1; restored sha256 equal
   N6 KILLED: a balance signs a positive amount [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U2; AssertionError x1; restored sha256 equal
   N7 KILLED: 'none' keeps a negative's minus [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U2; AssertionError x1; restored sha256 equal
   N8 KILLED: an expense without its minus [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U2; AssertionError x1; restored sha256 equal
   N9 KILLED: the per-day hint rounded to the nearest baht (the plan's mutant) [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U4; AssertionError x1; restored sha256 equal
   N10 KILLED: the per-day hint keeps its satang [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U4; AssertionError x1; restored sha256 equal
   N11 KILLED: spoken money always says satang [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U5; AssertionError x1; restored sha256 equal
   N12 KILLED: spoken satang keep a leading zero [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U5; AssertionError x1; restored sha256 equal
   N13 KILLED: spoken money never says minus [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U5; AssertionError x1; restored sha256 equal
   N14 KILLED: the mask has three dots [walletMoney.ts] -> Tests 1 failed | 5 passed (6); first failing U6; AssertionError x1; restored sha256 equal
   A1 KILLED: the real amount drawn under the mask (the plan's mutant) [WalletAmount.tsx] -> Tests 4 failed | 10 passed (14); first failing W3; AssertionError x4; restored sha256 equal
   A2 KILLED: a hidden amount says its amount [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W3; AssertionError x1; restored sha256 equal
   A3 KILLED: income in ink [WalletAmount.tsx] -> Tests 2 failed | 12 passed (14); first failing W1; AssertionError x2; restored sha256 equal
   A4 KILLED: the tone ignored [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W2; AssertionError x1; restored sha256 equal
   A5 KILLED: the material's colour ignored [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W2; AssertionError x1; restored sha256 equal
   A6 KILLED: amounts in Anuphan [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W1; AssertionError x1; restored sha256 equal
   A7 KILLED: weight 500 [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W1; AssertionError x1; restored sha256 equal
   A8 KILLED: letter spacing at every size [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W4; AssertionError x1; restored sha256 equal
   A9 KILLED: letter spacing only above 28 pt [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W4; AssertionError x1; restored sha256 equal
   A10 KILLED: the mask spaced as the amount [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W4; AssertionError x1; restored sha256 equal
   A11 KILLED: every amount grows as body text (no 64 pt cap) [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W5; AssertionError x1; restored sha256 equal
   A12 KILLED: an amount clamped to one line [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W5; AssertionError x1; restored sha256 equal
   A13 KILLED: Thai leading for amounts [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W4; AssertionError x1; restored sha256 equal
   A14 KILLED: the mask smaller than the amount [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W4; AssertionError x1; restored sha256 equal
   A15 KILLED: the words always from the signed amount [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W2; AssertionError x1; restored sha256 equal
   A16 KILLED: the words always from the size [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W2; AssertionError x1; restored sha256 equal
   A17 KILLED: the label after the amount [WalletAmount.tsx] -> Tests 2 failed | 12 passed (14); first failing W2; AssertionError x2; restored sha256 equal
   A18 KILLED: the sign ignored [WalletAmount.tsx] -> Tests 5 failed | 9 passed (14); first failing W1; AssertionError x5; restored sha256 equal
   A19 KILLED: exact ignored [WalletAmount.tsx] -> Tests 1 failed | 13 passed (14); first failing W2; AssertionError x1; restored sha256 equal
   I1 KILLED: a 36 pt button [IconButton.tsx] -> Tests 2 failed | 12 passed (14); first failing V2; AssertionError x2; restored sha256 equal
   I2 KILLED: a disabled button still presses [IconButton.tsx] -> Tests 1 failed | 13 passed (14); first failing V9; AssertionError x1; restored sha256 equal
   I3 KILLED: a disabled button is not dimmed [IconButton.tsx] -> Tests 1 failed | 13 passed (14); first failing V9; AssertionError x1; restored sha256 equal
   I4 KILLED: no name for screen readers [IconButton.tsx] -> Tests 9 failed | 5 passed (14); first failing V1; AssertionError x9; restored sha256 equal
   I5 KILLED: the raised fill (invisible on the ground) [IconButton.tsx] -> Tests 1 failed | 13 passed (14); first failing V2; AssertionError x1; restored sha256 equal
   I6 KILLED: an ink ring [IconButton.tsx] -> Tests 1 failed | 13 passed (14); first failing V2; AssertionError x1; restored sha256 equal
   M1 KILLED: amounts show before the setting is read [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V6; AssertionError x1; restored sha256 equal
   M2 KILLED: the eye works before the setting is read [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V6; AssertionError x1; restored sha256 equal
   M3 KILLED: the stored setting is not read [PrivateModeProvider.tsx] -> Tests 5 failed | 9 passed (14); first failing W3; AssertionError x5; restored sha256 equal
   M4 KILLED: hiding is not stored [PrivateModeProvider.tsx] -> Tests 2 failed | 12 passed (14); first failing V1; AssertionError x2; restored sha256 equal
   M5 KILLED: showing does not remove the setting [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V1; AssertionError x1; restored sha256 equal
   M6 KILLED: nothing is announced [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V5; AssertionError x1; restored sha256 equal
   M7 KILLED: the announcements swapped [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V5; AssertionError x1; restored sha256 equal
   M8 KILLED: no event [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V4; AssertionError x1; restored sha256 equal
   M9 KILLED: two events per tap [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V4; AssertionError x1; restored sha256 equal
   M10 SURVIVED (equivalent): the event carries { on } (the plan's mutant; equivalent: cleanEvent drops a key private_mode_toggled does not allow) [PrivateModeProvider.tsx] -> Tests 14 passed (14); AssertionError x0; restored sha256 equal
   M11 KILLED: the event carries an allowed key, { period } [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V4; AssertionError x1; restored sha256 equal
   M12 KILLED: closing the tip is not stored [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V3; AssertionError x1; restored sha256 equal
   M13 KILLED: the stored tip mark is not read [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V3; AssertionError x1; restored sha256 equal
   M14 KILLED: closing the tip leaves it showing [PrivateModeProvider.tsx] -> Tests 2 failed | 12 passed (14); first failing V3; AssertionError x2; restored sha256 equal
   M15 KILLED: a store that cannot read is not caught [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V6; AssertionError x1; restored sha256 equal
   M16 KILLED: a store that cannot write is not caught [PrivateModeProvider.tsx] -> Tests 14 passed (14); AssertionError x0; restored sha256 equal
   M17 KILLED: a provider's own store ignored [PrivateModeProvider.tsx] -> Tests 2 failed | 12 passed (14); first failing V6; AssertionError x2; restored sha256 equal
   M18 KILLED: outside the wallet root amounts are hidden [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V7; AssertionError x1; restored sha256 equal
   M19 KILLED: every announcement in English [PrivateModeProvider.tsx] -> Tests 1 failed | 13 passed (14); first failing V5; AssertionError x1; restored sha256 equal
   M20 KILLED: WalletRoot without private mode [WalletRoot.tsx] -> Tests 8 failed | 6 passed (14); first failing W3; AssertionError x7; restored sha256 equal
   E1 KILLED: the eye names its state, not what it will do [PrivateEyeButton.tsx] -> Tests 8 failed | 6 passed (14); first failing V1; AssertionError x8; restored sha256 equal
   E2 KILLED: the eye is always drawn open [PrivateEyeButton.tsx] -> Tests 1 failed | 13 passed (14); first failing V2; AssertionError x1; restored sha256 equal
   E3 KILLED: the eye does nothing [PrivateEyeButton.tsx] -> Tests 7 failed | 7 passed (14); first failing V1; AssertionError x7; restored sha256 equal
   T1 KILLED: the tip shows while amounts show [PrivateTip.tsx] -> Tests 1 failed | 13 passed (14); first failing V3; AssertionError x1; restored sha256 equal
   T2 KILLED: the tip shows after it was closed [PrivateTip.tsx] -> Tests 2 failed | 12 passed (14); first failing V3; AssertionError x2; restored sha256 equal
   T3 KILLED: the tip is no status region [PrivateTip.tsx] -> Tests 1 failed | 13 passed (14); first failing V3; AssertionError x1; restored sha256 equal
   T4 KILLED: a 32 pt close [PrivateTip.tsx] -> Tests 1 failed | 13 passed (14); first failing V3; AssertionError x1; restored sha256 equal
   T5 KILLED: the close does nothing [PrivateTip.tsx] -> Tests 2 failed | 12 passed (14); first failing V3; AssertionError x2; restored sha256 equal
   K1 KILLED: bw-private on the phone's own store [kitSections.tsx] -> Tests 1 failed | 13 passed (14); first failing V8; AssertionError x1; restored sha256 equal
   K2 KILLED: bw-private not pinned hidden [kitSections.tsx] -> Tests 1 failed | 13 passed (14); first failing V8; AssertionError x1; restored sha256 equal
   K3 KILLED: bw-amounts pins amounts shown [kitSections.tsx] -> Tests 1 failed | 13 passed (14); first failing V8; AssertionError x0; restored sha256 equal
   K4 KILLED: the kit list not in the wallet list [index.ts] -> Tests 1 failed | 13 passed (14); first failing V8; AssertionError x1; restored sha256 equal
   70 killed, 1 survived, 0 not as expected
   ```
   Compare with `PL/logs/mutants.out`. The plan's three mutants are N9 (the per-day hint rounded to the nearest baht), A1 (the real amount drawn under the mask) and M10 (`{ on }` with the event, equivalent: ruling P12; M11 shows the analytics case does read the properties). Every other kill is an assertion in the case named, with two exceptions. K3 fails V8 on `getAllByText`, which finds no mask. M16 passes all 14 cases, and Vitest fails the run on the unhandled rejection that the write leaves (`Errors  1 error`, "Unhandled Rejection ... the keychain is locked"): the choice still holds, so nothing else shows the missing `.catch`. M15 leaves the same rejection beside its assertion.
2. `shasum -a 256` the 13 files against `real/` again, and `/usr/bin/git -C WT status --short`. Expected: unchanged from Step 4.2.

## Step 6: Gate (plan Step 6, the plan's app gate)

From WT, in this order, each with its log in S:

1. `npm run typecheck:app`: exit 0.
2. `npm run typecheck:routes -w gogospend-app`: exit 0.
3. `npm run test:app`: 34 tests, 34 pass, 0 fail (base 34 + 0).
4. `npm run test:unit`: 907 tests, 907 pass, 0 fail (base 901 + 6).
5. The focused files once more: `cd WT/apps/app && npx vitest run --config vitest.render.config.ts src/wallet/money/WalletAmount.render.test.tsx src/wallet/privacy/PrivateMode.render.test.tsx src/wallet/testing/walletHarness.render.test.tsx src/wallet/WalletRoot.render.test.tsx`: `Test Files  4 passed (4)`, `Tests  28 passed (28)` (5, 9, 6 and 8).
6. The full render suite, once, at the end (you may run it in the background): `npm run test:render -w gogospend-app > S/render-full.log 2>&1`. Expected: exit 0, `Test Files  97 passed (97)`, `Tests  1741 passed (1741)`: base 95 files and 1723 tests plus this task's 2 files and 18 tests. A case that times out near 5 s in a file this task does not touch is a load flake (`HistoryReturn.render.test.tsx` is the usual one, followups line 35): rerun that file alone (`cd WT/apps/app && npx vitest run --config vitest.render.config.ts <file>`), record both runs, and do not change it.
7. `npm run export:web -w gogospend-app -- --max-workers 2 > S/export-web.log 2>&1`: exit 0, `Web Bundled ... node_modules/expo-router/entry.js (4788 modules)` (base 4785 + 3, P16).
8. `/usr/bin/git -C WT diff --check` (before the commit) and, after it, `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD`: no output.

Not run, and why (put this in the receipt): `test:ops` (no package or lockfile change); the API, edge and database suites (nothing outside `apps/app` changes; Docker is stopped); device and simulator checks, VoiceOver on a phone and the E2-A screenshots of `bw-amounts` and `bw-private` (the controller's, after P2-T13): SKIPPED.

## Step 7: Receipt

Write `docs/implementation/receipts/P2-T10.md` in the house style (see `docs/implementation/receipts/P2-T8.md`), with your own numbers where they differ from these. Start from:

```markdown
# P2-T10: Money text, WalletAmount, the icon button and private mode

- **Status:** built and verified locally on `p2/t10-money-text` (`.claude/worktrees/p2-t10`), from `<head>`. Not pushed. The independent review is the controller's, after this receipt. Under ruling R87 this receipt is its own file; `premium-progress.md` is not edited.
- **Base:** `<head>`. (The brief was proven at `1ddc7f7`. If your head is later, name each merged PR from `git log --oneline 1ddc7f7..HEAD` and what it adds to each whole suite.)
- **Files:** created `apps/app/src/wallet/money/walletMoney.ts`, `walletMoney.test.ts` (6 cases), `WalletAmount.tsx`, `WalletAmount.render.test.tsx` (5 cases), `apps/app/src/wallet/controls/IconButton.tsx`, `apps/app/src/wallet/privacy/copy.ts`, `PrivateModeProvider.tsx`, `PrivateEyeButton.tsx`, `PrivateTip.tsx`, `PrivateMode.render.test.tsx` (9 cases), `apps/app/src/dev/catalogue/wallet/kitSections.tsx` and this receipt; modified `apps/app/src/wallet/WalletRoot.tsx` (the provider inside the motion answer, its import and the header) and `apps/app/src/dev/catalogue/wallet/index.ts` (one import, one spread).
- **What changed:** (money text: the compact and exact forms, the signs, the per-day hint, the words; `WalletAmount`: the type, the colours, the label, the 64 pt cap, never clamped, the mask at the amount's own size and line; `IconButton`; private mode: the device names, hidden until read, the eye that waits, the rule (store, announce, one event), the tip until closed, the provider in `WalletRoot`; the two sections and how `bw-private` pins its own preview.)
- **RED to GREEN:** ... (Step 3 and Step 4 numbers; the 6 and 14 failing cases and their messages; the focused run.)
- **Mutation check:** 71 mutants, 70 killed, 1 equivalent (M10, the plan's `{ on }`: ruling P12) ... (one line per group, with the case that kills it).
- **Gate** (worktree root): ... (every command in Step 6 with its result, each whole-suite count written as base plus delta).
- **Deviations:** the rulings in force: P2 (the provider's place), P3 (sections bring what they need; `inApp` unchanged), P4 (the `store` prop), P5 (hidden until read, the eye waits), P6 (the tip until closed), P7 (the locale without `useIntl`), P8 (the signs and words), P9 (the board calls for E2-A), P10 (names), P11 (the cases beyond the plan's), P12 (the equivalent mutant).
- **SKIPPED:** `test:ops`; the API, edge and database suites; device and simulator checks, VoiceOver on a phone and E2-A's screenshots (Step 6).
- **Notes for later tasks:**
  - Draw every amount with `WalletAmount` (P2-T37's private sweep fails on one that is not). `sign: 'none'` draws the size; `'balance'` is the one sign that shows a minus below zero. Pass `label` so VoiceOver says what the amount is; pass `color` (`materialPaint(...).text`) on a material (P2-T11).
  - Text that carries an amount outside `WalletAmount` (the saved toast, the flying chip, chart labels, the share text) reads `usePrivateMode().hidden` and uses `HIDDEN_AMOUNT` or drops the amount (R65: P2-T17, P2-T31, P2-T32). `hidden` is true until the setting is read.
  - A catalogue section that needs private mode in one state mounts `<PrivateModeProvider store={...}>` over a store in memory, as `bw-private` does (`memoryStore` in `kitSections.tsx`); any other section follows the private mode around it. Never import the wallet test harness from a section.
  - `IconButton` is the page look (card fill, hairline ring). On a tray, the boards fill a close button with `raised` and no ring; P2-T13 decides whether the tray needs its own.
  - `PrivateTip` has no pointer; Home (P2-T24) places it under the eye. The `hideAmounts` fade (P2-T9's table) is not drawn yet.
  - `WalletRoot.render.test.tsx` draws the root with no `IntlProvider`: a provider added to `WalletRoot` that reads copy cannot use `useIntl` (ruling P7).
  - After a sign-out the provider keeps its state until the app closes (P13).
```

## Step 8: Commit

1. `/usr/bin/git -C WT add apps/app/src/wallet/money apps/app/src/wallet/controls apps/app/src/wallet/privacy apps/app/src/wallet/WalletRoot.tsx apps/app/src/dev/catalogue/wallet/kitSections.tsx apps/app/src/dev/catalogue/wallet/index.ts docs/implementation/receipts/P2-T10.md`
2. `/usr/bin/git -C WT status --short`: those 14 files staged (`A` for the 12 new ones, `M` for the two shared), nothing else (no `dist/`, no log).
3. Write the message to `S/commit-message.txt`:
   ```
   Add Bun Wallet money text and private mode, which hides every amount behind one eye

   Add the wallet's money text and WalletAmount, which draws every amount
   in DM Sans with its sign, grows with the text size to 64 pt and is
   never clamped; a 44 pt icon button; and private mode, a device setting
   in the wallet root that hides every amount behind ฿•••• at its own
   size until the eye is tapped again, with its tip, one
   private_mode_toggled per tap, and the kit's first catalogue sections.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
4. `/usr/bin/git -C WT commit -F S/commit-message.txt`, then `/usr/bin/git -C WT log --oneline -1` and `/usr/bin/git -C WT show --stat HEAD`: 14 files.

## Your final message

As the protocol says: `STATUS: DONE` (or `STATUS: BLOCKED` with the exact blocker) on the first line; the commit SHA and branch; files changed; RED and GREEN counts; mutants (killed, the one equivalent and why); each gate command with its result and counts, whole suites as base plus delta; SKIPPED items; deviations (P2 to P12); and what the reviewer should look at first: the provider's "hidden until read" and the eye's wait (P5), the locale read without `useIntl` (P7), `bw-private`'s own provider and store (P3, P4), and the signs and words (P8).

---

## Appendix: the code

Every block is the kit's file, byte for byte (`tools/brief.py` builds this brief from `tools/brief.template.md`). Copy from `PL/real/`, not from here.

### The two shared files

`apps/app/src/wallet/WalletRoot.tsx` (16 lines before, 20 after):

{{diff:apps_app_src_wallet_WalletRoot.tsx.diff}}

`apps/app/src/dev/catalogue/wallet/index.ts` (7 lines before, 10 after):

{{diff:apps_app_src_dev_catalogue_wallet_index.ts.diff}}

### Money text

`apps/app/src/wallet/money/walletMoney.ts`:

{{file:apps/app/src/wallet/money/walletMoney.ts}}

`apps/app/src/wallet/money/walletMoney.test.ts`:

{{file:apps/app/src/wallet/money/walletMoney.test.ts}}

### WalletAmount

`apps/app/src/wallet/money/WalletAmount.tsx`:

{{file:apps/app/src/wallet/money/WalletAmount.tsx}}

`apps/app/src/wallet/money/WalletAmount.render.test.tsx`:

{{file:apps/app/src/wallet/money/WalletAmount.render.test.tsx}}

### The icon button

`apps/app/src/wallet/controls/IconButton.tsx`:

{{file:apps/app/src/wallet/controls/IconButton.tsx}}

### Private mode

`apps/app/src/wallet/privacy/copy.ts`:

{{file:apps/app/src/wallet/privacy/copy.ts}}

`apps/app/src/wallet/privacy/PrivateModeProvider.tsx`:

{{file:apps/app/src/wallet/privacy/PrivateModeProvider.tsx}}

`apps/app/src/wallet/privacy/PrivateEyeButton.tsx`:

{{file:apps/app/src/wallet/privacy/PrivateEyeButton.tsx}}

`apps/app/src/wallet/privacy/PrivateTip.tsx`:

{{file:apps/app/src/wallet/privacy/PrivateTip.tsx}}

`apps/app/src/wallet/privacy/PrivateMode.render.test.tsx`:

{{file:apps/app/src/wallet/privacy/PrivateMode.render.test.tsx}}

### The catalogue sections

`apps/app/src/dev/catalogue/wallet/kitSections.tsx`:

{{file:apps/app/src/dev/catalogue/wallet/kitSections.tsx}}
