/** EMVCo merchant QR (PromptPay slips). Tag 54 = amount, tag 59 = name. */

export function parseEmvQr(payload: string): {
  amount_minor: number | null;
  merchant: string;
} {
  const tags = parseTlv(payload.trim());
  const nested = tags.get('62');
  if (nested) {
    const inner = parseTlv(nested);
    for (const [key, value] of inner) {
      if (!tags.has(key)) tags.set(key, value);
    }
  }
  const amountRaw = tags.get('54');
  let amount_minor: number | null = null;
  if (amountRaw) {
    const n = Number(amountRaw.replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) {
      amount_minor = Math.round(n * 100);
    }
  }
  return {
    amount_minor,
    merchant: (tags.get('59') ?? '').trim(),
  };
}

function parseTlv(input: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i + 4 <= input.length) {
    const tag = input.slice(i, i + 2);
    const len = Number(input.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || len < 0) break;
    const value = input.slice(i + 4, i + 4 + len);
    if (value.length < len) break;
    map.set(tag, value);
    i += 4 + len;
  }
  return map;
}
