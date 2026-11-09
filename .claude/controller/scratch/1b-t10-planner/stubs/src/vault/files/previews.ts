import type { ImportPreview, parseImportPreviewPaging } from '@gogospend/contracts'

import type { FileContext } from './context'

// 1B-T10 typed stub (RED): every name the tests and the wiring import, each
// answering a wrong but typed value. Step 4 replaces this file with the real one.

export type PreviewPaging = NonNullable<ReturnType<typeof parseImportPreviewPaging>>

export const IMPORT_RECORDS_MS = 30 * 86_400_000

export function previewOf(_c: FileContext, _jobId: string, _paging: PreviewPaging | null): ImportPreview | null {
  return null
}

export function pruneImports(_c: FileContext): void {}

export function importsDueAt(_c: FileContext): number | null {
  return null
}
