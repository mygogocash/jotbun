// History's view while one of its own screens is open (R3 gap "Loaded pages
// on a remount"). The spend layout draws its screens in a `Slot`, so History
// unmounts while a record or Recently deleted is open, and Back mounts it
// again. A keep holds what the person had set up for that way back: the
// filters, the search text and how many entries were loaded. Never the
// entries: History reads them again, so an entry changed or deleted on the
// record shows its new state.
//
// Memory only, so a cold start begins clean. A view kept under one session
// epoch is never returned under another (sign-out, another account, a new
// binding), and the explicit sign-out erase (`eraseWithDiary`) forgets it.
// The provider (HistoryKeepProvider) scopes a keep to the spend layout and
// to the way back. Nothing here imports React or the router.
import type { TransactionType } from '@gogospend/contracts';

/** What History gets back on the way back, for `month` only. */
export type KeptHistoryView = {
  month: string;
  type: TransactionType | undefined;
  walletId: string | undefined;
  categoryId: string | undefined;
  query: string;
  /** Entries loaded when History unmounted: the way back reads as many again (up to the page cap). */
  shown: number;
};

export type HistoryKeep = {
  keep(view: KeptHistoryView): void;
  /** The kept view, or null. A view kept under another session is dropped, never returned. */
  kept(): KeptHistoryView | null;
  forget(): void;
};

/** One view at most, stamped with the session epoch it was kept under. `sessionChanged` drops it at once if that moved. */
export function createHistoryKeep(epoch: () => number): HistoryKeep & { sessionChanged(): void } {
  let held: { epoch: number; view: KeptHistoryView } | null = null;
  const current = () => {
    if (held && held.epoch !== epoch()) held = null;
    return held;
  };
  return {
    keep(view) {
      held = { epoch: epoch(), view };
    },
    kept: () => current()?.view ?? null,
    sessionChanged() {
      current();
    },
    forget() {
      held = null;
    },
  };
}

/** History, the screens it opens and comes back from (a record, Recently deleted), and Quick add over a record. */
export function onTheWayBack(pathname: string): boolean {
  const [area, screen] = pathname.split('/').filter((part) => part !== '');
  return area === 'spend' && (screen === 'all' || screen === 'record' || screen === 'deleted' || screen === 'add');
}

// The keeps mounted now (in the app, the spend layout's one), for the sign-out erase.
const mounted = new Set<HistoryKeep>();

/** Puts `keep` in reach of the sign-out erase until the returned function is called. */
export function mountHistoryKeep(keep: HistoryKeep): () => void {
  mounted.add(keep);
  return () => {
    mounted.delete(keep);
  };
}

/** The explicit sign-out erase: History's kept view goes with the diary. */
export function forgetKeptHistory(): void {
  for (const keep of mounted) keep.forget();
}
