import { assertKnownFields, parseAiAskRequest, parseAiDate, parseAiLocale, parseAiParseRequest, parseAiPreferencesUpdate, parseAiSlipRequest } from '@gogospend/contracts'

import type { VaultReply } from '../protocol'
import type { VaultSession, WorkerContext } from '../worker-routes'
import { VaultAiService } from './service'

// The six AI routes (1B-T7), Worker routes that call the vault in steps. Each
// reads its input as the PostgreSQL edge's route does, before its first step.
// No gate is added (owner answer 3): the `ai` gate comes with AI Gateway in
// phase 3, and until then AI_ENABLED is the switch (B10).

function aiOf(w: WorkerContext): { service: VaultAiService; vault: VaultSession } {
  if (!w.vault) throw new Error('an AI route needs a session')
  return { service: new VaultAiService({ transport: w.transport ?? null, deadlines: w.aiDeadlines }), vault: w.vault }
}

/** Every AI route answers 200 (the PostgreSQL routes' statuses: GET and PUT by default, the three POSTs by their `status: 200`). */
const answer = (body: unknown): VaultReply => ({ ok: true, status: 200, body })

/** GET /v1/me/ai-preferences */
export async function aiPreferencesRoute(w: WorkerContext): Promise<VaultReply> {
  const { service, vault } = aiOf(w)
  return answer(await service.preferences(vault))
}

/** PUT /v1/me/ai-preferences */
export async function aiSetPreferencesRoute(w: WorkerContext): Promise<VaultReply> {
  const update = parseAiPreferencesUpdate(w.body)
  const { service, vault } = aiOf(w)
  return answer(await service.setPreferences(vault, update))
}

/** POST /v1/ai/parse */
export async function aiParseRoute(w: WorkerContext): Promise<VaultReply> {
  const request = parseAiParseRequest(w.body)
  const { service, vault } = aiOf(w)
  return answer(await service.parse(vault, request))
}

/** POST /v1/ai/slip */
export async function aiSlipRoute(w: WorkerContext): Promise<VaultReply> {
  const request = parseAiSlipRequest(w.body)
  const { service, vault } = aiOf(w)
  return answer(await service.slip(vault, request))
}

/** GET /v1/ai/note?date=&locale= */
export async function aiNoteRoute(w: WorkerContext): Promise<VaultReply> {
  const input = assertKnownFields({ ...w.query }, ['date', 'locale'])
  const date = parseAiDate(input.date, 'date')
  const locale = parseAiLocale(input.locale)
  const { service, vault } = aiOf(w)
  return answer(await service.note(vault, date, locale))
}

/** POST /v1/ai/ask */
export async function aiAskRoute(w: WorkerContext): Promise<VaultReply> {
  const request = parseAiAskRequest(w.body)
  const { service, vault } = aiOf(w)
  return answer(await service.ask(vault, request))
}
