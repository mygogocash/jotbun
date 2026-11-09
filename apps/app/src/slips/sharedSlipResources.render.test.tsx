// 1D-T6's m4 (followups): the slip calls go over the one shared transport, so
// each carries X-GoGoSpend-Analytics: off unless this phone's answer is yes.
// The slip read is the call pinned here: it can lead to the server's
// slip_scan_finished (P4-T6). An account update's new command id comes from
// expo-crypto, loaded when the update is sent.
import { Platform } from 'react-native';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';

// Metro defines __DEV__; the shared transport reads it for the LAN rule.
vi.hoisted(() => { (globalThis as { __DEV__?: boolean }).__DEV__ = false; });
vi.mock('expo-application', () => ({ nativeApplicationVersion: '1.2.3' }));
vi.mock('expo-crypto', () => ({ digestStringAsync: async () => '', randomUUID: () => '7a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));

import { getAnalytics, setAnalytics } from '@mobile/analytics/bus';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { getSharedSlipResources } from '@mobile/api/sharedV1';
import { setSession } from '@mobile/auth/session';
import type { SlipAccountDto, SlipBatchRequest, SlipBatchResult } from '@gogospend/contracts';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const SLIP_ACCOUNT: SlipAccountDto = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', version: 2, bank: 'kbank', account_last4: '1234', wallet_id: null, open_drafts: 0 };
const BATCH: SlipBatchRequest = { purpose: 'live', last: false, today: '2026-11-09', locale: 'th', slips: [{ ref_hash: 'c4f3b6c8f15a0e588cfdb0a59d02f281e28eae69f0a3f8b22d6bda69f7ec1493', image_base64: '/9j/4AAQSkZJRg==', media_type: 'image/jpeg', album: null, origin: 'share' }] };
const ANSWER: SlipBatchResult = { results: [], uses_left: { live: 9, backfill: 500 }, retry_after_seconds: null };
afterAll(() => { delete (globalThis as { __DEV__?: boolean }).__DEV__; });
const sent: { method: string; path: string; headers: Record<string, string> }[] = [];
const os = Platform.OS;

beforeEach(() => {
  sent.length = 0;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    sent.push({ method: init.method ?? 'GET', path, headers: { ...(init.headers as Record<string, string>) } });
    const body = path === '/v1/slips' ? ANSWER : SLIP_ACCOUNT;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
  setAnalytics(null);
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
});

test("slip calls carry X-GoGoSpend-Analytics: off unless this phone's answer is yes, over the one shared transport", async () => {
  expect(getAnalytics()).toBeNull();
  const slips = getSharedSlipResources();
  expect(getSharedSlipResources()).toBe(slips);
  await slips.read(BATCH);
  const { analytics } = await recordAnalytics();
  expect(analytics.allowsAnalytics()).toBe(true);
  await slips.read(BATCH);
  await analytics.answer('no');
  await slips.read(BATCH);
  await slips.updateAccount(SLIP_ACCOUNT.id, 1, null);
  expect(sent.map((request) => [request.method, request.path, request.headers['X-GoGoSpend-Analytics'] ?? null])).toEqual([
    ['POST', '/v1/slips', 'off'],
    ['POST', '/v1/slips', null],
    ['POST', '/v1/slips', 'off'],
    ['PUT', `/v1/slip-accounts/${SLIP_ACCOUNT.id}`, 'off'],
  ]);
  expect([sent[3].headers['Idempotency-Key'], sent[3].headers['If-Match']]).toEqual(['7a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', '"1"']);
});
