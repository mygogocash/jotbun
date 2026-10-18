// Release preflight for the readiness receipts (P6b review, M2). The API's
// `/ready` reports a missing, failed or expired receipt, but the platform's
// deploy health check is `/live`, so a pause or rollback deploy can go live
// during a database incident or after a receipt lapses. Mandatory receipts
// are therefore enforced here, before every release (docs/operations/
// release.md, "Preflight"), with the API's own rules
// (apps/api/src/health/readiness-receipts.ts, loaded through Node's type
// stripping):
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/ops/readiness-receipts.mjs \
//        [--min-valid-days 7] < receipts.json
//
// Reads the READINESS_RECEIPTS JSON on stdin and prints one line per
// receipt (`receipts: <kind>=<state> valid_hours=<h>`). Exit 0 when every
// mandatory receipt is passed and stays valid for at least --min-valid-days
// (1-30, default 7: the release window and the API's expiry warning); 1
// otherwise, with `receipts: alert preflight …` on stderr; 2 when the input
// is not a receipts object. Evidence digests are never printed.
import { pathToFileURL } from 'node:url';

import { MANDATORY_RECEIPTS, RECEIPT_EXPIRY_WARNING_DAYS, isReceiptKind, receiptPreflight } from '../../apps/api/src/health/readiness-receipts.ts';

/** Checks receipts JSON text at `now`; returns the lines to print and the exit code. */
export function preflight(text, { now = new Date(), minValidDays = RECEIPT_EXPIRY_WARNING_DAYS } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.keys(parsed).every(isReceiptKind)) {
    return { exitCode: 2, info: [], alert: 'receipts: alert preflight reason=malformed' };
  }
  const result = receiptPreflight(parsed, now, minValidDays);
  const info = MANDATORY_RECEIPTS.map((kind) => {
    const { state, valid_hours: hours } = result.receipts[kind];
    return `receipts: ${kind}=${state} valid_hours=${hours === null ? 'none' : hours}`;
  });
  if (result.ok) return { exitCode: 0, info: [...info, `receipts: preflight ok min_valid_days=${minValidDays}`], alert: null };
  const failing = MANDATORY_RECEIPTS.filter((kind) => result.receipts[kind].state !== 'passed' || (result.receipts[kind].valid_hours ?? 0) < minValidDays * 24);
  return { exitCode: 1, info, alert: `receipts: alert preflight failing=${failing.join(',')} min_valid_days=${minValidDays}` };
}

function minValidDaysFrom(argv) {
  if (argv.length === 0) return RECEIPT_EXPIRY_WARNING_DAYS;
  if (argv.length !== 2 || argv[0] !== '--min-valid-days' || !/^\d{1,2}$/.test(argv[1])) return null;
  const days = Number(argv[1]);
  return days >= 1 && days <= 30 ? days : null;
}

async function main() {
  const minValidDays = minValidDaysFrom(process.argv.slice(2));
  if (minValidDays === null) {
    process.stderr.write('receipts: usage: readiness-receipts.mjs [--min-valid-days 1-30] < receipts.json\n');
    process.exitCode = 2;
    return;
  }
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const outcome = preflight(text, { minValidDays });
  for (const line of outcome.info) process.stdout.write(`${line}\n`);
  if (outcome.alert) process.stderr.write(`${outcome.alert}\n`);
  process.exitCode = outcome.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
