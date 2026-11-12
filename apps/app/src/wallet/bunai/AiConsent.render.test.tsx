// Bun's AI consent in the Bun Wallet look (P3-T14, ai-consent; D15, B8): the
// consent tray, the one way AI help turns on and off (useAiConsentChange), and
// today's CompanionSettings and AiConsentSheet, which now go that way too.
// Each case mounts through mountWallet, in Thai and by day unless it says
// otherwise, with the companion's fake AI resources.
//
// The plan's six cases come first, then four this task's rulings add: nothing
// leaves the tray while it waits, อ่านรายละเอียด opens Privacy and data only
// once the tray has gone (R69), a turn-on while the service rests says AI is
// not on by the provider's own rule, and the size case every P3 suite has.
//
// Reanimated keeps a tray's card unseen (visibility: hidden) until its
// entering animation starts, which happy-dom never fires, and queries by role
// skip what is unseen: startAnimations() fires it, as Tray.render.test.tsx
// does. react-native-web drops numberOfLines from the DOM, so the props that
// reach the app's Text are recorded, as WalletsList.render.test.tsx does.
// Every lookup asserts, so a missing part fails as an AssertionError.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
const haptics = vi.hoisted(() => ({ playHaptic: vi.fn() }));
vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: haptics.playHaptic }));
const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@mobile/theme/AppText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/theme/AppText')>();
  const { createElement, forwardRef } = await import('react');
  const Text = forwardRef<unknown, Record<string, unknown>>(function RecordedText(props, ref) {
    seen.props.push(props);
    return createElement(actual.Text as never, { ...props, ref });
  });
  return { ...actual, Text };
});

import { AI_NOTICE_VERSION } from '@gogospend/contracts';
import type { AiPreferencesDto } from '@gogospend/contracts';
import { useState } from 'react';

import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { CompanionSettings } from '@mobile/screens/redesign/account/CompanionSettings';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { COMMON_COPY } from '../common/copy';
import { draftText } from '../copy/draftText';
import { AX5, mountWallet } from '../testing/walletHarness';
import { AiConsentTray } from './AiConsentTray';
import { BUNAI_DRAFTS } from './drafts';
import { bunAiText } from './useBunAiCopy';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  seen.props.length = 0;
  haptics.playHaptic.mockReset();
});

type Locale = 'th' | 'en';
const say = (key: string, locale: Locale = 'th') => bunAiText(BUNAI_DRAFTS, key, locale);
const common = (key: string, locale: Locale = 'th') => draftText(COMMON_COPY, key, locale);

/**
 * The plan's Thai for what is sent and what is kept (B8, default pending owner
 * Q11), written out here, not read from the table, so a table that drops a
 * name fails this suite.
 */
const WHAT_THAI = 'เฉพาะสิ่งที่งานนั้นต้องใช้: ประโยคที่คุณพิมพ์ รูปสลิปหรือใบเสร็จ รวมชื่อและเลขบัญชีบางส่วนที่พิมพ์อยู่ในรูป ชื่อกระเป๋าและหมวดให้บันเลือก ยอดของวันและของเดือน งบที่เหลือ กับชื่อหมวดสำหรับโน้ตประจำวัน และเมื่อคุณถาม ยอดรวม ชื่อร้าน และโน้ตที่จดไว้ ไม่ส่งอีเมล เบอร์โทร หรือรหัสบัญชี Jotbun ของคุณ';
const KEEP_THAI = 'Jotbun ไม่เก็บสิ่งที่ส่งไปอ่าน ยกเว้นรูปใบเสร็จที่คุณแนบไว้กับรายการ ไม่เก็บรูปสลิป และไม่ถูกนำไปฝึก AI';

/** Lets the preferences' read and the change land. */
async function settle() {
  for (let tick = 0; tick < 6; tick += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Starts the entering animations, as a browser does a frame after they mount (see the note at the top). */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}

/** The first element with this role and name, which must be there. */
function named(role: string, name: string): HTMLElement {
  const all = screen.queryAllByRole(role, { name });
  expect(all.length, `a ${role} named ${name}`).toBeGreaterThan(0);
  return all[0];
}

/** The first element with this test id, which must be there. */
function found(testID: string): HTMLElement {
  const all = screen.queryAllByTestId(testID);
  expect(all.length, testID).toBeGreaterThan(0);
  return all[0];
}

async function press(element: HTMLElement) {
  fireEvent.click(element);
  await settle();
}

const consentEvents = (sent: readonly Recorded[]) => sent.filter((each) => each.name === 'ai_consent_changed');

/** A host that opens the tray at once, and counts each close it asks for and each time the tray has gone. */
function Host({ readOnly = false, onClose, onClosed, onAgreed }: { readOnly?: boolean; onClose?: () => void; onClosed?: () => void; onAgreed?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <AiConsentTray
      visible={open}
      readOnly={readOnly}
      onAgreed={onAgreed}
      onClosed={onClosed}
      onClose={() => {
        onClose?.();
        setOpen(false);
      }}
    />
  );
}

async function mountTray(options: { readOnly?: boolean; preferences?: Partial<AiPreferencesDto>; ai?: ReturnType<typeof fakeAiResources>; locale?: Locale; mode?: 'light' | 'dark'; fontScale?: number } = {}) {
  const ai = options.ai ?? fakeAiResources({}, options.preferences ?? {});
  const closes = vi.fn();
  const gone = vi.fn();
  const agreed = vi.fn();
  mountWallet(<Host readOnly={options.readOnly} onClose={closes} onClosed={gone} onAgreed={agreed} />, { ai: ai.resources, locale: options.locale, mode: options.mode, fontScale: options.fontScale });
  await settle();
  startAnimations();
  return { ai, closes, gone, agreed };
}

// ---------------------------------------------------------------------------
// The plan's cases

test('the consent names what is sent, to whom and what is kept', async () => {
  const forms = [['th', 'light'], ['th', 'dark'], ['en', 'light'], ['en', 'dark']] as const;
  for (const [locale, mode] of forms) {
    const at = `${locale} ${mode}`;
    await mountTray({ locale, mode });
    named('dialog', say('bunai.consentTitle', locale));
    expect(found('ai-consent-tray').style.backgroundColor, at).toBe(rgba((mode === 'dark' ? walletDark : walletLight).sheet));
    named('heading', say('bunai.consentQuestion', locale));
    expect(screen.queryAllByText(say('bunai.consentLine', locale)).length, at).toBe(1);
    expect(found('ai-consent-what').textContent, at).toBe(say('bunai.consentWhat', locale) + say('bunai.consentWhatLine', locale));
    expect(found('ai-consent-who').textContent, at).toBe(say('bunai.consentWho', locale) + say('bunai.consentWhoLine', locale));
    expect(found('ai-consent-keep').textContent, at).toBe(say('bunai.consentKeep', locale) + say('bunai.consentKeepLine', locale));
    expect(found('ai-consent-wrong').textContent, at).toBe(`${say('bunai.consentWrong', locale)} ${say('bunai.consentWrongLine', locale)}`);
    expect(screen.queryAllByText(say('bunai.consentFoot', locale)).length, at).toBe(1);
    named('button', say('bunai.consentDetails', locale));
    named('button', say('bunai.consentOn', locale));
    named('button', say('bunai.consentNotNow', locale));
    if (locale === 'th') {
      // B8: what prompts carry, by name, in the plan's own words.
      const what = found('ai-consent-what').textContent ?? '';
      expect(what).toBe(`ส่งอะไรบ้าง${WHAT_THAI}`);
      for (const words of ['ชื่อกระเป๋า', 'ชื่อร้าน', 'โน้ตที่จดไว้', 'โน้ตประจำวัน', 'งบที่เหลือ', 'เลขบัญชีบางส่วน']) expect(what, words).toContain(words);
      expect(found('ai-consent-who').textContent).toBe('ส่งให้ใครผ่านเซิร์ฟเวอร์ของ Jotbun ไปให้ผู้ให้บริการ AI อ่าน (Claude ของ Anthropic)');
      // The kept receipt: the one thing Jotbun keeps.
      expect(found('ai-consent-keep').textContent).toBe(`เก็บนานแค่ไหน${KEEP_THAI}`);
      expect(KEEP_THAI).toContain('รูปใบเสร็จที่คุณแนบไว้กับรายการ');
    }
    cleanup();
  }
});

test('เปิดใช้ turns AI on with the current notice and sends one ai_consent_changed carrying ai_enabled true', async () => {
  const recorded = await recordAnalytics();
  try {
    const { ai, closes, agreed } = await mountTray();
    expect(consentEvents(recorded.sent)).toEqual([]);
    await press(named('button', 'เปิดใช้'));
    expect(ai.resources.setPreferences).toHaveBeenCalledTimes(1);
    expect(ai.resources.setPreferences).toHaveBeenCalledWith({ companion: true, notice_version: AI_NOTICE_VERSION });
    expect(ai.preferences().companion).toBe(true);
    expect(consentEvents(recorded.sent)).toEqual([{ kind: 'capture', name: 'ai_consent_changed', properties: { ai_enabled: true, origin: 'app' } }]);
    expect(agreed).toHaveBeenCalledTimes(1);
    expect(closes).toHaveBeenCalledTimes(1);
    expect(haptics.playHaptic.mock.calls).toEqual([['saveLanded']]);
  } finally {
    recorded.restore();
  }
});

test('ไม่ใช่ตอนนี้ changes nothing and sends nothing', async () => {
  const recorded = await recordAnalytics();
  try {
    const { ai, closes, agreed } = await mountTray();
    await press(named('button', 'ไม่ใช่ตอนนี้'));
    expect(closes).toHaveBeenCalledTimes(1);
    expect(ai.resources.setPreferences).not.toHaveBeenCalled();
    expect(ai.preferences().companion).toBe(false);
    expect(consentEvents(recorded.sent)).toEqual([]);
    expect(agreed).not.toHaveBeenCalled();
  } finally {
    recorded.restore();
  }
});

test('a turn-on that fails says so and stays off', async () => {
  const recorded = await recordAnalytics();
  try {
    const ai = fakeAiResources({ setPreferences: vi.fn(async () => { throw new Error('offline'); }) });
    const { closes, agreed } = await mountTray({ ai });
    await press(named('button', 'เปิดใช้'));
    expect(ai.resources.setPreferences).toHaveBeenCalledTimes(1);
    const alert = found('ai-consent-problem');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe('เปิดตัวช่วย AI ไม่ได้ตอนนี้ ลองอีกครั้งเมื่อต่อเน็ต');
    expect(ai.preferences().companion).toBe(false);
    expect(consentEvents(recorded.sent)).toEqual([]);
    expect(agreed).not.toHaveBeenCalled();
    expect(closes).not.toHaveBeenCalled();
    expect(haptics.playHaptic.mock.calls).toEqual([['saveFailed']]);
    // Still open, and no longer waiting, so เปิดใช้ is Try again.
    expect(named('button', 'เปิดใช้').getAttribute('aria-busy')).toBe('false');
    await press(named('button', 'เปิดใช้'));
    expect(ai.resources.setPreferences).toHaveBeenCalledTimes(2);
  } finally {
    recorded.restore();
  }
});

test('read-only shows the same lines without buttons', async () => {
  for (const locale of ['th', 'en'] as const) {
    await mountTray({ readOnly: true, locale });
    const dialog = named('dialog', say('bunai.whatAiSees', locale));
    expect(found('ai-consent-what').textContent).toBe(say('bunai.consentWhat', locale) + say('bunai.consentWhatLine', locale));
    expect(found('ai-consent-who').textContent).toBe(say('bunai.consentWho', locale) + say('bunai.consentWhoLine', locale));
    expect(found('ai-consent-keep').textContent).toBe(say('bunai.consentKeep', locale) + say('bunai.consentKeepLine', locale));
    named('heading', say('bunai.consentQuestion', locale));
    // No answer to give: only the tray's close and the link to Privacy and data.
    const buttons = within(dialog).queryAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(buttons, locale).toEqual([common('common.close', locale), say('bunai.consentDetails', locale)]);
    cleanup();
  }
});

test('the old settings and sheet send the event too', async () => {
  const recorded = await recordAnalytics();
  try {
    const ai = fakeAiResources();
    mountWallet(<CompanionSettings />, { ai: ai.resources, locale: 'en' });
    await settle();
    const group = () => {
      const all = screen.queryAllByRole('radiogroup', { name: "Bun's AI help" });
      expect(all.length, "Bun's AI help").toBe(1);
      return all[0];
    };
    fireEvent.click(within(group()).getByRole('radio', { name: 'On' }));
    await settle();
    await press(named('button', "Turn on Bun's help"));
    expect(ai.resources.setPreferences).toHaveBeenLastCalledWith({ companion: true, notice_version: AI_NOTICE_VERSION });
    expect(consentEvents(recorded.sent).map((event) => event.properties)).toEqual([{ ai_enabled: true, origin: 'app' }]);
    await waitFor(() => expect(within(group()).getByRole('radio', { name: 'On' }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(within(group()).getByRole('radio', { name: 'Off' }));
    await settle();
    expect(ai.resources.setPreferences).toHaveBeenLastCalledWith({ companion: false });
    expect(consentEvents(recorded.sent).map((event) => event.properties)).toEqual([{ ai_enabled: true, origin: 'app' }, { ai_enabled: false, origin: 'app' }]);
  } finally {
    recorded.restore();
  }
});

// ---------------------------------------------------------------------------
// The rulings' cases

test('while turning on waits for the server, nothing leaves the tray', async () => {
  let release: (() => void) | null = null;
  const ai = fakeAiResources();
  const answer = ai.resources.setPreferences;
  ai.resources.setPreferences = vi.fn((update) => new Promise<AiPreferencesDto>((resolve) => { release = () => resolve(answer(update)); }));
  const { closes } = await mountTray({ ai });
  await press(named('button', 'เปิดใช้'));
  expect(named('button', 'เปิดใช้').getAttribute('aria-busy')).toBe('true');
  await press(named('button', 'ไม่ใช่ตอนนี้'));
  await press(named('button', 'อ่านรายละเอียด'));
  await press(named('button', common('common.close')));
  expect(closes).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(release).not.toBeNull();
  await act(async () => { release?.(); });
  await settle();
  expect(closes).toHaveBeenCalledTimes(1);
  expect(ai.preferences().companion).toBe(true);
});

test('อ่านรายละเอียด closes the tray, then opens Privacy and data once it has gone', async () => {
  const { closes, gone, ai } = await mountTray();
  await press(named('button', 'อ่านรายละเอียด'));
  expect(closes).toHaveBeenCalledTimes(1);
  // Not yet: the tray is still leaving (R69).
  expect(router.push).not.toHaveBeenCalled();
  expect(gone).not.toHaveBeenCalled();
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/settings/privacy'));
  expect(router.push).toHaveBeenCalledTimes(1);
  // The host hears that the tray has gone, once.
  expect(gone).toHaveBeenCalledTimes(1);
  expect(ai.resources.setPreferences).not.toHaveBeenCalled();
});

test("while Bun's AI help rests, agreeing keeps the answer, and ai_enabled says it is not on", async () => {
  const recorded = await recordAnalytics();
  try {
    const { ai } = await mountTray({ preferences: { available: false } });
    await press(named('button', 'เปิดใช้'));
    expect(ai.resources.setPreferences).toHaveBeenCalledWith({ companion: true, notice_version: AI_NOTICE_VERSION });
    expect(consentEvents(recorded.sent).map((event) => event.properties)).toEqual([{ ai_enabled: false, origin: 'app' }]);
  } finally {
    recorded.restore();
  }
});

test('controls are 44 pt, and AX5 truncates nothing', async () => {
  const atLeast = (element: HTMLElement, what: string) => {
    const height = Number.parseFloat(element.style.minHeight || element.style.height);
    expect(height, `${what} height`).toBeGreaterThanOrEqual(44);
    if (element.style.width || element.style.minWidth) expect(Number.parseFloat(element.style.minWidth || element.style.width), `${what} width`).toBeGreaterThanOrEqual(44);
  };
  for (const fontScale of [1, AX5]) {
    await mountTray({ fontScale });
    const dialog = named('dialog', 'ตัวช่วย AI ของบัน');
    const buttons = within(dialog).queryAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label')), `${fontScale}`).toEqual(['ปิด', 'อ่านรายละเอียด', 'เปิดใช้', 'ไม่ใช่ตอนนี้']);
    for (const button of buttons) atLeast(button, `${fontScale} ${button.getAttribute('aria-label')}`);
    expect(seen.props.filter((props) => props.numberOfLines !== undefined), `${fontScale}`).toEqual([]);
    cleanup();
    seen.props.length = 0;
  }
});
