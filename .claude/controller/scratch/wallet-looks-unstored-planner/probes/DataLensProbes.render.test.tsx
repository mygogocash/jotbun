// Review probes (P2-T11, data lens): the provider's interleavings beyond V1 to V4.
// Each case asserts the brief's P3 rule as written; a failing case is a finding.
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { Text } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

import { SpendDiaryProvider, useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { installStoreBackend } from '../store/deviceWalletStore';
import type { StoreBackend } from '../store/walletStore';
import { mountWallet, TEST_ACCOUNT_ID } from '../testing/walletHarness';
import { derivedLook } from './walletLooks';
import type { WalletLook } from './walletLooks';
import { useCategoryIcons, useWalletLooks, WalletLooksProvider } from './WalletLooksProvider';
import type { CategoryIcons, WalletLooks } from './WalletLooksProvider';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  api = null;
  renders = [];
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const A = TEST_ACCOUNT_ID;
const B = '00000000-0000-4000-8000-0000000000bb';
const W1 = '00000000-0000-4000-8000-000000000001';
const W2 = '00000000-0000-4000-8000-000000000002';
const W3 = '00000000-0000-4000-8000-000000000003';
const PEACH: WalletLook = { kind: 'credit_card', material: 'peach', face: 'wow' };
const SKY: WalletLook = { kind: 'transit', material: 'sky', face: 'happy' };
const CASH: WalletLook = { kind: 'cash', material: 'paper', face: 'wink' };
const MERIT = { id: 'c1', type: 'expense', label: 'ทำบุญ', builtin_key: null } as const;
const keyOf = (accountId: string, name: string) => `jotbun.account.${accountId}.${name}`;

let api: { looks: WalletLooks; icons: CategoryIcons } | null = null;
let renders: { accountId: string | null; w1: WalletLook; w2: WalletLook; order: readonly string[] }[] = [];

function Keeper() {
  const looks = useWalletLooks();
  const icons = useCategoryIcons();
  const { accountId } = useDiaryView();
  api = { looks, icons };
  renders.push({ accountId, w1: looks.lookOf(W1), w2: looks.lookOf(W2), order: looks.order });
  return <Text testID="kept">{JSON.stringify({ w1: looks.lookOf(W1), w2: looks.lookOf(W2), w3: looks.lookOf(W3), order: looks.order, c1: icons.iconOf(MERIT) })}</Text>;
}

const shown = () => JSON.parse(screen.getByTestId('kept').textContent ?? '{}') as { w1: WalletLook; w2: WalletLook; w3: WalletLook; order: string[]; c1: string | null };

/** Every read waits until `release()`; `stored` is visible; writes land at once. */
function heldStore(seed: Readonly<Record<string, string>>) {
  const stored = new Map(Object.entries(seed));
  const held: (() => void)[] = [];
  const asked: string[] = [];
  const backend: StoreBackend = {
    getItem: (key) => {
      asked.push(key);
      return new Promise((resolve) => held.push(() => resolve(stored.get(key) ?? null)));
    },
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async (keys) => { for (const key of keys) stored.delete(key); },
  };
  return {
    stored,
    asked,
    backend,
    pending: () => held.length,
    release() { for (const answer of held.splice(0)) answer(); },
  };
}

/** Drains a held store: release, let the queue move, until nothing is held. */
async function drain(store: { release(): void; pending(): number }) {
  for (let round = 0; round < 20; round += 1) {
    await act(async () => { store.release(); });
    await settle();
    if (store.pending() === 0) {
      await settle();
      if (store.pending() === 0) return;
    }
  }
  throw new Error('the queue never drained');
}

// ---------------------------------------------------------------------------
// D1: P3 "a write that fails shows until the app closes", then a later change to the same name.
test('D1: a change whose write failed still shows after a later change to the same name', async () => {
  const { stored } = mountWallet(<Keeper />, { account: { looks: JSON.stringify({ [W2]: SKY }) } });
  await settle();
  let failNextWrite = true;
  installStoreBackend({
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async (key, value) => {
      if (failNextWrite) { failNextWrite = false; throw new Error('the disk is full'); }
      stored.set(key, value);
    },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async () => undefined,
  });
  await act(async () => { await api?.looks.setLook(W1, PEACH); });
  expect(shown().w1, 'right after the failed write').toEqual(PEACH);
  await act(async () => { await api?.looks.setLook(W3, CASH); });
  expect(JSON.parse(stored.get(keyOf(A, 'looks')) ?? 'null'), 'what the store holds').toEqual({ [W2]: SKY, [W3]: CASH });
  // The brief's P3: "a write that fails, shows until the app closes".
  expect(shown().w1, 'after a later change to the same name').toEqual(PEACH);
});

// D2: P3 "a change to it [a name the store cannot read] shows until the app closes", then the store reads again.
test('D2: a change to an unreadable name still shows after the store reads again and another change lands', async () => {
  const { stored } = mountWallet(<Keeper />, { account: { looks: JSON.stringify({ [W2]: SKY }) } });
  await settle();
  let readable = false;
  installStoreBackend({
    getItem: async (key) => { if (!readable) throw new Error('locked'); return stored.get(key) ?? null; },
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async () => undefined,
  });
  await act(async () => { await api?.looks.setLook(W1, PEACH); });
  expect(shown().w1, 'while unreadable').toEqual(PEACH);
  expect(stored.get(keyOf(A, 'looks')), 'never written over').toBe(JSON.stringify({ [W2]: SKY }));
  readable = true;
  await act(async () => { await api?.looks.setLook(W3, CASH); });
  expect(shown().w3).toEqual(CASH);
  expect(shown().w1, 'the earlier change, after the store reads again').toEqual(PEACH);
});

// D3: switch away and back with reads in flight, and a change made during the first read.
test('D3: away and back with reads held and a change made during the first read: kept for its account, never shown under the other', async () => {
  const fake = createFakeDiary({ accountId: null });
  mountWallet(<Keeper />, { diary: fake.diary });
  await settle();
  const held = heldStore({ [keyOf(A, 'looks')]: JSON.stringify({ [W1]: PEACH }), [keyOf(B, 'looks')]: JSON.stringify({ [W1]: CASH }) });
  installStoreBackend(held.backend);
  await act(async () => { fake.set({ accountId: A }); });
  let change: Promise<void> | undefined;
  await act(async () => { change = api?.looks.setLook(W2, SKY); });
  await act(async () => { fake.set({ accountId: B }); });
  await act(async () => { fake.set({ accountId: A }); });
  renders = [];
  await drain(held);
  await act(async () => { await change; });
  expect(JSON.parse(held.stored.get(keyOf(A, 'looks')) ?? 'null'), "A's store").toEqual({ [W1]: PEACH, [W2]: SKY });
  expect(JSON.parse(held.stored.get(keyOf(B, 'looks')) ?? 'null'), "B's store").toEqual({ [W1]: CASH });
  expect(shown(), 'under A at the end').toMatchObject({ w1: PEACH, w2: SKY });
  expect(renders.filter((seen) => seen.accountId === A && JSON.stringify(seen.w1) === JSON.stringify(CASH)), "B's look under A").toEqual([]);
  // The look never goes back once A's read shows it (no flicker from a late read).
  const firstPeach = renders.findIndex((seen) => seen.w1.material === 'peach');
  expect(firstPeach).toBeGreaterThanOrEqual(0);
  expect(renders.slice(firstPeach).every((seen) => seen.w1.material === 'peach'), 'no flicker after the look shows').toBe(true);
});

// D4: two accounts' changes queued behind held reads.
test("D4: two accounts' changes queued: each kept for its own account, and B never shows A's", async () => {
  const fake = createFakeDiary();
  const { stored } = mountWallet(<Keeper />, { diary: fake.diary, account: { looks: JSON.stringify({ [W1]: PEACH }) } });
  await settle();
  const held = heldStore({ ...Object.fromEntries(stored), [keyOf(B, 'looks')]: JSON.stringify({ [W1]: CASH }) });
  installStoreBackend(held.backend);
  let changeA: Promise<void> | undefined;
  let changeB: Promise<void> | undefined;
  await act(async () => { changeA = api?.looks.setLook(W2, SKY); });
  await act(async () => { changeA = Promise.all([changeA, api?.looks.setOrder([W2, W1, W2])]).then(() => undefined); });
  await act(async () => { fake.set({ accountId: B }); });
  renders = [];
  await act(async () => { changeB = api?.looks.setLook(W2, PEACH); });
  await act(async () => { changeB = Promise.all([changeB, api?.looks.setOrder([W1])]).then(() => undefined); });
  await drain(held);
  await act(async () => { await Promise.all([changeA, changeB]); });
  expect(JSON.parse(held.stored.get(keyOf(A, 'looks')) ?? 'null'), "A's looks").toEqual({ [W1]: PEACH, [W2]: SKY });
  expect(JSON.parse(held.stored.get(keyOf(A, 'wallet-order')) ?? 'null'), "A's order").toEqual([W2, W1]);
  expect(JSON.parse(held.stored.get(keyOf(B, 'looks')) ?? 'null'), "B's looks").toEqual({ [W1]: CASH, [W2]: PEACH });
  expect(JSON.parse(held.stored.get(keyOf(B, 'wallet-order')) ?? 'null'), "B's order").toEqual([W1]);
  expect(shown(), 'under B').toMatchObject({ w1: CASH, w2: PEACH, order: [W1] });
  // A's kept values: W1 PEACH, W2 SKY (kind transit, unlike W2's derived sky with no kind), order [W2, W1].
  const isA = (seen: (typeof renders)[number]) => JSON.stringify(seen.w1) === JSON.stringify(PEACH) || JSON.stringify(seen.w2) === JSON.stringify(SKY) || JSON.stringify(seen.order) === JSON.stringify([W2, W1]);
  expect(renders.filter((seen) => seen.accountId === B && isA(seen)), "A's under B").toEqual([]);
});

// D5: setOrder keeps each id once on every path; damaged kept order is dropped.
test('D5: setOrder keeps each id once, read or unreadable; a damaged kept order reads as none and is replaced', async () => {
  const { stored } = mountWallet(<Keeper />, { account: { 'wallet-order': '{"oops":' } });
  await settle();
  expect(shown().order).toEqual([]);
  await act(async () => { await api?.looks.setOrder([W2, W1, W2, W1]); });
  expect(JSON.parse(stored.get(keyOf(A, 'wallet-order')) ?? 'null')).toEqual([W2, W1]);
  expect(shown().order).toEqual([W2, W1]);
  installStoreBackend({
    getItem: async () => { throw new Error('locked'); },
    setItem: async () => { throw new Error('should not write'); },
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiRemove: async () => undefined,
  });
  await act(async () => { await api?.looks.setOrder([W3, W3, W1]); });
  expect(shown().order).toEqual([W3, W1]);
});

// D6: React's development double run (StrictMode): one first read lands, changes keep each other.
test('D6: under StrictMode the first read lands once the queue moves and two changes keep each other', async () => {
  const stored = new Map<string, string>([[keyOf(A, 'looks'), JSON.stringify({ [W2]: SKY })]]);
  installStoreBackend({
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async () => undefined,
  });
  const fake = createFakeDiary();
  render(<StrictMode><SpendDiaryProvider diary={fake.diary}><WalletLooksProvider><Keeper /></WalletLooksProvider></SpendDiaryProvider></StrictMode>);
  await settle();
  expect(shown().w2).toEqual(SKY);
  await act(async () => { await Promise.all([api?.looks.setLook(W1, PEACH), api?.looks.setLook(W3, CASH)]); });
  expect(JSON.parse(stored.get(keyOf(A, 'looks')) ?? 'null')).toEqual({ [W2]: SKY, [W1]: PEACH, [W3]: CASH });
  expect(shown()).toMatchObject({ w1: PEACH, w2: SKY, w3: CASH });
});

// D7: account -> null (no diary open) -> the setters keep nothing and every look is derived, even with a kept look in the store.
test('D7: when the account closes, every look is derived at once and a new setter keeps nothing', async () => {
  const fake = createFakeDiary();
  const { stored } = mountWallet(<Keeper />, { diary: fake.diary, account: { looks: JSON.stringify({ [W1]: PEACH }), 'wallet-order': JSON.stringify([W1]) } });
  await settle();
  expect(shown().w1).toEqual(PEACH);
  renders = [];
  await act(async () => { fake.set({ accountId: null, phase: 'locked' }); });
  await settle();
  expect(renders.filter((seen) => seen.accountId === null && (seen.w1.material === 'peach' || seen.order.length > 0))).toEqual([]);
  expect(shown()).toMatchObject({ w1: derivedLook(W1), order: [] });
  const before = JSON.stringify([...stored]);
  await act(async () => { await api?.looks.setLook(W1, CASH); await api?.looks.setOrder([W2]); await api?.icons.setIcon('c1', 'book'); });
  expect(JSON.stringify([...stored])).toBe(before);
  expect(shown()).toMatchObject({ w1: derivedLook(W1), order: [], c1: 'lotus' });
});

// D8: P3 "after the account's first read": a change made in a child's mount effect runs before the provider's first read.
test("D8: a change from a child's mount effect waits for the account's first read (order of the store's reads and writes)", async () => {
  const log: string[] = [];
  const stored = new Map<string, string>([[keyOf(A, 'looks'), JSON.stringify({ [W2]: SKY })]]);
  installStoreBackend({
    getItem: async (key) => { log.push(`get ${key.split('.').pop()}`); return stored.get(key) ?? null; },
    setItem: async (key, value) => { log.push(`set ${key.split('.').pop()}`); stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async () => undefined,
  });
  function ChangesOnMount() {
    const { setLook } = useWalletLooks();
    useEffect(() => { void setLook(W1, PEACH); }, []);
    return null;
  }
  const fake = createFakeDiary();
  render(<SpendDiaryProvider diary={fake.diary}><WalletLooksProvider><ChangesOnMount /><Keeper /></WalletLooksProvider></SpendDiaryProvider>);
  await settle();
  await settle();
  // The brief: each change runs after the account's first read (three gets), then reads, changes and writes its name.
  expect(log.slice(0, 3).sort(), `the store's calls in order: ${log.join(', ')}`).toEqual(['get category-icons', 'get looks', 'get wallet-order']);
  expect(shown()).toMatchObject({ w1: PEACH, w2: SKY });
});

// D8b: the same order with a write that fails: the first read, landing after the change, hides it.
test("D8b: a change from a child's mount effect whose write fails still shows once the first read lands", async () => {
  const stored = new Map<string, string>([[keyOf(A, 'looks'), JSON.stringify({ [W2]: SKY })]]);
  installStoreBackend({
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async () => { throw new Error('the disk is full'); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async () => undefined,
  });
  function ChangesOnMount() {
    const { setLook } = useWalletLooks();
    useEffect(() => { void setLook(W1, PEACH); }, []);
    return null;
  }
  const fake = createFakeDiary();
  render(<SpendDiaryProvider diary={fake.diary}><WalletLooksProvider><ChangesOnMount /><Keeper /></WalletLooksProvider></SpendDiaryProvider>);
  await settle();
  await settle();
  expect(shown().w2).toEqual(SKY);
  expect(shown().w1, 'a write that fails shows until the app closes').toEqual(PEACH);
});
