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
