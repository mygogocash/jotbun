// The Auth0 port the session uses, shared by the platform adapters
// (auth0Client.ts on iOS/Android, auth0Client.web.ts on the web). Never holds
// an M2M secret.

/** An authorization was cancelled by the user (not an error to retry). */
export class AuthCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled.');
    this.name = 'AuthCancelled';
  }
}

/** Auth0 could not be reached (offline, timeout): not a denial; nothing is locked or erased. */
export class AuthUnavailable extends Error {
  constructor() {
    super('Could not reach the sign-in service. Try again.');
    this.name = 'AuthUnavailable';
  }
}

/** Credentials from an interactive login, held in memory until the server accepts them. */
export type PendingCredentials = { readonly accessToken: string; readonly idToken: string; readonly credentials: unknown };

export interface Auth0Port {
  readonly supported: boolean;
  /** Universal Login (PKCE). Returns the new credentials without storing them. Throws AuthCancelled or AuthUnavailable. */
  authorize(): Promise<PendingCredentials>;
  /** A fresh ID token carrying `nonce` (the server challenge), for bootstrap or a purpose proof. Never stores credentials. */
  authorizeWithNonce(nonce: string, options?: { maxAgeSeconds?: number }): Promise<string>;
  /** Stores credentials from `authorize()` once the server accepted them. */
  saveCredentials(pending: PendingCredentials): Promise<void>;
  /** The current access token, refreshed by the SDK when needed; null when the credentials are gone or denied. Throws AuthUnavailable when Auth0 can't be reached. */
  accessToken(): Promise<string | null>;
  /** Forces one refresh (after a 401); false when the refresh grant is gone. Throws AuthUnavailable when Auth0 can't be reached. */
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
    authorize(parameters: {
      scope: string;
      audience: string;
      nonce?: string;
      maxAge?: number;
      additionalParameters?: Record<string, string>;
    }): Promise<{ idToken: string; accessToken: string }>;
    clearSession(): Promise<void>;
  };
  credentialsManager: {
    getCredentials(scope?: string, minTtl?: number, parameters?: Record<string, unknown>, forceRefresh?: boolean): Promise<{ accessToken: string }>;
    saveCredentials(credentials: unknown): Promise<void>;
    hasValidCredentials(minTtl?: number): Promise<boolean>;
    clearCredentials(): Promise<void>;
  };
};

/** A port for a build without real sign-in: the app stays signed out. */
export function unsupportedAuth0Port(message: string): Auth0Port {
  const unsupported = async (): Promise<never> => {
    throw new Error(message);
  };
  return {
    supported: false,
    authorize: unsupported,
    authorizeWithNonce: unsupported,
    saveCredentials: unsupported,
    accessToken: async () => null,
    refresh: async () => false,
    hasCredentials: async () => false,
    clearSession: async () => undefined,
  };
}
