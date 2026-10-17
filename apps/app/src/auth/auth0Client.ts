// The native (iOS/Android) Auth0 adapter. It maps the reviewed SDK
// (Credentials Manager, Universal Login with PKCE) onto the port once E1/E2
// settle the tenant, SDK version and callback domain; until then no SDK is
// passed and the port reports real sign-in unsupported. Metro uses
// auth0Client.web.ts on the web, which has the same exports. Never holds an
// M2M secret.
import { AuthCancelled, AuthUnavailable, unsupportedAuth0Port } from './auth0Port.ts';
import type { Auth0Port, Auth0SdkLike, PendingCredentials } from './auth0Port.ts';

export { AuthCancelled, AuthUnavailable } from './auth0Port.ts';
export type { Auth0Port, Auth0SdkLike, PendingCredentials } from './auth0Port.ts';

const SCOPE = 'openid profile email offline_access';

const describe = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) return String(error);
  const { code, type, name, message } = error as { code?: unknown; type?: unknown; name?: unknown; message?: unknown };
  return [code, type, name, message].filter((part) => typeof part === 'string').join(' ');
};
const isCancel = (error: unknown) => {
  const code = (error as { code?: unknown; name?: unknown }).code ?? (error as { name?: unknown }).name;
  return typeof code === 'string' && /cancel/i.test(code);
};
/**
 * Auth0 could not be reached (offline, timeout): not a denial. Anything else
 * (no credentials, invalid_grant, an unknown SDK error) is a denial, which
 * locks without erasing and can be lifted by a later hydrate or refresh. The
 * SDK's exact error codes are checked again when the SDK is wired (E1/E2).
 */
const isUnreachable = (error: unknown) => /network|offline|internet|timed? ?out|unreachable|NSURLErrorDomain/i.test(describe(error));

/** Maps the native SDK onto the port: PKCE Universal Login, the Credentials Manager (device-protected), forced refresh. */
export function createAuth0Port(sdk: Auth0SdkLike | null, audience: string): Auth0Port {
  if (!sdk) return unsupportedAuth0Port('Real sign-in is not configured in this build.');
  // A login never stores anything: its credentials stay pending until the
  // server accepted them (saveCredentials), so a cancelled or refused login
  // and a purpose proof leave the session's own credentials untouched.
  const login = async (parameters: { nonce?: string; additionalParameters?: Record<string, string> }) => {
    try {
      return await sdk.webAuth.authorize({ scope: SCOPE, audience, ...parameters });
    } catch (error) {
      if (isCancel(error)) throw new AuthCancelled();
      if (isUnreachable(error)) throw new AuthUnavailable();
      throw error;
    }
  };
  return {
    supported: true,
    async authorize(): Promise<PendingCredentials> {
      const credentials = await login({});
      return { accessToken: credentials.accessToken, idToken: credentials.idToken, credentials };
    },
    async authorizeWithNonce(nonce, options) {
      // Sent as explicit authorize parameters (max_age, and prompt=login for a
      // fresh login) rather than the typed maxAge, which a native bridge may
      // drop when it is 0.
      const maxAge = options?.maxAgeSeconds;
      const fresh = maxAge === undefined ? undefined : { max_age: String(maxAge), ...(maxAge === 0 ? { prompt: 'login' } : {}) };
      return (await login({ nonce, ...(fresh ? { additionalParameters: fresh } : {}) })).idToken;
    },
    async saveCredentials(pending) {
      await sdk.credentialsManager.saveCredentials(pending.credentials);
    },
    async accessToken() {
      try {
        return (await sdk.credentialsManager.getCredentials()).accessToken;
      } catch (error) {
        if (isUnreachable(error)) throw new AuthUnavailable();
        return null;
      }
    },
    async refresh() {
      try {
        await sdk.credentialsManager.getCredentials(undefined, 0, {}, true);
        return true;
      } catch (error) {
        if (isUnreachable(error)) throw new AuthUnavailable();
        return false;
      }
    },
    hasCredentials: () => sdk.credentialsManager.hasValidCredentials(),
    async clearSession() {
      await sdk.credentialsManager.clearCredentials();
      await sdk.webAuth.clearSession().catch(() => undefined);
    },
  };
}
