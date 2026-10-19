// Screen readers (redesign R8): an automatic pass over every catalogue section,
// in English and Thai. VoiceOver and TalkBack read the accessibility tree, so
// what this checks is what they would announce:
// - every control (button, radio, checkbox, switch, link, tab, field, image) has a name to speak;
// - nothing hidden from screen readers can still take focus;
// - every screen has a heading of its own, so the rotor's headings reach it;
// - every open sheet or dialog has a name, and the same checks hold inside it.
//   A sheet is a Modal, which the web draws outside the section, so dialogs are
//   looked for in the whole document.
// It does not replace a pass on a device; it keeps the tree honest between them.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('../../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));
vi.mock('react-native-safe-area-context', () => import('./safeAreaTestStub'));
vi.mock('expo-router', () => import('./routerTestStub'));
vi.mock('expo-router/build/Route', () => import('./routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { Locale } from '@mobile/i18n/locales';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { mountInApp, settle } from './catalogueTestHarness';
import { CatalogueScreen } from './CatalogueScreen';
import { CATALOGUE_SECTIONS } from './registry';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CONTROLS = ['button', 'radio', 'checkbox', 'switch', 'link', 'tab', 'searchbox', 'textbox', 'slider', 'combobox', 'menuitem', 'spinbutton', 'img'] as const;
const FOCUSABLE = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

async function open(id: string, locale: Locale) {
  const view = mountInApp(<CatalogueScreen params={{ section: id, theme: 'light', locale }} />);
  await settle();
  if (screen.queryByTestId('catalogue-screen-running')) {
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
  }
  return view;
}

/** What a screen reader would meet with nothing to say: controls with no accessible name. */
function unnamed(body: HTMLElement): string[] {
  return CONTROLS.flatMap((role) => {
    const named = new Set(within(body).queryAllByRole(role, { name: /\S/ }));
    return within(body).queryAllByRole(role).filter((element) => !named.has(element)).map((element) => `${role}: ${element.outerHTML.slice(0, 160)}`);
  });
}

/** Elements inside an aria-hidden subtree that can still take focus. */
function hiddenButFocusable(body: HTMLElement): string[] {
  return [...body.querySelectorAll('[aria-hidden="true"]')].flatMap((hidden) => [...hidden.querySelectorAll(FOCUSABLE)]).map((element) => element.outerHTML.slice(0, 160));
}

test.each(CATALOGUE_SECTIONS.map((section) => [section.id, section] as const))('section %s: every control has a name, nothing hidden takes focus', async (id, section) => {
  for (const locale of ['en', 'th'] as const) {
    const view = await open(id, locale);
    const body = screen.getByTestId(`catalogue-section-${id}`);
    expect(unnamed(body), `${id} ${locale}`).toEqual([]);
    expect(hiddenButFocusable(body), `${id} ${locale}`).toEqual([]);
    if (section.layout === 'screen') expect(within(body).queryAllByRole('heading').length, `${id} ${locale}: a heading of its own`).toBeGreaterThan(0);
    for (const dialog of [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((element) => !body.contains(element))) {
      const name = dialog.getAttribute('aria-label') ?? '';
      expect(name.trim(), `${id} ${locale}: a dialog with a name`).not.toBe('');
      expect(unnamed(dialog), `${id} ${locale}: dialog ${name}`).toEqual([]);
      expect(hiddenButFocusable(dialog), `${id} ${locale}: dialog ${name}`).toEqual([]);
    }
    view.unmount();
  }
}, 60_000);
