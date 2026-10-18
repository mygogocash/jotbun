// Real sign-in for integration tests: synthetic issuer tokens through the
// actual challenge, proof and bootstrap routines. Test use only.
import { randomUUID } from 'node:crypto';

import type { ApiIdentity, AuthChallenge, ReauthPurpose, SessionContext } from '@gogospend/contracts';
import type { JWTPayload } from 'jose';
import type { Pool } from 'pg';

import { AuthBootstrapService } from '../auth/auth-bootstrap.service';
import { Auth0KeySource } from '../auth/auth0-key-source';
import type { Auth0ProfileGateway } from '../auth/auth0-profile.client';
import { OidcProofVerifier } from '../auth/oidc-proof-verifier';
import type { VerifiedOidcProof } from '../auth/oidc-proof-verifier';
import { ReauthenticationService } from '../auth/reauthentication.service';
import { SqlSessionResolver } from '../auth/session.repository';
import { TEST_CLIENT_ID } from './jwks-server';
import type { JwksFixture } from './jwks-server';

export type SignedUp = { who: ApiIdentity; accountId: string; binding: string; session: SessionContext };

const trusting: Auth0ProfileGateway = {
  getTrustedProfile: async (identity) => ({ subject: identity.subject, emailVerified: true, connection: 'test', blocked: false }),
};

export function authFixtures(issuer: JwksFixture, pool: Pool) {
  const now = () => Math.floor(Date.now() / 1000);
  const verifier = new OidcProofVerifier(issuer.issuer, new Auth0KeySource(issuer.issuer));
  const reauth = new ReauthenticationService(pool);
  const bootstrapper = new AuthBootstrapService(pool, trusting);
  const resolver = new SqlSessionResolver(pool);

  const identity = (subject = `auth0|${randomUUID()}`): ApiIdentity => ({ issuer: issuer.issuer, subject, clientId: TEST_CLIENT_ID, scopes: [] });

  const challengeFor = (who: ApiIdentity, purpose: ReauthPurpose = 'bootstrap', commandId: string = randomUUID()): Promise<AuthChallenge> =>
    reauth.issueChallenge(who, { requestId: randomUUID(), purpose, commandId });

  async function proofFor(who: ApiIdentity, challenge: AuthChallenge, claims: JWTPayload = {}): Promise<VerifiedOidcProof> {
    const token = await issuer.sign({ iss: issuer.issuer, sub: who.subject, aud: TEST_CLIENT_ID, nonce: challenge.nonce, auth_time: now(), iat: now(), exp: now() + 600, ...claims });
    return verifier.verifyChallenge(who, challenge.challenge_id, token);
  }

  async function signIn(who: ApiIdentity): Promise<SignedUp> {
    const result = await bootstrapper.bootstrap(who, await proofFor(who, await challengeFor(who)));
    const session = await resolver.resolve(who, result.binding);
    if (!session) throw new Error('fresh binding did not resolve');
    return { who, accountId: result.account_id, binding: result.binding, session };
  }

  /** A proven, unconsumed proof for this account, purpose and command. */
  async function proven(who: ApiIdentity, purpose: Exclude<ReauthPurpose, 'bootstrap'>, commandId: string): Promise<string> {
    const challenge = await challengeFor(who, purpose, commandId);
    return (await reauth.prove(await proofFor(who, challenge))).proof_id;
  }

  return { identity, challengeFor, proofFor, signIn, signUp: () => signIn(identity()), proven, resolver, bootstrapper, reauth };
}
