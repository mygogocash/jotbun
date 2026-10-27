import handler from '@tanstack/react-start/server-entry'

import { isPostHogProxyPath, proxyPostHog } from './analytics/posthog-proxy'

// The HTTP Worker: TanStack Start pages and the /v1 server routes. Cron
// Triggers and the job queues belong to the background Workers (src/roles).
// PostHog's proxy takes `/ingest/*` before TanStack Start sees the request.
export default {
  fetch(...args: Parameters<typeof handler.fetch>) {
    const [request] = args
    if (isPostHogProxyPath(new URL(request.url).pathname)) return proxyPostHog(request)
    return handler.fetch(...args)
  },
}
