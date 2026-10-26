// Build-time stand-in for `@nestjs/core` (see nest-common.ts). Shared code
// only names these for route manifests and guard wiring, which the edge
// replaces with its own route table.
export class Reflector {
  getAllAndOverride(): undefined {
    return undefined;
  }
}

export class ModulesContainer extends Map<string, never> {}

export const APP_GUARD = 'APP_GUARD';
export const APP_FILTER = 'APP_FILTER';
