# Jotbun: Bun Wallet and Cloudflare system design

**Status:** approved by the owner on 25 October 2026 ("Go"). The owner had approved every recommendation in the blueprint deck the same day ("go with all your recommendations").

**Sources:**
- Blueprint deck, reviewed by the owner: https://claude.ai/artifact/Ac8h3G8esJKFqVXgaj7YKJ
- Design canvas (124 boards): https://claude.ai/artifact/6vhKjrD9hrFAtCSMCUN3nR. The board source is copied to [docs/design/bun-wallet/](../../design/bun-wallet/). Open any `*.dc.html` in a browser; `canvas.json` holds the layout and the sticky notes.
- Rules kept from earlier work:
  - [backend design](../../design/backend-architecture-2026-10-17.md): financial invariants, the command protocol, offline and sync, imports and export;
  - [premium plan](../plans/2026-10-24-jotbun-premium-ai-edge.md) §1: decisions D12 to D22 and the AI guardrails;
  - [handover](../../implementation/handover.md) §4: how every task is done.

## 1. What this is and why

Jotbun is a calm Thai money diary. People record what they spend and receive, see it against a monthly budget, and get gentle help from Bun, the mascot AI. It is a second ledger, never a bank. It sits beside GoGoCash, a sister cashback service.

Today:
- The app (`apps/app`, Expo SDK 58) and the edge backend (`apps/edge`, TanStack Start on Workers, PostgreSQL through Hyperdrive) exist and pass their gates locally.
- Nothing is deployed, and no real person has an account.

On 24 and 25 October 2026 the owner asked for:
1. A premium look and flow, **Bun Wallet**: the mood of Family, the flow of Neo Financial and the materials of Apple Wallet, tuned for Thai life.
2. Every flow designed and confirmed before building. This is done: 124 boards.
3. Slip auto-import like K PLUS's เหมียวจด.
4. Travel: spend in any currency, converted to a home currency the person picks.
5. Better Auth instead of Auth0.
6. PostHog for errors and analytics, with as much insight as possible.
7. The database and all infrastructure on Cloudflare.

**Why now:** nothing is live, so leaving PostgreSQL and Auth0 costs code only, with no data to migrate. Every month after launch makes that harder.

**What success looks like:**
- Each build phase ends with its proof on a real phone (section 8).
- After the beta, the north-star number, logging days per week, is measured and moving. Targets are set from the beta baseline.

## 2. Goals, non-goals and anti-goals

**Goals for v1:**
- The Bun Wallet interface across all 16 flow groups, in light and dark mode. Thai first with a full English translation, Dynamic Type up to AX5, and VoiceOver in Thai.
- Each person's ledger in their own Durable Object, the **UserVault**. Shared, non-personal data in D1 and KV. Files in R2. Background work on Queues, Workflows, Cron and vault alarms.
- Better Auth: Apple, Google, email code and passkey. Sessions are devices.
- A local-first app that keeps today's outbox and command protocol, plus live change pokes to the person's other phones.
- Bun AI: Tell Bun, read a slip, Ask Bun and the daily note. Opt-in, and drafts only.
- Slip auto-import from bank albums the person picks, plus slips shared from any bank app.
- Statement import from CSV and XLSX.
- Travel: home currency, wallet currencies, trips, daily reference rates, the person's own rate, and cash exchange.
- Outside the app: notifications, home and lock-screen widgets, a share extension, quick actions, a Siri shortcut and emails.
- PostHog: product analytics, masked session replay for people who said yes, surveys, feature flags and experiments, error tracking, LLM analytics and a batch export to our own R2.
- Data export and real deletion.

**Not in v1:**
- Saving slips automatically (D35).
- PDF statements (D39).
- Bank connections or bank credentials of any kind. Salt Edge stays out.
- Refunds and reversals as their own record type. They stay deferred, as in the backend design.
- Slip import and cashback in any currency but baht.
- Shared or family ledgers, or more than one person in a vault.
- Ad-hoc SQL across all people. PostHog events answer product questions.
- A web product. The Expo web export keeps building for the dev catalogue only.
- A guest mode. Every ledger belongs to an account from the first record (C15).

**Anti-goals** (a failure even if everything works):
- A screen that shames, nags or alarms, or red and green used for anything except budget state.
- AI that saves anything without the person confirming it, or a number in AI text that did not come from the vault.
- A slip image stored anywhere: R2, logs, a queue message or AI Gateway logs.
- Any amount, balance, budget, payee, merchant, wallet name, note, custom category name, slip content, email, phone number or real name reaching PostHog.
- A cashback figure in baht.
- A record lost or overwritten without the person seeing it.
- One person's request opening another person's vault.

## 3. Decisions

D1 to D22 still stand, except where a decision below supersedes one. Numbers continue from the premium plan.

| # | Decision | From | Supersedes |
| --- | --- | --- | --- |
| D23 | **Better Auth replaces Auth0.** Its tables live in D1 (D27). | Owner, 24 Oct | The Auth0 parts of the backend design, the Auth0 secrets in D13, the Auth0 runbook |
| D24 | **Multi-currency, for travel.** The person picks a home currency, baht by default. A record keeps its original amount and currency, the rate used, and the home amount frozen when it is saved. Slip import and cashback stay baht-only. | Owner, 24 Oct | THB-only wallets in contracts v1 |
| D25 | **Slip reading:** a QR check on the phone, then `claude-haiku-5-5` reads the slip. `claude-opus-5-5` reads it only when fields are missing or inconsistent, or Haiku declines. Validate on about 100 real Thai slips before the prompt is locked. | Owner accepted the recommendation, 24 Oct | D19, for slips |
| D26 | **PostHog for error tracking and product analytics,** with maximum insight inside the privacy line in section 7. Session replay is on for people who said yes, with all text and images masked and touch capture off. | Owner, 24 Oct; deck | The "replay off at launch" guardrail |
| D27 | **Database: one SQLite Durable Object per person (UserVault).** D1 holds Better Auth's tables and a shared catalog; KV holds hot shared reads. PostgreSQL, Hyperdrive, row-level security, the database roles and the 99 SQL routines retire. | Deck 1 | D13 (database), D21 (per-role logins) |
| D28 | **Ask Bun: Haiku 5.5 first,** Opus 5.5 for hard questions (rule in 6.9). The cap stays at 20 questions a day. | Deck 2 | D19 (default model) |
| D29 | **The slip backfill is read right away,** inside each upload request, never through Message Batches. Images are never stored, at Anthropic or anywhere else. | Deck 3, then changed by the owner on 25 Oct after the builder check found that Message Batches holds the images until processing ends (up to 24 hours) and is not eligible for zero data retention. | The deck's "Message Batches and a Workflow" |
| D30 | **Sign-in emails through Cloudflare Email Service** (public beta), with a second provider wired behind a switch. | Deck 4 | |
| D31 | **Exchange rates: one daily reference feed,** stored per day. The provider is chosen with the owner before phase 5. | Deck 5 | |
| D32 | **PostHog EU Cloud.** The PDPA notice names it. | Deck 6 | |
| D33 | **Accounts and keys, created by the owner:** a Jotbun Cloudflare account on Workers Paid (not the GoGoCash account wrangler is signed in to today), a domain, an Anthropic API key, Apple and Google sign-in, and a PostHog EU project. Nothing is created until the owner says so. | Deck 7 | |
| D34 | **Analytics consent:** one clear yes or no at setup, not pre-ticked ("ช่วยพัฒนา Jotbun"). It covers analytics, replay and surveys, and can be changed in Privacy at any time. | Deck 8 | |
| D35 | **No slip auto-save in v1.** Slip drafts are always reviewed. | Deck 9 | |
| D36 | **Daily slip reading starts off.** The person turns it on. | Deck 10 | |
| D37 | **A phone signed out from elsewhere keeps its unsent records,** and sends them once the same account signs in again. | Deck 11 | The "Session ended" erase prompt, for this case |
| D38 | **Face ID lock, and reminders only on days with nothing logged,** are both in v1. | Deck 12 | |
| D39 | **Statement files: CSV and XLSX in v1.** PDF comes later. | Deck 13 | |
| D40 | **Trip spending counts toward the monthly budget.** | Deck 14 | |
| D41 | **Private mode also hides amounts** in notifications, widgets and share cards. | Deck 15 | |
| D42 | **Cashback wording:** "แคชแบ็ก" as the name, "เงินคืน" in sentences. Cashback is always a count of records, never a baht figure. | Deck 16 | |

**Calls made while writing this spec.** Each is mine, not the owner's, and the owner can overturn any of them.

| # | Call | Why |
| --- | --- | --- |
| C1 | One Worker script hosts the routes, the UserVault class, the Workflows and the queue consumers. This replaces D21's four Workers. The parser Container stays separate, with no vault binding and no secrets beyond reading its input object. | D21 separated database logins. With vaults there are none: any script that holds the vault binding can open any vault, so splitting scripts adds deploy surface without adding isolation. Isolation comes from always taking the vault name from the verified token. |
| C2 | Keep `/v1` and change `packages/contracts` in place, with no `/v2`. Phase 1 ports today's v1 contract unchanged (THB only), so the existing parity sessions prove the vault port. Currency fields arrive in phase 5. | No client is live, so there is nobody to break, and the parity sessions are already the best specification of v1. |
| C3 | **Thai everyday pack.** Expense: ส่งเงินให้ครอบครัว, ทำบุญ, เดลิเวอรี, วินมอไซค์และรถไฟฟ้า, เติมเงินมือถือ, เซเว่น, ลอตเตอรี่, สัตว์เลี้ยง. Income: เงินจากครอบครัว. They are still created as ordinary custom categories (D18), now tagged with a `pack_key`. | Merges today's code pack with board `wc-thai-pack`. The pack key lets analytics name a pack category without sending its label. |
| C4 | The budget is the full month's amount, with no proration. The per-day hint is the remaining budget divided by the days left, today included. | Simple and honest, and it matches `bw-budget` (฿18,000 is about ฿580 a day). |
| C5 | "Update required" blocks writes but still lets the person browse their local data. The outbox waits and sends after the update. | Matches board `es-update-required`. |
| C6 | A foreign-currency cash wallet defaults to the rate of its most recent exchange. Other wallets default to that day's reference rate. Either can be edited on any record. | What you paid for the cash is what the cash cost you. |
| C7 | Disconnecting albums keeps the salted slip hashes, so reconnecting never imports a slip twice. Deleting the account removes them. | Avoids duplicates; the hashes reveal nothing. |
| C8 | Changing the home currency recomputes every record's home amount from its original amount, at the reference rate for that record's date. Rates the person edited do not carry over to the new currency pair, and the confirm screen says so. Budgets convert at the change day's rate and are shown for review. | An edited rate was a rate to the old home currency. |
| C9 | In-app "Contact us" opens an email to the support address, with the copyable support code filled in. | The owner provides the address (section 10). |
| C10 | The slip backfill allowance is up to 500 slips per rolling 30 days, separate from the 10 live reads a day. The first connect reads back at most 90 days. | About 20 US cents a person at Haiku's standard price; it bounds abuse. |
| C11 | Unconfirmed slip drafts stay in the inbox for 30 days. Statement previews keep today's 7 days. | The inbox is a calm place, not a deadline. |
| C12 | Server kill switches and route gates live in KV and fail closed, as today's gates do. PostHog flags drive app rollouts only. | Turning off a broken feature must not depend on a third party being up. |
| C13 | Android gets the share target, app shortcuts and a home-screen widget. Lock-screen widgets and Siri are iOS only. | The canvas is drawn for iOS; these are the Android features that carry over naturally. |
| C14 | **No implicit account linking.** Better Auth's implicit linking is switched off. A sign-in method joins an account only when the person links it from Account while signed in. A social sign-in whose email belongs to another account is refused with a screen naming the method to use, so it never creates a second account silently. An email code signs into the account that owns that address, because the code proves control of the mailbox. | Carries forward the backend design's rule, "never auto-link identities merely because emails match". A vault can never be merged, so a wrong join cannot be undone. |
| C15 | **Sign-in comes right after the welcome, before the budget question and the setup checklist.** "เริ่มต้นใช้งาน" leads to sign-up, and "มีบัญชีแล้ว" leads to sign-in. "ข้ามไปก่อน" on `bw-setup` skips setup steps, not sign-in. | Today's app has no guest accounts, and the backend design allows none. Budgets and wallets are created online. |
| C16 | **The offline boundary is unchanged:** only new records are queued offline. An online edit refused with `VERSION_CONFLICT` is kept on the phone as a pending choice, never sent by itself, until the person picks a version or chooses "ตัดสินใจทีหลัง" (decide later) on `rh-conflict`. | `rh-conflict` needs the refused edit kept, not offline editing. This adds no new outbox kinds. |
| C17 | **The erasure registry holds keyed hashes of deleted user ids only,** kept 60 days. It stops a backup restore, a stale token or a queued command from bringing a deleted account back. It does not stop the same Apple ID, Google account or email from signing up again: that creates a new user id with an empty vault, and an old phone's outbox never replays into it. | A fresh start stays possible. 60 days covers the 30-day restore windows of Durable Objects and D1 with margin. |
| C18 | **Weekday reminder wording stays.** The owner approved one wording per weekday on 24 October (uncommitted in `apps/app/src/notifications/reminderWording.ts`). The D38 one-shot reminders each use that day's wording. | It was approved in another session, and one-shot reminders can carry a different text each day. |

## 4. Rules carried forward

- **Money:** the backend design's "Data model and financial invariants" are unchanged, with satang generalised to each currency's smallest unit.
  - A record is at most 99,999,999,999 minor units.
  - Minor amounts are decimal strings on the wire.
  - Balances are derived from records, never kept as a counter.
  - A transfer is one row.
  - The golden reconciliation fixture stays a test.
- **Command protocol:** the backend design's "API and concurrency contract":
  - a client-made command UUID on every mutation;
  - compact receipts, kept for the life of the account;
  - `409 IDEMPOTENCY_MISMATCH` for a reused key with a different payload;
  - `If-Match` versions, with `409 VERSION_CONFLICT` returning the current safe record;
  - `ENTITY_DELETED` and `ENTITY_PURGED` outcomes;
  - the error codes and status mapping;
  - keyset pagination, 50 rows by default and 200 at most.
- **Offline and sync:** the backend design's "Offline and sync", unchanged except for D37 and the live poke (6.7).
- **Files:** the backend design's limits for imports, receipts and export:
  - 12 MiB uploads; CSV and XLSX, and JPEG, PNG and WebP;
  - images at most 20 megapixels, metadata stripped and re-encoded;
  - at most 5,000 parsed rows, confirmed in batches of 500;
  - raw uploads kept 24 hours and previews 7 days;
  - download grants of 5 minutes, export files of 24 hours;
  - formula-leading CSV cells neutralised.
- **Guardrails:** the AI guardrails (D15), the GoGoCash bridge (D16), haptics (D17), and the Thai pack (D18, with C3).
- **Logging:** errors are logged by `failureName` only. Never `error.message`, and never a request body.
- **Gates:** every mutating route is gated (`writes`, `imports`, `ocr`, `uploads`, `jobs`, plus `ai`). A closed gate answers 503.
- **Process:** every task follows handover §4: behavioural RED, GREEN, a mutation check, the full gate, receipts, a local commit, and an independent read-only review.
- **Copy:** every new string goes into both `en.json` and `th.json`. Thai comes first, there are no emojis, and the voice rules are in 5.1.
- **Accessibility:**
  - tap targets at least 44 pt;
  - text contrast at least 4.5:1, graphics at least 3:1;
  - Dynamic Type up to AX5;
  - reduced motion swaps each animation for a fade plus a haptic.
- **Infrastructure:** nothing is deployed, and no cloud resource is created, without the owner's yes.
- **New packages** (handover §3): approving this spec approves the packages it names:
  - Better Auth, `@better-auth/expo` and `@better-auth/passkey`;
  - `drizzle-orm`;
  - `jose`;
  - `@cloudflare/vitest-pool-workers`, which Cloudflare has renamed `@cloudflare/vitest-plugin`. The owner approved the new name on 25 October 2026;
  - `posthog-react-native`, `@posthog/react-native-plugin`, `posthog-node` and `@posthog/ai`;
  - Reanimated, Gesture Handler and Skia;
  - native Apple and Google sign-in.

  Any other new package, and any lockfile regeneration with Linux bindings, still needs the owner's yes.

## 5. Product design: Bun Wallet

### 5.1 Look, feel and voice

**Where each part comes from:**
- **Family (mood):** a lavender ground, white cards and a Bun face on every wallet; small celebrations, never streak pressure; Thai first.
- **Neo Financial (flow):** one question per screen, amount first. Trays slide over the page so the person keeps their place. Insights have three tabs: spending, in and out, calendar. One black main action per screen.
- **Apple Wallet (premium):**
  - each wallet is a material;
  - wallets sit in a card stack that fans open;
  - saving drops the record into its card with a soft tap;
  - large DM Sans numbers.

**Light tokens:**

| Token | Value |
| --- | --- |
| Ground | `#F4F3F9` |
| Card | `#FFFFFF` |
| Ink | `#111014` |
| Quiet text | `#6B6878` on white; `#4A4756` on the ground |
| Hairline | `#E6E4EE` |
| Violet | `#6A4BD4` |
| Under budget | `#1A7F4B` |
| Over budget | `#B4364F` |

**Dark tokens:**

| Token | Value |
| --- | --- |
| Ground | `#0E0D12` |
| Card | `#1A1920` |
| Sheet | `#24222B` |
| Text | `#F4F2FA` |
| Quiet text | `#A9A6B6` |
| Violet text | `#B9A3F9` |
| Under budget | `#4CC38A` |
| Over budget | `#F47C93` |

**Materials** are gradients:

| Material | Light | Dark |
| --- | --- | --- |
| Silk | `#D9CCFF` → `#A891F7` | `#5E4CB8` → `#43349A` |
| Paper | `#FFF4DC` → `#F3E2BE` | deeper version of the same |
| Titanium | `#3A3842` → `#121116` | same, plus a 1 px edge |
| Sky | `#D6EEFF` → `#8CC8F5` | deeper version of the same |
| Peach | `#FFE2CF` → `#FFAE85` | deeper version of the same |

The dark values for paper, sky and peach are on the `dk-*` boards.

**Type:**
- Anuphan 400, 500 and 700 for all text. DM Sans 700 for every amount.
- ฿ comes first, with thousands commas.
- Income gets a plus sign and violet, never green.
- Thai body text is 15 to 17 px with roomy line height, so marks above and below never clip.
- Dates use Thai day and month names and the Buddhist year: เสาร์ 24 ต.ค. 2569.
- Private mode shows ฿•••• in the number's shape, so layouts never jump.

**Components:**
- **Trays:** inset 8 px from the edges, radius 34, one question each; swipe down to close.
- **Buttons:** one black main button per screen, 54 px tall, radius 16. Other actions are text links.
- **Floating +:** bottom right on the main tabs; one tap opens the amount tray.
- **Wallet cards:** material, Bun face, name and balance, stacked.
- **Save:** a toast with Undo, never a second "are you sure?". The record drops into its card with a light haptic.

**Voice:** short, warm and second person. Facts before feelings.

| Moment | We say | We never say |
| --- | --- | --- |
| On track | ตามแผน | เก่งมาก ประหยัดสุดๆ! |
| Over budget | เกินงบไป ฿420 | ใช้เงินเกินอีกแล้ว! |
| Reminder | วันนี้จดหรือยัง | คุณลืมจดอีกแล้ว |
| AI draft | บันอ่านจากสลิป ตรวจก่อนบันทึก | AI บันทึกให้แล้ว |
| Cashback | 14 รายการอาจได้คืน | คุณจะได้เงินคืน ฿320 |
| Failure | ส่งไม่สำเร็จ บันทึกยังอยู่ในเครื่อง | เกิดข้อผิดพลาด 500 |

Streaks count days logged. A skipped day restarts the count without a warning.

**New app libraries:** Reanimated and Gesture Handler (the card stack and trays), a bottom sheet or native sheets, and Skia (charts). The haptic vocabulary (D17) already exists. The builder confirms versions against Expo SDK 58.

### 5.2 Flows

All boards are in `docs/design/bun-wallet/`, named by flow prefix. The table lists the behaviour each group must keep. The boards show the rest.

| Group | Boards | Behaviour the build must keep |
| --- | --- | --- |
| Research and style | `Main`, `bw-style` | Reference only. |
| First open | `bw-welcome`, `bw-budget`, `bw-setup`, `bw-adding` | Fanned cards before any form. Sign-in or sign-up comes next, before the budget question (C15). The budget is one question with an instant per-day figure (C4). A five-step checklist where every step can be skipped; it reappears gently on Home until finished. Adding a wallet: name, opening balance, Bun face, material. |
| Daily capture | `bw-home`, `bw-tray-amount`, `bw-attach`, `bw-tray-confirm`, `bw-saved`, `bw-private` | Amount first; everything else optional. Quick chips. Photo by camera or album. "ให้บันอ่านยอดจากสลิป" sends the photo to Bun only if AI is on; a slip photo is then dropped, while a receipt photo is kept in R2. Bun's guesses are marked. Undo on the saved toast. One tap on the eye hides every amount. |
| Wallet and insight | `bw-wallet`, `bw-record`, `bw-insights`, `bw-recap`, `rc-view` | Totals set large; budget state only in red or green. Three insight tabs. A month recap worth sharing, whose cashback card is a count. The receipt viewer allows zoom, share and delete photo. |
| Records | `rh-*` (10) | History grouped by day; search with a total; filters; income; a transfer that is not spending; record actions; Undo; recently deleted, restorable for 30 days. A conflict screen where the person picks which version stays. An offline state: saved here, sends later. |
| Wallets, categories, budget | `wc-*` (9) | Wallet types: bank, cash, card and travel card. Archiving keeps history. One monthly budget plus optional category limits. A calendar shaded by spend. The Thai pack (C3). Over budget is red and factual. |
| Bun AI | `ai-*` (5) | Consent first: what is sent, to whom (Claude by Anthropic), and what is never kept. Tell Bun turns one line into several drafts. Read a slip marks each field "from slip". Ask Bun answers from the person's records and shows the figures used. AI settings: pause, what is shared, uses left today. |
| Slip auto-import | `sl-*` (11) | Intro, the photo permission, album choice (screenshots off by default), a scan that runs while the person leaves the screen, a summary, account-to-wallet mapping, bulk review, the done screen, the Home inbox, slip detail and settings. If AI is off, the consent sheet comes first. |
| Statement import | `im-*` (7) | Pick a file, what to expect, parsing, map columns once, review flagged rows, confirm, done. Nothing is saved until the person confirms. |
| Cashback | `cb-*` (4) | Intro, hub, merchant, waiting. Labelled a sister service. Counts only. Matching happens on the phone, and can be switched off. Offered after 7 logged days (D16). |
| Travel and currency | `tc-*` (9) | Home currency; a foreign record with a live home amount and an editable rate; trip start, trip home and trip summary; exchange (both amounts, not spending); mixed-currency history; the offline-rate state; the rate editor. |
| Account and security | `sa-*` (8) | Sign in with Apple, Google or email; a 6-digit email code valid 10 minutes; a passkey offer; terms; Face ID lock setup and the locked screen; account and devices; sign out everywhere. |
| Settings and privacy | `st-*` (9) | Settings, reminders with a priming step, language, dark mode, privacy promises and controls, export, delete, and the deletion-done screen. The privacy screen promises export and deletion; it never claims Jotbun cannot read records. |
| System states | `es-*` (12) | Empty Home and insights, loading skeleton, restore on a new phone (usable while it restores), camera and photos denied, notifications off, Bun AI resting (draft kept), unreadable slip, session ended (unsent records kept, D37), update required (C5), and a generic error with a copyable support code (C9). Every failure says the records are safe and offers another way forward. |
| Outside the app | `ox-*` (10) | Gentle grouped notifications, home and lock-screen widgets (with a private-mode version, D41), quick actions, a share extension and the bank share sheet, a share card with amounts hidden, the Siri confirmation, and the sign-in code and account-deleted emails in Thai. |
| Dark and accessibility | `dk-*` (8), `ax-*` (4) | Dark versions of the core screens with bars at 3:1, the largest text (the card stack becomes a list), VoiceOver order and Thai labels, and the reduced-motion spec. |

### 5.3 Fixes the build applies to the boards

| Board | Fix |
| --- | --- |
| `bw-saved`, `dk-saved` | The check becomes neutral, because green is for budget state only. |
| `bw-insights` (light) | Bars darkened to at least 3:1 against white; today they are about 1.4:1. |
| Several boards | Every tap target under 44 pt is enlarged (from the design review). |
| `sl-settings` | The optional auto-save choice is removed (D35). |
| `sl-done` | Daily reading starts off (D36). |
| `im-pick`, `im-expect` | PDF is removed from the formats until it ships (D39). |
| `ox-email-deleted` | The email says backups age out within 30 days. |

## 6. System design on Cloudflare

### 6.1 Shape

**On the phone:**
- the app with its encrypted SQLite (SQLCipher) and outbox;
- the slip finder (QR check);
- the Face ID lock;
- the PostHog SDK.

**One Worker** (C1), still in `apps/edge` and still TanStack Start. It serves:
- `/v1/*`;
- `/api/auth/*` (Better Auth);
- the PostHog proxy;
- the trust page.

It also hosts:
- the `UserVault` Durable Object class;
- the Workflow classes;
- the queue consumers;
- the Cron handlers.

**Bindings:**

| Binding | What |
| --- | --- |
| `VAULT` | The SQLite Durable Object class |
| `AUTH_DB` | D1, for Better Auth |
| `CATALOG_DB` | D1, the shared catalog |
| `CONFIG` | KV: today's rates, remote config, gates, merchant snapshot |
| `OBJECTS` | One private R2 bucket |
| Queues | Push, statement parse |
| Workflows | Export, deletion |
| `EMAIL` | Cloudflare Email Service |
| `PARSER` | The statement parser Container |

Outside Cloudflare:
- the Anthropic API, through AI Gateway;
- PostHog EU;
- Expo Push (to APNs and FCM);
- Apple and Google sign-in.

**`apps/api` (NestJS) and the Postgres tooling** stay in the repo, read-only, as the behaviour reference until phase 1's port passes. Removing them is a later owner decision.

### 6.2 UserVault

**Identity:**
- The vault is addressed with `idFromName(userId)`, where `userId` is the `sub` of the verified Better Auth JWT.
- No route accepts a user or vault id from the app.
- Vaults are created with the location hint `apac`, which is best effort.

**Schema:**
- Today's PostgreSQL tables move across without `owner_id`, keeping their names and rules: `wallets`, `categories`, `transactions`, `monthly_budgets`, `budget_category_limits`, `command_receipts`, the sync state and `sync_changes`, `attachments`, `import_jobs`, `import_rows`, a minimal `audit_events`, `ai_preferences`, `ai_usage`, and the required-terms acknowledgement.
- New tables:
  - `trips`;
  - `drafts`: slip and statement drafts made in the background;
  - `slip_refs`: salted hashes;
  - `slip_accounts`: bank plus masked account mapped to a wallet;
  - `devices`: Better Auth session id, push token, platform;
  - `settings`: home currency, consent versions;
  - `schedule`: alarm jobs;
  - `account_state`: status, token `not_before`, revoked session ids.
- New columns:
  - `wallets`: `type`, `material`, `bun_face`; `currency` becomes any ISO 4217 code;
  - `categories`: `icon`, `pack_key`;
  - `transactions`: `currency`, `rate`, `rate_source` (`reference`, `own` or `exchange`), `home_amount_minor`, `to_amount_minor` for an exchange, `trip_id`, `source`, `slip_ref_id`.
  - `source` is one of `typed`, `photo`, `slip_import`, `tell_bun`, `statement`, `share_extension` or `siri`.

**Migrations:**
- A Drizzle schema. On wake, the vault runs the `drizzle-orm/durable-sqlite` migrator inside `blockConcurrencyWhile`.
- Every migration stays readable by the previous release's code, because vaults upgrade one by one as they wake.

**Commands:**
- Each mutation is one `ctx.storage.transactionSync` block with no `await` inside, so nothing can interleave. The block does the following in order:
  1. check the account state and the token's `not_before` and session id;
  2. read or reserve the receipt;
  3. validate references and versions;
  4. write;
  5. allocate the next revision;
  6. write the change and audit rows;
  7. complete the receipt.
- This replaces the PostgreSQL account lock and keeps the backend design's rule of rechecking under the lock.
- Anything that needs I/O (a reference rate, a catalog read) is fetched by the Worker first and passed in.

**Reads:**
- History, summary, budgets and insights are vault SQL queries.
- Ask Bun's tools call the same methods.
- The existing SQL tests and command-protocol tests become their specification.

**Full resync:**
1. Read every live row and the high-water revision synchronously, in one turn.
2. Write them to R2 as chunked snapshot objects under a snapshot id, with 24-hour expiry.
3. The app downloads and applies the snapshot exactly as the backend design describes.

Prove this at ten times the expected 5 MB-a-year ledger, inside the isolate's memory.

**Deletes and retention:**
- Deletes are soft for 30 days; a vault alarm then purges them.
- Changes are kept 30 days; an older cursor gets `410 RESYNC_REQUIRED`.

**Alarms:**
- A Durable Object has one alarm at a time. The vault keeps due jobs in `schedule` (purge, month recap, snapshot expiry) and always sets the alarm to the earliest one.

### 6.3 D1, KV and R2

**D1 auth:**
- Better Auth's tables (users, sessions, accounts, verification, passkeys, JWKS).
- `account_status` (active, deleting, deleted).
- An `erasure_registry` of keyed hashes of deleted user ids (C17).
- Schema changes ship as D1 migrations.

**D1 catalog:** read-mostly, written by Cron or by migrations.
- `fx_rates`: day, currency, rate against one base;
- `merchants`: patterns, a built-in or pack category key, a GoGoCash-eligible flag;
- `bank_albums`: bank, platform, album name;
- `category_packs`.

**KV:**
- today's rates;
- remote config;
- minimum client versions;
- route gates and kill switches (C12);
- a merchant snapshot.

**R2:** one private bucket with lifecycle rules:
- receipts the person attached (kept until deleted);
- exports (24 hours);
- statement uploads in quarantine (24 hours);
- resync snapshots (24 hours).

Key prefixes use the vault's id, never an email. Slip images never land here.

### 6.4 Sign-in (Better Auth)

**Server:**
- Better Auth runs inside the Worker, with `database: env.AUTH_DB` and the `nodejs_compat` flag.
- Plugins:
  - email OTP: 6 digits, 10 minutes, and the first code signs the person up. It sends through `env.EMAIL`, falling back to the second provider (D30).
  - `@better-auth/passkey`;
  - JWT, with keys published at `/api/auth/jwks`;
  - the Expo server plugin.
- Social providers: Apple and Google, signed in with native ID tokens.
- Account linking: implicit linking off; explicit linking only (C14).
- **Local development:** email codes are written to the local log instead of being sent. This path exists only in local builds and is compiled out of staging and production.

**Tokens:**
- Every `/v1` call carries a short-lived JWT (15 minutes or less), verified with `jose` against the JWKS. Its `sub` names the vault, and its `sid` names the session.
- The vault refuses a token issued before `not_before`, or one whose `sid` is revoked. This is checked inside the command block.

**Sessions are devices:**
- Account lists the sessions, and can sign out one device or every other device.
- Signing out everywhere revokes the sessions and bumps `not_before`.

**Fresh sign-in:** export and deletion need a sign-in from the last few minutes (Better Auth's fresh-session check). This replaces `/v1/me/reauthentication`.

**Retired:**
- `/v1/auth/challenges`, `bootstrap`, `proofs` and linking, `global-logout`, and the Auth0 clients.
- In the app: `auth0Client`, `auth0Port` and `credentialProvider` are replaced by a Better Auth port on `@better-auth/expo`, with SecureStore.
- The session machine keeps its states where they still apply.

**D37:** a phone signed out from elsewhere locks its cache, pauses the outbox and keeps every unsent record. After the same account signs in again, it sends them. If a different account signs in, they are never replayed. The phone offers to keep them on the phone or erase them, with an explicit confirmation.

### 6.5 Sync

- The protocol is unchanged (section 4).
- Two changes:
  - The account lock is the vault itself.
  - Other phones hear about changes at once:
    1. `GET /v1/sync/live` upgrades to a WebSocket. The Worker verifies the token, then hands the socket to the vault.
    2. The vault holds sockets with the hibernation API.
    3. After each commit, the vault sends `{ revision }` to the person's other devices.
    4. Those phones pull `/v1/sync`.
- Sockets never carry record data. The vault closes a socket when its session is revoked.
- The fallbacks stay: sync on launch, on foreground, after writes, on pull-to-refresh, and a bounded foreground refresh.
- A refused edit becomes a pending choice on the phone (C16).

### 6.6 API contract

**Phase 1 (C2):**
- `/v1` keeps today's route families and shapes, apart from sign-in (6.4).
- Acceptance: the existing parity money session (49 steps) and files session (44 steps), and the dispatch suite, are adapted to the vault backend and pass with the same answers.

**Phase 5** changes `packages/contracts` in place:
- currency codes, with an ISO 4217 minor-unit table;
- on wallets: `currency`, `type`, `material`, `bun_face`;
- on categories: `icon`, `pack_key`;
- on transactions: `currency`, `rate`, `rate_source`, `home_amount_minor`, `to_amount_minor`, `trip_id`, `source`;
- trips routes;
- `GET /v1/rates/today` with an ETag;
- a home currency in `/v1/me`.

**Phases 3 and 4** add:
- `/v1/slips` (reads one slip or a small batch, for live reads and the backfill alike);
- `/v1/drafts` (list, confirm, dismiss);
- `/v1/slip-accounts`;
- `/v1/catalog/bank-albums`;
- `/v1/devices` (push token).

### 6.7 AI

**Routes stay:** `/v1/me/ai-preferences`, `/v1/ai/parse`, `/v1/ai/slip`, `/v1/ai/note`, `/v1/ai/ask`.

**Models:**

| Feature | Model |
| --- | --- |
| Tell Bun | The on-phone rules parser first. Haiku 5.5 when the rules cannot read the sentence. |
| Read a slip | Haiku 5.5. Opus 5.5 when the amount does not parse, the date is implausible, a required field is missing or Haiku declines (D25). |
| Daily note | Haiku 5.5 |
| Ask Bun | Haiku 5.5, escalating to Opus 5.5 when (a) the answer fails the grounding check (an amount not in the tool results), (b) Haiku declines, or (c) the tool loop reaches its step limit without an answer. If Opus also fails, the plain-facts fallback answers, as today. An escalated question counts once against the cap. |

**Haiku 5.5 API facts** (from the Claude API reference):
- Adaptive thinking is on by default.
- `budget_tokens`, non-default sampling and assistant prefill return 400.
- There is no server-side fallback, so the code handles a refusal itself.
- Its tokenizer counts about 30% more tokens than older models.
- Today's `fallbacks: "default"` and its beta header apply to the Opus calls only.

**AI Gateway:**
- The Anthropic SDK's base URL is the gateway URL.
- Every request sends `cf-aig-collect-log: false`.
- Gateway caching is off.

**Quotas** live in the vault's `ai_usage`, per Bangkok day:

| Use | Limit |
| --- | --- |
| Parses | 30 a day |
| Live slip reads | 10 a day |
| Notes | 3 a day |
| Questions | 20 a day |
| Backfill | 500 slips per rolling 30 days (C10) |

The `ai` gate pauses all of it with a 503.

**Privacy:**
- No account or device identifiers in prompts; today's test stays.
- PostHog's Anthropic wrapper (`@posthog/ai`) runs with `privacyMode: true`, so only model, tokens, cost and latency are sent.
- Before the beta, the owner confirms Anthropic's API data-retention terms and decides whether to ask for zero retention.

### 6.8 Slip auto-import

**On the phone:**
1. **Connect:**
   - The bank albums come from the catalog, plus "choose another album". Screenshots are off by default.
   - The person picks a start date, at most 90 days back (C10).
   - Reading new slips automatically needs full photo access. With limited access the app explains this and offers manual picking.
2. **Look:** only photos added since the last check.
3. **Filter:** decode a QR code on the phone, from the still image, offline. A photo without a Thai bank slip QR never leaves the phone.
4. **Skip known:** hash the slip's transaction reference with the vault's salt (fetched once, kept in SecureStore). Skip hashes the phone already has; the server checks again.
5. **Send:**
   - Downscale each image and send small batches within the 12 MiB body cap.
   - Bodies are read with size limits and never written to R2, KV, logs or queues.
   - If the app closes mid-upload, the rest waits for the next open.

**On Cloudflare:**

6. **Read right away (D29).** Every slip is read inside the request that uploaded it, whether it comes from the backfill, daily reading, the share extension or a single photo:
   - Haiku 5.5 reads each slip. When D25's rule says so, Opus 5.5 reads it again in the same request, while the image is still in memory.
   - Live reads count against the 10 a day; the backfill counts against its own allowance (C10).
   - Each account has a small cap on concurrent reads, so a large backfill never bursts Anthropic's rate limits. The phone keeps uploading the next batch as each one finishes, and shows progress (`sl-scanning`).
   - If the app closes or loses signal, unread slips simply wait for the next open, because the phone never marked them as sent.
7. **Nothing is kept:** once the request ends, the image exists only in the person's photo album. No Message Batches, no Workflow and no queue ever holds it.
8. **Draft:**
   - Guess the category from the merchant catalog and the person's own history.
   - Map the account to a wallet through `slip_accounts` (board `sl-wallet-map`; asked once, then remembered).
   - A slip is a transfer only when both accounts map to wallets. Otherwise it is a payment to a person that waits for a category.
9. **Drop:** discard the image and push "ready to review" (no amounts).
10. **Confirm:**
    - The review list starts with everything ticked except possible duplicates and transfers to people.
    - Confirming sends ordinary commands with `source: slip_import`.

**Daily reading (D36):**
- It starts off.
- When on, a phone background task checks the chosen albums about once a day. The time is best effort.
- New drafts wait in the Home inbox (C11).

**Disconnecting** stops reading at once and keeps the hashes (C7).

**Baht only.**

### 6.9 Statement import

**Formats:** CSV and XLSX (D39).

**Flow:**
1. Upload to `/v1/imports`, streamed to R2 quarantine.
2. A queue message wakes the parser Container with the object key.
3. The Container returns normalised rows.
4. The consumer writes `import_jobs` and `import_rows` into the vault.
5. The person reviews and maps columns (once per bank layout).
6. Confirm runs in batches of 500, each row keeping its source identity (backend design steps 1 to 8).

**The Container changes:**
- Today `parse-worker` claims jobs from PostgreSQL. It becomes a stateless parse service with no database.
- It keeps Node's permission model, the 512 MiB budget and the 5,000-row limit.

**Receipt photos:** re-encoding and metadata stripping run either in the Container (libvips, as today) or through Cloudflare Images. The builder chooses; the limits in section 4 apply either way.

### 6.10 Travel and currencies

**Units and rates:**
- Amounts are in each currency's smallest unit, from an ISO 4217 table in `packages/contracts` (JPY 0 digits, THB 2).
- A rate is a decimal string: home units per one source unit, at the feed's full precision.
- Conversion uses BigInt arithmetic, rounded half-up once, when the record is saved. Floating point is never used.
- Example: ¥4,620 at 0.2312 is 106,814 satang.

**Reference rates:**
- A daily Cron fetches the feed (D31) and stores one rate per currency per day against a base in `fx_rates`. KV gets today's set.
- A record uses the rate for its Bangkok date. If the feed has no rate for that day, it uses the latest earlier day.
- **Requirement for the D31 provider:** daily historical rates going back at least five years, because records can be back-dated to a wallet's tracking start and C8 recomputes at each record's own date. The Cron loads that history once, then adds one day at a time. For a date older than the history, the earliest stored rate is used, and the record says so.

**Who sets the rate:**
- The Worker resolves the reference rate and passes it to the vault, so the server is authoritative for `rate_source: reference`.
- `own` (the person typed a rate or the charged home amount) and `exchange` (C6) use the app's rate.

**Offline:** the app shows an estimate from its cached rates, marked "rate updates when online", until the vault confirms the record.

**Exchanging cash:** one record with both amounts. It moves money between wallets and is not spending.

**Totals and budgets:**
- Wallet balances are in the wallet's own currency.
- Day, month and trip totals add up stored home amounts, so they always match their rows.
- Budgets are in the home currency. A trip budget is in the trip's currency, and its summary shows both.
- Trip spending counts in the monthly budget (D40).

**Changing the home currency:** C8, as one vault command. The Worker passes the needed rates.

**Currency picker:** the currencies the feed covers, with Thai travellers' usual ones first: JPY, KRW, CNY, HKD, TWD, SGD, MYR, VND, LAK, USD, EUR, GBP, AUD.

### 6.11 Privacy and security

- **Kept apart by design:** the vault name always comes from the verified token.
- **Encryption:**
  - Durable Objects, D1 and R2 are encrypted at rest (AES-256);
  - TLS in transit;
  - SQLCipher on the phone.
- **Support:** no ledger access. Before the beta, add a break-glass tool behind Cloudflare Access that opens one vault read-only with the owner's approval and logs it to D1.
- **Location:** vaults use the `apac` hint, which is best effort. Anthropic and PostHog are abroad, and the PDPA notice names them and PostHog's EU region.
- **Rate limits** on sign-in and AI routes. Bodies are always read with size limits, as the edge does today.
- **Before launch** (owner): the PDPA notice, the consent wording, and whether scrubbed crash reports may be sent without consent, all reviewed by counsel. This spec is the engineering side, not legal advice.

### 6.12 Background work

| Job | Runs on | When |
| --- | --- | --- |
| Exchange rates | Cron, into D1 and KV | Every morning (Bangkok) |
| Purge deleted records | Vault alarm | After 30 days |
| Month recap | Vault alarm, then a push | The 1st |
| Statement import | Queue, Container, vault | On upload |
| Data export | `ExportWorkflow`: a CSV in R2 behind a 5-minute link | On request |
| Account deletion | `DeletionWorkflow` | On request |
| Push notifications | Queue, then Expo Push | On events |
| Orphan sweep | Cron | Daily |

Daily reminders stay on the phone as local notifications.

**D38, reminders only on days with nothing logged:**
- Schedule one-shot reminders for the next 14 days, each with that weekday's wording (C18).
- Cancel today's reminder when a record is saved.
- Re-plan when the app opens. iOS allows at most 64 pending local notifications.

**Deletion** (`DeletionWorkflow`); each step is retried on its own:
1. Mark the account `deleting` in D1, which blocks sign-in.
2. Set the vault to `deleting`, which refuses writes and cancels alarms.
3. Delete the R2 objects under its prefix.
4. Delete the vault's storage.
5. Delete Better Auth's rows and add the erasure registry entry.
6. Delete the PostHog person.
7. Send the deletion email (Thai or English), stating that backups age out within 30 days.
8. Run a final orphan sweep after every publisher's deadline.

Phone behaviour stays as in the backend design, plus D37.

**Export:** today's CSV format plus the currency columns, with exact minor units.

### 6.13 Outside the app (native work)

- **iOS:**
  - WidgetKit with an app group;
  - App Intents for the Siri shortcut ("จด 45 บาท ค่ากาแฟ" → a confirmation → the outbox);
  - a share-extension target with keychain sharing (a bank app's e-slip → the QR check → a live read → a draft in the inbox);
  - home-screen quick actions.
- **Android (C13):** a share target, app shortcuts and a home widget.
- **Widgets** read a small snapshot the app writes to the shared container. In private mode the snapshot carries no amounts (D41).
- **Push** never carries amounts. The events: slips ready, export ready, month recap ready, statement parsed.

### 6.14 Environments, release and watching

**Environments:**
- **Local:** `wrangler dev` / `vite dev` with local Durable Objects, D1, KV, R2 and Queues. It needs no cloud account.
- **Staging and production:** each with its own resources and secrets, created only on the owner's yes (D33).

**CI** (GitHub Actions):
- typecheck;
- unit tests;
- Workers-runtime tests with `@cloudflare/vitest-pool-workers`, including Durable Object eviction, to prove a vault behaves the same after it sleeps;
- the app gate;
- deploy staging from `main`, and production after approval. Neither runs until the owner says so.

**Watching:**
- Workers Logs;
- PostHog error tracking for the app and the Worker;
- AI Gateway analytics for AI cost and failures;
- budget alerts on Cloudflare and Anthropic spend.

### 6.15 Cost

The deck's estimates, with D28 applied and assuming 1 in 10 Ask Bun questions escalates to Opus:

| Monthly active people | Monthly cost |
| --- | --- |
| 1,000 | about $25 |
| 10,000 | about $200 |
| 100,000 | about $2,100 |

- Cloudflare is about $5, $17 and $240 to $340 of those totals.
- PostHog is billed separately and starts on its free tier.
- The assumptions are on the deck's cost slide.

## 7. Insight with PostHog

**North star:** logging days per week. Of the last 7 days, how many did each active person log at least one record? It rewards the habit, not the amount.

**Questions:**
- Do new people get going? First record within a day; 3 logging days in week one.
- Does the habit stick? Logging days per week; week-4 and week-12 retention.
- Which way of recording wins?
- Is Bun AI worth it?
- Where do people struggle?
- Do the extras matter?

**Wiring:**
- **App:** `posthog-react-native` sends screen views, our named events, flags and surveys. `@posthog/react-native-plugin` adds masked replay and native crash capture; it needs a development build. Wire it behind the app's existing `analytics/` bus.
- **Proxy:** a route on our Worker forwards to PostHog EU and strips cookies and auth headers.
- **Server:** `posthog-node` from the Worker, flushed with `waitUntil`, for events only the server knows: a record confirmed by the vault, sync failed, slip import finished, deletion finished. Server events are marked so app and server counts can be checked against each other.
- **Identity:** anonymous until sign-in, then an analytics id equal to the HMAC-SHA256 of the user id under a secret key. Never an email or phone. Reset on sign-out.
- **Our own copy:** a scheduled batch export to R2.
- **Errors:**
  - JavaScript and native crashes, symbolicated with source maps and debug symbols uploaded at build time by PostHog's Expo plugin;
  - Worker errors sent as class names, following the `failureName` rule.

**Consent (D34):**
- Nothing analytic is sent before yes.
- Scrubbed crash reports are sent without consent, as the deck proposed, behind a switch that makes them consent-only if counsel says so.
- Changing the answer in Privacy stops sending at once.
- Deleting the account deletes the PostHog person.

**Events:**
- **Common properties on every event:** app version, platform, language, home currency, AI on or off, weeks since sign-up.
- **Category:** sent only as a built-in key or a `pack_key`, otherwise `custom`.
- **Amounts:** never sent, not even in buckets.

| Group | Events | Properties |
| --- | --- | --- |
| Account | `signed_up`, `signed_in`, `signed_out`, `passkey_created`, `account_deleted` | method |
| First open | `onboarding_step_viewed`, `budget_set`, `wallet_added`, `setup_completed` | step, wallet type, material, Bun face, budget set or skipped |
| Recording | `record_started`, `record_saved`, `record_edited`, `record_deleted`, `record_restored`, `undo_used` | kind, source, category key, has photo, offline, seconds to save |
| Bun AI | `ai_consent_changed`, `tell_bun_sent`, `ai_draft_reviewed`, `ask_bun_asked`, `ask_bun_rated` | outcome (kept, edited, dropped), fields edited, model, escalated |
| Slip import | `albums_connected`, `slip_scan_finished`, `slip_review_confirmed`, `albums_disconnected` | albums, found, duplicates, unreadable, confirmed, escalated |
| Insight and habits | `insights_viewed`, `recap_opened`, `recap_shared`, `private_mode_toggled`, `reminder_set`, `widget_added` | tab, period, reminder hour, widget size |
| Travel and cashback | `home_currency_set`, `trip_started`, `rate_overridden`, `cash_exchanged`, `cashback_card_tapped` | currency code, trip length in days, count of eligible records |
| Reliability | `sync_failed`, `conflict_shown`, `permission_denied`, `ai_unavailable`, `resync_required` | reason code (class names such as `VERSION_CONFLICT`), screen, retry count, network type |

**Dashboards**, each with an alert for sharp drops:

| Dashboard | Shows |
| --- | --- |
| Activation | A funnel |
| Habit | Retention and stickiness |
| Capture mix | Records by source; seconds to save |
| Bun AI quality | LLM analytics; cost per kept record |
| Slip import | A funnel |
| Travel | Trends |
| Reliability | Crash-free sessions, sync failures, conflicts, AI down |
| Recap and bridge | Recaps opened and shared, cashback card taps |

**Replay:**
- Only after yes.
- All text and images masked; touch capture off.
- Sampled, and linked to errors.

**Surveys** (Thai first):
- after 7 logging days: how would you feel without Jotbun?
- after a slip import: how accurate was it?
- after Ask Bun: helpful or not?
- on leaving: why?

**Flags and experiments:**
- Roll out slip import, travel and AI to 5%, then 25%, then everyone.
- Experiments test the budget question, the save celebration and the reminder time.
- They are judged on activation and logging days, never on spending.

**Never sent:**
- amounts, balances or budgets;
- payee, merchant or wallet names;
- notes or custom category names;
- slip, receipt or photo content;
- email, phone or real name;
- AI prompts or answers.

## 8. Build order

Order, not dates. Each phase ends with a proof on a real phone. The owner approves screenshots per phase, as before.

1. **Foundations** (riskiest, so first):
   - The UserVault and its migrations.
   - Every v1 money, sync and files route ported from the SQL routines to vault methods, accepted by the adapted parity sessions, the dispatch suite, the command-protocol tests and the golden fixture.
   - Better Auth on D1, and the app's sign-in port.
   - Snapshot, export and deletion on Workflows; the stateless parser.
   - Live pokes.
   - PostHog wiring, consent, proxy and error tracking.
   - CI on the Workers runtime.

   **Proof:** save offline on phone A and see it on phone B seconds after reconnecting; edit one record on both phones and see the conflict screen. The proof runs against `wrangler dev` on the local network, with email-code sign-in reading codes from the local log. Apple and Google sign-in on a real phone are proven once the D33 accounts exist.
2. **Bun Wallet core:**
   - tokens and materials;
   - the card stack and trays;
   - records, budget, insights, recap and calendar;
   - the Thai pack;
   - private mode;
   - dark mode, the largest text sizes and VoiceOver;
   - the Face ID lock and the D38 reminders;
   - the board fixes in 5.3.

   **Proof:** the daily loop feels premium on a real phone.
3. **Photos and Bun AI:** receipt photos in R2, AI Gateway, the Haiku-first routing, Tell Bun, single slip reads, Ask Bun, LLM analytics, and the 100-slip evaluation set.

   **Proof:** drafts kept without edits.
4. **Slips and statements:** album import, the QR filter, reading as each batch uploads, review and the inbox, daily reading, CSV and XLSX statements.

   **Proof:** 100 real Thai slips read correctly, and a real bank statement imported.
5. **Travel:** the rate feed (after D31), the currency fields in the contract, wallet currencies, trips, own rates, exchange, and changing the home currency.

   **Proof:** a trip adds up to the satang.
6. **Outside the app, then beta:** widgets, the share extension, quick actions, Siri, emails, surveys and experiments, and the break-glass tool. Then staging and production with the owner, and a closed beta.

## 9. Left to the builder

- Library choices and versions, checked against Expo SDK 58 and current docs:
  - the bottom sheet;
  - QR decoding from still images;
  - background tasks;
  - the widget bridge;
  - Skia charts.
- Vault table and column names beyond those fixed here; the Drizzle layout; whether the phone and the vault share one schema.
- Worker and route layout inside TanStack Start; how the Workflow classes are split.
- Chunk and batch sizes, retry and backoff values, replay sampling, dashboard layout.
- How Better Auth's schema is generated into D1 migrations.
- The rate-limit mechanism.
- Receipt re-encoding in the Container or through Cloudflare Images.
- New copy, following 5.1, with the owner reviewing it in screenshots.

## 10. Waiting on the owner

None of these blocks approving this spec or starting phase 1 locally.

- **D31:** the rate provider, before phase 5. It must meet the history requirement in 6.10.
- **D33:** the accounts and keys, before anything talks to real services. Besides the deck's list, this includes:
  - an Apple Developer team, for development builds, Sign in with Apple, app groups and APNs. **Ready** (owner, 25 October 2026), along with a Google Play developer account;
  - an Expo/EAS project;
  - FCM credentials;
  - the final iOS bundle id and Android package name (`apps/app/app.config.js` has a temporary local one).
- **C9:** the support email address.
- **Counsel review:** the PDPA notice, the consent wording, crash reports without consent, and Anthropic's retention terms. Needed before the beta.
