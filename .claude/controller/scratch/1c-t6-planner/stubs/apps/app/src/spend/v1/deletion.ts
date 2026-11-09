// Account deletion, client side (§6.12): a fresh sign-in with the account's
// own method, then the request on that new session's own credentials, the
// initiating device's receipt after a lost answer, and the one rule for this
// device's own copy. The screen that drives it is Privacy and data; nothing
// here shows UI or logs anything.
//
// The request keeps today's v1 body, { proof_id } (R46, C2): a random UUID the
// server records but no longer checks, since freshness now comes from the
// session's sign-in time (`auth_time`). Its command id is the Idempotency-Key,
// and it carries the app's language for the deletion email (K11). A resend
// after a lost answer, and the receipt, use the same credentials, command id
// and proof id.
//
// Only a server-confirmed acceptance (`accepted`) lets this device discard
// its diary. Every ordinary failure - network, timeout, gateway, 401/403,
// rate limit - keeps drafts and never means "deleted": an unknown outcome is
// `unconfirmed` (resend exactly the same request, or ask for the receipt),
// and a refusal is `denied` (the device locks and keeps its drafts, like any
// other signed-out device). `accepted` is not "completed": erasure finishes
// on the server on its own (target 24 hours).
import type { DeletionAccepted, DeletionReceipt } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1Transport } from '../../api/client.ts';
import type { FreshOutcome, RequestCredentials } from '../../auth/credentialProvider.ts';

export type DeletionResources = {
  /** POST /v1/me/deletion with today's body { proof_id } (R46), the command id as Idempotency-Key, the request's own credentials and Accept-Language. */
  requestDeletion(input: { commandId: string; proofId: string; language: 'th' | 'en' }, credentials: RequestCredentials): Promise<DeletionAccepted>;
  /** POST DELETION_RECEIPT_PATH, token only, with the request's own token; 404 when there is none. */
  deletionReceipt(commandId: string, accessToken: string): Promise<DeletionReceipt>;
};

export function createDeletionResources(_transport: V1Transport): DeletionResources {
  // RED stub (R52): nothing is sent.
  return {
    requestDeletion: async () => { throw new V1Error('unavailable', 501, 'NOT_IMPLEMENTED'); },
    deletionReceipt: async () => { throw new V1Error('unavailable', 501, 'NOT_IMPLEMENTED'); },
  };
}

/** A request whose outcome is not known: resend exactly this (same key, proof id, language and credentials), or ask for its receipt. */
export type PendingDeletionRequest = { commandId: string; proofId: string; language: 'th' | 'en'; credentials: RequestCredentials };

/** The fresh sign-in did not go through (any outcome but `fresh` or `cancelled`): nothing was requested. */
export const FRESH_SIGN_IN_FAILED = 'FRESH_SIGN_IN_FAILED';

export type DeletionState =
  /** The person cancelled the fresh sign-in: nothing was requested. */
  | { state: 'cancelled' }
  /** The sign-in was too old for the server, or its new session could not be read: sign in again. Nothing was requested. */
  | { state: 'reauth_required' }
  /** Not known yet (network, gateway, rate limit): keep everything and retry this request. */
  | { state: 'unconfirmed'; request: PendingDeletionRequest }
  /** The server confirmed it: the account is being erased. `completed` once its server data is purged. */
  | { state: 'accepted'; requestId: string; completed: boolean }
  /** Refused (signed out, account unavailable, invalid), or the fresh sign-in failed (FRESH_SIGN_IN_FAILED, nothing sent): no deletion was requested by this device. */
  | { state: 'denied'; code: string };

export type DeletionDeps = {
  resources: DeletionResources;
  /** A fresh sign-in with the account's own method (the credential provider's). */
  freshSignIn: () => Promise<FreshOutcome>;
  /** The new session's token and id, read together (the provider's requestCredentials()); null when there is no usable session. */
  credentials: () => Promise<RequestCredentials | null>;
  /** A random UUID: the command id, then the proof id. */
  newId: () => string;
  /** The app's language, for the deletion email. */
  language: 'th' | 'en';
};

/** A fresh sign-in, then the request on the new session's own credentials. A sign-in that does not go through requests nothing. */
export async function requestAccountDeletion(_deps: DeletionDeps): Promise<DeletionState> {
  // RED stub (R52).
  return { state: 'cancelled' };
}

/**
 * Sends (or resends) one deletion request. Once it is accepted every session
 * is dead, so a resend after a lost response is refused like any signed-out
 * request: only the receipt can then say it was accepted.
 */
export async function submitDeletionRequest(_request: PendingDeletionRequest, _deps: Pick<DeletionDeps, 'resources'>): Promise<DeletionState> {
  // RED stub (R52).
  return { state: 'cancelled' };
}

/**
 * Asks for the initiating device's receipt, with the request's own token.
 * Found: accepted. Not found: the request never committed - `denied` when the
 * server had refused the device (`refusal`), otherwise still `unconfirmed`.
 * Any failure is `unconfirmed`.
 */
export async function confirmDeletionRequest(_request: PendingDeletionRequest, _deps: Pick<DeletionDeps, 'resources'>, _refusal: string | null = null): Promise<DeletionState> {
  // RED stub (R52).
  return { state: 'cancelled' };
}

/** True only for a server-confirmed acceptance. */
export const mayEraseDeviceData = (state: DeletionState): boolean => state.state === 'accepted';

export type DeviceCopy = {
  /** S4's explicit erase of this account's diary on this device. */
  eraseForSignOut(): Promise<void>;
  /** Locks the diary and keeps its drafts (a refused or signed-out device). */
  lock(): Promise<void>;
};

/**
 * What this device does with its own copy: erase it only after a confirmed
 * acceptance; lock (keeping drafts) after a refusal; otherwise leave it as it
 * is. Never erases on an ordinary error.
 */
export async function settleDeviceCopy(state: DeletionState, copy: DeviceCopy): Promise<'erased' | 'locked' | 'kept'> {
  if (mayEraseDeviceData(state)) {
    await copy.eraseForSignOut();
    return 'erased';
  }
  if (state.state === 'denied') {
    await copy.lock();
    return 'locked';
  }
  return 'kept';
}
