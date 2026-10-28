/**
 * Push contract (spec §6.13, B11): the four push kinds, the `data` a push
 * carries (its kind and one id or month, never content: D41), and the
 * device registration `PUT /v1/devices` takes.
 */
import { ContractValidationError } from "./errors.ts";
import { assertKnownFields, isUuid } from "./validation.ts";

export const PUSH_KINDS = ["slips_ready", "statement_parsed", "export_ready", "month_recap_ready"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** `ref`: null for `slips_ready`, the import job id for `statement_parsed`, the export id for `export_ready`, `YYYY-MM` for `month_recap_ready`. */
export type PushData = { kind: PushKind; ref: string | null };

export type DeviceRegistration = { push_token: string | null; platform: "ios" | "android"; language: "th" | "en"; slip_notices: boolean };

export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function isPushData(value: unknown): value is PushData {
  if (!isObject(value) || !hasExactly(value, ["kind", "ref"])) return false;
  switch (value.kind) {
    case "slips_ready":
      return value.ref === null;
    case "statement_parsed":
    case "export_ready":
      return isUuid(value.ref);
    case "month_recap_ready":
      return typeof value.ref === "string" && MONTH.test(value.ref);
    default:
      return false;
  }
}

/** `PUT /v1/devices` body; a null `push_token` forgets this session's device. */
export function parseDeviceRegistration(body: unknown): DeviceRegistration {
  const input = assertKnownFields(body, ["push_token", "platform", "language", "slip_notices"]);
  const token = input.push_token;
  if (token !== null && (typeof token !== "string" || !EXPO_PUSH_TOKEN.test(token))) {
    throw new ContractValidationError("VALIDATION_FAILED", "push_token must be an Expo push token or null.", "push_token");
  }
  const platform = input.platform;
  if (platform !== "ios" && platform !== "android") throw new ContractValidationError("VALIDATION_FAILED", "platform must be ios or android.", "platform");
  const language = input.language;
  if (language !== "th" && language !== "en") throw new ContractValidationError("VALIDATION_FAILED", "language must be th or en.", "language");
  const slipNotices = input.slip_notices;
  if (typeof slipNotices !== "boolean") throw new ContractValidationError("VALIDATION_FAILED", "slip_notices must be true or false.", "slip_notices");
  return { push_token: token, platform, language, slip_notices: slipNotices };
}
