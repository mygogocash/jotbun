// The auth endpoints (F4) as the credential provider uses them. Challenge,
// bootstrap and proof are token-only (no binding yet); logout is bound. The ID
// token is sent only in the bodies of bootstrap and proof, never as a Bearer.
import { isUuid } from '@gogospend/contracts';

import type { V1Transport } from '../api/client.ts';
import type { AuthApi } from './credentialProvider.ts';

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const exactly = (value: Json, keys: string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const instant = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

export function createAuthApi(transport: V1Transport): AuthApi {
  return {
    challenge: (input) =>
      transport.request('POST', '/v1/auth/challenges', {
        body: input,
        tokenOnly: true,
        validate: (value): value is { challenge_id: string; nonce: string; expires_at: string } =>
          isObject(value) && exactly(value, ['challenge_id', 'nonce', 'expires_at']) && isUuid(value.challenge_id) &&
          typeof value.nonce === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value.nonce) && instant(value.expires_at),
      }),
    bootstrap: (input) =>
      transport.request('POST', '/v1/auth/bootstrap', {
        body: input,
        tokenOnly: true,
        validate: (value): value is { account_id: string; binding: string; session_generation: number } =>
          isObject(value) && exactly(value, ['account_id', 'binding', 'session_generation']) && isUuid(value.account_id) &&
          typeof value.binding === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value.binding) && Number.isSafeInteger(value.session_generation),
      }),
    prove: (input) =>
      transport.request('POST', '/v1/auth/proofs', {
        body: input,
        tokenOnly: true,
        validate: (value): value is { proof_id: string; expires_at: string } => isObject(value) && exactly(value, ['proof_id', 'expires_at']) && isUuid(value.proof_id) && instant(value.expires_at),
      }),
    async logout() {
      await transport.request('POST', '/v1/me/logout', { body: {}, validate: (value): value is null => value === null });
    },
  };
}
