// The tray's swipe (P2-T13, W3): a pull past 120 pt, or a quick flick past
// 60 pt, closes it; a pull up never does. Gesture Handler 3 runs a hook's
// callbacks on the UI thread unless runOnJS is true, and the swipe's end asks
// the host to close, which sets React state. react-native-web drops the
// native-only props, so their wiring is read from the source (R72).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { shouldDismiss } from './trayGesture.ts';

const source = readFileSync(new URL('./Tray.tsx', import.meta.url), 'utf8');

test('a pull of 120 pt, or a quick flick past 60 pt, closes the tray; a pull up never does', () => {
  assert.equal(shouldDismiss(119, 0), false);
  assert.equal(shouldDismiss(121, 0), true);
  assert.equal(shouldDismiss(61, 901), true);
  assert.equal(shouldDismiss(61, 899), false);
  assert.equal(shouldDismiss(-300, 2000), false);
});

test('each line is passed, never met: more than 120 pt, more than 60 pt, faster than 900 pt a second', () => {
  assert.equal(shouldDismiss(120, 0), false);
  assert.equal(shouldDismiss(120.5, 0), true);
  assert.equal(shouldDismiss(60, 5000), false);
  assert.equal(shouldDismiss(60.5, 900.5), true);
  assert.equal(shouldDismiss(100, 900), false);
});

test('the swipe runs on the JS runtime', () => {
  assert.match(source, /runOnJS: true/);
});

test("what the web drops is wired for a phone: the screen reader's escape, the modal card, the title, the backdrop, the Modal, the keyboard and the cover", () => {
  assert.match(source, /^\s+onAccessibilityEscape=\{requestClose\}$/m);
  assert.match(source, /^\s+accessibilityViewIsModal$/m);
  // The title is one accessibility element, so VoiceOver can land on it, even 1 by 1 pt beside a header.
  assert.match(source, /titleHeader = \{ accessible: true, accessibilityRole: 'header' as const/);
  // The decorative backdrop is never a keyboard stop on Android (React Native's Pressable is focusable unless told).
  assert.match(source, /^\s+focusable=\{false\}$/m);
  assert.match(source, /^\s+transparent$/m);
  assert.match(source, /^\s+statusBarTranslucent$/m);
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
  // Covered, the card goes at once: Reanimated skips its exit on a phone, so it never shows over the cover (R63).
  assert.match(source, /<LayoutAnimationConfig skipExiting>\s*<KeyboardAvoidingView/);
});
