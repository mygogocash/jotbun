/**
 * Minimal offer-shape stub for the standalone spend service.
 *
 * The monorepo's Offer model is NOT registered here on purpose: the only
 * spend reader is the missed-cashback hint (`SpendService` returns an empty
 * hint map when no offer model is injected — fail-closed, see the
 * `if (!this.offerModel) return found` guard). This file keeps the shared
 * liveness-filter types compiling and documents the upgrade path: point the
 * hint at the cashback catalog over HTTP instead of re-adding a direct
 * model dependency.
 */
export type PartnerAvailability = 'unknown' | 'available' | 'unavailable';
export type OfferStatus = 'pending_review' | 'approved' | 'rejected';

export class Offer {
  offer_name?: string;
  merchant_id?: unknown;
}
