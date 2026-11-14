import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient, jwtClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

import { getMobileEnv } from '../config/env.ts';
import { createBetterAuthPort, createdOf } from './betterAuthPort.ts';
import type { BetterAuthPort, ClientResult, DeviceDto, SignInMethod } from './betterAuthPort.ts';
import { jotbunAccountClient } from './jotbunAccountClient.ts';
import { appNativeSignIn } from './nativeModules';
import type { NativeIdToken } from './nativeSignIn.ts';

const storage = {
  getItem(key: string): string | null {
    return SecureStore.getItem(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  setItem(key: string, value: string) {
    return SecureStore.setItem(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
};

function methodsOf(error: object): SignInMethod[] | undefined {
  for (const [key, value] of Object.entries(error)) {
    if (key !== 'methods' || !Array.isArray(value)) continue;
    return value.filter((item): item is SignInMethod => item === 'apple' || item === 'google' || item === 'email');
  }
  return undefined;
}

function clientError(error: object & { status: number }): ClientResult<never>['error'] {
  let code: string | undefined;
  let message: string | undefined;
  for (const [key, value] of Object.entries(error)) {
    if (key === 'code' && typeof value === 'string') code = value;
    if (key === 'message' && typeof value === 'string') message = value;
  }
  const methods = methodsOf(error);
  return methods === undefined ? { status: error.status, code, message } : { status: error.status, code, message, methods };
}

function idTokenOf(idToken: NativeIdToken): { token: string; nonce?: string; accessToken?: string } {
  return {
    token: idToken.token,
    ...(idToken.nonce === undefined ? {} : { nonce: idToken.nonce }),
    ...(idToken.accessToken === undefined ? {} : { accessToken: idToken.accessToken }),
  };
}

function answered<T>(result: { data: T; error: null } | { data: null; error: object & { status: number } }): ClientResult<T> {
  if (result.error) return { data: null, error: clientError(result.error) };
  return { data: result.data, error: null };
}

const client = createAuthClient({
  baseURL: getMobileEnv().authUrl,
  plugins: [expoClient({ scheme: 'gogospend', storagePrefix: 'jotbun', storage }), emailOTPClient(), jwtClient(), jotbunAccountClient()],
});

/** iOS and Android: Apple's sheet on iOS, and Google's once this build has its client ids (1C-T7). */
export function createAppAuthPort(): BetterAuthPort {
  return createBetterAuthPort({
    native: appNativeSignIn(),
    client: {
      async sendSignInCode(email) {
        return answered(await client.emailOtp.sendVerificationOtp({ email, type: 'sign-in' }));
      },
      async signInWithCode(email, code) {
        const result = await client.signIn.emailOtp({ email, otp: code });
        if (result.error) return { data: null, error: clientError(result.error) };
        return { data: { created: createdOf(result.data) }, error: null };
      },
      async signInWithIdToken(provider, idToken, requestSignUp) {
        const result = await client.signIn.social({ provider, idToken: idTokenOf(idToken), requestSignUp, disableRedirect: true });
        if (result.error) return { data: null, error: clientError(result.error) };
        return { data: { created: createdOf(result.data) }, error: null };
      },
      async session() {
        const result = await client.getSession();
        if (result.error) return { data: null, error: clientError(result.error) };
        if (!result.data) return { data: null, error: null };
        return { data: { user: { id: result.data.user.id, email: result.data.user.email }, session: { id: result.data.session.id } }, error: null };
      },
      async token() {
        const result = await client.token();
        if (result.error) return { data: null, error: clientError(result.error) };
        if (!result.data) return { data: null, error: { status: 0 } };
        return { data: { token: result.data.token }, error: null };
      },
      async linkedAccounts() {
        const result = await client.listAccounts();
        if (result.error) return { data: null, error: clientError(result.error) };
        return { data: result.data.map((account) => ({ providerId: account.providerId, accountId: account.accountId })), error: null };
      },
      async link(provider, idToken) {
        return answered(await client.linkSocial({ provider, idToken: idTokenOf(idToken), disableRedirect: true }));
      },
      async unlink(provider) {
        return answered(await client.unlinkAccount({ providerId: provider }));
      },
      async signOut() {
        return answered(await client.signOut());
      },
      async devices() {
        const result = await client.devices();
        if (result.error) return { data: null, error: clientError(result.error) };
        return { data: { devices: deviceList(result.data) }, error: null };
      },
      async signOutDevice(id) {
        return answered(await client.signOutDevice({ id }));
      },
      async signOutOtherDevices() {
        const result = await client.signOutOtherDevices();
        if (result.error) return { data: null, error: clientError(result.error) };
        return { data: { signed_out: signedOutOf(result.data) }, error: null };
      },
      async signOutEverywhere() {
        return answered(await client.signOutEverywhere());
      },
      hasStoredSession() {
        return client.getCookie() !== '';
      },
    },
  });
}

function deviceList(data: unknown): DeviceDto[] {
  if (typeof data !== 'object' || data === null || !('devices' in data) || !Array.isArray(data.devices)) return [];
  const devices: DeviceDto[] = [];
  for (const item of data.devices) {
    if (typeof item !== 'object' || item === null) continue;
    const id = field(item, 'id');
    const current = field(item, 'current');
    const signedIn = field(item, 'signed_in_at');
    const lastActive = field(item, 'last_active_at');
    const agent = field(item, 'user_agent');
    if (typeof id !== 'string' || typeof current !== 'boolean' || typeof signedIn !== 'string' || typeof lastActive !== 'string') continue;
    devices.push({ id, current, signed_in_at: signedIn, last_active_at: lastActive, user_agent: typeof agent === 'string' || agent === null ? agent : null });
  }
  return devices;
}

function signedOutOf(data: unknown): number {
  if (typeof data !== 'object' || data === null || !('signed_out' in data) || typeof data.signed_out !== 'number') return 0;
  return data.signed_out;
}

function field(value: object, key: string): unknown {
  for (const [name, item] of Object.entries(value)) if (name === key) return item;
  return undefined;
}
