import * as SecureStore from 'expo-secure-store';

import { createAppAuthPort } from './betterAuthClient';
import { createCredentialProvider } from './credentialProvider.ts';
import type { CredentialProvider, RequestCredentials } from './credentialProvider.ts';
import { installCredentialProvider } from './session.ts';
import { createSecureEpochStore, createSecureSessionStore } from './sessionStore.ts';

let installed: CredentialProvider | null = null;

/** POST /v1/me/logout with the session's own credentials. The vault answers 204, which the transport reads as null. */
async function logoutVault(credentials: RequestCredentials): Promise<void> {
  const shared = await import('../api/sharedV1.ts');
  await shared.getSharedV1Transport().request('POST', '/v1/me/logout', {
    body: {},
    credentials: { accessToken: credentials.accessToken, binding: credentials.sessionId },
    validate: (value): value is null => value === null,
  });
}

/** Once, at launch: the Better Auth port, the on-device session, and a hydrate. */
export function installAppAuth(): CredentialProvider {
  if (installed) return installed;
  const provider = createCredentialProvider({
    port: createAppAuthPort(),
    sessions: createSecureSessionStore(SecureStore, SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY),
    epochs: createSecureEpochStore(SecureStore, SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY),
    logoutVault,
  });
  installCredentialProvider(provider);
  void provider.hydrate();
  installed = provider;
  return provider;
}
