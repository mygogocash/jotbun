// The app's own wiring of Settings' account services (R6): sign out
// everywhere through the installed credential provider's Better Auth port
// (globalLogout.ts drives it after a fresh sign-in), the fresh sign-in for the
// account's own method, and today's sign-out. Only the route imports this;
// tests and the catalogue pass fakes.
//
// While the account's method has no fresh sign-in on this build (email until
// 1C Task 9, Apple and Google until 1C Task 7), `freshSignIn` is null and
// Settings shows Sign out everywhere disabled, with the reason, as Privacy and
// data does for export and deletion.
import { AuthUnavailable } from '@mobile/auth/betterAuthPort';
import type { GlobalLogoutResources } from '@mobile/auth/globalLogout';
import { getCredentialProvider } from '@mobile/auth/session';
import type { AccountServices } from './SettingsParts';
import { freshSignInOf, signOutOfThisDevice } from './SettingsParts';

/** Sign out everywhere on the provider's current session (the one a fresh sign-in just made). */
const appSessions: GlobalLogoutResources = {
  async signOutEverywhere() {
    const provider = getCredentialProvider();
    if (!provider) throw new AuthUnavailable();
    await provider.port().signOutEverywhere();
  },
};

export function appAccountServices(): AccountServices {
  return { signInMethod: null, signOut: signOutOfThisDevice, sessions: appSessions, freshSignIn: freshSignInOf(getCredentialProvider()) };
}
