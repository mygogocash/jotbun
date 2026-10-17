/** F5's session states (master plan). */
export const SESSION_STATES = ['signed_out', 'hydrating', 'authenticating', 'bootstrap_pending', 'active', 'locked', 'reauth_required'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** What the transport and screens see. `epoch` is installation-local and only moves on an identity change or a sign-out. */
export type SessionSnapshot = { accountId: string | null; binding: string | null; epoch: number; state: SessionState };

export type SessionEvent =
  | { type: 'hydrate_start' }
  | { type: 'hydrated'; accountId: string; binding: string }
  | { type: 'hydrate_empty' }
  | { type: 'sign_in_start' }
  | { type: 'authenticated' }
  /** The server accepted a sign-in: from a first sign-in, or beside an existing session (an account switch or a new sign-in after a lock). */
  | { type: 'bootstrapped'; accountId: string; binding: string }
  | { type: 'cancelled' }
  /** A forced refresh worked: a locked session is usable again (same identity, same epoch). */
  | { type: 'token_refreshed' }
  | { type: 'auth_denied' }
  /** The server no longer honours this binding: the identity and its drafts stay until a new sign-in or a sign-out. */
  | { type: 'reauth_required' }
  /** A stored binding without usable credentials (cold start). */
  | { type: 'locked'; accountId: string; binding: string }
  | { type: 'signed_out' };

export const INITIAL_SESSION: SessionSnapshot = { accountId: null, binding: null, epoch: 0, state: 'signed_out' };

const FROM: Record<SessionEvent['type'], readonly SessionState[] | 'any'> = {
  // Only a signed-out session hydrates; a locked one recovers through `hydrated` or `token_refreshed`.
  hydrate_start: ['signed_out'],
  hydrated: ['hydrating', 'locked'],
  hydrate_empty: ['hydrating'],
  // A sign-in from an existing session runs beside it and never leaves it until `bootstrapped`.
  sign_in_start: ['signed_out'],
  authenticated: ['authenticating'],
  bootstrapped: ['bootstrap_pending', 'active', 'locked', 'reauth_required'],
  cancelled: ['authenticating', 'bootstrap_pending'],
  token_refreshed: ['locked'],
  auth_denied: ['active'],
  reauth_required: ['active', 'locked'],
  locked: ['hydrating'],
  signed_out: 'any',
};

/** Whether the machine accepts `type` in the current state (a refused event must have no side effects). */
export function accepts(snapshot: SessionSnapshot, type: SessionEvent['type']): boolean {
  const from = FROM[type];
  return from === 'any' || from.includes(snapshot.state);
}

const identity = (snapshot: Pick<SessionSnapshot, 'accountId' | 'binding'>) => `${snapshot.accountId ?? ''}|${snapshot.binding ?? ''}`;

/**
 * The session's state machine. The epoch moves exactly when the identity
 * (account or binding) changes - sign-in, account switch, a new binding - and
 * on every sign-out, even one that interrupts a sign-in still establishing its
 * identity; never on a token refresh, a lock or a server-ended session. Every
 * async callback compares it. While hydrating or authenticating there is no
 * account, so a previous account's private data is never shown. An event that
 * makes no sense in the current state changes nothing.
 */
export function reduceSession(snapshot: SessionSnapshot, event: SessionEvent): SessionSnapshot {
  if (!accepts(snapshot, event.type)) return snapshot;
  const next = (change: Omit<SessionSnapshot, 'epoch'>, newEpoch = false): SessionSnapshot => {
    const moved = newEpoch || identity(change) !== identity(snapshot);
    if (!moved && change.state === snapshot.state) return snapshot;
    return { ...change, epoch: moved ? snapshot.epoch + 1 : snapshot.epoch };
  };
  switch (event.type) {
    case 'hydrate_start':
      return next({ state: 'hydrating', accountId: null, binding: null });
    case 'hydrated':
    case 'bootstrapped':
      return next({ state: 'active', accountId: event.accountId, binding: event.binding });
    case 'locked':
      return next({ state: 'locked', accountId: event.accountId, binding: event.binding });
    case 'hydrate_empty':
    case 'cancelled':
      return next({ state: 'signed_out', accountId: null, binding: null });
    case 'signed_out':
      return next({ state: 'signed_out', accountId: null, binding: null }, snapshot.state !== 'signed_out');
    case 'sign_in_start':
      return next({ state: 'authenticating', accountId: null, binding: null });
    case 'authenticated':
      return next({ state: 'bootstrap_pending', accountId: null, binding: null });
    case 'token_refreshed':
      return next({ state: 'active', accountId: snapshot.accountId, binding: snapshot.binding });
    case 'auth_denied':
      return next({ state: 'locked', accountId: snapshot.accountId, binding: snapshot.binding });
    case 'reauth_required':
      return next({ state: 'reauth_required', accountId: snapshot.accountId, binding: snapshot.binding });
  }
}
