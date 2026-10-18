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
