// RED stub (P2-T33): the real types and names, with wrong rules. Pure.

export type LockMethod = 'face' | 'fingerprint' | 'passcode';

export type AuthResult = 'success' | 'cancelled' | 'failed' | 'lockout' | 'unavailable';

export type LockAvailability = { canLock: boolean; method: LockMethod | null };

export type LockView = { locked: boolean; covered: boolean };

export type LockEvent = { type: 'start' } | { type: 'background' } | { type: 'inactive' } | { type: 'active' } | { type: 'unlocked' } | { type: 'disabled' };

export const UNLOCKED: LockView = { locked: false, covered: false };

export const LOCK_NAME = 'lock';
export const LOCK_ANSWERED_NAME = 'lock-answered';

/** Wrong: every event locks and covers. */
export function lockReducer(_view: LockView, _event: LockEvent, _enabled: boolean): LockView {
  return { locked: true, covered: true };
}

/** Wrong: says nothing. */
export function appStateEvent(_status: string): LockEvent | null {
  return null;
}

export type LockNote = 'lock.tryAgain' | 'lock.lockout';

export type AfterAnswer = { readonly step: 'unlock' } | { readonly step: 'stay'; readonly note: LockNote } | { readonly step: 'recheck' };

/** Wrong: every answer unlocks. */
export function afterAnswer(_result: AuthResult): AfterAnswer {
  return { step: 'unlock' };
}

/** Wrong: the lock always turns itself off. */
export function afterRecheck(_phone: LockAvailability | null): { readonly step: 'stay'; readonly note: 'lock.tryAgain' } | { readonly step: 'turnOff' } {
  return { step: 'turnOff' };
}

/** Wrong: always Face ID. */
export function namedMethod(_phone: LockAvailability | null): LockMethod {
  return 'face';
}

/** Wrong: every method is named as Face ID. */
export const METHOD_KEYS: Readonly<Record<LockMethod, { readonly name: string; readonly line: string; readonly body: string }>> = {
  face: { name: 'lock.methodFace', line: 'lock.lineFace', body: 'lock.body' },
  fingerprint: { name: 'lock.methodFace', line: 'lock.lineFace', body: 'lock.body' },
  passcode: { name: 'lock.methodFace', line: 'lock.lineFace', body: 'lock.body' },
};

/** Wrong: never waits, never says why. */
export function lockSwitch(enabled: boolean, _phone: LockAvailability | null): { readonly checked: boolean; readonly disabled: boolean; readonly needsPasscode: boolean } {
  return { checked: enabled, disabled: false, needsPasscode: false };
}
