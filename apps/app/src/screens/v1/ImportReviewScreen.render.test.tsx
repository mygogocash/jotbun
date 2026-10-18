import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { memoryDraftStore } from '@mobile/spend/v1/importReview';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { JOB_ID, createFakeImportServer, syntheticCandidates } from '@mobile/spend/v1/testing/fakeImportServer';
import { ImportReviewScreen } from './ImportReviewScreen';
import { mountV1 } from './renderHarness';

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

afterEach(() => cleanup());

function mount(count: number, options: { locale?: string; statuses?: ('parsing' | 'ready')[] } = {}) {
  const imports = createFakeImportServer({ candidates: syntheticCandidates(count), statuses: options.statuses ?? ['ready'] });
  const store = memoryDraftStore();
  const money = createFakeResources(goldenSeed());
  mountV1(<ImportReviewScreen jobId={JOB_ID} imports={imports.resources} store={store} pollMs={1} />, money.resources, options.locale ?? 'en');
  return { imports, store };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const disabled = (name: string | RegExp) => screen.getByRole('button', { name }).getAttribute('aria-disabled') === 'true';

/** Includes and checks rows 1-2 (expenses in the file's Cash wallet, category food) and maps both labels. */
async function reviewTwoRows() {
  await screen.findByText('Nothing from this file has been saved yet. Choose the rows to save and check each one.');
  click('Include row 1');
  click('Include row 2');
  click('Row 1: date, direction, category and wallet are right');
  click('Row 2: date, direction, category and wallet are right');
  click('Cash: use Cash');
  click('food: use Food');
}

test('parsing says nothing is saved; saving needs every chosen row checked and every label mapped', async () => {
  const { imports } = mount(3, { statuses: ['parsing', 'ready'] });
  expect(await screen.findByText('Reading your file. Nothing has been saved yet.')).toBeTruthy();
  await screen.findByText('Nothing from this file has been saved yet. Choose the rows to save and check each one.');
  click('Include row 1');
  expect(disabled('Save 1 rows')).toBe(true);
  expect(screen.getByText('1 chosen rows still need checking')).toBeTruthy();
  click('Row 1: date, direction, category and wallet are right');
  expect(disabled('Save 1 rows')).toBe(true);
  click('Cash: use Cash');
  click('food: use Food');
  expect(disabled('Save 1 rows')).toBe(false);
  expect(imports.transactions()).toHaveLength(0);
  click('Save 1 rows');
  expect(await screen.findByText('Saved 1 entries from this file.')).toBeTruthy();
  expect(imports.callsOf('freeze')).toHaveLength(1);
  expect(imports.transactions()).toHaveLength(1);
});

test('a lost response keeps the review, shows committed, remaining and not-saved counts, and retries the same command', async () => {
  const { imports, store } = mount(3);
  await reviewTwoRows();
  imports.script('confirm', { kind: 'network_after' });
  click('Save 2 rows');
  expect(await screen.findByText('Not confirmed yet. Your review is kept; try again.')).toBeTruthy();
  expect(screen.getByText('Saved 0 of 2 · 2 remaining · 0 not saved')).toBeTruthy();
  expect((await store.load())?.pendingBatch).toBeTruthy();
  click('Try again');
  expect(await screen.findByText('Saved 2 entries from this file.')).toBeTruthy();
  const [first, second] = imports.callsOf('confirm');
  expect(second.key).toBe(first.key);
  expect(second.body).toEqual(first.body);
  expect(imports.transactions()).toHaveLength(2);
  expect(await store.load()).toBeNull();
});

test('changing a direction is a correction saved before anything can be saved', async () => {
  const { imports } = mount(3);
  await screen.findByText('Nothing from this file has been saved yet. Choose the rows to save and check each one.');
  click('Row 1: make it Income');
  expect(screen.getByRole('button', { name: 'Save corrections' })).toBeTruthy();
  click('Save corrections');
  await waitFor(() => expect(imports.callsOf('patchRows')).toHaveLength(1));
  expect(imports.callsOf('patchRows')[0].body).toEqual([{ source_row_id: 'row:2', type: 'income' }]);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save corrections' })).toBeNull());
  expect(imports.transactions()).toHaveLength(0);
});

test('Thai shows the draft Thai copy', async () => {
  mount(2, { locale: 'th' });
  expect(await screen.findByText('ยังไม่มีรายการจากไฟล์นี้ถูกบันทึก เลือกแถวที่ต้องการบันทึกและตรวจทีละแถว')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'ตรวจรายการที่นำเข้า' })).toBeTruthy();
  expect(BUILTINS.length).toBeGreaterThan(0);
});
