import type { CallFailure, RecordedCall } from './transport'

// B5 as A14 refines it (H5, P3-T7): when a model call gives its use back. A use
// is counted before the first call (vault ai.consume); the service asks this
// before it answers, and gives the use back through the vault's ai.refund.

/** The failures that are nobody's doing: the model, or the way to it, was busy, broken, too slow or gone. */
const GIVES_BACK: readonly CallFailure[] = ['rate_limited', 'server_error', 'timeout', 'no_connection']

/**
 * True when the request ends without a model answer (the rules, the plain
 * facts or 503) and its last call failed with a rate limit, a 5xx, a timeout
 * or no connection. A decline, an unusable or ungrounded answer, a request the
 * API rejected (another 4xx) or any other failure spends the use, and so does
 * a request that made no call.
 */
export function shouldRefund(calls: readonly RecordedCall[], answeredByModel: boolean): boolean {
  const last = calls.at(-1)
  return !answeredByModel && last !== undefined && last.failure !== null && GIVES_BACK.includes(last.failure)
}
