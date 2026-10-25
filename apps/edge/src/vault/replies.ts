import { ContractValidationError } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'

import { logFailure } from '../v1/log'
import type { VaultReply, VaultRouteId } from '../v1/protocol'
import { vaultStatusOf } from '../v1/routes'

/** A successful reply, with the status the route table gives its route. */
export function okReply(route: VaultRouteId, body?: unknown): VaultReply {
  return body === undefined ? { ok: true, status: vaultStatusOf(route) } : { ok: true, status: vaultStatusOf(route), body }
}

/**
 * Every error becomes a reply, never a throw (the call crosses an RPC boundary):
 * a problem keeps its status and code, a validation error is 422 as in
 * errorResponse, and anything else is 500 INTERNAL_ERROR with no detail.
 */
export function toProblemReply(error: unknown): VaultReply {
  if (error instanceof ProblemException) return { ok: false, status: error.getStatus(), code: error.code, problem: error.problem }
  if (error instanceof ContractValidationError) {
    return { ok: false, status: 422, code: error.code, problem: { fields: { [error.field ?? 'body']: error.code } } }
  }
  logFailure('vault_call_failed', error)
  return { ok: false, status: 500, code: 'INTERNAL_ERROR', problem: {} }
}
