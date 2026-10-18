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
