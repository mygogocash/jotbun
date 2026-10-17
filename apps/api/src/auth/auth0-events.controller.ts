import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Access } from './auth-route.decorator';
import { EVENT_SIGNATURE_HEADER } from './auth0-event-verifier';
import { SecurityEventService } from './auth0-events.service';

/**
 * Provider security events (an Auth0 Action, or operator tooling). Public:
 * the request carries no user credentials, so the signed envelope is the
 * only authentication, checked before anything is read or written.
 */
@Controller('v1')
export class Auth0EventsController {
  constructor(private readonly events: SecurityEventService) {}

  @Post('auth/provider-events')
  @Access('public')
  @HttpCode(200)
  async receive(@Req() req: Request & { rawBody?: Buffer }, @Headers(EVENT_SIGNATURE_HEADER) signature: string | undefined): Promise<{ result: 'applied' | 'duplicate' }> {
    return { result: await this.events.handleSecurityEvent({ rawBody: req.rawBody, signature }) };
  }
}
