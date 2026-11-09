/**
 * The offline rules behind "Tell Bun": one short sentence such as
 * "ข้าวมันไก่ 50", "grab 120 เมื่อวาน" or "เงินเดือน 30,000" becomes a guess
 * for Quick add. It runs on the phone with no network and is the server's
 * fallback when AI is off. It never decides alone: every guess opens Quick
 * add for the user to check and save.
 */
import type { AiDraft, AiDraftFlag } from "./ai.ts";
import type { BuiltinCategoryKey, CategoryDto } from "./categories.ts";
import type { Minor } from "./common.ts";
import { MERCHANT_MAX_CHARS } from "./transactions.ts";
import type { WalletDto } from "./wallets.ts";

export type QuickTextGuess = {
  type: "expense" | "income";
  amount_minor: Minor | null;
  /** How many separate amounts the sentence held; more than one is flagged for a look. */
  amounts_found: number;
  merchant: string | null;
  category_key: BuiltinCategoryKey | null;
  /** 0 today, -1 yesterday, -2 the day before; null when the sentence names no day. */
  day_offset: 0 | -1 | -2 | null;
};

const THAI_DIGITS = /[๐-๙]/g;
const toAsciiDigits = (text: string) => text.replace(THAI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0e50));

// Merchants whose names hold digits must not be read as amounts.
const DIGIT_MERCHANTS: readonly [RegExp, string][] = [
  [/\b7\s*[-–]?\s*(?:11|eleven)\b|\b711\b|เซเว่น/i, "7-Eleven"],
  [/\b(?:true\s*)?money\s*wallet\b/i, "TrueMoney"],
];

const DAY_WORDS: readonly [RegExp, -1 | -2 | 0][] = [
  [/เมื่อวานซืน|day before yesterday/i, -2],
  [/เมื่อวาน|yesterday/i, -1],
  [/วันนี้|today/i, 0],
];

const CURRENCY = /฿|บาท|baht|thb/gi;

const THAI_UNITS: Record<string, number> = { ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
const THAI_MULTIPLIERS: Record<string, number> = { สิบ: 10, ร้อย: 100, พัน: 1_000, หมื่น: 10_000, แสน: 100_000, ล้าน: 1_000_000 };
const THAI_NUMBER_WORD = new RegExp(`(?:${[...Object.keys(THAI_UNITS), ...Object.keys(THAI_MULTIPLIERS)].sort((a, b) => b.length - a.length).join("|")})+`, "g");

/** "ห้าสิบ" 50, "ร้อยห้าสิบ" 150, "สองพันห้าร้อย" 2,500, "สามหมื่น" 30,000; null when the words are not a number. */
export function thaiWordsToNumber(words: string): number | null {
  const tokens = words.match(new RegExp([...Object.keys(THAI_UNITS), ...Object.keys(THAI_MULTIPLIERS)].sort((a, b) => b.length - a.length).join("|"), "g"));
  if (!tokens || tokens.join("") !== words) return null;
  let total = 0;
  let millions = 0;
  let digit: number | null = null;
  for (const token of tokens) {
    if (token in THAI_UNITS) {
      if (digit !== null) return null;
      digit = THAI_UNITS[token];
      continue;
    }
    const multiplier = THAI_MULTIPLIERS[token];
    if (multiplier === 1_000_000) {
      millions = (total + (digit ?? 1)) * 1_000_000;
      total = 0;
    } else {
      total += (digit ?? 1) * multiplier;
    }
    digit = null;
  }
  if (digit !== null) total += digit;
  const value = millions + total;
  return value > 0 ? value : null;
}

type FoundAmount = { satang: bigint; marked: boolean; start: number; end: number };

// "1.5k" and "2 พัน" scale the number; "5km" does not.
const NUMBER = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:(k|K)(?![A-Za-z])|(พัน|หมื่น|แสน))?/g;
const SCALES: Record<string, bigint> = { k: 1_000n, K: 1_000n, พัน: 1_000n, หมื่น: 10_000n, แสน: 100_000n };

function amountsIn(text: string): FoundAmount[] {
  const found: FoundAmount[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const whole = BigInt(match[1].replace(/,/g, ""));
    const fraction = (match[2] ?? "").padEnd(2, "0");
    let satang = whole * 100n + BigInt(fraction || "0");
    const unit = match[3] ?? match[4];
    const scale = unit ? SCALES[unit] : 1n;
    satang *= scale;
    const end = (match.index ?? 0) + match[0].length;
    const after = text.slice(end, end + 6);
    const before = text.slice(Math.max(0, (match.index ?? 0) - 2), match.index ?? 0);
    found.push({ satang, marked: /^\s*(?:฿|บาท|baht|thb)/i.test(after) || /฿\s*$/.test(before), start: match.index ?? 0, end });
  }
  for (const match of text.matchAll(THAI_NUMBER_WORD)) {
    const end = (match.index ?? 0) + match[0].length;
    // Thai has no spaces between words: "ห้าง" (a mall) starts with "ห้า"
    // (five). A number word must end the sentence or meet a space, a digit,
    // punctuation or "บาท".
    if (!/^(?:$|[\s\d.,!?)]|บาท)/.test(text.slice(end))) continue;
    const value = thaiWordsToNumber(match[0]);
    if (value === null) continue;
    found.push({ satang: BigInt(value) * 100n, marked: /^\s*(?:บาท)/.test(text.slice(end, end + 5)), start: match.index ?? 0, end });
  }
  return found.sort((a, b) => a.start - b.start);
}

const INCOME_RULES: readonly [RegExp, BuiltinCategoryKey][] = [
  [/เงินเดือน|salary|payroll|เงินเดือนออก/i, "salary"],
  [/โบนัส|bonus/i, "bonus"],
  [/อั่งเปา|ang\s*pao|แต๊ะเอีย|ได้รับของขวัญ|gift received|แม่ให้|พ่อให้/i, "gift"],
  [/ขายของ|ค่าจ้าง|ฟรีแลนซ์|freelance|รายได้เสริม|side\s*(?:job|gig)|ได้ค่า/i, "side_job"],
];
const INCOME_WORDS = /ได้เงิน|รายได้|รับเงิน|income|received|refund|เงินคืน/i;

const EXPENSE_RULES: readonly [RegExp, BuiltinCategoryKey][] = [
  [/grab\s*food|line\s*man|lineman|foodpanda|robinhood|ข้าว|กาแฟ|ชาเย็น|ชานม|ชาเขียว|ชาไข่มุก|ก๋วยเตี๋ยว|ส้มตำ|หมูกระทะ|ชาบู|ขนม|อาหาร|มื้อ|เบเกอรี่|7-Eleven|\b(?:coffee|cafe|latte|lunch|dinner|breakfast|brunch|food|snacks?|starbucks|kfc|mcdonald'?s?|pizza|bubble\s*tea)\b|café/i, "food"],
  [/\b(?:grab|bolt|taxi|bts|mrt|arl|parking|fuel|petrol|gas station|ptt|shell|bangchak|airasia|nok\s*air|flights?|transport)\b|แท็กซี่|รถไฟ|รถเมล์|วินมอ|วิน(?=\s|\d|$)|มอไซ|น้ำมัน|ทางด่วน|ที่จอด|ตั๋ว|ค่ารถ|ค่าเดินทาง/i, "travel"],
  [/ค่าไฟ|ค่าน้ำ(?:ประปา)?|ค่าเน็ต|อินเทอร์เน็ต|ค่าโทร|เติมเงิน|ค่าเช่า|ประกัน|ผ่อน|บัตรเครดิต|ค่างวด|\b(?:internet|wifi|top\s*up|ais|dtac|truemove|rent|insurance|netflix|spotify|youtube|icloud|subscription|installment|credit card)\b/i, "bills"],
  [/ช้อป|ซื้อ(?:ของ)?ออนไลน์|เสื้อ|กางเกง|รองเท้า|กระเป๋า|เครื่องสำอาง|\b(?:shopee|lazada|tiktok\s*shop|uniqlo|central|siam paragon|emporium|shopping|clothes|shoes)\b/i, "shopping"],
  [/ของใช้|ผงซักฟอก|สบู่|แชมพู|ทิชชู่|ค่าแม่บ้าน|ซ่อม|อุปกรณ์|\b(?:lotus'?s?|big\s*c|makro|tops|villa market|household|groceries|grocery|supermarket|ikea|homepro)\b/i, "household"],
  [/ดูหนัง|ภาพยนตร์|เกม|คอนเสิร์ต|ผับ|บาร์|เบียร์|คาราโอเกะ|เที่ยว|ฟิตเนส|\b(?:movies?|cinema|major cineplex|sf\s*cinema|games?|steam|concert|bar|beer|karaoke|trip|gym|nintendo|playstation)\b/i, "fun"],
];

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max).join("").trim() : text;
}

/** Reads one sentence into a Quick add guess. Never throws; empty or unreadable text gives an empty guess. */
export function parseQuickText(input: string): QuickTextGuess {
  let text = toAsciiDigits(String(input ?? "").normalize("NFC")).replace(/\s+/g, " ").trim();
  let merchantHint: string | null = null;
  for (const [pattern, name] of DIGIT_MERCHANTS) {
    if (pattern.test(text)) {
      merchantHint = name;
      text = text.replace(pattern, " ").replace(/\s+/g, " ").trim();
    }
  }
  let day: QuickTextGuess["day_offset"] = null;
  for (const [pattern, offset] of DAY_WORDS) {
    if (pattern.test(text)) {
      day = offset;
      text = text.replace(pattern, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }
  const amounts = amountsIn(text);
  const marked = amounts.filter((a) => a.marked);
  const chosen = marked.length === 1 ? marked[0] : amounts.length > 0 ? amounts[amounts.length - 1] : null;
  const valid = chosen && chosen.satang > 0n && chosen.satang <= 99_999_999_999n ? chosen : null;

  let rest = text;
  for (const amount of [...amounts].sort((a, b) => b.start - a.start)) rest = `${rest.slice(0, amount.start)} ${rest.slice(amount.end)}`;
  rest = rest.replace(CURRENCY, " ").replace(/[,:;\-–]+/g, " ").replace(/\s+/g, " ").trim();
  const merchant = merchantHint ? (rest ? `${merchantHint} ${rest}` : merchantHint) : rest || null;

  const classify = merchantHint ? `${merchantHint} ${text}` : text;
  const income = INCOME_RULES.find(([pattern]) => pattern.test(classify));
  const isIncome = Boolean(income) || INCOME_WORDS.test(classify);
  const expense = isIncome ? undefined : EXPENSE_RULES.find(([pattern]) => pattern.test(classify));

  return {
    type: isIncome ? "income" : "expense",
    amount_minor: valid ? valid.satang.toString() : null,
    amounts_found: amounts.length,
    merchant: merchant ? clip(merchant, MERCHANT_MAX_CHARS) : null,
    category_key: income?.[1] ?? expense?.[1] ?? null,
    day_offset: day,
  };
}

/** What a sentence's draft may point at: the account's own wallets and categories, and today. */
export type QuickTextContext = {
  today: string;
  wallets: readonly Pick<WalletDto, "id" | "archived">[];
  categories: readonly Pick<CategoryDto, "id" | "type" | "builtin_key" | "archived">[];
};

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A Quick add draft from the rules alone: the phone's offline "Tell Bun" and
 * the server's answer when AI is off or unsure. The guess maps onto the
 * account's own built-in category of that type and its only active wallet;
 * anything it cannot tell is null and flagged for the person to choose.
 */
export function draftFromQuickText(text: string, ctx: QuickTextContext): AiDraft | null {
  const guess = parseQuickText(text);
  if (guess.amount_minor === null && guess.merchant === null) return null;
  const flags: AiDraftFlag[] = [];
  if (guess.amount_minor === null) flags.push("amount_unclear");
  if (guess.amounts_found > 1) flags.push("multiple_amounts");
  const category = guess.category_key ? ctx.categories.find((c) => !c.archived && c.builtin_key === guess.category_key && c.type === guess.type) : undefined;
  if (!category) flags.push("category_guessed");
  const active = ctx.wallets.filter((w) => !w.archived);
  const wallet = active.length === 1 ? active[0].id : null;
  if (!wallet) flags.push("wallet_guessed");
  return {
    type: guess.type,
    amount_minor: guess.amount_minor,
    occurred_on: addDays(ctx.today, guess.day_offset ?? 0),
    category_id: category?.id ?? null,
    wallet_id: wallet,
    merchant: guess.merchant,
    note: null,
    confidence: flags.length === 0 ? "high" : guess.amount_minor ? "medium" : "low",
    flags,
  };
}
