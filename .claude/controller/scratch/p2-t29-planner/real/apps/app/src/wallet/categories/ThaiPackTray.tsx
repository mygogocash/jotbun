// The Bun Wallet's Thai everyday pack tray (P2-T29, wc-thai-pack).
// Shows C3's nine everyday categories with checkboxes. Picked missing items
// are created at once with packCommands; categories the person already has
// are disabled and marked with "มีแล้ว". Pack categories show their glyph
// through iconFor, so nothing is kept for them in device storage.
import type { CategoryDto } from '@gogospend/contracts';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useCategoryCommands } from '@mobile/screens/redesign/planning/categoryCommands';
import { THAI_EVERYDAY_PACK, missingPackItems, packCommands } from '@mobile/spend/v1/redesign/planning/thaiPack';
import type { C3Item } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { newId, useLoad } from '@mobile/screens/v1/parts';
import { PrimaryButton } from '../tray/PrimaryButton';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { CategoryGlyph } from '../looks/WalletCategoryIcon';
import { PACK_GLYPH } from '../looks/categoryIcons';
import { useDraftCopy } from '../copy/useDraftCopy';
import { COPY } from './copy';

export type ThaiPackTrayProps = {
  visible: boolean;
  onClose(): void;
  categories: readonly CategoryDto[];
};

export function ThaiPackTray({ visible, onClose, categories }: ThaiPackTrayProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const activeLocale = useActiveLocale();
  const colors = useWalletColors();

  const now = new Date();
  const month = monthOf(todayInBangkok(now));
  const budgetLoad = useLoad(async () => resources.budget(month), [resources, month]);
  const budget = budgetLoad.state === 'ready' ? budgetLoad.data : null;

  const missing = useMemo(() => missingPackItems(categories), [categories]);
  const missingKeys = useMemo(() => new Set(missing.map((item) => item.key)), [missing]);

  const [picked, setPicked] = useState<Set<string>>(() => new Set(missingKeys));
  const [saving, setSaving] = useState(false);

  const commands = useCategoryCommands();

  useEffect(() => {
    if (visible) {
      setPicked(new Set());
      setSaving(false);
    }
  }, [visible, missingKeys]);

  function togglePicked(key: string) {
    if (!missingKeys.has(key)) return;
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleAdd() {
    const keysToAdd = Array.from(picked).filter((k) => missingKeys.has(k));
    if (keysToAdd.length === 0 || saving) return;
    setSaving(true);
    try {
      const locale = activeLocale === 'th' ? 'th' : 'en';
      const cmds = packCommands(categories, locale, newId, { only: keysToAdd });
      const ok = await commands.send(cmds, {
        success: tc('Added.'),
        draft: null,
        seen: budget,
      });
      if (ok) {
        // pack categories show their glyph through iconFor, so nothing is kept for them
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  const pickedCount = Array.from(picked).filter((k) => missingKeys.has(k)).length;

  return (
    <Tray visible={visible} onClose={onClose} title={t('categories.packHeading')}>
      <View style={styles.container}>
        <WalletText role="body" style={[styles.intro, { color: colors.quiet }]}>
          {t('categories.packIntro')}
        </WalletText>

        <View role="group" aria-label={t('categories.packPick')} style={styles.itemsList}>
          {THAI_EVERYDAY_PACK.map((item: C3Item) => {
            const hasItem = !missingKeys.has(item.key);
            const isChecked = hasItem || picked.has(item.key);
            const glyph = PACK_GLYPH[item.key] ?? 'receipt';
            const name = activeLocale === 'th' ? item.th : item.en;
            const lineKey = `pack.${item.key}` as keyof typeof COPY;
            const line = COPY[lineKey] ? t(lineKey) : '';

            return (
              <Pressable
                key={item.key}
                role="checkbox"
                aria-label={name}
                aria-checked={isChecked}
                aria-disabled={hasItem}
                disabled={hasItem || saving}
                onPress={() => togglePicked(item.key)}
                style={[styles.row, { borderBottomColor: colors.hairline }]}
              >
                <View style={[styles.glyphTile, { backgroundColor: item.color }]}>
                  <CategoryGlyph glyph={glyph} size={20} color={colors.ink} />
                </View>

                <View style={styles.rowDetails}>
                  <WalletText style={[styles.itemName, hasItem && { color: colors.quiet }]}>
                    {name}
                  </WalletText>
                  <WalletText role="caption" style={[styles.itemLine, { color: colors.quiet }]}>
                    {line}
                  </WalletText>
                </View>

                {hasItem ? (
                  <View style={[styles.haveBadge, { backgroundColor: colors.raised }]}>
                    <WalletText role="caption" style={[styles.haveText, { color: colors.quiet }]}>
                      {t('categories.packHave')}
                    </WalletText>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.checkboxBox,
                      {
                        backgroundColor: isChecked ? colors.ink : 'transparent',
                        borderColor: isChecked ? colors.ink : colors.quiet,
                      },
                    ]}
                  >
                    {isChecked ? (
                      <WalletText style={{ color: colors.card, fontSize: 13, fontWeight: '700' }}>✓</WalletText>
                    ) : null}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Note box */}
        <View style={[styles.noteBox, { backgroundColor: colors.raised }]}>
          <WalletText role="caption" style={[styles.noteText, { color: colors.ink }]}>
            {t('categories.packNote')}
          </WalletText>
        </View>

        {/* Add button */}
        <View style={styles.footer}>
          <PrimaryButton
            label={t('categories.packAdd', { n: String(pickedCount) })}
            onPress={handleAdd}
            disabled={pickedCount === 0 || saving}
            busy={saving}
          />
        </View>
      </View>
    </Tray>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  intro: {
    fontSize: 15,
    lineHeight: 22,
  },
  itemsList: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  glyphTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDetails: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
  },
  itemLine: {
    fontSize: 13,
  },
  haveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  haveText: {
    fontSize: 13,
    fontWeight: '500',
  },
  checkboxBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBox: {
    borderRadius: 16,
    padding: 14,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    marginTop: 8,
  },
});
