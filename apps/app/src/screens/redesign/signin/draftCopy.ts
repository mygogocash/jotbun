// DRAFT COPY - AWAITING E2 APPROVAL (1C-T8: the sign-in, terms, session-ended,
// devices and reminder drafts in this folder).
//
// English → Thai, kept here on purpose and NOT in the locale catalogs
// (src/messages/*.json) until the owner approves the screenshots (E2). A line
// a board already shows is the board's Thai, word for word (the board is named
// above its group); every other line is marked // DRAFT, a first draft for
// the owner's or a translator's pass. Vietnamese reads the English until then.
// Words the screens keep from today (the method buttons, the reminder
// question, the terms box's reason, Continue, Settings) stay on `useCopy()`
// and the catalogs. Once approved, 1C-T9 moves these lines into the catalogs,
// switches the screens to `useCopy()` and deletes this module.
//
// No React Native and no `@mobile/` value import: `catalogs.test.ts` reads
// DRAFT_TH under Node's test runner.
import { useCallback } from 'react';
import { useIntl } from 'react-intl';

import { isSupportedLocale } from '../../../i18n/locales.ts';
import type { Locale } from '../../../i18n/locales.ts';

export type CopyValues = Readonly<Record<string, string | number>>;

export const DRAFT_TH: Readonly<Record<string, string>> = {
  // sa-signin
  'Sign in or create an account': 'เข้าสู่ระบบหรือสร้างบัญชี',
  // sa-email-code
  'Sign in with email': 'เข้าสู่ระบบด้วยอีเมล',
  'Enter the 6-digit code sent to': 'ใส่รหัส 6 หลักที่ส่งไปที่',
  'The code works for 10 minutes. No email? Look in your spam folder.': 'รหัสใช้ได้ 10 นาที ไม่เห็นอีเมล ลองดูในสแปม',
  '6-digit code': 'รหัส 6 หลัก',
  'Send a new code in': 'ส่งรหัสใหม่ใน',
  'Change email': 'เปลี่ยนอีเมล',
  // The email code: the address step, the resend and the failures
  "We'll send a 6-digit code to": 'เราจะส่งรหัส 6 หลักไปที่', // DRAFT
  'Email address': 'อีเมล', // DRAFT
  'Send the code': 'ส่งรหัส', // DRAFT
  'Sending…': 'กำลังส่ง…', // DRAFT
  'Type your email address first.': 'พิมพ์อีเมลของคุณก่อน', // DRAFT
  'Send a new code': 'ส่งรหัสใหม่', // DRAFT
  "That code isn't right. Type the 6 digits from the newest email.": 'รหัสไม่ถูกต้อง พิมพ์รหัส 6 หลักจากอีเมลล่าสุด', // DRAFT
  'Too many tries for now. Wait a few minutes, then try again.': 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองอีกครั้ง', // DRAFT
  "Couldn't reach Jotbun. Check your connection and try again.": 'ติดต่อ Jotbun ไม่ได้ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง', // DRAFT
  'Email sign-in is not available on this build.': 'เวอร์ชันนี้ยังเข้าสู่ระบบด้วยอีเมลไม่ได้', // DRAFT
  "Couldn't send the code. Try again.": 'ส่งรหัสไม่สำเร็จ ลองอีกครั้ง', // DRAFT
  // Every failure (spec §5.1's failure line, §5.2)
  'Your records are still on this phone.': 'บันทึกยังอยู่ในเครื่อง', // DRAFT
  // The account-exists screen (no board)
  'You already have an account': 'คุณมีบัญชีอยู่แล้ว', // DRAFT
  'This email already has a Jotbun account. Sign in the way you used before, so your records stay in one place.': 'อีเมลนี้มีบัญชี Jotbun อยู่แล้ว เข้าสู่ระบบด้วยวิธีที่เคยใช้ บันทึกจะได้อยู่ที่เดียวกัน', // DRAFT
  'Use the same Apple ID as before.': 'ใช้ Apple ID เดิม', // DRAFT
  'Use the same Google account as before.': 'ใช้บัญชี Google เดิม', // DRAFT
  'We send a 6-digit code to this email.': 'เราจะส่งรหัส 6 หลักไปที่อีเมลนี้', // DRAFT
  // es-session-ended
  'Sign in again': 'เข้าสู่ระบบอีกครั้ง',
  'This phone was signed out, maybe because it was not used for a while': 'เครื่องนี้ออกจากระบบแล้ว อาจเพราะไม่ได้ใช้นาน',
  'or because it was signed out from another phone': 'หรือมีการออกจากระบบจากอีกเครื่อง',
  'Records still on this phone: {count}': 'ยังอยู่ในเครื่องนี้ {count} รายการ',
  'Not sent yet. They send by themselves after you sign in.': 'ยังไม่ได้ส่ง จะส่งให้เองหลังเข้าสู่ระบบ',
  'Records waiting to send': 'รายการที่รอส่ง', // DRAFT
  'Everything you already sent is in your account.': 'บันทึกที่ส่งแล้วอยู่ในบัญชีของคุณครบ',
  'Use another way': 'ใช้วิธีอื่น',
  // The session-ended screen: the board's "ใช้บัญชี Apple เดิมของกานต์" without a name, the account-unavailable variant
  'Use the same Apple account, so the records go to the same place.': 'ใช้บัญชี Apple เดิม รายการจึงจะส่งเข้าที่เดิม', // DRAFT
  'Use the same Google account, so the records go to the same place.': 'ใช้บัญชี Google เดิม รายการจึงจะส่งเข้าที่เดิม', // DRAFT
  'Use the same email, so the records go to the same place.': 'ใช้อีเมลเดิม รายการจึงจะส่งเข้าที่เดิม', // DRAFT
  'Sign in to the same account, so the records go to the same place.': 'เข้าสู่ระบบบัญชีเดิม รายการจึงจะส่งเข้าที่เดิม', // DRAFT
  'Email a code to another address': 'ส่งรหัสไปที่อีเมลอื่น', // DRAFT
  'This account is not available': 'บัญชีนี้ใช้งานไม่ได้', // DRAFT
  "This account can't be used right now. If you asked to delete it, the deletion is under way.": 'บัญชีนี้ใช้งานไม่ได้ในตอนนี้ ถ้าคุณขอลบบัญชีไว้ ระบบกำลังลบอยู่', // DRAFT
  "This account can't be used right now.": 'บัญชีนี้ใช้งานไม่ได้ในตอนนี้', // DRAFT
  // The keep-or-erase choice (D37)
  'Records from your other account': 'บันทึกจากบัญชีก่อนหน้า', // DRAFT
  '{count} records from the account you used before are still on this phone, not sent. They are never sent to this account.': 'ยังมีบันทึก {count} รายการจากบัญชีที่ใช้ก่อนหน้าอยู่ในเครื่องนี้ ยังไม่ได้ส่ง และจะไม่ถูกส่งเข้าบัญชีนี้', // DRAFT
  'Keep them on this phone': 'เก็บไว้ในเครื่อง', // DRAFT
  'Sign in to that account again later to send them.': 'เข้าสู่ระบบบัญชีเดิมภายหลังเพื่อส่ง', // DRAFT
  'Erase them': 'ลบออกจากเครื่อง', // DRAFT
  'Erase {count} unsent records?': 'ลบบันทึกที่ยังไม่ได้ส่ง {count} รายการไหม', // DRAFT
  'They were never sent, so they are gone for good. Records already sent stay in that account.': 'บันทึกเหล่านี้ยังไม่เคยส่ง จึงจะหายไปถาวร ส่วนบันทึกที่ส่งแล้วยังอยู่ในบัญชีนั้น', // DRAFT
  'Erase records': 'ลบบันทึก', // DRAFT
  "Couldn't erase them. Try again.": 'ลบไม่สำเร็จ ลองอีกครั้ง', // DRAFT
  // sa-account
  'Sign-in methods': 'วิธีเข้าสู่ระบบ',
  'Sign in with Apple': 'เข้าสู่ระบบด้วย Apple',
  "When Jotbun needs to confirm it's you, such as for an export or deleting your account, it asks you to sign in with Apple again.": 'เวลาต้องยืนยันตัวตน เช่น ส่งออกข้อมูลหรือลบบัญชี Jotbun จะให้เข้าสู่ระบบด้วย Apple อีกครั้ง',
  // The devices screen: the methods' other rows, linking and removing, the devices list
  'Devices and sign-in': 'อุปกรณ์และการเข้าสู่ระบบ', // DRAFT
  'Sign in with Google': 'เข้าสู่ระบบด้วย Google', // DRAFT
  'Sign in with an email code': 'เข้าสู่ระบบด้วยรหัสทางอีเมล', // DRAFT
  "When Jotbun needs to confirm it's you, such as for an export or deleting your account, it asks you to sign in with Google again.": 'เวลาต้องยืนยันตัวตน เช่น ส่งออกข้อมูลหรือลบบัญชี Jotbun จะให้เข้าสู่ระบบด้วย Google อีกครั้ง', // DRAFT
  "When Jotbun needs to confirm it's you, such as for an export or deleting your account, it sends a code to your email.": 'เวลาต้องยืนยันตัวตน เช่น ส่งออกข้อมูลหรือลบบัญชี Jotbun จะส่งรหัสไปที่อีเมลของคุณ', // DRAFT
  'Link Apple': 'เชื่อม Apple', // DRAFT
  'Link Google': 'เชื่อม Google', // DRAFT
  'Remove Apple': 'นำ Apple ออก', // DRAFT
  'Remove Google': 'นำ Google ออก', // DRAFT
  'Remove Apple?': 'นำ Apple ออกไหม', // DRAFT
  'Remove Google?': 'นำ Google ออกไหม', // DRAFT
  'You can no longer sign in that way. Your records stay in your account.': 'จะเข้าสู่ระบบด้วยวิธีนี้ไม่ได้อีก บันทึกยังอยู่ในบัญชีของคุณ', // DRAFT
  "Confirm it's you first. Nothing changed.": 'ต้องยืนยันว่าเป็นคุณก่อน ยังไม่มีอะไรเปลี่ยน', // DRAFT
  "Couldn't change your sign-in methods. Try again.": 'เปลี่ยนวิธีเข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง', // DRAFT
  'Signed-in devices': 'เครื่องที่เข้าสู่ระบบอยู่', // DRAFT
  'Another device': 'อุปกรณ์อื่น', // DRAFT
  'This phone': 'เครื่องนี้', // DRAFT
  'Signed in {signedIn} · last used {lastUsed}': 'เข้าสู่ระบบ {signedIn} · ใช้ล่าสุด {lastUsed}', // DRAFT
  'To sign out this phone, use Sign out in Settings.': 'ออกจากระบบเครื่องนี้ได้ที่ ออกจากระบบ ในการตั้งค่า', // DRAFT
  'Sign out {device}': 'ออกจากระบบ {device}', // DRAFT
  'Sign out {device}?': 'ออกจากระบบ {device} ไหม', // DRAFT
  'That device must sign in again. Records it already sent stay in your account.': 'เครื่องนั้นต้องเข้าสู่ระบบใหม่ บันทึกที่ส่งแล้วยังอยู่ในบัญชีของคุณ', // DRAFT
  'Sign out the other devices': 'ออกจากระบบเครื่องอื่นทั้งหมด', // DRAFT
  'Sign out the other devices?': 'ออกจากระบบเครื่องอื่นทั้งหมดไหม', // DRAFT
  'Every other device must sign in again. This phone stays signed in.': 'เครื่องอื่นทุกเครื่องต้องเข้าสู่ระบบใหม่ เครื่องนี้ยังอยู่ในระบบ', // DRAFT
  "Couldn't sign that device out. Try again.": 'ออกจากระบบเครื่องนั้นไม่สำเร็จ ลองอีกครั้ง', // DRAFT
  "Couldn't sign the other devices out. Try again.": 'ออกจากระบบเครื่องอื่นไม่สำเร็จ ลองอีกครั้ง', // DRAFT
  "Couldn't load your devices. Try again.": 'โหลดรายการเครื่องไม่สำเร็จ ลองอีกครั้ง', // DRAFT
  'Loading…': 'กำลังโหลด…', // DRAFT
  // Confirm it's you (st-delete's "Apple จะถามยืนยันว่าเป็นคุณ", as whole lines)
  "Confirm it's you": 'ยืนยันว่าเป็นคุณ', // DRAFT
  "Apple will ask you to confirm it's you.": 'Apple จะถามยืนยันว่าเป็นคุณ', // DRAFT
  "Google will ask you to confirm it's you.": 'Google จะถามยืนยันว่าเป็นคุณ', // DRAFT
  "That's a different account. Use the one this phone signed in with.": 'เป็นบัญชีอื่น ใช้บัญชีที่เครื่องนี้เข้าสู่ระบบไว้', // DRAFT
  "Couldn't confirm it's you. Try again, or use another way.": 'ยืนยันตัวตนไม่สำเร็จ ลองอีกครั้งหรือใช้วิธีอื่น', // DRAFT
  // bw-welcome
  'Already have an account? Sign in': 'มีบัญชีแล้ว เข้าสู่ระบบ',
  // sa-terms (its title, "Our promises", is approved copy and stays on useCopy)
  'Three things Jotbun always does for you': 'สามข้อที่ Jotbun ทำให้คุณเสมอ',
  'No bank connection': 'ไม่ผูกบัญชีธนาคาร',
  'Jotbun never connects to your bank. You write down every record yourself.': 'Jotbun ไม่เชื่อมต่อกับธนาคารของคุณ คุณเป็นคนจดเองทุกรายการ',
  'We never sell your data': 'ไม่ขายข้อมูล',
  'Your records are never sold to anyone, whether a bank, a shop or one of our sister apps.': 'บันทึกของคุณจะไม่ถูกขายให้ใคร ไม่ว่าจะเป็นธนาคาร ร้านค้า หรือแอปพี่น้องของเรา',
  'No ads': 'ไม่มีโฆษณา',
  'No ads at all. The screen shows only your numbers.': 'ไม่มีโฆษณาเลย หน้าจอมีแค่ตัวเลขของคุณ',
  'I accept the Jotbun Terms of Service and Privacy Policy': 'ฉันยอมรับข้อกำหนดการให้บริการและนโยบายความเป็นส่วนตัวของ Jotbun',
  'Terms of Service': 'ข้อกำหนดการให้บริการ',
  'Privacy Policy': 'นโยบายความเป็นส่วนตัว',
  // The terms step's failures
  "Couldn't save your answer. Check your connection and try again.": 'บันทึกคำตอบไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง', // DRAFT
  "Couldn't load this text. Try again later.": 'โหลดข้อความไม่สำเร็จ ลองอีกครั้งภายหลัง', // DRAFT
};

/** One pass: a value that looks like a placeholder is inserted, never filled again; an unsupplied one stays as `{name}`. */
function fill(text: string, values: CopyValues | undefined): string {
  if (!values) return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, name: string) => {
    const value = values[name];
    return value === undefined ? token : String(value);
  });
}

/** Thai from DRAFT_TH for `th`, otherwise the English (Vietnamese too, until E2), with its {placeholders} filled. */
export function signinText(english: string, locale: Locale, values?: CopyValues): string {
  const thai = locale === 'th' && Object.prototype.hasOwnProperty.call(DRAFT_TH, english) ? DRAFT_TH[english] : undefined;
  return fill(thai ?? english, values);
}

/** The drafts' copy hook, named `sc` in the screens: `catalogs.test.ts` checks that every literal passed to `sc` has a Thai draft. */
export function useSigninCopy(): (english: string, values?: CopyValues) => string {
  const { locale } = useIntl();
  const active: Locale = isSupportedLocale(locale) ? locale : 'en';
  return useCallback((english: string, values?: CopyValues) => signinText(english, active, values), [active]);
}
