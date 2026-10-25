// A SpendDiary for render tests: a settable view, recorded saves, an optional
// save failure, an in-memory import draft while it is ready, and logged days
// (a seed merged with the view's pending dates, or null while it is not ready).
// Test use only.
import type { PendingEntry } from '../../../storage/types';
import { memoryDraftStore } from '../importReview';
import type { DiaryView, SpendDiary } from '../spendDiary';

export function createFakeDiary(view: Partial<DiaryView> = {}, options: { loggedDays?: readonly string[] } = {}) {
  let current: DiaryView = { phase: 'ready', lockReason: null, outcome: null, progress: null, pending: [], outbox: [], wallets: [], categories: [], ...view };
  const drafts = memoryDraftStore();
  const listeners = new Set<() => void>();
  const saves: PendingEntry[] = [];
  const commandIds: (string | undefined)[] = [];
  const calls = { retry: 0, discardDiary: 0, eraseForSignOut: 0, removed: [] as string[], discarded: [] as string[] };
  let failNext: Error | null = null;
  const notify = () => listeners.forEach((listener) => listener());
  const diary: SpendDiary = {
    getView: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    sessionChanged: async () => undefined,
    async saveDraft(entry, commandId) {
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      saves.push(entry);
      commandIds.push(commandId);
      current = { ...current, pending: [...current.pending, entry] };
      notify();
    },
    async removeDraft(commandId) {
      calls.removed.push(commandId);
      current = { ...current, outbox: current.outbox.filter((command) => command.commandId !== commandId) };
      notify();
    },
    async discardDraft(commandId) {
      calls.discarded.push(commandId);
      current = { ...current, outbox: current.outbox.filter((command) => command.commandId !== commandId) };
      notify();
    },
    discardDiary: async () => void (calls.discardDiary += 1),
    eraseForSignOut: async () => void (calls.eraseForSignOut += 1),
    importDraftStore: () => (current.phase === 'ready' ? drafts : null),
    retry: async () => void (calls.retry += 1),
    foreground: async () => undefined,
    background: () => undefined,
    close: async () => undefined,
    async loggedDays() {
      if (current.phase !== 'ready') return null;
      const days = new Set<string>(options.loggedDays ?? []);
      for (const entry of current.pending) days.add(entry.occurred_on);
      return [...days].sort();
    },
  };
  return {
    diary,
    /** The import draft the diary keeps (what `importDraftStore()` hands out while ready). */
    drafts,
    saves,
    commandIds,
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
