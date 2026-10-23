import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));

import type { TransactionDto } from '@gogospend/contracts';

import { V1Error } from '@mobile/api/client';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';

import { mountScreen } from '../HistoryTestHarness';
import { CashbackCard } from './CashbackCard';
import { CASHBACK_DECLINED_KEY } from './cashbackDecline';

installBrowserStorage();
afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

let n = 0;
const bought = (merchant: string): TransactionDto => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, type: 'expense', amount_minor: '29900', occurred_on: '2026-10-11',
  wallet_id: '11111111-1111-4111-8111-111111111111', category_id: '33333333-3333-4333-8333-333333333333', merchant, note: null, deleted_at: null, version: 1,
});
const records = [bought('Shopee 11.11'), bought('Shopee'), bought('Lazada'), bought('ข้าวมันไก่')];

function mount(ai: ReturnType<typeof fakeAiResources>, daysLogged = 9, open = vi.fn()) {
  mountScreen(<AiCompanionProvider resources={ai.resources}><CashbackCard records={records} daysLogged={daysLogged} open={open} /></AiCompanionProvider>, { resources: createFakeResources().resources });
  return open;
}

test('asks once before showing tips; Show me turns them on', async () => {
  const ai = fakeAiResources();
  mount(ai);
  expect(await screen.findByText('3 purchases this month were at shops where GoGoCash gives cashback.')).toBeTruthy();
  expect(screen.getByText('Shopee ×2 · Lazada')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
  await waitFor(() => expect(ai.resources.setPreferences).toHaveBeenCalledWith({ cashback_tips: true }));
  expect(await screen.findByRole('button', { name: 'Open GoGoCash' })).toBeTruthy();
});

test('No thanks is remembered on this phone and the card goes away', async () => {
  mount(fakeAiResources());
  fireEvent.click(await screen.findByRole('button', { name: 'No thanks' }));
  await waitFor(() => expect(screen.queryByTestId('cashback-card')).toBeNull());
  expect(window.localStorage.getItem(CASHBACK_DECLINED_KEY)).toBe('1');
});

test('with tips on, Open GoGoCash opens the home page with no diary data, and Why says what happens', async () => {
  const open = mount(fakeAiResources({}, { cashback_tips: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open GoGoCash' }));
  expect(open).toHaveBeenCalledWith('https://gogocash.co');
  fireEvent.click(screen.getByRole('button', { name: 'Why am I seeing this?' }));
  expect(await screen.findByText('The comparing happens on your phone. Nothing from your diary is sent to GoGoCash or anyone else.')).toBeTruthy();
});

test('nothing before 7 logged days, and nothing while the bridge is off on the server', async () => {
  const ai = fakeAiResources({}, { cashback_tips: true });
  mount(ai, 6);
  await waitFor(() => expect(ai.resources.cashbackCatalogue).toHaveBeenCalled());
  expect(screen.queryByTestId('cashback-card')).toBeNull();
  cleanup();
  const off = fakeAiResources({ cashbackCatalogue: vi.fn(async () => { throw new V1Error('not_found', 404, 'NOT_FOUND'); }) }, { cashback_tips: true });
  mount(off);
  await waitFor(() => expect(off.resources.cashbackCatalogue).toHaveBeenCalled());
  expect(screen.queryByTestId('cashback-card')).toBeNull();
});
