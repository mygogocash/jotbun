import { failureName } from '@api/common/operational-metrics'

/**
 * One JSON line for a failure, carrying the failure's class name and never its
 * message, a body or a token (the API's logging rule). console.error is used
 * rather than the API's log sink, which needs a stdout the Worker does not have.
 */
export function logFailure(event: string, error: unknown): void {
  console.error(JSON.stringify({ level: 'error', event, failure: failureName(error) }))
}
