// The R4 Planning routes (app/spend/budget.tsx, wallets.tsx, categories.tsx):
// each shows its screen only under the `planning` area, never in the legacy
// build, and otherwise goes back to Home.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import SpendBudgetRoute from '../../../../app/spend/budget';
import SpendCategoriesRoute from '../../../../app/spend/categories';
import SpendWalletsRoute from '../../../../app/spend/wallets';

vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return { Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`) };
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

const ENV = { redesign: process.env.EXPO_PUBLIC_REDESIGN, legacy: process.env.EXPO_PUBLIC_LEGACY_SPEND };
function flags({ redesign, legacy }: { redesign?: string; legacy?: string }) {
  if (redesign === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = redesign;
  if (legacy === undefined) delete process.env.EXPO_PUBLIC_LEGACY_SPEND;
  else process.env.EXPO_PUBLIC_LEGACY_SPEND = legacy;
}
beforeEach(() => flags({}));
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
