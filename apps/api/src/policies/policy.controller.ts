import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { assertKnownFields } from '@gogospend/contracts';
import type { PolicyVersionDto, PrivacyPreferences, SessionContext } from '@gogospend/contracts';

import { Access } from '../auth/auth-route.decorator';
import { CurrentSession } from '../auth/request-context';
import { PolicyService } from './policy.service';

@Controller('v1')
export class PolicyController {
  constructor(private readonly policies: PolicyService) {}

  /** Published policy text; public so it can be read before sign-in. */
  @Get('policies')
  @Access('public')
  list(): Promise<PolicyVersionDto[]> {
    return this.policies.published();
  }

  /** bound_session, not current_policy: accepting must work while acceptance is pending. */
  @Post('me/policy-acceptances')
  @Access('bound_session')
  @HttpCode(204)
  async accept(@CurrentSession() session: SessionContext, @Body() body: unknown): Promise<void> {
    const input = assertKnownFields(body, ['kind', 'version']);
    await this.policies.accept(session, input.kind, input.version);
  }

  @Put('me/privacy-preferences')
  @Access('bound_session')
  setPrivacy(@CurrentSession() session: SessionContext, @Body() body: unknown): Promise<PrivacyPreferences> {
    const input = assertKnownFields(body, ['analytics']);
    return this.policies.setPrivacy(session, input.analytics);
  }
}
