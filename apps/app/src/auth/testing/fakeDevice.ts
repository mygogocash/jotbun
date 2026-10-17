// A fake device for session tests: the native SDK's shape behind the real
// adapter (one Credentials Manager slot), a binding store, an epoch store and
// the auth endpoints. Logins as "A" or "B" bootstrap to those accounts.
import { createAuth0Port } from '../auth0Client.ts';
import type { Auth0SdkLike } from '../auth0Port.ts';
import type { AuthApi, BindingStore, EpochStore } from '../credentialProvider.ts';

export const ACCOUNT_A = '0a000000-0000-4000-8000-00000000000a';
export const ACCOUNT_B = '0b000000-0000-4000-8000-00000000000b';
export const BIND_A = 'a'.repeat(43);
export const BIND_A2 = 'c'.repeat(43);
export const BIND_B = 'b'.repeat(43);

export type Stored = { accountId: string; binding: string };

const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
};

export function fakeDevice(options: { stored?: Stored | null; sdkUser?: string | null } = {}) {
  const calls: string[] = [];
  const state = {
    nextUser: 'A',
    cancel: false,
    offline: false,
    revoked: false,
    bootstrapError: null as unknown,
    proveError: null as unknown,
    clearError: null as unknown,
    saveError: null as unknown,
    bindingFor: { A: BIND_A, B: BIND_B } as Record<string, string>,
  };
  let stored = options.stored ?? null;
  let sdkUser = options.sdkUser ?? null;
  let loads = 0;
  let loadGate: Promise<void> | null = null;
  let bootstrapGate: Promise<void> | null = null;
  let nonces = 0;
  const epoch = { value: 0 };
  const networkError = () => Object.assign(new Error('Network request failed'), { code: 'NETWORK_ERROR' });

  const sdk: Auth0SdkLike = {
    webAuth: {
      async authorize(parameters) {
        calls.push(`login:${parameters.nonce ? 'nonce' : 'plain'}:${parameters.additionalParameters?.max_age ?? parameters.maxAge ?? '-'}`);
        if (state.cancel) throw Object.assign(new Error('User cancelled the Auth'), { code: 'a0.session.user_cancelled' });
        if (state.offline) throw networkError();
        const user = state.nextUser;
        return { idToken: `id:${user}:${parameters.nonce ?? 'none'}`, accessToken: `at-${user}` };
      },
      clearSession: async () => undefined,
    },
    credentialsManager: {
      async getCredentials(_scope, _minTtl, _parameters, forceRefresh) {
        if (state.offline) throw networkError();
        if (!sdkUser) throw Object.assign(new Error('No credentials were found'), { code: 'a0.credential_manager.no_credentials' });
        if (forceRefresh) {
          calls.push('sdk:refresh');
          if (state.revoked) throw Object.assign(new Error('Unknown or invalid refresh token.'), { code: 'invalid_grant' });
        }
        return { accessToken: `at-${sdkUser}` };
      },
      async saveCredentials(credentials) {
        if (state.saveError) throw state.saveError;
        sdkUser = (credentials as { accessToken: string }).accessToken.slice(3);
        calls.push(`sdk:save:${sdkUser}`);
      },
      hasValidCredentials: async () => sdkUser !== null,
      async clearCredentials() {
        sdkUser = null;
        calls.push('sdk:clear');
      },
    },
  };

  const bindings: BindingStore = {
    async load() {
      loads += 1;
      // A real SecureStore read returns what was there when it started.
      const value = stored;
      if (loadGate) await loadGate;
      return value;
    },
    async save(value) {
      stored = value;
    },
    async clear() {
      if (state.clearError) throw state.clearError;
      stored = null;
    },
  };

  const api: AuthApi = {
    async challenge(input, auth) {
      calls.push(`challenge:${input.purpose}:${auth?.accessToken ?? 'session'}`);
      nonces += 1;
      return { challenge_id: '0c000000-0000-4000-8000-00000000000c', nonce: `nonce-${nonces}`, expires_at: '2026-10-17T00:05:00Z' };
    },
    async bootstrap(input, auth) {
      calls.push(`bootstrap:${input.id_token}:${auth?.accessToken ?? 'session'}`);
      if (bootstrapGate) await bootstrapGate;
      if (state.bootstrapError) throw state.bootstrapError;
      const user = input.id_token.split(':')[1];
      return { account_id: user === 'A' ? ACCOUNT_A : ACCOUNT_B, binding: state.bindingFor[user], session_generation: 0 };
    },
    async prove(input) {
      calls.push(`prove:${input.id_token}`);
      if (state.proveError) throw state.proveError;
      return { proof_id: '0d000000-0000-4000-8000-00000000000d', expires_at: '2026-10-17T00:05:00Z' };
    },
    async logout(target) {
      calls.push(`logout:${target ? `${target.binding}:${target.accessToken}` : 'session'}`);
    },
  };

  const epochs: EpochStore = {
    load: async () => epoch.value,
    save: async (value) => void (epoch.value = value),
  };

  let ids = 0;
  return {
    deps: { auth0: createAuth0Port(sdk, 'https://api.gogospend.test'), bindings, api, newId: () => `id-${(ids += 1)}`, epochs },
    calls,
    state,
    stored: () => stored,
    sdkUser: () => sdkUser,
    loads: () => loads,
    persistedEpoch: () => epoch.value,
    gateLoad() {
      const g = gate();
      loadGate = g.promise;
      return () => {
        loadGate = null;
        g.release();
      };
    },
    gateBootstrap() {
      const g = gate();
      bootstrapGate = g.promise;
      return () => {
        bootstrapGate = null;
        g.release();
      };
    },
  };
}

export const tick = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));
