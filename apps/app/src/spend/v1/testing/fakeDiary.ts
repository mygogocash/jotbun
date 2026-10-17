// A SpendDiary for render tests: a settable view, recorded saves and an
// optional save failure. Test use only.
import type { PendingEntry } from '../../../storage/types';
import type { DiaryView, SpendDiary } from '../spendDiary';

export function createFakeDiary(view: Partial<DiaryView> = {}) {
  let current: DiaryView = { phase: 'ready', lockReason: null, outcome: null, pending: [], outbox: [], ...view };
  const listeners = new Set<() => void>();
  const saves: PendingEntry[] = [];
  const calls = { retry: 0 };
  let failNext: Error | null = null;
  const notify = () => listeners.forEach((listener) => listener());
  const diary: SpendDiary = {
    getView: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    sessionChanged: async () => undefined,
    async saveDraft(entry) {
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      saves.push(entry);
      current = { ...current, pending: [...current.pending, entry] };
      notify();
    },
    retry: async () => void (calls.retry += 1),
    foreground: async () => undefined,
    background: () => undefined,
    close: async () => undefined,
  };
  return {
    diary,
    saves,
    calls,
    set(next: Partial<DiaryView>) {
      current = { ...current, ...next };
      notify();
    },
    failNextSave(error: Error) {
      failNext = error;
    },
  };
}
