# GoGoSpend extraction — manifest + phases

Source: `mygogocash/gogocash-monorepo` at extraction date 2026-09-24.
Snapshots live under `vendor/` (read-only, for diffing). Working copies will live
under `apps/api/src/spend/` and `apps/app/src/spend/`.

## Backend snapshot (`vendor/gogocash-apps-api-spend/` ← `apps/api/src/spend/`)

- `spend.module.ts` — owns SpendController, SpendBankLinkCallbackController,
  SpendService, SpendImportService, SpendBankLinkService; 5 spend schemas + User + Offer.
- `spend.controller.ts` (495 lines), `spend.service.ts` (821), `spend-import.service.ts` (435),
  `spend-bank-link.service.ts` (248)
- `schemas/` — spend-tx, spend-wallet, spend-category, spend-import-job, spend-bank-connection
- `mappers/` — parse-spend-file, xlsx-to-csv, parse-slip-ocr, parse-emv-qr
- `salt-edge.client.ts`, `salt-edge-callback-signature.ts`, `spend-allowlist.ts`
- `fixtures/` — meowjot, moneylover, spendee samples
- `*.spec.ts` — 13 spec files travel with the snapshot

Couplings to break (standalone service):
1. `Offer` model + `ACTIVE_OFFER_FILTER` (missed-cashback) → HTTP client to cashback API, fail-closed.
2. `User` model + `UserModule ↔ SpendModule` cycle → internal purge/export endpoints.
3. `LegalDocumentModule`, `ProductAccessModule` → copy minimal or stub behind interfaces.
4. `FirebaseAuthGuard` + `RateLimitGuard` + `JwtModule` → keep (same Firebase project = SSO).
5. PDPA gather/delete (`pdpa-gather.service.ts`, user deletion) → cross-service calls.
6. Salt Edge callback URL + `returnTo: .../spend` → new `api-spend.gogocash.co` host.
7. `*/15 * * * * *` cron (`isLegacyCronEnabled`) → spend-worker only.

## Client snapshot (`vendor/gogocash-apps-app-spend/` ← `apps/app/src/spend/` + routes)

- `src/spend/`: spendResource, spendFrontPage, spendAutolog, spendShare, spendTelemetry,
  spendMediaPermission*, SpendIntroScreen, SpendSectionTabs, pickSpendImportFile, etc.
- Routes: `app/spend/all.tsx`, `app/spend/import.tsx` (+ index)
- Screens: CustomerSpendScreen, CustomerSpendAllScreen, CustomerSpendImportScreen
- Entries to drop in main app: `GoGoSpendHomeStrip`, `/spend` profile gate
  (`featureFlags.ts`), `EXPO_PUBLIC_ENABLE_SPEND`, `webPublicContent.mjs` `/spend`

## Phases

1. ✅ Snapshot (this commit) — vendor copies + manifest.
2. Next: `packages/contracts` spend DTOs (satang, Bangkok date, error codes).
3. Next: `apps/api` runnable Nest service from snapshot (break couplings 1–7).
4. Next: `apps/app` runnable Expo client from snapshot (own app.config, EAS, theme/i18n subset).
5. Last: cutover (deep links, Salt Edge returnTo, flag off in main app).
