// RED stub (P3-T14): the plan's interface, with no behaviour yet.

export type AiConsentTrayProps = {
  visible: boolean;
  onClose(): void;
  onClosed?(): void;
  onAgreed?(): void;
  readOnly?: boolean;
};

export function AiConsentTray(_props: AiConsentTrayProps) {
  return null;
}
