// RED stub (P4-T3): the plan's interface, with no behaviour yet.
import type { SlipAccountDto, ThaiBankKey } from '@gogospend/contracts'

import type { VaultCall } from '../../v1/protocol'
import type { VaultContext } from '../context'

export function ensureSlipAccount(_c: VaultContext, _bank: ThaiBankKey, _last4: string): string {
  return ''
}

export function slipAccountFor(_c: VaultContext, _bank: ThaiBankKey | null, _last4: string | null): { id: string; wallet_id: string | null } | null {
  return null
}

export function listSlipAccounts(_c: VaultContext): { accounts: SlipAccountDto[] } {
  return { accounts: [] }
}

export function updateSlipAccount(_c: VaultContext, _call: VaultCall): SlipAccountDto {
  return { id: '', version: 0, bank: 'other', account_last4: '', wallet_id: null, open_drafts: 0 }
}
