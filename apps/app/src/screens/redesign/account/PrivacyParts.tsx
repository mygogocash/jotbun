// The services Privacy and data runs on (R6), and the app's own wiring of
// them: the P4 export and P5 deletion clients (privacy.ts, deletion.ts) over
// a v1 transport built exactly as the shared one is (sharedV1.ts), the share
// sheet for the verified file, and today's sign-out. Tests and the catalogue
// pass fakes instead.
import * as Crypto from 'expo-crypto';
import { Share } from 'react-native';

import { createV1Transport } from '@mobile/api/client';
import { v1ClientVersion } from '@mobile/api/sharedV1';
import type { Proof } from '@mobile/auth/reauthentication';
import { v1SessionCredentials } from '@mobile/auth/session';
import { getMobileEnv } from '@mobile/config/env';
import { createDeletionResources } from '@mobile/spend/v1/deletion';
import type { DeletionResources } from '@mobile/spend/v1/deletion';
import { createPrivacyResources } from '@mobile/spend/v1/privacy';
import type { PrivacyResources } from '@mobile/spend/v1/privacy';
import { signOutOfThisDevice } from './SettingsParts';

/** The purpose a fresh sign-in proves (F5's `reauthenticate`). */
export type ProofPurpose = 'export' | 'deletion';

export type PrivacyServices = {
  readonly privacy: PrivacyResources;
  readonly deletion: DeletionResources;
  /**
   * A fresh, purpose-bound proof through the person's own sign-in method
   * (`reauthenticate(purpose, { auth0, api, newId })`); it answers null when
   * they cancel. null itself when this build cannot re-authenticate: the
   * Auth0 SDK arrives with E1/E2, and until then the screen says so instead
   * of pretending.
   */
  readonly reauthenticate: ((purpose: ProofPurpose) => Promise<Proof | null>) | null;
  /** Hands the verified CSV to the person. True once they sent it somewhere; false when they closed the sheet. */
  saveExport(file: { csv: string; fileName: string }): Promise<boolean>;
  /** Ends the session on this device, after a deletion was accepted. */
  signOut(): Promise<void>;
  /** The status checks' pace (privacy.ts's defaults: every 2 s, 30 checks). */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly maxPolls?: number;
};

let shared: { privacy: PrivacyResources; deletion: DeletionResources } | null = null;

/** The export and deletion clients over the app's v1 session, made once. */
function appResources(): { privacy: PrivacyResources; deletion: DeletionResources } {
  if (!shared) {
    const transport = createV1Transport({ baseUrl: getMobileEnv().v1ApiUrl, client: v1ClientVersion(), credentials: v1SessionCredentials });
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
  return { ...appResources(), reauthenticate: null, saveExport: shareExport, signOut: signOutOfThisDevice };
}
