// The first run in each of its states (redesign R6, development only): the
// real OnboardingScreen and SignInScreen, reached with the same steps as their
// render tests. Thai, dark mode and the bun intensity are the catalogue's own
// switches, as for every section.
//
// Neither screen reads the diary, so the fixtures are empty fakes. The
// reminder service and the sign-in are fakes too, so a section never asks
// the phone for notification permission and never reaches a sign-in
// provider, even once one is installed. Reduced motion is the OS's setting,
// not a section: with it, step 1's coins are simply there, as they are once
// they have landed. "Not now" and "Continue" leave the screen (the app's real
// router), so no section presses them.
//
// Not registered yet: R6 waits for E2 checkpoint 4, and registry.tsx adds
// these to SCREEN_SECTIONS then.
import type { PermissionOutcome } from '@mobile/notifications/reminders';
import { OnboardingScreen } from '@mobile/screens/redesign/account/OnboardingScreen';
import type { OnboardingReminders } from '@mobile/screens/redesign/account/OnboardingScreen';
import { SignInScreen } from '@mobile/screens/redesign/account/SignInScreen';
import type { SignInAttempt, SignInMethod } from '@mobile/spend/v1/redesign/account/onboardingModel';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import type { CatalogueSection } from '../registry';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

type OnboardingFixture = ScreenFixture & { readonly reminders: OnboardingReminders };
type SignInFixture = ScreenFixture & { readonly signIn: (method: SignInMethod) => Promise<SignInAttempt> };

/** The first run reads no diary: empty fakes, and no device diary (as on the web). */
const noDiary = (): ScreenFixture => ({ resources: createFakeResources().resources, diary: null });

/** A reminder service that answers Turn on with `answer`, or fails. */
function onboarding(answer: PermissionOutcome | 'fails' = 'scheduled'): () => OnboardingFixture {
  return () => ({
    ...noDiary(),
    reminders: {
      setPreference: async () => {
        if (answer === 'fails') throw new Error('The reminder could not be set.');
        return answer;
      },
    },
  });
}

/** A sign-in that answers `attempt`, or never answers (an attempt still running). */
function signingIn(attempt: SignInAttempt | 'never'): () => SignInFixture {
  return () => ({
    ...noDiary(),
    signIn: () => (attempt === 'never' ? new Promise<SignInAttempt>(() => undefined) : Promise.resolve(attempt)),
  });
}

const onboardingScreen = (fixture: OnboardingFixture) => <OnboardingScreen reminders={fixture.reminders} />;
const signInScreen = (fixture: SignInFixture) => <SignInScreen signIn={fixture.signIn} />;

/** Through the story to the reminder question: Next, Next, then the commitment. */
const throughStory = (tc: Translate): ScriptStep[] => [{ press: tc('Next') }, { press: tc('Next') }, { press: tc("Let's start!") }];
/** The question answered: Turn on, then wait for Continue. */
const turnOn = (tc: Translate): ScriptStep[] => [...throughStory(tc), { press: tc('Turn on') }, { waitFor: tc('Continue') }];
const tick = (tc: Translate): ScriptStep => ({ press: tc('I agree to the Terms of Service and the Privacy Policy') });

export const FIRST_RUN_SECTIONS: CatalogueSection[] = [
  screenSection({ id: 'onboarding-coffee', title: 'Onboarding: the coffee maths', fixture: onboarding(), script: () => [{ waitFor: 'onboarding-coffee' }], render: onboardingScreen }),
  screenSection({
    id: 'onboarding-private',
    title: 'Onboarding: your diary stays private',
    fixture: onboarding(),
    script: (tc) => [{ press: tc('Next') }, { waitFor: tc('Your diary stays private') }],
    render: onboardingScreen,
  }),
  screenSection({
    id: 'onboarding-first-coffee',
    title: 'Onboarding: log your first coffee',
    fixture: onboarding(),
    script: (tc) => [{ press: tc('Next') }, { press: tc('Next') }, { waitFor: tc("Let's start!") }],
    render: onboardingScreen,
  }),
  screenSection({
    id: 'onboarding-skipped',
    title: 'Onboarding: skipped to the reminder question',
    // The question as it stands before the phone is asked anything.
    fixture: onboarding(),
    script: (tc) => [{ press: tc('Skip') }, { waitFor: tc('Turn on') }],
    render: onboardingScreen,
  }),
  screenSection({ id: 'onboarding-reminder-on', title: 'Onboarding: reminder on', fixture: onboarding('scheduled'), script: turnOn, render: onboardingScreen }),
  screenSection({ id: 'onboarding-reminder-denied', title: 'Onboarding: reminder denied', fixture: onboarding('denied'), script: turnOn, render: onboardingScreen }),
  screenSection({
    id: 'onboarding-reminder-unsupported',
    title: 'Onboarding: reminders unsupported (web)',
    fixture: onboarding('unsupported'),
    script: turnOn,
    render: onboardingScreen,
  }),
  screenSection({ id: 'onboarding-reminder-failed', title: 'Onboarding: reminder not set', fixture: onboarding('fails'), script: turnOn, render: onboardingScreen }),

  screenSection({
    id: 'sign-in-terms-unticked',
    title: 'Sign-in: before the terms are ticked',
    fixture: signingIn('not_configured'),
    script: (tc) => [{ waitFor: tc('Tick the box to agree to the terms first.') }],
    render: signInScreen,
  }),
  screenSection({ id: 'sign-in-terms-ticked', title: 'Sign-in: terms ticked', fixture: signingIn('not_configured'), script: (tc) => [tick(tc)], render: signInScreen }),
  screenSection({
    id: 'sign-in-signing-in',
    title: 'Sign-in: signing in',
    fixture: signingIn('never'),
    script: (tc) => [tick(tc), { press: tc('Continue with Apple') }, { waitFor: tc('Signing in…') }],
    render: signInScreen,
  }),
  screenSection({
    id: 'sign-in-not-configured',
    title: 'Sign-in: not configured',
    // Today's answer from the session seam, given by a fake so the catalogue never signs in for real.
    fixture: signingIn('not_configured'),
    script: (tc) => [tick(tc), { press: tc('Continue with Google') }, { waitFor: tc('Back to Jotbun') }],
    render: signInScreen,
  }),
  screenSection({
    id: 'sign-in-failed',
    title: 'Sign-in: did not finish',
    fixture: signingIn('failed'),
    script: (tc) => [tick(tc), { press: tc('Continue with email') }, { waitFor: tc("Sign-in didn't finish. Try again.") }],
    render: signInScreen,
  }),
];
