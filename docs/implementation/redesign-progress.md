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
