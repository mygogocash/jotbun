// 1C-T8: the fresh sign-in hook and its "Confirm it's you" sheet (K14, R43).
// Email: the code goes only to the account's own address, and six digits
// confirm it. Apple: the sheet's one button runs the native fresh sign-in,
// never a sign-up. Closing answers cancelled. An Apple fresh sign-in that
// could not reach the service is handed back at once (sign in again, 1C-T5's
// note); another failure offers the email code instead (C14).
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import type { SignInRequest } from '@mobile/auth/betterAuthPort';
import type { CodeOutcome, FreshOutcome, SignInResult } from '@mobile/auth/credentialProvider';
import type { StoredSession } from '@mobile/auth/sessionStore';
import { mountInApp, settle } from '@mobile/dev/catalogue/catalogueTestHarness';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { PillButton } from '@mobile/ui/PillButton';
import { useFreshSignIn } from './useFreshSignIn';
import type { FreshSignInProvider } from './useFreshSignIn';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const APPLE: StoredSession = { accountId: '0a000000-0000-4000-8000-00000000000a', sessionId: '0b000000-0000-4000-8000-00000000000b', email: 'karn@icloud.com', method: 'apple' };
const EMAIL: StoredSession = { ...APPLE, email: 'Kanya@Gmail.com', method: 'email' };

function provider(account: StoredSession, fresh: FreshOutcome[] = ['fresh']) {
  const answers = [...fresh];
  return {
    account: vi.fn((): StoredSession | null => account),
    freshSignIn: vi.fn(async (_request: SignInRequest): Promise<FreshOutcome> => answers.shift() ?? 'fresh'),
    sendEmailCode: vi.fn(async (_email: string): Promise<CodeOutcome> => 'sent'),
    signIn: vi.fn(async (_request: SignInRequest): Promise<SignInResult> => ({ outcome: 'active', methods: [], created: false })),
  } satisfies FreshSignInProvider;
}

/** A screen with one sensitive action, which runs the fresh sign-in first. */
function Host({ fake, outcomes }: { fake: FreshSignInProvider; outcomes: FreshOutcome[] }) {
  const { freshSignIn, sheet } = useFreshSignIn(fake);
  return (
    <>
      <PillButton label="Sign out everywhere" onPress={() => void freshSignIn().then((outcome) => outcomes.push(outcome))} />
      {sheet}
    </>
  );
}

async function open(fake: FreshSignInProvider) {
  const outcomes: FreshOutcome[] = [];
  mountInApp(<Host fake={fake} outcomes={outcomes} />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  const sheet = await screen.findByRole('dialog', { name: "Confirm it's you" });
  return { outcomes, sheet };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

test("email: the code goes only to the account's own address, and six digits confirm it", async () => {
  const fake = provider(EMAIL);
  const { outcomes, sheet } = await open(fake);
  expect(within(sheet).queryByRole('textbox', { name: 'Email address' })).toBeNull();
  expect(within(sheet).getByTestId('email-code-address').textContent).toBe('k•••@gmail.com');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Send the code' }));
  await flush();
  expect(fake.sendEmailCode).toHaveBeenCalledWith('kanya@gmail.com');
  fireEvent.change(screen.getByRole('textbox', { name: '6-digit code' }), { target: { value: '246810' } });
  await flush();
  expect(fake.freshSignIn).toHaveBeenCalledTimes(1);
  expect(fake.freshSignIn).toHaveBeenCalledWith({ method: 'email', email: 'kanya@gmail.com', code: '246810' });
  expect(fake.signIn).not.toHaveBeenCalled();
  expect(outcomes).toEqual(['fresh']);
  expect(screen.queryByRole('dialog', { name: "Confirm it's you" })).toBeNull();
});

test('Apple: the sheet runs the native fresh sign-in, never a sign-up, and fresh closes it', async () => {
  const fake = provider(APPLE, ['cancelled', 'fresh']);
  const { outcomes, sheet } = await open(fake);
  expect(within(sheet).getByText("Apple will ask you to confirm it's you.")).toBeTruthy();
  // The native sheet dismissed: ours stays for another try.
  fireEvent.click(within(sheet).getByRole('button', { name: 'Continue with Apple' }));
  await flush();
  expect(outcomes).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Apple' }));
  await flush();
  expect(fake.freshSignIn).toHaveBeenCalledTimes(2);
  expect(fake.freshSignIn).toHaveBeenLastCalledWith({ method: 'apple', signUp: false });
  expect(outcomes).toEqual(['fresh']);
  expect(screen.queryByRole('dialog', { name: "Confirm it's you" })).toBeNull();
});

test('closing the sheet answers cancelled and signs in nothing', async () => {
  const fake = provider(APPLE);
  const { outcomes, sheet } = await open(fake);
  // A second ask while the sheet is open shares it: one sheet, one answer for both.
  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  expect(screen.getAllByRole('dialog', { name: "Confirm it's you" })).toHaveLength(1);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
  await flush();
  expect(outcomes).toEqual(['cancelled', 'cancelled']);
  expect(fake.freshSignIn).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: "Confirm it's you" })).toBeNull();
});

test('an Apple fresh sign-in that cannot reach the service is handed back at once; another failure offers the email code', async () => {
  const unreachable = await open(provider(APPLE, ['unavailable']));
  fireEvent.click(within(unreachable.sheet).getByRole('button', { name: 'Continue with Apple' }));
  await flush();
  expect(unreachable.outcomes).toEqual(['unavailable']);
  expect(screen.queryByRole('dialog', { name: "Confirm it's you" })).toBeNull();
  cleanup();
  const fake = provider(APPLE, ['failed']);
  const failed = await open(fake);
  fireEvent.click(within(failed.sheet).getByRole('button', { name: 'Continue with Apple' }));
  await flush();
  expect(failed.outcomes).toEqual([]);
  expect(screen.getByText("Couldn't confirm it's you. Try again, or use another way.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Use another way' }));
  expect(screen.getByTestId('email-code-address').textContent).toBe('k•••@icloud.com');
});

// The 1C-T8 fix round (review m1, RV1): an answer is never handed out twice.
test('a later fresh sign-in never reuses an earlier answer: a new sheet and a new sign-in', async () => {
  const fake = provider(APPLE, ['fresh', 'fresh']);
  const { outcomes, sheet } = await open(fake);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Continue with Apple' }));
  await flush();
  expect(outcomes).toEqual(['fresh']);
  expect(screen.queryByRole('dialog', { name: "Confirm it's you" })).toBeNull();
  // The next sensitive action asks again: nothing answers until the new sheet's sign-in does.
  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  await flush();
  expect(outcomes).toEqual(['fresh']);
  const again = await screen.findByRole('dialog', { name: "Confirm it's you" });
  fireEvent.click(within(again).getByRole('button', { name: 'Continue with Apple' }));
  await flush();
  expect(fake.freshSignIn).toHaveBeenCalledTimes(2);
  expect(outcomes).toEqual(['fresh', 'fresh']);
});
