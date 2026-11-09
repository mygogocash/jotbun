import type { CommandAck, ConfirmImportBatchResult, ImportSelectionProgress, PatchImportRowsResult } from '@gogospend/contracts'

import type { VaultCall } from '../../v1/protocol'
import type { VaultContext } from '../context'
import type { PreparedCopy, StoredCopy } from './attachments'
import type { FileContext } from './context'

// 1B-T10 typed stub (RED): every name the tests and the wiring import, each
// answering a wrong but typed value. Step 4 replaces this file with the real one.

export type ConfirmPrepared = PreparedCopy | { kind: 'refused' }
export type ConfirmReceipt = null | { kind: 'none' } | ({ kind: 'copied' } & StoredCopy)

const NO_ACK: CommandAck = { command_id: '', entity_id: '', version: 0, committed_revision: '0', outcome: 'updated', entity_state: 'active' }

export function patchImportRows(_c: VaultContext, _call: VaultCall): PatchImportRowsResult {
  return { ack: NO_ACK, review_revision: '1' }
}

export function freezeImportSelection(_c: VaultContext, _call: VaultCall): CommandAck {
  return NO_ACK
}

export function confirmPrepare(_c: VaultContext, _call: VaultCall): ConfirmPrepared {
  return { kind: 'none' }
}

export function confirmImportBatch(_c: VaultContext, _call: VaultCall): ConfirmImportBatchResult {
  return { ack: NO_ACK, selection_id: '', frozen_revision: '1', committed: [], remaining: [], conflicted: [] }
}

export function selectionProgress(_c: FileContext, _jobId: string, _selectionId: string): ImportSelectionProgress | null {
  return null
}
