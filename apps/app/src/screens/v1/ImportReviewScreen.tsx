// P3 import review and progress (local work; NOT routed, pending E2 visual
// approval). It drives the import journey in `spend/v1/importReview.ts`:
// parsing -> review -> freeze the full selection -> confirm batches ->
// progress and result. Nothing is chosen for the user: each row is included
// and checked explicitly (date, direction, category and wallet), and every
// file label is mapped to an owned wallet or category. "Parsing succeeded" is
// never shown as saved; progress is the server's committed, remaining and
// not-saved counts. An unknown outcome keeps the review and retries the same
// command. Copy is a draft module (importReviewCopy.draft.ts) until approved;
// the import flag stays off.
import type { CategoryDto, ImportCandidate, WalletDto } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import {
  REVIEW_FIELDS,
  awaitPreview,
  confirmBatches,
  editRow,
  freezeSelection,
  mapCategory,
  mapWallet,
  markReviewed,
  newJourney,
  progressCounts,
  reloadPreview,
  resumeImport,
  reviewBlockers,
  rowView,
  saveCorrections,
  selectRows,
} from '@mobile/spend/v1/importReview';
import type { ImportDeps, ImportDraftStore, ImportJourney, ImportProblem } from '@mobile/spend/v1/importReview';
import type { ImportResources } from '@mobile/spend/v1/imports';
import { formatMinor } from '@mobile/spend/v1/money';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { categoryName } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { radii, spacing } from '@mobile/theme/tokens';
import { useImportReviewCopy } from './importReviewCopy.draft';
import type { ImportCopyKey } from './importReviewCopy.draft';
import { Button, Card, Chip, ChipRow, Frame, Loading, Notice, newId, useMoneyLocale } from './parts';

/** Rows shown at once; "Show more" reveals the next page. */
const PAGE = 50;

const PROBLEM_COPY: Readonly<Record<ImportProblem['kind'], ImportCopyKey>> = {
  unconfirmed: 'unconfirmed',
  offline: 'offline',
  review_changed: 'reviewChanged',
  selection_conflict: 'selectionConflict',
  preview_unavailable: 'expired',
  row_committed: 'rowCommitted',
  invalid: 'invalid',
  rate_limited: 'rateLimited',
  blocked: 'blocked',
  parse_failed: 'rejected',
  rejected: 'rejected',
};

type Busy = 'loading' | 'saving' | null;

function Progress({ journey }: { journey: ImportJourney }) {
  const t = useImportReviewCopy();
  const { colors } = useTheme();
  const counts = progressCounts(journey);
  return (
    <View role="status" accessibilityLiveRegion="polite" aria-live="polite" style={{ backgroundColor: colors.panelRaised, borderRadius: radii.md, padding: spacing.md }}>
      <Text style={{ color: colors.ink }}>{t('progress', { committed: counts.committed, selected: counts.selected, remaining: counts.remaining, conflicted: counts.conflicted })}</Text>
    </View>
  );
}

export function ImportReviewScreen({ jobId, imports, store, pollMs }: { jobId: string; imports: ImportResources; store: ImportDraftStore; pollMs?: number }) {
  const t = useImportReviewCopy();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const { colors } = useTheme();
  const resources = useSpendV1();
  const [journey, setJourney] = useState<ImportJourney | null>(null);
  const [wallets, setWallets] = useState<WalletDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [busy, setBusy] = useState<Busy>('loading');
  const [shown, setShown] = useState(PAGE);
  const deps = useRef<ImportDeps>({ resources: imports, store, newId, pollMs });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // One step at a time; its result replaces the journey only while the screen is shown.
  const run = useCallback(async (step: () => Promise<ImportJourney>, kind: Busy = 'saving') => {
    setBusy(kind);
    try {
      const next = await step();
      if (alive.current) setJourney(next);
    } finally {
      if (alive.current) setBusy(null);
    }
  }, []);

  useEffect(() => {
    void run(async () => {
      const [ownWallets, ownCategories] = await Promise.all([resources.wallets(), resources.ensureBuiltinCategories()]);
      if (alive.current) {
        setWallets(ownWallets.filter((wallet) => !wallet.archived));
        setCategories(ownCategories.filter((category) => !category.archived));
      }
      // A kept draft of this import (pending commands included) resumes as it was.
      const kept = await resumeImport(deps.current);
      let current = kept?.jobId === jobId ? kept : { ...newJourney(), jobId, stage: 'parsing' as const };
      if (alive.current) setJourney(current);
      if (current.stage === 'parsing' || current.stage === 'idle') {
        for (let round = 0; round < 60 && alive.current; round += 1) {
          current = await awaitPreview(current, deps.current);
          if (alive.current) setJourney(current);
          if (current.stage !== 'parsing' || current.problem) break;
        }
      }
      return current;
    }, 'loading');
  }, [jobId, resources, run]);

  if (!journey || (busy === 'loading' && journey.stage !== 'parsing')) return <Frame title={t('title')}><Loading label={t('loading')} /></Frame>;

  const update = (change: (current: ImportJourney) => ImportJourney) => setJourney((current) => (current ? change(current) : current));
  const problem = journey.problem ? (
    <Notice
      tone="warning"
      message={t(PROBLEM_COPY[journey.problem.kind])}
      action={
        journey.problem.kind === 'unconfirmed'
          ? { label: t('tryAgain'), onPress: () => void run(() => (journey.pendingPatch ? saveCorrections(journey, deps.current) : journey.pendingFreeze ? freezeSelection(journey, deps.current) : confirmBatches(journey, deps.current))) }
          : journey.problem.kind === 'review_changed' || journey.problem.kind === 'offline'
            ? { label: t('reload'), onPress: () => void run(() => reloadPreview(journey, deps.current)) }
            : undefined
      }
    />
  ) : null;

  if (journey.stage === 'parsing') {
    return (
      <Frame title={t('title')}>
        <Text style={{ color: colors.ink }}>{t('parsing')}</Text>
        {problem}
        <Loading label={t('loading')} />
      </Frame>
    );
  }
  if (journey.stage === 'failed' || journey.stage === 'expired') {
    return <Frame title={t('title')}><Notice message={t(journey.stage === 'expired' ? 'expired' : 'rejected')} /></Frame>;
  }
  if (journey.stage === 'done') {
    const counts = progressCounts(journey);
    return (
      <Frame title={t('title')}>
        <View role="status" aria-live="polite" accessibilityLiveRegion="polite">
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{t('done', { committed: counts.committed })}</Text>
        </View>
        {counts.conflicted > 0 ? <Notice tone="warning" message={t('doneConflicted', { count: counts.conflicted })} /> : null}
      </Frame>
    );
  }
  if (journey.stage === 'confirming') {
    return (
      <Frame title={t('title')}>
        <Progress journey={journey} />
        {problem}
        {!journey.problem && busy === null ? <Button label={t('continue')} onPress={() => void run(() => confirmBatches(journey, deps.current))} /> : null}
      </Frame>
    );
  }

  // Review.
  const rows = journey.preview?.candidates ?? [];
  const selected = new Set(journey.selected);
  const committed = new Set(journey.committed);
  const blockers = reviewBlockers(journey);
  const rowBlockers = blockers.filter((blocker) => blocker.source_row_id !== null);
  const unsaved = Object.keys(journey.edits).length > 0 || journey.pendingPatch !== null;
  const chosen = journey.selected.map((id) => rowView(journey, id)).filter((row): row is ImportCandidate => row !== null);
  const walletLabels = [...new Set(chosen.map((row) => row.wallet_label).filter((label): label is string => label !== null))];
  const categoryLabels = (['expense', 'income'] as const).flatMap((type) =>
    [...new Set(chosen.filter((row) => row.type === type).map((row) => row.category_label).filter((label): label is string => label !== null))].map((label) => ({ type, label })));
  const direction = (row: ImportCandidate) => t(row.type === 'expense' ? 'expense' : row.type === 'income' ? 'income' : row.type === 'transfer' ? 'transfer' : 'unknown');
  const working = busy !== null;
  const saveRows = () =>
    void run(async () => {
      const frozen = await freezeSelection(journey, deps.current);
      if (alive.current) setJourney(frozen);
      return frozen.stage === 'confirming' && !frozen.problem ? confirmBatches(frozen, deps.current) : frozen;
    });

  return (
    <Frame title={t('title')}>
      <Notice message={t('nothingSaved')} />
      {problem}
      {walletLabels.length > 0 ? (
        <Card>
          <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{t('walletsHeading')}</Text>
          {walletLabels.map((label) => (
            <ChipRow key={label}>
              {wallets.map((wallet) => (
                <Chip
                  key={wallet.id}
                  label={wallet.name}
                  accessibilityLabel={t('useWallet', { label, wallet: wallet.name })}
                  selected={journey.mapping.wallets[label] === wallet.id}
                  disabled={working}
                  onPress={() => update((current) => mapWallet(current, label, wallet.id))}
                />
              ))}
            </ChipRow>
          ))}
        </Card>
      ) : null}
      {categoryLabels.length > 0 ? (
        <Card>
          <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{t('categoriesHeading')}</Text>
          {categoryLabels.map(({ type, label }) => (
            <ChipRow key={`${type}:${label}`}>
              {categories.filter((category) => category.type === type).map((category) => (
                <Chip
                  key={category.id}
                  label={categoryName(category, tc)}
                  accessibilityLabel={t('useCategory', { label, category: categoryName(category, tc) })}
                  selected={journey.mapping.categories[type][label] === category.id}
                  disabled={working}
                  onPress={() => update((current) => mapCategory(current, type, label, category.id))}
                />
              ))}
            </ChipRow>
          ))}
        </Card>
      ) : null}
      <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{t('rowsHeading', { count: rows.length })}</Text>
      {rows.slice(0, shown).map((candidate) => {
        const row = rowView(journey, candidate.source_row_id) ?? candidate;
        const number = row.ordinal;
        const reviewed = REVIEW_FIELDS.every((field) => (journey.reviewed[row.source_row_id] ?? []).includes(field));
        const locked = committed.has(row.source_row_id);
        const summary = t('rowSummary', {
          date: row.occurred_on ?? t('unknown'),
          direction: direction(row),
          amount: row.amount_minor ? formatMinor(row.amount_minor, locale) : t('unknown'),
          wallet: row.wallet_label ?? t('noWallet'),
          category: row.category_label ?? t('noCategory'),
        });
        return (
          <Card key={row.source_row_id}>
            <Text accessible accessibilityLabel={`${number}. ${summary}`} style={{ color: colors.ink }}>{`${number}. ${summary}`}</Text>
            <ChipRow>
              <Chip label={t('include')} accessibilityLabel={t('includeRow', { row: number })} selected={selected.has(row.source_row_id)} disabled={working || locked}
                onPress={() => update((current) => selectRows(current, [row.source_row_id], !selected.has(row.source_row_id)))} />
              {(['expense', 'income'] as const).map((type) => (
                <Chip key={type} label={t(type)} accessibilityLabel={t('setDirection', { row: number, direction: t(type) })} selected={row.type === type} disabled={working || locked}
                  onPress={() => update((current) => (rowView(current, row.source_row_id)?.type === type ? current : editRow(current, row.source_row_id, { type })))} />
              ))}
            </ChipRow>
            <Chip label={t('confirmRow')} accessibilityLabel={t('confirmRowLabel', { row: number })} selected={reviewed} disabled={working || locked}
              onPress={() => update((current) => markReviewed(current, [row.source_row_id]))} />
          </Card>
        );
      })}
      {rows.length > shown ? <Button kind="secondary" label={tc('Load more')} onPress={() => setShown((count) => count + PAGE)} /> : null}
      {rowBlockers.length > 0 ? <Text style={{ color: colors.muted }}>{t('needsReview', { count: rowBlockers.length })}</Text> : null}
      {unsaved ? <Button label={t('saveCorrections')} disabled={working} onPress={() => void run(() => saveCorrections(journey, deps.current))} /> : null}
      <Button label={t('saveRows', { count: journey.selected.length })} disabled={working || blockers.length > 0} onPress={saveRows} />
    </Frame>
  );
}
