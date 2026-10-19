import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SPEND_INTRO_YEARLY_BAHT } from '../../../spendIntro.ts';
import { untranslated } from '../testing/catalog.ts';
import {
  COFFEE_PER_DAY_BAHT, FIRST_REMINDER, PRIVACY_PROMISES, SIGN_IN_METHODS, STORY_STEPS,
  afterOnboarding, afterSignInAttempt, canChooseProvider, coffeeMaths, primingAnswer, stepAfter, storyProgress, SKIP_TO,
} from './onboardingModel.ts';
import type { SignInState } from './onboardingModel.ts';

test('the story is three steps, then the reminder question; Skip goes straight to the question', () => {
  assert.deepEqual(STORY_STEPS, ['coffee', 'private', 'first-coffee']);
  assert.equal(stepAfter('coffee'), 'private');
  assert.equal(stepAfter('private'), 'first-coffee');
  assert.equal(stepAfter('first-coffee'), 'reminder');
  assert.equal(stepAfter('reminder'), 'reminder');
  assert.equal(SKIP_TO, 'reminder');
});

test('the dots count the story only: 1, 2, 3 of 3, and none on the reminder question', () => {
  assert.deepEqual(storyProgress('coffee'), { step: 1, total: 3 });
  assert.deepEqual(storyProgress('private'), { step: 2, total: 3 });
  assert.deepEqual(storyProgress('first-coffee'), { step: 3, total: 3 });
  assert.equal(storyProgress('reminder'), null);
});

test('the coffee maths is today\'s intro maths: ฿60 a day is ฿21,900 a year', () => {
  assert.equal(COFFEE_PER_DAY_BAHT * 365, SPEND_INTRO_YEARLY_BAHT);
  assert.deepEqual(coffeeMaths(), { perDay: '฿60', perYear: '฿21,900' });
});

test('turning the reminder on asks for 20:00, enabled, and nothing else', () => {
  assert.deepEqual(FIRST_REMINDER, { enabled: true, localTime: '20:00' });
  assert.deepEqual(Object.keys(FIRST_REMINDER).sort(), ['enabled', 'localTime']);
});

test('each answer from the reminder service has its own words; anything unexpected is a calm failure', () => {
  assert.equal(primingAnswer('scheduled'), 'scheduled');
  assert.equal(primingAnswer('denied'), 'denied');
  assert.equal(primingAnswer('unsupported'), 'unsupported');
  // `disabled` only answers a request to turn reminders off, which onboarding never makes.
  assert.equal(primingAnswer('disabled'), 'failed');
});

test('after onboarding: sign in, or with a session log the first coffee', () => {
  assert.equal(afterOnboarding(false), '/login');
  assert.equal(afterOnboarding(true), '/spend/add');
});

test('the three promises are plain, distinct sentences', () => {
  assert.equal(PRIVACY_PROMISES.length, 3);
  assert.equal(new Set(PRIVACY_PROMISES.map((promise) => promise.key)).size, 3);
  for (const promise of PRIVACY_PROMISES) assert.match(promise.text, /^[A-Z].*\.$/);
});

// Copy is looked up by its English text, and the screens pass these promises to
// `tc` from the table, where the literal guard can't see them (R6, E2
// checkpoint 4).
test('each promise is copy in en.json, with Thai', () => {
  assert.deepEqual(untranslated(PRIVACY_PROMISES.map((promise) => promise.text)), []);
});

test('Apple, Google and email, in that order, and none of them first among equals', () => {
  assert.deepEqual(SIGN_IN_METHODS, ['apple', 'google', 'email']);
});

test('a provider can be chosen only with the terms ticked, and not while one is running or sign-in is not configured', () => {
  const idle: SignInState = { phase: 'idle' };
  assert.equal(canChooseProvider(false, idle), false);
  assert.equal(canChooseProvider(true, idle), true);
  assert.equal(canChooseProvider(true, { phase: 'failed' }), true);
  assert.equal(canChooseProvider(true, { phase: 'signing_in', method: 'apple' }), false);
  assert.equal(canChooseProvider(true, { phase: 'not_configured' }), false);
  assert.equal(canChooseProvider(false, { phase: 'failed' }), false);
});

test('only a session the seam reports active leaves the screen; nothing pretends to sign in', () => {
  assert.deepEqual(afterSignInAttempt('not_configured'), { state: { phase: 'not_configured' }, go: null });
  assert.deepEqual(afterSignInAttempt('active'), { state: { phase: 'idle' }, go: '/spend' });
  assert.deepEqual(afterSignInAttempt('cancelled'), { state: { phase: 'idle' }, go: null });
  assert.deepEqual(afterSignInAttempt('failed'), { state: { phase: 'failed' }, go: null });
  assert.deepEqual(afterSignInAttempt('reauth_required'), { state: { phase: 'failed' }, go: null });
});
