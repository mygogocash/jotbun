import { Injectable } from '@nestjs/common';

/**
 * No-op analytics seam. Spend services take it as `@Optional()` and make no
 * calls today; the class exists so the constructor signatures match the
 * monorepo and a real sink can be wired without touching spend code.
 */
@Injectable()
export class AnalyticsService {}
