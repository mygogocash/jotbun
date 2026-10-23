import { createFileRoute } from '@tanstack/react-router'

import { handleReady } from '../server/worker'

export const Route = createFileRoute('/ready')({
  server: { handlers: { GET: () => handleReady() } },
})
