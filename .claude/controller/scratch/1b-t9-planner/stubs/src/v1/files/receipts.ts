import { DEFAULT_ATTACHMENT_LIMITS } from '@api/attachments/attachment-limits'
import type { AttachmentLimits } from '@api/attachments/attachment-limits'

import { DownloadSlots } from '../../server/http/files'
import type { VaultReply } from '../protocol'
import type { WorkerContext } from '../worker-routes'

// 1B-T9 typed stub (RED): the limits and the copy slots as the real module
// exports them; retain and replace answer 501. Step 4 replaces this file.

export const RECEIPT_LIMITS: AttachmentLimits = { ...DEFAULT_ATTACHMENT_LIMITS }

export const COPY_SLOTS = new DownloadSlots(DEFAULT_ATTACHMENT_LIMITS.copiesPerProcess)

export async function retainRoute(_w: WorkerContext): Promise<Response | VaultReply> {
  return new Response(null, { status: 501 })
}

export async function replaceRoute(_w: WorkerContext): Promise<Response | VaultReply> {
  return new Response(null, { status: 501 })
}
