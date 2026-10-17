# GoGoSpend client

Expo SDK 58 client with the extracted Spend screens, shared presentation
components, English/Thai/Vietnamese Spend catalogs, and standalone routing.
The original Spend UI is preserved without importing the cashback app shell.

From the repository root, run `npm ci --ignore-scripts` then `npm run dev`.
Open <http://localhost:8081>.

- `/` shows the Spend introduction.
- `/spend`, `/spend/all`, and `/spend/import` require an issued backend session.
- `/login` explains the account setup requirement on an unconfigured install.
- System/Light/Dark appearance is scoped to GoGoSpend and persists locally.
- API calls use `EXPO_PUBLIC_API_URL`, defaulting to `http://localhost:8090`.
- Telemetry is disabled until a consent-aware sink is explicitly connected.

The extracted API has no standalone account login/refresh issuer yet. No demo
account, borrowed token, or authentication bypass is installed. Bank links,
cashback history, and import workers retain their documented setup boundaries.
See [local development](../../docs/LOCAL_DEVELOPMENT.md) for full details.

Verification from the repository root:

```sh
npm run typecheck:app
npm run test:app
npm run test:render -w gogospend-app
npm run export:web -w gogospend-app -- --max-workers 2
```
