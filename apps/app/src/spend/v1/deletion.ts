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
import { DELETION_RECEIPT_PATH, isDeletionAccepted, isDeletionReceipt, isUuid } from '@gogospend/contracts';
import type { DeletionAccepted, DeletionReceipt } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1Transport } from '../../api/client.ts';
import type { FreshOutcome, RequestCredentials } from '../../auth/credentialProvider.ts';
import { V1_COMMAND_SCHEMA } from './resources.ts';

export type DeletionResources = {
  /** POST /v1/me/deletion with today's body { proof_id } (R46), the command id as Idempotency-Key, the request's own credentials and Accept-Language. */
  requestDeletion(input: { commandId: string; proofId: string; language: 'th' | 'en' }, credentials: RequestCredentials): Promise<DeletionAccepted>;
  /** POST DELETION_RECEIPT_PATH, token only, with the request's own token; 404 when there is none. */
  deletionReceipt(commandId: string, accessToken: string): Promise<DeletionReceipt>;
};

const commandId = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};

export function createDeletionResources(transport: V1Transport): DeletionResources {
  return {
    requestDeletion: (input, credentials) =>
      transport.request('POST', '/v1/me/deletion', {
        body: { proof_id: input.proofId },
        command: { id: commandId(input.commandId), schemaVersion: V1_COMMAND_SCHEMA },
        credentials: { accessToken: credentials.accessToken, binding: credentials.sessionId },
        acceptLanguage: input.language,
        validate: isDeletionAccepted,
      }),
    deletionReceipt: (id, accessToken) =>
      transport.request('POST', DELETION_RECEIPT_PATH, {
        body: { command_id: commandId(id) },
        tokenOnly: true,
        credentials: { accessToken },
        validate: (value): value is DeletionReceipt => isDeletionReceipt(value),
      }),
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

const unknownOutcome = (error: V1Error) =>
  error.outcome === 'network' || error.outcome === 'unavailable' || error.outcome === 'invalid_response' || error.outcome === 'rate_limited';

/** A fresh sign-in, then the request on the new session's own credentials. A sign-in that does not go through requests nothing. */
export async function requestAccountDeletion(deps: DeletionDeps): Promise<DeletionState> {
  const outcome = await deps.freshSignIn();
  if (outcome === 'cancelled') return { state: 'cancelled' };
  if (outcome !== 'fresh') return { state: 'denied', code: FRESH_SIGN_IN_FAILED };
  // Read once: every send of this request, and its receipt, use these.
  const credentials = await deps.credentials();
  if (!credentials) return { state: 'reauth_required' };
  return submitDeletionRequest({ commandId: deps.newId(), proofId: deps.newId(), language: deps.language, credentials }, deps);
}

/**
 * Sends (or resends) one deletion request. Once it is accepted every session
 * is dead, so a resend after a lost response is refused like any signed-out
 * request: only the receipt can then say it was accepted.
 */
export async function submitDeletionRequest(request: PendingDeletionRequest, deps: Pick<DeletionDeps, 'resources'>): Promise<DeletionState> {
  let accepted: DeletionAccepted;
  try {
    accepted = await deps.resources.requestDeletion({ commandId: request.commandId, proofId: request.proofId, language: request.language }, request.credentials);
  } catch (error) {
    if (!(error instanceof V1Error)) throw error;
    if (error.code === 'REAUTH_REQUIRED') return { state: 'reauth_required' };
    if (unknownOutcome(error) || error.outcome === 'signed_out' || error.outcome === 'session_changed') {
      return confirmDeletionRequest(request, deps, unknownOutcome(error) ? null : error.code);
    }
    return { state: 'denied', code: error.code };
  }
  return { state: 'accepted', requestId: accepted.request_id, completed: false };
}

/**
 * Asks for the initiating device's receipt, with the request's own token.
 * Found: accepted. Not found: the request never committed - `denied` when the
 * server had refused the device (`refusal`), otherwise still `unconfirmed`.
 * Any failure is `unconfirmed`.
 */
export async function confirmDeletionRequest(request: PendingDeletionRequest, deps: Pick<DeletionDeps, 'resources'>, refusal: string | null = null): Promise<DeletionState> {
  try {
    const receipt = await deps.resources.deletionReceipt(request.commandId, request.credentials.accessToken);
    return { state: 'accepted', requestId: receipt.request_id, completed: receipt.status === 'completed' };
  } catch (error) {
    if (!(error instanceof V1Error)) throw error;
    if (error.outcome === 'not_found' && refusal !== null) return { state: 'denied', code: refusal };
    return { state: 'unconfirmed', request };
  }
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
