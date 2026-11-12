// Bun and AI settings at /settings/ai (P3-T14, ai-settings): on the ground,
// back and the title, then four cards.
//
// - บัน: how much Bun shows up (full, quiet, off), through the app's one bun
//   intensity (useBunIntensity), as three choice cards.
// - ตัวช่วย AI ของบัน: one switch. Off is at once (useAiConsentChange); on
//   opens the consent tray first, and only its เปิดใช้ turns Bun's help on.
//   A turn-off the server never took leaves it on and says so in today's
//   words. While Bun's help is on and answering, the uses left today for
//   sentences, slips and questions, each `{left} / {limit}` from the server's
//   `remaining` and AI_DAILY_LIMITS. While the service rests, today's resting
//   line, as today's Settings says it. สิ่งที่ AI เห็น opens the consent's
//   lines read-only.
// - โน้ตประจำวันจากบัน: the daily note's switch, kept on this phone
//   (useDailyNoteSetting; default pending owner Q7).
// - การสั่น: haptics (on, subtle, off) through useHaptics, as a segmented
//   control; the new setting answers with a tap, as today's Settings does.
//
// Every control is 44 pt or more and named. At the largest text sizes the
// choice cards, the uses and the segments stack, so no word is cut, and no
// line is clamped. Wallet colours only: no colour literals (Bun's own face
// keeps its colours, BunFace.tsx). The screen shows no amount and nothing the
// person wrote, so private mode has nothing to hide here.
import { AI_DAILY_LIMITS } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import type { HapticPreference } from '@mobile/lib/hapticPreference';
import { HAPTIC_PREFERENCES } from '@mobile/lib/hapticPreference';
import { useHaptics } from '@mobile/lib/HapticsProvider';
import { playHaptic } from '@mobile/lib/hapticMoment';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BUN_INTENSITIES } from '@mobile/mascot/bunIntensity';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { IconButton } from '../controls/IconButton';
import { useDraftCopy } from '../copy/useDraftCopy';
import { BunFace } from '../looks/BunFace';
import { WalletText } from '../WalletText';
import { AiConsentTray } from './AiConsentTray';
import { useAiConsentChange, useDailyNoteSetting } from './aiConsent';
import { BUNAI_DRAFTS } from './drafts';
import { useBunAiCopy } from './useBunAiCopy';

/** 44 pt in its own box (§4). */
const TOUCH = 44;
/** The chosen segment's lift by day (TypeSwitchHeader's). */
const LIFT = '0px 1px 4px rgba(17, 16, 20, 0.14)';

const PRESENCE: Readonly<Record<BunIntensity, { label: string; line: string }>> = {
  full: { label: 'bunai.presenceFull', line: 'bunai.presenceFullLine' },
  quiet: { label: 'bunai.presenceQuiet', line: 'bunai.presenceQuietLine' },
  off: { label: 'bunai.presenceOff', line: 'bunai.presenceOffLine' },
};

const HAPTICS: Readonly<Record<HapticPreference, string>> = { on: 'bunai.hapticsOn', subtle: 'bunai.hapticsSubtle', off: 'bunai.hapticsOff' };

const USES = [
  { feature: 'parse', label: 'bunai.usesParse' },
  { feature: 'slip', label: 'bunai.usesSlip' },
  { feature: 'ask', label: 'bunai.usesAsk' },
] as const;

/** A white card on the ground (ai-settings). */
function Card({ children, testID }: { children: ReactNode; testID: string }) {
  const colors = useWalletColors();
  return <View testID={testID} style={{ borderRadius: 22, padding: 14, gap: 8, backgroundColor: colors.card }}>{children}</View>;
}

/** What each presence looks like, drawn small: Bun with a bubble, Bun quiet, no Bun. */
function PresenceArt({ value }: { value: BunIntensity }) {
  const colors = useWalletColors();
  const bar = (width: `${number}%`) => <View style={{ height: 4, width, borderRadius: 2, backgroundColor: colors.hairline }} />;
  return (
    <View {...DECORATIVE} style={{ height: 50, borderRadius: 10, backgroundColor: colors.ground, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 8, gap: 5 }}>
      {value === 'full' ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
          <BunFace face="smile" size={24} />
          <View style={{ flex: 1, height: 24, marginBottom: 14, borderRadius: 8, borderBottomLeftRadius: 2, backgroundColor: colors.card, justifyContent: 'center', gap: 3, paddingHorizontal: 6 }}>
            {bar('90%')}
            {bar('60%')}
          </View>
        </View>
      ) : null}
      {value === 'quiet' ? <View style={{ alignItems: 'center' }}><BunFace face="calm" size={26} /></View> : null}
      {value === 'off' ? (
        <>
          {bar('70%')}
          {bar('90%')}
          {bar('50%')}
        </>
      ) : null}
    </View>
  );
}

/** A switch's 51 × 31 pt track and knob: decorative, since its row is the switch. */
function SwitchArt({ on }: { on: boolean }) {
  const colors = useWalletColors();
  return (
    <View {...DECORATIVE} style={{ width: 51, height: 31, borderRadius: 16, backgroundColor: on ? colors.violet : colors.quiet }}>
      <View style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 27, height: 27, borderRadius: 14, backgroundColor: colors.card, boxShadow: '0px 2px 4px rgba(17, 16, 20, 0.2)' }} />
    </View>
  );
}

/** The AI help's sparkle, or the note's speech bubble, in a 34 pt tile. */
function RowIcon({ name }: { name: 'ai' | 'note' }) {
  const colors = useWalletColors();
  return (
    <View {...DECORATIVE} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        {name === 'ai' ? (
          <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" fill={colors.violet} />
        ) : (
          <Path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M8 10h8M8 13h5" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </Svg>
    </View>
  );
}

/** A switch the size of its row (ai-settings), named by its words. */
function SwitchRow({ label, icon, on, busy = false, onPress, testID }: { label: string; icon: 'ai' | 'note'; on: boolean; busy?: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, busy, disabled: busy }}
      aria-checked={on}
      aria-busy={busy}
      disabled={busy}
      onPress={onPress}
      style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <RowIcon name={icon} />
      <WalletText style={{ flex: 1, fontWeight: '700' }}>{label}</WalletText>
      <SwitchArt on={on} />
    </Pressable>
  );
}

function PresenceCard() {
  const colors = useWalletColors();
  const t = useBunAiCopy(BUNAI_DRAFTS);
  const large = useLargeText();
  const { intensity, setIntensity } = useBunIntensity();
  return (
    <Card testID="ai-settings-presence">
      <View style={{ flexDirection: large ? 'column' : 'row', justifyContent: 'space-between', alignItems: large ? 'flex-start' : 'baseline', gap: 4 }}>
        <WalletText accessibilityRole="header" style={{ fontWeight: '700' }}>{t('bunai.bunHeading')}</WalletText>
        <WalletText role="caption" tone="quiet">{t('bunai.presence')}</WalletText>
      </View>
      <View role="radiogroup" accessibilityLabel={t('bunai.presence')} style={{ flexDirection: large ? 'column' : 'row', gap: 8 }}>
        {BUN_INTENSITIES.map((value) => {
          const checked = value === intensity;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={t(PRESENCE[value].label)}
              accessibilityHint={t(PRESENCE[value].line)}
              accessibilityState={{ checked }}
              aria-checked={checked}
              onPress={() => {
                if (!checked) setIntensity(value);
              }}
              style={{
                flex: large ? undefined : 1,
                minHeight: TOUCH,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: checked ? colors.ink : 'transparent',
                backgroundColor: checked ? colors.card : colors.raised,
                padding: 8,
                gap: 6,
              }}
            >
              <PresenceArt value={value} />
              <WalletText role="label" style={{ fontWeight: '700' }}>{t(PRESENCE[value].label)}</WalletText>
              <WalletText role="caption" tone="quiet">{t(PRESENCE[value].line)}</WalletText>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function AiCard({ onConsent, onSeen }: { onConsent: () => void; onSeen: () => void }) {
  const colors = useWalletColors();
  const t = useBunAiCopy(BUNAI_DRAFTS);
  const tc = useCopy();
  const large = useLargeText();
  const { preferences, enabled } = useAiCompanion();
  const { turnOff, busy } = useAiConsentChange();
  const [problem, setProblem] = useState<string | null>(null);
  const on = preferences?.companion === true;

  const toggle = async () => {
    setProblem(null);
    if (!on) {
      onConsent();
      return;
    }
    try {
      await turnOff();
    } catch {
      playHaptic('saveFailed');
      setProblem(tc("This couldn't be changed right now. Try again when you're online."));
      return;
    }
    playHaptic('saveLanded');
  };

  const remaining = enabled ? preferences?.remaining : undefined;
  return (
    <Card testID="ai-settings-ai">
      <SwitchRow testID="ai-settings-ai-switch" label={t('bunai.consentTitle')} icon="ai" on={on} busy={busy} onPress={() => void toggle()} />
      <WalletText role="caption" tone="quiet">{t('bunai.aiLine')}</WalletText>
      {problem ? <WalletText testID="ai-settings-problem" role="label" accessibilityRole="alert">{problem}</WalletText> : null}
      {preferences && !preferences.available ? (
        <WalletText testID="ai-settings-resting" role="caption" tone="quiet">{tc("Bun's AI help is resting right now. Everything else works as usual.")}</WalletText>
      ) : null}
      {remaining ? (
        <View testID="ai-settings-uses" style={{ gap: 6 }}>
          <WalletText role="caption" style={{ fontWeight: '500' }}>{t('bunai.usesLeft')}</WalletText>
          <View style={{ flexDirection: large ? 'column' : 'row', gap: 6 }}>
            {USES.map(({ feature, label }) => (
              <View key={feature} testID={`ai-settings-uses-${feature}`} style={{ flex: large ? undefined : 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.raised }}>
                <WalletText style={{ fontWeight: '700' }}>{t('bunai.usesOf', { left: remaining[feature], limit: AI_DAILY_LIMITS[feature] })}</WalletText>
                <WalletText role="caption" tone="quiet">{t(label)}</WalletText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <Pressable
        testID="ai-settings-seen"
        accessibilityRole="button"
        accessibilityLabel={t('bunai.whatAiSees')}
        onPress={onSeen}
        style={({ pressed }) => ({ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, opacity: pressed ? 0.6 : 1 })}
      >
        <WalletText role="label" tone="violet" style={{ flexShrink: 1 }}>{t('bunai.whatAiSees')}</WalletText>
        <View {...DECORATIVE}>
          <Glyph name="chevron-right" size={14} color={colors.violet} />
        </View>
      </Pressable>
    </Card>
  );
}

function NoteCard() {
  const t = useBunAiCopy(BUNAI_DRAFTS);
  const note = useDailyNoteSetting();
  return (
    <Card testID="ai-settings-note">
      <SwitchRow testID="ai-settings-note-switch" label={t('bunai.note')} icon="note" on={note.on} onPress={() => void note.set(!note.on)} />
      <WalletText role="caption" tone="quiet">{t('bunai.noteLine')}</WalletText>
    </Card>
  );
}

function HapticsCard() {
  const colors = useWalletColors();
  const t = useBunAiCopy(BUNAI_DRAFTS);
  const large = useLargeText();
  const { preference, setPreference } = useHaptics();
  return (
    <Card testID="ai-settings-haptics">
      <WalletText accessibilityRole="header" style={{ fontWeight: '700' }}>{t('bunai.haptics')}</WalletText>
      <View role="radiogroup" accessibilityLabel={t('bunai.haptics')} style={{ flexDirection: large ? 'column' : 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.raised }}>
        {HAPTIC_PREFERENCES.map((value) => {
          const checked = value === preference;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={t(HAPTICS[value])}
              accessibilityState={{ checked }}
              aria-checked={checked}
              onPress={() => {
                if (checked) return;
                setPreference(value);
                // The new setting answers for itself, so the person feels what they chose.
                playHaptic('saveLanded');
              }}
              style={{
                flex: large ? undefined : 1,
                minHeight: TOUCH,
                borderRadius: 11,
                paddingHorizontal: 8,
                paddingVertical: 4,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: checked ? colors.card : 'transparent',
                boxShadow: checked && !colors.isDark ? LIFT : undefined,
              }}
            >
              <WalletText role="label" tone={checked ? 'ink' : 'quiet'} style={{ fontWeight: checked ? '700' : '500', textAlign: 'center' }}>{t(HAPTICS[value])}</WalletText>
            </Pressable>
          );
        })}
      </View>
      <WalletText role="caption" tone="quiet">{t('bunai.hapticsLine')}</WalletText>
    </Card>
  );
}

export function WalletAiSettingsScreen() {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useBunAiCopy(BUNAI_DRAFTS);
  const common = useDraftCopy(COMMON_COPY);
  // One tray: the consent before Bun's help turns on, or the same lines read-only (สิ่งที่ AI เห็น).
  const [tray, setTray] = useState<{ open: boolean; readOnly: boolean }>({ open: false, readOnly: false });
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };
  return (
    <View testID="ai-settings" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <IconButton label={common('common.back')} onPress={back}>
            <Glyph name="chevron-left" size={18} color={colors.ink} />
          </IconButton>
          <WalletText role="h1" accessibilityRole="header" style={{ flex: 1 }}>{t('bunai.settingsTitle')}</WalletText>
        </View>
        <PresenceCard />
        <AiCard onConsent={() => setTray({ open: true, readOnly: false })} onSeen={() => setTray({ open: true, readOnly: true })} />
        <NoteCard />
        <HapticsCard />
      </ScrollView>
      <AiConsentTray visible={tray.open} readOnly={tray.readOnly} onClose={() => setTray((now) => ({ ...now, open: false }))} />
    </View>
  );
}
