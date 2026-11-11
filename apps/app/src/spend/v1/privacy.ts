// P4 export, client side: request (after a fresh sign-in, on the new
// session's own credentials), status, short-lived grant and download, plus
// the journey the privacy screen drives. The request keeps today's v1 body,
// { proof_id, from, through } (R46, C2), where proof_id is a random UUID the
// server records but no longer checks: freshness comes from the session's
// sign-in time. Every response is checked against the shared contract, a
// download against the ready export's size and digest, and nothing here logs
// CSV contents, grants, tokens or amounts. "Ready" means the file exists on
// the server, never that the user saved it.
import { EXPORT_CSV_BOM, exportFileName, isExportDto, isExportGrant, isUuid } from '@gogospend/contracts';
import type { CommandAck, ExportDto, ExportFilter, ExportGrant } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1Transport } from '../../api/client.ts';
import type { FreshOutcome, RequestCredentials } from '../../auth/credentialProvider.ts';
import { V1_COMMAND_SCHEMA, isCommandAck } from './resources.ts';

type ReadyExport = Extract<ExportDto, { status: 'ready' }>;

export type PrivacyResources = {
  /** POST /v1/exports with today's body { proof_id, from, through } (R46), the command id as the Idempotency-Key, on the request's own credentials. */
  requestExport(filter: ExportFilter, request: { commandId: string; proofId: string }, credentials: RequestCredentials): Promise<CommandAck>;
  exportStatus(exportId: string): Promise<ExportDto>;
  exportGrant(exportId: string): Promise<ExportGrant>;
  /** The CSV (byte order mark included), only if it matches the ready export's size and SHA-256. */
  downloadExport(grant: ExportGrant, expected: { bytes: number; sha256: string }): Promise<string>;
};

const segment = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};

export function createPrivacyResources(transport: V1Transport, options: { sha256Hex: (text: string) => Promise<string> }): PrivacyResources {
  return {
    requestExport: (filter, request, credentials) =>
      transport.request('POST', '/v1/exports', {
        body: { proof_id: request.proofId, from: filter.from, through: filter.through },
        command: { id: segment(request.commandId), schemaVersion: V1_COMMAND_SCHEMA },
        credentials: { accessToken: credentials.accessToken, binding: credentials.sessionId },
        validate: (value): value is CommandAck => isCommandAck(value) && value.command_id === request.commandId && value.outcome === 'accepted',
      }),
    exportStatus: (exportId) =>
      transport.request('GET', `/v1/exports/${segment(exportId)}`, { validate: (value): value is ExportDto => isExportDto(value) && value.export_id === exportId }),
    exportGrant: (exportId) => transport.request('GET', `/v1/exports/${segment(exportId)}/grant`, { validate: isExportGrant }),
    async downloadExport(grant, expected) {
      if (!isExportGrant(grant)) throw new V1Error('invalid', 0, 'INVALID_GRANT');
      const text = await transport.request('GET', grant.url, { text: true, validate: (value): value is string => typeof value === 'string' });
      // Text decoding usually drops the byte order mark the file starts with.
      const csv = text.startsWith(EXPORT_CSV_BOM) ? text : `${EXPORT_CSV_BOM}${text}`;
      if (new TextEncoder().encode(csv).length !== expected.bytes || (await options.sha256Hex(csv)) !== expected.sha256) {
        throw new V1Error('invalid_response', 200, 'INVALID_RESPONSE');
      }
      return csv;
    },
  };
}

/** A request whose outcome is not known yet: retry exactly this (same key, body, proof id and credentials) - never a new sign-in, proof id or key. */
export type PendingExportRequest = { filter: ExportFilter; commandId: string; proofId: string; credentials: RequestCredentials };

export type ExportState =
  | { state: 'cancelled' }
  | { state: 'reauth_required' }
  | { state: 'unconfirmed'; request: PendingExportRequest }
  | { state: 'queued'; exportId: string }
  | { state: 'ready'; exportId: string; file: ReadyExport }
  /** `too_large`: ask for a shorter period; `error` or unknown: try again later. */
  | { state: 'failed'; exportId: string; reason: 'too_large' | 'error' }
  | { state: 'expired'; exportId: string };

export type ExportDeps = {
  resources: PrivacyResources;
  /** A fresh sign-in with the account's own method (the credential provider's). */
  freshSignIn: () => Promise<FreshOutcome>;
  /** The new session's token and id, read together (the provider's requestCredentials()); null when there is no usable session. */
  credentials: () => Promise<RequestCredentials | null>;
  /** A random UUID: the command id, then the proof id. */
  newId: () => string;
  sleep?: (ms: number) => Promise<void>;
  /** Wait between status checks (default 2 s). */
  pollMs?: number;
  /** Status checks before reporting `queued` (default 30). */
  maxPolls?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A fresh sign-in, then the request for the period on the new session's own
 * credentials, polled until it settles (or reported queued). A sign-in that
 * does not go through, or a new session that cannot be read, requests nothing.
 */
export async function requestExport(filter: ExportFilter, deps: ExportDeps): Promise<ExportState> {
  const outcome = await deps.freshSignIn();
  if (outcome === 'cancelled') return { state: 'cancelled' };
  if (outcome !== 'fresh') return { state: 'reauth_required' };
  // Read once: every send of this request uses these.
  const credentials = await deps.credentials();
  if (!credentials) return { state: 'reauth_required' };
  return retryExportRequest({ filter, commandId: deps.newId(), proofId: deps.newId(), credentials }, deps);
}

/**
 * Sends (or resends) one export request. A sign-in too old for the server
 * asks for a new one; an outcome the app cannot know (network, gateway,
 * garbled answer) keeps the exact request, whose retry returns the original
 * acknowledgement if it had committed.
 */
export async function retryExportRequest(request: PendingExportRequest, deps: Pick<ExportDeps, 'resources' | 'sleep' | 'pollMs' | 'maxPolls'>): Promise<ExportState> {
  let ack: CommandAck;
  try {
    ack = await deps.resources.requestExport(request.filter, { commandId: request.commandId, proofId: request.proofId }, request.credentials);
  } catch (error) {
    if (error instanceof V1Error) {
      if (error.code === 'REAUTH_REQUIRED') return { state: 'reauth_required' };
      if (error.outcome === 'network' || error.outcome === 'unavailable' || error.outcome === 'invalid_response') return { state: 'unconfirmed', request };
    }
    throw error;
  }
  return pollExport(ack.entity_id, deps);
}

/** Checks the export until it is ready, failed or expired; `queued` after `maxPolls` checks. */
export async function pollExport(exportId: string, deps: Pick<ExportDeps, 'resources' | 'sleep' | 'pollMs' | 'maxPolls'>): Promise<ExportState> {
  const sleep = deps.sleep ?? defaultSleep;
  const maxPolls = deps.maxPolls ?? 30;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (poll > 0) await sleep(deps.pollMs ?? 2_000);
    let dto: ExportDto;
    try {
      dto = await deps.resources.exportStatus(exportId);
    } catch (error) {
      if (error instanceof V1Error && error.outcome === 'not_found') return { state: 'failed', exportId, reason: 'error' };
      throw error;
    }
    if (dto.status === 'ready') return { state: 'ready', exportId, file: dto };
    if (dto.status === 'failed') return { state: 'failed', exportId, reason: dto.reason };
    if (dto.status === 'expired') return { state: 'expired', exportId };
  }
  return { state: 'queued', exportId };
}

export type DownloadResult = { state: 'downloaded'; csv: string; fileName: string } | { state: 'expired' | 'failed' | 'queued' };

/** A fresh grant for the ready export, then the verified file. An expired export asks for nothing more. */
export async function downloadExport(exportId: string, deps: Pick<ExportDeps, 'resources'>): Promise<DownloadResult> {
  const notFound = (error: unknown) => error instanceof V1Error && error.outcome === 'not_found';
  let dto: ExportDto;
  try {
    dto = await deps.resources.exportStatus(exportId);
  } catch (error) {
    if (notFound(error)) return { state: 'failed' };
    throw error;
  }
  if (dto.status === 'pending') return { state: 'queued' };
  if (dto.status !== 'ready') return { state: dto.status };
  try {
    const grant = await deps.resources.exportGrant(exportId);
    const csv = await deps.resources.downloadExport(grant, dto);
    return { state: 'downloaded', csv, fileName: exportFileName(dto) };
  } catch (error) {
    // Expired between the status check and the download (file or grant).
    if (notFound(error)) return { state: 'expired' };
    throw error;
  }
}
