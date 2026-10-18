import { RequestMethod } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { Reflector } from '@nestjs/core';

import { GATE_METADATA } from '../common/feature-gates';
import type { GateScope } from '../common/feature-gates';
import { ConfigurationError } from '../common/configuration-error';

/**
 * Every v1 route declares exactly one access class:
 * - public: no credentials (health, published policy text)
 * - token_only: verified API access token, no binding (challenge/bootstrap)
 * - bound_session: token + active application binding (private reads)
 * - current_policy: bound session + current required policy accepted (writes, uploads)
 * - recent_proof: bound session; the command also consumes a fresh
 *   purpose-bound proof (export, link, global logout, deletion). Exempt from
 *   the current-policy check so privacy operations stay reachable.
 */
export const ROUTE_ACCESS = ['public', 'token_only', 'bound_session', 'current_policy', 'recent_proof'] as const;
export type RouteAccess = (typeof ROUTE_ACCESS)[number];

export const ROUTE_ACCESS_METADATA = 'gogospend:route-access';

export function routeAccessOf(reflector: Reflector, context: ExecutionContext): RouteAccess | undefined {
  const access = reflector.getAllAndOverride<unknown>(ROUTE_ACCESS_METADATA, [context.getHandler(), context.getClass()]);
  return ROUTE_ACCESS.includes(access as RouteAccess) ? (access as RouteAccess) : undefined;
}

export const needsToken = (access: RouteAccess): boolean => access !== 'public';
export const needsBinding = (access: RouteAccess): boolean =>
  access === 'bound_session' || access === 'current_policy' || access === 'recent_proof';

/** `gates`: the operational gates (common/feature-gates.ts) that can pause the route. */
export type RouteManifestEntry = { route: string; access: RouteAccess | undefined; gates: readonly GateScope[] };

/** Every registered controller route with its declared access class. */
export function routeManifest(app: INestApplication): RouteManifestEntry[] {
  const entries: RouteManifestEntry[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const type = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!type) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, type) ?? '');
      const prototype = type.prototype as Record<string, unknown>;
      // Inherited handlers are served too, so walk the whole prototype chain.
      const names = new Set<string>();
      for (let level: object | null = prototype; level && level !== Object.prototype; level = Object.getPrototypeOf(level)) {
        for (const name of Object.getOwnPropertyNames(level)) names.add(name);
      }
      for (const name of names) {
        const handler = prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        const access = (Reflect.getMetadata(ROUTE_ACCESS_METADATA, handler) ?? Reflect.getMetadata(ROUTE_ACCESS_METADATA, type)) as unknown;
        const fullPath = `/${[base, path].filter(Boolean).join('/')}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
        const gates = (Reflect.getMetadata(GATE_METADATA, handler) ?? Reflect.getMetadata(GATE_METADATA, type) ?? []) as GateScope[];
        entries.push({
          route: `${method} ${fullPath}`,
          access: ROUTE_ACCESS.includes(access as RouteAccess) ? (access as RouteAccess) : undefined,
          gates: [...gates],
        });
      }
    }
  }
  return entries;
}

/** Startup check: an unclassified route stops the v1 app from starting. */
export function assertRoutesClassified(app: INestApplication): void {
  const missing = routeManifest(app).filter((entry) => !entry.access);
  if (missing.length > 0) {
    throw new ConfigurationError(`Unclassified v1 routes: ${missing.map((entry) => entry.route).join(', ')}`);
  }
}
