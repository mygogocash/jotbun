// Daily streaming encrypted logical backup plus the accepted-attachment copy
// (P6a). pg_dump's output and each attachment flow through the authenticated
// stream in recovery-crypto.mjs straight into an owner-only recovery store, so
// plaintext never lands in an ordinary file, stdout or an argument. Each
// backup set expires 7 days after it was taken and the store prunes it.
//
// The API runtime never holds the recovery key or any recovery-store or
// erasure-registry credential: this tooling runs as a separate operator/cron
// role and reads its key from an inherited descriptor (or, once E1 exists,
// managed configuration). restore-safety.test.mjs checks the API's env
// examples and source for recovery credential names.
//
//   node scripts/ops/backup.mjs --target local --database <name> --recovery-dir <dir> --key-fd 3 [--synthetic]
//   node scripts/ops/backup.mjs --target hosted     → SKIPPED (E1 not authorized)
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, lstatSync, mkdirSync, openSync, closeSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { pipeline as pipelineStreams, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

import { asOpsError, createOpsLog, OpsError, parseArgs, REPO_ROOT, RETENTION_LIMIT_MS, runCli, silentLog } from './ops-safety.mjs';
import { encryptStream, manifestMac, readRecoveryKeyFromFd, RecoveryKey, verifyManifestMac } from './recovery-crypto.mjs';

export const RETENTION_MS = RETENTION_LIMIT_MS;
export const LOCAL_CONTAINER = 'gogospend-postgres-v1-local';
const LOCAL_ADMIN = 'gogospend_local_admin';
const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const BACKUP_ID = /^bk_\d{8}T\d{6}Z_[0-9a-f]{6}$/;
const PART_FILE = /^(bk_\d{8}T\d{6}Z_[0-9a-f]{6})\.(db|objects)\.enc$/;
export const LEDGER_FILE = 'restore-copies.json';
const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
const OBJECT_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;

/**
 * Refuses anything but an existing owner-only directory (no group/other
 * access), owned by this user, reached without a symlink, outside the
 * repository (so a copy can never be committed).
 */
export function assertIsolatedDirectory(dir) {
  try {
    if (typeof dir !== 'string' || !isAbsolute(dir) || lstatSync(dir).isSymbolicLink()) throw new Error();
    const real = realpathSync(dir);
    const info = statSync(real);
    if (!info.isDirectory() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new Error();
    const fromRepo = relative(realpathSync(REPO_ROOT), real);
    if (fromRepo === '' || (!fromRepo.startsWith('..') && !isAbsolute(fromRepo))) throw new Error();
    return real;
  } catch {
    throw new OpsError('RECOVERY_STORE_NOT_ISOLATED');
  }
}

function hashing() {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  return { stream, result: () => ({ bytes, sha256: hash.digest('hex') }) };
}

/** The time encoded in a backup id (`bk_YYYYMMDDTHHMMSSZ_xxxxxx`). */
export function backupIdTime(id) {
  const match = /^bk_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z_[0-9a-f]{6}$/.exec(id ?? '');
  return match ? Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`) : Number.NaN;
}

/**
 * Retention dates for a backup set that a store writer cannot stretch: the
 * oldest of the id's time and the manifest's claimed creation, plus the file
 * times whenever the manifest is not verified with the key. A verified
 * manifest may shorten retention below 7 days; nothing lengthens it.
 */
export function effectiveDates(manifest, { verified, fileTimes = [] } = {}) {
  const claimed = Date.parse(manifest?.created_at);
  let created = Math.min(backupIdTime(manifest?.id), Number.isFinite(claimed) ? claimed : Infinity);
  if (verified !== true) created = Math.min(created, ...fileTimes);
  if (!Number.isFinite(created)) return null;
  const claimedRetention = Date.parse(manifest?.expires_at) - claimed;
  const retention = verified === true && claimedRetention > 0 ? Math.min(claimedRetention, RETENTION_LIMIT_MS) : RETENTION_LIMIT_MS;
  return { created_at: new Date(created).toISOString(), expires_at: new Date(created + retention).toISOString() };
}

const STRAY_AGE_MS = { partial: 24 * 3_600_000, orphan: RETENTION_LIMIT_MS, unknown: RETENTION_LIMIT_MS };

/**
 * The isolated local recovery store: `<id>.db.enc`, `<id>.objects.enc` and a
 * MAC'd `<id>.manifest.json`, all 0600, plus the restore-copy ledger. With the
 * recovery key it verifies every manifest; without it, retention falls back to
 * file times as well. Every other entry is a stray (partial write, part without
 * a manifest, or unknown file): the inventory reports it and prune removes it
 * by age. The hosted equivalent (a private R2 recovery scope with a 7-day
 * lifecycle rule) is SKIPPED until E1.
 */
export function localRecoveryStore({ dir, key } = {}) {
  const root = assertIsolatedDirectory(dir);
  const path = (name) => join(root, name);
  const mtime = (name) => lstatSync(path(name)).mtime.getTime();

  function readManifest(name) {
    try {
      const manifest = JSON.parse(readFileSync(path(name), 'utf8'));
      return BACKUP_ID.test(manifest?.id) && name === `${manifest.id}.manifest.json` ? manifest : null;
    } catch {
      return null;
    }
  }

  function scan() {
    const names = readdirSync(root);
    const manifests = names.filter((name) => name.endsWith('.manifest.json')).map(readManifest).filter(Boolean);
    const ids = new Set(manifests.map((manifest) => manifest.id));
    const sets = manifests.map((manifest) => {
      const files = names.filter((name) => name.startsWith(`${manifest.id}.`) && !name.endsWith('.partial'));
      const verified = key instanceof RecoveryKey ? manifest.key_id === key.id && verifyManifestMac(key, manifest) : null;
      return { id: manifest.id, manifest, verified, environment: manifest.environment, synthetic: manifest.synthetic === true, ...effectiveDates(manifest, { verified, fileTimes: files.map(mtime) }) };
    }).filter((set) => set.created_at);
    const strays = [];
    for (const name of names) {
      if (name === LEDGER_FILE) continue;
      const part = PART_FILE.exec(name);
      if (name.endsWith('.manifest.json') && readManifest(name)) continue;
      if (part && ids.has(part[1])) continue;
      const kind = name.endsWith('.partial') ? 'partial' : part || name.endsWith('.manifest.json') ? 'orphan' : 'unknown';
      strays.push({ name, kind, modified_at: new Date(mtime(name)).toISOString() });
    }
    sets.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
    return { sets, strays };
  }

  return {
    kind: 'local-directory',

    /** Streams `sources` into `<name>` through an exclusive 0600 temp file; returns size and digest. */
    async writePart(name, ...sources) {
      const temp = path(`${name}.${randomBytes(4).toString('hex')}.partial`);
      const handle = await open(temp, 'wx', 0o600);
      const digest = hashing();
      try {
        await pipeline(...sources, digest.stream, handle.createWriteStream());
      } catch (error) {
        await handle.close().catch(() => undefined);
        rmSync(temp, { force: true });
        throw error;
      }
      renameSync(temp, path(name));
      return digest.result();
    },

    async writeManifest(manifest) {
      const name = `${manifest.id}.manifest.json`;
      const temp = path(`${name}.partial`);
      const fd = openSync(temp, 'wx', 0o600);
      try {
        writeFileSync(fd, `${JSON.stringify(manifest, null, 2)}\n`);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, path(name));
    },

    async discard(id) {
      for (const name of readdirSync(root)) if (name.startsWith(`${id}.`)) rmSync(path(name), { force: true });
    },

    /** Raw manifests, oldest first by their retention dates (never trusted on their own). */
    async list() {
      return scan().sets.map((set) => set.manifest);
    },

    /** Backup sets with retention dates a store writer cannot stretch, and `verified` (null without the key). */
    async sets() {
      return scan().sets.map(({ manifest: _manifest, ...set }) => set);
    },

    /** Entries that are not part of a complete backup set (partial, orphan, unknown). */
    async strays() {
      return scan().strays;
    },

    async get(id) {
      return BACKUP_ID.test(id ?? '') ? readManifest(`${id}.manifest.json`) : null;
    },

    /**
     * Opens a part; the stream fails with BACKUP_INTEGRITY if its size or
     * digest differs from the manifest. Destroying the returned stream closes
     * the file.
     */
    openPart(manifest, part) {
      const expected = manifest?.parts?.[part];
      if (!expected || !BACKUP_ID.test(manifest.id)) throw new OpsError('BACKUP_MISSING');
      const digest = hashing();
      const checked = new Transform({
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
        flush(callback) {
          const actual = digest.result();
          callback(actual.bytes === expected.bytes && actual.sha256 === expected.sha256 ? undefined : new OpsError('BACKUP_INTEGRITY'));
        },
      });
      // pipeline (not pipe) so that destroying `checked` also closes the file.
      // Callers turn any non-OpsError from here into BACKUP_INTEGRITY.
      return pipelineStreams(createReadStream(path(`${manifest.id}.${part}.enc`)), digest.stream, checked, () => undefined);
    },

    /** The 7-day lifecycle: expired sets by their retention dates, strays by file age. Returns sets removed. */
    async prune(now) {
      const cutoff = new Date(now).getTime();
      let removed = 0;
      const { sets, strays } = scan();
      for (const set of sets) {
        if (!(Date.parse(set.expires_at) > cutoff)) {
          await this.discard(set.id);
          removed += 1;
        }
      }
      for (const stray of strays) {
        if (cutoff - Date.parse(stray.modified_at) >= STRAY_AGE_MS[stray.kind]) rmSync(path(stray.name), { recursive: true, force: true });
      }
      return removed;
    },
  };
}

function backupId(date) {
  return `bk_${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z_${randomBytes(3).toString('hex')}`;
}

/** Attachment copy bundle: u16 ref length | ref | u32 size | bytes, ended by u16 0. */
async function* bundle(attachments, counter) {
  for await (const item of attachments.list()) {
    counter.count += 1;
    const ref = Buffer.from(String(item?.ref ?? ''), 'utf8');
    if (!OBJECT_REF.test(item?.ref ?? '') || item.ref.includes('..') || ref.length > 1024) throw new OpsError('ATTACHMENT_COPY_FAILED');
    const bytes = await item.read();
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX_OBJECT_BYTES) throw new OpsError('ATTACHMENT_COPY_FAILED');
    const head = Buffer.alloc(2 + ref.length + 4);
    head.writeUInt16BE(ref.length, 0);
    ref.copy(head, 2);
    head.writeUInt32BE(bytes.length, 2 + ref.length);
    yield head;
    yield bytes;
  }
  yield Buffer.alloc(2);
}

/** Reads a decrypted attachment bundle into ref → {bytes, sha256}. */
export async function readAttachmentBundle(readable) {
  const objects = new Map();
  let buffered = Buffer.alloc(0);
  let ended = false;
  for await (const chunk of readable) {
    buffered = buffered.length === 0 ? chunk : Buffer.concat([buffered, chunk]);
    for (;;) {
      if (ended) {
        if (buffered.length > 0) throw new OpsError('BACKUP_INTEGRITY');
        break;
      }
      if (buffered.length < 2) break;
      const refLength = buffered.readUInt16BE(0);
      if (refLength === 0) {
        ended = true;
        buffered = buffered.subarray(2);
        continue;
      }
      if (buffered.length < 2 + refLength + 4) break;
      const size = buffered.readUInt32BE(2 + refLength);
      if (size > MAX_OBJECT_BYTES) throw new OpsError('BACKUP_INTEGRITY');
      if (buffered.length < 2 + refLength + 4 + size) break;
      const ref = buffered.subarray(2, 2 + refLength).toString('utf8');
      const body = buffered.subarray(2 + refLength + 4, 2 + refLength + 4 + size);
      objects.set(ref, { bytes: size, sha256: createHash('sha256').update(body).digest('hex') });
      buffered = buffered.subarray(2 + refLength + 4 + size);
    }
  }
  if (!ended || buffered.length > 0) throw new OpsError('BACKUP_INTEGRITY');
  return objects;
}

/**
 * Takes one backup set: the encrypted logical dump, then the encrypted
 * accepted-attachment copy, then the MAC'd manifest. Any failure discards
 * every part of the set. Prunes expired sets afterwards.
 */
export async function runDailyBackup({ database, attachments, store, key, now = new Date(), retentionMs = RETENTION_MS, environment, synthetic, log = silentLog }) {
  if (!(key instanceof RecoveryKey)) throw new OpsError('RECOVERY_KEY_CUSTODY_MISSING');
  if (!Number.isFinite(retentionMs) || retentionMs <= 0 || retentionMs > RETENTION_LIMIT_MS) throw new OpsError('RETENTION_EXCEEDS_LIMIT');
  if (environment !== 'production' && environment !== 'non_production') throw new OpsError('ARGUMENT_REFUSED');
  if (environment === 'non_production' && synthetic !== true) throw new OpsError('NON_PRODUCTION_REAL_DATA');
  if (typeof database?.dump !== 'function' || typeof attachments?.list !== 'function' || !store) throw new OpsError('ARGUMENT_REFUSED');
  const createdAt = new Date(now);
  const id = backupId(createdAt);
  const started = Date.now();
  log.event('backup_started', { backup_id: id });
  let manifest;
  try {
    let dump;
    try {
      dump = database.dump();
    } catch {
      throw new OpsError('BACKUP_DUMP_FAILED');
    }
    const exited = Promise.resolve(dump?.done).then(() => null, () => new OpsError('BACKUP_DUMP_FAILED'));
    let databasePart;
    try {
      databasePart = await store.writePart(`${id}.db.enc`, dump.stream, encryptStream(key));
    } catch {
      dump?.stream?.destroy?.();
      throw new OpsError('BACKUP_DUMP_FAILED');
    }
    const dumpFailure = await exited;
    if (dumpFailure) throw dumpFailure;
    const counter = { count: 0 };
    let objectsPart;
    try {
      objectsPart = await store.writePart(`${id}.objects.enc`, Readable.from(bundle(attachments, counter)), encryptStream(key));
    } catch {
      throw new OpsError('ATTACHMENT_COPY_FAILED');
    }
    manifest = {
      format: 'gogospend-recovery-v1',
      id,
      created_at: createdAt.toISOString(),
      expires_at: new Date(createdAt.getTime() + retentionMs).toISOString(),
      key_id: key.id,
      environment,
      synthetic: synthetic === true,
      source_label: /^[a-z0-9-]{1,40}$/.test(database.label ?? '') ? database.label : 'database',
      parts: { db: databasePart, objects: { ...objectsPart, count: counter.count } },
    };
    manifest.mac = manifestMac(key, manifest);
    await store.writeManifest(manifest);
  } catch (error) {
    const failure = asOpsError(error, 'BACKUP_DUMP_FAILED');
    await store.discard(id);
    log.event('backup_failed', { backup_id: id, code: failure.code });
    throw failure;
  }
  const pruned = await store.prune(createdAt);
  const receipt = {
    backup_id: id,
    created_at: manifest.created_at,
    expires_at: manifest.expires_at,
    key_id: manifest.key_id,
    database_bytes: manifest.parts.db.bytes,
    attachment_objects: manifest.parts.objects.count,
    duration_ms: Date.now() - started,
    pruned,
  };
  log.event('backup_written', receipt);
  return receipt;
}

/**
 * pg_dump inside the local loopback container, over its Unix socket. No
 * connection string or password exists, nothing secret is in the argument
 * list, and stderr is drained and discarded (it can echo data or settings).
 */
export function localDockerDump({ container = LOCAL_CONTAINER, database, spawnImpl = spawn }) {
  if (container !== LOCAL_CONTAINER || !DATABASE_NAME.test(database ?? '')) throw new OpsError('ARGUMENT_REFUSED');
  return {
    label: 'local-docker',
    dump() {
      const child = spawnImpl('docker', ['exec', container, 'pg_dump', '--format=custom', '-w', `--username=${LOCAL_ADMIN}`, `--dbname=${database}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stderr?.resume();
      const done = new Promise((resolve, reject) => {
        child.on('error', () => reject(new OpsError('BACKUP_DUMP_FAILED')));
        child.on('close', (code) => (code === 0 ? resolve() : reject(new OpsError('BACKUP_DUMP_FAILED', { exit_code: typeof code === 'number' ? code : -1 }))));
      });
      done.catch(() => undefined);
      return { stream: child.stdout, done };
    },
  };
}

/** Neon logical dump through managed configuration: SKIPPED until E1. */
export function hostedDump() {
  throw new OpsError('HOSTED_ADAPTER_NOT_AUTHORIZED');
}

/** For a schema with no retained attachments yet (P2c's tables come later). */
export function emptyAttachmentSource() {
  return { label: 'none', async *list() {} };
}

export function memoryAttachmentSource(objects) {
  return {
    label: 'memory',
    async *list() {
      for (const [ref, bytes] of objects) yield { ref, read: async () => bytes };
    },
  };
}

/** The accepted-attachment R2 scope: SKIPPED until E1 and P2c. */
export function hostedAttachmentSource() {
  throw new OpsError('HOSTED_ADAPTER_NOT_AUTHORIZED');
}

/**
 * Environment-variable names that would give a runtime recovery authority: a
 * recovery/backup/erasure-registry name that also names a key, secret, token,
 * password, credential, access grant or connection URL. (A non-secret name
 * such as a backup-age alert threshold is not one.)
 */
export function findRecoveryCredentialNames(text) {
  const names = (String(text).match(/\b[A-Z0-9_]*(RECOVERY|BACKUP|ERASURE_REGISTRY)[A-Z0-9_]*\b/g) ?? [])
    .filter((name) => /(KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|ACCESS|URL|DSN)/.test(name.replace(/RECOVERY|BACKUP|ERASURE_REGISTRY/g, '_')));
  return [...new Set(names)].sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    target: /^(local|hosted)$/,
    database: DATABASE_NAME,
    'recovery-dir': /^\/[A-Za-z0-9._/-]{1,512}$/,
    'key-fd': /^([3-9]|[1-9][0-9])$/,
    synthetic: 'flag',
  });
  if (args.target === 'hosted') throw new OpsError('HOSTED_ADAPTER_NOT_AUTHORIZED');
  if (args.target !== 'local' || !args.database || !args['recovery-dir'] || !args['key-fd']) throw new OpsError('ARGUMENT_REFUSED');
  mkdirSync(args['recovery-dir'], { recursive: true, mode: 0o700 });
  const receipt = await runDailyBackup({
    database: localDockerDump({ database: args.database }),
    attachments: emptyAttachmentSource(),
    store: localRecoveryStore({ dir: args['recovery-dir'] }),
    key: readRecoveryKeyFromFd(Number(args['key-fd'])),
    environment: 'non_production',
    synthetic: args.synthetic === true,
    log: createOpsLog(),
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli(main);
