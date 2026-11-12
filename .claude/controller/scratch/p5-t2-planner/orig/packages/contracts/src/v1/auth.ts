/**
 * v1 auth wire types. Challenge/bootstrap behaviour is implemented by F4;
 * these shapes are published first so the server and app agree on them.
 */

export const REAUTH_PURPOSES = [
  "bootstrap",
  "export",
  "link",
  "global_logout",
  "deletion",
] as const;
export type ReauthPurpose = (typeof REAUTH_PURPOSES)[number];

export type AuthChallengeRequest = {
  request_id: string;
  purpose: ReauthPurpose;
  command_id: string;
};

export type AuthChallenge = {
  challenge_id: string;
  nonce: string;
  expires_at: string;
};

/** The ID token is accepted only here and at /v1/auth/proofs, never as a Bearer credential. */
export type BootstrapRequest = {
  challenge_id: string;
  id_token: string;
};

export type BootstrapResult = {
  account_id: string;
  binding: string;
  session_generation: number;
};

/** Completes a non-bootstrap challenge; the proof is then consumed by its command. */
export type ProofRequest = {
  challenge_id: string;
  id_token: string;
};

export type ProofResult = {
  proof_id: string;
  expires_at: string;
};

/**
 * POST /v1/me/global-logout (Idempotency-Key = the proof's command id).
 * Every binding is dead when this returns; new sign-ins wait until Auth0
 * refresh grants are revoked (`provider_cleanup`). A retry after a lost
 * response gets 401 SESSION_REQUIRED, which the app treats as signed out.
 */
export type GlobalLogoutRequest = {
  proof_id: string;
};

export type GlobalLogoutResult = {
  generation: number;
  provider_cleanup: "pending";
};

/**
 * POST /v1/me/identities (Idempotency-Key = the command id of both link
 * challenges): adds a second sign-in method to this account. Needs a fresh
 * `link` proof of the signed-in identity and a fresh login of the other
 * identity - an ID token whose nonce belongs to a second `link` challenge
 * issued to this account for the same command. The other identity must be
 * one that could sign in (verified email, not blocked). Every binding ends
 * when this returns; sign in again once `provider_cleanup` clears. If the
 * other identity's own account holds data, it is refused with 409
 * ACCOUNT_LINK_CONFLICT; an empty one is folded into this account. Needs the
 * current policy accepted.
 */
export type LinkIdentityRequest = {
  proof_id: string;
  secondary_challenge_id: string;
  secondary_id_token: string;
};

export type LinkIdentityResult = {
  generation: number;
  provider_cleanup: "pending";
  /** Merging the two Auth0 users follows in the background; either login already reaches this account. */
  provider_link: "pending";
};

export const CLIENT_PLATFORMS = ["ios", "android"] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export type ClientVersion = {
  platform: ClientPlatform;
  /** `major.minor.patch`, no pre-release or build suffix. */
  version: string;
};

/** Value for the `x-gogospend-client` header. */
export function formatClientHeader(client: ClientVersion): string {
  return `${client.platform}/${client.version}`;
}

const VERSION_PATTERN = "(?:0|[1-9][0-9]{0,5})\\.(?:0|[1-9][0-9]{0,5})\\.(?:0|[1-9][0-9]{0,5})";
const VERSION = new RegExp(`^${VERSION_PATTERN}$`);
const CLIENT_HEADER = new RegExp(`^(ios|android)/(${VERSION_PATTERN})$`);

/** Parses `x-gogospend-client`; anything not exactly `<platform>/<major.minor.patch>` is null. */
export function parseClientHeader(value: unknown): ClientVersion | null {
  if (typeof value !== "string") return null;
  const match = CLIENT_HEADER.exec(value);
  if (!match) return null;
  return { platform: match[1] as ClientPlatform, version: match[2] };
}

/**
 * Orders two `major.minor.patch` strings numerically; returns -1, 0 or 1.
 * Throws on a malformed operand so a mistyped minimum can never fail open.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  if (!VERSION.test(a) || !VERSION.test(b)) {
    throw new TypeError("compareVersions needs two major.minor.patch versions.");
  }
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}
