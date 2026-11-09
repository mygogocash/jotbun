// Render-test support for the redesigned History and Record screens (R3).
// Test use only: nothing in the app imports this file. The real theme, copy,
// bun intensity, resources and diary contexts sit around a fake resources
// port and, optionally, the fake device diary.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { expect, vi } from 'vitest';

import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { LanguageProvider } from '@mobile/i18n/LanguageProvider';
import { resolveLocale } from '@mobile/i18n/locales';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { BUILTINS, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { OutboxCommand, OutboxState, PendingEntry } from '@mobile/storage/types';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import type { BunColors } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { DrawWholeLists } from '@mobile/ui/listWindow';

/** 29 September 2026, 10:00 in Bangkok: the golden month is the current month. */
export const NOW = new Date('2026-09-29T03:00:00Z');

export const LOCALES = ['en', 'th', 'vi'] as const;
export const MODES: readonly (readonly ['light' | 'dark', BunColors])[] = [['light', bunLight], ['dark', bunDark]];
export const MATRIX = LOCALES.flatMap((locale) => MODES.map(([mode, colors]) => ({ locale, mode, colors })));

const golden = goldenSeed();
const [FOOD, TRAVEL, BILLS, SALARY] = BUILTINS;
export const CATEGORIES = { FOOD, TRAVEL, BILLS, SALARY } as const;
export const CASH = golden.wallets[0].id;
export const DAILY = golden.wallets[1].id;
export const SALARY_ID = '0000000b-0000-4000-8000-000000000001';
export const FOOD_ID = '0000000b-0000-4000-8000-000000000002';
export const RENT = '0000000b-0000-4000-8000-000000000003';
export const MOVE = '0000000b-0000-4000-8000-000000000004';

/** The golden rows as RecordRow speaks them: title, amount, then wallet (· note). */
export const ROWS = {
  salary: 'Salary, Income ฿28,000.00, Daily account · September salary',
  food: 'Food, Expense ฿182.00, Cash',
  rent: 'Bills, Expense ฿12,268.00, Daily account · Rent',
  move: 'Transfer, Transfer ฿1,500.00, Cash → Daily account',
} as const;

/** Every record row on screen (rows are buttons that read "<title>, <type> <amount>, …"). */
export const recordRows = () => screen.queryAllByRole('button', { name: /^[^,]+, (Expense|Income|Transfer) ฿/ });

/** Sixty more September expenses, so the month needs a second page. */
export function extraRecords(count = 60): TransactionDto[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `0000000d-0000-4000-8000-${String(i).padStart(12, '0')}`, type: 'expense', amount_minor: String(100 + i), occurred_on: '2026-09-10',
    wallet_id: CASH, category_id: FOOD.id, note: null, merchant: null, deleted_at: null, version: 1,
  }));
}

/**
 * Mounts a screen in the app's contexts. happy-dom has no layout, so History's
 * virtualized list would never grow past its first items here: by default the
 * harness asks it to draw every row (`DrawWholeLists`), as a device does once
 * the person scrolls. `wholeLists: false` mounts it exactly as the app does.
 */
export function mountScreen(
  element: ReactElement,
  options: { resources: SpendV1Resources; diary?: SpendDiary | null; locale?: string; mode?: 'light' | 'dark'; wholeLists?: boolean },
) {
  const { resources, diary = null, locale = 'en', mode = 'light', wholeLists = true } = options;
  const screenElement = <SpendDiaryProvider diary={diary}>{element}</SpendDiaryProvider>;
  // The app's language choice (Settings reads it) around the test's own pinned locale.
  return render(
    <LanguageProvider device={resolveLocale(locale)}>
      <IntlProvider locale={locale}>
        <ThemeProvider>
          <ThemePreferenceOverride preference={mode}>
            <BunIntensityProvider>
              <SpendV1Provider resources={resources}>
                {wholeLists ? <DrawWholeLists>{screenElement}</DrawWholeLists> : screenElement}
              </SpendV1Provider>
            </BunIntensityProvider>
          </ThemePreferenceOverride>
        </ThemeProvider>
      </IntlProvider>
    </LanguageProvider>,
  );
}

/** The device diary's synced references for the golden account. */
export const DIARY_REFERENCES: { wallets: WalletSnapshot[]; categories: CategoryDto[] } = { wallets: golden.wallets, categories: BUILTINS };

let draftCounter = 0;
/** An expense draft on the device, in golden wallets and categories. */
export function pendingExpense(overrides: Partial<Extract<PendingEntry, { type: 'expense' | 'income' }>> = {}): PendingEntry {
  draftCounter += 1;
  return {
    id: `0000000e-0000-4000-8000-${String(draftCounter).padStart(12, '0')}`, type: 'expense', amount_minor: '6500', occurred_on: '2026-09-29',
    wallet_id: CASH, category_id: FOOD.id, note: null, merchant: null, ...overrides,
  } as PendingEntry;
}

export function outboxCommand(payload: PendingEntry, state: OutboxState = 'unsent', overrides: Partial<OutboxCommand> = {}): OutboxCommand {
  draftCounter += 1;
  return {
    commandId: `0000000f-0000-4000-8000-${String(draftCounter).padStart(12, '0')}`, accountId: 'a0000000-0000-4000-8000-000000000001', schemaVersion: 1,
    kind: 'transaction.create', payload, state, firstTransmissionAt: state === 'unsent' ? null : '2026-09-29T02:00:00.000Z',
    createdAt: `2026-09-29T02:00:${String(draftCounter % 60).padStart(2, '0')}.000Z`, ackedRevision: state === 'acknowledged' ? '9' : null, ...overrides,
  };
}

/**
 * Long-presses a row, which opens its action bar. React Native web's press
 * delay runs on fake timers for that moment only.
 */
export function openRowActions(name: string | RegExp): HTMLElement {
  const row = screen.getByRole('button', { name });
  vi.useFakeTimers();
  try {
    fireEvent.mouseDown(row, { button: 0 });
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.mouseUp(row, { button: 0 });
  } finally {
    vi.useRealTimers();
  }
  return screen.getByRole('toolbar');
}

/** Long-presses a row and picks an action from the bar it opens. */
export function rowAction(name: string | RegExp, action: 'Edit' | 'Copy' | 'Delete') {
  fireEvent.click(within(openRowActions(name)).getByRole('button', { name: action }));
}

/**
 * Matches `#RRGGBB` as the DOM reports it: `rgb(r, g, b)` or the opaque
 * `rgba(r, g, b, 1.00)` react-native-web writes for backgrounds.
 */
export function rgb(hex: string): unknown {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return expect.stringMatching(new RegExp(`^rgba?\\(${r}, ${g}, ${b}(, 1(\\.0+)?)?\\)$`));
}

/** The line height a label must have for its script, so Thai stacked marks are never clipped. */
export function leading(role: Parameters<typeof bunText>[0], locale: string): string {
  return `${bunText(role, locale === 'th' ? 'thai' : 'latin').lineHeight}px`;
}

/** Whether `node` or an ancestor hides it from assistive technology. */
export function hiddenFromScreenReaders(node: Element | null): boolean {
  for (let current = node; current; current = current.parentElement) {
    if (current.getAttribute('aria-hidden') === 'true') return true;
  }
  return false;
}
