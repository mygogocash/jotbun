/** F5's session states (master plan). */
export const SESSION_STATES = ['signed_out', 'hydrating', 'authenticating', 'bootstrap_pending', 'active', 'locked', 'reauth_required'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** What the transport and screens see. `epoch` is installation-local and only moves on an identity change. */
export type SessionSnapshot = { accountId: string | null; binding: string | null; epoch: number; state: SessionState };

export type SessionEvent =
  | { type: 'hydrate_start' }
  | { type: 'hydrated'; accountId: string; binding: string }
  | { type: 'hydrate_empty' }
  | { type: 'sign_in_start' }
  | { type: 'authenticated' }
  | { type: 'bootstrapped'; accountId: string; binding: string }
  | { type: 'cancelled' }
  | { type: 'token_refreshed' }
  | { type: 'auth_denied' }
  | { type: 'reauth_required' }
  /** A stored binding without usable credentials (cold start, or after a cancelled re-sign-in). */
  | { type: 'locked'; accountId: string; binding: string }
  | { type: 'signed_out' };

export const INITIAL_SESSION: SessionSnapshot = { accountId: null, binding: null, epoch: 0, state: 'signed_out' };

const FROM: Record<SessionEvent['type'], readonly SessionState[] | 'any'> = {
  hydrate_start: ['signed_out', 'active', 'locked', 'reauth_required'],
  hydrated: ['hydrating'],
  hydrate_empty: ['hydrating'],
  sign_in_start: ['signed_out', 'active', 'locked', 'reauth_required'],
  authenticated: ['authenticating'],
  bootstrapped: ['bootstrap_pending'],
  cancelled: ['authenticating', 'bootstrap_pending'],
  token_refreshed: [],
  auth_denied: ['active'],
  reauth_required: ['active', 'locked'],
  locked: ['hydrating', 'signed_out'],
  signed_out: 'any',
};

const identity = (snapshot: SessionSnapshot) => `${snapshot.accountId ?? ''}|${snapshot.binding ?? ''}`;

/**
 * The session's state machine. The epoch moves exactly when the identity
 * (account or binding) changes - sign-in, account switch, a new binding,
 * sign-out - and never on a token refresh; every async callback compares it.
 * While hydrating or authenticating there is no account, so a previous
 * account's private data is never shown. An event that makes no sense in the
 * current state changes nothing.
 */
export function reduceSession(snapshot: SessionSnapshot, event: SessionEvent): SessionSnapshot {
  const from = FROM[event.type];
  if (from !== 'any' && !from.includes(snapshot.state)) return snapshot;
  const next = (change: Omit<SessionSnapshot, 'epoch'>): SessionSnapshot => {
    const candidate = { ...change, epoch: snapshot.epoch };
    if (identity(candidate) !== identity(snapshot)) candidate.epoch = snapshot.epoch + 1;
    return candidate;
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
    case 'signed_out':
      return next({ state: 'signed_out', accountId: null, binding: null });
    case 'sign_in_start':
      return next({ state: 'authenticating', accountId: null, binding: null });
    case 'authenticated':
      return next({ state: 'bootstrap_pending', accountId: null, binding: null });
    case 'auth_denied':
      return next({ state: 'locked', accountId: snapshot.accountId, binding: snapshot.binding });
    case 'reauth_required':
      return next({ state: 'reauth_required', accountId: snapshot.accountId, binding: null });
    case 'token_refreshed':
      return snapshot;
  }
}
