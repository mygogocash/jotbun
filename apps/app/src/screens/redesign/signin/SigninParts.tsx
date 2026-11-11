// Pieces the sign-in drafts share (1C-T8, unrouted until 1C-T9): the masked
// address, each method's button label, the boards' text action, and the calm
// failure note that says the records are safe (spec §5.2). The new copy is a
// draft (draftCopy.ts); the method labels are today's approved words.
import { Pressable, View } from 'react-native';

import type { SignInMethod } from '@mobile/auth/betterAuthPort';
import { useCopy } from '@mobile/i18n/useCopy';
import { POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { useSigninCopy } from './draftCopy';

/** The address as the code screen shows it: the first character, •••, then @ and the domain ("k•••@gmail.com"). */
export function maskEmail(address: string): string {
  const normal = address.trim().toLowerCase();
  const at = normal.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${Array.from(normal)[0]}•••${normal.slice(at)}`;
}

/** "Continue with Apple", "… Google" and "… email": today's approved words, the boards' ดำเนินการต่อด้วย lines. */
export function useMethodLabels(): Readonly<Record<SignInMethod, string>> {
  const tc = useCopy();
  return { apple: tc('Continue with Apple'), google: tc('Continue with Google'), email: tc('Continue with email') };
}

/** A borderless text action at least 44 pt tall, like the boards' เปลี่ยนอีเมล, ใช้วิธีอื่น and มีบัญชีแล้ว เข้าสู่ระบบ. */
export function TextButton({ label, onPress, disabled = false, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, justifyContent: 'center', alignItems: 'center', paddingHorizontal: BUN_SPACE.xs, borderRadius: BUN_RADIUS.pill }}
    >
      <BunText variant="label" tone={disabled ? 'muted' : 'ink'} style={{ fontWeight: '700', textAlign: 'center' }}>{label}</BunText>
    </Pressable>
  );
}

/**
 * A failure, said calmly (spec §5.2): what happened, then that the records
 * are still on this phone. A polite status (announced on iOS); the screen
 * offers another way beside it.
 */
export function FailureNote({ text }: { text: string }) {
  const sc = useSigninCopy();
  const safe = sc('Your records are still on this phone.');
  useAnnouncement(`${text} ${safe}`);
  return (
    <View {...POLITE_LIVE_REGION} testID="signin-failure" style={{ gap: BUN_SPACE.xxs }}>
      <BunText style={{ fontWeight: '700' }}>{text}</BunText>
      <BunText variant="caption" tone="muted">{safe}</BunText>
    </View>
  );
}
