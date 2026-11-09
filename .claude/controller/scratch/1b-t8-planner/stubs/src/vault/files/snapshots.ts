import { isUuid } from '@gogospend/contracts'
import type { Revision, SnapshotDto } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'

import type { VaultCall, VaultReply } from '../../v1/protocol'
import type { VaultContext } from '../context'
import type { FileContext } from './context'
import type { VaultBucket } from './keys'
import type { BuildOutcome } from './work'

// 1B-T8 typed stub (RED): every function answers a wrong but typed value and
// writes nothing. Step 4 replaces this file with the real module.

export const SNAPSHOT_CHUNK_BYTES = 1024 * 1024
export const SNAPSHOT_CONTENT_TYPE = 'application/json'
export const SNAPSHOT_REUSE_MS = 3_600_000
export const SNAPSHOT_PENDING_MS = 86_400_000
export const SNAPSHOT_KEEP_MS = 7 * 86_400_000

export type SnapshotWriter = { context(): FileContext; bucket: VaultBucket; active(c: FileContext): boolean }
export type StoredChunk = { key: string; bytes: number; sha256: string }

export function purgeWatermark(_c: FileContext): Revision {
  return '0'
}

export function requestSnapshot(c: VaultContext, call: VaultCall): VaultReply {
  const key = call.headers['idempotency-key']
  const id = derivedUuid(c.claims.accountId, 'snapshot-request', isUuid(key) ? key : '')
  return { ok: true, status: 202, body: { snapshot_id: id, status: 'pending' } }
}

export function snapshotStatus(_c: VaultContext, _id: string): SnapshotDto | null {
  return null
}

export function snapshotChunk(_c: VaultContext, _grant: string): StoredChunk | null {
  return null
}

export async function buildSnapshot(_v: SnapshotWriter, _id: string, _options: { chunkBytes?: number; maxBytes?: number } = {}): Promise<BuildOutcome & { peakHeldBytes?: number }> {
  return { outcome: 'skipped' }
}

export function failSnapshot(_c: FileContext, _id: string): void {}

export function pruneSnapshots(_c: FileContext): void {}

export function snapshotsDueAt(_c: FileContext): number | null {
  return null
}
