import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  testID?: string;
};

export function TxtInput({ label, error, style, testID, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={COLORS.textFaint}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.md },
  label: { ...TYPO.overline, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  inputError: { borderColor: COLORS.danger },
  err: { color: COLORS.danger, fontSize: 12, marginTop: 4 },
});
