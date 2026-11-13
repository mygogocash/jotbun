// RED stub (P4-T7): the plan's interface, with no behaviour yet.
import type { VaultContext } from '../context'
import type { FileContext } from '../files/context'

export const BACKFILL_KEEP_DAYS = 31

export function pruneSlips(_c: FileContext & Pick<VaultContext, 'registry'>): void {}

export function slipsDueAt(_c: FileContext): number | null {
  return null
}
