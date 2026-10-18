# Local verification — 16 October 2026

Scope: run the extracted GoGoSpend client and API on this Mac. This receipt
does not establish authenticated account, bank, native-device, or production
readiness.

## Running services

- Client: <http://localhost:8081>, HTTP 200, bound to `::1:8081`.
- API: <http://127.0.0.1:8090>, bound to `127.0.0.1:8090`.
- `GET /spend/summary` without a session returns HTTP 401, `Missing token`.
- MongoDB 8.0.34: `gogospend-mongo-local`, `127.0.0.1:27017`, writable `rs0`.
- Start/restart from the repository root with `npm run dev`.

## Checks

| Command or check | Status | Result |
| --- | --- | --- |
| `npm install --ignore-scripts --no-audit --no-fund` | PASS | Compatible workspace resolution; lockfile saved. |
| `npm ci --dry-run --ignore-scripts --no-audit --no-fund` | PASS | Final lockfile/install plan validated after dependency cleanup. |
| `npm run dev` | PASS | API and Expo launched; loopback ports confirmed. |
| `npm run typecheck` | PASS | Contracts and API. |
| `npm run typecheck:app` | PASS | Client, routes, and render test types. |
| `npm run test:api` | PASS | 16 suites, 122 tests. Expected failure-path log messages are emitted by regression cases. |
| `npm run test:app` | PASS | Six transport tests against a real local HTTP server. |
| `npm run test:render -w gogospend-app` | PASS | Three control/theme/integration-boundary checks. Platform navigation, safe-area, status-bar, and SVG bridges are stubbed here; the browser checks use the real web runtime. |
| `npm run test:dev` | PASS | Two RED/GREEN regressions: cancellation and rejecting a Mongo container mapped to the wrong host port. |
| `npm run export:web -w gogospend-app -- --max-workers 2` | PASS | Web bundle and bundled font assets exported. |
| `git diff --check` | PASS | No whitespace errors. |
| `npm audit --omit=dev --json` | FAIL | 28 findings: 19 high, nine moderate, zero critical. See below. |

## Browser proof

The Codex in-app browser rendered the introduction with DM Sans/Anuphan
assets, the annual amount, and the primary control. Light and Dark controls
changed the visible theme. “Let's start!” reached `/login` and its explicit
account setup state; “Back to GoGoSpend” returned to `/`.

The final rendered bundle showed no framework overlay and no current console
errors. Earlier transient development syntax/restart messages were resolved.
The introduction's gradient/text stacking was corrected and checked visually.
The final preview is saved outside the repository at `/tmp/gogospend-local.png`.

## Dependency findings and limits

Unused client Firebase/native Firebase, PostHog, React Query, native date-picker,
Expo Updates, and native-test dependencies were removed. gRPC is constrained
to the patched 1.14.6-compatible release line; its initial audit findings no
longer appear.

The remaining report includes transitive ancestor findings from three leaf
advisories:

- [braces <=3.0.3](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): high; no published patch at verification time. Present through Expo/Metro glob tooling. Static review found trusted extension patterns and a direct picomatch path in the inspected Metro usage, with no Spend request input reaching the vulnerable brace walkers.
- [node-forge <=1.4.0](https://github.com/advisories/GHSA-86w9-cpqp-85rv): high; no published patch at verification time. Present through Expo CLI/code signing. This local configuration has no EAS project, update signing certificate, private-key path, or active signing operation.
- [uuid <11.1.1](https://github.com/advisories/GHSA-w5hq-g745-h8pq): moderate; retained transitive dependencies include the API's spreadsheet stack. No cross-major override was introduced without compatibility proof.

Static local reachability review is not a dependency fix. The audit gate
remains failed; public deployment, signing, and release readiness are not
established. No production credentials or customer data were used.

Startup also retains the inherited Mongoose duplicate-index warnings for
`SpendBankConnection.user_id` and `ProductAccess.product`. Those index
definitions require review before using this extraction with real data.

## Handoff

Changes remain uncommitted on `feat/standalone-client-local`. No PR or deployment
was created. Runtime JWT and internal API secrets are generated in process
and never written into source or output. No material recurring cost was added.

Work used systematic debugging, test-driven development, frontend startup and
browser validation, and two read-only discovery/review agents. The dependency
review used the Codex Security triage workflow. Account setup and the other
integration boundaries are documented in [local development](LOCAL_DEVELOPMENT.md).
