# GoGoSpend — standalone spend diary

Extracted from `mygogocash/gogocash-monorepo` (`apps/api/src/spend/`, `apps/app/src/spend/`).
Personal spend diary. Second ledger, never withdraw. See `docs/EXTRACTION.md`.

## Run locally

With Node 24+ and Docker running:

```sh
npm ci --ignore-scripts
npm run dev
```

Open <http://localhost:8081>. See [local development](docs/LOCAL_DEVELOPMENT.md)
for startup, verification, and the remaining account/integration setup.

## Layout

- `apps/api/` — standalone NestJS spend service (`/spend/*`, bank-link, Salt Edge).
  Seeds from `vendor/gogocash-apps-api-spend/` snapshot in this repo.
- `apps/app/` — standalone Expo spend client.
  Seeds from `vendor/gogocash-apps-app-spend/` snapshot in this repo.
- `packages/contracts/` — shared Spend enums, limits, and API shapes.
- `vendor/` — read-only snapshots of the source files, for diffing during extraction.
- `docs/EXTRACTION.md` — file manifest + coupling notes + phase plan.

## Rules (inherited)

- Integer satang. `occurred_on` is a Bangkok calendar date.
- Spend writes never touch withdraw collections.
- Golden-sum fail-closed. Upload cap 12 MiB. Original files not stored on R2.
- Never store bank passwords. Salt Edge keys-gated.
- `XLS_UNREADABLE` / `SLIP_NO_QR` / `SLIP_OCR_EMPTY` fail-closed codes preserved.
