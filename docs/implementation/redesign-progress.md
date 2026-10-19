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

## R3 logic: screen view models

Pure view models for Home, Quick add, History and Record detail in `src/spend/v1/redesign/`. They contain no React or React Native code, and no screen uses them yet. The R3 screen agents call them next. Money is BigInt over canonical satang strings, and dates are Bangkok calendar dates. English copy is `tc()` source text: either a `Translate` parameter, as in `viewModels.ts`, or `{ text, values }` lines for `useCopyLine()`. The locale catalogs are unchanged.

- **`shared.ts`:**
  - Bangkok date maths, and day labels ("Today", "Yesterday", then the current list's short date; Thai dates use `th-TH`).
  - The draft-state mapping, the same as the current Home's money groups:
    - unsent and sending show as "Saving…";
    - uncertain shows as "Checking with Jotbun";
    - needs_review shows as "Needs a look";
    - paused_upgrade shows as "Update Jotbun to send".
  - Undo is allowed only while a draft was never transmitted; discard only when it needs review.
  - Diary rows read word for word like `recordView`, which a test checks.
  - Day groups show confirmed money out and in, with waiting and checking draft money kept apart. A transfer counts as neither in nor out, and a refused draft counts nowhere.
- **`budgetPace.ts`:**
  - spent, limit and left, plus days left (counting today) and left per day (rounded down to whole satang);
  - the states `on_track`, `tight`, `over` and `no_budget`, and a state for each category limit;
  - **Tight threshold:** spending is more than 110% of the even pace through the end of today, compared in exact integers (`spent × days × 100 > limit × elapsed × 110`). After the month ends, nothing is tight.
  - **Pending money:** waiting expense drafts are added to an estimate and listed separately. Drafts being checked are never added, because the server may already count them. Refused drafts never count.
  - **Copy:** kind and factual, for example "฿9.04 a day left · a bit ahead of pace", "฿0.01 over · 16 days to go" and "It happens."
- **`homeModel.ts`:**
  - loading;
  - `classifyLoadProblem`, which gives the same messages and retry rule as `loadProblem()`;
  - offline with the device's drafts by day, waiting money and Add;
  - the first wallet;
  - ready: the pace card, today's receipt (empty but present when nothing is logged), earlier days, wallet balances, and the draft counts for the SyncBanner.
  - Drafts show only from an open diary, as the current Home does.
- **`historyModel.ts`:**
  - **Days:** a month's day groups, with drafts merged into their days. A draft already confirmed shows once.
  - **Filters:** type, wallet (a transfer matches on either side) and category.
  - **Search:**
    - It covers the category name as shown, the merchant and the note.
    - Text is folded with NFKC, then a locale-free lower case, then NFC. Width and case don't matter, the canonical order of Thai marks is fixed, and sara am matches nikhahit plus sara aa. Marks are never stripped.
    - The summary reads like "1 entry, ฿120.00 out". It counts drafts apart and says when not every page is loaded yet.
- **`recordModel.ts`:**
  - The receipt rows.
  - **The edit draft:** it keeps the original record and `baseVersion`. Changes are measured against the original, so untouched fields are never sent. "Apply my change" (`rebaseEdit`) resends the same changes on the server's version, as `TransactionsScreen` does.
  - **Copy:** a new draft with new ids, dated today. It refuses a reused id. A closed wallet or category is left unchosen.
  - **Conflict rows:** "yours" against "on the server". Each row marks whether you changed the field and whether applying your change would replace what is on the server.
- **`recentCategories.ts`:** ranks recent use over the last 60 days. Each use weighs 60 minus its age in days. Ties go to the built-in order, then the label, then the id. Archived categories are excluded, deleted records are ignored, and a draft already confirmed counts once. The rest keeps the stable default order.
- **`quickAddModel.ts`:**
  - **Checks:** `checkEntryFields` runs every check in `AddTransactionScreen.build()`, with the same keys and messages. Its one addition is `wallet_id` ("Choose a wallet"), for a prefilled draft whose wallet is gone; the form already renders that key.
  - **Builder:** `buildQuickAdd` gives the create input and the device entry.
  - **Id rules:** one record id and one command id per draft, as documented in the module header. "Add another" and Copy always take new ids.
- **RED → GREEN:** `npm run test:unit -w gogospend-app -- src/spend/v1/redesign/*.test.ts`.
  - **RED:** 67 of 68 failed against typed stub seams. 65 failed on assertions, and 2 on reading the rows of a day group the stubs never produced. The one that held is the copy scan for shaming words, which empty stub copy passes trivially.
  - **GREEN:** 68 of 68.
- **Mutation check (each one restored afterwards):**

  | Mutation | Tests that failed |
  | --- | --- |
  | Per-day pace rounded up instead of down | 4 |
  | `sending` shown as "checking" (the old per-draft label) | 4 |
  | A `needs_review` draft counted as waiting money | 6 |
  | A move allowed with the same wallet twice | 4 |

- **Parity table:** quick add is compared with a transcription of the current form's `build()` over 6 entry shapes, 10 amounts, 7 dates, 8 notes and 6 merchants (708 rows). Errors match exactly, and accepted inputs match JSON byte for byte, because `keys.keyFor` compares JSON. A too-precise amount such as `1.234` has no keypad form, so it is left out.
- **Gap: Recently deleted.** No existing API lists deleted records.
  - `/v1/history` filters `deleted_at IS NULL`, and `DiaryView` exposes no records.
  - The device diary does hold deleted transaction snapshots from sync.
  - `recentlyDeletedModel` takes whatever deleted records the caller has and applies the server's restore rule (`deleted_at >= now − 30 days`). `RECENTLY_DELETED_GAP` records what is missing. Exposing the diary's deleted snapshots, or adding a server listing, needs a separate change.
- **New English source strings:** "Saving…", "Needs a look", the pace lines, the search summaries, "Choose a wallet", the restore countdown and the conflict labels. They fall back to English until the catalogs are updated after E2.
- **App gate:** typecheck:app PASS, test:unit PASS (342 = 274 + 68), test:render PASS (68), `git diff --check` clean.

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

## R2 unification

Built on `d86001c`, after R2a, R2b, R1 and R3 logic were merged.

- **What changed:** `src/ui/`, `src/testing/` and `vitest.render.config.ts`; the three R1 render tests lost their stubs; and `spend/v1/redesign/shared.ts` gained a doc comment.
- **What did not:** no screen or route, no package and no lockfile. Every public kit export still imports from its old path; only the private `entryKitPrivate.tsx` is gone. No existing render test changed except for the removed per-file stubs.
- **R2b's private parts:** `entryKitPrivate.tsx` is deleted.

  | R2b private part | Now |
  | --- | --- |
  | `MoneyText` | `AmountText` in `Amount.tsx`. It draws money in tabular figures, and `Amount` now draws its own number through it. R2b components get the text from `useAmountWords()(minor).shown`; untyped, that is exactly `formatMinor`. They keep their own signs and spoken labels (see findings 2 and 3). |
  | `useMoneyLocale` | Exported from `Amount.tsx`, and `useAmountWords` uses it. BudgetBar and PaceRing pass it to `budgetWords`. |
  | `useDateLocale` | `useActiveLocale()`. `DateLocale` is the same three locales. |
  | `Decorative` | `<View {...DECORATIVE}>` from `a11y.ts`, as R2a does it. |
  | `Glyph` | `src/ui/Glyph.tsx`: `Glyph`, `GlyphName` and `GlyphProps`. The unused `arrow-right` is dropped. |
  | `KitError` | `src/ui/FieldError.tsx`: `FieldError`, with the same alert role, polite reading, ink words and hidden mark. |
  | `KitSheet` | **Not replaced; see finding 1.** It is now `CalendarSheet`, private to `DateChip.tsx`. Its backdrop comes from `sheetBackdrop.ts`, which `Sheet` uses too. |

  New exports: `AmountText`, `AmountTextProps` and `useMoneyLocale` (`Amount.tsx`), `Glyph`, `FieldError`, `sheetBackdrop` and `SHEET_BACKDROP_OPACITY`, and `toKitPace`.
- **The SVG asset-registry stub:**
  - **Alias:** one alias in `vitest.render.config.ts` maps `@react-native/assets-registry/registry` to `src/testing/svgAssetRegistryStub.ts`, a registry with no assets.
  - **Why the registry, not the resolver:** that is the module vitest cannot load, so the real `resolveAssetUri` now runs. A link `href` resolves, and a bundled asset id throws "could not be found" instead of passing quietly.
  - **Per-file stubs removed:** the 14 `vi.mock(…resolveAssetUri.web.js)` stubs are gone, 11 in R2b and 3 in R1. A branch that still has one keeps working; it is just redundant now.
  - **Kept out of the app bundle:**
    - Only the test config names the stub, and Metro resolves the registry itself.
    - `svgAssetRegistryStub.test.ts` fails if any file under `src/` or `app/` imports the stub. A mutation check confirmed it.
    - After `export:web`, the bundle's `getAssetByID` is Expo's registry, and no part of the stub appears in it.
- **The pace adapter:** `toKitPace(pace)` is in `src/ui/paceAdapter.ts`. It takes the logic's `BudgetPace` from `budgetPace()` and returns the kit's `BudgetPace`, ready for BudgetBar and PaceRing. It only picks fields; its one change is the sign of the over amount.
  - **State:** the same four words.
  - **Spent:** `spent.estimatedMinor`, which is confirmed spending plus expense drafts waiting to sync. Drafts being checked and drafts that need a look are left out. State, left and per day are decided on the same figure, so the words and the colour always agree. Screens show `paceCopy().pendingNote` and `checkingNote` beside the bar.
  - **Limit:** passed through; null without a budget.
  - **Left:** the logic's `leftMinor` while not over. When over, it is minus `overByMinor`, so the kit says the logic's own over amount, even for a pace whose left reads zero. Null without a budget.
  - **Per day and days left:** passed through. Per day is rounded down, `'0'` at exactly zero left, and null when over, after the month or without a budget. Days left counts today.
  - **Phases:** the kit has none.
    - `before`: the whole month is left, so it reads like the first day.
    - `after`: no days left and no per day, so it reads "฿X left" or "฿X over" with no days line. The logic never calls a finished month tight.
  - **Tests:** 10, built from real `budgetPace()` output. They cover on track, tight, pending money, zero spent, zero left, over by one satang, over with left reading zero, no budget, the last day, before and after.
- **Day labels:** both helpers stay.
  - **Screens draw with `src/ui/dateStep.ts`:** `dayLabel` and `fullDateLabel`, through DayHeader and DateChip. Its words are locale data, so they read the same on every phone, Vietnamese has its own, and the chip and the history headers agree.
  - **The view models keep `spend/v1/redesign/shared.ts`'s `dayLabel`:** it is used through `Intl`, with en-GB for Vietnamese, for `DayGroup.label` and its spoken summary, and those are not drawn.
  - Both doc comments now say this.
- **Accessibility and colour pass (`src/ui/`):**
  - **Raw hex:** none outside the palette. Category pastels arrive as data, from `CATEGORY_COLORS`.
  - **Text pairs:** every text tone was checked against its ground, in both modes.
    - Each pair is in `BUN_TEXT_PAIRS`, plus `BUN_TILE_TEXT` on category pastels, so the list did not change.
    - No muted, accent or state colour text sits on the stage.
    - Disabled controls fade with opacity. WCAG 1.4.3 exempts them.
  - **Roles and labels:** every control has a role and a label. The exceptions are findings 1, 5 and 6.
  - **Fixed:**
    - The chosen segment, category chip, category grid cell and calendar day were marked by fill alone. Their labels are now bold as well, as TabBar already did.
    - The calendar's weekday initials were hidden on the web only. They now use `DECORATIVE`, so native screen readers skip them too.
    - At night, the calendar's backdrop was a 35% veil of near-white ink. It now dims like `Sheet`'s.
    - VoiceOver's escape gesture now closes the calendar.
- **Tests added:** unit +12 (`paceAdapter.test.ts` 10, `svgAssetRegistryStub.test.ts` 2) and render +7 (`svgAssetRegistryStub.render.test.tsx` 3, `kitUnification.render.test.tsx` 4).
  - The alias test has no per-file stub. It renders a kit glyph and the bun as real SVG, and proves that the real resolver runs.
- **Mutation check:** each mutation was made one at a time and restored (`r2u-mutate.py`, in the scratchpad). All 10 were caught.

  | Mutation | Caught by |
  | --- | --- |
  | TypeSwitch, CategoryChips or calendar choice not bold (3 mutations) | `kitUnification`, 1 test each |
  | The calendar backdrop is a light veil at night | `kitUnification`, 2 tests |
  | Glyph exposed to screen readers | `kitUnification` (field error mark) |
  | `AmountText` drops tabular figures | `Amount`, 1 test |
  | Adapter: spent from confirmed only | adapter, 2 tests |
  | Adapter: left passed through when over | adapter, 1 test |
  | Adapter: per day dropped | adapter, 6 tests |
  | Alias removed | the alias render file fails to load |
- **Findings reported, not fixed:**
  1. **`Sheet` is two dialogs on the web.**
     - **The problem:** react-native-web's `Modal` gives its full-screen layer `role="dialog"` once it has shown. `Sheet` shows at once, so it reads as an unnamed dialog around its own named one. That fails "every role has a name".
     - **Why DateChip can't move to `Sheet` yet:** DateChip's tests query `getByRole('dialog')` without a name and expect one dialog. `CalendarSheet` nests the same way in a browser once its slide ends; it passes only because happy-dom never ends a CSS animation.
     - **Fix A:** name the dialog in those two DateChip queries, then switch DateChip to `Sheet`.
     - **Fix B:** give the name to the Modal's layer on the web and drop the inner role there. That changes `Sheet`'s own tests, which read the cream panel as the named dialog.
  2. **Two minus signs.** `Amount` signs an expense with U+2212 (−). RecordRow and DayHeader use a hyphen (-), and the tests pin both. Choose one at E2.
  3. **Two ways to say "Expense ฿65.00".**
     - `Amount` speaks `tc('Expense {amount}')`, which is not in the catalogs, so Thai hears English.
     - RecordRow speaks `` `${tc('Expense')} ${amount}` ``, which is in Thai today.
     - Pick one form when the catalogs are updated.
  4. **Two icon styles.** R2a draws glyphs as text (× ‹ › + ✓ !), R2b as vectors (`Glyph`). StageHeader's month arrows are text, and DateChip's day arrows are vector chevrons. This is a design decision.
  5. **The calendar's chosen day uses `aria-selected` on a button.** ARIA ignores that on the web; native readers do say "selected". It needs grid and gridcell semantics, or `aria-pressed`. The tests pin `aria-selected`.
  6. **RecordRow's long-press actions have no keyboard path on the web.** Accessibility actions are native only. A row given only actions, with no `onPress`, has a label but no role.
  7. **A finished month reads "On track".** The kit's `BudgetPace` has no phase. For a past month, screens should show `paceCopy().headline` ("฿X left this month"), or the kit needs a phase.
  8. **`CalendarSheet` does not pad the bottom safe area,** as `KitSheet` never did. That goes away with the move to `Sheet`.
  9. **Dates in two styles.** The record receipt's date row comes from `recordModel`'s `longDateLabel` (Intl, en-GB for Vietnamese), while headers and the chip use `dateStep` (with Vietnamese words). In Vietnamese, the same date reads two ways across screens.
- **Gate** (from the worktree root):

  | Step | Before (`d86001c`) | After |
  | --- | --- | --- |
  | typecheck:app | PASS | PASS |
  | test:unit | PASS, 397 | PASS, 409 |
  | test:render | PASS, 219 in 36 files | PASS, 226 in 38 files |
  | export:web (`--max-workers 2`) | PASS | PASS |
  | `git diff --check` | clean | clean |

## R3: Home and navigation shell

Built on `d86001c`. Behind `isRedesignEnabled('core')`: with the flag off, the routes, the layout and the current screens are exactly as before, and their tests are untouched. No package or lockfile change, the locale catalogs are untouched, and no text pair was added.

- **Files:**
  - `src/screens/redesign/HomeScreen.tsx`: the redesigned Home, on `homeModel()`.
  - `src/screens/redesign/SpendTabShell.tsx`: the tab shell and `spendTab(pathname)`.
  - `app/spend/_layout.tsx`: wraps the screens in the shell only under the flag. The auth redirect and the legacy branch are unchanged.
  - `app/spend/index.tsx`: legacy flag first, then the new Home under the flag (inside the same `SpendV1Provider`), else the v1 Home.
  - Tests: `src/screens/redesign/HomeScreen.render.test.tsx` (34) and `SpendLayout.render.test.tsx` (14).
- **Home, ready:**
  - **Stage:** the month as the title ("September 2026", "กันยายน 2569", "Tháng 9 năm 2026"), then the month's **confirmed** spending, against the budget when there is one ("฿12,450.00 of ฿18,000.00"). Under it come the month's "Waiting to sync: …" and "Checking with Jotbun: …" lines, in ink, the only tone allowed on the stage.
  - **Pace:** a `PaceRing` card, "This month". The ring shows the logic's estimate (confirmed plus waiting) and says so ("Includes ฿70.00 saving on this device", "฿9.00 more is being checked with Jotbun").
  - **No budget:** the ring is left out, with one quiet line ("Set a monthly budget to see what's left each day") and no action, which comes in R4.
  - **Today's receipt:** a `ReceiptSlip` with a `RecordRow` per record or draft, then `ReceiptTotal`s for the day's confirmed money out (and money in, when any), then the day's draft money on its own lines. An empty today says "Nothing logged today yet" with a secondary Add an entry.
  - **Earlier days:** up to 5, each a `DayHeader` with confirmed totals, its draft lines and its rows.
  - **Wallets:** the total and each balance. An archived wallet says "Archived" in words, not only in a muted colour.
  - **See all entries:** a secondary pill.
  - **Rows:** a record opens `/spend/record/<id>`. A draft is not a record yet, so it does not.
- **Loading:**
  - Today's records are read across every page (up to 20 × 200), so the receipt's total is never a partial sum.
  - Earlier days come from one 50-record page cut back to whole days: when more pages follow, the oldest day on the page is left out rather than shown with a partial total.
  - Confirmed money reloads in place when a draft resolves, as on the current Home.
- **Drafts:** inline with their state ("saving…", "checking…", "needs a look"). Remove appears only for a draft never sent, Discard only for one that needs review, with the same labels as today ("Remove Food ฿65.00").
- **Sync:** one `SyncBanner` per state:
  - **offline:** a network load failure with an open diary, or sync backing off with entries waiting. Retry is a secondary pill beside it, because the banner's offline state takes no action.
  - **saving:** unsent and sending drafts.
  - **checking:** uncertain drafts.
  - **needs_review:** its action, Review, opens a `Sheet` listing those drafts with Discard.
  - **paused_upgrade.**
  - **locked:** its reason follows in `SyncStatus`'s words.

  The `SyncStatus` news the kit has no state for is said in its existing words as a polite live region: sync paused, terms needed to send, sign in again to send, getting the full diary, "Syncing 1 of 3". Without a diary (the web) nothing claims to be offline.
- **Load problems:** each kind has its own card and heading: "Update Jotbun", "Updated terms", "Signed out", "Use the Jotbun app" and "Diary not loaded". The messages and the retry rule are `classifyLoadProblem`'s, and only a plain failure has Try again. With an open diary, the device's drafts by day, the waiting money and Add (when the device has wallets) still show; the offline receipt's footer reads "Saved on this device".
- **Locked diary:** the banner and the reason. Its drafts are hidden. Start over appears only for `key_missing`, `key_rejected` and `wrong_account`, and only after a destructive `ConfirmSheet` (the existing copy; Keep it keeps the ink fill).
- **First run:**
  - An `EmptyState` with the `hello` bun and the action "Add a wallet". The action opens the form, so each view has one primary.
  - **Form fields:**
    - a NoteField-style name field;
    - an opening balance (zero by default and allowed, parsed by `parseAmountInput` so Thai digits work, with the exact amount previewed under it);
    - a `DateChip` tracking start, which cannot pass today.
  - **Rules kept from `FirstWallet`:** the same errors, `validateTrackingStart`, the server field mapping (`name`, `tracking_start`) and one command key per payload. A definite refusal settles the key. An unconfirmed save freezes the form and resends the same command. `isOwnCreate` counts as created, and the device diary is asked to sync.
- **The bun:**
  - At Full, the stage peek (`peek`, turning `oops-kind` when over budget) and the first-run `hello`.
  - At Quiet, the first-run `hello` only, which is an empty state.
  - At Off, none.
  - Every bun is decorative; the facts are in words.
  - The peek sits in `StageHeader`'s bun slot on a zero-height anchor, so it slides up from the slot's lower edge and keeps its own box.
- **Shell:**
  - **Bar:** the kit `TabBar` sits as a row under the screen: Home (`/spend`), the centre add (`/spend/add`), then History (`/spend/all`). Insights joins in R5 (D7).
  - **Navigation:** tabs use `router.navigate`, and re-selecting the active tab does nothing. Add uses `router.push`.
  - **Where it shows:** hidden on `/spend/add…` and `/spend/record…`; shown with no tab selected elsewhere, for example `/spend/import`.
  - **Icons:** small line drawings in the tab's own colour.
- **Accessibility:**
  - Headings for the stage, sections, days and problems.
  - Rows speak their state ("Food, Expense ฿65.00, saving, Cash").
  - Totals speak their type ("Money out, Expense ฿120.00").
  - Polite live regions for sync, and alerts for problems.
  - Every control is at least 44 pt.
  - Errors are ink with a mark, never red.
- **Text pairs:** none new. A render check walks every visible text node on the Home and on its open sheets. It asserts that the colour and its nearest ground are a `BUN_TEXT_PAIRS` pair with at least 4.5:1, in light and dark: ready in en/th/vi, first run with errors, offline, a problem with a locked diary and its confirm sheet, and over budget with the review sheet.
- **RED → GREEN:**
  - **RED:** `vitest run --config vitest.render.config.ts src/screens/redesign`, against typed seams (a `HomeScreen` that renders nothing, a shell that draws no bar and a `spendTab` that says hidden) with the route and layout unwired. 39 of 46 failed: 38 because an element was not found, and 1 `AssertionError` (`spendTab`). There were no module or type errors. The 7 that held are the flag-off, hidden-route, legacy-first and auth-redirect guards, which the unchanged layout already satisfies.
  - **GREEN:** 46 of 46.
  - **One test corrected:** its expected total balance had ignored today's ฿120.00 lunch from Cash, so ฿21,050.00 became ฿20,930.00.
  - **Two tests added while green:** today's total across two pages (201 records, ฿203.01), and the page-split earlier day being left out. That makes 48.
- **Mutation check:** 18 guards were mutated one at a time with `r3h-mutate.py` (in the scratchpad). All 18 were caught, and every file was restored.

  | Mutation | Failing tests |
  | --- | --- |
  | Stage total includes waiting drafts | 7 |
  | A draft opens the record screen | 1 |
  | Remove offered for any draft | 1 |
  | Offline claimed without a diary | 1 |
  | Quiet keeps the stage bun | 1 |
  | Over budget keeps the plain peek | 2 |
  | A page-split earlier day kept | 1 |
  | Today's records read from one page only | 1 |
  | Start over without confirming | 3 |
  | An unconfirmed wallet not frozen | 1 |
  | `isOwnCreate` treated as a failure | 1 |
  | Muted text on the stage | 8 |
  | "Update to send" row looks confirmed | 1 |
  | Needs review counted as checking | 1 |
  | Tab bar shown on Add | 2 |
  | Re-selecting the active tab navigates | 1 |
  | Flag-off layout gets the shell | 1 |
  | Redesign checked before legacy | 1 |

- **Deviations:**
  - **The stage shows confirmed spending, not `paceCopy().total`.** The logic's total is the estimate including waiting drafts. The current Home never mixes waiting money into confirmed money, so the stage keeps them apart, and only the ring (which says so) uses the estimate. The same `{spent} of {limit}` and `{spent} spent this month` copy is used.
  - **First run is two steps.** `EmptyState` always draws its action as the view's primary.
  - **The name field is local, in NoteField's style.** `NoteField` applies note and merchant limits and a counter. Errors use a local ink mark, because `KitError` is private to the kit.
  - **The opening balance is a text field with an exact preview,** not the `Keypad`.
  - **The stage peek is anchored in the bun slot.** `StageHeader` has no peek slot of its own.
- **Kit gaps, reported and not changed:**
  - `RecordRow` has no "update to send" state. Those rows show "saving…" (they are waiting on the device), with "Update Jotbun to send" under them.
  - `SyncBanner`'s `offline` takes no action, and it has no state for terms, resync or progress.
  - `EmptyState` cannot leave out its action, or make it anything but primary unless asked.
  - Screens have no public field error (`KitError` is private).
- **For the integrator:**
  - `kitPace()` in `HomeScreen.tsx` maps the logic's pace to the kit's. Switch it to the shared adapter in `src/ui/budgetWords.ts`.
  - Both test files carry the react-native-svg `resolveAssetUri.web.js` stub. Drop it once the shared vitest config has it.
  - **Routes:** `/spend/record/<id>` comes from the History and Record work. The push is cast to `Href` until that route exists, because typed routes are on. Drafts do not navigate. History (`/spend/all`) and Add (`/spend/add`) are the other agents' screens: the bar shows on History and hides on Add.
  - **New English strings** (they show in English in th and vi until E2): `Today's receipt`, `Earlier days`, `Add a wallet`, `Archived`, `Review`, `Start over?`, `History`, `Update Jotbun`, `Updated terms`, `Signed out`, `Use the Jotbun app` and `Diary not loaded`. The R3 logic's strings are used as they are: `{spent} of {limit}`, `{spent} spent this month`, `Needs a look`, `Nothing logged today yet`, the pace notes and the set-budget line.
- **App gate:**
  - typecheck:app PASS;
  - test:unit PASS (397);
  - test:render PASS (267 in 38 files: 219 + 48 new);
  - export:web PASS (`--max-workers 2`);
  - `git diff --check` clean.
- **SKIPPED (E2):**
  - simulator screenshots of every state in light and dark, in TH, EN and VI, at 320 pt;
  - VoiceOver and TalkBack on the Home and the tab bar;
  - the stage peek's geometry and spring on iOS and Android;
  - Dynamic Type at the largest size.

  The flag stays off until the screenshots are approved.

## R3: Quick add

Built on `d86001c`, then fast-forwarded onto `7d1baea` (kit unification, Home and the tab shell) before the gate. Nothing in `src/ui/`, the catalogs, the API or `vendor/` changed, and no package or lockfile changed.

- **Files:**
  - `src/screens/redesign/QuickAddScreen.tsx`: the screen.
  - `src/screens/redesign/quickAddCheer.ts`: the day the cheer bun last showed.
  - `src/screens/redesign/QuickAddScreen.render.test.tsx`: 68 tests.
  - `app/spend/add.tsx`: `isRedesignEnabled('core')` chooses Quick add; otherwise the current `AddTransactionScreen`, whose code and tests are untouched.
- **Layout, top to bottom:**
  - the title and Close (Quick add has no stack header);
  - `TypeSwitch`;
  - the `Amount` at XL, worked out live from the keypad, with what was typed above it ("12.50 + 7.25");
  - `CategoryChips` from `rankRecentCategories` (top 3), with More opening a `Sheet` holding the `CategoryGrid`;
  - in Move mode, `WalletPicker` in move mode (From → To, swap and move all) and no category;
  - a row with the `DateChip`, the wallet (a pill that opens a `Sheet` with `WalletPicker` in single mode) and the More details toggle;
  - More details: merchant and note `NoteField`s;
  - the `Keypad`, then Save as the one primary `PillButton`.
- **Saving** is the current form's, rule for rule, on the R3 logic (`settleForSave`, then `buildQuickAdd`):
  - With a ready diary, a device save first, shown as saved only once the local commit succeeds. Otherwise one immutable online command through `useCommandKeys`.
  - An unconfirmed online save freezes the type, keypad, chips, More, date, wallet and details, and offers only Try again. Try again resends the stored command online (the same input and key), never re-queued on the device, even if the diary opens meanwhile.
  - One record id and one device command id per draft. Add another (`anotherDraft`) and Copy (`duplicateDraft`) always take new ones.
  - `isOwnCreate` counts a create refused for this draft's own id as saved.
  - The lists the form first showed stay for its whole life.
  - Errors map to fields as before: `saveProblem` fields go under the amount, date, wallet, move or category, and note and merchant problems reopen More details. The device errors keep their words.
- **Saved moment:** a spring pop (`useSpringPop`, still under reduced motion) on the stage, with the exact amount, "Food · Cash" or "Cash → Daily account", **Add another** and **Done** (`/spend`). It is a polite live region and is announced on iOS.
  - A device save reads "Saved on this device · Waiting to sync"; only an acknowledged online save reads "Saved".
  - **The bun:** the `cheer` pose at most once per Bangkok day, at full intensity only. The day is stored under `gogospend.bun.cheerDay`, in browser storage on web and the secure store on native, like the intensity. A store that cannot be read means no bun. Quiet and Off show none. The only other bun is `hello` on the no-wallet empty state, which follows intensity (Quiet keeps it, Off hides it).
- **Copy:** `/spend/add?copyOf=<id>`.
  - A draft still on the device is copied from the diary; anything else loads with `resources.transaction` (the id must be a UUID).
  - The copy is `duplicateDraft`: new ids, dated today. A closed wallet or category stays unchosen and must be picked. Only the modes the record never had (a move's wallets on an expense copy, say) take the usual defaults.
  - Gone (not found, deleted, purged): "This entry isn't available to copy." with Start a new entry. Other problems use the load-problem words, with Try again where a retry can help.
- **States:** loading; load problems through `classifyLoadProblem` (the `loadProblem` words and retry rule; blocked loads offer Home); no wallet ("Add a wallet on the home screen first."); saving (busy "Saving…"); saved; unconfirmed; blocked (upgrade or a changed session: the draft stays and Save is disabled); and the locked, missing-reference and failed device saves.
- **Category order:** one history page (up to 200 records) of the last 60 days plus the device's drafts. The load never blocks the form. Until the first touch the order, and a new draft's default category, may still follow it; after that nothing moves under the thumb.
- **Money:** exact throughout. The keypad keeps satang in BigInt, and the source test refuses `parseFloat`, `parseInt`, `toFixed`, `Number(`, `Math.` and `keyboardType` in the screen. The amount never opens the system keyboard; the only text fields are merchant and note.
- **Accessibility:**
  - Targets are at least 44 pt (keypad keys 56).
  - Spoken amounts come from `Amount` ("Expense ฿65.00", "Transfer ฿1,500.00").
  - Save problems are alerts and are announced; field problems use the kit's `FieldError`.
- **Text pairs:** none new. Only ink sits on the stage, and muted text sits only on the page.
- **RED → GREEN** (`vitest run --config vitest.render.config.ts src/screens/redesign`):
  - **RED,** against seams that compile with the real props (a `QuickAddScreen` that renders an empty view, a cheer store that reads nothing, and the route switch in place): 66 of 66 failed, 65 because an element was not found and 1 `AssertionError` (the source scan). There were no module or type errors. The first RED run had one `TypeError` from the test reading its own source path, which was fixed in the test before counting.
  - **GREEN:** 66 of 66. One test was corrected: a merchant with a line break became one over 120 characters, because a single-line input on the web drops line breaks before the screen sees them.
  - **Added while green, then shown to catch a mutation:** the order frozen at the first touch, and a copy whose wallet is closed. That makes 68.
  - **Strengthened after the first mutation run:** C4 (a new record id per attempt) got past the `isOwnCreate` test, because the second attempt quietly created a duplicate. The test now asserts the same id and no second record.
- **Mutation check:** 11 guards were mutated one at a time with `r3q-mutate.py` (scratchpad) on the merged tree. All 11 were caught, and the file was restored byte for byte (SHA-256).

  | Mutation | Failing tests |
  | --- | --- |
  | F1 Unconfirmed no longer locks the entry | 2 |
  | F2 Try again rebuilds and re-queues on the device once the diary opens | 1 |
  | F3 An unconfirmed entry offers Save instead of only Try again | 4 |
  | F4 The keypad still types while unconfirmed | 2 |
  | C1 An unconfirmed save frees its command key | 3 |
  | C2 Every send takes a new command key | 3 |
  | C3 Every device save takes a new command id | 1 |
  | C4 Every save attempt takes a new record id | 3 |
  | C5 Add another keeps the saved ids | 2 |
  | R1 The category order keeps following the load after the first touch | 1 |
  | W1 A copy with a closed wallet guesses the first wallet | 1 |

- **Parity:** every behaviour assertion of the current Add tests, and where it now lives in `QuickAddScreen.render.test.tsx`.

  | Current test | Quick add test |
  | --- | --- |
  | Add: exact command, home only after the acknowledgement | "saves an expense as one exact command and shows it saved only after the acknowledgement" (the same input object; key ≠ id; Done goes to `/spend`) |
  | Add: refuses `1,5` | Unreachable: the keypad has no comma and only makes canonical amounts |
  | Add: refuses `0` and `''` | "refuses zero", "refuses zero from 000" and "refuses nothing typed" |
  | Add: refuses `1.234` | "a third decimal is refused as it is typed" (also "an amount above the cap") |
  | Add: refuses an impossible date | Unreachable: `DateChip` makes only real dates. The model check stays and is unit-tested. Future dates: "a future date can never be chosen" |
  | Add: unconfirmed keeps the entry frozen, retries the same command | "an unconfirmed save freezes the whole entry and offers only Try again…" |
  | Add: a transfer between two different wallets | "records a move between two different wallets, with no category" (also "swap… move a whole balance") |
  | Add: an upgrade blocks saving, keeps the draft | "an upgrade requirement blocks saving but keeps the draft" (also "a changed session blocks saving too") |
  | Add: a refused entry's field problem; the correction is a new command | "…a new command for the same record" |
  | Offline: device save first, never sent directly | "with a device diary… shown saved only once that commit succeeds…" |
  | Offline: a failed local save never claims saved | same name |
  | Offline: Add works from the device's lists | "offline, Quick add works from the wallets and categories synced to the device" |
  | Offline: unconfirmed stays online when the diary opens | same name |
  | Offline: a device save that fails says why (locked, missing reference) | "…and every attempt of one draft keeps its record id and command id" |
  | M5: a garbled acknowledgement is unconfirmed; the retry finishes | same name |
  | M5: a lost response resolves by replay, no duplicate | same name |
  | M5: an existing entry under an earlier command counts as saved | "…counts as saved (isOwnCreate)", now with no duplicate; also "…another record has the id is not mistaken for this one" |
  | M5: Thai (the Home's first-wallet form) | Not an Add test. Thai is covered by the en/th/vi × light/dark matrix and "Thai: the screen speaks Thai…" |
  | (normalization, in the model) | "note and merchant sit behind More details and are normalized…" and "a merchant over 120 characters is refused once…" |

- **New tests beyond parity:**
  - keypad maths into the save input (`12.50 + 7.25` → `1975`, `10 ÷ 3` → `333`, `10 ÷ 3 × 3` → `1000`, `65 +` → `6500`, `1 000` → `100000`, `0.1 + 0.2` → `30`);
  - the live, spoken amount;
  - the ranking (and drafts in it);
  - the More sheet;
  - Copy of a record, a move and a device draft, a closed wallet, and an unavailable record;
  - Add another on the device and online;
  - the saved moment's live region;
  - the cheer once a day, and Quiet and Off;
  - loading, retryable and blocked loads, and the no-wallet bun at each intensity;
  - Close;
  - target sizes;
  - no text field for the amount;
  - the source scan;
  - en/th/vi × light/dark;
  - the route switch with the flag on and off.
- **Deviations:**
  - **The default category is the most used one,** not the first built-in. Ported tests that relied on Food being the default now pick it.
  - **After saving, Quick add shows the saved moment** instead of going straight back. Done returns to `/spend`, as the current form did.
  - **An extra client check:** a date before the chosen wallet's tracking start is refused before sending, with the server's own words. `DateChip`'s `earliest` is that start.
  - **Offline, wallets are chosen by name.** With no known balance, a small radio list stands in for `WalletPicker`, and a move has From, To and Swap but no move all. A guessed balance would be a wrong number.
  - **Save works out a sum and shows its result,** but a plain amount stays as typed, so a failed save does not make the next digit start a new amount.
  - **Close is always offered,** also while saving or unconfirmed. It leaves without changing the draft; Try again is still the only action on the entry.
  - **The hero shows the type's sign** (`−฿65.00`). An empty or zero amount shows `฿0.00` unsigned.
- **Kit gaps, reported and not changed:**
  - `WalletPicker` needs `balance_minor` for every wallet, and the device's synced wallets have none.
  - `NoteField` draws its own problem and the caller's `error` with the same React key, so passing its own message would duplicate the key. The screen passes only the server's problems.
  - `EmptyState` must have an action, so no-wallet offers Home.
- **For the integrator:**
  - **History and Record:** navigate to `/spend/add?copyOf=<id>` with a confirmed record's id or a device draft's id.
  - **New English strings** (they show in English in th and vi until E2): `No wallets yet`, `Loading the entry to copy`, `This entry isn't available to copy.`, `Start a new entry`, `Wallet: {name}`, `More details`, `Saving…`, `Add another`, `Done`, `The sum can't go below zero.` and `You can't divide by zero.`. R2b's uncatalogued `Choose a wallet` and `Swap` are reused.
  - **Catalog oddity:** `Plus` has `"Plus"` as its Thai and Vietnamese value, so the keypad's + key is read in English everywhere.
  - **Timing:** once, under machine load during a mutation run, the `isOwnCreate` test hit `findByText`'s 1 s default while waiting for "Saved". It passed every other run.
- **App gate (merged tree, `7d1baea` + R3 Quick add):**
  - typecheck:app PASS;
  - test:unit PASS (414);
  - test:render PASS (378 in 43 files: 310 + 68 new);
  - export:web PASS (`--max-workers 2`; the `add` route bundle includes Quick add);
  - `git diff --check` clean.
- **SKIPPED (E2):**
  - simulator screenshots of every state in light and dark, in TH, EN and VI, at 320 pt;
  - VoiceOver and TalkBack on the keypad, the sheets and the saved moment;
  - the spring pop and reduced motion on iOS and Android;
  - Dynamic Type at the largest size;
  - haptics on device.

  The flag stays off until the screenshots are approved.

## R3: History and record

Built on `d86001c`, then merged with the integration branch at `7d1baea` (kit unification, Home and the tab shell) and `add1158` (Quick add). Behind `isRedesignEnabled('core')`. The current `TransactionsScreen` and its tests are untouched. No package or lockfile change, and the locale catalogs are untouched.

- **Files:**
  - `src/screens/redesign/HistoryScreen.tsx`, `RecordScreen.tsx` and `HistoryParts.tsx` (filter chips, search field, notice, loading block, routes, Back);
  - `HistoryTestHarness.tsx` (test only), `HistoryScreen.render.test.tsx` and `RecordScreen.render.test.tsx`;
  - routes: `app/spend/all.tsx` picks History when the flag is on (the month lives in `?month=`), and the new `app/spend/record/[id].tsx` redirects to `/spend/all` when the flag is off, in the legacy build, or without an id.
- **Outside the new files:**
  - `historyModel.ts` exports `summaryLine`, so a filter's summary can word the server's exact totals.
  - `fakeResources.history` honours `wallet_id` and `category_id` as the server does (a move matches on either side).
  - `HomeScreen.tsx` drops its `as Href` cast now that the record route exists (the coordinator asked for this).
- **History (`/spend/all`):**
  - **Header:** `StageHeader` titled "History" (to match the tab), with the month switcher and the month's money in and out from the server. Next is disabled after the current month, because entries are never in the future.
  - **Search:** a sticky field, searched on this device over the loaded pages with `historyModel` (category name, merchant, note; Thai folding).
  - **Filters:** type, wallet and category chips (radio groups). A move has no category, so choosing Transfer hides the category chips and clears that filter. All three filters are sent to `/v1/history` too, so paging and totals cover the whole filter. `historyModel` applies them again, which also filters the drafts.
  - **Summary bar:** a polite live region with "2 entries, ฿12,450.00 out", the drafts counted apart, and Clear filters.
    - With filters only, the count and money are the server's exact totals.
    - With a search, they come from the loaded pages, and the bar says "Only loaded entries are searched. Load more to search the rest." until every page is in.
  - **List:** day groups with `DayHeader` (confirmed money only), the waiting and checking draft lines, then `RecordRow`s.
    - Rows read "Bills, Expense ฿12,268.00, Daily account · Rent", with the merchant and note after the wallet.
    - Drafts show "saving…", "checking…" or "needs a look". An update-to-send draft reads "saving…" with "Update Jotbun to send" under it.
    - Keyset pages with no hidden cap, and "Load more".
  - **Row actions:**
    - Tapping a row opens the record. Drafts open too: the record screen reads them from the device.
    - Long-press and the screen reader's actions menu offer Edit (`/spend/record/<id>?mode=edit`), Copy (`/spend/add?copyOf=<id>`) and Delete. Drafts offer Copy only.
    - Delete shows an `UndoBar`, and Undo restores with the version the delete returned. While a delete is unconfirmed, no other delete starts, and Try again resends it with the same key.
  - **States:**
    - loading;
    - an empty month: `EmptyState` with the `thinking` bun, which is passed only while the bun intensity shows it;
    - under a filter, "No entries match" with Clear filters, and no bun;
    - load problems with `loadProblem`'s words and retry rule;
    - offline: with a diary, an offline `SyncBanner`, the problem with Try again, and the month's drafts from the device;
    - the refresh suggestion.
  - **Sync banner:** one at a time, most pressing first: locked, offline, update to send, needs review (its Review action opens the first such draft), checking, saving.
  - **Freshness:** the list refreshes in place, keeping the number of entries shown, when the screen comes back into focus and when a draft resolves.
- **Record (`/spend/record/[id]`):**
  - **Receipt:** `recordDetail()` as a `ReceiptSlip`: the category (or Transfer) as its title; Type, Category and Wallet or From → To, Date, Merchant and Note rows; Status for a draft; and the amount as `ReceiptTotal` with its sign and state ("Amount, Expense ฿65.00, saving").
  - **Sources:** the API, or this device's diary when the id is an open draft. A draft is never fetched. Copy is offered for it, Remove while it was never sent, and Discard once it needs a look.
  - **Actions:** Edit (the one primary), Copy, Delete with the undo bar, and a Back pill (`router.back()`, or `/spend/all` when there is nothing to go back to).
  - **Edit:**
    - The amount uses the `Keypad`, starting from `keypadFromMinor`. The amount line is spoken as the exact amount, or as the sum while one is being typed.
    - Date uses `DateChip`, which never goes before the wallet's tracking start. Note and merchant use `NoteField`.
    - `editDraftFrom` and `buildEditChanges` send only the changed fields, with the version you saw, under `edit:<id>`. An unchanged save sends nothing.
    - Keypad refusals are said in words. Divide by zero and below zero use Quick add's wording.
  - **After an edit:**
    - The receipt is read again after the acknowledgement. If that read fails, it is a load problem, not an unconfirmed save.
    - **Conflict:** `conflictModel` rows side by side ("Yours" and "On the server") in a polite live region. A changed field is bold and says "Applying your change replaces this." Reload drops the edit. "Apply my change" sends `rebaseEdit` on the server's version as a new command. A conflict with no usable record reloads instead.
    - **Deleted on another device:** says so, drops the edit, and offers Restore while `recentlyDeletedModel` says it is inside the 30-day window ("30 days left to restore").
    - **Unconfirmed:** keypad, date and fields frozen. Try again is the only action, and it resends the same key. The same holds for delete and undo.
- **Copy and colour:**
  - All words go through `useCopy()`. Dates on the receipt and in the conflict rows use the kit's `fullDateLabel` rather than the model's Intl `longDateLabel`: Intl's en-GB writes "Sunday, 27 September 2026", and has no Vietnamese words.
  - Colours are tokens only. No new text pair: every text is ink, muted or accent on the page, card or paper, ink on the stage, or onInk on an ink fill.
  - A chosen chip is an ink fill with bold text, and a changed conflict field is bold with words, so colour is never the only signal.
- **RED → GREEN** (`vitest run --config vitest.render.config.ts src/screens/redesign`):
  - **RED:** typed seams, two components that render an empty view. 52 of 52 failed (History 27, Record 25), all because an element or label was not found or an assertion failed. There were no module or type errors.
    - The react-native-svg stub path in the two files was one directory short. It was fixed as GREEN started; the empty seams never loaded the SVG module.
  - **GREEN:**
    - Record passed 25 of 25 on the first run. History passed 20 of 27: 7 tests looked for a signed amount that a day header also shows, so they now look inside the row.
    - Added while green: an unconfirmed undo on the record screen, and the update-to-send row. That makes 54 (History 28, Record 26).
  - After the merge, the per-file SVG stubs were dropped for the shared alias.
- **Mutation check:** `r3s-mutate.py` (in the scratchpad) mutated 9 guards one at a time against both suites. All were caught, and the files were restored byte-identical.

  | Mutation | Caught by |
  | --- | --- |
  | Edit sends the original version instead of the version the edit carries | 1 (Apply my change) |
  | Apply my change skips `rebaseEdit` | 1 (Apply my change) |
  | Edit re-reads the server's version just before sending (a silent overwrite) | 6 (both conflict tests, unusable conflict, failed reload, unconfirmed edit, edit with version) |
  | An unconfirmed edit's key settled, so Try again takes a new one | 1 (unconfirmed edit) |
  | History's Undo restores the pre-delete version | 2 (delete then undo, unconfirmed undo) |
  | History settles the restore key when unconfirmed | 1 (unconfirmed undo) |
  | Record's Undo restores the pre-delete version | 2 (delete then undo, unconfirmed undo) |
  | Record settles the restore key when unconfirmed | 1 (unconfirmed undo) |
  | History settles the delete key when unconfirmed | 1 (unconfirmed delete) |

- **Parity with the current tests** (`TransactionsScreen.render.test.tsx` and the list's tests in `M5Hardening.render.test.tsx`):

  | Current test | Ported to |
  | --- | --- |
  | Lists the month's entries with signed amounts and the month's totals | History "lists the month's entries in day groups…": the same rows, signs, `Money in`/`Money out` labels and first filter, plus the day headers |
  | Filters by type and moves between months | History "filters by type and moves between months…" |
  | Pages through every entry with Load more | History "pages through every entry…" (rows counted, 50 then 64, Load more gone) |
  | Edits with the current version, then shows the server record | Record "edits with the version you saw and its own command key…" (`[RENT, 1, { amount_minor: '1200000' }]`, read again) |
  | A conflicting edit offers reload or an explicit reapply | Record "a conflict shows yours and the server side by side…" (version 2, a new key) |
  | Reload after a conflict drops the edit | Record "Reload after a conflict…" |
  | Delete hides the entry; Undo restores it | History and Record "delete … Undo restores with the new version and its own key" (`[RENT, 1]`, then `[RENT, 2]`, keys differ) |
  | M5: a failed reload after an acknowledged edit is a load problem | Record, the same name |
  | M5: an unconfirmed edit is frozen and retried as the same command | Record, the same name |
  | M5: an unconfirmed delete keeps its own key while another entry is edited | History "an unconfirmed delete is frozen and resent with the same key, even after the list refreshes"; Record "an unconfirmed delete…" |
  | M5: a conflict shows the other device's values before reapplying | Record conflict test (the server's ฿13,000.00 and "Rent and water") |
  | M5: a conflict without a usable current record reloads | Record, the same name |
  | M5: deleting an entry another device already deleted | History, the same name |
  | M5: editing after Load more keeps every loaded entry | History "returning to the list refreshes it in place and keeps every loaded page" (64 rows, limit 64) |

  New here: refresh suggested; load problems (network with retry; upgrade, terms and signed out without); a delete that meets a newer version; an unconfirmed undo (both screens); deleted on another device with Restore; search, including Thai marks (a tone typed before the lower vowel, sara am as nikhahit plus sara aa, and marks never stripped); a partial search; wallet and category chips; the summary text; drafts in their days, a draft resolving, offline, and update-to-send; the receipt rows (expense, move, merchant, draft); the exact keypad (0.1 + 0.2 → `'30'`, 100 ÷ 3 → `'3333'`); only changed fields; Cancel and unchanged saves; Copy with `copyOf`; Back; the bun and its setting; and TH, EN and VI in light and dark.
- **Deviations:**
  - **Edit lives on the record screen,** as asked, so the list's inline-edit tests moved there.
  - **Rows read with the wallet,** from `RecordRow`, so labels are "Bills, Expense ฿12,268.00, Daily account · Rent".
  - **The type filter is a radio group,** the kit's pattern, not buttons.
  - **The empty month under a filter** reads "No entries match" (historyModel). "No entries in this month" and the bun appear once the filter is cleared.
  - **No confirm sheet for Delete:** Undo makes it reversible, as it is today. `Sheet` and `ConfirmSheet` are unused.
  - **The undo bar never times out:** with no Recently deleted list, it is the only way back.
  - **Edit does not change the wallet or category:** the brief lists amount, note, merchant and date.
- **Gaps:**
  - **Recently deleted:** there is no list API. `/v1/history` returns active records only, and `DiaryView` exposes no records (`RECENTLY_DELETED_GAP`). What exists is the undo bar for this session's delete, and the record screen's Restore for an entry opened by id.
  - **No swipe:** there is no gesture library. Long-press and the actions menu stand in (the R2b decision).
  - **No receipt thumbnail** on the record (plan §6.1): the client has no attachment read.
  - **Loaded pages on a remount:** the spend layout is a `Slot`, which unmounts History while a record is open. The month comes back from the URL, but the filters, the search and pages after the first do not. Under a stack, the focus refresh keeps them.
- **Kit gaps, reported and not changed:**
  - `RecordRow` has no "update to send" state (Home reported this too).
  - `RecordRow` and `DayHeader` sign money out with a hyphen; `Amount` uses U+2212. The receipt and the rows differ.
  - `Amount` has no "checking" state, so a draft being checked speaks "saving" in its amount, while its Status row says "Checking with Jotbun".
  - There is no kit filter chip or search field; both are local in `HistoryParts.tsx`, built from tokens.
  - `StageHeader` has no back slot, so the record screen has its own top row and no stage.
  - `EmptyState` draws its art wrapper even when the art renders nothing (bun off), so History passes no art then.
- **For the integrator:**
  - Home's rows do not open drafts. The record screen now reads drafts from the device.
  - Copy passes a confirmed record's id or a draft's record id. Quick add takes both.
  - **New English strings** (English in th and vi until E2): `History`, `Search entries`, `Category, merchant or note`, `Clear search`, `All wallets`, `All categories`, `Clear filters`, `Only loaded entries are searched. Load more to search the rest.`, `Entries you add for this month show up here.`, `Review`, `Edit entry`, `Applying your change replaces this.`, `{label}. {yoursLabel}: {yours}. {serverLabel}: {server}.`, `Restore`, `This entry isn't in your diary.` and `Couldn't change this device's copy. Try again.`. Quick add's `The sum can't go below zero.` and `You can't divide by zero.` are reused. The R3 logic's strings are used as they are: `Yours`, `On the server`, the summaries, the restore countdown and the draft states.
  - **Timing:** once, in a full render run before the merge, the current list's "reload after a conflict" hit `findByLabelText`'s 1 s default. It passed alone three times and in every later full run. Untouched.
- **App gate (merged tree, `add1158` + R3 History and Record):**
  - typecheck:app PASS;
  - test:unit PASS (414);
  - test:render PASS (432 in 45 files: 378 + 54 new);
  - export:web PASS (`--max-workers 2`; the bundle has the `[id]` and `all` routes);
  - `git diff --check` clean.
- **SKIPPED (E2):**
  - simulator screenshots of every state in light and dark, in TH, EN and VI, at 320 pt;
  - VoiceOver and TalkBack on rows (the actions menu), the undo bar and the conflict panel;
  - the sticky search and sideways chip scrolling on iOS and Android;
  - Dynamic Type at the largest size.

  The flag stays off until the screenshots are approved.

## R2c+: catalogue entries for R2b and Home

Built on `7d1baea`. At the coordinator's request it was then fast-forwarded to `add1158` (R3 Quick add) and `4043db3` (R3 History and Record), and those screens' states were added as well. All three now have sections, so no placeholders are left.

- **What changed:** files under `src/dev/catalogue/` only.
  - **New:**
    - `entrySections.tsx`: R2b;
    - `screenSection.tsx`: the screen stage and the script runner;
    - `screenFixtures.ts`: the fakes;
    - `homeSections.tsx`, `quickAddSections.tsx`, `historySections.tsx` and `recordSections.tsx`;
    - `routerTestStub.tsx`: test use only.
  - **Changed:** `registry.tsx`, `CatalogueScreen.tsx` (a screen section fills the body), `samples.ts` (more typed words), and both catalogue tests.
  - **Not changed:** no component, screen, route, locale catalog, package, lockfile or `vendor/` file.
- **Sections:** 53 new, 74 in all. Deep link: `gogospend://dev/catalogue?section=<id>&theme=<light|dark|system>&locale=<en|th|vi>`.

  | Group | ids | Shows |
  | --- | --- | --- |
  | Kit (R2b) | `keypad` | `12.50 + 7.25` typed, its exact sum (−฿19.75) live above a working keypad, refusals in words |
  | | `type-switch` | Expense (live), Income, Move, disabled |
  | | `category-chips` | top three by use with More opening the grid; a pick from More kept in view; income with no choice; disabled. Built-ins and the person's own (pastel and plain) |
  | | `category-grid` | expense (6 built-ins + 3 of the person's own) and income |
  | | `wallet-picker`, `wallet-picker-move` | one wallet (live, disabled; an archived one never offered); move with Swap and Move all, and the same-wallet error |
  | | `date-chip` | today (forward disabled), yesterday, a past date with the tracking start as earliest, last year (Thai 2568) |
  | | `note-field` | empty, filled, merchant over 120 characters, note with a server problem |
  | | `record-row` | confirmed (long-press for actions), saving, checking, needs a look; income, move, a category of the person's own |
  | | `day-header` | today, yesterday with out and in kept apart, in only, last year (Buddhist era), nothing confirmed |
  | | `budget-bar`, `pace-ring`, `pace-ring-over` | on track, tight, over, no budget, from real `budgetPace()` output on 21 September through `toKitPace` |
  | Home | `home-ready`, `home-over-budget`, `home-no-budget`, `home-first-run`, `home-offline`, `home-saving`, `home-needs-review`, `home-upgrade`, `home-signed-out`, `home-locked` | the golden month with the plan's ฿18,000.00 budget (฿10,000.00 when over, none for no budget); device drafts for offline, saving and checking, and needs review; load problems; a locked diary |
  | Quick add | `quick-add-empty`, `quick-add-sum`, `quick-add-categories`, `quick-add-move`, `quick-add-details`, `quick-add-saving`, `quick-add-unconfirmed`, `quick-add-saved`, `quick-add-copy`, `quick-add-no-wallet`, `quick-add-device-error` | as the render test reaches them: the keys typed, the More sheet open, Move with Cash on both sides, details typed, a held save, a lost answer, the saved moment with the cheer, `copyOf` the rent, no wallet, a refused device save |
  | History | `history-month`, `history-search`, `history-search-thai`, `history-search-partial`, `history-filters`, `history-empty`, `history-no-match`, `history-undo`, `history-drafts`, `history-refresh`, `history-offline` | "rent"; "ปู่" over Thai notes; Food over a two-page month; Expense + Cash + Food; no records; Travel; the rent deleted; device drafts in their days; `refresh_suggested`; history unreachable with a draft kept |
  | Record | `record-expense`, `record-income`, `record-move`, `record-draft`, `record-edit`, `record-conflict`, `record-deleted`, `record-unconfirmed` | the golden rent, salary and move; a device draft; edit mode; the rent edited to ฿12,000.00 while another device changes it, deletes it (Restore, 30 days), or the answer is lost |

- **Screen sections:** `screenSection({ id, title, fixture, script?, render })` in `screenSection.tsx`. A future screen state is one entry; see the comment in `registry.tsx`.
  - **The screen:** the real screen, with `now` pinned to `CATALOGUE_NOW`: 29 September 2026, 10:00 in Bangkok, the day after the last golden record. It is drawn edge to edge under the catalogue's header (`layout: 'screen'`) and scrolls as it does in the app.
  - **Fakes:** each visit builds fresh ones (`fixture`).
    - The resources are `createFakeResources` on `goldenSeed`, and the diary, where a state needs one, is `createFakeDiary`. There is no network and no sign-in. The render test asserts that `fetch` is never called, and the web check saw no request leave the dev server.
    - The helpers in `screenFixtures.ts` mirror the screens' render-test harnesses, which import testing libraries and so cannot load in the app.
    - Load problems use `alwaysFails`, not the fake's one-shot `fail`, so a retry, remount or refocus shows the same state.
  - **Providers:** the stage provides `SpendV1Provider`, `SpendDiaryProvider` and expo-router's `LocalRouteParamsContext` (Quick add's `copyOf`; `expo-router/build/Route` is a declared package export). Insets are zero at the top, because the header covers the status bar, and real at the bottom.
  - **The cheer bun:** the cheer shows once per stored day, and the catalogue's day never changes. So `quick-add-saved` moves a stored `2026-09-29` back one day before it opens. The app compares the stored day with the real today, so a September 2026 date changes nothing there.
- **Scripts (deviation):** the screens take no initial state, and they were not to be changed. Their in-between states (a typed sum, an open sheet, a save in flight, a conflict) are therefore reached the way their render tests reach them.
  - **How:** a class component reads its own fiber (`_reactInternals`), finds the current tree from the root, and calls the `onPress` or `onChangeText` the screen gave a control, found by its accessibility label. It can also call a row's `onDelete`, change the fakes "on another device", and wait for a label, text or testID.
  - **This is a React internal.** It lives only in development code that never ships, and the render tests fail if it stops working. It was checked on react-dom (vitest and a Metro web bundle) but not on React Native's renderer, which keeps the same fiber fields.
  - **Status:** the section reads `catalogue-screen-running` until the script is done. If a step cannot be done within 8 s, an ink strip over the screen says which step stopped (`catalogue-screen-stopped`), so a screenshot cannot pass for the state.
  - **Navigation:** the screens' own navigation (Close, Done, Back, Add, a row) uses the app's real router and leaves the catalogue.
- **Fit on one screen** (R2b sections). Measured as in R2c: `expo start --web` with the flag on, at 402 × 874, header plus body plus 62/34 pt insets.
  - Every section fits in EN, TH and VI. The tallest are `record-row` in Thai at 859 pt (15 pt spare) and `category-chips` at 835 pt.
  - All 74 titles keep the header on one line.
  - Screen sections scroll, as the screens do.
- **RED → GREEN:** `vitest run --config vitest.render.config.ts src/dev`, against seams with the real types (a `screenSection` that draws nothing, empty slots, and `sampleWords` with blank words).
  - **RED:** 56 of 91 failed: 53 `AssertionError`s (each new id unregistered), 1 registry `AssertionError` and 2 elements not found. There were no module or type errors. The 35 that held are the 21 existing sections, the other existing catalogue tests and the 3 route tests. Before counting, one harness bug was fixed: the screen wait ran `waitFor` under the confirm test's fake timers.
  - **GREEN:** 91 of 91.
  - **Changes while green:**
    - A specimen label was renamed: "Yesterday" collided with the chip's own text.
    - One test was added after the mutation run: a load-problem state stays put when retried.
    - The top and bottom inset assertion was added to the edge-to-edge test.
    - That makes 92.
  - **Content checks:** every new id has its own entry in `SHOWS`, checked in light and dark in every locale. Examples: the golden `฿12,450.00 of ฿18,000.00`, `฿2,775.00` a day and `฿21,050.00` balance; "It happens. ฿12,450.00 of ฿10,000.00 spent."; `12.50 + 7.25` and `฿19.75`; the cheer bun; one "Choose two different wallets"; the conflict panel.
- **Mutation check:** 12 guards were mutated one at a time with `r2cp-mutate.py` (scratchpad). All 12 were caught, and every file was restored byte for byte.

  | Mutation | Caught by |
  | --- | --- |
  | route params not overridden | `quick-add-copy` |
  | script presses nothing | `quick-add-sum`, `history-filters` |
  | script types nothing | `quick-add-details`, `history-search` |
  | a step never found counts as done | the stopped-script test |
  | top inset kept under the header | edge-to-edge test |
  | screens inside the padded scroll view | edge-to-edge test |
  | cheer day not reset | `quick-add-saved` |
  | Home ready without the budget | `home-ready` |
  | load problems fail once, not always | the stays-put test (added for this; it was missed first) |
  | budget pace on the fixtures' day (tight impossible) | `budget-bar`, `pace-ring` |
  | the over sample under its limit | `budget-bar`, `pace-ring-over` |
  | conflict without the other device's change | `record-conflict` |

- **Production-bundle check:** PASS. `r2cp-bundle-check.sh` (scratchpad) greps `dist` for 25 markers: R2c's 10, plus 15 new ones (section titles, the runner's testID and stop message, sample words, the fakes' ids and messages, the budget label).
  - **Default flag** (`npm run export:web -w gogospend-app -- --max-workers 2`): 0 of 25 found. "Not available" is in 1 file. The route chunk `catalogue-<hash>.js` is still 830 bytes.
  - **Flag on** (`EXPO_PUBLIC_REDESIGN=all`, production): 0 of 25, and a byte-identical route chunk.
  - **Positive control** (`--dev`, flag on): all 25 found.
- **App gate** (from the worktree root):

  | Step | Before (`4043db3`) | After |
  | --- | --- | --- |
  | typecheck:app | PASS | PASS |
  | test:unit | PASS, 414 | PASS, 414 |
  | test:render | PASS, 432 in 45 files | PASS, 488 in 45 files |
  | export:web (`--max-workers 2`) | PASS | PASS |
  | `git diff --check` | clean | clean |

- **Findings, not fixed (other owners' files):**
  1. **Typed routes break the typecheck once generated.**
     - **What happens:** `expo start` writes `.expo/types/router.d.ts` and `expo-env.d.ts`. Both are git-ignored, so a clean checkout never has them. Once they exist, `typecheck:app` fails 6 times:
       - in `HistoryScreen.tsx`, at lines 297 and 331–333;
       - in `RecordScreen.tsx`, at lines 320 and 412.
     - **Why:** `recordRoute()` and `copyRoute()` in `HistoryParts.tsx` return `string`, which typed routes refuse for `router.push`.
     - **Fix:** type the helpers' results as `Href`.
     - **Here:** the web check created both files; they were deleted before the gate.
  2. **"None" is not in the catalogs.** The conflict panel's empty fields read "None" in Thai and Vietnamese. It is missing from History's list of new strings.
  3. **The Home stage peek** shows only the top of the bun's head at the stage's lower right on the web. It is as R3 built it (the peek rises from the slot); its geometry is already an E2 item.
  4. Nothing else drew wrongly in the web spot-check: `quick-add-sum`, `home-ready` (TH), `quick-add-saved` (dark), `quick-add-categories` (VI), `history-filters`, `record-conflict` (dark TH) and `history-undo`. There were no console errors.
- **SKIPPED:**
  - simulator screenshots (E2);
  - the scripts on iOS and Android (checked on the web only);
  - the one-screen fit with iOS font metrics. The tightest section, `record-row` in Thai, has 15 pt to spare on the web.

## Review fixes: redesign logic

These fix the logic-layer findings from the independent review of the redesign. The work started on `4043db3`, was fast-forwarded to `1b68acf` (the catalogue entries) before the gate, and touches only `src/spend/v1/redesign/*` and its tests. No package, lockfile, catalog or `vendor/` change.

- **M1: a `sending` draft was counted twice in the pace and labelled "saving…". Fixed.**
  - **Why it was wrong:** a `sending` command may already be committed. The sync engine counts it as uncertain (`summarize`), and so does v1's `SyncStatus`. After a `session_changed` refusal, it stays `sending` until the next session.
  - **Label:** `sending` now maps to `checking` ("Checking with Jotbun"). `WAITING_STATES` is now `unsent` and `paused_upgrade`; `CHECKING_STATES` is `sending` and `uncertain`.
  - **One mapping:** both lists are derived from `moneyGroupOf()`, which reads the draft state. Day totals bucket a row by its own label, and the pace and the waiting lines use the same function, so a draft's label, its money group and its totals cannot disagree. A test walks every outbox state through the row, the day totals, the pace and the waiting lines.
  - **Confirmed ids:** `unconfirmedDrafts()` drops drafts whose record id is among the confirmed records. `mergeRows`, the pace (new `confirmedIds` input) and `waitingMoneyLines` (new optional argument) all use it. Home passes the ids of the records it loaded.
  - **Probe Home-3:** the ring reads ฿9,880.00 left, not ฿9,760.00. The model test checks it, and the render probe passes with the model change alone.
- **M3 (model half): Review had nothing to open for older drafts. Fixed in the model.** The ready model and `OfflineHome` gain `openDrafts`: every open draft from an open diary, newest first, as `DiaryRow`s, whatever its date. That includes one whose record already shows as confirmed, because the banner counts it too. The screen builds the review list and Remove/Discard from it. No total reads it.
- **m1: a draft brought back a cut-off day without its confirmed money. Fixed in the model.**
  - New `HomeData.oldestWholeDay`. Drafts dated before it stay out of the day groups but remain in `openDrafts`, and the month's money still counts them.
  - New `earlierWholeDays(page)` does what the screen's `wholeDaysOf` does and also names that day: the day after the cut one, or null on the last page.
- **Nit: `wholeDay` threw above 4,000 records. Fixed in the model.** New `readWholeDay(read, maxPages)` returns what it read, with `complete: false`, instead of throwing. New `HomeData.todayComplete` marks today's group `partial`.
- **M2 support (History): done.** `HistoryModel.pageEdgeDay` is set while more pages exist. It is the oldest loaded day, or the month's last day when nothing has loaded. That day's group and any older one are marked `partial`. The edge comes from the loaded records, not from what a filter shows.
- **New and changed fields** (all additions; existing callers keep working):

  | Where | Name and shape |
  | --- | --- |
  | `shared.ts` | `draftStateOf('sending')` is now `'checking'`; `WAITING_STATES` and `CHECKING_STATES` changed as above |
  | `shared.ts` | `type MoneyGroup = 'waiting' \| 'checking'`; `moneyGroupOf(state: OutboxState): MoneyGroup \| null`; `moneyGroupOfDraft(state: DraftState): MoneyGroup \| null` |
  | `shared.ts` | `unconfirmedDrafts(outbox, confirmedIds: ReadonlySet<string>): OutboxCommand[]` |
  | `shared.ts` | `DayGroup.partial: boolean`; `groupDays(rows, context, isPartial?: (day: string) => boolean)`; `dayOf(day, rows, context, partial = false)` |
  | `budgetPace.ts` | `BudgetPaceInput.confirmedIds?: ReadonlySet<string>` |
  | `homeModel.ts` | `HomeData.oldestWholeDay?: string \| null`; `HomeData.todayComplete?: boolean` |
  | `homeModel.ts` | ready model and `OfflineHome`: `openDrafts: DiaryRow[]` |
  | `homeModel.ts` | `waitingMoneyLines(outbox, month, tc, locale, confirmedIds?: ReadonlySet<string>)` |
  | `homeModel.ts` | `earlierWholeDays(page: Pick<HistoryPage, 'items' \| 'next_cursor'>): { records: TransactionDto[]; oldestWholeDay: string \| null }` |
  | `homeModel.ts` | `type HistoryPageReader = (cursor: string \| undefined) => Promise<Pick<HistoryPage, 'items' \| 'next_cursor'>>`; `readWholeDay(read: HistoryPageReader, maxPages: number): Promise<{ records: TransactionDto[]; complete: boolean }>` |
  | `historyModel.ts` | `HistoryModel.pageEdgeDay: string \| null`; its groups carry `partial` |

- **For the screen agent:**
  - **Home loader:** read today with `readWholeDay((cursor) => resources.history({ from: today, through: today, sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT), TODAY_PAGES)`. Cut the earlier page with `earlierWholeDays(earlier)`. Pass `oldestWholeDay` and `todayComplete` in `HomeData`.
  - **Review sheet:** build it from `openDrafts` where `state === 'needs_look'`, in both the ready and the offline model.
  - **Banner counts:** `syncPlan` should count `sending` as checking, not saving. That matches v1's `SyncStatus` and the model's `sync.drafts`.
  - **Partial days:** say when `today.partial` is set. On History, a group with `partial` set needs its total hidden or qualified, or the next page loaded first.
  - Probes Home-1, Home-2 and History-1 still fail at render level until the screens read these fields.
- **RED → GREEN:** `npm run test:unit -w gogospend-app -- src/spend/v1/redesign/{shared,budgetPace,homeModel,historyModel}.test.ts`, against typed seams.
  - **RED:** 15 of 51 failed. 14 failed on assertions. The 15th failed when the stub `readWholeDay` threw "Too many records on one day", which is the nit itself.
  - **The 36 that held:** the existing tests left unchanged, plus the label/group agreement test. The old mapping already agreed with itself (`sending` was both saving and waiting), so that test guards against them drifting apart.
  - **GREEN:** 51 of 51 (9 new tests, 7 updated for `sending`).
- **Mutation check** (`rlf-mutate.py` in the scratchpad): 17 of 17 were caught, and every file was restored.

  | Mutation | Failing tests |
  | --- | --- |
  | `sending` labelled saving (so counted as waiting) | 9 |
  | `sending` added to the pace while labelled checking | 5 |
  | Checking money added to the estimate | 5 |
  | Confirmed-id exclusion removed | 6 |
  | Home not passing record ids to the pace | 1 |
  | Home not passing record ids to the waiting lines | 1 |
  | `openDrafts` from the visible days only | 3 |
  | `openDrafts` limited to this month | 1 |
  | `openDrafts` leaving out a draft already confirmed | 1 |
  | Offline `openDrafts` empty | 1 |
  | Drafts before the oldest whole day kept | 1 |
  | Cut-off off by one day | 1 |
  | `earlierWholeDays` keeping the split day | 1 |
  | `readWholeDay` throwing past its page limit | 1 |
  | Today never marked partial | 1 |
  | History edge taken from the filtered records | 1 |
  | History marking only days before the edge | 1 |

- **App gate** (from the worktree root, on `1b68acf` plus this change):

  | Step | Result |
  | --- | --- |
  | typecheck:app | PASS |
  | test:unit | 422 of 423 (414 + 9 new); 1 fails on purpose, below |
  | test:render | 487 of 488 in 45 files; 1 fails on purpose, below |
  | `git diff --check` | clean |

- **Tests that fail because of the intended model change** (other owners' files, not edited):
  - **`src/ui/paceAdapter.test.ts`, "pending money: confirmed spending plus waiting drafts; …"** (line 38): it counts a `sending` ฿20.00 draft as pending. The logic now gives `['20000', '1500', '2700', '21500']` (confirmed, pending, checking, estimated) instead of `['20000', '3500', '700', '23500']`. The rest of that test follows from the new estimate: spent `21500`, left `9500`, still `tight`, per day `593`, "Tight · ฿95.00 left · 16 days to go".
  - **`src/dev/catalogue/CatalogueScreen.render.test.tsx`, section `home-saving`:** the fixture (`homeSections.tsx`, "one draft on its way") makes that draft `sending`, but the assertions expect "Waiting to sync: money out ฿65.00" and "Includes ฿65.00 saving on this device". Making the fixture's first draft `unsent` keeps the section's intent, and every assertion holds again.

## Kit polish after R3

Built on `8979879` (the logic review fixes), in `src/ui/` and the screens that use the kit. It closes the kit gaps that the R2 unification, Home and History reports listed. Everything stays behind `isRedesignEnabled('core')`; with the flag off, nothing a person sees changed. No package, lockfile, catalog or `vendor/` change, no new text pair, and no raw hex. Every public kit export still imports from its old path, and `HistoryParts.tsx` re-exports `FilterChips`, `ChipOption` and History's `SearchField`.

| # | Item | What changed | Pinned by |
| --- | --- | --- | --- |
| A1 | One minus sign | `RecordRow` and `DayHeader` draw amounts with `Amount`'s words (`useAmountWords()(minor, type).shown`), so money out reads "−฿65.00" (U+2212) in rows, day headers and receipt totals alike. The spoken labels are unchanged ("Expense ฿65.00", "Money out ฿65.00"). An untyped negative balance in `WalletPicker` keeps `formatMinor`'s own sign, because it is not an expense. | `kitUnification` "one minus rule", `RecordRow`, `DayHeader`, Home and History |
| A2 | Draft states | `RecordRowState` gains `update_to_send` ("Update Jotbun to send", ink and bold, never "saving"). `AmountState` gains `checking` ("checking…", spoken "Expense ฿40.00, checking"). Home and History map update-to-send to the row state, so the extra line under the row is gone. The record screen's amount now says checking, as its Status row does. | `RecordRow`, `Amount`, Home, History, Record |
| A3 | Unknown balances | `WalletChoice.balance_minor` is optional (`Minor \| null`). Without it the wallet shows its name only, on screen and in its label ("From Cash"). Move all is offered only when the From wallet's own balance is known. Quick add's offline `NameChoices` and `MoveByName` fallback is removed: offline, it uses `WalletPicker` by name. | `WalletPicker`, Quick add's offline move |
| A4 | NoteField keys | Problems are keyed by source (`own`, `caller`), and a caller's problem with the field's own words is said once. | `NoteField` |
| A5 | EmptyState | `action` is optional. The art wrapper (`empty-state-art`) is drawn only when there is art and the bun intensity shows the bun: Off collapses it, Quiet keeps it. History now always passes the thinking bun. Home's first run uses the optional action: the empty state has none, and the first-wallet form follows at once, so Create wallet stays the one primary. The separate "Add a wallet" step is gone. | `EmptyState`, Home's first run, catalogue `home-first-run` |
| A6 | Back slot | `StageHeader` takes `back?: { onPress, label? }`, a 44 pt "‹ Back" button and the stage's first control. The record screen uses the stage: "Entry", or "Edit entry" while editing, when Back is left out because Cancel leaves the edit. | `StageHeader`, Record |
| A7 | Kit chips and search | `src/ui/FilterChip.tsx` (`FilterChip`, `FilterChips`, `ChipOption`) and `src/ui/SearchField.tsx` (`label`, `value`, `onChangeText`, `placeholder?`, `clearLabel?`). History imports both from the kit. | `FilterChip`, `SearchField`, History |
| A8 | One dialog | On the web, react-native-web's `Modal` already makes its full-screen layer `role="dialog"` with `aria-modal`. `Sheet` now names that layer and drops the panel's own role there; on native the panel stays the dialog. DateChip's private `CalendarSheet` is replaced by `Sheet`: one named dialog with its heading, the bottom safe area padded, and the same backdrop and ways to close. | `Sheet` "exactly one dialog", `DateChip` "the calendar is the kit sheet" |
| A9 | Chosen day | `aria-pressed` on the web, where ARIA ignores `aria-selected` on a button; native keeps `aria-selected`, which its readers say. | `DateChip` |
| A10 | Keyboard actions | On the web, a row with actions gets a sibling More button named "Actions for {title}" (44 pt, `aria-expanded`). It opens the same toolbar and moves focus to its first action. It is never inside the row's own button. | `RecordRow`, History |
| A11 | Pace phase | The kit's `BudgetPace` has `phase?: 'before' \| 'during' \| 'after'`, and `toKitPace` passes it through. After the month: "฿X under budget" (or "Right on budget") with "฿spent of ฿limit", or "฿X over". No On track or Tight, no days and no per day. | `budgetWords`, `paceAdapter` |
| A12 | Vietnamese dates | The receipt's date row and the conflict rows use `fullDateLabel` from `src/ui/dateStep.ts`, as the day headers do ("Chủ Nhật, 27 tháng 9, 2026"). This was already so since R3 History; a Vietnamese test now pins it, and the `zzDates` probe prints the same words. | Record "in Vietnamese the receipt date…" |
| A13 | Typed routes | `recordRoute(id, edit?)` returns `{ pathname: '/spend/record/[id]', params: { id } }` (plus `mode: 'edit'`) and `copyRoute(id)` returns `{ pathname: '/spend/add', params: { copyOf: id } }`, both typed `Href`, with no casts. `recordHref` and `copyHref` are the same functions; Home, History and Record use them. | History, Home and Record `router.push` assertions |

- **Typed routes, how to check:**
  - **Clean checkout:** `npm run typecheck:app` from the root. Without generated route types, hrefs are checked as strings.
  - **With route types, no server:** `npm run typecheck:routes -w gogospend-app`. It generates the declarations with Expo's own generator into a temporary folder inside `.expo/`, runs `tsc` with them, and removes the folder. It never reads `.expo/types/router.d.ts`, so a stale copy cannot hide a broken link.
  - **As a developer machine has them:** in `apps/app`, run `CI=1 npx expo start --port 8099` until it prints "Waiting on http://localhost:8099", then stop it. Make sure no Metro is left (`lsof -nP -iTCP:8099 -sTCP:LISTEN` prints nothing). Run `npm run typecheck:app` from the root, then delete `apps/app/.expo` and `apps/app/expo-env.d.ts`.
  - **Negative control:** with the generated types, `router.push('/spend/record/' + id)` fails with TS2345, so the check does narrow hrefs.

## Review fixes: redesign screens

Built together with the kit polish above, in one change. These fix the screen-level findings of the independent review, and wire the fields that the logic fixes added (see "For the screen agent" under "Review fixes: redesign logic").

- **B1: a Quick add draft whose save may have committed could be edited and then shown as "Saved" with an amount the server never held. Fixed.**
  - **Rule:** once any attempt of a draft is unconfirmed, the draft stays frozen with its record id and command key until that command's outcome is known. A refusal that comes before the server processes the command (`signed_out`, `session_changed`, `policy_required`, `upgrade_required`, `unsupported_platform`, `schema_unsupported`, `rate_limited`; `refusedBeforeProcessing()` in `screens/v1/parts.tsx`) says nothing about the first attempt, so the draft stays frozen. Try again resends the same command. It is disabled while resending must wait (a changed session, an update).
  - **`isOwnCreate`:** Jotbun's copy (`error.current`) is compared with the draft field by field (`ownCreateMatches`). The same details show the saved moment. Other details are a conflict ("This entry is already saved in Jotbun as ฿60.00. Check it in History."), never "Saved", and nothing more is sent.
  - **The same rule** holds in v1's `AddTransactionScreen` and in Home's first-wallet form.
  - **Tests:** Quick add (signed out; then terms, a changed session and an update; and a create that meets its own record with other details), v1 Add, and Home's first wallet. Probe QA-1 passes: the keypad stays frozen after the refused retry.
- **M2: History showed the loaded part of the oldest loaded day as that day's total. Fixed.** The model marks that day `partial` (`pageEdgeDay`). With each load, the screen reads that day's exact confirmed totals from the server (the same filter, that one day, one row) and shows them; if they cannot be read, the header shows no total. A day before the edge (only a draft can show there) shows no total, and neither does the edge day under a search. Test and probe History-1: "Money out ฿30.00" before Load more.
- **M3: Review on Home could only open drafts in the five days shown. Fixed.** The Review sheet is built from the model's `openDrafts` (`needs_look`), in the ready and the offline model alike. When some waiting drafts are older than the days shown, the saving banner offers Show all: a "Waiting to sync" sheet with every waiting draft, and Remove for one never sent. Test and probe Home-1.
- **Home loader:** today is read with `readWholeDay` (up to 20 pages; it never throws), and earlier records are cut with `earlierWholeDays`. `oldestWholeDay` and `todayComplete` go into `HomeData`. A partial today drops the receipt's total and says "Today has more entries than Home shows. History has them all." Probe Home-2 passes; Home-3 passes as before.
- **Banner:** `syncPlan` counts `sending` as checking through `moneyGroupOf`, as the rows, v1's `SyncStatus` and the pace do. A new test: one unsent and one sending draft read "Saving 1 entry…" and "Checking 1 entry with Jotbun before sending it again".
- **M4: the History and record routes had no tests. Fixed.** `SpendRoutes.render.test.tsx`: `app/spend/all.tsx` picks legacy first, then History under `core`, else the current list. `app/spend/record/[id].tsx` redirects to `/spend/all` with the flag off, under `catalogue` only, in the legacy build or without an id, and otherwise opens the record in view or edit mode.
- **m2:** the record edit's amount line shows and says the keypad's live result ("100 ÷ 3" over "฿33.33", spoken "Amount, 100 ÷ 3 = ฿33.33"). It is a polite live region.
- **m3:** Home's stage says the month's confirmed money in and out again, quietly, as v1's Home did ("Money in ฿28,000.00 · Money out ฿12,450.00"). Drafts are never added in.
- **m4:** after a definite restore refusal, the record screen reads the entry again, so a deleted entry never looks live.
- **m5:** a test pins the record edit's double-submit guard: two Save presses in one tick send one edit. The R3 review's "no acting guard" mutation survived before; it is caught now.
- **m6:**
  - Quick add's amount is a polite live region.
  - Home's banners and sync lines share one polite live region and are announced once, as one sentence. No banner is a live region of its own inside it (`SyncBanner` takes `live={false}`, and `syncBannerLine()` gives its words).
  - TabBar's Add button is outside the tablist. The list keeps a hidden space in its centre, and the button is drawn over it from outside, so screen readers meet the tabs, then Add.
  - Sheets return focus to what opened them when they close. On the web this is react-native-web's modal focus trap, pinned by a `Sheet` test. On native it is the platform's own modal presentation; see SKIPPED.
- **m7: History search redrew every row on every keystroke. Fixed.**
  - The list is a virtualized `FlatList`. The stage is its header; the search is its first item and stays sticky (`stickyHeaderIndices={[1]}`); then come the controls, then each day's header and rows. Load more and the empty month are its footer. It draws 24 items before it has measured the screen, then keeps 11 screens' worth around the one in view.
  - Each row is a memoized `HistoryRow` built from plain values, with one row-actions object for the screen's life. A keystroke, a banner or a re-read redraws no row whose words did not change.
  - The model and the rows follow the search through `useDeferredValue`, as before.
  - **Tests:** `HistoryList.render.test.tsx`. Mounted as the app mounts it, a 50-row page draws only a first window. Typing "r", "re", "ren", "rent" draws no row again, and the matching row stays. Re-reading the month draws no row again, and a changed rent redraws only its own row.
  - **Test harness:** happy-dom has no layout, so a virtualized list there never grows past its first window. `src/ui/listWindow.tsx` adds `DrawWholeLists`, which `HistoryTestHarness`'s `mountScreen` wraps around the screen by default (`wholeLists: false` mounts it as the app does). The app never uses it.
  - The `zzPerf` probe's model cost is unchanged: 7 keystrokes over 2,000 rows in 32 to 39 ms in Node.
- **m8:** Move all offers the wallet's balance less what drafts waiting on this device take out of it, plus what they bring in. Drafts being checked may already be in the server's balance, so they are left out, as the pace leaves them out. Add another reloads the balances in place.
- **m9:** `BunIntensityProvider` treats a secure-store read that rejects as "no stored setting". A write that rejects still applies the choice for the session.
- **Nits:**
  - **Sign-out erase:** `DeviceDiaryProvider`'s `eraseWithDiary` also erases the bun intensity and the cheer day, after the import draft. A setting that cannot be erased never stops it. A new test calls the hook itself.
  - **Search summary:** announced once it has stayed the same for 800 ms (`useSettledAnnouncement`), not once per keystroke. The web reads the polite live region.
  - **Copy by URL:** a deleted record is not copied; Quick add says "This entry isn't available to copy."
  - **"None"** (the conflict panel's empty fields) belongs on R3 History's list of new strings. It is in the list below.
- **New English strings** (not in the catalogs, so English in th and vi until E2): `Entry`, `From {name}`, `To {name}`, `Show all`, `Right on budget`, `under budget`, `{amount} under budget`, `{amount}, checking`, `This entry is already saved in Jotbun as {amount}. Check it in History.` and `Today has more entries than Home shows. History has them all.` Also `None`, which R3 History used without listing it. Reused as they are: `Update Jotbun to send`, `checking…`, `Back`, `Waiting to sync`, `Create wallet` and `Edit entry`.
- **Probes** (`rdr/probes` in the scratchpad, copied in for the run and removed afterwards): 10 of 10 pass.

  | Probe | Result |
  | --- | --- |
  | QA-1 | PASS: the keypad stays frozen after the refused retry, so the saved moment can only show what the server holds |
  | Home-1 | PASS: Review opens the sheet with Discard for a draft older than the days shown |
  | Home-2 | PASS: 27 September is left out (the page cut it), so it is never shown without its confirmed money |
  | Home-3 | PASS: "฿9,880.00 left" |
  | History-1 | PASS: "Thursday 10 September 2026, Money out ฿30.00" before Load more |
  | History-2 | PASS (it prints the summary per keystroke; the announcement is the settled one) |
  | `zzDates` | PASS; the en, th and vi words are printed |
  | `zzKeypadFuzz` | PASS, both tests |
  | `zzPerf` | PASS (it prints the model's cost) |

- **Mutation check** (`kpf-mutate.py` in the scratchpad, one mutation at a time, every file restored byte-identical): 35 of 35 caught. The banner mutation survived the first run, so the sending-banner test was added, and it is caught now.

  | Mutation | Failing tests |
  | --- | --- |
  | B1: Quick add unfreezes after a refusal before processing | 4 |
  | B1: v1 Add unfreezes after a refusal before processing | 1 |
  | B1: Home's first wallet unfreezes after a refusal before processing | 1 |
  | B1: `refusedBeforeProcessing` always false | 6 |
  | B1: own create with other details shown as Saved | 1 |
  | M3: Review and Show all built from the days shown, not `openDrafts` | 2 |
  | Minus: `Amount` signs an expense with a hyphen | 10 |
  | Minus: `RecordRow` back to its own hyphen | 3 |
  | Minus: `DayHeader` back to its own hyphen | 5 |
  | Balance: an unknown balance guessed as zero in `WalletPicker` | 4 |
  | Balance: Quick add guesses zero for a device wallet | 2 |
  | Dialog: the panel is a second dialog on the web | 10 |
  | Dialog: the web layer left unnamed | 8 |
  | m7: History rows not memoized | 2 |
  | m7: History list not windowed | 1 |
  | M2: the cut day shows its loaded part as the total | 1 |
  | M4: the record route ignores the flag | 1 |
  | M4: History checks the redesign before legacy | 1 |
  | Banner: sending counted as saving | 1 |
  | m2: the edit amount drops its live result | 1 |
  | m4: no reload after a definite restore refusal | 1 |
  | m5: no double-submit guard on the record edit | 1 |
  | m6: Quick add's amount not a live region | 1 |
  | m8: Move all ignores waiting drafts | 1 |
  | m9: a secure-store rejection escapes | 1 |
  | Nit: the sign-out erase leaves the bun settings | 1 |
  | Nit: the settled announcement says every keystroke | 1 |
  | Nit: a deleted record can be copied by URL | 1 |
  | A2: Home maps update-to-send to saving | 1 |
  | A5: the art space kept with the bun off | 2 |
  | A9: the chosen day keeps `aria-selected` on the web | 1 |
  | A10: no keyboard path to row actions | 2 |
  | A11: a finished month reads as a pace | 2 (unit) |
  | A12: the receipt date back to the model's Intl words | 8 |
  | A13: the record route back to a hand-built string | 4 |

- **App gate** (from the worktree root):

  | Step | Before (`e14541a`, the work in progress) | After |
  | --- | --- | --- |
  | typecheck:app, no route types | PASS | PASS |
  | typecheck:app, with `.expo/types/router.d.ts` from `expo start` | PASS | PASS |
  | `typecheck:routes` | PASS | PASS |
  | test:unit | PASS, 424 | PASS, 424 |
  | test:render | PASS, 536 in 51 files | PASS, 541 in 52 files |
  | export:web (`--max-workers 2`) | not run | PASS |
  | `git diff --check` | clean | clean |

- **Test assertions changed, and why:**

  | File | Changed | Why |
  | --- | --- | --- |
  | `ui/RecordRow.render.test.tsx` | 2: `-฿65.00` → `−฿65.00` | A1 |
  | `ui/DayHeader.render.test.tsx` | 3: `-฿420.00` and `-฿65.00` → U+2212 | A1 |
  | `ui/kitUnification.render.test.tsx` | 1: the day's `-฿1,234.56` → `−฿1,234.56` (the untyped `-฿65.00` balance is kept) | A1 |
  | `screens/redesign/HistoryScreen.render.test.tsx` | 2: `-฿12,268.00` → U+2212 | A1 |
  | `screens/redesign/HomeScreen.render.test.tsx` | 1: one `−฿120.00` → two (the row and the day's total) | A1: the row now draws U+2212 too |
  | `dev/catalogue/CatalogueScreen.render.test.tsx` | 1: `-฿247.00` → `−฿247.00` | A1 |
  | `screens/redesign/HistoryScreen.render.test.tsx` | 1: the paused row `…, saving, Cash` → `…, Update Jotbun to send, Cash` | A2 |
  | `screens/redesign/HomeScreen.render.test.tsx` | 1: the same for Home's paused row | A2 |
  | `screens/redesign/HomeScreen.render.test.tsx` | 3: `openFirstWallet` no longer expects the form hidden or presses Add a wallet, and the Thai first run no longer presses it | A5: first run is one step |
  | `screens/redesign/HomeScreen.render.test.tsx` | 1: "no svg at all" with the bun off → no svg except the form's 24-unit kit glyphs | A5: the form, with its date chip, now shows at once |
  | `dev/catalogue/CatalogueScreen.render.test.tsx` | 1: `home-first-run` expects Create wallet, and no Add a wallet | A5 |
  | `ui/Sheet.render.test.tsx` | 6, in 3 tests: the panel's colour, radius, padding and slide are read from `sheet-panel`, inside the one dialog | A8 |
  | `ui/DateChip.render.test.tsx` | 1: `aria-selected` → `aria-pressed` | A9 |
  | `ui/paceAdapter.test.ts` | 9: `toKitPace` results gain `phase` | A11 |
  | `ui/paceAdapter.test.ts` | 1: after the month, `['฿10.00 left', 'On track', null]` → `['฿10.00 under budget', '฿300.00 of ฿310.00', null]` | A11 |
  | `screens/redesign/HistoryScreen.render.test.tsx` | 5: `router.push` strings → href objects | A13 |
  | `screens/redesign/HomeScreen.render.test.tsx` | 3: the same | A13 |
  | `screens/redesign/RecordScreen.render.test.tsx` | 2: the same | A13 |
  | `screens/redesign/RecordScreen.render.test.tsx` | 1: `Amount, 0.1 + 0.2` → `Amount, 0.1 + 0.2 = ฿0.30` | m2 |
  | `ui/TabBar.render.test.tsx` | 2: Add was in the tablist's order → it is outside, over the hidden centre space | m6 |
  | `screens/redesign/SpendLayout.render.test.tsx` | 3: the same for the spend layout's bar | m6 |

  Everything else is added. Two test supports changed without changing an assertion: `HistoryTestHarness`'s `mountScreen` wraps the screen in `DrawWholeLists` (m7), and the erase test's `expo-secure-store` mock gains the keychain constant that `DeviceDiaryProvider` reads when it loads.
- **Catalogue:** every section still reaches its state, and its render test passes. One catalogue file changed: `homeSections.tsx`'s first-run script waits for Create wallet instead of Add a wallet (A5).
- **Left as they are:**
  - The record screen's amount for an update-to-send draft says "saving", because `Amount` has no update-to-send state. Its Status row says "Update Jotbun to send".
  - The sign-out erase clears the stored bun settings, but `BunIntensityProvider` keeps the choice in memory until it remounts. The erase runs only with a device diary (iOS and Android); the web keeps no diary.
- **SKIPPED (E2):**
  - VoiceOver and TalkBack: focus back on the opener after a sheet closes (native relies on the platform's modal), the row actions menu where native has no More button, the single banner announcement, and the live amount lines;
  - the sticky search and the windowed list on iOS and Android, including Load more far down a long month;
  - simulator screenshots of the changed states in light and dark, in TH, EN and VI, at 320 pt.

## Catalogue tour mode (for the E2 screenshots)

- **What it does:** `?tour=<ms>` (1,000–10,000) steps the dev catalogue to the next section on a timer and stops at the last one. A script can then screenshot every section in order from one deep link, for example `gogospend://dev/catalogue?section=amount&theme=light&locale=en&tour=3000`.
- **Parsing:** `parseCatalogueTour` is a separate parser, so the existing `parseCatalogueParams` contract is unchanged. Anything outside the range, or not plain digits, means no tour.
- **RED → GREEN:**
  - `params.test.ts`: 1 of 6 failed against a stub returning `null`; now 6 of 6 pass.
  - The render test "a tour steps through the sections…" failed and now passes.
  - "Without a tour nothing moves" held on the stub, as it should.
  - The catalogue render suite: 94 of 94.
- **Restarting a tour:** re-opening the same link did nothing, because the catalogue only noticed a new link when its section, theme or locale changed. The first recording stayed on the last section for all 471 frames. The link is now identified by every param, so adding a fresh `&run=<n>` restarts the tour from its section.
  - RED: "re-opening the same link with a new run restarts the tour from its section" failed (1 failed, 2 passed).
  - GREEN: the catalogue render suite, 95 of 95; `tsc` clean.
- **No skipped sections:** the Thai recording kept only 37 of 40 screen states. Some sections lasted under a second and others 8–9 s, because an interval's late ticks fire back to back when the JS thread is busy. In-app checks in Thai (a keypad tap, the › button) responded at once, so this is a capture artifact, not a slow Thai screen. Each step is now a timeout scheduled after the section it leaves has rendered.
  - RED: "a late tour step never skips a section" moved two sections on one late advance.
  - GREEN: the catalogue render suite, 96 of 96; `tsc` clean.
  - Mutation: dropping the section from the effect's dependencies fails both tour tests.
  - The stop-at-the-last-section check now opens that screen with real timers (its settle wait polls with `setTimeout`), then starts the tour under fake timers.
- **Dev only:** like the rest of the catalogue, it never reaches production bundles.

## E2 checkpoint: simulator captures (19 October 2026)

- **Where:** the iOS simulator "GoGoCash Expo58" (iOS 27.0, 402 × 874 pt), a dev client on Metro with `EXPO_PUBLIC_REDESIGN=all`, driven by catalogue tour links (`tour=5000`) and recorded at one frame per second. Each section's last settled frame was kept.
- **What:**
  - light EN and dark EN: all 74 sections;
  - light TH and light VI: the 40 screen states (35–74);
  - scrolled frames for four states whose message sits below the fold.
- **Checks on the frames:**
  - Every kept frame's header matches its section (all four contact sheets read back).
  - VI "History: search" was caught mid-load (spinner), so it was recaptured on its own.
  - The host was under load (load average about 13, with an Android emulator running), which made some sections slow to mount. In-app checks in Thai responded at once.
- **Findings for the owner (not fixed; E2 decisions):**
  1. **Save is below the fold on Quick add.** From the title to the bottom of Save entry is about 914 pt. The 402 × 874 pt phone has about 778 pt usable, so the keypad pushes Save entry and the save message (unconfirmed, device error) off-screen until the user scrolls. Record edit has the same layout. This is measured in the catalogue, and still needs confirming on the real route, which needs a signed-in session. Options: pin Save, together with its message, above the home indicator, or shorten the keypad rows.
  2. **Bun peek covers field text** at the top-edge centre placement (over "the" in "Lunch with Mai at the market") and at the left edge (over the "C" of "Cash").
  3. **TH and VI show the new copy in English.** This is expected: the locale catalogs stay frozen until E2 is approved. Examples are "Today's receipt", "On track", "Move", "More details", "History", "Entry", and "Yours / On the server".
  4. **Small inconsistencies:**
     - the same "Not confirmed yet" message is regular weight in Quick add but bold in Record;
     - Record edit shows "฿12,268" while the record shows "฿12,268.00";
     - the History type and category chip rows cut off mid-word at the edge, although they scroll sideways.

## E2 follow-up: actions within reach (findings 1 and 4)

- **Quick add:**
  - **Footer:** Save, Try again or Done is pinned in a footer under the scrolling form (`ActionFooter.tsx`), with any save problem right above the action it is about.
  - **Top row:** the form opens on the type switch with Close beside it, as plan §6.1 lays it out (it has no title row). "Add an entry" stays a heading for screen readers. This is a visible change for the owner to review at E2.
  - **Spacing:** the gaps between groups go from 16 to 12 pt.
  - **Height budget (402 × 874 pt):** 62 pt top inset, then the form from the type switch to the keypad's last row. That comes to about 759 pt, against a footer that starts at about 780 pt. The 56 pt keys stay; keeping them was a kit decision, pinned by a test.
- **Record edit:**
  - The message and the actions are pinned the same way, with Cancel and Save changes side by side.
  - The amount shows exactly ("฿12,268.00", where it showed "฿12,268"), with what was typed above it when that has a decimal point, as Quick add does.
- **One way to say a save problem:** Quick add now uses the same bold `Notice` alert as Record. It announces itself, so Quick add's own announcement of the message is gone.
- **Keyboard:** both pages are a `KeyboardAvoidingView` (iOS: padding), as `ProfileSubPageFrame` is, so the footer rises above the keyboard while merchant or note is typed. Not yet seen on device.
- **RED → GREEN:**
  - RED: four new tests failed, for the Quick add footer and its bold message, Close on the type-switch row with a screen-reader-only title, the Record edit footer, and the exact edit amount. The fifth new test, "the receipt view has no footer", is a guard.
  - GREEN:
    - Quick add 79 of 79;
    - Record 32 of 32;
    - catalogue, kit and screens 457 of 457;
    - `tsc` clean.
  - Two tests pinned the old layout and were updated: the locale/theme matrix's visible-title style, and the catalogue's page padding.
  - Mutation: drawing the footer inside the scroll view fails the pinned-footer test.

## Catalogue: `chrome=off` for phone-size screenshots

- **Why:** the catalogue's 234 pt header sits above every screen section, so a frame never shows whether a screen fits a phone. With the pinned footer, the header pushed Quick add's last keypad rows under Save in the catalogue, although the real screen fits.
- **What:** `?chrome=off` hides the header. Screen sections then pad by the real status-bar inset, and kit sections by the same inset at the top. Move between sections with a tour or a new link. Without the param, nothing changes.
- **RED → GREEN:**
  - `params.test.ts` 7 of 7;
  - the catalogue render suite 97 of 97;
  - `tsc` clean.
  - Mutation: zeroing the top inset regardless fails the new render test.

## E2 follow-up: receipts (19 October 2026)

- **Bun peek** (finding 2), fixed on its own branch by an agent and merged in `45e87ff`:
  - `BunPeek` now places the bun with plain-number offsets: the far side sits at minus the bun's depth, and centring spans the edge.
  - On device, the old percentage offsets did not resolve against an auto-sized card, so the bun fell back onto the card's text.
  - RED: 9 of 14 failed on a no-percentages check. GREEN: 329 of 329 across the mascot, catalogue, Home and kit suites. Mutation: putting `bottom: '100%'` back fails 3 tests.
  - The kit stage-header specimen's top margin grows from 24 to 32 pt, because the peek is 26.25 pt deep.
- **Phone-size captures:**
  - every section was opened by its own `chrome=off` link and screenshotted after 8 s, on the "GoGoCash Expo58" simulator at 402 × 874 pt;
  - Home through Record (34–74) in light EN and dark EN, and the 40 screen states in light TH and light VI.
- **What they show:**
  - Quick add fits with the whole keypad above the pinned Save entry in all four variants.
  - With a save message in the footer (device error, or Record edit unconfirmed), the keypad's last row scrolls under the footer. In the unconfirmed states the keypad is frozen anyway.
  - Record edit keeps Cancel and Save changes side by side in reach.
  - The four Bun peek specimens sit outside their cards, and Home's stage bun is unchanged.
- **Gate:**
  - **App steps on `c39dd03`, all passing:**
    - typecheck and typecheck:app;
    - test:app 28, test:unit 426, test:dev 7, test:render 560;
    - export:web and `git diff --check`.
  - **API and database steps:** they passed in the same session's full gate: test:api 929, test:db 681, test:ops 107, the API build and the release graph. No file outside `apps/app` and `docs` has changed since `4a2a447`.
  - **Stale test databases:** 14, not ours, left alone.

## E2 checkpoint 1 approved: the core loop is switched on (19 October 2026)

- **Approval:** the owner approved the E2 screenshots on 19 October 2026: "E2 approved. Go ahead with the Thai and Vietnamese translations for the new copy and switch the redesign on behind the flag/routes as planned."
- **Flag:** `isRedesignEnabled` now has an approved list, holding `core`. An approved area is on by default; the catalogue stays opt-in. `EXPO_PUBLIC_REDESIGN` is still a comma list:
  - `off` (or `0`) switches every area off, back to the current v1 screens;
  - `-core` switches the core loop off alone;
  - `<area>` or `all` switches an area on.
  - An empty or unset value used to mean "off" and now means "approved areas on".
- **Routes:** `/spend`, `/spend/add`, `/spend/all`, `/spend/record/[id]` and the Home/History tab shell now show the redesign by default. The legacy flag (`EXPO_PUBLIC_LEGACY_SPEND=1`) still wins over the redesign.
- **RED → GREEN:**
  - `featureFlags.test.ts`: 3 of 3 failed against "off unless set" and now pass.
  - The route, layout and Quick add route tests (5 failed) now test the default, `off` and `-core`. They pass with the catalogue route tests, 99 of 99.
  - The full render suite: 561 of 561.
- **Copy:**
  - 137 new English strings entered `en.json` under `redesign*` keys (`cdcb821`). They were found by a static scan of `tc()` literals and a runtime capture of catalog misses across the redesign render tests. Not included: the dev-only catalogue, the import review's draft copy (its flag stays off), login and legacy screens.
  - `catalogs.test.ts` fails until `th.json` and `vi.json` translate every key with the same placeholders. It also checks that every `tc()` literal in the redesign is in `en.json`.
  - Vietnamese also lacked 110 existing keys, 93 of which the redesign shows ("Save entry", "Try again" and others). They are being filled with the new copy.

## Thai copy in, Vietnamese held (19 October 2026)

- **Thai:**
  - An agent translated the 137 new keys into `th.json`, reusing the catalog's existing terms (merged in `a99e2c0`).
  - Glossary: wallet กระเป๋าเงิน, entry รายการ, Move โอนเงิน, budget งบประมาณ, saving กำลังบันทึก, checking กำลังตรวจสอบ, needs a look ต้องตรวจสอบ, over เกินงบ, left คงเหลือ, receipt ใบเสร็จ.
  - **For a native speaker to review:**
    - Move = โอนเงิน, which can sound like paying someone; ย้ายเงิน is the alternative;
    - It happens = เกิดขึ้นได้กับทุกคน;
    - Tight = ตึงมือ;
    - Keep what's on the server = ใช้ข้อมูลบนเซิร์ฟเวอร์;
    - "All wallets" may be tight on a chip.
- **Vietnamese:**
  - The owner decided not to translate Vietnamese for now, so its translator was stopped and nothing of it was merged.
  - `vi.json` is unchanged: keys it lacks, including the 110 older ones, show English.
  - `catalogs.test.ts` now requires every key only in Thai. For both catalogs it still checks that every key exists in `en.json` and keeps its placeholders.
- **Found while translating, fixed test-first:**
  - **The keypad's "+" was spoken "Plus" in Thai.** Lookup is by English text, and "Plus" is also the membership tier, which stays "Plus" in Thai. The arithmetic keys now say "Plus sign" and "Minus sign" (Thai เครื่องหมายบวก / เครื่องหมายลบ). RED was a Keypad test in Thai.
  - **Three History summary templates were missing from `en.json`:** "1 entry, {out} out, {in} in", "{count} entries, {in} in" and "{count} entries". They showed English in every locale. A `historyModel.test.ts` test now walks every `summaryLine` branch and requires each template to be in `en.json` with Thai. RED: "1 entry, {out} out, {in} in" is not in en.json.
- **Tests that expected the English fallback in Thai:** 11 of them now compute the expected Thai with `translateCopy`. That covers the keypad's spoken names and the `{label}, {value}` join, which in Thai is a space.
- **Results:**
  - test:unit 432 of 432; test:render 561 of 562.
  - The one failure, a different Quick add test each time, passes alone: 79 of 79, three runs. A History long-press test did the same: 30 of 30, six runs.
  - These are timing flakes under a busy host, not failures of this change.
- **Gate on `f07c693`, all passing:**
  - typecheck and typecheck:app;
  - test:api 929, test:db 681, test:app 28, test:unit 432, test:dev 7, test:ops 107, test:render 562 (no flakes this run);
  - the API build, export:web and `git diff --check`.
  - Stale test databases: 14, not ours.
- **Simulator:**
  - Metro ran with `EXPO_PUBLIC_REDESIGN=catalogue` only, so the core loop was on by default.
  - All 40 Thai screen states were shot at phone size (`chrome=off`).
  - The redesign reads Thai throughout. The only English left is the sample user data: wallet names, custom categories and notes.
  - History's type and category chip rows still scroll sideways and cut off mid-word at the edge.

## R4 (Planning): client write adapters

- **What:** the nine commands the server already has, in `resources.ts`:
  - `setBudget(month, input, key, existing?)`: PUT `/v1/budgets/:month`. It creates without If-Match, and replaces with the version read.
  - `updateWallet`, `archiveWallet` and `unarchiveWallet`.
  - `createCategory`, `updateCategory`, `archiveCategory` and `unarchiveCategory`.
- **How they work:**
  - Each is an immutable command with its own key and the command schema.
  - A change sends If-Match with the version the screen read, and archive and unarchive send `{}`.
  - An ack must be for this command and this entity. For a budget create the server derives the id (an id derived from the account and the month), so only the command is checked.
  - A malformed month or id is refused before anything is sent, as a rejection.
- **The fake:**
  - `createFakeResources` now holds budgets (by month) and custom categories (both seedable).
  - It follows the server's rules: version conflicts carry the current entity; you can't archive a wallet with a non-zero balance; you can't change an archived wallet or category; a custom category needs a label; you can't create a second budget for a month; category limits can't exceed the overall budget.
  - The month summary reports budget use when a budget is seeded. Without one it is `null`, as before.
- **RED → GREEN:**
  - Two `resources.test.ts` tests failed, because the adapters didn't exist, and now pass: 19 of 19. They cover the method, path, key, If-Match and exact body of all nine commands, and an ack for another entity, a bad month and a bad id.
  - Mutation: dropping If-Match from wallet archive fails the first test.
  - test:unit 434 of 434; test:render 562 of 562.

## R4 groundwork: the planning area, routes and ways in

- **Flag:** `EXPO_PUBLIC_REDESIGN=planning` (or `all`) switches R4 on. It stays opt-in until E2 checkpoint 2.
- **Routes:** `/spend/budget`, `/spend/wallets` and `/spend/categories` show their screens only under the area, never in the legacy build, and otherwise redirect to `/spend` (`PlanningRoutes.render.test.tsx`).
- **No new tab (decision D7):** the recommended answer, which the owner accepted, keeps the tab set small. The first groundwork commit added a Budget tab and the follow-up removed it.
  - Budget opens from Home: "Set a budget" without one, "See budget" on the month card.
  - Wallets opens from Home's wallets ("Manage wallets") and from Budget.
  - Categories opens from Budget.
  - All three take the whole height with their own Back.
  - The links live in `planning/PlanningLinks.tsx` and draw nothing with the area off, so the approved Home is unchanged.
- **Copy:** R4 code lives in `planning/` folders. The catalog guard skips them until E2 checkpoint 2, so their English stays out of the catalogs until approval, as R3's did.
- **Tests:**
  - RED: the Budget-tab layout test, the routes test (no route files) and the Home links test.
  - GREEN: the redesign screens 207 of 207; `tsc` and `typecheck:routes` clean.
- **Stale route types:** `.expo/types/router.d.ts`, generated by an earlier `expo start` before the new routes existed, was deleted; it is gitignored and regenerated. `typecheck:routes` checks hrefs against freshly generated routes.
- **In parallel:** three agents are building Budget, Wallets and Categories, each in its own files under `planning/`.

## R5 groundwork: the insights area, its tab and routes

- **Flag:** `EXPO_PUBLIC_REDESIGN=insights` (or `all`) switches R5 on. It stays opt-in until E2 checkpoint 3.
- **Tab (decision D7):** Insights joins the bar under the area: Home, History, Insights, with Add in the centre. The tab item lives in `insights/insightsTab.tsx`, so its label waits for E2 with the rest of R5's copy. The catalog guard caught it first in the approved tab shell.
- **Routes:**
  - `/spend/insights` (the hub: calendar and streak);
  - `/spend/recap/[month]` (a real `YYYY-MM` only, otherwise back to Insights);
  - `/spend/reminders`.
  Each needs the area and redirects home otherwise. A recap and reminders take the whole height.
- **Tests:**
  - RED: the Insights tab layout test and the routes test (no route files).
  - GREEN: flags and catalogs 9 of 9; the redesign screens 211 of 211; `tsc` and `typecheck:routes` clean.

## R6 groundwork: the account area, Settings from the header, and its routes

- **Flag:** `EXPO_PUBLIC_REDESIGN=account` (or `all`) switches R6 on. It stays opt-in until E2 checkpoint 4.
- **First run and sign-in:** `/` shows the redesigned onboarding and `/login` the redesigned sign-in under the area. Without it they are today's screens, unchanged. Real sign-in still waits for F5 and E1/E2.
- **Settings:** `/settings` and `/settings/privacy` exist only under the area. They need a session: `app/settings/_layout.tsx` redirects to `/login`, and provides the device diary for sign-out.
- **Header action (decision D7):**
  - `StageHeader` gains an optional `action`, at the top right on Back's row.
  - Home's header holds a Settings button (`account/SettingsLink.tsx`). It draws nothing with the area off.
- **Copy:** R6 lives in `account/` folders, which the catalog guard skips until checkpoint 4.
- **Tests:**
  - RED: the flag, the header action, Home's Settings button and the routes (no files yet).
  - The routes test mocks today's login frame, which pulls in native-only modules.
  - GREEN: test:unit 437 of 437; test:render 575 of 575; `tsc` and `typecheck:routes` clean.

## R4 and R5 merged; R6 and R7 under way

- **Merged agent branches:**
  - Budget (`196c50f`), Categories (`77ab368`) and Wallets (`73c6a28`);
  - Insights (`f76e816`), Month recap (`c2a0d2f`) and Reminders (`d65c3b9`, which adds weekday reminders to the S4 service with fixed ids per weekday).
  Each followed RED → GREEN → mutation (5 to 14 mutations per screen, all caught). Their receipts are in each merge's branch report.
- **Integration fixes:**
  - `useGoBack` takes the screen's parent as its fallback: Home for Budget and Wallets, Budget for Categories, Insights for a recap and for reminders.
  - All 75 new catalogue sections are registered (Planning 75–120, Insights 121–149).
- **Gate on `3a13660`, all passing:**
  - typecheck and typecheck:app;
  - test:api 929, test:db 681, test:app 28, test:unit 545, test:dev 7, test:ops 107, test:render 906;
  - the API build, export:web, `git diff --check` and `typecheck:routes`.
- **E2 checkpoints 2 and 3 screenshots are blocked:** the "GoGoCash Expo58" simulator and Xcode's DerivedData (the dev build) were removed outside this session. Rebuilding is the owner's call.
- **R7 groundwork:**
  - An `import` area, opt-in until E2 checkpoint 5, covers the import journey and receipts.
  - `/spend/import` keeps the legacy screen in the legacy build, shows the redesigned journey under the area, and otherwise redirects to `/spend`.
  - Record renders `import/RecordReceipt`, which draws nothing with the area off.
  - The server's `IMPORT_UPLOADS_ENABLED` stays off.

## R6 merged: first run, sign-in, Settings and privacy

- **Merged:** onboarding and sign-in (`db5bdd5`), and Settings and privacy (`44bab78`). Both were test-first, with every mutation caught.
- **Integration:**
  - Onboarding's first reminder is a `ReminderPreferenceInput` (every day unless days are given), so it type-checks against R5's weekday service.
  - Onboarding builds the device service with the shared `createAppReminderService` instead of a copy of its wording.
- **A false promise removed:** "Not even Jotbun can read your diary" was untrue, because the server builds the export from the records. The fourth promise on Privacy, and the kit catalogue's sample, now say "Export or delete your diary any time.", which the app keeps. A test asserts the old claim is gone. **The owner should confirm the promise wording at E2 checkpoint 4.**
- **What the build can't do yet:**
  - **Language:** there is no setter (`app/_layout.tsx` reads the phone's language once), so Settings shows it read-only.
  - **Sign-in method:** the session doesn't expose it, so the card says "Signed in".
  - **Re-authentication:** there is none at runtime (no Auth0 until E1/E2 and F5), so requesting an export, deleting the account and signing out everywhere are disabled, each with a reason.
  - **Sign out everywhere:** `POST /v1/me/global-logout` has no client yet.
  - **Downloading an export:** a real file share needs a package such as `expo-sharing`, so the CSV is shared as text.
- **Catalogue:** the first-run (13) and Settings and privacy (27) sections are registered.
- **E2 simulator:** a dedicated "Jotbun E2" simulator (iPhone 17 Pro, iOS 27) was created and the dev client rebuilt, with the owner's approval.
  - On its first launch the dev launcher connected to another project's Metro on 8081, the gogocash monorepo, and showed that project's worklets mismatch.
  - Loading Jotbun's Metro on 8084 needs one tap on "Open in Jotbun?", which waits for the owner to grant this new simulator to the simulator tool.

## R7 receipts merged

- **Merged:** `33b7c43`.
  - `attachments.ts` is the P2c client: retain, replace, remove and grant, and a download checked against the grant's size and SHA-256. It comes with a fake.
  - `RecordReceipt` lets you attach (consent before anything is sent), view (thumbnail and full screen through the grant), replace and remove (behind a "can't be undone" sheet).
  - 14 of 14 mutations were caught.
- **How an existing record gets a receipt:** the photo goes up as an image import. Its preview names the server's cleaned copy (`summary.image.attachment_id`, usable for 24 hours less 2 minutes), and the record retains it. The import is never confirmed and expires. So attaching needs the `imports`, `uploads` and `ocr` gates, and a server whose image parser runs: it can't on Node 24, where the sandbox is unsupported.
- **Integration fix, test-first:**
  - After a receipt change the record is at a new version, but Record kept the one it read, so a later Edit or Delete would have met a version conflict.
  - `RecordReceipt` now calls `onChanged(version)` after each acknowledged change, and Record reads the record again.
  - RED:
    - `onChanged` was never called;
    - Record didn't re-read (`transaction` called 1 time, expected 2).
  - GREEN: 80 of 80; the catalogue 227 of 227.
- **Still needed:**
  - **A binary read on the v1 transport:** the download repeats the session-header logic, and a 401 there isn't refreshed.
  - **A longer timeout for retain and replace:** the server's copy can take 60 s, against the client's 20 s. Try again with the same key is safe.
  - **Hosted checks (E1):** R2 copy, grant and download; the iOS and Android photo pickers (HEIC to JPEG, large photos).
  - **E2 checkpoint 5:** check the consent line "only your signed-in account can open it" against the privacy promises.

## R7 import merged; the R4–R7 gate

- **Import journey merged** (`59b4dcf`): expectation, pick and upload, reading (the `box` bun), label mapping, review with flags, bulk fixes, duplicates kept by default, freeze, batched confirm and the result. It resumes from the device draft, and 6 of 6 mutations were caught.
  - **Catalogue:** 19 import and 15 receipt sections are registered.
  - **Two Thai fixes:** the import-reading and import-saving sections waited for an English stage label. They now build it as StagedProgress says it, so the Thai run passes.
- **Gate on `f4f43ed`:**
  - **Passing:**
    - typecheck and typecheck:app;
    - test:api 929, test:db 681, test:app 28, test:unit 605, test:dev 7, test:ops 107;
    - the API build, export:web, `git diff --check` and `typecheck:routes`.
  - **test:render:** 1202 of 1203. The one failure, Reminders "off", passed alone three times out of three.
- **Timing flakes:** three render tests have now failed once each under load and passed alone: History long-press, Quick add, and Reminders "off". The render suite now waits up to 4 s in `findBy…`/`waitFor` (`src/testing/renderSetup.ts`), instead of Testing Library's 1 s. Full render suite after the change: 1203 of 1203.
- **Still needed before the import flag can turn on:** E2 checkpoint 5; decision 7 (the device draft at rest); the E1 R2 and quarantine proofs; the parser gate and a Node 25+ worker runtime; the import release checklist in `rollback.md`; and E4.

## E2 checkpoints 2–5: simulator captures (19 October 2026)

- **Device:** the "Jotbun E2" simulator (iPhone 17 Pro, iOS 27, 402 × 874 pt), created and its dev client rebuilt with the owner's approval.
  - The build has no Expo dev launcher, so it loads Metro from `RCT_METRO_PORT`. It was rebuilt with `RCT_METRO_PORT=8084`, since port 8081 belongs to another project's Metro (the gogocash monorepo).
- **No "Open in Jotbun?" prompt:**
  - iOS asks that once per app for every link from outside, and the simulator tool's grant never reached this device.
  - So each section is opened inside the app instead: Expo Router's `router.replace`, called through the Metro inspector (Hermes, Chrome DevTools Protocol).
  - Development log toasts (LogBox) are switched off for the captures in the same way, because a persistent "Open debugger to view warnings" toast had covered the bottom of later frames.
- **Found on device:**
  - The import catalogue fixtures made ids with `globalThis.crypto.randomUUID()`, which Hermes lacks, so every import upload threw. They now use `expo-crypto`, and `hermesGlobals.test.ts` guards app code against that global (`e28db6f`).
- **What was captured:** all 149 sections of checkpoints 2–5 (Planning 75–120, Insights 121–149, Account 150–189, Import 190–223), at phone size (`chrome=off`), in light and dark English. Every frame was checked against its section title and for a settled state.
- **Thai is not captured yet:** these areas' copy enters the catalogs only after approval, so their Thai frames would show English.
- **The sheets** are in `e2-review/checkpoints/` (ignored by git), one folder per checkpoint.
