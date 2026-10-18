// Catalogue sections for the R2a kit (redesign R2c, development only). Each
// section shows one component's states and fits one 402 × 874 pt screen under
// the catalogue's header. Interface copy goes through `tc`, as on a screen;
// sample names come from ./samples.
import { Bank, ChartPieSlice, ClockCounterClockwise, House, Lock, Megaphone, Prohibit, User } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Bun } from '@mobile/mascot/Bun';
import { BunPeek } from '@mobile/mascot/BunPeek';
import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { Amount } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { Card, OutlinedCard } from '@mobile/ui/Card';
import { EmptyState } from '@mobile/ui/EmptyState';
import { FlagChip } from '@mobile/ui/FlagChip';
import { BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { ReceiptRow, ReceiptSlip, ReceiptTotal } from '@mobile/ui/ReceiptSlip';
import { ConfirmSheet, Sheet } from '@mobile/ui/Sheet';
import { StagedProgress } from '@mobile/ui/StagedProgress';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import { TabBar } from '@mobile/ui/TabBar';
import type { TabBarItem } from '@mobile/ui/TabBar';
import { UndoBar } from '@mobile/ui/UndoBar';
import { FullBleed, NoInsets, Specimen, SpecimenLabel, SpecimenRow } from './parts';
import type { CatalogueSection } from './registry';
import { SAMPLE_MINOR, useSamples } from './samples';

const noop = () => {};

function AmountSection() {
  const { lunch, salary, move, negative, rent } = SAMPLE_MINOR;
  return (
    <>
      <Specimen label="Sizes s, m, l and xl (an expense)">
        <View style={{ gap: BUN_SPACE.xs }}>
          <Amount minor={lunch} type="expense" size="s" />
          <Amount minor={lunch} type="expense" size="m" />
          <Amount minor={lunch} type="expense" size="l" />
          <Amount minor={lunch} type="expense" size="xl" />
        </View>
      </Specimen>
      <SpecimenRow label="Income"><Amount minor={salary} type="income" /></SpecimenRow>
      <SpecimenRow label="Transfer"><Amount minor={move} type="transfer" /></SpecimenRow>
      <SpecimenRow label="No type, below zero"><Amount minor={negative} /></SpecimenRow>
      <SpecimenRow label="Receipt serif, l"><Amount minor={rent} type="expense" size="l" serif /></SpecimenRow>
      <SpecimenRow label="Receipt serif, xl"><Amount minor={SAMPLE_MINOR.monthSpent} type="expense" size="xl" serif /></SpecimenRow>
    </>
  );
}

function Ground({ color, children }: { color: string; children: ReactNode }) {
  return <View style={{ backgroundColor: color, borderRadius: BUN_RADIUS.card, padding: BUN_SPACE.md }}>{children}</View>;
}

function AmountStatesSection() {
  const colors = useBunColors();
  const { coffee, lunch, rent } = SAMPLE_MINOR;
  return (
    <>
      <SpecimenRow label="Confirmed"><Amount minor={coffee} type="expense" /></SpecimenRow>
      <SpecimenRow label="Saving"><Amount minor={coffee} type="expense" state="saving" /></SpecimenRow>
      <SpecimenRow label="Conflict"><Amount minor={coffee} type="expense" state="conflict" /></SpecimenRow>
      <SpecimenRow label="Saving, l"><Amount minor={lunch} type="expense" size="l" state="saving" /></SpecimenRow>
      <SpecimenRow label="Conflict, l serif"><Amount minor={rent} type="expense" size="l" serif state="conflict" /></SpecimenRow>
      <Specimen label="On the lavender stage, saving">
        <Ground color={colors.stage}><Amount minor={lunch} type="expense" size="l" state="saving" on="stage" /></Ground>
      </Specimen>
      <Specimen label="On an ink fill, saving">
        <Ground color={colors.ink}><Amount minor={lunch} type="expense" size="l" state="saving" on="ink" /></Ground>
      </Specimen>
    </>
  );
}

function PillButtonSection() {
  const tc = useCopy();
  return (
    <>
      <SpecimenRow label="Primary"><PillButton label={tc('Save entry')} onPress={noop} /></SpecimenRow>
      <SpecimenRow label="Primary, busy"><PillButton label={tc('Save entry')} busy busyLabel={tc('Saving…')} onPress={noop} /></SpecimenRow>
      <SpecimenRow label="Primary, disabled"><PillButton label={tc('Save entry')} disabled disabledReason={tc('Enter an amount first')} onPress={noop} /></SpecimenRow>
      <SpecimenRow label="Secondary"><PillButton kind="secondary" label={tc('Add another')} onPress={noop} /></SpecimenRow>
      <SpecimenRow label="Secondary, busy"><PillButton kind="secondary" label={tc('Add another')} busy onPress={noop} /></SpecimenRow>
      <SpecimenRow label="Secondary, disabled"><PillButton kind="secondary" label={tc('Add another')} disabled onPress={noop} /></SpecimenRow>
      <Specimen label="Full width">
        <PillButton label={tc('Add your first wallet')} onPress={noop} />
      </Specimen>
    </>
  );
}

function WalletLine({ name, minor }: { name: string; minor: typeof SAMPLE_MINOR.cashBalance }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: BUN_SPACE.sm, flexWrap: 'wrap' }}>
      <BunText variant="label">{name}</BunText>
      <Amount minor={minor} />
    </View>
  );
}

function CardSection() {
  const tc = useCopy();
  const samples = useSamples();
  return (
    <>
      <Specimen label="Card (cream)">
        <Card>
          <BunText variant="heading" role="heading" accessibilityRole="header">{tc('Wallets')}</BunText>
          <WalletLine name={samples.cash} minor={SAMPLE_MINOR.cashBalance} />
          <WalletLine name={samples.daily} minor={SAMPLE_MINOR.dailyBalance} />
        </Card>
      </Specimen>
      <Specimen label="OutlinedCard (no fill, for calm screens)">
        <OutlinedCard>
          <WalletLine name={samples.cash} minor={SAMPLE_MINOR.cashBalance} />
          <BunText variant="caption" tone="muted">{samples.note}</BunText>
        </OutlinedCard>
      </Specimen>
      <Specimen label="Card, small padding">
        <Card padding="sm">
          <BunText>{samples.merchant}</BunText>
        </Card>
      </Specimen>
    </>
  );
}

function StageHeaderSection() {
  const tc = useCopy();
  const samples = useSamples();
  return (
    <>
      <FullBleed>
        <NoInsets>
          <StageHeader title={tc('Home')} month={{ label: samples.monthLabel, onPrevious: noop, onNext: noop }}>
            <Amount minor={SAMPLE_MINOR.monthSpent} type="expense" size="xl" on="stage" />
            <BunText tone="ink">{tc('of {budget} this month', { budget: samples.money(SAMPLE_MINOR.monthBudget) })}</BunText>
          </StageHeader>
        </NoInsets>
      </FullBleed>
      {/* The bun peeks over the card's top edge, against the stage above it. */}
      <View style={{ marginTop: BUN_SPACE.lg }}>
        <Card>
          <BunPeek edge="top" />
          <BunText variant="label">{tc('{amount} a day left · on track', { amount: samples.money(SAMPLE_MINOR.dailyLeft) })}</BunText>
        </Card>
      </View>
      <Specimen label="No later month, with the bun in its slot">
        <FullBleed>
          <NoInsets>
            <StageHeader title={tc('Budget')} subtitle={samples.monthLabel} month={{ label: samples.monthLabel, onPrevious: noop }} bun={<Bun pose="holding-receipt" size="m" />} />
          </NoInsets>
        </FullBleed>
      </Specimen>
    </>
  );
}

function ReceiptSection() {
  const tc = useCopy();
  const samples = useSamples();
  const { coffee, lunch, today, rent } = SAMPLE_MINOR;
  return (
    <>
      <ReceiptSlip title={tc('Today')} footer={tc('1 entry saving · it will sync when you are online')}>
        <ReceiptRow label={samples.coffee} value={<Amount minor={coffee} type="expense" />} />
        <ReceiptRow label={samples.lunch} value={<Amount minor={lunch} type="expense" state="saving" />} />
        <ReceiptRow label={tc('Wallet')} value={samples.cash} />
        <ReceiptTotal label={tc('Total')} minor={today} type="expense" state="saving" />
      </ReceiptSlip>
      <ReceiptSlip title={samples.rent}>
        <ReceiptRow label={tc('Category')} value={tc('Bills')} />
        <ReceiptRow label={tc('Date')} value={samples.dayLabel} />
        <ReceiptRow label={tc('Note')} value={samples.note} />
        <ReceiptTotal label={tc('Amount')} minor={rent} type="expense" />
      </ReceiptSlip>
    </>
  );
}

function useTabItems(): TabBarItem[] {
  const tc = useCopy();
  return [
    { key: 'home', label: tc('Home'), icon: ({ selected, color }) => <House size={22} color={color} weight={selected ? 'fill' : 'regular'} /> },
    { key: 'history', label: tc('History'), icon: ({ selected, color }) => <ClockCounterClockwise size={22} color={color} weight={selected ? 'bold' : 'regular'} /> },
    { key: 'budget', label: tc('Budget'), icon: ({ selected, color }) => <ChartPieSlice size={22} color={color} weight={selected ? 'fill' : 'regular'} /> },
    { key: 'me', label: tc('Me'), icon: ({ selected, color }) => <User size={22} color={color} weight={selected ? 'fill' : 'regular'} /> },
  ];
}

function TabBarSection() {
  const tc = useCopy();
  const items = useTabItems();
  const [active, setActive] = useState('home');
  return (
    <>
      <Specimen label="Tap a tab to move the selection">
        <FullBleed><NoInsets><TabBar items={items} active={active} onSelect={setActive} onAdd={noop} addLabel={tc('Add a record')} /></NoInsets></FullBleed>
      </Specimen>
      <Specimen label="Budget selected">
        <FullBleed><NoInsets><TabBar items={items} active="budget" onSelect={noop} onAdd={noop} addLabel={tc('Add a record')} /></NoInsets></FullBleed>
      </Specimen>
      <Specimen label="Labels only (the tab set is decision D7)">
        <FullBleed><NoInsets><TabBar items={items.map((item) => ({ ...item, icon: null }))} active="history" onSelect={noop} onAdd={noop} addLabel={tc('Add a record')} /></NoInsets></FullBleed>
      </Specimen>
    </>
  );
}

type OpenSheet = 'sheet' | 'confirm' | 'delete' | null;
/** How long a confirm sheet shows its busy state before it closes. */
const BUSY_MS = 1500;

function SheetSection() {
  const tc = useCopy();
  const samples = useSamples();
  const [open, setOpen] = useState<OpenSheet>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const close = () => { setBusy(false); setOpen(null); };
  const confirm = () => {
    setBusy(true);
    timer.current = setTimeout(close, BUSY_MS);
  };
  const moved = samples.money(SAMPLE_MINOR.move);
  return (
    <>
      <SpecimenLabel>Each button opens a sheet. Confirming shows the busy state for a moment, then closes.</SpecimenLabel>
      <PillButton kind="secondary" label="Open a sheet" onPress={() => setOpen('sheet')} />
      <PillButton kind="secondary" label="Open a confirm sheet" onPress={() => setOpen('confirm')} />
      <PillButton kind="secondary" label="Open a delete confirm" onPress={() => setOpen('delete')} />
      <Sheet visible={open === 'sheet'} onClose={close} title={tc('Pick a wallet')}>
        <WalletLine name={samples.cash} minor={SAMPLE_MINOR.cashBalance} />
        <WalletLine name={samples.daily} minor={SAMPLE_MINOR.dailyBalance} />
      </Sheet>
      <ConfirmSheet
        visible={open === 'confirm'}
        title={tc('Move {amount} to {wallet}?', { amount: moved, wallet: samples.daily })}
        consequence={tc('{amount} leaves {from} and arrives in {to} today.', { amount: moved, from: samples.cash, to: samples.daily })}
        confirmLabel={tc('Move money')}
        busy={busy}
        onConfirm={confirm}
        onCancel={close}
      />
      <ConfirmSheet
        visible={open === 'delete'}
        title={tc('Delete this entry?')}
        consequence={tc('{entry} {amount} moves to Recently deleted for 30 days.', { entry: samples.coffee, amount: samples.money(SAMPLE_MINOR.coffee) })}
        confirmLabel={tc('Delete entry')}
        destructive
        busy={busy}
        art={<Bun pose="quiet" size="m" />}
        onConfirm={confirm}
        onCancel={close}
      />
    </>
  );
}

function EmptyStateSection() {
  const tc = useCopy();
  return (
    <>
      <SpecimenLabel>First run: the one primary action on the screen.</SpecimenLabel>
      <EmptyState
        art={<Bun pose="hello" size="l" />}
        title={tc('No wallets yet')}
        body={tc('Add a wallet to start your diary.')}
        action={{ label: tc('Add your first wallet'), onPress: noop }}
      />
    </>
  );
}

function EmptyStateInCardSection() {
  const tc = useCopy();
  return (
    <>
      <SpecimenLabel>Inside a card on a screen that already has its primary, so the action is secondary.</SpecimenLabel>
      <OutlinedCard>
        <EmptyState
          art={<Bun pose="thinking" size="m" />}
          title={tc('Nothing logged today')}
          body={tc('Entries you add today show up here.')}
          action={{ label: tc('Add a record'), onPress: noop, kind: 'secondary' }}
        />
      </OutlinedCard>
    </>
  );
}

function SyncBannerSection() {
  return (
    <>
      <SyncBanner state="offline" />
      <SyncBanner state="saving" count={1} />
      <SyncBanner state="saving" count={3} />
      <SyncBanner state="checking" count={1} />
      <SyncBanner state="checking" count={2} />
      <SpecimenLabel>A zero count draws no banner.</SpecimenLabel>
    </>
  );
}

function SyncBannerReviewSection() {
  const tc = useCopy();
  return (
    <>
      <SyncBanner state="needs_review" count={2} action={{ label: tc('Review'), onPress: noop }} />
      <SyncBanner state="paused_upgrade" action={{ label: tc('Update'), onPress: noop }} />
      <SyncBanner state="locked" action={{ label: tc('Sign in'), onPress: noop }} />
      <Specimen label="Without an action">
        <SyncBanner state="paused_upgrade" />
      </Specimen>
    </>
  );
}

function UndoBarSection() {
  const tc = useCopy();
  const samples = useSamples();
  return (
    <>
      <UndoBar message={tc('Entry deleted')} onUndo={noop} />
      <UndoBar message={tc('{entry} {amount} moved to Recently deleted', { entry: samples.coffee, amount: samples.money(SAMPLE_MINOR.coffee) })} onUndo={noop} />
      <SpecimenLabel>Neither bar times out here: an undo bar waits while a screen reader runs, and on the web always.</SpecimenLabel>
    </>
  );
}

function ImportRow({ title, minor, children }: { title: string; minor: typeof SAMPLE_MINOR.coffee; children: ReactNode }) {
  return (
    <OutlinedCard padding="sm">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: BUN_SPACE.sm, flexWrap: 'wrap' }}>
        <BunText>{title}</BunText>
        <Amount minor={minor} type="expense" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>{children}</View>
    </OutlinedCard>
  );
}

function FlagChipSection() {
  const tc = useCopy();
  const samples = useSamples();
  return (
    <>
      <SpecimenRow label="Warning"><FlagChip label={tc('Date unclear')} /></SpecimenRow>
      <SpecimenRow label="Info"><FlagChip tone="info" label={tc('Total is rounded')} /></SpecimenRow>
      <Specimen label="On import rows">
        <View style={{ gap: BUN_SPACE.sm }}>
          <ImportRow title={samples.coffee} minor={SAMPLE_MINOR.coffee}>
            <FlagChip label={tc('Probably a duplicate')} />
            <FlagChip tone="info" label={tc('New category')} />
          </ImportRow>
          <ImportRow title={samples.lunch} minor={SAMPLE_MINOR.lunch}>
            <FlagChip label={tc('Date unclear')} />
          </ImportRow>
        </View>
      </Specimen>
    </>
  );
}

function PromiseListSection() {
  const tc = useCopy();
  const colors = useBunColors();
  const icon = (Glyph: typeof Bank) => <Glyph size={22} color={colors.ink} />;
  return (
    <>
      <PromiseList
        title={tc('Your diary stays yours')}
        items={[
          { key: 'bank', text: tc('No bank connection. You add every entry yourself.'), icon: icon(Bank) },
          { key: 'sold', text: tc('Your data is never sold.'), icon: icon(Prohibit) },
          { key: 'ads', text: tc('No ads.'), icon: icon(Megaphone) },
          { key: 'read', text: tc('Not even Jotbun can read your diary.'), icon: icon(Lock) },
        ]}
      />
      <Specimen label="Default ticks, no title">
        <PromiseList
          items={[
            { key: 'free', text: tc('Free to start.') },
            { key: 'export', text: tc('Export everything, any time.') },
            { key: 'delete', text: tc('Delete your account whenever you like.') },
          ]}
        />
      </Specimen>
    </>
  );
}

function StagedProgressSection() {
  const tc = useCopy();
  return (
    <>
      <StagedProgress
        title={tc('Importing your file')}
        stages={[
          { key: 'read', label: tc('Read the file'), status: 'done', done: 1234, total: 1234 },
          { key: 'check', label: tc('Check rows'), status: 'active', done: 120, total: 5678 },
          { key: 'duplicates', label: tc('Find duplicates'), status: 'pending' },
          { key: 'save', label: tc('Save records'), status: 'pending' },
        ]}
      />
      <Specimen label="A stage that failed">
        <StagedProgress
          stages={[
            { key: 'read', label: tc('Read the file'), status: 'done', done: 120, total: 120 },
            { key: 'check', label: tc('Check rows'), status: 'failed', done: 37, total: 120 },
            { key: 'saved', label: tc('Records saved'), status: 'done', done: 342 },
          ]}
        />
      </Specimen>
    </>
  );
}

/** The R2a kit, one section per component (or per screenful). */
export const KIT_SECTIONS: readonly CatalogueSection[] = [
  { id: 'amount', title: 'Amount: sizes, types', group: 'Kit', render: () => <AmountSection /> },
  { id: 'amount-states', title: 'Amount: states', group: 'Kit', render: () => <AmountStatesSection /> },
  { id: 'pill-button', title: 'Pill button', group: 'Kit', render: () => <PillButtonSection /> },
  { id: 'card', title: 'Cards', group: 'Kit', render: () => <CardSection /> },
  { id: 'stage-header', title: 'Stage header', group: 'Kit', render: () => <StageHeaderSection /> },
  { id: 'receipt', title: 'Receipt slip', group: 'Kit', render: () => <ReceiptSection /> },
  { id: 'tab-bar', title: 'Tab bar', group: 'Kit', render: () => <TabBarSection /> },
  { id: 'sheet', title: 'Sheets', group: 'Kit', render: () => <SheetSection /> },
  { id: 'empty-state', title: 'Empty state', group: 'Kit', render: () => <EmptyStateSection /> },
  { id: 'empty-state-card', title: 'Empty state in a card', group: 'Kit', render: () => <EmptyStateInCardSection /> },
  { id: 'sync-banner', title: 'Sync: sending', group: 'Kit', render: () => <SyncBannerSection /> },
  { id: 'sync-banner-review', title: 'Sync: needs you', group: 'Kit', render: () => <SyncBannerReviewSection /> },
  { id: 'undo-bar', title: 'Undo bar', group: 'Kit', render: () => <UndoBarSection /> },
  { id: 'flag-chip', title: 'Flag chip', group: 'Kit', render: () => <FlagChipSection /> },
  { id: 'promise-list', title: 'Promise list', group: 'Kit', render: () => <PromiseListSection /> },
  { id: 'staged-progress', title: 'Staged progress', group: 'Kit', render: () => <StagedProgressSection /> },
];
