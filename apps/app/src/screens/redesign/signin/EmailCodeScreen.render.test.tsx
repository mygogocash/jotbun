// 1C-T8: the email code draft (sa-signin, sa-email-code): six digits start
// exactly one sign-in, a wrong code says so and clears the field, the resend
// waits sixty seconds, the address shows masked, and the fresh mode codes the
// account's own address through the fresh sign-in.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import type { SignInRequest } from '@mobile/auth/betterAuthPort';
import type { CodeOutcome, FreshOutcome, SignInResult } from '@mobile/auth/credentialProvider';
import { mountInApp, settle } from '@mobile/dev/catalogue/catalogueTestHarness';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { EmailCodeScreen } from './EmailCodeScreen';
import type { EmailCodeProvider } from './EmailCodeScreen';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const ACTIVE: SignInResult = { outcome: 'active', methods: [], created: false };
const WRONG: SignInResult = { outcome: 'wrong_code', methods: [], created: false };

/** A provider that answers codes with `code`, then each sign-in in turn; `hold` keeps the first sign-in running. */
function provider(answers: { code?: CodeOutcome; signIn?: SignInResult[]; fresh?: FreshOutcome[]; hold?: boolean } = {}) {
  const signIns = [...(answers.signIn ?? [ACTIVE])];
  const fresh = [...(answers.fresh ?? ['fresh'])];
  return {
    sendEmailCode: vi.fn(async (_email: string): Promise<CodeOutcome> => answers.code ?? 'sent'),
    signIn: vi.fn((_request: SignInRequest): Promise<SignInResult> => (answers.hold ? new Promise<SignInResult>(() => undefined) : Promise.resolve(signIns.shift() ?? ACTIVE))),
    freshSignIn: vi.fn(async (_request: SignInRequest): Promise<FreshOutcome> => fresh.shift() ?? 'fresh'),
  } satisfies EmailCodeProvider;
}

const COPY = {
  address: 'Email address',
  send: 'Send the code',
  code: '6-digit code',
  sentTo: 'Enter the 6-digit code sent to',
  wrong: "That code isn't right. Type the 6 digits from the newest email.",
  resendIn: 'Send a new code in',
  resend: 'Send a new code',
  change: 'Change email',
  safe: 'Your records are still on this phone.',
} as const;

const button = (name: string) => screen.getByRole('button', { name });
const press = (name: string) => fireEvent.click(button(name));
const codeField = () => screen.getByRole('textbox', { name: COPY.code }) as HTMLInputElement;
/** Lets the provider's answer and the re-render it causes land. */
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

/** The address step, typed and sent: the screen is on the code step. */
async function toCode(fake: ReturnType<typeof provider>, address = 'kanya@gmail.com', onDone = vi.fn()) {
  mountInApp(<EmailCodeScreen provider={fake} mode="sign_in" onDone={onDone} onBack={vi.fn()} />);
  await settle();
  fireEvent.change(screen.getByRole('textbox', { name: COPY.address }), { target: { value: address } });
  press(COPY.send);
  await flush();
  expect(screen.getByRole('heading', { name: COPY.sentTo })).toBeTruthy();
  return onDone;
}

const type = (digits: string) => fireEvent.change(codeField(), { target: { value: digits } });

test('six digits start exactly one sign-in', async () => {
  const fake = provider({ hold: true });
  await toCode(fake);
  expect(codeField().getAttribute('autocomplete')).toBe('one-time-code');
  expect(codeField().getAttribute('inputmode')).toBe('numeric');
  type('12345');
  await flush();
  expect(fake.signIn).not.toHaveBeenCalled();
  // Letters, spaces and dashes never count as digits.
  type('12a 34-5');
  await flush();
  expect(codeField().value).toBe('12345');
  expect(fake.signIn).not.toHaveBeenCalled();
  // Two six-digit entries before the screen draws again, as a doubled autofill lands: one sign-in.
  act(() => {
    type('123456');
    type('654321');
  });
  await flush();
  expect(fake.signIn).toHaveBeenCalledTimes(1);
  expect(fake.signIn).toHaveBeenCalledWith({ method: 'email', email: 'kanya@gmail.com', code: '123456' });
  expect(fake.freshSignIn).not.toHaveBeenCalled();
});

test('a wrong code says so and clears the field', async () => {
  const fake = provider({ signIn: [WRONG, ACTIVE] });
  const onDone = await toCode(fake);
  type('111111');
  await flush();
  expect(screen.getByText(COPY.wrong)).toBeTruthy();
  expect(screen.getByText(COPY.safe)).toBeTruthy();
  expect(codeField().value).toBe('');
  expect(onDone).not.toHaveBeenCalled();
  type('222222');
  await flush();
  expect(fake.signIn).toHaveBeenCalledTimes(2);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledWith(ACTIVE);
});

test('resend waits sixty seconds', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  const fake = provider();
  await toCode(fake);
  expect(fake.sendEmailCode).toHaveBeenCalledTimes(1);
  const waiting = screen.getByTestId('email-code-resend');
  expect(waiting.getAttribute('aria-label')).toBe(`${COPY.resendIn} 1:00`);
  expect(waiting.getAttribute('aria-disabled')).toBe('true');
  act(() => { vi.advanceTimersByTime(59_000); });
  expect(screen.getByTestId('email-code-resend').getAttribute('aria-label')).toBe(`${COPY.resendIn} 0:01`);
  fireEvent.click(screen.getByTestId('email-code-resend'));
  expect(fake.sendEmailCode).toHaveBeenCalledTimes(1);
  act(() => { vi.advanceTimersByTime(1_000); });
  expect(button(COPY.resend).getAttribute('aria-disabled')).not.toBe('true');
  press(COPY.resend);
  await flush();
  expect(fake.sendEmailCode).toHaveBeenCalledTimes(2);
  expect(fake.sendEmailCode).toHaveBeenLastCalledWith('kanya@gmail.com');
  // The new code starts the wait again.
  expect(screen.getByTestId('email-code-resend').getAttribute('aria-label')).toBe(`${COPY.resendIn} 1:00`);
});

test('the address is masked', async () => {
  const fake = provider();
  await toCode(fake, '  Kanya.Sirisuk@Gmail.com ');
  expect(fake.sendEmailCode).toHaveBeenCalledWith('kanya.sirisuk@gmail.com');
  expect(screen.getByTestId('email-code-address').textContent).toBe('k•••@gmail.com');
  expect(screen.queryByText(/kanya\.sirisuk/i)).toBeNull();
  // Change email goes back to the address step.
  press(COPY.change);
  expect(screen.getByRole('textbox', { name: COPY.address })).toBeTruthy();
});

test('in fresh mode the address is fixed and freshSignIn is called', async () => {
  const fake = provider({ fresh: ['fresh'] });
  const onDone = vi.fn();
  mountInApp(<EmailCodeScreen provider={fake} mode="fresh" fixedEmail="Kanya@Gmail.com" onDone={onDone} onBack={vi.fn()} />);
  await settle();
  // No field for the address, and no way to change it.
  expect(screen.queryByRole('textbox', { name: COPY.address })).toBeNull();
  expect(screen.getByTestId('email-code-address').textContent).toBe('k•••@gmail.com');
  press(COPY.send);
  await flush();
  expect(fake.sendEmailCode).toHaveBeenCalledWith('kanya@gmail.com');
  expect(screen.queryByRole('button', { name: COPY.change })).toBeNull();
  type('654321');
  await flush();
  expect(fake.freshSignIn).toHaveBeenCalledTimes(1);
  expect(fake.freshSignIn).toHaveBeenCalledWith({ method: 'email', email: 'kanya@gmail.com', code: '654321' });
  expect(fake.signIn).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith('fresh');
});

// The 1C-T8 fix round (review m1, RV4): one code per press, however fast it lands.
test('a double tap on Send the code sends one code', async () => {
  const fake = provider();
  fake.sendEmailCode.mockImplementation(() => new Promise<CodeOutcome>(() => undefined));
  mountInApp(<EmailCodeScreen provider={fake} mode="sign_in" onDone={vi.fn()} onBack={vi.fn()} />);
  await settle();
  fireEvent.change(screen.getByRole('textbox', { name: COPY.address }), { target: { value: 'kanya@gmail.com' } });
  const send = button(COPY.send);
  act(() => {
    fireEvent.click(send);
    fireEvent.click(send);
  });
  await flush();
  expect(fake.sendEmailCode).toHaveBeenCalledTimes(1);
});
