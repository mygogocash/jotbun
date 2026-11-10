// Looks kept on the phone (P2-T11, W5, W7, R64): the provider keeps wallet
// looks, the wallet order and category icons for the open diary's account,
// one change after another and never over what it could not read; Bun's five
// faces and the five materials are the boards'; a category's tile; and the
// kit's catalogue sections.
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Text } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { materialPaint, tileTint, WALLET_MATERIALS } from '@mobile/theme/walletPalette';
import { CATEGORY_DRAWINGS } from '@mobile/ui/categoryDrawings';
import { installStoreBackend } from '../store/deviceWalletStore';
import type { StoreBackend } from '../store/walletStore';
import { mountWallet, TEST_ACCOUNT_ID } from '../testing/walletHarness';
import { BunFace } from './BunFace';
import { MaterialFill } from './MaterialFill';
import { WalletCategoryIcon } from './WalletCategoryIcon';
import { BUN_FACES, derivedLook } from './walletLooks';
import type { WalletLook } from './walletLooks';
import { useCategoryIcons, useWalletLooks } from './WalletLooksProvider';
import type { CategoryIcons, WalletLooks } from './WalletLooksProvider';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Lets the stores, the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const BOARDS = join(dirname(fileURLToPath(import.meta.url)), '../../../../../docs/design/bun-wallet');
const OTHER_ACCOUNT = '00000000-0000-4000-8000-0000000000bb';
const W1 = '00000000-0000-4000-8000-000000000001';
const W2 = '00000000-0000-4000-8000-000000000002';
const W3 = '00000000-0000-4000-8000-000000000003';
const PEACH: WalletLook = { kind: 'credit_card', material: 'peach', face: 'wow' };
const SKY: WalletLook = { kind: 'transit', material: 'sky', face: 'happy' };
const CASH: WalletLook = { kind: 'cash', material: 'paper', face: 'wink' };
const MERIT = { id: 'c1', type: 'expense', label: 'ทำบุญ', builtin_key: null } as const;
const keyOf = (accountId: string, name: string) => `jotbun.account.${accountId}.${name}`;
const MODES = ['light', 'dark'] as const;

let api: { looks: WalletLooks; icons: CategoryIcons } | null = null;
let renders: { accountId: string | null; w1: WalletLook }[] = [];

/** Reads what the provider keeps, and records each render's account and W1's look. */
function Keeper() {
  const looks = useWalletLooks();
  const icons = useCategoryIcons();
  const { accountId } = useDiaryView();
  api = { looks, icons };
  renders.push({ accountId, w1: looks.lookOf(W1) });
  return <Text testID="kept">{JSON.stringify({ w1: looks.lookOf(W1), w2: looks.lookOf(W2), w3: looks.lookOf(W3), order: looks.order, c1: icons.iconOf(MERIT) })}</Text>;
}

const shown = () => JSON.parse(screen.getByTestId('kept').textContent ?? '{}') as { w1: WalletLook; w2: WalletLook; w3: WalletLook; order: string[]; c1: string | null };

afterEach(() => {
  api = null;
  renders = [];
});

/**
 * A store in memory whose first read of each name, until `release()`, waits and then answers what
 * the name held when it was asked, as a slow read in flight does. Every other read answers at once.
 */
function slowFirstReads(seed: Readonly<Record<string, string>>) {
  const stored = new Map(Object.entries(seed));
  const held: (() => void)[] = [];
  const asked = new Set<string>();
  let open = false;
  const backend: StoreBackend = {
    getItem: (key) => {
      const value = stored.get(key) ?? null;
      if (open || asked.has(key)) return Promise.resolve(value);
      asked.add(key);
      return new Promise((resolve) => held.push(() => resolve(value)));
    },
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async (keys) => { for (const key of keys) stored.delete(key); },
  };
  return {
    stored,
    backend,
    release() {
      open = true;
      for (const answer of held.splice(0)) answer();
    },
  };
}

/** A store in memory whose every read waits until the next `release()`, then answers what the name held when it was asked. */
function heldReads(seed: Readonly<Record<string, string>>) {
  const stored = new Map(Object.entries(seed));
  const held: (() => void)[] = [];
  const backend: StoreBackend = {
    getItem: (key) => {
      const value = stored.get(key) ?? null;
      return new Promise((resolve) => held.push(() => resolve(value)));
    },
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async (key) => { stored.delete(key); },
    getAllKeys: async () => [...stored.keys()],
    multiRemove: async (keys) => { for (const key of keys) stored.delete(key); },
  };
  return {
    backend,
    /** Answers every read asked so far. */
    release() {
      for (const answer of held.splice(0)) answer();
    },
  };
}

test("a kept look, the wallet order and a category's icon go to this account's store, and two quick changes keep each other", async () => {
  const { stored } = mountWallet(<Keeper />, { account: { looks: JSON.stringify({ [W2]: SKY }) } });
  await settle();
  expect(shown()).toEqual({ w1: derivedLook(W1), w2: SKY, w3: derivedLook(W3), order: [], c1: 'lotus' });
  await act(async () => {
    await Promise.all([api?.looks.setLook(W1, PEACH), api?.looks.setLook(W3, CASH), api?.looks.setOrder([W2, W1, W2]), api?.icons.setIcon('c1', 'book')]);
  });
  expect(JSON.parse(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')) ?? 'null')).toEqual({ [W2]: SKY, [W1]: PEACH, [W3]: CASH });
  expect(JSON.parse(stored.get(keyOf(TEST_ACCOUNT_ID, 'wallet-order')) ?? 'null')).toEqual([W2, W1]);
  expect(JSON.parse(stored.get(keyOf(TEST_ACCOUNT_ID, 'category-icons')) ?? 'null')).toEqual({ c1: 'book' });
  expect(shown()).toEqual({ w1: PEACH, w2: SKY, w3: CASH, order: [W2, W1], c1: 'book' });
});

test("a change waits for the account's first read, so the read never hides it", async () => {
  const fake = createFakeDiary({ accountId: null });
  mountWallet(<Keeper />, { diary: fake.diary });
  await settle();
  const slow = slowFirstReads({ [keyOf(TEST_ACCOUNT_ID, 'looks')]: JSON.stringify({ [W2]: SKY }) });
  installStoreBackend(slow.backend);
  await act(async () => { fake.set({ accountId: TEST_ACCOUNT_ID }); });
  let change: Promise<void> | undefined;
  await act(async () => { change = api?.looks.setLook(W1, PEACH); });
  await act(async () => {
    slow.release();
    await change;
  });
  await settle();
  expect(JSON.parse(slow.stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')) ?? 'null')).toEqual({ [W2]: SKY, [W1]: PEACH });
  expect(shown()).toMatchObject({ w1: PEACH, w2: SKY });
});

test('when the account changes, nothing of the last one shows, its late read is dropped, and a change stays with the account it was made in', async () => {
  const fake = createFakeDiary();
  const { stored } = mountWallet(<Keeper />, { diary: fake.diary, account: { looks: JSON.stringify({ [W1]: PEACH }) } });
  await settle();
  expect(shown().w1).toEqual(PEACH);
  stored.set(keyOf(OTHER_ACCOUNT, 'looks'), JSON.stringify({ [W1]: CASH }));
  const madeBefore = api?.looks.setLook;
  renders = [];
  await act(async () => { fake.set({ accountId: OTHER_ACCOUNT }); });
  await settle();
  // Not one render showed the last account's look under the new one.
  expect(renders.filter((seen) => seen.accountId === OTHER_ACCOUNT && seen.w1.material === 'peach')).toEqual([]);
  expect(shown().w1).toEqual(CASH);
  // A change made for the first account, landing after the switch, is kept for it and shows for neither.
  await act(async () => { await madeBefore?.(W2, SKY); });
  expect(JSON.parse(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks')) ?? 'null')).toEqual({ [W1]: PEACH, [W2]: SKY });
  expect(JSON.parse(stored.get(keyOf(OTHER_ACCOUNT, 'looks')) ?? 'null')).toEqual({ [W1]: CASH });
  expect(shown().w2).toEqual(derivedLook(W2));
  cleanup();

  // Away and back before any read lands: the read for the account no longer open is dropped, so the look never flickers.
  const later = createFakeDiary({ accountId: null });
  mountWallet(<Keeper />, { diary: later.diary });
  await settle();
  const held = heldReads({ [keyOf(TEST_ACCOUNT_ID, 'looks')]: JSON.stringify({ [W1]: PEACH }), [keyOf(OTHER_ACCOUNT, 'looks')]: JSON.stringify({ [W1]: CASH }) });
  installStoreBackend(held.backend);
  await act(async () => { later.set({ accountId: TEST_ACCOUNT_ID }); });
  await act(async () => { later.set({ accountId: OTHER_ACCOUNT }); });
  await act(async () => { later.set({ accountId: TEST_ACCOUNT_ID }); });
  // Each release lands one account's read, in the order asked: this account's, the other's, this account's again.
  for (const step of ['first read', 'the other account\'s read', 'second read']) {
    await act(async () => { held.release(); });
    await settle();
    expect(shown().w1, step).toEqual(PEACH);
  }
});

test('a name the store cannot read is never written over, and what fails to store still shows until the app closes', async () => {
  const { stored } = mountWallet(<Keeper />, { account: { looks: JSON.stringify({ [W2]: SKY }) } });
  await settle();
  const written: string[] = [];
  const locked = new Error('the keychain is locked');
  installStoreBackend({
    getItem: async () => { throw locked; },
    setItem: async (key) => { written.push(key); },
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiRemove: async () => undefined,
  });
  await act(async () => {
    await api?.looks.setLook(W1, PEACH);
    await api?.icons.setIcon('c1', 'book');
  });
  expect(written).toEqual([]);
  // The changes show on top of what was read, and what the store holds is untouched.
  expect(shown()).toMatchObject({ w1: PEACH, w2: SKY, c1: 'book' });
  expect(stored.get(keyOf(TEST_ACCOUNT_ID, 'looks'))).toBe(JSON.stringify({ [W2]: SKY }));

  // A store that reads but cannot write: the change still shows, and nothing is left unhandled.
  installStoreBackend({
    getItem: async () => null,
    setItem: async () => { throw locked; },
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiRemove: async () => undefined,
  });
  await act(async () => { await api?.looks.setLook(W3, CASH); });
  expect(shown().w3).toEqual(CASH);
  cleanup();

  // An account whose first read fails shows derived looks.
  const fake = createFakeDiary({ accountId: null });
  mountWallet(<Keeper />, { diary: fake.diary });
  await settle();
  installStoreBackend({
    getItem: async () => { throw locked; },
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiRemove: async () => undefined,
  });
  await act(async () => { fake.set({ accountId: TEST_ACCOUNT_ID }); });
  await settle();
  expect(shown()).toEqual({ w1: derivedLook(W1), w2: derivedLook(W2), w3: derivedLook(W3), order: [], c1: 'lotus' });
});

test('outside the provider looks are derived, no order or icon is kept, and the setters keep nothing', async () => {
  render(<Keeper />);
  await act(async () => {
    await api?.looks.setLook(W1, PEACH);
    await api?.looks.setOrder([W1]);
    await api?.icons.setIcon('c1', 'book');
  });
  expect(shown()).toEqual({ w1: derivedLook(W1), w2: derivedLook(W2), w3: derivedLook(W3), order: [], c1: 'lotus' });
});

/**
 * One button group of a board, parsed on its own: the whole page would load
 * its web fonts and script, and the tests never reach the network.
 */
function boardGroup(file: string, labelledBy: string): DocumentFragment {
  const html = readFileSync(join(BOARDS, file), 'utf8');
  const at = html.indexOf(`aria-labelledby="${labelledBy}"`);
  const template = document.createElement('template');
  template.innerHTML = html.slice(html.lastIndexOf('<div', at), html.indexOf('</div>', at) + '</div>'.length);
  return template.content;
}

/** A board button's SVG shapes, by the attributes that draw them; an absent fill is none. */
function shapesOf(svg: Element) {
  return [...svg.children].map((node) => {
    const value = (name: string) => node.getAttribute(name);
    const number = (name: string) => (value(name) === null ? null : Number(value(name)));
    return {
      tag: node.tagName.toLowerCase(),
      d: value('d'),
      at: [number('cx'), number('cy'), number('r'), number('rx'), number('ry')],
      fill: value('fill') ?? 'none',
      stroke: value('stroke'),
      width: number('stroke-width'),
      cap: value('stroke-linecap'),
    };
  });
}

test("Bun's five faces are wc-wallet-edit's: cream with an ink outline in both modes, and hidden from screen readers", async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  const board = boardGroup('wc-wallet-edit.dc.html', 'wc-face-label');
  const faces = [['smile', 'ยิ้ม'], ['wink', 'ขยิบตา'], ['calm', 'สบาย ๆ'], ['happy', 'ดีใจ'], ['wow', 'ว้าว']] as const;
  expect([...board.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual(faces.map(([, name]) => name));
  expect(BUN_FACES).toEqual(faces.map(([face]) => face));
  for (const mode of MODES) {
    for (const [face, name] of faces) {
      const { container } = mountWallet(<BunFace face={face} size={38} />, { mode });
      await settle();
      const svg = container.querySelector('svg');
      const drawn = board.querySelector(`button[aria-label="${name}"] svg`);
      expect([svg === null, drawn === null], `${mode} ${face}`).toEqual([false, false]);
      expect(shapesOf(svg as Element), `${mode} ${face}`).toEqual(shapesOf(drawn as Element));
      expect([svg?.getAttribute('viewBox'), Number(svg?.getAttribute('width')), Number(svg?.getAttribute('height'))], face).toEqual(['4 6 56 50', 38, (38 * 50) / 56]);
      expect(svg?.closest('[aria-hidden="true"]'), face).not.toBeNull();
      cleanup();
    }
  }
  expect(network).not.toHaveBeenCalled();
});

test("each material is materialPaint's gradient from corner to corner, its own in each mode, and only dark titanium has an edge", async () => {
  for (const mode of MODES) {
    for (const material of WALLET_MATERIALS) {
      const { container } = mountWallet(<MaterialFill material={material} radius={22} />, { mode });
      await settle();
      const paint = materialPaint(material, mode === 'dark');
      const gradient = container.querySelector('linearGradient');
      const at = `${mode} ${material}`;
      expect(gradient?.getAttribute('id'), at).toBe(`wallet-material-${material}-${mode}`);
      expect(['x1', 'y1', 'x2', 'y2'].map((name) => gradient?.getAttribute(name)), at).toEqual(['0', '0', '1', '1']);
      expect([...container.querySelectorAll('stop')].map((stop) => [Number(stop.getAttribute('offset')), stop.getAttribute('stop-color')]), at).toEqual(paint.stops.map((stop) => [stop.offset, stop.color]));
      const rect = container.querySelector('rect');
      expect([rect?.getAttribute('rx'), rect?.getAttribute('fill')], at).toEqual(['22', `url(#wallet-material-${material}-${mode})`]);
      const edges = [...container.querySelectorAll<HTMLElement>('div')].filter((node) => node.style.borderWidth !== '').map((node) => [node.style.borderWidth, node.style.borderColor, node.style.borderRadius]);
      expect(edges, at).toEqual(paint.edge === null ? [] : [['1px', rgba(paint.edge), '22px']]);
      // Behind the card's words, hidden from screen readers, and every touch goes through it to the card.
      const behind = container.querySelector('svg')?.closest<HTMLElement>('[aria-hidden="true"]');
      expect([behind === null || behind === undefined, behind?.style.pointerEvents], at).toEqual([false, 'none']);
      cleanup();
    }
  }
});

test("a category's tile is its glyph in ink on its hue tinted, or on raised, else its initial; 36 pt with an 11 pt corner, in proportion at 52", async () => {
  const categories = [
    { id: 'c-food', type: 'expense', label: null, builtin_key: 'food', color: '#F0A868' },
    { id: 'c-travel', type: 'expense', label: null, builtin_key: 'travel', color: '#6FB3F2' },
    { ...MERIT, color: null },
    { id: 'c-art', type: 'expense', label: 'Art', builtin_key: null, color: '#D3C2F2' },
    { id: 'c-car', type: 'expense', label: 'รถของฉัน', builtin_key: null, color: null },
    { id: 'c-phone', type: 'expense', label: 'ค่าโทร', builtin_key: null, color: null },
  ] as const;
  for (const mode of MODES) {
    const dark = mode === 'dark';
    const ink = dark ? '#F4F2FA' : '#111014';
    const raised = dark ? '#2C2A33' : '#F4F3F9';
    const { container } = mountWallet(
      <>
        {categories.map((category) => <WalletCategoryIcon key={category.id} category={category} name={category.label ?? category.builtin_key ?? ''} />)}
        <WalletCategoryIcon category={categories[3]} name="Art" size={52} />
        <WalletCategoryIcon category={categories[0]} name="อาหาร" size={52} />
      </>,
      { mode, account: { 'category-icons': JSON.stringify({ 'c-car': 'car', 'c-phone': 'phone' }) } },
    );
    await settle();
    const tiles = [...container.querySelectorAll<HTMLElement>('[aria-hidden="true"][style*="width"]')].filter((node) => node.style.borderRadius !== '');
    expect(tiles.map((tile) => [tile.style.width, tile.style.borderRadius, tile.style.backgroundColor]), mode).toEqual([
      ['36px', '11px', rgba(tileTint('#F0A868', dark))],
      ['36px', '11px', rgba(tileTint('#6FB3F2', dark))],
      ['36px', '11px', rgba(raised)],
      ['36px', '11px', rgba(tileTint('#D3C2F2', dark))],
      ['36px', '11px', rgba(raised)],
      ['36px', '11px', rgba(raised)],
      ['52px', '16px', rgba(tileTint('#D3C2F2', dark))],
      ['52px', '16px', rgba(tileTint('#F0A868', dark))],
    ]);
    const [food, travel, merit, art, car, phone, bigArt, bigFood] = tiles;
    // Built-ins draw today's drawings; the pack is recognised by name; a kept icon wins.
    expect([...food.querySelectorAll('path')].map((path) => path.getAttribute('d')), mode).toEqual(CATEGORY_DRAWINGS.food.map((shape) => ('d' in shape ? shape.d : null)));
    expect(travel.querySelector('rect')?.getAttribute('rx'), mode).toBe('2');
    expect(merit.querySelector('path')?.getAttribute('d'), mode).toMatch(/^M12 4\.5c2\.2 3/);
    expect([...car.querySelectorAll('circle')].map((dot) => [dot.getAttribute('fill'), dot.getAttribute('stroke')]), mode).toEqual([[ink, null], [ink, null]]);
    expect(phone.querySelector('rect')?.getAttribute('rx'), mode).toBe('2.5');
    for (const tile of [food, merit, car, phone]) {
      const svg = tile.querySelector('svg');
      expect([svg?.getAttribute('width'), svg?.getAttribute('viewBox')], mode).toEqual(['18', '0 0 24 24']);
      for (const path of tile.querySelectorAll('path')) expect([path.getAttribute('stroke'), path.getAttribute('stroke-width'), path.getAttribute('fill')], mode).toEqual([ink, '2', 'none']);
    }
    expect(bigFood.querySelector('svg')?.getAttribute('width'), mode).toBe('26');
    // With no glyph, the name's initial, in ink, a fixed square at any text size.
    const initial = (tile: HTMLElement) => tile.querySelector<HTMLElement>('[dir="auto"]');
    expect([initial(art)?.textContent, initial(art)?.style.color, initial(art)?.style.fontSize, initial(art)?.style.fontWeight], mode).toEqual(['A', rgba(ink), '15px', '700']);
    expect([initial(bigArt)?.textContent, initial(bigArt)?.style.fontSize], mode).toEqual(['A', '22px']);
    cleanup();
  }
});

test("the kit's catalogue sections draw the materials, the cards and the category icons, and the card section's private card never touches the phone's setting", async () => {
  const sections = WALLET_SECTIONS.filter((section) => ['bw-materials', 'bw-card', 'bw-category-icons'].includes(section.id));
  expect(sections.map((section) => [section.id, section.title, section.group])).toEqual([
    ['bw-materials', 'Bun Wallet: materials and faces', 'Kit'],
    ['bw-card', 'Bun Wallet: wallet card', 'Kit'],
    ['bw-category-icons', 'Bun Wallet: category icons', 'Kit'],
  ]);
  const [materials, cards, icons] = sections;

  let view = mountWallet(<>{materials.render()}</>);
  await settle();
  expect([...view.container.querySelectorAll('linearGradient')].map((gradient) => gradient.getAttribute('id'))).toEqual(WALLET_MATERIALS.map((material) => `wallet-material-${material}-light`));
  expect(view.container.querySelectorAll('svg[viewBox="4 6 56 50"]')).toHaveLength(BUN_FACES.length);
  cleanup();

  view = mountWallet(<>{cards.render()}</>);
  await settle();
  const said = [...view.container.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label')).filter((label) => label?.includes(', '));
  expect(said).toEqual([
    'เงินสด, เหลือ 1,240 บาท',
    'บัญชีหลัก, เหลือ 24,860 บาท, วันนี้ใช้ 47 บาท',
    'บัตรเครดิต, ใช้ไป 3,920 บาท',
    'บัญชีหลัก, เหลือ 24,810 บาท, รวม 50 บาทที่กำลังบันทึก, วันนี้ใช้ 97 บาท',
    'บัญชีหลัก, ซ่อนยอดเงินอยู่',
    'บัญชีหลัก, เหลือ 24,860 บาท',
    'บัตรเดินทาง, เหลือ 186 บาท',
  ]);
  // The private card pins its own preview: the phone's own setting is never read into it or written.
  expect([...view.stored.keys()]).toEqual([]);
  cleanup();

  view = mountWallet(<>{icons.render()}</>);
  await settle();
  // The picker's twelve glyphs, then tiles: three built-ins and two pack categories draw glyphs, a custom one and one with no colour their initials.
  expect(view.container.querySelectorAll('svg[viewBox="0 0 24 24"]')).toHaveLength(12 + 5);
  expect([...view.container.querySelectorAll('[aria-hidden="true"] [dir="auto"]')].map((node) => node.textContent)).toEqual(['A', 'อ']);
});
