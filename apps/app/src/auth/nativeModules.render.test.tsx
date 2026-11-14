// 1C-T7: the app's two native sign-in modules on a phone (nativeModules.ts),
// over fakes for expo-apple-authentication, Google's package and expo-crypto:
// Apple on iOS only, with the email scope and a nonce from expo-crypto; Google
// only once its client ids are set, its module loaded at the first Google
// sign-in and never before, and configured once as it loads (Q1); and the web
// build's own file (nativeModules.web.ts), which offers neither.
import { Platform } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ googleLoads: 0, calls: [] as string[], nonces: 0 }));

vi.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: async () => {
    fakes.calls.push('apple:isAvailableAsync');
    return true;
  },
  signInAsync: async (options: unknown) => {
    fakes.calls.push(`apple:signInAsync:${JSON.stringify(options)}`);
    return { identityToken: 'apple-identity-token', authorizationCode: 'apple-code' };
  },
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => {
    fakes.nonces += 1;
    return `nonce-${fakes.nonces}`;
  },
}));

/** Google's package, counted each time it loads. */
function mockGoogle() {
  vi.doMock('@react-native-google-signin/google-signin', () => {
    fakes.googleLoads += 1;
    return {
      GoogleSignin: {
        configure: (options: unknown) => {
          fakes.calls.push(`google:configure:${JSON.stringify(options)}`);
        },
        hasPlayServices: async () => {
          fakes.calls.push('google:hasPlayServices');
          return true;
        },
        signIn: async () => {
          fakes.calls.push('google:signIn');
          return { type: 'success', data: { idToken: 'google-id-token' } };
        },
      },
    };
  });
}

const KEYS = ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'] as const;
const saved = KEYS.map((key) => process.env[key]);
const os = Platform.OS;
const onPlatform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true, writable: true });

/** The phone's file itself (not its web twin), loaded fresh, so nothing is remembered from another case. */
const phoneModules = () => import('@mobile/auth/nativeModules.ts');

beforeEach(() => {
  vi.resetModules();
  mockGoogle();
  fakes.googleLoads = 0;
  fakes.calls.length = 0;
  fakes.nonces = 0;
  for (const key of KEYS) delete process.env[key];
});
afterEach(() => {
  KEYS.forEach((key, index) => {
    const value = saved[index];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  onPlatform(os);
});

test('on an iPhone, Apple is offered, and Google only once both its client ids are set; Google loads at its first sign-in, not before', async () => {
  onPlatform('ios');
  const { appNativeSignIn } = await phoneModules();
  const bare = appNativeSignIn();
  expect([typeof bare.apple, bare.google]).toEqual(['function', null]);
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
  expect(appNativeSignIn().google).toBeNull();
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client';
  const native = appNativeSignIn();
  // A load started now would have finished well within this wait (its import() resolves in a few milliseconds).
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect([typeof native.google, fakes.googleLoads]).toEqual(['function', 0]);
  expect(await native.google?.()).toEqual({ token: 'google-id-token' });
  expect([fakes.googleLoads, fakes.calls]).toEqual([1, ['google:configure:{"webClientId":"web-client","iosClientId":"ios-client"}', 'google:signIn']]);
});

test("Apple's sheet gets the email scope and a fresh nonce from expo-crypto, and that nonce comes back with the token", async () => {
  onPlatform('ios');
  const native = (await phoneModules()).appNativeSignIn();
  expect(typeof native.apple).toBe('function');
  const tokens = [await native.apple?.(), await native.apple?.()];
  expect(tokens).toEqual([
    { token: 'apple-identity-token', nonce: 'nonce-1', authorizationCode: 'apple-code' },
    { token: 'apple-identity-token', nonce: 'nonce-2', authorizationCode: 'apple-code' },
  ]);
  expect(fakes.calls).toEqual([
    'apple:isAvailableAsync',
    'apple:signInAsync:{"requestedScopes":[1],"nonce":"nonce-1"}',
    'apple:isAvailableAsync',
    'apple:signInAsync:{"requestedScopes":[1],"nonce":"nonce-2"}',
  ]);
});

test('on Android, Apple is not offered, and Google is, with its web client id alone, loaded and configured once', async () => {
  onPlatform('android');
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
  const native = (await phoneModules()).appNativeSignIn();
  expect([native.apple, typeof native.google]).toEqual([null, 'function']);
  const tokens = [await native.google?.(), await native.google?.()];
  expect(tokens).toEqual([{ token: 'google-id-token' }, { token: 'google-id-token' }]);
  expect([fakes.googleLoads, fakes.calls]).toEqual([1, ['google:configure:{"webClientId":"web-client"}', 'google:hasPlayServices', 'google:signIn', 'google:hasPlayServices', 'google:signIn']]);
});

test('off the phone neither is offered and nothing loads, and the web build has its own file that offers neither', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client';
  onPlatform('web');
  expect((await phoneModules()).appNativeSignIn()).toEqual({ apple: null, google: null });
  // The web file, as the web build resolves `./nativeModules`: nothing, even where the phone's file would offer both.
  onPlatform('ios');
  const web = await import('@mobile/auth/nativeModules');
  expect(web.appNativeSignIn()).toEqual({ apple: null, google: null });
  expect([fakes.googleLoads, fakes.calls]).toEqual([0, []]);
});
