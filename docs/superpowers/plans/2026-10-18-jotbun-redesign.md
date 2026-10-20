# Jotbun App Redesign Plan: "Bun diary"

> **For agentic workers:** execute task by task, following the same process as the backend plans (see [handover](../../implementation/handover.md) §4): behavioural RED → GREEN → full gate → receipts → independent review. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Redesign every screen of the Jotbun app so it matches its brand (a cute lavender steamed bun holding a receipt), makes manual entry fast, and keeps money numbers clear and trustworthy.

**Direction (owner's choice, 18 October 2026): a mix of three directions.**

| Part | Comes from | Where it applies |
| --- | --- | --- |
| Base | Option 1, *Bun buddy*: a lavender stage, cream cards, black outlines and pill buttons, and the bun at moments | Overall look |
| Receipt slip | Option 2, *Receipt diary*: a dashed paper slip with dotted rules and serif amounts | Record detail, the day's records, the printed month recap |
| Calm data | Option 3, *Calm and clear* | Dense screens: history, import review, settings, privacy. These stay neutral and quiet. |

**Research:** about 40 Mobbin searches across every flow (18 October 2026). The strongest references are linked in each section and listed in the appendix.

**Scope:** the Expo app (`apps/app`) only, using the existing v1 API, contracts and client data layer (`src/spend/v1/*`).
- **Not in scope:** server changes, except where §9 lists a backend dependency.
- **Dependencies:** no new packages unless the owner authorizes them. `react-native-svg`, `expo-image`, `expo-notifications`, `@expo-google-fonts/anuphan` and `@expo-google-fonts/dm-sans` are already installed.

## 1. Global constraints

- **Money stays exact and visible.**
  - Amounts are `bigint` satang formatted through the existing money helpers (`src/spend/v1/money.ts`).
  - Decoration never replaces a number.
  - Red and green mean only over budget and under budget.
- **No shaming.**
  - Going over budget is stated plainly with a way forward, for example "It happens. ฿120 over, 9 days to go."
  - Streaks count days the user logged, never "no-spend" days, and missing a day is forgiven.
- **No AI advice.** The bun only states facts about the user's own numbers. The master plan excludes AI advice.
- **The bun appears at moments, not on every screen.** These moments are onboarding, empty states, celebrations, the month recap, reminders and over-budget. Lists, forms and destructive screens stay plain, and the bun stays quiet on destructive screens.
- **Thai, English and Vietnamese** (`src/i18n`):
  - No all-caps, monospace or condensed labels. Thai has no capitals and those styles break it.
  - Line heights are tuned for Thai stacked marks.
  - Every screen is checked at 320 pt wide in all three languages.
- **Accessibility:**
  - WCAG AA contrast, enforced by tests.
  - Dynamic Type up to the largest accessibility size.
  - Screen-reader labels give the amount and its state ("Coffee, 65 baht, saving").
  - Reduced motion removes springs and peeks.
  - Touch targets are at least 44 pt (`tapTarget.ts`).
- **Offline-first states stay honest.**
  - Pending saves read "saving…"; they never look confirmed.
  - Conflicts and unknown outcomes keep the user's draft.
  - Offline never blocks the whole screen.
- **Visual approval (E2)** is required before a redesigned screen is routed or its copy enters the locale catalogs. Build behind flags; screenshot every state in light, dark, TH, EN and VI; get approval; then switch.

## 2. Principles (from the research)

1. **The number is the hero; the bun is the stage.** Character and numbers live in separate zones: the bun sits on the header or peeks over a card edge, and never covers content. References: [Betterment](https://mobbin.com/screens/b8994367-a054-409f-81ac-02ddf92fb469), [Speak peek](https://mobbin.com/screens/0dc12825-9d25-4753-af6e-74f72cf22978), [Duolingo bubble](https://mobbin.com/screens/cf740740-e217-4a08-bb8b-4000e986ce07).
2. **Entry is amount-first and one-handed.**
   - The keypad shows at once, with a `000` key and `+ − × ÷`.
   - The top 3 categories (ranked by recent use) show inline, with "More" for the rest.
   - The date is a "Today" chip with ‹ › to step days.
   - Expense, income and transfer share one sheet.
   - References: [GoPay](https://mobbin.com/screens/48c5268d-ec50-4d7a-9c14-111ecc2e45ab), [Buddy](https://mobbin.com/screens/c46ddd33-e05a-47be-a6de-ca10db402224), [Splitwise](https://mobbin.com/screens/81d7df66-32f4-4cb9-abd5-9f3628f80371).
3. **A diary is read by day.** History is grouped by day with each day's total ([Monzo](https://mobbin.com/screens/8f921563-4da7-4e2b-98ea-e3e5e47b9229)).
4. **Pace beats totals.** Budgets lead with "left to spend" and "per day" ([Revolut](https://mobbin.com/screens/b578103d-3eca-4520-b50f-1698113428d7), [Monzo](https://mobbin.com/screens/b133d628-fd50-4d2f-8f6c-75739d474379)).
5. **Trust is plain words.** Use promise lists, say who *can't* see the data, ask for consent at the moment of action, and re-authenticate through the user's own sign-in method. References: [Structured](https://mobbin.com/screens/533ffc0b-0202-4a41-8c3e-300f901ee5c5), [Philips Hue](https://mobbin.com/screens/10cb0f97-82e1-4ba2-af27-b257fb303dd3), [Starling attach](https://mobbin.com/screens/2b9071e0-54cd-45a3-a56d-89828d9d81cd).
6. **Hedge machine guesses.** Import duplicates read as "probably" and are kept by default. Ambiguous values are flagged inline, never silently fixed ([Copilot](https://mobbin.com/screens/faf01723-8ac9-4f33-9399-f2164a430821), [Revolut Business](https://mobbin.com/screens/69caef5f-b45f-4b96-ae8b-f31c47003e26)).

## 3. Design tokens

Replace the inherited brand-green palette in `src/theme/colorPalettes.ts` and `tokens.ts`.
- **Token names:** keep the existing names (`background`, `card`, `ink`, `primary`, …) so screens migrate gradually, and add the new tokens below.
- **Founder decisions:** the contrast decisions recorded in `colorPalettes.ts` (white on #00CC99) are superseded and need the founder's sign-off. That is decision D10 in §8.

| Token | Light | Dark ("lavender night") | Use |
| --- | --- | --- | --- |
| `stage` | #B9A3F9 | #2A2240 | Header band and celebration backgrounds |
| `background` | #EDE6FF | #17131F | Page |
| `card` | #FFF8EC (cream) | #221C30 | Cards and sheets |
| `paper` | #FFFDF8 | #2A2338 | Receipt slips |
| `ink` | #231B3A | #F4EEFF | Text, outlines, primary pill button |
| `muted` | #5B4F80 | #B3A7D6 | Secondary text (must clear 4.5:1 on `card` and `background`) |
| `outline` | #231B3A, 1.5–2 pt | #B9A3F9, 1.5 pt | Card and control outlines; no shadows |
| `rule` | #CFC8E4, dotted | #4A4066 | Receipt rules and list separators |
| `accent` | #7A5BE0 | #B9A3F9 | Links, selection, pending text |
| `paperBlue` | #1F5BFF | #6F95FF | The bun's receipt and receipt icons (brand blue) |
| `under` / `over` | #1F7A4D / #A3324A | #6FD3A0 / #F08AA0 | Budget state only |
| `cheek` | #F6B6CE | #F6B6CE | Bun cheeks and celebration confetti |

**Type** (no new packages):
- **Thai:** Anuphan, already installed.
- **Latin and Vietnamese:** DM Sans, already installed.
- **Receipt amounts and headings:** the platform serif (iOS New York or Georgia; Android Noto Serif). Thai text inside receipts stays Anuphan.
- **Weights:** regular, medium and bold.
- **Scale:** 34 / 28 / 22 / 17 / 15 / 13 / 11. Thai line height is 1.5×; Latin is 1.3×.
- **Numbers:** tabular figures for amounts. A dedicated serif font is decision D4.

**Shape and motion:**
- **Radius:** cards 16, chips 12, buttons as full pills.
- **Edges:** outlines instead of shadows. Receipts have dashed edges with optional notches.
- **Motion:** spring pop on save (`useSpringPop`), bun peek in 200 ms. All motion is off under reduced motion.

## 4. The bun (mascot system)

- **Component:** `Bun` in `src/mascot/`, using `react-native-svg`.
- **Props:** `pose`, `size`, `peek` (top, right or left edge), and `decorative`. A decorative bun is hidden from screen readers. A bun that speaks has a text bubble, and the bubble is read aloud.
- **Poses (about 12):**
  - `hello`;
  - `holding-receipt` (the default);
  - `peek`;
  - `cheer` (save streaks and recap);
  - `thinking` (empty states);
  - `sleepy` (reminders and night);
  - `oops-kind` (over budget; never sad or scolding);
  - `lock` (privacy);
  - `box` (import);
  - `magnifier` (review);
  - `wave-bye` (sign out);
  - `quiet` (destructive screens: a small, neutral face).
- **Speech bubble:** one fact per bubble, with the number highlighted, for example "Lunch done at ฿60. Food is at 58% with 13 days to go." Bubble copy is factual and kind. Thai uses polite particles (นะ, จ้า) only where natural.
- **Intensity setting:** Settings → "Bun": *Full*, *Quiet* (no bubbles; poses only on empty states) or *Off*. This follows [Gentler Streak](https://mobbin.com/screens/31b529b7-e4d0-47d8-b78e-3b97e2bae048).
- **Assets:** vector SVG pose files from one source, with matching line weight and colours.
  - **Who draws them is decision D2.** Until art arrives, a simple geometric placeholder bun keeps every screen buildable.

## 5. Component kit (`src/ui/`)

Each component gets render tests for every state, in light and dark, at 320 pt, in TH, EN and VI.

| Component | Notes and reference |
| --- | --- |
| `StageHeader` | Lavender band with title, month switcher and a bun slot (peek) |
| `Card`, `OutlinedCard` | Cream, 2 pt ink outline |
| `ReceiptSlip` | Paper with dashed edge, dotted rules, serif total; used by record detail, day receipt and month recap ([GoPay](https://mobbin.com/flows/a36b2e5c-e98d-46d5-8900-90d272ad9e1a)) |
| `Amount` | Exact satang formatting; sizes S to XL; tabular figures; states: confirmed, saving, conflict |
| `PillButton` | Primary is an ink fill; secondary is outlined. At most one primary per screen. |
| `Keypad` | Digits, `000`, `.`, ⌫, `+ − × ÷ =`. Haptics on press. No QWERTY keyboard first. |
| `TypeSwitch` | Expense / Income / Move (transfer) segmented control |
| `CategoryChips`, `CategoryGrid` | The top 3 by recent use, then a grid with custom vector icons rather than emoji, which render differently across platforms ([Copilot](https://mobbin.com/screens/fdb1a20f-3747-410b-b374-a61c7cd31fac), [Monzo](https://mobbin.com/screens/f49a18a6-8f9e-47d2-af81-c8c7129e4e75)) |
| `WalletPicker` | Shows each wallet's balance; for a move, "From → To" with a swap button ([Vivid](https://mobbin.com/flows/e06a35f0-8c87-4921-aa19-f0dc72adfbf7)) |
| `DateChip` | "Today" plus ‹ ›; tap for a calendar |
| `RecordRow` | Category icon, title, amount, a quiet subtitle state ("saving…", "needs a look") ([Rocket Money](https://mobbin.com/screens/577c74b6-689b-40dd-ac07-eb2a25041eab)) |
| `DayHeader` | Date and the day's total ([Monzo](https://mobbin.com/screens/8f921563-4da7-4e2b-98ea-e3e5e47b9229)) |
| `BudgetBar`, `PaceRing` | Left to spend and per day; under or over colours only ([Revolut](https://mobbin.com/screens/b578103d-3eca-4520-b50f-1698113428d7)) |
| `SyncBanner` | A slim, non-blocking strip: offline, saving N, or a conflict needs a look ([Alta](https://mobbin.com/screens/2b00c4b9-d2a6-4a6a-9d95-2aba49348be1)) |
| `UndoBar` | Dark bar, a specific verb and an Undo pill ([Wise](https://mobbin.com/screens/3d0d5be6-d405-4ec9-ad94-e2a815e16248)) |
| `EmptyState` | Bun pose, a headline that names the space, one line, one action ([Buddy](https://mobbin.com/screens/23b3306f-840e-409a-821e-87710d8a6243)) |
| `SpeechBubble` | Bun plus one fact |
| `Sheet` and `ConfirmSheet` | Bottom sheets; the confirm sheet states the consequence and uses the quiet bun ([Chime](https://mobbin.com/screens/4cb48df6-19b1-4b19-b3d3-2e2ab311b47b)) |
| `PromiseList` | Icon rows of plain promises ([Structured](https://mobbin.com/screens/533ffc0b-0202-4a41-8c3e-300f901ee5c5)) |
| `StagedProgress` | Ticked stages with counts ([Monarch](https://mobbin.com/screens/33fc9bf6-cf4c-46f2-be9d-6373759dc721)) |
| `FlagChip` | Inline "check this" markers for import rows |
| `TabBar` | Floating ink pill with a cream add button in the centre ([Buddy](https://mobbin.com/screens/342ef140-0224-455a-98ac-8c8b4f862aeb), [Alan](https://mobbin.com/screens/b6bfa5b2-4bac-42d4-b500-d5f2d0b99751)). The tab set is decision D7. |

## 6. Screens

The current routes are `/`, `/login`, `/spend`, `/spend/add`, `/spend/all` and `/spend/import` (legacy). The redesign adds routes under `app/` as listed. Every screen lists its states; each state needs a render test and an approval screenshot.

### 6.1 Core loop
- **Home** (`/spend`):
  - `StageHeader` with the month's total ("฿12,480 of ฿18,000").
  - A `PaceRing` or `BudgetBar` card with "฿420 a day left · on track".
  - Today's records as a `ReceiptSlip` with a day total, then earlier days.
  - States:
    - loading;
    - first run (no wallet: bun `hello` and "Add your first wallet");
    - no budget (prompt to set one);
    - offline or saving (`SyncBanner`);
    - over budget (`oops-kind`, plain facts);
    - upgrade required;
    - terms required;
    - signed out;
    - diary locked.
- **Quick add** (a sheet from the centre button, route `/spend/add`):
  - Layout: `TypeSwitch`, then the `Amount` (XL), `CategoryChips`, a row of `DateChip`, wallet and note, then the `Keypad` and Save.
  - Move mode: From → To wallets and a "move all" chip.
  - After saving: a spring pop and "Saved, add another?". Optionally the `cheer` bun, at most once a day.
  - States: saving, saved, queued offline, validation (amount missing or over the cap), and "the wallet needs an opening balance".
- **History** (`/spend/all`):
  - Calm-data style: day groups with totals, a sticky search, and filter chips (month, wallet, category, type).
  - A search shows a summary bar ("5 records, ฿420").
  - Rows show their pending or conflict state.
  - Swipe and long-press for Edit, Copy (duplicate, as in [Monarch](https://mobbin.com/screens/802b848c-9c9c-4f8d-9a56-2392c1163661)) and Delete, which shows the `UndoBar`.
  - Deleted records stay restorable for 30 days under a "Recently deleted" filter.
- **Record detail and edit** (new `/spend/record/[id]`):
  - A `ReceiptSlip` showing the amount, category, wallet, date, merchant, note and receipt thumbnail.
  - Actions: Edit (the same sheet as quick add), Copy, and Delete with undo.
  - A conflict view shows "yours" and "on the server" side by side, with a clear choice.

### 6.2 Planning
- **Budget** (new `/spend/budget`):
  - The month budget and category limits, with per-day pace and the burn-down ([Monzo](https://mobbin.com/screens/b133d628-fd50-4d2f-8f6c-75739d474379)).
  - Setup: one total, then category limits. Prefill from the average only once a month of records exists, as in [Cleo](https://mobbin.com/flows/725158cd-5752-436e-a524-1a682fb697fd).
  - Over budget gets kind copy.
  - **Client adapter needed:** `budget.create` and `budget.replace` exist on the server, but `resources.ts` has no write for them.
- **Wallets** (new `/spend/wallets`):
  - The list shows the total, cards with balances, and a dashed "Add a wallet" tile ([Monarch](https://mobbin.com/screens/616a6a88-c30e-440a-b107-9ccb7d44bcba)).
  - Creating a wallet shows a live card preview with name, colour and opening balance ([Copilot](https://mobbin.com/flows/31126e3d-0b09-42fe-be68-866a6c2c6fd9)).
  - Wallets can be archived and unarchived.
  - **Client adapters needed:** `wallet.update`, `wallet.archive` and `wallet.unarchive`.
- **Categories** (new `/spend/categories`):
  - A grid of built-in and custom categories; create and edit with an icon, colour and an optional limit ([Copilot](https://mobbin.com/screens/fdb1a20f-3747-410b-b374-a61c7cd31fac)).
  - Archive and unarchive.
  - **Client adapters needed:** `category.create`, `update`, `archive` and `unarchive`.

### 6.3 Insights and habit
- **Month recap** (new `/spend/recap/[month]`):
  - A printed `ReceiptSlip`: spent, earned, top categories, days logged, and kept.
  - The bun `cheer` on the lavender stage.
  - Months can be compared through small bars that double as the month picker ([Origin](https://mobbin.com/screens/ffff5f8c-16be-423b-9387-193ed251fb63)).
  - Sharing as an image needs a capture package (decision D6). Until then, sharing is plain text.
- **Calendar**: a month heatmap of spending per day ([Me+](https://mobbin.com/screens/ee267ca9-6036-4af7-92bb-64bd42f0b940)). Per-day totals come from the local diary, so no server change is needed.
- **Logging streak** (optional, decision D5):
  - Counts days logged.
  - Forgiving: skipped days don't break it.
  - Framed as self-care ([Finch](https://mobbin.com/screens/879b0749-a269-4d19-abb9-bdc6d38041e8), [Me+](https://mobbin.com/screens/59717fd3-8d48-4592-b977-8ae0f18cbe69)).
  - It is not a money signal.
- **Reminders** (Settings): a time chip and weekday checks, with the bun peeking over a live preview of the notification ([Any Distance](https://mobbin.com/screens/6aa76fdd-ccad-4ded-931a-2b896f3314f7)). This uses the existing S4 reminder services and replaces S4's unbuilt settings screen.

### 6.4 First run, sign-in and account
- **Onboarding** (`/`):
  - Three story steps:
    1. The coffee maths (฿60 a day = ฿21,900 a year), with coins piling up as in [Up](https://mobbin.com/flows/2f2dbea1-f622-4e3c-a5d4-2d49577d34b8).
    2. "Your diary stays private."
    3. "Log your first coffee", a tiny commitment ([Duolingo](https://mobbin.com/screens/b8a54efb-c06d-4818-b56e-968b2309c88b)).
  - Reminder priming that explains before the iOS prompt appears, never on top of it.
  - First wallet and budget come later, through a home checklist ([Monarch](https://mobbin.com/flows/a0a283eb-8af3-4946-b0c3-89a0a8276211)).
- **Sign-in** (`/login`):
  - The bun banner and equal Apple, Google and email buttons.
  - One line: "If you already have an account, we'll sign you in" ([Canva](https://mobbin.com/screens/525ca9f0-d2e1-41cc-9295-f86a72561c26)).
  - Terms accepted with an explicit checkbox and a three-promise reassurance ([YNAB](https://mobbin.com/screens/bcc5cb06-f8cf-4ec2-baff-75b25bf38130), [Klarna](https://mobbin.com/flows/ece82567-bc12-4466-8b01-35cf7132c1a0)).
  - Real sign-in waits for F5 and E1/E2. Until then the UI is built against the existing session seam and shows today's "not configured" state.
- **Settings** (new `/settings`):
  - Grouped calm cards: appearance (System, Light, Dark), language (TH, EN, VI), Bun intensity, reminders, wallets, categories, budget, import, privacy and data.
  - An account card showing the sign-in method ([Vocabulary](https://mobbin.com/flows/86acb932-2495-4cfe-86e5-d812dde4d346)) and linked logins ([Mercury](https://mobbin.com/screens/60d9ab3c-a4d3-46f1-8799-a913ddcaafa7)). Linking stays hidden until F6c's tenant proof.
  - "Sign out", and "Sign out everywhere" behind a `ConfirmSheet`.
- **Privacy and data** (new `/settings/privacy`):
  - A `PromiseList`: no bank connection, never sold, no ads, and "not even Jotbun can read your diary".
  - Export: request it, see the status (preparing, ready until a set time, expired), then download. This follows [Clue](https://mobbin.com/screens/865ab92d-8127-4201-bebe-5f8ffd3885e8) and [Airalo](https://mobbin.com/screens/41305123-f8ca-4808-be39-4319d7dcff9b).
  - Delete account:
    - A calm warning, and "download your data first".
    - Re-authenticate through the user's own sign-in method ([Philips Hue](https://mobbin.com/screens/10cb0f97-82e1-4ba2-af27-b257fb303dd3)).
    - The receipt of the request is shown afterwards.
    - Uses the existing `privacy.ts` and `deletion.ts`.

### 6.5 Import and receipts
- **Import** (route `/spend/import`, replacing the legacy screen):
  1. **Expectation sheet:** what it can do and what it won't, and "nothing is saved until you confirm" ([Copilot](https://mobbin.com/flows/02e73e3c-6caf-4fee-998a-a1df5b8e1e9e)).
  2. **Pick a file**, then upload.
  3. **Parsing:** a staged progress view with the `box` bun.
  4. **Review:** calm data. Rows show `FlagChip`s for an ambiguous date, missing type and similar.
     - Multi-select bulk fixes for category, wallet and type, with a running selected total ([YNAB](https://mobbin.com/screens/f9ad37e5-3c05-4906-b5c7-cbcd70400d9f)).
     - Duplicates show as "probably the same as…" advice and are kept by default.
     - A wallet and category label mapping step maps file labels to the user's own.
  5. **Freeze the selection:** "Ready to save 342 records".
  6. **Confirm in batches** with `StagedProgress`, then show the result with committed, remaining and conflicted counts.

  Built on the existing `imports.ts`, `importReview.ts` and the device draft store. The import flag stays off until all import gates pass (handover §8).
- **Receipts:**
  - **Attach:** the consent sheet at the moment of attaching ([Starling](https://mobbin.com/screens/2b9071e0-54cd-45a3-a56d-89828d9d81cd)).
  - **View:** a thumbnail on the record receipt; full screen uses the 5-minute grant.
  - **Remove:** a `ConfirmSheet` stating that this can't be undone.
  - **Client adapter needed:** the P2c endpoints (retain, replace, remove, grant) aren't wired in the app yet.

## 7. Tasks

Each task gets a feature flag (`redesign.<area>`) so the old screens keep working until the owner approves the new ones.

### R0: Tokens, type and theme migration
**Files:**
- `src/theme/{colorPalettes,tokens,appFonts,uiFontFamily}.ts`;
- a new `src/theme/contrast.test.ts`.

**Steps:**
- [x] Add the §3 palette, light and dark.
  - `src/theme/bunPalette.ts`, beside the green palette. Accent `#6A4BD4` and under `#1A6B43` replace the §3 values, which failed AA. Outlines use `ink`; there is no separate `outline` token.
- [x] Add a contrast test asserting WCAG AA for every text/background pair the kit uses. Write it RED first against the current values where they fail.
  - `bunPalette.test.ts` (4.5:1 for every pair in `BUN_TEXT_PAIRS`, both modes); RED 9 of 11.
- [x] Add the type scale and the Thai line-height rule.
  - `bunType.ts`, `bunType.test.ts` (Thai 1.5×, Latin 1.3×).
- [x] Add the receipt serif via the platform font, so no package is needed.
  - Georgia on iOS, `serif` on Android; no font package added.
- [x] Keep the old token names working. Theme preference (System, Light, Dark) is unchanged.
  - `colorPalettes.ts` and the theme preference are untouched.

**Done:** the new tokens are available and tested, and nothing is routed differently yet.

### R1: Bun component and placeholder art
**Files:** `src/mascot/{Bun,poses,SpeechBubble}.tsx`, plus render tests.

**Steps:**
- [x] Build the props from §4 and the intensity setting (stored with the theme preference).
  - `Bun.tsx`, `BunPeek.tsx`, `SpeechBubble.tsx`; Full/Quiet/Off stored like the theme preference, under its own key.
- [x] Make decorative buns hidden from screen readers.
  - `Bun.render.test.tsx`; a decorative bun cannot take a label.
- [x] Turn peeks off under reduced motion.
  - The peek's motion is off (it waits for the OS answer, then snaps, with no spring). The bun itself still shows, still. Hiding it entirely under reduced motion would be a design change for the owner.
- [ ] Use geometric placeholder poses until the final art arrives (D2).
  - Placeholders done (`poses.ts`, all 12 poses). Open: the final art, from an illustrator (D2).

### R2: Component kit
**Files:** `src/ui/*` per §5, render tests for every state at 320 pt in TH, EN and VI, light and dark.

**Steps:**
- [x] Each component gets assertion-level RED first, then GREEN.
  - All §5 components in `src/ui/` (SpeechBubble in `src/mascot/`); R2a and R2b RED then GREEN, in TH, EN and VI, light and dark. 320 pt checked on the web in EN and TH (VI held by the owner).
- [x] Add a screenshot catalogue route, available in dev builds only, for the E2 review.
  - `app/dev/catalogue.tsx` (`__DEV__` and the opt-in `catalogue` flag); 223 sections.

### R3: Core loop
**Screens:** Home, Quick add, History, Record detail, Edit, Move (§6.1).

**Steps:**
- [x] Build on `viewModels.ts`, `pendingTotals.ts` and `spendDiary.ts`.
- [x] Unit-test keypad maths, which must be exact (no floats), and the `000` key.
  - `keypadExpression.ts` (BigInt satang) and its tests; a source test bans float maths in Quick add.
- [x] Rank categories by recent use from the local diary.
  - `recentCategories.ts`: recent use from `/v1/history` plus this device's drafts, since the device diary keeps no confirmed records.
- [x] Ship duplicate and undo.
  - Copy an entry, undo in History and Record. The §6.1 "Recently deleted" list waits for an API that lists deleted records.
- [x] Keep offline, pending and conflict states.
- [x] **E2 checkpoint 1:** approve the screenshots, then switch the routes.
  - Approved 19 October; `core` is on by default.

### R4: Planning
**Screens:** Budget, Wallets, Categories (§6.2).

**Steps:**
- [x] Add client write adapters for the existing commands:
  - `resources.ts`; `resources.test.ts` checks method, path, idempotency key, If-Match and body for all nine. Budget create and replace share one PUT; the server chooses the command.
  - `budget.create`, `budget.replace`;
  - `wallet.update`, `wallet.archive`, `wallet.unarchive`;
  - `category.create`, `category.update`, `category.archive`, `category.unarchive`.

  Each adapter needs its own idempotency key and version handling, like the existing ones.
- [x] **E2 checkpoint 2.**
  - Approved 19 October; `planning` is on by default. No Budget tab (D7).

### R5: Insights and habit
**Screens:** Month recap, Calendar, Streak (if D5 says yes), Reminders settings (§6.3).

**Steps:**
- [x] Compute per-day totals and the streak from the local diary.
  - `insightsModel.ts` (`dayFacts`, `rhythmModel`): from `/v1/history` plus device drafts. The streak is the forgiving monthly rhythm (D5).
- [x] Recap sharing is text until D6.
  - `RecapScreen.tsx`, "Share as text".
- [x] **E2 checkpoint 3.**
  - Approved 19 October; `insights` is on by default.

### R6: First run, sign-in, settings, privacy
**Screens:** Onboarding, Sign-in UI, Policy, Settings, Privacy and data (§6.4).

**Steps:**
- [x] Build against the existing session and F5 seam.
  - Sign-in reports "not configured" until a provider is installed. App-side "Sign out everywhere" (the global-logout call) and account linking are still hidden.
- [ ] Keep real Auth0 proof under E1/E2.
  - Kept: no Auth0 package, no provider installed outside tests. The proof waits for the owner's Auth0 test tenant (`docs/operations/e1-setup.md`) and signed-in devices.
- [x] Wire export and deletion to `privacy.ts` and `deletion.ts`.
  - `privacyServices.ts`, `PrivacyScreen.tsx`. Requesting an export and deleting the account stay disabled, with the reason shown, until re-authentication exists.
- [ ] **E2 checkpoint 4**, including the actual policy text.
  - Screens approved 19 October; `account` is on by default. Open: the policy text itself, which the founder must approve and publish. Sign-in's consent line links to nothing yet.

### R7: Import and receipts
**Screens:** the import journey and receipts (§6.5).

**Steps:**
- [x] Build the import UI on the existing P3 client.
  - The review draft is kept in the encrypted diary (decision 7).
- [x] Add the P2c client adapter.
  - `attachments.ts`. Open: a 401 on download is not refreshed; hosted R2 and photo-picker checks wait for E1.
- [x] Keep the import flag off.
  - Server `IMPORT_UPLOADS_ENABLED=0`. The redesigned import screens are on (owner's checkpoint 5), and say politely that uploads aren't switched on yet.
- [x] **E2 checkpoint 5.**
  - Approved 19 October. Turning imports on still needs the E1 proofs, the parser gate, the import release checklist (`rollback.md`) and E4.

### R8: States, accessibility and polish
**Steps:**
- [x] Cover every state in §6 with a render test.
  - 223 catalogue sections, rendered in light and dark in TH, EN and VI; the screen-reader pass covers each in EN and TH.
- [ ] VoiceOver and TalkBack pass.
  - Automated so far: the web screen-reader pass (223 sections, EN and TH); the Android accessibility tree on an emulator (223 sections, 1,815 controls); Apple's accessibility audit on the iOS simulator (223 sections in EN light, TH dark and at AX5). Open: a pass on a real iPhone and a real Android phone (focus order, gestures, what is spoken).
- [x] Largest Dynamic Type.
  - Per-role ceilings and stacked layouts from 1.5×; AX5 captures; Apple's audit at AX5 found the tab labels breaking mid-word, now fixed (they stop at the largest standard size and show the large content viewer).
- [x] Reduced motion.
  - Every redesign animation stops under Reduce Motion (sheet, undo bar, peek, coin pile, spring pop, receipt viewer fade).
- [x] 320 pt width.
  - Checked on the web in EN and TH; the category chip fix has a failing-first test. Not checked on a device.
- [ ] Thai and Vietnamese copy review.
  - Thai: every key translated; the native-speaker review is open, with its lists in the progress record. Vietnamese is held by the owner (not translated for now).
- [x] Remove the old green theme and the legacy `Customer*` screens from the default route once every flag is on (keep the source, per the backend plan's rules).
  - Off the default route: `Customer*` only under the development legacy flag, the old v1 screens only with `-<area>`. The source stays.

**Verification for every task:**
- `npm run typecheck:app`;
- `npm run test:unit -w gogospend-app`;
- `npm run test:render -w gogospend-app`;
- `npm run export:web -w gogospend-app -- --max-workers 2`;
- iOS Simulator screenshots of each new screen in light and dark, in TH, EN and VI.

Device journeys stay SKIPPED until E2.

## 8. Decisions for the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Confirm the mix: Bun buddy base, receipt slips, calm data screens | Yes |
| D2 | Who draws the bun's about 12 poses: an illustrator, the original icon's artist, or generated and then cleaned up | One source, vector SVG, matching the app icon |
| D3 | The bun's name and voice in TH, EN and VI | "Bun" / "บัน"; kind, factual, short |
| D4 | Receipt numerals: platform serif (no package) or a dedicated serif font (new package, needs authorization) | Platform serif first |
| D5 | Logging streak: yes or no | Yes, forgiving, days logged only |
| D6 | Share the recap as an image: needs a view-capture package (authorization) | Later; text share first |
| D7 | Tab set: Home, Add, Insights (3) or Home, History, Add, Budget, Settings (5) | 3 tabs plus Settings from the header |
| D8 | Keep dark mode ("lavender night") | Yes |
| D9 | Bun intensity setting (Full, Quiet, Off) | Yes |
| D10 | Retire the inherited brand green and its recorded contrast decisions | Yes |
| D11 | Budgets by pay-day month ([Klarna](https://mobbin.com/flows/196009d5-59eb-4071-baeb-e129ee722d56)) | Later; needs a backend change, because M4 budgets follow the calendar month |

## 9. Backend dependencies

None for R0–R8. All of it uses existing API commands; the app only needs the client adapters listed in R4 and R7.

These would need separate backend plans:
- pay-day budgets (D11);
- server-side per-day totals, if the local diary ever proves insufficient;
- any image-share endpoint.

## Appendix: reference index (Mobbin)

- **Home and budgets:**
  - [Revolut left to spend](https://mobbin.com/screens/b578103d-3eca-4520-b50f-1698113428d7)
  - [Cleo March](https://mobbin.com/screens/8cfabeab-f078-47e2-a906-632441c49fad)
  - [Origin budget](https://mobbin.com/screens/413f86df-ddd9-4956-8dfa-515256bd949d)
  - [Buddy overview](https://mobbin.com/screens/342ef140-0224-455a-98ac-8c8b4f862aeb)
  - [Monzo pace](https://mobbin.com/screens/b133d628-fd50-4d2f-8f6c-75739d474379)
  - [Cleo "It happens"](https://mobbin.com/screens/207509eb-1252-49bc-bff4-4524dfc83da3)
- **Entry:**
  - [GoPay add](https://mobbin.com/screens/48c5268d-ec50-4d7a-9c14-111ecc2e45ab)
  - [Buddy new transaction](https://mobbin.com/screens/c46ddd33-e05a-47be-a6de-ca10db402224)
  - [YNAB add](https://mobbin.com/flows/0a544fb8-9f90-41b7-92c7-307af43e3e99)
  - [Splitwise](https://mobbin.com/screens/81d7df66-32f4-4cb9-abd5-9f3628f80371)
  - [Vipps](https://mobbin.com/screens/32abcdb3-41c7-42bc-a91c-753c7f0d2684)
- **History:**
  - [Copilot](https://mobbin.com/screens/39d3efee-7a8a-4fa5-ae15-1065a33dfae1)
  - [Monzo](https://mobbin.com/screens/8f921563-4da7-4e2b-98ea-e3e5e47b9229)
  - [Rocket Money](https://mobbin.com/screens/577c74b6-689b-40dd-ac07-eb2a25041eab)
  - [Lloyds search](https://mobbin.com/screens/4401e65e-e9bb-4e9b-b0ba-a217dd06d919)
  - [Wise undo](https://mobbin.com/screens/3d0d5be6-d405-4ec9-ad94-e2a815e16248)
- **Detail and transfer:**
  - [GoPay receipt](https://mobbin.com/flows/a36b2e5c-e98d-46d5-8900-90d272ad9e1a)
  - [Monarch duplicate](https://mobbin.com/screens/802b848c-9c9c-4f8d-9a56-2392c1163661)
  - [Vivid transfer](https://mobbin.com/flows/e06a35f0-8c87-4921-aa19-f0dc72adfbf7)
  - [Mercury transfer](https://mobbin.com/flows/fa8230a8-23ff-4c52-b91f-568eae7b7bc1)
- **Wallets and categories:**
  - [Copilot cash account](https://mobbin.com/flows/31126e3d-0b09-42fe-be68-866a6c2c6fd9)
  - [Monarch list](https://mobbin.com/screens/616a6a88-c30e-440a-b107-9ccb7d44bcba)
  - [Buddy wallets](https://mobbin.com/screens/684e06c5-6ce4-419f-986f-ae4c2d5ae8ed)
  - [Copilot category](https://mobbin.com/screens/fdb1a20f-3747-410b-b374-a61c7cd31fac)
  - [Monzo category](https://mobbin.com/screens/f49a18a6-8f9e-47d2-af81-c8c7129e4e75)
- **Insights and habit:**
  - [Origin months](https://mobbin.com/screens/ffff5f8c-16be-423b-9387-193ed251fb63)
  - [Copilot review](https://mobbin.com/flows/e80a0ddc-af73-4972-89be-e9b2fbad2646)
  - [Beli recap](https://mobbin.com/flows/6520099e-59a7-44a2-8336-a80d9feb47ce)
  - [Me+ heatmap](https://mobbin.com/screens/ee267ca9-6036-4af7-92bb-64bd42f0b940)
  - [Finch streak](https://mobbin.com/screens/879b0749-a269-4d19-abb9-bdc6d38041e8)
  - [Numo pause](https://mobbin.com/screens/a3ac24c6-bba2-4c93-ac2e-86c4f6462ec3)
  - [Bears Gratitude](https://mobbin.com/screens/c2910a0a-e822-4946-a0e0-e7adf4be9599)
  - [Any Distance reminders](https://mobbin.com/screens/6aa76fdd-ccad-4ded-931a-2b896f3314f7)
- **Mascot:**
  - [Duolingo bubble](https://mobbin.com/screens/cf740740-e217-4a08-bb8b-4000e986ce07)
  - [Alan tab mascot](https://mobbin.com/screens/b6bfa5b2-4bac-42d4-b500-d5f2d0b99751)
  - [Speak peek](https://mobbin.com/screens/0dc12825-9d25-4753-af6e-74f72cf22978)
  - [BitePal settings](https://mobbin.com/screens/5860ab2c-16c8-4c58-bf37-621a8aedb2c4)
  - [Gentler Streak character](https://mobbin.com/screens/31b529b7-e4d0-47d8-b78e-3b97e2bae048)
  - [foodpanda empty](https://mobbin.com/screens/45d7895a-94eb-4962-abe2-093061581941)
- **Onboarding and sign-in:**
  - [Buddy onboarding](https://mobbin.com/flows/eecfa79b-3250-429f-9432-de16e4d34552)
  - [Up story](https://mobbin.com/flows/2f2dbea1-f622-4e3c-a5d4-2d49577d34b8)
  - [Monarch checklist](https://mobbin.com/flows/a0a283eb-8af3-4946-b0c3-89a0a8276211)
  - [YNAB sign-up](https://mobbin.com/screens/bcc5cb06-f8cf-4ec2-baff-75b25bf38130)
  - [Canva](https://mobbin.com/screens/525ca9f0-d2e1-41cc-9295-f86a72561c26)
  - [Klarna](https://mobbin.com/flows/ece82567-bc12-4466-8b01-35cf7132c1a0)
- **Trust and privacy:**
  - [Structured](https://mobbin.com/screens/533ffc0b-0202-4a41-8c3e-300f901ee5c5)
  - [Apple Health](https://mobbin.com/screens/faf8920d-c937-418e-8318-8b56d352b38c)
  - [Clue export](https://mobbin.com/screens/865ab92d-8127-4201-bebe-5f8ffd3885e8)
  - [Clue delete](https://mobbin.com/screens/f52351d2-0383-427c-875a-b02fa5c31827)
  - [Airalo](https://mobbin.com/screens/41305123-f8ca-4808-be39-4319d7dcff9b)
  - [Philips Hue re-auth](https://mobbin.com/screens/10cb0f97-82e1-4ba2-af27-b257fb303dd3)
  - [Chime sign out all](https://mobbin.com/screens/4cb48df6-19b1-4b19-b3d3-2e2ab311b47b)
- **Import and receipts:**
  - [Copilot import](https://mobbin.com/flows/02e73e3c-6caf-4fee-998a-a1df5b8e1e9e)
  - [Expensify mapping](https://mobbin.com/flows/0c73a300-77c0-4d14-b72c-e6c98f79e160)
  - [Copilot duplicates](https://mobbin.com/screens/faf01723-8ac9-4f33-9399-f2164a430821)
  - [YNAB bulk](https://mobbin.com/screens/f9ad37e5-3c05-4906-b5c7-cbcd70400d9f)
  - [Revolut Business flags](https://mobbin.com/screens/69caef5f-b45f-4b96-ae8b-f31c47003e26)
  - [Starling attach](https://mobbin.com/screens/2b9071e0-54cd-45a3-a56d-89828d9d81cd)
  - [GoPay scan](https://mobbin.com/screens/465e2773-660b-4a11-b7af-fb9747fef87e)
