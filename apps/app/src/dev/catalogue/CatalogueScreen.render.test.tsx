import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. The bun and the icons draw no
// images, so that one resolver is stubbed and the real SVG elements render.
vi.mock('../../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));
// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('./safeAreaTestStub'));
// The screen sections draw the real screens: a recorded router and the route params context stand in for expo-router.
vi.mock('expo-router', () => import('./routerTestStub'));
vi.mock('expo-router/build/Route', () => import('./routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { bunText } from '@mobile/theme/bunType';
import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { QuickAddScreen } from '@mobile/screens/redesign/QuickAddScreen';
import { dayLabel, fullDateLabel } from '@mobile/ui/dateStep';
import { LOCALES, mountInApp, paletteFor, rgba, settle, THEMES } from './catalogueTestHarness';
import { CatalogueScreen } from './CatalogueScreen';
import type { CatalogueSearchParams } from './params';
import { CATALOGUE_SECTIONS } from './registry';
import { sampleWords } from './samples';
import { CATALOGUE_NOW, CATALOGUE_TODAY } from './screenFixtures';
import { screenSection } from './screenSection';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/** A section for every R2a component (big ones split so each fits one screen) and the mascot. */
const KIT_AND_MASCOT = [
  'amount', 'amount-states', 'pill-button', 'card', 'stage-header', 'receipt', 'tab-bar', 'sheet', 'empty-state',
  'empty-state-card', 'sync-banner', 'sync-banner-review', 'undo-bar', 'flag-chip', 'promise-list', 'staged-progress',
  'bun-m', 'bun-l-1', 'bun-l-2', 'speech-bubble', 'bun-peek',
] as const;
/** A section for every R2b component, split the same way. */
const ENTRY = [
  'keypad', 'type-switch', 'category-chips', 'category-grid', 'wallet-picker', 'wallet-picker-move', 'date-chip', 'note-field',
  'record-row', 'day-header', 'budget-bar', 'pace-ring', 'pace-ring-over',
] as const;
/** One section per state of each redesigned screen, drawn by the real screen on fakes. */
const HOME = [
  'home-ready', 'home-over-budget', 'home-no-budget', 'home-first-run', 'home-offline', 'home-saving', 'home-needs-review',
  'home-upgrade', 'home-signed-out', 'home-locked',
] as const;
const QUICK_ADD = [
  'quick-add-empty', 'quick-add-sum', 'quick-add-categories', 'quick-add-move', 'quick-add-details', 'quick-add-saving',
  'quick-add-unconfirmed', 'quick-add-saved', 'quick-add-copy', 'quick-add-no-wallet', 'quick-add-device-error',
] as const;
const HISTORY = [
  'history-month', 'history-search', 'history-search-thai', 'history-search-partial', 'history-filters', 'history-empty',
  'history-no-match', 'history-undo', 'history-drafts', 'history-refresh', 'history-offline',
] as const;
const RECENTLY_DELETED = [
  'recently-deleted-list', 'recently-deleted-empty', 'recently-deleted-restored', 'recently-deleted-unconfirmed', 'recently-deleted-offline',
] as const;
const RECORD = [
  'record-expense', 'record-income', 'record-move', 'record-draft', 'record-edit', 'record-conflict', 'record-deleted', 'record-unconfirmed',
] as const;
const SCREENS = [...HOME, ...QUICK_ADD, ...HISTORY, ...RECENTLY_DELETED, ...RECORD] as const;
const REQUIRED = [...KIT_AND_MASCOT, ...ENTRY, ...SCREENS] as const;

const LOCALE_NAME: Readonly<Record<Locale, string>> = { en: 'English', th: 'Thai', vi: 'Vietnamese' };
const scriptOf = (locale: Locale) => (locale === 'th' ? 'thai' : 'latin');
const sectionTitle = (id: string) => CATALOGUE_SECTIONS.find((section) => section.id === id)?.title;
const svgWidths = (body: HTMLElement) => [...body.querySelectorAll('svg')].map((svg) => Number(svg.getAttribute('width')));
const t = (english: string, locale: Locale, values?: Record<string, string | number>) => translateCopy(english, locale, values);
/** Record rows: buttons that read "<title>, <type> ฿<amount>, …". */
const rowsIn = (body: HTMLElement) => within(body).queryAllByRole('button').filter((button) => /, [^,]+ ฿[\d,]+\.\d\d/.test(button.getAttribute('aria-label') ?? ''));
/** How RecordRow reads a row: "Food, Expense ฿65.00, saving, Cash". */
const rowName = (locale: Locale, title: string, type: 'Expense' | 'Income' | 'Transfer', amount: string, detail: string, state?: string) =>
  [title, `${t(type, locale)} ${amount}`, state ? t(state, locale) : null, detail].filter(Boolean).join(', ');
const checked = (radio: HTMLElement) => radio.getAttribute('aria-checked') === 'true';
const MONTHS: Readonly<Record<Locale, string>> = { en: 'September 2026', th: 'กันยายน 2569', vi: 'Tháng 9 năm 2026' };
const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';

/** What each section must show, beyond rendering at all. */
const SHOWS: Readonly<Record<(typeof REQUIRED)[number], (body: HTMLElement, locale: Locale) => void>> = {
  amount: (body) => {
    // goldenSeed's ฿182.00 lunch at every size, signed by type.
    expect(within(body).getAllByText('−฿182.00').length).toBeGreaterThanOrEqual(4);
    expect(within(body).getByText('+฿28,000.00')).toBeTruthy();
  },
  'amount-states': (body, locale) => {
    expect(within(body).getAllByText(translateCopy('saving…', locale)).length).toBeGreaterThan(0);
    expect(within(body).getAllByText(translateCopy('needs a look', locale)).length).toBeGreaterThan(0);
  },
  'pill-button': (body) => {
    const buttons = within(body).getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    expect(buttons.some((button) => button.getAttribute('aria-busy') === 'true')).toBe(true);
    expect(buttons.some((button) => button.getAttribute('aria-disabled') === 'true')).toBe(true);
  },
  card: (body) => { expect(body.textContent?.length).toBeGreaterThan(0); },
  'stage-header': (body, locale) => {
    expect(within(body).getAllByTestId('stage-header').length).toBeGreaterThanOrEqual(2);
    expect(within(body).getAllByRole('button', { name: translateCopy('Previous month', locale) }).length).toBeGreaterThan(0);
    expect(svgWidths(body).length).toBeGreaterThan(0);
  },
  receipt: (body) => { expect(within(body).getAllByTestId('receipt-slip').length).toBeGreaterThan(0); },
  'tab-bar': (body) => { expect(within(body).getAllByRole('tab').length).toBeGreaterThanOrEqual(4); },
  sheet: (body) => { expect(within(body).getAllByRole('button').length).toBeGreaterThanOrEqual(3); },
  'empty-state': (body) => {
    expect(within(body).getAllByRole('heading').length).toBeGreaterThan(0);
    expect(within(body).getAllByRole('button').length).toBeGreaterThan(0);
    expect(svgWidths(body)).toEqual([96]);
  },
  'empty-state-card': (body) => {
    expect(within(body).getAllByRole('heading').length).toBeGreaterThan(0);
    expect(within(body).getAllByRole('button').length).toBeGreaterThan(0);
    expect(svgWidths(body)).toEqual([56]);
  },
  'sync-banner': (body) => { expect(within(body).getAllByRole('status').length).toBeGreaterThanOrEqual(5); },
  'sync-banner-review': (body) => {
    expect(within(body).getAllByRole('status').length).toBeGreaterThanOrEqual(3);
    expect(within(body).getAllByRole('button').length).toBeGreaterThanOrEqual(3);
  },
  'undo-bar': (body, locale) => { expect(within(body).getAllByRole('button', { name: translateCopy('Undo', locale) }).length).toBeGreaterThan(0); },
  'flag-chip': (body, locale) => {
    const warning = translateCopy('Check this: {label}', locale).split('{label}')[0]!;
    const info = translateCopy('Note: {label}', locale).split('{label}')[0]!;
    const labels = [...body.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label') ?? '');
    expect(labels.some((label) => label.startsWith(warning))).toBe(true);
    expect(labels.some((label) => label.startsWith(info))).toBe(true);
  },
  'promise-list': (body) => { expect(within(body).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3); },
  'staged-progress': (body) => { expect(within(body).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4); },
  'bun-m': (body) => { expect(svgWidths(body)).toEqual(Array(12).fill(56)); },
  'bun-l-1': (body) => { expect(svgWidths(body)).toEqual(Array(6).fill(96)); },
  'bun-l-2': (body) => { expect(svgWidths(body)).toEqual(Array(6).fill(96)); },
  'speech-bubble': (body) => { expect(svgWidths(body)).toContain(32); },
  'bun-peek': (body) => { expect(svgWidths(body).length).toBeGreaterThan(0); },

  // R2b: the entry and data components.
  keypad: (body, locale) => {
    // A live sum, worked out exactly.
    expect(within(body).getByText('12.50 + 7.25')).toBeTruthy();
    expect(within(body).getByLabelText(t('Expense {amount}', locale, { amount: '฿19.75' }))).toBeTruthy();
    expect(within(within(body).getByRole('group', { name: t('Keypad', locale) })).getAllByRole('button')).toHaveLength(19);
    // A zero still says what it is, never a bare "฿0.00" (Apple's accessibility audit, R8).
    fireEvent.click(within(body).getByRole('button', { name: t('Clear', locale) }));
    fireEvent.click(within(body).getByRole('button', { name: '0' }));
    expect(within(body).getByLabelText(t('Expense {amount}', locale, { amount: '฿0.00' })).textContent).toBe('฿0.00');
  },
  'type-switch': (body, locale) => {
    const groups = within(body).getAllByRole('radiogroup', { name: t('Record type', locale) });
    expect(groups).toHaveLength(4);
    expect(checked(within(groups[0]!).getByRole('radio', { name: t('Expense', locale) }))).toBe(true);
    expect(checked(within(groups[1]!).getByRole('radio', { name: t('Income', locale) }))).toBe(true);
    expect(checked(within(groups[2]!).getByRole('radio', { name: t('Move', locale) }))).toBe(true);
    expect(within(groups[3]!).getAllByRole('radio').every((radio) => radio.getAttribute('aria-disabled') === 'true')).toBe(true);
  },
  'category-chips': (body, locale) => {
    const words = sampleWords(locale);
    expect(within(body).getAllByRole('button', { name: t('More categories', locale) })).toHaveLength(4);
    // Built-in and the person's own categories; a pick from More stays in view.
    expect(within(body).getAllByRole('radio', { name: t('Food', locale) }).length).toBeGreaterThan(0);
    expect(within(body).getAllByRole('radio', { name: words.coffee }).length).toBeGreaterThan(0);
    expect(checked(within(body).getByRole('radio', { name: words.pets }))).toBe(true);
  },
  'category-grid': (body, locale) => {
    const words = sampleWords(locale);
    const grids = within(body).getAllByRole('radiogroup', { name: t('Categories', locale) });
    expect(grids).toHaveLength(2);
    expect(within(grids[0]!).getAllByRole('radio')).toHaveLength(9);
    expect(within(grids[1]!).getAllByRole('radio')).toHaveLength(4);
    // Ten built-in drawings; the person's own categories get an initial tile.
    expect(svgWidths(body)).toHaveLength(10);
    expect(checked(within(grids[0]!).getByRole('radio', { name: words.coffee }))).toBe(true);
    expect(within(grids[0]!).getByRole('radio', { name: words.misc })).toBeTruthy();
  },
  'wallet-picker': (body, locale) => {
    const words = sampleWords(locale);
    const cash = within(body).getAllByRole('radio', { name: t('{name}, balance {amount}', locale, { name: words.cash, amount: '฿2,350.00' }) });
    expect(cash).toHaveLength(2);
    expect(checked(cash[0]!)).toBe(true);
    expect(cash[1]!.getAttribute('aria-disabled')).toBe('true');
    // An archived wallet is never offered.
    expect(within(body).queryAllByRole('radio').filter((radio) => radio.getAttribute('aria-label')?.startsWith(words.oldPurse))).toHaveLength(0);
  },
  'wallet-picker-move': (body, locale) => {
    const words = sampleWords(locale);
    expect(within(body).getAllByText(t('Choose two different wallets', locale))).toHaveLength(1);
    expect(within(body).getAllByRole('button', { name: t('Swap wallets', locale) })).toHaveLength(2);
    expect(within(body).getAllByRole('button', { name: t('Move all {amount}', locale, { amount: '฿2,350.00' }) }).length).toBeGreaterThan(0);
    expect(within(body).getByRole('button', { name: t('To {name}, balance {amount}', locale, { name: words.daily, amount: '฿18,700.00' }) })).toBeTruthy();
  },
  'date-chip': (body, locale) => {
    for (const date of ['2026-09-29', '2026-09-28', '2026-09-15', '2025-12-31']) {
      expect(within(body).getByText(dayLabel(date, CATALOGUE_TODAY, locale).text)).toBeTruthy();
    }
    // Last year's date carries its year: Buddhist era in Thai.
    expect(dayLabel('2025-12-31', CATALOGUE_TODAY, locale).text).toContain(locale === 'th' ? '2568' : '2025');
    expect(within(body).getAllByRole('button', { name: t('Next day', locale) })[0]!.getAttribute('aria-disabled')).toBe('true');
  },
  'note-field': (body, locale) => {
    expect(within(body).getByText('0 / 500')).toBeTruthy();
    const alerts = within(body).getAllByRole('alert').map((alert) => alert.textContent);
    expect(alerts).toContain(t('Use one line of up to 120 characters.', locale));
    expect(alerts).toContain(t('Check this and try again.', locale));
  },
  'record-row': (body, locale) => {
    expect(rowsIn(body)).toHaveLength(7);
    for (const state of ['saving…', 'checking…', 'needs a look']) expect(within(body).getByText(t(state, locale))).toBeTruthy();
    expect(within(body).getByText('+฿28,000.00')).toBeTruthy();
  },
  'day-header': (body, locale) => {
    const headings = within(body).getAllByRole('heading');
    expect(headings).toHaveLength(5);
    expect(headings.map((heading) => heading.getAttribute('aria-label')).join(' | ')).toContain(fullDateLabel('2025-12-31', locale));
    // Money out takes the minus sign (U+2212), as Amount does.
    expect(within(body).getByText('−฿247.00')).toBeTruthy();
    expect(within(body).getAllByText('+฿28,000.00')).toHaveLength(2);
  },
  'budget-bar': (body, locale) => {
    // budgetPace() on 21 September, ten days to go: on track, tight, over and no budget.
    expect(within(body).getAllByRole('progressbar')).toHaveLength(3);
    expect(within(body).getByText(t('{amount} a day left', locale, { amount: '฿555.00' }))).toBeTruthy();
    expect(within(body).getByText(t('{amount} a day left', locale, { amount: '฿400.00' }))).toBeTruthy();
    expect(within(body).getByText(t('It happens. {spent} of {limit} spent.', locale, { spent: '฿18,120.00', limit: '฿18,000.00' }))).toBeTruthy();
    expect(within(body).getByText(t('No budget this month', locale))).toBeTruthy();
  },
  'pace-ring': (body) => {
    const rings = within(body).getAllByRole('progressbar');
    expect(rings).toHaveLength(2);
    expect(rings.map((ring) => ring.getAttribute('aria-valuenow'))).toEqual(['69', '77']);
    expect(within(body).getByText('฿555.00')).toBeTruthy();
    expect(within(body).getByText('฿400.00')).toBeTruthy();
  },
  'pace-ring-over': (body, locale) => {
    expect(within(body).getAllByRole('progressbar')).toHaveLength(1);
    expect(within(body).getByText('฿120.00')).toBeTruthy();
    expect(within(body).getByText(t('No budget this month', locale))).toBeTruthy();
  },

  // Home: the golden month and every state, on the fakes.
  'home-ready': (body, locale) => {
    expect(within(body).getByRole('heading', { name: MONTHS[locale] })).toBeTruthy();
    expect(within(body).getByTestId('home-total').textContent).toBe(t('{spent} of {limit}', locale, { spent: '฿12,450.00', limit: '฿18,000.00' }));
    expect(within(body).getByRole('progressbar').getAttribute('aria-valuetext')).toContain('฿2,775.00');
    expect(within(body).getByLabelText(`${t('Total balance', locale)} ฿21,050.00`)).toBeTruthy();
    expect(within(body).getByText(t('Nothing logged today yet', locale))).toBeTruthy();
  },
  'home-over-budget': (body, locale) => {
    expect(within(body).getByTestId('home-total').textContent).toBe(t('{spent} of {limit}', locale, { spent: '฿12,450.00', limit: '฿10,000.00' }));
    expect(within(body).getByText(t('It happens. {spent} of {limit} spent.', locale, { spent: '฿12,450.00', limit: '฿10,000.00' }))).toBeTruthy();
    expect(within(body).getByText('฿2,450.00')).toBeTruthy();
    expect(within(body).getByTestId('home-bun-oops-kind')).toBeTruthy();
  },
  'home-no-budget': (body, locale) => {
    expect(within(body).getByTestId('home-total').textContent).toBe(t('{spent} spent this month', locale, { spent: '฿12,450.00' }));
    expect(within(body).getByText(t("Set a monthly budget to see what's left each day", locale))).toBeTruthy();
    expect(within(body).queryByRole('progressbar')).toBeNull();
  },
  'home-first-run': (body, locale) => {
    expect(within(body).getByRole('heading', { name: t('Add your first wallet', locale) })).toBeTruthy();
    // One step: the form is under the empty state, with Create wallet its one primary.
    expect(within(body).getByRole('button', { name: t('Create wallet', locale) })).toBeTruthy();
    expect(within(body).queryByRole('button', { name: t('Add a wallet', locale) })).toBeNull();
    expect(within(body).getByTestId('home-bun-hello')).toBeTruthy();
  },
  'home-offline': (body, locale) => {
    expect(within(body).getByText(t('Offline. New entries are saved on this phone.', locale))).toBeTruthy();
    expect(within(body).getByTestId('home-problem-load_failed')).toBeTruthy();
    expect(within(body).getByText(t('Saved on this device', locale))).toBeTruthy();
    expect(within(body).getByLabelText(rowName(locale, t('Food', locale), 'Expense', '฿65.00', 'Cash', 'saving'))).toBeTruthy();
  },
  'home-saving': (body, locale) => {
    expect(within(body).getByText(t('Saving 1 entry…', locale))).toBeTruthy();
    expect(within(body).getByText(t('Checking 1 entry with Jotbun before sending it again', locale))).toBeTruthy();
    expect(within(within(body).getByTestId('stage-header')).getByText(t('Waiting to sync: money out {amount}', locale, { amount: '฿65.00' }))).toBeTruthy();
    expect(within(body).getByText(t('Includes {amount} saving on this device', locale, { amount: '฿65.00' }))).toBeTruthy();
  },
  'home-needs-review': (body, locale) => {
    expect(within(body).getByText(t('Entries that need your review: {count}', locale, { count: 1 }))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Review', locale) })).toBeTruthy();
    expect(within(body).getByText(t('needs a look', locale))).toBeTruthy();
  },
  'home-upgrade': (body, locale) => {
    expect(within(body).getByTestId('home-problem-upgrade_required')).toBeTruthy();
    expect(within(body).getByText(t('Update Jotbun to keep using your diary. Nothing you saved is lost.', locale))).toBeTruthy();
    expect(within(body).getByText(t('Update Jotbun to send the entries saved on this device', locale))).toBeTruthy();
  },
  'home-signed-out': (body, locale) => {
    expect(within(body).getByTestId('home-problem-signed_out')).toBeTruthy();
    expect(within(body).getByText(t('Sign in again to see your diary.', locale))).toBeTruthy();
  },
  'home-locked': (body, locale) => {
    expect(within(body).getByText(t('Your diary is locked on this phone. Entries saved here are kept.', locale))).toBeTruthy();
    expect(within(body).getByText(t("This device's diary can't be unlocked. Entries that weren't synced can't be read.", locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Start over', locale) })).toBeTruthy();
  },

  // Quick add, each state reached the way its render test reaches it.
  'quick-add-empty': (body, locale) => {
    expect(within(body).getByRole('group', { name: t('Keypad', locale) })).toBeTruthy();
    expect(within(body).getByLabelText(t('Expense {amount}', locale, { amount: '฿0.00' }))).toBeTruthy();
    expect(checked(within(body).getByRole('radio', { name: t('Expense', locale) }))).toBe(true);
  },
  'quick-add-sum': (body, locale) => {
    expect(within(body).getByText('12.50 + 7.25')).toBeTruthy();
    expect(within(body).getByLabelText(t('Expense {amount}', locale, { amount: '฿19.75' }))).toBeTruthy();
  },
  'quick-add-categories': (_body, locale) => {
    const sheet = screen.getByRole('dialog', { name: t('Choose a category', locale) });
    const names = within(within(sheet).getByRole('radiogroup', { name: t('Categories', locale) })).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'));
    expect(names).toHaveLength(6);
    expect(names).toEqual(expect.arrayContaining(['Coffee', 'Pets', t('Travel', locale)]));
  },
  'quick-add-move': (body, locale) => {
    expect(checked(within(body).getByRole('radio', { name: t('Move', locale) }))).toBe(true);
    expect(within(body).getByLabelText(t('Transfer {amount}', locale, { amount: '฿1,500.00' }))).toBeTruthy();
    expect(within(body).getAllByText(t('Choose two different wallets', locale))).toHaveLength(1);
  },
  'quick-add-details': (body, locale) => {
    expect((within(body).getByLabelText(t('Merchant', locale)) as HTMLInputElement).value).toBe('Corner café');
    expect((within(body).getByLabelText(t('Note', locale)) as HTMLInputElement).value).toBe('Lunch with Mai');
    expect(within(body).getByRole('button', { name: t('More details', locale) }).getAttribute('aria-expanded')).toBe('true');
  },
  'quick-add-saving': (body, locale) => {
    expect(within(body).getByRole('button', { name: t('Saving…', locale) })).toBeTruthy();
    expect(within(body).queryByTestId('quick-add-saved')).toBeNull();
  },
  'quick-add-unconfirmed': (body, locale) => {
    expect(within(body).getByText(t(NOT_CONFIRMED, locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Try again', locale) })).toBeTruthy();
    expect(within(body).queryByRole('button', { name: t('Save entry', locale) })).toBeNull();
    expect(within(within(body).getByRole('group', { name: t('Keypad', locale) })).getByRole('button', { name: '1' }).getAttribute('aria-disabled')).toBe('true');
  },
  'quick-add-saved': (body, locale) => {
    const moment = within(body).getByTestId('quick-add-saved');
    expect(within(moment).getByText(t('Saved', locale))).toBeTruthy();
    expect(within(moment).getByLabelText(t('Expense {amount}', locale, { amount: '฿65.00' }))).toBeTruthy();
    // The cheer bun, at full intensity.
    expect(svgWidths(moment)).toEqual([96]);
  },
  'quick-add-copy': (body, locale) => {
    expect(within(body).getByLabelText(t('Expense {amount}', locale, { amount: '฿12,268.00' }))).toBeTruthy();
    expect(checked(within(body).getByRole('radio', { name: t('Bills', locale) }))).toBe(true);
    expect((within(body).getByLabelText(t('Note', locale)) as HTMLInputElement).value).toBe('Rent');
  },
  'quick-add-no-wallet': (body, locale) => {
    expect(within(body).getByRole('heading', { name: t('No wallets yet', locale) })).toBeTruthy();
    expect(within(body).getByText(t('Add a wallet on the home screen first.', locale))).toBeTruthy();
  },
  'quick-add-device-error': (body, locale) => {
    expect(within(body).getByText(t("Couldn't save this entry on the device. Nothing was saved.", locale))).toBeTruthy();
    expect(within(body).queryByTestId('quick-add-saved')).toBeNull();
  },

  // History, each state reached the way its render test reaches it.
  'history-month': (body, locale) => {
    expect(rowsIn(body)).toHaveLength(4);
    expect(within(body).getByLabelText(`${t('Money in', locale)} ฿28,000.00`)).toBeTruthy();
    expect(within(body).getByLabelText(`${t('Money out', locale)} ฿12,450.00`)).toBeTruthy();
  },
  'history-search': (body, locale) => {
    expect((within(body).getByLabelText(t('Search entries', locale)) as HTMLInputElement).value).toBe('rent');
    expect(rowsIn(body)).toHaveLength(1);
    expect(within(body).getByTestId('history-summary').textContent).toContain('฿12,268.00');
  },
  'history-search-thai': (body) => {
    expect(within(body).getByText('Cash · ปู่ย่า')).toBeTruthy();
    expect(within(body).queryByText('Cash · น้ำแข็ง')).toBeNull();
    expect(within(body).getByTestId('history-summary')).toBeTruthy();
  },
  'history-search-partial': (body, locale) => {
    expect(within(body).getByText(t('Only loaded entries are searched. Load more to search the rest.', locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Load more', locale) })).toBeTruthy();
  },
  'history-filters': (body, locale) => {
    for (const [group, name] of [['Type', t('Expense', locale)], ['Wallet', 'Cash'], ['Category', t('Food', locale)]] as const) {
      expect(checked(within(within(body).getByRole('radiogroup', { name: t(group, locale) })).getByRole('radio', { name }))).toBe(true);
    }
    expect(rowsIn(body).map((row) => row.getAttribute('aria-label'))).toEqual([rowName(locale, t('Food', locale), 'Expense', '฿182.00', 'Cash')]);
  },
  'history-empty': (body, locale) => {
    expect(within(body).getByText(t('No entries in this month', locale))).toBeTruthy();
    expect(within(body).getByTestId('history-empty-bun')).toBeTruthy();
  },
  'history-no-match': (body, locale) => {
    expect(within(body).getByText(t('No entries match', locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Clear filters', locale) })).toBeTruthy();
    expect(rowsIn(body)).toHaveLength(0);
  },
  'history-undo': (body, locale) => {
    expect(within(body).getByText(t('Entry deleted', locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Undo', locale) })).toBeTruthy();
    expect(rowsIn(body)).toHaveLength(3);
  },
  'history-drafts': (body, locale) => {
    expect(within(body).getByRole('button', { name: rowName(locale, t('Food', locale), 'Expense', '฿65.00', 'Cash', 'saving') })).toBeTruthy();
    expect(within(body).getByRole('button', { name: rowName(locale, t('Travel', locale), 'Expense', '฿40.00', 'Cash', 'checking') })).toBeTruthy();
    expect(within(body).getByText(t('Entries that need your review: {count}', locale, { count: 1 }))).toBeTruthy();
  },
  'history-refresh': (body, locale) => {
    expect(within(body).getByText(t('Entries changed since you opened this list.', locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Refresh', locale) })).toBeTruthy();
  },
  'history-offline': (body, locale) => {
    expect(within(body).getByText(t('Offline. New entries are saved on this phone.', locale))).toBeTruthy();
    expect(within(body).getByText(t("We couldn't load your diary.", locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: rowName(locale, t('Food', locale), 'Expense', '฿65.00', 'Cash', 'saving') })).toBeTruthy();
  },

  // Recently deleted, each state reached the way its render test reaches it.
  'recently-deleted-list': (body, locale) => {
    expect(within(body).getByRole('heading', { name: t('Recently deleted', locale) })).toBeTruthy();
    expect(within(body).getByText(t('Deleted entries can be restored for {days} days. After that, they are gone for good.', locale, { days: 30 }))).toBeTruthy();
    expect(within(body).getByText(t('{days} days left to restore', locale, { days: 21 }))).toBeTruthy();
    expect(within(body).getAllByRole('button', { name: new RegExp(`^${t('Restore', locale)} `) })).toHaveLength(2);
  },
  'recently-deleted-empty': (body, locale) => {
    expect(within(body).getByText(t('Nothing deleted in the last 30 days', locale))).toBeTruthy();
    expect(within(body).getByText(t('Deleted entries can be restored for {days} days. After that, they are gone for good.', locale, { days: 30 }))).toBeTruthy();
    expect(within(body).getByTestId('recently-deleted-empty-bun')).toBeTruthy();
  },
  'recently-deleted-restored': (body, locale) => {
    expect(within(body).getByText(t('{entry} {amount} is back in History.', locale, { entry: t('Bills', locale), amount: '฿12,268.00' }))).toBeTruthy();
    expect(within(body).getAllByRole('button', { name: new RegExp(`^${t('Restore', locale)} `) })).toHaveLength(1);
  },
  'recently-deleted-unconfirmed': (body, locale) => {
    expect(within(body).getByText(t(NOT_CONFIRMED, locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Try again', locale) })).toBeTruthy();
  },
  'recently-deleted-offline': (body, locale) => {
    expect(within(body).getByText(t('Offline. New entries are saved on this phone.', locale))).toBeTruthy();
    expect(within(body).getByText(t("We couldn't load your diary.", locale))).toBeTruthy();
    expect(within(body).getByText(t('Deleted entries can be restored for {days} days. After that, they are gone for good.', locale, { days: 30 }))).toBeTruthy();
  },

  // Record detail, each state reached the way its render test reaches it.
  'record-expense': (body, locale) => {
    const slip = within(body).getByTestId('receipt-slip');
    expect(within(slip).getByRole('heading', { name: t('Bills', locale) })).toBeTruthy();
    expect(within(slip).getByText('−฿12,268.00')).toBeTruthy();
    for (const action of ['Edit', 'Copy', 'Delete']) expect(within(body).getByRole('button', { name: t(action, locale) })).toBeTruthy();
  },
  'record-income': (body, locale) => {
    const slip = within(body).getByTestId('receipt-slip');
    expect(within(slip).getByRole('heading', { name: t('Salary', locale) })).toBeTruthy();
    expect(within(slip).getByText('+฿28,000.00')).toBeTruthy();
  },
  'record-move': (body) => {
    const slip = within(body).getByTestId('receipt-slip');
    expect(within(slip).getByText('Cash → Daily account')).toBeTruthy();
    expect(within(slip).getByText('฿1,500.00')).toBeTruthy();
  },
  'record-draft': (body, locale) => {
    expect(within(body).getByTestId('receipt-slip')).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Remove', locale) })).toBeTruthy();
    expect(within(body).queryByRole('button', { name: t('Edit', locale) })).toBeNull();
  },
  'record-edit': (body, locale) => {
    expect(within(body).getByRole('heading', { name: t('Edit entry', locale) })).toBeTruthy();
    expect(within(body).getByRole('group', { name: t('Keypad', locale) })).toBeTruthy();
    expect(within(body).getByTestId('edit-amount').textContent).toContain('12,268');
  },
  'record-conflict': (body, locale) => {
    const panel = within(body).getByTestId('conflict');
    expect(within(panel).getByText(t('This entry changed on another device.', locale))).toBeTruthy();
    expect(within(panel).getByRole('button', { name: t('Reload', locale) })).toBeTruthy();
  },
  'record-deleted': (body, locale) => {
    expect(within(body).getByText(t('This entry was deleted on another device.', locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Restore', locale) })).toBeTruthy();
  },
  'record-unconfirmed': (body, locale) => {
    expect(within(body).getByText(t(NOT_CONFIRMED, locale))).toBeTruthy();
    expect(within(body).getByRole('button', { name: t('Try again', locale) })).toBeTruthy();
    expect(within(within(body).getByRole('group', { name: t('Keypad', locale) })).getByRole('button', { name: '1' }).getAttribute('aria-disabled')).toBe('true');
  },
};

/** A screen section works its fakes and its script; this waits until it has reached its state. */
const SCREEN_PATIENCE = { timeout: 15_000 };
async function screenSettled() {
  // Only a screen is ever running; other sections (and fake-timer tests) need no wait.
  if (!screen.queryByTestId('catalogue-screen-running')) return;
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), SCREEN_PATIENCE);
}

async function open(params: CatalogueSearchParams, appLocale: Locale = 'en') {
  const view = mountInApp(<CatalogueScreen params={params} />, appLocale);
  await settle();
  await screenSettled();
  return view;
}

test('the registry has a section for every component, the mascot and every screen state, with unique ids and titles', () => {
  const ids = CATALOGUE_SECTIONS.map((section) => section.id);
  expect(ids).toEqual(expect.arrayContaining([...REQUIRED]));
  expect(new Set(ids).size).toBe(ids.length);
  for (const section of CATALOGUE_SECTIONS) {
    expect(section.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(section.title.trim().length).toBeGreaterThan(0);
  }
  expect(new Set(CATALOGUE_SECTIONS.map((section) => section.title)).size).toBe(ids.length);
});

// Every section, including ones added later, in light and dark and in each locale.
const EVERY_SECTION = [...new Set<string>([...REQUIRED, ...CATALOGUE_SECTIONS.map((section) => section.id)])];

test.each(EVERY_SECTION)('section %s renders without errors in light and dark, in en, th and vi', async (id) => {
  const title = sectionTitle(id);
  expect(title, `registered section ${id}`).toBeDefined();
  // Fakes only: no section may reach the network.
  const network = vi.spyOn(globalThis, 'fetch');
  for (const theme of THEMES) {
    for (const locale of LOCALES) {
      const errors = vi.spyOn(console, 'error');
      const view = await open({ section: id, theme, locale });
      const body = screen.getByTestId(`catalogue-section-${id}`);
      expect(body.childElementCount).toBeGreaterThan(0);
      // A screen's script reached its state rather than stopping on the way.
      expect(screen.queryByTestId('catalogue-screen-stopped'), `${id} ${theme} ${locale}: ${screen.queryByTestId('catalogue-screen-stopped')?.textContent}`).toBeNull();
      const heading = screen.getByRole('heading', { name: title });
      expect(heading.style.lineHeight).toBe(`${bunText('heading', scriptOf(locale)).lineHeight}px`);
      expect(screen.getByTestId('catalogue').style.backgroundColor).toBe(rgba(paletteFor(theme).background));
      // The header's own choices (a screen such as Settings has radios of the same names).
      const header = screen.getByTestId('catalogue-header');
      within(header).getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', checked: true });
      within(header).getByRole('radio', { name: LOCALE_NAME[locale], checked: true });
      SHOWS[id as (typeof REQUIRED)[number]]?.(body, locale);
      expect(errors, `${id} ${theme} ${locale}`).not.toHaveBeenCalled();
      errors.mockRestore();
      view.unmount();
    }
  }
  expect(network).not.toHaveBeenCalled();
}, 120_000);

test('screen sections draw the real screens on today pinned to the fixtures, edge to edge under the header', async () => {
  await open({ section: 'quick-add-empty', theme: 'light', locale: 'en' });
  const body = screen.getByTestId('catalogue-section-quick-add-empty');
  expect(within(body).getByTestId('quick-add-screen')).toBeTruthy();
  // The fixtures' today, 29 September 2026, whatever the clock says.
  expect(within(body).getByRole('button', { name: /^Pick another date, .*29 September 2026$/ })).toBeTruthy();
  expect(CATALOGUE_NOW.toISOString()).toBe('2026-09-29T03:00:00.000Z');
  // The screen fills the body: no padded catalogue scroll view around it.
  expect(body.style.flexGrow).toBe('1');
  // The header covers the status bar, so the screen pads by no top inset (12 pt is its own spacing); the bottom
  // inset is the pinned footer's, under Save.
  const page = within(body).getByTestId('quick-add-scroll').firstElementChild as HTMLElement;
  expect([page.style.paddingTop, page.style.paddingBottom]).toEqual(['12px', '12px']);
  expect(within(body).getByTestId('quick-add-footer').style.paddingBottom).toBe(`${34 + 8}px`);
  cleanup();
  await open({ section: 'home-ready', theme: 'light', locale: 'en' });
  expect(within(screen.getByTestId('catalogue-section-home-ready')).getByText('Yesterday')).toBeTruthy();
});

test('chrome=off drops the header: a screen pads by the real status-bar inset, as on a phone', async () => {
  await open({ section: 'quick-add-empty', theme: 'light', locale: 'en', chrome: 'off' });
  expect(screen.queryByRole('button', { name: 'Next section' })).toBeNull();
  const body = screen.getByTestId('catalogue-section-quick-add-empty');
  const page = within(body).getByTestId('quick-add-scroll').firstElementChild as HTMLElement;
  expect(page.style.paddingTop).toBe(`${62 + 12}px`);
  cleanup();
  await open({ section: 'card', theme: 'light', locale: 'en', chrome: 'off' });
  expect(screen.queryByRole('button', { name: 'Next section' })).toBeNull();
  expect(screen.getByTestId('catalogue-section-card')).toBeTruthy();
});

test('a load-problem state stays put for review: Try again meets the same problem', async () => {
  await open({ section: 'home-offline', theme: 'light', locale: 'en' });
  const body = screen.getByTestId('catalogue-section-home-offline');
  fireEvent.click(within(body).getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(within(body).getByTestId('home-problem-load_failed')).toBeTruthy());
  expect(within(body).getByText('Offline. New entries are saved on this phone.')).toBeTruthy();
  expect(within(body).queryByTestId('home-total')).toBeNull();
});

test('a screen script that cannot reach its state stops and says where', async () => {
  const broken = screenSection({
    id: 'broken',
    title: 'Broken',
    fixture: () => ({ resources: createFakeResources().resources, diary: null }),
    script: () => [{ press: 'No such button' }],
    stepTimeoutMs: 200,
    render: () => <QuickAddScreen now={CATALOGUE_NOW} />,
  });
  mountInApp(<>{broken.render()}</>);
  const stopped = await screen.findByTestId('catalogue-screen-stopped', {}, SCREEN_PATIENCE);
  expect(stopped.textContent).toContain('No such button');
  expect(screen.queryByTestId('catalogue-screen-running')).toBeNull();
}, 30_000);

test('a deep link opens one section in the theme and locale it names', async () => {
  await open({ section: 'receipt', theme: 'dark', locale: 'th' });
  const body = screen.getByTestId('catalogue-section-receipt');
  expect(within(body).getAllByTestId('receipt-slip').length).toBeGreaterThan(0);
  expect(screen.queryByTestId('catalogue-index')).toBeNull();
  expect(screen.queryByTestId('catalogue-section-amount')).toBeNull();
  expect(screen.getByTestId('catalogue').style.backgroundColor).toBe(rgba(paletteFor('dark').background));
  expect(within(body).getAllByTestId('receipt-slip')[0]!.style.backgroundColor).toBe(rgba(paletteFor('dark').paper));
  // Thai copy, Thai sample data and the Thai type ramp, though the app itself is in English.
  expect(within(body).getByText('กาแฟ')).toBeTruthy();
  expect(within(body).getByText('กาแฟ').style.lineHeight).toBe(`${bunText('body', 'thai').lineHeight}px`);
  screen.getByRole('radio', { name: 'Dark', checked: true });
  screen.getByRole('radio', { name: 'Thai', checked: true });
});

test('without a theme or locale the catalogue follows the app', async () => {
  await open({ section: 'undo-bar' }, 'vi');
  screen.getByRole('radio', { name: 'System', checked: true });
  screen.getByRole('radio', { name: 'Vietnamese', checked: true });
  expect(screen.getByTestId('catalogue').style.backgroundColor).toBe(rgba(paletteFor('light').background));
});

test('unknown values are ignored and a repeated param takes its first value', async () => {
  await open({ section: ['pill-button', 'receipt'], theme: 'sepia', locale: 'jp' });
  expect(screen.getByTestId('catalogue-section-pill-button')).toBeTruthy();
  screen.getByRole('radio', { name: 'System', checked: true });
  screen.getByRole('radio', { name: 'English', checked: true });
});

test('without a section the catalogue lists every section, and a tap opens one', async () => {
  await open({ theme: 'light' });
  const index = screen.getByTestId('catalogue-index');
  for (const section of CATALOGUE_SECTIONS) within(index).getByRole('button', { name: section.title });
  fireEvent.click(within(index).getByRole('button', { name: sectionTitle('receipt') }));
  expect(screen.getByTestId('catalogue-section-receipt')).toBeTruthy();
  expect(screen.queryByTestId('catalogue-index')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'All sections' }));
  expect(screen.getByTestId('catalogue-index')).toBeTruthy();
});

test('an unknown section says so and shows the list', async () => {
  await open({ section: 'nope' });
  expect(screen.getByTestId('catalogue-index')).toBeTruthy();
  expect(screen.getByText('No section called “nope”.')).toBeTruthy();
});

test('previous and next step through the sections in order and stop at the ends', async () => {
  const first = CATALOGUE_SECTIONS[0]!;
  const second = CATALOGUE_SECTIONS[1]!;
  const last = CATALOGUE_SECTIONS[CATALOGUE_SECTIONS.length - 1]!;
  await open({ section: first.id });
  expect(screen.getByRole('button', { name: 'Previous section' }).getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Next section' }));
  expect(screen.getByTestId(`catalogue-section-${second.id}`)).toBeTruthy();
  expect(screen.getByText(`2 of ${CATALOGUE_SECTIONS.length}`)).toBeTruthy();
  cleanup();
  await open({ section: last.id });
  expect(screen.getByRole('button', { name: 'Next section' }).getAttribute('aria-disabled')).toBe('true');
});

test('a tour steps through the sections on a timer and stops at the last one', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  try {
    const first = CATALOGUE_SECTIONS[0]!;
    const second = CATALOGUE_SECTIONS[1]!;
    const third = CATALOGUE_SECTIONS[2]!;
    await open({ section: first.id, tour: '1000' });
    expect(screen.getByTestId(`catalogue-section-${first.id}`)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(999); });
    expect(screen.getByTestId(`catalogue-section-${first.id}`)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByTestId(`catalogue-section-${second.id}`)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId(`catalogue-section-${third.id}`)).toBeTruthy();
    cleanup();
    // The last section is a screen, and waiting for it to settle needs real
    // timers; the tour starts once it has.
    vi.useRealTimers();
    const last = CATALOGUE_SECTIONS[CATALOGUE_SECTIONS.length - 1]!;
    const view = await open({ section: last.id });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    act(() => { view.rerenderInApp(<CatalogueScreen params={{ section: last.id, tour: '1000' }} />); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId(`catalogue-section-${last.id}`)).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test('re-opening the same link with a new run restarts the tour from its section', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  try {
    const first = CATALOGUE_SECTIONS[0]!;
    const second = CATALOGUE_SECTIONS[1]!;
    const view = await open({ section: first.id, tour: '1000', run: '1' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId(`catalogue-section-${second.id}`)).toBeTruthy();
    act(() => { view.rerenderInApp(<CatalogueScreen params={{ section: first.id, tour: '1000', run: '2' }} />); });
    expect(screen.getByTestId(`catalogue-section-${first.id}`)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId(`catalogue-section-${second.id}`)).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

// A busy JS thread delays timers, and an interval's late ticks then fire back
// to back: the E2 recording in Thai skipped sections that way. Each step waits
// a full interval after the section it leaves has rendered.
test('a late tour step never skips a section: the next step waits for the section to show', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  try {
    const second = CATALOGUE_SECTIONS[1]!;
    const third = CATALOGUE_SECTIONS[2]!;
    await open({ section: CATALOGUE_SECTIONS[0]!.id, tour: '1000' });
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByTestId(`catalogue-section-${second.id}`)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(999); });
    expect(screen.getByTestId(`catalogue-section-${second.id}`)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByTestId(`catalogue-section-${third.id}`)).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test('without a tour nothing moves on its own', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  try {
    const first = CATALOGUE_SECTIONS[0]!;
    await open({ section: first.id });
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByTestId(`catalogue-section-${first.id}`)).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test('the header switches theme and locale for the content without touching the app', async () => {
  await open({ section: 'stage-header', theme: 'light', locale: 'en' });
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(screen.getByTestId('catalogue').style.backgroundColor).toBe(rgba(paletteFor('dark').background));
  expect(screen.getAllByTestId('stage-header')[0]!.style.backgroundColor).toBe(rgba(paletteFor('dark').stage));
  fireEvent.click(screen.getByRole('radio', { name: 'Thai' }));
  expect(screen.getAllByRole('button', { name: translateCopy('Previous month', 'th') }).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
  expect(screen.getAllByTestId('stage-header')[0]!.style.backgroundColor).toBe(rgba(paletteFor('light').stage));
  // The stored theme preference is the app's own and stays unset.
  expect(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBeNull();
});

test('a new deep link while open moves to its section, theme and locale', async () => {
  const view = await open({ section: 'amount', theme: 'light', locale: 'en' });
  fireEvent.click(screen.getByRole('radio', { name: 'Vietnamese' }));
  view.rerenderInApp(<CatalogueScreen params={{ section: 'receipt', theme: 'dark', locale: 'th' }} />);
  await settle();
  expect(screen.getByTestId('catalogue-section-receipt')).toBeTruthy();
  screen.getByRole('radio', { name: 'Dark', checked: true });
  screen.getByRole('radio', { name: 'Thai', checked: true });
});

/** The open sheet: react-native-web's Modal wraps it in a dialog of its own, so take the named one. */
function openSheet(): HTMLElement {
  const named = screen.getAllByRole('dialog').filter((dialog) => dialog.hasAttribute('aria-label'));
  expect(named).toHaveLength(1);
  return named[0]!;
}

function IntensityProbe() {
  return <>{`intensity:${useBunIntensity().intensity}`}</>;
}

test('the bun control previews full, quiet and off, and leaving puts the setting back', async () => {
  const view = mountInApp(<><IntensityProbe /><CatalogueScreen params={{ section: 'speech-bubble' }} /></>);
  await settle();
  const body = () => screen.getByTestId('catalogue-section-speech-bubble');
  screen.getByRole('radio', { name: 'Full', checked: true });
  const bubbleText = body().textContent ?? '';
  expect(bubbleText.length).toBeGreaterThan(0);
  expect(svgWidths(body()).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
  await settle();
  expect(svgWidths(body())).toEqual([]);
  screen.getByRole('radio', { name: 'Off', checked: true });

  fireEvent.click(screen.getByRole('radio', { name: 'Quiet' }));
  await settle();
  // Quiet drops the bubbles; the bun peek section still shows its buns.
  expect(body().querySelectorAll('svg').length).toBe(0);
  view.rerenderInApp(<><IntensityProbe /><CatalogueScreen params={{ section: 'bun-peek' }} /></>);
  await settle();
  screen.getByRole('radio', { name: 'Quiet', checked: true });
  expect(svgWidths(screen.getByTestId('catalogue-section-bun-peek')).length).toBeGreaterThan(0);
  expect(screen.getByText('intensity:quiet')).toBeTruthy();

  // Leaving the catalogue restores the setting the person had.
  view.rerenderInApp(<IntensityProbe />);
  await settle();
  expect(screen.getByText('intensity:full')).toBeTruthy();
});

test('the sheet section opens each sheet from a button, and each closes again', async () => {
  await open({ section: 'sheet' });
  const openers = within(screen.getByTestId('catalogue-section-sheet')).getAllByRole('button');
  expect(openers.length).toBeGreaterThanOrEqual(3);
  for (const opener of openers) {
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    fireEvent.click(opener);
    await settle();
    fireEvent.click(within(openSheet()).getByRole('button', { name: 'Close' }));
    await settle();
  }
  expect(screen.queryAllByRole('dialog')).toHaveLength(0);
});

test('confirming in a confirm sheet shows it busy, then it closes', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await open({ section: 'sheet' });
    const openers = within(screen.getByTestId('catalogue-section-sheet')).getAllByRole('button');
    // The last opener is the destructive confirm: Cancel keeps the ink fill.
    fireEvent.click(openers[openers.length - 1]!);
    await settle();
    const dialog = openSheet();
    const buttons = within(dialog).getAllByRole('button').filter((button) => button.getAttribute('aria-label') !== 'Close');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = buttons.find((button) => button !== cancel)!;
    fireEvent.click(confirm);
    await settle();
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(cancel.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { vi.advanceTimersByTime(5000); });
    await settle();
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});
