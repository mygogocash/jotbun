// The R5 Insights routes (app/spend/insights.tsx, recap/[month].tsx,
// reminders.tsx): each shows its screen only under the `insights` area, never
// in the legacy build, and otherwise goes back to Home. A recap needs a month.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import SpendInsightsRoute from '../../../../app/spend/insights';
import SpendRecapRoute from '../../../../app/spend/recap/[month]';
import SpendRemindersRoute from '../../../../app/spend/reminders';

const nav = vi.hoisted(() => ({ params: {} as Record<string, string> }));
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`),
    useLocalSearchParams: () => nav.params,
  };
});
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => ({ marker: 'shared resources' }) }));
function stub(name: string, text: (props: Record<string, unknown>) => string) {
  return async () => {
    const { createElement } = await import('react');
    const { Text } = await import('react-native');
    const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
    return { [name]: (props: Record<string, unknown>) => createElement(Text, null, `${text(props)} with ${String((useSpendV1() as unknown as { marker: string }).marker)}`) };
  };
}
vi.mock('@mobile/screens/redesign/insights/InsightsScreen', stub('InsightsScreen', () => 'insights'));
// The insights route imports the wallet insights too; stubbed like the others, since its real imports (the safe-area inset,
// the router's internals) cannot load here and this file tests only the routes' rules.
vi.mock('@mobile/wallet/insights/WalletInsightsScreen', stub('WalletInsightsScreen', () => 'wallet insights'));
vi.mock('@mobile/screens/redesign/insights/RecapScreen', stub('RecapScreen', (props) => `recap of ${String(props.month)}`));
vi.mock('@mobile/screens/redesign/insights/RemindersScreen', stub('RemindersScreen', () => 'reminders'));

const ENV = { redesign: process.env.EXPO_PUBLIC_REDESIGN, legacy: process.env.EXPO_PUBLIC_LEGACY_SPEND };
function flags({ redesign, legacy }: { redesign?: string; legacy?: string }) {
  if (redesign === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = redesign;
  if (legacy === undefined) delete process.env.EXPO_PUBLIC_LEGACY_SPEND;
  else process.env.EXPO_PUBLIC_LEGACY_SPEND = legacy;
}
beforeEach(() => {
  nav.params = {};
  flags({});
});
afterEach(() => {
  cleanup();
  flags(ENV);
});

test.each([[SpendInsightsRoute, 'insights'], [SpendRemindersRoute, 'reminders']] as const)('%#: the screen only under the insights area (on since E2 checkpoint 3)', (Route, name) => {
  flags({ redesign: '-insights' });
  render(<Route />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
  cleanup();
  flags({});
  render(<Route />);
  expect(screen.getByText(`${name} with shared resources`)).toBeTruthy();
  cleanup();
  flags({ redesign: 'insights', legacy: '1' });
  render(<Route />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
});

test('spend insights: when wallet redesign is enabled, shows wallet insights screen', () => {
  flags({ redesign: 'wallet' });
  render(<SpendInsightsRoute />);
  expect(screen.getByText('wallet insights with shared resources')).toBeTruthy();
  cleanup();
  flags({ redesign: 'wallet', legacy: '1' });
  render(<SpendInsightsRoute />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
});

test('a recap: only under the area, for a real month; otherwise back to Insights or Home', () => {
  nav.params = { month: '2026-09' };
  flags({ redesign: '-insights' });
  render(<SpendRecapRoute />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
  cleanup();
  flags({});
  render(<SpendRecapRoute />);
  expect(screen.getByText('recap of 2026-09 with shared resources')).toBeTruthy();
  cleanup();
  for (const month of ['2026-13', '26-09', '', 'september']) {
    nav.params = { month };
    render(<SpendRecapRoute />);
    expect(screen.getByText('redirect to /spend/insights')).toBeTruthy();
    cleanup();
  }
});
