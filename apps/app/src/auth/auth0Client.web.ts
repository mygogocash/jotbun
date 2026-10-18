// The web preview has no real sign-in: Auth0 is reported unsupported and the
// app stays in its signed-out or demo preview. Same exports as the native
// adapter (auth0Client.ts), so callers never branch on the platform.
import { unsupportedAuth0Port } from './auth0Port.ts';
import type { Auth0Port, Auth0SdkLike } from './auth0Port.ts';

export { AuthCancelled, AuthUnavailable } from './auth0Port.ts';
export type { Auth0Port, Auth0SdkLike, PendingCredentials } from './auth0Port.ts';

export function createAuth0Port(_sdk: Auth0SdkLike | null, _audience: string): Auth0Port {
  return unsupportedAuth0Port('Real sign-in is available in the Jotbun app on iOS and Android.');
}
