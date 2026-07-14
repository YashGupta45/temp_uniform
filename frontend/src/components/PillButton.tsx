import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";

import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function PillButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  testID,
  style,
  loading,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
}) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isSecondary = variant === "secondary";

  const bg = isPrimary
    ? COLORS.primary
    : isDanger
    ? COLORS.danger
    : isSecondary
    ? COLORS.surface
    : "transparent";
  const fg = isPrimary || isDanger ? "#FFFFFF" : COLORS.text;
  const border = isSecondary ? COLORS.border : "transparent";

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.base,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.label, { color: fg }]}>{loading ? "..." : label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  label: { ...TYPO.body, fontWeight: "600" },
});
