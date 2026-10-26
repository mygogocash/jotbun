# Phase 3: Photos and Bun AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bun reads with Haiku 5.5 first and Opus 5.5 only when D25 or D28 says so, through AI Gateway with logging and caching off, behind a new `ai` gate; the add tray takes a receipt photo by camera or album and keeps it in R2 through 1B's image import path; Tell Bun turns one sentence into several drafts; the slip read, Ask Bun, AI consent and settings and the daily note take the Bun Wallet look; every model call becomes one consented `$ai_generation` event; and a development-build check measures 100 real slips and the share of drafts kept without edits.

**Architecture:** The edge keeps 1B-T7's `VaultAiService` on vault steps and adds modules under `apps/edge/src/v1/ai/`: a gateway transport recording every call in a per-request trace under one route deadline, the two models' request bases, `readSlipImage` (D25; P4's per-slip reader) and Ask Bun's fresh-conversation escalation (D28). The vault gains `transactions.source` and a use refund. The app adds steps to P2's add tray (attach, slip read, Tell Bun drafts, consent), a keeper that retains a kept photo once its record reaches the server, the receipt viewer, Ask Bun and AI settings, behind a `bunai` area that stays off until P3-T24.

**Tech Stack** (checked against installed types and current docs, 25 October 2026): Workers and SQLite Durable Objects; `@anthropic-ai/sdk` 1.2.0 (`baseURL`, `defaultHeaders`, `fetch`, `maxRetries`, per-request `timeout` and `signal`, `APIError.generate` and its `headers`, the connection and abort errors); `posthog-node` (1D-T3), no `@posthog/ai` (B6); AI Gateway's `cf-aig-*` headers; Expo SDK 58 with `expo-image-picker` 58.0.10, `expo-file-system` 58.0.9 (`File.bytes()`, `File.delete()`), Gesture Handler 3.3.0 and Reanimated 4.7.1 (P2-T2); React Native 0.88's `Share.share({ url })`; `expo-camera` only after Q1.

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md), §8 phase 3: §2 anti-goals, §3 (D15, D25, D28, D29), §4, §5.2 (Daily capture, `ai-*`, `rc-view`, `es-ai-unavailable`, `es-slip-unreadable`, `es-camera-denied`), §6.6, §6.7, §7 and the proof. The split is the controller's (`boundaries-p3-p6.md`); this plan owns `P3-T2 (P3:source)`, `P3-T6 (P3:ai-results)`, `P3-T3 (P3:ai-gate)`, `P3-T8 (P3:slip-read)`, `P3-T10 (P3:llm-analytics)`, `P3-T1 (P3:slip-qr)`, `P3-T14 (P3:ai-area)` (A10), `P3-T17 (P3:tray-photo)` (A27) and `P3-T12 (P3:qr-native)` (A34).

**Controller calls applied** (`boundaries-p3-p6.md` §5), by P3 task: B2 T2; B3 T12, T15, T17; B4 T15; B5 T7; B6 T10; B7 T9, T20; B8 T14, T24; B9 T8; B14 T1; B25 T14; B27 T4, T8; A10 T14; A13 T1, T12; A14 T7 to T9; A15 T11; A16 T8 (whose `(input, deps)` order is the authority); A17 T24; A18 T5; A19 T10; A24 Q1; A26 T4, T8; A27 T17; A34 T12.

## Shared files

Each edit is named in its task. Additive: contracts `transactions.ts`, `ai.ts`, `index.ts`; the edge's `src/v1/*` route, config, env, handler and Worker-route files, `src/v1/gates.ts` (P4 adds its route to `MODEL_ROUTE_WORKERS`), `src/v1/ai/slip-read.ts` (P4-T4 adds an import mode) and `src/server/ai/prompts.ts` (P4-T4 exports `VOICE`; its import prompt and schema live in `src/v1/ai/slip-import.ts`), `src/v1/ai/service.ts` and `routes.ts`, the vault's `ai.ts`, `routes.ts`, `schema.ts`, migrations, `src/vault/domain/transactions.ts` (P4-T7 and P5 edit it too) and transaction reads, `src/analytics/server-analytics.ts`, `scripts/check-dist.mjs`, the coverage, schema, client and fake-model tests, `wrangler.jsonc` comments and the edge README; the app's `app.json`, `package.json`, the lockfile and `app/_layout.tsx` (P3-T12 only), `locales/*.json` (P3-T15, T24), `app/spend/ask.tsx`, `src/analytics/events.ts`, `diaryRepository.ts`, `resources.ts`, `aiResources.ts` and its fake, `quickAddModel.ts`, P2's `entrySave.ts`, `addFlow.ts`, `AmountStep.tsx`, `ConfirmStep.tsx`, `AddTrayHost.tsx`, `savedMoment.ts`, `SavedToastHost.tsx`, `SaveFlight.tsx`, `WalletRecordScreen.tsx` and `WalletHomeScreen.tsx`, `featureFlags.ts`, the wallet catalogue index, `SettingsScreen.tsx`, `CompanionSettings.tsx`, `AiConsentSheet.tsx`, P6B's `WalletSettingsScreen.tsx`, `WalletPrivacyScreen.tsx` and `companionSwitches.ts` (P3-T14, once P6B-T3 or T5 has landed), `apps/app/README.md` (P3-T23) and (P3-T24 only) `en.json`, `th.json`, `catalogs.test.ts`; `docs/implementation/premium-progress.md` (receipts under `## P3: Photos and Bun AI`) and `beta-receipts.md`. P3 files later plans edit: `src/wallet/photos/trayPhotoSave.ts`, `AttachStep.render.test.tsx` and `src/wallet/bunai/SlipRead.render.test.tsx` (P4-T16b, the slip ref); `locales/*.json` (P4-T13's photo library text, after P4's Q1); `src/wallet/bunai/aiArea.ts` (P6B-T15, the rollout); `src/v1/ai/ask.ts`, `slip-read.ts` and its test, `tellBunDrafts.ts`, `draftReview.ts` and its test, `draftOrigin.ts`, `TellStep.tsx`, `askModel.ts`, `WalletAskScreen.tsx`, `WalletReceiptViewer.tsx` and the `TellStep`, `WalletAsk` and `SlipRead` render tests (P5-T18e, T27a and T27b, the currency). Not additive: P3-T4 renames 1B-T7's `send` to `transport` (`V1Deps`, `WorkerContext`, `VaultAiService`, `startV1`, the fake model) and deletes `anthropicSender` and `SendMessage`; P3-T6 deletes `requestBase`, `DEFAULT_AI_MODEL` and the env's `AI_MODEL`.

## Calls made in this plan

The builder's; the owner may overturn any.
- **H1. The models are fixed in code** (D25, D28): `claude-haiku-5-5` first, `claude-opus-5-5` for escalations; `AI_MODEL` and `DEFAULT_AI_MODEL` retire.
- **H2. One sender, two request bases** (P3-T6): Haiku sets no `betas` or `fallbacks` (a fallback list is a 400 on Haiku 5.5, and `"default"` leaves a refusal refused); Opus keeps today's fallback beta and `fallbacks: 'default'`.
- **H3. One deadline per route** (P3-T6), Haiku capped inside it by a child deadline so Opus keeps the rest; the phone outwaits each route.
- **H4. `model` names the model whose words are shown** (`rules` for the rules or plain facts); `escalated` is true when an Opus call ran.
- **H5. B5's refund (A14):** a use comes back when the request ends without a model answer and its last call failed with a 429, a 5xx, a timeout or no connection. A decline, an ungrounded or malformed answer spends it; an escalated request spends one.
- **H6. D25's triggers are P3-T8's `slipNeedsOpus`,** never a guessed category or wallet; Opus re-reads the same bytes in the same request.
- **H7. D28's escalation is a fresh Opus conversation** (P3-T9). An outage (429, 5xx, timeout) never escalates, for slips too.
- **H8. LLM analytics carry only P3-T10's allow-list** (B6); PostHog prices each call, so no price table is kept in code.
- **H9. `source` is set once, at create.** `photo` means Bun read the record from a photo; a typed record with a receipt stays `typed` with `has_photo: true`. The old Quick add sends none.
- **H10. A kept receipt waits for its record** (P3-T16) and lives in memory only; the attach step's footnote is the retention consent (Q11).
- **H11. Several Tell Bun drafts save through the device diary only** (one `transaction.create` each); one Undo undoes them all (§5.1).
- **H12. P3 revises P2's W15, W26 (for `ai-*`), W33 and W35** behind `bunai`: photos in the tray, the Bun Wallet look for the Bun AI screens, the note on the wallet Home (Q7) and the record's จดจาก row.
- **H13. Private mode hides AI text that carries amounts** (Ask Bun's answer, the note); figures and read amounts use `HIDDEN_AMOUNT`.
- **H14. Ask Bun has no chart:** no tool returns per-week totals; figures carry `count` and `scope` for record counts and "see all".
- **H15. The evaluation keeps its marks in memory** (P3-T22): an English developer tool, compiled out of release builds.
- **H16. `ask_bun_rated` uses the allow-list as it is:** helpful is `outcome: 'kept'`, not helpful `'dropped'` (Q8).
- **H17. The `ai` scope lives in an edge `EdgeGates` subclass of the API's `FeatureGates`** (P3-T3), so `apps/api` is not edited and 1B's consumers still type-check.

## Owner questions

Each has a default the plan follows; a task that depends on one says "default pending owner Qn" (R26).
- **Q1. The QR decoder package.** Default: `expo-camera` (`scanFromURLAsync`), not installed until approved; meanwhile the model's `kind` decides (B3), a photo Bun was asked to read is kept only after a `receipt` read, and a slip attached without asking Bun is kept as a receipt (B3's accepted gap). P3-T12 waits on it, and by A24 so does phase 4's slip import.
- **Q2. An image resizer for camera photos over 1.2 MB** (`AI_SLIP_MAX_BYTES`). Default: none; such a photo is refused before sending, with the screenshot advice.
- **Q3. A sharing package for Android.** Default: none; share is hidden on Android.
- **Q4. AI Gateway authentication, and `cf-aig-collect-log-payload: false` in place of `cf-aig-collect-log: false`.** Default: the spec's header and no gateway token (`AI_GATEWAY_TOKEN` is wired but unset).
- **Q5. The `ai` gate on AI preferences.** Default: ungated; while `ai` is paused they answer `available: false`.
- **Q6. Bumping `AI_NOTICE_VERSION`.** Default: yes, to 2, at P3-T24 with the approved consent wording.
- **Q7. The daily note on the wallet Home.** Default: yes, in full mode only, once a day, with a switch in AI settings.
- **Q8. `ask_bun_rated`'s control.** Default: two buttons under each answer, no free text (H16).
- **Q9. The 100-slip set and its rubric.** Default: the owner supplies the slips on a test phone; P3 and P4 mark one rubric, P3-T22's `EVAL_FIELDS` (`receiver` is the payee) plus, in P4's import mode, the time and both sides' last four digits; thresholds are set when the first run is reviewed; the local allowance is 120 reads a day.
- **Q10. The proof's pass share** of drafts kept without edits. Default: set by the owner after the first run; the receipt records the measured share.
- **Q11. Anthropic retention and zero retention against the consent copy** (counsel, before the beta). Default: the consent names Anthropic and what is sent (P3-T14's `consentWhatLine`) and that Jotbun keeps nothing sent but a receipt the person keeps; the attach footnote replaces `ReceiptConsentSheet` as the retention consent (H10). Drafts until counsel answers.
- **Q12. Photos in private mode.** Default: the slip read step and the receipt viewer cover a photo, whose printed amounts private mode would otherwise show, until a tap.

## Global Constraints

- **Models (§6.7):** H2's bases; Haiku requests also carry no `thinking`, `temperature`, `top_p` or `top_k` and end with a user turn, and a `stop_reason: 'refusal'` is handled in code; Opus requests carry `betas: ['server-side-fallback-2026-07-01']` and `fallbacks: 'default'`. Effort and `max_tokens`: parse `low` 8,000, note `low` 4,000, slip `medium` 8,000, ask `medium` 12,000.
- **AI Gateway (§6.7):** the SDK's `baseURL` is `ANTHROPIC_BASE_URL` (`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic`); every request sends P3-T4's `AI_GATEWAY_HEADERS`, and `cf-aig-authorization` only when `AI_GATEWAY_TOKEN` is set (Q4).
- **Quotas (§6.7):** parses 30, live slip reads 10, notes 3, questions 20 per Bangkok day in `ai_usage` (`AI_DAILY_LIMITS`), consumed before the first model call; H5 refunds. The `ai` gate answers 503 `AI_PAUSED` on the four model routes.
- **Nothing kept (§2, D29):** a slip image never reaches R2, KV, a log, a queue message, an AI Gateway log or PostHog; the single read writes only `ai_usage` (B9). Prompts carry no account, session or device identifier. AI copy and figures stay in baht (B7).
- **Analytics (§7, R23 to R25):** Bun AI events go through 1D-T1's emitters, one per action, from the rule that performs it; server events and `$ai_generation` follow 1D-T11's consent rule. Never sent: amounts, names, notes, slip or photo content, prompts, answers, tool schemas, the gateway URL.
- **Packages (§4):** none new except `expo-camera` after Q1 (P3-T12); no `@posthog/ai`; no lockfile regeneration with Linux bindings.
- **Contracts (C2, C5):** changed in place; a DTO that gains a field changes the app's exact-key validator in the same task. Releases carrying P3-T2, T6, T8, T9 or T24 need a client minimum of at least `AI_MIN_CLIENT_VERSION` (`0.2.0`, pinned by P3-T2 with `app.json`'s `expo.version`; each receipt repeats it for P6C). If a build without P3-T24 is ever released, P3-T24 raises both to `0.2.1` (below P5's `0.3.0`), since its notice bump refuses notice 1.
- **Migrations:** `NNNN_transaction_source.sql`, numbered and journalled by the integrator (handover, "Migration rules"); `transactions` is never rebuilt.
- **Screens and copy (§4, E2):** new screens render only while `useBunAiArea()`, the attach step and photo rows while `usePhotosArea()` (P3-T14); new lines live in `src/wallet/{photos,bunai,receipts}/drafts.ts` (`BunAiTable`, keys `<area>.<name>`), read through P3-T14's self-contained `useBunAiCopy(table)`, which P2-T38's rename of `useDraftCopy` cannot reach before P3-T24. Lines P2 already holds (`common.baht`, `common.tryAgain`, `common.done`, `add.bunGuess`, `add.rowWallet`) come through P2's hook, `useDraftCopy(table)` (P2-T3) until P2-T38 renames it `useWalletCopy()` with no table: P2-T38 moves the P3 call sites merged before it, and a P3 task landing after it calls `useWalletCopy()`. Thai lines are fixed here; English lines are E2 drafts by the implementer. No emojis, no em or en dashes, §5.1's voice. Every P3 section joins `WALLET_SECTIONS` with a `bw-` id and a `Bun Wallet: ` title (P2-T8), so P2-T37's sweep covers it.
- **E2:** **E2-P3-A** (controller, after P3-T19): consent and settings, the attach step (online, offline, camera off, slip QR), the photo row, the slip and receipt reads, unreadable, Bun resting, Tell Bun drafts, the receipt viewer and the record's source row. **E2-P3-B** (after P3-T21): Ask Bun and the daily note. P2's method: `EXPO_PUBLIC_REDESIGN=catalogue,wallet,bunai`, `gogospend://dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&chrome=off`, light and dark Thai and light English, AX5 for the tray steps. P3-T24 waits for both.
- **Accessibility and look (§4, §5.1):** P2's rules: 44 x 44 pt controls, text 4.5:1, graphics 3:1, AX5 untruncated, Thai VoiceOver with ฿ read as บาท, `useWalletReducedMotion()`, amounts only through `WalletAmount` or `HIDDEN_AMOUNT`, `useLockCover()` on a Modal (R63), red and green for budget state only. Every P3 render test runs light and dark, `th` and `en`, through `mountWallet`, with a case `controls are 44 pt, and AX5 truncates nothing`.
- **Logging:** `logFailure` with `failureName` only. **SQL (R57):** unbounded id lists bind as one `json_each(?)` parameter.
- **Process (handover §4):** typed stubs, a behavioural RED whose counts each receipt records, GREEN, a mutation check, the gate, a receipt, a local commit with the attribution trailer, an independent read-only review; no cloud resource; hosted, native and device checks recorded SKIPPED.
- **Gates:** the edge gate is 1A's as the branch defines it, plus `npm run typecheck` from the root when contracts change. The app gate is P2's (its Global Constraints, ending `export:web` and `git diff --check`), plus `node apps/app/scripts/check-export.mjs` from P3-T22 on.

## Review Focus

The cases that prove each item are marked with it in their tasks.
1. **A photo sent to Bun is kept only after a `receipt` read (B3):** a slip, unreadable or failed read, the day's limit and a photo too large for Bun leave no receipt row, keeper job or upload, and a slip QR beats a `receipt` read (P3-T17).
2. **A model that never answers:** every AI route answers inside its deadline, before the phone gives up, and gives the use back (P3-T6, P3-T7).
3. **Both models fail (A14):** after a Haiku draft, the draft is shown and the use spent; after a Haiku decline, unusable or ungrounded answer, an Opus outage gives the use back (P3-T8, P3-T9), and the tray keeps the photo and the draft with Try again (P3-T17).
4. **Several drafts saved offline, one refused:** each draft is its own command, so the others stay saved (P3-T18).
5. **Private mode with Bun's words:** no ฿ amount reaches the screen or a label through an answer, a note, a read or a figure (P3-T17, T20, T21 private cases).

## File structure

```
packages/contracts/src/v1/  transactions.ts (T2); ai.ts (T2, T6, T8, T9)
apps/edge/src/v1/  gates.ts (T3); ai/ transport (T4), models (T6), uses (T7), slip-read (T8), ask (T9), generations (T10), eval-allowance (T11)
apps/edge/src/vault/migrations/NNNN_transaction_source.sql (T2)
apps/app/src/  slips/ (T1, T12); spend/v1/ai/ (T5, T18); dev/draftTally.ts (T5), dev/aiCheck/ (T22); wallet/add/draftOrigin.ts (T13)
apps/app/src/wallet/  bunai/ (T14, T17, T18, T20, T21); photos/ (T15, T16, T17); receipts/ (T19)
apps/app/  src/dev/catalogue/wallet/bunaiSections.tsx; locales/ (T15); app/settings/ai.tsx (T14); app/dev/ai-check.tsx, scripts/check-export.mjs (T22)
```

---

### Task P3-T1: The phone's slip QR module

**Starts after:** base

**Delivers:** P3:slip-qr

A13: the native adapter is P3-T12's own file (`P3-T12 (P3:qr-native)`), whose note says who waits for it.

**Files:**
- Create: `apps/app/src/slips/slipQr.ts`, `apps/app/src/slips/qrDecoder.ts` (both pure: relative imports, no React or native import)
- Test: `apps/app/src/slips/slipQr.test.ts`, `apps/app/src/slips/qrDecoder.test.ts` (Node)

**Interfaces:**
- Produces:
  ```ts
  // slipQr.ts
  export type SlipQr = { bankCode: string; reference: string }
  export const SLIP_QR_API_ID = '000001'
  export function crc16CcittFalse(text: string): number    // poly 0x1021, init 0xFFFF, over the UTF-8 bytes
  export function parseSlipQr(payload: string): SlipQr | null
  // qrDecoder.ts
  export type QrDecoder = { readonly available: boolean; decode(uri: string): Promise<readonly string[]> }
  export const noQrDecoder: QrDecoder                       // available false; decode resolves []
  export function fakeQrDecoder(byUri: Readonly<Record<string, readonly string[]>>): QrDecoder   // available true
  export function installQrDecoder(decoder: QrDecoder | null): void   // P3-T12's adapter and tests; null restores noQrDecoder
  export function getAppQrDecoder(): QrDecoder
  export function slipQrIn(decoder: QrDecoder, uri: string): Promise<SlipQr | null>   // the first payload that parses; a throwing decoder gives null
  ```
- `parseSlipQr` rules (the Thai bank slip verification QR; B14: only root `000001` counts): trim; 1 to 512 printable ASCII characters; top-level fields are a 2-digit tag, a 2-digit length and the value; exactly one root `00` whose sub-fields hold `00` = `000001`, `01` = three digits and `02` = 1 to 64 characters of `[0-9A-Za-z]` (other sub-tags ignored); `51`, when present, is `TH`; `91` comes last with length `04` and is the hex CRC of every character up to and including `9104`, compared without case. When only 1 to 3 characters follow `9104` (an app dropped leading zeros), they are left-padded with `0` and checked again. Anything else is null.

- [ ] **Step 1: Write the typed stubs and the failing tests.** Stubs: `parseSlipQr` returns null, `crc16CcittFalse` returns 0, `slipQrIn` resolves null.
  ```ts
  test('a Thai bank slip QR gives its sending bank and reference', () => {
    assert.deepEqual(parseSlipQr('004000060000010103002021900021231231212000115102TH91049C30'), { bankCode: '002', reference: '0002123123121200011' })
    assert.deepEqual(parseSlipQr(' 00390006000001010300402180162981055123456785102TH91043BF7 '), { bankCode: '004', reference: '016298105512345678' })
  })
  test('the CRC covers everything up to 9104 and is read in either case', () => {
    assert.equal(crc16CcittFalse('004000060000010103002021900021231231212000115102TH9104'), 0x9c30)
    assert.ok(parseSlipQr('004000060000010103002021900021231231212000115102TH91049c30'))
    assert.equal(parseSlipQr('004000060000010103002021900021231231212000115102TH91049C31'), null)
  })
  test('a CRC whose leading zero was dropped is padded back', () => {
    assert.deepEqual(parseSlipQr('00390006000001010301402180163000000000000035102TH910445A'), { bankCode: '014', reference: '016300000000000003' })
  })
  test('TrueMoney and payment QR codes are not bank slips', () => {
    assert.equal(parseSlipQr('00480002010102010203P2P0313TXN00012345670408250120249104b425'), null)
    assert.equal(parseSlipQr('0002010102115802TH6304ABCD'), null)
  })
  test('a slip-shaped QR whose root is not 000001 is not a bank slip (B14)', () => {
    assert.equal(parseSlipQr('004000060000020103002021900021231231212000115102TH91044531'), null)   // root 000002, CRC 4531 valid
  })
  ```
  Also `anything malformed is null`: a length longer than the text, a root without `02`, `51` = `US`, a reference with a space, 513 characters, and a payload whose `91` is not last. `qrDecoder.test.ts`: `noQrDecoder is unavailable and finds nothing`; `slipQrIn returns the first payload that is a bank slip` (a fake decoder answering `['https://example.test', <the 004 slip>]` gives bank `004`); `a decoder that throws finds no slip`; `installQrDecoder replaces the app's decoder and null restores noQrDecoder`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/slipQr.test.ts src/slips/qrDecoder.test.ts`.
- [ ] **Step 3: Implement** the parser, the CRC and the decoder registry as the rules say.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Skip the CRC comparison: the wrong-CRC case fails. Accept any root id: the `000002` case fails. Drop the padding: the dropped-zero case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Read Thai bank slip QR codes on the phone, with their CRC, behind a decoder port"`

---

### Task P3-T2: Record source in the contract, the vault and the phone's outbox

**Starts after:** 1A-T5, 1A-T7, 1D-T1

**Delivers:** P3:source

B2: `source` arrives in phase 3; older records stay NULL.

**Files:**
- Modify: `packages/contracts/src/v1/transactions.ts`, `v1/ai.ts` (`AI_MIN_CLIENT_VERSION`), `src/index.ts`
- Create: `apps/edge/src/vault/migrations/NNNN_transaction_source.sql` (numbered by the integrator)
- Modify: `apps/edge/src/vault/migrations/index.ts`, `src/vault/schema.ts`, `src/vault/domain/transactions.ts`, `src/vault/reads/history.ts` and `reads/deleted-history.ts` (where they keep their own column lists), `test/workers/vault-schema.test.ts`
- Modify: `apps/app/src/storage/diaryRepository.ts` (`ENTRY_KEYS`, `TRANSFER_KEYS`, `assertDraft`), `apps/app/src/spend/v1/resources.ts` (`CreateEntryInput`, `CreateTransferInput`), `apps/app/src/analytics/events.ts` (`RecordSource`), `apps/app/app.json` (`expo.version` `0.2.0`)
- Test: `apps/edge/test/contracts-source.test.ts` (Node), `apps/edge/test/workers/transaction-source.test.ts`, `apps/app/src/storage/diaryRepository.test.ts`, `apps/app/src/api/aiClientVersion.test.ts` (Node)

**Interfaces:**
- Consumes: `createTransaction`, `TransactionRow` (1A-T5) and the column list and row-to-DTO mapping inside its `src/vault/domain/transactions.ts` (module-private; this task edits that file); the history reads (1A-T7); `RecordSource` (1D-T1).
- Produces:
  ```ts
  // packages/contracts/src/v1/transactions.ts
  export const TRANSACTION_SOURCES = ['typed', 'photo', 'slip_import', 'tell_bun', 'statement', 'share_extension', 'siri'] as const
  export type TransactionSource = (typeof TRANSACTION_SOURCES)[number]
  export function parseTransactionSource(value: unknown, field?: string): TransactionSource | null   // absent or null: none; else one of the seven, or ContractValidationError('VALIDATION_FAILED', …, 'source')
  // RecordFields gains source?: TransactionSource (present only when set); RecordInput gains source?: TransactionSource | null
  // isTransactionSnapshot accepts a source key holding one of the seven, and still accepts no key
  // packages/contracts/src/v1/ai.ts: the floor for every P3 contract change (C5)
  export const AI_MIN_CLIENT_VERSION = '0.2.0'
  // apps/app/src/analytics/events.ts
  export type RecordSource = TransactionSource
  ```
  The vault column is `transactions.source TEXT CHECK (source IN (<TRANSACTION_SOURCES>))`, nullable, added with `ALTER TABLE … ADD COLUMN` (never a rebuild, so receipt links and import progress keep their rows). `createTransaction` accepts `source` (a known field, in the digested payload); `updateTransaction` does not. The row-to-DTO mapping writes `source` only when the row has one.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `parseTransactionSource` returns null; the migration file holds only a comment.
  - `contracts-source.test.ts`: `the sources are the spec's seven, in order`; `a record snapshot accepts each source or none, and refuses anything else` (an expense snapshot passes with each of the seven and without the key; `'manual'` and `null` fail); `parseTransactionSource reads absent and null as none and refuses other values on source`.
  - `transaction-source.test.ts`:
    - `a record made with a source keeps it, and every read shows it`: `POST /v1/transactions` with `source: 'tell_bun'` is 201; `GET /v1/transactions/:id`, the `GET /v1/history` item and the `GET /v1/sync/changes` snapshot each carry `source: 'tell_bun'`.
    - `a record made without a source reads without the key` (`'source' in body` is false).
    - `an unknown source is 422 VALIDATION_FAILED on source, and nothing is written` (no row, no receipt).
    - `the same command key with another source is 409 IDEMPOTENCY_MISMATCH`.
    - `an edit cannot set the source`: `PATCH` with `source: 'photo'` is 422 `UNKNOWN_FIELD` on `source`, and the record stays at version 1.
    - `a row without a source reads as before, with its receipt link` (seed with `sqlExec` a row whose `source` is NULL; once 1B-T9 has merged, also a `transaction_attachments` link, still read as `attachment_id`).
  - `vault-schema.test.ts`: the migration count rises by one; the column-for-column test covers `transactions.source`.
  - `diaryRepository.test.ts`: `a pending entry may carry a source, and an unknown one is refused` (`source: 'photo'` saves; `source: 'camera'` rejects with `A pending entry is not a valid create: source.`).
  - `aiClientVersion.test.ts`: `this build is at least the minimum client version` (`compareVersions(appJson.expo.version, AI_MIN_CLIENT_VERSION) >= 0`, `app.json` read with `readFileSync`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/contracts-source.test.ts`, `npm run test:edge:workers -- test/workers/transaction-source.test.ts test/workers/vault-schema.test.ts` and `npm run test:unit -w gogospend-app -- src/storage/diaryRepository.test.ts src/api/aiClientVersion.test.ts`.
- [ ] **Step 3: Implement** as the Interfaces say (`source: text('source')` in `schema.ts`; the app's `assertDraft` checks through `parseTransactionSource`), and set `expo.version` to `0.2.0`.
- [ ] **Step 4: Run them and see them pass,** with 1A's transaction and history suites unchanged and the parity session unaffected (it never sends `source`).
- [ ] **Step 5: Mutation check.** Drop `source` from the DTO mapping: the read test fails. Let `parseTransactionSource` accept any string: the 422 test fails. Add `source` to the edit's known fields: the edit test fails. Leave `expo.version` at `0.1.0`: the client-version case fails.
- [ ] **Step 6: Gate, receipt, commit.** The edge gate with `npm run typecheck`, and the app gate; the receipt names the client minimum (`0.2.0`). `git commit -m "Record how each record was made: source in the contract, the vault and the phone's outbox"`

---

### Task P3-T3: The ai gate

**Starts after:** 1B-T13

**Delivers:** P3:ai-gate

**Files:**
- Create: `apps/edge/src/v1/gates.ts`
- Modify: `apps/edge/src/v1/config.ts` (`gatesOf` accepts `ai`; the fail-closed path pauses `EDGE_GATE_SCOPES`; `EdgeConfig.gates` and `readGates` give `EdgeGates`), `src/v1/routes.ts` (`VaultRoute.gates?: readonly EdgeGateScope[]`; `gates: ['ai']` on `POST /v1/ai/parse`, `POST /v1/ai/slip`, `GET /v1/ai/note`, `POST /v1/ai/ask`), `src/v1/handler.ts` (a route's gates go to `EdgeGates.assertOpen`; Worker routes get `config.gates`), `src/v1/worker-routes.ts` (`WorkerContext.gates: EdgeGates`), `src/v1/ai/routes.ts` (preferences say `available: false` while `ai` is paused), `test/route-coverage.test.ts`
- Test: `apps/edge/test/edge-gates.test.ts` (Node), `apps/edge/test/workers/ai-gate.test.ts`, `test/workers/config.test.ts`

**Interfaces:**
- Consumes: `FeatureGates`, `GATE_SCOPES`, `GATE_PROBLEM_CODES` (`@api/common/feature-gates`, read-only); `readEdgeConfig`, `readGates` (1A, 1B-T4); the AI Worker routes and `WorkerContext.gates` (1B-T3, 1B-T7).
- Produces:
  ```ts
  // src/v1/gates.ts
  export const EDGE_GATE_SCOPES = [...GATE_SCOPES, 'ai'] as const
  export type EdgeGateScope = (typeof EDGE_GATE_SCOPES)[number]
  export class EdgeGates extends FeatureGates {
    constructor(config?: { paused?: readonly EdgeGateScope[]; unexposed?: readonly GateScope[]; retryAfterSeconds?: number })
    override isPaused(scope: EdgeGateScope): boolean
    override isExposed(scope: EdgeGateScope): boolean      // ai is always exposed
    override assertOpen(...scopes: EdgeGateScope[]): void   // 404 for an unexposed scope; else 503 for the first paused one, AI_PAUSED (messageKey 'errors.ai_paused') for ai, with retryAfterSeconds
    pausedEdgeScopes(): EdgeGateScope[]                     // pausedScopes() in order, then 'ai'
  }
  export const MODEL_ROUTE_WORKERS: readonly WorkerRouteId[]   // ['ai.parse', 'ai.slip', 'ai.note', 'ai.ask']; P4 adds its slips route's id
  // src/v1/config.ts
  export function readGates(kv: KVNamespace): Promise<EdgeGates>   // EdgeConfig.gates: EdgeGates
  ```
- `apps/api` is not edited (H17). The constructor hands the API's five scopes to `super` and keeps `ai` itself. `pausedScopes()` stays the API's `GateScope[]`: a wider override is TS2416 and would stop `EdgeGates` passing where 1B-T3 and 1B-T4 take a `FeatureGates`.

- [ ] **Step 1: Stub, then write the failing tests.** Stub: `EdgeGates` ignores `ai`.
  - `edge-gates.test.ts`: `ai is paused on its own and answers AI_PAUSED with its retry` (`new EdgeGates({ paused: ['ai'], retryAfterSeconds: 120 })`: `assertOpen('writes')` passes; `assertOpen('ai')` throws a 503 `AI_PAUSED` with `retryAfterSeconds` 120); `an EdgeGates is a FeatureGates` (`instanceof`, and `claimableKinds(['import_parse'])` answers as the API's); `pausedEdgeScopes lists ai after the API's scopes` (`pausedScopes()` still lists only the API's).
  - `config.test.ts`: `a config that pauses ai is read, not malformed` (`{ gates: { paused: ['ai'] } }`: `ai` paused, `writes` open, policies as stored); `an unreadable or malformed config pauses ai too` (a KV that throws: `isPaused('ai')` with a 30-second retry); `an unknown scope still fails the config closed`.
  - `ai-gate.test.ts`: `a paused ai gate answers 503 AI_PAUSED with Retry-After on parse, slip, note and ask, before authentication` (no token: each is 503 with `retry_after_seconds` 120 and `Retry-After: 120`; the fake model has no call); `AI preferences stay open and say available false while ai is paused` (default pending owner Q5: `GET` is 200 with `available: false`, `PUT` still saves); `pausing writes leaves AI open, and pausing ai leaves writes open`.
  - `route-coverage.test.ts`: `every route that calls a model carries the ai gate` (each route whose `worker` is in `MODEL_ROUTE_WORKERS` lists `ai`; the preferences routes do not).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/edge-gates.test.ts test/route-coverage.test.ts` and `npm run test:edge:workers -- test/workers/ai-gate.test.ts test/workers/config.test.ts`.
- [ ] **Step 3: Implement** `EdgeGates`, the config changes, the route gates and the preferences' `available` (`dto.available && !w.gates.isPaused('ai')`).
- [ ] **Step 4: Run them and see them pass,** with 1B's parse-consumer and pending-work suites unchanged, and `npm run typecheck` from the root (an `EdgeGates` passes wherever 1B takes a `FeatureGates`).
- [ ] **Step 5: Mutation check.** Fail closed with `GATE_SCOPES` only: the unreadable case fails. Leave the note route ungated: the coverage test fails. Ignore the gate in preferences: its case fails.
- [ ] **Step 6: Gate, receipt, commit.** Note in the receipt: deploy this reader before any config names `ai` (1B's owner answer 3). `git commit -m "Add the ai gate: the edge's own scope list, AI_PAUSED on every model route, failing closed"`

---

### Task P3-T4: The gateway transport, one deadline per request and the call trace

**Starts after:** 1B-T13

**Files:**
- Create: `apps/edge/src/v1/ai/transport.ts`
- Modify: `apps/edge/src/v1/env.ts` (`AI_GATEWAY_TOKEN?: string`), `src/v1/handler.ts` (`V1Deps.transport` replaces 1B-T7's `send`; each request's context gets `deps.transport !== undefined ? deps.transport : transportFromEnv(env)`), `src/v1/worker-routes.ts` (`WorkerContext.transport` replaces 1B-T7's `send`), `src/v1/ai/service.ts` (deps take `transport` for `send`; every call goes through `tracedSend` with the request's trace and, until P3-T6, `new AiDeadline(25_000)`, today's timeout), `src/v1/ai/routes.ts` (the service gets `w.transport`), `src/server/ai/model.ts` (delete `anthropicSender` and `SendMessage`), `test/support/fake-model.ts` (a `transport`; replies may name their model; `apiFailure(status, headers?)` and `hang()`, which rejects with `APIConnectionTimeoutError` once the call's `timeoutMs` has passed), `test/workers/support/v1-client.ts` (`startV1` option `transport` replaces `send`), `apps/edge/README.md` and `wrangler.jsonc` comments (`ANTHROPIC_BASE_URL` is the gateway URL; secrets `ANTHROPIC_API_KEY`, `AI_GATEWAY_TOKEN`)
- Test: `apps/edge/test/ai-transport.test.ts` (Node); 1B-T7's `test/workers/ai.test.ts` runs on the new option

**Interfaces:**
- Consumes: `MessageParams`, `ModelMessage` (`src/server/ai/model.ts`); `VaultAiService`, `AI_FEATURES` (1B-T7, contracts); `flag` (`src/server/env.ts`).
- Produces:
  ```ts
  export const AI_GATEWAY_HEADERS = { 'cf-aig-collect-log': 'false', 'cf-aig-skip-cache': 'true' } as const
  export const MIN_CALL_MS = 2_000
  export type ModelTransport = { send(params: MessageParams, options: { timeoutMs: number }): Promise<ModelMessage> }
  export function anthropicTransport(config: { apiKey: string; baseURL?: string; gatewayToken?: string; fetch?: typeof fetch }): ModelTransport
  export function transportFromEnv(env: Pick<V1Env, 'AI_ENABLED' | 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL' | 'AI_GATEWAY_TOKEN'>): ModelTransport | null
  export type CallFailure = 'rate_limited' | 'server_error' | 'timeout' | 'no_connection' | 'rejected' | 'other'
  export function callFailure(error: unknown): CallFailure
  export class AiDeadline { constructor(totalMs: number, now?: () => number); remainingMs(): number; child(capMs: number): AiDeadline }   // child: ends at the earlier of this deadline and capMs from now, on the same clock
  export class DeadlinePassed extends Error {}
  export type RecordedCall = { spanId: string; feature: AiFeature; requested: string; model: string; escalated: boolean; latencyMs: number; sent: boolean;
    httpStatus: number | null; retryAfterSeconds: number | null; failure: CallFailure | null; stopReason: string | null; usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null }
  export type AiTrace = { readonly id: string; readonly calls: RecordedCall[]; analytics: 'yes' | 'no' | 'unasked' }
  export function newTrace(): AiTrace   // a fresh UUID; analytics 'unasked' until P3-T10 reads the consent
  export function tracedSend(transport: ModelTransport, trace: AiTrace, deadline: AiDeadline, call: { feature: AiFeature; escalated: boolean; params: MessageParams; capMs?: number }): Promise<ModelMessage>
  // handler.ts: V1Deps.transport?: ModelTransport | null; worker-routes.ts: WorkerContext.transport: ModelTransport | null (P4-T6's slips route reads it too)
  ```
- `anthropicTransport`: `new Anthropic({ apiKey, baseURL: baseURL || undefined, maxRetries: 0, defaultHeaders, fetch })`: no retry inside a call, so a 429's `APIError` reaches `tracedSend` with its headers (B27, A26; SDK 1.2.0 would sleep out `retry-after` and end as `APIUserAbortError`). `defaultHeaders` = `AI_GATEWAY_HEADERS` plus `cf-aig-authorization: Bearer <gatewayToken>` when given (default pending owner Q4: none); `send` calls `client.beta.messages.create(params, { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs) })`. `transportFromEnv` is null unless `flag(AI_ENABLED)` and `ANTHROPIC_API_KEY`.
- `tracedSend`: the call's time is `min(deadline.remainingMs(), capMs)`; below `MIN_CALL_MS` it records a `timeout` call with `sent: false` and throws `DeadlinePassed` without sending. Otherwise it records `sent: true`, `model` (`message.model`, else `params.model`), `httpStatus` (200, or the `APIError`'s status), `retryAfterSeconds` (a failed `APIError`'s `retry-after` in whole seconds, 1 to 3,600, else null), `stopReason`, `usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens ?? 0`, `cache_creation_input_tokens ?? 0`) and the latency, then returns or rethrows.
- `callFailure`: `DeadlinePassed`, `APIUserAbortError` and `APIConnectionTimeoutError` are `timeout`; any other `APIConnectionError` is `no_connection`; an `APIError` with status 429 is `rate_limited`, 500 and above `server_error`, any other status `rejected`; anything else `other`.

- [ ] **Step 1: Stub, then write the failing tests** in `ai-transport.test.ts`, with a recording `fetch` that answers a JSON message. Stubs: the transport sends no headers, `callFailure` returns `other`, `tracedSend` records nothing.
  - `every request goes to the gateway with logging and caching off`: `baseURL` `https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic`: the URL starts with that plus `/v1/messages`; headers `cf-aig-collect-log: false`, `cf-aig-skip-cache: true`, `x-api-key: sk-test`; no `cf-aig-authorization`.
  - `the gateway token is sent only when set`: `gatewayToken: 't0k'` sends `cf-aig-authorization: Bearer t0k`.
  - `a call that outlives its time fails as a timeout and is recorded`: a `fetch` that settles only by rejecting with an `AbortError` when its `init.signal` aborts (the SDK awaits it), `new AiDeadline(2_100)`: rejects within 3 s; `callFailure` is `timeout`; the trace holds one call with `failure: 'timeout'` and `httpStatus: null`.
  - `a rate limit fails at once as rate_limited with its wait`: a `fetch` answering 429 with `retry-after: 40`, `new AiDeadline(25_000)`: rejects within 2 s after one `fetch`; `callFailure` is `rate_limited`; the recorded call has `httpStatus: 429` and `retryAfterSeconds: 40`.
  - `a request with less than 2 s left makes no call`: `new AiDeadline(1_000)`: `DeadlinePassed`, `fetch` never called, one recorded `timeout` with `sent: false`.
  - `a child deadline ends at the earlier of its cap and its parent` (a fake clock: a 55 s parent's 25 s child reads 25,000; 40 s into a 45 s parent, a 25 s child reads 5,000).
  - `callFailure names each failure` (the mapping above, with `APIError.generate` for 429, 529, 500 and 400, and one instance of each connection and abort error).
  - `the trace keeps the reply's model, status, stop reason and tokens`: a reply naming `claude-haiku-5-5` with usage `{ input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 10, cache_creation_input_tokens: null }` records `{ model: 'claude-haiku-5-5', httpStatus: 200, stopReason: 'end_turn', usage: { input: 120, output: 40, cacheRead: 10, cacheWrite: 0 } }`.
  - `transportFromEnv is null unless AI is on and keyed`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/ai-transport.test.ts`.
- [ ] **Step 3: Implement** the module, swap the service's sender for the transport (behaviour otherwise unchanged; models stay as 1B-T7 left them until P3-T6) and move the fake and `startV1` to `transport`.
- [ ] **Step 4: Run them and see them pass,** then `npm run test:edge:workers -- test/workers/ai.test.ts` (1B-T7's 17 ported cases plus its two, unchanged).
- [ ] **Step 5: Mutation check.** Drop `cf-aig-collect-log`: the gateway test fails. Ignore the deadline in `tracedSend`: the less-than-2-s test fails. Read 529 as `rejected`: the failure case fails. Set `maxRetries: 1`: the rate-limit case fails.
- [ ] **Step 6: Gate, receipt, commit.** Recorded for P6C (A20): every environment with `AI_ENABLED` true sets `ANTHROPIC_BASE_URL` to its gateway, or calls skip AI Gateway (§6.7). `git commit -m "Send every model call through AI Gateway with logging and caching off, under one deadline, recorded in a trace"`

---

### Task P3-T5: The Bun AI emitters and the draft review

**Starts after:** 1D-T1, P2-T3

**Files:**
- Modify: `apps/app/src/analytics/events.ts` (six emitters; `trackRecordSaved` gains `hasPhoto`)
- Create: `apps/app/src/spend/v1/ai/draftReview.ts` (pure), `apps/app/src/spend/v1/ai/useDraftReview.ts`, `apps/app/src/dev/draftTally.ts`
- Test: `apps/app/src/analytics/events.test.ts`, `apps/app/src/spend/v1/ai/draftReview.test.ts`, `apps/app/src/dev/draftTally.test.ts` (Node)

**Interfaces:**
- Consumes: `trackClientEvent`, `setConsentedTelemetrySink`, `recordAnalytics`, the Bun AI and Reliability rules of `APP_EVENTS` (1D-T1); `StoreBackend` and `installStoreBackend` (P2-T3).
- Produces:
  ```ts
  // events.ts (each calls trackClientEvent only, R23)
  export type AiModelName = 'claude-haiku-5-5' | 'claude-opus-5-5' | 'rules'   // P3-T18 makes it `= AiModel`
  export type DraftOutcome = 'kept' | 'edited' | 'dropped'
  export function trackAiConsentChanged(): void       // {}: the common ai_enabled, set by the caller first, carries the new answer
  export function trackTellBunSent(p: { model: AiModelName; escalated: boolean }): void
  export function trackAiDraftReviewed(p: { outcome: DraftOutcome; fieldsEdited: number; model: AiModelName; escalated: boolean }): void   // fields_edited kept within 0..20
  export function trackAskBunAsked(p: { model: AiModelName; escalated: boolean }): void
  export function trackAskBunRated(p: { helpful: boolean; model: AiModelName; escalated: boolean }): void   // outcome 'kept' or 'dropped' (H16, A18, default pending owner Q8)
  export function trackAiUnavailable(p: { reasonCode: string; screen: string }): void
  // trackRecordSaved's input gains hasPhoto?: boolean (has_photo, false when absent)
  // draftReview.ts
  export type DraftFields = { type: string; amountMinor: string | null; occurredOn: string | null; categoryId: string | null; walletId: string | null; merchant: string | null; note: string | null }
  export function fieldsEdited(before: DraftFields, after: DraftFields): number   // '' and null are the same
  export function savedOutcome(before: DraftFields, after: DraftFields): { outcome: 'kept' | 'edited'; fieldsEdited: number }
  export function reviewDraft(p: { outcome: DraftOutcome; fieldsEdited: number; model: AiModelName; escalated: boolean }, tally?: (outcome: DraftOutcome, model: AiModelName) => void): void
  // useDraftReview.ts
  export function useDraftReview(): (p: Parameters<typeof reviewDraft>[0]) => void
  // dev/draftTally.ts (development builds only)
  export const DRAFT_TALLY_KEY = 'jotbun.dev.draft-tally'   // a marker P3-T22's export check looks for
  export type DraftCounts = { kept: number; edited: number; dropped: number }
  export type DraftTally = Readonly<Record<AiModelName, DraftCounts>>   // per model, so the proof can tell the AI's share from the rules'
  export function addDraftOutcome(outcome: DraftOutcome, model: AiModelName, backend?: StoreBackend): Promise<void>
  export function readDraftTally(backend?: StoreBackend): Promise<DraftTally>
  export function resetDraftTally(backend?: StoreBackend): Promise<void>
  ```
- `useDraftReview` passes the tally only in development builds, at module level (the catalogue's pattern, which Metro drops from release bundles): `const tally = typeof __DEV__ !== 'undefined' && __DEV__ ? require('@mobile/dev/draftTally').addDraftOutcome : undefined`. `draftTally.ts` imports AsyncStorage lazily, only when no backend is passed, and holds counts only.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: the emitters do nothing; `fieldsEdited` returns 0.
  - `events.test.ts` (through `setConsentedTelemetrySink`): `the Bun AI emitters send §7's names and properties`: `trackTellBunSent({ model: 'rules', escalated: false })` sends `['tell_bun_sent', { model: 'rules', escalated: false }]`; `trackAiDraftReviewed({ outcome: 'edited', fieldsEdited: 25, model: 'claude-haiku-5-5', escalated: false })` sends `fields_edited: 20`; `trackAskBunRated({ helpful: false, model: 'claude-opus-5-5', escalated: true })` sends `['ask_bun_rated', { outcome: 'dropped', model: 'claude-opus-5-5', escalated: true }]` and `helpful: true` sends `outcome: 'kept'`; `trackAiUnavailable({ reasonCode: 'AI_PAUSED', screen: '/spend/add' })` sends `{ reason_code: 'AI_PAUSED', screen: '/spend/add' }`; `trackAiConsentChanged()` sends `{}`. `record_saved carries the photo flag and every source` (`source: 'photo', hasPhoto: true` gives `source: 'photo', has_photo: true`).
  - `draftReview.test.ts`: `fieldsEdited counts changed fields only` (amount `'5000'` to `'5500'` plus a new category is 2; a merchant `null` against `''` is 0); `savedOutcome is kept without changes and edited with any`; `reviewDraft sends one ai_draft_reviewed, then tallies once with its model` (`recordAnalytics()` and a spy); `useDraftReview.ts imports with __DEV__ undefined` (a dynamic import resolves).
  - `draftTally.test.ts`: `the tally counts outcomes per model and holds nothing else` (two Haiku kept and one rules dropped read `claude-haiku-5-5` `{ kept: 2, edited: 0, dropped: 0 }`, `rules` `{ kept: 0, edited: 0, dropped: 1 }` and Opus zeros; the stored JSON holds only the three models, each with exactly those three counts).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/analytics/events.test.ts src/spend/v1/ai/draftReview.test.ts src/dev/draftTally.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with 1D-T1's `neverSent.test.ts` unchanged.
- [ ] **Step 5: Mutation check.** Send `fields_edited` unclamped: the 25 case fails. Map helpful to `edited`: the `helpful: true` case fails. Read `__DEV__` bare: the import case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the Bun AI emitters, has_photo, and a draft review with a development-build tally"`

---

### Task P3-T6: Haiku first, and AI results that name their model

**Starts after:** P3-T4

**Delivers:** P3:ai-results

**Files:**
- Create: `apps/edge/src/v1/ai/models.ts`
- Modify: `packages/contracts/src/v1/ai.ts`, `src/index.ts`; `apps/edge/src/v1/ai/service.ts`, `src/v1/env.ts` (drop `AI_MODEL`), `src/server/ai/model.ts` (delete `requestBase` and `DEFAULT_AI_MODEL`), `src/v1/handler.ts` (`V1Deps.aiDeadlines?: Partial<Record<AiFeature, number>>`), `src/v1/worker-routes.ts` (`WorkerContext.aiDeadlines`), `src/v1/ai/routes.ts` (the service gets `deadlines: w.aiDeadlines`), `test/workers/support/v1-client.ts` (`startV1` option `aiDeadlines`); `apps/app/src/spend/v1/ai/aiResources.ts`, `src/spend/v1/ai/testing/fakeAiResources.ts`
- Test: `apps/edge/test/contracts-ai.test.ts` (Node), `apps/edge/test/workers/ai-routing.test.ts`, `apps/app/src/spend/v1/ai/aiResources.test.ts` (Node)

**Interfaces:**
- Consumes: `ModelTransport`, `tracedSend`, `newTrace`, `AiDeadline` (P3-T4); `PARSE_SCHEMA`, `SLIP_SCHEMA`, `NOTE_SCHEMA`, the systems (`src/server/ai/prompts.ts`); `ASK_TOOLS` (`src/v1/ai/tools.ts`).
- Produces:
  ```ts
  // contracts ai.ts
  export const AI_MODELS = ['claude-haiku-5-5', 'claude-opus-5-5', 'rules'] as const
  export type AiModel = (typeof AI_MODELS)[number]
  // AiParseResult, AiSlipResult, AiNoteResult and AiAskResult each gain { model: AiModel; escalated: boolean } (H4)
  export const AI_ROUTE_DEADLINE_MS: Readonly<Record<AiFeature, number>>   // { parse: 15_000, slip: 45_000, note: 10_000, ask: 55_000 }
  export const AI_PHONE_TIMEOUT_MS: Readonly<Record<AiFeature, number>>    // { parse: 20_000, slip: 60_000, note: 15_000, ask: 60_000 }: 5 s more, 15 s for the slip's upload
  // src/v1/ai/models.ts
  export const HAIKU = 'claude-haiku-5-5'
  export const OPUS = 'claude-opus-5-5'
  export type ModelTier = typeof HAIKU | typeof OPUS
  export type { Effort }   // imported from src/server/ai/model.ts and re-exported: one Effort
  export function haikuRequest(effort: Effort, maxTokens: number): Pick<MessageParams, 'model' | 'max_tokens' | 'output_config'>
  export function opusRequest(effort: Effort, maxTokens: number): Pick<MessageParams, 'model' | 'max_tokens' | 'betas' | 'fallbacks' | 'output_config'>
  export const HAIKU_SLIP_CAP_MS = 20_000
  export const HAIKU_ASK_CAP_MS = 25_000
  ```
  `VaultAiService` deps become `{ transport: ModelTransport | null; now?: () => Date; deadlines?: Partial<Record<AiFeature, number>> }`; each request makes one `newTrace()` and one `AiDeadline(deadlines[feature] ?? AI_ROUTE_DEADLINE_MS[feature])`. A result's `model` is the tier whose words are shown (`HAIKU` or `OPUS`) or `rules`, never `message.model`, which Opus's fallbacks may change; the trace keeps `message.model` for `$ai_model`.
- Routing here (escalation comes in P3-T8 and P3-T9): parse is Haiku `low`, 8,000, with the rules as today's fallback; note is Haiku `low`, 4,000, with plain facts; slip is Haiku `medium`, 8,000; ask is Haiku `medium`, 12,000, five turns under `deadline.child(HAIKU_ASK_CAP_MS)`. A rules or plain-facts answer says `model: 'rules'`; every result says `escalated: false`.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: the new constants exist; results say `model: 'rules'`.
  - `contracts-ai.test.ts`: `every phone timeout outwaits its route's deadline by 5 seconds, and a slip's by 15`; `the models are Haiku 5.5, Opus 5.5 and rules`.
  - `ai-routing.test.ts` (its scripted slip replies are complete reads carrying `kind: 'slip'`, which the parser ignores until P3-T8, so P3-T8 escalates none of them):
    - `parse, note, slip and ask call Haiku 5.5 with no betas, fallbacks, thinking, sampling or prefill`: per route, the recorded params have `model: 'claude-haiku-5-5'`, none of the keys `betas`, `fallbacks`, `thinking`, `temperature`, `top_p`, `top_k`, a last message whose role is `user`, `output_config.effort` `low`, `low`, `medium`, `medium` and `max_tokens` 8,000, 4,000, 8,000, 12,000.
    - `the results name the model`: a Haiku parse whose reply names `claude-opus-5-5` is `{ source: 'ai', model: 'claude-haiku-5-5', escalated: false }`; a parse Haiku refuses is `{ source: 'rules', model: 'rules', escalated: false }`; a plain-facts note says `model: 'rules'`.
    - `each route answers inside its deadline when the model hangs` (Review Focus 2): with `aiDeadlines` of 2,500 ms and a hanging transport, parse answers 200 by the rules, note 200 with plain facts, slip and ask 503 `AI_PAUSED`, each within 4 s.
    - `no prompt carries the account, the session or a balance` (1B-T7's privacy case on every Haiku call).
  - `aiResources.test.ts`: `AI results without model or escalated are refused, and with them accepted` (and `model: 'gpt'` is refused); `each AI call waits its route's phone timeout` (a recording transport sees `timeoutMs` and `deadlineMs` 20,000, 60,000, 15,000 and 60,000; the posts keep `resendLost: false`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/contracts-ai.test.ts`, `npm run test:edge:workers -- test/workers/ai-routing.test.ts test/workers/ai.test.ts` and `npm run test:unit -w gogospend-app -- src/spend/v1/ai/aiResources.test.ts`.
- [ ] **Step 3: Implement.** 1B-T7's ported assertions on `claude-opus-5-5` with `fallbacks` change to Haiku's base, and the parse case's exact `toEqual` gains `model: 'claude-haiku-5-5', escalated: false`; nothing else in that suite changes.
- [ ] **Step 4: Run them and see them pass,** then the app's AI render suites (`TellBunSheet`, `AskBunScreen`, `BunNote`) unchanged.
- [ ] **Step 5: Mutation check.** Keep `fallbacks` on Haiku: the base test fails. Drop `model` from the rules answer, or take it from `message.model`: the results test fails. Let the phone use the transport's 20 s: the timeout test fails.
- [ ] **Step 6: Gate, receipt, commit.** Client minimum `AI_MIN_CLIENT_VERSION` (validators). `git commit -m "Route Bun's calls to Haiku 5.5 first, name the model on every AI result, and bound each route by a deadline the phone outwaits"`

---

### Task P3-T7: A failed model call gives its use back

**Starts after:** P3-T6

B5, read as H5 (A14).

**Files:**
- Create: `apps/edge/src/v1/ai/uses.ts`
- Modify: `apps/edge/src/vault/ai.ts` (`consumeAi` answers the day; `refundAi`), `src/v1/protocol.ts` (`VaultRouteId` gains `'ai.refund'`), `src/v1/routes.ts` (`VAULT_STEP_ROUTES`), `src/vault/routes.ts`, `src/v1/ai/service.ts`
- Test: `apps/edge/test/workers/ai-uses.test.ts`

**Interfaces:**
- Consumes: `RecordedCall` (P3-T4); `ai.consume` and `ai_usage` (1B-T2, 1B-T7).
- Produces:
  ```ts
  // src/vault/ai.ts
  export function consumeAi(c: VaultContext, feature: AiFeature): { day: string }   // the Bangkok day counted
  export function refundAi(c: VaultContext, feature: AiFeature, day: string): void  // that day's uses minus one, never below 0; no row, no change
  // step 'ai.refund': body { feature, day }, reply {}
  // src/v1/ai/uses.ts
  export function shouldRefund(calls: readonly RecordedCall[], answeredByModel: boolean): boolean   // !answeredByModel and the last call failed with rate_limited, server_error, timeout or no_connection
  ```
  The service keeps the consumed day and, before it answers (rules, plain facts or 503), calls `ai.refund` when `shouldRefund(trace.calls, model !== 'rules')`.

- [ ] **Step 1: Stub, then write the failing tests** (`remaining` from `GET /v1/me/ai-preferences` after each). Stub: `shouldRefund` returns false.
  - `a parse whose Haiku call is rate limited answers by the rules and gives the use back` (`remaining.parse` 30).
  - `a parse Haiku declines answers by the rules and spends the use` (29).
  - `a slip read whose Haiku call is overloaded is 503 AI_PAUSED and gives the use back` (a 529; `remaining.slip` 10).
  - `a note whose Haiku call times out gives plain facts and the use back` (Review Focus 2).
  - `an ask that loses its second turn to a 500 answers with its figures and gives the use back` (turn one `tool_use`, turn two `apiFailure(500)`; `source: 'facts'`, `remaining.ask` 20).
  - `an ungrounded answer spends the use` (19).
  - `a refund touches only the day it was counted on, and never goes below zero` (inside `runInDurableObject`: consumed at 23:59:59 Bangkok time, refunded after midnight, the earlier day's row drops by one; a refund with no row changes nothing).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/ai-uses.test.ts`.
- [ ] **Step 3: Implement** the step, the vault functions and the service's refund.
- [ ] **Step 4: Run them and see them pass,** with `ai-routing.test.ts` and `ai.test.ts`.
- [ ] **Step 5: Mutation check.** Refund on a decline: the decline case fails. Refund today's row instead of the counted day: the midnight case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Give a use back when a model call fails with a rate limit, a server error or a timeout"`

---

### Task P3-T8: Reading one slip with D25's escalation

**Starts after:** P3-T6, P3-T7

**Delivers:** P3:slip-read

B9: the single read stays on `/v1/ai/slip` and writes nothing to the vault but its use. P4's `/v1/slips` calls `readSlipImage` once per slip with its own trace and deadline (A16), and P4-T4 extends it (A26, B27).

**Files:**
- Create: `apps/edge/src/v1/ai/slip-read.ts`
- Modify: `apps/edge/src/server/ai/prompts.ts` (`SLIP_SCHEMA` gains the required `kind`; `SLIP_SYSTEM` gains its rule), `src/v1/ai/service.ts`, `packages/contracts/src/v1/ai.ts`, `packages/contracts/src/index.ts`, `apps/app/src/spend/v1/ai/aiResources.ts` (`isAiSlipResult`), `src/spend/v1/ai/testing/fakeAiResources.ts`
- Test: `apps/edge/test/workers/slip-read.test.ts`, `apps/app/src/spend/v1/ai/aiResources.test.ts`

**Interfaces:**
- Consumes: `haikuRequest`, `opusRequest`, `HAIKU_SLIP_CAP_MS` (P3-T6); `tracedSend`, `callFailure`, `AiTrace`, `AiDeadline`, `ModelTransport` (P3-T4); `sanitizeDrafts`, `DraftContext` (`src/server/ai/drafts.ts`); `finishedJson`, `ModelUnavailable` (`src/server/ai/model.ts`); `shouldRefund` (P3-T7).
- Produces:
  ```ts
  // contracts
  export const SLIP_KINDS = ['slip', 'receipt', 'unreadable'] as const
  export type SlipKind = (typeof SLIP_KINDS)[number]
  // AiSlipResult gains kind: SlipKind; declined: boolean; tokens: { input: number; output: number }
  // src/v1/ai/slip-read.ts
  export type SlipImage = { base64: string; mediaType: AiSlipMediaType }
  export type SlipRead = { kind: SlipKind; drafts: AiDraft[]; bank: string | null; model: ModelTier; escalated: boolean; declined: boolean; tokens: { input: number; output: number } }
  export class SlipNotRead extends Error { constructor(readonly failure: CallFailure) }
  export type HaikuOutcome = { kind: 'answer'; read: { kind: SlipKind; drafts: AiDraft[] } } | { kind: 'declined' } | { kind: 'unusable' } | { kind: 'failed'; failure: CallFailure }
  export function slipNeedsOpus(outcome: HaikuOutcome): boolean
  export function readSlipImage(input: { image: SlipImage; context: DraftContext; locale: AiLocale }, deps: { transport: ModelTransport; trace: AiTrace; deadline: AiDeadline }): Promise<SlipRead>
  ```
- `SLIP_SYSTEM` gains: `- kind: "slip" for a bank or e-wallet transfer slip, "receipt" for a shop receipt or bill, "unreadable" when no amount can be read; with "unreadable" return 0 drafts.` A read with no draft is `unreadable`; an `unreadable` answer's drafts are dropped. A reply whose `kind` is missing or not one of the three is `unusable`. `declined` is true when any call of the read stopped with `refusal`; `tokens` adds every call's input (with cache reads and writes) and output.
- `slipNeedsOpus` (D25's triggers, H6): true for `declined`, `unusable` (truncated, not JSON or no `kind`), no draft, a null `amount_minor`, a `date_guessed` flag, or a `slip` expense draft with a null `merchant`; false for `failed`.
- `readSlipImage`: Haiku (`haikuRequest('medium', 8_000)`, the slip format, `capMs: HAIKU_SLIP_CAP_MS`); a `failed` Haiku throws `SlipNotRead`; no trigger returns Haiku's read. Otherwise Opus (`opusRequest('medium', 8_000)`, the same image and text, `escalated: true`): Opus drafts win; else Haiku's, if any; else `unreadable` when Opus answered, or `SlipNotRead`. It neither consumes nor refunds a use; its callers do.
- The slip route answers `{ drafts, bank, source: 'ai', model, escalated, kind, declined, tokens }`; on `SlipNotRead` it refunds when `shouldRefund(trace.calls, false)` (a 400 `rejected` spends the use, A14) and answers 503 `AI_PAUSED` with `retryAfterSeconds` 300.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `slipNeedsOpus` returns false; `readSlipImage` makes one Haiku call.
  - `a complete slip is read once by Haiku`: one call; `{ kind: 'slip', model: 'claude-haiku-5-5', escalated: false, declined: false }`, amount `'125000'`.
  - `Opus re-reads when the amount does not parse, the date is implausible, or a slip has no receiver` (`it.each`: `amount_baht: null`; a date next year; `merchant: null`): two calls, the second with `model: 'claude-opus-5-5'`, `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'` and the same image `data`; the result says Opus and `escalated: true`.
  - `a Haiku refusal is re-read by Opus and marked declined`; `an answer that is not JSON, or has no draft, is re-read by Opus`; `a guessed category or wallet never escalates`; `a receipt, or an income slip, without a receiver is not re-read`.
  - `when Opus also finds nothing the slip is unreadable` (`kind: 'unreadable'`, `drafts: []`, Opus, escalated).
  - `Opus failing after a Haiku draft keeps Haiku's draft` (Review Focus 3: Haiku's amount is null, Opus answers 529; the result is Haiku's draft with `escalated: true`; `remaining.slip` 9).
  - `a Haiku refusal followed by an Opus outage is 503 AI_PAUSED and gives the use back` (Review Focus 3: Haiku `refusal()`, Opus 529; two recorded calls; `remaining.slip` 10).
  - `an outage on Haiku is 503 AI_PAUSED, with no Opus call and the use given back` (Haiku 529).
  - `an escalated read spends one use` (`remaining.slip` 9).
  - `both requests carry the same bytes through the gateway, and nothing is kept`: with `anthropicTransport` over a recording `fetch` that scripts both replies, both requests carry `cf-aig-collect-log: false`; R2 holds nothing under any of the vault's prefixes; `import_uploads` is empty; `ai_usage` is exactly `[{ feature: 'slip', uses: 1 }]`; a console spy saw no part of the base64.
  - `the prompts carry no account, session or device identifier` (both calls) and `tokens add up both calls`.
  - App: `a slip result needs kind, declined and tokens`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/slip-read.test.ts` and `npm run test:unit -w gogospend-app -- src/spend/v1/ai/aiResources.test.ts`.
- [ ] **Step 3: Implement.** 1B-T7's two scripted slip replies in `ai.test.ts` gain `kind: 'slip'`.
- [ ] **Step 4: Run them and see them pass,** with `ai-routing.test.ts`, `ai-uses.test.ts` and `ai.test.ts`.
- [ ] **Step 5: Mutation check.** Escalate on a guessed category: its case fails. Send Opus the text without the image: the escalation case fails. Escalate on a Haiku 529: the outage case fails. Spend the use when Opus fails after a refusal: the refusal-and-outage case fails.
- [ ] **Step 6: Gate, receipt, commit.** Client minimum `AI_MIN_CLIENT_VERSION`. The receipt notes that `SLIP_SYSTEM` and `SLIP_SCHEMA` are locked only after P3-T22's run (D25). `git commit -m "Read a slip with Haiku and re-read it with Opus in the same request when D25 says so, keeping nothing"`

---

### Task P3-T9: Ask Bun asks Opus again in a fresh conversation

**Starts after:** P3-T6, P3-T7

D28 as H7; figures and words stay in baht (B7).

**Files:**
- Create: `apps/edge/src/v1/ai/ask.ts`
- Modify: `apps/edge/src/v1/ai/service.ts` (ask uses `askWithEscalation`), `src/vault/ai.ts` (`aiTool` figures carry `count` and `scope`), `packages/contracts/src/v1/ai.ts`, `packages/contracts/src/index.ts`, `apps/app/src/spend/v1/ai/aiResources.ts` (`isAiAskResult`), `src/spend/v1/ai/testing/fakeAiResources.ts`
- Test: `apps/edge/test/workers/ask-escalation.test.ts`, `apps/edge/test/ask-deadline.test.ts` (Node), `apps/app/src/spend/v1/ai/aiResources.test.ts`

**Interfaces:**
- Consumes: `aiTool`, `Allowance`, the `ai.tool` step (1B-T7); `AllowedNumbers`, `isGrounded` (`src/server/ai/grounding.ts`); `figuresText` (`fact-text.ts`); `ASK_SYSTEM`, `ASK_TOOLS`; P3-T4's transport and trace; P3-T6's bases.
- Produces:
  ```ts
  // contracts
  export type AiFigureScope = { from: string; through: string; type: AiDraftType; category_id: string | null }
  export type AiFigure = { label: string; amount_minor: Minor; count: number | null; scope: AiFigureScope | null }
  // src/v1/ai/ask.ts
  export const ASK_MAX_TURNS = 5
  export type AskOutcome = { kind: 'grounded'; answer: string; figures: AiFigure[] }
    | { kind: 'ungrounded' | 'declined' | 'no_answer'; figures: AiFigure[] } | { kind: 'failed'; failure: CallFailure; figures: AiFigure[] }
  export type AskDeps = { transport: ModelTransport; trace: AiTrace; deadline: AiDeadline; tool(name: string, input: Record<string, unknown>): Promise<{ result: unknown; figures: AiFigure[]; allow: Allowance } | { error: string }> }
  export function runAskConversation(tier: ModelTier, input: { question: string; today: string; locale: AiLocale; categories: readonly { id: string; name: string }[] }, deps: AskDeps): Promise<AskOutcome>
  export function askWithEscalation(input: Parameters<typeof runAskConversation>[1], deps: AskDeps): Promise<{ answer: string; figures: AiFigure[]; source: 'ai' | 'facts'; model: AiModel; escalated: boolean } | { paused: true }>
  ```
- `runAskConversation` keeps today's loop (at most `ASK_MAX_TURNS` turns, its own `AllowedNumbers` and figures): a grounded text is `grounded`; an ungrounded one `ungrounded`; `refusal` `declined`; the turn limit, a truncated or empty answer, or a turn that cannot start in time (`DeadlinePassed`) `no_answer`; a call failure `failed`.
- `askWithEscalation`: Haiku under `deps.deadline.child(HAIKU_ASK_CAP_MS)`, so H3's cap covers its whole conversation; `grounded` answers (`model: HAIKU`); `ungrounded`, `declined` or `no_answer` start Opus from scratch under the parent deadline: one user message equal to Haiku's first, the same `system` and `tools`, `opusRequest('medium', 12_000)`, `escalated: true` on its calls. Opus `grounded` answers (`model: OPUS, escalated: true`); otherwise `figuresText(figures, locale)` over Opus's figures, else Haiku's (Bun's could-not-find line when neither has any), with `source: 'facts', model: 'rules'`, as today. Only when the conversation that ended the request is `failed` and no figures exist is it `{ paused: true }` (503 `AI_PAUSED`). A Haiku `failed` never reaches Opus.
- `aiTool` figures: `spending_total` carries `count` (its n) and `scope` `{ from, through, type, category_id }`; `category_totals` each row's n and a scope naming that category; `top_merchants` its n and `scope: null`; `budget_status` `count: null, scope: null`.

- [ ] **Step 1: Stub, then write the failing tests.** Stub: `askWithEscalation` runs Haiku only.
  - `an answer that fails the grounding check is asked again of Opus in a fresh conversation`: Haiku calls `spending_total`, then writes `฿999`; Opus's first request has exactly one message, role `user`, equal to Haiku's first message, and the same `system` and `tools`; Opus's grounded answer comes back as `{ source: 'ai', model: 'claude-opus-5-5', escalated: true }`.
  - `a Haiku refusal goes to Opus`; `five Haiku tool turns without an answer go to Opus`.
  - `when Opus is not grounded either, the plain figures answer` (`source: 'facts', model: 'rules', escalated: true`, Opus's figures).
  - `a Haiku outage never reaches Opus` (a 429 after one tool turn: Haiku's figures as facts, `escalated: false`, the use given back).
  - `an ungrounded Haiku answer followed by an Opus outage answers Haiku's figures and gives the use back` (Review Focus 3: `source: 'facts'`, `model: 'rules'`, `escalated: true`, `remaining.ask` 20).
  - `a question neither model grounds, with no figures, answers that Bun could not find it` (200, `source: 'facts'`, บันหาข้อมูลนี้ในบันทึกของคุณไม่เจอ, `remaining.ask` 19).
  - `an escalated question counts once` (`remaining.ask` 19); `the prompts carry no account, session or device identifier (both conversations)`.
  - `ask-deadline.test.ts`: `a slow Haiku conversation is cut at 25 s and Opus still answers` (a fake clock and transport: each Haiku tool turn takes 12 s, so the third cannot start under the child deadline and Haiku ends `no_answer`; Opus's first call is given 31,000 ms, and its grounded answer comes back with `escalated: true`).
  - `figures carry their record count and scope` (a `spending_total` for 1 to 24 October over food gives `count: 41` in a seeded vault with 41 such records and `scope: { from: '2026-10-01', through: '2026-10-24', type: 'expense', category_id: <food> }`; a merchant figure has a count and `scope: null`; budget figures have both null).
  - App: `figures need count and scope`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/ask-deadline.test.ts`, `npm run test:edge:workers -- test/workers/ask-escalation.test.ts` and `npm run test:unit -w gogospend-app -- src/spend/v1/ai/aiResources.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `ai.test.ts`, `ai-routing.test.ts` and `ai-uses.test.ts`.
- [ ] **Step 5: Mutation check.** Replay Haiku's turns to Opus: the fresh-conversation case fails. Escalate on a 429: the outage case fails. Consume a second use for Opus: the counts-once case fails. Give Haiku the parent deadline: the slow-conversation case fails. Answer paused whenever no figures exist: the could-not-find case fails.
- [ ] **Step 6: Gate, receipt, commit.** Client minimum `AI_MIN_CLIENT_VERSION`. `git commit -m "Ask Opus again in a fresh conversation when Haiku's answer is ungrounded, declined or unfinished, and give each figure its count and scope"`

---

### Task P3-T10: One $ai_generation per model call

**Starts after:** P3-T8, P3-T9, 1D-T3, 1D-T11

**Delivers:** P3:llm-analytics

B6: built on plain `posthog-node`; `@posthog/ai` is not installed. A19: the extra properties below carry no content.

**Files:**
- Create: `apps/edge/src/v1/ai/generations.ts`
- Modify: `apps/edge/src/analytics/server-analytics.ts`, `src/vault/ai.ts` (`aiContext` adds `analytics`), `src/v1/worker-routes.ts` (`WorkerContext.analytics`), `src/v1/handler.ts`, `src/v1/ai/service.ts` (every path that may call a model reads `ai.context` once first and sets `trace.analytics`), `src/v1/ai/routes.ts` (each AI route hands its trace to `sendGenerations` through `w.waitUntil`, after an answer or a failure)
- Test: `apps/edge/test/server-analytics.test.ts` (Node), `apps/edge/test/workers/ai-analytics.test.ts`

**Interfaces:**
- Consumes: `createServerAnalytics`, `analyticsIdFor`, `PostHogPort`, `ServerAnalyticsEnv` (1D-T3); `analyticsConsent` and `V1Deps.analytics` (1D-T11); `AiTrace`, `RecordedCall` (P3-T4).
- Produces:
  ```ts
  // server-analytics.ts
  export type AiGeneration = { traceId: string; spanId: string; feature: AiFeature; tier: 'haiku' | 'opus'; model: string; escalated: boolean; latencyMs: number;
    httpStatus: number | null; failure: string | null; stopReason: string | null; usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null }
  // ServerAnalytics gains:
  trackAiGeneration(analyticsId: string, generation: AiGeneration): void   // the caller has checked consent
  // src/vault/ai.ts: aiContext answers { consent, analytics: 'yes' | 'no' | 'unasked', wallets, categories }
  // src/v1/worker-routes.ts: WorkerContext gains analytics: ServerAnalytics | null
  // generations.ts
  export function generationOf(trace: AiTrace, call: RecordedCall): AiGeneration
  export function sendGenerations(input: { analytics: ServerAnalytics | null; env: ServerAnalyticsEnv; accountId: string; headers: Record<string, string | undefined>; trace: AiTrace }): Promise<number>
  ```
- The event is `$ai_generation` under the analytics id, with exactly (H8): `$ai_trace_id`, `$ai_span_id`, `$ai_span_name` (`<feature>.<tier>`), `$ai_model` (only when it matches `/^claude-[a-z0-9-]{1,40}$/`), `$ai_provider: 'anthropic'`, `$ai_input_tokens`, `$ai_output_tokens`, `$ai_cache_read_input_tokens`, `$ai_cache_creation_input_tokens`, `$ai_latency` (seconds, three decimals), `$ai_http_status` (when known), `$ai_is_error`, `$ai_error` (the failure kind), `$ai_stop_reason` (one of `end_turn`, `tool_use`, `max_tokens`, `refusal`, `stop_sequence`, `pause_turn`, `model_context_window_exceeded`), `feature`, `escalated`, `origin: 'server'`. `sendGenerations` sends only when `trace.analytics` is `yes`, the request's `x-gogospend-analytics` is not `off`, `ANALYTICS_ID_KEY` is set and `analytics` is not null; one event per recorded call that was sent (`sent: true`); a call `DeadlinePassed` stopped is no event, though `shouldRefund` still reads it.

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `trackAiGeneration` does nothing; `sendGenerations` resolves 0.
  - `server-analytics.test.ts`: `an ai generation carries only its allow-listed properties` (a generation passed with extra `$ai_input`, `$ai_output_choices`, `$ai_tools`, `$ai_base_url` and `prompt` fields sends exactly the list above; a model `gpt-4o` drops `$ai_model`; an unknown stop reason is dropped).
  - `ai-analytics.test.ts` (1D-T11's capturing port, `POSTHOG_PROJECT_TOKEN: 'phc_test'`, `ANALYTICS_ID_KEY: 'test-analytics-key'`, consent yes):
    - `one $ai_generation per model call for a person who said yes`: an escalated slip read sends two events with one `$ai_trace_id`, `$ai_span_name` `slip.haiku` then `slip.opus`, `escalated` false then true, the replies' models and tokens, under the HMAC id.
    - `an escalated question sends one event for every call of both conversations`.
    - `nothing is sent for no or unasked, with the off header, or without the key`; `a call never sent is no event` (with `aiDeadlines` of 1,000 ms a parse records one unsent call, and nothing is captured).
    - `no sentence, image, answer, tool schema or gateway URL leaves`: the JSON of every captured message holds none of `ข้าวมันไก่ 50`, the image's first 16 base64 characters, the answer text, `spending_total` or `gateway.ai.cloudflare.com`.
    - `a failed call is an event with its failure kind and no message` (a Haiku 529: `$ai_is_error: true`, `$ai_error: 'server_error'`, `$ai_http_status: 529`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/server-analytics.test.ts` and `npm run test:edge:workers -- test/workers/ai-analytics.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with 1D-T11's `server-events.test.ts` unchanged.
- [ ] **Step 5: Mutation check.** Send for `unasked`: the consent case fails. Add `$ai_base_url`: the allow-list case fails. Ignore the off header: its case fails. Send unsent calls: the never-sent case fails.
- [ ] **Step 6: Gate, receipt, commit.** Owner-side, recorded for P6C: the Bun AI quality dashboard reads these events; if PostHog does not price `claude-haiku-5-5`, the fix is custom per-token prices on the event (H8). `git commit -m "Send one consented, privacy-safe $ai_generation per model call through posthog-node"`

---

### Task P3-T11: A local-only slip allowance for the evaluation

**Starts after:** P3-T7, 1C-T2

A15: the evaluation uses the production read path on a local-only raised limit.

**Files:**
- Create: `apps/edge/src/v1/ai/eval-allowance.ts`
- Modify: `apps/edge/src/vault/ai.ts` (`consumeAi(c, feature, limit?)`; the `ai.consume` step body gains `limit?`), `src/v1/ai/service.ts` (deps gain `slipLimit?: number`, passed by the slip's consume), `src/v1/ai/routes.ts` (the service gets `slipLimit: evalSlipLimit(w.env)`), `src/v1/env.ts` (`AI_EVAL_SLIP_LIMIT?: string`), `scripts/check-dist.mjs` (one more marker), `test/check-dist.test.ts`
- Test: `apps/edge/test/workers/ai-eval-allowance.test.ts`

**Interfaces:**
- Consumes: `LOCAL_BUILD` (`src/auth/mailer.ts`, 1C-T2); `consumeAi` (P3-T7).
- Produces:
  ```ts
  export const LOCAL_EVAL_MARKER = 'jotbun-local-ai-eval-limit'
  export function evalSlipLimit(env: Pick<V1Env, 'JOTBUN_ENV' | 'AI_EVAL_SLIP_LIMIT'>): number | undefined   // LOCAL_BUILD, JOTBUN_ENV 'local' and AI_EVAL_SLIP_LIMIT an integer 10..200 only; else undefined
  // consumeAi(c, feature, limit?): a limit is honoured only for 'slip' and only within 10..200; otherwise AI_DAILY_LIMITS
  ```
  Inside the `LOCAL_BUILD` branch `evalSlipLimit` logs one line `{ event: LOCAL_EVAL_MARKER, limit }` when it raises the limit, so the marker is live code and `npm run build` fails if the branch survives into a production bundle. P3-T22's run sets the variable to 120 (default pending owner Q9).

- [ ] **Step 1: Stub, then write the failing tests.** Stub: `evalSlipLimit` returns undefined.
  - `the allowance applies only to a local build run as local, with the variable set` (`JOTBUN_ENV: 'local'` with `'120'` gives 120, and without the variable undefined; `'test'`, `'staging'` and `'production'` give undefined; `'5000'` gives undefined).
  - `the vault honours a raised slip limit from 10 to 200 and ignores anything else` (with 12, reads 11 and 12 succeed and read 13 is 429 `AI_LIMIT_REACHED`; 500 falls back to 10; a raised limit for `ask` is ignored).
  - `check-dist.test.ts`: a temporary `dist` file holding `jotbun-local-ai-eval-limit` exits 1.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/ai-eval-allowance.test.ts` and `npm run test:edge -- test/check-dist.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** then `npm run build:edge` (the production build passes its marker check).
- [ ] **Step 5: Mutation check.** Apply the allowance under `JOTBUN_ENV` `test`: the local-only case fails. Accept 500: the bounds case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Let a local build raise the daily slip reads for the 100-slip evaluation, and keep it out of production builds"`

---

### Task P3-T12: The native QR decoder

**Starts after:** P3-T1

**Delivers:** P3:qr-native

Waits on owner Q1 and is skipped until approved; no P3 task depends on it (B3). P6A's share tasks (P6A-T10, T11) start after `P3-T12 (P3:qr-native)` (A13, A34); P4 runs its tasks on `fakeQrDecoder` and names P3-T12 in P4-T23 Step 3's device proof (P4 S19); the slips area stays off until a decoder is installed (A24).

**Files:**
- Modify: `apps/app/package.json` and the root `package-lock.json` (`npx expo install expo-camera` picks SDK 58's pin; the receipt records the installed version), `apps/app/app.json` (the `expo-camera` plugin with `cameraPermission` set to the same text as `expo-image-picker`'s, since both write `NSCameraUsageDescription`, `microphonePermission: false`, `recordAudioAndroid: false`, and `barcodeScannerEnabled` left at its default true; the prop names checked against the installed plugin's types), `apps/app/app/_layout.tsx` (one `installQrDecoder(createExpoCameraQrDecoder())` at start-up)
- Create: `apps/app/src/slips/expoCameraQrDecoder.ts`
- Test: `apps/app/src/slips/expoCameraQrDecoder.test.ts` (Node)

**Interfaces:**
- Consumes: `QrDecoder`, `installQrDecoder` (P3-T1).
- Produces: `export function createExpoCameraQrDecoder(load?: () => Promise<{ scanFromURLAsync(url: string, types?: string[]): Promise<readonly { data: string }[]> }>): QrDecoder` (`available` is a getter over a load flag, true until the module fails to load; `decode(uri)` asks for `['qr']` and answers each `data`; a module that fails to load answers `[]`). The default `load` is `() => import('expo-camera')`, using `scanFromURLAsync` exactly as the installed version's types export it (Expo docs: `Camera.scanFromURLAsync(url, barcodeTypes)`; only QR on iOS).

- [ ] **Step 1: Write the failing tests:** `the adapter reads QR payloads through scanFromURLAsync, asking for QR only`; `a module that fails to load finds nothing and makes the decoder unavailable`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/expoCameraQrDecoder.test.ts`.
- [ ] **Step 3: Install and implement,** then `node --test scripts/ci/lockfile-bindings.test.mjs` and `npm run test:ops`.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Drop the `['qr']` filter: the first test fails. Keep `available` true after a failed load: the second fails.
- [ ] **Step 6: Gate, receipt, commit.** Device check SKIPPED until a development build: a K PLUS slip screenshot parses as a slip; a food photo finds none. `git commit -m "Decode slip QR codes from still images on the phone with expo-camera"`

---

### Task P3-T13: The add tray records how each record was made

**Starts after:** P2-T5, P2-T16, P3-T2, P3-T5, 1D-T7

**Files:**
- Create: `apps/app/src/wallet/add/draftOrigin.ts` (pure)
- Modify: `apps/app/src/spend/v1/redesign/quickAddModel.ts` (`buildQuickAdd(draft, { today, tc, source? })`), `src/screens/redesign/entry/entrySave.ts` (`EntryTrack.source: RecordSource`, `EntryTrack.hasPhoto?: boolean`; `save` takes `source?: TransactionSource`; 1D-T7's `trackRecordSaved` call in `finish` passes `hasPhoto`), `src/wallet/add/AddTrayHost.tsx`
- Test: `apps/app/src/wallet/add/draftOrigin.test.ts` (Node), `src/spend/v1/redesign/quickAddModel.test.ts`, `src/screens/redesign/entry/entrySave.render.test.tsx`, `src/wallet/add/AddTray.render.test.tsx`

**Interfaces:**
- Consumes: `TransactionSource` (P3-T2); `DraftFields`, `savedOutcome`, `useDraftReview`, `AiModelName` (P3-T5); `useEntrySave`, `EntryTrack` (P2-T5); `AddTrayHost`, `useAddTray` (P2-T16); `applyDraft` (base `src/spend/v1/ai/tellBun.ts`).
- Produces:
  ```ts
  // draftOrigin.ts
  export type DraftOrigin = { source: TransactionSource; review: { original: DraftFields; model: AiModelName; escalated: boolean } | null }
  export const TYPED_ORIGIN: DraftOrigin   // { source: 'typed', review: null }
  export function draftFieldsOf(draft: QuickAddDraft, amountMinor: string | null): DraftFields
  // AddTrayHost
  export type AiDraftMeta = { source: 'tell_bun' | 'photo'; model: AiModelName; escalated: boolean }
  // useAddTray() gains applyAiDraft(draft: AiDraft, meta: AiDraftMeta): void   (fills as applyDraft does, marks the filled fields guessed, and sets the origin)
  ```
- Rules: a typed entry saves `source: 'typed'`; P2's `TellBunSheet` path saves `tell_bun` with no review (its model is unknown); after `applyAiDraft` the save carries the meta's source and, once saved, reviews once with `savedOutcome(review.original, saved)`; closing or discarding with an AI origin unsaved reviews `dropped` once; a new AI draft over an unsaved one reviews the earlier one `dropped`. `record_saved` takes its `source` from the origin and `hasPhoto` from the host (false until P3-T15). The legacy Quick add sends no source (H9).

- [ ] **Step 1: Stub, then write the failing tests.** Stubs: `applyAiDraft` calls `applyDraft` only; the host keeps `source` from P2's guessed rule.
  - `quickAddModel.test.ts`: `buildQuickAdd puts the source on the create and the device entry only when given`.
  - `entrySave.render.test.tsx`: `the create carries its source, and record_saved its source and photo flag` (device save: the outbox entry has `source: 'photo'`; `record_saved` has `source: 'photo', has_photo: true`).
  - `draftOrigin.test.ts`: `draftFieldsOf reads the draft's fields and the settled amount`.
  - `AddTray.render.test.tsx`: `a typed save sends source typed`; `a Tell Bun sheet draft saves as tell_bun without a review`; `an AI draft saved as filled is reviewed kept, and one changed is edited with its count` (with meta `{ source: 'photo', model: 'claude-haiku-5-5', escalated: false }` the outbox entry says `source: 'photo'`; after changing the category, `ai_draft_reviewed` is `{ outcome: 'edited', fields_edited: 1, model: 'claude-haiku-5-5', escalated: false }`); `closing the tray with an unsaved AI draft reviews it dropped, once`; `a second AI draft over an unsaved one reviews the first dropped`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/add/draftOrigin.test.ts src/spend/v1/redesign/quickAddModel.test.ts` and `npm run test:render -w gogospend-app -- src/screens/redesign/entry/entrySave.render.test.tsx src/wallet/add/AddTray.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with Quick add's suite unchanged.
- [ ] **Step 5: Mutation check.** Take the source from the guessed marks again: the photo draft saves `tell_bun` and its case fails. Review on every render: the once case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Save each record with how it was made, and review every AI draft once as kept, edited or dropped"`

---

### Task P3-T14: AI consent and settings in the Bun Wallet look

**Starts after:** P2-T3, P2-T13, P3-T5

**Delivers:** P3:ai-area

B8: the consent names what prompts carry, wallet and merchant names included.

**Files:**
- Create: `apps/app/src/wallet/bunai/drafts.ts`, `useBunAiCopy.ts`, `aiArea.ts`, `aiConsent.ts`, `AiConsentContent.tsx`, `AiConsentTray.tsx`, `WalletAiSettingsScreen.tsx`; `apps/app/app/settings/ai.tsx` (the screen while `useBunAiArea()`, else a redirect to `/settings`); `apps/app/src/dev/catalogue/wallet/bunaiSections.tsx` (`bw-ai-consent`, `bw-ai-settings`, `bw-ai-settings-off`)
- Modify: `apps/app/src/config/featureFlags.ts` and its test (`'bunai'`, outside `APPROVED`), `src/dev/catalogue/wallet/index.ts`, `src/screens/redesign/account/SettingsScreen.tsx` (with `useBunAiArea()`, a บันและ AI row to `/settings/ai` and `<CompanionSettings showAi={false} />`, so the Cashback tips switch stays, §5.2), `CompanionSettings.tsx` (`showAi?: boolean`, default true) and `src/screens/redesign/ai/AiConsentSheet.tsx` (their on and off go through `useAiConsentChange`; no other visible change)
- Modify, once P6B-T3 has landed: `apps/app/src/wallet/settings/WalletSettingsScreen.tsx` (the บันและ AI row, P6B-T1's `LinkRow` under the same switch, so P6B-T3's `every link today's Settings offers is offered here too` stays green); once P6B-T5 has: `WalletPrivacyScreen.tsx` (the AI row a `LinkRow` to `/settings/ai` while `useBunAiArea()`, with P6B-T5's case `with P3's area on, the AI row opens /settings/ai`) and `src/screens/redesign/account/companionSwitches.ts` (`setAi` on and off through `useAiConsentChange`); those suites join Steps 2 and 4
- Test: `apps/app/src/wallet/bunai/drafts.test.ts` (Node), `AiConsent.render.test.tsx`, `WalletAiSettings.render.test.tsx`, `src/config/featureFlags.test.ts`, `src/screens/redesign/account/SettingsScreen.render.test.tsx`

**Interfaces:**
- Consumes: `WalletT`, `walletDeviceStore` (P2-T3); `Tray`, `PrimaryButton`, `TextLink` (P2-T13); `useActiveLocale`; `useAiCompanion`; `useBunIntensity`; `useHaptics`; `trackAiConsentChanged` (P3-T5); `getAnalytics` (1D-T1).
- Produces:
  ```ts
  // aiArea.ts (P3-T14, P3:ai-area)
  export function bunAiAreaOn(): boolean   // isRedesignEnabled('wallet') && isRedesignEnabled('bunai'); for tests and callers outside a render
  export function useBunAiArea(): boolean  // bunAiAreaOn() today; every entry point calls it in its component, and P6B-T15 adds useRollout inside
  export function usePhotosArea(): boolean // bunAiAreaOn(), never a rollout: attaching a receipt needs no AI (B3)
  // useBunAiCopy.ts: self-contained until P3-T24, so P2-T38's rename of useDraftCopy and its call sites cannot reach it
  export type BunAiLine = { readonly th: string; readonly en: string }
  export type BunAiTable = Readonly<Record<string, BunAiLine>>
  export function bunAiText(table: BunAiTable, key: string, locale: 'th' | 'en' | 'vi', values?: Readonly<Record<string, string | number>>): string   // th: Thai; en and vi: English; {token}s filled as P2's draftText does
  export function useBunAiCopy(table: BunAiTable): WalletT   // bunAiText with useActiveLocale()
  export function useAiConsentChange(): { turnOn(): Promise<void>; turnOff(): Promise<void>; busy: boolean }
  export function AiConsentContent(props: { onAgree(): void; onNotNow(): void; busy: boolean; problem: string | null; readOnly?: boolean }): JSX.Element
  export function AiConsentTray(props: { visible: boolean; onClose(): void; onClosed?(): void; onAgreed?(): void; readOnly?: boolean }): JSX.Element
  export function WalletAiSettingsScreen(): JSX.Element
  export function useDailyNoteSetting(): { on: boolean; ready: boolean; set(on: boolean): Promise<void> }   // walletDeviceStore() name 'daily-note', default on
  ```
- Every Bun AI entry point P3 adds calls `useBunAiArea()` inside its component (A10, B25): the Settings row and `/settings/ai` (this task), the attach step's read toggle (P3-T15), the slip read step (P3-T17), the tell step (P3-T18), the receipt viewer and source row (P3-T19), `/spend/ask` (P3-T20) and the Home note (P3-T21); the แนบรูป and photo rows call `usePhotosArea()` (P3-T15). With the area off, today's companion surfaces (`TellBunSheet` in the tray, `AskBunScreen`, `BunNote`, `CompanionSettings`) stay under `useAiCompanion().enabled`; P6B-T15 wraps P2-T16's `canTellBun` itself.
- `turnOn` sends `{ companion: true, notice_version: AI_NOTICE_VERSION }`, `turnOff` `{ companion: false }`; after the server's answer, `getAnalytics()?.setCommon({ ai_enabled })`, then one `trackAiConsentChanged()`. ai-settings: presence (full, quiet, off) through `useBunIntensity`; the AI switch (off at once; on opens `AiConsentTray`); while AI is on, uses left `{left} / {limit}` for parse, slip and ask from `preferences.remaining` and `AI_DAILY_LIMITS`; สิ่งที่ AI เห็น opens the tray read-only; the note switch; haptics `on`, `subtle`, `off` through `useHaptics`. Default pending owner Q7 for the note switch.
- Copy (`bunai.*`). A list "from <board>, in order" takes that board's visible lines verbatim, in the board's order, skipping sample data and lines another key holds. From ai-consent: `consentTitle`, `consentQuestion`, `consentLine`, `consentWhat`, `consentWho`, `consentWhoLine`, `consentKeep`, `consentWrong`, `consentWrongLine`, `consentFoot`, `consentDetails` (opens `/settings/privacy`), `consentOn`, `consentNotNow`. Changed from the board (drafts, B8, default pending owner Q11): `consentWhatLine` เฉพาะสิ่งที่งานนั้นต้องใช้: ประโยคที่คุณพิมพ์ รูปสลิปหรือใบเสร็จ รวมชื่อและเลขบัญชีบางส่วนที่พิมพ์อยู่ในรูป ชื่อกระเป๋าและหมวดให้บันเลือก ยอดของวันและของเดือน งบที่เหลือ กับชื่อหมวดสำหรับโน้ตประจำวัน และเมื่อคุณถาม ยอดรวม ชื่อร้าน และโน้ตที่จดไว้ ไม่ส่งอีเมล เบอร์โทร หรือรหัสบัญชี Jotbun ของคุณ; `consentKeepLine` Jotbun ไม่เก็บสิ่งที่ส่งไปอ่าน ยกเว้นรูปใบเสร็จที่คุณแนบไว้กับรายการ ไม่เก็บรูปสลิป และไม่ถูกนำไปฝึก AI; `consentFailed` เปิดตัวช่วย AI ไม่ได้ตอนนี้ ลองอีกครั้งเมื่อต่อเน็ต. From ai-settings, in order: `settingsTitle`, `bunHeading`, `presence`, `presenceFull`, `presenceFullLine`, `presenceQuiet`, `presenceQuietLine`, `presenceOff`, `presenceOffLine`, `aiLine` (its heading is `consentTitle`), `usesLeft`, `usesParse`, `usesSlip`, `usesAsk`, `whatAiSees`, `note`, `noteLine`, `haptics`, `hapticsOn`, `hapticsSubtle`, `hapticsOff`, `hapticsLine`; and `usesOf` {left} / {limit}. Draft for P3-T17 and P3-T19: `photoHidden` แตะเพื่อดูรูป (the private-mode cover over a photo, default pending owner Q12).

- [ ] **Step 1: Stub, then write the failing tests.**
  - `drafts.test.ts`: `every P3 draft line has Thai and English with the same placeholders, no emoji and no dash, and a key used once` (it reads `src/wallet/{photos,bunai,receipts}/drafts.ts`, and checks the keys against P2's tables).
  - `featureFlags.test.ts`: `bunai is off by default, on when named and on with all`; `bunAiAreaOn needs both wallet and bunai`.
  - `AiConsent.render.test.tsx`: `the consent names what is sent, to whom and what is kept` (the Thai lines, with ชื่อกระเป๋า, ชื่อร้าน, โน้ตที่จดไว้, โน้ตประจำวัน, งบที่เหลือ, เลขบัญชีบางส่วน and the kept receipt); `เปิดใช้ turns AI on with the current notice and sends one ai_consent_changed carrying ai_enabled true`; `ไม่ใช่ตอนนี้ changes nothing and sends nothing`; `a turn-on that fails says so and stays off`; `read-only shows the same lines without buttons`; `the old settings and sheet send the event too`.
  - `WalletAiSettings.render.test.tsx`: `the screen shows presence, AI help with uses left, the note switch and haptics` (remaining parse 27, slip 9, ask 19 read 27 / 30, 9 / 10, 19 / 20); `turning AI off is immediate and sends one ai_consent_changed with ai_enabled false`; `turning AI on opens the consent first`; `the note switch is kept on this phone` (`daily-note` reads `off`).
  - `SettingsScreen.render.test.tsx`: `with wallet and bunai on, Settings opens AI settings from its บันและ AI row and still offers the cashback tips switch` (no Bun's AI help section).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/bunai/drafts.test.ts src/config/featureFlags.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/bunai src/screens/redesign/account/SettingsScreen.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `CompanionSettings.render.test.tsx`, `TellBunSheet.render.test.tsx` and the catalogue suite unchanged.
- [ ] **Step 5: Mutation check.** Track before the server answers: the failure case sends an event and fails. Drop the B8 names, or the notes: the consent case fails. Replace all of `CompanionSettings`: the cashback case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Bun's AI consent and settings in the Bun Wallet look, naming what prompts carry"`

---

### Task P3-T15: The attach step and the confirm step's photo row

**Starts after:** P2-T14, P2-T15, P2-T16, P3-T1, P3-T13, P3-T14

B3 as the host rules below state it, one rule for P3-T15 and P3-T17 (default pending owner Q1). B4: no photo offline.

**Files:**
- Create: `apps/app/src/wallet/photos/drafts.ts`, `photoModel.ts` (pure), `photoPort.ts`, `AttachStep.tsx`, `PhotoRow.tsx`, `CameraOff.tsx`; `apps/app/locales/th.json`, `apps/app/locales/en.json`; sections `bw-attach`, `bw-attach-offline`, `bw-attach-slip-qr`, `bw-camera-off`, `bw-tray-confirm-photo`
- Modify: `apps/app/src/wallet/add/addFlow.ts` (`AddStep` gains `'attach'` and `'consent'`), `AmountStep.tsx` (`onAttach?: () => void`; the แนบรูป row only with `onAttach` and while `usePhotosArea()`), `ConfirmStep.tsx` (`photo?: PhotoRowProps | null`), `AddTrayHost.tsx` (`onAttach`, the photo, the attach and consent steps, `hasPhoto`), `apps/app/app.json` (`["expo-image-picker", { "photosPermission": "Jotbun opens your photos only when you choose a receipt or slip.", "cameraPermission": "Jotbun uses the camera only when you take a photo of a receipt or slip.", "microphonePermission": false }]`, `ios.infoPlist.CFBundleAllowMixedLocalizations: true`, `locales: { th: './locales/th.json', en: './locales/en.json' }`)
- Test: `apps/app/src/wallet/photos/photoModel.test.ts`, `photoPort.test.ts` (Node), `AttachStep.render.test.tsx`

**Interfaces:**
- Consumes: `slipQrIn`, `getAppQrDecoder`, `SlipQr`, `QrDecoder` (P3-T1); `dataUriOf`, `receiptFile` (`receiptModel.ts`); `openAppSettings`; `trackPermissionDenied` (1D-T1); `useBunAiArea`, `usePhotosArea`, `AiConsentContent` (P3-T14); `StepProps`, `AddStep` (P2-T14).
- Produces:
  ```ts
  // photoModel.ts
  export type PickedPhoto = { bytes: Uint8Array; contentType: AttachmentContentType; dataUri: string; slipQr: SlipQr | null }   // A27's name; a structural superset of receiptModel.ts's PickedPhoto, so receiptFile takes it
  export function photoOffline(view: Pick<DiaryView, 'phase' | 'outcome'> | null): boolean        // an open diary whose last run is 'waiting' or 'paused'
  export function readableByBun(photo: PickedPhoto): { ok: true; base64: string; mediaType: AiSlipMediaType } | { ok: false; reason: 'too_large' }   // AI_SLIP_MAX_BYTES; no resizer (default pending owner Q2)
  export function photoProblem(bytes: number, contentType: string): 'too_large' | 'unsupported' | 'empty' | null   // receiptFile's rules: 12 MiB, JPEG, PNG, WebP
  // photoPort.ts
  export type PhotoSource = 'camera' | 'album'
  export type PhotoPick = { kind: 'picked'; photo: PickedPhoto } | { kind: 'cancelled' } | { kind: 'denied'; source: PhotoSource; canAskAgain: boolean }
    | { kind: 'unavailable' } | { kind: 'refused'; reason: 'too_large' | 'unsupported' | 'empty' }
  export type PhotoPicker = { pick(source: PhotoSource): Promise<PhotoPick> }
  export function expoPhotoPicker(deps?: { decoder?: QrDecoder; imagePicker?: () => Promise<typeof import('expo-image-picker')>; file?: (uri: string) => { bytes(): Promise<Uint8Array>; delete(): void } }): PhotoPicker
  export function fakePhotoPicker(answers: readonly PhotoPick[]): PhotoPicker & { calls: PhotoSource[] }
  // PhotoRow.tsx, AttachStep.tsx
  export type PhotoRowProps = { state: 'kept' | 'not_read' | 'slip_not_kept' | 'offline'; onRemove(): void }
  export function PhotoRow(props: PhotoRowProps): JSX.Element
  export function AttachStep(props: { offline: boolean; aiEnabled: boolean; readWithBun: boolean; onReadWithBun(on: boolean): void; onPicked(photo: PickedPhoto): void; picker?: PhotoPicker }): JSX.Element
  ```
- `expoPhotoPicker`: the camera asks `requestCameraPermissionsAsync()` first; then `launchCameraAsync` or `launchImageLibraryAsync` with `{ mediaTypes: ['images'], allowsEditing: false, exif: false, quality: 0.6 }` (the album also `allowsMultipleSelection: false` and `preferredAssetRepresentationMode: Compatible`); then, on the picker's own file, `slipQrIn`, `new File(uri).bytes()`, `photoProblem`, and `new File(uri).delete()` (best effort). The photo then lives only in memory as bytes and a data URI (H10). The base `ReceiptPicker` is not reused: it reads through `fetch(uri)` at quality 0.85 and keeps the picker's copy.
- The host holds one photo; its row (B3): a `slipQr` photo is `slip_not_kept` (Bun may still read it); with the read off any other is `kept`; with the read on it is `not_read` until P3-T17's read answers `receipt`, and stays so after a failure, the day's limit or a photo too large for Bun, until the read is turned off (then it is a photo attached without asking Bun). While `photoOffline` the rows are `offline`. The read toggle shows only while `useBunAiArea()`; without it the read is off. The read starts on when AI is on (as bw-attach draws it) and off when AI is off, not remembered; turning it on with AI off opens the `'consent'` step, and agreeing returns with it on. A denied camera sends one `trackPermissionDenied({ permission: 'camera' })`; a denied album sends one with `permission: 'photos'` and shows `photosOff`. The save passes `hasPhoto` only for a `kept` photo.
- Copy (`photos.*`, read as P3-T14 says). From bw-attach, in order: `attachTitle`, `camera`, `cameraLine`, `album`, `albumLine`, `readToggle`, `readToggleLine`, `footnote` (the retention consent, H10). From bw-tray-confirm: `row` (รูป), `receiptCount`, `remove` (the remove button's label, ลบรูป). From es-camera-denied, in order: `cameraOffTitle` (its two parts as one line), `cameraOffBody`, `cameraOffWhere`, `cameraOffStep1`, `cameraOffStep2`, `cameraOffKept`, `openSettings`. Drafts: `offline` ต้องต่อเน็ตเพื่อแนบรูป รายการยังบันทึกได้ตามปกติ; `slipNotKept` รูปนี้เป็นสลิป Jotbun ไม่เก็บรูปสลิป ให้บันอ่านยอดแทนได้; `unread` บันยังไม่ได้อ่านรูปนี้เป็นใบเสร็จ จึงยังไม่เก็บ ปิดการให้บันอ่านเพื่อเก็บไว้; `tooLarge` รูปนี้ใหญ่เกิน 12 MB เลือกรูปอื่น; `unsupported` ใช้รูป JPEG, PNG หรือ WebP; `cameraOffWhereAndroid` เปิดได้ในการตั้งค่าของเครื่อง; `photosOff` Jotbun ยังเปิดอัลบั้มไม่ได้ เปิดสิทธิ์รูปภาพได้ในการตั้งค่า. The locale files hold `ios.NSCameraUsageDescription` and `ios.NSPhotoLibraryUsageDescription`, Thai drafts Jotbun ใช้กล้องเมื่อคุณกดถ่ายรูปใบเสร็จหรือสลิปเท่านั้น and Jotbun เปิดอัลบั้มเมื่อคุณเลือกรูปใบเสร็จหรือสลิปเท่านั้น, English as the plugin's. Deviations: no recent-photos strip (no media library package), so รูปล่าสุด, ดูทั้งหมด and its photo labels are skipped; no capture time.

- [ ] **Step 1: Stub, then write the failing tests.**
  - `photoModel.test.ts`: `offline means an open diary whose last run is waiting or paused`; `Bun reads at most 1,200,000 bytes`; `a receipt is a JPEG, PNG or WebP of at most 12 MiB`.
  - `photoPort.test.ts` (injected picker, file and decoder modules): `the camera asks permission first and says when it was refused`; `a picked photo is read into memory and the picker's copy is deleted` (`delete` once, on the asset's URI); `a photo whose QR is a bank slip says so`; `a photo over 12 MiB is refused`.
  - `AttachStep.render.test.tsx` (the tray through `mountWallet`): `with bunai on, the amount step offers แนบรูป, which opens the attach step` (off: P2's step unchanged); `AmountStep without onAttach shows no แนบรูป row`; `a picked receipt shows ใบเสร็จ 1 รูป on confirm, and ลบรูป removes it`; `offline the photo rows are unavailable and say why`; `a refused camera shows how to turn it on, offers the album, and sends one permission_denied` (`CAMERA_DENIED`; เปิดการตั้งค่า calls `openAppSettings`); `a refused album says so and sends one permission_denied` (`PHOTOS_DENIED`); `a slip QR keeps the photo off the record and says why`; `with AI on the read starts on; with AI off it starts off and a picked photo is kept as a receipt with no read`; `with the read on a picked photo is not kept until Bun reads it, and turning the read off keeps it`; `turning the read on with AI off opens the consent first`; `a save with a kept photo sends has_photo true`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/photos/photoModel.test.ts src/wallet/photos/photoPort.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/photos/AttachStep.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `AddTray.render.test.tsx` and `AmountStep.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Allow the rows offline: the offline case fails. Draw แนบรูป without `onAttach`: its case fails. Keep a slip-QR photo: its case fails. Keep a photo with the read on before any read: the not-kept case fails. Start the read on with AI off: the starting case fails. Skip deleting the picker's copy: the port case fails.
- [ ] **Step 6: Gate, receipt, commit.** Device checks (camera, permission strings in both languages) SKIPPED until a development build. `git commit -m "Attach a receipt photo by camera or album in the add tray, in memory only, never offline and never a slip"`

---

### Task P3-T16: Keeping the receipt after the save

**Starts after:** P3-T15, 1B-T5, 1B-T9, 1B-T10

**Files:**
- Create: `apps/app/src/wallet/photos/receiptKeeper.ts` (pure), `useReceiptKeeper.ts`; sections `bw-receipt-kept`, `bw-receipt-not-kept`
- Modify: `apps/app/src/wallet/add/AddTrayHost.tsx` (after `onSaved` with a kept photo, `keep()`; P3-T17 moves the call into `onPhotoSaved`), `photos/drafts.ts`
- Test: `apps/app/src/wallet/photos/receiptKeeper.test.ts` (Node), `ReceiptKeeper.render.test.tsx`

**Interfaces:**
- Consumes: `PickedPhoto` (P3-T15, passed to `receiptFile` structurally); `receiptFile`, `attachableFrom`, `classifyFailure`, `freezes` (`receiptModel.ts`); `useReceiptPorts`, `ReceiptUploads` (`ReceiptParts.tsx`); `AttachmentResources`; `useSpendV1().transaction`; the diary's outbox (`useDiaryView`).
- Produces:
  ```ts
  export const RECEIPT_WAIT_MS = 120_000
  export type KeepJob = { recordId: string; photo: PickedPhoto; uploadKey: string; retainKey: string; via: 'device' | 'online' }
  export type KeepOutcome = { kind: 'kept'; attachmentId: string }
    | { kind: 'not_kept'; problem: 'record_not_sent' | 'uploads_off' | 'expired' | 'gone' | 'unsupported' | 'too_large' | 'failed' | 'unconfirmed' }
  export type KeeperPorts = { sentFromPhone(recordId: string): boolean; recordVersion(recordId: string): Promise<number | null>; uploads: ReceiptUploads;
    attachments: Pick<AttachmentResources, 'retain'>; sleep(ms: number): Promise<void>; now(): number; pollMs: number; maxPolls: number }
  export function keepReceipt(job: KeepJob, ports: KeeperPorts): Promise<KeepOutcome>
  export function useReceiptKeeper(): { keep(job: Omit<KeepJob, 'uploadKey' | 'retainKey'>): void; notice: { words: string; retry: (() => void) | null } | null; dismiss(): void }
  ```
- `keepReceipt`, in order: a device save polls every `pollMs` until its create has left the outbox, or `record_not_sent` after `RECEIPT_WAIT_MS` (nothing uploaded); `recordVersion` (null is `gone`); upload `receiptFile(photo).file` under `uploadKey`, then poll the preview through `attachableFrom` up to `maxPolls`; `retain(recordId, version, { attachment_id }, retainKey)` (it sends `RECEIPT_RETENTION_CONSENT`). A `VERSION_CONFLICT` reads the version once more and retains with a new key; a frozen outcome (`freezes`) is resent once with the same key, then `unconfirmed`; other failures through `classifyFailure`. The notice's retry reruns the job with the same keys while the host holds the photo; dismissing drops it.
- Copy (`photos.*`, drafts): `kept` เก็บรูปใบเสร็จแล้ว; `notKept` เก็บรูปไม่สำเร็จ รายการบันทึกไว้แล้ว; `uploadsOff` ตอนนี้ยังเก็บรูปใบเสร็จไม่ได้ รายการบันทึกไว้แล้ว; Try again is `common.tryAgain`.

- [ ] **Step 1: Stub, then write the failing tests** (pure, with fakes; the stub resolves `failed`).
  - `a device save waits for its record to leave the phone, then uploads, waits for the preview and retains at the record's version` (the calls in that order; retain with version 1).
  - `an online save retains without waiting`.
  - `a record still on the phone after two minutes is not kept, and nothing is uploaded`.
  - `uploads switched off on the server are said plainly` (`uploads_off`).
  - `a record changed elsewhere is retained at its new version`.
  - `a lost answer is resent with the same key`; `a deleted record is gone`.
  - Render: `after a save with a photo the notice says it was kept`; `a failure keeps the record, says so and offers Try again with the same keys`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/photos/receiptKeeper.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/photos/ReceiptKeeper.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `RecordReceipt.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Upload before the record leaves the phone: the two-minute case sees an upload and fails. Retain without re-reading on a conflict: its case fails.
- [ ] **Step 6: Gate, receipt, commit.** Hosted R2 check SKIPPED (local Worker only). `git commit -m "Keep a tray photo as the record's receipt once the record reaches Jotbun, through the image import and retain"`

---

### Task P3-T17: A single slip read in the tray

**Starts after:** P3-T5, P3-T8, P3-T16

**Delivers:** P3:tray-photo

B3 as P3-T15 states it (default pending owner Q1). A27: `onPhotoSaved` is the one place a tray pick, or the slip QR a read left behind, meets its saved record; P4-T16b adds the slip ref there.

**Files:**
- Create: `apps/app/src/wallet/bunai/slipMarks.ts` (pure), `SlipReadStep.tsx`, `SlipUnreadable.tsx`, `AiResting.tsx`, `apps/app/src/wallet/photos/trayPhotoSave.ts`; sections `bw-ai-slip`, `bw-ai-receipt`, `bw-slip-unreadable`, `bw-ai-resting`, `bw-ai-limit`, `bw-ai-slip-private`
- Modify: `apps/app/src/wallet/add/addFlow.ts` (`AddStep` gains `'slip'`), `AddTrayHost.tsx` (while `useBunAiArea()`, reads after a pick while the read is on; `applyAiDraft` with `source: 'photo'`; after every save while the host holds a pick, `onPhotoSaved` in place of P3-T16's `keep()`), `ConfirmStep.tsx` (`bunSource?: 'sentence' | 'slip' | 'receipt'` picks the header line), `bunai/drafts.ts`
- Test: `apps/app/src/wallet/bunai/slipMarks.test.ts` (Node), `SlipRead.render.test.tsx`

**Interfaces:**
- Consumes: `AiSlipResult` (P3-T8); `SlipQr` (P3-T1); `useBunAiArea` (P3-T14); `readableByBun`, `PickedPhoto` (P3-T15); `useReceiptKeeper` (P3-T16, which a slip read must never call); `applyAiDraft` (P3-T13); `trackAiUnavailable` (P3-T5); `WalletAmount`, `usePrivateMode` (P2-T10).
- Produces:
  ```ts
  export type ReadMark = 'from_photo' | 'guess' | 'unclear'
  export type ReadRow = { key: 'amount' | 'receiver' | 'date' | 'bank' | 'category'; value: string | null; mark: ReadMark }
  export function readRows(result: AiSlipResult, lookups: Lookups, t: WalletT): ReadRow[]   // first draft; a value present and unflagged is from_photo; the category is guess unless set and unflagged; an amount_unclear amount is unclear
  export type ReadFailure = { kind: 'resting'; reasonCode: string } | { kind: 'limit' } | { kind: 'too_large' }
  export function readFailureOf(error: unknown): ReadFailure   // AI_LIMIT_REACHED is limit; else resting with the V1Error code, or 'UNKNOWN'
  export function SlipReadStep(props: { photo: PickedPhoto; result: AiSlipResult; rows: readonly ReadRow[]; onUse(): void; onEdit(): void }): JSX.Element
  // photos/trayPhotoSave.ts (P3-T17 (P3:tray-photo), A27)
  export type TrayPhotoSave = { photo: PickedPhoto | null; slipQr: SlipQr | null; read: AiSlipResult | null; kept: boolean; via: 'device' | 'online' }   // photo null once a read released it; via is P2-T5's SavedEntry.via
  export function useTrayPhotoSave(): { onPhotoSaved(save: TrayPhotoSave, recordId: string): void }   // calls useReceiptKeeper().keep({ recordId, photo, via }) only when kept
  ```
- Flow: only with the read on and AI on, a picked photo that `readableByBun` accepts is sent with `resources.slip`, showing `reading`; one too large is not sent (`tooLargeForBun`, default pending owner Q2). `slip` releases the bytes and data URI at once (no row, no keeper); `receipt` keeps the photo unless its `slipQr` is set; `unreadable` shows es-slip-unreadable and releases it the same way (ถ่ายใหม่ reopens the camera, พิมพ์เอง goes to the amount step). A pick's `slipQr` stays with the host, even once its photo is released, until the tray closes, ลบรูป removes the pick or a new pick replaces it. A failure shows es-ai-unavailable keeping the photo, `not_read`, and the draft so far (Try again reads again; พิมพ์ยอดเอง goes to the amount step) and sends one `ai_unavailable` with screen `/spend/add`; the day's limit also leaves it `not_read`. ใช้ข้อมูลนี้ applies the first draft with `{ source: 'photo', model, escalated }` and opens confirm; แก้ไข applies it and opens the amount step. `onPhotoSaved` runs once after every save while the host holds a pick, kept or not. In private mode the read amount is `HIDDEN_AMOUNT` and the photo is covered until tapped (`bunai.photoHidden`, default pending owner Q12).
- Copy (`bunai.*`, read as P3-T14 says). From ai-slip, in order: `slipTitle`, `slipImage` (the image's label, สลิปที่คุณเลือก: โอนเงิน {amount} ให้ {receiver}, `{amount}` as `common.baht`; draft `photoImage` รูปที่คุณเลือก for a receipt, a failed read or private mode), `readAmount`, `typeOut`, `fromSlip`, `receiver`, `bank`, `category`, `mayBeWrong`, `checkFirst`, `slipNotKept`, `edit`, `useThis` (บันเดา is `add.bunGuess`); `date` is วันที่ (W12: no time). From es-slip-unreadable, in order: `unreadableTag`, `unreadableImage` (draft รูปนี้อ่านยอดเงินไม่ได้; the board's label assumes a blurred camera photo), `unreadableTitle`, `unreadableWhy`, `unreadableNothing`, `retakeHeading`, `tipFrame`, `tipLight`, `tipScreenshot`, `typeIt`, `retake`. From es-ai-unavailable, in order: `restingTitle`, `restingWhy`, `restingKept`, `notRead`, `amountRow` (ยอดเงิน), `tapToType`, `tellStillWorks`, `typeAmount`. Lines other keys hold: แนบรูป `photos.attachTitle`, บันอ่านสลิป `slipTitle`, the footnote `slipNotKept`, กระเป๋า `add.rowWallet`, ลองอีกครั้ง `common.tryAgain`. The confirm header `bunReadSlip` is §5.1's บันอ่านจากสลิป ตรวจก่อนบันทึก. Drafts: `receiptTitle` บันอ่านใบเสร็จ; `typeIn` เงินเข้า; `fromPhoto` จากรูป; `receiptKept` รูปนี้จะเก็บเป็นใบเสร็จของรายการ เปิดดูได้เฉพาะคุณ; `reading` บันกำลังอ่านรูป…; `slipLimit` วันนี้บันอ่านสลิปครบ {limit} ใบแล้ว อ่านต่อได้พรุ่งนี้; `tooLargeForBun` รูปนี้ใหญ่เกินกว่าที่บันจะอ่านได้ ลองใช้รูปแคปหน้าจอสลิปจากแอปธนาคาร; `bunReadReceipt` บันอ่านจากรูป ตรวจก่อนบันทึก. Deviation: es-ai-unavailable's album name and capture time are left out.

- [ ] **Step 1: Stub, then write the failing tests.**
  - `slipMarks.test.ts`: `read fields are from the slip unless flagged, and the category is Bun's guess`; `an unclear amount asks to be typed`; `readFailureOf maps the day's limit and everything else`.
  - `SlipRead.render.test.tsx`: `reading a slip shows what Bun read, each field marked` (฿1,250 with ผู้รับ, วันที่ and ธนาคาร marked จากสลิป, หมวด marked บันเดา; the request carried the base64 and media type); `ใช้ข้อมูลนี้ fills confirm, and the saved record is a photo record reviewed kept`; `a slip read drops the photo: no row, no upload, nothing kept` (Review Focus 1); `a receipt read keeps the photo for the record`; `a slip QR photo that Bun reads as a receipt is still not kept` (Review Focus 1; a fake decoder); `an unreadable photo adds nothing and offers retake or typing` (Review Focus 1); `es-ai-unavailable keeps the photo and the draft, and Try again reads again` (Review Focus 3; one `ai_unavailable` with `AI_PAUSED` and `/spend/add`); `a photo whose read failed is not uploaded when the record is saved` (Review Focus 1: after พิมพ์ยอดเอง and a save, no keeper job and no upload); `the day's limit says when Bun can read again, and the photo is not kept` (Review Focus 1); `a photo over 1.2 MB is refused before anything is sent, is not kept while the read is on, and is kept once the read is turned off` (Review Focus 1, default pending owner Q2); `a photo picked with the read off, or with AI off, is never sent to Bun` (the fake's `slip` has no call; the photo stays as a receipt); `the saved photo reaches onPhotoSaved once, with its read, whether it is kept and its via`; `a record saved from a slip read reaches onPhotoSaved once with its slip QR, no photo and kept false` (a fake decoder); `private mode hides the read amount and covers the photo until tapped` (Review Focus 5, Q12).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/bunai/slipMarks.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/bunai/SlipRead.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with the tray suites unchanged.
- [ ] **Step 5: Mutation check.** Keep the photo after a slip read: the Review Focus 1 case fails. Keep it after a failed read: the failed-read case fails. Let a `receipt` read keep a slip QR photo: the slip QR case fails. Send with the read off: the never-sent case fails. Release the slip QR with a slip read's photo: the slip-read save case fails. Mark the category from the slip: the marks test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Read one slip or receipt photo with Bun in the add tray, marking what came from the photo and keeping no slip"`

---

### Task P3-T18: Tell Bun with several drafts

**Starts after:** P2-T7, P2-T17, P3-T5, P3-T6, P3-T13, P3-T14

**Files:**
- Create: `apps/app/src/spend/v1/ai/tellBunDrafts.ts` (pure), `apps/app/src/wallet/bunai/TellStep.tsx`, `useDraftsSave.ts`; sections `bw-ai-tell`, `bw-ai-tell-phone`, `bw-ai-tell-no-diary`
- Modify: `apps/app/src/wallet/add/addFlow.ts` (`AddStep` gains `'tell'`), `AddTrayHost.tsx` (while `useBunAiArea()`, the host's `onTellBun`, which บอกบัน calls, opens the `'tell'` step in place of `TellBunSheet`), P2-T17's `src/wallet/saved/savedMoment.ts`, `SavedToastHost.tsx` and `SaveFlight.tsx` (a batch notice), `src/analytics/events.ts` (`AiModelName = AiModel`), `bunai/drafts.ts`
- Test: `apps/app/src/spend/v1/ai/tellBunDrafts.test.ts` (Node), `src/wallet/saved/savedMoment.test.ts`, `src/wallet/bunai/TellStep.render.test.tsx`

**Interfaces:**
- Consumes: `localDrafts`, `TellBunContext` (`tellBun.ts`); `AiParseResult`, `AiModel` (P3-T6); `useBunAiArea` (P3-T14); `applyAiDraft`, `draftFieldsOf` (P3-T13); `AiModelName`, `savedOutcome`, `useDraftReview`, `trackTellBunSent` (P3-T5); `trackRecordSaved` (1D-T1); `useSavedToast`, `SavedNotice`, `undoPlan`, `UndoPlan` (P2-T17); `analyticsCategoryKey` (P2-T7).
- Produces:
  ```ts
  // tellBunDrafts.ts
  export function rulesRead(text: string, ctx: TellBunContext): AiDraft | null   // the rules' one draft, when it has an amount and neither amount_unclear nor multiple_amounts
  export type TellAnswer = { drafts: AiDraft[]; model: AiModel; escalated: boolean; note: 'none' | 'phone_read' | 'limit' }
  export function tellBun(text: string, ctx: TellBunContext, ai: { enabled: boolean; parse(request: AiParseRequest): Promise<AiParseResult> }, locale: AiLocale, today: string): Promise<TellAnswer>
  // useDraftsSave.ts
  export type DraftItem = { draft: QuickAddDraft; amountMinor: string; original: DraftFields }
  export function useDraftsSave(options: { today: string }): { saving: boolean; problems: Readonly<Record<string, string>>;
    save(items: readonly DraftItem[], meta: { model: AiModel; escalated: boolean; openedAt: number }): Promise<{ saved: string[]; failed: string[] }> }
  // savedMoment.ts, additively: SavedNotice gains words?: { text: string; spoken: string } and batch?: readonly { recordId: string; commandId: string }[]
  export function batchUndoPlans(notice: SavedNotice, outbox: readonly OutboxCommand[]): UndoPlan[]   // undoPlan for each batch item, as a device save
  // events.ts: P3-T5's union under one name, now that P3-T6's AiModel exists
  export type AiModelName = AiModel
  ```
- `tellBun`: the rules first (`rulesRead` answers with `model: 'rules'` and no call); otherwise, with AI on, the server's parse; a failure or AI off answers `localDrafts` with `note: 'phone_read'` (`'limit'` for `AI_LIMIT_REACHED`). One `tell_bun_sent` per sentence, with the answer's model and escalated.
- One draft opens confirm through `applyAiDraft(draft, { source: 'tell_bun', model, escalated })`. Two or more show ai-tell: rows with title, category (marked บันเดา when guessed), amount and remove; one wallet and date row for all; a tap edits that draft in the confirm step, whose เสร็จ returns to the list; บันทึก {count} รายการ saves them all. `useDraftsSave` uses the device diary only (H11): one `saveDraft` per draft with its own record and command id, offline-safe; per saved draft one `record_saved` (`source: 'tell_bun'`, `hasPhoto: false`) and one review (`savedOutcome`); removing a row reviews it `dropped`, and closing the tray reviews each remaining row `dropped`. A draft the diary refuses stays with its words. The toast is the first saved draft's notice with `words` (`bunai.savedMany`) and `batch` listing every saved draft, with no flight; its Undo (§5.1, H11) shows while any plan is not `none` and applies `batchUndoPlans` at once (drafts on the phone removed, records the server holds deleted at version 1, one being sent kept), then says `saved.undone` or `saved.undoneDeleted` and sends one `undo_used` with the first draft's kind. A delete refused with `VERSION_CONFLICT` keeps that record while the others are still undone; the toast then says `saved.undoConflict`, and `undo_used` goes only if something was undone.
- Copy (`bunai.*`, read as P3-T14 says). From ai-tell, in order, with the board's sample count, name and wallet as `{count}`, `{title}` and `{wallet}`: `tell`, `clear`, `tellFound`, `tapToEdit`, `draftsLabel`, `removeDraft`, `fromWallet`, `total`, `nothingSaved`, `saveMany`. Drafts: `tellPlaceholder` เช่น ข้าวมันไก่ 50 ชาเย็น 25; `tellSend` ให้บันอ่าน; `phoneRead` บันอ่านบนมือถือ ตัวช่วย AI ไม่ได้ใช้; `noDraft` บันไม่เจอรายการในประโยคนี้ ลองแบบ “ข้าวมันไก่ 50”; `needsDiary` บันทึกหลายรายการได้เมื่อสมุดในเครื่องพร้อม; `savedMany` บันทึกแล้ว {count} รายการ. The confirm step's เสร็จ is `common.done`.

- [ ] **Step 1: Stub, then write the failing tests.**
  - `tellBunDrafts.test.ts`: `a sentence the rules can read is answered on the phone` (`ข้าวมันไก่ 50`: one draft, `model: 'rules'`, no parse); `several amounts go to Bun` (`ข้าวมันไก่ 50 ชาเย็น 25 วิน 20` calls parse); `a failed call falls back to the phone and says so`; `with AI off the phone answers`.
  - `savedMoment.test.ts`: `a batch notice shows its own words and plans Undo for each draft` (two drafts still on the phone give two `remove_draft`, one that left the outbox `delete_record` at version 1, one being sent `none`).
  - `TellStep.render.test.tsx`: `three drafts show their total and save three records, each its own command` (฿95; three outbox entries with distinct command ids and `source: 'tell_bun'`; three `record_saved`, three `ai_draft_reviewed` kept, one `tell_bun_sent` with `claude-haiku-5-5`); `removing a draft reviews it dropped and saves the rest`; `editing one draft's amount reviews it edited`; `one draft refused by the diary leaves the others saved` (Review Focus 4: the second `saveDraft` rejects; two saved, its row stays with its words); `Undo after saving three drafts removes all three` (three `removeDraft`, one `undo_used`); `a batch Undo with one delete refused undoes the rest and says saved.undoConflict`; `without an open diary the save says why`; `closing with drafts reviews each dropped`; `one draft goes straight to confirm`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/spend/v1/ai/tellBunDrafts.test.ts src/wallet/saved/savedMoment.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/bunai/TellStep.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `TellBunSheet.render.test.tsx`, `tellBun.test.ts` and `SavedMoment.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Share one command id: the three-commands case fails. Review a removed row twice: the dropped case fails. Call parse for a sentence the rules read: the rules case fails. Undo only the first draft: the Undo case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Let Tell Bun turn one sentence into several drafts, each saved as its own record"`

---

### Task P3-T19: The receipt viewer and the record's source

**Starts after:** P2-T26, P3-T2, P3-T14, 1B-T9

**Files:**
- Create: `apps/app/src/wallet/receipts/drafts.ts`, `receiptZoom.ts` (pure), `WalletReceiptRow.tsx`, `WalletReceiptViewer.tsx`, `SourceRow.tsx`; sections `bw-record-receipt`, `bw-receipt-view`, `bw-receipt-delete`, `bw-record-source`
- Modify: `apps/app/src/wallet/records/WalletRecordScreen.tsx` (while `useBunAiArea()`: `SourceRow` when the record has a `source`; a held receipt shows `WalletReceiptRow` in place of `RecordReceipt`)
- Test: `apps/app/src/wallet/receipts/receiptZoom.test.ts`, `receiptViewer.source.test.ts` (Node), `ReceiptViewer.render.test.tsx`

**Interfaces:**
- Consumes: `useReceiptPorts`, `ReceiptPorts` (`ReceiptParts.tsx`); `dataUriOf`, `grantUsable` (`receiptModel.ts`); `useLockCover`, `LockCoverArt` (P2-T13); `WalletAmount`, `usePrivateMode` (P2-T10); `useWalletReducedMotion` (P2-T2); `useRecordActions` (P2-T6); `TransactionSource` (P3-T2); `useBunAiArea` (P3-T14).
- Produces:
  ```ts
  export const ZOOM = { min: 1, max: 4, step: 0.5, doubleTap: 2.5 } as const
  export function clampZoom(scale: number): number
  export function zoomStep(scale: number, direction: 'in' | 'out'): number
  export function doubleTapZoom(scale: number): number      // 1 goes to 2.5; any other scale back to 1
  export function canShareReceipt(os: string): boolean       // 'ios' only (default pending owner Q3)
  export function WalletReceiptRow(props: { onOpen(): void }): JSX.Element
  export function WalletReceiptViewer(props: { visible: boolean; recordId: string; version: number; attachmentId: string; title: string; detail: string; amountMinor: Minor;
    onClose(): void; onDeleted(version: number): void; ports?: Partial<ReceiptPorts> }): JSX.Element
  export function SourceRow(props: { source: TransactionSource }): JSX.Element
  ```
- The viewer is a full-screen `Modal` that draws `LockCoverArt` while `useLockCover().hidden` (R63); the image is the grant's verified bytes as a data URI. Pinch (`usePinchGesture`) and double tap (`useTapGesture({ numberOfTaps: 2 })`) run together (`useSimultaneousGestures`, `runOnJS: true`), beside 44 pt zoom buttons; under reduced motion the scale changes without a spring. The record line is title · date · wallet with `WalletAmount`; in private mode the image is covered until tapped (`bunai.photoHidden`, default pending owner Q12). แชร์ on iOS calls `Share.share({ url: dataUri })` (React Native shares a `data:` URL's bytes, nothing is written); Android shows no share. ลบรูป opens the confirm inside the Modal, then `attachments.remove(recordId, version, key)`; `onDeleted(ack.version)` closes it and the record reads again. The removal is final: the receipt is released, so restoring the record never brings it back.
- Copy (`receipts.*`, read as P3-T14 says). From rc-view, in order: `title`, `zoomIn` and `zoomOut` (its buttons' labels ซูมเข้า and ซูมออก), `zoomHint`, `share`, `delete`, `onlyYou`, `confirmTitle`, `confirmClose`, `confirmFinal`, `confirmLine` (its record and amount as `{title}` and `{amount}`), `confirmDelete`. From bw-record: `source` (จดจาก), `sourceTellBun` (บอกบัน), `row`, `rowLine`. Drafts: `loading` กำลังโหลดรูป…; `loadFailed` โหลดรูปไม่ได้ ลองอีกครั้ง; `deleteFailed` ลบรูปไม่ได้ตอนนี้ ลองอีกครั้ง; `sourceTyped` พิมพ์เอง; `sourcePhoto` บันอ่านจากรูป; `sourceSlipImport` สลิปอัตโนมัติ; `sourceStatement` ไฟล์จากธนาคาร; `sourceShare` แชร์จากแอปอื่น; `sourceSiri` Siri. Deviations: no capture time; the Tell Bun sentence is not stored, so the source row names the way only (H12 revises W35).

- [ ] **Step 1: Stub, then write the failing tests.**
  - `receiptZoom.test.ts`: `zoom stays between 1 and 4 in steps of 0.5`; `a double tap zooms to 2.5 and back to 1`; `only iOS shares`.
  - `receiptViewer.source.test.ts`: `the viewer's gestures run on the JS runtime and the double tap needs two taps` (`readFileSync` finds `numberOfTaps: 2` and `runOnJS: true`).
  - `ReceiptViewer.render.test.tsx`: `the record shows its receipt row, and the viewer shows the verified image`; `the zoom buttons change the scale and say so`; `iOS shares the image from memory, and Android has no share`; `deleting asks first, names the record and removes the photo for good` (private mode hides the amount in the line); `a hidden lock cover replaces the viewer`; `private mode covers the receipt until tapped` (Q12); `the record says how it was made` (`tell_bun` reads จดจาก บอกบัน; no source, no row).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/receipts/receiptZoom.test.ts src/wallet/receipts/receiptViewer.source.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/receipts/ReceiptViewer.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `WalletRecord.render.test.tsx` and `RecordReceipt.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Share on Android: its case fails. Skip the lock cover: its case fails. Remove without the confirm: the delete case fails.
- [ ] **Step 6: Gate, receipt, commit.** Device checks (pinch, the iOS share sheet) SKIPPED until a development build. `git commit -m "Add the Bun Wallet receipt viewer with zoom, share and a final delete, and the record's source row"`

**Checkpoint E2-P3-A** (controller): the sections of P3-T14 to P3-T19.

---

### Task P3-T20: Ask Bun in the Bun Wallet look

**Starts after:** P2-T10, P2-T13, P2-T28, P3-T5, P3-T9, P3-T14

B7: Bun's figures and words stay in baht.

**Files:**
- Create: `apps/app/src/wallet/bunai/askModel.ts` (pure), `WalletAskScreen.tsx`; sections `bw-ai-ask`, `bw-ai-ask-private`, `bw-ai-ask-limit`, `bw-ai-ask-resting`
- Modify: `apps/app/app/spend/ask.tsx` (with `useBunAiArea()`, `WalletAskScreen`), `bunai/drafts.ts`
- Test: `apps/app/src/wallet/bunai/askModel.test.ts` (Node), `WalletAsk.render.test.tsx`

**Interfaces:**
- Consumes: `AiAskResult`, `AiFigure` (P3-T9); `trackAskBunAsked`, `trackAskBunRated`, `trackAiUnavailable` (P3-T5); `useBunAiArea`, `AiConsentTray` (P3-T14); `WalletAmount`, `usePrivateMode`, `HIDDEN_AMOUNT` (P2-T10); `todayInBangkok`.
- Produces:
  ```ts
  export const ASK_SUGGESTIONS = ['bunai.suggestEatOut', 'bunai.suggestWhere', 'bunai.suggestBudget'] as const
  export function followUps(asked: string, t: WalletT): string[]                 // two suggestions, never the question just asked
  export function seeAllHref(figure: AiFigure, today: string): string | null      // P2-T28's /spend/all?month=YYYY-MM&type=<type>[&category=<id>] (R71) when the scope starts on a month's 1st and ends on its last day, or on or after today in today's month
  export function mainFigure(figures: readonly AiFigure[]): AiFigure | null       // the first figure with a count
  export function WalletAskScreen(props: { now?: Date }): JSX.Element
  ```
- ai-ask: back, ถามบัน, เรื่องการใช้เงินของคุณ and ตั้งค่า AI (`/settings/ai`); each turn shows the question, Bun's answer with ตอบจากบันทึกของคุณ, the main figure (`WalletAmount` and `{count} รายการ · {label}`), the figures card and ดูทั้ง {count} รายการ when `seeAllHref` allows; two rating buttons send at most one `ask_bun_rated` per answer; follow-up chips ask their question; ถามได้อีก {count} ข้อ reads `remaining.ask` after each answer. One `ask_bun_asked` per answer. AI off opens `AiConsentTray` first; `available: false` or a 503 shows the resting line and one `ai_unavailable` (`/spend/ask`); a 429 the limit line. Private mode replaces the answer with `answerHidden` and every figure with `HIDDEN_AMOUNT` (H13). No chart (H14).
- Copy (`bunai.*`, read as P3-T14 says). From ai-ask, in order, with its sample count and label as `{count}` and `{label}`: `askTitle`, `askLine`, `aiSettings`, `suggestEatOut` (the board's question), `answerLabel`, `speaker` (บัน), `answerFrom`, `figureLine`, `fromRecords`, `seeAll`, `followUp`, `suggestWhere`, `suggestBudget`, `askLabel` (the field's spoken name, คำถามของคุณ), `askPlaceholder` (its placeholder, ถามเรื่องการใช้เงินของคุณ), `askSend`, `mayErr`, `questionsLeft`; the sample time and the chart's labels are skipped (H14). Drafts: `rateQuestion` คำตอบนี้มีประโยชน์ไหม; `rateHelpful` มีประโยชน์; `rateNotHelpful` ไม่มีประโยชน์; `rateThanks` ขอบคุณที่บอกบัน; `answerHidden` ซ่อนยอดเงินอยู่ แตะรูปตาเพื่อดูคำตอบ; `askLimit` วันนี้ถามครบ {limit} ข้อแล้ว ถามต่อได้พรุ่งนี้; `thinking` บันกำลังดูบันทึกของคุณ…; `askResting` ตัวช่วย AI ของบันพักชั่วคราว ลองใหม่อีกสักครู่.

- [ ] **Step 1: Stub, then write the failing tests.**
  - `askModel.test.ts`: `see all opens History only when the scope is one month` (1 to 24 October on 24 October gives `/spend/all?month=2026-10&type=expense&category=<food>`; the whole of October seen in November too; 15 to 24 October, a scope across months and no scope give null); `follow-ups never repeat the question just asked`.
  - `WalletAsk.render.test.tsx`: `an answer shows its words, its main figure with the record count and the figures card` (฿3,420 and 41 รายการ); `ดูทั้ง 41 รายการ opens History for that month and category`; `a follow-up chip asks its question`; `uses left come from today's remaining questions`; `each answer sends one ask_bun_asked and at most one ask_bun_rated` (a second tap sends nothing; helpful is `kept`; model and escalated from the answer); `with AI off the consent comes first`; `Bun resting says so and sends one ai_unavailable`; `the day's limit says when to ask again`; `private mode hides the answer and every figure` (Review Focus 5).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/bunai/askModel.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/bunai/WalletAsk.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `AskBunScreen.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Rate twice: the rating case fails. Offer see-all for half a month: the model test fails. Show the answer in private mode: the private case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Ask Bun in the Bun Wallet look, with record counts, see-all and a two-button rating"`

---

### Task P3-T21: Bun's daily note on the wallet Home

**Starts after:** P2-T24, P3-T6, P3-T14

Default pending owner Q7 (revises W33, H12).

**Files:**
- Create: `apps/app/src/wallet/bunai/WalletBunNote.tsx`; section `bw-home-note`
- Modify: `apps/app/src/wallet/home/WalletHomeScreen.tsx` (the note under the greeting, after P2-T35's `SetupCard`, while `useBunAiArea()`), `bunai/drafts.ts`
- Test: `apps/app/src/wallet/bunai/WalletBunNote.render.test.tsx`

**Interfaces:**
- Consumes: `useBunAiArea`, `useDailyNoteSetting` (P3-T14); `useBunIntensity`; `usePrivateMode` (P2-T10); `walletDeviceStore` (P2-T3); `AiNoteResult` (P3-T6).
- Produces: `export function readBunNote(resources: AiResources, today: string, locale: AiLocale, enabled: boolean): Promise<AiNoteResult>` (one note per Bangkok date, kept in memory across mounts, so Home asks once a day while the app runs, as ai-settings says; `BunNote`'s two-hour cache stays as it is); `export function WalletBunNote(props: { today: string }): JSX.Element | null`. The device store name `note-dismissed` holds the Bangkok date the note was closed.
- The note shows when the intensity is `full`, the note switch is on, private mode is off, it was not closed today and the note has text: a decorative Bun face, the text and a 44 pt close. Copy (drafts): `bunai.noteLabel` โน้ตจากบัน; `bunai.noteDismiss` ปิดโน้ตวันนี้.

- [ ] **Step 1: Stub, then write the failing tests:** `the note shows on Home in full mode with the switch on`; `quiet, off, the switch off and private mode hide it` (Review Focus 5); `closed today it stays hidden until the next Bangkok day`; `a second visit the same day, three hours later, asks for no new note` (`note` called once; the next Bangkok day asks again).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:render -w gogospend-app -- src/wallet/bunai/WalletBunNote.render.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `BunNote.render.test.tsx` and `WalletHome.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Show it in quiet mode: its case fails. Read on every mount: the second-visit case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Show Bun's daily note on the wallet Home once a day in full mode"`

**Checkpoint E2-P3-B** (controller): Ask Bun and the daily note.

---

### Task P3-T22: The 100-slip evaluation, in development builds only

**Starts after:** P3-T5, P3-T8, P3-T11, P3-T15

D25: about 100 real Thai slips validate the slip prompt before it is locked. H15: no slip image or mark leaves the tester's phone album or memory; CI uses the fake model only.

**Files:**
- Create: `apps/app/src/dev/aiCheck/slipEval.ts` (pure), `apps/app/src/dev/aiCheck/AiCheckScreen.tsx`; `apps/app/app/dev/ai-check.tsx` (loads the screen with `if (__DEV__) require(...)` and says Not available otherwise, as `app/dev/catalogue.tsx` does); `apps/app/scripts/check-export.mjs`
- Modify: `apps/app/src/wallet/photos/photoPort.ts` (`PhotoPicker` gains `pickMany(limit: number): Promise<readonly string[]>`, the album's picked URIs with `allowsMultipleSelection: true` and `selectionLimit: limit`, a denial or cancel answering `[]`, and `readPicked(uri: string): Promise<PhotoPick>`, one photo read into memory and its copy deleted as `pick` does, `refused` when unusable; `fakePhotoPicker` answers both)
- Test: `apps/app/src/dev/aiCheck/slipEval.test.ts`, `apps/app/src/dev/aiCheck/checkExport.test.ts` (Node), `apps/app/src/dev/aiCheck/AiCheckScreen.render.test.tsx`, `apps/app/src/wallet/photos/photoPort.test.ts`

**Interfaces:**
- Consumes: `AiSlipResult`, `SlipKind`, `AiModel` (P3-T6, P3-T8); `expoPhotoPicker`, `readableByBun` (P3-T15), with `pickMany(25)` and `readPicked`; `readDraftTally`, `resetDraftTally` (P3-T5); `expo-clipboard` `setStringAsync` (installed ~58.0.3).
- Produces:
  ```ts
  export const EVAL_FIELDS = ['amount', 'date', 'receiver', 'direction', 'bank'] as const
  export type EvalField = (typeof EVAL_FIELDS)[number]
  export type EvalMark = 'right' | 'wrong'
  export type EvalRead = { kind: SlipKind; model: AiModel; escalated: boolean; declined: boolean; latencyMs: number; tokens: { input: number; output: number };
    present: Readonly<Record<EvalField, boolean>>; flagged: Readonly<Record<EvalField, boolean>> }
  export type EvalEntry = { read: EvalRead | { failed: 'resting' | 'limit' | 'too_large' }; marks: Partial<Record<EvalField, EvalMark>> }
  export type EvalSummary = { slips: number; failed: number; allRight: number; fields: Record<EvalField, { right: number; wrong: number; missing: number; confidentWrong: number }>;
    escalated: number; declined: number; unreadable: number; p50Ms: number | null; p95Ms: number | null; tokens: { input: number; output: number } }
  export function evalReadOf(result: AiSlipResult, latencyMs: number): EvalRead   // the first draft; amount_unclear flags amount, date_guessed flags date
  export function summarize(entries: readonly EvalEntry[]): EvalSummary            // a field Bun left empty is missing; a wrong field Bun did not flag is confident but wrong
  export function percentile(values: readonly number[], p: number): number | null  // nearest rank
  export function summaryText(summary: EvalSummary): string                         // counts, rates, milliseconds and tokens only
  export const AI_CHECK_MARKER = 'jotbun-dev-ai-check'
  ```
- The screen (English, a developer tool; `AI_CHECK_MARKER` is its root `testID`, so the marker is live code): Pick slips, then each slip is read only when its turn comes (`readPicked`, then `resources.slip`, the production single-read path), so one photo at a time is in memory; a refused photo is skipped and counted, and leaving the screen deletes the copies not yet read. Its fields show with Right and Wrong, then the running summary and Copy summary; a second section shows the draft tally by model with Reset. Marks live in memory only. `check-export.mjs [dir]` (default `apps/app/dist`) exits 1 when the folder is missing or any `.js` under it holds `jotbun-dev-ai-check` or `jotbun.dev.draft-tally`.

- [ ] **Step 1: Stub, then write the failing tests.**
  - `slipEval.test.ts`: `the summary counts each field's right, wrong and missing, and the slips with every field right`; `a wrong field Bun did not flag is confident but wrong`; `escalations, declines and unreadable reads are counted`; `percentiles use the nearest rank` (1 to 100 give 50 and 95); `the summary text holds counts only` (entries read from slips carrying ฿1,250.00 and บ้านสวน อพาร์ตเมนต์ give a text holding neither).
  - `checkExport.test.ts`: `the export check fails when a development marker survives, and passes without one`.
  - `AiCheckScreen.render.test.tsx`: `picked slips are read one at a time through the production slip read, each only when its turn comes`; `marks change the summary`; `copy puts only the summary on the clipboard`; `the slip check writes nothing to storage` (an AsyncStorage spy sees no write); `the draft tally shows kept, edited and dropped for each model`.
  - `photoPort.test.ts`: `pickMany answers the album's URIs and a denial none, and readPicked reads one and deletes its copy`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/dev/aiCheck/slipEval.test.ts src/dev/aiCheck/checkExport.test.ts src/wallet/photos/photoPort.test.ts` and `npm run test:render -w gogospend-app -- src/dev/aiCheck/AiCheckScreen.render.test.tsx`.
- [ ] **Step 3: Implement,** then add `node apps/app/scripts/check-export.mjs` to this plan's app gate after `export:web`.
- [ ] **Step 4: Run them and see them pass,** then `npm run export:web -w gogospend-app -- --max-workers 2 && node apps/app/scripts/check-export.mjs` (both markers absent from the production bundle).
- [ ] **Step 5: Mutation check.** Import the screen statically in the route: the export check fails. Count an unflagged wrong field as flagged: the confident-but-wrong case fails.
- [ ] **Step 6: Gate, receipt, commit.** The real run is SKIPPED until the D33 Anthropic key, a development build and the owner's slips (default pending owner Q9). The receipt holds its procedure: `npm run build:local --prefix apps/edge`; `wrangler dev` with `--var JOTBUN_ENV:local --var AI_ENABLED:true --var AI_EVAL_SLIP_LIMIT:120` and the key as a local secret; the tester picks about 100 slips, marks each field and copies the summary to the owner, who sets the thresholds and locks `SLIP_SYSTEM` and `SLIP_SCHEMA`. `git commit -m "Add the development-only 100-slip check and the draft tally, kept out of release bundles"`

---

### Task P3-T23: The phase 3 proof: drafts kept without edits

**Starts after:** P3-T10, P3-T16, P3-T17, P3-T18, P3-T19, P3-T20, P3-T21, P3-T22

**Files:**
- Modify: `docs/implementation/beta-receipts.md` (the run-sheet rows), `docs/implementation/premium-progress.md` (the closing P3 receipt), `apps/app/README.md` (a development build with `bunai`)

**Interfaces:** none.

- [ ] **Step 1: Run every P3 suite and both gates.** `npm run test:edge:workers` and `npm run test:edge` whole, then the app gate with the export check. Expected: all pass.
- [ ] **Step 2: Write the run-sheet** into `beta-receipts.md`, each row SKIPPED until it is done on a phone:
  1. On the Mac: `npm run build:local --prefix apps/edge`; `wrangler dev` with the migrations and settings of 1D-T15's run-sheet, plus `--var AI_ENABLED:true`, `--var IMPORT_UPLOADS_ENABLED:true`, `ANTHROPIC_API_KEY` (D33) and, when the owner has one, `ANTHROPIC_BASE_URL` set to the gateway (Q4); Docker on and a scratch copy of `wrangler.jsonc` with `dev.enable_containers` true, as 1B-T5 Step 8 does, so receipts are re-encoded and kept.
  2. A development build with `EXPO_PUBLIC_REDESIGN=catalogue,wallet,bunai` against the LAN address (1D-T5's rule); reset the tally on `/dev/ai-check`.
  3. Over three days of ordinary use: at least 20 Tell Bun sentences (several with more than one item), 10 slip reads and 5 receipt photos read and kept.
  4. Read the tally: the share kept without edits is kept / (kept + edited + dropped), for Haiku and Opus drafts together and for the rules on their own. Pass when the AI share meets the owner's share (default pending owner Q10: the measured shares are recorded and the owner judges them).
  5. Open one kept receipt in the viewer, zoom, share (iOS) and delete it; screenshots of each step.
- [ ] **Step 3: Run what can run locally.** On a simulator with a development build and no Anthropic key, Tell Bun answers by the rules and its drafts are reviewed with `model: 'rules'`: record that share as a simulator run, not the proof.
- [ ] **Step 4: The closing P3 receipt** in `premium-progress.md`: what each task proved, the mutants, the measured shares, the client minimum `AI_MIN_CLIENT_VERSION` (`0.2.0`), every SKIPPED item with what it waits for (D33 key, gateway, PostHog project, development builds, Q1), and each owner question with its default and status.
- [ ] **Step 5: Commit, then the independent review of the whole P3 range** (handover §4 step 8), fixing findings test-first. `git commit -m "Record the phase 3 proof: the run-sheet, the draft tally and the P3 receipts"`

---

### Task P3-T24: After E2: route the bunai area, move the copy into the catalogs and bump the AI notice

**Starts after:** P3-T23, P2-T38, and the owner's approval of E2-P3-A and E2-P3-B

A17: the notice is bumped here, after approval, so nobody answers a draft notice.

**Files:**
- Modify: `apps/app/src/config/featureFlags.ts` and its test (`'bunai'` joins `APPROVED`); `apps/app/src/messages/en.json`, `th.json` (each approved line under a camelCase `walletBunai…`, `walletPhotos…` or `walletReceipts…` key), `src/i18n/catalogs.test.ts`; each P3 `drafts.ts` becomes `copy.ts` in P2-T38's English-only form, its callers move from `useBunAiCopy` to `useWalletCopy` (P2-T38's `ALL_COPY` gains P3's tables; `useBunAiCopy.ts` is deleted); `packages/contracts/src/v1/ai.ts` (`AI_NOTICE_VERSION = 2`, default pending owner Q6; `AI_MIN_CLIENT_VERSION = '0.2.1'`, with `apps/app/app.json`'s `expo.version` at least that, only if a build without this task was released); `src/screens/redesign/ai/AiConsentSheet.tsx` (its promises become the approved consent lines, B8); `apps/app/locales/*.json` (approved permission strings); `src/spend/v1/ai/testing/fakeAiResources.ts` (`current_notice_version: 2`)
- Test: `featureFlags.test.ts`, `catalogs.test.ts`, `apps/edge/test/contracts-ai.test.ts`, `apps/edge/test/workers/ai.test.ts`, `AiConsent.render.test.tsx`

**Interfaces:**
- Consumes: `useWalletCopy`, `ALL_COPY` (P2-T38); `AI_NOTICE_VERSION`, `AI_MIN_CLIENT_VERSION` (contracts).
- Produces: `AI_NOTICE_VERSION = 2`; each P3 area's `COPY` table in P2-T38's English-only form, joined to `ALL_COPY`; `bunai` in `APPROVED`, so `useBunAiArea()` follows `wallet`.

- [ ] **Step 1: Write the failing tests:** `bunai is on by default and -bunai turns it off`; `every P3 line in use is in en.json and th.json, with the same placeholders`; `no P3 copy file holds Thai any more`; `no P3 English line matches an existing catalog key with other Thai` (`tc()` finds a key by its English and the first wins); `the notice is version 2, and consent to version 1 no longer counts` (a vault whose `ai_preferences.notice_version` is 1 reads `companion: false`, and parse answers 403 `AI_CONSENT_REQUIRED`); `both consent looks show the approved lines`, which still name record notes and the names and account digits a slip prints (B8).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/config/featureFlags.test.ts src/i18n/catalogs.test.ts`, `npm run test:render -w gogospend-app -- src/wallet/bunai/AiConsent.render.test.tsx`, `npm run test:edge -- test/contracts-ai.test.ts` and `npm run test:edge:workers -- test/workers/ai.test.ts`.
- [ ] **Step 3: Move the copy** with the owner's E2 edits (a short script under the scratchpad writes the entries; review its output by hand), approve the area, bump the notice and update the old sheet.
- [ ] **Step 4: Run them and see them pass,** then the edge and app gates.
- [ ] **Step 5: Mutation check.** Remove one Thai entry: `catalogs.test.ts` fails. Leave the notice at 1: its test fails.
- [ ] **Step 6: Receipt, commit.** The owner's approval words go in the receipt; everyone answers the new notice once (Q6). The receipt names the client minimum: `AI_MIN_CLIENT_VERSION` (`0.2.0`) if no build without this task was released, else `0.2.1`, because older builds send notice 1, which `parseAiPreferencesUpdate` now refuses. `git commit -m "Switch Bun's photos and AI screens on after the owner's E2 approval, move their copy into the catalogs and ask for the new AI notice"`

---

## Self-review notes (for the executor)

- **Spec coverage:** §6.7: T3, T4, T6 to T11; §5.2 Daily capture: T13, T15 to T17; `rc-view`: T19; `ai-*`: T14, T17, T18, T20, T21; `es-*`: T15, T17; §7: T5, T10, T13, T15, T17, T18, T20; §2 anti-goals: T8, T10, T15, T17; D25's 100 slips: T11, T22; proof: T23; E2: the checkpoints and T24.
- **Type consistency, checked:** each name a task consumes is produced, with the same signature, by the task it cites; `AiModelName` (T5) becomes an alias of `AiModel` (T6) in T18, and `useBunAiCopy` and `BunAiTable` (T14) last until T24.
- **Not in P3, on purpose:** P4's slip import, inbox and push; currencies (P5, B7); surveys (P6B); the share extension (P6A); the weekly chart (H14); a recent-photos strip, a resizer and Android share (Q2, Q3); attaching a photo to an existing record (today's receipt panel keeps it).
