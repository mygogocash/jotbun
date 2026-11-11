import { createFileRoute } from '@tanstack/react-router'

import { handleV1 } from '../../server/worker'

// Every /v1 request goes through one dispatcher, so every route's access class
// and gates live in one table (server/app/routes.ts), as the API checks at
// startup that no route is unclassified.
const handle = ({ request }: { request: Request }) => handleV1(request)

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
