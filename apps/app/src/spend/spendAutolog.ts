export type SpendAutologCandidate = {
  amount_minor: number;
  type: "income";
  occurred_on: string;
  category: "Cashback";
  merchant: string;
  note: string;
  external_ref: string;
  source: "autolog";
};

const APPROVED_STATUSES = new Set(["approved", "paid", "completed"]);

/**
 * P1 autolog contract (#2121): income-only on approved cashback.
 * Never pending. Never GMV `sale_amount` as an expense.
 */
export function planSpendAutologFromListCheck(
  payload: unknown,
): SpendAutologCandidate[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const conversions = (payload as { allConversions?: unknown }).allConversions;
  if (!Array.isArray(conversions)) return [];

  const rows: SpendAutologCandidate[] = [];
  for (const raw of conversions) {
    const candidate = candidateFromConversion(raw);
    if (candidate) rows.push(candidate);
  }
  return rows;
}

function candidateFromConversion(raw: unknown): SpendAutologCandidate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const status = stringify(row.conversion_status).trim().toLowerCase();
  if (!APPROVED_STATUSES.has(status)) return null;

  const currency = (stringify(row.currency).trim() || "THB").toUpperCase();
  if (currency !== "THB") return null;

  const amountMinor = cashbackSatang(
    row.payoutNew ?? row.payout ?? row.base_payout,
  );
  if (amountMinor == null) return null;

  const occurredOn = spendOccurredOn(row.datetime_conversion ?? row.createdAt);
  const conversionId =
    stringify(row.conversion_id) ||
    stringify(row._id) ||
    `${occurredOn}-${amountMinor}`;
  const merchant = (
    stringify(row.offer_name_display) ||
    stringify(row.offer_name) ||
    "Cashback"
  ).slice(0, 120);

  return {
    amount_minor: amountMinor,
    type: "income",
    occurred_on: occurredOn,
    category: "Cashback",
    merchant,
    /*
     * The id goes in its own field, and the note is left empty for the member.
     * It used to be written here as `cashback:<id>`, which printed a database id
     * into their history and left them nowhere to write their own words.
     */
    external_ref: conversionId,
    note: "",
    source: "autolog",
  };
}

function cashbackSatang(value: unknown): number | null {
  let amount = NaN;
  if (typeof value === "number" && Number.isFinite(value)) {
    amount = value;
  } else if (typeof value === "string") {
    amount = Number(value.replace(/,/g, ""));
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const satang = Math.round(amount * 100);
  if (!Number.isInteger(satang) || satang < 1) return null;
  return satang;
}

export function spendOccurredOn(value: unknown): string {
  const ms =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : value instanceof Date
          ? value.getTime()
          : NaN;
  const stamp = Number.isFinite(ms) ? ms : Date.now();
  return new Date(stamp + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
