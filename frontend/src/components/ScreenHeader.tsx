import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, SPACING, TYPO } from "@/src/theme";

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  testID,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}
    >
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity
            testID="header-back-button"
            onPress={onBack}
            hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>Fabric Search</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  back: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  overline: { ...TYPO.overline },
  title: { ...TYPO.h2, marginTop: 2 },
  subtitle: { ...TYPO.bodyMuted, marginTop: 4 },
  right: { marginLeft: SPACING.sm },
});
