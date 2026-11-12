# Review: Brief P2-T31 (Insights: three tabs, the info tray, readable bars and the calendar)

- **Task:** P2-T31 (insights)
- **Brief:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/P2-T31.md`
- **Kit:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t31-planner/`
- **Reviewer:** Gemini 3.8 Flash (High)
- **Base / Head:** `a00fff7c` / `e8de291d`

---

## Summary of Checks

1. **The kit holds:** Passed. `bash check_kit.sh` at head reports `36 OK, 0 not OK`, `orig/: 2 files identical at the head`. Checksums in `SHA256SUMS` match the files and the brief's cited sums.
2. **The plan:** Passed. All 9 test cases specified in `docs/superpowers/plans/2026-10-25-jotbun-p2-bun-wallet-core.md` (lines 1528–1536) are present in `calendarShade.test.ts` and `WalletInsights.render.test.tsx`. Extra cases (boundary edge cases in `calendarShade.test.ts`, dark mode & English private mode verification, and catalogue registration test) have explicit justifications.
3. **The boards and the wallet kit:** Passed. The screens match `docs/design/bun-wallet/` (`bw-insights.dc.html`, `wc-calendar.dc.html`, `es-empty-insights.dc.html`) and spec 5.3 fixes (bars darkened to ≥3:1 against white; all touch targets ≥44 pt, calendar day buttons 50 pt). Zero raw hex in production code (`apps/app/src/wallet/insights/*` and `apps/app/app/spend/insights.tsx`). Tokens come from `useWalletColors()`, `calendarPaint()`, and `WalletAmount`.
4. **The ten points:** Passed.
   - 1. Motion: Zero custom animations. `InfoTray` delegates to `Tray` which reads `useWalletReducedMotion()`.
   - 2. Failure paths: `useInsightsData` routes load failures through `recapProblem(error, tc)`. `WalletInsightsScreen` renders `Notice` with alert tone and `Try again` reload action, and `SyncBanner` when offline.
   - 3. Catalogue sections: `insightsSections.tsx` renders real components (`SpendingTab`, `InOutTab`, `CalendarTab`) on fake data.
   - 4. Full data reads: `readAllPages` reads all history pages with cursor iteration until exhausted.
   - 5. Kit colours: Verified in light and dark modes with contrast preserved.
   - 6. Thai first: Standard Thai lines in `copy.ts` with English drafts for E2-C, accessed via `useDraftCopy`.
   - 7. Private mode: Accessible label in `MonthBars` excludes amounts/currency; `CalendarTab` uses neutral `raised` fill, omits day amounts, hides legend values, masks month summary line; tested in Thai, English, and dark mode.
   - 8. Suite matches plan: Verified 1:1 against plan specification.
   - 9. Largest text sizes: Zero `numberOfLines` clamps across all implementation files. Interactive controls are ≥44 pt.
   - 10. RED failures: Asserting helpers (`found`, `named`, `shown`) throw `AssertionError`. All 23 mutants in `tools/mutants.py` killed.
5. **Reproduction on scratch copy:** Verified under heavy lock (`/private/tmp/claude-501/jotbun-heavy.lock`). `npm run typecheck:app` passed (0 errors), `calendarShade.test.ts` passed (3/3), `draftText.test.ts` passed (4/4), `WalletInsights.render.test.tsx` passed (11/11), and `walletHarness.render.test.tsx` passed (9/9). Rerun 3 mutants (`M1`, `M7`, `M14`) with all 3 killed as expected.
6. **Fit for a Flash implementer:** Brief is mechanical, copy-from-kit, ordered, with exact expected output lines.
7. **The routes tests:** **FAILED (Blocking finding below).**

---

## Blocking Findings

### B1. `InsightsRoutes.render.test.tsx` breaks with unmocked `WalletInsightsScreen` import

- **Evidence:**
  In `apps/app/app/spend/insights.tsx` (modified by P2-T31, `real/apps/app/app/spend/insights.tsx:7`):
  ```tsx
  import { WalletInsightsScreen } from '@mobile/wallet/insights/WalletInsightsScreen';
  ```
  `src/screens/redesign/insights/InsightsRoutes.render.test.tsx` tests `SpendInsightsRoute` (`app/spend/insights.tsx`), but its module mocks only stub:
  - `@mobile/screens/redesign/insights/InsightsScreen`
  - `@mobile/screens/redesign/insights/RecapScreen`
  - `@mobile/screens/redesign/insights/RemindersScreen`

  It does NOT stub `@mobile/wallet/insights/WalletInsightsScreen`.
  When running `npx vitest run --config vitest.render.config.ts src/screens/redesign/insights/InsightsRoutes.render.test.tsx` on the scratch tree with the kit's `real/` files applied, Vitest attempts to resolve the full import tree of `WalletInsightsScreen`, failing immediately with:
  ```
  FAIL  src/screens/redesign/insights/InsightsRoutes.render.test.tsx
  Error: Cannot find module '/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core/node_modules/expo/build/async-require/hmr' imported from /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1a-vault-core/node_modules/expo/build/async-require/setupHMR.js
  ```
  When stubbing `WalletInsightsScreen` in `InsightsRoutes.render.test.tsx`:
  ```tsx
  vi.mock('@mobile/wallet/insights/WalletInsightsScreen', stub('WalletInsightsScreen', () => 'wallet insights'));
  ```
  all 3 tests in `InsightsRoutes.render.test.tsx` pass cleanly in 18ms.

- **Impact:**
  Running routes tests or running CI's render suite will fail on `InsightsRoutes.render.test.tsx`.
  Furthermore, the brief does not include `InsightsRoutes.render.test.tsx` in its scope or in its fast local gate in Step 4.

- **Required Fix:**
  1. Add `vi.mock('@mobile/wallet/insights/WalletInsightsScreen', stub('WalletInsightsScreen', () => 'wallet insights'));` to `apps/app/src/screens/redesign/insights/InsightsRoutes.render.test.tsx`.
  2. Include `apps/app/src/screens/redesign/insights/InsightsRoutes.render.test.tsx` in the kit as a shared modified file (provide `orig/`, `real/`, and `diffs/apps_app_src_screens_redesign_insights_InsightsRoutes.render.test.tsx.diff`).
  3. Update `files.txt`, `shared.txt`, and regenerate `SHA256SUMS`.
  4. In `briefs/P2-T31.md`:
     - Add `InsightsRoutes.render.test.tsx` to the Scope table.
     - Add the diff application step for `InsightsRoutes.render.test.tsx` in Step 4.
     - Add `npx vitest run --config vitest.render.config.ts src/screens/redesign/insights/InsightsRoutes.render.test.tsx` to the GREEN verifications in Step 4.
     - Add the routes test check to the fast local gate.

---

## Minor Findings

### M1. Test coverage for the `wallet` redesign flag in `InsightsRoutes.render.test.tsx`

- **Evidence:**
  `app/spend/insights.tsx` adds `if (isRedesignEnabled('wallet')) return <SpendV1Provider resources={getSharedV1Resources()}><WalletInsightsScreen /></SpendV1Provider>;`.
  `InsightsRoutes.render.test.tsx` only tests `flags({ redesign: '-insights' })`, `flags({})`, and `flags({ redesign: 'insights', legacy: '1' })`. It does not explicitly test `flags({ redesign: 'wallet' })`.
- **Suggested Fix:**
  When updating `InsightsRoutes.render.test.tsx` to add the stub (B1), add a test case asserting that `flags({ redesign: 'wallet' })` renders `wallet insights with shared resources`.

---

VERDICT: Needs fixes
