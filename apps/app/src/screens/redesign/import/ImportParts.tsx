// Pieces of the redesigned import journey (R7, plan §6.5): the page frame,
// the expectation sheet's content, the staged progress with the box bun,
// counts and exact money lines, and the result. Built from the kit
// (src/ui), BunText and the useBunColors() tokens only. Copy goes through
// tc() and is in the catalogs, with Thai, approved at E2 checkpoint 5.
import type { Minor } from '@gogospend/contracts';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import type { StageLine } from '@mobile/spend/v1/redesign/import/importModel';
import { say } from '@mobile/spend/v1/redesign/shared';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { AmountText, useAmountWords } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { StagedProgress } from '@mobile/ui/StagedProgress';
import type { ProgressStage } from '@mobile/ui/StagedProgress';
import { StageHeader } from '@mobile/ui/StageHeader';
import { ActionFooter } from '../ActionFooter';
import { Notice, useGoBack } from '../HistoryParts';

/** "1,234": a count grouped by thousands, from its digits (never through floating point). */
export const grouped = (count: number): string => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The import screen's frame: the stage header with Back, the scrolling content and, when given, the pinned footer. */
export function ImportPage({ footer, children }: { footer?: ReactNode; children: ReactNode }) {
  const tc = useCopy();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const goBack = useGoBack('/spend');
  return (
    <View testID="import-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <StageHeader back={{ onPress: goBack }} title={tc('Import')} />
      <ScrollView
        testID="import-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md, paddingBottom: footer ? BUN_SPACE.md : insets.bottom + BUN_SPACE.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <ActionFooter testID="import-footer">{footer}</ActionFooter> : null}
    </View>
  );
}

/** The box bun: decorative, and gone when the person turned the bun off. */
export function BoxBun({ size = 'l' }: { size?: 'm' | 'l' }) {
  return (
    <View {...DECORATIVE} style={{ alignItems: 'center' }}>
      <Bun testID="import-bun" pose="box" size={size} />
    </View>
  );
}

/** Said when no diary is open (web, locked, opening): the import lives in memory for this visit only. */
export function VisitOnlyNote() {
  const tc = useCopy();
  return <ImportNotice testID="import-visit-only" tone="status" message={tc('This import is kept only while this screen is open.')} />;
}

/** What import can do, what it won't, and that nothing is saved until the person confirms. */
export function ExpectationContent({ onChoose, visitOnly = false }: { onChoose: () => void; visitOnly?: boolean }) {
  const tc = useCopy();
  const dash = <BunText style={{ fontWeight: '700' }}>–</BunText>;
  return (
    <View style={{ gap: BUN_SPACE.md }}>
      <BoxBun size="m" />
      <BunText variant="label" style={{ fontWeight: '700' }}>{tc('Nothing is saved until you confirm.')}</BunText>
      <PromiseList
        title={tc('Import can')}
        items={[
          { key: 'read', text: tc('Read CSV and Excel (XLSX) exports from other apps, and photos of receipts.') },
          { key: 'show', text: tc('Show every row for you to check, with anything unclear flagged.') },
          { key: 'match', text: tc("Match the file's wallets and categories to your own.") },
        ]}
      />
      <PromiseList
        title={tc("Import won't")}
        items={[
          { key: 'save', text: tc('Save anything before you confirm.'), icon: dash },
          { key: 'guess', text: tc('Guess. An unclear date or type stays unclear until you fix it.'), icon: dash },
          { key: 'drop', text: tc('Drop rows that look like duplicates. They\'re marked "probably" and kept unless you leave them out.'), icon: dash },
          { key: 'bank', text: tc('Connect to your bank.'), icon: dash },
        ]}
      />
      <BunText variant="caption" tone="muted">{tc("Files up to 12 MB. Jotbun deletes an uploaded file after 24 hours, and rows you didn't save after 7 days.")}</BunText>
      {visitOnly ? <VisitOnlyNote /> : null}
      <PillButton label={tc('Choose a file')} onPress={onChoose} />
    </View>
  );
}

const STAGE_WORDS = (lines: readonly StageLine[], tc: ReturnType<typeof useCopy>): ProgressStage[] =>
  lines.map((line) => ({ key: line.key, label: say(tc, line.label), status: line.status, done: line.done, total: line.total }));

/** Ticked stages, with the box bun while a file is uploaded or read. */
export function ProgressCard({ stages, title, bun = false, nothingSaved = false }: { stages: readonly StageLine[]; title?: string; bun?: boolean; nothingSaved?: boolean }) {
  const tc = useCopy();
  return (
    <Card testID="import-progress">
      {bun ? <BoxBun /> : null}
      <StagedProgress title={title} stages={STAGE_WORDS(stages, tc)} />
      {nothingSaved ? <BunText tone="muted">{tc('Nothing has been saved.')}</BunText> : null}
    </Card>
  );
}

/** A problem or an update, with at most one action, under a test id so a state can be found. */
export function ImportNotice({ testID, message, tone, action }: { testID?: string; message: string; tone: 'alert' | 'status'; action?: { label: string; onPress: () => void; busy?: boolean } }) {
  return (
    <View testID={testID}>
      <Notice message={message} tone={tone} action={action} />
    </View>
  );
}

/** "Money out ฿150.15", drawn as words and an exact amount, read as one line. */
export function MoneyLine({ label, spoken, minor }: { label: string; spoken: (amount: string) => string; minor: Minor }) {
  const words = useAmountWords();
  const amount = words(minor).shown;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={spoken(amount)} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: BUN_SPACE.sm }}>
      <BunText variant="label" tone="muted">{label}</BunText>
      <AmountText variant="label">{amount}</AmountText>
    </View>
  );
}

/** "Saved: 3", read as one line. */
export function CountLine({ label, spoken, count }: { label: string; spoken: string; count: number }) {
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={spoken} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: BUN_SPACE.sm }}>
      <BunText variant="label">{label}</BunText>
      <BunText variant="label" style={{ fontVariant: ['tabular-nums'] }}>{grouped(count)}</BunText>
    </View>
  );
}

/** A heading on the page. */
export function PageHeading({ children }: { children: string }) {
  return <BunText variant="heading" role="heading" accessibilityRole="header">{children}</BunText>;
}
