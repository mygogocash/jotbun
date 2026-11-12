// Bun AI's draft lines (P3-T14, `bunai.*`; boards ai-consent and ai-settings).
// Data only: a screen reads them through useBunAiCopy. The Thai is fixed by
// the plan: each board's visible lines verbatim, in the board's order, except
// three the plan changed (B8, default pending owner Q11, until counsel
// answers): the consent's what-is-sent line names what prompts carry, wallet
// and merchant names, notes and a slip's printed names and digits included;
// its what-is-kept line names the receipt a person keeps; and its failure
// line. photoHidden is P3-T17's and P3-T19's (default pending owner Q12). The
// English is the E2 draft. P3-T24 moves these lines into the catalogs.
import type { BunAiTable } from './useBunAiCopy.ts';

export const BUNAI_DRAFTS = {
  'bunai.consentTitle': { th: 'ตัวช่วย AI ของบัน', en: "Bun's AI help" },
  'bunai.consentQuestion': { th: 'ให้บันช่วยอ่านและตอบด้วย AI ไหม?', en: 'Let Bun read and answer with AI?' },
  'bunai.consentLine': {
    th: 'บันเปลี่ยนประโยคหรือสลิปเป็นร่างให้คุณตรวจ เขียนโน้ตสั้น ๆ ทุกวัน และตอบคำถามจากบันทึกของคุณ',
    en: 'Bun turns a sentence or a slip into a draft for you to check, writes a short note each day, and answers questions from your records.',
  },
  'bunai.consentWhat': { th: 'ส่งอะไรบ้าง', en: 'What is sent' },
  'bunai.consentWhatLine': {
    th: 'เฉพาะสิ่งที่งานนั้นต้องใช้: ประโยคที่คุณพิมพ์ รูปสลิปหรือใบเสร็จ รวมชื่อและเลขบัญชีบางส่วนที่พิมพ์อยู่ในรูป ชื่อกระเป๋าและหมวดให้บันเลือก ยอดของวันและของเดือน งบที่เหลือ กับชื่อหมวดสำหรับโน้ตประจำวัน และเมื่อคุณถาม ยอดรวม ชื่อร้าน และโน้ตที่จดไว้ ไม่ส่งอีเมล เบอร์โทร หรือรหัสบัญชี Jotbun ของคุณ',
    en: "Only what that task needs: the sentence you type; the slip or receipt photo, with the names and partial account numbers printed on it; your wallet and category names, for Bun to choose from; for the daily note, the day's and the month's totals, the budget left and category names; and when you ask, totals, shop names and the notes you wrote. Your email, phone number and Jotbun account ID are never sent.",
  },
  'bunai.consentWho': { th: 'ส่งให้ใคร', en: 'Who reads it' },
  'bunai.consentWhoLine': {
    th: 'ผ่านเซิร์ฟเวอร์ของ Jotbun ไปให้ผู้ให้บริการ AI อ่าน (Claude ของ Anthropic)',
    en: "It goes through Jotbun's server to the AI provider, who reads it (Claude by Anthropic).",
  },
  'bunai.consentKeep': { th: 'เก็บนานแค่ไหน', en: 'How long it is kept' },
  'bunai.consentKeepLine': {
    th: 'Jotbun ไม่เก็บสิ่งที่ส่งไปอ่าน ยกเว้นรูปใบเสร็จที่คุณแนบไว้กับรายการ ไม่เก็บรูปสลิป และไม่ถูกนำไปฝึก AI',
    en: 'Jotbun keeps nothing sent to be read, except a receipt photo you attach to an entry. Slip photos are never kept, and nothing is used to train AI.',
  },
  'bunai.consentWrong': { th: 'บันอาจอ่านผิดได้', en: 'Bun can read things wrong.' },
  'bunai.consentWrongLine': { th: 'คุณตรวจทุกรายการก่อนบันทึกเสมอ', en: "You always check every entry before it's saved." },
  'bunai.consentFoot': {
    th: 'บันอธิบายตัวเลขของคุณเอง ไม่แนะนำสินเชื่อ การลงทุน หรือผลิตภัณฑ์ทางการเงิน · ปิดได้ทุกเมื่อในการตั้งค่า',
    en: 'Bun explains your own numbers, and never advises on loans, investments or other financial products · Turn it off any time in Settings',
  },
  'bunai.consentDetails': { th: 'อ่านรายละเอียด', en: 'Read the details' },
  'bunai.consentOn': { th: 'เปิดใช้', en: 'Turn on' },
  'bunai.consentNotNow': { th: 'ไม่ใช่ตอนนี้', en: 'Not now' },
  'bunai.consentFailed': {
    th: 'เปิดตัวช่วย AI ไม่ได้ตอนนี้ ลองอีกครั้งเมื่อต่อเน็ต',
    en: "Bun's AI help couldn't be turned on right now. Try again when you're online.",
  },
  'bunai.settingsTitle': { th: 'บันและ AI', en: 'Bun and AI' },
  'bunai.bunHeading': { th: 'บัน', en: 'Bun' },
  'bunai.presence': { th: 'บันโผล่มาแค่ไหน', en: 'How much Bun shows up' },
  'bunai.presenceFull': { th: 'เต็ม', en: 'Full' },
  'bunai.presenceFullLine': { th: 'บัน ท่าแอบมอง และกล่องคำพูด', en: 'Bun, its peeks and its speech bubbles' },
  'bunai.presenceQuiet': { th: 'เงียบ', en: 'Quiet' },
  'bunai.presenceQuietLine': { th: 'ไม่มีกล่องคำพูด โผล่เฉพาะหน้าว่าง', en: 'No speech bubbles, only on empty pages' },
  'bunai.presenceOff': { th: 'ปิด', en: 'Off' },
  'bunai.presenceOffLine': { th: 'ไม่แสดงบันเลย', en: 'No Bun anywhere' },
  'bunai.aiLine': {
    th: 'บอกบัน อ่านสลิป โน้ตประจำวัน และถามบัน บันอ่านเฉพาะสิ่งที่แต่ละงานต้องใช้ ตัวเลขทุกตัวมาจากบันทึกของคุณ',
    en: 'Tell Bun, slip reading, the daily note and Ask Bun. Bun reads only what each task needs, and every number comes from your records.',
  },
  'bunai.usesLeft': { th: 'วันนี้ใช้ได้อีก', en: 'Left today' },
  'bunai.usesParse': { th: 'ประโยค', en: 'Sentences' },
  'bunai.usesSlip': { th: 'สลิป', en: 'Slips' },
  'bunai.usesAsk': { th: 'คำถาม', en: 'Questions' },
  'bunai.whatAiSees': { th: 'สิ่งที่ AI เห็น', en: 'What AI sees' },
  'bunai.note': { th: 'โน้ตประจำวันจากบัน', en: 'Daily note from Bun' },
  'bunai.noteLine': {
    th: 'ข้อความสั้น ๆ บนหน้าแรกวันละครั้ง จากตัวเลขของคุณเอง แสดงเมื่อบันอยู่ในโหมดเต็ม',
    en: 'A short line on Home once a day, from your own numbers. It shows when Bun is set to Full.',
  },
  'bunai.haptics': { th: 'การสั่น', en: 'Haptics' },
  'bunai.hapticsOn': { th: 'เปิด', en: 'On' },
  'bunai.hapticsSubtle': { th: 'เบา', en: 'Subtle' },
  'bunai.hapticsOff': { th: 'ปิด', en: 'Off' },
  'bunai.hapticsLine': { th: 'สั่นเบา ๆ ตอนพิมพ์ เลือก และบันทึก', en: 'A light tap when you type, choose and save.' },
  'bunai.usesOf': { th: '{left} / {limit}', en: '{left} / {limit}' },
  'bunai.photoHidden': { th: 'แตะเพื่อดูรูป', en: 'Tap to see the photo' },
} as const satisfies BunAiTable;
