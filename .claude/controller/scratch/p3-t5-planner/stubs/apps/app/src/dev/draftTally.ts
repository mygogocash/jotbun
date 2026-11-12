// RED stub (P3-T5): the plan's interface, with no behaviour yet.
import type { AiModelName, DraftOutcome } from '../analytics/events.ts';
import type { StoreBackend } from '../wallet/store/walletStore.ts';

export const DRAFT_TALLY_KEY = 'jotbun.dev.draft-tally';

export type DraftCounts = { kept: number; edited: number; dropped: number };
export type DraftTally = Readonly<Record<AiModelName, DraftCounts>>;

export async function addDraftOutcome(_outcome: DraftOutcome, _model: AiModelName, _backend?: StoreBackend): Promise<void> {}

export async function readDraftTally(_backend?: StoreBackend): Promise<DraftTally> {
  return { 'claude-haiku-5-5': { kept: 0, edited: 0, dropped: 0 }, 'claude-opus-5-5': { kept: 0, edited: 0, dropped: 0 }, rules: { kept: 0, edited: 0, dropped: 0 } };
}

export async function resetDraftTally(_backend?: StoreBackend): Promise<void> {}
