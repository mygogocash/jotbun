// Helpers cut unchanged from QuickAddScreen, shared by the form and the hooks.
import type { CategoryDto, Minor, TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { V1Error } from '@mobile/api/client';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { newQuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import { rankRecentCategories } from '@mobile/spend/v1/redesign/recentCategories';
import type { RecentCategories } from '@mobile/spend/v1/redesign/recentCategories';
import { duplicateDraft } from '@mobile/spend/v1/redesign/recordModel';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import type { CreateEntryInput, CreateTransferInput } from '@mobile/spend/v1/resources';
import { DiaryLocked, DraftReferenceUnavailable } from '@mobile/storage/types';
import type { PendingEntry } from '@mobile/storage/types';
import { EMPTY_KEYPAD, keypadFromMinor } from '@mobile/ui/keypadExpression';
import type { KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import type { WalletChoice } from '@mobile/ui/WalletPicker';
import { newId } from '../../v1/parts';

export type Ranking = Readonly<Record<'expense' | 'income', RecentCategories>>;
export type References = { wallets: WalletSnapshot[]; categories: CategoryDto[] };
export type CopySource = TransactionDto | PendingEntry;
export type CreateInput = CreateEntryInput | CreateTransferInput;

/** What the amount line says when the keypad refuses a key or a save. */
export const KEYPAD_PROBLEM_TEXT: Readonly<Record<KeypadProblem, string>> = {
  empty: 'Enter an amount',
  zero: 'Enter an amount above zero',
  too_precise: 'Use at most two decimal places',
  too_large: 'Amounts go up to ฿999,999,999.99',
  negative: "The sum can't go below zero.",
  divide_by_zero: "You can't divide by zero.",
};

/** The current form's device-save messages, word for word. */
export function localSaveProblem(error: unknown, tc: Translate): string {
  if (error instanceof DiaryLocked) return tc("This device's diary is locked. Nothing was saved.");
  if (error instanceof DraftReferenceUnavailable) return tc("This wallet or category isn't on this device yet. Connect and try again. Nothing was saved.");
  return tc("Couldn't save this entry on the device. Nothing was saved.");
}

/** A record that cannot be loaded for Copy: gone, or the same problems as any load. */
export function copyProblem(error: unknown, tc: Translate): { message: string; retry: boolean } {
  const outcome = error instanceof V1Error ? error.outcome : undefined;
  if (outcome === 'not_found' || outcome === 'deleted' || outcome === 'purged') return { message: tc("This entry isn't available to copy."), retry: false };
  const problem = classifyLoadProblem(error, tc);
  return { message: problem.message, retry: problem.retry };
}

export function rank(categories: readonly CategoryDto[], records: readonly TransactionDto[], drafts: readonly PendingEntry[], today: string): Ranking {
  return {
    expense: rankRecentCategories({ type: 'expense', categories, records, drafts, today }),
    income: rankRecentCategories({ type: 'income', categories, records, drafts, today }),
  };
}

export const ordered = (ranked: RecentCategories): CategoryDto[] => [...ranked.top, ...ranked.rest];

/** The draft the form opens with: a new one, or a copy whose other modes get the usual defaults. */
export function firstDraft(source: CopySource | null, context: { today: string; wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[]; ranking: Ranking }): QuickAddDraft {
  const { today, wallets, categories, ranking } = context;
  const byRank = [...ordered(ranking.expense), ...ordered(ranking.income)];
  if (!source) return newQuickAddDraft({ ids: { recordId: newId(), commandId: newId() }, today, wallets, categories: byRank });
  const copy = duplicateDraft(source, { newId, today, wallets, categories });
  const blank = newQuickAddDraft({ ids: { recordId: copy.recordId, commandId: copy.commandId }, today, wallets, categories: byRank });
  // The copied fields stay exactly as copied (a closed wallet or category stays unchosen);
  // only the other modes, which the record never had, take the defaults.
  return {
    ...copy,
    walletId: copy.type === 'transfer' ? blank.walletId : copy.walletId,
    fromWalletId: copy.type === 'transfer' ? copy.fromWalletId : blank.fromWalletId,
    toWalletId: copy.type === 'transfer' ? copy.toWalletId : blank.toWalletId,
    categoryByType: {
      expense: copy.type === 'expense' ? copy.categoryByType.expense : blank.categoryByType.expense,
      income: copy.type === 'income' ? copy.categoryByType.income : blank.categoryByType.income,
    },
  };
}

/** Before the first touch a new draft's default categories follow the ranking; a copy keeps its own. */
export function withDefaults(draft: QuickAddDraft, ranking: Ranking, source: CopySource | null): QuickAddDraft {
  const top = (type: 'expense' | 'income') => ranking[type].top[0]?.id ?? null;
  return {
    ...draft,
    categoryByType: {
      expense: source?.type === 'expense' ? draft.categoryByType.expense : top('expense'),
      income: source?.type === 'income' ? draft.categoryByType.income : top('income'),
    },
  };
}

/** The latest tracking start of the draft's wallet(s): no date before it can be saved. */
export function earliestFor(draft: QuickAddDraft, wallets: readonly WalletSnapshot[]): string | null {
  const ids = draft.type === 'transfer' ? [draft.fromWalletId, draft.toWalletId] : [draft.walletId];
  let latest: string | null = null;
  for (const id of ids) {
    const start = wallets.find((wallet) => wallet.id === id)?.tracking_start;
    if (start && (latest === null || start > latest)) latest = start;
  }
  return latest;
}

// Moved unchanged to a pure module, so the Bun Wallet Home's cards read the
// same rule (P2-T23): `spend/v1/redesign/availableBalances.ts`.
export { availableBalances } from '@mobile/spend/v1/redesign/availableBalances';

/**
 * Wallets for WalletPicker, each with its balance when the server's list gave
 * one. Offline (the device's synced wallets) there is none, and WalletPicker
 * then shows the name only and offers no "move all": a guessed balance would
 * be a wrong number on screen.
 */
export function walletChoices(wallets: readonly WalletSnapshot[], balances: ReadonlyMap<string, Minor> | null): WalletChoice[] {
  return wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, archived: wallet.archived, balance_minor: balances?.get(wallet.id) ?? null }));
}

export function keypadFor(source: CopySource | null): KeypadState {
  if (!source) return EMPTY_KEYPAD;
  try {
    return keypadFromMinor(source.amount_minor);
  } catch {
    return EMPTY_KEYPAD;
  }
}
