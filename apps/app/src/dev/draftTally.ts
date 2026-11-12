// The draft tally (P3-T5), for development builds only: how many of Bun's
// drafts were kept, edited or dropped, per model, so the phase 3 proof can
// tell the AI's share from the rules'. useDraftReview reaches it behind
// __DEV__, so no release bundle holds it, and P3-T22 adds an export check
// that fails a bundle holding DRAFT_TALLY_KEY. It keeps counts and nothing
// else: no amount, note, merchant or other words from a draft.
//
// - Every read and write goes through one queue, in call order, so drafts
//   reviewed together (P3-T18 saves several at once) each count, and a read
//   sees every count made before it. A failed write rejects its own call
//   only; the queue goes on.
// - A stored value that is not the tally's shape reads as zeros, and a count
//   that is not a whole number from 0 up reads as 0. A write keeps the three
//   models and their three counts only.
// - AsyncStorage loads only when no backend is passed, so Node tests load this
//   module without React Native.
import type { AiModelName, DraftOutcome } from '../analytics/events.ts';
import type { StoreBackend } from '../wallet/store/walletStore.ts';

export const DRAFT_TALLY_KEY = 'jotbun.dev.draft-tally';

export type DraftCounts = { kept: number; edited: number; dropped: number };
export type DraftTally = Readonly<Record<AiModelName, DraftCounts>>;

type TallyStore = Pick<StoreBackend, 'getItem' | 'setItem' | 'removeItem'>;

let queue: Promise<unknown> = Promise.resolve();

function serially<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => undefined);
  return run;
}

async function storeOf(backend: StoreBackend | undefined): Promise<TallyStore> {
  if (backend !== undefined) return backend;
  return (await import('@react-native-async-storage/async-storage')).default;
}

function fieldOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function countOf(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0;
}

function countsOf(value: unknown): DraftCounts {
  return { kept: countOf(fieldOf(value, 'kept')), edited: countOf(fieldOf(value, 'edited')), dropped: countOf(fieldOf(value, 'dropped')) };
}

function parsed(stored: string | null): unknown {
  if (stored === null) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function tallyOf(stored: string | null): Record<AiModelName, DraftCounts> {
  const value = parsed(stored);
  return {
    'claude-haiku-5-5': countsOf(fieldOf(value, 'claude-haiku-5-5')),
    'claude-opus-5-5': countsOf(fieldOf(value, 'claude-opus-5-5')),
    rules: countsOf(fieldOf(value, 'rules')),
  };
}

export function addDraftOutcome(outcome: DraftOutcome, model: AiModelName, backend?: StoreBackend): Promise<void> {
  return serially(async () => {
    const store = await storeOf(backend);
    const tally = tallyOf(await store.getItem(DRAFT_TALLY_KEY));
    tally[model][outcome] += 1;
    await store.setItem(DRAFT_TALLY_KEY, JSON.stringify(tally));
  });
}

export function readDraftTally(backend?: StoreBackend): Promise<DraftTally> {
  return serially(async () => tallyOf(await (await storeOf(backend)).getItem(DRAFT_TALLY_KEY)));
}

export function resetDraftTally(backend?: StoreBackend): Promise<void> {
  return serially(async () => {
    await (await storeOf(backend)).removeItem(DRAFT_TALLY_KEY);
  });
}
