// 1C-T8: a fresh sign-in with the account's own method, before a sensitive
// action (K14, R43). `freshSignIn()` opens ConfirmItsYouSheet for the
// account's method (Apple and Google run their native sheet from it; email
// gets the code step) and resolves once with its outcome: `fresh`,
// `cancelled` when the sheet is closed or the screen leaves, or why it did not
// go through (`unavailable` means sign in again: 1C-T5's note). A second call
// while one is open answers the same promise. The caller renders `sheet`.
// 1C-T9 passes it to Settings, Privacy and Devices; P6B-T8 swaps the sheet for
// a tray in the Bun Wallet look.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { SignInMethod } from '@mobile/auth/betterAuthPort';
import type { CredentialProvider, FreshOutcome } from '@mobile/auth/credentialProvider';
import { ConfirmItsYouSheet } from './ConfirmItsYouSheet';

/** The provider's account (whose method and address), its fresh sign-in and the email code. */
export type FreshSignInProvider = Pick<CredentialProvider, 'account' | 'freshSignIn' | 'sendEmailCode' | 'signIn'>;

type Open = { readonly id: number; readonly method: SignInMethod; readonly email: string };
type Waiting = { readonly promise: Promise<FreshOutcome>; readonly resolve: (outcome: FreshOutcome) => void };

export function useFreshSignIn(provider: FreshSignInProvider): { freshSignIn(): Promise<FreshOutcome>; sheet: ReactNode } {
  const [open, setOpen] = useState<Open | null>(null);
  const waiting = useRef<Waiting | null>(null);
  const opened = useRef(0);

  const freshSignIn = useCallback((): Promise<FreshOutcome> => {
    if (waiting.current) return waiting.current.promise;
    const account = provider.account();
    if (account === null) return Promise.resolve('failed');
    let resolve: (outcome: FreshOutcome) => void = () => undefined;
    const promise = new Promise<FreshOutcome>((done) => { resolve = done; });
    waiting.current = { promise, resolve };
    opened.current += 1;
    setOpen({ id: opened.current, method: account.method, email: account.email });
    return promise;
  }, [provider]);

  const done = useCallback((outcome: FreshOutcome) => {
    const current = waiting.current;
    waiting.current = null;
    setOpen(null);
    current?.resolve(outcome);
  }, []);

  // A screen that leaves while the sheet is open cancels its fresh sign-in.
  useEffect(() => () => {
    const current = waiting.current;
    waiting.current = null;
    current?.resolve('cancelled');
  }, []);

  const sheet = open === null
    ? null
    : <ConfirmItsYouSheet key={open.id} visible method={open.method} email={open.email} provider={provider} onDone={done} />;
  return { freshSignIn, sheet };
}
