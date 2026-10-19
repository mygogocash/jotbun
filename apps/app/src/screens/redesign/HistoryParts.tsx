// Pieces the redesigned History and Record screens share (R3): routes,
// notices, the loading block, row looks and going back. The filter chips and
// the search field moved into the kit (`src/ui/FilterChip.tsx`,
// `src/ui/SearchField.tsx`); they are re-exported here so older imports keep
// working. Built from the kit (src/ui), BunText and the useBunColors() tokens
// only.
import type { CategoryDto } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { RowState } from '@mobile/spend/v1/redesign/shared';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { categoryLook } from '@mobile/ui/categoryIcons';
import type { CategoryLook } from '@mobile/ui/categoryIcons';
import type { DateLocale } from '@mobile/ui/dateStep';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import type { RecordRowState } from '@mobile/ui/RecordRow';
import { SearchField as KitSearchField } from '@mobile/ui/SearchField';

export { FilterChips } from '@mobile/ui/FilterChip';
export type { ChipOption } from '@mobile/ui/FilterChip';

/** The kit's date words follow the active locale (Thai Buddhist-era years, Vietnamese words). */
export function useDateLocale(): DateLocale {
  return useActiveLocale();
}

/** Where History lives; Back falls back to it when there is no screen to go back to. */
export const HISTORY_ROUTE = '/spend/all';

/**
 * Typed routes: the record screen by its pattern and id (edit mode with
 * `mode: 'edit'`), and Quick add copying an entry, as href objects that
 * typed routes check against `app/` (never a hand-built string, which the
 * generated route types refuse).
 */
export const recordRoute = (id: string, edit = false): Href => ({ pathname: '/spend/record/[id]', params: edit ? { id, mode: 'edit' } : { id } });
export const copyRoute = (id: string): Href => ({ pathname: '/spend/add', params: { copyOf: id } });
/** The same as `recordRoute` and `copyRoute`. */
export const recordHref = recordRoute;
export const copyHref = copyRoute;

/** Back to the list: the screen below it when there is one, else the list itself. */
/**
 * Back, or, with nothing to go back to (a deep link), the screen this one
 * opens from: History by default; Home for Budget; Budget for Categories.
 */
export function useGoBack(fallback: typeof HISTORY_ROUTE | '/spend' | '/spend/budget' = HISTORY_ROUTE): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}

/** The row's quiet state line: RecordRow has a state for every draft state, "Update Jotbun to send" included. */
export function recordRowState(state: RowState): RecordRowState {
  return state;
}

/** A category's icon look, or null when the category is not known here. */
export function lookOf(category: CategoryDto | undefined, name: string): CategoryLook | null {
  return category ? categoryLook(category, name) : null;
}

/** History's search: the kit's SearchField with History's words. */
export function SearchField({ value, onChangeText }: { value: string; onChangeText: (next: string) => void }) {
  const tc = useCopy();
  return <KitSearchField label={tc('Search entries')} placeholder={tc('Category, merchant or note')} value={value} onChangeText={onChangeText} />;
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
