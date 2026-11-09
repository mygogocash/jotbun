// 1D's ChoicePanel (C16, board rh-conflict) on its own: the radio cards, the
// main button that follows them, and Decide later only while the phone keeps
// the choice. The record's choice flow is RecordScreen.render.test.tsx's.
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { Dimensions } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import type { ConflictModel } from '@mobile/spend/v1/redesign/recordModel';
import { mountKit } from '@mobile/ui/entryKitTestHarness';
import { ChoicePanel } from './ChoicePanel';
import type { ChoicePanelProps } from './ChoicePanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The board's lunch: ฿50.00 here, ฿55.00 on the server, the category the same on both. */
const MODEL: Extract<ConflictModel, { kind: 'changed' }> = {
  kind: 'changed', message: 'This entry changed on another device.', yoursLabel: 'Yours', serverLabel: 'On the server',
  keepMine: 'Apply my change', useServer: "Keep what's on the server",
  rows: [
    { key: 'amount', label: 'Amount', yours: '฿50.00', server: '฿55.00', youChanged: true, differs: true },
    { key: 'category', label: 'Category', yours: 'Food', server: 'Food', youChanged: false, differs: false },
  ],
};

function mount(overrides: Partial<ChoicePanelProps> = {}, locale: 'en' | 'th' = 'en') {
  const props: ChoicePanelProps = {
    model: MODEL, yoursAt: '12:14', busy: false, canSendYours: true, note: null,
    onUseYours: vi.fn(), onUseServer: vi.fn(), onDecideLater: vi.fn(), ...overrides,
  };
  mountKit(<ChoicePanel {...props} />, { locale });
  return props;
}

const checkedOf = (radio: HTMLElement) => radio.getAttribute('aria-checked');

test('without onDecideLater there is no Decide later link', () => {
  const kept = mount();
  expect(screen.getByText("The details don't match. Choose which to keep. Your change stays on this phone until you choose.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));
  expect(kept.onDecideLater).toHaveBeenCalledTimes(1);
  cleanup();
  mount({ onDecideLater: undefined, note: "This phone can't keep this choice, so please choose now." });
  expect(screen.queryByRole('button', { name: 'Decide later' })).toBeNull();
  // The cannot-keep line takes the kept-here line's place: nothing says the change stays on this phone.
  expect(screen.getByText("This phone can't keep this choice, so please choose now.")).toBeTruthy();
  expect(screen.queryByText(/stays on this phone/)).toBeNull();
});

test('each radio card is at least 44 pt and says whether it is chosen', () => {
  mount();
  const group = screen.getByRole('radiogroup', { name: 'This entry was changed on another phone' });
  const [yours, server] = within(group).getAllByRole('radio');
  for (const card of [yours, server]) expect(Number.parseFloat(card.style.minHeight)).toBeGreaterThanOrEqual(44);
  // Each card says its whole version, the differing field named as such.
  expect(yours.getAttribute('aria-label')).toBe('Yours. This phone · changed 12:14. Amount: ฿50.00, Differs. Category: Food');
  expect(server.getAttribute('aria-label')).toBe('On the server. Another phone. Amount: ฿55.00, Differs. Category: Food');
  expect([checkedOf(yours), checkedOf(server)]).toEqual(['true', 'false']);
  // The mark is a word on both cards, with the differing value in bold; never a colour alone.
  expect(within(yours).getByText('Differs')).toBeTruthy();
  expect(within(server).getByText('Differs')).toBeTruthy();
  expect(within(yours).getByText('฿50.00').style.fontWeight).toBe('700');
  expect(within(server).getByText('฿55.00').style.fontWeight).toBe('700');
  expect(within(yours).getByText('Food').style.fontWeight).not.toBe('700');
  fireEvent.click(server);
  expect([checkedOf(yours), checkedOf(server)]).toEqual(['false', 'true']);
});

test('the main button follows the chosen card', () => {
  const props = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use yours' }));
  expect(props.onUseYours).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('radio', { name: /^On the server\./ }));
  expect(screen.queryByRole('button', { name: 'Use yours' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: "Use the server's" }));
  expect(props.onUseServer).toHaveBeenCalledTimes(1);
  expect(props.onUseYours).toHaveBeenCalledTimes(1);
  cleanup();
  // Offline: yours cannot be sent and the button says why; the server's version can still be chosen.
  const offline = mount({ canSendYours: false });
  const useYours = screen.getByRole('button', { name: 'Use yours' });
  expect(useYours.getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByText('Connect to the internet to send yours.')).toBeTruthy();
  fireEvent.click(useYours);
  expect(offline.onUseYours).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: /^On the server\./ }));
  expect(screen.queryByText('Connect to the internet to send yours.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: "Use the server's" }));
  expect(offline.onUseServer).toHaveBeenCalledTimes(1);
});

test("in Thai the panel reads the board's words", () => {
  mount({}, 'th');
  expect(screen.getByRole('heading', { name: 'รายการนี้ถูกแก้ในอีกเครื่อง' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: /^ของคุณ\. เครื่องนี้ · แก้ 12:14\./ }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('radio', { name: /^ในเซิร์ฟเวอร์\. อีกเครื่อง\./ })).toBeTruthy();
  expect(screen.getAllByText('ไม่ตรงกัน')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'ใช้ของคุณ' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ตัดสินใจทีหลัง' })).toBeTruthy();
});

test('at the largest text sizes the two cards stack', () => {
  for (const [fontScale, direction] of [[1, 'row'], [3.571, 'column']] as const) {
    const real = Dimensions.get.bind(Dimensions);
    vi.spyOn(Dimensions, 'get').mockImplementation((dimension) => ({ ...real(dimension), fontScale }));
    mount();
    expect([fontScale, screen.getByRole('radiogroup').style.flexDirection]).toEqual([fontScale, direction]);
    cleanup();
    vi.restoreAllMocks();
  }
});
