import handler from '@tanstack/react-start/server-entry'

// The HTTP Worker: TanStack Start pages and the /v1 server routes. Cron
// Triggers and the job queues belong to the background Workers (src/roles).
export default {
  fetch: handler.fetch,
}
