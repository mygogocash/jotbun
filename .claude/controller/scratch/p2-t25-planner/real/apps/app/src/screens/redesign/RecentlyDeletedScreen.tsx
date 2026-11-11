// "Recently deleted" (redesign plan §6.1, /spend/deleted, opened from
// History): the entries deleted in the last 30 days, most recently deleted
// first, each with a Restore. It says the retention policy in words first:
// a deleted entry can be restored for 30 days, and after that it is gone for
// good (the server purges it).
//
// The list is GET /v1/history/deleted (`SpendV1Resources.recentlyDeleted`),
// keyset pages with "Load more" and "refresh suggested" as in History. Rows
// go through `recentlyDeletedModel`, which applies the restore rule again on
// this device's clock. Restore is the existing restore command with the
// entry's own version under its own key: a restore whose answer is lost is
// frozen and "Try again" resends the same command; a refusal is said in plain
// words and the list is read again. The load problems are History's.
import { RESTORE_WINDOW_DAYS } from '@gogospend/contracts';
import { ScrollView, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import type { DeletedRow } from '@mobile/spend/v1/redesign/historyModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_OUTLINE, BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { RecordRow } from '@mobile/ui/RecordRow';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import { useRecentlyDeleted } from './deleted/deletedData';
import { LoadingBlock, Notice, lookOf, useGoBack } from './HistoryParts';

export type RecentlyDeletedScreenProps = { now?: Date };

/** One deleted entry: the row as History draws it (without its actions), the days left, and Restore. */
function DeletedEntry({ row, lookups, restoring, frozen, disabled, onRestore }: {
  row: DeletedRow; lookups: Lookups; restoring: boolean; frozen: boolean; disabled: boolean; onRestore: () => void;
}) {
  const tc = useCopy();
  const colors = useBunColors();
  const look = lookOf(row.categoryId ? lookups.categories.get(row.categoryId) : undefined, row.title);
  const detail = [row.detail, row.merchant, row.note].filter((part): part is string => Boolean(part)).join(' · ');
  return (
    <View style={{ gap: BUN_SPACE.xs, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
      <RecordRow title={row.title} detail={detail} type={row.type} amountMinor={row.amountMinor} category={look} />
      <BunText variant="caption" tone="muted">{row.daysLeftText}</BunText>
      {frozen ? (
        // Its answer was lost: only the same command again.
        <PillButton kind="secondary" label={tc('Try again')} busy={restoring} onPress={onRestore} />
      ) : (
        <PillButton
          kind="secondary"
          label={tc('Restore')}
          // Several rows each have a Restore: the spoken name says which entry.
          accessibilityLabel={tc('Restore {entry}', { entry: `${row.title}, ${row.amountLabel}` })}
          busy={restoring}
          disabled={disabled}
          onPress={onRestore}
        />
      )}
    </View>
  );
}

export function RecentlyDeletedScreen({ now }: RecentlyDeletedScreenProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const goBack = useGoBack();

  const {
    lists,
    error,
    loadingMore,
    restoring,
    model,
    held,
    shownNotice,
    banner,
    problem,
    busy,
    lookups,
    load,
    loadMore,
    restore,
  } = useRecentlyDeleted(now);

  return (
    <View testID="recently-deleted-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.xl, gap: BUN_SPACE.md }}>
        <StageHeader title={tc('Recently deleted')} back={{ onPress: goBack }} />
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          {banner ? <SyncBanner {...banner} /> : null}
          {/* The retention policy, in words, wherever this list is shown. */}
          <BunText testID="recently-deleted-retention">
            {tc('Deleted entries can be restored for {days} days. After that, they are gone for good.', { days: RESTORE_WINDOW_DAYS })}
          </BunText>
          {shownNotice ? <Notice tone={shownNotice.tone} message={shownNotice.message} /> : null}
          {lists?.page.refresh_suggested && !error ? (
            <Notice message={tc('Entries changed since you opened this list.')} action={{ label: tc('Refresh'), onPress: () => void load(true) }} />
          ) : null}
          {problem ? <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: () => void load(true) } : undefined} /> : null}
          {!error && !lists ? <LoadingBlock label={tc('Loading entries')} /> : null}
          {model && lookups && !error ? (
            model.rows.length === 0 ? (
              <EmptyState
                // EmptyState leaves the art (and its space) out when the bun is off.
                art={<Bun pose="sleepy" size="l" testID="recently-deleted-empty-bun" />}
                title={model.emptyText ?? tc('Nothing deleted in the last 30 days')}
                body={tc('Entries you delete show up here.')}
              />
            ) : (
              model.rows.map((row) => (
                <DeletedEntry
                  key={row.recordId}
                  row={row}
                  lookups={lookups}
                  restoring={restoring === row.recordId}
                  frozen={held?.id === row.recordId}
                  // One restore at a time; none other while one's answer is unknown.
                  disabled={(busy && restoring !== row.recordId) || (held !== null && held.id !== row.recordId)}
                  onRestore={() => void restore(row)}
                />
              ))
            )
          ) : null}
          {lists?.page.next_cursor && !error ? (
            <PillButton kind="secondary" label={tc('Load more')} busy={loadingMore} busyLabel={tc('Loading entries')} onPress={() => void loadMore()} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
