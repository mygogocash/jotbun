// src/auth/firebase-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/user/schemas/user.schema';
import { verifyFirebaseIdToken } from './firebase-admin.provider';
import { firebaseSocialIdentityField } from './social-link-policy';

type CachedDecode = { sub: string; firebaseId: string; expiresAt: number };

const FIREBASE_TOKEN_CACHE = new Map<string, CachedDecode>();
const FIREBASE_TOKEN_CACHE_TTL_MS = 60 * 1000;
const FIREBASE_TOKEN_CACHE_MAX = 5000;

const cacheGet = (key: string): CachedDecode | null => {
  const hit = FIREBASE_TOKEN_CACHE.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    FIREBASE_TOKEN_CACHE.delete(key);
    return null;
  }
  return hit;
};

const cacheSet = (key: string, value: CachedDecode): void => {
  if (FIREBASE_TOKEN_CACHE.size >= FIREBASE_TOKEN_CACHE_MAX) {
    const firstKey = FIREBASE_TOKEN_CACHE.keys().next().value;
    if (firstKey) FIREBASE_TOKEN_CACHE.delete(firstKey);
  }
  FIREBASE_TOKEN_CACHE.set(key, value);
};

/*
 * #1880 — customer session revocation.
 *
 * Path 1 below used to set `request['user']` straight from the claims and
 * return, with no database read at all. That is why "sign out everywhere" was
 * unimplementable, and why even `disabled: true` left already-issued access
 * tokens working until they expired — up to 24 hours.
 *
 * The version is therefore checked on EVERY authenticated request. Keyed by
 * SUBJECT, not by token: keying on the token would let a revoked session keep
 * riding its own cached entry, because the entry needing invalidation is the
 * one it refreshes. Cache TTL is the revocation latency — 60s here, matching
 * the founder's "within a minute" call on #1880.
 */
type CachedSessionVersion = { expiresAt: number; version: number | null };

const SESSION_VERSION_CACHE = new Map<string, CachedSessionVersion>();
const SESSION_VERSION_CACHE_TTL_MS = 60 * 1000;
const SESSION_VERSION_CACHE_MAX = 5000;

/** Test seam. The cache is module-level, so specs would otherwise bleed. */
export const resetSessionVersionCacheForTests = (): void => {
  SESSION_VERSION_CACHE.clear();
};

/**
 * A token minted before this field existed carries no `session_version`, and a
 * user row predating it has none either. Both read as 0, so deploying this does
 * not sign anyone out — only an actual revocation moves the number.
 */
export const readSessionVersion = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
  ) {}

  /**
   * Current `session_version` for a subject, or null when it cannot be
   * established — account missing, or the read failed.
   *
   * Cached for 60s, which IS the revocation window: a bump takes effect once
   * every cached entry has aged out. Callers treat null as a refusal rather
   * than as "unknown, carry on", so a database outage cannot quietly disable
   * revocation for everyone.
   */
  /** Optional-auth routes reuse this so revoked tokens fall through to guest. */
  async liveSessionVersion(subject: string): Promise<number | null> {
    return this.resolveSessionVersion(subject);
  }

  private async resolveSessionVersion(subject: string): Promise<number | null> {
    const cached = SESSION_VERSION_CACHE.get(subject);
    if (cached && cached.expiresAt >= Date.now()) {
      return cached.version;
    }
    SESSION_VERSION_CACHE.delete(subject);

    let version: number | null = null;
    try {
      const stored = (await this.userModel
        .findOne({ _id: subject }, { disabled: 1, session_version: 1 })
        .lean()
        .exec()) as { disabled?: unknown; session_version?: unknown } | null;
      // A disabled account is refused on the same read. `disabled` used to be
      // checked only at refresh, so disabling an account left its live access
      // tokens working for up to 24 hours; null here means "refuse", which is
      // exactly the treatment a missing account already gets.
      version =
        stored && stored.disabled !== true
          ? readSessionVersion(stored.session_version)
          : null;
    } catch (error) {
      // Do NOT cache a failed read — a transient outage must not pin every
      // session shut for the full TTL. Refuse this request and retry the next.
      this.logger.error(
        `session_version lookup failed for ${subject}: ${String(error)}`,
      );
      return null;
    }

    if (SESSION_VERSION_CACHE.size >= SESSION_VERSION_CACHE_MAX) {
      const firstKey = SESSION_VERSION_CACHE.keys().next().value;
      if (firstKey) SESSION_VERSION_CACHE.delete(firstKey);
    }
    SESSION_VERSION_CACHE.set(subject, {
      expiresAt: Date.now() + SESSION_VERSION_CACHE_TTL_MS,
      version,
    });
    return version;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing token');
    }

    // Path 1: backend-issued JWT (existing behaviour, fast path).
    //
    // Verification and authorization are deliberately separated. They used to
    // share one `try`, so a rejection thrown inside it was swallowed by the
    // `catch` and only became a 401 because the Firebase path happened to fail
    // too — the right status for the wrong reason. A credential that verifies
    // but is not an access token is now refused outright.
    let backendClaims: Record<string, unknown> | null = null;
    try {
      backendClaims = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      // Not a backend JWT — fall through to Firebase ID token verification.
      backendClaims = null;
    }

    if (backendClaims) {
      // Every credential minted with JWT_SECRET that is NOT an access token
      // carries a `typ`; access tokens (`generateToken`) carry none. Requiring
      // its ABSENCE, rather than denying `typ === 'refresh'` by name, is what
      // stops the next token kind from silently authorizing API calls — the
      // OTP temp token slipped through precisely because it marked itself with
      // `type` rather than `typ` and the denylist could not see it.
      if (backendClaims.typ !== undefined && backendClaims.typ !== null) {
        throw new UnauthorizedException(
          'Your session has expired. Please sign in again.',
        );
      }

      // `sub` used to be assigned unconditionally from `userId`, and the guard
      // returned true regardless. `AuthService.generateTempToken` signs
      // `{ email, type: 'otp_verified' }` with this same secret and is handed
      // to the client, so that token authenticated a request as
      // `sub: undefined` — an authenticated principal with no user behind it.
      // Endpoints that treat `sub` as optional would then act on it.
      const subject =
        typeof backendClaims.userId === 'string'
          ? backendClaims.userId.trim()
          : '';
      if (!subject) {
        throw new UnauthorizedException(
          'Your session has expired. Please sign in again.',
        );
      }

      // #1880. The one authoritative read on this path. Without it the claims
      // are self-certifying and nothing can revoke them.
      const currentVersion = await this.resolveSessionVersion(subject);
      if (currentVersion === null) {
        // The account is gone, or the lookup failed. Fail closed: serving the
        // request would silently skip a security control.
        throw new UnauthorizedException(
          'Your session has expired. Please sign in again.',
        );
      }
      if (
        readSessionVersion(backendClaims.session_version) !== currentVersion
      ) {
        throw new UnauthorizedException(
          'Your session has expired. Please sign in again.',
        );
      }

      request['user'] = { ...backendClaims, sub: subject, userId: subject };
      return true;
    }

    // Path 2: Firebase ID token. Auto-refreshed by Firebase SDK on the client,
    // so users no longer need to re-login when our backend JWT expires.
    try {
      const cached = cacheGet(token);
      if (cached) {
        request['user'] = {
          sub: cached.sub,
          userId: cached.sub,
          firebaseId: cached.firebaseId,
        };
        return true;
      }

      const decoded = await verifyFirebaseIdToken(token);
      // Email fallback only for VERIFIED emails (mirrors signInFirebase):
      // an unverified-email token carrying someone else's address must never
      // resolve to that victim's account.
      const emailFallback =
        decoded.email && decoded.email_verified === true
          ? [{ email: decoded.email }]
          : [];
      // A Google/Facebook identity linked from Profile is stored in its own
      // field (`id_firebase` is single-valued), so without this the member could
      // complete that sign-in and then get 401 on every authenticated request —
      // the token's uid matches no `id_firebase`. Mirrors signInFirebase.
      const linkedSocialField = firebaseSocialIdentityField(
        decoded.firebase?.sign_in_provider,
      );
      const linkedSocialFallback = linkedSocialField
        ? [{ [linkedSocialField]: decoded.uid }]
        : [];
      const user = await this.userModel
        .findOne(
          {
            $or: [
              { id_firebase: decoded.uid },
              ...linkedSocialFallback,
              ...emailFallback,
            ],
          },
          { _id: 1, id_firebase: 1, id_google: 1, id_facebook: 1 },
        )
        .lean();

      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      // On a linked-social match the stored uid SHOULD differ — that is the
      // whole point of the extra field — so only the email-fallback case is
      // worth a warning.
      const matchedLinkedSocial = Boolean(
        linkedSocialField &&
        (user as unknown as Record<string, unknown>)[linkedSocialField] ===
          decoded.uid,
      );
      if (
        !matchedLinkedSocial &&
        user.id_firebase &&
        user.id_firebase !== decoded.uid
      ) {
        this.logger.warn(
          `Firebase uid mismatch on email-fallback login: token uid ${decoded.uid} resolved user ${String(user._id)} (stored uid differs)`,
        );
      }

      const sub = String(user._id);
      cacheSet(token, {
        sub,
        firebaseId: decoded.uid,
        expiresAt: Date.now() + FIREBASE_TOKEN_CACHE_TTL_MS,
      });

      request['user'] = { sub, userId: sub, firebaseId: decoded.uid };
      return true;
    } catch (errorData: any) {
      // Keep the raw upstream reason in server logs; clients get generic copy.
      this.logger.warn(
        `Firebase token verification failed: ${errorData?.message ?? 'unknown error'}`,
      );
      throw new UnauthorizedException(
        'Your session has expired. Please sign in again.',
      );
    }
  }
}
