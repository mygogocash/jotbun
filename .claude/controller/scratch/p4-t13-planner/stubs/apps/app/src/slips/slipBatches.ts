// RED stub (P4-T13): the final interface with no behaviour. Step 4 replaces this file.
import type { SlipBatchRequest, SlipOrigin } from '@gogospend/contracts';

import type { ShrunkImage } from './imageShrink.ts';

export type ReadySlip = { assetId: string; refHash: string; image: ShrunkImage; album: string | null; origin: SlipOrigin };

/** The POST /v1/slips body for these slips. */
export function slipBatchRequest(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): SlipBatchRequest {
  void slips;
  return { ...header, slips: [] };
}

/** The UTF-8 length of the JSON body the transport sends for these slips. */
export function slipBatchBytes(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): number {
  void slips;
  void header;
  return 0;
}

/** The slips in order, in batches of at most 5 slips and 8 MiB of JSON. */
export function buildSlipBatches(slips: readonly ReadySlip[], header: Omit<SlipBatchRequest, 'slips'>): ReadySlip[][] {
  void slips;
  void header;
  return [];
}
