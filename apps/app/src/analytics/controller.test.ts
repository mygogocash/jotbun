import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAnalytics } from './bus.ts';
import { HELD_LIMIT, createAnalytics } from './controller.ts';
import type { ConsentStatus, PostHogLike, ServerAnalyticsState, ServerConsent, StoredConsent } from './controller.ts';
import { recordAnalytics } from './testing/recordAnalytics.ts';

const ACCOUNT_A = '00000000-0000-4000-8000-0000000000aa';
const ACCOUNT_B = '00000000-0000-4000-8000-0000000000bb';
const ANALYTICS_ID = 'a'.repeat(64);

type Sent = { kind: 'capture' | 'screen' | 'identify' | 'reset' | 'start' | 'stop'; name: string; properties: Record<string, unknown>; resume?: boolean };

function harness(options?: {
  replay?: boolean;
  consent?: ServerConsent;
  analyticsId?: string | null;
  weeks?: number | null;
  stored?: StoredConsent | null;
  client?: null;
}) {
  const sent: Sent[] = [];
  let stored = options?.stored ?? null;
  let failRead = false;
  let failSet = false;
  let remote: ServerAnalyticsState = {
    consent: options?.consent ?? 'unasked',
    analyticsId: options?.analyticsId === undefined ? ANALYTICS_ID : options.analyticsId,
    weeksSinceSignup: options?.weeks === undefined ? null : options.weeks,
  };
  const consentCalls: boolean[] = [];
  const client: PostHogLike | null = options?.client === null ? null : {
    capture(event, properties) { sent.push({ kind: 'capture', name: event, properties: properties ?? {} }); },
    screen(name, properties) { sent.push({ kind: 'screen', name, properties: properties ?? {} }); },
    identify(distinctId) { sent.push({ kind: 'identify', name: distinctId, properties: {} }); },
    reset() { sent.push({ kind: 'reset', name: '', properties: {} }); },
    startSessionRecording(resumeCurrent?: boolean) { sent.push({ kind: 'start', name: '', properties: {}, resume: resumeCurrent }); },
    stopSessionRecording() { sent.push({ kind: 'stop', name: '', properties: {} }); },
  };
  const analytics = createAnalytics({
    client,
    replay: options?.replay ?? true,
    store: {
      read: async () => (stored === null ? null : { ...stored }),
      write: async (value) => { stored = { ...value }; },
      erase: async () => { stored = null; },
    },
    server: {
      read: async () => {
        if (failRead) throw new Error('offline');
        return { ...remote };
      },
      setConsent: async (on) => {
        consentCalls.push(on);
        if (failSet) throw new Error('offline');
        remote = { ...remote, consent: on ? 'yes' : 'no' };
      },
    },
  });
  const of = (kind: Sent['kind']) => sent.filter((event) => event.kind === kind);
  return {
    analytics,
    sent,
    consentCalls,
    setFailRead(value: boolean) { failRead = value; },
    setFailSet(value: boolean) { failSet = value; },
    setRemote(patch: Partial<ServerAnalyticsState>) { remote = { ...remote, ...patch }; },
    stored: () => stored,
    captures: () => of('capture'),
    screens: () => of('screen'),
    identifies: () => of('identify'),
    resets: () => of('reset'),
    starts: () => of('start'),
    stops: () => of('stop'),
  };
}

test('signed out, events are held and never sent', async () => {
  const h = harness();
  assert.equal(h.analytics.status(), 'loading');
  h.analytics.track('record_started', { source: 'typed' });
  assert.equal(h.captures().length, 0);
  await h.analytics.setAccount(null);
  assert.equal(h.analytics.status(), 'signed_out');
  assert.equal(h.analytics.allowsAnalytics(), false);
  h.analytics.track('record_started', { source: 'tell_bun' });
  assert.equal(h.captures().length, 0);
});

test('events tracked before sign-in are held across the sign-in and sent after a yes', async () => {
  const h = harness();
  h.analytics.track('undo_used', { kind: 'expense' });
  h.analytics.track('undo_used', { kind: 'income' });
  h.analytics.track('undo_used', { kind: 'transfer' });
  assert.equal(h.captures().length, 0);
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'unanswered');
  assert.equal(h.captures().length, 0);
  await h.analytics.answer('yes');
  assert.deepEqual(h.captures().map((event) => event.properties.kind), ['expense', 'income', 'transfer']);
  assert.equal(h.captures()[0]?.properties.origin, 'app');
});

test('held events are dropped when another account signs in, and on no', async () => {
  const h = harness();
  h.analytics.track('undo_used', { kind: 'expense' });
  h.analytics.track('undo_used', { kind: 'income' });
  await h.analytics.setAccount(ACCOUNT_A);
  await h.analytics.setAccount(ACCOUNT_B);
  await h.analytics.answer('yes');
  assert.equal(h.captures().length, 0);

  await h.analytics.setAccount(null);
  h.setRemote({ consent: 'unasked' });
  h.analytics.track('undo_used', { kind: 'transfer' });
  await h.analytics.setAccount(ACCOUNT_A);
  await h.analytics.answer('no');
  await h.analytics.answer('yes');
  assert.equal(h.captures().length, 0);
});

test('the server\'s yes sends at once, identifies with the analytics id and starts replay', async () => {
  const h = harness({ consent: 'yes', weeks: 3 });
  h.analytics.setCommon({ app_version: '1.2.3', platform: 'ios', language: 'th', home_currency: 'THB' });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.allowsAnalytics(), true);
  assert.deepEqual(h.identifies().map((event) => event.name), [ANALYTICS_ID]);
  assert.deepEqual(h.starts().map((event) => event.resume), [false]);
  const resets = h.resets().length;
  const identifies = h.identifies().length;
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.resets().length, resets);
  assert.equal(h.identifies().length, identifies);
  h.analytics.track('record_saved', { kind: 'expense' });
  assert.deepEqual(h.captures(), [{
    kind: 'capture',
    name: 'record_saved',
    properties: {
      kind: 'expense',
      origin: 'app',
      app_version: '1.2.3',
      platform: 'ios',
      language: 'th',
      home_currency: 'THB',
      weeks_since_signup: 3,
    },
  }]);
});

test('replay never starts when it is not allowed', async () => {
  const h = harness({ consent: 'yes', replay: false, weeks: 1 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  h.analytics.track('setup_completed');
  await h.analytics.refresh();
  assert.equal(h.starts().length, 0);
  assert.equal(h.captures().length, 1);
});

test('never asked: the question is open, events wait in memory, and the identity is reset', async () => {
  const h = harness({ consent: 'unasked' });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'unanswered');
  assert.equal(h.resets().length, 2);
  assert.equal(h.identifies().length, 0);
  h.analytics.track('recap_opened');
  assert.equal(h.captures().length, 0);
  await h.analytics.answer('yes');
  assert.equal(h.captures().length, 1);
  assert.equal(h.captures()[0]?.name, 'recap_opened');
});

test('a no read at launch after an earlier yes resets the identity', async () => {
  const h = harness({
    consent: 'no',
    stored: { accountId: ACCOUNT_A, answer: 'yes', pendingServer: false },
  });
  assert.equal(h.analytics.status(), 'loading');
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'no');
  assert.equal(h.resets().length, 2);
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
  h.analytics.track('rate_overridden');
  assert.equal(h.captures().length, 0);
});

test('a no given on another phone stops this phone at its next foreground', async () => {
  const h = harness({ consent: 'yes', weeks: 4 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  const resets = h.resets().length;
  const stops = h.stops().length;
  h.setRemote({ consent: 'no' });
  await h.analytics.refresh();
  assert.equal(h.analytics.status(), 'no');
  assert.equal(h.resets().length, resets + 1);
  assert.equal(h.stops().length, stops + 1);
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
  h.analytics.track('trip_started');
  assert.equal(h.captures().length, 0);
});

test('a pending no is kept until the server has it', async () => {
  const h = harness({
    consent: 'yes',
    stored: { accountId: ACCOUNT_A, answer: 'no', pendingServer: true },
  });
  h.setFailSet(true);
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'no');
  assert.deepEqual(h.consentCalls, [false]);
  assert.equal(h.stored()?.pendingServer, true);
  assert.equal(h.identifies().length, 0);
  await h.analytics.refresh();
  assert.deepEqual(h.consentCalls, [false, false]);
  assert.equal(h.stored()?.pendingServer, true);
  assert.equal(h.analytics.status(), 'no');
  h.setFailSet(false);
  await h.analytics.refresh();
  assert.deepEqual(h.consentCalls, [false, false, false]);
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
  assert.equal(h.analytics.status(), 'no');
  h.analytics.track('albums_connected');
  assert.equal(h.captures().length, 0);
});

test('saying no stops replay and resets the identity', async () => {
  const h = harness({ consent: 'yes', weeks: 1 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.starts().length, 1);
  const resets = h.resets().length;
  const stops = h.stops().length;
  await h.analytics.answer('no');
  assert.equal(h.analytics.status(), 'no');
  assert.equal(h.resets().length, resets + 1);
  assert.equal(h.stops().length, stops + 1);
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
  h.analytics.track('recap_opened');
  assert.equal(h.captures().length, 0);
  assert.equal(h.analytics.allowsAnalytics(), false);
});

test('a no from another phone is not asked again on this one', async () => {
  const seen: ConsentStatus[] = [];
  const h = harness({ consent: 'no' });
  const stop = h.analytics.subscribe(() => { seen.push(h.analytics.status()); });
  await h.analytics.setAccount(ACCOUNT_A);
  stop();
  assert.equal(h.analytics.status(), 'no');
  assert.equal(seen.includes('unanswered'), false);
  assert.equal(h.stored()?.answer, 'no');
});

test('a yes the server could not save rejects and changes nothing', async () => {
  const h = harness({ consent: 'unasked' });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'unanswered');
  const stored = h.stored();
  const sent = h.sent.length;
  h.setFailSet(true);
  await assert.rejects(() => h.analytics.answer('yes'));
  assert.equal(h.analytics.status(), 'unanswered');
  assert.deepEqual(h.stored(), stored);
  assert.equal(h.sent.length, sent);
  assert.deepEqual(h.consentCalls, [true]);
  h.analytics.track('ask_bun_asked');
  assert.equal(h.captures().length, 0);
});

test('offline with nothing known waits, then asks', async () => {
  const h = harness({ consent: 'unasked' });
  h.setFailRead(true);
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'loading');
  h.analytics.track('widget_added', { widget_size: 'small' });
  assert.equal(h.captures().length, 0);
  h.setFailRead(false);
  await h.analytics.refresh();
  assert.equal(h.analytics.status(), 'unanswered');
  assert.equal(h.captures().length, 0);
  await h.analytics.answer('yes');
  assert.equal(h.captures().length, 1);
  assert.equal(h.captures()[0]?.name, 'widget_added');
  assert.equal(h.captures()[0]?.properties.widget_size, 'small');
});

test('the held events stop at 50, oldest first out', async () => {
  const h = harness({ consent: 'yes' });
  for (let n = 1; n <= 60; n += 1) h.analytics.track('sync_failed', { retry_count: n });
  await h.analytics.setAccount(ACCOUNT_A);
  const captured = h.captures();
  assert.equal(captured.length, 50);
  assert.equal(captured[0]?.properties.retry_count, 11);
  assert.equal(captured[49]?.properties.retry_count, 60);
  assert.equal(HELD_LIMIT, 50);
});

test('screens are sent only as patterns and only after yes', async () => {
  const h = harness({ consent: 'yes', weeks: 3 });
  h.analytics.setCommon({ app_version: '1.2.3', platform: 'ios', language: 'en', home_currency: 'THB', ai_enabled: false });
  h.analytics.screen(['spend', 'record', '[id]']);
  assert.equal(h.screens().length, 0);
  await h.analytics.setAccount(ACCOUNT_A);
  h.analytics.screen(['spend', 'record', '[id]']);
  assert.equal(h.screens().length, 1);
  assert.equal(h.screens()[0]?.name, '/spend/record/[id]');
  assert.deepEqual(h.screens()[0]?.properties, {
    origin: 'app',
    app_version: '1.2.3',
    platform: 'ios',
    language: 'en',
    home_currency: 'THB',
    ai_enabled: false,
    weeks_since_signup: 3,
  });
  h.analytics.screen(['(tabs)', 'settings']);
  assert.equal(h.screens()[1]?.name, '/settings');
  h.analytics.screen([]);
  assert.equal(h.screens()[2]?.name, '/');
  const before = h.screens().length;
  h.analytics.screen(['spend', 'record', '0b3f2c1e-6a4d-4f6e-9a51-2f3c4d5e6f70']);
  h.analytics.screen(['spend', 'recap', '2026-10']);
  h.analytics.screen(['ค่าเช่า']);
  assert.equal(h.screens().length, before);
});

test('without an analytics id the person stays anonymous, and a later refresh identifies them', async () => {
  const h = harness({ consent: 'yes', analyticsId: null, weeks: 2 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  assert.equal(h.identifies().length, 0);
  h.analytics.track('cashback_card_tapped');
  assert.equal(h.captures().length, 1);
  h.setRemote({ analyticsId: 'b'.repeat(64) });
  await h.analytics.refresh();
  assert.deepEqual(h.identifies().map((event) => event.name), ['b'.repeat(64)]);
  assert.equal(h.starts().length, 1);
});

test('a stored yes with the server unreachable enters yes without an identity', async () => {
  const h = harness({
    consent: 'yes',
    stored: { accountId: ACCOUNT_A, answer: 'yes', pendingServer: false },
    weeks: 2,
  });
  h.setFailRead(true);
  assert.equal(h.analytics.status(), 'loading');
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  assert.equal(h.identifies().length, 0);
  assert.equal(h.analytics.allowsAnalytics(), true);
  h.setFailRead(false);
  await h.analytics.refresh();
  assert.deepEqual(h.identifies().map((event) => event.name), [ANALYTICS_ID]);
  assert.equal(h.starts().length, 1);
});

test('without a client, nothing is sent and consent still resolves', async () => {
  const h = harness({ consent: 'yes', client: null });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  h.analytics.track('undo_used', { kind: 'expense' });
  h.analytics.screen(['spend']);
  assert.equal(h.sent.length, 0);
});

test('recordAnalytics installs a consented recorder and restores the previous one', async () => {
  assert.equal(getAnalytics(), null);
  const { analytics, sent, restore } = await recordAnalytics();
  try {
    assert.equal(analytics.status(), 'yes');
    assert.equal(getAnalytics(), analytics);
    assert.equal(sent.length, 0);
    analytics.track('undo_used', { kind: 'expense' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.kind, 'capture');
    assert.equal(sent[0]?.name, 'undo_used');
    assert.equal(sent[0]?.properties.kind, 'expense');
  } finally {
    restore();
  }
  assert.equal(getAnalytics(), null);
});
