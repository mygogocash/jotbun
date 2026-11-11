// Signing out everywhere, client side: a fresh sign-in with the account's own
// method first, then one sign-out-everywhere call on that new session (the
// port's POST /jotbun/sign-out-everywhere: the server tells the vault first,
// then ends every session of the account, this phone's too). Settings drives
// it; nothing here shows UI or touches this phone's diary.
//
// Once the server accepts it, every session is gone. A resend after a lost
// answer meets SIGNED_OUT, because the first one landed: that is signed out
// as well. Only those two let the screen erase this phone's diary and end the
// session here. Anything Jotbun did not answer (unreachable, a 5xx, a rate
// limit) keeps the person signed in, with the request kept to resend. A stale
// sign-in (REAUTH_REQUIRED) or any other refusal changes nothing.
import type { FreshOutcome } from './credentialProvider.ts';

export type GlobalLogoutResources = {
  /** The port's signOutEverywhere(), on the session the fresh sign-in just made. */
  signOutEverywhere(): Promise<void>;
};

/** A request whose answer never came: resend it, with no new sign-in. It carries no proof any more: freshness is the session's own. */
export type PendingGlobalLogout = { readonly kind: 'sign_out_everywhere' };

/** The fresh sign-in did not go through (any outcome but `fresh` or `cancelled`): nothing was sent. */
export const FRESH_SIGN_IN_FAILED = 'FRESH_SIGN_IN_FAILED';

export type GlobalLogoutState =
  /** The person cancelled the fresh sign-in: nothing was sent. */
  | { state: 'cancelled' }
  /** Every session is gone, this phone's too (accepted, or a resend of one that was): end the session here. */
  | { state: 'signed_out' }
  /** The sign-in was too old for the server: nothing changed. */
  | { state: 'reauth_required' }
  /** Jotbun did not answer (unreachable, a 5xx, a rate limit): still signed in here; resend this request. */
  | { state: 'unconfirmed'; request: PendingGlobalLogout }
  /** Refused for another reason, or the fresh sign-in failed (FRESH_SIGN_IN_FAILED): nothing changed. */
  | { state: 'refused'; code: string };

/** A fresh sign-in, then the request. A sign-in that does not go through sends nothing. */
export async function requestGlobalLogout(_deps: { resources: GlobalLogoutResources; freshSignIn: () => Promise<FreshOutcome> }): Promise<GlobalLogoutState> {
  // RED stub (R52).
  return { state: 'cancelled' };
}

/** Sends (or resends) one sign-out-everywhere request on the current session. */
export async function submitGlobalLogout(_request: PendingGlobalLogout, _deps: { resources: GlobalLogoutResources }): Promise<GlobalLogoutState> {
  // RED stub (R52).
  return { state: 'cancelled' };
}
