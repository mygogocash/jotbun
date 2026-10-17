// Shared building blocks for the v1 money screens: frame, buttons, chips,
// labelled fields, state messages, data loading and immutable commands.
// Styling follows the existing GoGoSpend theme tokens; the new states are
// pending E2 visual review.
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import type { V1Outcome } from '@mobile/api/client';
import { useActiveLocale } from '@mobile/i18n/useCopy';
import type { MoneyLocale } from '@mobile/spend/v1/money';
import { Text, TextInput } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { radii, spacing } from '@mobile/theme/tokens';

export type Translate = (english: string, values?: Readonly<Record<string, string | number>>) => string;

export const newId = (): string => Crypto.randomUUID();

/** Money is formatted the same way in Thai and English; other locales use English. */
export function useMoneyLocale(): MoneyLocale {
  return useActiveLocale() === 'th' ? 'th' : 'en';
}

export function Frame({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 28, fontWeight: '700' }}>{title}</Text>
      {children}
    </ScrollView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm }}>{children}</View>;
}

export function Button({ label, onPress, disabled = false, kind = 'primary', accessibilityLabel }: { label: string; onPress: () => void; disabled?: boolean; kind?: 'primary' | 'secondary'; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radii.chip, alignItems: 'center', justifyContent: 'center',
        backgroundColor: disabled ? colors.disabledAction : primary ? colors.primary : colors.card,
        borderWidth: primary ? 0 : 1, borderColor: colors.border,
      }}
    >
      <Text style={{ color: disabled ? colors.onDisabledAction : primary ? colors.onPrimaryDark : colors.ink, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, disabled = false, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radii.chip, justifyContent: 'center', borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.card }}
    >
      <Text style={{ color: colors.ink, fontWeight: selected ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{children}</View>;
}

export function Field({ label, value, onChangeText, error, editable = true, multiline = false, keyboardType }: {
  label: string; value: string; onChangeText: (text: string) => void; error?: string; editable?: boolean; multiline?: boolean; keyboardType?: 'default' | 'decimal-pad';
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        style={{ minHeight: 48, borderWidth: 1, borderColor: error ? colors.danger : colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.sm, color: colors.ink, backgroundColor: editable ? colors.field : colors.fieldMuted }}
      />
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

export function Notice({ message, action, tone = 'info' }: { message: string; action?: { label: string; onPress: () => void }; tone?: 'info' | 'warning' }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: tone === 'warning' ? colors.warningSoft : colors.panelRaised, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm }}>
      <Text style={{ color: colors.ink }}>{message}</Text>
      {action ? <Button kind="secondary" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return <View style={{ padding: spacing.xl, alignItems: 'center' }}><ActivityIndicator accessibilityLabel={label} /></View>;
}

/** What a failed load should say; outcomes that are not plain errors get their own state. */
export function loadProblem(error: unknown, tc: Translate): { message: string; retry: boolean } {
  const outcome: V1Outcome | undefined = error instanceof V1Error ? error.outcome : undefined;
  switch (outcome) {
    case 'upgrade_required': return { message: tc('Update GoGoSpend to keep using your diary. Nothing you saved is lost.'), retry: false };
    case 'policy_required': return { message: tc('Review and accept the updated terms to continue.'), retry: false };
    case 'signed_out':
    case 'session_changed': return { message: tc('Sign in again to see your diary.'), retry: false };
    case 'unsupported_platform': return { message: tc('Your diary is available in the GoGoSpend app on iOS and Android.'), retry: false };
    default: return { message: tc("We couldn't load your diary."), retry: true };
  }
}

const FIELD_PROBLEMS: Readonly<Record<string, string>> = {
  DATE_BEFORE_TRACKING_START: 'This date is before the wallet started tracking.',
  DATE_IN_FUTURE: 'This date is in the future.',
  INVALID_DATE: 'Enter a real date as YYYY-MM-DD',
  MINOR_OUT_OF_RANGE: 'Amounts go up to ฿999,999,999.99',
  INVALID_MINOR: 'Enter an amount like 65 or 65.50',
};

export type SaveProblem = {
  message: string;
  /** The outcome is unknown: keep the entry frozen and resend the same command. */
  unconfirmed: boolean;
  /** Saving cannot work until the user acts elsewhere (upgrade, sign-in, terms). */
  blocked: boolean;
  fields: Record<string, string>;
};

/** What a failed save should say, and whether the command may still have been committed. */
export function saveProblem(error: unknown, tc: Translate): SaveProblem {
  const v1 = error instanceof V1Error ? error : undefined;
  const fields: Record<string, string> = {};
  for (const field of Object.keys(v1?.fields ?? {})) fields[field] = tc(FIELD_PROBLEMS[v1?.code ?? ''] ?? 'Check this and try again.');
  const result = (message: string, extra: Partial<SaveProblem> = {}): SaveProblem => ({ message: tc(message), unconfirmed: false, blocked: false, fields, ...extra });
  switch (v1?.outcome) {
    case 'network':
    case 'unavailable': return result('Not confirmed yet. Your entry is kept; try again.', { unconfirmed: true });
    case 'rate_limited': return result('Too many changes at once. Your entry is kept; try again in a moment.', { unconfirmed: true });
    case 'upgrade_required': return result('Update GoGoSpend to keep saving. Your entry is kept.', { blocked: true });
    case 'policy_required': return result('Review and accept the updated terms to continue.', { blocked: true });
    case 'signed_out':
    case 'session_changed': return result('Sign in again to save. Your entry is kept.', { blocked: true });
    case 'invalid': return result('Check the highlighted fields.');
    default: return result('This entry could not be saved.');
  }
}

/**
 * Immutable commands: the same payload keeps its key until the outcome is
 * known, so a retry after a lost response can never commit twice; a changed
 * payload after a definite refusal gets a new key.
 */
export function useCommandKeys() {
  const pending = useRef<{ key: string; payload: string } | null>(null);
  const keyFor = useCallback((payload: unknown): string => {
    const text = JSON.stringify(payload);
    if (pending.current?.payload !== text) pending.current = { key: newId(), payload: text };
    return pending.current.key;
  }, []);
  const settle = useCallback(() => {
    pending.current = null;
  }, []);
  return { keyFor, settle };
}

export type Loaded<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'error'; error: unknown };

/** Loads once, and again on `reload`; a superseded load never overwrites a newer one. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> & { reload: () => void } {
  const [result, setResult] = useState<Loaded<T>>({ state: 'loading' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let current = true;
    setResult({ state: 'loading' });
    load().then(
      (data) => { if (current) setResult({ state: 'ready', data }); },
      (error: unknown) => { if (current) setResult({ state: 'error', error }); },
    );
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, round]);
  const reload = useCallback(() => setRound((value) => value + 1), []);
  return { ...result, reload };
}
