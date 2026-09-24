import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  TERMS_ACCESS_KEY,
  type TermsAccessClassification,
} from './terms-access.decorator';

const TERMS_CHECK_TIMEOUT_MS = 10_000;

/**
 * Standalone TermsAcceptanceGuard. Same route contract as the monorepo guard
 * (missing classification = 500, `essential` = pass-through, stale terms =
 * 428 `TERMS_REACCEPTANCE_REQUIRED`), but the acceptance read goes to the
 * GoGoCash legal API over HTTP instead of a local collection.
 *
 * Honest-unavailable: with no `LEGAL_API_URL` configured the check is
 * skipped with a warning (dev/single-deploy). With it configured, a failed
 * check fails CLOSED (503) — never a silent bypass.
 */
@Injectable()
export class TermsAcceptanceGuard implements CanActivate {
  private readonly logger = new Logger(TermsAcceptanceGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const classification = this.reflector.getAllAndOverride<
      TermsAccessClassification | undefined
    >(TERMS_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    if (!classification) {
      throw new InternalServerErrorException(
        'Terms access classification is missing',
      );
    }
    if (classification === 'essential') return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { sub?: string } }>();
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('Missing authenticated user');

    const base = process.env.LEGAL_API_URL?.trim();
    if (!base) {
      this.logger.warn(
        'LEGAL_API_URL unset — terms re-acceptance check skipped (dev mode)',
      );
      return true;
    }
    const key = process.env.INTERNAL_API_KEY?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'Terms check misconfigured (INTERNAL_API_KEY missing)',
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TERMS_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${base.replace(/\/$/, '')}/internal/legal/acceptance-status?userId=${encodeURIComponent(userId)}`,
        {
          headers: { authorization: `Bearer ${key}` },
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        throw new ServiceUnavailableException(
          'Terms acceptance check unavailable',
        );
      }
      const status = (await res.json()) as { required?: boolean };
      if (status.required) {
        throw new ServiceUnavailableException('Terms re-acceptance required');
      }
      return true;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `terms acceptance check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Terms acceptance check unavailable',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
