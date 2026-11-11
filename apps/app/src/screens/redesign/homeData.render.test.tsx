// Home's data (P2-T23): the redesigned Home's load, moved into useHomeData
// unchanged so that the Bun Wallet Home (P2-T24) reads the same thing. A probe
// draws the hook's state; the fake resources record every read. Home's own
// suite (HomeScreen.render.test.tsx) runs unchanged on top of the hook; these
// cases pin what it does not: a draft that resolves reads again in place, the
// controls the hook hands back, a new day, and the budget threshold haptic.
//
// - playHaptic is mocked, so the threshold case reads the moments by name.
// - The threshold haptic keeps its reading in module state for the app
//   session (Home unmounts while Quick add is open), so its case is one
//   sequence in one file, remounting where the screen would.
// - Each change runs inside act, and `settle` lets the fake's reads land
//   inside act too, so no update lands outside it. The fake answers in
//   microtasks only, so one settle (a zero timeout) is enough, and a case
//   asserts at once rather than polling.
import { TRACKING_START_MIN } from '@gogospend/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { OutboxCommand, PendingEntry } from '@mobile/storage/types';
import { useBudgetThresholdHaptic, useHomeData } from './homeData';

const played = vi.hoisted(() => [] as string[]);
vi.mock('@mobile/lib/hapticMoment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mobile/lib/hapticMoment')>()),
  playHaptic: (moment: string) => {
    played.push(moment);
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

afterEach(() => {
  cleanup();
});

/** The golden month's today (NOW in screens/v1/renderHarness). */
const TODAY = '2026-09-29';
const seed = goldenSeed();
const [CASH] = seed.wallets;
const [FOOD] = BUILTINS;

type HomeData = ReturnType<typeof useHomeData>;
const seen: { home: HomeData | null } = { home: null };

function HomeDataProbe({ today }: { today: string }) {
  const home = useHomeData(today);
  seen.home = home;
  return (
    <View>
      <Text testID="state">{home.state}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Reload" onPress={home.reload} />
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh" onPress={home.refresh} />
    </View>
  );
}

function Providers({ resources, diary, children }: { resources: SpendV1Resources; diary: SpendDiary | null; children: ReactNode }) {
  return (
    <SpendV1Provider resources={resources}>
      <SpendDiaryProvider diary={diary}>{children}</SpendDiaryProvider>
    </SpendV1Provider>
  );
}

function mount(resources: SpendV1Resources, diary: SpendDiary | null = null) {
  const view = render(<Providers resources={resources} diary={diary}><HomeDataProbe today={TODAY} /></Providers>);
  return { ...view, showDay: (today: string) => view.rerender(<Providers resources={resources} diary={diary}><HomeDataProbe today={today} /></Providers>) };
}

const state = () => screen.getByTestId('state').textContent;
/** Lets the fake's reads land, inside act. */
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});
const draft = (amount: string): PendingEntry =>
  ({ id: crypto.randomUUID(), type: 'expense', amount_minor: amount, occurred_on: TODAY, wallet_id: CASH.id, category_id: FOOD.id, note: null, merchant: null }) as PendingEntry;
const queued = (payload: PendingEntry, commandState: OutboxCommand['state']): OutboxCommand => ({
  commandId: crypto.randomUUID(), accountId: 'a0000000-0000-4000-8000-000000000001', schemaVersion: 1, kind: 'transaction.create', payload, state: commandState,
  firstTransmissionAt: commandState === 'unsent' ? null : '2026-09-29T03:00:00.000Z', createdAt: '2026-09-29T03:00:00.000Z', ackedRevision: commandState === 'acknowledged' ? '99' : null,
});

test("useHomeData reads what Home reads: today's records page by page, one page of earlier days, and the month's figures", async () => {
  const fake = createFakeResources(goldenSeed());
  mount(fake.resources);
  expect(state()).toBe('loading');
  await settle();
  expect(state()).toBe('ready');
  expect(fake.callsOf('ensureBuiltinCategories')).toHaveLength(1);
  expect(fake.callsOf('wallets')).toHaveLength(1);
  expect(fake.callsOf('summary').map((call) => call.args)).toEqual([['2026-09']]);
  expect(fake.callsOf('budget').map((call) => call.args)).toEqual([['2026-09']]);
  expect(fake.callsOf('history').map((call) => call.args)).toEqual([
    [{ from: TODAY, through: TODAY, sort: 'date_desc' }, undefined, 200],
    [{ from: TRACKING_START_MIN, through: '2026-09-28', sort: 'date_desc' }, undefined, 50],
  ]);
  const home = seen.home;
  expect(home?.state).toBe('ready');
  if (home?.state !== 'ready') return;
  expect(Object.keys(home.data).sort()).toEqual(['budget', 'categories', 'oldestWholeDay', 'records', 'summary', 'todayComplete', 'wallets']);
  expect(home.data.records.map((record) => record.occurred_on)).toEqual(['2026-09-28', '2026-09-27', '2026-09-26', '2026-09-25']);
  expect([home.data.todayComplete, home.data.oldestWholeDay, home.data.summary.month, home.data.budget]).toEqual([true, null, '2026-09', null]);
  expect(home.data.wallets.map((wallet) => wallet.id)).toEqual(seed.wallets.map((wallet) => wallet.id));
});

test('a draft it was waiting on resolves: it reads again in place; a new draft reads nothing', async () => {
  const fake = createFakeResources(goldenSeed());
  const waiting = queued(draft('6500'), 'unsent');
  const diary = createFakeDiary({ wallets: seed.wallets, categories: BUILTINS, outbox: [waiting] });
  mount(fake.resources, diary.diary);
  await settle();
  expect(state()).toBe('ready');
  const reads = fake.callsOf('summary').length;
  // Another draft joins, and one is being sent: nothing resolved, so nothing is read.
  const second = queued(draft('1200'), 'unsent');
  act(() => {
    diary.set({ outbox: [{ ...waiting, state: 'sending', firstTransmissionAt: '2026-09-29T03:00:00.000Z' }, second] });
  });
  await settle();
  expect(fake.callsOf('summary')).toHaveLength(reads);
  // The first is acknowledged: it reads again, and what is on screen stays while it does.
  act(() => {
    diary.set({ outbox: [{ ...waiting, state: 'acknowledged', ackedRevision: '99' }, second] });
  });
  expect(fake.callsOf('summary')).toHaveLength(reads + 1);
  expect(state()).toBe('ready');
  await settle();
  // A draft removed from the phone is resolved too.
  act(() => {
    diary.set({ outbox: [{ ...waiting, state: 'acknowledged', ackedRevision: '99' }] });
  });
  expect(fake.callsOf('summary')).toHaveLength(reads + 2);
  await settle();
  expect(state()).toBe('ready');
});

test('a change pulled from another phone reads again in place; the same revision reads nothing', async () => {
  const fake = createFakeResources(goldenSeed());
  const diary = createFakeDiary({ wallets: seed.wallets, categories: BUILTINS, appliedRevision: '5' });
  mount(fake.resources, diary.diary);
  await settle();
  expect(state()).toBe('ready');
  const reads = fake.callsOf('summary').length;
  act(() => {
    diary.set({ appliedRevision: '7' });
  });
  expect(fake.callsOf('summary')).toHaveLength(reads + 1);
  expect(state()).toBe('ready');
  await settle();
  act(() => {
    diary.set({ appliedRevision: '7', progress: { sent: 0, total: 1 } });
  });
  await settle();
  expect(fake.callsOf('summary')).toHaveLength(reads + 1);
});

test('the hook hands back the load\'s controls: refresh reads again in place, reload from loading', async () => {
  const fake = createFakeResources(goldenSeed());
  mount(fake.resources);
  await settle();
  expect(state()).toBe('ready');
  const held = fake.hold('summary');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(fake.callsOf('summary')).toHaveLength(2);
  expect(state()).toBe('ready');
  await act(async () => {
    held();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const again = fake.hold('summary');
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(fake.callsOf('summary')).toHaveLength(3);
  expect(state()).toBe('loading');
  await act(async () => {
    again();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(state()).toBe('ready');
});

test('a new day reads that day, and a new month that month', async () => {
  const fake = createFakeResources(goldenSeed());
  const view = mount(fake.resources);
  await settle();
  expect(state()).toBe('ready');
  view.showDay('2026-09-30');
  await settle();
  expect(fake.callsOf('history').map((call) => (call.args[0] as { through: string }).through)).toEqual([TODAY, '2026-09-28', '2026-09-30', TODAY]);
  expect(fake.callsOf('summary').map((call) => call.args)).toEqual([['2026-09'], ['2026-09']]);
  view.showDay('2026-10-01');
  await settle();
  expect(fake.callsOf('summary').map((call) => call.args)).toEqual([['2026-09'], ['2026-09'], ['2026-10']]);
  expect(fake.callsOf('budget').map((call) => call.args)).toEqual([['2026-09'], ['2026-09'], ['2026-10']]);
});

function ThresholdProbe({ month, spent, limit }: { month: string; spent: string | null; limit: string | null }) {
  useBudgetThresholdHaptic(month, spent, limit);
  return null;
}

test('the threshold haptic plays once as spending crosses 80% and then 100%, never on a first reading or a new month, across a remount', () => {
  played.length = 0;
  // The first reading (55% of ฿18,000) is never a crossing.
  const view = render(<ThresholdProbe month="2026-10" spent="1000000" limit="1800000" />);
  expect(played).toEqual([]);
  // 83%: past 80%, once.
  view.rerender(<ThresholdProbe month="2026-10" spent="1500000" limit="1800000" />);
  expect(played).toEqual(['thresholdCrossed']);
  // 89%: still past 80% only. While Home loads again nothing is read or forgotten, so the reload landing at 89% plays nothing.
  view.rerender(<ThresholdProbe month="2026-10" spent="1600000" limit="1800000" />);
  view.rerender(<ThresholdProbe month="2026-10" spent={null} limit={null} />);
  view.rerender(<ThresholdProbe month="2026-10" spent="1600000" limit="1800000" />);
  expect(played).toEqual(['thresholdCrossed']);
  // Home unmounts while Quick add is open, where the crossing happens: the next Home still plays it.
  view.unmount();
  const next = render(<ThresholdProbe month="2026-10" spent="1800000" limit="1800000" />);
  expect(played).toEqual(['thresholdCrossed', 'thresholdCrossed']);
  // Falling back (a record deleted) is never a crossing, and nor is a new month, even past 80% at once.
  next.rerender(<ThresholdProbe month="2026-10" spent="900000" limit="1800000" />);
  next.rerender(<ThresholdProbe month="2026-11" spent="1500000" limit="1800000" />);
  expect(played).toEqual(['thresholdCrossed', 'thresholdCrossed']);
});
