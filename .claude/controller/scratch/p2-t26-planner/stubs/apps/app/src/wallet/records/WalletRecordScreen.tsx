// RED stub (P2-T26): the plan's interface, with no behaviour yet.
import type { Minor } from '@gogospend/contracts';

import type { WalletT } from '../copy/draftText';

export type WalletRecordScreenProps = { id: string; mode?: 'view' | 'edit'; now?: Date };

export function deletedBarText(_title: string, _amountMinor: Minor, _hidden: boolean, _t: WalletT): string {
  return '';
}

export function WalletRecordScreen(_props: WalletRecordScreenProps) {
  return null;
}
