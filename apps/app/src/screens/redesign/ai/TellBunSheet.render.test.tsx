import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Keyboard } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));

import type { AiDraft } from '@gogospend/contracts';

import { V1Error } from '@mobile/api/client';
import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import type { OftenLogged } from '@mobile/spend/v1/ai/oftenLogged';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';

import { mountScreen } from '../HistoryTestHarness';
import { TellBunSheet } from './TellBunSheet';

afterEach(cleanup);

const golden = goldenSeed();
const cash = golden.wallets[0];
const food = BUILTINS.find((c) => c.builtin_key === 'food')!;
const context = { today: '2026-10-24', wallets: [cash], categories: BUILTINS };

function mount(ai: ReturnType<typeof fakeAiResources>, onUse = vi.fn(), pickSlip = vi.fn(), often: readonly OftenLogged[] = []) {
  mountScreen(
    <AiCompanionProvider resources={ai.resources}>
      <TellBunSheet visible onClose={() => undefined} context={context} locale="en" onUse={onUse} pickSlip={pickSlip} often={often} />
    </AiCompanionProvider>,
    { resources: createFakeResources().resources },
  );
  return { onUse, pickSlip };
}

const type = (text: string) => fireEvent.change(screen.getByLabelText('What did you spend or receive?'), { target: { value: text } });

test('with AI help off, the phone reads a Thai sentence and Use this hands the draft over', async () => {
  const ai = fakeAiResources();
  const { onUse } = mount(ai);
  type('ข้าวมันไก่ 50 เมื่อวาน');
  fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
  const card = await screen.findByTestId('tell-bun-draft');
  expect(card.textContent).toContain('฿50.00');
  expect(card.textContent).toContain('ข้าวมันไก่');
  expect(card.textContent).toContain('Food');
  expect(ai.resources.parse).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
  expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ amount_minor: '5000', occurred_on: '2026-10-23', category_id: food.id }));
});

test('with AI help on, Claude reads it, and what Bun could not tell is said under the draft', async () => {
  const draft: AiDraft = { type: 'expense', amount_minor: '12000', occurred_on: '2026-10-24', category_id: null, wallet_id: cash.id, merchant: 'Grab', note: null, confidence: 'medium', flags: ['category_guessed'] };
  const ai = fakeAiResources({ parse: vi.fn(async () => ({ drafts: [draft], source: 'ai' as const })) }, { companion: true, notice_version: 1 });
  mount(ai);
  await waitFor(() => expect(ai.resources.preferences).toHaveBeenCalled());
  type('grab 120');
  await waitFor(() => expect(screen.queryByText("Reading slips needs Bun's AI help. Typing works on your phone.")).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
  expect(await screen.findByText("Bun wasn't sure of the category. Pick one.")).toBeTruthy();
  expect(ai.resources.parse).toHaveBeenCalledWith({ text: 'grab 120', today: '2026-10-24', locale: 'en' });
});

test('when Claude is out of uses, the phone answers and says why', async () => {
  const ai = fakeAiResources({ parse: vi.fn(async () => { throw new V1Error('rate_limited', 429, 'AI_LIMIT_REACHED'); }) }, { companion: true, notice_version: 1 });
  mount(ai);
  await waitFor(() => expect(ai.resources.preferences).toHaveBeenCalled());
  type('กาแฟ 65');
  await waitFor(() => expect(screen.queryByText("Reading slips needs Bun's AI help. Typing works on your phone.")).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
  expect(await screen.findByText("Bun's AI help is resting until tomorrow, so the phone read this.")).toBeTruthy();
  expect(screen.getByTestId('tell-bun-draft').textContent).toContain('฿65.00');
});

test('scanning a slip without AI help asks to turn it on first and picks nothing', async () => {
  const ai = fakeAiResources();
  const { pickSlip } = mount(ai);
  fireEvent.click(screen.getByRole('button', { name: 'Scan a slip' }));
  expect(await screen.findByText("Turn on Bun's help?")).toBeTruthy();
  expect(pickSlip).not.toHaveBeenCalled();
});

test('a scanned slip becomes a draft, with the bank named', async () => {
  const draft: AiDraft = { type: 'expense', amount_minor: '125000', occurred_on: '2026-10-24', category_id: food.id, wallet_id: cash.id, merchant: 'ร้านป้าแดง', note: null, confidence: 'high', flags: [] };
  const ai = fakeAiResources({ slip: vi.fn(async () => ({ drafts: [draft], bank: 'K PLUS', source: 'ai' as const })) }, { companion: true, notice_version: 1 });
  const pickSlip = vi.fn(async () => ({ kind: 'picked' as const, base64: 'aGVsbG8=', mediaType: 'image/jpeg' as const }));
  mount(ai, vi.fn(), pickSlip);
  await waitFor(() => expect(ai.resources.preferences).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText("Reading slips needs Bun's AI help. Typing works on your phone.")).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Scan a slip' }));
  expect(await screen.findByText('From a K PLUS slip.')).toBeTruthy();
  expect(screen.getByTestId('tell-bun-draft').textContent).toContain('฿1,250.00');
  expect(ai.resources.slip).toHaveBeenCalledWith({ image_base64: 'aGVsbG8=', media_type: 'image/jpeg', today: '2026-10-24', locale: 'en' });
  // The slip stays beside what Bun read from it, to compare before Use this.
  const slip = screen.getByTestId('tell-bun-slip');
  expect(slip.getAttribute('aria-label')).toBe('The slip you chose');
});

test('an often-logged entry is one tap from a draft, with no AI use', async () => {
  const draft: AiDraft = { type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', category_id: food.id, wallet_id: cash.id, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] };
  const ai = fakeAiResources({}, { companion: true, notice_version: 1 });
  const { onUse } = mount(ai, vi.fn(), vi.fn(), [{ key: 'k', label: 'ข้าวมันไก่ 50', draft }]);
  expect(await screen.findByText('Often logged:')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'ข้าวมันไก่ 50' }));
  expect(await screen.findByText('From your own entries.')).toBeTruthy();
  expect(screen.getByTestId('tell-bun-draft').textContent).toContain('฿50.00');
  // The chips step aside while a draft is shown.
  expect(screen.queryByTestId('tell-bun-often')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
  expect(onUse).toHaveBeenCalledWith(draft);
  expect(ai.resources.parse).not.toHaveBeenCalled();
});

test('without repeated entries there are no chips', async () => {
  mount(fakeAiResources());
  await screen.findByLabelText('What did you spend or receive?');
  expect(screen.queryByText('Often logged:')).toBeNull();
});

// The field takes focus as the sheet opens, and the draft shows under it: on a
// phone the keyboard would cover the draft (found on the iOS simulator), so a
// draft closes the keyboard. A sentence Bun cannot read keeps it up to retype.
test('a draft from a sentence closes the keyboard', async () => {
  const dismiss = vi.spyOn(Keyboard, 'dismiss');
  try {
    mount(fakeAiResources());
    type('ข้าวมันไก่ 50');
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    await screen.findByTestId('tell-bun-draft');
    expect(dismiss).toHaveBeenCalled();
  } finally {
    dismiss.mockRestore();
  }
});

test('reading a new sentence while a draft shows closes the keyboard again', async () => {
  const dismiss = vi.spyOn(Keyboard, 'dismiss');
  try {
    mount(fakeAiResources());
    type('ข้าวมันไก่ 50');
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    await screen.findByTestId('tell-bun-draft');
    expect(dismiss).toHaveBeenCalledTimes(1);
    // The person taps the field again (the keyboard comes back) and reads a new sentence.
    type('grab 120');
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    await waitFor(() => expect(screen.getByTestId('tell-bun-draft').textContent).toContain('฿120.00'));
    expect(dismiss).toHaveBeenCalledTimes(2);
  } finally {
    dismiss.mockRestore();
  }
});

test('a draft from an often-logged chip closes the keyboard', async () => {
  const draft: AiDraft = { type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', category_id: food.id, wallet_id: cash.id, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] };
  const dismiss = vi.spyOn(Keyboard, 'dismiss');
  try {
    mount(fakeAiResources(), vi.fn(), vi.fn(), [{ key: 'k', label: 'ข้าวมันไก่ 50', draft }]);
    fireEvent.click(await screen.findByRole('button', { name: 'ข้าวมันไก่ 50' }));
    await screen.findByTestId('tell-bun-draft');
    expect(dismiss).toHaveBeenCalled();
  } finally {
    dismiss.mockRestore();
  }
});

test('a sentence Bun cannot read keeps the keyboard up for another try', async () => {
  const dismiss = vi.spyOn(Keyboard, 'dismiss');
  try {
    mount(fakeAiResources());
    // A currency sign alone has neither an amount nor a place, so there is no draft.
    type('฿');
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    expect(await screen.findByText(/couldn.t find an entry/i)).toBeTruthy();
    expect(dismiss).not.toHaveBeenCalled();
  } finally {
    dismiss.mockRestore();
  }
});
