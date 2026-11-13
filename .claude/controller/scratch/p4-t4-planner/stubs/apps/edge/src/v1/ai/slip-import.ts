// RED stub (P4-T4): the plan's interface, with no behaviour yet.
import type { AiDraftFlag, Minor, SlipParty } from '@gogospend/contracts'

export type SlipImportRead = {
  amount_minor: Minor | null
  occurred_on: string | null
  occurred_time: string | null
  from: SlipParty
  to: SlipParty
  flags: AiDraftFlag[]
}

export const SLIP_IMPORT_REQUIRED = ['amount_minor', 'occurred_on', 'from.bank', 'to.name'] as const

export const SLIP_IMPORT_SYSTEM: string = ''

export const SLIP_IMPORT_SCHEMA: Record<string, unknown> = {}

export function sanitizeSlipImportRead(_raw: unknown, _today: string): SlipImportRead | null {
  return null
}

export function missingImportFields(_read: SlipImportRead): string[] {
  return []
}
