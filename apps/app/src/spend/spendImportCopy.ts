/** English copy keyed for overlay reverse-lookup. */
export function spendImportUserMessage(errorCode?: string | null): string {
  switch (errorCode) {
    case "TOO_LARGE":
      return "That file is over 12 MB. Split the export into 12-month chunks.";
    case "IN_FLIGHT":
      return "An import is already running. Wait a moment, then try again.";
    case "PERSIST_FAILED":
      return "Import failed on our side. Try the same file again.";
    case "BAD_DATE":
    case "BAD_AMOUNT":
    case "GOLDEN_SUM_MISMATCH":
    case "EMPTY":
      return "That file could not be read. Export again from MeowJot, Spendee, or Money Lover.";
    case "NOT_A_SLIP":
      return "That is not a slip photo. Take a picture of the slip.";
    case "SLIP_NO_QR":
      return "No PromptPay QR on that photo. Try a clearer slip.";
    case "SLIP_OCR_EMPTY":
      return "We could not read an amount from that slip photo. Try a clearer picture.";
    case "XLS_UNREADABLE":
      return "That spreadsheet could not be read. Export XLSX or CSV.";
    case "BANK_LINK_UNAVAILABLE":
      return "Bank Open API is not configured. Upload a CSV instead — we never ask for a bank login.";
    case "UNKNOWN_MAPPER":
    default:
      return "Import failed. Check it is a MeowJot, Spendee, or Money Lover file.";
  }
}

export const SPEND_IMPORT_STILL_RUNNING =
  "Import is still running. Stay here, or come back in a minute.";

/**
 * What the member is told when an import lands.
 *
 * The parser skips rows it cannot read rather than refusing the file, so a
 * finished import can be partial. Saying only "up to date" over a partial
 * import would hide rows the member believes they brought across, so the
 * count is stated whenever anything was dropped.
 */
export function spendImportSuccessCopy(
  rowOk: number,
  rowReject: number,
): { text: string; values?: Record<string, string | number> } {
  if (rowReject <= 0) {
    return { text: "Import finished. Your numbers are up to date." };
  }
  /*
   * The counts travel as values against a fixed English sentence rather than
   * being baked into a template literal. `translateCopy` keys its lookup on the
   * English text, so an interpolated string can never match the catalogue and
   * would silently ship untranslated — the trap called out in messages.ts.
   */
  if (rowReject === 1) {
    return {
      text: "Import finished. {ok} rows added, 1 skipped because we could not read it.",
      values: { ok: rowOk },
    };
  }
  return {
    text: "Import finished. {ok} rows added, {skipped} skipped because we could not read them.",
    values: { ok: rowOk, skipped: rowReject },
  };
}
