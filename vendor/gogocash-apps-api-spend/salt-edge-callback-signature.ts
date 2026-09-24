import { createVerify } from 'node:crypto';

/**
 * Salt Edge signs every callback it sends. Their documented scheme is
 *
 *   base64(sha256_signature(private_key, "callback_url|post_body"))
 *
 * delivered in the `Signature` header, with `Signature-key-version` naming the
 * key generation. We hold only the public half, so this verifies rather than
 * signs. See https://docs.saltedge.com/v6 — "Callbacks > Request identification".
 *
 * `post_body` is the bytes as sent. A re-serialised JSON object will not match:
 * key order and whitespace both move the hash, which is why this takes the raw
 * buffer preserved by `rawBody: true` in main.ts.
 */
export class SaltEdgeCallbackSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaltEdgeCallbackSignatureError';
  }
}

/**
 * Check a callback when we are equipped to, and say plainly when we are not.
 *
 * Verification needs both Salt Edge's public key and the exact URL they were
 * configured to call — the URL is part of the signed string, and rebuilding it
 * from the request is unreliable behind a proxy, so it is configuration rather
 * than a guess. Until both are set this returns `'unconfigured'` instead of
 * rejecting, so provisioning the key is what turns enforcement on rather than
 * a deploy silently closing the door on a live bank-link integration.
 *
 * The caller is expected to log the `'unconfigured'` case. A webhook nobody
 * checks should be visible, not quiet.
 */
export function enforceSaltEdgeCallbackSignature(input: {
  callbackUrl: string;
  rawBody: Buffer;
  signature: string;
  publicKeyPem: string;
}): 'verified' | 'unconfigured' {
  if (!input.publicKeyPem?.trim() || !input.callbackUrl?.trim()) {
    return 'unconfigured';
  }
  verifySaltEdgeCallbackSignature(input);
  return 'verified';
}

export function verifySaltEdgeCallbackSignature(input: {
  callbackUrl: string;
  rawBody: Buffer;
  signature: string;
  publicKeyPem: string;
}): void {
  const publicKeyPem = input.publicKeyPem?.trim();
  if (!publicKeyPem) {
    throw new SaltEdgeCallbackSignatureError(
      'Salt Edge callback public key is not configured.',
    );
  }
  if (!Buffer.isBuffer(input.rawBody)) {
    throw new SaltEdgeCallbackSignatureError(
      'Salt Edge callback raw body is unavailable.',
    );
  }
  const signature = input.signature?.trim();
  if (!signature) {
    throw new SaltEdgeCallbackSignatureError(
      'Salt Edge callback signature is missing.',
    );
  }

  // Joined as bytes, never via rawBody.toString(), so a body that is not valid
  // UTF-8 cannot be silently rewritten into one that hashes differently.
  const signed = Buffer.concat([
    Buffer.from(`${input.callbackUrl}|`, 'utf8'),
    input.rawBody,
  ]);

  let matched = false;
  try {
    matched = createVerify('RSA-SHA256')
      .update(signed)
      .verify(publicKeyPem, signature, 'base64');
  } catch {
    // A malformed key or a non-base64 signature lands here. Treat it as a
    // failed check, never as a pass.
    throw new SaltEdgeCallbackSignatureError(
      'Salt Edge callback signature could not be checked.',
    );
  }
  if (!matched) {
    throw new SaltEdgeCallbackSignatureError(
      'Salt Edge callback signature does not match.',
    );
  }
}
