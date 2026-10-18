// The auth endpoints (F4) as the credential provider uses them. Challenge,
// bootstrap and proof are token-only (no binding yet); logout is bound. The ID
// token is sent only in the bodies of bootstrap and proof, never as a Bearer.
// A sign-in's challenge and bootstrap carry its own pending access token, and
// a sign-out revokes a binding with that binding's own token, so neither
// depends on (or replaces) the current session's credentials.
import { isUuid } from '@gogospend/contracts';

import type { V1Transport } from '../api/client.ts';
import type { AuthApi } from './credentialProvider.ts';

/** F4 issues 32 random bytes as base64url: exactly 43 characters (the server's own check). */
export const SESSION_BINDING = /^[A-Za-z0-9_-]{43}$/;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const exactly = (value: Json, keys: string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const instant = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

export function createAuthApi(transport: V1Transport): AuthApi {
  return {
    challenge: (input, auth) =>
      transport.request('POST', '/v1/auth/challenges', {
        body: input,
        tokenOnly: true,
        ...(auth ? { credentials: { accessToken: auth.accessToken } } : {}),
        validate: (value): value is { challenge_id: string; nonce: string; expires_at: string } =>
          isObject(value) && exactly(value, ['challenge_id', 'nonce', 'expires_at']) && isUuid(value.challenge_id) &&
          typeof value.nonce === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value.nonce) && instant(value.expires_at),
      }),
    bootstrap: (input, auth) =>
      transport.request('POST', '/v1/auth/bootstrap', {
        body: input,
        tokenOnly: true,
        ...(auth ? { credentials: { accessToken: auth.accessToken } } : {}),
        validate: (value): value is { account_id: string; binding: string; session_generation: number } =>
          isObject(value) && exactly(value, ['account_id', 'binding', 'session_generation']) && isUuid(value.account_id) &&
          typeof value.binding === 'string' && SESSION_BINDING.test(value.binding) && Number.isSafeInteger(value.session_generation),
      }),
    prove: (input) =>
      transport.request('POST', '/v1/auth/proofs', {
        body: input,
        tokenOnly: true,
        validate: (value): value is { proof_id: string; expires_at: string } => isObject(value) && exactly(value, ['proof_id', 'expires_at']) && isUuid(value.proof_id) && instant(value.expires_at),
      }),
    async logout(target) {
      await transport.request('POST', '/v1/me/logout', {
        body: {},
        ...(target ? { credentials: { accessToken: target.accessToken, binding: target.binding } } : {}),
        validate: (value): value is null => value === null,
      });
    },
  };
}
