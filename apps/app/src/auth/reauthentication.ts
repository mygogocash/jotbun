import type { ReauthPurpose } from '@gogospend/contracts';

import { AuthCancelled } from './auth0Port.ts';
import type { Auth0Port } from './auth0Port.ts';
import type { AuthApi } from './credentialProvider.ts';

export type Proof = { proofId: string; commandId: string; expiresAt: string };

/**
 * A fresh, purpose-bound proof (export, link, global logout, deletion): a
 * server challenge for this purpose and command, a fresh login (max age 0)
 * whose ID token carries the challenge nonce, then the proof. The proof is
 * consumed by the command with `commandId`. Cancelling gives no proof. The
 * login is never stored, so the session's own credentials stay as they are.
 * `bootstrap` is sign-in's own challenge, never a purpose proof.
 */
export async function reauthenticate(purpose: Exclude<ReauthPurpose, 'bootstrap'>, deps: { auth0: Auth0Port; api: AuthApi; newId: () => string }): Promise<Proof | null> {
  if ((purpose as ReauthPurpose) === 'bootstrap') throw new RangeError('bootstrap is not a purpose proof.');
  const requestId = deps.newId();
  const commandId = deps.newId();
  const challenge = await deps.api.challenge({ request_id: requestId, purpose, command_id: commandId });
  let idToken: string;
  try {
    idToken = await deps.auth0.authorizeWithNonce(challenge.nonce, { maxAgeSeconds: 0 });
  } catch (error) {
    if (error instanceof AuthCancelled) return null;
    throw error;
  }
  const proof = await deps.api.prove({ challenge_id: challenge.challenge_id, id_token: idToken });
  return { proofId: proof.proof_id, commandId, expiresAt: proof.expires_at };
}
