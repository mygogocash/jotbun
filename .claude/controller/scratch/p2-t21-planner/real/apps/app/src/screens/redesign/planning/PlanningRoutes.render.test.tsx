// The R4 Planning routes (app/spend/budget.tsx, wallets.tsx, categories.tsx):
// each shows its screen only under the `planning` area, never in the legacy
// build, and otherwise goes back to Home. While the `wallet` area is on,
// wallets.tsx shows the Bun Wallet's list instead (P2-T20), and the Bun
// Wallet's new-wallet and edit routes (P2-T21: wallet/new.tsx and
// wallet/[id]/edit.tsx) show its screens; otherwise they go to the list.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import SpendBudgetRoute from '../../../../app/spend/budget';
import SpendCategoriesRoute from '../../../../app/spend/categories';
import SpendWalletsRoute from '../../../../app/spend/wallets';
import SpendWalletEditRoute from '../../../../app/spend/wallet/[id]/edit';
import SpendNewWalletRoute from '../../../../app/spend/wallet/new';

const route = vi.hoisted(() => ({ params: {} as Record<string, string> }));
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`),
    useLocalSearchParams: () => route.params,
  };
});
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => ({ marker: 'shared resources' }) }));
function stub(name: string, text: string) {
  return async () => {
    const { createElement } = await import('react');
    const { Text } = await import('react-native');
    const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
    return { [name]: () => createElement(Text, null, `${text} with ${String((useSpendV1() as unknown as { marker: string }).marker)}`) };
  };
}
vi.mock('@mobile/screens/redesign/planning/BudgetScreen', stub('BudgetScreen', 'budget'));
vi.mock('@mobile/screens/redesign/planning/WalletsScreen', stub('WalletsScreen', 'wallets'));
vi.mock('@mobile/screens/redesign/planning/CategoriesScreen', stub('CategoriesScreen', 'categories'));
// The Bun Wallet's list (P2-T20), which says whether it opens its reorder tray.
vi.mock('@mobile/wallet/wallets/WalletsListScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  return {
    WalletsListScreen: ({ openReorder }: { openReorder?: boolean }) =>
      createElement(Text, null, `wallet list${openReorder ? ' reordering' : ''} with ${String((useSpendV1() as unknown as { marker: string }).marker)}`),
  };
});
// The Bun Wallet's new-wallet flow and edit screen (P2-T21), which say where they return and which wallet they edit.
vi.mock('@mobile/wallet/wallets/NewWalletFlow', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  return {
    NewWalletFlow: ({ returnTo }: { returnTo?: string }) =>
      createElement(Text, null, `new wallet${returnTo ? ` back to ${returnTo}` : ''} with ${String((useSpendV1() as unknown as { marker: string }).marker)}`),
  };
});
vi.mock('@mobile/wallet/wallets/WalletEditScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  return {
    WalletEditScreen: ({ walletId }: { walletId: string }) =>
      createElement(Text, null, `editing ${walletId} with ${String((useSpendV1() as unknown as { marker: string }).marker)}`),
  };
});

const ENV = { redesign: process.env.EXPO_PUBLIC_REDESIGN, legacy: process.env.EXPO_PUBLIC_LEGACY_SPEND };
function flags({ redesign, legacy }: { redesign?: string; legacy?: string }) {
  if (redesign === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = redesign;
  if (legacy === undefined) delete process.env.EXPO_PUBLIC_LEGACY_SPEND;
  else process.env.EXPO_PUBLIC_LEGACY_SPEND = legacy;
}
beforeEach(() => {
  flags({});
  route.params = {};
});
afterEach(() => {
  cleanup();
  flags(ENV);
});

const ROUTES = [[SpendBudgetRoute, 'budget'], [SpendWalletsRoute, 'wallets'], [SpendCategoriesRoute, 'categories']] as const;

test.each(ROUTES)('%#: the screen only under the planning area (on since E2 checkpoint 2), with the shared resources', (Route, name) => {
  flags({ redesign: '-planning' });
  render(<Route />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
  cleanup();
  flags({});
  render(<Route />);
  expect(screen.getByText(`${name} with shared resources`)).toBeTruthy();
  cleanup();
  flags({ redesign: 'planning', legacy: '1' });
  render(<Route />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
});

test('in the wallet area wallets.tsx shows the Bun Wallet list with the shared resources, ?reorder=1 opens its reorder tray, and the legacy build still goes back to Home', () => {
  flags({ redesign: 'wallet' });
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('wallet list with shared resources')).not.toBeNull();
  cleanup();
  route.params = { reorder: '1' };
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('wallet list reordering with shared resources')).not.toBeNull();
  cleanup();
  // The wallet area is its own (W1): it does not need the planning area.
  flags({ redesign: '-planning,wallet' });
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('wallet list reordering with shared resources')).not.toBeNull();
  cleanup();
  route.params = { reorder: '0' };
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('wallet list with shared resources')).not.toBeNull();
  cleanup();
  flags({ redesign: 'wallet', legacy: '1' });
  render(<SpendWalletsRoute />);
  expect(screen.queryByText('redirect to /spend')).not.toBeNull();
});

test('in the wallet area the new-wallet and edit routes show the Bun Wallet screens with the shared resources, ?setup=1 and the list return there, and otherwise they go to the wallets list', () => {
  flags({ redesign: 'wallet' });
  for (const [params, text] of [
    [{}, 'new wallet with shared resources'],
    [{ setup: '1' }, 'new wallet back to /spend/setup with shared resources'],
    [{ returnTo: '/spend/wallets' }, 'new wallet back to /spend/wallets with shared resources'],
    [{ setup: '0', returnTo: 'https://example.com' }, 'new wallet with shared resources'],
  ] as const) {
    route.params = { ...params };
    render(<SpendNewWalletRoute />);
    expect(screen.queryByText(text), text).not.toBeNull();
    cleanup();
  }
  route.params = { id: '0000000a-0000-4000-8000-000000000001' };
  render(<SpendWalletEditRoute />);
  expect(screen.queryByText('editing 0000000a-0000-4000-8000-000000000001 with shared resources')).not.toBeNull();
  cleanup();
  // With the wallet area off, the wallets list; the legacy build goes back to Home.
  for (const [redesign, legacy, to] of [[undefined, undefined, '/spend/wallets'], ['-wallet', undefined, '/spend/wallets'], ['wallet', '1', '/spend']] as const) {
    flags({ redesign, legacy });
    for (const Route of [SpendNewWalletRoute, SpendWalletEditRoute]) {
      render(<Route />);
      expect(screen.queryByText(`redirect to ${to}`), `${redesign} ${legacy}`).not.toBeNull();
      cleanup();
    }
  }
});
