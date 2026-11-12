import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAnalytics } from './bus.ts';
import { AccountChangedError, HELD_LIMIT, createAnalytics } from './controller.ts';
import type { ConsentStatus, PostHogLike, ServerAnalyticsState, ServerConsent, StoredConsent } from './controller.ts';
import { recordAnalytics } from './testing/recordAnalytics.ts';

const ACCOUNT_A = '00000000-0000-4000-8000-0000000000aa';
const ACCOUNT_B = '00000000-0000-4000-8000-0000000000bb';
const ANALYTICS_ID = 'a'.repeat(64);

/** Lets every pending promise step run. */
const settle = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

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
  let failWrite = false;
  let failErase = false;
  let holdSet = false;
  let holdYes = false;
  let holdNo = false;
  let heldNo: (() => void) | null = null;
  const heldSets: Array<() => void> = [];
  const heldWrites: Array<() => void> = [];
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
      write: async (value) => {
        if (holdYes && value.answer === 'yes') await new Promise<void>((resolve) => { heldWrites.push(resolve); });
        if (holdNo && value.answer === 'no') {
          holdNo = false;
          await new Promise<void>((resolve) => { heldNo = resolve; });
        }
        if (failWrite) throw new Error('store unavailable');
        stored = { ...value };
      },
      erase: async () => {
        if (failErase) throw new Error('store unavailable');
        stored = null;
      },
    },
    server: {
      read: async () => {
        if (failRead) throw new Error('offline');
        return { ...remote };
      },
      setConsent: async (on) => {
        consentCalls.push(on);
        if (holdSet) await new Promise<void>((resolve) => { heldSets.push(resolve); });
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
    setFailWrite(value: boolean) { failWrite = value; },
    setFailErase(value: boolean) { failErase = value; },
    holdSetConsent(value: boolean) { holdSet = value; },
    holdYesWrites(value: boolean) { holdYes = value; },
    /** Holds the next write of a no until releaseNoWrite(). */
    holdNextNoWrite() { holdNo = true; },
    releaseNoWrite() {
      heldNo?.();
      heldNo = null;
    },
    /** Lets every held setConsent call land, the newest first, until none is left. */
    async landSetConsentNewestFirst() {
      for (;;) {
        await settle();
        const land = heldSets.pop();
        if (land === undefined) return;
        land();
      }
    },
    /** Lets every held yes write finish, oldest first. */
    async releaseYesWrites() {
      for (;;) {
        const release = heldWrites.shift();
        if (release === undefined) return;
        release();
        await settle();
      }
    },
    remoteConsent: () => remote.consent,
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
  // The screen on display when the answer turns yes is sent then (1D-T6's review, m3).
  await h.analytics.setAccount(ACCOUNT_A);
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

test('the screen on display when the answer turns yes is sent then, once, and only when it has a pattern', async () => {
  const h = harness({ consent: 'unasked' });
  h.analytics.screen(['(tabs)', 'settings', 'privacy']);
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'unanswered');
  assert.equal(h.screens().length, 0);
  await h.analytics.answer('yes');
  assert.deepEqual(h.screens().map((event) => event.name), ['/settings/privacy']);
  // Already yes: a refresh is not a new screen.
  await h.analytics.refresh();
  assert.equal(h.screens().length, 1);
  // A screen whose route holds a real value has no pattern, so turning yes again sends nothing for it.
  h.analytics.screen(['spend', 'record', '0b3f2c1e-6a4d-4f6e-9a51-2f3c4d5e6f70']);
  await h.analytics.answer('no');
  await h.analytics.answer('yes');
  assert.equal(h.screens().length, 1);
  h.analytics.screen(['(tabs)', 'home']);
  await h.analytics.answer('no');
  await h.analytics.answer('yes');
  assert.deepEqual(h.screens().map((event) => event.name), ['/settings/privacy', '/home', '/home']);
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

test('a no from the server stops capture before this phone stores it', async () => {
  const h = harness({ consent: 'yes', weeks: 1 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  const resets = h.resets().length;
  const stops = h.stops().length;
  h.setRemote({ consent: 'no' });
  h.setFailWrite(true);
  await h.analytics.refresh().catch(() => undefined);
  assert.equal(h.analytics.status(), 'no');
  assert.equal(h.resets().length, resets + 1);
  assert.equal(h.stops().length, stops + 1);
  h.analytics.track('trip_started');
  assert.equal(h.captures().length, 0);
});

test('an answer gone from the server stops capture before this phone erases its own', async () => {
  const h = harness({ consent: 'yes', weeks: 1 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  const resets = h.resets().length;
  const stops = h.stops().length;
  h.setRemote({ consent: 'unasked' });
  h.setFailErase(true);
  await h.analytics.refresh().catch(() => undefined);
  assert.equal(h.analytics.status(), 'unanswered');
  assert.equal(h.resets().length, resets + 1);
  assert.equal(h.stops().length, stops + 1);
  h.analytics.track('trip_started');
  assert.equal(h.captures().length, 0);
});

test('a yes still on its way cannot outlast a later no at the server', async () => {
  const h = harness({ consent: 'unasked' });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'unanswered');
  h.holdSetConsent(true);
  const saidYes = h.analytics.answer('yes');
  await settle();
  assert.deepEqual(h.consentCalls, [true]);
  const saidNo = h.analytics.answer('no');
  assert.equal(h.analytics.status(), 'no');
  await h.landSetConsentNewestFirst();
  await saidYes;
  await saidNo;
  assert.equal(h.remoteConsent(), 'no');
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
  h.holdSetConsent(false);
  await h.analytics.refresh();
  assert.equal(h.analytics.status(), 'no');
  h.analytics.track('trip_started');
  assert.equal(h.captures().length, 0);
});

test('a yes being stored when the person says no cannot replace the no', async () => {
  const h = harness({ consent: 'yes', weeks: 1 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  h.holdYesWrites(true);
  const refreshing = h.analytics.refresh();
  await settle();
  h.setFailSet(true);
  const saidNo = h.analytics.answer('no');
  assert.equal(h.analytics.status(), 'no');
  await settle();
  h.holdYesWrites(false);
  await h.releaseYesWrites();
  await refreshing;
  await saidNo;
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: true });
  h.setFailSet(false);
  await h.analytics.refresh();
  assert.equal(h.analytics.status(), 'no');
  assert.equal(h.remoteConsent(), 'no');
  h.analytics.track('trip_started');
  assert.equal(h.captures().length, 0);
});

test('a foreground refresh waiting behind a yes cannot undo a later no', async () => {
  const h = harness({ consent: 'unasked' });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'unanswered');
  h.holdSetConsent(true);
  const saidYes = h.analytics.answer('yes');
  await settle();
  const refreshing = h.analytics.refresh();
  const saidNo = h.analytics.answer('no');
  assert.equal(h.analytics.status(), 'no');
  await h.landSetConsentNewestFirst();
  await saidYes;
  await refreshing;
  await saidNo;
  assert.equal(h.analytics.status(), 'no');
  assert.equal(h.remoteConsent(), 'no');
  h.analytics.track('trip_started');
  assert.equal(h.captures().length, 0);
});

/**
 * Two accounts on one phone. Each server call acts for whoever holds the session
 * when the call is made, as the shared v1 transport does (1D-T6).
 */
function sessions(initial: Record<string, ServerConsent>) {
  const consent: Record<string, ServerConsent> = { ...initial };
  const offline = new Set<string>();
  let session: string | null = null;
  let stored: StoredConsent | null = null;
  const sent: string[] = [];
  const serverLog: string[] = [];
  let readsHeld = false;
  let setsHeld = false;
  const heldReads: Array<() => void> = [];
  const heldSets: Array<() => void> = [];
  const label = (id: string) => (id === ACCOUNT_A ? 'A' : 'B');
  const client: PostHogLike = {
    capture(event) { sent.push(`capture:${event}`); },
    screen(name) { sent.push(`screen:${name}`); },
    identify(distinctId) { sent.push(`identify:${distinctId === ANALYTICS_ID ? 'A' : 'B'}`); },
    reset() { sent.push('reset'); },
    startSessionRecording() { sent.push('start'); },
    stopSessionRecording() { sent.push('stop'); },
  };
  const analytics = createAnalytics({
    client,
    replay: true,
    store: {
      read: async () => (stored === null ? null : { ...stored }),
      write: async (value) => { stored = { ...value }; },
      erase: async () => { stored = null; },
    },
    server: {
      read: async () => {
        const who = session;
        if (readsHeld) await new Promise<void>((resolve) => { heldReads.push(resolve); });
        if (who === null || offline.has(who)) throw new Error('offline');
        if (session !== who) throw new Error('session changed');
        return { consent: consent[who] ?? 'unasked', analyticsId: who === ACCOUNT_A ? ANALYTICS_ID : 'b'.repeat(64), weeksSinceSignup: 1 };
      },
      setConsent: async (on) => {
        const who = session;
        if (who === null) throw new Error('signed out');
        if (setsHeld) await new Promise<void>((resolve) => { heldSets.push(resolve); });
        consent[who] = on ? 'yes' : 'no';
        serverLog.push(`${label(who)}:${on ? 'yes' : 'no'}`);
      },
    },
  });
  /** Lets every held call finish, oldest first. */
  async function release(held: Array<() => void>) {
    for (;;) {
      await settle();
      const next = held.shift();
      if (next === undefined) return;
      next();
    }
  }
  return {
    analytics,
    sent,
    serverLog,
    consent: (id: string) => consent[id] ?? 'unasked',
    stored: () => stored,
    signIn(id: string | null) { session = id; },
    setOffline(id: string) { offline.add(id); },
    holdReads() { readsHeld = true; },
    holdSetConsent() { setsHeld = true; },
    async releaseReads() { readsHeld = false; await release(heldReads); },
    async releaseSetConsent() { setsHeld = false; await release(heldSets); },
    /** What the client was asked to do since `mark`, without the resets and stops of an account change. */
    since: (mark: number) => sent.slice(mark).filter((item) => item !== 'reset' && item !== 'stop'),
  };
}

test('a yes waiting behind another call is refused once another account has signed in', async () => {
  const s = sessions({ [ACCOUNT_A]: 'unasked', [ACCOUNT_B]: 'unasked' });
  s.signIn(ACCOUNT_A);
  await s.analytics.setAccount(ACCOUNT_A);
  assert.equal(s.analytics.status(), 'unanswered');
  s.holdReads();
  const refreshing = s.analytics.refresh().catch(() => undefined);
  await settle();
  const saidYes = s.analytics.answer('yes').then(() => 'resolved', (error: unknown) => (error instanceof AccountChangedError ? 'refused' : 'rejected'));
  s.signIn(null);
  await s.analytics.setAccount(null);
  s.signIn(ACCOUNT_B);
  const mark = s.sent.length;
  const signedInB = s.analytics.setAccount(ACCOUNT_B);
  await s.releaseReads();
  await refreshing;
  await signedInB;
  assert.deepEqual(s.serverLog, []);
  assert.equal(await saidYes, 'refused');
  assert.equal(s.consent(ACCOUNT_B), 'unasked');
  assert.equal(s.analytics.status(), 'unanswered');
  assert.equal(s.stored(), null);
  s.analytics.track('trip_started');
  assert.deepEqual(s.since(mark), []);
});

test('a yes on its way when another account signs in is never stored or applied for the next one', async () => {
  const s = sessions({ [ACCOUNT_A]: 'unasked', [ACCOUNT_B]: 'unasked' });
  s.setOffline(ACCOUNT_B);
  s.signIn(ACCOUNT_A);
  await s.analytics.setAccount(ACCOUNT_A);
  assert.equal(s.analytics.status(), 'unanswered');
  s.holdSetConsent();
  const saidYes = s.analytics.answer('yes').then(() => 'resolved', () => 'rejected');
  await settle();
  s.signIn(null);
  await s.analytics.setAccount(null);
  s.signIn(ACCOUNT_B);
  const mark = s.sent.length;
  const signedInB = s.analytics.setAccount(ACCOUNT_B);
  await s.releaseSetConsent();
  await saidYes;
  await signedInB;
  assert.deepEqual(s.serverLog, ['A:yes']);
  assert.equal(s.stored(), null);
  assert.equal(s.analytics.status(), 'loading');
  s.analytics.track('trip_started');
  assert.deepEqual(s.since(mark), []);
});

test('a yes still waiting when the person says no is never sent', async () => {
  const s = sessions({ [ACCOUNT_A]: 'unasked' });
  s.signIn(ACCOUNT_A);
  await s.analytics.setAccount(ACCOUNT_A);
  assert.equal(s.analytics.status(), 'unanswered');
  s.holdReads();
  const refreshing = s.analytics.refresh();
  await settle();
  const mark = s.sent.length;
  const saidYes = s.analytics.answer('yes');
  const saidNo = s.analytics.answer('no');
  assert.equal(s.analytics.status(), 'no');
  await s.releaseReads();
  await refreshing;
  await saidYes;
  await saidNo;
  assert.deepEqual(s.serverLog, ['A:no']);
  assert.equal(s.analytics.status(), 'no');
  assert.deepEqual(s.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
  s.analytics.track('trip_started');
  assert.deepEqual(s.since(mark), []);
});

test('a refresh after a yes does not keep the yes from the server', async () => {
  const s = sessions({ [ACCOUNT_A]: 'unasked' });
  s.signIn(ACCOUNT_A);
  await s.analytics.setAccount(ACCOUNT_A);
  assert.equal(s.analytics.status(), 'unanswered');
  s.holdReads();
  const first = s.analytics.refresh();
  await settle();
  const mark = s.sent.length;
  const saidYes = s.analytics.answer('yes');
  const second = s.analytics.refresh();
  await s.releaseReads();
  await first;
  await saidYes;
  await second;
  assert.deepEqual(s.serverLog, ['A:yes']);
  assert.equal(s.analytics.status(), 'yes');
  assert.deepEqual(s.stored(), { accountId: ACCOUNT_A, answer: 'yes', pendingServer: false });
  assert.deepEqual(s.since(mark), ['identify:A', 'start']);
});

test('a no given while a refresh is on its way is stored at once', async () => {
  const s = sessions({ [ACCOUNT_A]: 'yes' });
  s.signIn(ACCOUNT_A);
  await s.analytics.setAccount(ACCOUNT_A);
  assert.equal(s.analytics.status(), 'yes');
  s.holdReads();
  const refreshing = s.analytics.refresh();
  await settle();
  const saidNo = s.analytics.answer('no');
  await settle();
  // The refresh's read is still on its way: the app could be closed now and keep the no.
  assert.equal(s.analytics.status(), 'no');
  assert.deepEqual(s.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: true });
  assert.deepEqual(s.serverLog, []);
  await s.releaseReads();
  await refreshing;
  await saidNo;
  assert.deepEqual(s.serverLog, ['A:no']);
  assert.deepEqual(s.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
  assert.equal(s.analytics.status(), 'no');
});

test('the no stored at the call lands before the queue writes and sends it', async () => {
  const h = harness({ consent: 'yes', weeks: 1 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  h.holdNextNoWrite();
  const saidNo = h.analytics.answer('no');
  await settle();
  assert.equal(h.analytics.status(), 'no');
  // Nothing is sent or written behind a no that is still being stored.
  assert.deepEqual(h.consentCalls, []);
  h.releaseNoWrite();
  await saidNo;
  assert.deepEqual(h.consentCalls, [false]);
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
});

test('a yes waiting while the same account signs out and in again is still sent for it', async () => {
  const s = sessions({ [ACCOUNT_A]: 'unasked' });
  s.signIn(ACCOUNT_A);
  await s.analytics.setAccount(ACCOUNT_A);
  assert.equal(s.analytics.status(), 'unanswered');
  s.holdReads();
  const refreshing = s.analytics.refresh().catch(() => undefined);
  await settle();
  const saidYes = s.analytics.answer('yes');
  s.signIn(null);
  await s.analytics.setAccount(null);
  s.signIn(ACCOUNT_A);
  const signedInAgain = s.analytics.setAccount(ACCOUNT_A);
  await s.releaseReads();
  await refreshing;
  await saidYes;
  await signedInAgain;
  // It is that account's own answer: sent once, then read back by the new sign-in.
  assert.deepEqual(s.serverLog, ['A:yes']);
  assert.equal(s.analytics.status(), 'yes');
  assert.deepEqual(s.stored(), { accountId: ACCOUNT_A, answer: 'yes', pendingServer: false });
});

// 1D-T8: Privacy's "stopped on this phone" caption reads whether the no in force has reached the server.
test('a no is pending from the call until the server takes it, and listeners hear when it lands', async () => {
  const h = harness({ consent: 'yes' });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.pendingNo(), false);
  h.setFailSet(true);
  const saidNo = h.analytics.answer('no');
  // In force at the call, before the server is asked.
  assert.equal(h.analytics.status(), 'no');
  assert.equal(h.analytics.pendingNo(), true);
  await saidNo;
  // The server could not be reached: still pending, and stored so.
  assert.equal(h.analytics.pendingNo(), true);
  assert.equal(h.stored()?.pendingServer, true);
  let told = 0;
  const stop = h.analytics.subscribe(() => { told += 1; });
  h.setFailSet(false);
  await h.analytics.refresh();
  stop();
  // The next refresh sends it: the status stays no, and the change is heard.
  assert.equal(h.analytics.status(), 'no');
  assert.equal(h.analytics.pendingNo(), false);
  assert.equal(told, 1);
  assert.deepEqual(h.consentCalls, [false, false]);
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
});

test('a no the server takes at once is pending only while its call is on its way', async () => {
  const h = harness({ consent: 'yes' });
  await h.analytics.setAccount(ACCOUNT_A);
  h.holdSetConsent(true);
  const saidNo = h.analytics.answer('no');
  await settle();
  assert.deepEqual(h.consentCalls, [false]);
  assert.equal(h.analytics.pendingNo(), true);
  h.holdSetConsent(false);
  await h.landSetConsentNewestFirst();
  await saidNo;
  assert.equal(h.analytics.pendingNo(), false);
  assert.equal(h.analytics.status(), 'no');
});

test('at a load, only a stored no this phone has not delivered is pending', async () => {
  const pending = harness({ consent: 'yes', stored: { accountId: ACCOUNT_A, answer: 'no', pendingServer: true } });
  pending.setFailSet(true);
  await pending.analytics.setAccount(ACCOUNT_A);
  assert.equal(pending.analytics.status(), 'no');
  assert.equal(pending.analytics.pendingNo(), true);
  pending.setFailSet(false);
  await pending.analytics.refresh();
  assert.equal(pending.analytics.pendingNo(), false);

  // Delivered on an earlier run, and the server cannot be reached now.
  const delivered = harness({ stored: { accountId: ACCOUNT_A, answer: 'no', pendingServer: false } });
  delivered.setFailRead(true);
  await delivered.analytics.setAccount(ACCOUNT_A);
  assert.equal(delivered.analytics.status(), 'no');
  assert.equal(delivered.analytics.pendingNo(), false);

  // Said on another phone: the server's own no.
  const elsewhere = harness({ consent: 'no' });
  await elsewhere.analytics.setAccount(ACCOUNT_A);
  assert.equal(elsewhere.analytics.status(), 'no');
  assert.equal(elsewhere.analytics.pendingNo(), false);
});

test('a yes, or a sign-out, ends a pending no', async () => {
  const h = harness({ consent: 'yes' });
  await h.analytics.setAccount(ACCOUNT_A);
  h.setFailSet(true);
  await h.analytics.answer('no');
  assert.equal(h.analytics.pendingNo(), true);
  h.setFailSet(false);
  await h.analytics.answer('yes');
  assert.equal(h.analytics.status(), 'yes');
  assert.equal(h.analytics.pendingNo(), false);
  h.setFailSet(true);
  await h.analytics.answer('no');
  assert.equal(h.analytics.pendingNo(), true);
  await h.analytics.setAccount(null);
  assert.equal(h.analytics.status(), 'signed_out');
  assert.equal(h.analytics.pendingNo(), false);
});
