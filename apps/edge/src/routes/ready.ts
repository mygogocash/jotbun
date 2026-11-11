import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'

import { readyResponseOf } from '../v1/ready'
import type { ReadyEnv } from '../v1/ready'

// B15: /ready answers from the Worker's settings and KV.
export const Route = createFileRoute('/ready')({
  server: { handlers: { GET: () => readyResponseOf(env as unknown as ReadyEnv) } },
})
