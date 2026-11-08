import { randomUUID } from 'node:crypto';

import { AuthCancelled } from '../betterAuthPort.ts';
import type { BetterAuthClientLike, ClientResult, DeviceDto, SignInAnswer, SignInMethod } from '../betterAuthPort.ts';
import type { NativeIdToken, NativeSignIn } from '../nativeSignIn.ts';

export type FakeAuthServer = {
  client: BetterAuthClientLike;
  native(identities: { apple?: { sub: string; email: string }; google?: { sub: string; email: string } }): NativeSignIn;
  state: { offline: boolean; fail5xx: boolean; codeLimit: boolean; cancelNative: boolean; tokenTtlSeconds: number; existsWith: SignInMethod[] | null };
  codeFor(email: string): string;
  deleteSession(sessionId: string): void;
  calls: string[];
};

type User = { id: string; email: string; linked: { providerId: 'apple' | 'google'; accountId: string }[] };
type Sess = { id: string; userId: string; signedInAt: number; deleted: boolean };

const STALE_MS = 5 * 60 * 1000;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function codeForAddress(email: string): string {
  let hash = 0;
  for (const char of normalize(email)) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0;
  return String(100000 + (hash % 900000));
}

function b64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

/** The in-memory Better Auth the port tests talk to. No network. */
export function createFakeAuthServer(): FakeAuthServer {
  const calls: string[] = [];
  const state = { offline: false, fail5xx: false, codeLimit: false, cancelNative: false, tokenTtlSeconds: 3600, existsWith: null as SignInMethod[] | null };
  const users = new Map<string, User>();
  const byEmail = new Map<string, string>();
  const owners = new Map<string, string>();
  const sessions = new Map<string, Sess>();
  const seen = new Set<string>();
  const codes = new Map<string, string>();
  let cookie: string | null = null;
  let tokenSerial = 0;

  const ok = <T>(data: T): ClientResult<T> => ({ data, error: null });
  // 204 No Content, as Better Auth's client reads it: no data and no error (its JSON parser answers null for an empty body).
  const noContent = (): ClientResult<unknown> => ({ data: null, error: null });
  const fail = (status: number, code?: string, methods?: SignInMethod[]): ClientResult<never> => ({ data: null, error: { status, code, methods } });

  function blocked(): ClientResult<never> | null {
    if (state.offline && state.fail5xx) throw new Error('timeout');
    if (state.offline) return fail(0);
    if (state.fail5xx) return fail(500);
    return null;
  }

  function mint(sub: string, email?: string): string {
    tokenSerial += 1;
    const exp = Math.floor(Date.now() / 1000) + state.tokenTtlSeconds;
    return `e30.${b64url(JSON.stringify({ sub, exp, email, n: tokenSerial }))}.x`;
  }

  function subject(token: NativeIdToken): string {
    const part = token.token.split('.')[1] ?? '';
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    const json: unknown = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof json === 'object' && json !== null && 'sub' in json && typeof json.sub === 'string' ? json.sub : '';
  }

  function openSession(userId: string): Sess {
    const session: Sess = { id: randomUUID(), userId, signedInAt: Date.now(), deleted: false };
    sessions.set(session.id, session);
    cookie = session.id;
    return session;
  }

  function current(): Sess | ClientResult<never> {
    const down = blocked();
    if (down) return down;
    if (!cookie) return fail(401, 'SIGNED_OUT');
    const session = sessions.get(cookie);
    if (!session || session.deleted) return fail(401, 'SIGNED_OUT');
    if (Date.now() - session.signedInAt > STALE_MS) return fail(403, 'REAUTH_REQUIRED');
    return session;
  }

  function isSession(value: Sess | ClientResult<never>): value is Sess {
    return 'userId' in value;
  }

  const client: BetterAuthClientLike = {
    async sendSignInCode(email) {
      calls.push(`sendSignInCode:${email}`);
      const down = blocked();
      if (down) return down;
      if (state.codeLimit) return fail(429, 'CODE_LIMIT');
      const address = normalize(email);
      codes.set(address, codeForAddress(address));
      return ok({ success: true });
    },
    async signInWithCode(email, code) {
      calls.push(`signInWithCode:${email}`);
      const down = blocked();
      if (down) return down;
      if (state.codeLimit) return fail(429, 'CODE_LIMIT');
      const address = normalize(email);
      if (codes.get(address) !== code) return fail(400, 'WRONG_CODE');
      let userId = byEmail.get(address);
      const created = !seen.has(`email:${address}`);
      seen.add(`email:${address}`);
      if (!userId) {
        userId = randomUUID();
        const user: User = { id: userId, email: address, linked: [] };
        users.set(userId, user);
        byEmail.set(address, userId);
      }
      openSession(userId);
      return ok<SignInAnswer>({ created });
    },
    async signInWithIdToken(provider, idToken, requestSignUp) {
      calls.push(`signInWithIdToken:${provider}:${requestSignUp}`);
      const down = blocked();
      if (down) return down;
      if (state.codeLimit) return fail(429, 'CODE_LIMIT');
      if (requestSignUp && state.existsWith) return fail(403, 'ACCOUNT_EXISTS', [...state.existsWith]);
      const sub = subject(idToken);
      const key = `${provider}:${sub}`;
      let userId = owners.get(key);
      const created = !seen.has(key);
      seen.add(key);
      if (!userId) {
        userId = randomUUID();
        const email = `${sub}@${provider}.test`;
        users.set(userId, { id: userId, email, linked: [{ providerId: provider, accountId: sub }] });
        owners.set(key, userId);
      } else {
        const user = users.get(userId);
        if (user && !user.linked.some((link) => link.providerId === provider && link.accountId === sub)) user.linked.push({ providerId: provider, accountId: sub });
      }
      openSession(userId);
      return ok<SignInAnswer>({ created });
    },
    async session() {
      const down = blocked();
      if (down) return down;
      if (!cookie) return { data: null, error: null };
      const session = sessions.get(cookie);
      if (!session || session.deleted) return { data: null, error: null };
      const user = users.get(session.userId);
      if (!user) return { data: null, error: null };
      return ok({ user: { id: user.id, email: user.email }, session: { id: session.id } });
    },
    async token() {
      calls.push('token');
      const down = blocked();
      if (down) return down;
      if (!cookie) return fail(401, 'SIGNED_OUT');
      const session = sessions.get(cookie);
      if (!session || session.deleted) return fail(401, 'SIGNED_OUT');
      const user = users.get(session.userId);
      return ok({ token: mint(user?.id ?? session.userId, user?.email) });
    },
    async linkedAccounts() {
      calls.push('linkedAccounts');
      const session = current();
      if (!isSession(session)) return session;
      const user = users.get(session.userId);
      return ok(user ? user.linked.map((link) => ({ providerId: link.providerId, accountId: link.accountId })) : []);
    },
    async link(provider, idToken) {
      calls.push(`link:${provider}`);
      const session = current();
      if (!isSession(session)) return session;
      const user = users.get(session.userId);
      const sub = subject(idToken);
      if (user && !user.linked.some((item) => item.providerId === provider && item.accountId === sub)) user.linked.push({ providerId: provider, accountId: sub });
      const key = `${provider}:${sub}`;
      if (!owners.has(key) && user) owners.set(key, user.id);
      return ok({});
    },
    async unlink(provider) {
      calls.push(`unlink:${provider}`);
      const session = current();
      if (!isSession(session)) return session;
      const user = users.get(session.userId);
      if (user) user.linked = user.linked.filter((item) => item.providerId !== provider);
      return ok({});
    },
    async signOut() {
      calls.push('signOut');
      cookie = null;
      return ok({});
    },
    async devices() {
      calls.push('devices');
      const session = current();
      if (!isSession(session)) return session;
      const at = new Date(session.signedInAt).toISOString();
      const device: DeviceDto = { id: session.id, current: true, signed_in_at: at, last_active_at: at, user_agent: null };
      return ok({ devices: [device] });
    },
    async signOutDevice(id) {
      calls.push(`signOutDevice:${id}`);
      const session = current();
      if (!isSession(session)) return session;
      return noContent();
    },
    async signOutOtherDevices() {
      calls.push('signOutOtherDevices');
      const session = current();
      if (!isSession(session)) return session;
      return ok({ signed_out: 0 });
    },
    async signOutEverywhere() {
      calls.push('signOutEverywhere');
      const session = current();
      if (!isSession(session)) return session;
      return noContent();
    },
    hasStoredSession() {
      return cookie !== null;
    },
  };

  function nativeFn(identity: { sub: string; email: string } | undefined): (() => Promise<NativeIdToken>) | null {
    if (!identity) return null;
    return async () => {
      if (state.cancelNative) throw new AuthCancelled();
      return { token: mint(identity.sub, identity.email) };
    };
  }

  return {
    client,
    calls,
    state,
    codeFor(email) {
      return codes.get(normalize(email)) ?? '';
    },
    deleteSession(sessionId) {
      const session = sessions.get(sessionId);
      if (session) session.deleted = true;
    },
    native(identities) {
      return { apple: nativeFn(identities.apple), google: nativeFn(identities.google) };
    },
  };
}
