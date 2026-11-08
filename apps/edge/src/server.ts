import handler from '@tanstack/react-start/server-entry'

import { isPostHogProxyPath, proxyPostHog } from './analytics/posthog-proxy'
import { handleAuth, isAuthPath } from './server/auth'

// The HTTP Worker: TanStack Start pages and the /v1 server routes. Cron
// Triggers and the job queues belong to the background Workers (src/roles).
// PostHog's proxy takes `/ingest/*` and Better Auth takes `/api/auth/*`
// before TanStack Start sees the request.
export default {
  fetch(...args: Parameters<typeof handler.fetch>) {
    const [request] = args
    const { pathname } = new URL(request.url)
    if (isPostHogProxyPath(pathname)) return proxyPostHog(request)
    if (isAuthPath(pathname)) return handleAuth(request)
    return handler.fetch(...args)
  },
}
