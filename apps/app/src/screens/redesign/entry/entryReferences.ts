// Quick add's reference load, cut from the screen body above the form: the
// three loads, the device lists, the lists frozen for the form's life, the
// copy source and the balances the form may offer to move.
import { HISTORY_MAX_LIMIT, isUuid } from '@gogospend/contracts';
import type { CategoryDto, Minor, TransactionDto, WalletDto, WalletSnapshot } from '@gogospend/contracts';
import { useEffect, useState } from 'react';

import { useCopy } from '@mobile/i18n/useCopy';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { RECENT_WINDOW_DAYS } from '@mobile/spend/v1/redesign/recentCategories';
import { addDays } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { PendingEntry } from '@mobile/storage/types';
import { useLoad } from '../../v1/parts';
import { availableBalances, copyProblem } from './entryHelpers';
import type { CopySource, References } from './entryHelpers';

export type EntryReferences =
  | { state: 'loading'; label: string }
  | { state: 'problem'; message: string; retry: (() => void) | null; startBlank: (() => void) | null }
  | { state: 'no_wallet' }
  | { state: 'ready'; today: string; wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[];
      balances: ReadonlyMap<string, Minor> | null; records: readonly TransactionDto[]; drafts: readonly PendingEntry[];
      source: CopySource | null; refreshBalances: () => void };

type Loaded = { wallets: WalletDto[]; categories: CategoryDto[] };

const NO_RECORDS: readonly TransactionDto[] = [];

export function useEntryReferences(input: { copyOf: string | null; now?: Date }): EntryReferences {
  const resources = useSpendV1();
  const tc = useCopy();
  const diaryView = useDiaryView();
  const copyOf = input.copyOf;
  const today = todayInBangkok(input.now ?? new Date());
  const loaded = useLoad(async (): Promise<Loaded> => {
    const [wallets, categories] = await Promise.all([resources.wallets(), resources.ensureBuiltinCategories()]);
    return { wallets: wallets.filter((wallet) => !wallet.archived), categories: categories.filter((category) => !category.archived) };
  }, [resources]);
  // Recent use for the category order: one page of the last 60 days. Best effort; it never blocks the form.
  const recent = useLoad(
    () => resources.history({ from: addDays(today, 1 - RECENT_WINDOW_DAYS), through: today, sort: 'date_desc' }, undefined, HISTORY_MAX_LIMIT),
    [resources, today],
  );
  const copied = useLoad(async () => (copyOf !== null && isUuid(copyOf) ? resources.transaction(copyOf) : null), [resources, copyOf]);
  const [blankInstead, setBlankInstead] = useState(false);
  // Synced to the device: usable offline, and exactly what a device save accepts.
  const onDevice = diaryView.phase === 'ready' && diaryView.wallets.length > 0 && diaryView.categories.length > 0 ? { wallets: diaryView.wallets, categories: diaryView.categories } : null;
  // The form keeps the lists it first showed for its whole life.
  const [shown, setShown] = useState<References | null>(null);
  const references = shown ?? onDevice ?? (loaded.state === 'ready' ? loaded.data : null);
  useEffect(() => {
    if (!shown && references) setShown(references);
  }, [shown, references]);

  if (!references && loaded.state === 'loading') return { state: 'loading', label: tc('Loading your wallets') };
  if (!references && loaded.state === 'error') {
    const problem = classifyLoadProblem(loaded.error, tc);
    return { state: 'problem', message: problem.message, retry: problem.retry ? loaded.reload : null, startBlank: null };
  }
  if (!references || references.wallets.length === 0) return { state: 'no_wallet' };

  let source: CopySource | null = null;
  if (copyOf !== null && !blankInstead) {
    // A draft still on the device is copied from the device; anything else from the server.
    // A deleted record is not offered for copying, even through the URL.
    source = diaryView.pending.find((pending) => pending.id === copyOf) ?? (copied.state === 'ready' && !copied.data?.deleted_at ? copied.data : null);
    if (!source) {
      if (copied.state === 'loading') return { state: 'loading', label: tc('Loading the entry to copy') };
      const problem = copied.state === 'error' ? copyProblem(copied.error, tc) : { message: tc("This entry isn't available to copy."), retry: false };
      return {
        state: 'problem',
        message: problem.message,
        retry: problem.retry ? copied.reload : null,
        startBlank: () => setBlankInstead(true),
      };
    }
  }

  const balances = loaded.state === 'ready' ? availableBalances(loaded.data.wallets, diaryView.outbox) : null;
  return {
    state: 'ready',
    today,
    wallets: references.wallets,
    categories: references.categories,
    balances,
    records: recent.state === 'ready' ? recent.data.items : NO_RECORDS,
    drafts: diaryView.pending,
    source,
    refreshBalances: loaded.refresh,
  };
}
