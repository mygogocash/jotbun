// Restore rehearsal (P6a): restoreRehearsal(input) → RestoreReceipt.
//
// Before touching any backup or database it refuses a serving, production or
// non-isolated target, a missing restore-copy ledger, missing recovery-key
// custody, and a missing, dependent, unreadable or wrongly keyed erasure
// registry. It then selects an authenticated, unexpired backup, records the
// restore-created copy (≤7-day expiry) in the inventory ledger, creates a
// fresh private target, streams the decrypted dump into it, reapplies every
// erasure marker, proves no row of an erased account remains, and checks that
// every retained attachment reference resolves in the recovery object copy.
// It never switches traffic: the receipt says whether a switch would be safe.
// The target is dropped afterwards (and always on failure).
//
//   node scripts/ops/restore-rehearsal.mjs --target local-isolated-synthetic [--key-fd N]
//   node scripts/ops/restore-rehearsal.mjs --target isolated-synthetic   → SKIPPED (E1)
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { effectiveDates, readAttachmentBundle } from './backup.mjs';
import { loadErasureMarkers, planErasure } from './erasure-markers.mjs';
import { asOpsError, createOpsLog, isLoopbackAddress, isLoopbackHost, OpsError, parseArgs, RETENTION_LIMIT_MS, runCli, silentLog } from './ops-safety.mjs';
import { decryptStream, RecoveryKey, verifyManifestMac } from './recovery-crypto.mjs';

export const SERVING_DATABASES = Object.freeze(['gogospend_v1', 'postgres', 'template0', 'template1', 'neondb']);
const RESTORE_DATABASE = /^gogospend_restore_[a-z0-9]{8,32}$/;
const ADAPTER_KINDS = Object.freeze(['local-docker', 'memory']);
const LABEL = /^[A-Za-z0-9_.-]{1,64}$/;
const DEFAULT_RESTORE_COPY_TTL_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * A rehearsal target must say it is not serving, isolated and non-production,
 * be a loopback adapter this file knows, and name a fresh disposable
 * `gogospend_restore_*` database. Hosted targets wait for E1. These declared
 * fields are only the first gate: restoreRehearsal also checks the endpoint the
 * adapter really connects to, the adapter refuses an existing database, and
 * the new database admits no login but the rehearsal's own (local adapter).
 */
export function assertRestoreTarget(target) {
  if (!target || typeof target !== 'object') throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
  if (target.kind === 'hosted') throw new OpsError('HOSTED_ADAPTER_NOT_AUTHORIZED');
  if (target.environment === 'production') throw new OpsError('RESTORE_TARGET_PRODUCTION');
  if (target.serving !== false || SERVING_DATABASES.includes(target.database)) throw new OpsError('RESTORE_TARGET_SERVING');
  if (target.isolated !== true || !['rehearsal', 'non_production'].includes(target.environment) || !ADAPTER_KINDS.includes(target.kind)
    || !isLoopbackHost(target.host) || typeof target.database !== 'string' || !RESTORE_DATABASE.test(target.database)) {
    throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
  }
}

/** Why a manifest cannot be restored, or null when it can. */
function backupProblem(manifest, key, now) {
  if (manifest.key_id !== key.id) return 'RECOVERY_KEY_MISMATCH';
  if (!verifyManifestMac(key, manifest)) return 'BACKUP_INTEGRITY';
  const dates = effectiveDates(manifest, { verified: true });
  if (!dates || Date.parse(manifest.expires_at) - Date.parse(manifest.created_at) > RETENTION_LIMIT_MS) return 'BACKUP_INTEGRITY';
  // A key holder's clock error or a planted future date: never "newest".
  if (Date.parse(manifest.created_at) > now.getTime() + CLOCK_SKEW_MS) return 'BACKUP_INTEGRITY';
  if (!(now.getTime() < Date.parse(dates.expires_at))) return 'BACKUP_EXPIRED';
  return null;
}

/**
 * The named backup, or with `latest` the newest one that verifies: a planted,
 * unverifiable or future-dated manifest is skipped rather than blocking every
 * restore. If none qualifies the most telling reason is reported.
 */
async function selectBackup(store, backupId, key, now) {
  const candidates = backupId === 'latest' ? [...(await store.list())].reverse() : [await store.get(backupId)].filter(Boolean);
  if (candidates.length === 0) throw new OpsError('BACKUP_MISSING');
  const problems = new Set();
  for (const manifest of candidates) {
    const problem = backupProblem(manifest, key, now);
    if (!problem) return manifest;
    problems.add(problem);
  }
  throw new OpsError(['RECOVERY_KEY_MISMATCH', 'BACKUP_INTEGRITY', 'BACKUP_EXPIRED'].find((code) => problems.has(code)) ?? 'BACKUP_MISSING');
}

/** Real data (production, or not marked synthetic) never goes into a non-production target. */
function assertDataClass(manifest, target) {
  const real = manifest.environment !== 'non_production' || manifest.synthetic !== true;
  if (real && target.environment !== 'production') throw new OpsError('RESTORE_DATA_CLASS_MISMATCH');
}

/** The host the adapter will really connect to must be a loopback address. */
function assertRestorerEndpoint(restorer) {
  let endpoint;
  try {
    endpoint = restorer.endpoint();
  } catch {
    throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
  }
  if (!isLoopbackAddress(endpoint?.host)) throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
}

/** Decrypted part; a store or authentication failure ends the stream with an OpsError. */
function openDecrypted(store, manifest, part, key) {
  const source = store.openPart(manifest, part);
  const decrypt = decryptStream(key);
  const state = { failure: null, decrypt };
  const fail = (error) => {
    state.failure ??= asOpsError(error, 'BACKUP_INTEGRITY');
  };
  source.on('error', (error) => {
    fail(error);
    decrypt.destroy(state.failure);
  });
  // An authentication failure stops reading and closes the backup file.
  decrypt.on('error', (error) => {
    fail(error);
    source.destroy();
  });
  source.pipe(decrypt);
  return state;
}

async function phase(fallback, fn) {
  try {
    return await fn();
  } catch (error) {
    throw asOpsError(error, fallback);
  }
}

export async function restoreRehearsal(input = {}) {
  const {
    target, restorer, store, backupId = 'latest', recoveryKey, markers, ledger, now: nowInput = new Date(),
    log = silentLog, restoreCopyTtlMs = DEFAULT_RESTORE_COPY_TTL_MS, extraChecks,
  } = input;
  const startedAt = performance.now();
  const now = new Date(nowInput);
  assertRestoreTarget(target);
  if (!restorer || restorer.kind !== target.kind || typeof restorer.endpoint !== 'function') throw new OpsError('RESTORE_TARGET_NOT_ISOLATED');
  assertRestorerEndpoint(restorer);
  if (!(recoveryKey instanceof RecoveryKey)) throw new OpsError('RECOVERY_KEY_CUSTODY_MISSING');
  if (!ledger || typeof ledger.record !== 'function' || typeof ledger.markDropped !== 'function') throw new OpsError('RESTORE_LEDGER_MISSING');
  if (!(restoreCopyTtlMs > 0 && restoreCopyTtlMs <= RETENTION_LIMIT_MS)) throw new OpsError('RETENTION_EXCEEDS_LIMIT');
  const registry = await loadErasureMarkers(markers);
  if (!store) throw new OpsError('BACKUP_MISSING');
  const manifest = await selectBackup(store, backupId, recoveryKey, now);
  assertDataClass(manifest, target);

  const rehearsalId = `rh_${randomBytes(4).toString('hex')}`;
  log.event('restore_started', { rehearsal_id: rehearsalId, backup_id: manifest.id, markers: registry.markers.length });
  await ledger.record({
    id: target.database, created_at: now.toISOString(), expires_at: new Date(now.getTime() + restoreCopyTtlMs).toISOString(),
    environment: manifest.environment === 'production' ? 'production' : 'non_production', synthetic: manifest.synthetic === true,
  });

  let failure = null;
  let created = false;
  let receipt;
  try {
    await phase('RESTORE_FAILED', () => restorer.create(target));
    created = true;
    const restoreStart = performance.now();
    await phase('RESTORE_FAILED', async () => {
      const dump = openDecrypted(store, manifest, 'db', recoveryKey);
      try {
        await restorer.restore(target, dump.decrypt);
      } catch (error) {
        throw dump.failure ?? asOpsError(error, 'RESTORE_FAILED');
      }
      if (dump.failure) throw dump.failure;
      if (!dump.decrypt.readableEnded) throw new OpsError('RESTORE_FAILED');
    });

    const erasureStart = performance.now();
    const plan = await phase('ERASURE_NOT_APPLIED', async () => {
      const identities = await restorer.identities(target);
      const markerAccounts = [...new Set(registry.markers.map((marker) => marker.account_id))];
      const existing = await restorer.existingAccounts(target, markerAccounts);
      // Deletions the copy holds as accepted but not purged: their marker may
      // not exist yet (written by P5's worker after the acceptance).
      const requested = typeof restorer.openDeletions === 'function' ? await restorer.openDeletions(target) : [];
      return planErasure(identities, registry.markers, registry.lookupKey, existing, now, requested);
    });
    const erasure = { accountIds: plan.accountIds, principalDigests: plan.principalDigests, blocks: plan.blocks, reapply: plan.reapply };
    const erased = await phase('ERASURE_NOT_APPLIED', () => restorer.applyErasure(target, erasure));
    const remaining = await phase('ERASURE_NOT_APPLIED', () => restorer.ownerRows(target, erasure));
    if (remaining.length > 0) throw new OpsError('ERASURE_NOT_APPLIED', { tables: remaining.map((entry) => entry.table) });

    const validationStart = performance.now();
    const references = await phase('ATTACHMENT_REFERENCES_MISSING', () => restorer.attachmentReferences(target));
    const objects = await phase('BACKUP_INTEGRITY', () => readAttachmentBundle(openDecrypted(store, manifest, 'objects', recoveryKey).decrypt));
    const checked = references ?? [];
    const missing = checked.filter((reference) => !objects.has(reference.ref) || (reference.sha256 && objects.get(reference.ref).sha256 !== reference.sha256));
    if (missing.length > 0) throw new OpsError('ATTACHMENT_REFERENCES_MISSING', { missing: missing.length });
    const referenced = new Set(checked.map((reference) => reference.ref));
    const checks = extraChecks ? await phase('REHEARSAL_CHECK_FAILED', () => extraChecks(target)) : undefined;
    const finished = performance.now();

    receipt = {
      receipt: 'gogospend-restore-rehearsal-v1',
      rehearsal_id: rehearsalId,
      target: { label: LABEL.test(target.label ?? '') ? target.label : '[redacted]', kind: target.kind, isolated: true, serving: false },
      backup: {
        id: manifest.id, created_at: manifest.created_at, expires_at: manifest.expires_at, key_id: manifest.key_id,
        environment: manifest.environment, synthetic: manifest.synthetic === true,
        age_seconds_at_restore: Math.round((now.getTime() - Date.parse(manifest.created_at)) / 1000),
      },
      markers: { total: registry.markers.length, applied: plan.applied, not_present: plan.notPresent },
      accounts_erased: plan.accountsErased,
      erasures_requeued: erased?.requeued ?? 0,
      principals_blocked: erased?.principalsBlocked ?? 0,
      erased_owner_rows: remaining,
      missing_retained_objects: missing.map((reference) => reference.ref),
      attachments: {
        references_checked: checked.length,
        objects_in_copy: objects.size,
        unreferenced_objects_not_restored: [...objects.keys()].filter((ref) => !referenced.has(ref)).length,
        schema_has_references: references !== null,
      },
      ...(checks ? { checks } : {}),
      ready_for_serving_switch: true,
      serving_switch: 'not_performed',
      timings_ms: {
        restore: Math.round(erasureStart - restoreStart),
        erasure: Math.round(validationStart - erasureStart),
        validation: Math.round(finished - validationStart),
        total: Math.round(finished - startedAt),
      },
    };
  } catch (error) {
    failure = asOpsError(error, 'RESTORE_FAILED');
    log.event('restore_failed', { rehearsal_id: rehearsalId, code: failure.code });
  }

  let dropped = false;
  try {
    // Only a target this run created is dropped; an existing one is never touched.
    if (created) await restorer.drop(target);
    await ledger.markDropped(target.database, new Date());
    dropped = true;
  } catch {
    log.event('restore_drop_failed', { rehearsal_id: rehearsalId });
  }
  if (failure) throw failure;
  receipt.target_dropped = dropped;
  log.event('restore_rehearsed', { rehearsal_id: rehearsalId, accounts_erased: receipt.accounts_erased, total_ms: receipt.timings_ms.total });
  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    target: /^(local-isolated-synthetic|isolated-synthetic)$/,
    'key-fd': /^([3-9]|[1-9][0-9])$/,
  });
  if (args.target === 'isolated-synthetic') throw new OpsError('HOSTED_ADAPTER_NOT_AUTHORIZED');
  if (args.target !== 'local-isolated-synthetic') throw new OpsError('ARGUMENT_REFUSED');
  const { runLocalSyntheticRehearsal } = await import('./local-postgres.mjs');
  const result = await runLocalSyntheticRehearsal({ restoreRehearsal, keyFd: args['key-fd'] === undefined ? undefined : Number(args['key-fd']), log: createOpsLog() });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli(main);
