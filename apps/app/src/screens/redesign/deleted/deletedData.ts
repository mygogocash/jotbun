import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import type { CategoryDto, DeletedHistoryPage, DeletedTransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { saveProblem, useCommandKeys, useMoneyLocale } from '@mobile/screens/v1/parts';
import { recentlyDeletedModel, restoreRefusalText, restoredText } from '@mobile/spend/v1/redesign/historyModel';
import type { DeletedRow, RecentlyDeletedModel } from '@mobile/spend/v1/redesign/historyModel';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import type { LoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import type { SyncBannerProps } from '@mobile/ui/SyncBanner';

export const RESTORE_PAGE_LIMIT = 50;

export type DeletedLists = { page: DeletedHistoryPage; items: DeletedTransactionDto[] };
export type DeletedReferences = { wallets: readonly Pick<WalletSnapshot, 'id' | 'name'>[]; categories: readonly CategoryDto[] };
export type RestoreTarget = { id: string; version: number };
export type RestoreNotice = {
  tone: 'alert' | 'status';
  message: string;
  about?: string;
  /**
   * After a confirmed restore: the entry that came back. `message` says it with its amount (History's words, which
   * the old screen shows); the wallet screen words it without the amount while private mode is on (R109).
   */
  restored?: DeletedRow;
};

/** Each entry's restore keeps its own command key. */
export const restoreSlot = (id: string) => `restore:${id}`;

export const lookupsOf = (refs: DeletedReferences): Lookups => ({
  wallets: new Map(refs.wallets.map((wallet) => [wallet.id, wallet])),
  categories: new Map(refs.categories.map((category) => [category.id, category])),
});

export type RecentlyDeletedState = {
  lists: DeletedLists | null;
  refs: DeletedReferences | null;
  error: unknown;
  loadingMore: boolean;
  restoring: string | null;
  pending: RestoreTarget | null;
  notice: RestoreNotice | null;
  shownNotice: RestoreNotice | null;
  lookups: Lookups | null;
  model: RecentlyDeletedModel | null;
  held: RestoreTarget | null;
  offline: boolean;
  banner: SyncBannerProps | null;
  problem: LoadProblem | null;
  busy: boolean;
  load: (keepShown?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  restore: (row: DeletedRow) => Promise<void>;
};

export function useRecentlyDeleted(now?: Date): RecentlyDeletedState {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const keys = useCommandKeys();
  const diaryView = useDiaryView();

  const [lists, setLists] = useState<DeletedLists | null>(null);
  const [refs, setRefs] = useState<DeletedReferences | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** The entry whose restore is on its way. */
  const [restoring, setRestoring] = useState<string | null>(null);
  /** A restore whose answer is unknown: frozen until "Try again" resends the same command. */
  const [pending, setPending] = useState<RestoreTarget | null>(null);
  // `about`: the entry an unconfirmed restore's notice is about, so the notice can go once that entry is.
  const [notice, setNotice] = useState<RestoreNotice | null>(null);
  const generation = useRef(0);
  const shown = useRef(0);
  const acting = useRef(false);

  /** Loads the first page again; in place, as many entries as were on screen (up to the page cap). */
  const load = useCallback(async (keepShown = false) => {
    const round = ++generation.current;
    setError(null);
    const limit = keepShown ? Math.min(HISTORY_MAX_LIMIT, Math.max(RESTORE_PAGE_LIMIT, shown.current)) : undefined;
    try {
      const [wallets, categories, page] = await Promise.all([
        resources.wallets(),
        resources.ensureBuiltinCategories(),
        limit === undefined ? resources.recentlyDeleted() : resources.recentlyDeleted(undefined, limit),
      ]);
      if (round !== generation.current) return;
      shown.current = page.items.length;
      setRefs({ wallets, categories });
      setLists({ page, items: page.items });
    } catch (problem) {
      if (round === generation.current) setError(problem);
    }
  }, [resources]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!lists?.page.next_cursor || loadingMore) return;
    const round = generation.current;
    setLoadingMore(true);
    try {
      const page = await resources.recentlyDeleted(lists.page.next_cursor);
      if (round !== generation.current) return;
      const items = [...lists.items, ...page.items];
      shown.current = items.length;
      setLists({ page, items });
    } catch (problem) {
      if (round === generation.current) setNotice({ tone: 'alert', message: classifyLoadProblem(problem, tc).message });
    } finally {
      setLoadingMore(false);
    }
  }

  async function restore(row: DeletedRow) {
    if (acting.current) return;
    acting.current = true;
    const target: RestoreTarget = { id: row.recordId, version: row.version };
    const slot = restoreSlot(row.recordId);
    const key = keys.keyFor(slot, target);
    setRestoring(row.recordId);
    try {
      await resources.restoreTransaction(row.recordId, row.version, key);
      keys.settle(slot);
      setPending(null);
      // Off this list at once; the list is read again in place below.
      setLists((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== row.recordId) } : current));
      setNotice({ tone: 'status', message: restoredText(row, locale, tc), restored: row });
      playHaptic('saveLanded');
    } catch (problem) {
      playHaptic('saveFailed');
      const v1 = problem instanceof V1Error ? problem : undefined;
      const saved = saveProblem(problem, tc);
      if (!saved.unconfirmed) keys.settle(slot);
      setPending(saved.unconfirmed ? target : null);
      setNotice({ tone: 'alert', message: restoreRefusalText(v1?.outcome, v1?.fields ?? {}, tc) ?? saved.message, ...(saved.unconfirmed ? { about: target.id } : {}) });
      // A definite refusal: read the list again, so it shows what can still be restored.
      if (!saved.unconfirmed) void load(true);
      return;
    } finally {
      acting.current = false;
      setRestoring(null);
    }
    void load(true);
  }

  const lookups = useMemo(() => (refs ? lookupsOf(refs) : null), [refs]);
  const model = useMemo(
    () => (lists && lookups ? recentlyDeletedModel({ records: lists.items, now: now ?? new Date(), lookups, tc, locale }) : null),
    [lists, lookups, now, tc, locale],
  );
  // A restore whose answer is unknown holds the other Restores only while its own row (and Try again) is listed. A
  // read that no longer lists it (Refresh, or Try again after a failed read) shows it was restored after all, or can
  // no longer be: its command is done.
  const held = pending && model?.rows.some((row) => row.recordId === pending.id) ? pending : null;
  useEffect(() => {
    if (!pending || !model || held) return;
    keys.settle(restoreSlot(pending.id));
    setPending(null);
    setNotice((current) => (current?.about === pending.id ? null : current));
  }, [pending, model, held, keys.settle]);
  // Its "try again" notice shows only while its row does: once a read no longer lists it, there is nothing left to
  // try again. Decided here too, so it goes in the same frame as the row.
  const shownNotice = notice?.about !== undefined && held?.id !== notice.about ? null : notice;
  // History's banners: the diary locked, or offline where this phone keeps a diary.
  const offline = error instanceof V1Error && error.outcome === 'network' && diaryView.phase === 'ready';
  const banner: SyncBannerProps | null = diaryView.phase === 'locked' ? { state: 'locked' } : offline ? { state: 'offline' } : null;
  const problem = error ? classifyLoadProblem(error, tc) : null;
  const busy = restoring !== null;

  return {
    lists,
    refs,
    error,
    loadingMore,
    restoring,
    pending,
    notice,
    shownNotice,
    lookups,
    model,
    held,
    offline,
    banner,
    problem,
    busy,
    load,
    loadMore,
    restore,
  };
}
