// RED stub (P3-T14): the plan's interface, with no behaviour yet.

export type AiConsentContentProps = {
  onAgree(): void;
  onNotNow(): void;
  onDetails(): void;
  busy: boolean;
  problem: string | null;
  readOnly?: boolean;
};

export function AiConsentContent(_props: AiConsentContentProps) {
  return null;
}
