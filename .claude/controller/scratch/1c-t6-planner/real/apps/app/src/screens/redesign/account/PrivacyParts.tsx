// The services Privacy and data runs on (R6). The app's own wiring of them
// lives in privacyServices.ts, which only the route imports, so importing the
// screen (tests, the catalogue) never loads the app's transport.
import type { FreshOutcome, RequestCredentials } from '@mobile/auth/credentialProvider';
import type { DeletionResources } from '@mobile/spend/v1/deletion';
import type { PrivacyResources } from '@mobile/spend/v1/privacy';

export type PrivacyServices = {
  readonly privacy: PrivacyResources;
  readonly deletion: DeletionResources;
  /**
   * A fresh sign-in with the account's own method (the installed credential
   * provider's). null while that method has no fresh sign-in on this build
   * (`freshSignInOf`), and the screen then says so instead of pretending.
   */
  readonly freshSignIn: (() => Promise<FreshOutcome>) | null;
  /** The new session's token and id, read together after the fresh sign-in (the provider's requestCredentials()); null with no usable session. */
  credentials(): Promise<RequestCredentials | null>;
  /** A random UUID: each request's command id and proof id. */
  newId(): string;
  /** Hands the verified CSV to the person. True once they sent it somewhere; false when they closed the sheet. */
  saveExport(file: { csv: string; fileName: string }): Promise<boolean>;
  /** Ends the session on this device, after a deletion was accepted. */
  signOut(): Promise<void>;
  /** The status checks' pace (privacy.ts's defaults: every 2 s, 30 checks). */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly maxPolls?: number;
};
