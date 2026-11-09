// P2c client adapter (R7): a record's receipt photo. Retain, replace and
// remove are commands on the record (`POST`/`PUT`/`DELETE
// /v1/transactions/:id/attachment`): each carries its own Idempotency-Key and
// the record's version as If-Match, and moves the record to its next version.
// Retain and replace always send the retention consent, and only after the
// person chose to keep the photo (the screen asks first). A grant
// (`GET /v1/attachments/:id/grant`) lasts five minutes and names a download
// path that still needs the person's bound session, so it is never a URL an
// image view can load by itself: the app downloads the bytes as a binary read
// on the v1 transport (the session's headers, and a refresh after a 401 like
// every read) and checks them against the grant's size and SHA-256.
//
// Retaining and replacing copy the image on the server, which can take up to
// 60 s, so those two commands wait longer than an ordinary call; one that
// still gets no answer is resent with the same key, which the server
// recognizes, but only within 100 s for the whole command, so a lost answer
// never keeps the person waiting for minutes.
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
import { ATTACHMENT_CONTENT_TYPES, RECEIPT_RETENTION_CONSENT, isAttachmentGrant, isUuid } from '@gogospend/contracts';
import type { AttachmentGrant, CommandAck } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1Transport } from '../../api/client.ts';
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

export type AttachmentResourceOptions = {
  /** Lower-case hex SHA-256 of the downloaded bytes. */
  sha256Hex: (bytes: Uint8Array) => Promise<string>;
};

/** Above the server's 60 s copy deadline, with room for the command around it. */
const COPY_TIMEOUT_MS = 90_000;
/** The whole retain or replace, every resend included: a resend gets only what is left. */
const COPY_DEADLINE_MS = 100_000;
/** A receipt is up to 12 MiB: more time than a JSON read. */
const DOWNLOAD_TIMEOUT_MS = 60_000;
const isBytes = (value: unknown): value is Uint8Array => value instanceof Uint8Array;

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
      transport.request('POST', path(recordId), { body: consentBody(input), command: commandOf(commandId, version), timeoutMs: COPY_TIMEOUT_MS, deadlineMs: COPY_DEADLINE_MS, validate: ackFor(commandId, recordId, version) }),
    replace: async (recordId, version, input, commandId) =>
      transport.request('PUT', path(recordId), { body: consentBody(input), command: commandOf(commandId, version), timeoutMs: COPY_TIMEOUT_MS, deadlineMs: COPY_DEADLINE_MS, validate: ackFor(commandId, recordId, version) }),
    remove: async (recordId, version, commandId) =>
      transport.request('DELETE', path(recordId), { command: commandOf(commandId, version), validate: ackFor(commandId, recordId, version) }),
    grant: async (attachmentId) => transport.request('GET', `/v1/attachments/${segment(attachmentId)}/grant`, { validate: isAttachmentGrant }),
    async file(grant) {
      // Only a grant's own relative path is fetched.
      if (!isAttachmentGrant(grant)) throw new V1Error('invalid', 0, 'INVALID_GRANT');
      const bytes = await transport.request('GET', grant.url, { bytes: { accept: ATTACHMENT_CONTENT_TYPES }, timeoutMs: DOWNLOAD_TIMEOUT_MS, validate: isBytes });
      if (bytes.byteLength !== grant.bytes || (await options.sha256Hex(bytes)) !== grant.sha256) throw new V1Error('invalid_response', 200, 'INVALID_RESPONSE');
      return bytes;
    },
  };
}
