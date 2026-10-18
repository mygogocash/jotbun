// P6b backup-age alert. The API and workers hold no recovery authority, so
// the backup age is measured from the recovery inventory, by the same
// operator/cron role that runs backups (docs/operations/release.md):
//
//   node scripts/ops/recovery-inventory.mjs --recovery-dir <dir> --key-fd 3 3<… | node scripts/ops/backup-age.mjs
//
// Reads an inventory report (JSON) on stdin and prints one line:
//   recovery: backup_age_hours=<h> threshold_hours=26 inventory_complete=<bool>
// and, when the newest verified, complete daily logical backup is older than
// 26 hours, or there is none, `recovery: alert backup_age …` on stderr with
// exit 1. Only `logical_backup` copies the inventory verified count (the
// recovery key checked their manifest, so run the inventory with --key-fd):
// a `partial_backup` left by a crashed backup, or a set nobody could verify,
// never resets the age (P6b review). Reasons: `too_old`, `no_backup`, and
// `unverified` (logical backups exist but none was verified). Copy ids, keys
// and locations are never printed.
import { pathToFileURL } from 'node:url';

export const BACKUP_AGE_ALERT_HOURS = 26;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Age of the newest verified, complete logical backup in an inventory report, and whether it alerts. */
export function backupAge(report, now = new Date(), thresholdHours = BACKUP_AGE_ALERT_HOURS) {
  const copies = Array.isArray(report?.copies) ? report.copies : [];
  const logical = copies.filter((copy) => copy?.kind === 'logical_backup' && ISO.test(String(copy.created_at)));
  const created = logical
    .filter((copy) => copy.verified === true)
    .map((copy) => Date.parse(copy.created_at))
    .filter((time) => Number.isFinite(time) && time <= now.getTime() + 5 * 60_000);
  const complete = report?.complete === true;
  if (created.length === 0) {
    return { age_hours: null, threshold_hours: thresholdHours, inventory_complete: complete, alert: true, reason: logical.length > 0 ? 'unverified' : 'no_backup' };
  }
  const ageHours = Math.max(0, (now.getTime() - Math.max(...created)) / 3_600_000);
  const rounded = Math.round(ageHours * 10) / 10;
  return { age_hours: rounded, threshold_hours: thresholdHours, inventory_complete: complete, alert: ageHours > thresholdHours, reason: ageHours > thresholdHours ? 'too_old' : null };
}

export function backupAgeLines(result) {
  const age = result.age_hours === null ? 'none' : String(result.age_hours);
  return {
    info: `recovery: backup_age_hours=${age} threshold_hours=${result.threshold_hours} inventory_complete=${result.inventory_complete}`,
    alert: result.alert ? `recovery: alert backup_age reason=${result.reason} backup_age_hours=${age} threshold_hours=${result.threshold_hours}` : null,
  };
}

async function main() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    report = null;
  }
  const lines = backupAgeLines(backupAge(report));
  process.stdout.write(`${lines.info}\n`);
  if (lines.alert) {
    process.stderr.write(`${lines.alert}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
