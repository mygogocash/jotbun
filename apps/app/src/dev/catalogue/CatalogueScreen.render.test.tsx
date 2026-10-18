import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. The bun and the icons draw no
// images, so that one resolver is stubbed and the real SVG elements render.
vi.mock('../../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));
// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('./safeAreaTestStub'));

import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { bunText } from '@mobile/theme/bunType';
import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';
import { LOCALES, mountInApp, paletteFor, rgba, settle, THEMES } from './catalogueTestHarness';
import { CatalogueScreen } from './CatalogueScreen';
import type { CatalogueSearchParams } from './params';
import { CATALOGUE_SECTIONS } from './registry';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/** A section for every R2a component (big ones split so each fits one screen) and the mascot. */
const REQUIRED = [
  'amount', 'amount-states', 'pill-button', 'card', 'stage-header', 'receipt', 'tab-bar', 'sheet', 'empty-state',
  'empty-state-card', 'sync-banner', 'sync-banner-review', 'undo-bar', 'flag-chip', 'promise-list', 'staged-progress',
  'bun-m', 'bun-l-1', 'bun-l-2', 'speech-bubble', 'bun-peek',
] as const;

const LOCALE_NAME: Readonly<Record<Locale, string>> = { en: 'English', th: 'Thai', vi: 'Vietnamese' };
const scriptOf = (locale: Locale) => (locale === 'th' ? 'thai' : 'latin');
const sectionTitle = (id: string) => CATALOGUE_SECTIONS.find((section) => section.id === id)?.title;
const svgWidths = (body: HTMLElement) => [...body.querySelectorAll('svg')].map((svg) => Number(svg.getAttribute('width')));

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
};

async function open(params: CatalogueSearchParams, appLocale: Locale = 'en') {
  const view = mountInApp(<CatalogueScreen params={params} />, appLocale);
  await settle();
  return view;
}

test('the registry has a section for every R2a component and the mascot, with unique ids and titles', () => {
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
  for (const theme of THEMES) {
    for (const locale of LOCALES) {
      const errors = vi.spyOn(console, 'error');
      const view = await open({ section: id, theme, locale });
      const body = screen.getByTestId(`catalogue-section-${id}`);
      expect(body.childElementCount).toBeGreaterThan(0);
      const heading = screen.getByRole('heading', { name: title });
      expect(heading.style.lineHeight).toBe(`${bunText('heading', scriptOf(locale)).lineHeight}px`);
      expect(screen.getByTestId('catalogue').style.backgroundColor).toBe(rgba(paletteFor(theme).background));
      screen.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', checked: true });
      screen.getByRole('radio', { name: LOCALE_NAME[locale], checked: true });
      SHOWS[id as (typeof REQUIRED)[number]]?.(body, locale);
      expect(errors, `${id} ${theme} ${locale}`).not.toHaveBeenCalled();
      errors.mockRestore();
      view.unmount();
    }
  }
});

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
