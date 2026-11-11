// Private mode (P2-T10, W10, D41, R61, R65, ax-voiceover): the eye hides
// every amount behind ฿•••• and says what it will do; the choice is a device
// setting that survives a restart; the tip shows until it is closed once;
// each tap sends one private_mode_toggled with no properties and tells
// VoiceOver what changed. Until the setting is read, amounts stay hidden.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

import { COMMON_RULES } from '@mobile/analytics/catalog';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { mountInApp, rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { IconButton } from '../controls/IconButton';
import { WalletAmount } from '../money/WalletAmount';
import type { KeyValueStore } from '../store/walletStore';
import { mountWallet } from '../testing/walletHarness';
import { PrivateEyeButton } from './PrivateEyeButton';
import { PRIVATE_MODE_NAME, PRIVATE_TIP_NAME, PrivateModeProvider } from './PrivateModeProvider';
import { PrivateTip } from './PrivateTip';

const os = Platform.OS;
afterEach(() => {
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.restoreAllMocks();
});

/** Lets the private-mode setting, the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const HIDDEN = '฿\u2022\u2022\u2022\u2022';
const SHOWN = ['฿12,480', '+฿35,000'];
const MASKED = [HIDDEN, HIDDEN];

/** The parts of Home that private mode touches: the eye, the tip and two amounts. */
function Amounts() {
  return (
    <View>
      <PrivateEyeButton />
      <PrivateTip />
      <WalletAmount minor="1248000" size={28} label="ใช้ไปเดือนนี้" testID="month" />
      <WalletAmount minor="3500000" sign="income" size={17} testID="salary" />
    </View>
  );
}

const amounts = () => ['month', 'salary'].map((id) => screen.getByTestId(id).textContent);
const tip = () => screen.queryByTestId('private-tip');

/** Taps the button with this name, which must be there, and lets what follows settle. */
async function press(name: string) {
  const button = screen.queryByRole('button', { name });
  expect(button, `a button named ${name}`).not.toBeNull();
  fireEvent.click(button as HTMLElement);
  await settle();
}

/** A device store whose reads wait for `answer()`, with a log of its writes. */
function heldStore(values: Readonly<Record<string, string>>) {
  const waiting: (() => void)[] = [];
  const writes: string[] = [];
  const store: KeyValueStore = {
    get: (name) => new Promise((resolve) => { waiting.push(() => resolve(values[name] ?? null)); }),
    set: async (name, value) => { writes.push(`set ${name} ${value}`); },
    remove: async (name) => { writes.push(`remove ${name}`); },
    eraseAll: async () => { writes.push('eraseAll'); },
  };
  return { store, writes, answer: () => { for (const release of waiting.splice(0)) release(); } };
}

/** The private_mode_toggled captures, each with only its own properties: the app-wide `origin` and the common ones dropped. */
const toggles = (sent: Recorded[]) => sent.filter((event) => event.name === 'private_mode_toggled').map(({ kind, properties }) => ({
  kind,
  properties: Object.fromEntries(Object.entries(properties).filter(([key]) => key !== 'origin' && !(key in COMMON_RULES))),
}));

test('the eye hides every amount and the choice survives a restart', async () => {
  const first = mountWallet(<Amounts />);
  await settle();
  expect(amounts()).toEqual(SHOWN);
  await press('ซ่อนยอดเงิน');
  expect(amounts()).toEqual(MASKED);
  expect(first.stored.get('jotbun.wallet.private-mode')).toBe('1');
  expect(first.container.textContent).not.toMatch(/\d/);
  cleanup();

  // The next launch reads the setting from the phone, and stays hidden until the eye is tapped again.
  const next = mountWallet(<Amounts />, { device: { 'private-mode': '1' } });
  await settle();
  expect(amounts()).toEqual(MASKED);
  await press('แสดงยอดเงิน');
  expect(amounts()).toEqual(SHOWN);
  expect([...next.stored.keys()]).not.toContain('jotbun.wallet.private-mode');
  expect([PRIVATE_MODE_NAME, PRIVATE_TIP_NAME]).toEqual(['private-mode', 'private-tip-seen']);
});

test('the eye says what it will do, at 44 pt', async () => {
  const words = { th: ['ซ่อนยอดเงิน', 'แสดงยอดเงิน'], en: ['Hide amounts', 'Show amounts'] } as const;
  for (const locale of ['th', 'en'] as const) {
    for (const [mode, colors] of [['light', walletLight], ['dark', walletDark]] as const) {
      mountWallet(<PrivateEyeButton />, { locale, mode });
      await settle();
      const at = `${locale} ${mode}`;
      const [hide, show] = words[locale];
      const open = screen.getByRole('button');
      expect(open.getAttribute('aria-label'), at).toBe(hide);
      expect([open.style.width, open.style.height, open.style.borderRadius], at).toEqual(['44px', '44px', '22px']);
      expect([open.style.backgroundColor, open.style.borderTopColor], at).toEqual([rgba(colors.card), rgba(colors.hairline)]);
      const drawn = open.innerHTML;
      await press(hide);
      const shut = screen.getByRole('button');
      expect(shut.getAttribute('aria-label'), at).toBe(show);
      // Drawn shut: the slashed eye.
      expect(shut.innerHTML, at).not.toBe(drawn);
      cleanup();
    }
  }
});

test('the tip shows the first time only', async () => {
  const { stored } = mountWallet(<Amounts />);
  await settle();
  expect(tip()).toBeNull();
  await press('ซ่อนยอดเงิน');
  expect(tip()?.textContent).toBe('โหมดส่วนตัวซ่อนยอดเงินทุกที่แล้ว แตะรูปตาอีกครั้งเมื่ออยากดู เหมาะตอนอยู่บนรถไฟฟ้า');
  expect(tip()?.getAttribute('role')).toBe('status');
  const close = screen.getByRole('button', { name: 'ปิดคำแนะนำ' });
  expect([close.style.width, close.style.height]).toEqual(['44px', '44px']);
  await press('ปิดคำแนะนำ');
  expect(tip()).toBeNull();
  expect(stored.get('jotbun.wallet.private-tip-seen')).toBe('1');
  // Closed once, it never comes back: not on the next hide, nor at the next launch.
  await press('แสดงยอดเงิน');
  await press('ซ่อนยอดเงิน');
  expect(tip()).toBeNull();
  cleanup();
  mountWallet(<Amounts />, { device: { 'private-mode': '1', 'private-tip-seen': '1' } });
  await settle();
  expect(tip()).toBeNull();
  cleanup();

  // Hidden but never closed: the tip is still there at the next launch.
  mountWallet(<Amounts />, { device: { 'private-mode': '1' }, locale: 'en' });
  await settle();
  expect(tip()?.textContent).toBe('Private modeAmounts are hidden everywhere. Tap the eye again when you want to see them. Handy on the train.');
  expect(screen.queryByRole('button', { name: 'Close tip' })).not.toBeNull();
});

test('toggling sends one private_mode_toggled with no properties', async () => {
  const recorded = await recordAnalytics();
  try {
    mountWallet(<Amounts />);
    await settle();
    await press('ซ่อนยอดเงิน');
    expect(toggles(recorded.sent)).toEqual([{ kind: 'capture', properties: {} }]);
    await press('แสดงยอดเงิน');
    expect(recorded.sent.map(({ kind, name }) => `${kind} ${name}`)).toEqual(['capture private_mode_toggled', 'capture private_mode_toggled']);
    expect(toggles(recorded.sent)).toEqual([{ kind: 'capture', properties: {} }, { kind: 'capture', properties: {} }]);
    // No amount from the screen.
    const text = JSON.stringify(recorded.sent);
    for (const secret of ['1248000', '12,480', '3500000', '35,000']) expect(text).not.toContain(secret);
  } finally {
    recorded.restore();
  }
});

test('each tap tells VoiceOver what changed (ax-voiceover)', async () => {
  const cases = [
    ['th', 'ซ่อนยอดเงิน', 'แสดงยอดเงิน', 'ซ่อนยอดเงินอยู่', 'แสดงยอดเงินแล้ว'],
    ['en', 'Hide amounts', 'Show amounts', 'Amounts hidden', 'Amounts shown'],
  ] as const;
  for (const [locale, hide, show, hidden, shown] of cases) {
    mountWallet(<PrivateEyeButton />, { locale });
    await settle();
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    // announcePolitely speaks on iOS, where live regions are not read.
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
    await press(hide);
    await press(show);
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
    expect(announce.mock.calls, locale).toEqual([[hidden], [shown]]);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('until the setting is read, amounts stay hidden and the eye waits; a store that cannot answer shows them', async () => {
  const recorded = await recordAnalytics();
  try {
    const phone = heldStore({});
    mountWallet(<PrivateModeProvider store={phone.store}><Amounts /></PrivateModeProvider>);
    await settle();
    expect(amounts()).toEqual(MASKED);
    expect(tip()).toBeNull();
    // A tap before the answer changes nothing, stores nothing and sends nothing.
    await press('แสดงยอดเงิน');
    expect([amounts(), phone.writes, recorded.sent]).toEqual([MASKED, [], []]);
    await act(async () => { phone.answer(); });
    await settle();
    expect(amounts()).toEqual(SHOWN);
    await press('ซ่อนยอดเงิน');
    expect(phone.writes).toEqual(['set private-mode 1']);
    cleanup();

    const locked = new Error('the keychain is locked');
    const broken: KeyValueStore = {
      get: async () => { throw locked; },
      set: async () => { throw locked; },
      remove: async () => { throw locked; },
      eraseAll: async () => { throw locked; },
    };
    mountWallet(<PrivateModeProvider store={broken}><Amounts /></PrivateModeProvider>);
    await settle();
    expect(amounts()).toEqual(SHOWN);
    // A choice that cannot be stored still holds while the app is open.
    await press('ซ่อนยอดเงิน');
    expect(amounts()).toEqual(MASKED);
    await press('ปิดคำแนะนำ');
    expect(tip()).toBeNull();
  } finally {
    recorded.restore();
  }
});

test('outside the wallet root amounts show, and the eye changes nothing', async () => {
  mountInApp(<Amounts />, 'th');
  await settle();
  expect(amounts()).toEqual(SHOWN);
  await press('ซ่อนยอดเงิน');
  expect(amounts()).toEqual(SHOWN);
  expect(tip()).toBeNull();
});

test("the catalogue's private section pins its own preview and never touches the phone's setting", async () => {
  const section = (id: string) => WALLET_SECTIONS.find((entry) => entry.id === id);
  expect([section('bw-amounts')?.title, section('bw-private')?.title]).toEqual(['Bun Wallet: amounts', 'Bun Wallet: private mode']);
  const preview = mountWallet(<>{section('bw-private')?.render()}</>);
  await settle();
  // Hidden with the tip, whatever the phone holds; the eye and the close change the preview only.
  expect(tip()).not.toBeNull();
  expect(screen.getAllByText(HIDDEN)).toHaveLength(5);
  expect(preview.container.textContent).not.toMatch(/฿\d/);
  await press('แสดงยอดเงิน');
  expect(screen.queryAllByText(HIDDEN)).toEqual([]);
  await press('ซ่อนยอดเงิน');
  await press('ปิดคำแนะนำ');
  expect([...preview.stored.keys()]).toEqual([]);
  cleanup();

  // Every other section follows the private mode around it.
  const amountsSection = mountWallet(<>{section('bw-amounts')?.render()}</>, { device: { 'private-mode': '1' } });
  await settle();
  expect(screen.getAllByText(HIDDEN)).toHaveLength(19);
  expect(amountsSection.container.textContent).not.toMatch(/฿\d/);
});

test('an icon button is 44 pt and named; a disabled one says so and does nothing', async () => {
  const onPress = vi.fn();
  mountWallet(
    <>
      <IconButton label="สลับกระเป๋าเงิน" onPress={onPress}><View /></IconButton>
      <IconButton label="ค้นหา" onPress={onPress} disabled><View /></IconButton>
    </>,
  );
  await settle();
  const [swap, search] = screen.getAllByRole('button');
  expect([swap?.getAttribute('aria-label'), search?.getAttribute('aria-label')]).toEqual(['สลับกระเป๋าเงิน', 'ค้นหา']);
  expect([search?.getAttribute('aria-disabled'), search?.style.opacity, swap?.style.opacity]).toEqual(['true', '0.4', '1']);
  expect([swap?.style.width, swap?.style.height, search?.style.width, search?.style.height]).toEqual(['44px', '44px', '44px', '44px']);
  fireEvent.click(swap as HTMLElement);
  fireEvent.click(search as HTMLElement);
  expect(onPress).toHaveBeenCalledTimes(1);
});
