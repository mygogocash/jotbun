# Redesign progress ("Bun diary")

Receipts for the [redesign plan](../superpowers/plans/2026-10-18-jotbun-redesign.md). The owner approved R0–R3 on 18 October 2026 with the recommended answers to D1–D11. Nothing new may need a package without the owner's say-so, and the E2 checkpoint shows simulator screenshots.

## R0: tokens, type scale and the redesign flag

- **Palette:** `src/theme/bunPalette.ts` holds light and "lavender night" dark.
  - It sits **beside** the inherited green palette instead of replacing it. Legacy screens and onboarding use the green, and some of their tests assert its exact hex values, so the green retires in R8 as the plan says.
  - Screens read the new palette through `useBunColors()` (ThemeProvider adds `bun` to the theme context, including `ThemePreferenceOverride`).
  - Every text pair the kit draws is listed in `BUN_TEXT_PAIRS` and held to WCAG AA by `bunPalette.test.ts`.
- **Contrast fixes found while checking the plan's palette:**
  - In light mode, only ink may sit on the lavender stage. Muted is 3.36:1 there, accent 2.71:1, green 2.45:1.
  - Under-budget green moved from #1F7A4D (4.40:1 on the page) to #1A6B43.
  - Accent moved from #7A5BE0 to #6A4BD4.
- **One test corrected during GREEN:** the first RED included "over and under differ by 1.5:1 in lightness". Both colours must also pass as text, which pins them to similar lightness, so the check now asks for a hue gap of at least 90°. Colour is never the only signal (WCAG 1.4.1): the budget components must say "over" or "left" in words, and their tests will assert that.
- **Type:** `src/theme/bunType.ts`.
  - The scale is 34/28/22/17/15/13/11.
  - Thai leading is 1.5× and Latin 1.3×.
  - Anuphan is used for Thai, DM Sans for English and Vietnamese.
  - Receipt amounts use the platform serif (Georgia on iOS, `serif` on Android), so no package is added (D4).
- **Contrast maths:** `src/theme/contrast.ts` implements WCAG 2.x.
- **Flag:** `isRedesignEnabled(area)` in `src/config/featureFlags.ts` reads `EXPO_PUBLIC_REDESIGN` (a comma list of areas, or `all`). It is off unless set.
- **Shared kit primitives:**
  - `src/ui/layout.ts`: spacing, radius, outline widths and the 44 pt touch size.
  - `src/ui/BunText.tsx`: the `variant` and `tone` props, with script chosen from the locale.
- **RED → GREEN:**
  - `npm run test:unit -w gogospend-app -- src/theme/bunPalette.test.ts src/theme/bunType.test.ts src/config/featureFlags.test.ts`. RED: 9 of 11 failed on assertions against placeholder seams; the 2 that held are "off by default" and "colours are #RRGGBB", both true of the placeholders. GREEN: 11 of 11.
  - `BunText.render.test.tsx`: 2 of 2.
- **App gate:** typecheck:app PASS, test:unit PASS (274 before the BunText test), test:render PASS (66).

## R2b: entry and data components

Built on `2e6bf6e`, in `src/ui/`. Nothing is routed and no existing screen changed. No package or lockfile change, and the locale catalogs are untouched.

- **Pure helpers (Node unit tests):**
  - `keypadExpression.ts`: the keypad's calculator.
    - Every operand is satang in BigInt, and the whole sum is kept as an exact fraction. It never uses a JS number.
    - × and ÷ bind tighter than + and −.
    - **Rounding:** the result is rounded once, at the end, half-up to the satang. Only ÷ (and × of two amounts with decimals) can land between satang, so 10 ÷ 3 gives ฿3.33 and 10 ÷ 3 × 3 gives exactly ฿10.00.
    - **Refused:** a third decimal, an operand or result above ฿999,999,999.99, a result below zero, and division by zero. A refused key leaves the sum as it was and sets `problem`.
    - **`000`:** on an empty amount it gives a single 0, and it is refused after a decimal point.
    - **`=` and save:** `=` shows the result; the next digit starts a new amount, and the next operator carries on from the result. `settleForSave` presses `=` for the user and drops a dangling operator ("65 +" saves 65).
  - `dateStep.ts`: steps ±1 day by pure Gregorian arithmetic.
    - It never goes past `today` or before `earliest` (default `TRACKING_START_MIN`).
    - Labels are "Today", "Yesterday" or "Thu 15 Oct", with the year only when it is not this year. Full dates and month headings are included.
    - Thai uses Buddhist-era years (2569).
    - The en/th/vi words are locale data in this file, like month names. They don't depend on the device's Intl data.
  - `budgetWords.ts`: the words for BudgetBar and PaceRing.
    - On track or tight: "฿420.00 a day left" and "On track · ฿6,000.00 left · 10 days to go".
    - Over: "฿120.00 over · 9 days to go" and "It happens. ฿18,120.00 of ฿18,000.00 spent."
    - No budget: "No budget this month".
    - Also the spoken sentence, the share spent (0–1000, capped) and the only colour allowed (`under`, `over` or none).
- **Components, one file each, with render tests** in en/th/vi × light/dark:
  - `Keypad`;
  - `TypeSwitch`;
  - `CategoryChips`;
  - `CategoryGrid`;
  - `WalletPicker`;
  - `DateChip`;
  - `NoteField`;
  - `RecordRow`;
  - `DayHeader`;
  - `BudgetBar`;
  - `PaceRing`.

  Support files:
  - `categoryIcons.tsx`: a line drawing for each of the 10 built-ins plus "transfer", and a coloured initial tile for user categories. No emoji.
  - `entryKitPrivate.tsx`: private pieces.
  - `entryKitTestHarness.tsx`: for tests only.
- **Accessibility:**
  - Roles: radio groups for type, category and wallet, buttons, a toolbar, `progressbar` with `aria-valuetext`, and a heading.
  - State uses `aria-checked`, `aria-selected`, `aria-expanded` and `aria-invalid`, which react-native-web writes and React Native reads.
  - Targets are at least 44 pt, and keypad keys at least 56 pt.
  - Thai labels carry the 1.5× leading, and the tests assert it per component.
  - The SVG drawings are hidden from screen readers; the words carry the meaning.
  - Motion comes only from `useSpringPop` (selection) and the sheet slide, and both stop under reduced motion. PaceRing doesn't animate.
- **Colour:**
  - Tokens only.
  - Red and green appear only in BudgetBar and PaceRing, always beside the state in words.
  - Errors are ink with a mark, never red.
  - One new text pair: the category tile's initial on the category's own pastel. It is `BUN_TILE_TEXT` (ink in light, onInk in dark) in `bunPalette.ts`, and `bunPalette.test.ts` checks it against every `CATEGORY_COLORS` hue in both modes.
- **Decisions:**
  - `DateChip` uses its own small calendar sheet, not `SpendDatePicker`. The picker draws its own "Date" heading and field as its trigger, can't be opened from another control, uses the legacy green palette, and has no earliest-date bound. The sheet reuses `spendCalendarWeeks`.
  - A day cell is about 41 pt wide at 320 pt, because 7 × 44 doesn't fit. The cells touch, so there are no dead gaps.
  - `RecordRow` offers long-press plus the accessibility actions menu, and no swipe: there is no gesture library and adding one needs a package. An action closes the bar.
  - `CategoryChips` keeps a category picked from More visible in place of the third chip.
- **For the integrator:**
  - `MoneyText` stands in for R2a's `Amount`, and `KitSheet` stands in for R2a's `Sheet`. Both are in `entryKitPrivate.tsx`, along with `KitError` and `Glyph`.
  - Render tests stub react-native-svg's `resolveAssetUri.web.js` in each file, the same way as R1.
- **New English strings** (they show in English in th/vi until E2):
  - Not in the catalogs (46): `Record type`, `Move`, `Keypad`, `Clear`, `Divided by`, `Times`, `Minus`, `Equals`, `Triple zero`, `Decimal point`, `More`, `More categories`, `Previous day`, `Next day`, `Choose a wallet`, `From: choose a wallet`, `To: choose a wallet`, `{name}, balance {amount}`, `From {name}, balance {amount}`, `To {name}, balance {amount}`, `Swap`, `Swap wallets`, `Move all`, `Move all {amount}`, `{count} of {max} characters`, `saving…`, `saving`, `checking…`, `checking`, `needs a look`, `Actions for {title}`, `Budget`, `{days} days to go`, `Last day`, `On track`, `Tight`, `a day left`, `{amount} a day left`, `left`, `{amount} left`, `over`, `{amount} over`, `spent`, `{amount} spent so far`, `No budget this month`, `It happens. {spent} of {limit} spent.`.
  - Thai only, with no Vietnamese: `Delete`, `From`, `To`, `Merchant`, `Transfer`, `Choose two different wallets`, and the two note/merchant limit messages.
- **RED → GREEN:**
  - **Unit** (`keypadExpression`, `dateStep`, `budgetWords`, `bunPalette`): RED was 38 of 44 failing on assertions against typed placeholder seams. The 6 that held were the 5 existing palette tests and "clear empties the keypad", which the do-nothing seam satisfies. GREEN: 44 of 44.
  - After GREEN, one test was added: the half-up rounding boundary (2.51 ÷ 2, 1.15 × 0.5, 0.29 × 0.5). The mutation check showed a rounded-float shortcut passing every other test.
  - **Render** (11 files): RED was 58 of 58 failing on assertions. GREEN: 58 of 58.
  - Changes to tests during GREEN:
    - Colours are compared with an rgb/rgba matcher, because react-native-web writes backgrounds as `rgba(…, 1.00)`.
    - The long-press test reopens the bar between actions.
    - The react-native-svg module mock was replaced by R1's resolver stub, at the coordinator's request, so the real SVG elements render.
- **Mutation checks** (restored afterwards):
  - A float shortcut in `evaluateKeypad` (Number arithmetic, `Math.round(total * 100)`) failed the half-up test. A truncating float variant failed 3 tests: half-up, "sums never drift" and "÷ rounds half-up".
  - `canStepForward` as `date <= today` failed "never steps into the future" and the DateChip render test "forward never passes today".
- **App gate:**
  - typecheck:app PASS;
  - test:unit PASS (314);
  - test:render PASS (126, 20 files);
  - export:web PASS;
  - `git diff --check` clean.
