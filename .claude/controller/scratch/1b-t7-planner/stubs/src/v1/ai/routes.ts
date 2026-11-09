// 1B-T7 typed stub (RED): the six AI routes answer 501 and the env gives no model. Step 4 puts the real routes in place.
import type { SendMessage } from '../../server/ai/model'
import type { V1Env } from '../env'
import type { VaultReply } from '../protocol'
import type { WorkerContext } from '../worker-routes'

export function aiSender(_env: V1Env, _given: SendMessage | null | undefined): SendMessage | null {
  return null
}

const notYet = async (_w: WorkerContext): Promise<VaultReply> => ({ ok: false, status: 501, code: 'INTERNAL_ERROR', problem: {} })

export const aiPreferencesRoute = notYet
export const aiSetPreferencesRoute = notYet
export const aiParseRoute = notYet
export const aiSlipRoute = notYet
export const aiNoteRoute = notYet
export const aiAskRoute = notYet
