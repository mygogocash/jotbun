// 1C-T8's drafts in each of their states (development only), for the owner's
// E2 screenshots: the email code, account exists, session ended with the
// keep-or-erase choice, devices and methods, confirm it's you, the reminder
// question after sign-in, the terms step and the welcome link. The `signin`
// area is not approved yet; only the welcome link reads it, and its section
// turns it on. The copy is a draft (signin/draftCopy.ts).
//
// Every section is drawn on fakes: no sign-in, no network, no notification
// prompt. Draft labels are not in the catalogs, so the scripts reach controls
// by test id (or by today's approved words), in every language. Nothing here
// presses a button that leaves the screen.
import type { PolicyVersionDto } from '@gogospend/contracts';

import type { DeviceDto, SignInMethod } from '@mobile/auth/betterAuthPort';
import type { CodeOutcome, FreshOutcome, SignInResult } from '@mobile/auth/credentialProvider';
import type { SessionEndedView } from '@mobile/auth/sessionEnded';
import type { StoredSession } from '@mobile/auth/sessionStore';
import { OnboardingScreen } from '@mobile/screens/redesign/account/OnboardingScreen';
import { AccountExistsScreen } from '@mobile/screens/redesign/signin/AccountExistsScreen';
import { DevicesScreen } from '@mobile/screens/redesign/signin/DevicesScreen';
import type { DevicesPort } from '@mobile/screens/redesign/signin/DevicesScreen';
import { EmailCodeScreen } from '@mobile/screens/redesign/signin/EmailCodeScreen';
import { ReminderQuestionScreen } from '@mobile/screens/redesign/signin/ReminderQuestionScreen';
import { SessionEndedScreen } from '@mobile/screens/redesign/signin/SessionEndedScreen';
import type { SessionEndedProvider, UnsentRow } from '@mobile/screens/redesign/signin/SessionEndedScreen';
import { TermsScreen } from '@mobile/screens/redesign/signin/TermsScreen';
import { useFreshSignIn } from '@mobile/screens/redesign/signin/useFreshSignIn';
import type { PendingPolicy, PolicyClient } from '@mobile/spend/v1/policies';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from '../registry';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

// ---------------------------------------------------------------------------
// Fakes

const APPLE_ACCOUNT: StoredSession = { accountId: '0a000000-0000-4000-8000-00000000000a', sessionId: '0b000000-0000-4000-8000-00000000000b', email: 'karn@icloud.com', method: 'apple' };
const GOOGLE_ACCOUNT: StoredSession = { ...APPLE_ACCOUNT, email: 'karn@gmail.com', method: 'google' };
const EMAIL_ACCOUNT: StoredSession = { ...APPLE_ACCOUNT, email: 'kanya@gmail.com', method: 'email' };
const OTHER_ACCOUNT: StoredSession = { accountId: '0c000000-0000-4000-8000-00000000000c', sessionId: '0d000000-0000-4000-8000-00000000000d', email: 'ploy@gmail.com', method: 'apple' };
const EVERY_METHOD: readonly SignInMethod[] = ['apple', 'google', 'email'];

type ProviderScript = {
  readonly account?: StoredSession;
  /** The account after a sign-in that goes through. */
  readonly signInAs?: StoredSession;
  readonly code?: CodeOutcome;
  readonly signIn?: SignInResult['outcome'];
  readonly fresh?: FreshOutcome;
};

/** A credential provider that only answers as scripted: it never signs anyone in. */
function fakeProvider(script: ProviderScript = {}): SessionEndedProvider {
  let current: StoredSession | null = script.account ?? APPLE_ACCOUNT;
  return {
    account: () => current,
    methods: () => EVERY_METHOD,
    sendEmailCode: async () => script.code ?? 'sent',
    async signIn() {
      const outcome = script.signIn ?? 'active';
      if (outcome === 'active') current = script.signInAs ?? current;
      return { outcome, methods: [], created: false };
    },
    freshSignIn: async () => script.fresh ?? 'fresh',
  };
}

/** Today 12:10 and 12:12 and 12:30, from es-session-ended. */
const UNSENT: readonly UnsentRow[] = [
  { title: 'ข้าวมันไก่', at: '12:10', amount: '฿50.00' },
  { title: 'ชาเย็น', at: '12:12', amount: '฿25.00' },
  { title: 'วิน', at: '12:30', amount: '฿20.00' },
];

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** This iPhone, an Android phone and a Mac, as the devices list shows them. */
function devices(): DeviceDto[] {
  return [
    { id: APPLE_ACCOUNT.sessionId, current: true, signed_in_at: hoursAgo(24 * 9), last_active_at: hoursAgo(0), user_agent: 'Jotbun/1 (iPhone; iOS 26.1)' },
    { id: '0e000000-0000-4000-8000-00000000000e', current: false, signed_in_at: hoursAgo(24 * 20), last_active_at: hoursAgo(26), user_agent: 'Jotbun/1 (Linux; Android 15)' },
    { id: '0f000000-0000-4000-8000-00000000000f', current: false, signed_in_at: hoursAgo(24 * 38), last_active_at: hoursAgo(24 * 10), user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_1)' },
  ];
}

function fakePort(linked: readonly SignInMethod[]): DevicesPort {
  return {
    methods: EVERY_METHOD,
    devices: async () => devices(),
    signOutDevice: async () => undefined,
    signOutOtherDevices: async () => 2,
    linkMethod: async () => undefined,
    unlinkMethod: async () => undefined,
    linkedMethods: async () => [...linked],
  };
}

const PUBLISHED: PolicyVersionDto[] = [
  {
    kind: 'privacy', version: 4, required: true, published_at: '2026-10-01T00:00:00.000Z',
    text: { th: 'นโยบายความเป็นส่วนตัวฉบับร่างสำหรับแค็ตตาล็อก', en: 'A placeholder privacy policy for the catalogue. The published text comes from /v1/policies.' },
  },
  {
    kind: 'terms', version: 2, required: true, published_at: '2026-10-01T00:00:00.000Z',
    text: { th: 'ข้อกำหนดการให้บริการฉบับร่างสำหรับแค็ตตาล็อก', en: 'Placeholder terms of service for the catalogue. The published text comes from /v1/policies.' },
  },
];
const PENDING: readonly PendingPolicy[] = [{ kind: 'privacy', version: 4 }, { kind: 'terms', version: 2 }];

/** A policy client whose acceptance goes through, never answers, or fails. */
function fakePolicies(accept: 'ok' | 'never' | 'fails' = 'ok'): PolicyClient {
  return {
    pending: async () => [...PENDING],
    published: async () => PUBLISHED,
    accept: () => {
      if (accept === 'never') return new Promise<void>(() => undefined);
      if (accept === 'fails') return Promise.reject(new Error('The acceptance could not be sent.'));
      return Promise.resolve();
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures and screens

type DraftFixture = ScreenFixture & { readonly provider: SessionEndedProvider };
type DevicesFixture = DraftFixture & { readonly port: DevicesPort };
type TermsFixture = ScreenFixture & { readonly policies: PolicyClient };

/** The drafts read no diary: empty fakes, and no device diary. */
const drafts = (script: ProviderScript = {}) => (): DraftFixture => ({ resources: createFakeResources().resources, diary: null, provider: fakeProvider(script) });
const withDevices = (account: StoredSession, linked: readonly SignInMethod[]) => (): DevicesFixture => ({ ...drafts({ account })(), port: fakePort(linked) });
const withTerms = (accept: 'ok' | 'never' | 'fails' = 'ok') => (): TermsFixture => ({ resources: createFakeResources().resources, diary: null, policies: fakePolicies(accept) });

const nothing = () => undefined;
const ended = (kind: SessionEndedView['kind'] = 'signed_out_elsewhere'): SessionEndedView => ({ kind, accountId: APPLE_ACCOUNT.accountId, method: 'apple', unsent: 3 });

const emailCode = ({ provider }: DraftFixture) => <EmailCodeScreen provider={provider} mode="sign_in" onDone={nothing} onBack={nothing} />;
const sessionEnded = (kind?: SessionEndedView['kind']) => ({ provider }: DraftFixture) => (
  <SessionEndedScreen view={ended(kind)} unsentRows={UNSENT} provider={provider} eraseAccount={async () => undefined} onResumed={nothing} />
);
const devicesScreen = ({ port, provider }: DevicesFixture) => (
  <DevicesScreen port={port} freshSignIn={async () => 'cancelled'} account={provider.account() ?? APPLE_ACCOUNT} />
);
const termsScreen = ({ policies }: TermsFixture) => <TermsScreen pending={PENDING} client={policies} onAccepted={nothing} />;

/** Devices with the fresh sign-in wired as 1C-T9 wires it: linking opens "Confirm it's you". */
function DevicesWithConfirm({ port, provider }: { port: DevicesPort; provider: SessionEndedProvider }) {
  const { freshSignIn, sheet } = useFreshSignIn(provider);
  return (
    <>
      <DevicesScreen port={port} freshSignIn={freshSignIn} account={provider.account() ?? APPLE_ACCOUNT} />
      {sheet}
    </>
  );
}
const confirming = ({ port, provider }: DevicesFixture) => <DevicesWithConfirm port={port} provider={provider} />;

// ---------------------------------------------------------------------------
// Scripts

const toAddress = (): ScriptStep[] => [{ call: 'onChangeText', on: { testID: 'email-code-email' }, args: ['kanya@gmail.com'] }];
const toCode = (): ScriptStep[] => [...toAddress(), { call: 'onPress', on: { testID: 'email-code-send' } }, { waitFor: 'email-code-code-step' }];
const toOtherAccount = (): ScriptStep[] => [{ call: 'onPress', on: { testID: 'session-ended-main' } }, { waitFor: 'other-account-records' }];
const tickTerms = (): ScriptStep => ({ call: 'onToggle', on: { checked: false } });
const continueTerms = (tc: Translate): ScriptStep[] => [tickTerms(), { press: tc('Continue') }];

export const SIGNIN_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'signin-email-address', title: 'Sign-in drafts: email, the address', fixture: drafts(), script: toAddress, render: emailCode }),
  screenSection({
    id: 'signin-email-code',
    title: 'Sign-in drafts: email, the code and the resend countdown',
    fixture: drafts(),
    script: () => [...toCode(), { call: 'onChangeText', on: { testID: 'email-code-field' }, args: ['482'] }],
    render: emailCode,
  }),
  screenSection({
    id: 'signin-email-wrong-code',
    title: 'Sign-in drafts: email, a wrong code',
    fixture: drafts({ signIn: 'wrong_code' }),
    script: () => [...toCode(), { call: 'onChangeText', on: { testID: 'email-code-field' }, args: ['111111'] }, { waitFor: 'signin-failure' }],
    render: emailCode,
  }),
  screenSection({
    id: 'signin-email-rate-limited',
    title: 'Sign-in drafts: email, too many codes',
    fixture: drafts({ code: 'rate_limited' }),
    script: () => [...toAddress(), { call: 'onPress', on: { testID: 'email-code-send' } }, { waitFor: 'signin-failure' }],
    render: emailCode,
  }),
  screenSection({
    id: 'signin-account-exists-apple',
    title: 'Sign-in drafts: account exists, with Apple',
    fixture: drafts(),
    script: () => [{ waitFor: 'account-exists-screen' }],
    render: () => <AccountExistsScreen methods={['apple', 'email']} onMethod={nothing} onBack={nothing} />,
  }),
  screenSection({
    id: 'signin-account-exists-email',
    title: 'Sign-in drafts: account exists, email only',
    fixture: drafts(),
    script: () => [{ waitFor: 'account-exists-screen' }],
    render: () => <AccountExistsScreen methods={['email']} onMethod={nothing} onBack={nothing} />,
  }),
  screenSection({ id: 'signin-session-ended', title: 'Sign-in drafts: session ended, three unsent records', fixture: drafts(), script: () => [{ waitFor: 'session-ended-unsent' }], render: sessionEnded() }),
  screenSection({
    id: 'signin-session-ended-unavailable',
    title: 'Sign-in drafts: session ended, account unavailable',
    fixture: drafts(),
    script: () => [{ waitFor: 'session-ended-unsent' }],
    render: sessionEnded('account_unavailable'),
  }),
  screenSection({
    id: 'signin-session-ended-other-account',
    title: 'Sign-in drafts: another account, keep or erase',
    fixture: drafts({ signInAs: OTHER_ACCOUNT }),
    script: toOtherAccount,
    render: sessionEnded(),
  }),
  screenSection({
    id: 'signin-session-ended-erase',
    title: 'Sign-in drafts: another account, the erase confirmation',
    fixture: drafts({ signInAs: OTHER_ACCOUNT }),
    script: () => [...toOtherAccount(), { call: 'onPress', on: { testID: 'other-account-erase' } }, { waitFor: 'sheet-panel' }],
    render: sessionEnded(),
  }),
  screenSection({ id: 'signin-devices', title: 'Sign-in drafts: devices, three of them', fixture: withDevices(APPLE_ACCOUNT, ['apple', 'email']), script: () => [{ waitFor: 'devices-list' }], render: devicesScreen }),
  screenSection({
    id: 'signin-devices-methods',
    title: 'Sign-in drafts: devices, Apple and Google linked',
    fixture: withDevices(APPLE_ACCOUNT, ['apple', 'google', 'email']),
    script: () => [{ waitFor: 'devices-list' }],
    render: devicesScreen,
  }),
  screenSection({
    id: 'signin-confirm-apple',
    title: "Sign-in drafts: confirm it's you, Apple",
    fixture: withDevices(APPLE_ACCOUNT, ['apple', 'email']),
    script: () => [{ waitFor: 'devices-list' }, { call: 'onPress', on: { testID: 'devices-link-google' } }, { waitFor: 'sheet-panel' }],
    render: confirming,
  }),
  screenSection({
    id: 'signin-confirm-google',
    title: "Sign-in drafts: confirm it's you, Google",
    fixture: withDevices(GOOGLE_ACCOUNT, ['google', 'email']),
    script: () => [{ waitFor: 'devices-list' }, { call: 'onPress', on: { testID: 'devices-link-apple' } }, { waitFor: 'sheet-panel' }],
    render: confirming,
  }),
  screenSection({
    id: 'signin-confirm-email',
    title: "Sign-in drafts: confirm it's you, an email code",
    fixture: withDevices(EMAIL_ACCOUNT, ['email']),
    script: () => [
      { waitFor: 'devices-list' },
      { call: 'onPress', on: { testID: 'devices-link-google' } },
      { waitFor: 'sheet-panel' },
      { call: 'onPress', on: { testID: 'email-code-send' } },
      { waitFor: 'email-code-code-step' },
    ],
    render: confirming,
  }),
  screenSection({
    id: 'signin-reminder',
    title: 'Sign-in drafts: the reminder question after sign-in',
    fixture: drafts(),
    script: () => [{ waitFor: 'reminder-question-screen' }],
    render: () => <ReminderQuestionScreen reminders={{ setPreference: async () => 'scheduled' }} onDone={nothing} />,
  }),
  screenSection({ id: 'signin-terms', title: 'Sign-in drafts: terms, unticked', fixture: withTerms(), script: () => [{ waitFor: 'terms-screen' }], render: termsScreen }),
  screenSection({ id: 'signin-terms-ticked', title: 'Sign-in drafts: terms, ticked', fixture: withTerms(), script: () => [tickTerms(), { waitFor: 'terms-footer' }], render: termsScreen }),
  screenSection({
    id: 'signin-terms-accepting',
    title: 'Sign-in drafts: terms, accepting',
    fixture: withTerms('never'),
    script: (tc) => [...continueTerms(tc), { waitFor: tc('Saving…') }],
    render: termsScreen,
  }),
  screenSection({
    id: 'signin-terms-failed',
    title: 'Sign-in drafts: terms, the acceptance failed',
    fixture: withTerms('fails'),
    script: (tc) => [...continueTerms(tc), { waitFor: 'signin-failure' }],
    render: termsScreen,
  }),
  screenSection({
    id: 'signin-terms-policy',
    title: 'Sign-in drafts: terms, a policy\'s text',
    fixture: withTerms(),
    script: () => [{ call: 'onPress', on: { testID: 'terms-open-terms' } }, { waitFor: 'terms-policy-text' }],
    render: termsScreen,
  }),
  screenSection({
    id: 'signin-welcome-link',
    title: 'Sign-in drafts: the welcome link',
    fixture: drafts(),
    script: () => [{ waitFor: 'welcome-sign-in-link' }],
    render: () => <OnboardingScreen reminders={{ setPreference: async () => 'scheduled' }} signinArea />,
  }),
];
