import handler from '@tanstack/react-start/server-entry'

import { isPostHogProxyPath, proxyPostHog } from './analytics/posthog-proxy'
import { handleAuth, isAuthPath } from './server/auth'
import vaultWorker from './vault-worker'

// The one Worker (C1): TanStack Start pages and the /v1 server route, which
// answers every v1 call from the caller's UserVault (src/routes/v1/$.ts).
// PostHog's proxy takes `/ingest/*` and Better Auth takes `/api/auth/*` before
// TanStack Start sees the request. The vault's Durable Objects, Workflows and
// parse queue consumer live in src/vault-worker.ts; their bindings in
// wrangler.jsonc name the classes re-exported here, as TanStack Start's
// server entry allows.
export { ExportWorkflow, SnapshotWorkflow, StatementParser, UserVault } from './vault-worker'

export default {
  fetch(...args: Parameters<typeof handler.fetch>) {
    const [request] = args
    const { pathname } = new URL(request.url)
    if (isPostHogProxyPath(pathname)) return proxyPostHog(request)
    if (isAuthPath(pathname)) return handleAuth(request)
    return handler.fetch(...args)
  },
  // The statement parse queue's consumer (1B-T5, B6).
  queue: vaultWorker.queue,
}
