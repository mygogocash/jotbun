import { Injectable } from '@nestjs/common';

/**
 * Optional analytics contract. No provider is registered in this standalone
 * service, so no events leave it. A consent-aware sink can implement this
 * contract without coupling Spend back to the monorepo.
 */
@Injectable()
export abstract class AnalyticsService {
  abstract capture(
    event: string,
    context: { userId: string; distinctId: string; platform: string },
    properties: Record<string, unknown>,
  ): Promise<void>;
}
