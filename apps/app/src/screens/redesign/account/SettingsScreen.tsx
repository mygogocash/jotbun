// R6: Settings (plan §6.4), reached from Home's header (decision D7), behind
// the `account` area until E2 checkpoint 4. Calm grouped cards:
//
// - Appearance (System, Light, Dark) through the theme preference; dark mode
//   stays (D8).
// - Language (TH, EN, VI), shown read-only: the app follows the phone's
//   language and keeps no choice of its own to change.
// - The bun (Full, Quiet, Off, decision D9) through the bun intensity.
// - The diary's links: Wallets, Categories and Budget under the planning
//   area, Reminders under insights, Import only with its flag. Each area
//   waits for its own approval.
// - The account: how it signs in (when the session says; otherwise "Signed
//   in"), Privacy and data, and the two sign-outs. Each sign-out is behind a
//   confirm that states the consequence: this phone's diary is erased and
//   entries not yet synced are lost. The diary is erased first, then the
//   session ends; a diary that cannot be erased keeps the person signed in.
//   Linking logins stays hidden until F6c.
//
// No bun here: Settings is a calm data screen.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { APPEARANCES, BUN_CHOICES, LANGUAGES, SETTINGS_HREFS, deviceOffline, diaryLinks, unsyncedEntries } from '@mobile/spend/v1/redesign/account/settingsModel';
import type { DiaryLinkKey, SettingsAreas, SignInMethod } from '@mobile/spend/v1/redesign/account/settingsModel';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useBunColors, useTheme } from '@mobile/theme/ThemeProvider';
import type { ThemePreference } from '@mobile/theme/themePreference';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import { Notice } from '../HistoryParts';
import { ChoiceGroup, LinkRow, PAGE_STYLE, Section, appAccountServices, appSettingsAreas, useBackTo } from './SettingsParts';
import type { AccountServices, SignOutEverywhereResult } from './SettingsParts';

type Tc = ReturnType<typeof useCopy>;

export type SettingsScreenProps = {
  /** The account's services; the app's own (today's session seam) unless given. */
  services?: AccountServices;
  /** Which areas' rows show; the app's flags unless given (the catalogue shows both). */
  areas?: Partial<SettingsAreas>;
};

/** "This phone's diary is erased; entries not yet synced are lost", with how many when the diary knows. */
function unsyncedLine(count: number, tc: Tc): string | null {
  if (count <= 0) return null;
  return count === 1 ? tc("1 entry on this phone hasn't synced yet.") : tc("{count} entries on this phone haven't synced yet.", { count });
}

const join = (...lines: (string | null)[]) => lines.filter((line): line is string => Boolean(line)).join(' ');

function Appearance() {
  const tc = useCopy();
  const { preference, setPreference } = useTheme();
  const labels: Record<ThemePreference, string> = { system: tc('System'), light: tc('Light'), dark: tc('Dark') };
  const label = tc('Appearance');
  return (
    <Section title={label}>
      <ChoiceGroup label={label} value={preference} onChange={setPreference} choices={APPEARANCES.map((value) => ({ value, label: labels[value] }))} />
    </Section>
  );
}

function Language() {
  const tc = useCopy();
  const locale = useActiveLocale();
  const label = tc('Language');
  return (
    <Section title={label}>
      <ChoiceGroup label={label} value={locale} disabled choices={LANGUAGES.map((language) => ({ value: language.locale, label: language.name }))} />
      <BunText variant="caption" tone="muted">{tc("Jotbun follows your phone's language. Change it in your phone's settings.")}</BunText>
    </Section>
  );
}

function BunChoice() {
  const tc = useCopy();
  const { intensity, setIntensity } = useBunIntensity();
  const choices: Record<BunIntensity, { label: string; description: string }> = {
    full: { label: tc('Full'), description: tc('The bun, its peeks and its speech bubbles.') },
    quiet: { label: tc('Quiet'), description: tc('No speech bubbles. The bun shows only on empty pages.') },
    off: { label: tc('Off'), description: tc('No bun anywhere.') },
  };
  const label = tc('Bun');
  return (
    <Section title={label}>
      <ChoiceGroup label={label} value={intensity} onChange={setIntensity} choices={BUN_CHOICES.map((value) => ({ value, ...choices[value] }))} />
    </Section>
  );
}

function DiaryLinks({ links }: { links: readonly DiaryLinkKey[] }) {
  const tc = useCopy();
  const router = useRouter();
  if (links.length === 0) return null;
  const labels: Record<DiaryLinkKey, string> = { wallets: tc('Wallets'), categories: tc('Categories'), budget: tc('Budget'), reminders: tc('Reminders'), import: tc('Import') };
  return (
    <Section title={tc('Your diary')}>
      <View>
        {links.map((key, index) => <LinkRow key={key} first={index === 0} label={labels[key]} onPress={() => router.push(SETTINGS_HREFS[key])} />)}
      </View>
    </Section>
  );
}

function methodLine(method: SignInMethod | null, tc: Tc): string {
  switch (method) {
    case 'apple': return tc('Signed in with Apple');
    case 'google': return tc('Signed in with Google');
    case 'email': return tc('Signed in with email');
    case null: return tc('Signed in');
  }
}

type Confirming = 'sign_out' | 'everywhere' | null;
type Note = { readonly text: string; readonly tone: 'alert' | 'status' };

export function SettingsScreen({ services: given, areas: givenAreas }: SettingsScreenProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const router = useRouter();
  const back = useBackTo('/spend');
  const [services] = useState(() => given ?? appAccountServices());
  const areas: SettingsAreas = { ...appSettingsAreas(), ...givenAreas };
  const diary = useSpendDiary();
  const view = useDiaryView();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const lost = unsyncedLine(unsyncedEntries(diary ? view : null), tc);
  const everywhere = services.signOutEverywhere;

  /** Erases this phone's diary, then ends the session here. A diary that can't be erased keeps the person signed in. */
  async function eraseThenSignOut(afterEverywhere: boolean): Promise<void> {
    try {
      await diary?.eraseForSignOut();
    } catch {
      setNote({
        tone: 'alert',
        text: afterEverywhere
          ? tc("You're signed out everywhere else, but this phone's diary couldn't be erased. Sign out to try again.")
          : tc("Couldn't erase this phone's diary, so you're still signed in. Try again."),
      });
      return;
    }
    try {
      await services.signOut();
    } catch {
      setNote({ tone: 'alert', text: tc("Couldn't finish signing out. Try again.") });
    }
  }

  async function signOut() {
    setWorking(true);
    setNote(null);
    await eraseThenSignOut(false);
    setWorking(false);
    setConfirming(null);
  }

  async function signOutEverywhere() {
    if (!everywhere) return;
    setWorking(true);
    setNote(null);
    let result: SignOutEverywhereResult;
    try {
      result = await everywhere();
    } catch {
      result = 'failed';
    }
    if (result === 'done') await eraseThenSignOut(true);
    else setNote({ tone: 'status', text: result === 'cancelled' ? tc('Nothing changed.') : tc("Couldn't reach Jotbun. Nothing changed. Try again.") });
    setWorking(false);
    setConfirming(null);
  }

  return (
    <View testID="settings-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.xl }}>
        <StageHeader back={{ onPress: back }} title={tc('Settings')} />
        <View style={PAGE_STYLE}>
          {deviceOffline(diary ? view : null) ? <SyncBanner state="offline" /> : null}
          <Appearance />
          <Language />
          <BunChoice />
          <DiaryLinks links={diaryLinks(areas)} />
          <Section title={tc('Account')} testID="settings-account">
            <BunText>{methodLine(services.signInMethod, tc)}</BunText>
            <View>
              <LinkRow label={tc('Privacy and data')} onPress={() => router.push(SETTINGS_HREFS.privacy)} />
            </View>
            <View style={{ gap: BUN_SPACE.sm }}>
              <PillButton kind="secondary" label={tc('Sign out')} onPress={() => setConfirming('sign_out')} />
              <PillButton
                kind="secondary"
                label={tc('Sign out everywhere')}
                disabled={!everywhere}
                disabledReason={tc("Signing out everywhere needs a fresh sign-in, which this build can't do yet.")}
                onPress={() => setConfirming('everywhere')}
              />
            </View>
            {note ? <Notice tone={note.tone} message={note.text} /> : null}
          </Section>
        </View>
      </ScrollView>
      <ConfirmSheet
        visible={confirming === 'sign_out'}
        title={tc('Sign out?')}
        consequence={join(tc("Signing out erases this phone's copy of your diary. Entries not yet synced are lost. Everything already synced stays in your account."), lost)}
        confirmLabel={tc('Sign out')}
        cancelLabel={tc('Stay signed in')}
        destructive
        busy={working}
        onConfirm={() => void signOut()}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmSheet
        visible={confirming === 'everywhere'}
        title={tc('Sign out everywhere?')}
        consequence={join(tc("Every phone signed in to your account is signed out. You'll sign in again first to confirm it's you. This phone's copy of your diary is erased, and entries not yet synced are lost."), lost)}
        confirmLabel={tc('Sign out everywhere')}
        cancelLabel={tc('Stay signed in')}
        destructive
        busy={working}
        onConfirm={() => void signOutEverywhere()}
        onCancel={() => setConfirming(null)}
      />
    </View>
  );
}
