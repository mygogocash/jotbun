// Signing out everywhere (F6a's POST /v1/me/global-logout), client side: a
// fresh `global_logout` proof, then the request as that proof's command (its
// id is the Idempotency-Key). Settings drives it; nothing here shows UI or
// touches this phone's diary.
//
// Once the server accepts it (202 `{generation, provider_cleanup: "pending"}`)
// every binding is dead, this phone's too, and new sign-ins wait until Auth0's
// refresh grants are revoked. A resend after a lost answer - the transport's
// own, or Try again - meets 401 SESSION_REQUIRED, because the first one
// landed: that is signed out as well. Only those two let the screen erase
// this phone's diary and end the session here. Anything Jotbun did not answer
// keeps the person signed in, with the exact request kept to resend.
import { isUuid } from '@gogospend/contracts';
import type { GlobalLogoutResult } from '@gogospend/contracts';

import { V1Error } from '../api/client.ts';
import type { V1Transport } from '../api/client.ts';
import { V1_COMMAND_SCHEMA } from '../spend/v1/resources.ts';
import type { Proof } from './reauthentication.ts';

export type GlobalLogoutProof = Pick<Proof, 'proofId' | 'commandId'>;

export type GlobalLogoutResources = {
  /** POST /v1/me/global-logout as the proof's command (its id is the Idempotency-Key), on the current session. */
  globalLogout(proof: GlobalLogoutProof): Promise<GlobalLogoutResult>;
};

const isGlobalLogoutResult = (value: unknown): value is GlobalLogoutResult =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === 'generation,provider_cleanup' &&
  Number.isSafeInteger((value as GlobalLogoutResult).generation) && (value as GlobalLogoutResult).provider_cleanup === 'pending';

const commandId = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};

export function createGlobalLogoutResources(transport: V1Transport): GlobalLogoutResources {
  return {
    globalLogout: (proof) =>
      transport.request('POST', '/v1/me/global-logout', {
        body: { proof_id: proof.proofId },
        command: { id: commandId(proof.commandId), schemaVersion: V1_COMMAND_SCHEMA },
        // REAUTH_REQUIRED here refuses the proof, not the session.
        proof: true,
        validate: isGlobalLogoutResult,
      }),
  };
}

/** A request whose answer never came: resend exactly this (same proof and key). */
export type PendingGlobalLogout = GlobalLogoutProof;

export type GlobalLogoutState =
  /** The person cancelled the fresh sign-in: nothing was sent. */
  | { state: 'cancelled' }
  /** Every binding is dead, this phone's too (accepted, or a resend of one that was): end the session here. */
  | { state: 'signed_out' }
  /** The proof was stale or used: nothing changed. */
  | { state: 'reauth_required' }
  /** Jotbun did not answer (network, gateway, rate limit, an unreadable success): still signed in here; resend this request. */
  | { state: 'unconfirmed'; request: PendingGlobalLogout }
  /** Refused for another reason: nothing changed. */
  | { state: 'refused'; code: string };

export type GlobalLogoutDeps = {
  resources: GlobalLogoutResources;
  /** A fresh `global_logout` proof (F5's reauthenticate('global_logout', ...)); null when the person cancels. */
  reauthenticate: () => Promise<Proof | null>;
};

const unknownOutcome = (error: V1Error) =>
  error.outcome === 'network' || error.outcome === 'unavailable' || error.outcome === 'invalid_response' || error.outcome === 'rate_limited';

/** Reauthenticates for `global_logout` and sends the request. A sign-in that fails throws: nothing was sent. */
export async function requestGlobalLogout(deps: GlobalLogoutDeps): Promise<GlobalLogoutState> {
  const proof = await deps.reauthenticate();
  if (!proof) return { state: 'cancelled' };
  return submitGlobalLogout({ proofId: proof.proofId, commandId: proof.commandId }, deps);
}

/** Sends (or resends) one global sign-out request. */
export async function submitGlobalLogout(request: PendingGlobalLogout, deps: Pick<GlobalLogoutDeps, 'resources'>): Promise<GlobalLogoutState> {
  try {
    await deps.resources.globalLogout(request);
  } catch (error) {
    if (!(error instanceof V1Error)) throw error;
    // The binding is already dead: this request (or the one it resends) landed, or there is no session here at all.
    if (error.code === 'SESSION_REQUIRED') return { state: 'signed_out' };
    if (error.code === 'REAUTH_REQUIRED') return { state: 'reauth_required' };
    if (unknownOutcome(error)) return { state: 'unconfirmed', request };
    return { state: 'refused', code: error.code };
  }
  return { state: 'signed_out' };
}
