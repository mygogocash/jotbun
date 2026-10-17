import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import type { OutboxCommand } from '@mobile/storage/types';
import { mountV1 } from '@mobile/screens/v1/renderHarness';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import type { SyncOutcome } from './types';
import { SyncStatus } from './SyncStatus';

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

afterEach(() => cleanup());

const command = (state: OutboxCommand['state']): OutboxCommand => ({
  commandId: crypto.randomUUID(), accountId: crypto.randomUUID(), schemaVersion: 1, kind: 'transaction.create',
  payload: { id: crypto.randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-29', wallet_id: crypto.randomUUID(), category_id: crypto.randomUUID() },
  state, firstTransmissionAt: state === 'unsent' ? null : '2026-09-29T03:00:00.000Z', createdAt: '2026-09-29T03:00:00.000Z', ackedRevision: null,
});
const outcome = (status: SyncOutcome['status'], extra: Partial<SyncOutcome> = {}): SyncOutcome => ({ status, progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0, ...extra });
const view = (next: Partial<DiaryView>): DiaryView => ({ phase: 'ready', lockReason: null, outcome: null, pending: [], outbox: [], ...next });

function show(next: Partial<DiaryView>, locale = 'en') {
  const onRetry = vi.fn();
  mountV1(<SyncStatus view={view(next)} onRetry={onRetry} />, createFakeResources().resources, locale);
  return onRetry;
}

test('drafts saved on the device say so, as a polite status announcement', () => {
  show({ outbox: [command('unsent'), command('unsent')] });
  const status = screen.getByRole('status');
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(screen.getByText('Saved on device · Waiting to sync (2)')).toBeTruthy();
});

test('a large backlog shows n of m progress while the server paces it', () => {
  show({ outbox: [command('unsent')], outcome: outcome('rate_limited', { progress: { sent: 60, total: 200 } }) });
  expect(screen.getByText('Syncing 60 of 200')).toBeTruthy();
});

test('uncertain, needs-review and upgrade states each explain themselves without colour alone', () => {
  show({ outbox: [command('uncertain')] });
  expect(screen.getByText('Checking 1 entries with GoGoSpend before sending them again')).toBeTruthy();
  cleanup();
  show({ outbox: [command('needs_review'), command('needs_review')] });
  expect(screen.getByText('Entries that need your review: 2')).toBeTruthy();
  cleanup();
  show({ outbox: [command('paused_upgrade')], outcome: outcome('upgrade_required') });
  expect(screen.getByText('Update GoGoSpend to send the entries saved on this device')).toBeTruthy();
});

test('a locked diary asks for sign-in, or for recovery when its key is gone', () => {
  show({ phase: 'locked', lockReason: 'signed_out', outbox: [command('unsent')] });
  expect(screen.getByText('Sign in again to send the entries saved on this device')).toBeTruthy();
  cleanup();
  show({ phase: 'locked', lockReason: 'key_missing' });
  expect(screen.getByText("This device's diary is locked. Recover it from GoGoSpend or discard it.")).toBeTruthy();
});

test('an unreachable server keeps drafts and offers a retry', () => {
  const onRetry = show({ outbox: [command('uncertain')], outcome: outcome('paused') });
  expect(screen.getByText("Couldn't reach GoGoSpend. Your entries stay saved on this device.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('nothing waiting means no banner', () => {
  show({ outcome: outcome('synced') });
  expect(screen.queryByRole('status')).toBeNull();
});

test('long Thai labels render in Thai', () => {
  show({ outbox: [command('unsent')] }, 'th');
  expect(screen.getByText('บันทึกในเครื่องแล้ว · รอซิงก์ (1)')).toBeTruthy();
});
