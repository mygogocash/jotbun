import {
  SPEND_CATEGORY_EMOJI_MAX_UNITS,
  SPEND_CATEGORY_HUES,
} from "@gogospend/contracts";
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCopy } from "@mobile/i18n/useCopy";
import { type ThemeColors } from "@mobile/theme/colorPalettes";
import { Text, TextInput } from "@mobile/theme/AppText";
import { radii, spacing, typography } from "@mobile/theme/tokens";
import { useThemedStyles } from "@mobile/theme/useThemedStyles";

/** 44pt floor — every control a finger touches (UI_DESIGN_SYSTEM §1). */
const CONTROL_HEIGHT = 44;

/** The tag a category wears when its owner chose no mark of their own. */
const PLAIN_MARK = "🏷️";

/**
 * Naming a category of your own — design "A · a sheet" (owner call 2026-08-31).
 *
 * A sheet rather than rows inside the add panel, for two reasons the owner and
 * I settled on: the panel is already the busiest thing on the page and this is
 * a once-ever act, and the emoji keyboard covers the bottom of the screen —
 * inline, it would hide the colours the member is being asked to choose from.
 *
 * The emoji is its own field, never part of the name. Names are what the month
 * summary groups by, so "🎵 Music" as a name would never add up with "Music".
 */
export function SpendNewCategorySheet({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; emoji?: string; hue?: string }) => void;
}) {
  const styles = useThemedStyles(createSheetStyles);
  const tc = useCopy();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [hue, setHue] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedEmoji = emoji.trim();
  const ready = trimmedName.length > 0 && !busy;

  return (
    // onRequestClose: Android routes hardware/gesture back exclusively here
    // while a Modal is visible — without it, back dead-ends (repo convention:
    // every other Modal passes it).
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={tc("Close")}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View
          {...({ role: "dialog" } as const)}
          accessibilityLabel={tc("Name your own category")}
          style={[styles.card, { paddingBottom: spacing.xl + insets.bottom }]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{tc("Name your own category")}</Text>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {/*
             * The finished chip, before it exists. Two choices that only make
             * sense together are far easier to judge assembled than as a box
             * and a row of dots.
             */}
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>{tc("Looks like")}</Text>
              <View
                style={[
                  styles.chip,
                  hue ? { backgroundColor: hue, borderColor: hue } : null,
                ]}
              >
                <Text style={styles.chipEmoji}>
                  {trimmedEmoji || PLAIN_MARK}
                </Text>
                <Text
                  style={[styles.chipLabel, hue ? styles.chipLabelOn : null]}
                >
                  {trimmedName || tc("Your category")}
                </Text>
              </View>
            </View>

            <TextInput
              autoFocus
              onChangeText={setName}
              placeholder={tc("Name your own category")}
              placeholderTextColor={styles.placeholder.color}
              style={styles.input}
              value={name}
            />

            <View style={styles.emojiRow}>
              {/*
               * A one-character field, not a grid: the owner chose the phone's
               * own emoji keyboard so the whole set is available. The cap is
               * the contract's, because a single emoji can run to eleven UTF-16
               * units once joiners and skin tones are counted.
               */}
              <TextInput
                accessibilityLabel={tc("Category emoji")}
                maxLength={SPEND_CATEGORY_EMOJI_MAX_UNITS}
                onChangeText={setEmoji}
                placeholder={PLAIN_MARK}
                placeholderTextColor={styles.placeholder.color}
                style={styles.emojiInput}
                value={emoji}
              />
              <Text style={styles.hint}>
                {tc(
                  "Tap and pick from your keyboard's emoji. Leave it empty for the plain tag.",
                )}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>{tc("Colour")}</Text>
            <View style={styles.swatches}>
              {SPEND_CATEGORY_HUES.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: hue === option }}
                  // The colour has no name a member would recognise, so the
                  // label counts it instead of inventing one.
                  accessibilityLabel={`${tc("Colour")} ${
                    SPEND_CATEGORY_HUES.indexOf(option) + 1
                  }`}
                  key={option}
                  onPress={() => setHue(hue === option ? null : option)}
                  style={[
                    styles.swatchTarget,
                    hue === option ? styles.swatchTargetOn : null,
                  ]}
                >
                  <View style={[styles.swatch, { backgroundColor: option }]} />
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={() =>
              onCreate({
                name: trimmedName,
                emoji: trimmedEmoji || undefined,
                hue: hue ?? undefined,
              })
            }
            style={[styles.primary, ready ? null : styles.primaryOff]}
          >
            <Text style={styles.primaryLabel}>{tc("Add this category")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createSheetStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
    },
    scrim: {
      backgroundColor: "rgba(15, 23, 42, 0.45)",
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    /*
     * `maxWidth` for the same reason the locale sheet has one: with no cap this
     * stretches edge to edge on a desktop viewport, and a 1900px "bottom sheet"
     * is just a page. 640 matches that precedent.
     */
    card: {
      alignSelf: "center",
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      borderWidth: 1,
      gap: spacing.md,
      maxHeight: "88%",
      maxWidth: 640,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      width: "100%",
    },
    grabber: {
      alignSelf: "center",
      backgroundColor: colors.borderStrong,
      borderRadius: radii.chip,
      height: 4,
      width: 38,
    },
    title: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.title,
      fontWeight: typography.titleWeight,
      lineHeight: typography.titleLineHeight,
    },
    body: {
      gap: spacing.md,
      paddingBottom: spacing.sm,
    },
    previewRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
    },
    previewLabel: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
    },
    chip: {
      alignItems: "center",
      borderColor: colors.borderStrong,
      borderRadius: radii.chip,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 32,
      paddingHorizontal: spacing.sm + 2,
    },
    chipEmoji: {
      fontFamily: typography.family,
      fontSize: typography.caption,
    },
    chipLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: "500",
    },
    /*
     * Near-black on the filled chip, whichever colour it is. Every hue in the
     * contract's set was checked against this ink — that is why none of them is
     * a genuinely dark colour.
     */
    chipLabelOn: {
      color: colors.onPrimaryDark,
      fontWeight: "700",
    },
    /*
     * The app's default text box shape — Personal Information sets it and
     * `mobile-input-box-parity` pins it. A brand-new box has no reason to be
     * the one that disagrees.
     */
    input: {
      borderColor: colors.controlLine,
      borderRadius: 16,
      borderWidth: 1.5,
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.action,
      // Written as the number, not CONTROL_HEIGHT: the shape pin reads this
      // file's source and compares literals against the reference box.
      minHeight: 44,
      paddingHorizontal: 16,
    },
    emojiRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
    },
    /* Same edge and corner as the name box beside it, at one mark wide. */
    emojiInput: {
      borderColor: colors.controlLine,
      borderRadius: 16,
      borderWidth: 1.5,
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 22,
      height: CONTROL_HEIGHT,
      textAlign: "center",
      width: 56,
    },
    hint: {
      color: colors.muted,
      flex: 1,
      fontFamily: typography.family,
      fontSize: typography.caption,
      lineHeight: typography.captionLineHeight,
    },
    sectionLabel: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.labelWeight,
    },
    /*
     * Six to a row, which is not only tidy: the top row is the colours the
     * built-in categories already wear and the bottom row is the six added for
     * custom ones, so the split says something true about the set.
     */
    swatches: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    /*
     * The target is the 44pt floor; the dot inside it is what you see. Ringing
     * the target rather than the dot keeps the ring clear of the colour.
     */
    swatchTarget: {
      alignItems: "center",
      borderColor: "transparent",
      borderRadius: radii.chip,
      borderWidth: 2,
      height: CONTROL_HEIGHT,
      justifyContent: "center",
      width: CONTROL_HEIGHT,
    },
    swatchTargetOn: {
      borderColor: colors.ink,
    },
    swatch: {
      borderRadius: radii.chip,
      height: 28,
      width: 28,
    },
    primary: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radii.chip,
      justifyContent: "center",
      minHeight: CONTROL_HEIGHT,
    },
    primaryOff: {
      backgroundColor: colors.disabledAction,
    },
    primaryLabel: {
      color: colors.onPrimary,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
    },
    placeholder: {
      color: colors.placeholder,
    },
  });
}
