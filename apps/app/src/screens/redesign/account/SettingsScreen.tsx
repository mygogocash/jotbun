// R6: Settings (plan §6.4), reached from Home's header (decision D7), behind
// the `account` area (on since E2 checkpoint 4). Calm grouped cards:
//
// - Appearance (System, Light, Dark) through the theme preference; dark mode
//   stays (D8).
// - Language (System, ไทย, English) through the language preference, which
//   applies at once: every screen re-renders in the new language. Vietnamese
//   waits for its translation, so it is not offered; a phone in Vietnamese
//   keeps it under System.
// - The bun (Full, Quiet, Off, decision D9) through the bun intensity.
// - Haptics (On, Subtle, Off; premium plan A1): Subtle keeps only saves,
//   warnings and errors; the phone's own vibration switch still applies.
// - The Face ID lock (P2-T33, W26): its row, only while the `wallet` area is
//   on (LockSettingsRow), opens the lock's setup.
// - Bun and AI (P3-T14): while the Bun AI area is on (useBunAiArea), one row
//   opens /settings/ai, which holds Bun's AI help, and the companion card keeps
//   only its cashback tips switch (§5.2). Otherwise the companion card is as
//   before, Bun's AI help included.
// - The diary's links: Wallets, Categories and Budget under the planning
//   area, Reminders under insights, Import only with its flag. Each area
//   waits for its own approval.
// - The account: how it signs in (when the session says; otherwise "Signed
//   in"), Privacy and data, and the two sign-outs. Each sign-out is behind a
//   confirm that states the consequence: this phone's diary is erased and
//   entries not yet synced are lost. The diary is erased first, then the
//   session ends; a diary that cannot be erased keeps the person signed in.
//   Linking logins stays hidden until F6c.
// - Sign out everywhere (globalLogout.ts): after the confirm, a fresh sign-in
//   with the account's own method, then the port's sign out everywhere on
//   that new session. Accepted, or a resend that meets SIGNED_OUT (the first
//   one landed), signs this phone out too: erase, then the session ends. A
//   cancelled or failed sign-in, a sign-in too old for the server or a
//   refusal changes nothing. An answer that never came keeps the person
//   signed in, says so, and Try again resends the request with no new
//   sign-in. While the account's method has no fresh sign-in on this build
//   (email until 1C Task 9, Apple and Google until 1C Task 7), the app's
//   wiring shows the action disabled, with the reason, as Privacy does.
//
// No bun here: Settings is a calm data screen.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FRESH_SIGN_IN_FAILED, requestGlobalLogout, submitGlobalLogout } from '@mobile/auth/globalLogout';
import type { GlobalLogoutResources, GlobalLogoutState, PendingGlobalLogout } from '@mobile/auth/globalLogout';
import { useLanguage } from '@mobile/i18n/LanguageProvider';
import { useCopy } from '@mobile/i18n/useCopy';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import type { HapticPreference } from '@mobile/lib/hapticPreference';
import { useHaptics } from '@mobile/lib/HapticsProvider';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { APPEARANCES, BUN_CHOICES, HAPTIC_CHOICES, LANGUAGES, LANGUAGE_NAMES, SETTINGS_HREFS, deviceOffline, diaryLinks, unsyncedEntries } from '@mobile/spend/v1/redesign/account/settingsModel';
import type { DiaryLinkKey, SettingsAreas, SignInMethod } from '@mobile/spend/v1/redesign/account/settingsModel';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useBunColors, useTheme } from '@mobile/theme/ThemeProvider';
import type { ThemePreference } from '@mobile/theme/themePreference';
import { BunText } from '@mobile/ui/BunText';
import { OutlinedCard } from '@mobile/ui/Card';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import { useBunAiArea } from '@mobile/wallet/bunai/aiArea';
import { BUNAI_DRAFTS } from '@mobile/wallet/bunai/drafts';
import { useBunAiCopy } from '@mobile/wallet/bunai/useBunAiCopy';
import { LockSettingsRow } from '@mobile/wallet/lock/LockSettingsRow';
import { Notice } from '../HistoryParts';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { CompanionSettings } from './CompanionSettings';
import { ChoiceGroup, LinkRow, PAGE_STYLE, Section, appSettingsAreas, useBackTo } from './SettingsParts';
import type { AccountServices } from './SettingsParts';

type Tc = ReturnType<typeof useCopy>;

export type SettingsScreenProps = {
  /** The account's services (the route passes the app's own: accountServices.ts). */
  services: AccountServices;
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
  const { preference, setPreference } = useLanguage();
  const label = tc('Language');
  return (
    <Section title={label}>
      <ChoiceGroup label={label} value={preference} onChange={setPreference} choices={LANGUAGES.map((value) => ({ value, label: value === 'system' ? tc('System') : LANGUAGE_NAMES[value] }))} />
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

function HapticsChoice() {
  const tc = useCopy();
  const { preference, setPreference } = useHaptics();
  const choices: Record<HapticPreference, { label: string; description: string }> = {
    on: { label: tc('On'), description: tc('A light tap when you type, choose and save.') },
    subtle: { label: tc('Subtle'), description: tc('Only when something is saved, needs a look or goes wrong.') },
    off: { label: tc('Off'), description: tc('No vibration from Jotbun.') },
  };
  // The new setting answers for itself, so the person feels what they chose.
  const choose = (next: HapticPreference) => {
    setPreference(next);
    playHaptic('saveLanded');
  };
  const label = tc('Haptics');
  return (
    <Section title={label}>
      <ChoiceGroup label={label} value={preference} onChange={choose} choices={HAPTIC_CHOICES.map((value) => ({ value, ...choices[value] }))} />
    </Section>
  );
}

/** P3-T14: the บันและ AI row, to Bun and AI settings (/settings/ai). */
function BunAiRow() {
  const router = useRouter();
  const t = useBunAiCopy(BUNAI_DRAFTS);
  return (
    <OutlinedCard testID="settings-bunai">
      <LinkRow first label={t('bunai.settingsTitle')} onPress={() => router.push('/settings/ai')} />
    </OutlinedCard>
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
/** A line under the sign-outs; `resend` when the answer never came and Try again sends that very request. */
type Note = { readonly text: string; readonly tone: 'alert' | 'status'; readonly resend?: PendingGlobalLogout };

/** Why nothing changed after a sign out everywhere that did not sign out (still signed in here). */
function everywhereNote(state: Exclude<GlobalLogoutState, { state: 'signed_out' }>, tc: Tc): Note {
  switch (state.state) {
    case 'cancelled': return { tone: 'status', text: tc('Nothing changed.') };
    case 'reauth_required': return { tone: 'status', text: tc('Your sign-in check expired. Nothing changed.') };
    case 'unconfirmed': return { tone: 'status', text: tc("Couldn't reach Jotbun. You're still signed in on this phone. Try again to send the same request."), resend: state.request };
    // A fresh sign-in that did not go through sent nothing: the same line as a sign-in check the server found too old.
    case 'refused':
      return state.code === FRESH_SIGN_IN_FAILED
        ? { tone: 'status', text: tc('Your sign-in check expired. Nothing changed.') }
        : { tone: 'status', text: tc("Jotbun couldn't take your request right now. Try again later.") };
  }
}

export function SettingsScreen({ services, areas: givenAreas }: SettingsScreenProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const router = useRouter();
  const back = useBackTo('/spend');
  const areas: SettingsAreas = { ...appSettingsAreas(), ...givenAreas };
  const bunAi = useBunAiArea();
  const diary = useSpendDiary();
  const view = useDiaryView();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const lost = unsyncedLine(unsyncedEntries(diary ? view : null), tc);
  const fresh = services.freshSignIn;

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
      // Signed out everywhere: no signed_out, as the plan sends nothing for sign out everywhere in phase 1 (R125).
      await services.signOut({ event: !afterEverywhere });
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

  /** Signed out everywhere: this phone too. Otherwise nothing changed here, and the note says why. */
  async function settleEverywhere(state: GlobalLogoutState): Promise<void> {
    if (state.state === 'signed_out') await eraseThenSignOut(true);
    else setNote(everywhereNote(state, tc));
  }

  /** A fresh sign-in with the account's own method, then the request on that new session. */
  async function signOutEverywhere() {
    if (!fresh) return;
    setWorking(true);
    setNote(null);
    const seen = { sent: false };
    const sessions: GlobalLogoutResources = {
      signOutEverywhere: () => {
        seen.sent = true;
        return services.sessions.signOutEverywhere();
      },
    };
    try {
      await settleEverywhere(await requestGlobalLogout({ resources: sessions, freshSignIn: fresh }));
    } catch {
      // Not sent: the sign-in itself failed, and nothing changed. Sent: it is not Jotbun's answer, so the request is kept.
      setNote(seen.sent ? everywhereNote({ state: 'unconfirmed', request: { kind: 'sign_out_everywhere' } }, tc) : { tone: 'status', text: tc("Couldn't reach the sign-in service. Nothing changed. Try again.") });
    }
    setWorking(false);
    setConfirming(null);
  }

  /** Resends the request whose answer never came: no new sign-in. */
  async function resendEverywhere(request: PendingGlobalLogout) {
    setWorking(true);
    try {
      await settleEverywhere(await submitGlobalLogout(request, { resources: services.sessions }));
    } catch {
      setNote(everywhereNote({ state: 'unconfirmed', request }, tc));
    }
    setWorking(false);
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
          <HapticsChoice />
          <LockSettingsRow />
          {bunAi ? <BunAiRow /> : null}
          {isRedesignEnabled('companion') ? <CompanionSettings showAi={!bunAi} /> : null}
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
                disabled={!fresh}
                disabledReason={tc("Signing out everywhere needs a fresh sign-in, which this build can't do yet.")}
                onPress={() => setConfirming('everywhere')}
              />
            </View>
            {note ? (
              <Notice
                tone={note.tone}
                message={note.text}
                action={note.resend ? { label: tc('Try again'), busy: working, onPress: () => { if (note.resend && !working) void resendEverywhere(note.resend); } } : undefined}
              />
            ) : null}
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
