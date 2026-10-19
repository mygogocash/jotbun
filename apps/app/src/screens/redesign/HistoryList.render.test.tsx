// History's list under load (review m7): it is virtualized, so it draws a
// first window of items rather than every loaded row, and its rows are
// memoized, so typing a search or re-reading the month redraws no row whose
// words did not change. RecordRow is wrapped here only to count its renders.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) },
  focus: { effect: null as null | (() => void) },
}));
const drawn = vi.hoisted(() => ({ rows: 0 }));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    useRouter: () => nav.router,
    useFocusEffect: (effect: () => void) => {
      nav.focus.effect = effect;
      useEffect(() => { effect(); }, [effect]);
    },
  };
});
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('@mobile/ui/RecordRow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/ui/RecordRow')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    RecordRow: (props: Parameters<typeof actual.RecordRow>[0]) => {
      drawn.rows += 1;
      return createElement(actual.RecordRow, props);
    },
  };
});

import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { HistoryScreen } from './HistoryScreen';
import { NOW, ROWS, extraRecords, mountScreen, recordRows } from './HistoryTestHarness';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  drawn.rows = 0;
  nav.focus.effect = null;
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

test('the list is virtualized: before it has measured the screen it draws a first window, not every loaded row', async () => {
  const seed = goldenSeed();
  const fake = createFakeResources({ ...seed, records: [...seed.records, ...extraRecords()] });
  // Mounted exactly as the app mounts it (happy-dom never measures, so the list keeps its first window).
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources, wholeLists: false });
  await screen.findByRole('button', { name: 'Load more' });
  const first = recordRows().length;
  expect(first).toBeGreaterThan(0);
  // The first page holds 50 rows; the window holds the search, the controls, the day headers and the first rows.
  expect(first).toBeLessThan(50);
  // The footer is drawn whatever the window, so Load more is always there.
  expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
  cleanup();
  // Under the harness's DrawWholeLists the same page draws every row.
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources });
  await screen.findByRole('button', { name: 'Load more' });
  expect(recordRows()).toHaveLength(50);
});

test('typing a search redraws no row: the rows that still match keep their drawing, the rest leave', async () => {
  mountScreen(<HistoryScreen now={NOW} />, { resources: createFakeResources(goldenSeed()).resources });
  await screen.findByRole('button', { name: ROWS.rent });
  expect(recordRows()).toHaveLength(4);
  const before = drawn.rows;
  for (const text of ['r', 're', 'ren', 'rent']) fireEvent.change(screen.getByLabelText('Search entries'), { target: { value: text } });
  await waitFor(() => expect(recordRows()).toHaveLength(1));
  expect(screen.getByRole('button', { name: ROWS.rent })).toBeTruthy();
  expect(drawn.rows).toBe(before);
});

test('re-reading the month redraws only the row whose words changed', async () => {
  const fake = createFakeResources(goldenSeed());
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources });
  await screen.findByRole('button', { name: ROWS.rent });
  const before = drawn.rows;
  // Coming back into view re-reads the month: the same four records, nothing redrawn.
  nav.focus.effect?.();
  await waitFor(() => expect(fake.callsOf('history')).toHaveLength(2));
  await waitFor(() => expect(recordRows()).toHaveLength(4));
  expect(drawn.rows).toBe(before);
  // The rent changed elsewhere: only its row is drawn again.
  const rent = [...fake.records.values()].find((record) => record.note === 'Rent');
  if (!rent) throw new Error('the golden rent record is missing');
  fake.records.set(rent.id, { ...rent, amount_minor: '1200000', version: 2 });
  nav.focus.effect?.();
  expect(await screen.findByRole('button', { name: 'Bills, Expense ฿12,000.00, Daily account · Rent' })).toBeTruthy();
  expect(drawn.rows).toBe(before + 1);
});
