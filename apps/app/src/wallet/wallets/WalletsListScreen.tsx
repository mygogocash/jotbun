// The Bun Wallet's wallets list (P2-T20; wc-wallets, W28): back and
// จัดเรียง, the heading, the summary card (every wallet in use added up
// exactly, and what the credit cards have spent taken off what the person
// holds), a 68 pt row per wallet in use, front first, the add tile, and the
// archived wallets behind one row that opens them, each with นำกลับมาใช้.
// A row opens its wallet (P2-T22's route) and the tile the new-wallet flow
// (P2-T21's), which comes back here; the list is read again then, since the
// spend layout's Slot draws only the screen in front, so this one mounts
// again. ?reorder=1 (Home's จัดเรียง, P2-T24) opens the reorder tray.
//
// - Looks and the order come from the looks kept for the open diary's account
//   (P2-T11, W7). The rows follow the kept order, as Home's stack does. With
//   no account open (the web, opening, locked or signed out) nothing could be
//   kept, so จัดเรียง is not offered and ?reorder=1 opens nothing.
// - Unarchive is P2-T19's rule (useWalletCommand): one command at a time,
//   held by a ref, so two presses before React draws again send one. An
//   unconfirmed one offers Try again, which sends the same command under the
//   same key; a refusal says so in today's words, and a wallet changed on
//   another device says so and the list is read again.
// - Private mode masks every amount at its own size (W10), and each row says
//   only that its amount is hidden.
// - Nothing is clamped to a line: at the largest text sizes a row's amount
//   moves under its name, and the longest name and the largest amount wrap.
import type { WalletDto } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import { useWalletCommand } from '@mobile/screens/redesign/planning/walletCommands';
import { useLoad } from '@mobile/screens/v1/parts';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { materialPaint } from '@mobile/theme/walletPalette';
import { DECORATIVE } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { useLargeText } from '@mobile/ui/largeText';
import { COPY as CARD_COPY } from '../card/copy';
import { walletCardWords } from '../card/WalletCard';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { IconButton } from '../controls/IconButton';
import { BunFace } from '../looks/BunFace';
import { MaterialFill } from '../looks/MaterialFill';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import type { WalletLook } from '../looks/walletLooks';
import { WalletAmount } from '../money/WalletAmount';
import { spokenMoney } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { Chevron, ReorderTray } from './ReorderTray';
import { frontFirst, walletsSummary } from './walletsList';
import type { WalletsSummary } from './walletsList';

const LINES = { ...COMMON_COPY, ...CARD_COPY, ...COPY } as const;

/**
 * P2-T22 adds `/spend/wallet/[id]`. Until it lands, typed routes do not know
 * it, so it is typed by hand here; P2-T22 can drop the cast.
 */
const walletHref = (walletId: string) => `/spend/wallet/${walletId}` as Href;
/** P2-T21's flow, which comes back here once the wallet is added. */
const NEW_WALLET_HREF = { pathname: '/spend/wallet/new', params: { returnTo: '/spend/wallets' } } as const;

export function WalletsListScreen({ openReorder = false }: { openReorder?: boolean }) {
  const resources = useSpendV1();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const { accountId } = useDiaryView();
  const loaded = useLoad(() => resources.wallets(), [resources]);
  // ?reorder=1 opens the tray as soon as the wallets are read.
  const [reordering, setReordering] = useState(openReorder);
  // The order is kept per account (W7): with none open nothing could be kept, so it is not offered.
  const canReorder = accountId !== null;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/spend');
  };
  const wallets = loaded.state === 'ready' ? loaded.data : null;
  return (
    <View testID="wallets-list" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <IconButton label={t('common.back')} onPress={goBack}>
            <Glyph name="chevron-left" size={18} color={colors.ink} />
          </IconButton>
          {canReorder ? <ReorderButton label={t('wallets.reorder')} onPress={() => setReordering(true)} /> : null}
        </View>
        <WalletText role="h1" accessibilityRole="header">{t('wallets.title')}</WalletText>
        {loaded.state === 'loading' ? <WalletText testID="wallets-loading" role="label" tone="quietOnGround">{tc('Loading your wallets')}</WalletText> : null}
        {loaded.state === 'error' ? <LoadProblem error={loaded.error} onRetry={loaded.reload} /> : null}
        {wallets === null ? null : (
          <WalletsBody
            wallets={wallets}
            onOpen={(walletId) => router.push(walletHref(walletId))}
            onAdd={() => router.push(NEW_WALLET_HREF)}
            onChanged={loaded.refresh}
          />
        )}
      </ScrollView>
      {wallets !== null && canReorder ? <ReorderTray visible={reordering} onClose={() => setReordering(false)} wallets={wallets} /> : null}
    </View>
  );
}

function WalletsBody({ wallets, onOpen, onAdd, onChanged }: {
  wallets: readonly WalletDto[];
  onOpen(walletId: string): void;
  onAdd(): void;
  onChanged(): void;
}) {
  const { lookOf, order } = useWalletLooks();
  const archived = wallets.filter((wallet) => wallet.archived);
  return (
    <>
      <SummaryCard summary={walletsSummary(wallets, (walletId) => lookOf(walletId).kind)} />
      <View style={{ gap: 10 }}>
        {frontFirst(wallets, order).map((wallet) => (
          <WalletRow key={wallet.id} wallet={wallet} look={lookOf(wallet.id)} onPress={() => onOpen(wallet.id)} />
        ))}
      </View>
      <AddTile onPress={onAdd} />
      {archived.length > 0 ? <ArchivedWallets wallets={archived} onChanged={onChanged} /> : null}
    </>
  );
}

/** จัดเรียง: a 44 pt pill with the boards' sliders, on a card fill with a hairline ring (wc-wallets). */
function ReorderButton({ label, onPress }: { label: string; onPress(): void }) {
  const colors = useWalletColors();
  const line = { fill: 'none', stroke: colors.ink, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Pressable
      testID="wallets-reorder"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: colors.card,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View {...DECORATIVE}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M4 7h9M17 7h3M4 17h3M11 17h9" {...line} />
          <Circle cx={15} cy={7} r={2} {...line} />
          <Circle cx={9} cy={17} r={2} {...line} />
        </Svg>
      </View>
      <WalletText role="label">{label}</WalletText>
    </Pressable>
  );
}

/** The summary card: the total, how many wallets are in use, and, once a credit card has spent, what is held and what the cards took off it. */
function SummaryCard({ summary }: { summary: WalletsSummary }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  return (
    <View testID="wallets-summary" style={{ gap: 4, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.card }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 }}>
        <WalletText role="caption" tone="quiet">{t('wallets.totalLabel')}</WalletText>
        <WalletText role="caption" tone="quiet">{t('wallets.count', { n: summary.activeCount })}</WalletText>
      </View>
      <WalletAmount testID="wallets-total" minor={summary.totalMinor} sign="balance" size={36} />
      {summary.creditUsedMinor === '0' ? null : (
        <View testID="wallets-held" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4 }}>
          <WalletText role="caption" tone="quiet">{t('wallets.held')}</WalletText>
          <WalletAmount testID="wallets-held-amount" minor={summary.heldMinor} size={13} />
          <WalletText role="caption" tone="quiet">{t('wallets.creditUsed')}</WalletText>
          <WalletAmount testID="wallets-credit-used" minor={summary.creditUsedMinor} size={13} />
        </View>
      )}
    </View>
  );
}

/** One wallet in use: its material, Bun's face, its name and kind line, and its amount; a credit card's spending after ใช้ไป. */
function WalletRow({ wallet, look, onPress }: { wallet: WalletDto; look: WalletLook; onPress(): void }) {
  const colors = useWalletColors();
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const t = useDraftCopy(LINES);
  const words = walletCardWords({ id: wallet.id, name: wallet.name, balanceMinor: wallet.balance_minor }, look, hidden, t);
  const spent = words.amountPrefix !== null;
  const paint = materialPaint(look.material, colors.isDark);
  const amount = hidden ? t('common.amountHidden') : spokenMoney(words.amountMinor, t);
  // wc-wallets' labels: บัญชีหลัก บัญชีธนาคาร ยอด 24,860 บาท, and บัตรเครดิต ใช้ไป 3,920 บาท. A wallet with no kind kept says none.
  const label = (spent
    ? t('wallets.rowLabelSpent', { name: wallet.name, amount })
    : t('wallets.rowLabel', { name: wallet.name, kind: words.kindLine ?? '', amount })
  ).replace(/\s+/g, ' ').trim();
  const shown = (
    <View testID={`wallet-amount-${wallet.id}`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 5 }}>
      {spent ? <WalletText role="caption" style={{ color: paint.quietText }}>{words.amountPrefix}</WalletText> : null}
      <WalletAmount minor={words.amountMinor} sign={spent ? 'none' : 'balance'} size={17} color={paint.text} />
    </View>
  );
  return (
    <Pressable
      testID={`wallet-row-${wallet.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <MaterialFill material={look.material} radius={20} />
      <BunFace face={look.face} size={36} />
      <View testID={`wallet-words-${wallet.id}`} style={{ flex: 1, minWidth: 0 }}>
        <WalletText role="label" style={{ fontWeight: '700', color: paint.text }}>{wallet.name}</WalletText>
        {words.kindLine === null ? null : <WalletText role="caption" style={{ color: paint.quietText }}>{words.kindLine}</WalletText>}
        {large ? shown : null}
      </View>
      {large ? null : shown}
      <Chevron direction="right" size={12} color={paint.quietText} />
    </Pressable>
  );
}

/** The add tile: a dashed 68 pt tile with the ink + (wc-wallets). */
function AddTile({ onPress }: { onPress(): void }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  return (
    <Pressable
      testID="wallets-add"
      accessibilityRole="button"
      accessibilityLabel={`${t('wallets.add')} ${t('wallets.addLine')}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: colors.hairline,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View {...DECORATIVE} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" fill="none" stroke={colors.onPrimary} strokeWidth={2.6} strokeLinecap="round" />
        </Svg>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <WalletText role="label" style={{ fontWeight: '700' }}>{t('wallets.add')}</WalletText>
        <WalletText role="caption" tone="quietOnGround">{t('wallets.addLine')}</WalletText>
      </View>
    </Pressable>
  );
}

/** An unarchive whose outcome is not settled, or that says why it did not happen. */
type Unarchiving =
  | { phase: 'saving'; walletId: string }
  | { phase: 'unconfirmed'; walletId: string; version: number; message: string; blocked: boolean }
  | { phase: 'problem'; walletId: string; message: string };

/** The archived wallets: one row that opens them, the note, and each wallet with นำกลับมาใช้. */
function ArchivedWallets({ wallets, onChanged }: { wallets: readonly WalletDto[]; onChanged(): void }) {
  const colors = useWalletColors();
  const large = useLargeText();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const { lookOf } = useWalletLooks();
  const commands = useWalletCommand();
  const [open, setOpen] = useState(false);
  const [unarchiving, setUnarchiving] = useState<Unarchiving | null>(null);
  // One command at a time, held by a ref: two presses before React draws again still send one (P2-T19's review).
  const sending = useRef(false);

  // P2-T19's rule: a resend of the same command (slot and version) goes under the same key.
  async function unarchive(walletId: string, version: number) {
    if (sending.current) return;
    sending.current = true;
    setUnarchiving({ phase: 'saving', walletId });
    try {
      const outcome = await commands.send({ kind: 'unarchive', slot: `unarchive:${walletId}`, id: walletId, version });
      if (outcome.kind === 'done') {
        setUnarchiving(null);
        onChanged();
      } else if (outcome.kind === 'unconfirmed') {
        setUnarchiving({ phase: 'unconfirmed', walletId, version, message: outcome.message, blocked: outcome.blocked });
      } else if (outcome.kind === 'conflict') {
        // Changed on another device, perhaps already back in use: say so, and read the list again.
        setUnarchiving({ phase: 'problem', walletId, message: tc('This wallet changed on another device.') });
        onChanged();
      } else {
        // The hook always words a refusal; today's default stands in if it ever does not.
        setUnarchiving({ phase: 'problem', walletId, message: outcome.message ?? tc('This entry could not be saved.') });
      }
    } finally {
      sending.current = false;
    }
  }

  const held = unarchiving?.phase === 'saving' || unarchiving?.phase === 'unconfirmed';
  const count = t('wallets.archivedCount', { n: wallets.length });
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        testID="wallets-archived-row"
        accessibilityRole="button"
        accessibilityLabel={`${t('wallets.archived')} ${count}`}
        aria-expanded={open}
        onPress={() => setOpen((now) => !now)}
        style={({ pressed }) => ({
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderRadius: 18,
          backgroundColor: colors.card,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <View {...DECORATIVE} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Rect x={3} y={4} width={18} height={5} rx={1.5} fill="none" stroke={colors.ink} strokeWidth={1.8} />
              <Path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9 M10 13h4" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <WalletText role="label">{t('wallets.archived')}</WalletText>
          <WalletText role="caption" tone="quiet">{count}</WalletText>
        </View>
        <Chevron direction={open ? 'up' : 'down'} size={12} color={colors.ink} />
      </Pressable>
      <WalletText role="caption" tone="quietOnGround" style={{ paddingHorizontal: 4 }}>{t('wallets.archivedNote')}</WalletText>
      {open ? (
        <View testID="wallets-archived" style={{ gap: 10, paddingTop: 4 }}>
          {unarchiving?.phase === 'unconfirmed' || unarchiving?.phase === 'problem' ? (
            <View testID="wallets-unarchive-problem" style={{ gap: 4, alignItems: 'flex-start' }}>
              <WalletText role="label" accessibilityRole="alert">{unarchiving.message}</WalletText>
              {unarchiving.phase === 'unconfirmed' && !unarchiving.blocked ? (
                <TextLink label={t('common.tryAgain')} onPress={() => void unarchive(unarchiving.walletId, unarchiving.version)} />
              ) : null}
            </View>
          ) : null}
          {wallets.map((wallet) => {
            const words = walletCardWords({ id: wallet.id, name: wallet.name, balanceMinor: wallet.balance_minor }, lookOf(wallet.id), false, t);
            return (
              <View
                key={wallet.id}
                testID={`archived-wallet-${wallet.id}`}
                style={{
                  minHeight: 68,
                  flexDirection: large ? 'column' : 'row',
                  alignItems: large ? 'stretch' : 'center',
                  gap: 12,
                  paddingVertical: 10,
                  paddingLeft: 14,
                  paddingRight: 10,
                  borderRadius: 20,
                  backgroundColor: colors.card,
                }}
              >
                <View style={{ flex: large ? undefined : 1, minWidth: 0 }}>
                  <WalletText role="label" style={{ fontWeight: '700' }}>{wallet.name}</WalletText>
                  {words.kindLine === null ? null : <WalletText role="caption" tone="quiet">{words.kindLine}</WalletText>}
                </View>
                <UnarchiveButton
                  label={t('wallets.unarchive')}
                  spoken={t('wallets.unarchiveLabel', { name: wallet.name })}
                  disabled={held}
                  onPress={() => void unarchive(wallet.id, wallet.version)}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** นำกลับมาใช้: a 44 pt pill on the raised fill that names its wallet to screen readers. */
function UnarchiveButton({ label, spoken, disabled, onPress }: { label: string; spoken: string; disabled: boolean; onPress(): void }) {
  const colors = useWalletColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        alignSelf: 'flex-end',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: 22,
        backgroundColor: colors.raised,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <WalletText role="label">{label}</WalletText>
    </Pressable>
  );
}

/** A load problem in today's words, with Try again when trying again can help. */
function LoadProblem({ error, onRetry }: { error: unknown; onRetry(): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const problem = classifyLoadProblem(error, tc);
  return (
    <View testID="wallets-problem" style={{ gap: 4, alignItems: 'flex-start', padding: 16, borderRadius: 22, backgroundColor: colors.card }}>
      <WalletText accessibilityRole="alert">{problem.message}</WalletText>
      {problem.retry ? <TextLink label={t('common.tryAgain')} onPress={onRetry} /> : null}
    </View>
  );
}
