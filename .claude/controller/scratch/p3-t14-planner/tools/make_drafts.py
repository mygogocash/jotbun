# Writes apps/app/src/wallet/bunai/drafts.ts (P3-T14) into the tree given, with
# each Thai line checked to occur verbatim in its source: the boards ai-consent
# and ai-settings, or the plan's task text for the lines it changed (B8, Q11,
# Q12). English lines are the E2 drafts. Usage:
#   python3 -I make_drafts.py <tree>
import json
import sys
from pathlib import Path

tree = Path(sys.argv[1])
consent = (tree / 'docs/design/bun-wallet/ai-consent.dc.html').read_text(encoding='utf-8')
settings = (tree / 'docs/design/bun-wallet/ai-settings.dc.html').read_text(encoding='utf-8')
plan = (tree / 'docs/superpowers/plans/2026-10-25-jotbun-p3-photos-bun-ai.md').read_text(encoding='utf-8')
task = plan[plan.index('### Task P3-T14:'):plan.index('### Task P3-T15:')]

C, S, P = 'ai-consent', 'ai-settings', 'plan'
SOURCES = {C: consent, S: settings, P: task}

# (key, source, Thai, English), in the plan's order: ai-consent's lines, the
# three it changes, then ai-settings' lines and usesOf, then photoHidden.
LINES = [
    ('consentTitle', C, 'ตัวช่วย AI ของบัน', "Bun's AI help"),
    ('consentQuestion', C, 'ให้บันช่วยอ่านและตอบด้วย AI ไหม?', 'Let Bun read and answer with AI?'),
    ('consentLine', C, 'บันเปลี่ยนประโยคหรือสลิปเป็นร่างให้คุณตรวจ เขียนโน้ตสั้น ๆ ทุกวัน และตอบคำถามจากบันทึกของคุณ',
     'Bun turns a sentence or a slip into a draft for you to check, writes a short note each day, and answers questions from your records.'),
    ('consentWhat', C, 'ส่งอะไรบ้าง', 'What is sent'),
    ('consentWhatLine', P,
     'เฉพาะสิ่งที่งานนั้นต้องใช้: ประโยคที่คุณพิมพ์ รูปสลิปหรือใบเสร็จ รวมชื่อและเลขบัญชีบางส่วนที่พิมพ์อยู่ในรูป ชื่อกระเป๋าและหมวดให้บันเลือก ยอดของวันและของเดือน งบที่เหลือ กับชื่อหมวดสำหรับโน้ตประจำวัน และเมื่อคุณถาม ยอดรวม ชื่อร้าน และโน้ตที่จดไว้ ไม่ส่งอีเมล เบอร์โทร หรือรหัสบัญชี Jotbun ของคุณ',
     "Only what that task needs: the sentence you type; the slip or receipt photo, with the names and partial account numbers printed on it; your wallet and category names, for Bun to choose from; for the daily note, the day's and the month's totals, the budget left and category names; and when you ask, totals, shop names and the notes you wrote. Your email, phone number and Jotbun account ID are never sent."),
    ('consentWho', C, 'ส่งให้ใคร', 'Who reads it'),
    ('consentWhoLine', C, 'ผ่านเซิร์ฟเวอร์ของ Jotbun ไปให้ผู้ให้บริการ AI อ่าน (Claude ของ Anthropic)',
     "It goes through Jotbun's server to the AI provider, who reads it (Claude by Anthropic)."),
    ('consentKeep', C, 'เก็บนานแค่ไหน', 'How long it is kept'),
    ('consentKeepLine', P, 'Jotbun ไม่เก็บสิ่งที่ส่งไปอ่าน ยกเว้นรูปใบเสร็จที่คุณแนบไว้กับรายการ ไม่เก็บรูปสลิป และไม่ถูกนำไปฝึก AI',
     'Jotbun keeps nothing sent to be read, except a receipt photo you attach to an entry. Slip photos are never kept, and nothing is used to train AI.'),
    ('consentWrong', C, 'บันอาจอ่านผิดได้', 'Bun can read things wrong.'),
    ('consentWrongLine', C, 'คุณตรวจทุกรายการก่อนบันทึกเสมอ', "You always check every entry before it's saved."),
    ('consentFoot', C, 'บันอธิบายตัวเลขของคุณเอง ไม่แนะนำสินเชื่อ การลงทุน หรือผลิตภัณฑ์ทางการเงิน · ปิดได้ทุกเมื่อในการตั้งค่า',
     'Bun explains your own numbers, and never advises on loans, investments or other financial products · Turn it off any time in Settings'),
    ('consentDetails', C, 'อ่านรายละเอียด', 'Read the details'),
    ('consentOn', C, 'เปิดใช้', 'Turn on'),
    ('consentNotNow', C, 'ไม่ใช่ตอนนี้', 'Not now'),
    ('consentFailed', P, 'เปิดตัวช่วย AI ไม่ได้ตอนนี้ ลองอีกครั้งเมื่อต่อเน็ต', "Bun's AI help couldn't be turned on right now. Try again when you're online."),
    ('settingsTitle', S, 'บันและ AI', 'Bun and AI'),
    ('bunHeading', S, 'บัน', 'Bun'),
    ('presence', S, 'บันโผล่มาแค่ไหน', 'How much Bun shows up'),
    ('presenceFull', S, 'เต็ม', 'Full'),
    ('presenceFullLine', S, 'บัน ท่าแอบมอง และกล่องคำพูด', 'Bun, its peeks and its speech bubbles'),
    ('presenceQuiet', S, 'เงียบ', 'Quiet'),
    ('presenceQuietLine', S, 'ไม่มีกล่องคำพูด โผล่เฉพาะหน้าว่าง', 'No speech bubbles, only on empty pages'),
    ('presenceOff', S, 'ปิด', 'Off'),
    ('presenceOffLine', S, 'ไม่แสดงบันเลย', 'No Bun anywhere'),
    ('aiLine', S, 'บอกบัน อ่านสลิป โน้ตประจำวัน และถามบัน บันอ่านเฉพาะสิ่งที่แต่ละงานต้องใช้ ตัวเลขทุกตัวมาจากบันทึกของคุณ',
     'Tell Bun, slip reading, the daily note and Ask Bun. Bun reads only what each task needs, and every number comes from your records.'),
    ('usesLeft', S, 'วันนี้ใช้ได้อีก', 'Left today'),
    ('usesParse', S, 'ประโยค', 'Sentences'),
    ('usesSlip', S, 'สลิป', 'Slips'),
    ('usesAsk', S, 'คำถาม', 'Questions'),
    ('whatAiSees', S, 'สิ่งที่ AI เห็น', 'What AI sees'),
    ('note', S, 'โน้ตประจำวันจากบัน', 'Daily note from Bun'),
    ('noteLine', S, 'ข้อความสั้น ๆ บนหน้าแรกวันละครั้ง จากตัวเลขของคุณเอง แสดงเมื่อบันอยู่ในโหมดเต็ม',
     'A short line on Home once a day, from your own numbers. It shows when Bun is set to Full.'),
    ('haptics', S, 'การสั่น', 'Haptics'),
    ('hapticsOn', S, 'เปิด', 'On'),
    ('hapticsSubtle', S, 'เบา', 'Subtle'),
    ('hapticsOff', S, 'ปิด', 'Off'),
    ('hapticsLine', S, 'สั่นเบา ๆ ตอนพิมพ์ เลือก และบันทึก', 'A light tap when you type, choose and save.'),
    ('usesOf', P, '{left} / {limit}', '{left} / {limit}'),
    ('photoHidden', P, 'แตะเพื่อดูรูป', 'Tap to see the photo'),
]

missing = [(key, src) for key, src, th, _ in LINES if th not in SOURCES[src]]
if missing:
    sys.exit(f'not verbatim in their sources: {missing}')
keys = [key for key, *_ in LINES]
if len(set(keys)) != len(keys):
    sys.exit('a key is listed twice')

def ts(text: str) -> str:
    # The house style (P2's copy.ts): single quotes, double quotes when the text has an apostrophe.
    if '\\' in text or ('"' in text and "'" in text):
        sys.exit(f'needs escaping: {text}')
    return f'"{text}"' if "'" in text else f"'{text}'"

head = '''// Bun AI's draft lines (P3-T14, `bunai.*`; boards ai-consent and ai-settings).
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
'''
def entry(key: str, th: str, en: str) -> str:
    one = f"  'bunai.{key}': {{ th: {ts(th)}, en: {ts(en)} }},\n"
    if len(one) <= 160:
        return one
    return f"  'bunai.{key}': {{\n    th: {ts(th)},\n    en: {ts(en)},\n  }},\n"

body = ''.join(entry(key, th, en) for key, _, th, en in LINES)
tail = '} as const satisfies BunAiTable;\n'
out = tree / 'apps/app/src/wallet/bunai/drafts.ts'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(head + body + tail, encoding='utf-8')
print(f'wrote {out.relative_to(tree)}: {len(LINES)} lines, every Thai line verbatim in its source')
