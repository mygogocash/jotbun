// History across a record (R3 gap "Loaded pages on a remount"). The spend
// layout draws its screens in a `Slot`, so History unmounts while a record or
// Recently deleted is open. The layout keeps History's filters, search and how
// many entries were loaded for the way back; History then reads the month again
// with them. The kept view never outlives the session (sign-out, another
// account), never reaches another month, and goes once the person leaves for
// any other screen. These tests run the real spend layout, routes and screens
// over a small in-memory router.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

type Href = string | { pathname: string; params?: Record<string, string> };

const nav = vi.hoisted(() => {
  type Entry = { key: number; pathname: string; params: Record<string, string> };
  const listeners = new Set<() => void>();
  let keys = 0;
  let stack: Entry[] = [];
  const set = (next: Entry[]) => {
    stack = next;
    for (const listener of listeners) listener();
  };
  /** `/spend/record/[id]` with `{ id }` is the path `/spend/record/<id>`; the screen still reads `id` from its params, as in Expo Router. */
  const entry = (href: Href): Entry => {
    const { pathname, params = {} } = typeof href === 'string' ? { pathname: href } : href;
    return { key: ++keys, pathname: pathname.replace(/\[(\w+)\]/g, (_, name: string) => params[name]), params: { ...params } };
  };
  return {
    /** Route components by the segment after `/spend/`; any other path draws its name. */
    routes: {} as Record<string, () => unknown>,
    router: {
      push: vi.fn((href: Href) => set([...stack, entry(href)])),
      // A tab goes back to its screen when it is in the stack, else opens it.
      navigate: vi.fn((href: Href) => {
        const target = entry(href);
        const at = stack.findIndex((open) => open.pathname === target.pathname);
        set(at >= 0 ? stack.slice(0, at + 1) : [...stack, target]);
      }),
      replace: vi.fn((href: Href) => set([...stack.slice(0, -1), entry(href)])),
      back: vi.fn(() => set(stack.slice(0, -1))),
      canGoBack: vi.fn(() => stack.length > 1),
      setParams: vi.fn((params: Record<string, string>) => {
        const top = stack[stack.length - 1];
        set([...stack.slice(0, -1), { ...top, params: { ...top.params, ...params } }]);
      }),
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    top: () => stack[stack.length - 1],
    start(href: Href) {
      stack = [entry(href)];
    },
    /** What the URL of the screen under the top one says when it shows again. */
    setParamsBelow(params: Record<string, string>) {
      const below = stack[stack.length - 2];
      stack = [...stack.slice(0, -2), { ...below, params: { ...below.params, ...params } }, stack[stack.length - 1]];
    },
  };
});

vi.mock('expo-router', async () => {
  const { createElement, useEffect, useSyncExternalStore } = await import('react');
  const { Text } = await import('react-native');
  const useTop = () => useSyncExternalStore(nav.subscribe, nav.top);
  return {
    // The Slot draws only the top screen: whatever is under it is unmounted, as on the device.
    Slot: () => {
      const top = useTop();
      const [, area, name] = top.pathname.split('/');
      const route = area === 'spend' && name ? nav.routes[name] : undefined;
      return route ? createElement(route as () => null, { key: top.key }) : createElement(Text, null, `screen ${top.pathname}`);
    },
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`),
    usePathname: () => useTop().pathname,
    useLocalSearchParams: () => useTop().params,
    useRouter: () => nav.router,
    useFocusEffect: (effect: () => void) => {
      useEffect(() => { effect(); }, [effect]);
    },
  };
});
const shared = vi.hoisted(() => ({ resources: null as unknown }));
vi.mock('@mobile/api/sharedV1', () => ({
  getSharedV1Resources: () => shared.resources,
  // The layouts give their screens Bun's AI help; here it never answers, so it stays off.
  getSharedAiResources: () => new Proxy({}, { get: () => () => new Promise(() => undefined) }),
}));
// The web keeps no device diary; the provider is only a wrapper here.
vi.mock('@mobile/spend/v1/DeviceDiaryProvider', () => ({ DeviceDiaryProvider: ({ children }: { children: unknown }) => children }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { setSession } from '@mobile/auth/session';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import SpendLayout from '../../../app/spend/_layout';
import SpendAllRoute from '../../../app/spend/all';
import SpendDeletedRoute from '../../../app/spend/deleted';
import SpendRecordRoute from '../../../app/spend/record/[id]';
import { NOW, ROWS, extraRecords, mountScreen, recordRows } from './HistoryTestHarness';

nav.routes = { all: SpendAllRoute, deleted: SpendDeletedRoute, record: SpendRecordRoute };

const ACCOUNT_A = { access_token: 'token-a', userId: 'a0000000-0000-4000-8000-000000000001', binding: 'binding-a' };
const ACCOUNT_B = { access_token: 'token-b', userId: 'b0000000-0000-4000-8000-000000000002', binding: 'binding-b' };
const ENV = { redesign: process.env.EXPO_PUBLIC_REDESIGN, legacy: process.env.EXPO_PUBLIC_LEGACY_SPEND };

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  // The approved default: the redesigned layout, History and record routes.
  delete process.env.EXPO_PUBLIC_REDESIGN;
  delete process.env.EXPO_PUBLIC_LEGACY_SPEND;
  vi.setSystemTime(NOW);
  setSession(ACCOUNT_A);
});
afterEach(() => {
  cleanup();
  setSession(null);
  vi.useRealTimers();
  window.localStorage.clear();
  for (const [name, value] of [['EXPO_PUBLIC_REDESIGN', ENV.redesign], ['EXPO_PUBLIC_LEGACY_SPEND', ENV.legacy]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** The spend area on History (September 2026, the golden month), with `extra` more September expenses. */
async function openHistory(options: { extra?: number; at?: Href } = {}) {
  const seed = goldenSeed();
  const fake = createFakeResources({ ...seed, records: [...seed.records, ...extraRecords(options.extra ?? 0)] });
  shared.resources = fake.resources;
  nav.start(options.at ?? '/spend/all');
  mountScreen(<SpendLayout />, { resources: fake.resources });
  await screen.findByRole('button', { name: ROWS.rent });
  return fake;
}

const search = (value: string) => fireEvent.change(screen.getByLabelText('Search entries'), { target: { value } });
const searchText = () => (screen.getByLabelText('Search entries') as HTMLInputElement).value;
const checked = (name: string) => screen.getByRole('radio', { name }).getAttribute('aria-checked');
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));
const press = (...keys: string[]) => {
  for (const key of keys) fireEvent.click(within(screen.getByRole('group', { name: 'Keypad' })).getByRole('button', { name: key }));
};

/** Expenses from the daily account under Bills, searched for "rent": one row on screen. */
async function filterAndSearch() {
  fireEvent.click(screen.getByRole('radio', { name: 'Expense' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: ROWS.salary })).toBeNull());
  fireEvent.click(screen.getByRole('radio', { name: 'Daily account' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Bills' }));
  search('rent');
  await waitFor(() => expect(recordRows()).toHaveLength(1));
}

/** The filters and the search `filterAndSearch` set, as they show again. */
function expectKept() {
  expect(['Expense', 'Daily account', 'Bills'].map(checked)).toEqual(['true', 'true', 'true']);
  expect(searchText()).toBe('rent');
}

/** Opens the rent row's record; History is gone while it is open. */
async function openRent() {
  fireEvent.click(screen.getByRole('button', { name: ROWS.rent }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  expect(screen.queryByTestId('history-screen')).toBeNull();
}

/** History as a first visit shows it: every type, wallet and category, no search, the first page. */
async function expectFresh(rows: number) {
  await waitFor(() => expect(recordRows()).toHaveLength(rows));
  expect(['All', 'All wallets', 'All categories', 'Expense'].map(checked)).toEqual(['true', 'true', 'true', 'false']);
  expect(searchText()).toBe('');
}

test('a record and back: the filters, the search and every loaded entry come back, read again from Jotbun', async () => {
  const fake = await openHistory({ extra: 60 });
  fireEvent.click(screen.getByRole('radio', { name: 'Expense' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: ROWS.salary })).toBeNull());
  await waitFor(() => expect(recordRows()).toHaveLength(50));
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(recordRows()).toHaveLength(62));
  search('rent');
  await waitFor(() => expect(recordRows()).toHaveLength(1));

  await openRent();
  const reads = fake.callsOf('history').length;
  back();
  expect(await screen.findByRole('button', { name: ROWS.rent })).toBeTruthy();
  expect(checked('Expense')).toBe('true');
  expect(searchText()).toBe('rent');
  expect(recordRows()).toHaveLength(1);
  // Read again, never a copy: the month under the filter, as many entries as were loaded, in one read.
  const [scope, cursor, limit] = fake.callsOf('history')[reads].args;
  expect(scope).toEqual({ from: '2026-09-01', through: '2026-09-30', type: 'expense', sort: 'date_desc' });
  expect([cursor, limit]).toEqual([undefined, 62]);
  search('');
  await waitFor(() => expect(recordRows()).toHaveLength(62));
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();

  // Recently deleted is the same way out and back.
  fireEvent.click(screen.getByRole('button', { name: 'Recently deleted' }));
  await waitFor(() => expect(screen.queryByTestId('history-screen')).toBeNull());
  const again = fake.callsOf('history').length;
  back();
  await waitFor(() => expect(recordRows()).toHaveLength(62));
  expect(checked('Expense')).toBe('true');
  expect(fake.callsOf('history')[again].args.slice(1)).toEqual([undefined, 62]);
  // Another filter starts again at one page, as it always has.
  fireEvent.click(screen.getByRole('radio', { name: 'All' }));
  await waitFor(() => expect(recordRows()).toHaveLength(50));
  expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
});

test('an entry changed or deleted on its record shows its new state on the way back', async () => {
  const fake = await openHistory();
  await filterAndSearch();
  await openRent();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  press('Clear', '1', '2', '0', '0', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  back();
  const edited = 'Bills, Expense ฿12,000.00, Daily account · Rent';
  expect(await screen.findByRole('button', { name: edited })).toBeTruthy();
  expect(screen.queryByRole('button', { name: ROWS.rent })).toBeNull();
  expect(screen.getByLabelText('Money out ฿12,000.00')).toBeTruthy();
  expectKept();

  fireEvent.click(screen.getByRole('button', { name: edited }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('Entry deleted')).toBeTruthy();
  back();
  expect(await screen.findByLabelText('Money out ฿0.00')).toBeTruthy();
  expect(recordRows()).toHaveLength(0);
  expectKept();
  expect(fake.callsOf('deleteTransaction')).toHaveLength(1);
});

test('another account, or a sign-out and back in, starts History clean', async () => {
  const fake = await openHistory({ extra: 60 });
  await filterAndSearch();
  // The same account: kept.
  await openRent();
  back();
  expect(await screen.findByRole('button', { name: ROWS.rent })).toBeTruthy();
  expectKept();

  // Another account signs in while the record is open (the layout stays): nothing of the first account's view is used.
  await openRent();
  act(() => setSession(ACCOUNT_B));
  const reads = fake.callsOf('history').length;
  back();
  await expectFresh(50);
  expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
  expect(fake.callsOf('history')[reads].args).toEqual([{ from: '2026-09-01', through: '2026-09-30', sort: 'date_desc' }, undefined, 50]);

  // Signed out while the record is open, then back in as the same person: still clean.
  await filterAndSearch();
  await openRent();
  act(() => setSession(null));
  expect(screen.getByText('redirect to /login')).toBeTruthy();
  act(() => setSession(ACCOUNT_A));
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  back();
  await expectFresh(50);
});

test('leaving for another screen forgets the view; Quick add from the record is still the way back', async () => {
  await openHistory();
  await filterAndSearch();
  await openRent();
  // Copy opens Quick add over the record; coming back through the record still finds History as it was.
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(await screen.findByText('screen /spend/add')).toBeTruthy();
  act(() => nav.router.back());
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  back();
  expect(await screen.findByRole('button', { name: ROWS.rent })).toBeTruthy();
  expectKept();

  // Home, then History again: a new visit to History, so it starts clean.
  fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
  expect(await screen.findByText('screen /spend')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'History' }));
  await expectFresh(4);
});

test('only a record or Recently deleted keeps the view: Add from the tab bar and back is History as before', async () => {
  await openHistory();
  await filterAndSearch();
  fireEvent.click(within(screen.getByTestId('tab-bar')).getByRole('button', { name: 'Add an entry' }));
  expect(await screen.findByText('screen /spend/add')).toBeTruthy();
  act(() => nav.router.back());
  await expectFresh(4);
});

test("the month in the URL wins: a view kept for one month never opens on another", async () => {
  const fake = await openHistory({ at: { pathname: '/spend/all', params: { month: '2026-09' } } });
  await filterAndSearch();
  await openRent();
  nav.setParamsBelow({ month: '2026-08' });
  const reads = fake.callsOf('history').length;
  back();
  expect(await screen.findByText('August 2026')).toBeTruthy();
  expect(await screen.findByText('No entries in this month')).toBeTruthy();
  await expectFresh(0);
  expect(fake.callsOf('history')[reads].args).toEqual([{ from: '2026-08-01', through: '2026-08-31', sort: 'date_desc' }, undefined, 50]);
});
