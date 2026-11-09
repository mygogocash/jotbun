// The app's own wiring of Settings' account services (R6): the F6a global
// sign-out client (globalLogout.ts) over a v1 transport built exactly as the
// shared one is (sharedV1.ts), and today's sign-out. Only the route imports
// this; tests and the catalogue pass fakes.
//
// Today's build has no fresh sign-in (the Auth0 SDK arrives with E1/E2), so
// `reauthenticate` is null and Settings shows Sign out everywhere disabled,
// with the reason, as Privacy and data does for export and deletion.
import { createV1Transport } from '@mobile/api/client';
import { v1ClientVersion } from '@mobile/api/sharedV1';
import { createGlobalLogoutResources } from '@mobile/auth/globalLogout';
import type { GlobalLogoutResources } from '@mobile/auth/globalLogout';
import { v1SessionCredentials } from '@mobile/auth/session';
import { getMobileEnv } from '@mobile/config/env';
import type { AccountServices } from './SettingsParts';
import { signOutOfThisDevice } from './SettingsParts';

let shared: GlobalLogoutResources | null = null;

/** The global sign-out client over the app's v1 session, made once. */
function appSessions(): GlobalLogoutResources {
  shared ??= createGlobalLogoutResources(createV1Transport({ baseUrl: getMobileEnv().v1ApiUrl, client: v1ClientVersion(), credentials: v1SessionCredentials }));
  return shared;
}

export function appAccountServices(): AccountServices {
  return { signInMethod: null, signOut: signOutOfThisDevice, sessions: appSessions(), reauthenticate: null };
}
