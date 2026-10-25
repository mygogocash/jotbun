import { BUILTIN_CATEGORIES } from '@gogospend/contracts';
import type { CategoryDto, WalletSnapshot } from '@gogospend/contracts';

import type { DiaryStore } from '../../storage/diaryRepository.ts';
import { DiaryLocked, DiarySchemaTooNew, DraftReferenceUnavailable, StaleEpochError } from '../../storage/types.ts';
import type { DiaryLockReason, OutboxCommand, PendingEntry } from '../../storage/types.ts';
import type { DiaryState } from '../../storage/diaryRepository.ts';
import type { SyncScheduler } from '../../sync/scheduler.ts';
import type { SyncEngine } from '../../sync/syncEngine.ts';
import type { SyncOutcome, SyncSession } from '../../sync/types.ts';
import { createDiaryDraftStore } from './importDraftStore.ts';
import type { ImportDraftStore } from './importReview.ts';

export type DiaryPhase = 'unavailable' | 'opening' | 'ready' | 'locked';

export type DiaryView = {
  phase: DiaryPhase;
  lockReason: DiaryLockReason | 'signed_out' | 'schema_too_new' | null;
  outcome: SyncOutcome | null;
  /** Live "n of m" while a sync run is sending; null otherwise. */
  progress: { sent: number; total: number } | null;
  pending: PendingEntry[];
  outbox: OutboxCommand[];
  /** Synced, open wallets and categories on this device: what an offline draft may use. */
  wallets: WalletSnapshot[];
  categories: CategoryDto[];
  /** The open diary's account; null with no open diary (web, opening, locked, signed out). */
  accountId: string | null;
};

/** The signed-in account (its internal id) and the session epoch, or nobody. */
export type DiarySession = { accountId: string | null; epoch: number };

/** What a store's sync reports back: each run's outcome and live progress. */
export type SyncReport = { outcome(outcome: SyncOutcome): void; progress(progress: { sent: number; total: number }): void };

export type SpendDiaryDeps = {
  /** Opens the account's diary only while the session epoch is still `epoch`. */
  open(accountId: string, epoch: number): Promise<DiaryStore>;
  /** Closes the account's diary and deletes its key and file. */
  discard(accountId: string): Promise<void>;
  /** Other on-device copies of the account's data that leave with its diary at an explicit sign-out erase (not at a locked diary's discard): an older build's plain-text import draft. */
  eraseWithDiary?(accountId: string): Promise<void>;
  /** Removes the plain-text import draft an older build kept for the account; called before the diary's import draft is first used. */
  eraseLegacyImportDraft?(accountId: string): Promise<void>;
  session(): DiarySession;
  /** The sync for one open store, flushing only as `session` (the session the store was opened for). */
  makeSync(store: DiaryStore, session: SyncSession, report: SyncReport): { engine: SyncEngine; scheduler: SyncScheduler };
  now(): number;
  newId(): string;
  schemaVersion: number;
};

export interface SpendDiary {
  getView(): DiaryView;
  subscribe(listener: () => void): () => void;
  /** Re-reads the session: opens the current account's diary, closing any other. */
  sessionChanged(): Promise<void>;
  /**
   * Persists a draft and its command on the device, then asks for a sync.
   * Rejects if nothing was saved. One `commandId` per form makes a repeated
   * save of the same draft a no-op.
   */
  saveDraft(entry: PendingEntry, commandId?: string): Promise<void>;
  /** Undo: removes a draft that was never transmitted. */
  removeDraft(commandId: string): Promise<void>;
  /** Discards a draft that needs review (the server never committed it). */
  discardDraft(commandId: string): Promise<void>;
  /** A locked diary's explicit discard: deletes this account's diary on the device and starts over from the synced one. */
  discardDiary(): Promise<void>;
  /** Explicit sign-out: deletes this account's diary on the device (call after the user confirmed). */
  eraseForSignOut(): Promise<void>;
  /**
   * The open account's import review draft, kept inside its encrypted diary;
   * null while no diary is open (web, opening, locked, signed out). A store
   * handed out before a session change rejects from then on: ask again.
   */
  importDraftStore(): ImportDraftStore | null;
  retry(): Promise<void>;
  foreground(): Promise<void>;
  background(): void;
  close(): Promise<void>;
}

const EMPTY: DiaryView = { phase: 'unavailable', lockReason: null, outcome: null, progress: null, pending: [], outbox: [], wallets: [], categories: [], accountId: null };

const BUILTIN_ORDER = new Map<string, number>(BUILTIN_CATEGORIES.map((category, index) => [category.key, index]));

/** Synced, open wallets (by name) and categories (built-ins in their order, then custom by label). */
function references(state: DiaryState): Pick<DiaryView, 'wallets' | 'categories'> {
  const active = (entity: string) => state.confirmed.filter((change) => change.entity === entity && change.state === 'active').map((change) => change.snapshot);
  const wallets = (active('wallet') as WalletSnapshot[]).filter((wallet) => !wallet.archived).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const rank = (category: CategoryDto) => (category.builtin_key ? BUILTIN_ORDER.get(category.builtin_key) ?? 0 : BUILTIN_ORDER.size);
  const categories = (active('category') as CategoryDto[])
    .filter((category) => !category.archived)
    .sort((a, b) => rank(a) - rank(b) || (a.label ?? '').localeCompare(b.label ?? '') || a.id.localeCompare(b.id));
  return { wallets, categories };
}

function failedOpen(error: unknown): DiaryView {
  if (error instanceof DiaryLocked) return { ...EMPTY, phase: 'locked', lockReason: error.reason };
  if (error instanceof DiarySchemaTooNew) return { ...EMPTY, phase: 'locked', lockReason: 'schema_too_new' };
  // The session moved while opening: the next session notification opens the right diary.
  if (error instanceof StaleEpochError) return EMPTY;
  if (error instanceof Error && error.name === 'LocalDiaryUnavailable') return EMPTY;
  return { ...EMPTY, phase: 'locked', lockReason: null };
}

const sameSession = (a: DiarySession | null, b: DiarySession) => a !== null && a.accountId === b.accountId && a.epoch === b.epoch;

/**
 * The signed-in account's device diary for the screens: opens the current
 * account's diary for exactly the current session epoch (closing any other,
 * so one account never sees another's drafts), saves drafts locally before
 * anything is sent, and runs the sync scheduler for that session only. A
 * notification for the same identity (a token refresh) changes nothing. A
 * remote sign-in refusal locks the diary and keeps its drafts; a missing or
 * rejected key locks it with that reason (never a silent empty replacement)
 * until the user discards it; signed out means no diary at all. Results from
 * an earlier session are ignored.
 */
export function createSpendDiary(deps: SpendDiaryDeps): SpendDiary {
  let view: DiaryView = EMPTY;
  let store: DiaryStore | null = null;
  // The import draft store over `store`, made once per open diary.
  let drafts: { diary: DiaryStore; store: ImportDraftStore } | null = null;
  let sync: { engine: SyncEngine; scheduler: SyncScheduler } | null = null;
  let generation = 0;
  // The session whose diary is open or opening, and the run doing it.
  let active: DiarySession | null = null;
  let switching: Promise<void> = Promise.resolve();
  // A diary erased for sign-out stays closed for the rest of that session.
  let erasedFor: DiarySession | null = null;
  const listeners = new Set<() => void>();

  const emit = (next: DiaryView) => {
    view = next;
    for (const listener of listeners) listener();
  };

  async function refresh(target: DiaryStore | null): Promise<void> {
    if (!target || target !== store) return;
    try {
      const [state, outbox] = await Promise.all([target.readState(), target.readOutbox()]);
      if (target === store) emit({ ...view, pending: state.pending, outbox, ...references(state) });
    } catch {
      // Locked or from an earlier session: nothing to show from it.
    }
  }

  async function closeCurrent(): Promise<void> {
    sync?.scheduler.stop();
    sync = null;
    const closing = store;
    store = null;
    drafts = null;
    await closing?.lock().catch(() => undefined);
  }

  function onOutcome(target: DiaryStore, outcome: SyncOutcome): void {
    if (target !== store) return;
    if (outcome.status === 'signed_out') {
      emit({ ...view, phase: 'locked', lockReason: 'signed_out', outcome, progress: null, accountId: null });
      void closeCurrent();
      return;
    }
    emit({ ...view, outcome, progress: null });
    void refresh(target);
  }

  function onProgress(target: DiaryStore, progress: { sent: number; total: number }): void {
    if (target === store) emit({ ...view, progress });
  }

  async function switchTo(next: DiarySession): Promise<void> {
    const mine = ++generation;
    active = next.accountId ? next : null;
    await closeCurrent();
    if (mine !== generation) return;
    const accountId = next.accountId;
    if (!accountId) {
      emit(EMPTY);
      return;
    }
    emit({ ...EMPTY, phase: 'opening' });
    let opened: DiaryStore;
    try {
      opened = await deps.open(accountId, next.epoch);
    } catch (error) {
      if (mine === generation) emit(failedOpen(error));
      return;
    }
    if (mine !== generation) {
      // A newer session took over. Its own open shares this store when it is
      // the same account; another account's store is closed here.
      if (active?.accountId !== opened.accountId) await opened.lock().catch(() => undefined);
      return;
    }
    store = opened;
    sync = deps.makeSync(opened, { accountId, epoch: next.epoch }, { outcome: (outcome) => onOutcome(opened, outcome), progress: (progress) => onProgress(opened, progress) });
    emit({ ...EMPTY, phase: 'ready', accountId });
    await refresh(opened);
    await sync.scheduler.launch();
    await refresh(opened);
  }

  function sessionChanged(): Promise<void> {
    const next = { ...deps.session() };
    if (!sameSession(erasedFor, next)) erasedFor = null;
    else return switching;
    // The same identity again (e.g. a token refresh): keep the diary and its running sync.
    if (sameSession(active, next) && (view.phase === 'ready' || view.phase === 'opening')) return switching;
    switching = switchTo(next);
    return switching;
  }

  function current(): DiaryStore {
    if (!store || view.phase !== 'ready') {
      const reason = view.phase === 'locked' ? view.lockReason : null;
      throw new DiaryLocked(reason === null || reason === 'signed_out' || reason === 'schema_too_new' ? 'locked' : reason);
    }
    return store;
  }

  /** Closes and deletes the current account's diary on this device. */
  async function discardCurrent(): Promise<DiarySession | null> {
    const session = active ?? (deps.session().accountId ? { ...deps.session() } : null);
    if (!session?.accountId) return null;
    generation += 1;
    active = null;
    await closeCurrent();
    await deps.discard(session.accountId);
    return session;
  }

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    sessionChanged,

    async saveDraft(entry, commandId = deps.newId()) {
      const target = current();
      const command: OutboxCommand = {
        commandId,
        accountId: target.accountId,
        schemaVersion: deps.schemaVersion,
        kind: 'transaction.create',
        payload: entry,
        state: 'unsent',
        firstTransmissionAt: null,
        createdAt: new Date(deps.now()).toISOString(),
        ackedRevision: null,
      };
      try {
        await target.savePending(entry, command);
      } catch (error) {
        // A wallet or category created online moments ago: pull it once, then try again.
        if (!(error instanceof DraftReferenceUnavailable) || target !== store || !sync) throw error;
        await sync.scheduler.manual();
        if (target !== store) throw error;
        await target.savePending(entry, command);
      }
      await refresh(target);
      // Saved; sending happens in the background and never decides this save.
      void sync?.scheduler.written();
    },

    async removeDraft(commandId) {
      const target = current();
      await target.removePending(commandId);
      await refresh(target);
    },
    async discardDraft(commandId) {
      const target = current();
      await target.discardReviewed(commandId);
      await refresh(target);
    },
    async discardDiary() {
      if (!(await discardCurrent())) return;
      await sessionChanged();
    },
    async eraseForSignOut() {
      const session = await discardCurrent();
      if (!session) return;
      erasedFor = session;
      emit(EMPTY);
      if (session.accountId) await deps.eraseWithDiary?.(session.accountId);
    },
    importDraftStore() {
      if (!store || view.phase !== 'ready') return null;
      if (drafts?.diary !== store) drafts = { diary: store, store: createDiaryDraftStore(store, deps.eraseLegacyImportDraft) };
      return drafts.store;
    },

    async retry() {
      const target = store;
      await sync?.scheduler.manual();
      await refresh(target);
    },
    async foreground() {
      // A key store that was unavailable (e.g. the device was locked) may work now.
      if (view.phase === 'locked' && view.lockReason === 'key_unavailable') return sessionChanged();
      const target = store;
      await sync?.scheduler.foreground();
      await refresh(target);
    },
    background() {
      sync?.scheduler.background();
    },
    async close() {
      generation += 1;
      active = null;
      await closeCurrent();
      emit(EMPTY);
    },
  };
}
