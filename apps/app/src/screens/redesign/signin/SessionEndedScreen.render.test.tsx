// 1C-T8: D37's session-ended draft (es-session-ended): the unsent records and
// the account's own method; the same account resumes; another account with
// records waiting asks keep or erase, where erasing needs its confirmation and
// keeping erases nothing (and with none waiting, nothing is asked).
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import type { SignInMethod, SignInRequest } from '@mobile/auth/betterAuthPort';
import type { CodeOutcome, FreshOutcome, SignInResult } from '@mobile/auth/credentialProvider';
import type { SessionEndedView } from '@mobile/auth/sessionEnded';
import type { StoredSession } from '@mobile/auth/sessionStore';
import { mountInApp, settle } from '@mobile/dev/catalogue/catalogueTestHarness';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { SessionEndedScreen } from './SessionEndedScreen';
import type { SessionEndedProvider, UnsentRow } from './SessionEndedScreen';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const ENDED: StoredSession = { accountId: '0a000000-0000-4000-8000-00000000000a', sessionId: '0b000000-0000-4000-8000-00000000000b', email: 'karn@icloud.com', method: 'apple' };
const OTHER: StoredSession = { accountId: '0c000000-0000-4000-8000-00000000000c', sessionId: '0d000000-0000-4000-8000-00000000000d', email: 'ploy@gmail.com', method: 'apple' };
const ACTIVE: SignInResult = { outcome: 'active', methods: [], created: false };
const ROWS: readonly UnsentRow[] = [
  { title: 'ข้าวมันไก่', at: 'Today 12:10', amount: '฿50.00' },
  { title: 'ชาเย็น', at: 'Today 12:12', amount: '฿25.00' },
  { title: 'วิน', at: 'Today 12:30', amount: '฿20.00' },
];
const view = (unsent = 3): SessionEndedView => ({ kind: 'signed_out_elsewhere', accountId: ENDED.accountId, method: 'apple', unsent });

/** `account` (the ended one) until a sign-in that goes through, then `signInAs`; every sign-in answers `answer`. */
function provider({ account = ENDED, signInAs = ENDED, methods = ['apple', 'google', 'email'], answer = ACTIVE }: { account?: StoredSession; signInAs?: StoredSession; methods?: readonly SignInMethod[]; answer?: SignInResult } = {}) {
  let current: StoredSession = account;
  return {
    account: vi.fn((): StoredSession | null => current),
    methods: vi.fn((): readonly SignInMethod[] => methods),
    signIn: vi.fn(async (_request: SignInRequest): Promise<SignInResult> => {
      if (answer.outcome === 'active') current = signInAs;
      return answer;
    }),
    sendEmailCode: vi.fn(async (_email: string): Promise<CodeOutcome> => 'sent'),
    freshSignIn: vi.fn(async (_request: SignInRequest): Promise<FreshOutcome> => 'fresh'),
  } satisfies SessionEndedProvider;
}

async function open(options: { fake?: ReturnType<typeof provider>; unsent?: number; rows?: readonly UnsentRow[]; view?: SessionEndedView } = {}) {
  const fake = options.fake ?? provider();
  const eraseAccount = vi.fn(async (_accountId: string) => undefined);
  const onResumed = vi.fn();
  const mounted = mountInApp(<SessionEndedScreen view={options.view ?? view(options.unsent ?? 3)} unsentRows={options.rows ?? ROWS} provider={fake} eraseAccount={eraseAccount} onResumed={onResumed} />);
  await settle();
  return { fake, eraseAccount, onResumed, mounted };
}

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

/** Signs in with the account's own method; with `OTHER`, the keep-or-erase choice opens. */
async function signInAgain() {
  press('Continue with Apple');
  await flush();
}

test("it lists the unsent records and names the account's method", async () => {
  const { fake, eraseAccount, onResumed, mounted } = await open();
  expect(screen.getByRole('heading', { name: 'Sign in again' })).toBeTruthy();
  expect(screen.getByText('Records still on this phone: 3')).toBeTruthy();
  expect(screen.getByText('Not sent yet. They send by themselves after you sign in.')).toBeTruthy();
  const list = screen.getByRole('list', { name: 'Records waiting to send' });
  expect(within(list).getAllByRole('listitem').map((row) => row.textContent)).toEqual(['ข้าวมันไก่Today 12:10฿50.00', 'ชาเย็นToday 12:12฿25.00', 'วินToday 12:30฿20.00']);
  expect(screen.getByText('Use the same Apple account, so the records go to the same place.')).toBeTruthy();
  // The main button names the account's method; the others wait behind ใช้วิธีอื่น.
  expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  press('Use another way');
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue with email' })).toBeTruthy();
  // The main button is Apple's, so the email code here already goes to any address: no second email way (R98).
  expect(screen.queryByRole('button', { name: 'Email a code to another address' })).toBeNull();
  // The same account resumes at once: nothing is asked, nothing erased.
  await signInAgain();
  expect(fake.signIn).toHaveBeenCalledWith({ method: 'apple', signUp: false });
  expect(onResumed).toHaveBeenCalledTimes(1);
  expect(eraseAccount).not.toHaveBeenCalled();
  mounted.unmount();
  // A build that cannot run Apple's sign-in offers the email code to the account's address (C14).
  await open({ fake: provider({ methods: ['email'] }) });
  expect(screen.getByRole('button', { name: 'Continue with email' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
  expect(screen.getByText('Use the same email, so the records go to the same place.')).toBeTruthy();
});

test('another account with unsent records asks keep or erase', async () => {
  const { eraseAccount, onResumed, mounted } = await open({ fake: provider({ signInAs: OTHER }) });
  await signInAgain();
  expect(screen.getByRole('heading', { name: 'Records from your other account' })).toBeTruthy();
  expect(screen.getByText('3 records from the account you used before are still on this phone, not sent. They are never sent to this account.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Keep them on this phone' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Erase them' })).toBeTruthy();
  expect(onResumed).not.toHaveBeenCalled();
  expect(eraseAccount).not.toHaveBeenCalled();
  mounted.unmount();
  // With nothing waiting, another account asks nothing.
  const quiet = await open({ fake: provider({ signInAs: OTHER }), unsent: 0, rows: [] });
  await signInAgain();
  expect(screen.queryByRole('heading', { name: 'Records from your other account' })).toBeNull();
  expect(quiet.onResumed).toHaveBeenCalledTimes(1);
  expect(quiet.eraseAccount).not.toHaveBeenCalled();
});

test("erase needs the confirmation, then discards that account's diary once", async () => {
  const { eraseAccount, onResumed } = await open({ fake: provider({ signInAs: OTHER }) });
  await signInAgain();
  press('Erase them');
  await flush();
  expect(eraseAccount).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'Erase 3 unsent records?' });
  expect(within(dialog).getByText('They were never sent, so they are gone for good. Records already sent stay in that account.')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Erase records' }));
  await flush();
  expect(eraseAccount).toHaveBeenCalledTimes(1);
  expect(eraseAccount).toHaveBeenCalledWith(ENDED.accountId);
  expect(onResumed).toHaveBeenCalledTimes(1);
});

test('keep discards nothing', async () => {
  const { eraseAccount, onResumed } = await open({ fake: provider({ signInAs: OTHER }) });
  await signInAgain();
  press('Keep them on this phone');
  await flush();
  expect(eraseAccount).not.toHaveBeenCalled();
  expect(onResumed).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// The 1C-T8 fix round (R98, review M1 and m1's RV5): when the main button is
// the email code to the account's own address, ใช้วิธีอื่น also offers an email
// code to another address, so another account is within reach even on a build
// that offers only the email code (today's), and a refused sign-in still has
// another way (spec §5.2).

const EMAIL_ENDED: StoredSession = { ...ENDED, email: 'kanya@gmail.com', method: 'email' };
const EMAIL_VIEW: SessionEndedView = { kind: 'signed_out_elsewhere', accountId: EMAIL_ENDED.accountId, method: 'email', unsent: 3 };
const UNAVAILABLE: SignInResult = { outcome: 'account_unavailable', methods: [], created: false };
const typeInto = (name: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });

test("the email button sends the code to the account's own address", async () => {
  const fake = provider({ account: EMAIL_ENDED });
  await open({ fake, view: EMAIL_VIEW });
  press('Continue with email');
  // No address field: the code goes to the account's own address, masked.
  expect(screen.queryByRole('textbox', { name: 'Email address' })).toBeNull();
  expect(screen.getByTestId('email-code-address').textContent).toBe('k•••@gmail.com');
  press('Send the code');
  await flush();
  expect(fake.sendEmailCode).toHaveBeenCalledTimes(1);
  expect(fake.sendEmailCode).toHaveBeenCalledWith('kanya@gmail.com');
});

test('an email account on a build with only the email code can sign in to another account, which asks keep or erase', async () => {
  const fake = provider({ account: EMAIL_ENDED, signInAs: OTHER, methods: ['email'] });
  const { eraseAccount, onResumed } = await open({ fake, view: EMAIL_VIEW });
  expect(screen.getByRole('button', { name: 'Continue with email' })).toBeTruthy();
  press('Use another way');
  press('Email a code to another address');
  // An empty address field: the code can go to any address.
  typeInto('Email address', 'Ploy@Gmail.com');
  press('Send the code');
  await flush();
  expect(fake.sendEmailCode).toHaveBeenCalledWith('ploy@gmail.com');
  typeInto('6-digit code', '135790');
  await flush();
  expect(fake.signIn).toHaveBeenCalledWith({ method: 'email', email: 'ploy@gmail.com', code: '135790' });
  // Another account with records waiting: D37's keep-or-erase choice.
  expect(screen.getByRole('heading', { name: 'Records from your other account' })).toBeTruthy();
  expect(onResumed).not.toHaveBeenCalled();
  expect(eraseAccount).not.toHaveBeenCalled();
});

test("an Apple account on a build with only the email code: its own address first, and when the account is unavailable another way still shows", async () => {
  const fake = provider({ methods: ['email'], answer: UNAVAILABLE });
  await open({ fake, view: { ...view(), kind: 'account_unavailable' } });
  expect(screen.getByRole('heading', { name: 'This account is not available' })).toBeTruthy();
  press('Continue with email');
  press('Send the code');
  await flush();
  expect(fake.sendEmailCode).toHaveBeenCalledWith('karn@icloud.com');
  typeInto('6-digit code', '246810');
  await flush();
  // The server refuses the account: the screen says so, with the records-safe line, and offers another way.
  expect(screen.getByText("This account can't be used right now.")).toBeTruthy();
  expect(screen.getByText('Your records are still on this phone.')).toBeTruthy();
  press('Use another way');
  press('Email a code to another address');
  expect(screen.getByRole('textbox', { name: 'Email address' })).toBeTruthy();
  expect(fake.signIn).toHaveBeenCalledTimes(1);
});

// 1C-T7 (the 1C-T8 confirming review's m1): R98 holds on every build, not only on
// one that offers just the email code. Once Apple and Google go live, an email
// account still gets an email code to another address, so another account is
// always within reach.
test('an email account on a build with Apple and Google still gets an email code to another address', async () => {
  const fake = provider({ account: EMAIL_ENDED, methods: ['apple', 'google', 'email'] });
  await open({ fake, view: EMAIL_VIEW });
  expect(screen.queryAllByRole('button', { name: 'Continue with email' })).toHaveLength(1);
  press('Use another way');
  expect(screen.queryAllByRole('button', { name: 'Email a code to another address' })).toHaveLength(1);
  press('Email a code to another address');
  // An empty address field: the code can go to any address.
  expect((screen.getByRole('textbox', { name: 'Email address' }) as HTMLInputElement).value).toBe('');
});
