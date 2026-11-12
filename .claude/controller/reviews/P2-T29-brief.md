# Review of Brief P2-T29: Categories, the category tray and the Thai pack tray

Reviewer: Gemini 3.8 Flash (High)
Integration head: `a00fff7c` (Merge PR #406)
Kit reviewed: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29-planner`
Scratch copy: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/P2-T29-brief-review/repo`

---

## Findings

### Major Findings (Needs Fixes)

#### 1. One-line clamp in `WalletCategoriesScreen.tsx` (violates checklist point 9)
- **Evidence:** `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx:347`:
  ```tsx
  <WalletText style={styles.tileName} numberOfLines={1}>
    {name}
  </WalletText>
  ```
- **Rule violated:** Checklist point 9: *"The largest text sizes: nothing is clamped to one line, and every control is 44 pt and named."* Spec §5.3 / Global Constraints.
- **Impact:** At larger text sizes (Dynamic Type / AX sizes), category names clamp and truncate to a single line instead of wrapping.
- **Fix:** Remove `numberOfLines={1}` from `WalletCategoriesScreen.tsx:347` (and allow `styles.tileName` to wrap naturally, or adjust tile layout).

#### 2. Touch targets under 44 pt in `WalletCategoriesScreen.tsx` and `CategoryTray.tsx` (violates checklist point 9 & Spec §5.3)
- **Evidence:**
  1. `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx:399` and `apps/app/src/wallet/categories/CategoryTray.tsx:435`:
     ```tsx
     typeSegment: {
       flex: 1,
       alignItems: 'center',
       justifyContent: 'center',
       borderRadius: 19,
       minHeight: 38,
     },
     ```
     `minHeight: 38` is under 44 pt. In `TypeSwitchHeader.tsx` (`add/TypeSwitchHeader.tsx`), segments use `const SEGMENT = 44; minHeight: SEGMENT`.
  2. `apps/app/src/wallet/categories/CategoryTray.tsx:345` & `CategoryTray.tsx:503`:
     ```tsx
     <Pressable
       role="switch"
       aria-checked={hasLimit}
       aria-label={t('categories.setLimit')}
       onPress={() => setHasLimit(!hasLimit)}
       style={[styles.switchTrack, { backgroundColor: hasLimit ? colors.violet : colors.raised }]}
     >
     ```
     The interactive switch `Pressable` has `styles.switchTrack` which defines `width: 48, height: 28`. The tap target is only 28 pt tall.
- **Rule violated:** Checklist point 9: *"every control is 44 pt and named"*; Spec §5.3: *"Every tap target under 44 pt is enlarged"*; Plan P2-T29: *"every glyph, swatch and checkbox is at least 44 pt and named"*.
- **Fix:**
  - In `WalletCategoriesScreen.tsx` and `CategoryTray.tsx`, update `typeSegment` to `minHeight: 44`.
  - In `CategoryTray.tsx`, wrap `switchTrack` in a 44 pt Pressable container (or add `minHeight: 44, minWidth: 44, justifyContent: 'center'` with appropriate layout) matching `wc-category-edit.dc.html` (`width: 56px, height: 44px`).

#### 3. Raw hex literals in components (violates checklist point 5 & ruling P6)
- **Evidence:**
  - `apps/app/src/wallet/categories/CategoryTray.tsx:438`: `shadowColor: '#111014'`
  - `apps/app/src/wallet/categories/CategoryTray.tsx:510`: `backgroundColor: '#fff'`
  - `apps/app/src/wallet/categories/WalletCategoriesScreen.tsx:403`: `shadowColor: '#111014'`
- **Rule violated:** Checklist point 5: *"Colour and type come from the wallet kit, with no raw hex. Check contrast in dark mode as well as light."* Brief ruling P6: *"no raw hex literals in components"*.
- **Impact:** Hardcoded `#fff` for `switchThumb` in `CategoryTray.tsx` causes contrast inconsistency in dark mode (`#fff` against dark sheet `#24222B`), and hardcoded `#111014` shadows fail to use proper dark mode handling (e.g. `!colors.isDark ? LIFT : undefined` as in `TypeSwitchHeader.tsx`).
- **Fix:**
  - Replace `backgroundColor: '#fff'` with `colors.card` or `colors.onPrimary`.
  - Replace `shadowColor: '#111014'` with theme tokens or conditional shadow/boxShadow (`!colors.isDark ? ... : undefined`).

#### 4. Unhandled failure path and raw English fallbacks in trays (violates checklist points 2 & 6)
- **Evidence:**
  1. `apps/app/src/wallet/categories/CategoryTray.tsx:186, 207, 210`:
     - Line 186: `setErrorMsg(plan.errors.label ?? plan.errors.limit ?? 'Error saving');`
     - Line 207: `setErrorMsg(commands.message ?? 'Could not save');`
     - Line 210: `setErrorMsg('Could not save that. Try again.');`
     These fallbacks are hardcoded English literals bypassing the translation catalogs.
  2. `apps/app/src/wallet/categories/ThaiPackTray.tsx:78-85`:
     ```tsx
     const ok = await commands.send(cmds, {
       success: tc('Added.'),
       draft: null,
       seen: budget,
     });
     if (ok) {
       onClose();
     }
     ```
     When `commands.send` returns `false` (refusal, conflict, or unconfirmed error), `ThaiPackTray` does not display any error message to the user; it silently sets `saving = false`, leaving the user stranded without an error message or guidance.
- **Rule violated:** Checklist point 2: *"Every failure path (a read, a write, a share or a link that cannot open) is handled, and told to the person in their language, with a way out."* Checklist point 6: *"Copy is Thai first... every string goes through the catalogs."*
- **Fix:**
  - In `CategoryTray.tsx`, ensure all fallback error messages go through `tc(...)` (e.g. `tc('Could not save that. Try again.')`).
  - In `ThaiPackTray.tsx`, add error message state and display `commands.message` when `commands.send` returns `false`, with a clear retry or dismiss path.

---

### Minor Findings

#### 5. Reduced motion not proven in `WalletCategories.render.test.tsx`
- **Evidence:** `WalletCategories.render.test.tsx` does not test reduced motion, although Ruling P9 claims *"Tray animations read isReducedMotion (W6, R66) and avoid springs when reduced motion is on"*, and Checklist point 1 requires proof in the kit.
- **Fix:** Add a test case in `WalletCategories.render.test.tsx` verifying reduced motion behavior with `ReducedMotionConfig mode={ReduceMotion.Always}`, or note that motion is delegated entirely to `Tray`.

#### 6. Fast local gate does not include `SpendRoutes.render.test.tsx`
- **Evidence:** Step 6 of the brief includes `PlanningRoutes.render.test.tsx` but not `SpendRoutes.render.test.tsx`, even though `app/spend/categories.tsx` is located under `app/spend/`.
- **Fix:** Add `SpendRoutes.render.test.tsx` to Step 6 of the brief.

---

## Reproduction and Verification Records

### 1. Kit Integrity Check
Command:
```bash
bash /Users/kunanonjarat/Developer/jotbun/.claude/skills/jotbun-controller/scripts/check_kit.sh /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t29-planner
```
Result:
```
kit p2-t29-planner against origin/claude/p1a-vault-core (e8de291d)
kit sums: 24 OK, 0 not OK (0 log lines skipped)
orig/: 3 files identical at the head
```

### 2. Fast Local Gate on Scratch Copy of Head (`a00fff7c`)
Under heavy lock (`/private/tmp/claude-501/jotbun-heavy.lock`):

1. **Typecheck:**
   - Command: `npm run typecheck:app`
   - Result: Exit 0, 0 errors.

2. **Focused Suites:**
   - Command: `npx vitest run --config vitest.render.config.ts src/wallet/categories/WalletCategories.render.test.tsx`
     Result: Exit 0, `13 passed (13)`.
   - Command: `npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/CategoriesScreen.render.test.tsx`
     Result: Exit 0, `56 passed (56)`.
   - Command: `node --test apps/app/src/wallet/copy/draftText.test.ts`
     Result: Exit 0, `tests 4, pass 4`.
   - Command: `npx vitest run --config vitest.render.config.ts src/screens/redesign/planning/PlanningRoutes.render.test.tsx`
     Result: Exit 0, `3 passed (3)`.

### 3. Routes Tests Check
Under heavy lock:
Command:
```bash
npx vitest run --config vitest.render.config.ts \
  src/screens/redesign/SpendRoutes.render.test.tsx \
  src/screens/redesign/account/AccountRoutes.render.test.tsx \
  src/screens/redesign/insights/InsightsRoutes.render.test.tsx \
  src/screens/redesign/planning/PlanningRoutes.render.test.tsx
```
Result:
```
Test Files  4 passed (4)
Tests  11 passed (11)
- SpendRoutes.render.test.tsx: 3 passed
- AccountRoutes.render.test.tsx: 2 passed
- InsightsRoutes.render.test.tsx: 3 passed
- PlanningRoutes.render.test.tsx: 3 passed
```
All routes tests loaded and passed cleanly. Lazy-loading in `app/spend/categories.tsx` prevents vitest module syntax collisions.

### 4. Mutants Rerun
Command:
```bash
python3 -I .../p2-t29-planner/tools/mutants.py <scratch> <logs> M1 M2 M4
```
Results:
- `M1: killed (killed) [OK] pack tray creates every missing item, not only picked ones`
- `M2: killed (killed) [OK] icon kept for account before Jotbun accepted category`
- `M4: killed (killed) [OK] private mode masking removed (amounts shown in tiles)`
All other mutants (M3, M5, M6, M7, M8, M9) also confirmed killed when rerun.

---

VERDICT: Needs fixes
