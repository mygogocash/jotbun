// The screen catalogue (redesign R2c): every redesigned component and screen
// state on its own screen, for the E2 visual-approval screenshots. Development
// only; app/dev/catalogue.tsx loads it behind `__DEV__` and the `catalogue`
// redesign flag. It needs no sign-in and no data: component sections draw
// sample data, and screen sections draw the real screens on the test fakes
// (./screenSection.tsx), with no network.
//
// The header picks the section, the theme (Light, Dark, System), the locale
// (EN, TH, VI) and the bun intensity (Full, Quiet, Off). Theme and locale wrap
// the catalogue only, through ThemePreferenceOverride and its own
// IntlProvider, so the app's stored choices are untouched. The bun intensity
// has no such override, so the control changes the app's setting while the
// catalogue is open and puts the person's own back when it closes.
//
// Deep link (Expo Router search params, all optional):
//   gogospend://dev/catalogue?section=receipt&theme=dark&locale=th
//   gogospend://dev/catalogue?section=amount&theme=light&locale=en&tour=3000   (steps every 3 s)
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { IntlProvider } from 'react-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Locale } from '@mobile/i18n/locales';
import { useActiveLocale } from '@mobile/i18n/useCopy';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import type { ThemePreference } from '@mobile/theme/themePreference';
import { ThemedStatusBar, ThemePreferenceOverride, useBunColors, useTheme } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { parseCatalogueParams, parseCatalogueTour } from './params';
import type { CatalogueSearchParams } from './params';
import { PAGE_PADDING } from './parts';
import { CATALOGUE_SECTIONS } from './registry';
import type { CatalogueGroup, CatalogueSection } from './registry';

export type CatalogueScreenProps = { readonly params: CatalogueSearchParams };

type CatalogueView = { readonly section: string | null; readonly theme: ThemePreference; readonly locale: Locale };

type Option<T extends string> = { readonly value: T; readonly label: string; readonly spoken?: string };

const THEME_OPTIONS: readonly Option<ThemePreference>[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];
const LOCALE_OPTIONS: readonly Option<Locale>[] = [
  { value: 'en', label: 'EN', spoken: 'English' },
  { value: 'th', label: 'TH', spoken: 'Thai' },
  { value: 'vi', label: 'VI', spoken: 'Vietnamese' },
];
const BUN_OPTIONS: readonly Option<BunIntensity>[] = [
  { value: 'full', label: 'Full' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'off', label: 'Off' },
];
const GROUPS: readonly CatalogueGroup[] = ['Kit', 'Mascot', 'Screens'];

/**
 * The bun intensity as the catalogue previews it. There is no override for a
 * subtree, so a choice here is the app's setting; the setting the person had
 * when they first changed it here is restored when the catalogue closes.
 */
function usePreviewBunIntensity(): [BunIntensity, (next: BunIntensity) => void] {
  const { intensity, setIntensity } = useBunIntensity();
  const original = useRef<BunIntensity | null>(null);
  const set = useRef(setIntensity);
  set.current = setIntensity;
  useEffect(() => () => {
    if (original.current !== null) set.current(original.current);
  }, []);
  const choose = useCallback((next: BunIntensity) => {
    if (original.current === null) original.current = intensity;
    setIntensity(next);
  }, [intensity, setIntensity]);
  return [intensity, choose];
}

function Segmented<T extends string>({ label, showLabel = false, options, value, onChange }: {
  label: string;
  showLabel?: boolean;
  options: readonly Option<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const colors = useBunColors();
  return (
    <View role="radiogroup" aria-label={label} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xxs }}>
      {showLabel ? <BunText variant="caption" tone="muted" style={{ marginRight: BUN_SPACE.xxs }}>{label}</BunText> : null}
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={checked}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={option.spoken ?? option.label}
            onPress={() => onChange(option.value)}
            style={{
              minHeight: BUN_TOUCH,
              minWidth: BUN_TOUCH,
              paddingHorizontal: BUN_SPACE.sm,
              borderRadius: BUN_RADIUS.pill,
              borderWidth: BUN_OUTLINE.control,
              borderColor: colors.ink,
              backgroundColor: checked ? colors.ink : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BunText variant="label" tone={checked ? 'onInk' : 'ink'}>{option.label}</BunText>
          </Pressable>
        );
      })}
    </View>
  );
}

function NavButton({ glyph, label, onPress }: { glyph: string; label: string; onPress?: () => void }) {
  const colors = useBunColors();
  const disabled = !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: BUN_TOUCH,
        minWidth: BUN_TOUCH,
        borderRadius: BUN_RADIUS.pill,
        borderWidth: BUN_OUTLINE.control,
        borderColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <BunText variant="heading" aria-hidden>{glyph}</BunText>
    </Pressable>
  );
}

function CatalogueHeader({ view, at, onView, onSection }: {
  view: CatalogueView;
  at: number;
  onView: (change: Partial<CatalogueView>) => void;
  onSection: (id: string | null) => void;
}) {
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const [intensity, setIntensity] = usePreviewBunIntensity();
  const section = at >= 0 ? CATALOGUE_SECTIONS[at] : undefined;
  const step = (by: number) => {
    const next = CATALOGUE_SECTIONS[at + by];
    return next ? () => onSection(next.id) : undefined;
  };
  return (
    <View
      style={{
        paddingTop: insets.top + BUN_SPACE.xs,
        paddingBottom: BUN_SPACE.sm,
        paddingHorizontal: PAGE_PADDING,
        gap: BUN_SPACE.xs,
        backgroundColor: colors.card,
        borderBottomWidth: BUN_OUTLINE.control,
        borderColor: colors.ink,
      }}
    >
      {section ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs }}>
          <NavButton glyph="‹" label="Previous section" onPress={step(-1)} />
          <View style={{ flex: 1 }}>
            <BunText variant="heading" role="heading" accessibilityRole="header" style={{ textAlign: 'center' }}>{section.title}</BunText>
            <BunText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{`${at + 1} of ${CATALOGUE_SECTIONS.length}`}</BunText>
          </View>
          <NavButton glyph="›" label="Next section" onPress={step(1)} />
        </View>
      ) : (
        <BunText variant="heading" role="heading" accessibilityRole="header">Screen catalogue</BunText>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: BUN_SPACE.md, rowGap: BUN_SPACE.xs }}>
        <Segmented label="Theme" options={THEME_OPTIONS} value={view.theme} onChange={(theme) => onView({ theme })} />
        <Segmented label="Language" options={LOCALE_OPTIONS} value={view.locale} onChange={(locale) => onView({ locale })} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: BUN_SPACE.xs }}>
        <Segmented label="Bun" showLabel options={BUN_OPTIONS} value={intensity} onChange={setIntensity} />
        {section ? <NavButton glyph="≡" label="All sections" onPress={() => onSection(null)} /> : null}
      </View>
    </View>
  );
}

function CatalogueIndex({ missing, onOpen }: { missing: string | null; onOpen: (id: string) => void }) {
  const colors = useBunColors();
  return (
    <View testID="catalogue-index" style={{ gap: BUN_SPACE.lg }}>
      {missing ? <BunText>{`No section called “${missing}”.`}</BunText> : null}
      <BunText variant="caption" tone="muted">{'Deep link: gogospend://dev/catalogue?section=<id>&theme=<light|dark|system>&locale=<en|th|vi>'}</BunText>
      {GROUPS.map((group) => {
        const sections = CATALOGUE_SECTIONS.filter((section) => section.group === group);
        if (sections.length === 0) return null;
        return (
          <View key={group} style={{ gap: BUN_SPACE.xs }}>
            <BunText variant="label" tone="muted">{group}</BunText>
            {sections.map((section) => (
              <Pressable
                key={section.id}
                accessibilityRole="button"
                accessibilityLabel={section.title}
                onPress={() => onOpen(section.id)}
                style={{
                  minHeight: BUN_TOUCH,
                  justifyContent: 'center',
                  paddingHorizontal: BUN_SPACE.sm,
                  paddingVertical: BUN_SPACE.xs,
                  borderRadius: BUN_RADIUS.chip,
                  borderWidth: BUN_OUTLINE.control,
                  borderColor: colors.ink,
                  backgroundColor: colors.card,
                }}
              >
                <BunText variant="label">{section.title}</BunText>
                <BunText variant="caption" tone="muted">{section.id}</BunText>
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function SectionBody({ section }: { section: CatalogueSection }) {
  return (
    <View testID={`catalogue-section-${section.id}`} style={{ gap: BUN_SPACE.md }}>
      {section.render()}
    </View>
  );
}

/** A whole screen: edge to edge under the header, scrolling on its own as it does in the app. */
function ScreenBody({ section }: { section: CatalogueSection }) {
  return (
    <View testID={`catalogue-section-${section.id}`} style={{ flex: 1 }}>
      {section.render()}
    </View>
  );
}

function CatalogueBody({ view, onView }: { view: CatalogueView; onView: (change: Partial<CatalogueView>) => void }) {
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const at = CATALOGUE_SECTIONS.findIndex((section) => section.id === view.section);
  const section = at >= 0 ? CATALOGUE_SECTIONS[at] : undefined;
  const openSection = (id: string | null) => onView({ section: id });
  return (
    <View testID="catalogue" style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemedStatusBar />
      <CatalogueHeader view={view} at={at} onView={onView} onSection={openSection} />
      {section?.layout === 'screen' ? (
        <ScreenBody key={section.id} section={section} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: insets.bottom + PAGE_PADDING }}
          keyboardShouldPersistTaps="handled"
        >
          {section ? <SectionBody key={section.id} section={section} /> : <CatalogueIndex missing={view.section} onOpen={openSection} />}
        </ScrollView>
      )}
    </View>
  );
}

export function CatalogueScreen({ params }: CatalogueScreenProps) {
  const app = useTheme();
  const appLocale = useActiveLocale();
  const link = parseCatalogueParams(params);
  const fromLink = (): CatalogueView => ({ section: link.section, theme: link.theme ?? app.preference, locale: link.locale ?? appLocale });

  // A new deep link while the catalogue is open replaces the header's choices.
  const linkKey = `${link.section}|${link.theme}|${link.locale}`;
  const [seenLink, setSeenLink] = useState(linkKey);
  const [view, setView] = useState(fromLink);
  if (seenLink !== linkKey) {
    setSeenLink(linkKey);
    setView(fromLink());
  }
  const onView = useCallback((change: Partial<CatalogueView>) => setView((current) => ({ ...current, ...change })), []);

  // `?tour=<ms>`: step to the next section on a timer and stop at the last
  // one, so a script can screenshot every section from one deep link.
  const tour = parseCatalogueTour(params);
  useEffect(() => {
    if (tour === null) return undefined;
    const timer = setInterval(() => {
      setView((current) => {
        const at = CATALOGUE_SECTIONS.findIndex((section) => section.id === current.section);
        const next = CATALOGUE_SECTIONS[at + 1];
        if (!next) {
          clearInterval(timer);
          return current;
        }
        return { ...current, section: next.id };
      });
    }, tour);
    return () => clearInterval(timer);
  }, [tour, linkKey]);

  return (
    <IntlProvider locale={view.locale}>
      <ThemePreferenceOverride preference={view.theme}>
        <CatalogueBody view={view} onView={onView} />
      </ThemePreferenceOverride>
    </IntlProvider>
  );
}
