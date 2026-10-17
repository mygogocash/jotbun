// The web preview has no real sign-in: Auth0 is reported unsupported and the
// app stays in its signed-out or demo preview.
import type { Auth0Port } from './auth0Client.ts';

export { AuthCancelled } from './auth0Client.ts';
export type { Auth0Port } from './auth0Client.ts';

export function webAuth0Port(): Auth0Port {
  const unsupported = async (): Promise<never> => {
    throw new Error('Real sign-in is available in the Jotbun app on iOS and Android.');
  };
  return {
    supported: false,
    authorize: unsupported,
    authorizeWithNonce: unsupported,
    accessToken: async () => null,
    refresh: async () => false,
    hasCredentials: async () => false,
    clearSession: async () => undefined,
  };
}
