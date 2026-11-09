import type { AttachmentContentType, AttachmentGrant, CommandAck } from '@gogospend/contracts'

import type { VaultCall } from '../../v1/protocol'
import type { VaultContext } from '../context'
import type { FileContext } from './context'

// 1B-T9 typed stub (RED): every name the tests and the wiring import, each
// answering a wrong but typed value. Step 4 replaces this file with the real one.

export const RECEIPT_COPY_GRACE_MS = 180_000
export const RELEASED_ROW_MS = 30 * 86_400_000

export type PreparedCopy =
  | { kind: 'none' }
  | { kind: 'wait' }
  | { kind: 'copy'; source_key: string; key: string; content_type: AttachmentContentType; bytes: number; sha256: string }
export type StoredCopy = { key: string; bytes: number; sha256: string }
export type StoredReceiptFile = { key: string; bytes: number; sha256: string; contentType: AttachmentContentType; fileName: string }

const NO_ACK: CommandAck = { command_id: '', entity_id: '', version: 0, committed_revision: '0', outcome: 'updated', entity_state: 'active' }

export function receiptChoice(input: Record<string, unknown>): string {
  return String(input.attachment_id)
}

export function releaseReceiptCopy(_c: FileContext, _key: string): void {}

export function prepareReceipt(_c: VaultContext, _input: { attachment_id: string; command_id: string; record?: { id: string; expected_version: number | undefined; needs: 'none' | 'other' } }): PreparedCopy {
  return { kind: 'none' }
}

export function retainReceipt(_c: VaultContext, _call: VaultCall): CommandAck {
  return NO_ACK
}

export function replaceReceipt(_c: VaultContext, _call: VaultCall): CommandAck {
  return NO_ACK
}

export function removeReceipt(_c: VaultContext, _call: VaultCall): CommandAck {
  return NO_ACK
}

export function receiptGrant(_c: VaultContext, _id: string): AttachmentGrant | null {
  return null
}

export function receiptFile(_c: VaultContext, _grant: string): StoredReceiptFile | null {
  return null
}

export function prepareInput(_body: unknown): Parameters<typeof prepareReceipt>[1] {
  return { attachment_id: '', command_id: '' }
}

export function supportsReceiptSchema(_schemaVersion: number): boolean {
  return false
}

export function pruneAttachments(_c: FileContext): void {}

export function attachmentsDueAt(_c: FileContext): number | null {
  return null
}
