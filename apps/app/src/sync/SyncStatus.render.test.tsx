import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
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
const spoken = vi.hoisted(() => [] as string[]);
vi.mock('./announce', () => ({ announceStatus: (text: string) => void spoken.push(text) }));

afterEach(() => cleanup());

const command = (state: OutboxCommand['state']): OutboxCommand => ({
  commandId: crypto.randomUUID(), accountId: crypto.randomUUID(), schemaVersion: 1, kind: 'transaction.create',
  payload: { id: crypto.randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-29', wallet_id: crypto.randomUUID(), category_id: crypto.randomUUID() },
  state, firstTransmissionAt: state === 'unsent' ? null : '2026-09-29T03:00:00.000Z', createdAt: '2026-09-29T03:00:00.000Z', ackedRevision: null,
});
const outcome = (status: SyncOutcome['status'], extra: Partial<SyncOutcome> = {}): SyncOutcome => ({ status, progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0, ...extra });
const view = (next: Partial<DiaryView>): DiaryView => ({ phase: 'ready', lockReason: null, outcome: null, progress: null, pending: [], outbox: [], pendingChoices: [], wallets: [], categories: [], appliedRevision: '0', ...next });

function show(next: Partial<DiaryView>, locale = 'en') {
  const onRetry = vi.fn();
  const onDiscard = vi.fn();
  mountV1(<SyncStatus view={view(next)} onRetry={onRetry} onDiscard={onDiscard} />, createFakeResources().resources, locale);
  return Object.assign(onRetry, { onDiscard });
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
  expect(screen.getByText('Checking 1 entry with Jotbun before sending it again')).toBeTruthy();
  cleanup();
  show({ outbox: [command('uncertain'), command('sending')] });
  expect(screen.getByText('Checking 2 entries with Jotbun before sending them again')).toBeTruthy();
  cleanup();
  show({ outbox: [command('needs_review'), command('needs_review')] });
  expect(screen.getByText('Entries that need your review: 2')).toBeTruthy();
  cleanup();
  show({ outbox: [command('paused_upgrade')], outcome: outcome('upgrade_required') });
  expect(screen.getByText('Update Jotbun to send the entries saved on this device')).toBeTruthy();
});

test('a locked diary asks for sign-in, or for recovery when its key is gone', () => {
  show({ phase: 'locked', lockReason: 'signed_out', outbox: [command('unsent')] });
  expect(screen.getByText('Sign in again to send the entries saved on this device')).toBeTruthy();
  cleanup();
  show({ phase: 'locked', lockReason: 'key_missing' });
  expect(screen.getByText("This device's diary can't be unlocked. Entries that weren't synced can't be read.")).toBeTruthy();
});

test('an unreachable server keeps drafts and offers a retry', () => {
  const onRetry = show({ outbox: [command('uncertain')], outcome: outcome('paused') });
  expect(screen.getByText("Couldn't reach Jotbun. Your entries stay saved on this device.")).toBeTruthy();
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

// S4 review fixes.

test('a locked diary can start over from the synced diary, only after confirming', () => {
  const shown = show({ phase: 'locked', lockReason: 'key_rejected' });
  fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
  expect(shown.onDiscard).not.toHaveBeenCalled();
  expect(screen.getByText('Starting over deletes the unreadable entries on this device. Everything already synced comes back from Jotbun.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
  expect(screen.queryByRole('button', { name: 'Delete and start over' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete and start over' }));
  expect(shown.onDiscard).toHaveBeenCalledTimes(1);
  cleanup();
  // A temporarily unavailable key store is never a reason to discard.
  show({ phase: 'locked', lockReason: 'key_unavailable' });
  expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
});

test('terms to accept and a newer diary each explain why nothing is sent', () => {
  show({ outbox: [command('unsent')], outcome: outcome('policy_required') });
  expect(screen.getByText('Review and accept the updated terms to send the entries saved on this device')).toBeTruthy();
  cleanup();
  show({ phase: 'locked', lockReason: 'schema_too_new' });
  expect(screen.getByText('Update Jotbun to open the entries saved on this device')).toBeTruthy();
});

test('a running sync shows live n of m progress', () => {
  show({ outbox: [command('sending'), command('unsent')], progress: { sent: 3, total: 10 } });
  expect(screen.getByText('Syncing 3 of 10')).toBeTruthy();
});

test('a changed status is announced once (VoiceOver ignores live regions)', () => {
  spoken.length = 0;
  const unsent = [command('unsent')];
  const control: { set?: (next: DiaryView) => void } = {};
  function Live() {
    const [current, set] = useState(view({ outbox: unsent }));
    control.set = set;
    return <SyncStatus view={current} onRetry={() => undefined} />;
  }
  mountV1(<Live />, createFakeResources().resources);
  act(() => control.set?.(view({ outbox: unsent, outcome: outcome('synced') })));
  act(() => control.set?.(view({ outbox: [...unsent, command('unsent')] })));
  expect(spoken).toEqual(['Saved on device · Waiting to sync (1)', 'Saved on device · Waiting to sync (2)']);
});
