// The two native sign-in modules on a phone (1C-T7). appNativeSignIn() hands
// them to createNativeSignIn with this build's Google client ids, and
// betterAuthClient.ts gives the result to the Better Auth port. Off the phone
// nativeModules.web.ts stands in.
// - Apple's module (Expo's own) loads with this file. Where its native half is
//   missing it answers "not available", which the sign-in reads as a refusal.
// - Google's module loads at the first Google sign-in, never at launch, and is
//   configured as it loads: its native half throws while loading in a build
//   without it (TurboModuleRegistry.getEnforcing). A build whose Google ids
//   are unset never offers Google, so it never loads the module (Q1), and a
//   build made without the package still starts.
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { getMobileEnv } from '../config/env.ts';
import { createNativeSignIn } from './nativeSignIn.ts';
import type { AppleModuleLike, GoogleModuleLike, NativeSignIn } from './nativeSignIn.ts';

type GoogleSignin = typeof import('@react-native-google-signin/google-signin').GoogleSignin;
type GoogleSettings = Parameters<GoogleModuleLike['configure']>[0];

const apple: AppleModuleLike = {
  isAvailableAsync: () => AppleAuthentication.isAvailableAsync(),
  signInAsync: (o) => AppleAuthentication.signInAsync(o),
  EMAIL_SCOPE: AppleAuthentication.AppleAuthenticationScope.EMAIL,
};

let settings: GoogleSettings | null = null;
let loading: Promise<GoogleSignin> | null = null;

/** Google's module: loaded once, at its first use, and configured with the settings given before. */
function loadGoogle(): Promise<GoogleSignin> {
  loading ??= import('@react-native-google-signin/google-signin').then(({ GoogleSignin }) => {
    if (settings) GoogleSignin.configure(settings);
    return GoogleSignin;
  });
  return loading;
}

const google: GoogleModuleLike = {
  configure(o) {
    settings = o;
  },
  hasPlayServices: async () => (await loadGoogle()).hasPlayServices(),
  signIn: async () => (await loadGoogle()).signIn(),
};

function platform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/** The port's Apple and Google sign-ins on this phone, with a fresh nonce for each Apple sign-in from expo-crypto. */
export function appNativeSignIn(): NativeSignIn {
  const env = getMobileEnv();
  return createNativeSignIn({
    platform: platform(),
    apple,
    google,
    googleWebClientId: env.googleWebClientId,
    googleIosClientId: env.googleIosClientId,
    randomNonce: () => Crypto.randomUUID(),
  });
}
