// 1B-T6 typed stub (RED): every function answers a wrong but typed value.
import type { CommandAck, ExportDto, ExportFilter, ExportGrant } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'

import type { VaultCall } from '../../v1/protocol'
import { commandInput } from '../commands/executor'
import type { VaultContext } from '../context'
import type { FileContext } from './context'
import type { VaultBucket } from './keys'
import type { BuildOutcome } from './work'

export const EXPORT_ENTITY = 'export'
export const EXPORT_REQUEST_KIND = 'export.request'

export function parseExportFilter(input: Record<string, unknown>): ExportFilter {
  return { from: String(input.from), through: String(input.through) }
}

export const VAULT_EXPORT_MAX_BYTES = 32 * 1024 * 1024
export const EXPORT_CONTENT_TYPE = 'text/csv; charset=utf-8'
export const EXPORT_PENDING_MS = 86_400_000
export const EXPORT_PURGE_MS = 30 * 86_400_000

export type ExportWriter = { context(): FileContext; bucket: VaultBucket; active(c: FileContext): boolean }
export type StoredExportFile = { key: string; bytes: number; sha256: string; fileName: string }

/** Acknowledges without writing a row. */
export function requestExport(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'export.request', null, 'forbidden')
  return { command_id: command.commandId, entity_id: derivedUuid(c.claims.accountId, 'export-request', command.commandId), version: 1, committed_revision: '0', outcome: 'accepted', entity_state: 'active' }
}
export function exportStatus(_c: FileContext, _id: string): ExportDto | null {
  return null
}
export function exportGrant(_c: VaultContext, _id: string): ExportGrant | null {
  return null
}
export function exportFile(_c: VaultContext, _grant: string): StoredExportFile | null {
  return null
}
export async function writeExport(_v: ExportWriter, _id: string, _options: { maxBytes?: number } = {}): Promise<BuildOutcome & { peakHeldBytes?: number }> {
  return { outcome: 'skipped' }
}
export function failExport(_c: FileContext, _id: string): void {}
export function pruneExports(_c: FileContext): void {}
export function exportsDueAt(_c: FileContext): number | null {
  return null
}
