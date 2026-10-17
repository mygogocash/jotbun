// Recovery-key custody and the authenticated streaming format for backups
// (P6a). Plaintext only ever exists in a pipe between pg_dump/pg_restore and
// this process: it is never written to an ordinary file, stdout or an
// argument.
//
// Format (one file per part):
//   header  = "GGSREC01" | key id (16) | salt (32) | nonce prefix (7)   (63 bytes)
//   record  = u32 length (high bit: final) | AES-256-GCM ciphertext | tag (16)
// The per-file key is HKDF-SHA256(recovery key, salt). Each record's nonce is
// prefix | u32 counter | final flag, and the header is the AAD, so reordering,
// truncation, appending, a flipped final flag or a header from another file
// all fail authentication. Records are verified before any plaintext leaves.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { fstatSync, readSync } from 'node:fs';
import { Transform } from 'node:stream';
import { isatty as ttyCheck } from 'node:tty';
import { inspect } from 'node:util';

import { OpsError } from './ops-safety.mjs';

const MAGIC = Buffer.from('GGSREC01');
const HEADER_BYTES = MAGIC.length + 16 + 32 + 7;
const TAG_BYTES = 16;
const FINAL = 0x8000_0000;
export const RECORD_BYTES = 64 * 1024;
const STREAM_INFO = Buffer.from('gogospend-recovery-stream-v1');
const KEY_ID_INFO = 'gogospend-recovery-key-id-v1';
const MANIFEST_INFO = Buffer.from('gogospend-recovery-manifest-v1');

/**
 * The recovery key. Its bytes live in a private field: JSON, inspection and
 * string conversion show only the non-secret key id.
 */
export class RecoveryKey {
  #bytes;

  constructor(bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw new OpsError('RECOVERY_KEY_INVALID');
    this.#bytes = Buffer.from(bytes);
    this.id = createHmac('sha256', this.#bytes).update(KEY_ID_INFO).digest().subarray(0, 16).toString('hex');
    Object.freeze(this);
  }

  /** A fresh in-memory key, for synthetic rehearsals only. */
  static generate() {
    return new RecoveryKey(randomBytes(32));
  }

  static fromBytes(bytes) {
    return new RecoveryKey(bytes);
  }

  derive(salt, info) {
    return Buffer.from(hkdfSync('sha256', this.#bytes, salt, info, 32));
  }

  toJSON() {
    return { key_id: this.id };
  }

  toString() {
    return `RecoveryKey(${this.id})`;
  }

  [inspect.custom]() {
    return this.toString();
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Reads the recovery key from an inherited descriptor (a pipe from a secret
 * manager, e.g. `3< <(op read …)`). An ordinary file is refused (a key must
 * not sit in plaintext on disk), and so is a terminal (it would be typed and
 * echoed). Accepts 32 raw bytes or base64/base64url text.
 */
export function readRecoveryKeyFromFd(fd, { isatty = ttyCheck } = {}) {
  let info;
  try {
    info = fstatSync(fd);
  } catch {
    throw new OpsError('RECOVERY_KEY_CUSTODY_MISSING');
  }
  if (info.isFile()) throw new OpsError('KEY_SOURCE_PLAINTEXT_FILE');
  if (isatty(fd)) throw new OpsError('KEY_SOURCE_TERMINAL');
  if (info.isDirectory()) throw new OpsError('RECOVERY_KEY_INVALID');
  const buffer = Buffer.alloc(256);
  let length = 0;
  for (let waited = 0; length < buffer.length;) {
    let read;
    try {
      read = readSync(fd, buffer, length, buffer.length - length, null);
    } catch (error) {
      if (error?.code === 'EAGAIN' && waited < 5000) {
        sleepMs(10);
        waited += 10;
        continue;
      }
      buffer.fill(0);
      throw new OpsError('RECOVERY_KEY_CUSTODY_MISSING');
    }
    if (read === 0) break;
    length += read;
  }
  const raw = buffer.subarray(0, length);
  let text = raw.toString('latin1');
  if (text.endsWith('\n')) text = text.slice(0, -1);
  if (text.endsWith('\r')) text = text.slice(0, -1);
  let bytes;
  if (/^[A-Za-z0-9_\-+/]{43}=?$/.test(text)) bytes = Buffer.from(text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=$/, ''), 'base64url');
  else if (length === 32) bytes = Buffer.from(raw);
  text = '';
  buffer.fill(0);
  if (!bytes || bytes.length !== 32) throw new OpsError('RECOVERY_KEY_INVALID');
  const key = new RecoveryKey(bytes);
  bytes.fill(0);
  return key;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function nonce(prefix, counter, final) {
  return Buffer.concat([prefix, u32(counter), Buffer.from([final ? 1 : 0])]);
}

/** Encrypts a plaintext stream into the authenticated record format. */
export function encryptStream(key) {
  if (!(key instanceof RecoveryKey)) throw new OpsError('RECOVERY_KEY_CUSTODY_MISSING');
  const salt = randomBytes(32);
  const prefix = randomBytes(7);
  const header = Buffer.concat([MAGIC, Buffer.from(key.id, 'hex'), salt, prefix]);
  const fileKey = key.derive(salt, STREAM_INFO);
  let counter = 0;
  let pending = Buffer.alloc(0);
  let started = false;
  const seal = (plain, final) => {
    if (counter > 0xffff_fffe) throw new OpsError('BACKUP_INTEGRITY');
    const cipher = createCipheriv('aes-256-gcm', fileKey, nonce(prefix, counter, final));
    cipher.setAAD(header);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    counter += 1;
    return Buffer.concat([u32(body.length | (final ? FINAL : 0)), body, cipher.getAuthTag()]);
  };
  return new Transform({
    transform(chunk, _encoding, callback) {
      try {
        if (!started) {
          this.push(header);
          started = true;
        }
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
        while (pending.length > RECORD_BYTES) {
          this.push(seal(pending.subarray(0, RECORD_BYTES), false));
          pending = pending.subarray(RECORD_BYTES);
        }
        callback();
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      try {
        if (!started) this.push(header);
        this.push(seal(pending, true));
        pending = Buffer.alloc(0);
        fileKey.fill(0);
        callback();
      } catch (error) {
        callback(error);
      }
    },
  });
}

/** Verifies and decrypts the record format; any defect is BACKUP_INTEGRITY. */
export function decryptStream(key) {
  if (!(key instanceof RecoveryKey)) throw new OpsError('RECOVERY_KEY_CUSTODY_MISSING');
  let buffered = Buffer.alloc(0);
  let header = null;
  let fileKey = null;
  let prefix = null;
  let counter = 0;
  let finished = false;
  return new Transform({
    transform(chunk, _encoding, callback) {
      buffered = buffered.length === 0 ? chunk : Buffer.concat([buffered, chunk]);
      try {
        if (!header) {
          if (buffered.length < HEADER_BYTES) return callback();
          header = Buffer.from(buffered.subarray(0, HEADER_BYTES));
          buffered = buffered.subarray(HEADER_BYTES);
          if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new OpsError('BACKUP_INTEGRITY');
          if (header.subarray(8, 24).toString('hex') !== key.id) throw new OpsError('RECOVERY_KEY_MISMATCH');
          fileKey = key.derive(header.subarray(24, 56), STREAM_INFO);
          prefix = header.subarray(56, 63);
        }
        while (buffered.length >= 4) {
          if (finished) throw new OpsError('BACKUP_INTEGRITY');
          const word = buffered.readUInt32BE(0);
          const final = (word & FINAL) !== 0;
          const length = word & ~FINAL;
          if (length > RECORD_BYTES) throw new OpsError('BACKUP_INTEGRITY');
          if (buffered.length < 4 + length + TAG_BYTES) break;
          const decipher = createDecipheriv('aes-256-gcm', fileKey, nonce(prefix, counter, final));
          decipher.setAAD(header);
          decipher.setAuthTag(buffered.subarray(4 + length, 4 + length + TAG_BYTES));
          let plain;
          try {
            plain = Buffer.concat([decipher.update(buffered.subarray(4, 4 + length)), decipher.final()]);
          } catch {
            throw new OpsError('BACKUP_INTEGRITY');
          }
          buffered = buffered.subarray(4 + length + TAG_BYTES);
          counter += 1;
          finished = final;
          if (plain.length > 0) this.push(plain);
        }
        callback();
      } catch (error) {
        fileKey?.fill(0);
        callback(error instanceof OpsError ? error : new OpsError('BACKUP_INTEGRITY'));
      }
    },
    flush(callback) {
      fileKey?.fill(0);
      callback(!header || !finished || buffered.length > 0 ? new OpsError('BACKUP_INTEGRITY') : undefined);
    },
  });
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((name) => `${JSON.stringify(name)}:${canonical(value[name])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * MAC over a manifest (everything but `mac`), so a recovery-store writer
 * without the key cannot extend an expiry or swap a part's checksum.
 */
export function manifestMac(key, manifest) {
  const { mac: _mac, ...body } = manifest;
  const macKey = key.derive(Buffer.alloc(32), MANIFEST_INFO);
  const mac = createHmac('sha256', macKey).update(canonical(body)).digest('base64url');
  macKey.fill(0);
  return mac;
}

export function verifyManifestMac(key, manifest) {
  if (typeof manifest?.mac !== 'string') return false;
  const expected = Buffer.from(manifestMac(key, manifest));
  const actual = Buffer.from(manifest.mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
