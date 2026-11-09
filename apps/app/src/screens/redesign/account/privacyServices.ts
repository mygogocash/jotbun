// The app's own wiring of Privacy and data's services (R6): the P4 export and
// P5 deletion clients (privacy.ts, deletion.ts) over a v1 transport built
// exactly as the shared one is (sharedV1.ts), the installed credential
// provider's fresh sign-in and request credentials, random ids, the share
// sheet for the verified file, and today's sign-out. Only the route imports
// this; tests and the catalogue pass fakes.
import * as Crypto from 'expo-crypto';
import { Share } from 'react-native';

import { getAnalytics } from '@mobile/analytics/bus';
import { createV1Transport } from '@mobile/api/client';
import { v1ClientVersion } from '@mobile/api/sharedV1';
import { getCredentialProvider, v1SessionCredentials } from '@mobile/auth/session';
import { getMobileEnv } from '@mobile/config/env';
import { createDeletionResources } from '@mobile/spend/v1/deletion';
import type { DeletionResources } from '@mobile/spend/v1/deletion';
import { createPrivacyResources } from '@mobile/spend/v1/privacy';
import type { PrivacyResources } from '@mobile/spend/v1/privacy';
import type { PrivacyServices } from './PrivacyParts';
import { freshSignInOf, signOutOfThisDevice } from './SettingsParts';

let shared: { privacy: PrivacyResources; deletion: DeletionResources } | null = null;

/** The export and deletion clients over the app's v1 session, made once. */
function appResources(): { privacy: PrivacyResources; deletion: DeletionResources } {
  if (!shared) {
    const transport = createV1Transport({
      baseUrl: getMobileEnv().v1ApiUrl,
      client: v1ClientVersion(),
      credentials: v1SessionCredentials,
      // As the shared transport has them (1D-T8, from 1C-T6's and 1D-T6's reviews): a development build may reach
      // `wrangler dev` on the LAN (plan 1D, L8), and server events stay off unless this phone's answer is yes (L4).
      allowLanHttp: __DEV__,
      analyticsOff: () => getAnalytics()?.allowsAnalytics() !== true,
    });
    shared = {
      privacy: createPrivacyResources(transport, { sha256Hex: (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text) }),
      deletion: createDeletionResources(transport),
    };
  }
  return shared;
}

/**
 * The verified file, through the system share sheet (React Native's own
 * Share: no new package), where the person saves or sends it. The file's
 * text goes as the shared message.
 */
async function shareExport({ csv, fileName }: { csv: string; fileName: string }): Promise<boolean> {
  const result = await Share.share({ title: fileName, message: csv });
  return result.action === Share.sharedAction;
}

export function appPrivacyServices(): PrivacyServices {
  return {
    ...appResources(),
    freshSignIn: freshSignInOf(getCredentialProvider()),
    credentials: async () => (await getCredentialProvider()?.requestCredentials()) ?? null,
    newId: () => Crypto.randomUUID(),
    saveExport: shareExport,
    signOut: signOutOfThisDevice,
  };
}
