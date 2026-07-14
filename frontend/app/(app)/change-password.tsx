import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { TxtInput } from "@/src/components/TxtInput";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, SPACING, TYPO } from "@/src/theme";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setMsg(null);
    if (!current || !next || !confirm) {
      setErr("All fields are required");
      return;
    }
    if (next.length < 6) {
      setErr("New password must be at least 6 characters");
      return;
    }
    if (next !== confirm) {
      setErr("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      setMsg("Password changed. Signing you out...");
      setTimeout(async () => {
        await logout();
        router.replace("/(auth)/login");
      }, 900);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Failed to change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="pwd-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Account</Text>
          <Text style={styles.title}>Change password</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 + insets.bottom, gap: SPACING.sm }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.helper}>
            Use at least 6 characters. You&apos;ll be signed out on all devices after changing.
          </Text>

          <TxtInput
            testID="pwd-current"
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Enter current password"
          />
          <TxtInput
            testID="pwd-new"
            label="New password"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoCapitalize="none"
            placeholder="At least 6 characters"
          />
          <TxtInput
            testID="pwd-confirm"
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Re-enter new password"
          />

          {err ? <Text style={styles.err}>{err}</Text> : null}
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}

          <PillButton
            testID="pwd-submit"
            label={busy ? "Updating..." : "Update password"}
            onPress={submit}
            disabled={busy || !current || !next || !confirm}
            loading={busy}
            style={{ marginTop: SPACING.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  title: { ...TYPO.h3, marginTop: 2 },
  helper: { ...TYPO.bodyMuted, fontSize: 13, marginBottom: SPACING.sm },
  err: { color: COLORS.danger, marginTop: 6, fontSize: 13 },
  msg: { color: COLORS.success, marginTop: 6, fontSize: 13 },
});
