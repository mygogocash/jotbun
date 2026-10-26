# Phase 4: Slips and statements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read Thai bank slips from the albums a person picks into slip drafts they review, import real bank statements in CSV and XLSX, and tell the person's phones when slips, statements, exports and the month recap are ready, with nothing about a slip image kept anywhere.

**Architecture:** A phone scan engine keeps only photos whose QR is a Thai bank slip (P3's decoder), hashes each slip's reference with the vault's salt, shrinks the image and uploads small batches to `POST /v1/slips`, where the Worker reads them in the request with P3's `readSlipImage` and the vault writes slip drafts with their origin, salted references and bank accounts; only the inbox count is change-logged. Drafts are reviewed online and confirmed in batches of 50 as records with `source: 'slip_import'` (`share_extension` for a shared slip). A new `CATALOG_DB` holds bank albums and merchant patterns, one push queue sends Expo notifications for four events, and the statement parser learns real bank exports and remembers label mappings per layout.

**Tech Stack:** Cloudflare Workers, SQLite Durable Objects, D1, Queues, 1B's Workflows and parser Container; `@cloudflare/vitest-plugin` 1.4.7, wrangler 4.152.0, Drizzle 0.45.3; `posthog-node` through 1D-T3's module; Expo's push HTTP API by `fetch`. App: Expo SDK 58 (expo 58.0.12, React Native 0.88) with the installed `expo-image-picker` 58.0.10, `expo-notifications` 58.1.5, `expo-secure-store` 58.0.2, `expo-crypto` 58.0.6, `expo-constants` 58.0.12, `expo-file-system` 58.0.9 and `expo-document-picker` 58.0.4, on P2's wallet kit. API: the parser under `apps/api/src/imports` (Node, Jest).

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md). This plan implements §8 phase 4: §6.8, §6.9, §6.13's four push events, §6.12's month recap and push rows, §6.2's slip tables and `devices`, §6.3's catalog, §6.6's phase 4 routes, §5.2's slip and statement groups with §5.3's fixes to `sl-settings`, `sl-done`, `im-pick` and `im-expect`, and §7's slip events. It applies the controller's calls B9 to B14, B19, B26 and B27 and amendments A1, A3, A10, A13, A14, A16, A20 and A24 to A35 (`boundaries-p3-p6.md`), builds on plans 1A to 1D and P2, names P3's capabilities by id and takes P3's types from P3's plan.

## Shared files

Other plans edit these too; every P4 edit is additive and named in its task.
- Edge (`apps/edge/`): `src/v1/{routes,protocol,handler,worker-routes,env,gates}.ts`, P3's `src/v1/ai/slip-read.ts` and `src/server/ai/prompts.ts` (P4-T4 exports `VOICE`); `src/vault/{routes,schema,user-vault,account-control}.ts`, `commands/{registry,change-log}.ts`, `migrations/`, `domain/transactions.ts`, `files/{jobs,parse,confirmation}.ts`; `src/background/{parse-consumer,export-workflow}.ts`; `src/analytics/server-analytics.ts`; `src/vault-worker.ts`, `src/cloudflare-workers.d.ts`, `wrangler.jsonc`, `vitest.workers.config.ts`, `README.md`; `test/route-coverage.test.ts` (`vault-route-coverage.test.ts` before 1B-T13), `c1-shape.test.ts`, `workers/vault-schema.test.ts`.
- Contracts: `packages/contracts/src/v1/{sync,imports}.ts`, `src/index.ts`. API: `apps/api/src/imports/parsers/*`, `parser-runner.ts`, `parse-outcome.ts`, `fixtures/synthetic-parse.ts` and two specs (P4-T10).
- App (`apps/app/`): `src/analytics/events.ts` and its test; `src/api/sharedV1.ts`; `src/storage/migrations.ts`, `diaryRepository.ts` and its test; `src/spend/v1/{spendDiary,imports}.ts`, `testing/fakeDiary.ts`, `DeviceDiaryProvider.tsx` and its render test; `src/config/featureFlags.ts` and its test; `src/dev/catalogue/registry.tsx`; `src/messages/{en,th}.json`, `src/i18n/catalogs.test.ts`; `src/wallet/copy/allCopy.ts`, `draftText.test.ts`; `src/wallet/home/{WalletShell,WalletHomeScreen}.tsx`, `WalletHome.render.test.tsx`; `src/testing/renderSetup.ts`; P3's `src/wallet/photos/trayPhotoSave.ts`, `AttachStep.render.test.tsx`, `src/wallet/bunai/SlipRead.render.test.tsx`, and (after Q1, P4-T13) P3-T15's `locales/{th,en}.json` and `expo-image-picker` entry in `app.json`; `src/screens/redesign/account/SettingsScreen.tsx` and, once P6B-T3 has landed, P6B's `src/wallet/settings/WalletSettingsScreen.tsx` (P4-T21, P4-T22); `app/_layout.tsx`, `app/spend/import.tsx`, `app.json`.
- `docs/implementation/premium-progress.md`: each receipt under "## P4: Slips and statements".

## Calls made in this plan

The builder's; the owner can overturn any. Tasks cite them.
- **S1. Only the inbox count is change-logged (A28).** Drafts, salted references and slip accounts stay in the vault; a write that changes the open drafts commits one `slip_inbox` change (`{ id: SLIP_INBOX_ID, version, open }`), so other phones are poked (1D-T10) and keep the Home card's count, and no slip content reaches a phone's diary, the sync feed or a snapshot. Drafts are read online. Account mapping and device tokens are plain writes.
- **S2. Both sides of a slip are kept, and the person's side is decided twice.** On write (P4-T6): the side whose bank and last four map to a wallet, else the side that already is a slip account, else the sender (a bank app's album holds its owner's slips); only that side becomes a slip account, and it sets `direction` and the category guess. On the phone `classifySlipDraft` (P4-T16a) decides again from current mappings: both sides mapped is a transfer (§6.8 step 8); one side mapped is money out of or into its wallet, the other side the payee; neither keeps the draft's direction with no wallet. So a received slip becomes income once its receiving account is mapped, and sl-wallet-map suggests a new wallet only for an account that sent a slip from a bank app's album, where the sender is surely the person (P4-T20).
- **S3. Category guesses,** for the draft's own type only (`expense` for out, `income` for in): the person's latest live record with the same merchant, then the catalog's built-in key for the longest pattern in the payee's name, else none (a payment to a person, "บันไม่เดาหมวด"). P5-T5 lets a catalog key reach a pack category (`pack_key`).
- **S4. The reader's import mode** (P4-T4, A26) adds the slip's time and both sides (bank key, last four digits, name), sends only today and the locale, and also re-reads with Opus on a missing sender bank or receiver name and on a Haiku `unreadable` or `receipt` answer (D25; the phone sends only QR-checked bank slips).
- **S5. Limits** are `SLIP_LIMITS` (P4-T1) with P4-T6's isolate slots and vault lease (memory buckets reset on eviction). A parsed request holds its base64 (at most 8 MiB) and two SDK bodies (about 1.6 MB each), so three stay near 40 MB of a 128 MB isolate.
- **S6. Uses** (C10, B5, B13, A14) are reserved on the request's lease with the Bangkok day they were counted on; a finished read spends one, even for a slip that became known while it was read (B5); a paused or unstarted slip and whatever an expired lease holds go back to that day (P4-T6). `live` (P6A's share) shares `ai_usage`'s `slip` row with P3's single read, `AI_DAILY_LIMITS.slip` (10) a day; `backfill` (scans, manual picks, daily reading) has 500 per rolling 30 days.
- **S7. Waiting** (B27): a request answers `retry_after_seconds` after a rate limit, a 5xx, a timeout or a lost connection (Anthropic's `retry-after`, else 30; 5 for the start deadline, a held lease or a full isolate), and the phone sends the same batch again (P4-T14).
- **S8. Push** (B11): one queue, `jotbun-push`, of ids only, sent only to devices whose session is live in `AUTH_DB`, only while `PUSH_SEND_ENABLED` is on, and `slips_ready` only with slip notices on (P4-T5). Expo's receipts are not read in v1: tickets, `liveSessions` and the weekly registration drop stale tokens.
- **S9. The month recap push** is due at 09:00 Bangkok on the 1st for the month before (the first, partial month too); a vault that slept through months announces only the last; a month with no logged day sends nothing.
- **S10. Push texts are server copy** in the device's language: ox-push's lines verbatim, the rest drafts shown at E2, as 1C showed its deletion email.
- **S11. Statement mappings are remembered per header fingerprint** (§6.9 step 5) at confirmation and served by a new route, `GET /v1/imports/:id/label-map`, so no DTO gains a field.
- **S12. Bank-export rules** (P4-T10) apply only when the header has both a withdrawal and a deposit column; other files parse as today.
- **S13. Rollout** (B27): the slip routes answer 404 until `SLIP_IMPORT_ENABLED` is `true` (default off), except the salt read and `POST /v1/slips/refs`, which a single read's slip ref needs before slip import opens; the `slips` and `statements` redesign areas hold the screens until E2 (P4-T24 approves both). `useSlipsArea()` is the one switch every slip entry point reads (A10), and it also waits for slip import to open on this server: the phone keeps the last answer of `GET /v1/slip-accounts` (200 opens the area, a 404 closes it, P4-T18), so the owner's one release step (P6C-T14b) turns `SLIP_IMPORT_ENABLED` on, with no new build.
- **S14. Places:** phone logic in `apps/app/src/slips/` beside P3's QR modules; screens in `src/wallet/slips/` and `src/wallet/statements/`.
- **S15. Drafts show the slip's time;** a confirmed record keeps its date only (P2's W12).
- **S16. The salt** is 32 random bytes made on its first read, never rotated, erased with the vault; the phone keeps it per account in SecureStore (B12) until the sign-out erase.
- **S17. Unreadable slips stay on the phone** as photo ids, never sent or read again by themselves; "จดเอง" shows an album photo, and under Q1's default (a picked copy is deleted once Bun has read it) opens the add tray without it.
- **S18. Slip confirmations are not `record_saved`** (B10, 1D's decided Q16); the app sends one `slip_review_confirmed` with the count.
- **S19. Album import needs P3's QR decoder (A24, A34):** the slips area stays off while `getAppQrDecoder().available` is false (P3's Q1). No P4 task waits on `P3-T12 (P3:qr-native)` (P3-T12): every P4 test runs on `fakeQrDecoder`, and P4-T23 Step 3's phone proof names it, as P3-T12's note says.

## Owner questions

Each has a conservative default the tasks follow ("default pending owner Qn", R26).
- **Q1. `expo-media-library` ~58.0.9** (reading albums by itself, §6.8 steps 1 and 2). Default: not installed; a port with a fake; meanwhile the phone picks slips by hand through the installed `expo-image-picker` (sl-intro opens the picker, and daily reading is not offered).
- **Q2. `expo-image-manipulator` ~58.0.14.** Default: not installed; manual picks are compressed by the picker (`quality` 0.7); an album photo over 1,200,000 bytes stays unread on the phone, and so does a PNG screenshot over it, since iOS's picker ignores `quality` for PNG.
- **Q3. `expo-background-task` ~58.0.11 with `expo-task-manager` ~58.0.12.** Default: not installed; daily reading runs at the first app open of each Bangkok day.
- **Q4 to Q7. B10 (as A1 amends it), B12, B13, B14.** Default: as the controller called them.
- **Q8. Bank album names and merchant patterns.** Default: P4-T2's draft seed, for the owner's review.
- **Q9. The 100 slips and "read correctly".** Default: the owner's slips on their phone, marked by P3's Q9 rubric: P3-T22's `EVAL_FIELDS` (`receiver` is the payee) plus the import mode's time and both sides' last four digits; a QR miss fails; the pass share is set at review.
- **Q10. Which bank's statement.** Default: synthetic fixtures; the owner's export in the proof.
- **Q11. Editing `apps/api`'s parser.** Default: yes, only the files P4-T10 lists.
- **Q12. Android's `READ_MEDIA_IMAGES`.** Default: not declared; Android picks by hand (Google Play policy 14115180).
- **Q13. The inbox holds slip drafts only.** Default: yes.
- **Q14. sl-slip-detail's purple frame and reference row.** Default: both dropped (the frame needs model coordinates; the phone keeps only the hash).
- **Q15. sl-settings' notification time.** Default: a switch only; the push comes when slips are read.
- **Q16. The promises "ไม่เก็บรูปสลิป" and "ลบรูปทิ้งทันที ไม่ใช้ฝึก AI"** rest on Anthropic's terms (§6.7, §10). Default: the board lines, listed for counsel before the beta.
- **Q17. XLSX statements with a second sheet, formulas or links.** Default: refused as today.
- **Q18. A phone signed out offline.** 1C's sign-out is best effort and a session lasts 30 days from its last use (1C K20), so after an offline sign-out and another account's sign-in on that phone, the old account's pushes (no amount or name, D41) may reach it until the old session ends. Default: accepted; a token-owner index in `AUTH_DB` would close it.

## Global Constraints

- **Packages (§4):** none new; no lockfile change. Q1 to Q3's packages (SDK 58 pins in `bundledNativeModules.json`) sit behind ports with fakes; each adapter "waits on owner Qn" and the plan works without it.
- **Process** (handover §3 and §4): typed stubs first (a screen as an empty `View`), so every Step 2 run fails on assertions against the stubs and records its counts and that reason; GREEN, a mutation check, the gate, a receipt, a local commit with the attribution trailer, an independent review. No cloud resource; device, simulator, Docker, push and real-model checks are recorded **SKIPPED** with the reason. No push, no bare `git stash`, nothing under `vendor/`.
- **Gates** (repo root). Edge: `npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge`, plus `npm run test:edge:db` while it exists, and `npm run typecheck` when a task changes `packages/contracts`. App: `npm run typecheck:app && npm run typecheck:routes -w gogospend-app && npm run test:app && npm run test:unit && npm run test:render -w gogospend-app && npm run export:web -w gogospend-app -- --max-workers 2`, then `node apps/app/scripts/check-export.mjs` once P3-T22 has landed, and `git diff --check`. API: `npm run typecheck && npm run test:api && npm run test:db -w gogospend-api -- import-preview`.
- **Identity and vault work (§6.2, R21):** routes reach only `idFromName(claims.accountId)`, background code `vaultById(env, vaultId)` (1B-T4); no id comes from a body or query. Confirm and dismiss run in `runCommand` inside `call()`'s one block; the slips route's steps are short blocks; model calls, R2, KV, D1, queue sends and fetches happen outside every block.
- **Gates (§4, C12):** every mutating route names its gates, and a paused gate answers 503 before authentication; kill switches stay in KV; `SLIP_IMPORT_ENABLED` and `PUSH_SEND_ENABLED` are vars, off by default.
- **Privacy anti-goals are tests (§2):** every image path (the slips route, the scan engine, the one-slip path, the single-read ref) has a test that no image byte, base64 text, QR payload or slip reference reaches R2, KV, a queue message, a log, the vault outside its draft columns, the phone's diary, PostHog, or AI Gateway's logs (`cf-aig-collect-log: false`). Events carry counts only; push carries no amount (D41); no account or device id enters a prompt.
- **SQL (R57, R16):** unbounded id lists bind as one JSON parameter (`IN (SELECT value FROM json_each(?))`), tested in the vault with more ids than its SQLite takes and on the phone through a recording executor; amounts and revisions leave SQLite as `CAST(... AS TEXT)`; `STRICT` tables; `transactions` only gains columns; migrations named by purpose (`NNNN_slips.sql`, diary migration "next") and numbered by the integrator; `0000` and `0001` never edited.
- **Screens and copy (E2):** behind the `slips` and `statements` areas until P4-T24; lines in `src/wallet/slips/copy.ts` and `src/wallet/statements/copy.ts` as P2-T3's draft tables, read through P4's own `useSlipsCopy()` and `useStatementsCopy()` (`tableT(<table>, useActiveLocale())`, boundaries section 4), which P2-T38's rename of `useDraftCopy` cannot reach before P4-T24; a line P2 holds comes through `useDraftCopy(table)` until P2-T38 renames it, then `useWalletCopy()`. Board lines verbatim, Thai first; each task names the lines it drops and its Thai drafts; every English line is an E2 draft; catalog lines through `tc()`. A line with no Thai letter joins P2-T3's `LATIN_LINES`: `slips.repeatTimes` (P4-T19), `statements.formatCsv` and `statements.formatExcel` (P4-T22). No emojis or dashes; §5.1's voice; Thai dates through P2's helpers.
- **P2's screen rules:** `mountWallet` tests in light and dark, `th` and `en`; 44 pt controls; 4.5:1 and 3:1 contrast; AX5 uncut; amounts only through `WalletAmount` (D41); Modal surfaces read `useLockCover()`; P2's reduced-motion table.
- **Analytics and logs (R23 to R25):** 1D-T1's emitters, once per action, from the rule that performs it; tests use `recordAnalytics()` and assert no amount, payee or wallet name is sent. The vault clock once per call; Bangkok's date for money and quotas; epoch milliseconds for due times, leases and device times. `logFailure(name, error)` with `failureName` only, never a body, image, hash, token, payee or amount.
- **Contracts (C5):** P4 adds new DTOs and one synced entity (older builds skip unknown entities); no existing DTO gains a field, so no client version bump.

## Review Focus

1. **A first backfill reaching before a wallet's start date:** those slips stay unticked with their reason, and the rest of the batch saves (P4-T16a, P4-T7, P4-T20).
2. **A slip the person received** (a salary or a refund): once its receiving account is mapped it is income into that wallet, paid by the sender, never money out (P4-T6, P4-T16a).
3. **A batch resent after a lost answer or a dropped connection, or sent while another reader holds the lease** (two phones, or P6A's share extension): finished reads are kept, the second waits and sends again, and nothing is read or charged twice (P4-T6, P4-T14).
4. **The app closes or loses signal mid-scan or mid-pick:** the next open sends the pending slips, albums connected or not, none lost or doubled (P4-T14, P4-T15).
5. **A phone signed out online, then into another account with the same push token:** the old account's pushes never reach it (P4-T5); an offline sign-out is Q18.

---

## File structure

Each task's Files list is the authority. Lanes: server P4-T1 to P4-T11 (`packages/contracts/src/v1/`, `apps/edge/src/{catalog,vault/slips,vault/push,push,v1/slips}/`, `apps/api/src/imports/parsers/bank.ts`); phone P4-T12 to P4-T17 with P4-T16a and P4-T16b (`apps/app/src/slips/`); screens P4-T18 to P4-T22 (`src/wallet/slips/`, `src/wallet/statements/`, `src/dev/catalogue/slips/`, and `app/spend/slips/`, P4-T12's ten redirect routes); the proof and routing, P4-T23 and P4-T24.

**E2 checkpoint (a controller step after P4-T18 to P4-T22),** by P2's method with `EXPO_PUBLIC_REDESIGN=catalogue,wallet,slips,statements`: every section of `SLIP_SECTIONS` and `STATEMENT_SECTIONS` in light and dark Thai and light English, `sl-review`, `sl-wallet-map` and the inbox card also at AX5; with them every draft line, the push texts (`pushMessage` per kind and language), the bank names and S1 to S19. The owner's words go in the receipt; P4-T24 waits for them.

---
### Task P4-T1: Slip and push contracts, and the shared slip reference

**Starts after:** base

**Files:**
- Create: `packages/contracts/src/v1/slips.ts`, `packages/contracts/src/v1/push.ts`
- Modify: `packages/contracts/src/v1/sync.ts` (`SYNC_ENTITY_VALIDATORS` gains `slip_inbox: isSlipInboxSnapshot`), `packages/contracts/src/index.ts`
- Test: `apps/edge/test/slip-contracts.test.ts` (Node; the contracts package has no runner of its own)

**Interfaces:**
- Consumes (base contracts): `Minor`, `isUuid`, `assertKnownFields`, `ContractValidationError`, `parseAiDate`, `parseAiLocale`, `AiLocale`, `AI_DAILY_LIMITS`, `AI_SLIP_MAX_BYTES`, `AI_SLIP_MEDIA_TYPES`, `AiSlipMediaType`, `AI_DRAFT_FLAGS`, `AiDraftFlag`, `isEntityChange`.
- Produces, in `slips.ts` (each list constant also exports its union type):
  ```ts
  export const THAI_BANK_KEYS = ['bbl', 'kbank', 'ktb', 'ttb', 'scb', 'bay', 'gsb', 'ghb', 'baac', 'kkp', 'cimb', 'uob', 'lhb', 'tisco', 'icbc', 'tcrb', 'ibank', 'other'] as const   // ThaiBankKey
  export const SLIP_PURPOSES = ['live', 'backfill'] as const                                       // SlipPurpose
  export const SLIP_OUTCOMES = ['read', 'duplicate', 'unreadable', 'over_quota', 'paused'] as const // SlipOutcome
  export const SLIP_ORIGINS = ['album', 'share', 'photo'] as const   // SlipOrigin: how a slip arrived (A1); 'photo' is reserved for a later plan
  export type SlipReadModel = 'claude-haiku-5-5' | 'claude-opus-5-5'
  export const SLIP_LIMITS = { batchSlips: 5, batchBytes: 8_388_608, imageBytes: AI_SLIP_MAX_BYTES, isolateBatches: 3, leaseMs: 90_000, readsAtOnce: 2,
    startDeadlineMs: 25_000, serverDeadlineMs: 80_000, clientTimeoutMs: 90_000, liveDaily: AI_DAILY_LIMITS.slip, backfillUses: 500, backfillDays: 30,
    connectDaysBack: 90, draftDays: 30, confirmBatch: 50, maxEdgePx: 1600, jpegQuality: 0.7 } as const
  export const SLIP_INBOX_ID = '5b1f0c2a-6d3e-4f70-8a19-2c4d6e8f0a1b'   // one per vault (S1)
  export type SlipInboxSnapshot = { id: string; version: number; open: number }
  export type SlipBatchItem = { ref_hash: string; image_base64: string; media_type: AiSlipMediaType; album: string | null; origin: SlipOrigin }
  export type SlipBatchRequest = { purpose: SlipPurpose; last: boolean; today: string; locale: AiLocale; slips: SlipBatchItem[] }
  export type SlipParty = { bank: ThaiBankKey | null; account_last4: string | null; name: string | null }   // one side of a slip as printed
  export type SlipDraftDto = { id: string; amount_minor: Minor | null; occurred_on: string | null; occurred_time: string | null;
    direction: 'out' | 'in';   // the vault's reading when written: 'out' when the person is `from` (S2)
    from: SlipParty; to: SlipParty; category_id: string | null; category_guessed: boolean; flags: AiDraftFlag[];
    album: string | null; origin: SlipOrigin; model: SlipReadModel; escalated: boolean; created_at: string; expires_at: string; duplicate_of: string | null }
  export type SlipResult = { ref_hash: string; outcome: SlipOutcome; draft: SlipDraftDto | null }
  export type SlipBatchResult = { results: SlipResult[]; uses_left: { live: number; backfill: number }; retry_after_seconds: number | null }
  export type SlipDraftsPage = { drafts: SlipDraftDto[]; total: number; next_cursor: string | null }
  export type SlipConfirmRequest = { drafts: { draft_id: string; transaction: Record<string, unknown> }[] }
  export type SlipAccountDto = { id: string; version: number; bank: ThaiBankKey; account_last4: string; wallet_id: string | null; open_drafts: number }
  export type SlipRefRequest = { ref_hash: string; transaction_id: string }
  export type SlipSaltDto = { salt: string }   // base64url without padding, 32 bytes
  export type BankAlbumDto = { bank: ThaiBankKey; platform: 'ios' | 'android'; album_name: string }
  export const SLIP_REF_HASH_LABEL = 'jotbun-slip-ref-v1'
  // validators (exact keys, as the existing contracts check them): isThaiBankKey, isSlipInboxSnapshot, isSlipBatchResult, isSlipDraftsPage,
  //   isSlipAccountDto, isSlipAccountsDto ({ accounts }), isSlipSaltDto, isBankAlbumsDto ({ albums })
  // parsers (ContractValidationError naming the field): parseSlipBatchRequest, parseSlipConfirmRequest, parseSlipAccountUpdate ({ wallet_id: string | null }), parseSlipRefRequest
  export function normalizeSlipRef(bankCode: string, reference: string): string | null
  export function slipRefHash(salt: Uint8Array, normalized: string, sha256: (data: Uint8Array) => Promise<Uint8Array>): Promise<string>
  export function isSlipRefHash(value: unknown): value is string   // /^[0-9a-f]{64}$/
  export function accountLast4(text: string | null | undefined): string | null
  ```
- Produces, in `push.ts`:
  ```ts
  export const PUSH_KINDS = ['slips_ready', 'statement_parsed', 'export_ready', 'month_recap_ready'] as const   // PushKind
  export type PushData = { kind: PushKind; ref: string | null }   // an export id, an import job id or a month; never content
  export function isPushData(value: unknown): value is PushData
  export type DeviceRegistration = { push_token: string | null; platform: 'ios' | 'android'; language: 'th' | 'en'; slip_notices: boolean }
  export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/
  export function parseDeviceRegistration(body: unknown): DeviceRegistration
  ```
- Rules (A25: only the phone normalises and hashes; the Worker and the vault see salted hashes, checked for shape):
  - `normalizeSlipRef`: the bank code is 1 to 3 ASCII digits, zero-padded to 3; the reference is NFC with every whitespace removed, upper-cased, 1 to 64 printable ASCII characters; else null. The result is `<bank>:<REFERENCE>`.
  - `slipRefHash`: lowercase hex SHA-256 of `salt || UTF-8(SLIP_REF_HASH_LABEL) || 0x00 || UTF-8(normalized)`; a salt that is not 32 bytes throws `RangeError` (§6.8 step 4).
  - `parseSlipBatchRequest`: exactly `purpose`, `last`, `today`, `locale`, `slips`; each slip exactly `ref_hash`, `image_base64` (base64 without line breaks), `media_type`, `album` (null, or 1 to 60 code points after NFC and trim) and `origin` (`album` only in a `backfill` batch, `share` or `photo` only in a `live` one, A1); errors name `slips[i].<field>`.
  - `parseSlipConfirmRequest`: `draft_id` and each `transaction.id` are UUIDs; each `transaction` is an object whose shape the vault checks as `transactions.create` does. `isSlipInboxSnapshot` also requires `id === SLIP_INBOX_ID` and an integer `open` from 0 to 100,000.

- [ ] **Step 1: Stub, then write the failing tests** (stubs: validators false, parsers throwing `VALIDATION_FAILED`, the helpers null or `''`). In `slip-contracts.test.ts`:
  - `a slip reference normalizes its bank code and reference, and refuses what cannot be one`: `normalizeSlipRef('4', ' 016297184012bpp06418 ')` is `'004:016297184012BPP06418'`; `('004', '')`, `('0041', 'A')`, `('kb', 'A')` and `('004', 'ก1')` are null.
  - `the salted hash is SHA-256 of the salt, the label, a zero byte and the reference`: with `salt` the bytes 1 to 32 and `n = '004:016297184012BPP06418'`, `slipRefHash(salt, n, webCryptoSha256)` equals `node:crypto`'s `createHash('sha256').update(salt).update('jotbun-slip-ref-v1').update(Buffer.from([0])).update(n).digest('hex')`; a 31-byte salt rejects with `RangeError`.
  - `the last four digits come from a masked account or phone as printed`: `'xxx-x-x1234-x'` gives `'1234'`, `'XXX-XXX-5678'` `'5678'`, `'๑๒๓๔'` `'1234'`; `'xxx-12'` and `null` give null.
  - `a slip batch takes 1 to 5 slips with distinct hashes and images within 1,200,000 bytes, and nothing else`: 6 slips is 422 on `slips`; a repeated hash 422 on `slips[1].ref_hash`; 1,200,001 decoded bytes `UPLOAD_TOO_LARGE` on `slips[0].image_base64`; `image/heic` `UPLOAD_UNSUPPORTED_TYPE`; an `album` slip in a `live` batch 422 on `slips[0].origin`; an unknown key `UNKNOWN_FIELD`.
  - `a confirm takes 1 to 50 drafts with distinct draft and record ids`: 51 drafts is 422 on `drafts`; a repeated `draft_id` 422 on `drafts[1].draft_id`; a repeated record id 422 on `drafts[1].transaction.id`.
  - `the inbox snapshot is exactly its id, version and open count, and an older reader skips it`: `isEntityChange` is true with the default validators, and true with `slip_inbox` removed under `{ unknownEntities: 'skip' }`; an extra key or another id is false.
  - `device registrations take an Expo push token or null, and nothing else`: `ExponentPushToken[abc]` and null pass; `'abc'` is 422 on `push_token`; an unknown key `UNKNOWN_FIELD`.
  - `every DTO validator refuses an extra key and a missing one` (table-driven over the `is*` functions).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/slip-contracts.test.ts`.
- [ ] **Step 3: Implement** both modules as the rules say and export them.
- [ ] **Step 4: Run them and see them pass,** then `npm run typecheck && npm run typecheck:edge && npm run typecheck:app`.
- [ ] **Step 5: Mutation check.** Drop the zero byte: the vector case fails. Let a repeated hash, or an `album` slip in a `live` batch, through: the batch case fails. Accept an extra key: the validator case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the slip, draft, push and device contracts and the shared salted slip reference"`

---

### Task P4-T2: The catalog database: bank albums, merchant patterns and the bank-album route

**Starts after:** P4-T1, 1B-T13, 1C-T1, 1D-T10

**Delivers:** P4:catalog-db

A29: §6.3's `category_packs` is not built (P2's code pack holds pack definitions). A30: merchants are read from D1 with a one-hour per-isolate cache in place of §6.3's KV snapshot. A20: if P6C-T1 has landed, `CATALOG_DB` also goes into `env.staging` and `env.production` in this commit.

**Files:**
- Create: `apps/edge/migrations/catalog/NNNN_catalog.sql`, `NNNN_catalog_seed.sql` (the integrator numbers them, first in the folder), `apps/edge/src/catalog/catalog.ts`, `apps/edge/test/workers/support/apply-catalog-migrations.ts`
- Modify: `wrangler.jsonc` (`d1_databases` += `{ "binding": "CATALOG_DB", "database_name": "jotbun-catalog", "database_id": "00000000-0000-0000-0000-000000000002", "migrations_dir": "migrations/catalog" }`, a local placeholder id, commented that the owner creates it with the `apac` hint, D33), `vitest.workers.config.ts` (`readD1Migrations('./migrations/catalog')` into `TEST_CATALOG_MIGRATIONS`, `miniflare.d1Databases` += `'CATALOG_DB'`, the setup file), `src/v1/env.ts` (`CATALOG_DB?: D1Database`), `src/v1/protocol.ts` (`WorkerRouteId` += `'catalog.bankAlbums'`), `src/v1/routes.ts`, `src/v1/worker-routes.ts`, `test/c1-shape.test.ts`, `test/route-coverage.test.ts`
- Test: `apps/edge/test/workers/catalog.test.ts`

**Interfaces:**
- Consumes: 1B-T3's public Worker routes; 1C-T1's D1 test pattern (`readD1Migrations` from `@cloudflare/vitest-plugin`, `applyD1Migrations` from `cloudflare:test`, both in 1.4.7's types); `VAULT_ADDED_ROUTES` (1D-T10); `isThaiBankKey`, `BankAlbumDto` (P4-T1).
- Produces:
  ```sql
  CREATE TABLE bank_albums (bank TEXT NOT NULL CHECK (bank GLOB '[a-z]*' AND length(bank) BETWEEN 2 AND 16), platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    album_name TEXT NOT NULL CHECK (length(album_name) BETWEEN 1 AND 60), PRIMARY KEY (bank, platform, album_name)) STRICT;
  CREATE TABLE merchants (pattern TEXT PRIMARY KEY CHECK (length(pattern) BETWEEN 2 AND 60 AND pattern = lower(trim(pattern))),
    category_key TEXT NOT NULL CHECK (length(category_key) BETWEEN 2 AND 32), gogocash_eligible INTEGER NOT NULL DEFAULT 0 CHECK (gogocash_eligible IN (0, 1))) STRICT;
  ```
  The seed (default pending owner Q8, a draft): `bank_albums` `K PLUS` (`kbank`), `SCB EASY` (`scb`) and `Krungthai NEXT` (`ktb`), each on `ios` and `android`; `merchants` `7-eleven` and `เซเว่น` (`food`, as sl-review guesses 7-Eleven), `bts` and `mrt` (`travel`), `lotus's`, `big c` and `makro` (`shopping`).
  ```ts
  export type MerchantPattern = { pattern: string; category_key: string }
  export const MERCHANTS_TTL_MS = 3_600_000
  export function merchantPatterns(env: { CATALOG_DB?: D1Database }, nowMs?: number): Promise<MerchantPattern[]>
  export function merchantKey(text: string): string
  export function matchMerchant(name: string | null, patterns: readonly MerchantPattern[]): string | null
  export const handleBankAlbums: WorkerHandler   // 'catalog.bankAlbums'
  ```
- The route `{ method: 'GET', path: '/v1/catalog/bank-albums', access: 'public', worker: 'catalog.bankAlbums' }` joins `VAULT_ADDED_ROUTES`. It answers `{ albums }` ordered by bank, platform and name (unknown banks left out) with `etag: "<hex SHA-256 of the body>"`; a matching `if-none-match` is 304 with no body; without `CATALOG_DB`, 503 `SERVICE_UNAVAILABLE`, retry 30.
- `merchantPatterns` reads the table once per isolate per hour, `[]` without the binding; a failed read logs `catalog_merchants_failed` and keeps the last list. `merchantKey` is NFC, ASCII lower case, runs of characters other than letters and marks (`\p{L}\p{M}`, so Thai vowels and tone marks stay), digits, `-`, `.` and `'` made one space, trimmed; the seed stores each `merchants.pattern` as its `merchantKey`. `matchMerchant` compares `merchantKey`s and answers the key of the longest matching pattern: a pattern with a Thai character matches as a substring (Thai has no spaces between words); any other matches whole words.

- [ ] **Step 1: Stub, then write the failing tests** (empty migrations, a 501 handler, `[]` and null). In `catalog.test.ts`:
  - `the catalog migrations make bank_albums and merchants, and the seed lists the boards' three bank apps on both platforms` (each table exists; the list is not pinned, since P5-T6 adds `fx_rates`).
  - `the bank-album list is public, carries an ETag, and answers 304 to the same tag`: no token or client header, 200 with the six rows in order and `etag` matching `/^"[0-9a-f]{64}"$/`; the same with `if-none-match` is 304 with an empty body.
  - `an album row of an unknown bank is left out`; `without CATALOG_DB the route is 503 and merchant patterns are empty`.
  - `merchant patterns are read once an hour per isolate` (reads at `t` and `t + 3_599_999` make one query, `t + 3_600_000` a second).
  - `matchMerchant takes the longest whole-word Latin pattern or a Thai substring, ignoring case and spacing`: `'7-ELEVEN สาขา 01234'` and `'ร้านเซเว่นอีเลฟเว่น'` give `food`; `'BTS SKYTRAIN'` `travel`; `'Big  C Extra'` `shopping`; `'Makrobiotic'` and null give null; `merchantKey('ร้านเซเว่น')` keeps every vowel and tone mark.
  - Coverage and shape: the added route; `CATALOG_DB` among the D1 bindings.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/catalog.test.ts` and `npm run test:edge -- test/route-coverage.test.ts test/c1-shape.test.ts`.
- [ ] **Step 3: Implement** the migrations, seed, reader, matcher, handler, bindings and test setup, as 1C-T1 sets up `AUTH_DB`.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Drop the 304: the ETag case fails. Query on every read: the hourly case fails. Match Latin patterns as substrings: `Makrobiotic` matches. Keep unknown banks: that case fails. Treat marks as separators: the tone-mark case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the catalog database and the bank-album route"`

---
### Task P4-T3: The vault's slip tables, the salt, slip accounts and the inbox count

**Starts after:** P4-T1, 1A-T5, 1B-T2, 1B-T13, 1D-T10

A20: if P6C-T1 has landed, the `SLIP_IMPORT_ENABLED` var also goes into `env.staging` and `env.production` in this commit.

**Files:**
- Create: `apps/edge/src/vault/migrations/NNNN_slips.sql` (numbered after `0001` by the integrator), `src/vault/slips/salt.ts`, `accounts.ts`, `inbox.ts`, `apps/edge/test/workers/support/slips.ts`
- Modify: `src/vault/migrations/index.ts`, `src/vault/schema.ts`, `test/workers/vault-schema.test.ts`, `src/vault/commands/registry.ts` (entity `slip_inbox`, after the import entities), `src/v1/protocol.ts` (`VaultRouteId` += `'slips.salt' | 'slipAccounts.list' | 'slipAccounts.update'`), `src/v1/routes.ts` (`VaultRoute.release?: 'SLIP_IMPORT_ENABLED'`, three routes), `src/v1/handler.ts` (the release check), `src/v1/env.ts` (`SLIP_IMPORT_ENABLED?: string`), `wrangler.jsonc` (var `"SLIP_IMPORT_ENABLED": "false"`), `src/vault/routes.ts`, `test/route-coverage.test.ts`
- Test: `apps/edge/test/workers/slips-vault.test.ts`

**Interfaces:**
- Consumes: `VaultContext`, `appendChanges`, `defineEntity` (1A-T3); `wallets` (1A); `transactions` (1A-T5); 1B-T2's journal and `UserVault#erase`; `VAULT_ADDED_ROUTES` (1D-T10); `flag` (`src/server/env.ts`); P4-T1's names.
- Produces (statements separated by `--> statement-breakpoint`; `transactions` grows by `ADD COLUMN` only):
  ```sql
  CREATE TABLE slip_salt (id INTEGER PRIMARY KEY CHECK (id = 1), salt BLOB NOT NULL CHECK (length(salt) = 32), created_at TEXT NOT NULL) STRICT;
  CREATE TABLE slip_accounts (id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    bank TEXT NOT NULL CHECK (bank GLOB '[a-z]*' AND length(bank) BETWEEN 2 AND 16),
    account_last4 TEXT NOT NULL CHECK (length(account_last4) = 4 AND account_last4 NOT GLOB '*[^0-9]*'),
    wallet_id TEXT REFERENCES wallets (id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (bank, account_last4)) STRICT;
  CREATE TABLE slip_refs (id TEXT PRIMARY KEY, ref_hash TEXT NOT NULL UNIQUE CHECK (length(ref_hash) = 64 AND ref_hash NOT GLOB '*[^0-9a-f]*'),
    state TEXT NOT NULL CHECK (state IN ('draft', 'confirmed', 'dismissed', 'expired', 'recorded')), transaction_id TEXT,
    first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK ((state IN ('confirmed', 'recorded')) = (transaction_id IS NOT NULL))) STRICT;
  CREATE TABLE slip_drafts (id TEXT PRIMARY KEY, ref_id TEXT NOT NULL UNIQUE REFERENCES slip_refs (id),
    amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor BETWEEN 1 AND 99999999999),
    occurred_on TEXT CHECK (occurred_on IS NULL OR date(occurred_on) IS occurred_on),
    occurred_time TEXT CHECK (occurred_time IS NULL OR (length(occurred_time) = 5 AND occurred_time GLOB '[0-2][0-9]:[0-5][0-9]')),
    direction TEXT NOT NULL CHECK (direction IN ('out', 'in')),
    from_bank TEXT CHECK (from_bank IS NULL OR (from_bank GLOB '[a-z]*' AND length(from_bank) BETWEEN 2 AND 16)),
    from_last4 TEXT CHECK (from_last4 IS NULL OR (length(from_last4) = 4 AND from_last4 NOT GLOB '*[^0-9]*')),
    from_name TEXT CHECK (from_name IS NULL OR length(from_name) BETWEEN 1 AND 120),
    to_bank TEXT CHECK (to_bank IS NULL OR (to_bank GLOB '[a-z]*' AND length(to_bank) BETWEEN 2 AND 16)),
    to_last4 TEXT CHECK (to_last4 IS NULL OR (length(to_last4) = 4 AND to_last4 NOT GLOB '*[^0-9]*')),
    to_name TEXT CHECK (to_name IS NULL OR length(to_name) BETWEEN 1 AND 120), category_id TEXT REFERENCES categories (id),
    category_guessed INTEGER NOT NULL DEFAULT 0 CHECK (category_guessed IN (0, 1)),
    flags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(flags) AND json_type(flags) = 'array'),
    album TEXT CHECK (album IS NULL OR length(album) BETWEEN 1 AND 60), origin TEXT NOT NULL CHECK (origin IN ('album', 'share', 'photo')),
    model TEXT NOT NULL CHECK (model IN ('claude-haiku-5-5', 'claude-opus-5-5')),
    escalated INTEGER NOT NULL CHECK (escalated IN (0, 1)), announced INTEGER NOT NULL DEFAULT 0 CHECK (announced IN (0, 1)),
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL) STRICT;
  CREATE INDEX slip_drafts_order_idx ON slip_drafts (occurred_on, occurred_time, id);
  CREATE TABLE slip_leases (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL CHECK (expires_at >= 0), purpose TEXT NOT NULL CHECK (purpose IN ('live', 'backfill')),
    day TEXT NOT NULL CHECK (date(day) IS day), reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0)) STRICT;
  CREATE TABLE slip_backfill_uses (day TEXT PRIMARY KEY CHECK (date(day) IS day), uses INTEGER NOT NULL CHECK (uses BETWEEN 0 AND 500)) STRICT;
  ALTER TABLE transactions ADD COLUMN slip_ref_id TEXT REFERENCES slip_refs (id);
  CREATE INDEX transactions_merchant_idx ON transactions (lower(merchant)) WHERE deleted_at IS NULL AND merchant IS NOT NULL;
  ```
  ```ts
  export function slipSalt(c: VaultContext): SlipSaltDto   // made on the first read with crypto.getRandomValues (S16)
  export function ensureSlipAccount(c: VaultContext, bank: ThaiBankKey, last4: string): string
  export function slipAccountFor(c: VaultContext, bank: ThaiBankKey | null, last4: string | null): { id: string; wallet_id: string | null } | null
  export function listSlipAccounts(c: VaultContext): { accounts: SlipAccountDto[] }   // most open drafts (on either side) first, then bank, then last4
  export function updateSlipAccount(c: VaultContext, call: VaultCall): SlipAccountDto
  export function openDraftCount(c: { sql: SqlStorage }): number
  export function inboxChange(c: { sql: SqlStorage }): EntityChange   // reads entity_heads itself: slip_inbox at head version + 1 (1 without a head), state active, snapshot { id, version, open }
  export type SlipDraftRow = typeof slipDrafts.$inferSelect
  export function slipDraftDto(row: SlipDraftRow, duplicateOf: string | null): SlipDraftDto   // the one mapper P4-T6 and P4-T7 use
  export function slipDuplicateOf(c: { sql: SqlStorage }, amountMinor: Minor | null, occurredOn: string | null): string | null
  // test support
  export function seedSlipDraft(user: TestUser, fields?: Partial<{ amount_minor: string; occurred_on: string; occurred_time: string; direction: 'out' | 'in'; from: SlipParty; to: SlipParty; category_id: string; origin: SlipOrigin; created_at: string; expires_at: string }>): Promise<{ draftId: string; refHash: string }>
  ```
- `slipDuplicateOf`: `SELECT id FROM transactions WHERE deleted_at IS NULL AND amount_minor = CAST(?1 AS INTEGER) AND occurred_on = ?2 ORDER BY created_at LIMIT 1`; null without an amount or date.
- Routes (each in `VAULT_ADDED_ROUTES`): `GET /v1/slips/salt` (`bound_session`, `slips.salt`, without `release`: a single read's slip ref needs it before slip import is out, S13); `GET /v1/slip-accounts` (`bound_session`, `slipAccounts.list`) and `PUT /v1/slip-accounts/:id` (`current_policy`, `slipAccounts.update`, gates `['imports']`, status 200), both with `release: 'SLIP_IMPORT_ENABLED'`.
- **The release check** (S13): `handleVaultV1` answers a route with `release` 404 `NOT_FOUND` right after matching it, before the body, gates and token, unless `flag(env[route.release])`, as the API's `RELEASE_FLAGS` hide `uploads`.
- `updateSlipAccount` is a plain write (S1): `If-Match` must equal the account's version (stale: 409 `VERSION_CONFLICT` with `current`); `wallet_id` names a live, unarchived wallet (else 422 on `wallet_id`) or is null; an unknown id is 404; the version moves by one.

- [ ] **Step 1: Stub, then write the failing tests** (an empty migration; wrong typed values).
  - `vault-schema.test.ts`: the six slip tables join the list, the migration count grows by one, `transactions` has `slip_ref_id`.
  - `slips-vault.test.ts` (`SLIP_IMPORT_ENABLED: 'true'`): `the salt is 32 random bytes made on the first read, the same ever after, and another person's differs` (again after `evictAllDurableObjects()`); `the salt answers while slip import is unreleased, and the other slip routes are 404` (without the var the salt still answers its session, and the account routes are 404 with no token at all); `a slip account is made once per bank and last four digits`; `the slip accounts list shows each account with its open drafts` (three on `kbank 1234`, one on `scb 9876`, in that order); `mapping an account needs its version and a live wallet, and null unmaps` (If-Match 1 gives version 2; If-Match 1 again 409 with `current`; an archived wallet 422; an unknown id 404); `the inbox change carries the open count, and its version only moves forward` (`{ open: 2 }` at version 1, then version 2 after a third draft); `erasing the vault leaves no salt, slip reference, slip account or draft (C7)`; `the Worker's WebCrypto gives the contract's hash vector`.
  - Coverage: the three added routes, and `release` names a var.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/vault-schema.test.ts test/workers/slips-vault.test.ts` and `npm run test:edge -- test/route-coverage.test.ts`.
- [ ] **Step 3: Implement** the migration and journal entry, the Drizzle tables (keys `notNull()`), the functions, routes, release check and entity.
- [ ] **Step 4: Run them and see them pass,** with every earlier Workers suite unchanged.
- [ ] **Step 5: Mutation check.** A new salt per read: the salt case fails. Put the salt behind the release: the unreleased case fails. Drop `UNIQUE (bank, account_last4)` and insert blindly: the once case fails. Accept a stale version: the 409 case fails. Count every draft for every account: the list case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the vault's slip tables, the slip salt, slip accounts and the slip inbox count"`

---

### Task P4-T4: The reader's import mode: the slip's time and both sides

**Starts after:** P3-T8 (P3:slip-read), P4-T1

A26: P4 extends P3's reader additively, in this task.

**Files:**
- Create: `apps/edge/src/v1/ai/slip-import.ts` (the import schema, prompt, sanitizer and re-read rule)
- Modify: P3-T8's `apps/edge/src/v1/ai/slip-read.ts` (additively: an `options` parameter, `SlipRead.import`, `SlipNotRead.retryAfterSeconds`), `apps/edge/src/server/ai/prompts.ts` (`VOICE` exported, its text unchanged)
- Test: `apps/edge/test/slip-read-import.test.ts` (Node, with P3-T4's fake transport and its `apiFailure(status, headers?)`)

**Interfaces:**
- Consumes (P3's plan Interfaces are the authority, A16): `readSlipImage(input: { image: SlipImage; context: DraftContext; locale }, deps: { transport, trace, deadline })`, `SlipRead`, `SlipNotRead`, `HaikuOutcome` and H6's re-read (P3-T8); `haikuRequest`, `opusRequest`, `HAIKU_SLIP_CAP_MS` (P3-T6); `tracedSend`, `callFailure`, `newTrace`, `AiDeadline`, `RecordedCall.retryAfterSeconds` and `anthropicTransport`, whose SDK client has `maxRetries: 0`, so a 429 reaches the trace with its wait (P3-T4); base `bahtToSatang` (`apps/edge/src/server/ai/drafts.ts`) and `VOICE` (`prompts.ts`, exported here); `SlipParty`, `THAI_BANK_KEYS`, `isThaiBankKey`, `accountLast4`, `AI_DRAFT_FLAGS` (P4-T1).
- Produces:
  ```ts
  export type SlipImportRead = { amount_minor: Minor | null; occurred_on: string | null; occurred_time: string | null; from: SlipParty; to: SlipParty; flags: AiDraftFlag[] }
  export const SLIP_IMPORT_REQUIRED = ['amount_minor', 'occurred_on', 'from.bank', 'to.name'] as const   // missing: one Opus re-read (D25, S4)
  export function sanitizeSlipImportRead(raw: unknown, today: string): SlipImportRead | null
  export function missingImportFields(read: SlipImportRead): string[]   // the SLIP_IMPORT_REQUIRED paths that are null
  // slip-read.ts, additively: readSlipImage(input, deps, options?: { fields?: 'single' | 'import' }); SlipRead gains
  //   import?: SlipImportRead (set only in import mode, so a single read has no such key); SlipNotRead gains readonly retryAfterSeconds: number | null
  //   (a second constructor parameter, default null: the failed call's RecordedCall.retryAfterSeconds)
  ```
- Import mode: P3-T8's flow with the import read in place of drafts. A failed Haiku throws `SlipNotRead`; Opus re-reads on a decline, an unusable answer, an `unreadable` or `receipt` answer (the phone sends only QR-checked bank slips, D25), or a `slip` read with `missingImportFields`; Opus's `slip` read wins, else Haiku's, else `unreadable` when Opus answered, else `SlipNotRead`. `drafts` is `[]`, `bank` is `from.bank`, and `declined` and `tokens` count as P3 counts them. The caller passes `context: { today, wallets: [], categories: [] }`; nothing of it is sent.
- `SLIP_IMPORT_SCHEMA`: strict JSON schema, `additionalProperties: false` throughout: `kind` (`slip`, `receipt`, `unreadable`); `amount_baht`, `date`, `time` (string or null); `from` and `to`, each `{ bank: one of THAI_BANK_KEYS or null, account_last4: string or null, name: string or null }`; `flags` (`AI_DRAFT_FLAGS`).
- `SLIP_IMPORT_SYSTEM`: P3's `VOICE`, then: "Task: read one image the person chose, usually a Thai bank transfer or payment slip. kind is 'slip' for a bank transfer or payment slip, 'receipt' for a shop receipt and 'unreadable' otherwise. amount_baht: the amount transferred exactly as printed, digits with at most 2 decimals; never guess a blurred amount: use null and amount_unclear. date: YYYY-MM-DD; Thai slips print Buddhist-era years (2569 is 2026) and Thai month abbreviations. time: HH:MM in 24 hours as printed, or null. from is the sender and to is the receiver. bank: the key from the list for the bank whose name, logo text or app is printed (K PLUS is kbank, SCB EASY is scb, Krungthai NEXT is ktb); other for a bank not in the list; null when none is shown. account_last4: only the last four digits of the account or phone number as printed. name: the display name as printed. Never copy reference numbers, QR contents, or more than four digits of any account or phone number." The user turn is the image and the JSON `{ "today", "locale" }` only.
- `sanitizeSlipImportRead`: null unless `kind` is `slip`; amounts through `bahtToSatang` (1 to 99,999,999,999 satang, else null and `amount_unclear`); a date outside 1970-01-01 to today plus one day becomes null and `date_guessed`; time matches `/^([01][0-9]|2[0-3]):[0-5][0-9]$/`; banks must be keys; `account_last4` through `accountLast4`; a name is NFC and trimmed, 1 to 120 code points, dropped when it holds seven or more digits in a row; unknown flags dropped.

- [ ] **Step 1: Stub, then write the failing tests** (`options` ignored, the sanitizer null), with P3-T4's recording fake transport, a `newTrace()` and an `AiDeadline(45_000)`:
  - `the import mode asks for the time and both sides, and sends only today and the locale`: the request's schema is `SLIP_IMPORT_SCHEMA`, its system prompt `SLIP_IMPORT_SYSTEM`, the user text parses to exactly `{ today: '2026-10-25', locale: 'th' }`, and the request's JSON holds no wallet or category name of the fixture and no account, session, vault or device id.
  - `a slip read in import mode fills import with exact satang and clean sides`: `'1250.50'` gives `'125050'`; `'2026-10-24'`, `'18:40'`; `from` `{ bank: 'kbank', account_last4: '1234', name: 'นาย กานต์ ใจดี' }`, `to` `{ bank: 'scb', account_last4: '9876', name: 'ร้านป้าแดง ข้าวแกง' }`.
  - `an account number longer than four digits keeps only its last four, and a name holding seven digits in a row is dropped` (`'012-3-45678-9'` gives `'6789'`; `'โอนเข้า 0812345678'` gives null).
  - `a bank outside the list becomes null, and an impossible time null`.
  - `a missing sender bank or receiver name re-reads the slip with Opus once` (the second call names `claude-opus-5-5`; `escalated: true`).
  - `an outage on Haiku throws SlipNotRead with the wait it was given, and calls no Opus` (`apiFailure(429, { 'retry-after': '40' })`: failure `rate_limited`, `retryAfterSeconds` 40); `Opus failing after Haiku's import read keeps Haiku's read` (A14).
  - `with the real transport a 429 is not retried, and its retry-after reaches SlipNotRead` (`anthropicTransport` over a recording `fetch` answering 429 with `retry-after: 40`: one `fetch`, `retryAfterSeconds` 40, within 1 s).
  - `a slip Haiku calls unreadable is re-read once by Opus, and Opus's read is the draft` (also for `receipt`); `a slip both models call unreadable has no import read`; `the single mode is unchanged` (its `SlipRead` has no `import` key; P3's `slip-read.test.ts` passes untouched).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge -- test/slip-read-import.test.ts`.
- [ ] **Step 3: Implement** the schema, prompt, option, sanitizer, re-read rule and the retry-after reading.
- [ ] **Step 4: Run them and see them pass,** then P3's suites unchanged: `npm run test:edge:workers -- test/workers/slip-read.test.ts test/workers/ai-uses.test.ts`, and `test/workers/ai-analytics.test.ts` once P3-T10 has landed.
- [ ] **Step 5: Mutation check.** Send the wallet list: the first case fails. Keep five digits: the cut case fails. Skip the re-read on a missing name: the D25 case fails. Skip the re-read of an `unreadable` answer: the unreadable case fails. Leave `retryAfterSeconds` null: the outage case fails. Give a single read `import: null`: the single-mode case fails.
- [ ] **Step 6: Gate, receipt, commit.** The receipt notes that `SLIP_IMPORT_SYSTEM` and `SLIP_IMPORT_SCHEMA` are locked only after P4-T23 Step 3's run (D25), as P3-T8's slip prompt is after P3-T22's. `git commit -m "Give the slip reader an import mode for both sides and the time"`

---
### Task P4-T5: Push: devices, the push queue, the Expo port and the consumer

**Starts after:** P4-T1, P4-T3, 1A-T5, 1B-T5, 1B-T6, 1B-T13, 1C-T10a, 1D-T10

**Delivers:** P4:push

A20: if P6C-T1 has landed, the `PUSH_QUEUE` producer, the `jotbun-push` consumer and the `PUSH_SEND_ENABLED` var also go into `env.staging` and `env.production` in this commit.

**Files:**
- Create: `apps/edge/src/vault/migrations/NNNN_devices.sql`, `src/vault/push/devices.ts`, `targets.ts`, `src/push/port.ts`, `copy.ts`, `consumer.ts`, `sessions.ts`
- Modify: 1C-T10a's `src/vault/account-control.ts`, `src/vault/user-vault.ts` (two RPCs; `VaultEnv` += `PUSH_QUEUE?`), `src/vault/schema.ts`, `migrations/index.ts`, `test/workers/vault-schema.test.ts`, `src/v1/protocol.ts`, `src/v1/routes.ts`, `src/vault/routes.ts`, `src/v1/env.ts` (`PUSH_QUEUE?`, `PUSH_SEND_ENABLED?`, `EXPO_ACCESS_TOKEN?`), `src/vault-worker.ts`, `wrangler.jsonc`, `src/cloudflare-workers.d.ts` (`MessageBatch.queue`), `test/c1-shape.test.ts`, `test/route-coverage.test.ts`, `apps/edge/README.md`
- Test: `apps/edge/test/workers/push.test.ts`

**Interfaces:**
- Consumes: `vaultById`, `FileContext` (1B-T4); the `queue` handler and `handleParseBatch` (1B-T5, 1B-T13); `createMessageBatch`, `getQueueResult`, `createExecutionContext` (`cloudflare:test`); `revokeSessionIds`, `revokeSessions` (1C-T10a); Better Auth's `session` table (1C-T1); `exports` (1B-T6), `import_uploads` and `import_previews` (1B-T5), `slip_drafts` (P4-T3), `transactions` (1A-T5); P4-T1's push names.
- Produces:
  ```sql
  CREATE TABLE devices (session_id TEXT PRIMARY KEY, push_token TEXT NOT NULL CHECK (length(push_token) BETWEEN 1 AND 220),
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')), language TEXT NOT NULL CHECK (language IN ('th', 'en')),
    slip_notices INTEGER NOT NULL CHECK (slip_notices IN (0, 1)), updated_at INTEGER NOT NULL CHECK (updated_at >= 0)) STRICT;
  CREATE TABLE push_marks (kind TEXT NOT NULL, period TEXT NOT NULL, marked_at INTEGER NOT NULL CHECK (marked_at >= 0), count INTEGER CHECK (count IS NULL OR count >= 0),
    PRIMARY KEY (kind, period)) STRICT;   -- period: a month for month_recap, a queue message id for slips_ready
  ```
  ```ts
  export function putDevice(c: VaultContext, call: VaultCall): void                  // upsert for the token's sid; push_token null deletes
  export function forgetDevices(sql: SqlStorage, sessionIds: readonly string[]): void  // one json_each parameter
  export type PushTarget = { sessionId: string; token: string; language: 'th' | 'en' }
  export type PushParams = { count?: number; month?: string; days?: number; daysInMonth?: number; outcome?: 'ready' | 'rejected' | 'failed' }
  export type PushTargets = { devices: PushTarget[]; params: PushParams }
  export function pushTargets(c: FileContext, kind: PushKind, ref: string | null, messageId: string): PushTargets | null
  // UserVault RPCs (own short blocks; an erased or inactive vault answers null or does nothing): pushTargets(kind, ref, messageId), forgetPushTokens(sessionIds)
  export type ExpoMessage = { to: string; title: string; body: string; data: PushData; sound: 'default' }
  export type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } }
  export type PushPort = { send(messages: readonly ExpoMessage[]): Promise<ExpoTicket[]> }
  export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send', EXPO_PUSH_BATCH = 100
  export class PushSendFailed extends Error {}
  export function expoPushPort(options: { accessToken?: string; fetchImpl?: typeof fetch }): PushPort
  export function fakePushPort(answer?: (message: ExpoMessage) => ExpoTicket): PushPort & { sent: ExpoMessage[][] }
  export function pushMessage(kind: PushKind, params: PushParams, language: 'th' | 'en'): { title: string; body: string }
  export function liveSessions(db: D1Database | undefined, sessionIds: readonly string[], nowMs: number): Promise<ReadonlySet<string> | null>   // null without AUTH_DB
  export type PushQueueMessage = { vault: string; kind: PushKind; ref: string | null }
  export const PUSH_MAX_ATTEMPTS = 5, PUSH_RETRY_SECONDS = 60
  export function enqueuePush(env: { PUSH_QUEUE?: Queue<PushQueueMessage> }, message: PushQueueMessage): Promise<void>   // nothing when unbound
  export function handlePushBatch(batch: MessageBatch<PushQueueMessage>, env: V1Env, deps?: { push?: PushPort; now?: () => number }): Promise<void>
  ```
- The route `PUT /v1/devices` (`bound_session`, `devices.put`, gates `['jobs']`, status 204) joins `VAULT_ADDED_ROUTES`; a plain write (S1).
- `pushTargets`, counts and ids only: `slips_ready` is answered once per queue message: the first call counts open drafts not announced, marks them announced and keeps the count in `push_marks` (`slips_ready`, the message id) in one block, and a retry of that message answers the kept count (0: null), so a failed send is sent again and two messages never announce the same drafts; `slips_ready` marks older than a day go in the same block; it targets devices with slip notices on (none: null); `statement_parsed` (a job id) gives `outcome` `ready`, `rejected` or `failed` (else null); `export_ready` (an export id) gives `{}` for a ready, unexpired export (else null); `month_recap_ready` (`YYYY-MM`) gives `{ month, days, daysInMonth }`, `days` being distinct dates with a live record (0: null). No device: null.
- `handlePushBatch`, per message: targets with the message's `id` (null acknowledges); `liveSessions` runs `SELECT id FROM session WHERE id IN (SELECT value FROM json_each(?1)) AND expiresAt > ?2` with the ISO time (1C's M7) and forgets devices of sessions it did not return (S8); its null (no `AUTH_DB`) sends nothing and acknowledges. With `PUSH_SEND_ENABLED` not `true` or `1`, acknowledge and send nothing. Otherwise one message per device (its language, `data: { kind, ref }`, `sound: 'default'`) through `deps.push ?? expoPushPort({ accessToken: env.EXPO_ACCESS_TOKEN })`, 100 a request; `DeviceNotRegistered` tickets forget their devices; acknowledge. A throw retries after 60 s while `attempts` is under 5, then acknowledges with `logFailure('push_send_failed', error)`.
- `expoPushPort.send` posts the array (at most 100, Expo's push docs) with `accept` and `content-type: application/json` and, when set, `authorization: Bearer <token>`; a 200 with one ticket per message answers them, anything else throws `PushSendFailed`.
- **Push copy** (S10; title / body; Thai from ox-push verbatim where it has the line, the rest drafts; every English line a draft): `slips_ready` พบสลิปใหม่ {count} ใบ รอคุณยืนยัน / บันอ่านเป็นร่างไว้แล้ว แตะเพื่อตรวจก่อนบันทึก, `{count} new slips are waiting for you` / `Bun read them as drafts. Tap to check them before saving.`; `month_recap_ready` สรุปเดือน{monthName}พร้อมแล้ว / จดครบ {days} จาก {daysInMonth} วัน บันสรุปไว้ให้ดูแล้ว, `Your {monthName} recap is ready` / `You logged {days} of {daysInMonth} days. Bun has your summary ready.`; `export_ready` ไฟล์ส่งออกพร้อมแล้ว / แตะเพื่อดาวน์โหลด ไฟล์อยู่ได้ 24 ชั่วโมง, `Your export is ready` / `Tap to download it. The file stays for 24 hours.`; `statement_parsed` ready อ่าน statement เสร็จแล้ว / แตะเพื่อตรวจ ยังไม่มีอะไรถูกบันทึก, `Your statement has been read` / `Tap to check it. Nothing has been saved yet.`; rejected or failed อ่าน statement ไม่สำเร็จ / ยังไม่มีอะไรถูกบันทึก แตะเพื่อดูทางเลือก, `We could not read your statement` / `Nothing has been saved. Tap to see what you can do.` `monthName` is มกราคม to ธันวาคม, or January to December.
- `wrangler.jsonc`, each appended after the parse queue's entry: producer `{ "binding": "PUSH_QUEUE", "queue": "jotbun-push" }`; consumer `{ "queue": "jotbun-push", "max_batch_size": 10, "max_batch_timeout": 5, "max_retries": 5, "retry_delay": 60 }` (keys checked in wrangler 4.152.0's `config-schema.json`); var `"PUSH_SEND_ENABLED": "false"`. `queue` sends `jotbun-push` batches to `handlePushBatch` and others to `handleParseBatch`. `revokeSessionIds` runs `forgetDevices` in its block, so logout, signing one device out and signing out everywhere forget their tokens.

- [ ] **Step 1: Stub, then write the failing tests** (an empty migration; targets null; the consumer acknowledging; the port `[]`). In `push.test.ts` (`fakePushPort`, session rows in 1C-T1's test `AUTH_DB`):
  - `a device registers its push token for this session, and null forgets it`.
  - `a registration that is not an Expo push token is 422 on push_token, and a paused jobs gate is 503 JOBS_PAUSED before authentication`.
  - `signing a session out forgets its push token` (1C-T10a's `revokeSessions` and 1A's logout).
  - `the consumer sends each live device its message in its own language, with ids only in data`: devices `th` and `en`, records on 27 days of September 2026, `ref: '2026-09'`: titles `สรุปเดือนกันยายนพร้อมแล้ว` and `Your September recap is ready`, bodies with 27 and 30, `data` exactly `{ kind: 'month_recap_ready', ref: '2026-09' }`.
  - `a device whose session ended gets nothing, and its token is forgotten` (Review Focus 5: an online sign-out, then another account's session registering the same token in its own vault); `without AUTH_DB nothing is sent and the message is acknowledged`.
  - `an unregistered device's token is forgotten`; `a failed month_recap_ready send is retried after a minute, and dropped after the fifth attempt` (one `push_send_failed` line); `while PUSH_SEND_ENABLED is off nothing is sent and every message is acknowledged`.
  - `slips_ready goes to devices that keep slip notices on, counts only drafts not announced, and announces them once`; `a slips_ready whose first send fails is sent on its retry with the same count` (two new drafts meanwhile do not change it; a second message then counts only those two); `statement and export pushes name the outcome and nothing else`; `an erased or inactive vault has no push targets`; `erasing the vault leaves no device or push mark` (C7).
  - `no push text carries an amount`: for each kind and language no `/฿|บาท|baht/i`, and every digit run is a param's number or the month's year.
  - `a push queue message holds the vault id, the kind and one id or month only`.
  - `expoPushPort sends at most 100 messages a request with the access token, and a non-200 throws PushSendFailed` (150 messages: requests of 100 and 50).
  - `the Worker's queue handler sends push batches to the push consumer and statement batches to the parser`; `forgetting devices takes more sessions than SQLite has parameters` (150 ids).
  - Shape and coverage, in file order as `c1-shape.test.ts` maps them: producers `['PARSE_QUEUE', 'PUSH_QUEUE']`, consumers `['jotbun-statement-parse', 'jotbun-push']`; the added route.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/push.test.ts` and `npm run test:edge -- test/c1-shape.test.ts test/route-coverage.test.ts`.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run them and see them pass,** with 1C-T10a's `auth-vault.test.ts` unchanged.
- [ ] **Step 5: Mutation check.** Skip the live-session check; send while the switch is off; retry without a limit; put the count into `data`; keep tokens on revocation: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** Delivery to real phones is SKIPPED until the EAS project, APNs and FCM exist (D33, B11). `git commit -m "Add push: device tokens, the push queue, the Expo port and its consumer"`

---
### Task P4-T6: `POST /v1/slips`: a batch of slips read inside its request

**Starts after:** P4-T2, P4-T3, P4-T4, P4-T5, P3-T3 (P3:ai-gate), P3-T10 (P3:llm-analytics), 1B-T7, 1D-T3, 1D-T10, 1D-T11

**Delivers:** P4:slips-route

B9: this plan owns `/v1/slips`; P3's single read stays on `/v1/ai/slip`. A31: the server's `slip_scan_finished` goes once per request with that batch's counts. The backfill allowance is default pending owner Q6 (B13).

**Files:**
- Create: `apps/edge/src/v1/slips/read-route.ts`, `src/vault/slips/quota.ts`, `leases.ts`, `batch.ts`
- Modify: `src/v1/protocol.ts` (`WorkerRouteId` += `'slips.read'`; `VaultRouteId` += `'slips.begin' | 'slips.write' | 'slips.release'`), `src/v1/routes.ts` (the route; the three ids in `VAULT_STEP_ROUTES`), `src/v1/worker-routes.ts`, `src/vault/routes.ts`, P3-T3's `src/v1/gates.ts` (`MODEL_ROUTE_WORKERS` += `'slips.read'`), 1D-T3's `src/analytics/server-analytics.ts` (`ServerEventName` += `'slip_scan_finished'`; `found`, `duplicates`, `unreadable`, `escalated` as counts 0 to 100,000), `test/workers/support/slips.ts`, `test/route-coverage.test.ts`
- Test: `apps/edge/test/workers/slips-route.test.ts`

**Interfaces:**
- Consumes: 1B-T3's Worker-route context (`w.stream`, step calls through `w.vault` charged once, `w.waitUntil`) with P3-T10's `w.analytics`; P3-T4's `WorkerContext.transport` (`w.transport`: `startV1`'s `transport` in tests, else `transportFromEnv(env)`), `newTrace`, `AiDeadline`; `readSlipImage(..., { fields: 'import' })` and `SlipNotRead` (P3-T8 with P4-T4, A16); `/v1/ai/slip`'s consent check (`aiContext(c)`); the `ai` gate and `MODEL_ROUTE_WORKERS` (P3-T3, P3:ai-gate); `sendGenerations` (P3-T10, P3:llm-analytics); `analyticsIdFor` (1D-T3) and 1D-T11's consent rule; P4-T2's matcher; P4-T3's accounts, `slipDraftDto`, `slipDuplicateOf`, inbox change and `seedSlipDraft`; `enqueuePush` (P4-T5); `appendChanges`, `derivedUuid`; `ai_usage` (1B-T2); `openLive` (1D-T10).
- Produces:
  ```ts
  export function reserveSlipUses(c: VaultContext, purpose: SlipPurpose, wanted: number): number   // how many fit (S6)
  export function returnSlipUses(c: VaultContext, purpose: SlipPurpose, day: string, count: number): void   // to the Bangkok day they were counted on
  export function slipUsesLeft(c: VaultContext): { live: number; backfill: number }
  export function takeSlipLease(c: VaultContext, purpose: SlipPurpose, day: string): string | null   // an expired lease first gives its unsettled uses back and goes; null while one is held; beginSlips records the granted uses on it (S5, S6)
  export type SlipBegin = { lease: string; day: string; known: string[]; granted: string[]; over_quota: string[]; analytics: 'yes' | 'no' | 'unasked' }
  export function beginSlips(c: VaultContext, input: { purpose: SlipPurpose; hashes: string[] }): SlipBegin
  export type SlipWriteItem = { ref_hash: string; status: 'read' | 'unreadable'; read: SlipImportRead | null; catalog_keys: { from: string | null; to: string | null }; album: string | null; origin: SlipOrigin; model: SlipReadModel | null; escalated: boolean }
  export function writeSlip(c: VaultContext, input: { lease: string; request_id: string; item: SlipWriteItem }): SlipResult   // settles the item's reserved use on the lease
  export function releaseSlips(c: VaultContext, input: { lease: string }): { uses_left: { live: number; backfill: number }; unannounced: number }   // unsettled uses back to the lease's day, then the lease goes
  export const slipsReadHandler: WorkerHandler   // 'slips.read'
  export type Paced<R> = { status: 'done'; value: R } | { status: 'paused'; retryAfterSeconds: number | null }
  export function readSlipsWithin<T, R>(items: readonly T[], read: (item: T, remainingMs: number) => Promise<R>, options: { concurrency: number; startDeadlineMs: number; serverDeadlineMs: number; now: () => number; retryAfterOf: (error: unknown) => number | null }): Promise<Paced<R>[]>
  // test support: SENTINEL_IMAGE (a valid JPEG holding 'JOTBUN-SLIP-SENTINEL'), slipBatch(n, o?), fakeImportModel(reads) (a P3-T4 fake transport answering import reads)
  ```
- The route `{ method: 'POST', path: '/v1/slips', access: 'current_policy', worker: 'slips.read', gates: ['ai', 'imports'], status: 200, body: 'stream', release: 'SLIP_IMPORT_ENABLED' }` joins `VAULT_ADDED_ROUTES`.
- **The handler, in order** (S5 to S7, B27): (1) with three slots of this isolate taken, 503 `SERVICE_UNAVAILABLE`, retry 5; a slot is its start time, and one older than `serverDeadlineMs` plus 10 s no longer counts (a cancelled request may never free it); (2) at most 8 MiB of `w.stream` (else 413 `UPLOAD_TOO_LARGE`), `JSON.parse` (400 `VALIDATION_FAILED`), after which the raw bytes and text are dropped (S5), `parseSlipBatchRequest`, and each image's first bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF` then `WEBP` at offset 8; else 422 `UPLOAD_TYPE_MISMATCH`); (3) no `w.transport` is 503 `AI_PAUSED` before any lease; (4) `slips.begin`: AI consent off 403 `AI_CONSENT_REQUIRED`, a held lease 429 `RATE_LIMITED` retry 5; else the lease holds the granted slips' uses and the Bangkok day they were counted on; (5) the read loop, registered with `w.waitUntil` so reads already running finish after a dropped connection: `readSlipsWithin` over the granted slips (`readsAtOnce`, `startDeadlineMs`, `serverDeadlineMs`), each with its own `newTrace()` (`analytics` from `slips.begin`) and `AiDeadline(remainingMs)` (A16) through `readSlipImage({ image, context: { today, wallets: [], categories: [] }, locale }, { transport: w.transport, trace, deadline }, { fields: 'import' })`, each finished read written at once through `slips.write`: `kind: 'slip'` with an import read is `read`, with `catalog_keys` from `matchMerchant` of each side's name (`await merchantPatterns(env)`); any other kind, or a `SlipNotRead` whose failure is `rejected` or `other`, is `unreadable` (A14); an outage (`rate_limited`, `server_error`, `timeout`, `no_connection`) or any other throw is `paused` and writes nothing; `retryAfterOf` is the `SlipNotRead`'s `retryAfterSeconds`, else 30; (6) `slips.release`; the answer lists, in the request's order, each write's result, `duplicate` for the known hashes, `over_quota` for the rest and `paused` for granted slips not written, with `uses_left` and `retry_after_seconds` (the failure's wait; 5 when only the start deadline stopped reads; else null); (7) through `w.waitUntil`: `last` with `unannounced > 0` queues `{ vault, kind: 'slips_ready', ref: null }`; each slip's trace goes to `sendGenerations` (P3-T10); with consent `yes`, no `x-gogospend-analytics: off` and `ANALYTICS_ID_KEY` set, one `slip_scan_finished` with this request's counts through `w.analytics.capture` (1D-T11's rule); (8) a throw after `slips.begin` calls `slips.release`, then answers the error; a request cut off before that leaves its lease to expire, and the next `takeSlipLease` gives its uses back (S6).
- **`readSlipsWithin`** runs at most `concurrency` reads, starts none after `startDeadlineMs` or after a failure, hands each the time left before `serverDeadlineMs` (so no call outlives the request), keeps the items' order, and makes a thrown read `paused` with `retryAfterOf(error)`.
- **`writeSlip`** (one block): an `unreadable` item only spends its use. A `read` item: the hash again (written meanwhile, as by a single read's slip ref: `duplicate`, its use still spent, B5); the person's side by S2's write rule, giving `direction` (`out` when it is `from`) and `ensureSlipAccount` for that side alone when its bank and last four are known; the category (S3) from the other side's name: `SELECT category_id FROM transactions WHERE deleted_at IS NULL AND merchant IS NOT NULL AND type = ?1 AND lower(merchant) = lower(?2) ORDER BY occurred_on DESC, updated_at DESC LIMIT 1` (`expense` for `out`, `income` for `in`), then the other side's catalog key: its live, unarchived built-in category whose `type` is the draft's, else none; `expires_at` 30 days on (C11); a `slip_refs` row (`draft`) and a `slip_drafts` row with both sides and the slip's `origin` (A1); the result's draft through P4-T3's `slipDraftDto` and `slipDuplicateOf`; its use spent; `appendChanges(c, derivedUuid(accountId, 'slip-read', request_id, ref_hash), [inboxChange(c)])`, no receipt (S1).
- `reserveSlipUses`: `live` counts `ai_usage`'s `(today, 'slip')` row up to `SLIP_LIMITS.liveDaily` (P3's single read spends the same row); `backfill` sums `slip_backfill_uses` over the 30 Bangkok days ending today, up to 500. Uses go back to the lease's `day`, so a live use reserved before Bangkok midnight returns to the day it was counted on (P3-T7's rule).

- [ ] **Step 1: Stub, then write the failing tests** (a 501 handler; empty steps; `readSlipsWithin` pausing all). In `slips-route.test.ts` (`startV1(config, { env: { SLIP_IMPORT_ENABLED: 'true' }, transport: fakeImportModel(...), analytics })`, a member with AI consent):
  - `a body over 8 MiB is 413 before any vault call; more than 5 slips, a repeated hash or an image over 1,200,000 bytes is 422; bytes that are not their type are 422 UPLOAD_TYPE_MISMATCH`.
  - `the route is 404 until SLIP_IMPORT_ENABLED is true, and a paused ai or imports gate is 503 before authentication`.
  - `without AI consent it is 403 AI_CONSENT_REQUIRED, and without a transport 503 AI_PAUSED; no model is called and no use is spent`.
  - `a batch reads each new slip once and writes its draft, its slip reference and the person's account`; `a draft keeps the origin its slip was sent with` (A1: a `live` batch of one `share` slip gives a draft with `origin: 'share'`).
  - `a batch sent again after a lost answer reads nothing twice and charges nothing twice` (Review Focus 3: three `duplicate`, no new model call, uses and drafts unchanged).
  - `a second batch while one runs waits, and no slip is read twice` (Review Focus 3: the second is 429 retry 5 while the first's model is held; afterwards it answers `duplicate`; at the vault clock plus 91 s a stale lease no longer blocks).
  - `a request cut off after two reads keeps those two drafts, and a resend charges only the rest` (Review Focus 3: the client gone after the second write; two drafts and two uses; after the lease expires the same batch answers two `duplicate` and reads three).
  - `a lease left by a cut-off request gives its reserved uses back when it expires` (three backfill uses reserved on `2026-10-25`: the next request after 90 s finds them back on that day).
  - `a fourth batch in one isolate is 503 SERVICE_UNAVAILABLE, and a slot left by a cancelled request stops counting after 90 seconds`.
  - `live reads stop at 10 a Bangkok day and backfill at 500 in 30 days, each on its own (C10, B13)` (`slip` at 9 and backfill at 499: each batch of two gives `read` and `over_quota`; uses 31 days old do not count); `live uses reserved before Bangkok midnight and given back after it return to the day they were counted on`.
  - `a rate limit pauses the rest, gives their uses back and passes its wait on (B5, B27)` (`retry-after: 40` gives `retry_after_seconds: 40`).
  - `no read starts after 25 seconds, never more than two at once, and a hanging model ends as paused within 80 seconds` (P3-T4's `hang()`).
  - `an unreadable photo or a receipt spends its use and writes no draft or reference`; `a refused request spends its use as unreadable, and Opus failing after Haiku's read keeps Haiku's draft` (A14: a 400 on Haiku; a 529 on Opus).
  - `the person's side is the mapped account, else a known slip account, else the sender` (from mapped: `out`; to mapped: `in`; `to` a slip account and nothing mapped: `in`, and no account is made for the sender; neither: `out` on `from`'s account; two slips from `kbank 1234` make one account).
  - `the category is the person's own last choice for that merchant, then the catalog's, else none` ("ร้านป้าแดง ข้าวแกง" kept in `fun` beats the catalog; `7-ELEVEN` gets `food`; "นาย สมชาย ใจดี" none); `a received slip never gets an expense category from the catalog` (an `in` slip from `7-ELEVEN` gets none).
  - `a draft that matches a live record by amount and date names it`.
  - `writing drafts pokes the person's other phones, and the change carries only the inbox count` (the newest change is `slip_inbox` with `{ id, version, open: 3 }`).
  - `the last batch of a run with new drafts queues one slips_ready message, and a batch with last false queues none`.
  - `a person who said yes gets one slip_scan_finished with counts only, and each model call one $ai_generation; no and off send nothing`.
  - `nothing about a slip image is stored` (the anti-goal): after a batch of `SENTINEL_IMAGE`, R2 lists no object; KV lists only `config:v1`; queue and PostHog messages, `console` lines (spied) and every TEXT or BLOB vault column (from `sqlite_master`) hold neither its base64, the sentinel nor, outside `slip_drafts`, the payee; a resync snapshot built afterwards (1B-T8) holds the inbox count and no payee; with P3-T4's `anthropicTransport` over a recording `fetch`, every model request carried `cf-aig-collect-log: false`.
  - `a throw after begin gives the lease and every reserved use back`.
  - `a slip that became known while it was read is a duplicate on write, and its read still spends its use` (a `slip_refs` row inserted while the model is held).
  - Coverage: the route and its three step ids; `slips.read` is in `MODEL_ROUTE_WORKERS` and carries the `ai` gate.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/slips-route.test.ts` and `npm run test:edge -- test/route-coverage.test.ts`.
- [ ] **Step 3: Implement** the quota, lease, steps, `readSlipsWithin` and handler.
- [ ] **Step 4: Run them and see them pass,** then the whole Workers suite.
- [ ] **Step 5: Mutation check.** Charge a duplicate: the lost-answer case fails. Take no lease: the second-batch case. Write the drafts after every read: the cut-off case. Count slots forever: the slot case. Return live uses to today: the midnight case. Start reads after 25 s: the deadline case. Keep a paused read's use: the rate-limit case. Pause on a 400: the A14 case. Match the catalog on either side: the received-slip case. Put the payee in the change: the inbox case. Skip the second hash check (the UNIQUE `ref_hash` aborts), or give its use back: the became-known case.
- [ ] **Step 6: Gate, receipt, commit.** Real slips read by Anthropic are SKIPPED until the D33 key (P4-T23), and the deployed memory check of three 8 MiB batches in one isolate (S5) is SKIPPED, as in 1B-T8. `git commit -m "Read slip batches inside POST /v1/slips, storing nothing of the images"`

---
### Task P4-T7: Slip drafts: the list, confirm, dismiss, slip refs and the 30-day expiry

**Starts after:** P4-T3, P3-T2 (P3:source), 1A-T5, 1B-T11, 1D-T10, 1D-T11

**Delivers:** P4:slip-drafts

**Files:**
- Create: `apps/edge/src/vault/slips/drafts.ts`, `refs.ts`, `prune.ts`
- Modify: `src/vault/domain/transactions.ts` (`createTransactionRow`, the one insert path `createTransaction` and P4-T11 use), `src/vault/commands/registry.ts` (two commands after the import commands), 1A-T3's `src/vault/commands/change-log.ts` (`appendChanges` takes `Pick<VaultContext, 'sql' | 'now' | 'registry'>`, all it reads, unless 1A-T8b has narrowed it), 1B-T11's `src/vault/files/jobs.ts` (`FilePrune` widens to `(c: FileContext & Pick<VaultContext, 'registry'>) => void`, the other prunes unchanged; `runFileJobs` passes `{ ...v.fileContext(), registry }`; `FILE_PRUNES` += `pruneSlips`, so `prune_files` is due at the earliest `<x>DueAt` including `slipsDueAt`), `src/vault/user-vault.ts` (the registry 1A-T3 builds once per instance, readable by `runFileJobs`), `src/v1/protocol.ts` (`'drafts.list' | 'drafts.confirm' | 'drafts.dismiss' | 'slips.refs'`), `src/v1/routes.ts`, `src/vault/routes.ts`, `test/route-coverage.test.ts`
- Test: `apps/edge/test/workers/slip-drafts.test.ts`

**Interfaces:**
- Consumes: `runCommand`, `commandInput`, `appendChanges` (1A-T3); `createTransaction`'s checks and insert (1A-T5) with `source` and `parseTransactionSource` (P3-T2, P3:source); `FilePrune`, `FILE_PRUNES`, `runFileJobs` (1B-T11); `inboxChange`, `slipDraftDto`, `slipDuplicateOf`, `seedSlipDraft` (P4-T3); P4-T1's names; 1D-T11's analytics seam.
- Produces:
  ```ts
  export function createTransactionRow(c: VaultContext, input: unknown, extras: { source: TransactionSource | null; slipRefId: string | null }): EntityChange
  //   createTransaction's checks and insert; the source comes only from extras, so a source or slip_ref_id key in input is UNKNOWN_FIELD.
  //   createTransaction reads its own source with parseTransactionSource, takes it out of the input and passes it here (null: no key, P3-T2).
  export function slipSourceOf(origin: SlipOrigin): TransactionSource   // A1: 'share' gives 'share_extension', every other origin 'slip_import'
  export function listSlipDrafts(c: VaultContext, query: unknown): SlipDraftsPage   // `cursor`; `limit` 50 by default, at most 200
  export function confirmSlipDrafts(c: VaultContext, call: VaultCall): CommandAck    // 'slip_draft.confirm'
  export function dismissSlipDraft(c: VaultContext, call: VaultCall): CommandAck     // 'slip_draft.dismiss'
  export function recordSlipRef(c: VaultContext, call: VaultCall): void
  export function pruneSlips(c: FileContext & Pick<VaultContext, 'registry'>): void   // what runFileJobs now passes: appendChanges reads c.registry
  export function slipsDueAt(c: FileContext): number | null
  ```
- Routes (each in `VAULT_ADDED_ROUTES`): `GET /v1/drafts` (`bound_session`), `POST /v1/drafts/confirm` (`current_policy`, gates `['imports', 'writes']`, 200) and `POST /v1/drafts/:id/dismiss` (`current_policy`, gates `['imports']`, 200), all three with `release: 'SLIP_IMPORT_ENABLED'`; `POST /v1/slips/refs` (`current_policy`, gates `['imports']`, 204) without it, since a single read's ref is kept whether or not slip import is out yet. Registry: `slip_draft.confirm` (entity `slip_inbox`, outcome `accepted`) and `slip_draft.dismiss` (entity `slip_inbox`, outcome `updated`), both `schemaVersions: [1]`, policy `current`.
- **Confirm** (B10 as A1 amends it, default pending owner Q4): `commandInput(call, 'slip_draft.confirm', { id: SLIP_INBOX_ID, drafts }, 'forbidden')`; the mutation reads the drafts with one `json_each` parameter (any missing: 409 `VERSION_CONFLICT`, nothing written, the phone reloads); each `transaction` goes through `createTransactionRow` with `source: slipSourceOf(draft.origin)` and the draft's `ref_id` (a `source` or `slip_ref_id` key in it is 422 `UNKNOWN_FIELD`: the vault sets both), and a refusal names its draft, `drafts[<i>].transaction.<field>`, with nothing written; drafts are deleted and their refs become `confirmed` with the record id; the change group is each record's change, then `inboxChange(c)`. One command per batch of at most 50 keeps the protocol and the write budget.
- **Dismiss:** payload `{ id: SLIP_INBOX_ID, draft_id }`; a missing draft is 404; the ref becomes `dismissed` (still known); the inbox change.
- **Slip refs** (a single read's saved record, P4-T16b): an unknown hash inserts a `recorded` ref and sets the record's `slip_ref_id` when empty; a known hash is 204 with no change; a record that is not live is 404. A plain write (S1).
- **The list:** open drafts by `occurred_on` descending (nulls last), `occurred_time` descending, `id`; keyset cursors; `total` counts all open drafts; rows through P4-T3's `slipDraftDto` with `slipDuplicateOf`.
- **`pruneSlips`** (C11; each part its own short block): open drafts past `expires_at` are deleted, their refs become `expired`, and one inbox change is written under `derivedUuid(c.vaultId, 'slip-prune', c.now.toISOString())` (no receipt); backfill rows older than 31 Bangkok days go. Leases are P4-T6's (`takeSlipLease` gives an expired one's uses back). `slipsDueAt` is the earliest of those deadlines (R37).

- [ ] **Step 1: Stub, then write the failing tests.** In `slip-drafts.test.ts`:
  - `drafts come newest first, 50 a page and at most 200, with the total and a cursor` (120 drafts).
  - `confirming 50 drafts is one command under one revision, and every record carries source slip_import and its slip ref` (B10; the new inbox change says `open: 0`); `a shared slip's draft confirms as share_extension` (A1: `seedSlipDraft` with `origin: 'share'`).
  - `more than 50 drafts, a repeated draft or a repeated record id is 422`; `a resent confirm replays its acknowledgement and writes nothing more`; `a draft confirmed on another phone makes the batch 409, and nothing is written`.
  - `each record is checked as transactions.create checks it, and a refused record is named by its draft index` (a category of the other type is 422 on `drafts[0].transaction.category_id`; a second draft dated before its wallet's start `DATE_BEFORE_TRACKING_START` on `drafts[1].transaction.occurred_on`; nothing written); `a transaction carrying source or slip_ref_id is 422 UNKNOWN_FIELD` (on `drafts[0].transaction.source`).
  - `the list names a live record with the same amount and date as a possible duplicate`.
  - `slip confirmations send no record_saved` (S18).
  - `dismissing keeps the slip known, and a dismissed draft cannot be confirmed`; `confirm and dismiss poke the other phones with the new inbox count`.
  - `a single read's slip ref is recorded once against its record` (twice: one row; a deleted record 404).
  - `an open draft leaves the inbox 30 days after it was read, and its slip stays known (C11)` (`runDurableObjectAlarm` at `expires_at`: the alarm's own prune commits the inbox change, one fewer open).
  - `after pruneSlips at slipsDueAt, the next slipsDueAt is later or null` (R37); `the prune takes more drafts than SQLite has parameters` (101 expired drafts in one run).
  - Coverage: the four added routes.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/slip-drafts.test.ts` and `npm run test:edge -- test/route-coverage.test.ts`.
- [ ] **Step 3: Implement** `createTransactionRow` (`createTransaction`'s body behind it, its answers unchanged), the routes, commands, refs, prune and the prune context.
- [ ] **Step 4: Run them and see them pass,** with 1A-T5's and 1B-T11's suites and P3-T2's `test/workers/transaction-source.test.ts`, each unchanged.
- [ ] **Step 5: Mutation check.** One command per draft; skip the missing-draft check; drop `source`; accept a `source` key in the body; confirm a shared draft as `slip_import`; expire at 29 days; prune without the inbox change: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "List, confirm, dismiss and expire slip drafts, and record slip refs"`

---

### Task P4-T8: Push from 1B's background work: export ready and statement parsed

**Starts after:** P4-T5, 1B-T5, 1B-T6

**Files:**
- Modify: 1B-T6's `apps/edge/src/background/export-workflow.ts` (`ExportWorkflow.run`), 1B-T5's `src/background/parse-consumer.ts` (`handleParseBatch`)
- Test: `apps/edge/test/workers/push-producers.test.ts`

**Interfaces:**
- Consumes: `ExportWorkflow`, `writeExport` (1B-T6); `handleParseBatch`, `recordPreview`, `failParse`, `fakeParser`, `parseBatch` (1B-T5); `enqueuePush` (P4-T5); `introspectWorkflowInstance`, `getQueueResult` (`cloudflare:test`).
- Produces: in `ExportWorkflow.run`, after `writeExport` answers `ready`, `step.do('notify the phones', () => enqueuePush(this.env, { vault: p.vault, kind: 'export_ready', ref: p.export }))`, its failure caught and logged (`export_push_failed`) so the export stays ready. In `handleParseBatch`, after `recordPreview` answers `{ recorded: true }` and after an import fails for good (the last attempt, `quarantine_missing`, `quarantine_corrupt`), `await enqueuePush(env, { vault, kind: 'statement_parsed', ref: job })` before the ack; a failed send is logged (`statement_push_failed`) and the message still acks. Held, skipped and retried messages queue nothing, so an import that 1B's `parseSource` fails itself (`import_unavailable`, answered `skip`) sends no push: a stated gap; the app shows the failure when the person opens the import.

- [ ] **Step 1: Write the failing tests** (a capturing `PUSH_QUEUE`): `a ready export queues one export_ready push with ids only`; `a failed or skipped export queues nothing`; `a parsed statement queues one statement_parsed push, and a held or retried parse queues none`; `a statement that fails for good queues one statement_parsed push`; `an unreachable push queue leaves the export ready and the import parsed`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/push-producers.test.ts`.
- [ ] **Step 3: Implement** the step and the two calls.
- [ ] **Step 4: Run them and see them pass,** with 1B-T5's and 1B-T6's suites unchanged.
- [ ] **Step 5: Mutation check.** Notify before the write: the failed-export case fails. Notify on a retried parse: the held case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Queue export-ready and statement-parsed pushes"`

---

### Task P4-T9: The month recap on the vault alarm (09:00 Bangkok on the 1st)

**Starts after:** P4-T5, 1B-T11, 1A-T8b

**Files:**
- Create: `apps/edge/src/vault/push/recap.ts`
- Modify: 1B-T11's `src/vault/files/jobs.ts` (`FileJob` += `'month_recap'`, due at `recapDueAt`, run by `runFileJobs`), `src/vault/user-vault.ts` (the vault is the `RecapHost`)
- Test: `apps/edge/test/workers/recap.test.ts`

**Interfaces:**
- Consumes: `fileJobsDue`, `runFileJobs`, `reschedule`, `alarmAt`, `rearm` (1B-T11); `runDurableObjectAlarm`; `push_marks`, `devices`, `enqueuePush` (P4-T5); `account_state.created_at` (1A-T2).
- Produces:
  ```ts
  export const RECAP_HOUR_UTC = 2   // 09:00 in Bangkok
  export function recapMonthAt(nowMs: number): string           // the Bangkok month before nowMs's, YYYY-MM
  export function recapDueAt(c: FileContext): number | null     // 02:00Z on the 1st after the later of the account's first month and the last marked month; null when inactive
  export type RecapHost = { context(): FileContext; env: { PUSH_QUEUE?: Queue<PushQueueMessage> }; vaultId: string; erased: boolean; active(c: FileContext): boolean }
  export function runMonthRecap(v: RecapHost): Promise<void>
  ```
- `runMonthRecap` (S9): in one short block it marks `('month_recap', recapMonthAt(now))` and every earlier unmarked month since the account's first; outside it, when the vault has a device, `enqueuePush(env, { vault, kind: 'month_recap_ready', ref: month })`. A failed send is logged (`month_recap_push_failed`), never retried (the recap stays in the app); P4-T5's targets drop a month with no logged day.

- [ ] **Step 1: Stub, then write the failing tests** (`recapDueAt` null; the run resolving): `the recap is due at 09:00 Bangkok on the 1st` (created 2026-10-25: due `2026-11-01T02:00:00Z`); `the alarm on the 1st queues one month_recap_ready push for the month before, and the next is due a month later`; `a vault that slept through months announces only the last one` (created 2026-10-25, first alarm at `2027-02-01T03:00:00Z`: queues `2027-01` and marks `2026-10`, `2026-11`, `2026-12` and `2027-01`; the first, partial month gets its recap when the vault is awake on 1 November); `a vault without devices marks the month and queues nothing`; `an erased or inactive vault is never due`; `after the recap runs at recapDueAt, the next recapDueAt is later` (R37), with 1B-T11's `after any alarm, every scheduled time is later than now` still passing.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/recap.test.ts test/workers/files-alarm.test.ts`.
- [ ] **Step 3: Implement** the due time, the run and the job.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Due at 00:00Z; announce every missed month; retry a failed send at once (the alarm loops): each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Queue the month recap push from the vault alarm at 09:00 Bangkok on the 1st"`

---
### Task P4-T10: The parser learns Thai bank exports (`apps/api`)

**Starts after:** base

Default pending owner Q11 (only these `apps/api` files; §6.1 keeps the rest read-only), Q10 (synthetic fixtures) and Q17 (an XLSX with a second sheet, formulas or links stays refused as today).

**Files:**
- Create: `apps/api/src/imports/parsers/bank.ts`, `apps/api/src/imports/bank-statements.spec.ts`
- Modify: `parsers/table.ts` (header search, bank roles), `parsers/date.ts` (`era`), `parsers/protocol.ts` (`header_fingerprint` on `ParseBody` and `ChildBody`), `parsers/receipt.ts` (null fingerprint), `parser-runner.ts` (`validateParseResult` accepts the key: null or 64 lowercase hex), `parse-outcome.ts` (passes it into `PreviewRecord.preview`), `fixtures/synthetic-parse.ts` (`bankCsvTh`, `bankXlsxEn`); the tests that compare whole parse results or previews (`parse-server.spec.ts`, `parser-runner.spec.ts`) gain the key, their rows unchanged
- Test: `apps/api/src/imports/bank-statements.spec.ts` (Jest)

**Interfaces:**
- Consumes: the parser modules (`buildRows`, `SourceRow`, `ChildBody`, `parseDateText`, `detectDateOrder`, `parseAmountText`); 1B-T1's `toPreviewRecord`, `previewFromOutcome`, `PreviewRecord`; `parsingRunner()`, `csv`, `buildXlsx` (fixtures).
- Produces:
  ```ts
  // parsers/bank.ts (Node built-ins only, as the child requires)
  export const HEADER_SEARCH_ROWS = 30
  export function findHeaderRow(rows: readonly SourceRow[]): number   // first row within 30 naming a date role and an amount role or both a withdrawal and a deposit role; else 0
  export function preambleAccountLabel(rows: readonly SourceRow[]): string | null   // 'บัญชีออมทรัพย์ xxx-1234'
  export function twoDigitYearEra(dateTexts: readonly string[], today: string): 'be' | 'ce' | null
  export function headerFingerprint(cells: readonly string[]): string   // lowercase hex SHA-256 (node:crypto) of the normalized cells joined by U+001F
  // parsers/date.ts: parseDateText(raw, options: { order; today; era?: 'be' | 'ce' | null })
  // protocol.ts and parse-outcome.ts: `header_fingerprint: string | null` (null for an image)
  ```
- **The bank layout** (S12) applies only when the header names a withdrawal role (`withdrawal`, `withdrawals`, `debit`, `ถอน`, `ถอนเงิน`, `เงินออก`, `เดบิต`) and a deposit role (`deposit`, `deposits`, `credit`, `ฝาก`, `ฝากเงิน`, `เงินเข้า`, `เครดิต`). Then rows above the header are the preamble, and without a wallet column `preambleAccountLabel` labels every row: the first preamble cell holding a masked number (two or more of `x`, `X` or `*`, then four or more digits, `-` and spaces between) gives `xxx-<last four>` after the row's first other non-empty cell when there is one. Exactly one of withdrawal (`expense`) and deposit (`income`) holds an amount, its sign ignored; both is `type_conflict`, neither `missing_amount`. A descriptor column (`รายการ`, `transaction`, `description`, `คำอธิบาย`) becomes `category_label` (im-map's `POS PURCHASE`); a details column (`รายละเอียด`, `details`, `channel`, `ช่องทาง`, `memo`) the `merchant`; balance columns (`balance`, `ยอดคงเหลือ`, `คงเหลือ`) are known and ignored; time is dropped (W12). Two-digit years read in `twoDigitYearEra`.
- **`twoDigitYearEra`** (the algorithm the tests pin): `be` when every two-digit year read as `25yy` less 543 falls within the ten years ending today and read as `20yy` does not; `ce` for the reverse; null otherwise (`ambiguous_date`, as today).
- Every CSV and XLSX gets `headerFingerprint` of its header row after the parser's `normalizeHeader`.

- [ ] **Step 1: Stub, then write the failing tests** (stubs answering 0, null and `''`). In `bank-statements.spec.ts`, through `parsingRunner()`:
  - `finds the header below preamble rows and labels every row with the masked account`: `bankCsvTh` (six preamble rows with `บัญชีออมทรัพย์,xxx-x-x1234-x`, then `วันที่,เวลา,รายการ,ถอนเงิน,ฝากเงิน,ยอดคงเหลือ,ช่องทาง,รายละเอียด`) keeps record numbers (`row:8` first) and labels `บัญชีออมทรัพย์ xxx-1234`.
  - `a withdrawal is an expense and a deposit income; a row with both is type_conflict and one with neither missing_amount` (`-1,500.00` withdrawn is `150000`).
  - `descriptors become category labels and details the merchant` (`POS PURCHASE`, `ร้านเครื่องเขียน`).
  - `two-digit years take the era that puts the whole file within ten years before today`: today `2026-10-25`: `24/10/69` and `24/10/26` are `2026-10-24`; a file with both is `ambiguous_date`; today `2026-01-01`: `31/12/68` is `2025-12-31`.
  - `an English XLSX export of the same layout parses to the same rows` (`bankXlsxEn`).
  - `the header fingerprint is the same for two files of one layout and differs for another`.
  - `every other file parses exactly as before` (a generic `description` column still maps to `note`; the legacy cases pass with only the key added); `the parse server's preview carries the header fingerprint`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:api -- bank-statements parse-server`.
- [ ] **Step 3: Implement** the search, label, roles, era, fingerprint and pass-through.
- [ ] **Step 4: Run them and see them pass,** then `npm run test:api -- parser-runner parse-server parse-worker` and `npm run test:db -w gogospend-api -- import-preview`.
- [ ] **Step 5: Mutation check.** Bank roles with one column only: the before case fails. Every two-digit year Buddhist: the `26` case fails. Fingerprint the first data row: the layout case fails.
- [ ] **Step 6: Optional Docker proof, gate, receipt, commit.** With `docker info`, post `bankCsvTh` to the image's `/parse` and see the fingerprint; else SKIPPED. API and edge gates. `git commit -m "Teach the statement parser real Thai bank exports and a header fingerprint"`

---

### Task P4-T11: Statement label maps per layout, and `source: statement`

**Starts after:** P4-T7, P4-T10, P3-T2 (P3:source), 1B-T5, 1B-T10, 1B-T13, 1D-T10

**Files:**
- Create: `apps/edge/src/vault/migrations/NNNN_import_label_maps.sql`, `apps/edge/src/vault/files/label-maps.ts`
- Modify: `packages/contracts/src/v1/imports.ts` (`ImportLabelMapDto`, `isImportLabelMapDto`), 1B-T5's `src/vault/files/parse.ts` (`recordPreview` keeps the fingerprint), 1B-T10's `src/vault/files/confirmation.ts` (`confirmImportBatch` remembers labels and writes `source: 'statement'`), `src/vault/schema.ts`, `migrations/index.ts`, `test/workers/vault-schema.test.ts`, `src/v1/protocol.ts` (`'imports.labelMap'`), `src/v1/routes.ts`, `src/vault/routes.ts`, `test/route-coverage.test.ts`
- Test: `apps/edge/test/workers/import-label-maps.test.ts`

**Interfaces:**
- Consumes: `recordPreview`, `parsedCsv`, `fakeParser`, `parseBatch` (1B-T5); `confirmImportBatch`, `seedPreview` (1B-T10); P4-T7's `createTransactionRow` with P3-T2 (P3:source)'s `source`; P4-T10's fingerprint.
- Produces:
  ```sql
  ALTER TABLE import_previews ADD COLUMN header_fingerprint TEXT CHECK (header_fingerprint IS NULL OR (length(header_fingerprint) = 64 AND header_fingerprint NOT GLOB '*[^0-9a-f]*'));
  CREATE TABLE import_label_maps (fingerprint TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('wallet', 'expense', 'income')),
    label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80), target_id TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (fingerprint, kind, label)) STRICT;
  ```
  ```ts
  export type ImportLabelMapDto = { fingerprint: string | null; wallets: { label: string; wallet_id: string }[]; categories: { label: string; type: 'expense' | 'income'; category_id: string }[] }
  export function isImportLabelMapDto(value: unknown): value is ImportLabelMapDto
  export function rememberLabels(c: VaultContext, fingerprint: string, rows: readonly { wallet_label: string | null; wallet_id: string | null; type: TransactionType; category_label: string | null; category_id: string | null }[]): void
  export function importLabelMap(c: VaultContext, jobId: string): ImportLabelMapDto | null   // null: no such import
  ```
- The route `GET /v1/imports/:id/label-map` (`bound_session`, `imports.labelMap`) joins `VAULT_ADDED_ROUTES` (S11): the pairs under the preview's fingerprint, leaving out archived or gone wallets and categories; no fingerprint gives an empty map; an unknown or another person's import is 404.
- `confirmImportBatch`: in the batch's block, each committed row's labels and chosen ids are upserted under the fingerprint (the last choice wins; one statement per pair), and each record is written through `createTransactionRow(c, input, { source: 'statement', slipRefId: null })`.

- [ ] **Step 1: Stub, then write the failing tests:** `a parsed preview keeps the parser's header fingerprint`; `confirming rows remembers their wallet and category labels under the file's fingerprint, and the last choice wins`; `a second file with the same header gets the remembered map, and another layout gets none`; `a remembered map leaves out archived wallets and categories`; `confirmed statement rows carry source statement`; `another person's import is 404, and a preview without a fingerprint has an empty map`; `a confirmation batch of 500 rows remembers its labels`; the table, column and added route in the schema and coverage tests.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/import-label-maps.test.ts test/workers/vault-schema.test.ts` and `npm run test:edge -- test/route-coverage.test.ts`.
- [ ] **Step 3: Implement** the migration, contract, functions, the two 1B edits and the route.
- [ ] **Step 4: Run them and see them pass,** with 1B-T5's and 1B-T10's suites unchanged, then `npm run typecheck` (the contract changed).
- [ ] **Step 5: Mutation check.** Remember at freeze (an unconfirmed file's labels appear); keep archived targets; drop `source`: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Remember statement label mappings per layout and mark statement records"`

---
### Task P4-T12: The phone's slip core: clients, routes, the salted hash and the salt store

**Starts after:** P4-T1, P3-T1 (P3:slip-qr)

**Files:**
- Create: `apps/app/src/slips/slipResources.ts`, `slipRefs.ts`, `slipRoutes.ts`, `testing/fakeSlipResources.ts`; the ten slip routes, each `<Redirect href="/spend" />` until its screen task: `apps/app/app/spend/slips/index.tsx`, `permission.tsx`, `albums.tsx`, `scan.tsx`, `summary.tsx`, `accounts.tsx`, `review.tsx`, `done.tsx`, `settings.tsx`, `notifications.tsx` (so every typed link P4-T17 to P4-T21 makes exists for `typecheck:routes`)
- Modify: `apps/app/src/api/sharedV1.ts` (`getSharedSlipResources()`), `apps/app/src/spend/v1/DeviceDiaryProvider.tsx` (the sign-out erase forgets the salt of the account whose diary it erases)
- Test: `apps/app/src/slips/slipResources.test.ts`, `slipRefs.test.ts` (Node); one case in `apps/app/src/spend/v1/DeviceDiaryProvider.render.test.tsx`

**Interfaces:**
- Consumes: `V1Transport` with `V1RequestOptions`' `timeoutMs`, `command` (the only way the transport sends `If-Match`, `client.ts`) and `validate`; `isCommandAck`; P4-T1's names; P3-T1's `SlipQr` (P3-T1, P3:slip-qr); `expo-secure-store` 58.0.2 (`getItemAsync`, `setItemAsync`, `deleteItemAsync`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, `accessGroup`) and `expo-crypto` 58.0.6 (`digest(CryptoDigestAlgorithm.SHA256, data)`), each loaded through an optional `loadModule` as `src/lib/haptics.ts` does.
- Produces:
  ```ts
  export type SlipResources = {
    salt(): Promise<SlipSaltDto>
    read(request: SlipBatchRequest): Promise<SlipBatchResult>   // timeoutMs SLIP_LIMITS.clientTimeoutMs (90 s); not a command, so the transport never resends it: the engine's next run does (P4-T14)
    drafts(cursor?: string, limit?: number): Promise<SlipDraftsPage>
    confirm(drafts: SlipConfirmRequest['drafts'], commandId: string): Promise<CommandAck>
    dismiss(draftId: string, commandId: string): Promise<CommandAck>
    accounts(): Promise<SlipAccountDto[]>
    updateAccount(id: string, version: number, walletId: string | null): Promise<SlipAccountDto>   // command { id: <new UUID>, schemaVersion: 1, ifMatch: version }; a 409 throws V1Error VERSION_CONFLICT for the caller to reload
    recordRef(request: SlipRefRequest): Promise<void>
    bankAlbums(): Promise<BankAlbumDto[]>
    registerDevice(registration: DeviceRegistration): Promise<void>
  }
  export function createSlipResources(transport: V1Transport): SlipResources
  export function getSharedSlipResources(): SlipResources   // sharedV1.ts: over the shared transport (v1SessionCredentials), as getSharedV1Resources()
  export type SaltStore = { read(accountId: string): Promise<Uint8Array | null>; write(accountId: string, salt: Uint8Array): Promise<void>; forget(accountId: string): Promise<void> }
  export const SALT_KEY_PREFIX = 'jotbun.slip-salt.'
  export function secureSaltStore(options?: { accessGroup?: string; loadModule?: () => Promise<typeof import('expo-secure-store')> }): SaltStore   // keychainAccessible WHEN_UNLOCKED_THIS_DEVICE_ONLY (B12, S16); accessGroup for P6A's extension
  export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>
  export function expoSha256(loadModule?: () => Promise<typeof import('expo-crypto')>): Sha256
  export type SlipHasher = (slip: SlipQr) => Promise<string | null>
  export function createSlipHasher(deps: { accountId: string; store: SaltStore; resources: Pick<SlipResources, 'salt'>; sha256: Sha256 }): SlipHasher
  // slipRoutes.ts, typed Href constants: SLIPS_HREF '/spend/slips', SLIP_SCAN_HREF '/spend/slips/scan', SLIP_MANUAL_SCAN_HREF { pathname: '/spend/slips/scan', params: { run: 'manual' } } (P4-T19), SLIP_REVIEW_HREF '/spend/slips/review'
  export function fakeSlipResources(options?: { read?: (item: SlipBatchItem, index: number) => SlipResult; drafts?: SlipDraftDto[]; accounts?: SlipAccountDto[]; albums?: BankAlbumDto[]; slipImportOn?: boolean }): SlipResources & { calls: { method: keyof SlipResources; body?: unknown }[] }   // slipImportOn false: the calls behind SLIP_IMPORT_ENABLED throw V1Error 404 NOT_FOUND
  ```
- `createSlipHasher` reads the stored salt, else fetches it once, stores it and keeps it in memory, and hashes `normalizeSlipRef(slip.bankCode, slip.reference)`; an unnormalizable reference gives null (the photo stays on the phone). Default pending owner Q5 (B12). The QR check itself is P3's `slipQrIn(decoder, uri)`, offline on the phone (§6.8 step 3; A13), and P3's `parseSlipQr` keeps only root `000001` (B14, Q7).

- [ ] **Step 1: Stub, then write the failing tests.**
  - `slipResources.test.ts`: `each slip call sends its route, its body and its headers, and refuses an answer of any other shape` (command headers on confirm and dismiss; the account update's command carries `ifMatch`, so `If-Match` is sent); `the slip read waits 90 seconds and a lost answer is not resent by the transport` (`timeoutMs` 90,000; one `fetch`); `a stale account update throws VERSION_CONFLICT with the current account`.
  - `slipRefs.test.ts` (an injected `loadModule`): `the salt is fetched once per account and kept with WHEN_UNLOCKED_THIS_DEVICE_ONLY`, and in the given `accessGroup`; `the phone's hash of P3's slip QR is the contract's vector` (a `node:crypto` `Sha256`; P3-T1's `004` slip gives the hash of `'004:016298105512345678'`); `a reference that cannot be normalized gives no hash`.
  - `DeviceDiaryProvider.render.test.tsx`: `the sign-out erase forgets this account's slip salt`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/slipResources.test.ts src/slips/slipRefs.test.ts` and `npm run test:render -w gogospend-app -- src/spend/v1/DeviceDiaryProvider.render.test.tsx`.
- [ ] **Step 3: Implement** the clients, route constants and redirect stubs, store, hasher and erase call.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Fetch the salt per hash; hash the reference without the bank code; omit `keychainAccessible`; send the account update without a command: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the phone's slip clients, routes, salted hash and salt store"`

---

### Task P4-T13: Photos, shrinking and batches on the phone

**Starts after:** P4-T1

**Files:**
- Create: `apps/app/src/slips/photoLibrary.ts`, `imageShrink.ts`, `slipBatches.ts`, `testing/fakePhotos.ts`
- Test: `apps/app/src/slips/photoLibrary.test.ts`, `imageShrink.test.ts`, `slipBatches.test.ts` (Node)

**Interfaces:**
- Consumes: `expo-image-picker` 58.0.10 (`launchImageLibraryAsync` with `allowsMultipleSelection`, `selectionLimit`, `mediaTypes`, `quality`, `preferredAssetRepresentationMode: Compatible` as P3-T15 picks, no `base64`; the media-library permission calls with `accessPrivileges`; `assetId`, which may be null, and `fileSize`) and `expo-file-system` 58.0.9 (`new File(uri)`, `size`, `base64()`, `delete()`), each through an optional `loadModule` (`src/lib/haptics.ts`'s pattern); `Linking.openSettings()`, imported lazily so Node loads the module; `SLIP_LIMITS` (P4-T1).
- Produces:
  ```ts
  export type PhotoAccess = 'all' | 'limited' | 'none' | 'undetermined'
  export type AlbumInfo = { id: string; title: string; count: number }
  export type PhotoAsset = { id: string; uri: string; createdMs: number; albumId: string | null; bytes?: number }   // a picked image's id is assetId ?? uri
  export type PhotoLibraryPort = { readonly albumsSupported: boolean; access(): Promise<PhotoAccess>; request(): Promise<PhotoAccess>; albums(): Promise<AlbumInfo[]>;
    assetsSince(albumId: string, after: { ms: number; id: string | null }, limit: number): Promise<PhotoAsset[]>;   // oldest first, strictly after (ms, id)
    asset(id: string): Promise<PhotoAsset | null>;   // an album photo again by its id (P4-T14's resume); null once it is gone
    pick(limit: number): Promise<PhotoAsset[]>; release(asset: PhotoAsset): Promise<void>; openSettings(): Promise<void> }   // release deletes a picked photo's cache copy (nothing for an album photo)
  export function pickerPhotoLibrary(options?: { loadModule?: () => Promise<typeof import('expo-image-picker')> }): PhotoLibraryPort   // Q1's default: no albums, asset() always null (P4-T14 finds a picked copy by its uri); pick() multi-selects at quality 0.7
  export type ShrunkImage = { uri: string | null; base64: string; bytes: number; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }
  export type ImageShrinkPort = { shrink(asset: PhotoAsset): Promise<ShrunkImage | null>; remove(image: ShrunkImage): Promise<void> }
  export function pickerShrink(options?: { loadModule?: () => Promise<typeof import('expo-file-system')> }): ImageShrinkPort   // Q2's default: reads a QR-checked photo's or a shared file's bytes as they are within 1,200,000 bytes, else null (iOS ignores quality for a PNG, so a large screenshot stays unread); its ShrunkImage.uri is null, so remove() never deletes a pending copy
  export type ReadySlip = { assetId: string; refHash: string; image: ShrunkImage; album: string | null; origin: SlipOrigin }
  export function slipBatchBytes(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): number   // the JSON body's UTF-8 length
  export function buildSlipBatches(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): ReadySlip[][]   // at most 5 slips and 8 MiB each, in order
  // testing/fakePhotos.ts: fakePhotoLibrary({ access?, albums? (with their assets), picked?, albumsSupported? }) recording `released`, its asset(id) finding a listed album photo only by its id; fakeImageShrink({ tooLarge? }) recording `removed`
  ```
- **Waits on owner Q1:** `mediaLibraryPhotoLibrary()` on `expo-media-library` ~58.0.9, imported from `expo-media-library/legacy` (`requestPermissionsAsync`, `getAlbumsAsync`, `getAssetsAsync({ album, createdAfter, first, after, mediaType: 'photo', sortBy: [['creationTime', true]] })`, and `getAssetInfoAsync(asset).localUri` as `PhotoAsset.uri`, since an iOS `ph://` URI is not a file, also for `asset(id)`, null when none is found; re-checked at install), with its plugin, whose `photosPermission` is P3-T15's `expo-image-picker` text, so `NSPhotoLibraryUsageDescription` has one value; that text and the key in P3-T15's `locales/{th,en}.json` are rewritten to cover reading the albums the person chooses for bank slips (E2 drafts); while Q12's default stands it declares no `READ_MEDIA_IMAGES` and `albumsSupported` is false on Android. **Waits on owner Q2:** `manipulatorShrink()` on `expo-image-manipulator` ~58.0.14 (`manipulate(uri).resize(...)` to 1,600 px on the long edge, `renderAsync()`, `saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true })`; `remove()` deletes the cache file). Neither is written before the owner's yes.

- [ ] **Step 1: Stub, then write the failing tests** (the native modules through `loadModule`): `the picker path picks up to the limit at quality 0.7 in the compatible representation, without base64, and has no albums and no lookup by id`; `a picked image without an asset id is known by its uri`; `releasing a picked photo deletes its cache copy`; `photo access reads all, limited, none and undetermined from the picker's permission`; `the fake library lists photos oldest first, strictly after the watermark, ties broken by id, and finds one again only by its id`; `a picked image or a shared file within 1,200,000 bytes is used as it is, its type read from its first bytes, and a larger one, such as a 1.5 MB PNG screenshot, is not sent` (removing the result leaves the file); `batches hold at most 5 slips and 8 MiB of JSON, in order` (6 small give 5 and 1; three of 3 MiB give 2 and 1); `the byte count is the JSON body's UTF-8 length`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/photoLibrary.test.ts src/slips/imageShrink.test.ts src/slips/slipBatches.test.ts`.
- [ ] **Step 3: Implement** the picker path, shrink port, batches and fakes.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Six slips a batch; base64 length without the JSON; ignore ties; pick with `base64`: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the phone's photo, shrink and batch ports"`

---

### Task P4-T14: The scan engine and its diary tables

**Starts after:** P4-T12, P4-T13, P2-T3, P2-T18, 1D-T1, 1D-T4

**Delivers:** P4:slip-client

A32: `sendOneSlip` is P6A's share entry point.

**Files:**
- Create: `apps/app/src/slips/scanStore.ts`, `scanEngine.ts`, `oneSlip.ts`, `appSlips.ts`, `SlipsProvider.tsx`, `testing/fakeSlipEngine.ts`
- Modify: `apps/app/src/storage/migrations.ts` (migration "next", numbered after 1D-T4's 3 by the integrator), `src/storage/diaryRepository.ts` and `src/spend/v1/spendDiary.ts` (the guarded slip store), `src/spend/v1/testing/fakeDiary.ts` (a `slipScanStore` option), P2-T18's `src/wallet/home/WalletShell.tsx` (`<SlipsProvider>` around `AddTrayHost`, one line), `src/spend/v1/DeviceDiaryProvider.tsx` (the sign-out erase first awaits `dropSlipEngines()`), 1D-T1's `src/analytics/events.ts` (three emitters, R23)
- Test: `apps/app/src/slips/scanEngine.test.ts`, `scanStore.test.ts`, `oneSlip.test.ts` (Node), `SlipsProvider.render.test.tsx`; `apps/app/src/storage/diaryRepository.test.ts`; `apps/app/src/analytics/events.test.ts`; one case in `DeviceDiaryProvider.render.test.tsx`

**Interfaces:**
- Consumes: `SqlDatabase`, `SqlExecutor`, `migrateDiary`, `src/storage/testing/nodeSqlite.ts`; `DiaryStore`'s epoch guard, `useSpendDiary()`, `useDiaryView().accountId` (P2-T3); `WalletShell` (P2-T18); P4-T12's resources, `getSharedSlipResources`, `secureSaltStore`, `expoSha256` and `createSlipHasher`; P4-T13's ports and `buildSlipBatches`; P3-T1's `QrDecoder`, `slipQrIn`, `getAppQrDecoder` and `fakeQrDecoder` (A13); `trackClientEvent` (1D-T1); `V1Error` (`code`, `retryAfterSeconds`); `todayInBangkok`.
- Produces:
  ```sql
  CREATE TABLE slip_scan (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;   -- connected, start_date, daily_reading, last_daily_day, last_run_at
  CREATE TABLE slip_albums (album_id TEXT PRIMARY KEY, title TEXT NOT NULL, enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)), watermark_ms INTEGER NOT NULL, watermark_id TEXT) STRICT;
  CREATE TABLE slip_pending (asset_id TEXT PRIMARY KEY, album_id TEXT, ref_hash TEXT NOT NULL UNIQUE, uri TEXT, created_ms INTEGER NOT NULL, found_at TEXT NOT NULL) STRICT;   -- uri: a picked copy's file; null for an album photo
  CREATE TABLE slip_unreadable (asset_id TEXT PRIMARY KEY, album_id TEXT, seen_at TEXT NOT NULL) STRICT;
  CREATE TABLE slip_known (ref_hash TEXT PRIMARY KEY, seen_at TEXT NOT NULL) STRICT;
  CREATE TABLE slip_ref_outbox (ref_hash TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, queued_at TEXT NOT NULL) STRICT;
  ```
  ```ts
  // diaryRepository.ts: DiaryStore gains slipRead<T>(fn: (sql: SqlExecutor) => Promise<T>): Promise<T> and slipWrite<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>, guarded as writeImportDraft is
  // spendDiary.ts: SpendDiary gains slipScanStore(): SlipScanStore | null   // the open account's; null while no diary is ready, as importDraftStore()
  export type ScanSettings = { connected: boolean; startDate: string | null; dailyReading: boolean; lastDailyDay: string | null; lastRunAt: string | null }
  export type StoredAlbum = { id: string; title: string; enabled: boolean; watermark: { ms: number; id: string | null } }
  export type SlipScanStore = {   // over the six tables; id lists bind one json_each parameter (R57)
    settings(): Promise<ScanSettings>; saveSettings(patch: Partial<ScanSettings>): Promise<void>
    albums(): Promise<StoredAlbum[]>; setAlbums(albums: readonly StoredAlbum[]): Promise<void>; advance(albumId: string, ms: number, id: string): Promise<void>
    addPending(item: { assetId: string; albumId: string | null; refHash: string; createdMs: number; uri: string | null }): Promise<{ added: boolean; replaced: string | null }>
    //   ON CONFLICT (ref_hash) the row stays, except that a picked item replaces a picked row (added, the old copy's uri in replaced)
    pending(limit: number): Promise<{ assetId: string; albumId: string | null; refHash: string; createdMs: number; uri: string | null }[]>; dropPending(assetIds: readonly string[]): Promise<void>
    addKnown(hashes: readonly string[]): Promise<void>; isKnown(hash: string): Promise<boolean>
    addUnreadable(assetIds: readonly string[], albumId: string | null): Promise<void>; unreadable(): Promise<string[]>
    queueRef(hash: string, transactionId: string): Promise<void>; refsToSend(): Promise<{ refHash: string; transactionId: string }[]>; dropRef(hash: string): Promise<void>
    disconnect(): Promise<void>   // albums, pending and unreadable go; slip_known stays (C7)
  }
  export function createSlipScanStore(diary: Pick<DiaryStore, 'slipRead' | 'slipWrite'>): SlipScanStore   // the six tables' SQL, run only through the diary's epoch guard
  export type ScanCounts = { checked: number; total: number | null; found: number; read: number; duplicates: number; unreadable: number; paused: number; escalated: number }
  export type EngineState = { phase: 'idle' | 'scanning' | 'uploading' | 'waiting' | 'stopped' | 'done'; counts: ScanCounts; recent: SlipDraftDto[]; secondsLeft: number | null;
    stopReason: 'user' | 'quota' | 'paused' | 'offline' | 'no_decoder' | 'consent' | 'unavailable' | null; retryAt: number | null }   // a finished run's state stays until the next run starts
  export type ConnectChoice = { albums: { id: string; title: string; enabled: boolean }[]; startDate: string }
  export type SlipEngine = { state(): EngineState; subscribe(listener: () => void): () => void; connect(choice: ConnectChoice): Promise<void>; run(options?: { manual?: PhotoAsset[]; pendingOnly?: boolean }): Promise<EngineState>; stop(): void; disconnect(): Promise<void> }
  export type SlipEngineDeps = { library: PhotoLibraryPort; decoder: QrDecoder; shrink: ImageShrinkPort; resources: SlipResources; hash: SlipHasher; store: SlipScanStore; now: () => Date; today: () => string; locale: () => AiLocale; sleep?: (ms: number) => Promise<void> }
  export function createSlipEngine(deps: SlipEngineDeps): SlipEngine
  // appSlips.ts
  export function appSlipDeps(accountId: string, store: SlipScanStore, locale: () => AiLocale): SlipEngineDeps   // pickerPhotoLibrary(), getAppQrDecoder(), pickerShrink(), getSharedSlipResources(), createSlipHasher over secureSaltStore() and expoSha256(), todayInBangkok
  export function slipEngineFor(accountId: string, deps: SlipEngineDeps): SlipEngine   // one per account and store for the app's life, so a run outlives its screen; another store stops the old engine
  export function dropSlipEngines(): Promise<void>   // the sign-out erase: stops every engine, releases its pending picked copies (a failed release ignored), then forgets it
  export function SlipsProvider(props: PropsWithChildren<{ deps?: SlipEngineDeps | null; engine?: SlipEngine | null }>): JSX.Element
  export function useSlips(): { engine: SlipEngine; resources: SlipResources; library: PhotoLibraryPort; state: EngineState } | null   // null without an engine; a slip route then waits or redirects (P4-T18)
  export function useSlipDeps(): SlipEngineDeps | null   // the open diary's deps, area or not (P4-T16b's single-read refs)
  export function fakeSlipEngine(state?: Partial<EngineState>): SlipEngine & { calls: string[] }
  // oneSlip.ts, the one-image path P6A's share pipeline calls (B19, A32):
  export type OneSlipAnswer = { kind: 'sent'; result: SlipResult; retryAfterSeconds: number | null } | { kind: 'not_slip' } | { kind: 'too_large' }
  export function sendOneSlip(deps: Pick<SlipEngineDeps, 'decoder' | 'shrink' | 'hash' | 'today' | 'locale' | 'sleep'> & { resources: Pick<SlipResources, 'read'> }, input: { uri: string; origin: 'share' | 'photo' }): Promise<OneSlipAnswer>
  // events.ts: trackAlbumsConnected({ albums }), trackSlipScanFinished({ found, duplicates, unreadable, escalated }), trackAlbumsDisconnected({ albums })
  ```
- **`run`, in order** (S5 to S7, S17, S19, §6.8 steps 2 to 5): nothing while already running (`scanning`, `uploading` or `waiting`); a run is `scanning` from its call, before any await; a decoder that is not `available` stops it at once (`no_decoder`). A run checks photos, then uploads everything pending, albums connected or not; `run({ pendingOnly: true })`, P4-T15's resume, checks no photo and moves no watermark. It checks each enabled album's photos after its watermark, 50 a page, only while albums are connected; a manual run (`run({ manual })`: picker-only, default pending owner Q1, and limited access) checks only the given photos and moves no watermark. Each photo goes through `slipQrIn(decoder, uri)`: no bank slip moves the watermark and nothing else happens (the photo never leaves the phone); a known hash moves it; any other bank slip joins pending, a picked one with its copy's `uri`, and moves it (`addPending` keeps a hash's first row, so two photos of one slip are sent once, except that a new picked copy replaces an earlier one, which the phone may have removed). A picked photo's copy is released once it leaves the run without joining pending (no bank slip, a known hash, or a hash pending as an album photo) or leaves pending, a replaced copy included. Upload the oldest pending, each found again from its row: a picked copy by its `uri`, an album photo by `library.asset(id)`; one that is gone (`asset` null, or a removed copy whose shrink throws) leaves pending unmarked. The rest are shrunk (null: unreadable, dropped from pending), built into `backfill` batches of `origin: 'album'` slips (A1), each slip's `album` its stored album's title (`slip_albums.title`; null for a picked photo), with `last` only on the batch after which nothing is pending, each through `resources.read`; every shrunk image is removed after its batch, sent or not. Outcomes: `read` and `duplicate` become known and leave pending (`recent` keeps the last three drafts); `unreadable` becomes known with its photo id kept; `paused` stays pending; `over_quota` stays pending and stops the run (`quota`); `retry_after_seconds` holds the next batch until `retryAt`. A refused request (a thrown `V1Error`) keeps its batch pending: 429 `RATE_LIMITED` and 503 `SERVICE_UNAVAILABLE` wait `retryAfterSeconds` (`waiting`, `retryAt`) and send the same batch again, for at most 2 minutes, then stop `paused`; 503 `AI_PAUSED` or `IMPORTS_PAUSED` stops `paused`; 403 `AI_CONSENT_REQUIRED` stops `consent`; 404 stops `unavailable`; a lost answer or no network stops `offline` (the next run sends the batch again and the server answers `duplicate`); a diary write refused after the session moved (`StaleEpochError`, `DiaryLocked`) stops the run with nothing more sent. `stop()` ends after the batch in flight. At the end one `trackSlipScanFinished` and `lastRunAt`. `secondsLeft` is pending times the run's own seconds per uploaded slip.
- `connect` stores albums and the start date (never more than 90 days back, C10), watermarks at that date, and sends `trackAlbumsConnected`; `disconnect` stops at once, releases the pending picked copies, keeps the known hashes (C7) and sends `trackAlbumsDisconnected`.
- **`SlipsProvider`** is mounted once, in P2-T18's `WalletShell` around `AddTrayHost`, so Home, the add tray and every slip route share one engine and store. Without props its deps are `appSlipDeps(accountId, store, locale)` from `useDiaryView().accountId` and `useSpendDiary()?.slipScanStore()` while a diary is ready (else null), and its engine is `slipEngineFor(accountId, deps)`; P4-T18 limits the engine to the slips area.
- `sendOneSlip` (B19, A1, A32): no bank slip QR is `not_slip` and a shrink of null `too_large`, each with nothing sent; else one `live` batch of one with the given origin and `last: false` (the sheet shows the draft, so no push); a 429 is waited out once (its `retryAfterSeconds`, at most 10 s) and sent again; any other refusal throws `V1Error` with its status and code (403 `AI_CONSENT_REQUIRED`, 404 `NOT_FOUND`, 429 `RATE_LIMITED`, 503 `AI_PAUSED`, `IMPORTS_PAUSED` or `SERVICE_UNAVAILABLE`), as do network and session failures.

- [ ] **Step 1: Stub, then write the failing tests.**
  - `diaryRepository.test.ts`: `the next diary migration adds the slip tables, and an older diary migrates to it`; `a scan write after the session moved is refused` (`StaleEpochError`, nothing written).
  - `scanStore.test.ts` (over a `DiaryStore` on `nodeSqlite.ts`): `pending, known and unreadable round-trip, and disconnecting keeps only the known hashes`; `each id list binds one JSON parameter` (a recording executor sees exactly one bound parameter for 1,001 ids).
  - `scanEngine.test.ts` (fakes for every port, the diary through `nodeSqlite.ts`): `a run finds slips added since the watermark and never reads a photo without a bank slip QR` (each slip's `album` is its album's title); `a manual pick runs with no album connected, sends its slips with album null and moves no watermark`; `a send-only run uploads what is pending and checks no photo, albums connected or not`; `two photos of one slip are sent once, and the scan goes on`; `a slip picked again while pending is sent from the new copy, and the old copy is released`; `a pending photo that is gone leaves pending, and the batch before it still says last`; `a known slip is skipped before upload, and the server's duplicate makes it known`; `outcomes: read and duplicate become known, unreadable keeps the photo's id, paused stays pending, over quota stops the run`; `a batch refused because another reader holds the lease waits its 5 seconds and is read once`; `AI consent turned off stops the run and says why` (403: `consent`, the batch pending); `a paused gate stops the run paused, and a closed slip import unavailable`; `a run cut off mid-upload resumes in the next run, and no slip is lost or doubled` (Review Focus 4: the second batch's answer is lost after the server wrote it; a new engine on the same store, over a library that finds a photo only by `asset(id)`, resends; each draft exists once and no slip is sent more than twice); `a manual pick cut off mid-upload is sent by the next run with no album connected` (the next `run()` reads the kept copies by their `uri` and releases each once it leaves pending); `every picked photo's copy is released once it leaves the run or leaves pending`; `only the last batch of a run says last`; `the server's wait holds the next batch back`; `stop ends the run after the batch in flight`; `progress counts photos and slips and estimates the time left from the run's pace`; `every shrunk image is removed after its batch, sent or not`; `the diary keeps no image, no QR payload and no reference, only hashes, photo ids and picked copies' file paths` (the anti-goal: the sentinel base64 and reference are absent from every TEXT column of the six tables, from every `console` line (spied) and from every analytics event); `disconnecting stops at once and keeps the known hashes (C7)`; `a start date more than 90 days back is moved to 90 days back (C10)`; `the slip events are sent once each with counts only`; `without a decoder that can read photos a run sends nothing and says why (S19)` (`noQrDecoder`).
  - `oneSlip.test.ts`: `one shared slip is hashed and sent as a live batch of one with its origin and last false, and answered as the server read it`; `a photo without a bank slip QR, or too large to send, sends nothing`; `a 429 is waited out once, and any other refusal throws its code`; `the one-slip path keeps nothing of the image` (no diary write, and no base64, payload or reference in a `console` line or an analytics event).
  - `SlipsProvider.render.test.tsx`: `SlipsProvider without props runs the signed-in account's engine over the open diary`; `DeviceDiaryProvider.render.test.tsx`: `the sign-out erase stops the account's slip engine and deletes its pending picked copies`.
  - `events.test.ts`: `the slip emitters send §7's names with counts only`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/scanEngine.test.ts src/slips/scanStore.test.ts src/slips/oneSlip.test.ts src/storage/diaryRepository.test.ts src/analytics/events.test.ts` and `npm run test:render -w gogospend-app -- src/slips/SlipsProvider.render.test.tsx src/spend/v1/DeviceDiaryProvider.render.test.tsx`.
- [ ] **Step 3: Implement** the migration, guarded store, engine, engine cache, one-slip path, provider, its `WalletShell` line and emitters.
- [ ] **Step 4: Run them and see them pass,** with the diary and `WalletShell` suites unchanged.
- [ ] **Step 5: Mutation check.** Send photos without a QR; keep the connected check for manual runs; check albums in a send-only run; keep a gone photo pending; send only what this run found; insert a repeated pending hash blindly; skip the known check; treat paused as known; treat a 429 as `offline`; keep shrunk images; mark every batch `last`; send a shared slip as `backfill`; write the slip tables outside the guard: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the resumable slip scan engine and its diary tables"`

---
### Task P4-T15: Daily reading (D36): off by default, once a Bangkok day

**Starts after:** P4-T14

**Files:**
- Create: `apps/app/src/slips/dailyReading.ts`, `apps/app/src/slips/useSlipsUpkeep.ts`
- Modify: `apps/app/src/slips/SlipsProvider.tsx` (runs `useSlipsUpkeep`)
- Test: `apps/app/src/slips/dailyReading.test.ts` (Node), `apps/app/src/slips/useSlipsUpkeep.render.test.tsx`

**Interfaces:**
- Consumes: `SlipEngine`, `SlipEngineDeps`, `SlipScanStore`, `SlipsProvider` (P4-T14); `SaltStore` (P4-T12), whose read fails while the phone is locked; `AppState`; base `useAiCompanion().preferences`; `todayInBangkok` (base).
- Produces:
  ```ts
  export const DAILY_READING_TASK = 'jotbun.daily-slips'
  export type BackgroundRunPort = { register(): Promise<void>; unregister(): Promise<void> }
  export const noBackgroundRuns: BackgroundRunPort   // Q3's default
  export type DailyOutcome = 'ran' | 'off' | 'not_due' | 'locked' | 'not_connected' | 'ai_off'
  export function runDailyIfDue(deps: { engine: SlipEngine; store: SlipScanStore; today: () => string; unlocked: () => Promise<boolean>; aiConsent: () => boolean }): Promise<DailyOutcome>
  export function setDailyReading(deps: { store: SlipScanStore; runs: BackgroundRunPort }, on: boolean): Promise<void>
  export function useSlipsUpkeep(slips: { engine: SlipEngine | null; deps: SlipEngineDeps | null }): void   // SlipsProvider runs it, so no screen mounts a hook conditionally: at mount and every return to the foreground, while there is an engine, runDailyIfDue, then the resume (P4-T16b adds the slip-ref flush, P4-T18 the slip import check)
  ```
- Rules (D36, B12, B13; defaults pending owner Q3, Q5, Q6): off until turned on; at most once a Bangkok day (`lastDailyDay`, saved after a run); only while the salt can be read (unlocked), else `locked` with the day left open; with AI consent off (`preferences?.companion !== true`) `ai_off` and nothing runs; the run is the engine's `backfill` run.
- **The resume** (Review Focus 4): when daily reading did not run, `engine.run({ pendingOnly: true })` while `slip_pending` has a row, AI consent is on and the engine's last stop was neither `user` nor `quota`, so slips cut off by lost signal or a closed app go at the next open, albums connected or not, and no new photo is read (D36).
- **Waits on owner Q3:** `expoBackgroundRuns()` on `expo-background-task` ~58.0.11 and `expo-task-manager` ~58.0.12: `TaskManager.defineTask(DAILY_READING_TASK, ...)` at module scope running `runDailyIfDue` and answering `BackgroundTaskResult.Success` or `Failed`; `BackgroundTask.registerTaskAsync(DAILY_READING_TASK, { minimumInterval: 1440 })` when turned on and `unregisterTaskAsync` when off (docs checked 25 October 2026; re-checked against the installed types).

- [ ] **Step 1: Stub, then write the failing tests:** `daily reading is off by default (D36)`; `on, it runs once a Bangkok day at the first chance`; `a locked phone waits and keeps the day open (B12)`; `it reads with the backfill allowance (B13)`; `turning it off unregisters the background run`; `a phone that is not connected does nothing`; `with AI consent off daily reading does not run (ai_off)`; and in the render test `the upkeep checks daily reading when the app opens and when it returns to the foreground, not on every render` and `the next open sends the pending slips without checking new photos, albums connected or not, and nothing without AI consent or a pending slip, or after a stop by the person or the allowance`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/dailyReading.test.ts` and `npm run test:render -w gogospend-app -- src/slips/useSlipsUpkeep.render.test.tsx`.
- [ ] **Step 3: Implement** the rule, switch, resume, hook and the provider's call.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Twice a day; ignore the lock; ignore AI consent; purpose `live`; a full run in place of the resume: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** A background run on a real phone is SKIPPED until Q3 and a development build. `git commit -m "Add daily slip reading, off by default"`

---

### Task P4-T16a: Review, the summary and the inbox count on the phone

**Starts after:** P4-T14, 1D-T1, 1D-T5

**Files:**
- Create: `apps/app/src/slips/slipReview.ts`, `slipSummary.ts`, `useSlipInbox.ts`
- Modify: 1D-T1's `apps/app/src/analytics/events.ts` (`trackSlipReviewConfirmed`), `src/spend/v1/spendDiary.ts` (`DiaryView.slipInboxOpen`, read in the view's refresh from the synced `slip_inbox`, 0 without one, S1), `src/spend/v1/testing/fakeDiary.ts` (the same field, default 0)
- Test: `apps/app/src/slips/slipReview.test.ts`, `slipSummary.test.ts` (Node), `useSlipInbox.render.test.tsx`, `src/analytics/events.test.ts`

**Interfaces:**
- Consumes: `SlipResources` (P4-T12); `ScanCounts` (P4-T14); the diary's outbox and `appliedRevision`, 1D-T5's `useRefreshOnRevision`; `trackClientEvent` (1D-T1); `todayInBangkok`.
- Produces:
  ```ts
  export type SlipSuggestion = { type: 'expense' | 'income' | 'transfer'; walletId: string | null; sourceWalletId: string | null; destinationWalletId: string | null; categoryId: string | null; payee: string | null }
  export function classifySlipDraft(draft: SlipDraftDto, accounts: readonly SlipAccountDto[]): SlipSuggestion   // S2, from the current mappings
  export type DuplicateHint = { kind: 'record' | 'unsent'; id: string }
  export type ReviewRow = { draft: SlipDraftDto; suggestion: SlipSuggestion; ticked: boolean; duplicate: DuplicateHint | null; needsCategory: boolean; blocked: 'before_tracking_start' | 'future' | null }
  export type UnsentEntry = { id: string; amount_minor: string; occurred_on: string; created_at: string }
  export type ReviewWallet = { id: string; tracking_start: string; archived: boolean }
  export function buildReview(drafts: readonly SlipDraftDto[], accounts: readonly SlipAccountDto[], unsent: readonly UnsentEntry[], wallets: readonly ReviewWallet[], today: string): ReviewRow[]
  export type ReviewFilter = 'all' | 'expense' | 'income' | 'transfer' | 'needs_look'
  export function filterReview(rows: readonly ReviewRow[], filter: ReviewFilter, search?: string): ReviewRow[]
  export function reviewDays(rows: readonly ReviewRow[]): { day: string; rows: ReviewRow[] }[]   // newest day first, rows by time
  export type SlipEdit = { type?: SlipSuggestion['type']; amountMinor?: string; payee?: string | null; walletId?: string | null; sourceWalletId?: string | null; destinationWalletId?: string | null; categoryId?: string | null; note?: string | null }
  export function confirmItem(row: ReviewRow, edit: SlipEdit | null, newId: () => string): SlipConfirmRequest['drafts'][number] | null   // null while a field is missing or the row is blocked
  export type ConfirmProgress = { done: number; total: number; failed: number; refused: string[] }   // refused: draft ids a 422 named
  export function confirmReviewed(rows: readonly ReviewRow[], edits: ReadonlyMap<string, SlipEdit>, deps: { resources: SlipResources; online: () => boolean; newId: () => string; onProgress?: (p: ConfirmProgress) => void }): Promise<ConfirmProgress>
  export type SlipSummary = { found: number; photos: number; albums: number; byType: Record<SlipSuggestion['type'], { count: number; totalMinor: string }>; duplicates: number; unreadable: number; guessed: number; needCategory: number;
    topCategories: { categoryId: string; count: number }[]; repeatIncome: { payee: string; amountMinor: string; times: number } | null; months: { month: string; count: number }[] }
  export function summarizeSlips(rows: readonly ReviewRow[], run: ScanCounts | null, albums: number, unreadable: number, month: string | null): SlipSummary
  export function useSlipInbox(): { count: number }   // useDiaryView().slipInboxOpen
  export function trackSlipReviewConfirmed(p: { confirmed: number }): void
  ```
- `classifySlipDraft` (S2) matches each side to the accounts by bank and last four: both on wallets (W from, V to) is a `transfer` W to V without category; only `from` mapped is an `expense` out of its wallet, payee `to.name`; only `to` mapped is `income` into its wallet, payee `from.name`; neither keeps the draft's direction with no wallet. A category the vault guessed for the other direction is dropped (the row needs a category). `buildReview` (§6.8 step 10): all ticked except possible duplicates (the server's `duplicate_of`, or an unsent entry with the same amount and date), rows needing a category (a payment to a person, S3) and blocked rows: dated before the `tracking_start` of a wallet the row uses (`before_tracking_start`) or after Bangkok's today (`future`). `confirmItem` writes the payee as the record's `merchant` (so S3's own-history guess learns) and never `source` or `slip_ref_id` (the vault sets both). `confirmReviewed` (B10): online only; ticked, complete rows in batches of 50, one command each; a 409 batch reloads drafts and goes on without the ones gone; a 422 naming `drafts[<i>].transaction.<field>` unticks that row, keeps it with its reason and sends the rest once more under a new command id; one `trackSlipReviewConfirmed` at the end and no `record_saved` (S18).

- [ ] **Step 1: Stub, then write the failing tests:** `a slip between two mapped accounts is a transfer, a mapped sender pays out, a mapped receiver takes in, and an unmapped side has no wallet`; `a received slip whose receiver is a mapped account is income into that wallet, paid by the sender` (Review Focus 2: a draft written `out` from an unmapped employer to `kbank 1234`, now mapped; its expense guess dropped); `review starts with everything ticked except possible duplicates and payments to people`; `a slip older than its wallet's start, or dated after today, is not ticked and says why` (Review Focus 1); `a draft matching an unsent record on this phone is a possible duplicate`; `filters, search and day groups follow sl-review`; `the payee becomes the record's merchant, and no source or slip ref is sent`; `confirm sends batches of at most 50, one command each, online only` (120 rows: 50, 50, 20; offline: nothing); `a batch refused as stale reloads and goes on without the drafts already gone`; `a batch refused for one row is sent again without it` (422 on `drafts[3].transaction.occurred_on`: 49 saved under a new command id, that row unticked with its reason); `one slip_review_confirmed with the count, and no record_saved`; `the summary counts and sums by type exactly and by month, and names a repeated income` (three ฿35,000 from one payer: `times: 3`); in the render test `the inbox count follows the synced inbox and refreshes when the revision moves`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/slipReview.test.ts src/slips/slipSummary.test.ts src/analytics/events.test.ts` and `npm run test:render -w gogospend-app -- src/slips/useSlipInbox.render.test.tsx`.
- [ ] **Step 3: Implement** the models, the view's count, hook and emitter.
- [ ] **Step 4: Run them and see them pass,** with the diary suites unchanged.
- [ ] **Step 5: Mutation check.** Tick duplicates; tick blocked rows; keep the vault's direction when only the receiver is mapped; resend a 422 batch whole; batch 51; `record_saved` per record: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add slip review, the summary and the inbox count on the phone"`

---

### Task P4-T16b: Single-read slip refs

**Starts after:** P4-T15, P3-T17 (P3:tray-photo), 1D-T5

A27: P3's `onPhotoSaved` is where a tray photo meets its saved record. The salt read and `POST /v1/slips/refs` answer before slip import opens (S13), so refs are kept whether or not the slips area is on.

**Files:**
- Create: `apps/app/src/slips/singleReadRefs.ts`
- Modify: `apps/app/src/slips/useSlipsUpkeep.ts` (the ref flush), P3-T17's `apps/app/src/wallet/photos/trayPhotoSave.ts` (only `useTrayPhotoSave().onPhotoSaved`: it also calls `rememberSlipRef` once for a set `slipQr`, through `useSlipDeps()`)
- Test: `apps/app/src/slips/singleReadRefs.test.ts` (Node); new cases in `useSlipsUpkeep.render.test.tsx`, P3's `src/wallet/photos/AttachStep.render.test.tsx` and `src/wallet/bunai/SlipRead.render.test.tsx`

**Interfaces:**
- Consumes: `SlipHasher`, `recordRef` (P4-T12); `SlipScanStore`, `useSlipDeps` (P4-T14); `useSlipsUpkeep` (P4-T15); `PickedPhoto.slipQr` (P3-T15), and P3-T17 (P3:tray-photo)'s `TrayPhotoSave` (`photo: PickedPhoto | null`, `slipQr`), its host and `useTrayPhotoSave()` (P3-T17), unchanged but for the call; the diary's outbox and 1D-T5's `useRefreshOnRevision`.
- Produces:
  ```ts
  export function rememberSlipRef(deps: { store: SlipScanStore; hash: SlipHasher }, slip: SlipQr, transactionId: string): Promise<void>   // never throws
  export function flushSlipRefs(deps: { store: SlipScanStore; resources: Pick<SlipResources, 'recordRef'>; acknowledged: (transactionId: string) => Promise<boolean> }): Promise<number>
  ```
- `rememberSlipRef` adds the hash to `slip_known` at once and to `slip_ref_outbox`; a salt, hash or diary failure changes nothing and is swallowed, so the saved record stays as it is (the album scan later reads that slip as new, and review marks it a possible duplicate). `flushSlipRefs` posts each one whose record is acknowledged and drops it on 204 or 404; the upkeep runs it at mount, at each return to the foreground and after each applied revision whenever `useSlipDeps()` is not null.

- [ ] **Step 1: Stub, then write the failing tests:** `singleReadRefs.test.ts`: `a single read's slip is known at once, and its reference is sent after its record is acknowledged` (the diary holds only the hash and the record id, never the image, the QR payload or the reference); `a single read's slip ref is remembered while slip import is closed` (`fakeSlipResources({ slipImportOn: false })`: the salt answers and the drafts route is 404); `a failed salt read leaves the saved record unchanged` (nothing queued, nothing thrown). `SlipRead.render.test.tsx`: `a slip read with a bank slip QR, used and saved, remembers its slip ref once, though the photo was dropped`; `closing the tray unsaved remembers nothing`; `a slip read whose photo had no bank slip QR remembers nothing`. `AttachStep.render.test.tsx`: `saving a record whose photo was a bank slip remembers its slip ref once`. `useSlipsUpkeep.render.test.tsx`: `slip refs are flushed with the slips area off`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/singleReadRefs.test.ts` and `npm run test:render -w gogospend-app -- src/slips/useSlipsUpkeep.render.test.tsx src/wallet/photos/AttachStep.render.test.tsx src/wallet/bunai/SlipRead.render.test.tsx`.
- [ ] **Step 3: Implement** the refs, the flush and the call in `onPhotoSaved`.
- [ ] **Step 4: Run them and see them pass,** with P3's other tray cases unchanged.
- [ ] **Step 5: Mutation check.** Post a ref before acknowledgement; remember a ref only while the save holds a photo (a slip read releases it); let a salt failure throw: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Remember a single slip read's reference so album scans skip it"`

---

### Task P4-T17: Push on the phone: the token, taps behind the lock, and the permission

**Starts after:** P4-T12, P2-T33

**Files:**
- Create: `apps/app/src/slips/push/pushRegistration.ts`, `pushRouting.ts`, `PushHost.tsx`, `notificationPermission.ts`
- Modify: `apps/app/app/_layout.tsx` (`<PushHost />` as the first child inside `WalletRoot`, under P2-T33's lock gate), `apps/app/app.json` (plugins += `"expo-notifications"`)
- Test: `apps/app/src/slips/push/pushRegistration.test.ts`, `pushRouting.test.ts` (Node), `PushHost.render.test.tsx`

**Interfaces:**
- Consumes, through a port: `expo-notifications` 58.1.5's `getExpoPushTokenAsync({ projectId })` (`{ type: 'expo', data }`), `getPermissionsAsync`, `requestPermissionsAsync`, `setNotificationHandler` (`shouldShowBanner`, `shouldShowList`, `shouldPlaySound`, `shouldSetBadge`), `addNotificationResponseReceivedListener`, and `getLastNotificationResponse()` and `clearLastNotificationResponse()` (the `Async` forms are deprecated in 58.1.5); `expo-constants`' `expoConfig.extra.eas.projectId`; `useLockCover()` (P2-T13; its value comes from P2-T33's `LockGate`); `getSharedSlipResources()`, `expoSha256` (P4-T12); base `subscribeSession` and `getV1SessionSnapshot()`; `KeyValueStore`, `walletDeviceStore()` (P2-T3).
- Produces:
  ```ts
  export type PushPermission = 'granted' | 'denied' | 'undetermined'
  export type PushTokenPort = { permission(): Promise<PushPermission>; request(): Promise<PushPermission>; token(projectId: string): Promise<string> }
  export function expoPushTokens(loadModule?: () => Promise<typeof import('expo-notifications')>): PushTokenPort
  export function registerPushIfNeeded(deps: { port: PushTokenPort; projectId: string | null; resources: Pick<SlipResources, 'registerDevice'>; store: KeyValueStore; platform: 'ios' | 'android'; language: 'th' | 'en' | 'vi'; slipNotices: boolean; session: string | null; nowMs: number }): Promise<'registered' | 'unchanged' | 'no_project' | 'not_allowed' | 'failed'>   // session: SHA-256 hex of the session binding
  export function routeForPush(data: PushData): Href | null   // /spend/slips/review; /spend/import; /settings/privacy; /spend/recap/<YYYY-MM>
  export function PushHost(): null
  export function useNotificationPermission(): { status: PushPermission; ask(): Promise<PushPermission>; openSettings(): Promise<void> }
  ```
- Rules: no EAS project id (until D33) answers `no_project` and sends nothing. `registerPushIfNeeded` only reads the permission (sl-done and sl-settings ask, P4-T21); a denied one sends nothing. `PUT /v1/devices` goes when the token, platform, language, slip-notice switch or session (the SHA-256 of `getV1SessionSnapshot().binding`, never the binding) differs from the record kept in the device store, or the record is 7 days old (Vietnamese sends `en`). The switch is `walletDeviceStore()`'s `slip-notices`, default on. `PushHost` uses `getSharedSlipResources()` and registers again after each `subscribeSession` change. Its handler is the app's only one: while the app is active, `slips_ready` goes to the list only (`shouldShowBanner: false`, `shouldShowList: true`, no sound), the other push kinds show a banner and the list without sound, and a notification without `PushData` (P2-T36's local reminders) shows nothing, as today. A tap or the cold-start response keeps its route and navigates once `useLockCover().hidden` is false, then clears it. Device checks (a real token, delivery, the lock-screen look) are SKIPPED until EAS, APNs and FCM exist.

- [ ] **Step 1: Stub, then write the failing tests:** `without a project id nothing is registered`; `the token is registered at sign-in, and again only when something changed or a week passed`; `a new session registers again with the same token`; `registering never asks for the permission, and a denied one registers nothing`; `slip notices are on by default`; `Vietnamese registers English`; `each push kind opens its screen, and anything else opens nothing`; and in the render test `a tap waits for the lock to open before it routes`, `while the app is open slips ready goes only to the list, other pushes show a banner, and a local reminder stays hidden`, `the cold-start response is routed once and cleared`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/slips/push/pushRegistration.test.ts src/slips/push/pushRouting.test.ts` and `npm run test:render -w gogospend-app -- src/slips/push/PushHost.render.test.tsx`.
- [ ] **Step 3: Implement** the port, registration, routing, host, permission hook, layout child and plugin entry (options checked against the installed plugin).
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Route under the lock; register without a project id; ignore the session; show the banner while active: each fails its case.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Register push tokens and route push taps behind the lock"`

---
### Task P4-T18: Connecting albums: sl-intro, sl-permission, es-photos-denied and sl-albums

**Starts after:** P4-T12, P4-T14, P4-T15, P3-T14 (P3:ai-area), P2-T1, P2-T3, P2-T8, P2-T10, P2-T11, P2-T13, P2-T16

**Delivers:** P4:slips-area

**Files:**
- Create: `apps/app/src/slips/slipsArea.ts`; `apps/app/src/wallet/slips/copy.ts` (`SLIPS_COPY`), `useSlipsCopy.ts`, `bankNames.ts`, `SlipIntroScreen.tsx`, `SlipPermissionScreen.tsx`, `PhotosDeniedScreen.tsx`, `SlipAlbumsScreen.tsx`; `apps/app/src/dev/catalogue/slips/index.ts` (`SLIP_SECTIONS`, `STATEMENT_SECTIONS`), `connectSections.tsx`
- Modify: P4-T12's routes `apps/app/app/spend/slips/index.tsx`, `permission.tsx`, `albums.tsx`; `apps/app/src/slips/SlipsProvider.tsx` (an engine only while `useSlipsArea()`); P4-T15's `apps/app/src/slips/useSlipsUpkeep.ts` (the slip import check); `apps/app/src/testing/renderSetup.ts` (slip import counts as open before each render test); `apps/app/src/config/featureFlags.ts` (`RedesignArea` += `'slips' | 'statements'`, outside `APPROVED`) and its test; `apps/app/src/dev/catalogue/registry.tsx` (spreads both section lists last)
- Test: `apps/app/src/wallet/slips/Connect.render.test.tsx`, `apps/app/src/slips/slipsArea.test.ts` (Node); one case in `useSlipsUpkeep.render.test.tsx`

**Interfaces:**
- Consumes: P2's `WalletText` (T1), `DraftTable`, `WalletT`, `tableT` and `walletDeviceStore()` (T3), `mountWallet` (T8), `IconButton` (T10), `WalletCard` (T11), `PrimaryButton` and `TextLink` (T13), `useAddTray()` (T16); `SlipsProvider`, `useSlips()`, `useSlipDeps()` (P4-T14); `useSlipsUpkeep` (P4-T15); `bankAlbums()`, `accounts()`, `SLIP_SCAN_HREF`, `SLIP_MANUAL_SCAN_HREF` (P4-T12); `PhotoLibraryPort` (P4-T13); `QrDecoder`, `getAppQrDecoder` (P3-T1); P3-T14's `AiConsentTray` (P3-T14, P3:ai-area); base `useAiCompanion().preferences` and `useActiveLocale`; `trackPermissionDenied` (1D-T1).
- Produces: `useSlipsCopy(): WalletT` (`tableT(SLIPS_COPY, useActiveLocale())`); `slipsAreaOn(decoder?: QrDecoder): boolean` (the `slips` area and `(decoder ?? getAppQrDecoder()).available`, S19); `useSlipsArea(): boolean`, `slipsAreaOn()` and whether slip import is open on this server, the one switch every slip entry point reads (A10: the slip routes, Home's card, the Settings row and the provider's engine; P6B-T15 adds its rollout inside it); `useSlipsAreaKnown(): boolean`; `checkSlipImportOpen(deps: { resources: Pick<SlipResources, 'accounts'>; store: KeyValueStore }): Promise<void>`; `setSlipImportOverride(open: boolean | null): void` (tests only); `SlipIntroScreen`, `SlipPermissionScreen`, `PhotosDeniedScreen`, `SlipAlbumsScreen` (each `(props: { now?: Date }) => JSX.Element`); `THAI_BANK_NAMES: Readonly<Record<ThaiBankKey, string>>` in Thai (the boards' กสิกรไทย, ไทยพาณิชย์ and กรุงไทย; drafts: ธนาคารกรุงเทพ, ทีทีบี, กรุงศรี, ออมสิน, ธอส., ธ.ก.ส., เกียรตินาคินภัทร, ซีไอเอ็มบี ไทย, ยูโอบี, แลนด์ แอนด์ เฮ้าส์, ทิสโก้, ไอซีบีซี (ไทย), ไทยเครดิต, ธนาคารอิสลาม, อื่น ๆ) and English drafts in key order (Bangkok Bank, Kasikornbank, Krungthai, ttb, SCB, Krungsri, GSB, GH Bank, BAAC, Kiatnakin Phatra, CIMB Thai, UOB, LH Bank, TISCO, ICBC (Thai), Thai Credit, Islamic Bank, Other).
- **Slip import open** (S13): `checkSlipImportOpen` calls `accounts()`; an answer keeps `slip-import-open` `'1'` in `walletDeviceStore()`, a `V1Error` 404 removes it, and any other failure (offline, 401, 5xx) changes nothing. `useSlipsArea()` reads the kept value once per process and follows each check, false until it is `'1'`; `useSlipsAreaKnown()` is true once that value has been read or overridden. `useSlipsUpkeep` runs the check at mount, when the account changes and at a return to the foreground an hour or more after the last, whenever `useSlipDeps()` is not null (area or not). `renderSetup.ts` sets the override true before each render test, so other suites run unchanged; this task's slip import cases clear it.
- **Flow** (§5.2, §6.8 step 1): `/spend/slips` shows sl-intro while not connected and sl-settings once connected (P4-T21). sl-intro's button opens `AiConsentTray` first when the read preferences say `companion: false` (§5.2; a paused AI or unread preferences do not ask again, and a 403 stops the run with `consent` instead), then sl-permission. sl-permission asks the phone: `all` leads to sl-albums; `limited` to the manual pick (`library.pick(20)`, `engine.run({ manual })`, `SLIP_MANUAL_SCAN_HREF`); `none` to es-photos-denied with one `trackPermissionDenied({ permission: 'photos' })`. Without album support (`library.albumsSupported` false; default pending owner Q1) sl-intro shows its picker-only lines and its button opens the picker at once (the picker needs no library permission), and the picked photos start `engine.run({ manual })` and open `SLIP_MANUAL_SCAN_HREF`. While a run is going, a pick button opens it (`SLIP_SCAN_HREF`) instead of the picker, since `run` does nothing then. sl-albums lists the catalog's bank albums found on the phone first (title match ignoring case), then "เลือกอัลบั้มอื่น" for the rest; Screenshots is off by default (§6.8); the start date defaults to the 1st of the month two months back and never goes past 90 days (C10); "เริ่มหาสลิป" runs `engine.connect` and opens `SLIP_SCAN_HREF`, which starts the run (P4-T19).
- **Bindings:** sl-intro's card art is the person's first wallet (`WalletCard`, variant `stack`, hidden from screen readers); es-photos-denied's "เปิดการตั้งค่า" is `library.openSettings()` and "พิมพ์รายการเองแทน" `useAddTray().open({ type: 'expense' })`, with "ตอนนี้" on the current access level; sl-albums shows each album's switch, title and count, the total and the start date.
- **Copy** (`slips.<name>`): every visible line of the four boards, verbatim and in Thai first, under keys named by meaning (screen-reader labels included); the promise lines `ไม่เก็บรูปสลิป เก็บแค่ยอด วันเวลา และชื่อ` and `เมื่ออนุญาต บันส่งเฉพาะรูปที่เป็นสลิปไปให้ AI อ่าน แล้วลบรูปทิ้งทันที ไม่ใช้ฝึก AI` are default pending owner Q16; "ส่งอะไรไปบ้าง" opens `AiConsentTray` read-only. Drafts: `pickNote` เลือกสลิปให้บันอ่านได้ครั้งละไม่เกิน 20 รูป; `otherAlbum` เลือกอัลบั้มอื่น. Picker-only (Q1), sl-intro's daily promise สลิปย้อนหลัง และสลิปใหม่วันละครั้ง gives way to `pickNote` and its button เชื่อมอัลบั้มรูป to the draft `pickSlips` เลือกสลิป. On Android the settings path line is a draft of the same form.
- Sections: `sl-intro`, `sl-intro-picker-only`, `sl-permission`, `es-photos-denied`, `sl-albums` (titles `Bun Wallet slips: <name>`). Every slip route renders its screen while `useSlipsArea()` and `useSlips()` has an engine, nothing while the kept answer is unread or no diary is ready (a push tap or quick action at a cold start waits), and `<Redirect href="/spend" />` once the area is known to be off.

- [ ] **Step 1: Stub each screen (an empty `View`) in its route, then write the failing tests.** `slipsArea.test.ts`: `the slips area is on only with the slips redesign area and a decoder that can read photos (S19)` (`noQrDecoder` and `fakeQrDecoder({})`); `slip import is kept open after the slip accounts route answers, closed after its 404, and unchanged by any other failure`. `useSlipsUpkeep.render.test.tsx`: `slip import is checked at mount and at a return to the foreground an hour later, with the slips area off`. In `Connect.render.test.tsx` (light and dark, `th` and `en`, `mountWallet` with `fakeSlipEngine`, `fakeSlipResources` and `fakePhotoLibrary`):
  - `sl-intro draws the steps and the promises, and asks for AI consent first only when the person has not agreed` (not while AI is paused or the preferences are unread).
  - `sl-permission follows the phone's answer: all to albums, limited to picking, none to es-photos-denied with one permission_denied`.
  - `without album support sl-intro promises no daily reading, and the picked photos start a run and open the scan` (the engine's `run` received the picked assets, and the route opened with `run=manual`; while a run is going the button opens it and no picker).
  - `with the slips area off there is no engine, and the slip routes redirect to /spend`; `the slips area stays off while slip import is closed on the server` (override cleared, `fakeSlipResources({ slipImportOn: false })`: no engine, the routes redirect; with `slipImportOn: true` the check at mount opens them); `a slip route opened before the kept answer or the diary is ready waits, and redirects only once the area is known to be off`.
  - `es-photos-denied opens the phone's settings and offers typing a record instead`.
  - `sl-albums lists the bank apps' albums first with their counts, keeps Screenshots off, and never starts more than 90 days back`.
  - `starting connects the albums and opens the scan`.
  - `at AX5 nothing is cut off, every control is at least 44 pt, and screen readers read each choice and album switch by name and state`.
  - `featureFlags.test.ts`: `slips and statements are off by default and on when named or with all`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:render -w gogospend-app -- src/wallet/slips/Connect.render.test.tsx src/slips/useSlipsUpkeep.render.test.tsx` and `npm run test:unit -w gogospend-app -- src/config/featureFlags.test.ts src/slips/slipsArea.test.ts`.
- [ ] **Step 3: Implement** the switch, the slip import check, the provider's area check, screens, copy and its hook, bank names, sections and routes.
- [ ] **Step 4: Run them and see them pass,** with `CatalogueScreen.render.test.tsx` and P2-T3's `draftText.test.ts` (it scans every `src/wallet/**/copy.ts`).
- [ ] **Step 5: Mutation check.** Skip the consent tray, or ask on `enabled`: the intro case fails. Run a manual pick only once connected: the picker case fails. Screenshots on by default: the albums case fails. Allow 120 days back: the 90-day case fails. Ignore the decoder: the area case fails. Ignore the kept answer, or keep it after a 404: the slip import cases fail. Redirect before the kept answer is read: the cold-start case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the slip connect screens behind the slips area"`

---

### Task P4-T19: Scanning and the summary: sl-scanning and sl-summary

**Starts after:** P4-T16a, P4-T18

**Delivers:** P4:scan-route

A3, A32: P6A's scan quick action and widget open this route.

**Files:**
- Create: `apps/app/src/wallet/slips/SlipScanningScreen.tsx`, `SlipSummaryScreen.tsx`, `apps/app/src/dev/catalogue/slips/scanSections.tsx`
- Modify: P4-T12's routes `apps/app/app/spend/slips/scan.tsx`, `summary.tsx`; `src/wallet/slips/copy.ts`; `src/dev/catalogue/slips/index.ts` (the sections); P2-T3's `draftText.test.ts` (`LATIN_LINES` += `slips.repeatTimes`)
- Test: `apps/app/src/wallet/slips/Scan.render.test.tsx`

**Interfaces:**
- Consumes: P4-T18's kit, copy, `AiConsentTray` and `useSlipsArea()`; `WalletAmount` (P2-T10); `useSlips()`, `EngineState` (P4-T14); `buildReview`, `summarizeSlips` (P4-T16a); the diary's wallets and its outbox for unsent entries; `todayInBangkok`; `resources.drafts()` and `accounts()`, `SLIPS_HREF`, `SLIP_SCAN_HREF`, `SLIP_MANUAL_SCAN_HREF` (P4-T12); `useAddTray()` (P2-T16); base `useAiCompanion().preferences`.
- Produces: `SlipScanningScreen(): JSX.Element`, `SlipSummaryScreen(props: { now?: Date }): JSX.Element`, and the scan route: `SLIP_SCAN_HREF` starts a slip check. It waits and redirects as P4-T18's routes do. When the read preferences say `companion: false` it opens `AiConsentTray` before any run it starts (agreeing goes on; closing returns to `/spend`). Only `scanning`, `uploading` and `waiting` count as a run going, and the route then shows sl-scanning over it. Opened with `run=manual` (`SLIP_MANUAL_SCAN_HREF`, from P4-T18's pick flows, which have already called `engine.run({ manual })`), it shows that run, ended or not (sl-summary once `done`). Otherwise it starts a new check, whatever the last run's state: connected, `engine.run()` once on mount and sl-scanning; not connected, a redirect to `SLIPS_HREF` (sl-intro). A run stopped for `consent` opens the tray, and agreeing runs again (`engine.run()` sends what is pending, albums connected or not, P4-T14).
- **Bindings:** sl-scanning: the decorative card; "กำลังเตรียมร่าง"; photos checked of the total, slips found, minutes left (whole, at least 1, from `secondsLeft`); the last three drafts (payee, `WalletAmount`); the two promise lines; "หยุดหาสลิป" (`engine.stop()`); closing leaves the run going while the app is open. States: `waiting` shows when Bun goes on; `offline` §5.1's failure line; `quota` its line; `paused` and `unavailable` the `unavailable` line; `done` opens sl-summary. sl-summary (from `summarizeSlips`): the period, slips found, photos and albums, "ยังไม่มีอะไรถูกบันทึก"; month chips; spending and income counts and totals with the repeated income line; moves; possible duplicates; unreadable ("แตะเพื่อจดเอง" lists the unreadable album photos from the phone, each opening the add tray beside it; under Q1's default, picked photos have no copy left, S17, so it opens the add tray with the count); guessed categories, the top three and others; the skip line; "ตรวจและบันทึก" opens sl-wallet-map when a draft's own account is unmapped, else sl-review; the footer line. Private mode hides every amount (D41).
- **Copy** (`slips.<name>`): every visible line of `sl-scanning` and `sl-summary`, verbatim, under keys named by meaning; the summary's period reads `{from} ถึง {to}` (the board's range dash is not used, P2's copy rule); `offline` is §5.1's ส่งไม่สำเร็จ สลิปยังอยู่ในเครื่อง. Drafts: `resting` บันพักอยู่ จะอ่านต่อ {time}; `quota` บันอ่านครบสำหรับช่วงนี้แล้ว สลิปที่เหลือรออยู่ในเครื่อง; `unavailable` บันยังอ่านสลิปไม่ได้ตอนนี้ สลิปยังอยู่ในเครื่อง.
- Sections: `sl-scanning`, `sl-scanning-resting`, `sl-scanning-offline`, `sl-summary`.

- [ ] **Step 1: Stub both screens (an empty `View`) in their routes, then write the failing tests** in `Scan.render.test.tsx` (both modes and languages):
  - `sl-scanning shows the photos checked, the slips found and the time left, and stop ends after the batch in flight`.
  - `closing sl-scanning leaves the run going`; `the scan route starts a check when albums are connected, opens sl-intro when not, and never starts a second run`; `a manual pick opens its run with no album connected, and its summary once it has ended`; `after a finished run, opening the scan route again starts a new check` (last state `done`, then `stopped` with `offline`: one `run()` each time; not connected, sl-intro).
  - `with AI consent off the route asks first, and a run stopped for consent opens the tray and runs again once agreed`.
  - `a resting run says when Bun goes on, and an offline one that the slips are still on the phone`.
  - `sl-summary counts and sums by type and month, names the repeated income, and says nothing is saved`.
  - `the unreadable slips open from the phone beside the add tray, and picked ones open it with their count`.
  - `check and save opens the account step only when an account is unmapped`.
  - `private mode hides every amount in text and labels, and at AX5 nothing is cut off`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:render -w gogospend-app -- src/wallet/slips/Scan.render.test.tsx`.
- [ ] **Step 3: Implement** the screens, copy, sections and routes.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Stop at once: the stop case fails. Start a run on every mount: the scan-route case fails. Treat `done` as going: the finished-run case fails. Redirect whenever albums are not connected: the manual case fails. Show amounts under private mode: the private case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the slip scanning and summary screens behind the slips area"`

---

### Task P4-T20: Reviewing: sl-wallet-map, sl-review and sl-slip-detail

**Starts after:** P4-T19, P2-T14, P2-T15, P2-T19

**Files:**
- Create: `apps/app/src/wallet/slips/SlipWalletMapScreen.tsx`, `SlipReviewScreen.tsx`, `SlipDetailTray.tsx`, `apps/app/src/dev/catalogue/slips/reviewSections.tsx`
- Modify: P4-T12's routes `apps/app/app/spend/slips/accounts.tsx`, `review.tsx`; `src/wallet/slips/copy.ts`; `src/dev/catalogue/slips/index.ts` (the sections)
- Test: `apps/app/src/wallet/slips/Review.render.test.tsx`

**Interfaces:**
- Consumes: P4-T18's kit, copy and bank names; `Tray` (P2-T13); `AmountStep`, `StepProps` (P2-T14); `CategoryPick`, `WalletPick`, `NotePick` (P2-T15); `useWalletCommand()` (P2-T19) and base `CORRECTION_REASONS`; `classifySlipDraft`, `buildReview`, `filterReview`, `reviewDays`, `confirmItem`, `confirmReviewed`, `SlipEdit` (P4-T16a); `resources.accounts()`, `updateAccount`, `drafts()`, `dismiss`, `bankAlbums()` (P4-T12); the diary's wallets and its outbox for unsent entries; `todayInBangkok`.
- Produces: `SlipWalletMapScreen(): JSX.Element`, `SlipReviewScreen(): JSX.Element`, `SlipDetailTray(props: { row: ReviewRow; edit: SlipEdit | null; onEdit(edit: SlipEdit): void; onSaved(): void; onSkipped(): void; onClose(): void })`.
- **Bindings:**
  - sl-wallet-map (S2): each account's bank name, `xxx-<last4>` and open drafts. Mapped: "ตรงกัน" and its wallet. Unmapped with a wallet whose name holds the last four digits: "บันแนะนำ" and that wallet; otherwise, only for an account that sent one of its open drafts from a bank app's album (the draft's `album` is a `bankAlbums()` name, ignoring case: S2's reason for taking the sender), "บันแนะนำ" a new wallet named `<bank> <last4>`, created once with `useWalletCommand().send({ kind: 'create', slot, input: { id, name, opening_minor: '0', tracking_start } }, track)` (one `wallet_added`), `tracking_start` being the earliest `occurred_on` of that account's open drafts, then mapped. Any other account (known only from a picked or shared slip, perhaps a payer's) stays unchosen ("ยังไม่ได้เลือก") with `notSure` until the person picks a wallet. "เลือก…" opens `WalletPick` in a tray, with the board's "สร้างกระเป๋าใหม่" row for `<bank> <last4>` under the wallets (created as the suggestion is). The transfer hint. "ถัดไป" maps the chosen accounts with their versions (`updateAccount`; a 409 reloads the accounts and keeps the choices) and opens sl-review.
  - sl-review (dark reference: `dk-slip-review`, the same text): the board's search, five filters, unreadable line ("จดเอง"), day groups and footer over `buildReview`; a blocked row waits under ต้องตรวจ with its reason, and one dated before its wallet's start offers to move that start back to the earliest such slip (`send({ kind: 'update', slot, id, version, changes: { tracking_start } })`, asking for one of `CORRECTION_REASONS` when the outcome says `needsReason`); each row shows the slip's time (S15), the guess or "โอนให้บุคคล บันไม่เดาหมวด", and a duplicate's record (merchant and amount from the diary, with "· ยังไม่บันทึก" for an unsent one); a move row shows both banks and wallets. "บันทึก {n} รายการ" runs `confirmReviewed` with progress, then sl-done; offline it is disabled with its line.
  - sl-slip-detail (a `Tray`; Q14: no photo frame or reference row): "ตรวจสลิป", the album (a development build, `__DEV__`, adds an escalated draft's `model` for P4-T23 Step 3); the read rows tagged "อ่านจากสลิป" (ผู้รับ; ธนาคาร "จาก {bank} xxx-{last4}"; วันเวลา `24 ต.ค. 2569 · 18:40`; จำนวน); "ยอดหรือชื่อไม่ตรง? แก้เอง" opens `AmountStep` and a name field; the type switch; หมวด, กระเป๋า and โน้ต through P2-T15's picks; each step over a `StepProps` adapter of the `SlipEdit` (no `onAttach`, `canTellBun` false, and an `onStep` it does not handle, such as P3's `attach`, `consent`, `slip` or `tell`, does nothing); the privacy line; "ข้ามสลิปนี้" (`dismiss`); "บันทึก" confirms this slip alone.
- **Copy** (`slips.<name>`): every visible line of `sl-wallet-map`, `sl-review` and `sl-slip-detail`, verbatim, under keys named by meaning, with the boards' names, amounts, banks and times as placeholders (`{payee}`, `{amount}`, `{bank}`, `{masked}`, `{wallet}`, `{count}`); the detail tray's image label and its reference row are left out (Q14). Drafts: `notSure` บันไม่แน่ใจว่าบัญชีนี้เป็นของคุณ; `onlineToSave` ต้องต่อเน็ตก่อน จึงจะบันทึกสลิปได้; `saving` กำลังบันทึก {done}/{total}; `beforeStart` สลิปนี้ก่อนวันเริ่มจดของ {wallet}; `futureDate` วันที่ในสลิปยังมาไม่ถึง; `moveStart` เริ่มจด {wallet} ตั้งแต่ {date}.
- Sections: `sl-wallet-map`, `sl-review`, `sl-review-offline`, `sl-slip-detail`.

- [ ] **Step 1: Stub the three surfaces (an empty `View`) and their routes, then write the failing tests** in `Review.render.test.tsx` (both modes and languages):
  - `sl-wallet-map marks matched accounts, suggests a wallet or a new one, and maps them on Next` (a 409 reloads the accounts and keeps the choices).
  - `a suggested new wallet is created once, starts on its account's earliest slip with an opening balance of 0, and is mapped`.
  - `an account known only from a picked slip is left unchosen with Bun's note, and its new wallet is offered only in its เลือก… tray` (a received slip picked with nothing mapped: its sender's account; Next maps nothing for it; the tray's สร้างกระเป๋าใหม่ creates and maps it).
  - `sl-review starts with everything ticked except possible duplicates and payments to people, grouped by day with the slip's time`.
  - `a slip older than its wallet's start waits under ต้องตรวจ with its reason, and moving the start back ticks it` (Review Focus 1).
  - `a possible duplicate of an unsent record says it is not saved yet`.
  - `saving sends the ticked rows in batches of 50 and opens sl-done; offline it waits and says why`.
  - `sl-slip-detail shows what Bun read and lets the person fix it, skip it, or save it alone` (an escalated draft names its model only in a development build).
  - `private mode hides every amount in text and labels`.
  - `at AX5 the rows stack and nothing is cut off; every tick and pick is at least 44 pt; screen readers read each row's selection, payee, amount and guess`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:render -w gogospend-app -- src/wallet/slips/Review.render.test.tsx`.
- [ ] **Step 3: Implement** the three surfaces, copy, sections and routes.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Tick payments to people: the ticked case fails. Create the new wallet from today: the start case fails. Offer a new wallet for every unmapped account: the unchosen case fails. Save offline: the offline case fails. Drop the slip's time: the grouping case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the slip review screens behind the slips area"`

---
### Task P4-T21: Done, slip settings, notifications off and the Home inbox card

**Starts after:** P4-T15, P4-T17, P4-T20, P2-T24, P2-T35

**Delivers:** P4:inbox

**Files:**
- Create: `apps/app/src/wallet/slips/SlipDoneScreen.tsx`, `SlipSettingsScreen.tsx`, `NotificationsOffScreen.tsx`, `SlipInboxCard.tsx`, `apps/app/src/dev/catalogue/slips/doneSections.tsx`
- Modify: P4-T12's routes `apps/app/app/spend/slips/done.tsx`, `settings.tsx`, `notifications.tsx`, and P4-T18's `index.tsx` (connected: `SlipSettingsScreen`); `src/wallet/slips/copy.ts`; `src/dev/catalogue/slips/index.ts` (the sections); P2-T24's `apps/app/src/wallet/home/WalletHomeScreen.tsx` (`SlipInboxCard` after P2-T35's `SetupCard` and, when it is there, P3-T21's note, before P5-T23's trip card, when it is there, and the budget card, while `useSlipsArea()`); `apps/app/src/screens/redesign/account/SettingsScreen.tsx` (an "สลิปอัตโนมัติ" row to `SLIPS_HREF` in today's Settings parts while `useSlipsArea()`, as P2-T33 added its lock row) and, if P6B-T3 has landed, P6B's `apps/app/src/wallet/settings/WalletSettingsScreen.tsx` (the same row under the same switch, a P6B-T1 `LinkRow`, for P6B-T3's parity case)
- Test: `apps/app/src/wallet/slips/Done.render.test.tsx`; `apps/app/src/wallet/home/WalletHome.render.test.tsx` (two cases)

**Interfaces:**
- Consumes: P4-T18's kit, copy and `useSlipsArea()`; `SLIPS_HREF`, `SLIP_REVIEW_HREF` (P4-T12); `WalletCard` (P2-T11); `Tray` (P2-T13); `WalletHomeScreen` (P2-T24); `useSlips()` (P4-T14); `setDailyReading` (P4-T15); `useSlipInbox`, `buildReview` (P4-T16a); the diary's wallets and its outbox for unsent entries; `todayInBangkok`; `useNotificationPermission`, `registerPushIfNeeded` (P4-T17); the review route (P4-T20).
- Produces: `SlipDoneScreen(): JSX.Element`, `SlipSettingsScreen(): JSX.Element`, `NotificationsOffScreen(props: { sample: 'slips' })`, `SlipInboxCard(): JSX.Element | null` (null at a count of 0; Q13: slip drafts only).
- **Bindings:**
  - sl-done (§5.3, D36): records saved and the first draft's day to today; counts by type; the most used wallet's card marked "ครบแล้ว"; "อีก {n} สลิปรอคุณดู" and its reasons; the daily reading switch, off until turned on, with its body and the sample notification, all left out while `library.albumsSupported` is false (default pending owner Q1); "ไปที่กระเป๋า". Turning it on asks for notifications when undetermined; denied opens es-notifications-off.
  - sl-settings (§5.3, D35: no auto-save choice): connected and the last read time; the daily switch; albums read (sl-albums), reading since, accounts and wallets (sl-wallet-map); the slip-notice switch (`slip-notices`, on by default, P4-T17; Q15: no time; it re-registers the device's `slip_notices`); "ยกเลิกการเชื่อมอัลบั้ม" with its line, after a `Tray` asking to confirm.
  - es-notifications-off: the board with the slip sample in place of the reminder row; "เปิดการตั้งค่า".
  - The inbox card (`sl-inbox`): "บันจดให้", the count line, "ตรวจ" to `SLIP_REVIEW_HREF` (P4-T21 (P4:inbox)'s route); a count, never an amount.
- **Copy** (`slips.<name>`): every visible line of `sl-done`, `sl-settings`, `es-notifications-off` and `sl-inbox`, verbatim, under keys named by meaning, except: sl-settings' "เมื่อพบสลิปใหม่" block with its auto-save choice (D35, §5.3) and the notification time `20:00` (Q15); es-notifications-off's reminder row, replaced by the slip sample `พบสลิปใหม่ 3 ใบ · แตะเพื่อตรวจ`; and sl-inbox's tab bar (P2's). Drafts: `disconnectConfirm` ยกเลิกการเชื่อม; `notifOffAndroid` โทรศัพท์ปิดการแจ้งเตือนไว้; `noticeWaiting` ตั้งไว้แล้ว จะเริ่มแจ้งเมื่อเปิดการแจ้งเตือน; `settingsRow` สลิปอัตโนมัติ.
- Sections: `sl-done`, `sl-done-picker-only`, `sl-settings`, `es-notifications-off`, `sl-inbox` (Home with the card).

- [ ] **Step 1: Stub each screen (an empty `View`) and its route, then write the failing tests.**
  - `Done.render.test.tsx` (both modes and languages): `sl-done counts what was saved, says what still waits, and keeps daily reading off until switched on (D36)`; `picker-only sl-done has no daily switch`; `once connected, the slips route shows sl-settings`; `sl-settings has no auto-save choice (D35), and disconnecting asks first and keeps the known slips`; `turning daily reading or slip notices on with notifications denied opens es-notifications-off`; `es-notifications-off opens the phone's settings`; `the Settings row appears only while the slips area is on` (in both Settings screens once P6B-T3 has landed); `private mode hides the wallet card's balance on sl-done, and at AX5 nothing is cut off`.
  - `WalletHome.render.test.tsx`: `Home shows the slip inbox card after the setup card and before the budget card, with its count only while drafts wait, and it opens the review`; `without the slips area Home is unchanged` (P2-T24's cases untouched).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:render -w gogospend-app -- src/wallet/slips/Done.render.test.tsx src/wallet/home/WalletHome.render.test.tsx`.
- [ ] **Step 3: Implement** the screens, card, Home and Settings additions, copy, sections and routes.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Show an auto-save choice: the D35 case fails. Draw the card at 0: the card case fails. Daily reading on by default, or shown picker-only: the D36 or picker case fails. Keep sl-intro once connected: the settings case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add slip done, settings, notifications off and the Home inbox card"`

---

### Task P4-T22: The statement journey in the Bun Wallet look (im-*)

**Starts after:** P4-T11, P4-T18, P2-T1, P2-T3, P2-T8, P2-T10, P2-T13

**Files:**
- Create: `apps/app/src/wallet/statements/copy.ts` (`STATEMENTS_COPY`), `useStatementsCopy.ts`, `StatementJourney.tsx`, `StatementExpect.tsx`, `StatementPick.tsx`, `StatementParsing.tsx`, `StatementMap.tsx`, `StatementReview.tsx`, `StatementConfirm.tsx`, `StatementDone.tsx`, `statementPorts.ts`; `apps/app/src/dev/catalogue/slips/statementSections.tsx`
- Modify: `apps/app/app/spend/import.tsx` (the `statements` area first: `StatementJourney`; else today's behaviour), `apps/app/src/spend/v1/imports.ts` (`labelMap(jobId): Promise<ImportLabelMapDto>`), `apps/app/src/screens/redesign/account/SettingsScreen.tsx` (an "นำเข้า statement" row to `/spend/import` while the area is on, and the same row in P6B's `WalletSettingsScreen.tsx` as P6B-T1's `LinkRow` if P6B-T3 has landed, for its parity case), P4-T18's `src/dev/catalogue/slips/index.ts` (`STATEMENT_SECTIONS`), P2-T3's `draftText.test.ts` (`LATIN_LINES` += `statements.formatCsv`, `statements.formatExcel`)
- Test: `apps/app/src/wallet/statements/Statements.render.test.tsx`, `statementPorts.test.ts` (Node)

**Interfaces:**
- Consumes: today's journey model unchanged (`importModel.ts`, including `ImportPorts`, `checkPickedFile` and `labelsToMap`; `importReview.ts`; `importDraftStore.ts`) and client; `ImportLabelMapDto` (P4-T11); P2's kit; `expo-document-picker` 58.0.4.
- Produces: `useStatementsCopy(): WalletT` (`tableT(STATEMENTS_COPY, useActiveLocale())`, as P4-T18's); `StatementJourney(props: { ports?: ImportPorts; now?: Date }): JSX.Element`; `pickStatementFile(): Promise<PickedFile>` (types `text/csv`, `text/comma-separated-values` and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` only); `checkStatementFile(file: ImportFile): PickProblem | null` (`checkPickedFile`, plus `unsupported` for an image or a PDF, B26); `STATEMENT_POLL = { pollMs: 2000, maxPolls: 120 }`; `applyRememberedMap(journey: ImportJourney, map: ImportLabelMapDto): ImportJourney` (fills only labels not yet mapped, marking them remembered).
- **Bindings** (the boards' look over today's rules):
  - im-expect: the chips `CSV · Excel` (PDF removed, §5.3, D39), the can and cannot lists, the limits line, "เลือกไฟล์".
  - im-pick (B26: statements are files): "เลือกไฟล์จากเครื่อง" only; while uploading, the name, size and an indeterminate bar, since the transport reports no upload progress (the board's percentage is dropped).
  - im-parsing: honest stages from the job's status (upload done; reading while `queued` or `parsing`; rows once `parsed`), no live row count; polling every 2 s for up to 4 minutes (a cold container's 60 s plus a 120 s parse), then "ยังอ่านอยู่…" pointing to P4-T8's push.
  - im-map: `labelsToMap` after `applyRememberedMap` (`labelMap(jobId)`, S11), remembered matches marked, then today's suggestions; "ใช้การจับคู่นี้".
  - im-review, im-confirm, im-done: today's filters, flags, bulk edits, frozen selection, 500-row batches and result counts.
- **Copy** (`statements.<name>`): every visible line of the seven `im-*` boards, verbatim, under keys named by meaning, except: PDF wherever it appears (the chips read `CSV · Excel`, the can line `อ่าน statement แบบ Excel หรือ CSV ที่ดาวน์โหลดจากธนาคาร`, the pick line `Excel หรือ CSV ในแอปไฟล์`, §5.3); im-pick's camera and album rows and its permission line (B26); the upload percentage; the boards' example file names become `{name}`. Lines already in the catalogs are reused through `tc()`. Drafts: `howToBody` ในแอปธนาคาร มักอยู่ที่เมนูบัญชี แล้วเลือกขอ statement เป็นไฟล์ Excel หรือ CSV; `stillReading` ยังอ่านอยู่ ปิดหน้านี้ได้ เราจะแจ้งเมื่อเสร็จ; `remembered` จำไว้จากไฟล์ก่อน.
- Sections (`STATEMENT_SECTIONS`): `im-expect`, `im-pick`, `im-pick-uploading`, `im-parsing`, `im-parsing-slow`, `im-map`, `im-map-remembered`, `im-review`, `im-confirm`, `im-confirm-saving`, `im-done`.

- [ ] **Step 1: Stub `StatementJourney` (an empty `View`), then write the failing tests.**
  - `statementPorts.test.ts`: `the file picker offers CSV and Excel only, and an image or a PDF is refused` (B26); `a remembered map fills only the labels not yet matched`.
  - `Statements.render.test.tsx` (both modes and languages, today's fakes): `im-expect lists no PDF` (§5.3); `im-pick offers files only`; `parsing shows honest stages and after four minutes says it will tell the person`; `a file of a layout seen before starts with its remembered matches`; today's `ImportScreen.render.test.tsx` cases ported under their names: the three beginning `review:`, then `bulk fix:`, `a row’s own sheet gives an unclear date`, `duplicates read “probably”`, `frozen:`, `confirming:`, `an unconfirmed batch keeps its request`, `a partial conflict:`, `done:` and `resume:`; `private mode hides every amount, and at AX5 nothing is cut off`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/wallet/statements/statementPorts.test.ts` and `npm run test:render -w gogospend-app -- src/wallet/statements/Statements.render.test.tsx`.
- [ ] **Step 3: Implement** the screens over today's model, the ports, the client call, the Settings row, copy, sections and route.
- [ ] **Step 4: Run them and see them pass,** with `ImportScreen.render.test.tsx` and `ImportRoute.render.test.tsx` unchanged while the area is off.
- [ ] **Step 5: Mutation check.** Offer images: the B26 case fails. Ignore the remembered map: the remembered case fails. Stop polling at 60 s: the slow case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Restyle the statement journey in the Bun Wallet look behind the statements area"`

---
### Task P4-T23: The phase 4 proof

**Starts after:** P4-T6, P4-T7, P4-T8, P4-T9, P4-T11, P4-T15, P4-T17, P4-T21, P4-T22

§8: "100 real Thai slips read correctly, and a real bank statement imported." The automated half runs now; the device and hosted halves are recorded SKIPPED until what they need exists. The app tasks above are listed only for Steps 3 and 5.

**Files:**
- Create: `apps/edge/test/workers/slips-journey.test.ts`
- Modify: `docs/implementation/premium-progress.md` (the proof receipt)

**Interfaces:**
- Consumes: the routes and steps of P4-T2 to P4-T11, with `fakeImportModel`, `fakeParser`, `fakePushPort`, a capturing `PUSH_QUEUE` and `openLive`.

- [ ] **Step 1: Write the journey test** `the phase 4 journey, from album slips and a bank statement to records, pokes and pushes` (one person, sessions A and B, `SLIP_IMPORT_ENABLED` and `PUSH_SEND_ENABLED` true):
  1. A reads the salt and records one slip's reference through `POST /v1/slips/refs` against an earlier record; A sends a `backfill` batch of five (that slip, an unreadable photo and three new slips) with `last: true`: `duplicate`, `unreadable` and three `read`; B is poked and its synced `slip_inbox` says `open: 3`.
  2. A maps the sender's account and confirms the three drafts in one batch: the records carry `source: 'slip_import'` and their slip refs; the four slips with references, sent again, answer `duplicate`; a new slip sent as a `live` batch of one with `origin: 'share'` (P6A's path) confirms as `source: 'share_extension'` (A1).
  3. A uploads a bank-shaped CSV through the fake parser, whose preview carries the `headerFingerprint` of `bankCsvTh`'s header (imported from `apps/api`'s fixtures, so P4-T10's output meets P4-T11's map), maps its labels and confirms; a second file of the same layout gets the remembered map; the records carry `source: 'statement'`.
  4. The queue holds `slips_ready` and `statement_parsed` with ids only; the port saw one `slips_ready` per device in its language with no amount; at 09:00 Bangkok on the next 1st the alarm queues `month_recap_ready`.
  5. P4-T6's storage checks, repeated over the journey: nothing of the six images anywhere.
- [ ] **Step 2: Run it and see it pass.** Run: `npm run test:edge:workers -- test/workers/slips-journey.test.ts`. A failure is a bug in its task, fixed there test-first.
- [ ] **Step 3: The slip proof on a real phone** (SKIPPED until the D33 Anthropic key, a development build, Q1's package, P3-T12's native decoder and the owner's slips, Q9): read 100 real Thai slips through album import and record per bank the slips in the albums, found (a QR miss fails), read correctly by Q9's rubric (each field marked by hand against sl-slip-detail), escalated (sl-slip-detail's development-only model) and duplicates, against the owner's threshold; then the owner locks `SLIP_IMPORT_SYSTEM` and `SLIP_IMPORT_SCHEMA` (D25).
- [ ] **Step 4: The statement proof** (SKIPPED until Docker and the owner's export, Q10): build the parser image (`docker build -f apps/api/Dockerfile -t jotbun-parser-local .`), run the built Worker in `wrangler dev` from a scratch config with `dev.enable_containers: true`, sign in as 1D's proof does, and import the owner's export from the app on the LAN; a second export of that bank starts with the remembered matches.
- [ ] **Step 5: Push on real phones** (SKIPPED until EAS, APNs and FCM, D33): each kind arrives on iOS and Android in the phone's language with no amount, and a tap opens its screen once the lock opens.
- [ ] **Step 6: Gate, receipt, commit.** The receipt lists what ran, what is SKIPPED and why, and the open owner questions. `git commit -m "Prove phase 4 end to end on the Workers runtime"`

---

### Task P4-T24: After E2: route the slip and statement screens

**Starts after:** P4-T16b, P4-T18, P4-T19, P4-T20, P4-T21, P4-T22, P4-T23, P2-T38, and the owner's approval at the E2 checkpoint

**Files:**
- Modify: `apps/app/src/config/featureFlags.ts` (`'slips'` and `'statements'` join `APPROVED`; `useSlipsArea()` still waits for slip import to open on the server, S13) and its test; `apps/app/src/messages/en.json`, `th.json` (approved lines under camelCase `walletSlips…` and `walletStatements…` keys), `apps/app/src/i18n/catalogs.test.ts`; `apps/app/src/wallet/slips/copy.ts` and `src/wallet/statements/copy.ts` (each `{ '<area>.<name>': '<English>' }`), P2-T38's `src/wallet/copy/allCopy.ts`, every `useSlipsCopy()` and `useStatementsCopy()` call (now P2-T38's `useWalletCopy()`; both hook files deleted), `src/wallet/slips/bankNames.ts`; `apps/edge/src/push/copy.ts` and its test (the approved push wording); `docs/implementation/premium-progress.md`

**Interfaces:**
- Consumes: `useWalletCopy`, `ALL_COPY`, `tc()` (P2-T38); every P4 screen and section.

- [ ] **Step 1: Write the failing tests:** `slips and statements are on by default, and -slips or -statements turns each off`; `every slip and statement line in use is in en.json and th.json with the same placeholders`; `no copy.ts under src/wallet/slips or src/wallet/statements holds Thai text any more`; `the push texts are the approved ones`.
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:unit -w gogospend-app -- src/config/featureFlags.test.ts src/i18n/catalogs.test.ts` and `npm run test:edge:workers -- test/workers/push.test.ts`.
- [ ] **Step 3: Move the copy** with the owner's E2 edits (a scratchpad Node script writes the entries; its output is reviewed by hand), switch the hooks, approve `slips` and `statements`, apply the approved push and bank wording. `SLIP_IMPORT_ENABLED` and `PUSH_SEND_ENABLED` stay off until the owner turns them on in an environment (P6C-T14b); until then `useSlipsArea()` keeps slip import hidden, since the server answers 404 (S13). It also waits for P3's decoder (S19), and P6B's flags later roll slip import out inside it (B25, A10).
- [ ] **Step 4: Run them and see them pass,** then the app and edge gates.
- [ ] **Step 5: Mutation check.** Remove one Thai entry: `catalogs.test.ts` fails. Leave `slips` or `statements` out of `APPROVED`: the default case fails.
- [ ] **Step 6: Receipt, commit.** With the owner's words. `git commit -m "Route the slip and statement screens after E2"`

---

## Self-review notes (for the executor)

- **Capabilities:** delivers `P4-T2 (P4:catalog-db)` (T2), `P4-T5 (P4:push)` (T5), `P4-T6 (P4:slips-route)` (T6), `P4-T7 (P4:slip-drafts)` (T7), `P4-T14 (P4:slip-client)` (T14), `P4-T18 (P4:slips-area)` (T18), `P4-T19 (P4:scan-route)` (T19), `P4-T21 (P4:inbox)` (T21); consumes `P3-T8 (P3:slip-read)` (T4), `P3-T3 (P3:ai-gate)` and `P3-T10 (P3:llm-analytics)` (T6), `P3-T1 (P3:slip-qr)` (T12), `P3-T2 (P3:source)` (T7, T11), `P3-T17 (P3:tray-photo)` (T16b) and `P3-T14 (P3:ai-area)` (T18).
- **For the controller:** (1) `P4-T14 (P4:slip-client)` (A33) is P4-T14's: P4-T12's clients, hasher and salt store, P4-T13's `pickerShrink`, P4-T14's `sendOneSlip`, `OneSlipAnswer`, `SlipsProvider`, `useSlips`, `useSlipDeps` and the fakes. (2) P6C-T14b's two switches need no app build: P4-T24 approves `slips`, and `useSlipsArea()` waits for the decoder (A24) and the server at run time (S13). P6A's share extension reads the pure `slipsAreaOn()`, so until slip import opens a share meets the 404 that P6A maps to `paused`.
- **Names for other plans:** `CATALOG_DB`, `merchantPatterns`, `matchMerchant`, `migrations/catalog` (P5's `fx_rates`); `POST /v1/slips` with `purpose: 'live'` and `origin: 'share'`, `sendOneSlip`, `OneSlipAnswer`, `GET /v1/slips/salt`, `slipRefHash`, `secureSaltStore({ accessGroup })`, `getSharedSlipResources` and `useSlips` (P6A's share path); `SLIP_SCAN_HREF`, `SLIP_REVIEW_HREF`, `slip_inbox`, `useSlipInbox`, `SlipInboxCard` (P6A's widgets and shortcuts); `useSlipsArea`, `slipsAreaOn`, `setSlipImportOverride` (P6B-T15's rollout and its tests); `PUSH_KINDS`, `enqueuePush`, `PushQueueMessage`, `pushMessage`, `routeForPush` (later push kinds); `DeviceRegistration`, `PUT /v1/devices`; `NotificationsOffScreen` (P6B's reminders); `SLIP_LIMITS`, `SLIP_ORIGINS`.
