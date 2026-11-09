// 1C-T8: sign-in methods and devices (board sa-account's วิธีเข้าสู่ระบบ, and
// devices as sessions, K6), a draft awaiting E2, unrouted until 1C-T9
// (`/settings/devices`).
//
// - Sign-in methods: each linked one; Apple or Google this build offers and
//   the account has not linked yet can be linked, and a linked one removed,
//   each only after a fresh sign-in with the account's own method (R43).
//   Email is always there (C14), and a method is never offered for removal
//   while it is the only Apple or Google one linked: Better Auth refuses to
//   unlink the last linked account (K22), and every account keeps its email
//   code.
// - Devices: this phone is marked and never offered a sign-out here (that is
//   Sign out in Settings); another device is signed out after asking first;
//   the other devices all at once, after asking first. Neither needs a fresh
//   sign-in (Task 4).
// - A load or an action that fails says so calmly, with the records-safe line
//   and a way to try again (spec §5.2).
import { bangkokDate } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BetterAuthPort, DeviceDto, SignInMethod } from '@mobile/auth/betterAuthPort';
import type { FreshOutcome } from '@mobile/auth/credentialProvider';
import type { StoredSession } from '@mobile/auth/sessionStore';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { dayLabel } from '@mobile/ui/dateStep';
import { BUN_OUTLINE, BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { useSigninCopy } from './draftCopy';
import { FailureNote, maskEmail } from './SigninParts';

export type DevicesPort = Pick<BetterAuthPort, 'devices' | 'signOutDevice' | 'signOutOtherDevices' | 'linkMethod' | 'unlinkMethod' | 'linkedMethods' | 'methods'>;

export type DevicesScreenProps = {
  port: DevicesPort;
  /** A fresh sign-in with the account's own method (useFreshSignIn's), run before linking or removing a method. */
  freshSignIn: () => Promise<FreshOutcome>;
  account: StoredSession;
};

type Social = 'apple' | 'google';
type Loaded = { readonly devices: readonly DeviceDto[]; readonly linked: readonly SignInMethod[] };
type Asking = { readonly kind: 'device'; readonly device: DeviceDto; readonly name: string } | { readonly kind: 'others' } | { readonly kind: 'remove'; readonly method: Social };

const SOCIAL: readonly Social[] = ['apple', 'google'];

/** A short name for a session's device, from its user agent; brand names stay as they are. */
function deviceName(userAgent: string | null): string | null {
  const agent = userAgent ?? '';
  if (/iPhone/i.test(agent)) return 'iPhone';
  if (/iPad/i.test(agent)) return 'iPad';
  if (/Android/i.test(agent)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(agent)) return 'Mac';
  if (/Windows/i.test(agent)) return 'Windows';
  return null;
}

/** The Bangkok calendar day of an ISO time, or null for a time that cannot be read. */
function dayOf(iso: string): string | null {
  const time = new Date(iso);
  return Number.isFinite(time.getTime()) ? bangkokDate(time) : null;
}

export function DevicesScreen({ port, freshSignIn, account }: DevicesScreenProps) {
  const sc = useSigninCopy();
  const tc = useCopy();
  const locale = useActiveLocale();
  const router = useRouter();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // One action at a time, however fast its button is pressed.
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [devices, linked] = await Promise.all([port.devices(), port.linkedMethods()]);
      if (mounted.current) setLoaded({ devices, linked });
    } catch {
      if (mounted.current) setLoadFailed(true);
    }
  }, [port]);
  useEffect(() => { void load(); }, [load]);

  /** Runs one action: `work` gives the failure line to show when it throws. */
  const act = async (key: string, failure: string, work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setWorking(key);
    setProblem(null);
    try {
      await work();
    } catch {
      if (mounted.current) setProblem(failure);
    }
    running.current = false;
    if (mounted.current) setWorking(null);
  };

  const signOutDevice = (device: DeviceDto) => act(`device:${device.id}`, sc("Couldn't sign that device out. Try again."), async () => {
    await port.signOutDevice(device.id);
    if (mounted.current) setLoaded((current) => (current ? { ...current, devices: current.devices.filter((item) => item.id !== device.id) } : current));
  });

  const signOutOthers = () => act('others', sc("Couldn't sign the other devices out. Try again."), async () => {
    await port.signOutOtherDevices();
    if (mounted.current) setLoaded((current) => (current ? { ...current, devices: current.devices.filter((item) => item.current) } : current));
  });

  /** Linking or removing: the fresh sign-in first (R43), then the one call; anything but `fresh` changes nothing. */
  const changeMethod = (method: Social, change: 'link' | 'remove') => act(`${change}:${method}`, sc("Couldn't change your sign-in methods. Try again."), async () => {
    const outcome = await freshSignIn();
    if (outcome !== 'fresh') {
      if (outcome !== 'cancelled' && mounted.current) setProblem(sc("Confirm it's you first. Nothing changed."));
      return;
    }
    if (change === 'link') await port.linkMethod(method);
    else await port.unlinkMethod(method);
    const linked = await port.linkedMethods();
    if (mounted.current) setLoaded((current) => (current ? { ...current, linked } : current));
  });

  const confirm = () => {
    const question = asking;
    setAsking(null);
    if (question?.kind === 'device') void signOutDevice(question.device);
    else if (question?.kind === 'others') void signOutOthers();
    else if (question?.kind === 'remove') void changeMethod(question.method, 'remove');
  };

  const methodLabel = (method: SignInMethod): string => {
    switch (method) {
      case 'apple': return sc('Sign in with Apple');
      case 'google': return sc('Sign in with Google');
      default: return sc('Sign in with an email code');
    }
  };
  const linkLabel = (method: Social) => (method === 'apple' ? sc('Link Apple') : sc('Link Google'));
  const removeLabel = (method: Social) => (method === 'apple' ? sc('Remove Apple') : sc('Remove Google'));
  const confirmLine = (() => {
    switch (account.method) {
      case 'apple': return sc("When Jotbun needs to confirm it's you, such as for an export or deleting your account, it asks you to sign in with Apple again.");
      case 'google': return sc("When Jotbun needs to confirm it's you, such as for an export or deleting your account, it asks you to sign in with Google again.");
      default: return sc("When Jotbun needs to confirm it's you, such as for an export or deleting your account, it sends a code to your email.");
    }
  })();
  const today = bangkokDate(new Date());
  const dayText = (iso: string) => {
    const day = dayOf(iso);
    return day === null ? '' : dayLabel(day, today, locale).text;
  };

  const linked = loaded?.linked ?? [];
  const linkedSocial = SOCIAL.filter((method) => linked.includes(method));
  const linkable = SOCIAL.filter((method) => port.methods.includes(method) && !linked.includes(method));
  const others = loaded?.devices.filter((device) => !device.current) ?? [];

  const question = (() => {
    if (asking?.kind === 'device') {
      return { title: sc('Sign out {device}?', { device: asking.name }), consequence: sc('That device must sign in again. Records it already sent stay in your account.'), confirm: tc('Sign out') };
    }
    if (asking?.kind === 'others') {
      return { title: sc('Sign out the other devices?'), consequence: sc('Every other device must sign in again. This phone stays signed in.'), confirm: tc('Sign out') };
    }
    if (asking?.kind === 'remove') {
      return { title: asking.method === 'apple' ? sc('Remove Apple?') : sc('Remove Google?'), consequence: sc('You can no longer sign in that way. Your records stay in your account.'), confirm: removeLabel(asking.method) };
    }
    return null;
  })();

  return (
    <View testID="devices-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + BUN_SPACE.lg }}>
        <StageHeader back={{ onPress: () => router.back() }} title={sc('Devices and sign-in')} />
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          {loaded === null && !loadFailed ? <BunText tone="muted">{sc('Loading…')}</BunText> : null}
          {loadFailed ? (
            <>
              <FailureNote text={sc("Couldn't load your devices. Try again.")} />
              <PillButton label={tc('Try again')} onPress={() => void load()} />
            </>
          ) : null}
          {loaded !== null ? (
            <>
              <BunText variant="heading" role="heading" accessibilityRole="header">{sc('Sign-in methods')}</BunText>
              <Card testID="devices-methods" style={{ gap: BUN_SPACE.sm }}>
                {(['apple', 'google', 'email'] as const).filter((method) => method === 'email' || linked.includes(method)).map((method) => (
                  <View key={method} style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs }}>
                    <View style={{ flex: 1, gap: BUN_SPACE.xxs }}>
                      <BunText style={{ fontWeight: '700' }}>{methodLabel(method)}</BunText>
                      {method === 'email' ? <BunText variant="caption" tone="muted">{maskEmail(account.email)}</BunText> : null}
                    </View>
                    {method !== 'email' && linkedSocial.length > 1 ? (
                      <PillButton
                        kind="secondary"
                        label={removeLabel(method)}
                        busy={working === `remove:${method}`}
                        disabled={working !== null && working !== `remove:${method}`}
                        onPress={() => setAsking({ kind: 'remove', method })}
                      />
                    ) : null}
                  </View>
                ))}
                <BunText variant="caption" tone="muted">{confirmLine}</BunText>
              </Card>
              {linkable.map((method) => (
                <PillButton
                  key={method}
                  testID={`devices-link-${method}`}
                  kind="secondary"
                  label={linkLabel(method)}
                  busy={working === `link:${method}`}
                  disabled={working !== null && working !== `link:${method}`}
                  onPress={() => void changeMethod(method, 'link')}
                />
              ))}
              <BunText variant="heading" role="heading" accessibilityRole="header">{sc('Signed-in devices')}</BunText>
              <Card testID="devices-list" padding="sm" style={{ gap: 0 }}>
                {loaded.devices.map((device, index) => {
                  const name = deviceName(device.user_agent) ?? sc('Another device');
                  return (
                    <View
                      key={device.id}
                      testID={`device-${device.id}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs, paddingVertical: BUN_SPACE.xs, borderTopWidth: index === 0 ? 0 : BUN_OUTLINE.rule, borderTopColor: colors.rule }}
                    >
                      <View style={{ flex: 1, gap: BUN_SPACE.xxs }}>
                        <BunText style={{ fontWeight: '700' }}>{device.current ? `${name} · ${sc('This phone')}` : name}</BunText>
                        <BunText variant="caption" tone="muted">{sc('Signed in {signedIn} · last used {lastUsed}', { signedIn: dayText(device.signed_in_at), lastUsed: dayText(device.last_active_at) })}</BunText>
                        {device.current ? <BunText variant="caption" tone="muted">{sc('To sign out this phone, use Sign out in Settings.')}</BunText> : null}
                      </View>
                      {device.current ? null : (
                        <PillButton
                          kind="secondary"
                          label={tc('Sign out')}
                          accessibilityLabel={sc('Sign out {device}', { device: name })}
                          busy={working === `device:${device.id}`}
                          disabled={working !== null && working !== `device:${device.id}`}
                          onPress={() => setAsking({ kind: 'device', device, name })}
                        />
                      )}
                    </View>
                  );
                })}
              </Card>
              {others.length > 0 ? (
                <PillButton
                  kind="secondary"
                  label={sc('Sign out the other devices')}
                  busy={working === 'others'}
                  disabled={working !== null && working !== 'others'}
                  onPress={() => setAsking({ kind: 'others' })}
                />
              ) : null}
              {problem ? <FailureNote text={problem} /> : null}
            </>
          ) : null}
        </View>
      </ScrollView>
      <ConfirmSheet
        visible={question !== null}
        title={question?.title ?? ''}
        consequence={question?.consequence ?? ''}
        confirmLabel={question?.confirm ?? tc('Sign out')}
        cancelLabel={tc('Cancel')}
        onConfirm={confirm}
        onCancel={() => setAsking(null)}
      />
    </View>
  );
}
