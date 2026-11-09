// 1C-T8 RED stub (R52): every fresh sign-in answers cancelled, with no sheet.
import type { ReactNode } from 'react';

import type { CredentialProvider, FreshOutcome } from '@mobile/auth/credentialProvider';

export type FreshSignInProvider = Pick<CredentialProvider, 'account' | 'freshSignIn' | 'sendEmailCode' | 'signIn'>;

export function useFreshSignIn(_provider: FreshSignInProvider): { freshSignIn(): Promise<FreshOutcome>; sheet: ReactNode } {
  return { freshSignIn: async () => 'cancelled', sheet: null };
}
