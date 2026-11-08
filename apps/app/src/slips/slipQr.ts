// The Thai bank slip verification QR (P3-T1, capability P3:slip-qr). A Thai bank app prints it
// on each transfer slip: a root field 00 holding the API id 000001, the sending bank's code and
// the transaction reference, then 51 = TH and the CRC in 91. Only API id 000001 counts (B14):
// TrueMoney and other e-wallet slips, and payment QR codes, are not bank slips.
// Pure: no imports, no React, no native module.

export type SlipQr = { bankCode: string; reference: string };

/** Sub-field 00 of the root on a Thai bank slip QR (B14). */
export const SLIP_QR_API_ID = '000001';

const SLIP_QR_TEXT = /^[ -~]{1,512}$/; // 1 to 512 printable ASCII characters
const FIELD_HEADER = /^[0-9]{4}$/; // a 2-digit tag, then a 2-digit length
const BANK_CODE = /^[0-9]{3}$/;
const REFERENCE = /^[0-9A-Za-z]{1,64}$/;

type Field = { tag: string; length: string; value: string; valueStart: number };

/** CRC-16/CCITT-FALSE: polynomial 0x1021, initial 0xFFFF, no reflection, no final XOR, over the UTF-8 bytes. */
export function crc16CcittFalse(text: string): number {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

// Splits text into tag-length-value fields; null when a header is not four digits or a value
// runs past the end. With shortCrc, a last 91 of length 04 may hold only 1 to 3 characters
// (an app dropped the CRC's leading zeros); slice stops at the end of the text.
function readFields(text: string, shortCrc: boolean): Field[] | null {
  const fields: Field[] = [];
  let at = 0;
  while (at < text.length) {
    const header = text.slice(at, at + 4);
    if (!FIELD_HEADER.test(header)) return null;
    const tag = header.slice(0, 2);
    const length = header.slice(2);
    const valueStart = at + 4;
    const end = valueStart + Number(length);
    if (end > text.length && !(shortCrc && tag === '91' && length === '04' && valueStart < text.length)) return null;
    fields.push({ tag, length, value: text.slice(valueStart, end), valueStart });
    at = end;
  }
  return fields;
}

// The value of the one field with this tag; null when it is missing or repeated.
function onlyValue(fields: readonly Field[], tag: string): string | null {
  const found = fields.filter((field) => field.tag === tag);
  return found.length === 1 ? found[0].value : null;
}

function matches(value: string | null, pattern: RegExp): value is string {
  return value !== null && pattern.test(value);
}

function slipFromRoot(root: string): SlipQr | null {
  const fields = readFields(root, false);
  if (fields === null) return null;
  const apiId = onlyValue(fields, '00');
  const bankCode = onlyValue(fields, '01');
  const reference = onlyValue(fields, '02');
  if (apiId !== SLIP_QR_API_ID || !matches(bankCode, BANK_CODE) || !matches(reference, REFERENCE)) return null;
  return { bankCode, reference };
}

/** The sending bank and reference of a Thai bank slip QR; null for anything else. */
export function parseSlipQr(payload: string): SlipQr | null {
  const text = payload.trim();
  if (!SLIP_QR_TEXT.test(text)) return null;
  const fields = readFields(text, true);
  if (fields === null) return null;
  const crcField = fields[fields.length - 1];
  if (crcField.tag !== '91' || crcField.length !== '04') return null;
  let root: string | null = null;
  for (const field of fields) {
    if (field.tag === '00') {
      if (root !== null) return null; // exactly one root
      root = field.value;
    } else if (field.tag === '51' && field.value !== 'TH') {
      return null;
    } else if (field.tag === '91' && field !== crcField) {
      return null; // 91 comes last
    }
  }
  if (root === null) return null;
  const expected = crc16CcittFalse(text.slice(0, crcField.valueStart)).toString(16).padStart(4, '0');
  if (crcField.value.padStart(4, '0').toLowerCase() !== expected) return null;
  return slipFromRoot(root);
}
