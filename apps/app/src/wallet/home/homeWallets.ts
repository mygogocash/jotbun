// The Bun Wallet Home's card stack (P2-T23; bw-home, rh-offline, W7, W28):
// the wallets in use, in the kept order, as CardStack draws them, the front
// card last. Each card's balance is what the wallet holds as far as this
// phone knows (availableBalances: the server's balance less what waiting
// drafts take out, plus what they bring in), with the waiting drafts that
// touch it added up (still saving) and today's confirmed money out of it,
// which the stack shows on its front card only. Drafts being checked may
// already be in the server's balance, so neither figure counts them. Pure: a
// Node test reads it. Money stays exact (BigInt over canonical satang strings).
import type { TransactionDto, WalletDto } from '@gogospend/contracts';

import { availableBalances } from '../../spend/v1/redesign/availableBalances.ts';
import { WAITING_STATES } from '../../spend/v1/redesign/shared.ts';
import type { OutboxCommand } from '../../storage/types.ts';
import type { StackWallet } from '../card/CardStack.tsx';
import type { WalletLook } from '../looks/walletLooks.ts';

/**
 * The wallets in use, front first: the kept order first (W28), then every
 * wallet it does not name, by name, as the device diary lists wallets. An id
 * the order names that is not in use here (archived, or unknown) is passed
 * over. This is P2-T20's `frontFirst` (`wallet/wallets/walletsList.ts`, which
 * the wallets list and the reorder tray use), copied while that task is not
 * on the integration branch; P2-T24, which starts after both, imports that
 * one here instead and deletes this copy.
 */
function frontFirst<T extends Pick<WalletDto, 'id' | 'name' | 'archived'>>(wallets: readonly T[], order: readonly string[]): T[] {
  const left = new Map(wallets.filter((wallet) => !wallet.archived).map((wallet) => [wallet.id, wallet]));
  const kept: T[] = [];
  for (const id of order) {
    const wallet = left.get(id);
    if (wallet === undefined) continue;
    kept.push(wallet);
    left.delete(id);
  }
  const rest = [...left.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return [...kept, ...rest];
}

/**
 * The waiting drafts that touch each wallet, added up: what its card says is
 * still saving. They are the drafts availableBalances moves (never sent, so
 * not yet in the server's balance). A transfer touches both of its wallets.
 */
function savingByWallet(outbox: readonly OutboxCommand[]): Map<string, bigint> {
  const saving = new Map<string, bigint>();
  const add = (id: string, amount: bigint) => {
    saving.set(id, (saving.get(id) ?? 0n) + amount);
  };
  for (const command of outbox) {
    if (!WAITING_STATES.includes(command.state)) continue;
    const entry = command.payload;
    const amount = BigInt(entry.amount_minor);
    if (entry.type === 'transfer') {
      add(entry.source_wallet_id, amount);
      add(entry.destination_wallet_id, amount);
    } else {
      add(entry.wallet_id, amount);
    }
  }
  return saving;
}

/** Each wallet's confirmed expenses among today's records. Income and transfers are not spending. */
function spentByWallet(todayRecords: readonly TransactionDto[]): Map<string, bigint> {
  const spent = new Map<string, bigint>();
  for (const record of todayRecords) {
    if (record.type !== 'expense') continue;
    spent.set(record.wallet_id, (spent.get(record.wallet_id) ?? 0n) + BigInt(record.amount_minor));
  }
  return spent;
}

export function homeWallets(input: {
  wallets: readonly WalletDto[];
  todayRecords: readonly TransactionDto[];
  outbox: readonly OutboxCommand[];
  order: readonly string[];
  lookOf: (id: string) => WalletLook;
}): StackWallet[] {
  const balances = availableBalances(input.wallets, input.outbox);
  const saving = savingByWallet(input.outbox);
  const spent = spentByWallet(input.todayRecords);
  // CardStack draws the cards in the order given, the front card last.
  return frontFirst(input.wallets, input.order).reverse().map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    // availableBalances answers for every wallet it is given: the fallback only narrows the type.
    balanceMinor: balances.get(wallet.id) ?? wallet.balance_minor,
    pendingMinor: (saving.get(wallet.id) ?? 0n).toString(),
    todayOutMinor: (spent.get(wallet.id) ?? 0n).toString(),
    look: input.lookOf(wallet.id),
  }));
}
