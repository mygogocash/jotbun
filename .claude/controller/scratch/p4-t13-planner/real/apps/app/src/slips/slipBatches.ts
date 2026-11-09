// Slip batches for POST /v1/slips (P4-T13, S5): at most SLIP_LIMITS.batchSlips (5) slips and
// SLIP_LIMITS.batchBytes (8 MiB) of JSON each, in order. The transport sends JSON.stringify(body)
// (src/api/client.ts), so a batch's size is that text's UTF-8 length; slipBatchRequest builds the
// one body both the count and the send use.
// Pure: no React, no native module.
import { SLIP_LIMITS } from '@gogospend/contracts';
import type { SlipBatchItem, SlipBatchRequest, SlipOrigin } from '@gogospend/contracts';

import type { ShrunkImage } from './imageShrink.ts';

export type ReadySlip = { assetId: string; refHash: string; image: ShrunkImage; album: string | null; origin: SlipOrigin };

const ALBUM_MAX = 60; // code points after NFC and trim: the contract's parseAlbum refuses the whole batch beyond it

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

// A slip's album as the server keeps it: NFC, trimmed, cut to 60 code points and trimmed again (a
// cut can end on a space); null when nothing is left.
function albumLabel(album: string | null): string | null {
  if (album === null) return null;
  const label = [...album.normalize('NFC').trim()].slice(0, ALBUM_MAX).join('').trim();
  return label === '' ? null : label;
}

function slipBatchItem(slip: ReadySlip): SlipBatchItem {
  return { ref_hash: slip.refHash, image_base64: slip.image.base64, media_type: slip.image.mediaType, album: albumLabel(slip.album), origin: slip.origin };
}

/** The POST /v1/slips body for these slips. */
export function slipBatchRequest(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): SlipBatchRequest {
  return { ...header, slips: slips.map(slipBatchItem) };
}

/** The UTF-8 length of the JSON body the transport sends for these slips. */
export function slipBatchBytes(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): number {
  return utf8Length(JSON.stringify(slipBatchRequest(slips, header)));
}

/**
 * The slips in order, in batches of at most 5 slips and 8 MiB of JSON. Each batch is measured
 * with `last: false`, the longer form, so it fits whichever `last` it is sent with. A slip too
 * large for a batch of its own throws RangeError (a shrink port never makes one).
 */
export function buildSlipBatches(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): ReadySlip[][] {
  const empty = slipBatchBytes([], { ...header, last: false });
  const batches: ReadySlip[][] = [];
  let batch: ReadySlip[] = [];
  let bytes = empty;
  for (const slip of slips) {
    const size = utf8Length(JSON.stringify(slipBatchItem(slip)));
    if (empty + size > SLIP_LIMITS.batchBytes) throw new RangeError('A slip is larger than a batch.');
    if (batch.length === SLIP_LIMITS.batchSlips || (batch.length > 0 && bytes + 1 + size > SLIP_LIMITS.batchBytes)) {
      batches.push(batch);
      batch = [];
      bytes = empty;
    }
    bytes += batch.length === 0 ? size : 1 + size; // a comma before every slip but the first
    batch.push(slip);
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
