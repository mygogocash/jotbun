import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

import { MotionPressable } from "@mobile/components/MotionPressable";
import { useCopy } from "@mobile/i18n/useCopy";
import { spendMediaPermissionCopy } from "@mobile/spend/spendMediaPermissionCopy";
import type { ThemeColors } from "@mobile/theme/colorPalettes";
import { useThemedStyles } from "@mobile/theme/useThemedStyles";
import { Text } from "@mobile/theme/AppText";
import { radii, spacing, typography } from "@mobile/theme/tokens";

/**
 * Short in-app why-sheet shown before the first camera/photos OS permission
 * prompt for GoGoSpend slip pick (#2651). Slip menu only — never cold start.
 *
 * Same Modal / web-fixed overlay pattern as `PushPermissionPrimer`.
 */
export function SpendMediaPermissionPrimer({
  onCancel,
  onContinue,
}: {
  onCancel: () => void;
  onContinue: () => void;
}) {
  const tc = useCopy();
  const styles = useThemedStyles(createSpendMediaPermissionPrimerStyles);

  const dialog = (
    <>
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={onCancel}
        style={styles.backdrop}
      />
      <View
        {...({ role: "dialog" } as const)}
        accessibilityLabel={tc(spendMediaPermissionCopy.primerTitle)}
        style={styles.card}
      >
        <Text style={styles.title}>
          {tc(spendMediaPermissionCopy.primerTitle)}
        </Text>
        <Text style={styles.body}>
          {tc(spendMediaPermissionCopy.primerBody)}
        </Text>
        <View style={styles.actions}>
          <MotionPressable
            accessibilityRole="button"
            onPress={onCancel}
            pressScale={0.98}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>
              {tc(spendMediaPermissionCopy.primerNotNow)}
            </Text>
          </MotionPressable>
          <MotionPressable
            accessibilityRole="button"
            onPress={onContinue}
            pressScale={0.98}
            style={styles.confirmButton}
          >
            <Text style={styles.confirmText}>
              {tc(spendMediaPermissionCopy.primerContinue)}
            </Text>
          </MotionPressable>
        </View>
      </View>
    </>
  );

  if (Platform.OS === "web") {
    return <View style={[styles.overlay, webFixedOverlayStyle]}>{dialog}</View>;
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.overlay}>{dialog}</View>
    </Modal>
  );
}

const webFixedOverlayStyle = {
  position: "fixed",
  zIndex: 1000,
} as unknown as ViewStyle;

function createSpendMediaPermissionPrimerStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      alignItems: "center",
      bottom: 0,
      justifyContent: "center",
      left: 0,
      paddingHorizontal: spacing.lg,
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 1000,
    },
    backdrop: {
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      gap: spacing.sm,
      maxWidth: 360,
      padding: spacing.md,
      width: "100%",
      zIndex: 1,
    },
    title: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontWeight: "800",
    },
    body: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      lineHeight: 18,
    },
    actions: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    cancelButton: {
      alignItems: "center",
      borderColor: colors.borderStrong,
      borderRadius: radii.chip,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
    },
    cancelText: {
      color: colors.accent,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: "700",
    },
    confirmButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radii.chip,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
    },
    confirmText: {
      color: colors.onPrimary,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: "800",
    },
  });
}
