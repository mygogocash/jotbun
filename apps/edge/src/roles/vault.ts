// The vault Worker (the API's per-person ledger, moved to one Durable Object
// per person: src/vault). It runs as its own Worker until Phase 1B. Its /v1
// front door (src/v1) verifies the token and forwards each call to the caller's
// UserVault; anything else answers 404, and GET /live is the health check.
//
// The UserVault class is exported from this entry because the Durable Object
// binding (wrangler.vault.jsonc) names it.
import { setLogSink } from '@api/common/safe-request-logger'

import { handleParseBatch } from '../background/parse-consumer'
import type { ParseMessage } from '../background/parse-consumer'
import { handleVaultV1 } from '../v1/handler'
import type { V1Env } from '../v1/env'

export { UserVault } from '../vault/user-vault'
// The stateless parser's Durable Object, with its container (1B-T5).
export { StatementParser } from '../background/statement-parser'
// The export Workflow (1B-T6); the EXPORT_WORKFLOW binding names this class.
export { ExportWorkflow } from '../background/export-workflow'

// The API's logger writes JSON lines to a sink; the Worker's sink is console.
setLogSink((line) => console.log(line))

export default {
  fetch(request: Request, env: V1Env): Promise<Response> | Response {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/live') return Response.json({ status: 'live' })
    if (url.pathname.toLowerCase().startsWith('/v1/')) return handleVaultV1(request, env)
    return new Response(null, { status: 404 })
  },
  // The statement parse queue's consumer (1B-T5, B6).
  queue(batch: MessageBatch<ParseMessage>, env: V1Env): Promise<void> {
    return handleParseBatch(batch, env)
  },
}
