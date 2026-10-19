// P2c client adapter (R7): a record's receipt photo. Retain, replace and
// remove are commands on the record (`POST`/`PUT`/`DELETE
// /v1/transactions/:id/attachment`): each carries its own Idempotency-Key and
// the record's version as If-Match, and moves the record to its next version.
// Retain and replace always send the retention consent, and only after the
// person chose to keep the photo (the screen asks first). A grant
// (`GET /v1/attachments/:id/grant`) lasts five minutes and names a download
// path that still needs the person's bound session, so it is never a URL an
// image view can load by itself: the app downloads the bytes with the
// session's headers and checks them against the grant's size and SHA-256.
//
// Where an attachment id comes from (a receipt for a record that already
// exists): the photo is uploaded as an image import (`POST /v1/imports`); once
// its preview is ready, `summary.image.attachment_id` names the cleaned copy
// and `attachable_until` says how long it can still be kept. Retaining that id
// copies the image into the account's receipts. Nothing else of the import is
// saved: it is never confirmed, and it expires on its own.
//
// Every answer is checked against the shared contract; an id, key or version
// that is not well formed is refused before anything is sent, as a rejection.
import { ATTACHMENT_CONTENT_TYPES, ATTACHMENT_DOWNLOAD_PATH, RECEIPT_RETENTION_CONSENT, isAttachmentGrant, isUuid } from '@gogospend/contracts';
import type { AttachmentGrant, CommandAck } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1ClientVersion, V1Credentials, V1SessionEnd, V1Transport } from '../../api/client.ts';
import { V1_COMMAND_SCHEMA, isCommandAck } from './resources.ts';

export type AttachmentResources = {
  /** POST: the record (which holds none) keeps the receipt `attachment_id` names. */
  retain(recordId: string, version: number, input: { attachment_id: string }, commandId: string): Promise<CommandAck>;
  /** PUT: the record's receipt becomes this one; the one it held is deleted once nothing holds it. */
  replace(recordId: string, version: number, input: { attachment_id: string }, commandId: string): Promise<CommandAck>;
  /** DELETE: the record lets go of its receipt, whose photo is then deleted for good (no undo). */
  remove(recordId: string, version: number, commandId: string): Promise<CommandAck>;
  /** A five-minute download grant for a receipt one of the person's active records holds. */
  grant(attachmentId: string): Promise<AttachmentGrant>;
  /** The receipt's bytes through `grant`, exactly its recorded size and SHA-256. */
  file(grant: AttachmentGrant): Promise<Uint8Array>;
};

/** Reads a relative download path's raw bytes with the session's credentials. */
export type ReceiptDownload = (path: string) => Promise<Uint8Array>;

export type AttachmentResourceOptions = {
  download: ReceiptDownload;
  /** Lower-case hex SHA-256 of the downloaded bytes. */
  sha256Hex: (bytes: Uint8Array) => Promise<string>;
};

const segment = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};
const commandOf = (commandId: string, version: number) => {
  if (!isUuid(commandId)) throw new V1Error('invalid', 0, 'INVALID_KEY');
  if (!Number.isSafeInteger(version) || version < 1) throw new V1Error('invalid', 0, 'INVALID_VERSION');
  return { id: commandId, schemaVersion: V1_COMMAND_SCHEMA, ifMatch: version };
};
/** Only the receipt and the consent are sent, whatever else the caller's object carries. */
const consentBody = (input: { attachment_id: string }) => ({ attachment_id: segment(input.attachment_id), consent: RECEIPT_RETENTION_CONSENT });
/** This command's acknowledgement, for this record, an update that moved it past the version sent. */
const ackFor = (commandId: string, recordId: string, version: number) => (value: unknown): value is CommandAck =>
  isCommandAck(value) && value.command_id === commandId && value.entity_id === recordId && value.outcome === 'updated' &&
  value.entity_state === 'active' && value.version > version;

export function createAttachmentResources(transport: V1Transport, options: AttachmentResourceOptions): AttachmentResources {
  const path = (recordId: string) => `/v1/transactions/${segment(recordId)}/attachment`;
  return {
    // Async, so a malformed id, key or version is a rejection like any other refusal.
    retain: async (recordId, version, input, commandId) =>
      transport.request('POST', path(recordId), { body: consentBody(input), command: commandOf(commandId, version), validate: ackFor(commandId, recordId, version) }),
    replace: async (recordId, version, input, commandId) =>
      transport.request('PUT', path(recordId), { body: consentBody(input), command: commandOf(commandId, version), validate: ackFor(commandId, recordId, version) }),
    remove: async (recordId, version, commandId) =>
      transport.request('DELETE', path(recordId), { command: commandOf(commandId, version), validate: ackFor(commandId, recordId, version) }),
    grant: async (attachmentId) => transport.request('GET', `/v1/attachments/${segment(attachmentId)}/grant`, { validate: isAttachmentGrant }),
    async file(grant) {
      if (!isAttachmentGrant(grant)) throw new V1Error('invalid', 0, 'INVALID_GRANT');
      const bytes = await options.download(grant.url);
      if (bytes.byteLength !== grant.bytes || (await options.sha256Hex(bytes)) !== grant.sha256) throw new V1Error('invalid_response', 200, 'INVALID_RESPONSE');
      return bytes;
    },
  };
}

const PROBLEM_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const GRANT_PATH = new RegExp(`^${ATTACHMENT_DOWNLOAD_PATH.replace(/\//g, '\\/')}[A-Za-z0-9_-]{1,64}$`);

function downloadProblem(status: number, payload: unknown): V1Error {
  const problem = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const code = typeof problem.code === 'string' && PROBLEM_CODE.test(problem.code) ? problem.code : `HTTP_${status}`;
  const retryAfterSeconds = typeof problem.retry_after_seconds === 'number' ? problem.retry_after_seconds : undefined;
  const outcome = status === 401 || code === 'ACCOUNT_UNAVAILABLE' ? 'signed_out'
    : code === 'POLICY_ACCEPTANCE_REQUIRED' ? 'policy_required'
      : status === 404 ? 'not_found'
        : status === 426 ? 'upgrade_required'
          : status === 429 ? 'rate_limited'
            : status >= 500 ? 'unavailable'
              : 'invalid';
  return new V1Error(outcome, status, code, { retryAfterSeconds });
}

const sessionEnd = (status: number, code: string): V1SessionEnd['code'] | null => {
  if (status === 401 && (code === 'SESSION_REQUIRED' || code === 'REAUTH_REQUIRED')) return code;
  if (status === 403 && code === 'ACCOUNT_UNAVAILABLE') return code;
  return null;
};

/**
 * The receipt download over the person's session: the access token, the
 * session binding and `X-GoGoSpend-Client`, as every v1 read sends them,
 * with the response read as bytes rather than text. Only a grant's relative
 * path is fetched, never a redirect. Bytes that arrive after the session
 * moved on (sign-out, another account) are dropped; a session the server
 * ended is reported to the credentials. A token that cannot be read right
 * now, or a request that never got an answer, is a `network` outcome.
 *
 * The v1 transport hands its validator text, which would change an image's
 * bytes; this is its binary twin until the transport can return bytes.
 */
export function createReceiptDownload(options: {
  baseUrl: string;
  credentials: V1Credentials;
  client: V1ClientVersion | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): ReceiptDownload {
  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    throw new V1Error('invalid', 0, 'CONFIG_REQUIRED');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || !(base.protocol === 'https:' || (base.protocol === 'http:' && loopback))) throw new V1Error('invalid', 0, 'CONFIG_REQUIRED');
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  // A receipt is up to 12 MiB: more time than a JSON read.
  const timeoutMs = options.timeoutMs ?? 60_000;
  const { credentials, client } = options;

  return async (path) => {
    if (!GRANT_PATH.test(path)) throw new V1Error('invalid', 0, 'INVALID_PATH');
    if (!client) throw new V1Error('unsupported_platform', 0, 'CLIENT_UNSUPPORTED');
    const before = credentials.getSessionSnapshot();
    const stillCurrent = () => {
      if (credentials.getSessionSnapshot().epoch !== before.epoch) throw new V1Error('session_changed', 0, 'SESSION_CHANGED');
    };
    let token: string | null;
    try {
      token = await credentials.getAccessToken();
    } catch {
      throw new V1Error('network', 0, 'NETWORK_ERROR');
    }
    stillCurrent();
    if (!token || !before.binding) throw new V1Error('signed_out', 401, 'SESSION_REQUIRED');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: number;
    let bytes: Uint8Array;
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
          Accept: [...ATTACHMENT_CONTENT_TYPES, 'application/json'].join(', '),
          Authorization: `Bearer ${token}`,
          'X-GoGoSpend-Client': `${client.platform}/${client.version}`,
          'X-GoGoSpend-Session': before.binding,
        },
        signal: controller.signal,
        redirect: 'error',
      });
      status = response.status;
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new V1Error('network', 0, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
    stillCurrent();
    if (status >= 200 && status <= 299) return bytes;
    let payload: unknown = null;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      // A gateway's page: classified by status alone.
    }
    const problem = downloadProblem(status, payload);
    const ended = sessionEnd(status, problem.code);
    if (ended) credentials.sessionEnded?.({ code: ended, epoch: before.epoch });
    throw problem;
  };
}
