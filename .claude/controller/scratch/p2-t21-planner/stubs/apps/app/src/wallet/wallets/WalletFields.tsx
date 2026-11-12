// RED stub (P2-T21): the plan's interface, with no behaviour yet.
import type { WalletFieldErrors, WalletForm } from '@mobile/spend/v1/redesign/planning/walletsModel';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import type { WalletCardModel } from '../card/WalletCard';
import type { WalletLook } from '../looks/walletLooks';

export type WalletFieldsProps = {
  form: WalletForm;
  onForm(next: WalletForm): void;
  look: WalletLook;
  onLook(next: WalletLook): void;
  keypad: KeypadState;
  onKeypad(next: KeypadState): void;
  errors: WalletFieldErrors;
  preview: WalletCardModel;
  today: string;
  locked?: boolean;
};

export function WalletFields(_props: WalletFieldsProps) {
  return null;
}
