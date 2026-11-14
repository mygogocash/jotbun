// The Bun Wallet's record and today's receipt section in private mode (plan
// P2-T26, ruling R123): while amounts are hidden the page does not mount
// today's panel (RecordReceipt) at all, so no photo is granted, downloaded,
// drawn or opened, and Attach, Replace and Remove wait. A record that holds a
// receipt shows the section's frame in the wallet look instead: a card of one
// fact, รูปใบเสร็จ ซ่อนอยู่, read as one, as the note is. A record with no
// receipt shows nothing while hidden. With private mode off, today's panel as
// before; with the import area off, neither. The real panel runs here, on the
// fake attachments: WalletRecord.render.test.tsx stands it in, module-wide.
// Every lookup asserts its count, so a missing or extra element fails on an
// AssertionError.
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: vi.fn() }));

import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { translateCopy } from '@mobile/i18n/messages';
import { ReceiptPortsProvider } from '@mobile/screens/redesign/import/ReceiptParts';
import type { ReceiptPorts } from '@mobile/screens/redesign/import/ReceiptParts';
import { createFakeAttachments } from '@mobile/spend/v1/testing/fakeAttachments';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { mountWallet } from '../testing/walletHarness';
import { WalletRecordScreen } from './WalletRecordScreen';

const ENV = process.env.EXPO_PUBLIC_REDESIGN;
beforeEach(() => {
  // The import area is approved: on unless switched off.
  delete process.env.EXPO_PUBLIC_REDESIGN;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (ENV === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = ENV;
});

const LOCALES = ['th', 'en'] as const;
const MODES = ['light', 'dark'] as const;
const PALETTE = { light: walletLight, dark: walletDark } as const;
type Locale = (typeof LOCALES)[number];

/** Saturday 24 October 2026, 10:00 in Bangkok: bw-record's day. */
const NOW = new Date('2026-10-24T03:00:00Z');
const MAIN: WalletSnapshot = { id: '0000000a-0000-4000-8000-000000000801', name: 'บัญชีหลัก', currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1 };
const [FOOD] = BUILTINS as [CategoryDto];
/** bw-record's entry: ฿50.00 of chicken rice from the main account, with its note. */
const LUNCH = {
  id: '0000000b-0000-4000-8000-000000000801', type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', wallet_id: MAIN.id,
  category_id: FOOD.id, merchant: 'ข้าวมันไก่', note: 'กับเพื่อนที่ออฟฟิศ', deleted_at: null, version: 3,
} as TransactionDto;

/** The draft tables' words (Thai first); today's panel's come through the catalogs. */
const WORDS = {
  th: { food: 'อาหาร', noteHidden: 'ซ่อนอยู่' },
  en: { food: 'Food', noteHidden: 'Hidden' },
} as const;
const tc = (english: string, locale: Locale) => translateCopy(english, locale);
/** Today's panel's buttons: none of them while amounts are hidden. */
const PANEL_BUTTONS = ['Attach a receipt photo', 'Replace photo', 'Remove photo', 'Open the receipt photo'];
/** Today's panel's parts: its card, the thumbnail and its image, the viewer and its image. */
const PANEL_PARTS = ['record-receipt', 'receipt-thumbnail', 'receipt-thumbnail-image', 'receipt-viewer', 'receipt-full-image'];

/** Lets the stores, the phone's answers and the panel's reads arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

type Mount = { hidden: boolean; receipt?: boolean; locale?: Locale; mode?: 'light' | 'dark' };

/** The record screen with the real panel, on a record that holds a receipt unless `receipt` is false. */
function mount({ hidden, receipt = true, locale = 'th', mode = 'light' }: Mount) {
  const fake = createFakeResources({ wallets: [MAIN], categories: BUILTINS, records: [LUNCH] });
  const files = createFakeAttachments({ records: fake.records });
  if (receipt) files.seedReceipt(LUNCH.id);
  const ports: Partial<ReceiptPorts> = {
    attachments: files.attachments, uploads: files.uploads, picker: files.picker, now: files.now,
    sleep: async () => {}, pollMs: 0, maxPolls: 5, newId: () => globalThis.crypto.randomUUID(),
  };
  mountWallet(
    <ReceiptPortsProvider ports={ports}><WalletRecordScreen id={LUNCH.id} now={NOW} /></ReceiptPortsProvider>,
    { resources: fake.resources, locale, mode, device: hidden ? { [PRIVATE_MODE_NAME]: '1' } : {} },
  );
  return { files };
}

/** Waits for the page's title (the category's name while hidden, R114), then lets the reads land. */
async function ready(title: string) {
  await waitFor(() => expect(screen.queryAllByRole('heading', { name: title }), `the title ${title}`).toHaveLength(1));
  await settle();
  await settle();
}

/** Nothing of today's panel: no part, no button, no image and no photo's bytes anywhere. */
function noPanel(locale: Locale, label: string) {
  for (const part of PANEL_PARTS) expect(screen.queryAllByTestId(part), `${label}: no ${part}`).toHaveLength(0);
  for (const name of PANEL_BUTTONS) expect(screen.queryAllByRole('button', { name: tc(name, locale) }), `${label}: no ${name}`).toHaveLength(0);
  expect(document.querySelectorAll('img'), `${label}: no image`).toHaveLength(0);
  expect(document.body.innerHTML, `${label}: no photo's bytes`).not.toContain('data:image');
}

test("private mode: a record that holds a receipt shows the section's frame, รูปใบเสร็จ ซ่อนอยู่, and fetches nothing", async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const label = `${locale} ${mode}`;
      const words = WORDS[locale];
      const { files } = mount({ hidden: true, locale, mode });
      await ready(words.food);
      const frames = screen.queryAllByTestId('wallet-record-receipt-hidden');
      expect(frames, `${label}: the frame`).toHaveLength(1);
      const frame = frames[0] as HTMLElement;
      const heading = tc('Receipt photo', locale);
      expect(frame.textContent, `${label}: its words`).toBe(`${heading}${words.noteHidden}`);
      // Read as one, as the note is.
      expect([...frame.querySelectorAll('[aria-label]')].map((row) => row.getAttribute('aria-label')), `${label}: read as`).toEqual([`${heading} ${words.noteHidden}`]);
      // The wallet look: a card, as the facts are.
      expect(frame.style.backgroundColor, `${label}: the card`).toBe(rgba(PALETTE[mode].card));
      noPanel(locale, label);
      // Nothing fetched: no grant and no download, so no slip reaches the phone while amounts are hidden.
      expect([files.callsOf('grant').length, files.callsOf('file').length], `${label}: nothing granted or downloaded`).toEqual([0, 0]);
      cleanup();
    }
  }
});

test('private mode: a record with no receipt shows no receipt section, and nothing to attach', async () => {
  for (const locale of LOCALES) {
    const { files } = mount({ hidden: true, receipt: false, locale });
    await ready(WORDS[locale].food);
    expect(screen.queryAllByTestId('wallet-record-receipt-hidden'), `${locale}: no frame`).toHaveLength(0);
    noPanel(locale, locale);
    expect(files.callsOf('grant'), `${locale}: nothing granted`).toHaveLength(0);
    cleanup();
  }
});

test("with private mode off, today's panel as before: the photo, granted once, and no frame", async () => {
  for (const locale of LOCALES) {
    const { files } = mount({ hidden: false, locale });
    await ready('ข้าวมันไก่');
    await waitFor(() => expect(screen.queryAllByTestId('receipt-thumbnail-image'), `${locale}: the thumbnail`).toHaveLength(1));
    expect(screen.queryAllByRole('button', { name: tc('Open the receipt photo', locale) }), `${locale}: open`).toHaveLength(1);
    expect(screen.queryAllByTestId('wallet-record-receipt-hidden'), `${locale}: no frame`).toHaveLength(0);
    expect(files.callsOf('grant'), `${locale}: one grant`).toHaveLength(1);
    cleanup();
  }
  // With no receipt, today's Attach.
  mount({ hidden: false, receipt: false });
  await ready('ข้าวมันไก่');
  await waitFor(() => expect(screen.queryAllByRole('button', { name: tc('Attach a receipt photo', 'th') }), 'attach').toHaveLength(1));
  expect(screen.queryAllByTestId('wallet-record-receipt-hidden'), 'no frame').toHaveLength(0);
});

test('with the import area off, neither the frame nor the panel, private mode on or off', async () => {
  process.env.EXPO_PUBLIC_REDESIGN = '-import';
  for (const hidden of [true, false]) {
    const label = hidden ? 'hidden' : 'shown';
    const { files } = mount({ hidden });
    await ready(hidden ? WORDS.th.food : 'ข้าวมันไก่');
    expect(screen.queryAllByTestId('wallet-record-receipt-hidden'), `${label}: no frame`).toHaveLength(0);
    noPanel('th', label);
    expect([files.callsOf('grant').length, files.callsOf('file').length], `${label}: nothing fetched`).toEqual([0, 0]);
    cleanup();
  }
});
