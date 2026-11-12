import type { RecordedCall } from './transport'

// RED stub (P3-T7): no request ever gets its use back.
export function shouldRefund(_calls: readonly RecordedCall[], _answeredByModel: boolean): boolean {
  return false
}
