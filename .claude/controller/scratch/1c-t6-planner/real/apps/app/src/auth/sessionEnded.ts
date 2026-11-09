// D37 (spec §3), the model behind the session-ended screen (Task 8 draws it).
// A phone whose session ended elsewhere (signed out from another phone,
// unused too long, or the account unavailable) locks, pauses its outbox and
// keeps every unsent record. Signing in again to the same account resumes and
// sends them. Another account never replays them: the phone asks whether to
// keep the first account's records or erase them, and erasing needs an
// explicit confirmation. Pure: no storage, no network, no copy.
import type { SignInMethod } from './betterAuthPort.ts';
import type { SessionSnapshot } from './sessionMachine.ts';
import type { StoredSession } from './sessionStore.ts';

export type EndedKind = 'signed_out_elsewhere' | 'account_unavailable';

/** What the session-ended screen shows: why, whose records, how that account signs in, and how many records wait. */
export type SessionEndedView = { kind: EndedKind; accountId: string; method: SignInMethod | null; unsent: number };

/**
 * The session-ended view, only while the session is `locked` or
 * `reauth_required` and the stored record is that session's account. A lock
 * with no reason given (a cold start without the cookie) reads as signed out
 * elsewhere.
 */
export function sessionEndedView(snapshot: SessionSnapshot, record: StoredSession | null, reason: EndedKind | null, unsent: number): SessionEndedView | null {
  if (snapshot.state !== 'locked' && snapshot.state !== 'reauth_required') return null;
  if (!record || record.accountId !== snapshot.accountId) return null;
  return { kind: reason ?? 'signed_out_elsewhere', accountId: record.accountId, method: record.method, unsent };
}

export type AfterEndedSignIn = { kind: 'resumed' } | { kind: 'other_account'; previousAccountId: string; unsent: number };

/**
 * After a sign-in from the session-ended screen: the same account resumes
 * (its outbox sends); another account leaves the first one's diary on the
 * phone, never replayed, and names how many of its records wait (the screen
 * asks keep or erase when there are any).
 */
export function afterEndedSignIn(previous: SessionEndedView, signedInAccountId: string): AfterEndedSignIn {
  if (signedInAccountId === previous.accountId) return { kind: 'resumed' };
  return { kind: 'other_account', previousAccountId: previous.accountId, unsent: previous.unsent };
}

export type OtherAccountChoice = { kind: 'keep' } | { kind: 'erase'; confirmed: boolean };

/** True only for an erase the person confirmed; keeping never erases. */
export function mayEraseOtherAccount(choice: OtherAccountChoice): boolean {
  return choice.kind === 'erase' && choice.confirmed === true;
}
