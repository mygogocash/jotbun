import { Module } from '@nestjs/common';

import { TermsAcceptanceGuard } from './terms-acceptance.guard';

@Module({
  providers: [TermsAcceptanceGuard],
  exports: [TermsAcceptanceGuard],
})
export class LegalDocumentModule {}
