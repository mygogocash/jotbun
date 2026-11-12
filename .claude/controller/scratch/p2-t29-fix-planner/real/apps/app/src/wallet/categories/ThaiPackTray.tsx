// The Thai pack tray (P2-T29; wc-thai-pack, C3): one 60 pt checkbox row per
// C3 item, with its glyph, its name in the person's language and its line.
// One the person has says มีแล้ว and cannot be picked. The picks start empty
// (ruling P5), and เพิ่ม {n} หมวด creates only the picked ones that are still
// missing (packCommands with `only`), named in the person's language.
//
// - Saving goes through useCategoryCommands. While it sends, the tray is
//   locked (Review Focus 1). An answer that never came freezes it with today's
//   Try again, which resends the same items under the same ids and keys; the
//   tray can be closed, and opened again it is still frozen until the outcome
//   is known (B4). A refusal says so, and Reload closes the tray so the screen
//   reads again: the items it did add are then shown as มีแล้ว, so none is
//   added twice. Every other opening starts afresh.
// - Pack categories show their glyph through iconFor (by name, W8), so no
//   icon is kept for them.
import type { CategoryDto } from '@gogospend/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useCategoryCommands } from '@mobile/screens/redesign/planning/categoryCommands';
import { newId } from '@mobile/screens/v1/parts';
import { THAI_EVERYDAY_PACK, missingPackItems, packCommands } from '@mobile/spend/v1/redesign/planning/thaiPack';
import type { C3Item, PackKey } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** A row's height (wc-thai-pack) and its check circle. */
const ROW = 60;
const CHECK = 28;

export type ThaiPackTrayProps = {
  visible: boolean;
  onClose(): void;
  /** The person's categories, archived ones included. */
  categories: readonly CategoryDto[];
};

/** A C3 item as WalletCategoryIcon reads a category: by its name, so iconFor finds its pack glyph. */
const asCategory = (item: C3Item, name: string) => ({ id: `pack-${item.key}`, builtin_key: null, color: item.color, label: name, type: item.type });

export function ThaiPackTray({ visible, onClose, categories }: ThaiPackTrayProps) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const locale = useActiveLocale();
  const colors = useWalletColors();
  const [picked, setPicked] = useState<ReadonlySet<PackKey>>(() => new Set());
  const commands = useCategoryCommands({
    rebase: () => undefined,
    stopped: () => undefined,
    saved: () => onClose(),
    changedElsewhere: () => undefined,
    fieldErrors: () => undefined,
  });

  // Each opening starts afresh, with nothing picked, unless its send is unconfirmed: that keeps today's
  // frozen Try again with the same picks until the outcome is known.
  const [opened, setOpened] = useState(visible);
  if (visible !== opened) {
    setOpened(visible);
    if (visible && commands.status !== 'unconfirmed') {
      setPicked(new Set());
      commands.setMessage(null);
      commands.setConflict(null);
    }
  }

  const missing = new Set(missingPackItems(categories).map((item) => item.key));
  const frozen = commands.status !== 'idle';
  const refused = !frozen && (commands.message !== null || commands.conflict !== null);
  const chosen = THAI_EVERYDAY_PACK.filter((item) => picked.has(item.key) && missing.has(item.key)).map((item) => item.key);

  /** A row the person has, or any row while a send is out or refused, is disabled, so it never reaches here. */
  function toggle(key: PackKey) {
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Add is offered only with something picked, not while blocked, and the hook sends one at a time. */
  function add() {
    void commands.send(packCommands(categories, locale, newId, { only: chosen }), { success: tc('Added. They are in Quick add now.'), draft: null, seen: null });
  }

  const notice = commands.conflict?.view.message ?? commands.message;
  const footer = (
    <>
      {notice ? <WalletText testID="thai-pack-problem" role="label" accessibilityRole="alert">{notice}</WalletText> : null}
      {commands.status === 'unconfirmed' ? (
        <PrimaryButton testID="thai-pack-retry" label={t('common.tryAgain')} disabled={commands.resendBlocked} onPress={commands.tryAgain} />
      ) : refused ? (
        <TextLink label={tc('Reload')} onPress={onClose} />
      ) : (
        <PrimaryButton
          testID="thai-pack-add"
          label={chosen.length === 1 ? t('categories.packAddOne') : t('categories.packAdd', { n: chosen.length })}
          busy={commands.status === 'saving'}
          busyLabel={tc('Saving…')}
          disabled={chosen.length === 0 || commands.blocked}
          onPress={add}
        />
      )}
    </>
  );

  return (
    <Tray visible={visible} onClose={onClose} title={t('categories.packHeading')} footer={footer} locked={commands.status === 'saving'} testID="thai-pack-tray">
      <WalletText role="body" tone="quiet">{t('categories.packIntro')}</WalletText>
      <View testID="thai-pack-items" role="group" accessibilityLabel={t('categories.packPick')}>
        {THAI_EVERYDAY_PACK.map((item, index) => {
          const name = locale === 'th' ? item.th : item.en;
          const had = !missing.has(item.key);
          const checked = !had && picked.has(item.key);
          const disabled = had || frozen || refused;
          return (
            <Pressable
              key={item.key}
              testID={`thai-pack-${item.key}`}
              accessibilityRole="checkbox"
              accessibilityLabel={name}
              accessibilityState={{ checked, disabled }}
              aria-checked={checked}
              aria-disabled={disabled}
              disabled={disabled}
              onPress={() => toggle(item.key)}
              style={{
                minHeight: ROW,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 8,
                borderBottomWidth: index === THAI_EVERYDAY_PACK.length - 1 ? 0 : 1,
                borderBottomColor: colors.hairline,
              }}
            >
              <WalletCategoryIcon category={asCategory(item, name)} name={name} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <WalletText role="label" tone={had ? 'quiet' : 'ink'} style={{ fontWeight: '700' }}>{name}</WalletText>
                <WalletText role="caption" tone="quiet">{t(`pack.${item.key}`)}</WalletText>
              </View>
              {had ? (
                <View style={{ minHeight: CHECK, justifyContent: 'center', paddingHorizontal: 10, borderRadius: CHECK / 2, backgroundColor: colors.raised }}>
                  <WalletText role="caption" tone="quiet">{t('categories.packHave')}</WalletText>
                </View>
              ) : (
                <View
                  {...DECORATIVE}
                  style={{
                    width: CHECK,
                    height: CHECK,
                    borderRadius: CHECK / 2,
                    borderWidth: 2,
                    borderColor: checked ? colors.primary : colors.quiet,
                    backgroundColor: checked ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {checked ? (
                    <Svg width={14} height={14} viewBox="0 0 24 24">
                      <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={colors.onPrimary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.raised }}>
        <View {...DECORATIVE} style={{ paddingTop: 2 }}>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={9} fill="none" stroke={colors.ink} strokeWidth={1.8} />
            <Path d="M12 11v6 M12 7.5v.5" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </View>
        <WalletText role="caption" style={{ flex: 1 }}>{t('categories.packNote')}</WalletText>
      </View>
    </Tray>
  );
}
