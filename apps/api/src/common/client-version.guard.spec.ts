import type { Request } from 'express';

import { ProblemException } from './api-problem.filter';
import { ClientVersionGuard, minimumClientVersionsFromEnv } from './client-version.guard';

const guard = new ClientVersionGuard({ ios: '1.4.0', android: '1.2.0' });
const request = (client?: string | string[]) => ({ headers: client === undefined ? {} : { 'x-gogospend-client': client } }) as unknown as Request;

function outcome(access: Parameters<ClientVersionGuard['check']>[0], client?: string | string[]): string {
  try {
    guard.check(access, request(client));
    return 'allowed';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

describe('client version gate', () => {
  it.each([undefined, '', 'ios/1.4', 'web/9.9.9', 'ios/1.4.0-beta', ['ios/1.4.0', 'ios/1.4.0']])('rejects missing or malformed header %p on a private route', (client) => {
    expect(outcome('bound_session', client)).toBe('426 CLIENT_UPGRADE_REQUIRED');
  });

  it('rejects a version below its platform minimum on token-only and bound routes', () => {
    expect(outcome('token_only', 'ios/1.3.9')).toBe('426 CLIENT_UPGRADE_REQUIRED');
    expect(outcome('current_policy', 'android/1.1.99')).toBe('426 CLIENT_UPGRADE_REQUIRED');
  });

  it('allows the minimum and newer versions, per platform', () => {
    expect(outcome('bound_session', 'ios/1.4.0')).toBe('allowed');
    expect(outcome('recent_proof', 'ios/2.0.0')).toBe('allowed');
    expect(outcome('bound_session', 'android/1.2.0')).toBe('allowed');
  });

  it('never gates public routes, so health and policy text stay reachable', () => {
    expect(outcome('public')).toBe('allowed');
    expect(outcome('public', 'ios/0.0.1')).toBe('allowed');
  });

  it('refuses to start without valid minimum versions', () => {
    expect(() => minimumClientVersionsFromEnv({})).toThrow();
    expect(() => minimumClientVersionsFromEnv({ MIN_CLIENT_VERSION_IOS: '1.0.0' })).toThrow();
    expect(() => minimumClientVersionsFromEnv({ MIN_CLIENT_VERSION_IOS: 'v1.0.0', MIN_CLIENT_VERSION_ANDROID: '1.0.0' })).toThrow();
    expect(minimumClientVersionsFromEnv({ MIN_CLIENT_VERSION_IOS: '1.0.0', MIN_CLIENT_VERSION_ANDROID: '0.9.0' })).toEqual({ ios: '1.0.0', android: '0.9.0' });
  });
});
