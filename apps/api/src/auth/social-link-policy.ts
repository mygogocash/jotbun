/**
 * Which social identities may be linked to / unlinked from an existing account,
 * and whether removing one would lock the member out.
 *
 * Kept as pure functions with no Nest/Mongo dependency so the policy — the part
 * that decides whether a member can still sign in tomorrow — is unit-testable
 * without a database.
 */

/**
 * Providers whose identity can be linked to / unlinked from an existing
 * account via the generic `POST /auth/link/*` + `DELETE /auth/link/:provider`
 * routes.
 *
 * PARTNER providers (e.g. `minipay`) are deliberately NOT on this list. A
 * MiniPay link mints partner-program attribution and needs its own SIWE
 * verification flow — {@link file://./auth.service.ts | linkMiniPayIdentity}
 * — rather than the Firebase-ID-token / access-token shape the social routes
 * expect. Adding `'minipay'` here would route it into `attachSocialIdentity`
 * and bypass the SIWE nonce + domain checks; see #1060 Phase 11.
 */
export const LINKABLE_SOCIAL_PROVIDERS = [
  'google',
  'facebook',
  'line',
  'telegram',
] as const;

export type LinkableSocialProvider = (typeof LINKABLE_SOCIAL_PROVIDERS)[number];

/** Providers whose credential arrives as a Firebase ID token. */
export const FIREBASE_SOCIAL_PROVIDERS = ['google', 'facebook'] as const;

export type FirebaseSocialProvider = (typeof FIREBASE_SOCIAL_PROVIDERS)[number];

/**
 * The `User` field each provider's identity is stored in.
 *
 * Google and Facebook both arrive through Firebase, and `id_firebase` holds
 * exactly ONE uid, so a member who registered with LINE cannot store a linked
 * Google uid there. Each Firebase-social identity therefore gets its own field,
 * mirroring the existing `id_line` / `id_telegram` shape.
 */
export const SOCIAL_IDENTITY_FIELDS = {
  google: 'id_google',
  facebook: 'id_facebook',
  line: 'id_line',
  telegram: 'id_telegram',
} as const satisfies Record<LinkableSocialProvider, string>;

export function isLinkableSocialProvider(
  value: string,
): value is LinkableSocialProvider {
  return (LINKABLE_SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Maps a Firebase `sign_in_provider` claim onto the provider we link.
 *
 * Anything else — phone, password, apple.com, twitter.com — returns null so the
 * link endpoint fails closed rather than filing an unexpected credential under
 * one of the two fields the sign-in path knows how to resolve.
 */
export function firebaseSocialProviderFromSignInProvider(
  signInProvider: string | undefined | null,
): FirebaseSocialProvider | null {
  if (signInProvider === 'google.com') return 'google';
  if (signInProvider === 'facebook.com') return 'facebook';
  return null;
}

/** The link field a Firebase social sign-in should be resolved against. */
export function firebaseSocialIdentityField(
  signInProvider: string | undefined | null,
): 'id_google' | 'id_facebook' | null {
  const provider = firebaseSocialProviderFromSignInProvider(signInProvider);
  return provider ? SOCIAL_IDENTITY_FIELDS[provider] : null;
}

/**
 * Synthetic `id_firebase` values minted by the logins that never touch Firebase
 * (`line_<userId>`, `telegram_<id>`, `minipay:<address>`).
 *
 * These are JWT-binding filler, NOT a credential: nobody can present them to
 * Firebase to sign in. Counting one as a usable sign-in method is what would
 * let the unlink guard wave through the removal of a member's only real way in.
 */
export function isSyntheticFirebaseId(idFirebase?: string | null): boolean {
  const value = idFirebase?.trim() ?? '';
  if (!value) return true;
  return (
    value.startsWith('line_') ||
    value.startsWith('telegram_') ||
    value.startsWith('minipay:')
  );
}

/** The `provider` string each Firebase-social credential is stored under. */
const PROVIDER_STRINGS: Record<FirebaseSocialProvider, readonly string[]> = {
  google: ['google.com', 'google'],
  facebook: ['facebook.com', 'facebook'],
};

export type SignInMethodSnapshot = {
  id_firebase?: string | null;
  provider?: string | null;
  verified_phone_e164?: string | null;
  id_google?: string | null;
  id_facebook?: string | null;
  id_line?: string | null;
  id_telegram?: string | null;
};

export type SignInMethod = 'firebase' | 'phone' | LinkableSocialProvider;

function hasValue(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Every way this account can currently be signed into.
 *
 * - `firebase` — a real Firebase uid (Google/Facebook/Apple/email+password/…).
 *   `signInFirebase` resolves accounts by `id_firebase` first, so as long as the
 *   uid is real the original credential still works.
 * - `phone` — a Firebase-verified E.164 claim (`signInFirebase` resolves it via
 *   `findUserByPhone`).
 * - the linked social fields, each resolvable by its own lookup.
 */
export function listUsableSignInMethods(
  user: SignInMethodSnapshot,
): SignInMethod[] {
  const methods: SignInMethod[] = [];
  if (!isSyntheticFirebaseId(user.id_firebase)) methods.push('firebase');
  if (hasValue(user.verified_phone_e164)) methods.push('phone');
  for (const provider of LINKABLE_SOCIAL_PROVIDERS) {
    if (hasValue(user[SOCIAL_IDENTITY_FIELDS[provider]])) {
      methods.push(provider);
    }
  }
  return methods;
}

/**
 * True when the account's primary Firebase credential IS this provider.
 *
 * Such a link cannot be meaningfully removed: `signInFirebase` matches on
 * `id_firebase` before it looks at any link field, so clearing `id_google` on a
 * Google-registered account would report "unlinked" while Google sign-in kept
 * working. Refusing is the honest answer.
 */
export function isPrimarySignInProvider(
  user: SignInMethodSnapshot,
  provider: LinkableSocialProvider,
): boolean {
  if (provider !== 'google' && provider !== 'facebook') return false;
  if (isSyntheticFirebaseId(user.id_firebase)) return false;
  const stored = user.provider?.trim().toLowerCase() ?? '';
  return PROVIDER_STRINGS[provider].includes(stored);
}

export type UnlinkRefusalReason =
  'not-linked' | 'primary-method' | 'last-method';

/**
 * `reason` is present on BOTH branches on purpose: this package compiles with
 * `strictNullChecks: false`, which turns off narrowing on a boolean-literal
 * discriminant — `if (!decision.allowed)` would NOT give callers access to
 * `decision.reason`.
 */
export type UnlinkDecision =
  | { allowed: true; reason: null }
  | { allowed: false; reason: UnlinkRefusalReason };

/**
 * Decides whether `provider` may be unlinked.
 *
 * The "last method" rule is the one that matters: this is a wallet, so an
 * account with no remaining sign-in method is not an inconvenience, it is a
 * support ticket about real money.
 */
export function evaluateSocialUnlink(
  user: SignInMethodSnapshot,
  provider: LinkableSocialProvider,
): UnlinkDecision {
  if (isPrimarySignInProvider(user, provider)) {
    return { allowed: false, reason: 'primary-method' };
  }
  if (!hasValue(user[SOCIAL_IDENTITY_FIELDS[provider]])) {
    return { allowed: false, reason: 'not-linked' };
  }
  const remaining = listUsableSignInMethods(user).filter(
    (method) => method !== provider,
  );
  if (remaining.length === 0) {
    return { allowed: false, reason: 'last-method' };
  }
  return { allowed: true, reason: null };
}

// ── MiniPay (partner) unlink policy ─────────────────────────────────────────
//
// MiniPay is not a `LinkableSocialProvider` because it has its own SIWE
// verification path and lives in {@link ./auth.service.ts | linkMiniPayIdentity}.
// The unlink decision still shares the same lockout rule as the social
// providers: if this is the only way the account can be signed into, refuse.
//
// The wallet counts as a sign-in method when it is the account's primary
// credential — i.e. `id_firebase` is the synthetic `minipay:<addr>` filler
// that {@link ./auth.service.ts | signInMiniPaySiwe} mints. Every other
// registered method (real firebase uid, verified phone, linked social)
// already flows through {@link listUsableSignInMethods}; those keep working
// when the wallet is dropped.

export type MiniPaySignInSnapshot = SignInMethodSnapshot & {
  /** Present when the account has a MiniPay wallet linked via `User.address`. */
  address?: string | null;
};

export type MiniPayUnlinkRefusalReason = 'not-linked' | 'last-method';

export type MiniPayUnlinkDecision =
  | { allowed: true; reason: null }
  | { allowed: false; reason: MiniPayUnlinkRefusalReason };

/**
 * True when MiniPay is the account's primary sign-in credential — i.e. its
 * `id_firebase` is the synthetic `minipay:<addr>` filler minted by
 * `signInMiniPaySiwe`. Such an account can only sign back in via SIWE with
 * the linked wallet, so the wallet counts as a usable sign-in method for the
 * lockout guard.
 */
export function isMiniPayPrimaryAccount(
  user: Pick<SignInMethodSnapshot, 'id_firebase'>,
): boolean {
  const value = user.id_firebase?.trim() ?? '';
  return value.startsWith('minipay:');
}

/**
 * Decide whether the caller may unlink MiniPay from `user`.
 *
 * `hasLinkedIdentity` reflects the presence of an active row in
 * `user_identities` for `(provider='minipay', external_user_id=address)`.
 * The column and the identity row are the two writes {@link ./auth.service.ts | linkMiniPayIdentity}
 * emits, and either one existing is enough to say "there is something to
 * unlink" — this keeps the guard honest even mid-migration, when a legacy
 * account may have `User.address` set but no identity row yet.
 *
 * The last-method rule is deliberately the same shape as {@link evaluateSocialUnlink}:
 * MiniPay-primary + no other methods = refuse, because clearing the wallet
 * would leave the account with no way back in and this is a money account.
 */
export function evaluateMiniPayUnlink(
  user: MiniPaySignInSnapshot,
  hasLinkedIdentity: boolean,
): MiniPayUnlinkDecision {
  const walletPresent = hasLinkedIdentity || hasValue(user.address);
  if (!walletPresent) {
    return { allowed: false, reason: 'not-linked' };
  }
  const primary = isMiniPayPrimaryAccount(user);
  // Other sign-in methods that would survive the unlink. `listUsableSignInMethods`
  // already excludes the synthetic `minipay:` `id_firebase`, so counting its
  // return value directly is the right thing.
  const otherMethods = listUsableSignInMethods(user);
  if (primary && otherMethods.length === 0) {
    return { allowed: false, reason: 'last-method' };
  }
  return { allowed: true, reason: null };
}
