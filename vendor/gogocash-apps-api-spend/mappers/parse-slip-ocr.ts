const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export type SlipOcrParse = {
  amount_minor: number | null;
  merchant: string;
  occurred_on: string | null;
};

export function parseSlipText(text: string): SlipOcrParse {
  const normalized = text.replace(/\u00a0/g, ' ').replace(/\r/g, '');
  return {
    amount_minor: pickAmountMinor(normalized),
    merchant: pickMerchant(normalized),
    occurred_on: pickOccurredOn(normalized),
  };
}

const TH_MONTHS: Readonly<Record<string, number>> = {
  'ม.ค.': 1,
  มกราคม: 1,
  'ก.พ.': 2,
  กุมภาพันธ์: 2,
  'มี.ค.': 3,
  มีนาคม: 3,
  'เม.ย.': 4,
  เมษายน: 4,
  'พ.ค.': 5,
  พฤษภาคม: 5,
  'มิ.ย.': 6,
  มิถุนายน: 6,
  'ก.ค.': 7,
  กรกฎาคม: 7,
  'ส.ค.': 8,
  สิงหาคม: 8,
  'ก.ย.': 9,
  กันยายน: 9,
  'ต.ค.': 10,
  ตุลาคม: 10,
  'พ.ย.': 11,
  พฤศจิกายน: 11,
  'ธ.ค.': 12,
  ธันวาคม: 12,
};

const TH_MONTH_PATTERN = Object.keys(TH_MONTHS)
  .map((name) => name.replace(/\./g, '\\.'))
  .join('|');

function pickAmountMinor(text: string): number | null {
  const usable = text
    .split('\n')
    .filter((line) => !/(ค่าธรรมเนียม|fee|charge)/i.test(line))
    .join('\n');
  const labeled = [
    /(?:จำนวนเงิน(?:ที่โอน)?|ยอด(?:โอน|รวม|ชำระ|เงิน)|amount|total)\s*[:-]?\s*฿?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2})?)/gi,
    /฿\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2})?)/g,
    /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))\s*(?:บาท|thb)/gi,
  ];
  const found: number[] = [];
  for (const re of labeled) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null = re.exec(usable);
    while (match) {
      const n = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0 && n < 10_000_000) {
        found.push(Math.round(n * 100));
      }
      match = re.exec(usable);
    }
  }
  if (found.length === 0) return null;
  return Math.max(...found);
}

function pickMerchant(text: string): string {
  const labeled =
    /(?:ร้าน(?:ค้า)?|ผู้รับ(?:เงิน)?|ชื่อบัญชี|โอนไปที่|บริษัท|merchant|payee)\s*[:-]?\s*([^\n]{3,80})/i.exec(
      text,
    );
  if (labeled?.[1]) {
    return labeled[1].trim().slice(0, 80);
  }
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length >= 4 &&
        !/promptpay|พร้อมเพย์|qr|กสิกร|กรุงศรี|ไทยพาณิชย์|ธนาคาร/i.test(line),
    );
  return (lines[0] ?? '').slice(0, 80);
}

function pickOccurredOn(text: string): string | null {
  const named = new RegExp(
    `(\\d{1,2})\\s+(${TH_MONTH_PATTERN})\\s+(\\d{2,4})`,
    'i',
  ).exec(text);
  if (named) {
    const month = TH_MONTHS[named[2]] ?? TH_MONTHS[named[2].toLowerCase()];
    if (month) {
      let year = Number(named[3]);
      if (year >= 2400) year -= 543;
      if (year < 100) year += 2000;
      const iso = toIsoDate(year, month, Number(named[1]));
      if (iso) return iso;
    }
  }
  const dmy =
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(text) ??
    /(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})/.exec(text);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year >= 2400) year -= 543;
    if (year < 100) year += 2000;
    return toIsoDate(year, Number(dmy[2]), Number(dmy[1]));
  }
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const shifted = new Date(Date.now() + BANGKOK_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
