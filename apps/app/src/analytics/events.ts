// The one API every plan calls (R23). Each function names a §7 event and
// nothing else; cleanEvent, on the bus, drops whatever is not in the allow-list.
import { trackClientEvent } from './bus.ts';

export type RecordKind = 'expense' | 'income' | 'transfer';
export type RecordSource = 'typed' | 'tell_bun';
export type SignInMethodName = 'apple' | 'google' | 'email' | 'passkey';

function emit(name: string, properties?: Record<string, unknown>): void {
  trackClientEvent(name, properties);
}

function categoryKey(value: string | null): Record<string, string> {
  return value === null ? {} : { category_key: value };
}

/** Rounded to the nearest second and kept inside 0..3600, which is the count rule's max. */
function secondsToSave(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3600, Math.max(0, Math.round(value)));
}

export function trackRecordStarted(p: { kind?: RecordKind; source: RecordSource }): void {
  emit('record_started', { ...(p.kind === undefined ? {} : { kind: p.kind }), source: p.source });
}

export function trackRecordSaved(p: { kind: RecordKind; source: RecordSource; categoryKey: string | null; offline: boolean; secondsToSave: number; hasPhoto?: boolean }): void {
  emit('record_saved', {
    kind: p.kind,
    source: p.source,
    ...categoryKey(p.categoryKey),
    has_photo: p.hasPhoto === true,
    offline: p.offline,
    seconds_to_save: secondsToSave(p.secondsToSave),
  });
}

export function trackRecordEdited(p: { kind: RecordKind; categoryKey: string | null }): void {
  emit('record_edited', { kind: p.kind, ...categoryKey(p.categoryKey) });
}

export function trackRecordDeleted(p: { kind: RecordKind; categoryKey: string | null }): void {
  emit('record_deleted', { kind: p.kind, ...categoryKey(p.categoryKey) });
}

export function trackRecordRestored(p: { kind: RecordKind }): void {
  emit('record_restored', { kind: p.kind });
}

export function trackUndoUsed(p: { kind: RecordKind }): void {
  emit('undo_used', { kind: p.kind });
}

export function trackOnboardingStepViewed(p: { step: string }): void {
  emit('onboarding_step_viewed', { step: p.step });
}

export function trackBudgetSet(p: { set: boolean }): void {
  emit('budget_set', { budget: p.set ? 'set' : 'skipped' });
}

export function trackWalletAdded(p: { walletType?: string | null; material?: string; bunFace?: string }): void {
  const properties: Record<string, unknown> = {};
  if (typeof p.walletType === 'string') properties.wallet_type = p.walletType;
  if (typeof p.material === 'string') properties.material = p.material;
  if (typeof p.bunFace === 'string') properties.bun_face = p.bunFace;
  emit('wallet_added', properties);
}

export function trackSetupCompleted(): void {
  emit('setup_completed');
}

export function trackInsightsViewed(p: { tab: string }): void {
  emit('insights_viewed', { tab: p.tab, period: 'month' });
}

export function trackRecapOpened(): void {
  emit('recap_opened', { period: 'month' });
}

export function trackRecapShared(): void {
  emit('recap_shared', { period: 'month' });
}

export function trackPrivateModeToggled(): void {
  emit('private_mode_toggled');
}

export function trackReminderSet(p: { hour: number }): void {
  emit('reminder_set', { reminder_hour: p.hour });
}

export function trackConflictShown(p: { screen: string }): void {
  emit('conflict_shown', { reason_code: 'VERSION_CONFLICT', screen: p.screen });
}

export function trackSyncFailed(p: { reasonCode: string }): void {
  emit('sync_failed', { reason_code: p.reasonCode });
}

export function trackResyncRequired(): void {
  emit('resync_required', { reason_code: 'RESYNC_REQUIRED' });
}

export function trackPermissionDenied(p: { permission: 'camera' | 'photos' }): void {
  emit('permission_denied', { reason_code: p.permission === 'camera' ? 'CAMERA_DENIED' : 'PHOTOS_DENIED' });
}

export function trackSignedIn(p: { method: SignInMethodName }): void {
  emit('signed_in', { method: p.method });
}

export function trackSignedUp(p: { method: SignInMethodName }): void {
  emit('signed_up', { method: p.method });
}

export function trackSignedOut(p: { method?: SignInMethodName }): void {
  emit('signed_out', p.method === undefined ? {} : { method: p.method });
}

// Bun AI (P3-T5). Each emitter sends only the allow-list's Bun AI rules
// (outcome, fields_edited, model, escalated), or for ai_unavailable its
// Reliability rules (reason_code, screen): never a prompt, an answer, an
// amount, a note or a merchant name. P3-T18 makes AiModelName P3-T6's AiModel.
export type AiModelName = 'claude-haiku-5-5' | 'claude-opus-5-5' | 'rules';
export type DraftOutcome = 'kept' | 'edited' | 'dropped';

/** A whole number inside 0..20, which is the count rule's max; 0 for a value that is not a number. */
function fieldsEditedCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(20, Math.max(0, Math.round(value)));
}

/** No properties: the caller sets the common ai_enabled to the new answer first, and that carries it. */
export function trackAiConsentChanged(): void {
  emit('ai_consent_changed');
}

export function trackTellBunSent(p: { model: AiModelName; escalated: boolean }): void {
  emit('tell_bun_sent', { model: p.model, escalated: p.escalated });
}

export function trackAiDraftReviewed(p: { outcome: DraftOutcome; fieldsEdited: number; model: AiModelName; escalated: boolean }): void {
  emit('ai_draft_reviewed', { outcome: p.outcome, fields_edited: fieldsEditedCount(p.fieldsEdited), model: p.model, escalated: p.escalated });
}

export function trackAskBunAsked(p: { model: AiModelName; escalated: boolean }): void {
  emit('ask_bun_asked', { model: p.model, escalated: p.escalated });
}

/** A18 and H16 (default pending owner Q8): helpful is sent as outcome kept, not helpful as dropped. */
export function trackAskBunRated(p: { helpful: boolean; model: AiModelName; escalated: boolean }): void {
  emit('ask_bun_rated', { outcome: p.helpful ? 'kept' : 'dropped', model: p.model, escalated: p.escalated });
}

/** reason_code is a class name such as AI_PAUSED, and screen a route pattern; the allow-list drops anything else. */
export function trackAiUnavailable(p: { reasonCode: string; screen: string }): void {
  emit('ai_unavailable', { reason_code: p.reasonCode, screen: p.screen });
}
