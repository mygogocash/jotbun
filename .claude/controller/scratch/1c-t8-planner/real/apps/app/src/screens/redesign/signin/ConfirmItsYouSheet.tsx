// 1C-T8: "Confirm it's you" (a draft awaiting E2), the sheet `useFreshSignIn`
// opens before a sensitive action (linking or removing a method, sign out
// everywhere, export, deletion; R43, K14).
//
// - Apple and Google: why (the board st-delete's "Apple จะถามยืนยันว่าเป็นคุณ"
//   phrase) and the account's own method as the one button, which opens the
//   native sheet (`provider.freshSignIn`, never a sign-up). If the native
//   sheet is dismissed, the sheet stays for another try. A fresh sign-in that
//   could not reach the service is handed back at once: its new session may
//   be gone, so the phone must sign in again (1C-T5's note), not retry here.
//   Any other failure says so calmly and offers another way, the email code
//   to the account's own address (C14).
// - Email: the code step for the account's own address (EmailCodeForm, fresh).
// - Closing the sheet hands back `cancelled`. P6B-T8 draws it as a tray.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type { SignInMethod } from '@mobile/auth/betterAuthPort';
import type { CredentialProvider, FreshOutcome } from '@mobile/auth/credentialProvider';
import { useCopy } from '@mobile/i18n/useCopy';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { Sheet } from '@mobile/ui/Sheet';
import { useSigninCopy } from './draftCopy';
import { EmailCodeForm } from './EmailCodeScreen';
import { FailureNote, TextButton, useMethodLabels } from './SigninParts';

export type ConfirmProvider = Pick<CredentialProvider, 'freshSignIn' | 'sendEmailCode' | 'signIn'>;

export type ConfirmItsYouSheetProps = {
  visible: boolean;
  /** The account's own method. */
  method: SignInMethod;
  /** The account's own address: the email code goes only there. */
  email: string;
  provider: ConfirmProvider;
  /** Once per opening: `fresh`, `cancelled` when closed, or why it did not go through. */
  onDone(outcome: FreshOutcome): void;
};

export function ConfirmItsYouSheet({ visible, method, email, provider, onDone }: ConfirmItsYouSheetProps) {
  const sc = useSigninCopy();
  const tc = useCopy();
  const labels = useMethodLabels();
  const [byEmail, setByEmail] = useState(method === 'email');
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const confirm = async () => {
    if (busy.current || method === 'email') return;
    busy.current = true;
    setRunning(true);
    setProblem(null);
    let outcome: FreshOutcome;
    try {
      outcome = await provider.freshSignIn({ method, signUp: false });
    } catch {
      outcome = 'failed';
    }
    busy.current = false;
    if (!mounted.current) return;
    setRunning(false);
    if (outcome === 'fresh' || outcome === 'unavailable') {
      onDone(outcome);
      return;
    }
    if (outcome === 'cancelled') return;
    setProblem(outcome === 'other_account'
      ? sc("That's a different account. Use the one this phone signed in with.")
      : sc("Couldn't confirm it's you. Try again, or use another way."));
  };

  const close = () => {
    if (!busy.current) onDone('cancelled');
  };

  return (
    <Sheet visible={visible} onClose={close} title={sc("Confirm it's you")}>
      {byEmail ? (
        <EmailCodeForm
          provider={provider}
          mode="fresh"
          fixedEmail={email}
          onDone={(outcome) => onDone(typeof outcome === 'string' ? outcome : 'failed')}
        />
      ) : (
        <View style={{ gap: BUN_SPACE.md }}>
          <BunText>{method === 'apple' ? sc("Apple will ask you to confirm it's you.") : sc("Google will ask you to confirm it's you.")}</BunText>
          <PillButton label={labels[method]} busy={running} busyLabel={tc('Signing in…')} onPress={() => void confirm()} />
          {problem ? (
            <>
              <FailureNote text={problem} />
              <TextButton label={sc('Use another way')} onPress={() => { setProblem(null); setByEmail(true); }} />
            </>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
