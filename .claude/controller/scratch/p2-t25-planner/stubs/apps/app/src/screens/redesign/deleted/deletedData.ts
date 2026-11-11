import type { CategoryDto, DeletedHistoryPage, DeletedTransactionDto, WalletSnapshot } from '@gogospend/contracts';
import type { DeletedRow, RecentlyDeletedModel } from '@mobile/spend/v1/redesign/historyModel';
import type { LoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import type { SyncBannerProps } from '@mobile/ui/SyncBanner';

export const RESTORE_PAGE_LIMIT = 50;

export type DeletedLists = { page: DeletedHistoryPage; items: DeletedTransactionDto[] };
export type DeletedReferences = { wallets: readonly Pick<WalletSnapshot, 'id' | 'name'>[]; categories: readonly CategoryDto[] };
export type RestoreTarget = { id: string; version: number };
export type RestoreNotice = { tone: 'alert' | 'status'; message: string; about?: string };

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
  return {
    lists: null,
    refs: null,
    error: null,
    loadingMore: false,
    restoring: null,
    pending: null,
    notice: null,
    shownNotice: null,
    lookups: null,
    model: null,
    held: null,
    offline: false,
    banner: null,
    problem: null,
    busy: false,
    load: async () => {},
    loadMore: async () => {},
    restore: async () => {},
  };
}
