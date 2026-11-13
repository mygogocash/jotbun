// RED stub (P4-T3): the plan's interface, with no behaviour yet.
import type { SlipSaltDto } from '@gogospend/contracts'

import type { VaultContext } from '../context'

export function slipSalt(_c: VaultContext): SlipSaltDto {
  return { salt: '' }
}
