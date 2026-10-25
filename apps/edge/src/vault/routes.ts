import { assertKnownFields } from '@gogospend/contracts'

import type { VaultCall, VaultReply, VaultRouteId } from '../v1/protocol'
import type { VaultContext } from './context'
import { acceptPolicy, describeMe, setPrivacy } from './policies'
import { okReply } from './replies'
import { revokeSession } from './session'

export type VaultHandler = (c: VaultContext, call: VaultCall) => VaultReply

/**
 * The handlers the vault serves, one per ported route. Each runs after the
 * vault's own checks (user-vault.ts) and does only its route's work. The
 * status comes from the route table (okReply).
 */
export const VAULT_HANDLERS: Partial<Record<VaultRouteId, VaultHandler>> = {
  'me.get': (c, call) => okReply(call.route, describeMe(c)),
  'me.logout': (c, call) => {
    revokeSession(c)
    return okReply(call.route)
  },
  'me.privacy': (c, call) => okReply(call.route, setPrivacy(c, assertKnownFields(call.body, ['analytics']).analytics)),
  'policies.accept': (c, call) => {
    const input = assertKnownFields(call.body, ['kind', 'version'])
    acceptPolicy(c, input.kind, input.version)
    return okReply(call.route)
  },
}
