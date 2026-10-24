# Jotbun Premium, AI Companion and Edge Backend Plan

> **For agentic workers:** execute task by task with the repo's process (see [handover](../../implementation/handover.md) §4): behavioural RED → GREEN → gate → receipts in [premium-progress.md](../../implementation/premium-progress.md). Steps use checkbox (`- [ ]`) syntax.

**Owner request (24 October 2026):**
- Convert the frontend to Expo.
- Rebuild the backend on TanStack with Cloudflare.
- Base the UX/UI on Mobbin research, made easier to use and understand for Thai and Southeast Asian users.
- Make the app feel premium, with haptic feedback.
- Use AI so people love the app, use it every day, and come to trust it as a bridge to GoGoCash.

**Starting point:**
- The branch is `claude/jotbun-redesign-plan` (PR #70): the "Bun diary" redesign, R0–R8.
- The app is **already Expo** (SDK 58, React Native 0.88, Expo Router). "Convert to Expo" is done; this plan builds the premium layer on top of the redesign rather than starting over.
- The v1 API is NestJS 12 on Node with PostgreSQL 17:
  - 99 SQL routines;
  - row-level security and per-process group roles;
  - a TypeScript command protocol: account lock, revisions, change log and idempotency receipts.

## 1. Decisions taken for this plan

These follow from the owner's request. Each can be overturned; the code keeps them behind flags so they can be.

| # | Decision | Why |
| --- | --- | --- |
| D12 | **Keep Expo; add the premium layer to the redesign.** No rewrite of `apps/app`. | It is already Expo, and R0–R8 passed review. A rewrite would throw away its tests and approvals. |
| D13 | **The new backend is `apps/edge`:** TanStack Start on Cloudflare Workers. It uses the same PostgreSQL through **Hyperdrive** (query caching off), **R2** for objects, **Queues** for jobs and **Cron Triggers** for maintenance. | Keeping PostgreSQL keeps the migrations, RLS, roles and every SQL routine exactly as reviewed. Only the HTTP and TypeScript layer moves. |
| D14 | **Strangler cutover.** The Worker serves the routes it has ported. Every other `/v1` route is forwarded to the NestJS origin (`LEGACY_V1_ORIGIN`) unchanged, until imports, attachments, exports, snapshots and deletion are ported. | The Expo client keeps one base URL and never sees a half-ported API. |
| D15 | **The AI companion replaces "No AI advice" with "AI that explains your own numbers".** | The owner now asks for an AI-driven app. The guardrails below keep the original intent: no product, investment or credit advice, and no shaming. |
| D16 | **GoGoCash bridge: opt-in cashback tips, worked out on the device.** The phone matches merchants against a public rate list. No diary data ever goes to GoGoCash. Tips appear only after 7 logged days, can be switched off, and always say GoGoCash is a sister product. | Trust first. A diary that sells its user's spending would break the privacy promises on the onboarding screen. |
| D17 | **Haptics are a vocabulary, not decoration.** One semantic map from moment to feedback, plus a user setting (On / Subtle / Off). Haptics are always paired with a visual change. | Premium feel without noise. Apple and Android both warn against haptics on every action. |
| D18 | **Thai and SEA life comes built in, without contract changes.** A one-tap "Thai everyday" category pack is created as ordinary custom categories. Buddhist-era (พ.ศ.) dates are a display option. Bank-slip scanning is supported. | The 10 built-in keys are part of the wire contract and of derived IDs, so new built-ins would be a breaking change. |
| D19 | **Model: `claude-opus-5-5`** through the Anthropic TypeScript SDK on the Worker. Settings: per-route effort (`low` for parsing, `medium` for notes and Ask Bun), refusal fallbacks on (`fallbacks: "default"`), and `AI_MODEL` overridable per environment. | The skill default. The owner can choose a cheaper model through `AI_MODEL` after measuring. |
| D20 | **D14's cutover is complete: every v1 route runs on the edge.** The forwarder stays for a route the API gains before the edge does. Parity: three scripted sessions (money; sign-in and privacy; files and background requests) give identical answers on the NestJS server and the edge. | The client keeps one base URL, and the API's tests stay the reference for every route. |
| D21 | **The API's background processes become Workers of their own**: jobs, security and deletion, each with only its own Hyperdrive logins and secrets, started by Cron Triggers and by queue wake-ups that routes send after queuing work. | The API kept each worker in its own process with its own login, so a leak of one exposes no other. Separate Workers keep that boundary. |
| D22 | **Import parsing runs in a Cloudflare Container** built from the API's release image (`apps/api/Dockerfile`), started by the jobs Worker as `parse-worker` when parses are due and exiting when idle. | A parse needs a Node child under Node's permission model and libvips within 512 MiB. A Worker isolate gives neither, and the release image is already reviewed. |

### AI guardrails (D15)
- **Opt-in.** AI is off until the user turns it on in a consent sheet that says what is sent, to whom and for how long. The server checks consent on every AI call (`ai_preferences`, migration 0019, with RLS).
- **Numbers come from the database, never from the model.**
  - Notes and answers are written from facts the server computed. Every amount in the model's text is checked against those facts before it is shown, and a mismatch falls back to the plain fact.
  - Ask Bun answers through server tools that run the same SQL as history and summary.
- **Machine guesses are hedged and never saved silently.** A parsed sentence or a scanned slip becomes a *draft* in Quick add; the user confirms it with the normal Save.
- **Data minimisation.**
  - Requests carry only what the task needs: the sentence, the slip image, or aggregates and category names. Account and device identifiers are never sent.
  - Slip images are never stored.
  - Nothing is used for training.
  - Logs keep error class names only (the existing `failureName` rule).
- **Tone.**
  - Kind, short, factual; Thai polite particles only where natural.
  - A "hype" voice for streaks and wins, never a "roast".
  - Never financial-product, investment or credit advice. The model is told so, and refusals fall back to plain facts.
- **Limits.** Per-account daily quotas (30 parses, 10 slips, 3 notes, 20 questions) live in `ai_usage`. The `ai` operational gate pauses all of it with a 503.

## 2. Research

Sources:
- The ~40 Mobbin references gathered for the redesign (appendix of the [redesign plan](2026-10-18-jotbun-redesign.md)). They still cover entry, budgets, trust and empty states.
- The Mobbin searches in §7, run through the Mobbin connector on 24 October 2026 (below).
- Public research on Thai and SEA users and haptics guidance.

Mobbin holds no Thai-language apps (a search for Thai banking, wallet and delivery apps returned nothing). Its Southeast Asian references are GoPay, Grab (OVO), foodpanda and ShopBack, so Thai specifics still come from the findings below rather than from Mobbin.

**Findings that shape the design:**
1. **Ease beats features for older and first-time Thai users.** Studies of Thai mobile-banking adoption find perceived ease of use and security dominate for users over 50. Fewer choices per screen, large type, and words over icons.
2. **Slips are the receipts of Thailand.** PromptPay transfers end in a bank slip screenshot, and people already keep them. Scanning a slip into a draft is the shortest path from payment to diary.
3. **Chat is the native input.** LINE is the default channel in Thailand. Typing "ข้าวมันไก่ 50" is faster than tapping through a form. Natural-language add sits on top of the keypad, not instead of it.
4. **Life in SEA has its own categories:**
   - money sent to family (ส่งเงินให้ครอบครัว);
   - merit making (ทำบุญ);
   - delivery (LINE MAN, Grab, foodpanda);
   - motorbike taxi and BTS/MRT;
   - mobile top-up;
   - 7-Eleven runs;
   - the lottery.
5. **Pay day is the month.** Most salaries land on the 25th to the last day. D11 (pay-day budgets) stays a follow-up because it needs a budget-period change on the server.
6. **Encouragement works better than guilt.** Cleo's "hype mode" and Finch's self-care framing match the redesign's no-shaming rule. Roast-style copy is excluded.
7. **Haptics:**
   - Reserve them for meaningful moments: save, delete, a crossed threshold, a streak.
   - Use semantic types: success, warning, error, selection.
   - Respect system settings, and always pair them with a visual change.
8. **GoGoCash** pays cashback on Shopee, Lazada, Agoda and other merchants through tracked links (gogocash.co). The honest bridge is: "This kind of purchase can earn cashback; here is how."

## 3. Edge backend (`apps/edge`)

Layout:
- `src/server.ts`: one Worker serving `fetch`, `queue` and `scheduled`.
- `src/routes/**`: TanStack Start file routes. Pages are the public trust page and the status page; the `/v1/**` server routes are thin wrappers.
- `src/server/**`: framework-free modules that are tested in Node:
  - `http/`: problems, request id, headers;
  - `db/`: Hyperdrive client and owner transaction;
  - `auth/`: token verifier, session binding, access classes;
  - `commands/`: executor, receipts, change writer, digest;
  - `domain/`: wallets, categories, transactions, budgets, history, summary, sync, policies, me;
  - `ai/`;
  - `bridge/`;
  - `jobs/`.

The SQL is carried over **verbatim** from `apps/api/src`; only Nest DI, Express and guards are replaced. Wire format, headers, error bodies and status codes stay identical. Parity tests run the same scenarios against a real PostgreSQL 17.

Tasks:
- [x] **E0 Scaffold:**
  - TanStack Start with the Cloudflare Vite plugin and `wrangler.jsonc` (Hyperdrive, R2, Queues, Cron).
  - `/live` and `/ready`.
  - The problem renderer (`{code, request_id, message_key, …}`, `Retry-After`, `Cache-Control: no-store`, `x-request-id`).
  - The legacy forwarder.
- [x] **E1 Database and auth:**
  - Owner transaction over a per-request `pg` client:
    - `set_config('gogospend.account_id', …, true)`;
    - the transaction token;
    - timeouts;
    - `gogospend_assert_owner_tx` before commit;
    - transaction-control statements refused.
  - Session-level state is never used, because Hyperdrive pools by transaction.
  - Auth0 access-token verifier (jose remote JWKS, RS256, issuer, audience, allowed clients, at most 15 minutes, no ID tokens, no client-credentials tokens).
  - Session binding through `gogospend_resolve_session`.
  - Access classes, operational gates, client version, and shared rate limits through `gogospend_consume_rate_limit`.
- [x] **E2 Command protocol:**
  - Idempotency-Key, command schema and If-Match parsing.
  - HMAC digest with key rotation.
  - Account lock, active-session check, policy re-check, receipts (replay or `IDEMPOTENCY_MISMATCH`), change writer (revision, `entity_changes`, `entity_heads`, the 1 MiB limit) and audit row.
- [x] **E3 Money routes:**
  - `GET /v1/me`, `GET /v1/policies`, `POST /v1/me/policy-acceptances`, `PUT /v1/me/privacy-preferences`, `POST /v1/me/logout`.
  - Wallets, categories and builtins, transactions, budgets, history and deleted history, summary, `POST /v1/commands/status`, `GET /v1/sync/changes`.
- [x] **E4 AI routes** (parse, slip and ask are `current_policy` plus AI consent; preferences and the note are `bound_session`, and the note without consent is the plain facts):
  - `GET/PUT /v1/me/ai-preferences`;
  - `POST /v1/ai/parse` (sentence → draft);
  - `POST /v1/ai/slip` (image → draft);
  - `GET /v1/ai/note?date=` (grounded daily note);
  - `POST /v1/ai/ask` (Ask Bun with server tools).
  - Migration `0019_ai_companion`: `ai_preferences` and `ai_usage`, with RLS and the `gogospend_app` grants.
- [x] **E5 Bridge and jobs:**
  - `GET /v1/bridge/gogocash/rates`: the public rate list, cached at the edge, with no account data.
  - The Queue consumer and Cron entry wake the Postgres lease queue. Postgres stays the source of truth, and the handlers run the SQL maintenance routines.
  - Image parsing stays on the Node worker (needs `sharp` and the parser sandbox) until a container or Images binding is approved.

Not ported in this plan (stay behind the forwarder):
- imports and their uploads;
- attachments and receipts;
- exports;
- snapshots;
- deletion;
- account linking;
- the `auth/*` bootstrap steps.

Each needs R2 streaming or a sandbox decision.

## 4. App premium layer (`apps/app`)

- [x] **A1 Haptics vocabulary:**
  - Extend `motion.haptic` with these moments: `keyTap`, `amountClear`, `typeSwitch`, `chipPick`, `dateStep`, `saveLanded`, `saveQueued`, `saveFailed`, `deleteDone`, `undoDone`, `thresholdCrossed` (budget 80% and 100%), `streakMilestone`, `celebration`, `sheetOpen`, `tabChange`, `aiSuggestionReady` and `aiAccepted`.
  - Add a setting (On / Subtle / Off; Subtle keeps success, warning and error only).
  - Wire it into the redesign kit and screens: Keypad, TypeSwitch, CategoryChips, DateChip, PillButton (primary), Sheet, TabBar, UndoBar, Quick add save, record delete and restore, budget threshold and the rhythm milestone.
  - Pure tests for the map and setting; render tests that each moment fires once.
- [x] **A2 Thai and SEA ease (partly; see the progress receipts):**
  - "Thai everyday" category pack (labels in TH and EN, icons and hues from the existing kit).
  - Buddhist-era date display setting.
  - "Simple mode" (larger amount type, fewer chips, words under icons).
  - Copy in TH and EN.
- [x] **A3 AI companion:**
  - AI consent sheet (a `PromiseList` of what is sent and what is not).
  - "Tell Bun" sentence input on Quick add, and slip scan from the image picker; both produce drafts.
  - Bun's daily note on Home (`SpeechBubble`), whose fact is also shown elsewhere.
  - Ask Bun screen (`/spend/ask`) with suggested questions.
  - Every AI surface degrades to the deterministic fact when AI is off, offline or paused.
- [x] **A4 Daily love loop (partly; see the progress receipts):**
  - A deterministic fact engine (`bunFacts.ts`) that picks one true, kind fact per day from the diary: streak, under pace, biggest category change, first log of the day. Its output feeds the bubble whether or not AI is on.
  - Gentle celebration moments with the `celebration` haptic, at most once a day.
  - Reminder copy that rotates through facts.
- [x] **A5 GoGoCash bridge:**
  - On-device merchant matcher (`cashbackMatch.ts`) for records' merchant and note text.
  - A monthly "Cashback you could have earned" card on Insights and in the recap, with "Why am I seeing this?".
  - A Settings toggle; a deep link to GoGoCash, with no data attached.
  - Shown only after 7 logged days and only with the bridge flag on.

## 5. Verification

- **Edge:**
  - `npm run typecheck -w gogospend-edge`;
  - `npm run test -w gogospend-edge` (unit);
  - `npm run test:db -w gogospend-edge` (parity against PostgreSQL 17 in Docker);
  - `npm run build -w gogospend-edge`;
  - a `wrangler dev` smoke through Hyperdrive's local connection string.
- **App:** `typecheck:app`, `test:unit`, `test:render`, `export:web`, and the catalogue states for every new screen in light, dark, TH and EN.
- **Existing gate unchanged:** `typecheck`, `test:api` and `test:db` still pass, and NestJS stays the reference implementation until cutover.
- **Real-device haptics and hosted Cloudflare resources** are recorded as SKIPPED until a device and a Cloudflare account are available, as with the other hosted proofs.

## 6. Risks

- **Hyperdrive and the owner transaction:** the NestJS service checks the connection after `COMMIT`. On Hyperdrive the next statement may use another origin connection, so the edge relies on transaction-local settings only and refuses `SET` statements. Parity tests cover RLS isolation between two accounts.
- **Per-isolate state** (JWKS back-off, concurrency caps) is weaker than per-process. Rate limits stay in PostgreSQL, so they are shared.
- **AI cost and latency:** quotas, effort per route and caching of the stable system prompt. `AI_MODEL` lets the owner trade quality for cost after measuring.

## 7. Mobbin research (24 October 2026)

Each search's references, what Jotbun takes from them and where. All iOS.

| Search | References | Taken, and where |
| --- | --- | --- |
| AI money assistant chat | [Cash App](https://mobbin.com/screens/56ff5f1d-e0ad-4657-90e3-ab6ba37081e2), [Lloyds](https://mobbin.com/screens/0b513db0-3b95-44c1-aa50-6ebd386b1c8a), [Cleo AI](https://mobbin.com/screens/73d8bc4c-bc92-4520-9633-40e0f6f4bec5), [Neo](https://mobbin.com/screens/06e53158-0027-4ee6-ba9f-a0d2b7da5b70), [Origin](https://mobbin.com/screens/c759f1aa-5c8a-46d2-a265-f2260a873275) | A standing "can make mistakes" line under the field, and follow-up questions after each answer (Ask Bun). Neo's numbered sources match Ask Bun's "From your diary" figures, which stay. |
| Natural-language entry | [GoPay](https://mobbin.com/screens/e6486a1f-5931-4271-886a-013198d1788c), [Starling](https://mobbin.com/screens/12aafc6e-0b67-4506-9dbe-e5ae1038553e), [Noom](https://mobbin.com/screens/fa013b41-c500-41e0-9023-c036e4664fae), [Lifesum](https://mobbin.com/screens/bc0da8c1-0d21-4abf-8beb-5e2d82cc3c4b) | Starling's settings link inside the AI surface (Ask Bun). GoPay's `000` key and Noom's example placeholder were already in Quick add and Tell Bun. Lifesum's "often tracked" became Tell Bun's "Often logged" chips, from the person's own repeated entries. |
| Receipt and slip scanning | [Splitwise](https://mobbin.com/screens/ba220c78-9ede-4bd0-ba41-16c6476716fa), [Revolut Business](https://mobbin.com/screens/06fddf49-fce7-4440-a537-e9502a702803), [Upside](https://mobbin.com/screens/a4cb797c-2714-4c5c-9b74-d70baf5ee78c) | The chosen slip beside what Bun read from it, to compare before Use this (Tell Bun). |
| Streak celebration | [Speak](https://mobbin.com/screens/7acbb2fc-3817-408f-9db3-25380bb43706), [Finch](https://mobbin.com/screens/aa4e5c2e-3cb5-48e5-8fa4-5441894d435a), [BitePal](https://mobbin.com/screens/b04e4b6c-9383-498a-b2d0-6541427e3cc6) | Confirms the rhythm card: seven day dots, forgiving copy, the mascot cheering. No change. |
| Cashback offers | [ShopBack store](https://mobbin.com/screens/cdb60b38-5238-46a3-8871-891746dc9197), [ShopBack take note](https://mobbin.com/screens/d9ba304e-cc57-42f0-b6ff-43edfa78d973), [ShopBack rates and exclusions](https://mobbin.com/screens/474f4018-1b5b-45c9-997f-8dd7a454954b) | "How cashback works" in three steps (shop through GoGoCash, GoGoCash tracks it, paid once the shop confirms), with rates and conditions left to GoGoCash: no timing or amount Jotbun would have to guess (cashback card). |
| SEA wallets | [GoPay](https://mobbin.com/screens/74bad8c9-6cc5-41e6-b94f-71fbd0e816af), [Grab (OVO)](https://mobbin.com/screens/8bff5e95-d9a5-48d2-ac8e-74636ac193a6), [foodpanda](https://mobbin.com/screens/65350476-0dd2-4a85-bbb1-8c444f9f9914) | Confirms Home's month total under the hero (GoPay's "spent in March"). GoPay's gambling warning is noted for the lottery category: no change while the diary only records it. |
| Consent for AI features | [Starling](https://mobbin.com/screens/45677cbe-2d00-4f8c-bc1a-e5db637797fa), [Zopa](https://mobbin.com/screens/04b47865-a115-4dee-a21d-2e84a6235fb0), [Monzo](https://mobbin.com/screens/ae9c6069-35d6-4377-9573-a9b3fb1f633b) | "Bun can get things wrong, so you always check" added to the consent sheet; it already said what is read, what is never sent, who reads it, and how to turn it off. |
| Success after saving | [Vivid](https://mobbin.com/screens/095e21f4-b72e-48a9-9677-078d4c01e1b5), [bunq](https://mobbin.com/screens/4042e77a-1c5c-43ce-a273-89cc23e423cc), [Wise](https://mobbin.com/screens/7454f035-bfdb-44cf-ae59-67a1b02622b5) | Kept Quick add's in-place save with its haptic: a full-screen confirmation would slow the daily log. |
| Thai apps | None on Mobbin | Thai specifics come from §2's findings. |

Large-text and simple modes were not searched again: Dynamic Type up to AX5 already enlarges every screen (R8).
