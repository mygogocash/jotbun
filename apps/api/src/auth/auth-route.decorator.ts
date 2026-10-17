import { SetMetadata } from '@nestjs/common';

import { ROUTE_ACCESS_METADATA } from './route-policy';
import type { RouteAccess } from './route-policy';

/** Declares a route's (or controller's) access class; see route-policy.ts. */
export const Access = (access: RouteAccess): MethodDecorator & ClassDecorator => SetMetadata(ROUTE_ACCESS_METADATA, access);

export const ROUTE_SCOPES_METADATA = 'gogospend:route-scopes';

/**
 * API scopes the access token must carry (all of them), checked by
 * V1AccessGuard after token verification. Missing scope → 403.
 */
export const RequireScopes = (...scopes: string[]): MethodDecorator & ClassDecorator => SetMetadata(ROUTE_SCOPES_METADATA, scopes);
