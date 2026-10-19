// R5 Insights: the Reminders screen (plan §6.3), behind the `insights` area
// until E2 checkpoint 3. It replaces S4's unbuilt reminder settings and runs
// on S4's reminder service (src/notifications): an on/off switch, the time
// chip (an hour and a 5-minute step in a sheet), seven day checks Monday
// first (at least one stays chosen), and a live preview of the notification
// with the bun peeking over it at full intensity. Nothing is saved until Save,
// pinned in the footer; then the OS's answer is said in words: on, off,
// notifications denied (the way to Settings), or not on the web.
//
// The service is injected for tests and the catalogue; by default it is the
// app's own, built as the reminder upkeep builds it (`createAppReminderService`).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { EVERY_DAY } from '@mobile/notifications/reminders';
import type { LocalReminderService, PermissionOutcome, ReminderPreference, Weekday } from '@mobile/notifications/reminders';
import { createAppReminderService, reminderContent } from '@mobile/notifications/useReminderUpkeep';
import { daysSummary, toggleDay, weekdayNames } from '@mobile/spend/v1/redesign/insights/remindersModel';
import type { DaysSummary } from '@mobile/spend/v1/redesign/insights/remindersModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { ActionFooter } from '../ActionFooter';
import { LoadingBlock, Notice, useGoBack } from '../HistoryParts';
import { DayChecks, DayNote, NotificationPreview, PlainNotice, ReminderSwitch, Section, TimeChip, TimeSheet } from './RemindersParts';

export type RemindersScreenProps = {
  /** The reminder service; the app's own when left out (tests and the catalogue pass a fake). */
  service?: LocalReminderService;
};

/** What Save came back with: the OS's answer, or a failure to save at all. */
type SaveOutcome = PermissionOutcome | 'failed';

/** Before anything is saved: off, at 20:00, every day (the service's own default). */
const FIRST_DRAFT: ReminderPreference = { enabled: false, localTime: '20:00', weekdays: EVERY_DAY };

export function RemindersScreen({ service: given }: RemindersScreenProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const locale = useActiveLocale();
  const goBack = useGoBack('/spend/insights');
  const { intensity } = useBunIntensity();
  const service = useMemo(() => given ?? createAppReminderService(locale), [given, locale]);
  const names = useMemo(() => weekdayNames(locale), [locale]);
  const content = reminderContent(locale);

  const [draft, setDraft] = useState<ReminderPreference | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [dayNote, setDayNote] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    service.getPreference().then(
      (preference) => { if (active) setDraft(preference); },
      // The stored choice cannot be read: start from the default, which Save then writes.
      () => { if (active) setDraft(FIRST_DRAFT); },
    );
    return () => { active = false; };
  }, [service]);

  const supported = service.supported;
  const locked = saving || !supported;

  /** A change to the draft: the last outcome no longer describes the screen. */
  const edit = (change: (current: ReminderPreference) => ReminderPreference) => {
    setDraft((current) => (current ? change(current) : current));
    setOutcome(null);
  };
  const toggle = (day: Weekday) => {
    if (!draft) return;
    const next = toggleDay(draft.weekdays, day);
    setDayNote(next.kept);
    if (!next.kept) edit((current) => ({ ...current, weekdays: next.weekdays }));
  };

  const save = async () => {
    if (!draft || saving || !supported) return;
    setSaving(true);
    setOutcome(null);
    setDayNote(false);
    try {
      const result = await service.setPreference(draft);
      if (!live.current) return;
      // A denial is settled off by the service: the switch says so too.
      if (result === 'denied' || result === 'unsupported') setDraft((current) => (current ? { ...current, enabled: false } : current));
      setOutcome(result);
    } catch {
      if (live.current) setOutcome('failed');
    } finally {
      if (live.current) setSaving(false);
    }
  };

  const days = draft ? daysWords(daysSummary(draft.weekdays, names), tc) : '';
  const unsupportedText = tc('Reminders work in the Jotbun app on your phone, not on the web.');
  const lastDayText = tc('Keep at least one day. To stop reminders, turn them off.');

  return (
    <View testID="reminders-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView testID="reminders-scroll" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.lg, gap: BUN_SPACE.lg }}>
        <StageHeader title={tc('Reminders')} back={{ onPress: goBack }} />
        {!draft ? (
          <LoadingBlock label={tc('Loading your reminder')} />
        ) : (
          <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.lg }}>
            <Card padding="sm">
              <ReminderSwitch label={tc('Remind me to log')} value={draft.enabled && supported} disabled={locked} onChange={(enabled) => edit((current) => ({ ...current, enabled }))} />
            </Card>
            {!supported ? <PlainNotice testID="reminders-unsupported" message={unsupportedText} /> : null}
            {supported && !draft.enabled ? <BunText tone="muted">{tc("Jotbun won't remind you.")}</BunText> : null}
            {supported && draft.enabled ? (
              <>
                <Section label={tc('Preview')}>
                  <NotificationPreview title={content.title} body={content.body} time={draft.localTime} bun={intensity === 'full'} />
                  <BunText testID="reminders-schedule" variant="caption" tone="muted">{tc('{days} at {time}', { days, time: draft.localTime })}</BunText>
                </Section>
                <Section label={tc('Time')}>
                  <TimeChip time={draft.localTime} open={timeOpen} disabled={locked} onOpen={() => setTimeOpen(true)} />
                </Section>
                <Section label={tc('Days')}>
                  <DayChecks names={names} chosen={draft.weekdays} disabled={locked} lastDayHint={lastDayText} onToggle={toggle} />
                  {dayNote ? <DayNote message={lastDayText} /> : null}
                </Section>
                <TimeSheet visible={timeOpen} time={draft.localTime} onChange={(localTime) => edit((current) => ({ ...current, localTime }))} onClose={() => setTimeOpen(false)} />
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
      <ActionFooter testID="reminders-footer">
        {outcome ? <Outcome outcome={outcome} /> : null}
        <PillButton testID="reminders-save" label={tc('Save')} busy={saving} busyLabel={tc('Saving…')} disabled={!draft || !supported} onPress={() => void save()} />
      </ActionFooter>
    </View>
  );
}

/** The chosen days in words: "Every day", "Weekdays", "Weekends", or "Mon, Wed, Fri". */
function daysWords(summary: DaysSummary, tc: (english: string) => string): string {
  if (summary.kind === 'some') return summary.text;
  switch (summary.kind) {
    case 'every_day': return tc('Every day');
    case 'weekdays': return tc('Weekdays');
    case 'weekends': return tc('Weekends');
  }
}

/** Save's answer in words. Problems are alerts, in ink: never red. */
function Outcome({ outcome }: { outcome: SaveOutcome }) {
  const tc = useCopy();
  switch (outcome) {
    case 'scheduled': return <Notice message={tc('Saved. Your reminder is on.')} />;
    case 'disabled': return <Notice message={tc('Saved. Reminders are off.')} />;
    case 'denied': return <Notice tone="alert" message={tc("Jotbun can't send notifications. Turn on notifications for Jotbun in Settings.")} />;
    case 'unsupported': return <Notice tone="alert" message={tc('Reminders work in the Jotbun app on your phone, not on the web.')} />;
    case 'failed': return <Notice tone="alert" message={tc('Could not save that. Try again.')} />;
  }
}
