// R6: Privacy and data (plan §6.4), from Settings, behind the `account` area
// until E2 checkpoint 4. A calm data screen, no bun:
//
// - Promises in plain words: no bank connection, never sold, no ads, and not
//   even Jotbun reads the diary.
// - Export (P4, privacy.ts): a fresh sign-in for `export`, the request for
//   everything up to today, then the file's status (preparing, ready until a
//   set time, expired, failed) and the download, checked against the ready
//   export's size and digest and handed to the share sheet. An answer that was
//   lost keeps the exact request, and Try again resends it: same key, same
//   body, same proof. A file too large for one export can be asked for this
//   year only.
// - Delete account (P5, deletion.ts): a calm warning and "download your data
//   first", a confirm, a fresh sign-in for `deletion`, then the receipt of the
//   request, with what became of this phone's copy (`settleDeviceCopy`: erased
//   only after a confirmed acceptance, locked after a refusal, otherwise
//   kept). Done signs this device out.
//
// Today's build has no fresh sign-in (the Auth0 SDK arrives with E1/E2), so
// both actions say plainly that they can't be done yet; nothing pretends.
import { DELETION_TARGET_HOURS, EXPORT_TTL_HOURS } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import type { Proof } from '@mobile/auth/reauthentication';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { requestAccountDeletion, settleDeviceCopy, submitDeletionRequest } from '@mobile/spend/v1/deletion';
import type { DeletionState, PendingDeletionRequest } from '@mobile/spend/v1/deletion';
import { downloadExport, pollExport, requestExport, retryExportRequest } from '@mobile/spend/v1/privacy';
import type { ExportState, PendingExportRequest } from '@mobile/spend/v1/privacy';
import { bangkokClock, deletionPhase, downloadPhase, exportFilter, exportPhase } from '@mobile/spend/v1/redesign/account/privacyModel';
import type { DeletionPhase, DeviceCopyOutcome, ExportPhase, ExportScope, IdleNote, ReadyExport } from '@mobile/spend/v1/redesign/account/privacyModel';
import { unsyncedEntries } from '@mobile/spend/v1/redesign/account/settingsModel';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
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
import { appPrivacyServices } from './PrivacyParts';
import type { PrivacyServices } from './PrivacyParts';
import { PAGE_STYLE, Section, useBackTo } from './SettingsParts';

type Tc = ReturnType<typeof useCopy>;

export type PrivacyScreenProps = {
  /** The export, deletion, re-authentication and sign-out services; the app's own unless given. */
  services?: PrivacyServices;
  /** The clock "today" is read from (tests and the catalogue pin it). */
  now?: Date;
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
  const reauth = services.reauthenticate;
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

  /** A fresh sign-in for `export`, then the request; its first status check comes back at once. */
  async function request(nextScope: ExportScope) {
    if (!reauth) return;
    scope.current = nextScope;
    const filter = exportFilter(today, nextScope);
    setPhase({ phase: 'requesting' });
    const seen: { proof: Proof | null } = { proof: null };
    try {
      const result = await requestExport(filter, { resources, ...pace, maxPolls: 1, reauthenticate: async () => (seen.proof = await reauth('export')) });
      if (live()) show(result, true);
    } catch (error) {
      if (!live()) return;
      // No proof: the sign-in itself failed. Unreachable after it: the answer (or the first check) was lost, so the very same request is kept.
      const sent = seen.proof;
      if (!sent) setPhase({ phase: 'idle', note: 'signin_unreachable' });
      else if (unreachable(error)) setPhase({ phase: 'unconfirmed', request: { filter, proofId: sent.proofId, commandId: sent.commandId } });
      else setPhase({ phase: 'idle', note: 'refused' });
    }
  }

  /** Resends exactly the request whose answer was lost (privacy.ts's rule): no new sign-in, no new key. */
  async function retry(pending: PendingExportRequest) {
    setPhase({ phase: 'requesting' });
    try {
      // A resend carries the proof it was first sent with: it never asks for a new one.
      const result = await retryExportRequest(pending, { resources, ...pace, maxPolls: 1, reauthenticate: async () => null });
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
    <PillButton label={label} disabled={!reauth} disabledReason={unavailable} onPress={() => void request(nextScope)} />
  );

  let body: ReactNode;
  switch (phase.phase) {
    case 'idle': {
      const line = idleLine(phase.note, 'requested', tc);
      body = (
        <>
          {line ? <Notice message={line} /> : null}
          {requestButton(tc('Request export'), 'everything')}
          {reauth ? <BunText variant="caption" tone="muted">{tc("You'll sign in again to confirm it's you.")}</BunText> : null}
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
  const reauth = services.reauthenticate;
  const unsynced = unsyncedEntries(diary ? view : null);

  /** deletion.ts's outcome, and this phone's copy settled by its one rule. */
  async function settle(result: DeletionState) {
    let device: DeviceCopyOutcome = 'none';
    if (diary) {
      try {
        device = await settleDeviceCopy(result, { eraseForSignOut: () => diary.eraseForSignOut(), lock: () => diary.close() });
      } catch {
        device = 'erase_failed';
      }
    }
    if (live()) setPhase(deletionPhase(result, device));
  }

  async function start() {
    if (!reauth) return;
    setConfirming(false);
    setPhase({ phase: 'working' });
    const seen: { proof: Proof | null } = { proof: null };
    try {
      await settle(await requestAccountDeletion({ resources: services.deletion, reauthenticate: async () => (seen.proof = await reauth('deletion')) }));
    } catch {
      if (!live()) return;
      // Only the sign-in, or something that is not Jotbun's answer, throws: nothing here is erased.
      const sent = seen.proof;
      setPhase(sent ? { phase: 'unconfirmed', request: { proofId: sent.proofId, commandId: sent.commandId }, device: 'kept' } : { phase: 'idle', note: 'signin_unreachable' });
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
    await services.signOut().catch(() => undefined);
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
            disabled={!reauth}
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

export function PrivacyScreen({ services: given, now }: PrivacyScreenProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const back = useBackTo('/settings');
  const [services] = useState(() => given ?? appPrivacyServices());
  return (
    <View testID="privacy-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.xl }}>
        <StageHeader back={{ onPress: back }} title={tc('Privacy and data')} />
        <View style={PAGE_STYLE}>
          <Promises />
          <ExportCard services={services} now={now} />
          <DeleteCard services={services} />
        </View>
      </ScrollView>
    </View>
  );
}
