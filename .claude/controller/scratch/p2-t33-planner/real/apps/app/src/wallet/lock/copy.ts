import type { DraftTable } from '../copy/draftText.ts';

/**
 * The Face ID lock's lines: sa-lock-setup's and sa-locked's words, the
 * method's names, the Settings row, and the lines no board shows (the
 * fingerprint and passcode forms, what the locked screen says after a scan
 * that did not pass, the lock turning itself off, a phone with no passcode,
 * and the preview card's name). `{method}` takes a method's name. Data only:
 * read through `useDraftCopy` with COMMON_COPY. Default pending owner Q3:
 * built as written; the English lines, and every Thai line no board shows,
 * are drafts for E2-D.
 */
export const COPY = {
  'lock.step': { th: 'ตั้งค่า · ขั้นที่ 5 จาก 5', en: 'Setup · Step 5 of 5' },
  'lock.question': { th: 'ล็อก Jotbun ด้วย {method} ไหม?', en: 'Lock Jotbun with {method}?' },
  'lock.body': {
    th: 'ทุกครั้งที่เปิดแอป ต้องสแกนหน้าก่อนถึงจะเห็นยอดเงินและบันทึก เหมาะเวลายื่นโทรศัพท์ให้คนอื่นดูรูป',
    en: 'Every time you open the app, scan your face before you see amounts and entries. Handy when you pass your phone to someone to show a photo.',
  },
  'lock.bodyFingerprint': {
    th: 'ทุกครั้งที่เปิดแอป ต้องสแกนลายนิ้วมือก่อนถึงจะเห็นยอดเงินและบันทึก เหมาะเวลายื่นโทรศัพท์ให้คนอื่นดูรูป',
    en: 'Every time you open the app, scan your fingerprint before you see amounts and entries. Handy when you pass your phone to someone to show a photo.',
  },
  'lock.bodyPasscode': {
    th: 'ทุกครั้งที่เปิดแอป ต้องใส่รหัสผ่านของเครื่องก่อนถึงจะเห็นยอดเงินและบันทึก เหมาะเวลายื่นโทรศัพท์ให้คนอื่นดูรูป',
    en: "Every time you open the app, enter your phone's passcode before you see amounts and entries. Handy when you pass your phone to someone to show a photo.",
  },
  'lock.switch': { th: 'ล็อกด้วย {method}', en: 'Lock with {method}' },
  'lock.fallbackLine': { th: 'สแกนไม่ผ่าน ใช้รหัสผ่านของเครื่องแทนได้', en: "If a scan doesn't pass, you can use your phone's passcode instead." },
  'lock.changeLater': { th: 'เปลี่ยนใจได้ทุกเมื่อในการตั้งค่า', en: 'You can change this anytime in Settings.' },
  'lock.lockedTitle': { th: 'Jotbun ล็อกอยู่', en: 'Jotbun is locked' },
  'lock.lineFace': { th: 'สแกนหน้าเพื่อเปิดบันทึกของคุณ', en: 'Scan your face to open your diary.' },
  'lock.lineFingerprint': { th: 'สแกนลายนิ้วมือเพื่อเปิดบันทึกของคุณ', en: 'Scan your fingerprint to open your diary.' },
  'lock.linePasscode': { th: 'ใส่รหัสผ่านของเครื่องเพื่อเปิดบันทึกของคุณ', en: "Enter your phone's passcode to open your diary." },
  'lock.unlock': { th: 'ปลดล็อกด้วย {method}', en: 'Unlock with {method}' },
  'lock.usePasscode': { th: 'ใช้รหัสผ่าน', en: 'Use passcode' },
  'lock.methodFace': { th: 'Face ID', en: 'Face ID' },
  'lock.methodFingerprint': { th: 'ลายนิ้วมือ', en: 'fingerprint' },
  'lock.methodPasscode': { th: 'รหัสผ่าน', en: 'passcode' },
  'lock.tryAgain': { th: 'ลองอีกครั้ง หรือใช้รหัสผ่าน', en: 'Try again, or use your passcode.' },
  'lock.lockout': { th: 'สแกนไม่ผ่านหลายครั้ง ใช้รหัสผ่านของเครื่องแทน', en: "Too many scans didn't pass. Use your phone's passcode instead." },
  'lock.turnedOff': { th: 'ปิดการล็อกแล้ว เพราะเครื่องนี้ไม่มีรหัสผ่านหรือ Face ID แล้ว', en: 'The lock is off, because this phone no longer has a passcode or Face ID.' },
  'lock.needsPasscode': { th: 'ตั้งรหัสผ่านหรือ Face ID ในการตั้งค่าเครื่องก่อน จึงจะล็อก Jotbun ได้', en: "Set a passcode or Face ID in your phone's settings first, then you can lock Jotbun." },
  'lock.row': { th: 'ล็อกด้วย {method}', en: 'Lock with {method}' },
  'lock.on': { th: 'เปิด', en: 'On' },
  'lock.off': { th: 'ปิด', en: 'Off' },
  'lock.previewName': { th: 'บัญชีหลัก', en: 'Main account' },
} as const satisfies DraftTable;
