import { createSign, generateKeyPairSync } from 'node:crypto';

import {
  SaltEdgeCallbackSignatureError,
  enforceSaltEdgeCallbackSignature,
  verifySaltEdgeCallbackSignature,
} from './salt-edge-callback-signature';

const CALLBACK_URL = 'https://api.gogocash.co/spend/bank-link/callbacks';
const BODY = JSON.stringify({
  data: { connection_id: '111', customer_id: '222' },
  meta: { version: '6', time: '2026-09-14T04:00:00Z' },
});

function keyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

/** What Salt Edge does on their side: base64(sha256_signature(key, "url|body")). */
function sign(privateKey: string, url: string, body: string): string {
  return createSign('RSA-SHA256')
    .update(`${url}|${body}`)
    .sign(privateKey, 'base64');
}

describe('verifySaltEdgeCallbackSignature', () => {
  it('accepts a callback signed over the callback url and the raw body', () => {
    const { privateKey, publicKey } = keyPair();

    expect(() =>
      verifySaltEdgeCallbackSignature({
        callbackUrl: CALLBACK_URL,
        rawBody: Buffer.from(BODY, 'utf8'),
        signature: sign(privateKey, CALLBACK_URL, BODY),
        publicKeyPem: publicKey,
      }),
    ).not.toThrow();
  });

  it('rejects a body edited after it was signed', () => {
    const { privateKey, publicKey } = keyPair();
    const signature = sign(privateKey, CALLBACK_URL, BODY);
    const tampered = BODY.replace('"111"', '"999"');

    expect(() =>
      verifySaltEdgeCallbackSignature({
        callbackUrl: CALLBACK_URL,
        rawBody: Buffer.from(tampered, 'utf8'),
        signature,
        publicKeyPem: publicKey,
      }),
    ).toThrow(SaltEdgeCallbackSignatureError);
  });

  it('rejects a signature made for a different callback url', () => {
    const { privateKey, publicKey } = keyPair();
    const signature = sign(privateKey, 'https://evil.example/callbacks', BODY);

    expect(() =>
      verifySaltEdgeCallbackSignature({
        callbackUrl: CALLBACK_URL,
        rawBody: Buffer.from(BODY, 'utf8'),
        signature,
        publicKeyPem: publicKey,
      }),
    ).toThrow(SaltEdgeCallbackSignatureError);
  });

  it('rejects a callback signed by somebody else', () => {
    const mine = keyPair();
    const theirs = keyPair();

    expect(() =>
      verifySaltEdgeCallbackSignature({
        callbackUrl: CALLBACK_URL,
        rawBody: Buffer.from(BODY, 'utf8'),
        signature: sign(theirs.privateKey, CALLBACK_URL, BODY),
        publicKeyPem: mine.publicKey,
      }),
    ).toThrow(SaltEdgeCallbackSignatureError);
  });

  it('rejects a missing signature header rather than passing it through', () => {
    const { publicKey } = keyPair();

    expect(() =>
      verifySaltEdgeCallbackSignature({
        callbackUrl: CALLBACK_URL,
        rawBody: Buffer.from(BODY, 'utf8'),
        signature: '',
        publicKeyPem: publicKey,
      }),
    ).toThrow(SaltEdgeCallbackSignatureError);
  });
});

describe('enforceSaltEdgeCallbackSignature', () => {
  const rawBody = Buffer.from(BODY, 'utf8');

  it('reports "unconfigured" rather than throwing when no public key is set', () => {
    expect(
      enforceSaltEdgeCallbackSignature({
        callbackUrl: CALLBACK_URL,
        rawBody,
        signature: '',
        publicKeyPem: '',
      }),
    ).toBe('unconfigured');
  });

  it('reports "unconfigured" when the key is set but the callback url is not', () => {
    const { publicKey } = keyPair();
    expect(
      enforceSaltEdgeCallbackSignature({
        callbackUrl: '',
        rawBody,
        signature: 'whatever',
        publicKeyPem: publicKey,
      }),
    ).toBe('unconfigured');
  });

  it('verifies once both the key and the callback url are configured', () => {
    const { privateKey, publicKey } = keyPair();
    expect(
      enforceSaltEdgeCallbackSignature({
        callbackUrl: CALLBACK_URL,
        rawBody,
        signature: sign(privateKey, CALLBACK_URL, BODY),
        publicKeyPem: publicKey,
      }),
    ).toBe('verified');
  });

  it('throws on a forged callback once it is configured to check', () => {
    const mine = keyPair();
    const theirs = keyPair();
    expect(() =>
      enforceSaltEdgeCallbackSignature({
        callbackUrl: CALLBACK_URL,
        rawBody,
        signature: sign(theirs.privateKey, CALLBACK_URL, BODY),
        publicKeyPem: mine.publicKey,
      }),
    ).toThrow(SaltEdgeCallbackSignatureError);
  });
});
