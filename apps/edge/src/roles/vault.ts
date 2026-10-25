// The vault Worker (the API's per-person ledger, moved to one Durable Object
// per person: src/vault). It runs as its own Worker until Phase 1B. Until the
// HTTP front door lands it answers only GET /live.
//
// The UserVault class is exported from this entry because the Durable Object
// binding (wrangler.vault.jsonc) names it.
export { UserVault } from '../vault/user-vault'

export default {
  fetch(request: Request): Response {
    if (request.method === 'GET' && new URL(request.url).pathname === '/live') return Response.json({ status: 'live' })
    return new Response(null, { status: 404 })
  },
}
