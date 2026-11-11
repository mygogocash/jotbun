import { createFileRoute } from '@tanstack/react-router'

import { live } from '../v1/ready'

export const Route = createFileRoute('/live')({
  server: { handlers: { GET: () => live() } },
})
