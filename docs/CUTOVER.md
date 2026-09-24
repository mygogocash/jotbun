# Cutover — hiding GoGoSpend in the monorepo (NOT applied yet)

Apply only after the standalone stack is live: spend API serving `/spend/*`
against the shared Mongo cluster, spend app on internal track with sign-in,
import, slip OCR, and Salt Edge verified.

## Monorepo removal patch (gogocash-monorepo)

1. `apps/app`: delete `app/spend/all.tsx`, `app/spend/import.tsx`,
   `src/screens/CustomerSpend*.tsx`, `src/spend/`,
   `src/screens/home/GoGoSpendHomeStrip.tsx` (+ usage in
   `MobileTabletHomeHeader.tsx`), and the `/spend` gate in
   `src/config/featureFlags.ts` (`PROFILE_MENU_FEATURE_GATES`).
2. Bake the flag off on every surface: `EXPO_PUBLIC_ENABLE_SPEND=0` in
   `eas.json` profiles, `Dockerfile.web.railway`, `Dockerfile.web.depot`,
   and remove `/spend` from `scripts/webPublicContent.mjs`.
3. `apps/api`: keep `SpendModule` mounted until the last main-app build is
   retired (old clients still call `/spend/*`), then remove it and replace
   the `UserModule → SpendModule` PDPA path with calls to the standalone
   `DELETE /internal/spend/users/:id` and `GET /internal/spend/users/:id/export`
   (shared `INTERNAL_API_KEY`).
4. Salt Edge dashboard: point the callback at
   `https://api-spend.gogocash.co/spend/bank-link/callbacks` and set
   `SALT_EDGE_CALLBACK_URL` to match.
5. Cron: exactly one stack runs the spend import drain (`CRON_ENABLED=true`
   on the spend worker only).

## Behavior preserved across the split

- Satang integers, Bangkok `occurred_on`, golden-sum fail-closed, 12 MiB cap,
  payload `$unset` after parse, `XLS_UNREADABLE` / `SLIP_NO_QR` /
  `SLIP_OCR_EMPTY`, transfers out of the pie sum, income-only autolog.
- Missed-cashback hints return empty until the catalog HTTP client lands
  (fail-closed by existing guard, not a silent error).
- Terms re-acceptance requires `LEGAL_API_URL` in production; unset =
  dev-mode skip with a warning (same honest-unavailable shape as Salt Edge).
