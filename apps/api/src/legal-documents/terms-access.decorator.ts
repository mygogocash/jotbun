import { SetMetadata } from '@nestjs/common';

export const TERMS_ACCESS_KEY = 'legal-terms:access';
export type TermsAccessClassification = 'essential' | 'current_required';

export const TermsAccess = (classification: TermsAccessClassification) =>
  SetMetadata(TERMS_ACCESS_KEY, classification);
