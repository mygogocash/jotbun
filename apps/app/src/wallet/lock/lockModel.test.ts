// The Face ID lock's rules (P2-T33, W18, R67): the lock's view as the app
// comes and goes, what the locked app does with each answer, what it makes of
// an answer or a reading outside the port's types, the names a screen gives
// the phone's method, the setup switch, and where the wallet root puts the
// lock (read from its source, as spendLayoutOrder.test.ts reads the spend
// layout's).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { COPY } from './copy.ts';
import type { LockAvailability, LockMethod, LockView } from './lockModel.ts';
import { afterAnswer, afterRecheck, appStateEvent, authResultOf, availabilityOf, lockReducer, lockSwitch, METHOD_KEYS, namedMethod, UNLOCKED } from './lockModel.ts';

const open: LockView = { locked: false, covered: false };

test('with the lock on, every app open locks: a cold start and every return from the background', () => {
  assert.equal(lockReducer(open, { type: 'start' }, true).locked, true);
  const away = lockReducer(open, { type: 'background' }, true);
  assert.deepEqual(away, { locked: true, covered: true });
  assert.deepEqual(lockReducer(away, { type: 'active' }, true), { locked: true, covered: false });
});

test('inactive only covers, so the Face ID prompt cannot lock again', () => {
  assert.deepEqual(lockReducer(open, { type: 'inactive' }, true), { locked: false, covered: true });
  assert.deepEqual(lockReducer({ locked: false, covered: true }, { type: 'active' }, true), open);
  // The prompt over a locked app covers it and leaves the lock as it was.
  assert.deepEqual(lockReducer({ locked: true, covered: false }, { type: 'inactive' }, true), { locked: true, covered: true });
});

test('with the lock off nothing locks or covers', () => {
  for (const type of ['start', 'background', 'inactive'] as const) assert.deepEqual(lockReducer(open, { type }, false), open);
});

test('unlocked unlocks and keeps a cover until the app is in front; disabled clears both, with the lock on or off', () => {
  assert.deepEqual(lockReducer({ locked: true, covered: true }, { type: 'unlocked' }, true), { locked: false, covered: true });
  assert.deepEqual(lockReducer({ locked: true, covered: false }, { type: 'unlocked' }, true), open);
  for (const enabled of [true, false]) {
    assert.deepEqual(lockReducer({ locked: true, covered: true }, { type: 'disabled' }, enabled), open);
    // In front again, a cover goes, with the lock on or off.
    assert.deepEqual(lockReducer({ locked: false, covered: true }, { type: 'active' }, enabled), open);
  }
  // A start with the lock on keeps a cover the app already has.
  assert.deepEqual(lockReducer({ locked: false, covered: true }, { type: 'start' }, true), { locked: true, covered: true });
  assert.deepEqual(UNLOCKED, open);
});

test("AppState's active, inactive and background are lock events; anything else says nothing", () => {
  assert.deepEqual(['active', 'inactive', 'background'].map(appStateEvent), [{ type: 'active' }, { type: 'inactive' }, { type: 'background' }]);
  for (const status of ['unknown', 'extension', '']) assert.equal(appStateEvent(status), null);
});

test('an answer that does not unlock says why; unavailable reads the phone first, and only a phone that says it cannot lock turns the lock off', () => {
  assert.deepEqual(afterAnswer('success'), { step: 'unlock' });
  assert.deepEqual(afterAnswer('cancelled'), { step: 'stay', note: 'lock.tryAgain' });
  assert.deepEqual(afterAnswer('failed'), { step: 'stay', note: 'lock.tryAgain' });
  assert.deepEqual(afterAnswer('lockout'), { step: 'stay', note: 'lock.lockout' });
  assert.deepEqual(afterAnswer('unavailable'), { step: 'recheck' });
  assert.deepEqual(afterRecheck({ canLock: true, method: 'face' }), { step: 'stay', note: 'lock.tryAgain' });
  assert.deepEqual(afterRecheck({ canLock: false, method: null }), { step: 'turnOff' });
  // A read that failed never opens the app.
  assert.deepEqual(afterRecheck(null), { step: 'stay', note: 'lock.tryAgain' });
});

// The second review's n1: a slip in the port (P2-T34's adapter) never opens the app, and never leaves the gate unable to ask.
test("an answer or a reading outside the port's types counts as a failed scan, or as a phone that could not be read", () => {
  for (const result of ['success', 'cancelled', 'failed', 'lockout', 'unavailable'] as const) assert.equal(authResultOf(result), result);
  for (const odd of ['not_interactive', 'SUCCESS', '', undefined, null, 0, true, {}]) assert.equal(authResultOf(odd), 'failed', String(odd));
  assert.deepEqual(availabilityOf({ canLock: true, method: 'face' }), { canLock: true, method: 'face' });
  assert.deepEqual(availabilityOf({ canLock: true, method: 'fingerprint' }), { canLock: true, method: 'fingerprint' });
  assert.deepEqual(availabilityOf({ canLock: true, method: 'passcode', extra: 1 }), { canLock: true, method: 'passcode' });
  assert.deepEqual(availabilityOf({ canLock: false, method: null }), { canLock: false, method: null });
  const odd: readonly unknown[] = [null, undefined, 'face', 1, {}, { method: 'face' }, { canLock: 'no', method: null }, { canLock: 0, method: null }, { canLock: true }, { canLock: true, method: 'retina' }, { canLock: true, method: 'toString' }];
  for (const reading of odd) assert.equal(availabilityOf(reading), null, JSON.stringify(reading) ?? String(reading));
  // Only a reading that says canLock: false, in so many words, turns the lock off.
  for (const reading of [{ method: 'face' }, { canLock: undefined, method: null }, { canLock: 0, method: null }]) {
    assert.deepEqual(afterRecheck(reading as unknown as LockAvailability), { step: 'stay', note: 'lock.tryAgain' }, JSON.stringify(reading));
  }
});

test("a screen names the phone's method, or the passcode while the phone has not said, and each method has its name, line and body", () => {
  assert.equal(namedMethod({ canLock: true, method: 'face' }), 'face');
  assert.equal(namedMethod({ canLock: true, method: 'fingerprint' }), 'fingerprint');
  assert.equal(namedMethod({ canLock: false, method: null }), 'passcode');
  assert.equal(namedMethod(null), 'passcode');
  const methods: readonly LockMethod[] = ['face', 'fingerprint', 'passcode'];
  assert.deepEqual(Object.keys(METHOD_KEYS), methods);
  assert.deepEqual(methods.map((method) => METHOD_KEYS[method].name), ['lock.methodFace', 'lock.methodFingerprint', 'lock.methodPasscode']);
  assert.deepEqual(methods.map((method) => METHOD_KEYS[method].line), ['lock.lineFace', 'lock.lineFingerprint', 'lock.linePasscode']);
  assert.deepEqual(methods.map((method) => METHOD_KEYS[method].body), ['lock.body', 'lock.bodyFingerprint', 'lock.bodyPasscode']);
  const keys = new Set(Object.keys(COPY));
  for (const method of methods) for (const key of Object.values(METHOD_KEYS[method])) assert.ok(keys.has(key), key);
});

test('the setup switch waits for the phone, stays off on a phone that cannot lock and says why, and can always turn a lock off', () => {
  const face = { canLock: true, method: 'face' } as const;
  const none = { canLock: false, method: null } as const;
  assert.deepEqual(lockSwitch(false, face), { checked: false, disabled: false, needsPasscode: false });
  assert.deepEqual(lockSwitch(true, face), { checked: true, disabled: false, needsPasscode: false });
  assert.deepEqual(lockSwitch(false, null), { checked: false, disabled: true, needsPasscode: false });
  assert.deepEqual(lockSwitch(false, none), { checked: false, disabled: true, needsPasscode: true });
  assert.deepEqual(lockSwitch(true, none), { checked: true, disabled: false, needsPasscode: false });
  assert.deepEqual(lockSwitch(true, null), { checked: true, disabled: false, needsPasscode: false });
});

// The render cases read the draft table, so the plan's Thai lines (sa-lock-setup, sa-locked, and its drafts) are
// pinned here, word for word; the three lines the plan does not list are the brief's (P2-T33's ruling P4), and the
// fourth is the fix round's: a lock that could not be kept on.
test("the lock's Thai lines are the plan's, and only four more", () => {
  const plan: Readonly<Record<string, string>> = {
    'lock.step': 'ตั้งค่า · ขั้นที่ 5 จาก 5',
    'lock.question': 'ล็อก Jotbun ด้วย {method} ไหม?',
    'lock.body': 'ทุกครั้งที่เปิดแอป ต้องสแกนหน้าก่อนถึงจะเห็นยอดเงินและบันทึก เหมาะเวลายื่นโทรศัพท์ให้คนอื่นดูรูป',
    'lock.switch': 'ล็อกด้วย {method}',
    'lock.fallbackLine': 'สแกนไม่ผ่าน ใช้รหัสผ่านของเครื่องแทนได้',
    'lock.changeLater': 'เปลี่ยนใจได้ทุกเมื่อในการตั้งค่า',
    'lock.lockedTitle': 'Jotbun ล็อกอยู่',
    'lock.lineFace': 'สแกนหน้าเพื่อเปิดบันทึกของคุณ',
    'lock.lineFingerprint': 'สแกนลายนิ้วมือเพื่อเปิดบันทึกของคุณ',
    'lock.linePasscode': 'ใส่รหัสผ่านของเครื่องเพื่อเปิดบันทึกของคุณ',
    'lock.unlock': 'ปลดล็อกด้วย {method}',
    'lock.usePasscode': 'ใช้รหัสผ่าน',
    'lock.methodFace': 'Face ID',
    'lock.methodFingerprint': 'ลายนิ้วมือ',
    'lock.methodPasscode': 'รหัสผ่าน',
    'lock.tryAgain': 'ลองอีกครั้ง หรือใช้รหัสผ่าน',
    'lock.lockout': 'สแกนไม่ผ่านหลายครั้ง ใช้รหัสผ่านของเครื่องแทน',
    'lock.turnedOff': 'ปิดการล็อกแล้ว เพราะเครื่องนี้ไม่มีรหัสผ่านหรือ Face ID แล้ว',
    'lock.needsPasscode': 'ตั้งรหัสผ่านหรือ Face ID ในการตั้งค่าเครื่องก่อน จึงจะล็อก Jotbun ได้',
    'lock.row': 'ล็อกด้วย {method}',
    'lock.on': 'เปิด',
    'lock.off': 'ปิด',
  };
  const table: Readonly<Record<string, { th: string }>> = COPY;
  assert.deepEqual(Object.fromEntries(Object.keys(plan).map((key) => [key, table[key]?.th])), plan);
  assert.deepEqual(Object.keys(COPY).filter((key) => !(key in plan)), ['lock.bodyFingerprint', 'lock.bodyPasscode', 'lock.notStored', 'lock.previewName']);
  assert.equal(table['lock.notStored']?.th, 'เปิดการล็อกไม่สำเร็จ ลองอีกครั้ง');
});

const root = readFileSync(new URL('../WalletRoot.tsx', import.meta.url), 'utf8');

test('the lock wraps private mode, so nothing that shows an amount renders above it', () => {
  const gate = root.indexOf('<LockGate');
  assert.ok(gate > 0, 'WalletRoot draws the lock');
  assert.ok(gate < root.indexOf('<PrivateModeProvider'));
});

// P2-T10's review (R9): the whole order, so a provider moved anywhere fails.
test("the wallet root's order: the gesture root, the motion answer, the lock with the app's own port while the wallet area is on, then private mode; with the area off, private mode inside the motion answer", () => {
  const body = root.slice(root.indexOf('export function WalletRoot')).replace(/\s+/g, ' ');
  assert.match(
    body,
    /<GestureHandlerRootView style=\{\{ flex: 1 \}\}> <WalletMotionProvider> \{isRedesignEnabled\('wallet'\) \? \( <LockGate port=\{getAppLocalAuth\(\)\}> <PrivateModeProvider>\{children\}<\/PrivateModeProvider> <\/LockGate> \) : \( <PrivateModeProvider>\{children\}<\/PrivateModeProvider> \)\} <\/WalletMotionProvider> <\/GestureHandlerRootView>/,
  );
});
