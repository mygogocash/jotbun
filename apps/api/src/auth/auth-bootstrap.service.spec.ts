import type { Pool } from 'pg';

import { ProblemException } from '../common/api-problem.filter';
import { TEST_CLIENT_ID, startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { AuthBootstrapService } from './auth-bootstrap.service';
import { Auth0KeySource } from './auth0-key-source';
import { ProfileUnavailableError } from './auth0-profile.client';
import type { Auth0ProfileGateway, TrustedProfile } from './auth0-profile.client';
import { OidcProofVerifier, sha256 } from './oidc-proof-verifier';
import type { VerifiedOidcProof } from './oidc-proof-verifier';

const CHALLENGE = '0192f0c1-7b3a-7c3e-9d4f-0000000000c1';
const ACCOUNT = '0192f0c1-7b3a-7c3e-9d4f-0000000000a1';
const now = () => Math.floor(Date.now() / 1000);

let issuer: JwksFixture;
let proof: VerifiedOidcProof;
const identity = () => ({ issuer: issuer.issuer, subject: 'auth0|boot', clientId: TEST_CLIENT_ID, scopes: [] });

type Call = { text: string; values: unknown[] };
// Answers the read-only challenge pre-check first, then the bootstrap routine.
function fakePool(outcome: string, calls: Call[] = [], challengeOpen = true): Pool {
  return {
    query: async (text: string, values: unknown[]) => {
      calls.push({ text, values });
      if (text.includes('gogospend_check_challenge')) return { rows: [{ state: challengeOpen ? 'open' : 'invalid' }] };
      return { rows: [{ outcome, account_id: ACCOUNT, session_generation: 2 }] };
    },
  } as unknown as Pool;
}
const bootstrapCalls = (calls: Call[]) => calls.filter((call) => call.text.includes('gogospend_bootstrap('));
const profile = (overrides: Partial<TrustedProfile> = {}): Auth0ProfileGateway => ({
  getTrustedProfile: async () => ({ subject: 'auth0|boot', emailVerified: true, connection: 'Username-Password-Authentication', blocked: false, ...overrides }),
});

async function problem(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}${error.problem.messageKey ? ` ${error.problem.messageKey}` : ''}`;
    throw error;
  }
}

beforeAll(async () => {
  issuer = await startJwksFixture();
  const verifier = new OidcProofVerifier(issuer.issuer, new Auth0KeySource(issuer.issuer));
  const token = await issuer.sign({ iss: issuer.issuer, sub: 'auth0|boot', aud: TEST_CLIENT_ID, nonce: 'n-1', auth_time: now(), iat: now(), exp: now() + 600 });
  proof = await verifier.verifyChallenge(identity(), CHALLENGE, token);
});

afterAll(async () => {
  await issuer.close();
});

describe('bootstrap orchestration', () => {
  it('returns a fresh 32-byte binding once and stores only its digest', async () => {
    const calls: Call[] = [];
    const result = await new AuthBootstrapService(fakePool('created', calls), profile()).bootstrap(identity(), proof);
    expect(result.account_id).toBe(ACCOUNT);
    expect(result.session_generation).toBe(2);
    expect(result.binding).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [boot] = bootstrapCalls(calls);
    expect(bootstrapCalls(calls)).toHaveLength(1);
    expect(JSON.stringify(calls.map((call) => call.values))).not.toContain(result.binding);
    expect((boot.values[8] as Buffer).equals(sha256(result.binding))).toBe(true);
    expect((boot.values[4] as Buffer).equals(sha256('n-1'))).toBe(true);
  });

  it.each([
    ['profile outage', profile(), new ProfileUnavailableError(), '503 SERVICE_UNAVAILABLE'],
    ['blocked in Auth0', profile({ blocked: true }), null, '403 ACCOUNT_UNAVAILABLE'],
    ['unverified email', profile({ emailVerified: false }), null, '403 ACCOUNT_UNAVAILABLE errors.email_unverified'],
    ['profile for another user', profile({ subject: 'auth0|other' }), null, '403 ACCOUNT_UNAVAILABLE'],
  ] as const)('stops before consuming the challenge on %s', async (_name, gateway, failure, expected) => {
    const calls: Call[] = [];
    const profiles: Auth0ProfileGateway = failure ? { getTrustedProfile: async () => { throw failure; } } : gateway;
    expect(await problem(() => new AuthBootstrapService(fakePool('created', calls), profiles).bootstrap(identity(), proof))).toBe(expected);
    expect(bootstrapCalls(calls)).toHaveLength(0);
  });

  it('refuses a proof for an unknown, used or mismatched challenge before calling Auth0', async () => {
    let lookups = 0;
    const counting: Auth0ProfileGateway = { getTrustedProfile: async (who) => { lookups += 1; return profile().getTrustedProfile(who); } };
    const calls: Call[] = [];
    expect(await problem(() => new AuthBootstrapService(fakePool('created', calls, false), counting).bootstrap(identity(), proof))).toBe('401 PROOF_INVALID');
    expect(lookups).toBe(0);
    expect(bootstrapCalls(calls)).toHaveLength(0);
  });

  it.each([
    ['challenge_used', '409 CHALLENGE_USED'],
    ['challenge_invalid', '401 PROOF_INVALID'],
    ['reauth_required', '401 REAUTH_REQUIRED'],
    ['blocked', '403 ACCOUNT_UNAVAILABLE'],
    ['account_unavailable', '403 ACCOUNT_UNAVAILABLE'],
  ])('maps the %s outcome to %s', async (outcome, expected) => {
    expect(await problem(() => new AuthBootstrapService(fakePool(outcome), profile()).bootstrap(identity(), proof))).toBe(expected);
  });

  it('refuses a proof made for a different principal', async () => {
    const other = { ...identity(), subject: 'auth0|other' };
    expect(await problem(() => new AuthBootstrapService(fakePool('created'), profile()).bootstrap(other, proof))).toBe('401 PROOF_INVALID');
  });
});
