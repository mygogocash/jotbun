import type { DiaryStore } from '../../storage/diaryRepository.ts';
import { DiaryLocked } from '../../storage/types.ts';
import type { DiaryLockReason, OutboxCommand, PendingEntry } from '../../storage/types.ts';
import type { SyncScheduler } from '../../sync/scheduler.ts';
import type { SyncEngine } from '../../sync/syncEngine.ts';
import type { SyncOutcome } from '../../sync/types.ts';

export type DiaryPhase = 'unavailable' | 'opening' | 'ready' | 'locked';

export type DiaryView = {
  phase: DiaryPhase;
  lockReason: DiaryLockReason | 'signed_out' | null;
  outcome: SyncOutcome | null;
  pending: PendingEntry[];
  outbox: OutboxCommand[];
};

/** The signed-in account (its internal id) and the session epoch, or nobody. */
export type DiarySession = { accountId: string | null; epoch: number };

export type SpendDiaryDeps = {
  open(accountId: string): Promise<DiaryStore>;
  session(): DiarySession;
  makeSync(store: DiaryStore, onOutcome: (outcome: SyncOutcome) => void): { engine: SyncEngine; scheduler: SyncScheduler };
  now(): number;
  newId(): string;
  schemaVersion: number;
};

export interface SpendDiary {
  getView(): DiaryView;
  subscribe(listener: () => void): () => void;
  /** Re-reads the session: opens the current account's diary, closing any other. */
  sessionChanged(): Promise<void>;
  /** Persists a draft and its command on the device, then asks for a sync. Rejects if nothing was saved. */
  saveDraft(entry: PendingEntry): Promise<void>;
  retry(): Promise<void>;
  foreground(): Promise<void>;
  background(): void;
  close(): Promise<void>;
}

const EMPTY: DiaryView = { phase: 'unavailable', lockReason: null, outcome: null, pending: [], outbox: [] };

/**
 * The signed-in account's device diary for the screens: opens the current
 * account's diary (closing any other, so one account never sees another's
 * drafts), saves drafts locally before anything is sent, and runs the sync
 * scheduler. A remote sign-in refusal locks the diary and keeps its drafts; a
 * missing or rejected key locks it with that reason (never a silent empty
 * replacement); signed out means no diary at all. Results from an earlier
 * session are ignored.
 */
export function createSpendDiary(deps: SpendDiaryDeps): SpendDiary {
  let view: DiaryView = EMPTY;
  let store: DiaryStore | null = null;
  let sync: { engine: SyncEngine; scheduler: SyncScheduler } | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();

  const emit = (next: DiaryView) => {
    view = next;
    for (const listener of listeners) listener();
  };

  async function refresh(target: DiaryStore | null): Promise<void> {
    if (!target || target !== store) return;
    try {
      const [state, outbox] = await Promise.all([target.readState(), target.readOutbox()]);
      if (target === store) emit({ ...view, pending: state.pending, outbox });
    } catch {
      // Locked or from an earlier session: nothing to show from it.
    }
  }

  async function closeCurrent(): Promise<void> {
    sync?.scheduler.stop();
    sync = null;
    const closing = store;
    store = null;
    await closing?.lock().catch(() => undefined);
  }

  function onOutcome(target: DiaryStore, outcome: SyncOutcome): void {
    if (target !== store) return;
    if (outcome.status === 'signed_out') {
      emit({ ...view, phase: 'locked', lockReason: 'signed_out', outcome });
      void closeCurrent();
      return;
    }
    emit({ ...view, outcome });
    void refresh(target);
  }

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async sessionChanged() {
      const mine = ++generation;
      await closeCurrent();
      const { accountId } = deps.session();
      if (!accountId) {
        emit(EMPTY);
        return;
      }
      emit({ ...EMPTY, phase: 'opening' });
      let opened: DiaryStore;
      try {
        opened = await deps.open(accountId);
      } catch (error) {
        if (mine !== generation) return;
        if (error instanceof DiaryLocked) emit({ ...EMPTY, phase: 'locked', lockReason: error.reason });
        else emit({ ...EMPTY, phase: error instanceof Error && error.name === 'LocalDiaryUnavailable' ? 'unavailable' : 'locked', lockReason: null });
        return;
      }
      if (mine !== generation) return;
      store = opened;
      sync = deps.makeSync(opened, (outcome) => onOutcome(opened, outcome));
      emit({ ...EMPTY, phase: 'ready' });
      await refresh(opened);
      await sync.scheduler.launch();
    },

    async saveDraft(entry) {
      const target = store;
      if (!target || view.phase !== 'ready') throw new DiaryLocked(view.phase === 'locked' && view.lockReason !== null && view.lockReason !== 'signed_out' ? view.lockReason : 'locked');
      const command: OutboxCommand = {
        commandId: deps.newId(),
        accountId: target.accountId,
        schemaVersion: deps.schemaVersion,
        kind: 'transaction.create',
        payload: entry,
        state: 'unsent',
        firstTransmissionAt: null,
        createdAt: new Date(deps.now()).toISOString(),
        ackedRevision: null,
      };
      await target.savePending(entry, command);
      await refresh(target);
      // Saved; sending happens in the background and never decides this save.
      void sync?.scheduler.written();
    },

    async retry() {
      const target = store;
      await sync?.scheduler.manual();
      await refresh(target);
    },
    async foreground() {
      const target = store;
      await sync?.scheduler.foreground();
      await refresh(target);
    },
    background() {
      sync?.scheduler.background();
    },
    async close() {
      generation += 1;
      await closeCurrent();
      emit(EMPTY);
    },
  };
}
