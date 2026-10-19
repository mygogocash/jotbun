// R6 first run (plan §6.4) as a pure model: the onboarding story, the reminder
// question that follows it, where the first run goes next, and the sign-in
// gate. No React, no React Native. The words live in the screens, which pass
// them to `tc` as literals.
//
// - The story is three steps (the coffee maths, "your diary stays private",
//   "log your first coffee"), then the reminder question. Skip leaves the
//   story for that question; it never skips past it, and the question itself
//   asks the phone nothing until the person says Turn on.
// - The coffee maths is today's intro maths (`spendIntro.ts`), not a copy.
// - Sign-in: a provider can be chosen only with the terms ticked. Only a
//   session the seam reports `active` leaves the screen; "not configured" and
//   every other answer stay on it, so nothing pretends to sign in.
import { SPEND_INTRO_YEARLY_BAHT, formatIntroBaht } from '../../../spendIntro.ts';
import type { PermissionOutcome, ReminderPreferenceInput } from '../../../../notifications/reminders.ts';

// ---------------------------------------------------------------------------
// The story

export type StoryStep = 'coffee' | 'private' | 'first-coffee';
export type OnboardingStep = StoryStep | 'reminder';

export const STORY_STEPS: readonly StoryStep[] = ['coffee', 'private', 'first-coffee'];

/** Where Skip goes: out of the story, to the reminder question. */
export const SKIP_TO: OnboardingStep = 'reminder';

/** Next: the following story step, then the reminder question, which is the last. */
export function stepAfter(step: OnboardingStep): OnboardingStep {
  const at = STORY_STEPS.indexOf(step as StoryStep);
  return at >= 0 && at < STORY_STEPS.length - 1 ? STORY_STEPS[at + 1] : 'reminder';
}

/** The dots: the story step out of three, or null on the reminder question (it is not a story step). */
export function storyProgress(step: OnboardingStep): { step: number; total: number } | null {
  const at = STORY_STEPS.indexOf(step as StoryStep);
  return at < 0 ? null : { step: at + 1, total: STORY_STEPS.length };
}

// ---------------------------------------------------------------------------
// The coffee maths

/** The coffee in today's intro copy ("One ฿60 coffee, every day"); `SPEND_INTRO_YEARLY_BAHT` is it times 365. */
export const COFFEE_PER_DAY_BAHT = 60;

/** "฿60" a day and "฿21,900" a year, grouped as today's intro shows them. */
export function coffeeMaths(): { perDay: string; perYear: string } {
  return { perDay: formatIntroBaht(COFFEE_PER_DAY_BAHT), perYear: formatIntroBaht(SPEND_INTRO_YEARLY_BAHT) };
}

// ---------------------------------------------------------------------------
// The reminder question

export const FIRST_REMINDER_TIME = '20:00';

/** What Turn on asks the reminder service for: on, at 20:00, every day (the service's default when no days are given). Nothing else. */
export const FIRST_REMINDER: ReminderPreferenceInput = { enabled: true, localTime: FIRST_REMINDER_TIME };

/** How the question ends, once the reminder service has answered Turn on. */
export type PrimingAnswer = 'scheduled' | 'denied' | 'unsupported' | 'failed';

/**
 * The reminder service's answer as the screen says it. `disabled` only
 * answers a request to turn reminders off, which onboarding never makes, so
 * it reads as a calm failure rather than as success.
 */
export function primingAnswer(outcome: PermissionOutcome): PrimingAnswer {
  switch (outcome) {
    case 'scheduled':
    case 'denied':
    case 'unsupported':
      return outcome;
    default:
      return 'failed';
  }
}

/** After the reminder question: sign in, or with a session already, log that first coffee. */
export function afterOnboarding(signedIn: boolean): '/login' | '/spend/add' {
  return signedIn ? '/spend/add' : '/login';
}

// ---------------------------------------------------------------------------
// Promises (onboarding's private step and sign-in's reassurance)

/** Three plain promises, from the plan's privacy list (§6.4). English; the screens translate them. */
export const PRIVACY_PROMISES: readonly { readonly key: string; readonly text: string }[] = [
  { key: 'no-bank', text: 'No bank connection. You add what you spend.' },
  { key: 'never-sold', text: 'Your diary is never sold.' },
  { key: 'no-ads', text: 'No ads.' },
];

// ---------------------------------------------------------------------------
// Sign-in

export type SignInMethod = 'apple' | 'google' | 'email';

/** Equals, in this order: no provider is drawn as the favourite. */
export const SIGN_IN_METHODS: readonly SignInMethod[] = ['apple', 'google', 'email'];

/** What one attempt came to: the session seam's outcome, or "not configured" when there is no seam to sign in through. */
export type SignInAttempt = 'not_configured' | 'active' | 'cancelled' | 'failed' | 'reauth_required';

export type SignInState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'signing_in'; readonly method: SignInMethod }
  | { readonly phase: 'not_configured' }
  | { readonly phase: 'failed' };

/** The providers work only with the terms ticked, and not while an attempt runs or when sign-in is not configured. */
export function canChooseProvider(termsAccepted: boolean, state: SignInState): boolean {
  return termsAccepted && (state.phase === 'idle' || state.phase === 'failed');
}

/**
 * Where an attempt leaves the screen. Only `active` goes anywhere (the
 * diary). Cancelled is back where it was; a failure or a sign-in that needs
 * doing again says so; "not configured" says today's message.
 */
export function afterSignInAttempt(attempt: SignInAttempt): { state: SignInState; go: '/spend' | null } {
  switch (attempt) {
    case 'active':
      return { state: { phase: 'idle' }, go: '/spend' };
    case 'cancelled':
      return { state: { phase: 'idle' }, go: null };
    case 'not_configured':
      return { state: { phase: 'not_configured' }, go: null };
    default:
      return { state: { phase: 'failed' }, go: null };
  }
}
