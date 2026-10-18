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

## R1: the Bun mascot

- **Files:** all in `src/mascot/`, plus one line in `app/_layout.tsx` (an import and `<BunIntensityProvider>` around the existing tree). Nothing is routed and no screen uses the bun yet.
  - `poses.ts`: the poses as plain data (`BUN_POSES`), `BUN_POSE_NAMES`, `DEFAULT_BUN_POSE`, `BUN_SIZES`, `BUN_OUTLINE_WIDTH`, `bunPaints(colors)` and `bunHeight`. It is `.ts`, not `.tsx`, so Node's runner can test the geometry and colours.
  - `Bun.tsx`, `BunPeek.tsx`, `SpeechBubble.tsx`.
  - `bunIntensity.ts` (pure), `bunIntensityStorage.ts`, `BunIntensityProvider.tsx` (`BunIntensityProvider`, `useBunIntensity()`).
  - Tests: `bunIntensity.test.ts`, `poses.test.ts`, `Bun.render.test.tsx`, `BunPeek.render.test.tsx`, `SpeechBubble.render.test.tsx`, with `mascotTestHarness.tsx` (the R0 providers plus `ThemePreferenceOverride` and browser storage).
- **Placeholder art:** a cream ellipse body with a 2.5-unit ink outline on a 64-unit-wide drawing, so 2.5 pt at 64 pt and scaled with the size (1.25 pt at `s`, 6.25 pt at `xl`). Feet, dot eyes with a glint, pink cheeks and a small smile, as in the app icon.
  - **Poses (12):**
    - `hello`: one arm waving.
    - `holding-receipt` (the default): the blue receipt with a folded corner and two cream lines, held in two hands.
    - `peek`: the top of the body and the eyes only; its view box cuts below the eyes.
    - `cheer`: both arms up, with pink and blue confetti.
    - `thinking`: eyes up, a hand at the chin, thought bubbles.
    - `sleepy`: closed eyes and "z z".
    - `oops-kind`: worried brows, a wobbly mouth that the tests forbid from turning into a frown, and a sweat drop. The cheeks stay.
    - `lock`: a blue padlock.
    - `box`: a blue box with a lid.
    - `magnifier`: a lens and handle.
    - `wave-bye`: happy closed eyes and the other arm waving.
    - `quiet`: smaller eyes and a short flat mouth, with no cheeks, arms, props or details.
  - **Data shape:** each pose is `{ viewBox, shapes }`. A shape is a circle, ellipse, rect or path.
    - Each shape has a `part` tag (`body`, `eye`, `eyeClosed`, `cheek`, `mouth`, `brow`, `arm`, `hand`, `receipt`, `prop`, `detail`, …).
    - Shapes name palette **roles** (`body`, `line`, `cheek`, `receipt`, `receiptLine`, `glint`, `none`), never colours. `bunPaints` maps the roles to `useBunColors()`, so `src/mascot/` contains no hex.
  - **Night colours:** the bun stays cream at night, as the icon does, so its lines use `ink` by day and `onInk` (the dark ground) by night. Night `ink` is near white and would erase the face.
    - `poses.test.ts` holds the face to 4.5:1 on the body.
    - It holds the silhouette (outline or body) to 3:1 on `background`, `stage` and `card`, in both themes.
- **Props:**
  - `Bun`:
    - `pose?: BunPoseName`, default `holding-receipt`;
    - `size?: 's' | 'm' | 'l' | 'xl'`: 32/56/96/160 pt wide, default `m`; the height follows the pose's view box;
    - `style?` and `testID?`;
    - either `decorative?: true` (the default) or `decorative: false` with a required `accessibilityLabel: string`. The types reject a label on a decorative bun and a non-decorative bun without one.
  - `BunPeek`:
    - `edge: 'top' | 'left' | 'right'`;
    - `pose?`, default `peek`;
    - `size?`, default `m`;
    - `align?: 'start' | 'center' | 'end'`, default `end` (16 pt from the corner);
    - `testID?`, and the same decorative/label pair.
  - `SpeechBubble`:
    - `fact: string`: one fact, already translated;
    - `highlight?: string`: its first match is drawn bold in `accent`;
    - `pose?`, default `holding-receipt`;
    - `style?` and `testID?`.
- **Accessibility:**
  - A decorative bun sets `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"` and `aria-hidden`. A labelled bun is one `accessible` element with the image role and its label.
  - The bubble's text is ordinary `BunText` and is read; the bun beside it is decorative. The doc comment on `SpeechBubble` says every fact must also appear elsewhere on the screen, because Quiet and Off never show a bubble.
  - Touch targets: none of the three components takes a touch. The peek's host has `pointerEvents: 'none'`, so it never blocks the control under it.
  - Copy: R1 adds no UI strings. Callers pass the bubble's fact and any bun label already through `tc()`. The locale catalogs are unchanged.
- **Intensity:** `'full' | 'quiet' | 'off'`, default `full`. A missing or damaged value reads as `full`.
  - **Storage:** stored like the theme preference, under its own key, `gogospend.bun.intensity`.
    - On web it uses browser storage, read synchronously for the first paint.
    - On native it uses the secure store, hydrated after mount.
  - `off`: `Bun`, `BunPeek` and `SpeechBubble` render nothing.
  - `quiet`: `SpeechBubble` renders nothing; `Bun` and `BunPeek` still render, because screens use them only on empty states.
  - `full`: everything renders.
  - Outside a provider, `useBunIntensity()` reads `full`, so a bun can be rendered on its own (for example in another component's test). Changing it there throws, rather than losing the choice silently.
- **Peek:** the host is absolutely positioned just outside the edge (`bottom: 100%`, `right: 100%` or `left: 100%`) and clips its content.
  - The parent lays out as if the peek were not there, and the bun never covers the parent.
  - On a side edge the bun turns ±90° so its top points away.
  - It slides out from behind the edge with `motion.spring.gentle` (no overshoot) and fades in.
  - **Reduced motion:** reuses `useReducedMotion` (`src/hooks/useReducedMotion.ts`) and `runSpringTransform` (`src/theme/animatedMotion.ts`), which snaps to the end under reduced motion.
  - `useReducedMotion` starts at `false` until the OS answers, so the peek also waits for one `AccessibilityInfo.isReduceMotionEnabled()` answer before it moves. Without that wait, a person who asked for less motion would see the first frames of the spring. The test checks that `Animated.spring` is never called under reduced motion.
- **RED → GREEN:** behavioural RED ran against compile-safe seams. They had the real types and wrong but typed output: default `off`, no parsing, empty poses, an unlabelled `View`, an in-flow peek and no bubble.
  - **Pure:** `npm run test:unit -w gogospend-app -- src/mascot/bunIntensity.test.ts src/mascot/poses.test.ts`. RED: 15 of 15 failed, all `ERR_ASSERTION`. GREEN: 15 of 15.
  - **Render:** `vitest run --config vitest.render.config.ts src/mascot`. RED: 18 of 19 failed, with no module errors:
    - 16 were assertion errors;
    - 2 were `TypeError`s from reading the `svg` and slide elements, which the stubs never drew;
    - the one that held, "quiet keeps the bun and the peek but drops the bubble", is true of the stubs.

    GREEN: 19 of 19.
- **Mutations:** 12 guards were mutated one at a time, with both mascot suites run each time. All 12 were caught, and every file was then restored.

  | Mutation | Caught by |
  | --- | --- |
  | `off` still shows the bun | pure intensity table; render "off renders no bun…" and the storage test |
  | `quiet` shows bubbles | pure intensity table; render "quiet keeps the bun…" |
  | parsing folds case and spaces | pure "only the three stored words parse" and "falls back to full" |
  | decorative bun loses `aria-hidden` | render "decorative bun is hidden", and the bubble test in light and dark (its bun must stay hidden) |
  | labelled bun loses its image role | render "labelled bun is exposed" |
  | peek host `relative` instead of `absolute` | all three edge layout tests |
  | peek host stops clipping | all three edge layout tests |
  | peek starts before the reduced-motion answer | render "pops in with a small spring" and "under reduced motion…" |
  | spring ignores reduced motion | render "under reduced motion…" |
  | night lines use night `ink` | pure "the face reads in light and dark" |
  | highlight drawn in `ink` | every bubble test (4 cases: light, dark, first match only, Thai) |
  | intensity change not saved | render storage test |
- **Gate:**
  - typecheck:app PASS;
  - test:unit PASS (289: 274 + 15);
  - test:render PASS (87 in 12 files: 68 + 19);
  - export:web PASS;
  - `git diff --check` clean.
- **Deviations:**
  - **SVG in render tests:** react-native-svg's web build imports `@react-native/assets-registry`, which React Native 0.87+ no longer ships and only Metro provides, so vitest cannot load it.
    - The mascot tests stub that one module (`resolveAssetUri.web.js`, used only for image `href`s). The real SVG elements still render and are asserted.
    - An alias in the shared `vitest.render.config.ts` would have been simpler, but that file is outside R1's files.
  - **Layout without a layout engine:** happy-dom does no layout, so the test for "the peek doesn't change the parent's layout" asserts two things:
    - the parent's style, classes and in-flow children are identical with and without the peek;
    - the peek is absolutely positioned outside the edge, clipped, and takes no touches.

    Real geometry is a device check.
  - **Bundle:** export:web compiles the provider and storage. `Bun`, `BunPeek` and `SpeechBubble` are not imported by any route yet, so they are not in the web bundle; the spend introduction already exercises react-native-svg on web.
  - **Extras:** `BunPeek` has `align`, `bunIntensity.ts` exports `showsBun`/`showsBubble`/`resolveBunIntensity`, and `Bun.tsx` exports `bunAccessibilityProps` so the native-only hiding props can be asserted.
  - **The pose tests encode placeholder geometry:** an ellipse body, the peek's cut, and raised hands above the top of the body. The final art will need those checks updated alongside it.
- **SKIPPED:**
  - **The final art (D2).** It replaces `BUN_POSES[name]` pose by pose: the `shapes`, and the `viewBox` where needed, at the same 64-unit width.
    - It must keep the pose names, the part tags and the palette roles, so night mode still works.
    - SVG files from an illustrator must be converted to this shape data (paths), or `Bun` must learn to draw them while keeping role-based colours.
  - **Device checks (E2):**
    - simulator screenshots in light and dark, in TH, EN and VI, at 320 pt;
    - VoiceOver and TalkBack on decorative and labelled buns and on the bubble;
    - the peek's geometry, spring and reduced motion on iOS and Android.

## R2a: surface and feedback components

- **Components** (`src/ui/`, one file per component, nothing routed):
  - `StageHeader` (with `MonthSwitcher`), `Card` and `OutlinedCard`, `ReceiptSlip` with `ReceiptRow` and `ReceiptTotal`, `Amount`, `PillButton`, `TabBar`, `Sheet` and `ConfirmSheet`, `EmptyState`, `SyncBanner`, `UndoBar`, `FlagChip`, `PromiseList` and `StagedProgress`.
  - Shared accessibility helpers live in `src/ui/a11y.ts`: decorative art, the polite live region, iOS announcements and moving focus.
  - Art is always a `ReactNode` slot. Nothing imports the mascot, and nothing imports `react-native-svg`.
- **Colours and text:**
  - Every colour comes from `useBunColors()`; there is no raw hex.
  - Every text pair was already in `BUN_TEXT_PAIRS`, so the list and its test are unchanged.
  - All text is `BunText`, so Thai gets Anuphan and its taller leading. Nothing fixes a height that holds text, and nothing clips with `numberOfLines`.
- **Money:** `Amount` formats through `formatMinor` only.
  - A type adds its sign: expense `−` (U+2212), income `+`, transfer none. An untyped negative keeps `formatMinor`'s `-฿65.00`.
  - Figures are tabular. `serif` uses `receiptAmount()`.
  - The state is a word: "saving…" or "needs a look".
  - The spoken label is in full, for example "Expense ฿65.00, saving".
- **Copy:** all English goes through `tc`, and the locale catalogs are untouched.
  - Strings that already exist resolve in Thai today: Close, Cancel, Undo, Previous and Next month, Failed, and SyncStatus's checking, review and upgrade lines, which `SyncBanner` reuses on purpose.
  - New strings fall back to English until E2 approval.
- **Decisions to confirm at E2:**
  - **`ConfirmSheet` destructive style.** Red is reserved for over budget, so a destructive confirm is the outlined pill and Cancel keeps the one ink fill. Weight, not colour, steers people away from the irreversible button.
  - **`OutlinedCard`** keeps the 2 pt ink outline with no fill, for the calm, dense screens. `Card` is cream.
  - **`UndoBar`** never auto-dismisses while a screen reader runs (WCAG 2.2.1). react-native-web always reports a screen reader, so on the web it waits for the person.
  - **The receipt's dotted rule** is a fully dotted box clipped to its top edge. iOS draws a one-sided dotted border solid. An SVG line would need every screen test to stub `react-native-svg`.
  - **`SyncBanner` states** are a union prop (`state` plus `count` or `action`). A zero count renders nothing.
- **Testing notes:**
  - Under vitest, react-native-web's Animated settles at once. So the motion tests watch which flights start: a spring from 48 for `Sheet`, fade and slide timings for `UndoBar`, and none at all under reduced motion.
  - happy-dom drops `font-variant`, so `Amount`'s test reads the requested figures through a stubbed text primitive.
  - Android's back button and Escape on the web both call `onRequestClose`. The test drives it with Escape.
- **RED → GREEN:** `npm run test:render -w gogospend-app -- src/ui`.
  - RED was run against typed stubs that compile and return the wrong output. 68 of 73 new tests failed, all on assertions (59 elements not found, 9 `AssertionError`), with no module or type errors.
  - The 5 that held are absence guards a do-nothing stub satisfies: the undo bar never steals focus, it waits without a time or with a screen reader, its timer stops on unmount, and an empty count shows no banner.
  - GREEN: 74 of 74. One test was added while green, the sheet's starting offset.
  - While green, three tests were corrected:
    - The receipt rule's check moved from a one-sided dotted border to the clipped dotted box, after the native finding above.
    - The two "never clips" checks now read `overflow-y`. react-native-web writes the longhand, so the old check passed vacuously.
    - The two slide tests now watch the requested flights, as described under testing notes.
- **Mutation check:** nine guards were mutated one at a time, each caught, and restored byte-identical. The script was `r2a-mutate.py`, kept in the scratchpad.

  | Mutation | Failing tests |
  | --- | --- |
  | Expense sign becomes a hyphen | Amount, 3 |
  | Saving state word dropped | Amount, 4 |
  | Sheet no longer moves focus on open | Sheet, 1 |
  | Sheet spring ignores reduced motion | Sheet, 1 |
  | A busy confirm sheet can be cancelled | Sheet, 1 |
  | Undo auto-dismiss ignores the screen reader | UndoBar, 1 |
  | Sync banner is not a live region | SyncBanner, 2 |
  | Tab loses its selected state | TabBar, 1 |
  | Pill shorter than 44 pt | PillButton, 1 |
- **App gate:** every step passed.
  - typecheck:app PASS.
  - test:unit PASS (274).
  - test:render PASS (142: 68 before, 74 new).
  - export:web PASS (`--max-workers 2`).
  - `git diff --check` clean.

## R2c: dev screen catalogue

- **What it is:** one route that renders every R2a component and the R1 mascot, a section at a time, with sample data. It needs no sign-in and no API, so the E2 screenshots can be taken in the simulator now.
- **Files:**
  - `app/dev/catalogue.tsx`: the route. Nothing else in `app/` changed.
  - `src/dev/catalogue/`:
    - `CatalogueScreen.tsx`: the header controls, the index and the section body;
    - `registry.tsx`: the sections, in order;
    - `kitSections.tsx` and `mascotSections.tsx`: what each section draws;
    - `params.ts`: the deep link;
    - `samples.ts`: sample data;
    - `parts.tsx`: shared layout pieces.
  - Tests:
    - `params.test.ts` (pure);
    - `CatalogueScreen.render.test.tsx` and `catalogueRoute.render.test.tsx`;
    - `catalogueTestHarness.tsx` and `safeAreaTestStub.tsx` (test use only).
  - No R0, R1 or R2a file, screen, locale catalog, package or lockfile changed.
- **Gate:** the route shows the catalogue only when `__DEV__ && isRedesignEnabled('catalogue')` (`EXPO_PUBLIC_REDESIGN=catalogue`, or `all`). Otherwise it shows "Not available", and a development build adds one line saying how to turn it on.
  - The catalogue is loaded with `if (__DEV__) require('@mobile/dev/catalogue/CatalogueScreen')`, never imported.
  - The route imports only a type from it, which is erased.
- **Deep link:** `gogospend://dev/catalogue?section=<id>&theme=<light|dark|system>&locale=<en|th|vi>`, for example `gogospend://dev/catalogue?section=receipt&theme=dark&locale=th`.
  - Scripted: `xcrun simctl openurl booted "gogospend://dev/catalogue?section=receipt&theme=dark&locale=th"`.
  - In Expo Go the same path follows `exp://<host>:8081/--/`.
  - Every param is optional:
    - With no `section`, the catalogue shows an index of every section.
    - An unknown section says so above the index.
    - With no `theme` or `locale`, it follows the app.
  - Case and surrounding spaces are ignored, and a repeated param takes its first value.
  - Values the app doesn't ship (a `jp` locale, a `sepia` theme) are ignored rather than guessed.
  - A new link while the catalogue is open replaces the header's choices.
- **Header controls:**
  - ‹ and › step through the sections in order and stop at the ends; ≡ returns to the index.
  - **Theme** (Light, Dark, System) uses `ThemePreferenceOverride`. The status bar follows it.
  - **Language** (EN, TH, VI) uses an `IntlProvider` around the catalogue only, which is how `useCopy`, `BunText` and `Amount` read the locale.
  - **Bun** (Full, Quiet, Off): see the deviations below.
  - The stored theme and language are never touched.
- **Sections (21).** Each fits one 402 × 874 pt screen with the header.

  | id | Shows |
  | --- | --- |
  | `amount` | sizes s to xl; income, transfer, untyped negative; receipt serif at l and xl |
  | `amount-states` | confirmed, saving, conflict (m and l); saving on the stage and on ink |
  | `pill-button` | primary and secondary: plain, busy, disabled (primary with a reason); full width |
  | `card` | `Card`, `OutlinedCard`, small padding |
  | `stage-header` | month switcher with the total, a card with a `BunPeek` against the stage; no-later-month header with the bun in its slot |
  | `receipt` | today's slip (rows, a saving row, total, footer); a record slip (category, date, note, amount) |
  | `tab-bar` | interactive selection, Budget selected, labels only |
  | `sheet` | buttons open a `Sheet`, a `ConfirmSheet` and a destructive `ConfirmSheet` with the quiet bun; confirming shows busy for 1.5 s, then closes |
  | `empty-state` | first run: `hello` bun at l, primary action |
  | `empty-state-card` | in an outlined card: `thinking` bun at m, secondary action |
  | `sync-banner` | offline; saving 1 and 3; checking 1 and 2 |
  | `sync-banner-review` | needs review, update needed and locked, each with an action; update without one |
  | `undo-bar` | a short and a long message |
  | `flag-chip` | warning and info, and on import rows |
  | `promise-list` | the plan's four privacy promises with icons; default ticks without a title |
  | `staged-progress` | in progress (done, active, waiting) and a failed stage |
  | `bun-m` | all 12 poses at m |
  | `bun-l-1`, `bun-l-2` | the 12 poses at l, 6 each |
  | `speech-bubble` | four bubbles (highlighted amount, cheer, oops-kind, no highlight) |
  | `bun-peek` | top edge (default and centred), right edge, left edge |

- **Sample data** (`samples.ts`):
  - Amounts come from `goldenSeed()`: the ฿182.00 lunch, ฿12,268.00 rent, ฿28,000.00 salary, the ฿1,500.00 move and both wallets' balances. The ฿65 coffee, ฿18,000 budget, ฿420 a day and ฿120 over come from the plan's own examples.
  - Words a person would type (wallet names, items, notes, a merchant) are given in each language, so Thai and Vietnamese script runs through every component.
  - Interface copy goes through `tc`, as on a screen. New strings therefore show in English under TH and VI until E2 approves copy for the catalogs, which is what the app would show today. That copy (for example the promise list) is sample copy, not approved copy.
- **Fit on one screen:** happy-dom has no layout, so this was measured in a browser.
  - Method: `expo start --web` with the flag on, at 402 × 874, adding iPhone 17 Pro insets (62 pt top, 34 pt bottom) to the measured header and body.
  - Every section fits in EN, TH and VI. The tallest is the Thai receipt at 841 pt; EN and VI peak at 805 pt.
  - The first cut had `empty-state` at 928 pt (949 pt in Thai), so it was split in two, and long titles were shortened to keep the header on one line.
  - The simulator itself was not run (see SKIPPED).
- **RED → GREEN:** RED ran against compile-safe seams with the real types and wrong output: an empty registry, a parser that returns nulls, a screen and a route that render nothing.
  - **Pure:** `npm run test:unit -w gogospend-app -- src/dev/catalogue/params.test.ts`.
    - RED: 4 of 5 failed, all `ERR_ASSERTION`. The one that held, "missing params leave the defaults", is true of an all-null stub.
    - GREEN: 5 of 5.
  - **Render:** `vitest run --config vitest.render.config.ts src/dev`.
    - RED: 35 of 35 failed, with no module errors:
      - 21 were assertion errors;
      - 13 were elements not found;
      - 1 was a `TypeError` from stepping an empty registry.
    - GREEN: 36 of 36. One case was added while green, for the split-off `empty-state-card`.
  - **What the render tests check:**
    - Every registered section, including any added later, renders in light and dark, in EN, TH and VI (126 renders), with no `console.error`. Each section's own content is asserted, for example 12 bun SVGs at 56 pt in `bun-m`.
    - The flag off (unset, empty, `core`, a misspelling) shows "Not available" and never loads the catalogue.
    - A release build (`__DEV__` false) never loads it, even with the flag on.
    - A development build with the flag on requests exactly the catalogue module and opens the deep-linked section.
    - The deep link selects the section, theme and locale.
    - The index, previous and next, and the controls work.
    - The bun control previews Full, Quiet and Off and restores the setting on leave.
    - Every sheet opens and closes, and a confirm shows busy and then closes.
- **Mutations:** 12 guards were mutated one at a time. All 12 were caught, and every file was restored byte-identical. The script is `r2c-mutate.py` in the scratchpad.

  | Mutation | Caught by |
  | --- | --- |
  | route ignores the flag | route, flag off |
  | route loads outside `__DEV__` | route, release build |
  | route requires another path | route, development build |
  | deep-link theme ignored | 24 tests |
  | deep-link locale ignored | 24 tests |
  | no `IntlProvider` override | 23 tests |
  | no `ThemePreferenceOverride` | 23 tests |
  | a new link does not replace the choices | 2 tests |
  | bun setting not restored on leave | the bun control test |
  | next not disabled at the last section | the stepping test |
  | params keep their case | pure, hand-typed links |
  | Thai sample data in English | the deep-link test |

- **Production-bundle check:** PASS. The catalogue, its samples and the fakes are not in a release bundle.
  - **Default flag:** `npm run export:web -w gogospend-app -- --max-workers 2`, then `grep -rlF` over `dist`.
    - Not found: `catalogue-section-`, "Screen catalogue", "Open a delete confirm", "Bun poses at m", "Previous section", the sample note "Lunch with Mai at the market", goldenSeed's "September salary" and its record id `0000000b-…-000000000003`, the dev hint `EXPO_PUBLIC_REDESIGN=catalogue`, and the module path `dev/catalogue/CatalogueScreen`.
    - Found once: "Not available".
  - **The route's chunk:** `catalogue-<hash>.js` is 830 bytes.
    - Metro folded the loader to `(isRedesignEnabled('catalogue'), null)` and the dev hint to `null`.
    - Its seven dependencies are expo-router, `View`, the flags, `useCopy`, `Text`, the theme and the JSX runtime.
  - **Flag on** (`EXPO_PUBLIC_REDESIGN=all`, production): the same result, and a byte-identical route chunk.
  - **Positive control:** a development export (`--dev`, flag on) contains every one of those strings except the Thai sample, which the dev bundle writes as `\u` escapes. So the search would have found them.
- **App gate:** every step passed.
  - typecheck:app PASS.
  - test:unit PASS (294: 289 before, 5 new).
  - test:render PASS (197 in 27 files: 161 before, 36 new).
  - export:web PASS (`--max-workers 2`).
  - `git diff --check` clean.
- **Deviations:**
  - **Bun intensity control:** R1 has no subtree override for the intensity; its context isn't exported, and R1's files were out of bounds. So the Bun control calls the app's own `setIntensity`.
    - It changes the real, stored setting while the catalogue is open, and puts back the value the person had when the catalogue closes.
    - If the app is killed while the catalogue is open, the preview value stays.
    - For that reason there is no `bun` deep-link param.
    - A small `BunIntensityOverride` in `BunIntensityProvider.tsx` would make it a pure preview.
  - **More sections than components:** 21 sections, not one per component. `Amount`, `SyncBanner`, `EmptyState` and the l poses each needed two screens, and `Card`/`OutlinedCard` got a section too.
  - **The route test answers one `require` itself.** vitest hands modules Node's own `require`, which can't load TSX. The route test therefore patches Node's loader for that one request, returning the module vitest already loaded, and records every request so a wrong path fails.
  - **Safe-area stub:** the catalogue tests replace `react-native-safe-area-context` with a small context-backed stub (`safeAreaTestStub.tsx`), because the real package loads React Native itself under vitest. The kit's own tests mock only `useSafeAreaInsets`; the catalogue also uses `SafeAreaInsetsContext`, to give mid-page stage headers and tab bars zero insets.
  - **Test fakes in a dev screen:** `samples.ts` imports `goldenSeed` from `fakeResources.ts`, whose header says "Test use only". That is development only, and the bundle check shows it never ships.
- **Findings for the R2a owner (not fixed here):**
  - **Web:** react-native-web's `Modal` adds its own unnamed `role="dialog" aria-modal` container. On the web, a `Sheet` is therefore a named dialog inside an unnamed one. Native is unaffected.
  - Tests that query `getByRole('dialog')` without a name see two dialogs.
- **Slots for later work:** add one entry to `CATALOGUE_SECTIONS` per section (`registry.tsx` lists them as comments).
  - **R2b** (group `Kit`): `keypad`, `type-switch`, `category-chips`, `category-grid`, `wallet-picker`, `date-chip`, `note-field`, `record-row`, `day-header`, `budget-bar`, `pace-ring`.
  - **R3** (group `Screens`), one entry per §6.1 state:
    - Home: loading, first run, no budget, offline or saving, over budget, upgrade required, terms required, signed out, diary locked.
    - Quick add: saving, saved, queued offline, validation, opening balance needed, move.
    - History, and record detail with its conflict view.
  - The every-section render test covers new entries automatically. Content checks go in its `SHOWS` table.
- **SKIPPED:**
  - **Simulator screenshots (E2):** each section in light and dark, in TH, EN and VI.
  - **One-screen fit on iOS:** checked on web only. Real iOS font metrics may differ slightly from web; the tightest section has 33 pt to spare.
