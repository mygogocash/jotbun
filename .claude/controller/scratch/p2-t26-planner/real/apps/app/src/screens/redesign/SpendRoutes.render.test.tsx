// The History and record routes (review M4): app/spend/all.tsx picks the
// legacy list first, then the redesigned History under the `core` flag, else
// the current list; app/spend/record/[id].tsx shows a record only under the
// flag (and never in the legacy build or without an id), and otherwise
// redirects to the list. app/spend/deleted.tsx (Recently deleted) follows the
// record route's rule. Under the wallet area both show the Bun Wallet's screen
// (P2-T25, P2-T26).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import SpendAllRoute from '../../../app/spend/all';
import SpendDeletedRoute from '../../../app/spend/deleted';
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
// The route imports the wallet screen too; stubbed like the others, since its real imports (the safe-area inset, the
// router's internals) cannot load here and this file tests only the route's rule. Like the old screen's stub, it reads
// the resources the route provides (P2-T25's confirming review, m1).
vi.mock('@mobile/wallet/records/WalletDeletedScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  const WalletDeletedScreen = () => createElement(Text, null, `wallet recently deleted on ${(useSpendV1() as unknown as { marker: string }).marker}`);
  return { WalletDeletedScreen };
});
// The wallet record, stubbed for the same reason (P2-T26): it reads the route's resources, its id and its mode,
// and counts its mounts, so a new entry is a new screen.
const walletMounts = vi.hoisted(() => [] as string[]);
vi.mock('@mobile/wallet/records/WalletRecordScreen', async () => {
  const { createElement, useEffect } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  const WalletRecordScreen = (props: { id: string; mode?: string }) => {
    useEffect(() => {
      walletMounts.push(props.id);
    }, []);
    return createElement(Text, null, `wallet record ${props.id} in ${String(props.mode)} mode on ${(useSpendV1() as unknown as { marker: string }).marker}`);
  };
  return { WalletRecordScreen };
});
vi.mock('@mobile/screens/redesign/RecentlyDeletedScreen', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  const { useSpendV1 } = await import('@mobile/spend/v1/SpendV1Context');
  // Reads the resources the route provides, so the test sees it is the shared port.
  const RecentlyDeletedScreen = () => createElement(Text, null, `recently deleted on ${(useSpendV1() as unknown as { marker: string }).marker}`);
  return { RecentlyDeletedScreen };
});

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

test('Recently deleted: only under the flag; otherwise back to the list', () => {
  render(<SpendDeletedRoute />);
  expect(screen.getByText('recently deleted on shared resources')).toBeTruthy();
  cleanup();
  for (const off of [{ redesign: 'off' }, { redesign: '-core' }, { redesign: 'core', legacy: '1' }]) {
    flags(off);
    render(<SpendDeletedRoute />);
    expect(screen.getByText('redirect to /spend/all')).toBeTruthy();
    expect(screen.queryByText(/^recently deleted/)).toBeNull();
    cleanup();
  }
});

test('Recently deleted under the wallet area: the wallet screen on the shared resources; switched off, the old screen; legacy or -core, back to the list', () => {
  const cases: readonly (readonly [{ redesign?: string; legacy?: string }, string])[] = [
    [{ redesign: 'wallet' }, 'wallet recently deleted on shared resources'],
    [{ redesign: 'core,wallet' }, 'wallet recently deleted on shared resources'],
    [{ redesign: 'all' }, 'wallet recently deleted on shared resources'],
    [{}, 'recently deleted on shared resources'],
    [{ redesign: 'wallet,-wallet' }, 'recently deleted on shared resources'],
    [{ redesign: '-core,wallet' }, 'redirect to /spend/all'],
    [{ redesign: 'wallet', legacy: '1' }, 'redirect to /spend/all'],
  ];
  for (const [flag, text] of cases) {
    flags(flag);
    // A screen drawn outside the route's provider throws while it renders.
    expect(() => render(<SpendDeletedRoute />), JSON.stringify(flag)).not.toThrow();
    expect(screen.queryAllByText(text), JSON.stringify(flag)).toHaveLength(1);
    cleanup();
  }
});

test('a record under the wallet area: the wallet screen on the shared resources, with its id and mode; switched off, the old screen; legacy, -core or no id, back to the list', () => {
  const cases: readonly (readonly [{ redesign?: string; legacy?: string }, Record<string, string>, string])[] = [
    [{ redesign: 'wallet' }, { id: 'r1' }, 'wallet record r1 in view mode on shared resources'],
    [{ redesign: 'core,wallet' }, { id: 'r1', mode: 'edit' }, 'wallet record r1 in edit mode on shared resources'],
    [{ redesign: 'all' }, { id: 'r1', mode: 'other' }, 'wallet record r1 in view mode on shared resources'],
    [{}, { id: 'r1' }, 'record r1 in view mode'],
    [{ redesign: 'wallet,-wallet' }, { id: 'r1', mode: 'edit' }, 'record r1 in edit mode'],
    [{ redesign: '-core,wallet' }, { id: 'r1' }, 'redirect to /spend/all'],
    [{ redesign: 'wallet', legacy: '1' }, { id: 'r1' }, 'redirect to /spend/all'],
    [{ redesign: 'wallet' }, {}, 'redirect to /spend/all'],
  ];
  for (const [flag, params, text] of cases) {
    flags(flag);
    nav.params = params;
    // A screen drawn outside the route's provider throws while it renders.
    expect(() => render(<SpendRecordRoute />), JSON.stringify([flag, params])).not.toThrow();
    expect(screen.queryAllByText(text), JSON.stringify([flag, params])).toHaveLength(1);
    cleanup();
  }
  // Another entry in the same route is a new screen, as today's is.
  flags({ redesign: 'wallet' });
  walletMounts.length = 0;
  nav.params = { id: 'r1' };
  const view = render(<SpendRecordRoute />);
  nav.params = { id: 'r2' };
  view.rerender(<SpendRecordRoute />);
  expect(walletMounts).toEqual(['r1', 'r2']);
});
