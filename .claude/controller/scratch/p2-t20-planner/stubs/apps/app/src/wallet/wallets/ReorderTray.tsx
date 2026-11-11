// RED stub (P2-T20): the plan's interface, with no behaviour yet.
import type { WalletDto } from '@gogospend/contracts';

export function Chevron(_props: { direction: 'up' | 'down' | 'right'; size: number; color: string }) {
  return null;
}

export function ReorderTray(_props: { visible: boolean; onClose(): void; wallets: readonly WalletDto[] }) {
  return null;
}
