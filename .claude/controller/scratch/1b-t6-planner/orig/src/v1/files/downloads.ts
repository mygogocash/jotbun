import { DEFAULT_ATTACHMENT_LIMITS } from '@api/attachments/attachment-limits'

import { DownloadSlots } from '../../server/http/files'

// File downloads the Worker streams from R2. Each download takes a slot first,
// as the API counts downloads per process; here the count is per isolate.
// 1B-T6 (serveExportFile), 1B-T8 (serveSnapshotChunk) and 1B-T9
// (serveReceiptFile) add their serve functions below.

/** Export downloads one isolate streams at once (the API's EXPORT_DOWNLOADS_PER_PROCESS, 4). */
export const EXPORT_SLOTS = new DownloadSlots(4)

/** Receipt downloads one isolate streams at once, and per account (DEFAULT_ATTACHMENT_LIMITS: 8 and 2). */
export const RECEIPT_SLOTS = new DownloadSlots(DEFAULT_ATTACHMENT_LIMITS.downloadsPerProcess, DEFAULT_ATTACHMENT_LIMITS.downloadsPerAccount)
