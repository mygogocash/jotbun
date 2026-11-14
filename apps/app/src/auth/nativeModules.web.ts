// The web build has no native sign-in (1C-T7): Metro and the render tests load
// this file in place of nativeModules.ts, so neither native module is loaded
// off the phone.
import { NO_NATIVE_SIGN_IN } from './nativeSignIn.ts';
import type { NativeSignIn } from './nativeSignIn.ts';

export function appNativeSignIn(): NativeSignIn {
  return NO_NATIVE_SIGN_IN;
}
