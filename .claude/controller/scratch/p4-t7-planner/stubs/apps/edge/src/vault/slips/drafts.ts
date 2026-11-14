// RED stub (P4-T7): the plan's interface, with no behaviour yet.
import type { CommandAck, SlipDraftsPage, SlipOrigin, TransactionSource } from '@gogospend/contracts'

import type { VaultCall } from '../../v1/protocol'
import type { VaultContext } from '../context'

export const SLIP_CONFIRM_KIND = 'slip_draft.confirm'
export const SLIP_DISMISS_KIND = 'slip_draft.dismiss'

const NO_ACK: CommandAck = { command_id: '', entity_id: '', version: 0, committed_revision: '0', outcome: 'accepted', entity_state: 'active' }

export function slipSourceOf(_origin: SlipOrigin): TransactionSource {
  return 'typed'
}

export function listSlipDrafts(_c: VaultContext, _query: unknown): SlipDraftsPage {
  return { drafts: [], total: -1, next_cursor: null }
}

export function confirmSlipDrafts(_c: VaultContext, _call: VaultCall): CommandAck {
  return NO_ACK
}

export function dismissSlipDraft(_c: VaultContext, _call: VaultCall): CommandAck {
  return NO_ACK
}
