// The entry screens' action, pinned under their scrolling form (E2, 19 October
// 2026). On a 402 × 874 pt phone the 56 pt keypad pushed Save and any save
// problem below the fold; here they stay within thumb reach, with the problem
// right above the action it is about. A rule marks where the form scrolls
// under it, and the bottom inset keeps it clear of the home indicator.
//
// `EntryPage` wraps a form and its footer so the footer rises above the
// keyboard while a text field (merchant, note) is being typed into.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BUN_OUTLINE, BUN_SPACE } from '@mobile/ui/layout';

export function ActionFooter({ testID, children }: { testID: string; children: ReactNode }) {
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={{
        gap: BUN_SPACE.xs,
        paddingHorizontal: BUN_SPACE.md,
        paddingTop: BUN_SPACE.xs,
        paddingBottom: insets.bottom + BUN_SPACE.xs,
        borderTopWidth: BUN_OUTLINE.rule,
        borderTopColor: colors.rule,
        backgroundColor: colors.background,
      }}
    >
      {children}
    </View>
  );
}

/** Two actions side by side in a footer, the first (secondary) narrower than the second (primary). */
export function ActionRow({ secondary, primary }: { secondary: ReactNode; primary: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: BUN_SPACE.xs }}>
      <View style={{ flex: 2 }}>{secondary}</View>
      <View style={{ flex: 3 }}>{primary}</View>
    </View>
  );
}

export function EntryPage({ testID, children }: { testID: string; children: ReactNode }) {
  const colors = useBunColors();
  return (
    <KeyboardAvoidingView testID={testID} style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}
