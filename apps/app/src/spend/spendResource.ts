import { getSharedMobileApiClient } from "@mobile/api/sharedClient";
import { getMobileEnv } from "@mobile/config/env";
import { ApiError } from "@mobile/api/client";

export type SpendTxType = "expense" | "income" | "transfer";

export type SpendSummary = {
  month: string;
  expense_minor: number;
  income_minor: number;
  /** Money out, split by category. */
  pie: Array<{ category: string; amount_minor: number }>;
  /**
   * Money in, split the same way, for when the card is filtered to Money in.
   *
   * Optional because a server that has not shipped this yet returns a summary
   * without it, and a card that draws an empty ring beats one that throws.
   */
  pie_in?: Array<{ category: string; amount_minor: number }>;
  tx_count: number;
  successful_import_count: number;
  /**
   * Approved cashback GoGoCash mirrored into the diary this month, in satang.
   * A slice of `income_minor`, not a second total beside it.
   *
   * Optional because a server that has not shipped this yet returns a summary
   * without it, and a card that leaves the line out beats one that throws.
   */
  cashback_minor?: number;
  /**
   * How many of the month's purchases were at a brand that pays cashback.
   *
   * A count, never an amount. The offer match carries `{ href, offer_name }`
   * and no rate at all, so there is no baht figure to be had — see
   * `matchMissedCashback` in the API.
   */
  missed_offer_count?: number;
};

/** One row of the summary card's month dropdown. */
export type SpendMonthRow = {
  /** `YYYY-MM`. */
  month: string;
  expense_minor: number;
  income_minor: number;
};

export type SpendTxRow = {
  id: string;
  occurred_on: string;
  type: SpendTxType;
  amount_minor: number;
  category: string;
  /**
   * Which of the member's wallets this came out of — "Cash" unless they have
   * said otherwise, which is what `addTx` upserts.
   *
   * Optional because a server that has not shipped this yet returns rows
   * without it; treat a missing value as Cash rather than as no wallet.
   */
  wallet?: string;
  merchant?: string;
  note?: string;
  /**
   * The provider's own id for a row GoGoCash filled in — the cashback
   * conversion id support asks a member to quote. Empty on anything they typed.
   */
  external_ref?: string;
  source: string;
  tags?: string[];
  compare?: boolean;
  missed_cashback?: { href: string; offer_name: string };
};

export type SpendImportJob = {
  job_id: string;
  status: string;
  mapper?: string | null;
  error_code?: string | null;
  row_ok?: number;
  /** Source rows the parser could not read. The rest still imported. */
  row_reject?: number;
  parsed_sum_minor?: number;
  duplicate?: boolean;
};

async function requireSpendClient() {
  const client = await getSharedMobileApiClient(getMobileEnv().apiUrl);
  if (!client) {
    throw new Error("No mobile session store is available.");
  }
  return client;
}

export async function fetchSpendSummary(month?: string): Promise<SpendSummary> {
  const client = await requireSpendClient();
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  const payload = await client.get<SpendSummary>(`/spend/summary${query}`);
  const successfulImportCount = Number(payload?.successful_import_count);
  return {
    ...payload,
    successful_import_count: Number.isFinite(successfulImportCount)
      ? successfulImportCount
      : 0,
  };
}

/**
 * Every month the member has a record in, newest first.
 *
 * The dropdown cannot be worked out from the summary alone: that answers one
 * month at a time, and walking backwards until a month comes back empty would
 * stop at the first month someone happened to skip.
 */
export async function fetchSpendMonths(): Promise<SpendMonthRow[]> {
  const client = await requireSpendClient();
  return client.get<SpendMonthRow[]>("/spend/months");
}

export async function fetchSpendTxs(month?: string): Promise<SpendTxRow[]> {
  const client = await requireSpendClient();
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  return client.get<SpendTxRow[]>(`/spend/txs${query}`);
}

/** The member's own categories, with whatever mark and colour they chose. */
export type SpendCategoryRow = {
  name: string;
  type: string;
  emoji?: string;
  hue?: string;
};

export async function fetchSpendCategories(): Promise<SpendCategoryRow[]> {
  const client = await requireSpendClient();
  return client.get<SpendCategoryRow[]>("/spend/categories");
}

export async function createSpendCategory(input: {
  name: string;
  type: "expense" | "income";
  emoji?: string;
  hue?: string;
}): Promise<SpendCategoryRow> {
  const client = await requireSpendClient();
  return client.post<SpendCategoryRow>("/spend/categories", input);
}

export async function enqueueSpendImport(
  file: Blob,
  filename: string,
): Promise<SpendImportJob> {
  const client = await requireSpendClient();
  const form = new FormData();
  form.append("file", file, filename);
  return client.postFormData<SpendImportJob>("/spend/imports", form);
}

/** What `POST /spend/slips/read` hands back. No `type`: see the endpoint. */
export type SpendSlipRead = {
  amount_minor: number;
  occurred_on: string;
  merchant: string;
  source: "slip_qr" | "slip_ocr";
};

/**
 * Read a slip WITHOUT saving it, so the panel can be filled in and the member
 * can confirm money out vs money in before anything is written.
 */
export async function readSpendSlip(
  file: Blob,
  filename: string,
): Promise<SpendSlipRead> {
  const client = await requireSpendClient();
  const form = new FormData();
  form.append("file", file, filename);
  return client.postFormData<SpendSlipRead>("/spend/slips/read", form);
}

export async function fetchSpendImportJob(
  jobId: string,
): Promise<SpendImportJob> {
  const client = await requireSpendClient();
  return client.get<SpendImportJob>(
    `/spend/imports/${encodeURIComponent(jobId)}`,
  );
}

export async function addSpendTx(body: {
  amount_minor: number;
  type: SpendTxType;
  occurred_on: string;
  category: string;
  note?: string;
  merchant?: string;
  external_ref?: string;
  source?: "manual" | "autolog";
}): Promise<{ id: string; duplicate?: boolean }> {
  const client = await requireSpendClient();
  return client.post<{ id: string; duplicate?: boolean }>("/spend/txs", body);
}

/**
 * Correct a row. Only the fields passed are touched; the API refuses an amount
 * or date on a row GoGoCash or the bank filled in (`SPEND_AMOUNT_LOCKED`).
 */
export async function updateSpendTx(
  txId: string,
  patch: {
    amount_minor?: number;
    occurred_on?: string;
    category?: string;
    note?: string;
  },
): Promise<{ id: string }> {
  const client = await requireSpendClient();
  return client.patch<{ id: string }>(
    `/spend/txs/${encodeURIComponent(txId)}`,
    patch,
  );
}

export async function deleteSpendTx(txId: string): Promise<{ id: string }> {
  const client = await requireSpendClient();
  return client.delete<{ id: string }>(
    `/spend/txs/${encodeURIComponent(txId)}`,
  );
}

export type SpendBankLinkStatus = {
  available: boolean;
  link_status?: "none" | "pending" | "active";
  provider_code?: string | null;
};

export async function fetchSpendBankLinkStatus(): Promise<SpendBankLinkStatus> {
  const client = await requireSpendClient();
  return client.get<SpendBankLinkStatus>("/spend/bank-link");
}

export async function startSpendBankLink(): Promise<{
  connect_url: string;
  expires_at?: string;
}> {
  const client = await requireSpendClient();
  return client.post<{ connect_url: string; expires_at?: string }>(
    "/spend/bank-link/connect",
    {},
  );
}

export async function autologCashbackPurchases(): Promise<{
  added: number;
  skipped: number;
}> {
  throw new ApiError(
    'Cashback history sync is not connected to this standalone app yet.',
    503,
    'CASHBACK_SYNC_UNAVAILABLE',
  );
}
