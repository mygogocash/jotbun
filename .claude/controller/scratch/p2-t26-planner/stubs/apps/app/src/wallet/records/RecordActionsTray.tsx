// RED stub (P2-T26): the plan's interface, with no behaviour yet.
import type { Minor } from '@gogospend/contracts';
import type { ReactNode } from 'react';

import type { MoneySign } from '../money/walletMoney';

export type RecordActionsTrayProps = {
  visible: boolean;
  onClose(): void;
  onClosed?(): void;
  title: string;
  detail: string;
  amountMinor: Minor;
  onEdit(): void;
  onCopy(): void;
  onDelete(): void;
  art?: ReactNode;
  sign?: MoneySign;
};

export function RecordActionsTray(_props: RecordActionsTrayProps) {
  return null;
}
