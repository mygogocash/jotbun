// P5 account deletion, client side: the request (with a fresh `deletion`
// proof), the initiating device's receipt after a lost response, and the one
// rule for this device's own copy. The settings/privacy screen that drives it
// waits for approved visuals (E2); nothing here shows UI or logs anything.
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
import type { Proof } from '../../auth/reauthentication.ts';
import { V1_COMMAND_SCHEMA } from './resources.ts';

export type DeletionProof = Pick<Proof, 'proofId' | 'commandId'>;

export type DeletionResources = {
  /** POST /v1/me/deletion as the proof's command (its id is the Idempotency-Key). */
  requestDeletion(proof: DeletionProof): Promise<DeletionAccepted>;
  /** The initiating device's receipt for that command (its old binding is sent); 404 when there is none. */
  deletionReceipt(commandId: string): Promise<DeletionReceipt>;
};

const commandId = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};

export function createDeletionResources(transport: V1Transport): DeletionResources {
  return {
    requestDeletion: (proof) =>
      transport.request('POST', '/v1/me/deletion', {
        body: { proof_id: proof.proofId },
        command: { id: commandId(proof.commandId), schemaVersion: V1_COMMAND_SCHEMA },
        validate: isDeletionAccepted,
      }),
    deletionReceipt: (id) =>
      transport.request('POST', DELETION_RECEIPT_PATH, {
        body: { command_id: commandId(id) },
        validate: (value): value is DeletionReceipt => isDeletionReceipt(value),
      }),
  };
}

/** A request whose outcome is not known: resend exactly this (same proof and key), or ask for its receipt. */
export type PendingDeletionRequest = { proofId: string; commandId: string };

export type DeletionState =
  /** The user cancelled the fresh sign-in: nothing was requested. */
  | { state: 'cancelled' }
  /** The proof was stale or used: ask for a new one. Nothing was requested. */
  | { state: 'reauth_required' }
  /** Not known yet (network, gateway, rate limit): keep everything and retry this request. */
  | { state: 'unconfirmed'; request: PendingDeletionRequest }
  /** The server confirmed it: the account is being erased. `completed` once its server data is purged. */
  | { state: 'accepted'; requestId: string; completed: boolean }
  /** Refused (signed out, account unavailable, invalid): no deletion was requested by this device. */
  | { state: 'denied'; code: string };

export type DeletionDeps = {
  resources: DeletionResources;
  /** A fresh `deletion` proof (F5's reauthenticate('deletion', ...)); null when the user cancels. */
  reauthenticate: () => Promise<Proof | null>;
};

const unknownOutcome = (error: V1Error) =>
  error.outcome === 'network' || error.outcome === 'unavailable' || error.outcome === 'invalid_response' || error.outcome === 'rate_limited';

/** Reauthenticates for `deletion` and sends the request. */
export async function requestAccountDeletion(deps: DeletionDeps): Promise<DeletionState> {
  const proof = await deps.reauthenticate();
  if (!proof) return { state: 'cancelled' };
  return submitDeletionRequest({ proofId: proof.proofId, commandId: proof.commandId }, deps);
}

/**
 * Sends (or resends) one deletion request. Once it is accepted every binding
 * is dead, so a resend after a lost response is refused like any signed-out
 * request: only the receipt can then say it was accepted.
 */
export async function submitDeletionRequest(request: PendingDeletionRequest, deps: Pick<DeletionDeps, 'resources'>): Promise<DeletionState> {
  let accepted: DeletionAccepted;
  try {
    accepted = await deps.resources.requestDeletion(request);
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
 * Asks for the initiating device's receipt. Found: accepted. Not found: the
 * request never committed - `denied` when the server had refused the device
 * (`refusal`), otherwise still `unconfirmed`. Any failure is `unconfirmed`.
 */
export async function confirmDeletionRequest(request: PendingDeletionRequest, deps: Pick<DeletionDeps, 'resources'>, refusal: string | null = null): Promise<DeletionState> {
  try {
    const receipt = await deps.resources.deletionReceipt(request.commandId);
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
