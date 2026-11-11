// 1C-T8: D37's keep-or-erase choice (a draft awaiting E2). After the
// session-ended screen signs in to ANOTHER account while the first one's
// records wait unsent, those records are never sent to the new account
// (D37): the person keeps them on this phone (the safe choice, the main
// button) or erases them, and erasing needs an explicit confirmation first.
// The session-ended screen asks only when records wait (1C-T6's note), and
// erases only what `mayEraseOtherAccount` allows.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type { OtherAccountChoice } from '@mobile/auth/sessionEnded';
import { useCopy } from '@mobile/i18n/useCopy';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { useSigninCopy } from './draftCopy';
import { FailureNote } from './SigninParts';

export type OtherAccountRecordsProps = {
  /** How many of the first account's records wait unsent on this phone. */
  unsent: number;
  /** Keep, or an erase the person confirmed. A rejection keeps the screen with a calm line. */
  onChoice(choice: OtherAccountChoice): Promise<void>;
};

export function OtherAccountRecords({ unsent, onChoice }: OtherAccountRecordsProps) {
  const sc = useSigninCopy();
  const tc = useCopy();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const choose = async (choice: OtherAccountChoice) => {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    setFailed(false);
    try {
      await onChoice(choice);
    } catch {
      if (mounted.current) setFailed(true);
    }
    running.current = false;
    if (!mounted.current) return;
    setWorking(false);
    setConfirming(false);
  };

  return (
    <Card testID="other-account-records" style={{ gap: BUN_SPACE.sm }}>
      <BunText variant="heading" role="heading" accessibilityRole="header">{sc('Records from your other account')}</BunText>
      <BunText>{sc('{count} records from the account you used before are still on this phone, not sent. They are never sent to this account.', { count: unsent })}</BunText>
      <PillButton label={sc('Keep them on this phone')} disabled={working} onPress={() => void choose({ kind: 'keep' })} />
      <BunText variant="caption" tone="muted">{sc('Sign in to that account again later to send them.')}</BunText>
      <PillButton testID="other-account-erase" kind="secondary" label={sc('Erase them')} disabled={working} onPress={() => setConfirming(true)} />
      {failed ? <FailureNote text={sc("Couldn't erase them. Try again.")} /> : null}
      <ConfirmSheet
        visible={confirming}
        destructive
        busy={working}
        title={sc('Erase {count} unsent records?', { count: unsent })}
        consequence={sc('They were never sent, so they are gone for good. Records already sent stay in that account.')}
        confirmLabel={sc('Erase records')}
        cancelLabel={tc('Cancel')}
        onConfirm={() => void choose({ kind: 'erase', confirmed: true })}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
