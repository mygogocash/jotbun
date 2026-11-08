import { createHash } from 'node:crypto'

import { ObjectStoreError } from '@api/storage/object-store'

import { logFailure } from '../../v1/log'
import { touch } from './context'
import type { FileContext } from './context'
import type { VaultBucket, VaultObjectPurpose } from './keys'

// The vault's object registry (B4, B19). A key is reserved before its PUT,
// published after it, and due at delete_after. When a key falls due the vault
// deletes it from R2 and keeps it a day as a tombstone, then deletes it once
// more and forgets it, so a PUT that landed after the key was given up is
// deleted too. These functions run plain SQL inside the caller's block (a
// command's, or a short transactionSync of a background method's own), except
// deleteDueObjects, which awaits R2 and so opens its own short blocks.

/** How long a reserved key may wait for its PUT and publish before the vault gives it up. */
export const RESERVATION_GRACE_MS = 15 * 60_000

/** How long a deleted key is kept as a tombstone before it is deleted once more and forgotten. */
export const TOMBSTONE_MS = 86_400_000

/** How long a failed R2 delete waits before the alarm tries it again. */
export const DELETE_RETRY_MS = 60_000

/** The most keys one R2 delete takes (the binding's limit), so one batch. */
const DELETE_BATCH = 1000

export type VaultObjectStatus = 'reserved' | 'published' | 'tombstone'

/** Registers a key before anyone writes it. It is due at now plus `graceMs` unless it is published first. A key already registered throws. */
export function reserveObject(c: FileContext, key: string, purpose: VaultObjectPurpose, graceMs: number = RESERVATION_GRACE_MS): void {
  const now = c.now.getTime()
  c.sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, created_at) VALUES (?, ?, 'reserved', ?, ?)", key, purpose, now + graceMs, now)
  touch(c)
}

/**
 * Records a stored key's size and SHA-256, due at `deleteAfter` (epoch ms), or
 * never for a held receipt (null). Only a reserved key can be published: any
 * other key throws and nothing is written.
 */
export function publishObject(c: FileContext, key: string, file: { bytes: number; sha256: string }, deleteAfter: number | null): void {
  const published = c.sql
    .exec("UPDATE vault_objects SET status = 'published', bytes = ?, sha256 = ?, delete_after = ? WHERE key = ? AND status = 'reserved' RETURNING key", file.bytes, file.sha256, deleteAfter, key)
    .toArray()
  if (published.length === 0) throw new Error('only a reserved key can be published')
  touch(c)
}

/** Makes a key due now (delete_after 0), as a released receipt is. A tombstone keeps its own deadline. */
export function releaseObject(c: FileContext, key: string): void {
  c.sql.exec("UPDATE vault_objects SET delete_after = 0 WHERE key = ? AND status <> 'tombstone'", key)
  touch(c)
}

/**
 * Forgets keys their writer already deleted from R2: each row becomes a
 * tombstone due a day from now, so a PUT still in flight is deleted then.
 * The list binds as one JSON parameter (ruling R57).
 */
export function tombstoneObjects(c: FileContext, keys: readonly string[]): void {
  if (keys.length === 0) return
  c.sql.exec("UPDATE vault_objects SET status = 'tombstone', delete_after = ? WHERE key IN (SELECT value FROM json_each(?))", c.now.getTime() + TOMBSTONE_MS, JSON.stringify(keys))
  touch(c)
}

/** The keys due now, earliest first, at most `limit`. */
export function dueObjectKeys(c: FileContext, limit: number = DELETE_BATCH): { key: string; status: VaultObjectStatus }[] {
  return c.sql
    .exec<{ key: string; status: VaultObjectStatus }>('SELECT key, status FROM vault_objects WHERE delete_after IS NOT NULL AND delete_after <= ? ORDER BY delete_after, key LIMIT ?', c.now.getTime(), limit)
    .toArray()
}

/** The earliest delete_after of any key, or null when no key has a deadline. */
export function objectsDueAt(c: FileContext): number | null {
  const { due } = c.sql.exec<{ due: number | null }>('SELECT min(delete_after) AS due FROM vault_objects WHERE delete_after IS NOT NULL').one()
  return due ?? null
}

/**
 * Deletes due keys from R2 in batches of up to 1,000 (B19). A reserved or
 * published key becomes a tombstone due a day later; a due tombstone is
 * deleted once more and its row dropped. A batch whose R2 delete fails keeps
 * its rows' status and is due again a minute later, so the alarm does not
 * fire again at once. Each batch reads the vault clock afresh. Stops when
 * nothing is due, or after `maxBatches`. Returns how many keys R2 deleted.
 */
export async function deleteDueObjects(v: { context(): FileContext; bucket: VaultBucket }, maxBatches = 10): Promise<number> {
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const c = v.context()
    const due = dueObjectKeys(c, DELETE_BATCH)
    if (due.length === 0) break
    const now = c.now.getTime()
    const keys = due.map((row) => row.key)
    try {
      await v.bucket.delete(keys)
    } catch (error) {
      logFailure('object_delete_failed', error)
      c.storage.transactionSync(() => {
        c.sql.exec('UPDATE vault_objects SET delete_after = ? WHERE key IN (SELECT value FROM json_each(?)) AND delete_after <= ?', now + DELETE_RETRY_MS, JSON.stringify(keys), now)
        touch(c)
      })
      continue
    }
    const forgotten = due.filter((row) => row.status === 'tombstone').map((row) => row.key)
    const given = due.filter((row) => row.status !== 'tombstone').map((row) => row.key)
    c.storage.transactionSync(() => {
      c.sql.exec("DELETE FROM vault_objects WHERE key IN (SELECT value FROM json_each(?)) AND status = 'tombstone'", JSON.stringify(forgotten))
      c.sql.exec("UPDATE vault_objects SET status = 'tombstone', delete_after = ? WHERE key IN (SELECT value FROM json_each(?)) AND status <> 'tombstone'", now + TOMBSTONE_MS, JSON.stringify(given))
      touch(c)
    })
    deleted += keys.length
  }
  return deleted
}

/**
 * Stores parts as one create-only object (B21): one concatenation (a single
 * part is used as it is), then the parts list is emptied so the caller's
 * parts can be collected, then the SHA-256, then the PUT. R2 checks the
 * digest, and it is kept as the `sha256` custom metadata, as
 * R2ObjectStore.putStream keeps it. A key already in R2 is
 * ObjectStoreError('exists'); any other failure is 'unavailable'.
 */
export async function putConcatenated(bucket: VaultBucket, key: string, parts: Uint8Array[], totalBytes: number, contentType: string): Promise<{ bytes: number; sha256: string }> {
  const data = parts.length === 1 ? parts[0] : Buffer.concat(parts, totalBytes)
  parts.length = 0
  const sha256 = createHash('sha256').update(data).digest('hex')
  let stored: unknown
  try {
    stored = await bucket.put(key, data, { onlyIf: new Headers({ 'if-none-match': '*' }), sha256, customMetadata: { sha256 }, httpMetadata: { contentType } })
  } catch (error) {
    if (error instanceof ObjectStoreError) throw error
    throw new ObjectStoreError('unavailable')
  }
  if (stored === null) throw new ObjectStoreError('exists')
  return { bytes: data.byteLength, sha256 }
}
