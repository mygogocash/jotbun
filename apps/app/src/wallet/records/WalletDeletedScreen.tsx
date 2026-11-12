// The Bun Wallet's Recently deleted screen (plan P2-T25, rh-deleted):
// entries deleted in the last 30 days, most recently deleted first, with
// their retention policy first. Each row has the category icon, title,
// amount, wallet and day, days left to restore (or last day), and a Restore
// pill at least 44 pt tall that grows with its words. The rules are the old
// screen's, through useRecentlyDeleted; in private mode a restore's notice
// names the entry without its amount (R109).
import type { CategoryDto } from '@gogospend/contracts';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { LoadingBlock, Notice, useGoBack } from '@mobile/screens/redesign/HistoryParts';
import { useRecentlyDeleted } from '@mobile/screens/redesign/deleted/deletedData';
import type { RestoreNotice } from '@mobile/screens/redesign/deleted/deletedData';
import type { DeletedRow } from '@mobile/spend/v1/redesign/historyModel';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { categoryInitial } from '@mobile/ui/categoryIcons';
import { dayLabel } from '@mobile/ui/dateStep';
import { EmptyState } from '@mobile/ui/EmptyState';
import { PillButton } from '@mobile/ui/PillButton';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import { COMMON_COPY } from '../common/copy';
import { IconButton } from '../controls/IconButton';
import type { WalletT } from '../copy/draftText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { WalletAmount } from '../money/WalletAmount';
import { spokenMoney } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

export type WalletDeletedScreenProps = { now?: Date };

/** The screen's lines and the shared ones, merged once, so `t` keeps one identity across renders. */
const DELETED_COPY = { ...COMMON_COPY, ...COPY };

/** WalletText's leading for a size no type role has (the board's 16 and 14 pt lines), in this language. */
const leadingFor = (size: number, locale: string) => walletLineHeight(size, locale === 'th' ? 'thai' : 'latin');

/**
 * The notice's words: the hook's, except a confirmed restore while private
 * mode is on, which names the entry alone. A Notice says aloud what it
 * shows, so this keeps the amount off the screen and out of the screen
 * reader (R109, Review Focus 2).
 */
function noticeWords(notice: RestoreNotice, hidden: boolean, t: WalletT): string {
  return hidden && notice.restored !== undefined ? t('records.restoredHidden', { title: notice.restored.title }) : notice.message;
}

function ClockIcon({ size = 12, color }: { size?: number; color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth="2.2" />
        <Path d="M12 7.5V12l3 2" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function RestoreIcon({ size = 15, color }: { size?: number; color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M4 12a8 8 0 1 0 2.4-5.7 M4 4v4.5h4.5" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function BackChevron({ size = 16, color }: { size?: number; color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M15 5l-7 7 7 7" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function DeletedRowView({
  row,
  category,
  today,
  restoring,
  frozen,
  disabled,
  onRestore,
  isFirst,
}: {
  row: DeletedRow;
  category: CategoryDto | undefined;
  /** Bangkok's date on the screen's clock: the row's day is said from it (src/ui/dateStep.ts). */
  today: string;
  restoring: boolean;
  frozen: boolean;
  disabled: boolean;
  onRestore: () => void;
  isFirst: boolean;
}) {
  const colors = useWalletColors();
  const t = useDraftCopy(DELETED_COPY);
  const tc = useCopy();
  const locale = useActiveLocale();
  const { hidden } = usePrivateMode();

  const isLastDay = row.daysLeft === 1;
  const daysColor = isLastDay ? colors.ink : colors.quiet;
  const spoken = hidden ? t('common.amountHidden') : spokenMoney(row.amountMinor, t);
  const restoreAriaLabel = t('records.restoreLabel', { title: row.title, amount: spoken });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 12,
        borderTopWidth: isFirst ? 0 : 1,
        borderColor: colors.hairline,
      }}
    >
      {category ? (
        <WalletCategoryIcon category={category} name={row.title} size={40} />
      ) : (
        <View
          {...DECORATIVE}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: colors.raised,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WalletText role="label" allowFontScaling={false} style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
            {categoryInitial(row.title)}
          </WalletText>
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {/* Never clamped: at the largest text sizes the title wraps. */}
        <WalletText style={{ fontSize: 16, fontWeight: '500', lineHeight: leadingFor(16, locale) }}>{row.title}</WalletText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {/* Income is violet with its plus; an expense or a move is the size alone, in ink. */}
          <WalletAmount minor={row.amountMinor} size={13} sign={row.type === 'income' ? 'income' : 'none'} />
          <WalletText role="caption" tone="quiet">
            {` · ${row.detail} · ${dayLabel(row.occurredOn, today, locale).text}`}
          </WalletText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ClockIcon size={12} color={daysColor} />
          <WalletText role="caption" style={{ fontWeight: isLastDay ? '700' : '400', color: daysColor }}>
            {isLastDay ? t('records.lastDay') : t('records.daysLeft', { n: row.daysLeft })}
          </WalletText>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={frozen ? tc('Try again') : restoreAriaLabel}
        accessibilityState={{ disabled: disabled || restoring, busy: restoring }}
        aria-disabled={disabled || restoring}
        disabled={disabled || restoring}
        onPress={onRestore}
        style={{
          // At least 44 pt, and taller when its words grow.
          minHeight: 44,
          paddingLeft: 12,
          paddingRight: 14,
          borderRadius: 999,
          backgroundColor: colors.ground,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          flexShrink: 0,
          opacity: disabled || restoring ? 0.4 : 1,
        }}
      >
        {frozen ? (
          <WalletText style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
            {tc('Try again')}
          </WalletText>
        ) : (
          <>
            <RestoreIcon size={15} color={colors.ink} />
            <WalletText style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
              {t('records.restore')}
            </WalletText>
          </>
        )}
      </Pressable>
    </View>
  );
}

export function WalletDeletedScreen({ now }: WalletDeletedScreenProps) {
  const colors = useWalletColors();
  const t = useDraftCopy(DELETED_COPY);
  const tc = useCopy();
  const locale = useActiveLocale();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { hidden: amountsHidden } = usePrivateMode();
  const today = todayInBangkok(now ?? new Date());

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
    <View testID="wallet-deleted-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 18,
          // The spend layout pads nothing: start below the status bar, 8 pt clear of it, as rh-deleted's 52 pt does.
          paddingTop: insets.top + 8,
          paddingBottom: 40,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton label={t('records.backToHistory')} onPress={goBack}>
            <BackChevron size={16} color={colors.ink} />
          </IconButton>
        </View>

        <View style={{ gap: 4 }}>
          <WalletText role="h1" accessibilityRole="header">
            {t('records.deletedTitle')}
          </WalletText>
          <WalletText tone="quiet" style={{ fontSize: 14, lineHeight: leadingFor(14, locale) }}>
            {t('records.deletedPolicy')}
          </WalletText>
        </View>

        {banner ? <SyncBanner {...banner} /> : null}
        {shownNotice ? <Notice tone={shownNotice.tone} message={noticeWords(shownNotice, amountsHidden, t)} /> : null}
        {lists?.page.refresh_suggested && !error ? (
          <Notice
            message={tc('Entries changed since you opened this list.')}
            action={{ label: tc('Refresh'), onPress: () => void load(true) }}
          />
        ) : null}
        {problem ? (
          <Notice
            tone="alert"
            message={problem.message}
            action={problem.retry ? { label: tc('Try again'), onPress: () => void load(true) } : undefined}
          />
        ) : null}
        {!error && !lists ? <LoadingBlock label={tc('Loading entries')} /> : null}

        {model && lookups && !error ? (
          model.rows.length === 0 ? (
            <EmptyState
              art={<Bun pose="sleepy" size="l" testID="recently-deleted-empty-bun" />}
              title={model.emptyText ?? tc('Nothing deleted in the last 30 days')}
              body={tc('Entries you delete show up here.')}
            />
          ) : (
            <View style={{ gap: 12 }}>
              <View testID="wallet-deleted-list" style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden' }}>
                {model.rows.map((row, index) => (
                  <DeletedRowView
                    key={row.recordId}
                    row={row}
                    category={row.categoryId ? lookups.categories.get(row.categoryId) : undefined}
                    today={today}
                    restoring={restoring === row.recordId}
                    frozen={held?.id === row.recordId}
                    disabled={(busy && restoring !== row.recordId) || (held !== null && held.id !== row.recordId)}
                    onRestore={() => void restore(row)}
                    isFirst={index === 0}
                  />
                ))}
              </View>
              <WalletText role="caption" tone="quiet" style={{ marginHorizontal: 4 }}>
                {t('records.deletedFooter')}
              </WalletText>
            </View>
          )
        ) : null}

        {lists?.page.next_cursor && !error ? (
          <PillButton
            kind="secondary"
            label={tc('Load more')}
            busy={loadingMore}
            busyLabel={tc('Loading entries')}
            onPress={() => void loadMore()}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
