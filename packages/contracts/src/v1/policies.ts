/**
 * v1 published policies, acknowledgements and the account summary. Policy
 * text is published by the founder; the API never invents or defaults it.
 */
import type { CurrencyCode } from "./currency.ts";

export const POLICY_KINDS = ["terms", "privacy"] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export type PolicyVersionDto = {
  kind: PolicyKind;
  version: number;
  required: boolean;
  published_at: string;
  text: { th: string; en: string };
};

export type PolicyAcceptanceRequest = {
  kind: PolicyKind;
  version: number;
};

export type PrivacyPreferences = {
  /** Optional analytics; off unless the user turns it on. */
  analytics: boolean;
};

export type MeDto = {
  account_id: string;
  status: "active" | "disabled" | "deleting";
  /** Required policy versions this account still has to accept. */
  pending_policies: { kind: PolicyKind; version: number }[];
  privacy: PrivacyPreferences;
  /** P5-T2: the account's home currency (X5); servers before phase 5 leave it out, which means THB. */
  home_currency?: CurrencyCode;
};
