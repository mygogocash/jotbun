// Native Apple and Google sheets. 1C-T5's port takes them as `NativeSignIn`;
// 1C-T7 builds them here from the two modules (`createNativeSignIn`), which
// nativeModules.ts passes in on a phone. Every rule lives here, so Node tests
// it with fakes.
// - Apple, on iOS only (K15): each sign-in first checks that this device has
//   Sign in with Apple, asks only for the email address, gives Apple one fresh
//   nonce and returns that same nonce with the token (Better Auth accepts it
//   raw or as its SHA-256, M13), and returns Apple's authorization code for
//   1C-T13.
// - Google, only once its client ids are set (Q1: after the development-build
//   check); iOS needs its own client id as well. It is configured once, at the
//   first sign-in, and on Android Play services are checked first.
// - Closing either sheet is AuthCancelled; a sheet that gives no token is
//   AuthRefused('REFUSED'); any other failure passes through as it is, which
//   the provider reads as a failed sign-in. Nothing here logs or keeps a
//   token, a nonce or a code.
import { AuthCancelled, AuthRefused } from './betterAuthPort.ts'

export type NativeIdToken = { token: string; nonce?: string; accessToken?: string; authorizationCode?: string }

export type NativeSignIn = { apple: (() => Promise<NativeIdToken>) | null; google: (() => Promise<NativeIdToken>) | null }

export const NO_NATIVE_SIGN_IN: NativeSignIn = { apple: null, google: null }

/** The calls of expo-apple-authentication that the sign-in uses. */
export type AppleModuleLike = {
  isAvailableAsync(): Promise<boolean>
  signInAsync(o: { requestedScopes: number[]; nonce: string }): Promise<{ identityToken: string | null; authorizationCode: string | null }>
  EMAIL_SCOPE: number
}

/** The calls of @react-native-google-signin/google-signin's `GoogleSignin` that the sign-in uses. */
export type GoogleModuleLike = {
  configure(o: { webClientId: string; iosClientId?: string }): void
  hasPlayServices(): Promise<boolean>
  signIn(): Promise<{ type: 'success'; data: { idToken: string | null } } | { type: 'cancelled' }>
}

type NativeOptions = {
  platform: 'ios' | 'android' | 'web'
  apple: AppleModuleLike | null
  google: GoogleModuleLike | null
  googleWebClientId: string
  googleIosClientId: string
  randomNonce: () => string
}

/** expo-apple-authentication's code when the person closes Apple's sheet. */
const APPLE_CANCELLED = 'ERR_REQUEST_CANCELED'

function closedByPerson(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === APPLE_CANCELLED
}

function appleSignIn(o: NativeOptions): (() => Promise<NativeIdToken>) | null {
  const apple = o.apple
  if (o.platform !== 'ios' || !apple) return null
  return async () => {
    if (!(await apple.isAvailableAsync())) throw new AuthRefused('REFUSED')
    const nonce = o.randomNonce()
    let answer: { identityToken: string | null; authorizationCode: string | null }
    try {
      answer = await apple.signInAsync({ requestedScopes: [apple.EMAIL_SCOPE], nonce })
    } catch (error) {
      if (closedByPerson(error)) throw new AuthCancelled()
      throw error
    }
    if (!answer.identityToken) throw new AuthRefused('REFUSED')
    if (!answer.authorizationCode) return { token: answer.identityToken, nonce }
    return { token: answer.identityToken, nonce, authorizationCode: answer.authorizationCode }
  }
}

function googleSignIn(o: NativeOptions): (() => Promise<NativeIdToken>) | null {
  const google = o.google
  if (o.platform === 'web' || !google || !o.googleWebClientId) return null
  if (o.platform === 'ios' && !o.googleIosClientId) return null
  let configured = false
  return async () => {
    if (!configured) {
      google.configure(o.googleIosClientId ? { webClientId: o.googleWebClientId, iosClientId: o.googleIosClientId } : { webClientId: o.googleWebClientId })
      configured = true
    }
    if (o.platform === 'android' && !(await google.hasPlayServices())) throw new AuthRefused('REFUSED')
    const answer = await google.signIn()
    if (answer.type === 'cancelled') throw new AuthCancelled()
    if (!answer.data.idToken) throw new AuthRefused('REFUSED')
    return { token: answer.data.idToken }
  }
}

/** The port's Apple and Google sign-ins, from the two modules; null where this build or device cannot offer one. */
export function createNativeSignIn(o: NativeOptions): NativeSignIn {
  return { apple: appleSignIn(o), google: googleSignIn(o) }
}

/** The unverified `sub`, only for the fresh-sign-in pre-check. */
export function idTokenSubject(token: string): string | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof json !== 'object' || json === null || Array.isArray(json) || !('sub' in json)) return null
    return typeof json.sub === 'string' && json.sub.length > 0 ? json.sub : null
  } catch {
    return null
  }
}
