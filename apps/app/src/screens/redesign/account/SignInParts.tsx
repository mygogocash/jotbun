// R6 Sign-in's pieces (plan §6.4): the explicit terms box and today's
// "not configured" answer. Behind the `account` area (on since E2 checkpoint 4).
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_OUTLINE, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';

const BOX = 24;

/**
 * The terms, agreed with an explicit box that starts unticked. One 44 pt
 * checkbox whose name is its sentence and whose state is read out; the drawn
 * box is decoration, and ticked is a filled box with a tick, never colour
 * alone.
 */
export function TermsCheckbox({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const colors = useBunColors();
  return (
    <Pressable
      role="checkbox"
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      aria-checked={checked}
      onPress={onToggle}
      style={{ minHeight: BUN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm, paddingVertical: BUN_SPACE.xxs }}
    >
      <View
        {...DECORATIVE}
        testID="sign-in-terms-box"
        style={{
          width: BOX,
          height: BOX,
          borderRadius: BUN_SPACE.xxs,
          borderWidth: BUN_OUTLINE.card,
          borderStyle: 'solid',
          borderColor: colors.ink,
          backgroundColor: checked ? colors.ink : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <BunText variant="label" tone="onInk" style={{ fontWeight: '700' }}>✓</BunText> : null}
      </View>
      <BunText style={{ flex: 1 }}>{label}</BunText>
    </Pressable>
  );
}

/**
 * Today's answer from the session seam, word for word as today's login
 * screen says it: no sign-in is configured on this installation. Said calmly
 * (a polite status in ink, not an alert), with one way back.
 */
export function NotConfigured({ onBack }: { onBack: () => void }) {
  const tc = useCopy();
  const message = tc('Sign-in is not configured for this local installation. A verified account session is required to view or change spending records.');
  useAnnouncement(message);
  return (
    <Card testID="sign-in-not-configured">
      <View {...POLITE_LIVE_REGION}>
        <BunText>{message}</BunText>
      </View>
      <PillButton label={tc('Back to Jotbun')} onPress={onBack} />
    </Card>
  );
}
