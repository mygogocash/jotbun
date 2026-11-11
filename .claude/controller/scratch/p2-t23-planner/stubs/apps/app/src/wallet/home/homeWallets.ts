// RED stub (P2-T23): the real signature, with no cards.
import type { TransactionDto, WalletDto } from '@gogospend/contracts';

import type { OutboxCommand } from '../../storage/types.ts';
import type { StackWallet } from '../card/CardStack.tsx';
import type { WalletLook } from '../looks/walletLooks.ts';

export function homeWallets(_input: {
  wallets: readonly WalletDto[];
  todayRecords: readonly TransactionDto[];
  outbox: readonly OutboxCommand[];
  order: readonly string[];
  lookOf: (id: string) => WalletLook;
}): StackWallet[] {
  return [];
}
