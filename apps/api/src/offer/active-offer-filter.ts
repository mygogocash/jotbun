import type { OfferStatus, PartnerAvailability } from './schemas/offer.schema';

/**
 * Byte copy of the monorepo catalogue liveness rule
 * (`apps/api/src/offer/active-offer-filter.ts`): `status` stays `$nin` so
 * legacy rows without a status field still count as live.
 *
 * Currently used only by specs. The live hint path is unwired until the
 * catalog HTTP client lands (see `src/offer/schemas/offer.schema.ts`).
 */
export const ACTIVE_OFFER_FILTER = {
  disabled: { $ne: true },
  status: { $nin: ['pending_review', 'rejected'] as OfferStatus[] },
  partner_availability: { $ne: 'unavailable' as PartnerAvailability },
};
