// RED stub (P2-T21): the plan's interface, with no behaviour yet.
import type { WalletCorrectionReason } from '@gogospend/contracts';

export function CorrectionTray(_props: { visible: boolean; onClose(): void; onReason(reason: WalletCorrectionReason): void }) {
  return null;
}
