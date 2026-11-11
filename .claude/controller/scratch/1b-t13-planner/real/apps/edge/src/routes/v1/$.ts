import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'

import { handleVaultV1 } from '../../v1/handler'
import type { V1Env } from '../../v1/env'

// Every /v1 request goes to the vault's front door (C1): the route table
// (src/v1/routes.ts) holds each route's access class and gates, the token
// names the caller's UserVault, and the vault answers.
const handle = ({ request }: { request: Request }) => handleVaultV1(request, env as unknown as V1Env)

export const Route = createFileRoute('/v1/$')({
  server: {
    handlers: {
      GET: handle,
      HEAD: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
})
