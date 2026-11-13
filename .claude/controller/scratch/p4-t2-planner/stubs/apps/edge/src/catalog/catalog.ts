// RED stub (P4-T2): the plan's interface, with no behaviour yet.
import type { WorkerHandler } from '../v1/worker-routes'

export type MerchantPattern = { pattern: string; category_key: string }

export const MERCHANTS_TTL_MS = 3_600_000

export async function merchantPatterns(_env: { CATALOG_DB?: D1Database }, _nowMs: number = Date.now()): Promise<MerchantPattern[]> {
  return []
}

export function merchantKey(_text: string): string {
  return ''
}

export function matchMerchant(_name: string | null, _patterns: readonly MerchantPattern[]): string | null {
  return null
}

export const handleBankAlbums: WorkerHandler = async () => ({ ok: false, status: 501, code: 'INTERNAL_ERROR', problem: {} })
