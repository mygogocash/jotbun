// Pieces the redesigned History and Record screens share (R3): filter chips,
// the search field, notices, the loading block, row looks and going back.
// Built from the kit (src/ui), BunText and the useBunColors() tokens only.
import type { CategoryDto } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { RowState } from '@mobile/spend/v1/redesign/shared';
import { TextInput } from '@mobile/theme/AppText';
import { bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText, useBunScript } from '@mobile/ui/BunText';
import { categoryLook } from '@mobile/ui/categoryIcons';
import type { CategoryLook } from '@mobile/ui/categoryIcons';
import type { DateLocale } from '@mobile/ui/dateStep';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import type { RecordRowState } from '@mobile/ui/RecordRow';

/** The kit's date words follow the active locale (Thai Buddhist-era years, Vietnamese words). */
export function useDateLocale(): DateLocale {
  return useActiveLocale();
}

/** Where History lives; Back falls back to it when there is no screen to go back to. */
export const HISTORY_ROUTE = '/spend/all';

export const recordRoute = (id: string, edit = false) => `/spend/record/${encodeURIComponent(id)}${edit ? '?mode=edit' : ''}`;
export const copyRoute = (id: string) => `/spend/add?copyOf=${encodeURIComponent(id)}`;

/** Back to the list: the screen below it when there is one, else the list itself. */
export function useGoBack(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(HISTORY_ROUTE);
  }, [router]);
}

/**
 * The row's quiet state line. RecordRow has no "update to send" state, so a
 * draft waiting for an app update reads "saving…" (it is waiting on this
 * device, never confirmed); the sync banner says why.
 */
export function recordRowState(state: RowState): RecordRowState {
  return state === 'update_to_send' ? 'saving' : state;
}

/** A category's icon look, or null when the category is not known here. */
export function lookOf(category: CategoryDto | undefined, name: string): CategoryLook | null {
  return category ? categoryLook(category, name) : null;
}

export type ChipOption<T extends string> = { value: T; label: string };

/**
 * One single-choice filter as a row of chips (a radio group). The chosen chip
 * is an ink pill with bold text, so the choice never rests on colour alone.
 * The row scrolls sideways when the chips do not fit.
 */
export function FilterChips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly ChipOption<T>[]; value: T; onChange: (next: T) => void }) {
  const colors = useBunColors();
  return (
    <View role="radiogroup" accessibilityLabel={label} style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted" aria-hidden>{label}</BunText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: BUN_SPACE.xs }}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={checked}
              onPress={() => {
                if (!checked) onChange(option.value);
              }}
              style={{
                minHeight: BUN_TOUCH,
                justifyContent: 'center',
                paddingHorizontal: BUN_SPACE.md,
                borderRadius: BUN_RADIUS.pill,
                borderWidth: BUN_OUTLINE.control,
                borderColor: colors.ink,
                backgroundColor: checked ? colors.ink : colors.card,
              }}
            >
              <BunText variant="label" tone={checked ? 'onInk' : 'ink'} style={checked ? { fontWeight: '700' } : undefined}>{option.label}</BunText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The list's search: one line, searched on this device as you type. */
export function SearchField({ value, onChangeText }: { value: string; onChangeText: (next: string) => void }) {
  const colors = useBunColors();
  const tc = useCopy();
  const script = useBunScript();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs }}>
      <TextInput
        accessibilityLabel={tc('Search entries')}
        role="searchbox"
        value={value}
        onChangeText={onChangeText}
        placeholder={tc('Category, merchant or note')}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        autoCorrect={false}
        style={{
          ...bunText('body', script),
          flex: 1,
          color: colors.ink,
          minHeight: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.sm,
          paddingVertical: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.pill,
          borderColor: colors.ink,
          borderWidth: BUN_OUTLINE.control,
          backgroundColor: colors.card,
        }}
      />
      {value.length > 0 ? <PillButton kind="secondary" label={tc('Clear search')} onPress={() => onChangeText('')} /> : null}
    </View>
  );
}

/**
 * A plain message with at most one action. `alert` is for problems (read at
 * once); `status` is a polite update. Ink on the page: never red.
 */
export function Notice({ message, tone = 'status', action }: { message: string; tone?: 'alert' | 'status'; action?: { label: string; onPress: () => void; busy?: boolean } }) {
  const colors = useBunColors();
  useAnnouncement(message);
  const region = tone === 'alert' ? { accessibilityRole: 'alert' as const, 'aria-live': 'assertive' as const } : POLITE_LIVE_REGION;
  return (
    <View
      {...region}
      style={{
        gap: BUN_SPACE.xs,
        padding: BUN_SPACE.sm,
        borderRadius: BUN_RADIUS.chip,
        borderWidth: tone === 'alert' ? BUN_OUTLINE.card : BUN_OUTLINE.control,
        borderColor: colors.ink,
        backgroundColor: colors.card,
      }}
    >
      <BunText style={tone === 'alert' ? { fontWeight: '700' } : undefined}>{message}</BunText>
      {action ? <PillButton kind="secondary" label={action.label} busy={action.busy} onPress={action.onPress} /> : null}
    </View>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  const colors = useBunColors();
  return (
    <View style={{ paddingVertical: BUN_SPACE.xl, alignItems: 'center' }}>
      <ActivityIndicator accessibilityLabel={label} color={colors.ink} />
    </View>
  );
}
