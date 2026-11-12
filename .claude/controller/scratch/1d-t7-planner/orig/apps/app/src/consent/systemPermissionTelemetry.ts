import { trackClientEvent } from '@mobile/analytics/bus';
export type SystemPermissionOpenSettingsResult = 'opened' | 'failed' | 'unsupported';
export function trackSystemPermissionOutcome(input: {
  permission: 'camera' | 'photos'; outcome: string; promptContext?: string;
  isReprompt?: boolean; openSettingsResult?: SystemPermissionOpenSettingsResult; openSettingsMethod?: string;
}): void {
  trackClientEvent('system_permission_outcome', {
    permission: input.permission, outcome: input.outcome,
    prompt_context: input.promptContext, is_reprompt: input.isReprompt,
    open_settings_result: input.openSettingsResult, open_settings_method: input.openSettingsMethod,
  });
}
