// Recovery inventory (P6a): every recoverable copy of production data —
// database history (PITR window), branches, manual snapshots, logical backups,
// object backups and restore-created copies — with its expiry. Every copy must
// expire no more than 7 days after it was taken; a copy without an expiry,
// still present past it, or non-production but not synthetic is a violation.
// A source that fails makes the inventory fail: provider errors never become a
// silently shorter list. Hosted sources are pluggable adapters; until E1 they
// are listed as SKIPPED and the report says it is incomplete.
//
//   node scripts/ops/recovery-inventory.mjs --recovery-dir <dir> [--key-fd N]
//   (prints the report; exit 3 while hosted sources are SKIPPED, 1 on a violation)
import { closeSync, existsSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertIsolatedDirectory, LEDGER_FILE, localRecoveryStore } from './backup.mjs';
import { isoDate, OpsError, parseArgs, RETENTION_LIMIT_MS, runCli, silentLog } from './ops-safety.mjs';
import { readRecoveryKeyFromFd } from './recovery-crypto.mjs';

export const COPY_KINDS = Object.freeze(['database_history', 'database_branch', 'manual_snapshot', 'logical_backup', 'object_backup', 'restore_copy']);

/** Hosted copy sources that exist only once E1 authorizes Neon/R2 access. */
export const HOSTED_INVENTORY_SKIPPED = Object.freeze([
  Object.freeze({ source: 'neon-history', reason: 'e1_not_authorized' }),
  Object.freeze({ source: 'neon-branches', reason: 'e1_not_authorized' }),
  Object.freeze({ source: 'neon-snapshots', reason: 'e1_not_authorized' }),
  Object.freeze({ source: 'r2-recovery-objects', reason: 'e1_not_authorized' }),
]);

const COPY_ID = /^[A-Za-z0-9_.-]{1,96}$/;
const SOURCE_NAME = /^[a-z0-9-]{1,40}$/;
const RESTORE_COPY_ID = /^gogospend_restore_[a-z0-9]{8,32}$/;

function sourceName(source) {
  return SOURCE_NAME.test(source?.name ?? '') ? source.name : 'source';
}

/** Returns {copy} or {reason}; reasons name the rule, never the data. */
function checkCopy(entry, source, now) {
  const id = COPY_ID.test(entry?.id ?? '') ? entry.id : null;
  // A source can name something it holds but cannot account for (a stray
  // file, an unverifiable manifest): always a violation.
  if (entry?.unaccounted === 'unaccounted_file' || entry?.unaccounted === 'manifest_unverified') return { id: id ?? 'invalid', reason: entry.unaccounted };
  if (!id || !COPY_KINDS.includes(entry.kind) || !['production', 'non_production'].includes(entry.environment)) return { id: id ?? 'invalid', reason: 'invalid_copy' };
  const createdAt = isoDate(entry.created_at);
  if (!createdAt) return { id, reason: 'invalid_copy' };
  if (entry.expires_at === null || entry.expires_at === undefined) return { id, reason: 'retention_unbounded' };
  const expiresAt = isoDate(entry.expires_at);
  if (!expiresAt) return { id, reason: 'invalid_copy' };
  const created = Date.parse(createdAt);
  const expires = Date.parse(expiresAt);
  if (expires - created > RETENTION_LIMIT_MS) return { id, reason: 'retention_exceeds_7_days' };
  if (expires - now > RETENTION_LIMIT_MS) return { id, reason: 'expiry_beyond_7_days' };
  if (expires <= now) return { id, reason: 'past_expiry' };
  if (entry.environment === 'non_production' && entry.synthetic !== true) return { id, reason: 'non_production_real_data' };
  return { copy: Object.freeze({ id, kind: entry.kind, source, environment: entry.environment, synthetic: entry.synthetic === true, created_at: createdAt, expires_at: expiresAt }) };
}

export class RecoveryInventory {
  #sources;
  #skipped;
  #now;
  #log;

  constructor({ sources = [], skipped = [], now = () => new Date(), log = silentLog } = {}) {
    this.#sources = [...sources];
    this.#skipped = skipped.map(({ source, reason }) => Object.freeze({ source, reason }));
    this.#now = now;
    this.#log = log;
  }

  /** Every listed copy, oldest first. Throws on a failing source or any retention violation. */
  async enumerate() {
    const now = new Date(this.#now()).getTime();
    const copies = [];
    const violations = [];
    for (const source of this.#sources) {
      const name = sourceName(source);
      let listed;
      try {
        listed = await source.list();
        if (!Array.isArray(listed)) throw new Error('not a list');
      } catch {
        this.#log.event('inventory_source_failed', { source: name });
        throw new OpsError('INVENTORY_SOURCE_FAILED', { source: name });
      }
      for (const entry of listed) {
        const checked = checkCopy(entry, name, now);
        if (checked.copy) copies.push(checked.copy);
        else violations.push({ id: checked.id, source: name, reason: checked.reason });
      }
    }
    if (violations.length > 0) {
      this.#log.event('inventory_retention_violation', { count: violations.length });
      throw new OpsError('RETENTION_VIOLATION', { violations });
    }
    return copies.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  }

  async report() {
    const copies = await this.enumerate();
    return {
      generated_at: new Date(this.#now()).toISOString(),
      complete: this.#skipped.length === 0,
      skipped: [...this.#skipped],
      copies,
      latest_expires_at: copies.reduce((latest, copy) => (latest && latest > copy.expires_at ? latest : copy.expires_at), null),
    };
  }

  /**
   * When the last copy that could still hold the marker's account expires, or
   * null while P5 has not recorded the purge as complete (`purged_at`). P5
   * writes the marker first and purges later, so every copy taken up to the
   * purge can hold the account, not just copies older than the marker. A
   * point-in-time history window keeps the pre-purge state restorable until
   * the purge itself leaves the window.
   */
  async markerClearableAt(marker) {
    if (!isoDate(marker?.recorded_at)) throw new OpsError('ERASURE_MARKER_INVALID');
    const purgedAt = isoDate(marker?.purged_at);
    if (!purgedAt) return null;
    const purged = Date.parse(purgedAt);
    const now = new Date(this.#now()).getTime();
    let latest = purged;
    for (const copy of await this.enumerate()) {
      const created = Date.parse(copy.created_at);
      if (created > purged) continue;
      const expires = copy.kind === 'database_history'
        ? Math.min(purged, now) + (Date.parse(copy.expires_at) - created)
        : Date.parse(copy.expires_at);
      latest = Math.max(latest, expires);
    }
    return new Date(latest).toISOString();
  }

  /** Only with a complete inventory (no SKIPPED source), a recorded purge, and after markerClearableAt. */
  async canClearMarker(marker) {
    if (this.#skipped.length > 0) return false;
    const clearableAt = await this.markerClearableAt(marker);
    return clearableAt !== null && new Date(this.#now()).toISOString() >= clearableAt;
  }
}

export function staticSource(name, copies) {
  return { name, async list() { return copies; } };
}

function strayId(name) {
  const id = name.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 96);
  return id.length > 0 ? id : 'stray';
}

/**
 * Local recovery store: each backup set is a logical backup plus an object
 * backup, dated by the store's retention dates (not the manifest's claims).
 * With the key, a manifest that fails its MAC is a violation. A partial write
 * is a copy bounded by its 24-hour cleanup; any other stray is a violation.
 */
export function recoveryStoreSource(store) {
  return {
    name: 'recovery-store',
    async list() {
      const copies = [];
      for (const set of await store.sets()) {
        const common = { environment: set.environment, synthetic: set.synthetic, created_at: set.created_at, expires_at: set.expires_at };
        const unaccounted = set.verified === false ? { unaccounted: 'manifest_unverified' } : {};
        copies.push({ id: set.id, kind: 'logical_backup', ...common, ...unaccounted }, { id: `${set.id}.objects`, kind: 'object_backup', ...common, ...unaccounted });
      }
      for (const stray of await store.strays()) {
        const modified = Date.parse(stray.modified_at);
        copies.push(stray.kind === 'partial'
          ? { id: strayId(stray.name), kind: 'logical_backup', environment: 'production', synthetic: false, created_at: stray.modified_at, expires_at: new Date(modified + 24 * 3_600_000).toISOString() }
          : { id: strayId(stray.name), unaccounted: 'unaccounted_file' });
      }
      return copies;
    },
  };
}

/** Restore-created copies that still exist. */
export function restoreLedgerSource(ledger) {
  return {
    name: 'restore-ledger',
    async list() {
      return (await ledger.entries()).filter((entry) => entry.status === 'active').map(({ id, created_at, expires_at, environment, synthetic }) => ({ id, kind: 'restore_copy', created_at, expires_at, environment, synthetic }));
    },
  };
}

/**
 * Records every database a restore creates, with an expiry of at most 7 days,
 * in the isolated recovery directory (0600 `restore-copies.json`).
 */
export function localRestoreLedger({ dir }) {
  const root = assertIsolatedDirectory(dir);
  const path = join(root, LEDGER_FILE);
  const read = () => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []);
  const write = (entries) => {
    const temp = `${path}.partial`;
    const fd = openSync(temp, 'w', 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(entries, null, 2)}\n`);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  };
  return {
    async entries() {
      return read();
    },
    async record({ id, created_at, expires_at, environment, synthetic }) {
      const created = isoDate(created_at);
      const expires = isoDate(expires_at);
      if (!RESTORE_COPY_ID.test(id ?? '') || !created || !expires || !['production', 'non_production'].includes(environment)) throw new OpsError('ARGUMENT_REFUSED');
      if (Date.parse(expires) - Date.parse(created) > RETENTION_LIMIT_MS || Date.parse(expires) <= Date.parse(created)) throw new OpsError('RETENTION_EXCEEDS_LIMIT');
      const cutoff = Date.parse(created) - RETENTION_LIMIT_MS;
      const kept = read().filter((entry) => entry.status === 'active' || Date.parse(entry.dropped_at) > cutoff);
      if (kept.some((entry) => entry.id === id && entry.status === 'active')) throw new OpsError('RESTORE_TARGET_EXISTS');
      write([...kept, { id, created_at: created, expires_at: expires, environment, synthetic: synthetic === true, status: 'active' }]);
    },
    async markDropped(id, at = new Date()) {
      write(read().map((entry) => (entry.id === id && entry.status === 'active' ? { ...entry, status: 'dropped', dropped_at: new Date(at).toISOString() } : entry)));
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { 'recovery-dir': /^\/[A-Za-z0-9._/-]{1,512}$/, 'key-fd': /^([3-9]|[1-9][0-9])$/ });
  if (!args['recovery-dir']) throw new OpsError('ARGUMENT_REFUSED');
  const dir = args['recovery-dir'];
  // With --key-fd every manifest's MAC is checked as well.
  const key = args['key-fd'] === undefined ? undefined : readRecoveryKeyFromFd(Number(args['key-fd']));
  const inventory = new RecoveryInventory({
    sources: [recoveryStoreSource(localRecoveryStore({ dir, key })), restoreLedgerSource(localRestoreLedger({ dir }))],
    skipped: HOSTED_INVENTORY_SKIPPED,
  });
  const report = await inventory.report();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.complete) process.exitCode = 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli(main);
