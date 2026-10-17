# Local development

Requirements: Node 24 or newer, npm, and a running Docker engine.

```sh
npm ci --ignore-scripts
npm run dev
```

Open <http://localhost:8081>. The API listens on <http://127.0.0.1:8090>.
`GET /spend/summary` returns `401 Missing token` without a verified session.

The development command creates or reuses `gogospend-mongo-local`, with a
single-node `rs0` replica set on `127.0.0.1:27017`. Data persists in the
`gogospend-mongo-local-data` Docker volume. MongoDB is unauthenticated and
bound to loopback; use synthetic development data only.

The API receives random process-local `JWT_SECRET` and `INTERNAL_API_KEY`
values on every start. No credential values are written to disk or printed.
The command deliberately clears external Firebase, Salt Edge, legal-service,
and edge credentials. Cron jobs and Spend access are off. It does not load
production data or change another application's configuration.

Ctrl+C stops the API and client. The database remains running so data survives
restarts. Stop it separately with `docker stop gogospend-mongo-local`.

## Current integration boundaries

The introduction, appearance controls, client routes, and API transport run
locally. Protected diary routes require a real backend session and redirect
to a clear sign-in setup state on an unconfigured installation.

The extracted API verifies existing Firebase/backend tokens but does not yet
contain a standalone account login/refresh issuer or account provisioning
flow. `src/auth/session.ts` accepts an issued backend session in memory;
it never borrows another app's browser credentials or creates a demo token.
Wiring the account issuer, a development Firebase project, local user records,
and explicit Spend access is required before authenticated journeys can be
verified. The API remains the authority for authentication and entitlement.

Bank connections require authorized Salt Edge sandbox configuration. Cashback
history sync requires a separate catalog/history integration; the standalone
API has no `/withdraw/list-check` endpoint. Import jobs need an intentionally
enabled local worker before they drain. These integrations are not claimed
as working by the local startup smoke test.

## Verification

```sh
npm run typecheck
npm run typecheck:app
npm run test:api
npm run test:app
npm run test:render -w gogospend-app
npm run test:dev
npm run export:web -w gogospend-app -- --max-workers 2
git diff --check
```

The client uses the Expo 58.0.12 bundled dependency versions. The lockfile
records the compatible stable React/React Native versions; no peer-dependency
override is required. Install scripts are disabled because the verified web
and API paths use the packages' distributed binaries and assets.
