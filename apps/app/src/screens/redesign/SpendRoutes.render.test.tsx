// The History and record routes (review M4): app/spend/all.tsx picks the
// legacy list first, then the redesigned History under the `core` flag, else
// the current list; app/spend/record/[id].tsx shows a record only under the
// flag (and never in the legacy build or without an id), and otherwise
// redirects to the list.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import SpendAllRoute from '../../../app/spend/all';
import SpendRecordRoute from '../../../app/spend/record/[id]';

const nav = vi.hoisted(() => ({ params: {} as Record<string, string>, router: { push: vi.fn(), setParams: vi.fn(), replace: vi.fn(), back: vi.fn() } }));

vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`),
    useLocalSearchParams: () => nav.params,
    useRouter: () => nav.router,
  };
});
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => ({ marker: 'shared resources' }) }));
function stub(name: string, text: (props: Record<string, unknown>) => string) {
  return async () => {
    const { createElement } = await import('react');
    const { Text } = await import('react-native');
    return { [name]: (props: Record<string, unknown>) => createElement(Text, null, text(props)) };
  };
}
vi.mock('@mobile/screens/CustomerSpendAllScreen', stub('CustomerSpendAllScreen', () => 'legacy list'));
vi.mock('@mobile/screens/v1/TransactionsScreen', stub('TransactionsScreen', () => 'current list'));
vi.mock('@mobile/screens/redesign/HistoryScreen', stub('HistoryScreen', (props) => `redesigned history from ${String(props.initialMonth)}`));
vi.mock('@mobile/screens/redesign/RecordScreen', stub('RecordScreen', (props) => `record ${String(props.id)} in ${String(props.mode)} mode`));

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

test('History: the legacy flag wins, then the redesign under the flag, else the current list', () => {
  flags({ redesign: 'off' });
  render(<SpendAllRoute />);
  expect(screen.getByText('current list')).toBeTruthy();
  cleanup();
  // Approved (E2 checkpoint 1): the default.
  flags({});
  render(<SpendAllRoute />);
  expect(screen.getByText(/^redesigned history/)).toBeTruthy();
  cleanup();
  flags({ redesign: 'core' });
  nav.params = { month: '2026-08' };
  render(<SpendAllRoute />);
  expect(screen.getByText('redesigned history from 2026-08')).toBeTruthy();
  cleanup();
  // Legacy is checked before the redesign: both on shows the legacy list.
  flags({ redesign: 'core', legacy: '1' });
  render(<SpendAllRoute />);
  expect(screen.getByText('legacy list')).toBeTruthy();
  expect(screen.queryByText(/redesigned history/)).toBeNull();
  cleanup();
  flags({ legacy: '1' });
  render(<SpendAllRoute />);
  expect(screen.getByText('legacy list')).toBeTruthy();
});

test('a record: only under the flag, with an id; otherwise back to the list', () => {
  nav.params = { id: 'r1' };
  flags({ redesign: 'off' });
  render(<SpendRecordRoute />);
  expect(screen.getByText('redirect to /spend/all')).toBeTruthy();
  expect(screen.queryByText(/^record /)).toBeNull();
  cleanup();
  flags({ redesign: '-core' });
  render(<SpendRecordRoute />);
  expect(screen.getByText('redirect to /spend/all')).toBeTruthy();
  cleanup();
  // Approved (E2 checkpoint 1): the default.
  flags({});
  render(<SpendRecordRoute />);
  expect(screen.getByText('record r1 in view mode')).toBeTruthy();
  cleanup();
  flags({ redesign: 'core', legacy: '1' });
  render(<SpendRecordRoute />);
  expect(screen.getByText('redirect to /spend/all')).toBeTruthy();
  cleanup();
  flags({ redesign: 'core' });
  nav.params = {};
  render(<SpendRecordRoute />);
  expect(screen.getByText('redirect to /spend/all')).toBeTruthy();
  cleanup();
  nav.params = { id: 'r1' };
  render(<SpendRecordRoute />);
  expect(screen.getByText('record r1 in view mode')).toBeTruthy();
  cleanup();
  nav.params = { id: 'r1', mode: 'edit' };
  render(<SpendRecordRoute />);
  expect(screen.getByText('record r1 in edit mode')).toBeTruthy();
});
