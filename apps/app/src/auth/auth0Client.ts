// The Auth0 port the session uses. A native adapter maps the reviewed SDK
// (Credentials Manager, Universal Login with PKCE) onto it once E1/E2 settle
// the tenant, SDK version and callback domain; until then no adapter is
// installed and the app stays signed out. Never holds an M2M secret.

/** An authorization was cancelled by the user (not an error to retry). */
export class AuthCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled.');
    this.name = 'AuthCancelled';
  }
}

export interface Auth0Port {
  readonly supported: boolean;
  /** Universal Login (PKCE); stores credentials in the SDK's Credentials Manager. Throws AuthCancelled. */
  authorize(): Promise<void>;
  /** A fresh ID token carrying `nonce` (the server challenge), for bootstrap or a purpose proof. Throws AuthCancelled. */
  authorizeWithNonce(nonce: string, options?: { maxAgeSeconds?: number }): Promise<string>;
  /** The current access token, refreshed by the SDK when needed; null when there are no usable credentials. */
  accessToken(): Promise<string | null>;
  /** Forces one refresh (after a 401); false when the refresh grant is gone. */
  refresh(): Promise<boolean>;
  hasCredentials(): Promise<boolean>;
  /** Clears the SDK session and stored credentials. */
  clearSession(): Promise<void>;
}

/**
 * The subset of the reviewed native SDK (react-native-auth0's shape) the port
 * needs. The SDK itself is installed and configured only with E1/E2 approval
 * (tenant, callback domain, version); this mapping is what it plugs into.
 */
export type Auth0SdkLike = {
  webAuth: {
    authorize(parameters: { scope: string; audience: string; nonce?: string; maxAge?: number }): Promise<{ idToken: string }>;
    clearSession(): Promise<void>;
  };
  credentialsManager: {
    getCredentials(scope?: string, minTtl?: number, parameters?: Record<string, unknown>, forceRefresh?: boolean): Promise<{ accessToken: string }>;
    saveCredentials(credentials: unknown): Promise<void>;
    hasValidCredentials(minTtl?: number): Promise<boolean>;
    clearCredentials(): Promise<void>;
  };
};

const SCOPE = 'openid profile email offline_access';
const isCancel = (error: unknown) => {
  const code = (error as { code?: unknown; name?: unknown }).code ?? (error as { name?: unknown }).name;
  return typeof code === 'string' && /cancel/i.test(code);
};

/** Maps the native SDK onto the port: PKCE Universal Login, the Credentials Manager (device-protected), forced refresh. */
export function createAuth0Port(sdk: Auth0SdkLike, audience: string): Auth0Port {
  const login = async (parameters: { nonce?: string; maxAge?: number }) => {
    try {
      const credentials = await sdk.webAuth.authorize({ scope: SCOPE, audience, ...parameters });
      await sdk.credentialsManager.saveCredentials(credentials);
      return credentials;
    } catch (error) {
      if (isCancel(error)) throw new AuthCancelled();
      throw error;
    }
  };
  return {
    supported: true,
    async authorize() {
      await login({});
    },
    async authorizeWithNonce(nonce, options) {
      return (await login({ nonce, ...(options?.maxAgeSeconds !== undefined ? { maxAge: options.maxAgeSeconds } : {}) })).idToken;
    },
    async accessToken() {
      try {
        return (await sdk.credentialsManager.getCredentials()).accessToken;
      } catch {
        return null;
      }
    },
    async refresh() {
      try {
        await sdk.credentialsManager.getCredentials(undefined, 0, {}, true);
        return true;
      } catch {
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
