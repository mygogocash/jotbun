// What each wallet holds as far as this device knows (P2-T5's rule). P2-T23
// moved it here unchanged from `screens/redesign/entry/entryHelpers.ts`,
// which re-exports it, so a pure model can read it too: Quick add's "move
// all" and the Bun Wallet Home's cards (`wallet/home/homeWallets.ts`) share
// one rule. Pure: a Node test reads it, through homeWallets.test.ts. Money
// stays exact (BigInt over canonical satang strings).
import type { Minor } from '@gogospend/contracts';

import type { OutboxCommand } from '../../../storage/types.ts';
import { WAITING_STATES, openDrafts } from './shared.ts';

/**
 * What each wallet holds as far as this device knows: the server's balance,
 * less what drafts waiting on this device take out of it and plus what they
 * bring in. Drafts being checked may already be in the server's balance, so
 * they are left out, as the budget pace leaves them out. "Move all" offers
 * this, so it never offers money a waiting draft already spent.
 */
export function availableBalances(wallets: readonly { id: string; balance_minor: Minor }[], outbox: readonly OutboxCommand[]): Map<string, Minor> {
  const held = new Map(wallets.map((wallet) => [wallet.id, BigInt(wallet.balance_minor)]));
  const move = (id: string, delta: bigint) => {
    const balance = held.get(id);
    if (balance !== undefined) held.set(id, balance + delta);
  };
  for (const command of openDrafts(outbox)) {
    if (!WAITING_STATES.includes(command.state)) continue;
    const entry = command.payload;
    const amount = BigInt(entry.amount_minor);
    if (entry.type === 'transfer') {
      move(entry.source_wallet_id, -amount);
      move(entry.destination_wallet_id, amount);
    } else {
      move(entry.wallet_id, entry.type === 'expense' ? -amount : amount);
    }
  }
  return new Map([...held].map(([id, balance]) => [id, balance.toString()]));
}
