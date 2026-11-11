import { createFileRoute } from '@tanstack/react-router'

import { live } from '../server/app/health'

export const Route = createFileRoute('/live')({
  server: { handlers: { GET: () => live() } },
})
