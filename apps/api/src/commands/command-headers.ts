import { ContractValidationError, V1_HEADERS, isUuid } from '@gogospend/contracts';

export type CommandHeaders = { commandId: string; schemaVersion: number; expectedVersion?: number };
type HeaderBag = Record<string, string | string[] | undefined>;

const SCHEMA_VERSION = /^[1-9][0-9]{0,4}$/;
const IF_MATCH = /^"([1-9][0-9]{0,8})"$/;

function single(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Reads a business mutation's command headers:
 * - `Idempotency-Key`: required UUID (the command id);
 * - `X-GoGoSpend-Command-Schema`: a positive integer. A missing or malformed
 *   value becomes 0, which no command accepts (422 COMMAND_SCHEMA_UNSUPPORTED
 *   unless a receipt exists);
 * - `If-Match: "7"`: required for versioned update/delete/restore, refused
 *   on create, optional where one command both creates and replaces (a
 *   month's budget: absent to create, the current version to replace).
 */
export function commandHeaders(headers: HeaderBag, ifMatch: 'required' | 'forbidden' | 'optional'): CommandHeaders {
  const commandId = single(headers, V1_HEADERS.idempotencyKey);
  if (!isUuid(commandId)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency_key');
  const schema = single(headers, V1_HEADERS.commandSchema);
  const schemaVersion = schema !== undefined && SCHEMA_VERSION.test(schema) ? Number(schema) : 0;
  const match = single(headers, V1_HEADERS.ifMatch);
  if (ifMatch === 'forbidden') {
    if (headers[V1_HEADERS.ifMatch] !== undefined) throw new ContractValidationError('VALIDATION_FAILED', 'If-Match is not used here.', 'if_match');
    return { commandId, schemaVersion };
  }
  if (ifMatch === 'optional' && headers[V1_HEADERS.ifMatch] === undefined) return { commandId, schemaVersion };
  const version = match === undefined ? null : IF_MATCH.exec(match);
  if (!version) throw new ContractValidationError('VALIDATION_FAILED', 'If-Match must be the current version, e.g. "7".', 'if_match');
  return { commandId, schemaVersion, expectedVersion: Number(version[1]) };
}
