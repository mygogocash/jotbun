// R6: Privacy and data (plan §6.4), from Settings, behind the `account` area
// (on since E2 checkpoint 4). A calm data screen, no bun:
//
// - Promises in plain words: no bank connection, never sold, no ads, and not
//   even Jotbun reads the diary.
// - Export (P4, privacy.ts): a fresh sign-in with the account's own method,
//   the request for everything up to today on that new session, then the
//   file's status (preparing, ready until a set time, expired, failed) and the
//   download, checked against the ready export's size and digest and handed
//   to the share sheet. An answer that was lost keeps the exact request, and
//   Try again resends it: same key, same body, same credentials. A file too
//   large for one export can be asked for this year only.
// - Delete account (P5, deletion.ts): a calm warning and "download your data
//   first", a confirm, a fresh sign-in, then the request in the app's
//   language and its receipt, with what became of this phone's copy
//   (`settleDeviceCopy`: erased only after a confirmed acceptance, locked
//   after a refusal, otherwise kept). A fresh sign-in that does not go
//   through sends nothing and leaves the copy as it is. A confirmed erase
//   also forgets this account's kept wallet looks. Done signs this device out,
//   with no `signed_out` event (R125).
// - Help improve Jotbun (1D-T8, D34), only while the `analytics` area is on:
//   the analytics answer as one switch, draft copy until E2.
//
// While the account's method has no fresh sign-in on this build (email until
// 1C Task 9, Apple and Google until 1C Task 7), both actions say plainly that
// they can't be done yet; nothing pretends.
import { DELETION_TARGET_HOURS, EXPORT_TTL_HOURS } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { AccountChangedError } from '@mobile/analytics/controller';
import { useAnalyticsConsent } from '@mobile/analytics/useAnalyticsConsent';
import { V1Error } from '@mobile/api/client';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { FRESH_SIGN_IN_FAILED, requestAccountDeletion, settleDeviceCopy, submitDeletionRequest } from '@mobile/spend/v1/deletion';
import type { DeletionResources, DeletionState, PendingDeletionRequest } from '@mobile/spend/v1/deletion';
import { downloadExport, pollExport, requestExport, retryExportRequest } from '@mobile/spend/v1/privacy';
import type { ExportState, PendingExportRequest, PrivacyResources } from '@mobile/spend/v1/privacy';
import { bangkokClock, deletionPhase, downloadPhase, exportFilter, exportPhase } from '@mobile/spend/v1/redesign/account/privacyModel';
import type { DeletionPhase, DeviceCopyOutcome, ExportPhase, ExportScope, IdleNote, ReadyExport } from '@mobile/spend/v1/redesign/account/privacyModel';
import { unsyncedEntries } from '@mobile/spend/v1/redesign/account/settingsModel';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { eraseAccountKept } from '@mobile/wallet/store/deviceWalletStore';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { OutlinedCard } from '@mobile/ui/Card';
import { dayLabel } from '@mobile/ui/dateStep';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { StagedProgress } from '@mobile/ui/StagedProgress';
import { Notice } from '../HistoryParts';
import { ReminderSwitch } from '../insights/RemindersParts';
import { useConsentCopy } from './analyticsConsentCopy.draft';
import type { PrivacyServices } from './PrivacyParts';
import { PAGE_STYLE, Section, useBackTo } from './SettingsParts';

type Tc = ReturnType<typeof useCopy>;

export type PrivacyScreenProps = {
  /** The export, deletion, fresh sign-in and sign-out services (the route passes the app's own: privacyServices.ts). */
  services: PrivacyServices;
  /** The clock "today" is read from (tests and the catalogue pin it). */
  now?: Date;
  /** The `analytics` area (1D-T8): the Help improve Jotbun switch. Defaults to the app's flag; the catalogue passes it. */
  analyticsArea?: boolean;
};

/** Outcomes that mean Jotbun could not answer, not that it said no. */
const UNREACHABLE = new Set(['network', 'unavailable', 'invalid_response', 'rate_limited']);
const unreachable = (error: unknown) => error instanceof V1Error && UNREACHABLE.has(error.outcome);

/** False once the screen has gone, so a late answer changes nothing. */
function useLive(): () => boolean {
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  return useCallback(() => live.current, []);
}

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

function idleLine(note: IdleNote, nothing: 'requested' | 'deleted', tc: Tc): string | null {
  switch (note) {
    case null: return null;
    case 'cancelled': return nothing === 'requested' ? tc('Nothing was requested.') : tc('Nothing was deleted.');
    case 'reauth_required': return nothing === 'requested' ? tc('Your sign-in check expired. Nothing was requested.') : tc('Your sign-in check expired. Nothing was deleted.');
    case 'signin_unreachable':
      return nothing === 'requested' ? tc("Couldn't reach the sign-in service. Nothing was requested. Try again.") : tc("Couldn't reach the sign-in service. Nothing was deleted. Try again.");
    case 'refused': return tc("Jotbun couldn't take your request right now. Try again later.");
  }
}

// ---------------------------------------------------------------------------
// Promises

function Promises() {
  const tc = useCopy();
  return (
    <OutlinedCard testID="privacy-promises">
      <PromiseList
        title={tc('Our promises')}
        items={[
          { key: 'bank', text: tc('Jotbun never connects to your bank.') },
          { key: 'sold', text: tc('Your data is never sold.') },
          { key: 'ads', text: tc('No ads, ever.') },
          { key: 'yours', text: tc('Export or delete your diary any time.') },
        ]}
      />
    </OutlinedCard>
  );
}

// ---------------------------------------------------------------------------
// Help improve Jotbun (1D-T8, D34)

/**
 * The analytics answer as one switch (today's ReminderSwitch), on when the
 * answer is yes. Off is in force at once. On waits for the server, with the
 * question's line when it fails; a yes refused because the account changed
 * says nothing, and the switch shows that account's answer. While a no has
 * not reached the server, a caption says it stopped on this phone.
 */
function AnalyticsSwitch() {
  const cc = useConsentCopy();
  const live = useLive();
  const { status, pendingNo, answer } = useAnalyticsConsent();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // One yes on its way at a time, however fast the switch is pressed.
  const sending = useRef(false);

  async function change(on: boolean) {
    setFailed(false);
    if (!on) {
      // In force at the call. A rejection (this phone's store) leaves the no in force too.
      answer('no').catch(() => undefined);
      return;
    }
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    let failure = false;
    try {
      await answer('yes');
    } catch (error) {
      failure = !(error instanceof AccountChangedError);
    }
    sending.current = false;
    if (!live()) return;
    setSaving(false);
    setFailed(failure);
  }

  return (
    <OutlinedCard testID="privacy-analytics">
      <ReminderSwitch label={cc('switchLabel')} value={status === 'yes'} disabled={saving} onChange={(on) => void change(on)} />
      {pendingNo ? <BunText testID="privacy-analytics-pending" variant="caption" tone="muted">{cc('stoppedHere')}</BunText> : null}
      {failed ? <Notice message={cc('saveFailed')} /> : null}
    </OutlinedCard>
  );
}

// ---------------------------------------------------------------------------
// Export

function ReadyFile({ phase, today, onDownload }: { phase: Extract<ExportPhase, { phase: 'ready' }>; today: string; onDownload: () => void }) {
  const tc = useCopy();
  const locale = useActiveLocale();
  const { date, time } = bangkokClock(phase.file.expires_at);
  const rows = phase.file.row_count;
  return (
    <View testID="privacy-export-ready" style={{ gap: BUN_SPACE.xs }}>
      <BunText variant="label" style={{ fontWeight: '700' }}>{tc('Your file is ready')}</BunText>
      <BunText>{tc('Ready until {day}, {time}', { day: dayLabel(date, today, locale).text, time })}</BunText>
      <BunText tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{rows === 1 ? tc('1 entry') : tc('{count} entries', { count: rows })}</BunText>
      {phase.download === 'saved' ? <Notice message={tc('Downloaded {name}.', { name: phase.fileName })} /> : null}
      {phase.download === 'failed' ? <Notice tone="alert" message={tc("Couldn't download the file. Try again.")} /> : null}
      <PillButton label={tc('Download')} busy={phase.download === 'busy'} busyLabel={tc('Downloading…')} onPress={onDownload} />
    </View>
  );
}

function ExportCard({ services, now }: { services: PrivacyServices; now?: Date }) {
  const tc = useCopy();
  const live = useLive();
  const [phase, setPhase] = useState<ExportPhase>({ phase: 'idle', note: null });
  const scope = useRef<ExportScope>('everything');
  const fresh = services.freshSignIn;
  const today = todayInBangkok(now ?? new Date());
  const resources = services.privacy;
  // Status checks stop once the screen has gone: the wait between two checks ends the polling.
  const pause = async (ms: number) => {
    await (services.sleep ?? wait)(ms);
    if (!live()) throw new Error('Privacy and data has closed.');
  };
  const pace = { sleep: pause, pollMs: services.pollMs };

  /** Keeps asking about one export until it settles (or the checks run out: Check again). */
  async function watch(exportId: string, first: boolean) {
    setPhase({ phase: 'preparing', exportId, offline: false, checking: true });
    try {
      if (first) await pause(services.pollMs ?? 2_000);
      const result = await pollExport(exportId, { resources, ...pace, maxPolls: services.maxPolls });
      if (live()) show(result, false);
    } catch {
      // The export is still there; only this check failed.
      if (live()) setPhase({ phase: 'preparing', exportId, offline: true });
    }
  }

  /** The journey's state on screen; after a request, a file still being made is watched until it settles. */
  function show(result: ExportState, keepWatching: boolean) {
    const next = exportPhase(result);
    setPhase(next);
    if (keepWatching && next.phase === 'preparing') void watch(next.exportId, true);
  }

  /** A fresh sign-in, then the request on the new session; its first status check comes back at once. */
  async function request(nextScope: ExportScope) {
    if (!fresh) return;
    scope.current = nextScope;
    const filter = exportFilter(today, nextScope);
    setPhase({ phase: 'requesting' });
    // The request as it is handed over, so a failure after that keeps exactly it.
    const seen: { request: PendingExportRequest | null } = { request: null };
    const recorded: PrivacyResources = {
      ...resources,
      requestExport: (period, ids, credentials) => {
        seen.request = { filter: period, ...ids, credentials };
        return resources.requestExport(period, ids, credentials);
      },
    };
    try {
      const result = await requestExport(filter, { resources: recorded, ...pace, maxPolls: 1, freshSignIn: fresh, credentials: () => services.credentials(), newId: () => services.newId() });
      if (live()) show(result, true);
    } catch (error) {
      if (!live()) return;
      // Nothing handed over: the sign-in itself failed. Unreachable after it: the answer (or the first check) was lost, so the very same request is kept.
      const sent = seen.request;
      if (!sent) setPhase({ phase: 'idle', note: 'signin_unreachable' });
      else if (unreachable(error)) setPhase({ phase: 'unconfirmed', request: sent });
      else setPhase({ phase: 'idle', note: 'refused' });
    }
  }

  /** Resends exactly the request whose answer was lost (privacy.ts's rule): no new sign-in, no new key. */
  async function retry(pending: PendingExportRequest) {
    setPhase({ phase: 'requesting' });
    try {
      // A resend carries the ids and credentials it was first sent with: it never signs in again.
      const result = await retryExportRequest(pending, { resources, ...pace, maxPolls: 1 });
      if (live()) show(result, true);
    } catch (error) {
      if (live()) setPhase(unreachable(error) ? { phase: 'unconfirmed', request: pending } : { phase: 'idle', note: 'refused' });
    }
  }

  async function download(exportId: string, file: ReadyExport) {
    setPhase({ phase: 'ready', exportId, file, download: 'busy' });
    try {
      const result = await downloadExport(exportId, { resources });
      const saved = result.state === 'downloaded' ? await services.saveExport({ csv: result.csv, fileName: result.fileName }) : false;
      if (!live()) return;
      const next = downloadPhase(exportId, file, result, saved);
      setPhase(next);
      if (next.phase === 'preparing') void watch(exportId, true);
    } catch {
      if (live()) setPhase({ phase: 'ready', exportId, file, download: 'failed' });
    }
  }

  const unavailable = tc("Exporting needs a fresh sign-in, which this build can't do yet.");
  const requestButton = (label: string, nextScope: ExportScope = scope.current) => (
    <PillButton label={label} disabled={!fresh} disabledReason={unavailable} onPress={() => void request(nextScope)} />
  );

  let body: ReactNode;
  switch (phase.phase) {
    case 'idle': {
      const line = idleLine(phase.note, 'requested', tc);
      body = (
        <>
          {line ? <Notice message={line} /> : null}
          {requestButton(tc('Request export'), 'everything')}
          {fresh ? <BunText variant="caption" tone="muted">{tc("You'll sign in again to confirm it's you.")}</BunText> : null}
        </>
      );
      break;
    }
    case 'requesting':
      body = <PillButton label={tc('Request export')} busy busyLabel={tc('Requesting…')} onPress={() => undefined} />;
      break;
    case 'unconfirmed':
      body = <Notice message={tc("We couldn't tell if Jotbun got your request. Try again to send the same request.")} action={{ label: tc('Try again'), onPress: () => void retry(phase.request) }} />;
      break;
    case 'preparing':
      body = (
        <>
          <StagedProgress
            stages={[
              { key: 'sent', label: tc('Request sent'), status: 'done' },
              { key: 'preparing', label: tc('Preparing your file'), status: 'active' },
              { key: 'ready', label: tc('Ready to download'), status: 'pending' },
            ]}
          />
          <BunText variant="caption" tone="muted">{tc('This can take a few minutes.')}</BunText>
          {phase.offline ? <Notice message={tc("Couldn't reach Jotbun. Your file is still being prepared.")} /> : null}
          <PillButton kind="secondary" label={tc('Check again')} busy={phase.checking === true} busyLabel={tc('Checking…')} onPress={() => void watch(phase.exportId, false)} />
        </>
      );
      break;
    case 'ready':
      body = <ReadyFile phase={phase} today={today} onDownload={() => void download(phase.exportId, phase.file)} />;
      break;
    case 'expired':
      body = (
        <>
          <Notice message={tc("This file has expired. Files are kept for {hours} hours after they're ready.", { hours: EXPORT_TTL_HOURS })} />
          {requestButton(tc('Request a new export'))}
        </>
      );
      break;
    case 'failed':
      body = phase.reason === 'too_large' && scope.current === 'everything' ? (
        <>
          <Notice tone="alert" message={tc('Your diary is too large for one file.')} />
          {requestButton(tc('Export this year instead'), 'this_year')}
        </>
      ) : (
        <>
          <Notice tone="alert" message={phase.reason === 'too_large' ? tc('Your diary is too large for one file.') : tc("Jotbun couldn't make your file. Your diary is unchanged.")} />
          {requestButton(tc('Try again'))}
        </>
      );
      break;
  }

  return (
    <Section title={tc('Export your data')} testID="privacy-export">
      <BunText>{tc('Get every entry in your diary as a spreadsheet file (CSV).')}</BunText>
      {body}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Delete account

function deviceLine(device: DeviceCopyOutcome, tc: Tc): string | null {
  switch (device) {
    case 'erased': return tc("This phone's copy of your diary has been erased.");
    case 'locked': return tc('Your diary is locked on this phone. Entries saved here are kept.');
    case 'erase_failed': return tc("This phone's copy couldn't be erased yet. Tap Done to try again.");
    // Kept: the request's own line already says nothing here was erased. None: no diary on this device.
    case 'kept':
    case 'none':
      return null;
  }
}

function DeleteCard({ services }: { services: PrivacyServices }) {
  const tc = useCopy();
  const live = useLive();
  const diary = useSpendDiary();
  const view = useDiaryView();
  const [phase, setPhase] = useState<DeletionPhase>({ phase: 'idle', note: null });
  const [confirming, setConfirming] = useState(false);
  const fresh = services.freshSignIn;
  const locale = useActiveLocale();
  const unsynced = unsyncedEntries(diary ? view : null);

  /** deletion.ts's outcome, and this phone's copy settled by its one rule. */
  async function settle(result: DeletionState) {
    // A fresh sign-in that did not go through sent nothing: this phone's copy stays exactly as it is.
    if (result.state === 'denied' && result.code === FRESH_SIGN_IN_FAILED) {
      if (live()) setPhase({ phase: 'idle', note: 'reauth_required' });
      return;
    }
    const accountId = view.accountId;
    let device: DeviceCopyOutcome = 'none';
    if (diary) {
      try {
        device = await settleDeviceCopy(result, { eraseForSignOut: () => diary.eraseForSignOut(), lock: () => diary.close() });
      } catch {
        device = 'erase_failed';
      }
    }
    if (device === 'erased' && accountId !== null) await eraseAccountKept(accountId).catch(() => undefined);
    if (live()) setPhase(deletionPhase(result, device));
  }

  async function start() {
    if (!fresh) return;
    setConfirming(false);
    setPhase({ phase: 'working' });
    // The request as it is handed over, so a failure after that keeps exactly it.
    const seen: { request: PendingDeletionRequest | null } = { request: null };
    const recorded: DeletionResources = {
      ...services.deletion,
      requestDeletion: (input, credentials) => {
        seen.request = { ...input, credentials };
        return services.deletion.requestDeletion(input, credentials);
      },
    };
    // The deletion email's language (K11): Thai in Thai, English otherwise.
    const language = locale === 'th' ? 'th' : 'en';
    try {
      await settle(await requestAccountDeletion({ resources: recorded, freshSignIn: fresh, credentials: () => services.credentials(), newId: () => services.newId(), language }));
    } catch {
      if (!live()) return;
      // Only the sign-in, or something that is not Jotbun's answer, throws: nothing here is erased.
      const sent = seen.request;
      setPhase(sent ? { phase: 'unconfirmed', request: sent, device: 'kept' } : { phase: 'idle', note: 'signin_unreachable' });
    }
  }

  /** The same request again (deletion.ts asks for the receipt when the resend is refused). */
  async function retry(request: PendingDeletionRequest) {
    setPhase({ phase: 'working' });
    try {
      await settle(await submitDeletionRequest(request, { resources: services.deletion }));
    } catch {
      if (live()) setPhase({ phase: 'unconfirmed', request, device: 'kept' });
    }
  }

  async function done(device: DeviceCopyOutcome) {
    if (device === 'erase_failed') await diary?.eraseForSignOut().catch(() => undefined);
    // No signed_out: under this account's analytics id it could bring back the PostHog person the deletion removes (R125).
    await services.signOut({ event: false }).catch(() => undefined);
  }

  let body: ReactNode;
  switch (phase.phase) {
    case 'idle':
    case 'working': {
      const line = phase.phase === 'idle' ? idleLine(phase.note, 'deleted', tc) : null;
      body = (
        <>
          <BunText>{tc("Deleting your account erases your diary, wallets, budgets and settings from Jotbun. It can't be undone.")}</BunText>
          <BunText>{tc('Download your data first if you want to keep a copy.')}</BunText>
          {line ? <Notice message={line} /> : null}
          <PillButton
            kind="secondary"
            label={tc('Delete my account')}
            busy={phase.phase === 'working'}
            busyLabel={tc('Sending your request…')}
            disabled={!fresh}
            disabledReason={tc("Deleting your account needs a fresh sign-in, which this build can't do yet.")}
            onPress={() => setConfirming(true)}
          />
        </>
      );
      break;
    }
    case 'accepted': {
      const device = deviceLine(phase.device, tc);
      body = (
        <View testID="privacy-delete-receipt" style={{ gap: BUN_SPACE.xs }}>
          <BunText variant="label" style={{ fontWeight: '700' }}>{phase.completed ? tc('Your account has been deleted') : tc('Your account is being deleted')}</BunText>
          <BunText selectable>{tc('Request number: {id}', { id: phase.requestId })}</BunText>
          {phase.completed ? null : <BunText>{tc("Jotbun finishes erasing your data within {hours} hours. You don't need to do anything else.", { hours: DELETION_TARGET_HOURS })}</BunText>}
          {device ? <BunText>{device}</BunText> : null}
          <PillButton label={tc('Done')} onPress={() => void done(phase.device)} />
        </View>
      );
      break;
    }
    case 'refused': {
      const device = deviceLine(phase.device, tc);
      body = (
        <>
          <Notice tone="alert" message={tc("Jotbun didn't accept the request, so nothing was deleted.")} />
          {device ? <BunText>{device}</BunText> : null}
        </>
      );
      break;
    }
    case 'unconfirmed':
      body = (
        <Notice
          message={tc("We couldn't confirm your request. Nothing on this phone was erased. Try again to send the same request.")}
          action={{ label: tc('Try again'), onPress: () => void retry(phase.request) }}
        />
      );
      break;
  }

  const lost = unsynced <= 0 ? null : unsynced === 1 ? tc("1 entry on this phone hasn't synced yet.") : tc("{count} entries on this phone haven't synced yet.", { count: unsynced });
  return (
    <Section title={tc('Delete your account')} testID="privacy-delete">
      {body}
      <ConfirmSheet
        visible={confirming}
        title={tc('Delete your account?')}
        consequence={[tc("You'll sign in again to confirm it's you. Then Jotbun erases your account and this phone's copy of your diary. This can't be undone."), lost].filter(Boolean).join(' ')}
        confirmLabel={tc('Delete my account')}
        cancelLabel={tc('Keep my account')}
        destructive
        onConfirm={() => void start()}
        onCancel={() => setConfirming(false)}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------

export function PrivacyScreen({ services, now, analyticsArea = isRedesignEnabled('analytics') }: PrivacyScreenProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const back = useBackTo('/settings');
  return (
    <View testID="privacy-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.xl }}>
        <StageHeader back={{ onPress: back }} title={tc('Privacy and data')} />
        <View style={PAGE_STYLE}>
          <Promises />
          {analyticsArea ? <AnalyticsSwitch /> : null}
          <ExportCard services={services} now={now} />
          <DeleteCard services={services} />
        </View>
      </ScrollView>
    </View>
  );
}
