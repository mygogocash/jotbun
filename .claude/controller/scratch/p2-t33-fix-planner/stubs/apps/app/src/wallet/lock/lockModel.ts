// The Face ID lock's rules (P2-T33, W18, R67): how the phone proves its owner,
// what its system prompt answered, the lock's view as the app comes and goes,
// and what the locked app does with each answer. LockGate runs them; the setup
// screen and the Settings row read them. Pure: a Node test reads it, so it
// imports nothing.

/** How the phone proves its owner. P2-T34 reads it from the phone's enrolment. */
export type LockMethod = 'face' | 'fingerprint' | 'passcode';

/** What the system prompt answered. */
export type AuthResult = 'success' | 'cancelled' | 'failed' | 'lockout' | 'unavailable';

/** What the phone can do: whether it can lock at all (a passcode or biometrics), and how. */
export type LockAvailability = { canLock: boolean; method: LockMethod | null };

/** RED stub (P2-T33's fix round): the port's answer, taken as it is. */
export function authResultOf(answer: unknown): AuthResult {
  return answer as AuthResult;
}

/** RED stub (P2-T33's fix round): the port's reading, taken as it is. */
export function availabilityOf(reading: unknown): LockAvailability | null {
  return reading as LockAvailability | null;
}

/**
 * `locked`: the locked screen is up until the phone recognises its owner.
 * `covered`: the app is not in front, so nothing of it shows (W18).
 */
export type LockView = { locked: boolean; covered: boolean };

export type LockEvent = { type: 'start' } | { type: 'background' } | { type: 'inactive' } | { type: 'active' } | { type: 'unlocked' } | { type: 'disabled' };

/** Nothing locked, nothing covered. */
export const UNLOCKED: LockView = { locked: false, covered: false };

/** The device store's names (`jotbun.wallet.lock`, `jotbun.wallet.lock-answered`), `'1'` when on or answered. */
export const LOCK_NAME = 'lock';
export const LOCK_ANSWERED_NAME = 'lock-answered';

/**
 * W18 and R67, with the lock on: a cold start locks; a return from the
 * background locks too, with no grace time, and the app is covered while it is
 * away; `inactive` (the Face ID prompt itself, Control Centre, the app
 * switcher) only covers, so the prompt cannot lock again; `active` uncovers and
 * leaves a lock in place; `unlocked` unlocks; `disabled` clears both. With the
 * lock off nothing locks or covers.
 */
export function lockReducer(view: LockView, event: LockEvent, enabled: boolean): LockView {
  switch (event.type) {
    case 'disabled':
      return UNLOCKED;
    case 'unlocked':
      return { locked: false, covered: view.covered };
    case 'active':
      return { locked: view.locked, covered: false };
    case 'start':
      return enabled ? { locked: true, covered: view.covered } : view;
    case 'background':
      return enabled ? { locked: true, covered: true } : view;
    case 'inactive':
      return enabled ? { locked: view.locked, covered: true } : view;
  }
}

/** AppState's status as a lock event. `unknown` and `extension` say nothing. */
export function appStateEvent(status: string): LockEvent | null {
  if (status === 'active' || status === 'inactive' || status === 'background') return { type: status };
  return null;
}

/** What the locked screen says after an answer that did not unlock (copy.ts). */
export type LockNote = 'lock.tryAgain' | 'lock.lockout';

/** What the locked app does with an answer (R67). */
export type AfterAnswer = { readonly step: 'unlock' } | { readonly step: 'stay'; readonly note: LockNote } | { readonly step: 'recheck' };

/**
 * Success unlocks; a cancel or a failure stays locked and says to try again; a
 * lockout says to use the passcode; unavailable reads the phone again before
 * anything else.
 */
export function afterAnswer(result: AuthResult): AfterAnswer {
  switch (result) {
    case 'success':
      return { step: 'unlock' };
    case 'cancelled':
    case 'failed':
      return { step: 'stay', note: 'lock.tryAgain' };
    case 'lockout':
      return { step: 'stay', note: 'lock.lockout' };
    case 'unavailable':
      return { step: 'recheck' };
  }
}

/**
 * After an unavailable answer, the phone read again (R67): still able to lock,
 * the app stays locked and says to try again; no longer able, the lock turns
 * itself off. A phone that could not be read counts as still able, so a read
 * that fails never opens the app.
 */
export function afterRecheck(phone: LockAvailability | null): { readonly step: 'stay'; readonly note: 'lock.tryAgain' } | { readonly step: 'turnOff' } {
  return phone !== null && !phone.canLock ? { step: 'turnOff' } : { step: 'stay', note: 'lock.tryAgain' };
}

/** The method a screen names: the phone's, or the passcode while the phone has not said (every phone that can lock has one). */
export function namedMethod(phone: LockAvailability | null): LockMethod {
  return phone?.method ?? 'passcode';
}

/** Each method's lines (copy.ts): its name, the locked screen's line and the setup screen's body. */
export const METHOD_KEYS: Readonly<Record<LockMethod, { readonly name: string; readonly line: string; readonly body: string }>> = {
  face: { name: 'lock.methodFace', line: 'lock.lineFace', body: 'lock.body' },
  fingerprint: { name: 'lock.methodFingerprint', line: 'lock.lineFingerprint', body: 'lock.bodyFingerprint' },
  passcode: { name: 'lock.methodPasscode', line: 'lock.linePasscode', body: 'lock.bodyPasscode' },
};

/**
 * The setup screen's switch (R67). It shows the setting. It turns the lock on
 * only once the phone has said it can lock: until then it waits, and a phone
 * with no passcode or biometrics keeps it off, with the line that says why. A
 * lock that is on can always be turned off (an unavailable answer then reads
 * the phone again, as the locked app does).
 */
export function lockSwitch(enabled: boolean, phone: LockAvailability | null): { readonly checked: boolean; readonly disabled: boolean; readonly needsPasscode: boolean } {
  const cannot = phone !== null && !phone.canLock;
  return { checked: enabled, disabled: !enabled && (phone === null || cannot), needsPasscode: !enabled && cannot };
}
