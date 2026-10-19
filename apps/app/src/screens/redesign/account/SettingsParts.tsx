// Pieces the R6 account screens share (Settings, Privacy and data): the
// account services they run on and the app's own wiring of them, going back,
// a calm section card, a radio list and a link row. Behind the `account` area
// until E2 checkpoint 4; built from the kit, BunText and useBunColors() only.
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { getCredentialProvider, setSession } from '@mobile/auth/session';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import type { SettingsAreas, SignInMethod } from '@mobile/spend/v1/redesign/account/settingsModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { OutlinedCard } from '@mobile/ui/Card';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';

// ---------------------------------------------------------------------------
// Services

/** How a sign-out everywhere ended: done; the person cancelled the fresh sign-in; or Jotbun could not be reached (nothing changed). */
export type SignOutEverywhereResult = 'done' | 'cancelled' | 'failed';

/** What Settings' account card runs on. Tests and the catalogue pass fakes; the app passes `appAccountServices()`. */
export type AccountServices = {
  /** How this account signs in, when the session says. Today's session does not, so the card says "Signed in". */
  readonly signInMethod: SignInMethod | null;
  /** Ends the session on this device. The screen erases this phone's diary first. */
  signOut(): Promise<void>;
  /**
   * A fresh sign-in through the person's own method (a `global_logout` proof),
   * then `POST /v1/me/global-logout`. null when this build cannot do it: the
   * Auth0 SDK arrives with E1/E2, and the app has no client for that endpoint
   * yet. The screen then says so instead of offering it.
   */
  readonly signOutEverywhere: (() => Promise<SignOutEverywhereResult>) | null;
};

/**
 * Signs this device out through today's session seam: F5's credential
 * provider when one is installed (it revokes this binding and forgets the
 * stored sign-in), otherwise the legacy session store.
 */
export async function signOutOfThisDevice(): Promise<void> {
  const provider = getCredentialProvider();
  if (provider) await provider.signOut();
  else setSession(null);
}

export function appAccountServices(): AccountServices {
  return { signInMethod: null, signOut: signOutOfThisDevice, signOutEverywhere: null };
}

/**
 * The areas whose rows Settings shows, from the app's flags. The app has no
 * import flag of its own: `/spend/import` shows a screen only in the
 * development legacy build, so Import follows that and stays hidden otherwise.
 */
export function appSettingsAreas(): SettingsAreas {
  return { planning: isRedesignEnabled('planning'), insights: isRedesignEnabled('insights'), imports: isLegacySpendEnabled() };
}

// ---------------------------------------------------------------------------
// Going back

/** Back to the screen below, or to `fallback` when this screen was opened on its own. */
export function useBackTo(fallback: Href): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}

// ---------------------------------------------------------------------------
// Layout

/** The page under the stage: the calm ground, scrolled by the screen. */
export const PAGE_STYLE = { padding: BUN_SPACE.md, gap: BUN_SPACE.md } as const;

/** One calm group: an outlined card on the page with its heading. */
export function Section({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <OutlinedCard testID={testID}>
      <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText>
      {children}
    </OutlinedCard>
  );
}

export type Choice<T extends string> = { readonly value: T; readonly label: string; readonly description?: string };

/**
 * One choice of several, as a radio group: each a 44 pt row whose mark and
 * bold label show the checked one, so the choice never rests on colour. A
 * read-only group (`disabled`) still shows what is in use.
 */
export function ChoiceGroup<T extends string>({ label, choices, value, onChange, disabled = false }: {
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange?: (next: T) => void;
  disabled?: boolean;
}) {
  const colors = useBunColors();
  return (
    <View role="radiogroup" accessibilityLabel={label} aria-label={label} style={{ gap: BUN_SPACE.xxs }}>
      {choices.map((choice) => {
        const checked = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityLabel={choice.label}
            accessibilityHint={choice.description}
            accessibilityState={{ checked, disabled }}
            aria-checked={checked}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => {
              if (!checked) onChange?.(choice.value);
            }}
            style={{
              minHeight: BUN_TOUCH,
              flexDirection: 'row',
              alignItems: 'center',
              gap: BUN_SPACE.sm,
              paddingHorizontal: BUN_SPACE.sm,
              paddingVertical: BUN_SPACE.xs,
              borderRadius: BUN_RADIUS.chip,
              borderWidth: BUN_OUTLINE.control,
              borderColor: checked ? colors.ink : 'transparent',
              backgroundColor: checked ? colors.card : 'transparent',
            }}
          >
            <View {...DECORATIVE} style={{ width: 22, height: 22, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              {checked ? <View style={{ width: 10, height: 10, borderRadius: BUN_RADIUS.pill, backgroundColor: colors.ink }} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <BunText variant="label" style={checked ? { fontWeight: '700' } : undefined}>{choice.label}</BunText>
              {choice.description ? <BunText variant="caption" tone="muted">{choice.description}</BunText> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A row that opens another screen: its name and a quiet chevron, 44 pt tall. */
export function LinkRow({ label, onPress, first = false }: { label: string; onPress: () => void; first?: boolean }) {
  const colors = useBunColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: BUN_TOUCH,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: BUN_SPACE.sm,
        paddingVertical: BUN_SPACE.xs,
        borderTopWidth: first ? 0 : BUN_OUTLINE.rule,
        borderTopColor: colors.rule,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <BunText variant="label" style={{ flexShrink: 1 }}>{label}</BunText>
      <View {...DECORATIVE}>
        <BunText variant="heading" tone="muted">›</BunText>
      </View>
    </Pressable>
  );
}
