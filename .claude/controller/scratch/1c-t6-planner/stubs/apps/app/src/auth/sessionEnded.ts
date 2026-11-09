// RED stub (R52): typed, answers wrong. Replaced by the real model in GREEN.
import type { SignInMethod } from './betterAuthPort.ts';
import type { SessionSnapshot } from './sessionMachine.ts';
import type { StoredSession } from './sessionStore.ts';

export type EndedKind = 'signed_out_elsewhere' | 'account_unavailable';
export type SessionEndedView = { kind: EndedKind; accountId: string; method: SignInMethod | null; unsent: number };

export function sessionEndedView(_snapshot: SessionSnapshot, _record: StoredSession | null, _reason: EndedKind | null, _unsent: number): SessionEndedView | null {
  return null;
}

export type AfterEndedSignIn = { kind: 'resumed' } | { kind: 'other_account'; previousAccountId: string; unsent: number };

export function afterEndedSignIn(_previous: SessionEndedView, _signedInAccountId: string): AfterEndedSignIn {
  return { kind: 'resumed' };
}

export type OtherAccountChoice = { kind: 'keep' } | { kind: 'erase'; confirmed: boolean };

export function mayEraseOtherAccount(_choice: OtherAccountChoice): boolean {
  return false;
}
