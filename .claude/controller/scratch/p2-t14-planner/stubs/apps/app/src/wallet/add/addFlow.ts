// RED stub (P2-T14): the real types and signatures, with answers that are wrong on purpose.
import type { Minor } from '@gogospend/contracts';

import type { QuickAddDraft } from '../../spend/v1/redesign/quickAddModel.ts';
import type { Lookups, Translate } from '../../spend/v1/redesign/shared.ts';
import type { DateLocale } from '../../ui/dateStep.ts';
import type { KeypadProblem, KeypadState } from '../../ui/keypadExpression.ts';

export type AddType = 'expense' | 'income' | 'transfer';

export type AddStep = 'amount' | 'transfer' | 'confirm' | 'category' | 'wallet' | 'from' | 'to' | 'date' | 'note';

export type StepProps = {
  draft: QuickAddDraft;
  keypad: KeypadState;
  onDraft(next: QuickAddDraft): void;
  onKeypad(next: KeypadState): void;
  onStep(step: AddStep): void;
};

export function trayTitleKey(_type: AddType): 'add.titleExpense' | 'add.titleIncome' | 'add.titleTransfer' {
  return 'add.titleExpense';
}

export function stepAfterAmount(_type: AddType): AddStep {
  return 'confirm';
}

export function amountProblem(_keypad: KeypadState): KeypadProblem | null {
  return null;
}

export type ConfirmRow = { key: 'category' | 'wallet' | 'from' | 'to' | 'date' | 'note'; labelKey: string; value: string; guessed: boolean };

export function confirmRows(
  _draft: QuickAddDraft,
  _context: { lookups: Lookups; today: string; dateLocale: DateLocale; guessed: ReadonlySet<string>; tc: Translate },
): ConfirmRow[] {
  return [];
}

export function stillGuessed(guessed: ReadonlySet<string>, _before: QuickAddDraft, _after: QuickAddDraft): ReadonlySet<string> {
  return guessed;
}

export function moveAllMinor(_balances: ReadonlyMap<string, Minor> | null, _walletId: string | null): Minor | null {
  return null;
}

export function balancesAfter(
  _balances: ReadonlyMap<string, Minor> | null,
  _fromId: string | null,
  _toId: string | null,
  _amountMinor: Minor,
): { from: Minor | null; to: Minor | null } {
  return { from: null, to: null };
}
