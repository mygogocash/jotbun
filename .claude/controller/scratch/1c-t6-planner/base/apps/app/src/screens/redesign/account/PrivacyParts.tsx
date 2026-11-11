// The services Privacy and data runs on (R6). The app's own wiring of them
// lives in privacyServices.ts, which only the route imports, so importing the
// screen (tests, the catalogue) never loads the app's transport.
import type { Proof } from '@mobile/auth/reauthentication';
import type { DeletionResources } from '@mobile/spend/v1/deletion';
import type { PrivacyResources } from '@mobile/spend/v1/privacy';

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
