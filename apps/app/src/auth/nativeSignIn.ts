// Native Apple and Google sheets. Task 7 fills these in; until then both are null.
export type NativeIdToken = { token: string; nonce?: string; accessToken?: string; authorizationCode?: string }

export type NativeSignIn = { apple: (() => Promise<NativeIdToken>) | null; google: (() => Promise<NativeIdToken>) | null }

export const NO_NATIVE_SIGN_IN: NativeSignIn = { apple: null, google: null }

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
