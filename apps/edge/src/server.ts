import handler from '@tanstack/react-start/server-entry'

import { handleAuth, isAuthPath } from './server/auth'

// The HTTP Worker: TanStack Start pages and the /v1 server routes. Cron
// Triggers and the job queues belong to the background Workers (src/roles).
// /api/auth is Better Auth; everything else stays with TanStack Start.
const fetch: typeof handler.fetch = (request, ...rest) => {
  if (isAuthPath(new URL(request.url).pathname)) return handleAuth(request)
  return handler.fetch(request, ...rest)
}

export default { fetch }
