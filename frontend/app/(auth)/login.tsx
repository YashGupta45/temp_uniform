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
import { SafeAreaView } from "react-native-safe-area-context";

import { PillButton } from "@/src/components/PillButton";
import { TxtInput } from "@/src/components/TxtInput";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, SPACING, TYPO } from "@/src/theme";

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@fabric.app", password: "Admin@123" },
  { role: "Manager", email: "manager@fabric.app", password: "Manager@123" },
  { role: "Employee", email: "employee@fabric.app", password: "Employee@123" },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@fabric.app");
  const [password, setPassword] = useState("Admin@123");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace("/(app)/home");
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Login failed";
      setErr(typeof msg === "string" ? msg : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const applyDemo = (a: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(a.email);
    setPassword(a.password);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Ionicons name="scan-outline" size={22} color="#fff" />
            </View>
            <Text style={styles.brandName}>WEFT · AI</Text>
          </View>

          <Text testID="login-title" style={styles.title}>
            Find any design.{"\n"}From any swatch.
          </Text>
          <Text style={styles.subtitle}>
            Sign in to access your private catalogs.
          </Text>

          <View style={styles.form}>
            <TxtInput
              testID="login-email-input"
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@company.com"
            />
            <View>
              <TxtInput
                testID="login-password-input"
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                placeholder="••••••••"
              />
              <TouchableOpacity
                testID="login-toggle-password"
                onPress={() => setShowPass((v) => !v)}
                style={styles.eye}
                hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
              >
                <Ionicons
                  name={showPass ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>

            {err ? (
              <Text testID="login-error" style={styles.err}>
                {err}
              </Text>
            ) : null}

            <PillButton
              testID="login-submit-button"
              label={busy ? "Signing in..." : "Sign In"}
              onPress={submit}
              disabled={busy}
              loading={busy}
              style={{ marginTop: SPACING.sm }}
            />
          </View>

          <View style={styles.demoBlock}>
            <Text style={styles.overline}>Demo accounts</Text>
            {DEMO_ACCOUNTS.map((a) => (
              <TouchableOpacity
                key={a.email}
                testID={`login-demo-${a.role.toLowerCase()}`}
                style={styles.demoRow}
                onPress={() => applyDemo(a)}
                activeOpacity={0.7}
              >
                <View style={styles.demoDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.demoRole}>{a.role}</Text>
                  <Text style={styles.demoEmail}>{a.email}</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg, paddingTop: SPACING.xl, gap: SPACING.md },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: SPACING.xl },
  brandBadge: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: COLORS.ink, alignItems: "center", justifyContent: "center",
  },
  brandName: {
    ...TYPO.overline, color: COLORS.text, letterSpacing: 4, fontSize: 13,
  },
  title: { ...TYPO.h1, lineHeight: 40 },
  subtitle: { ...TYPO.bodyMuted, marginTop: 8, marginBottom: SPACING.lg },
  form: { gap: 4 },
  eye: {
    position: "absolute",
    right: 12,
    top: 34,
    padding: 6,
  },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 4 },
  demoBlock: {
    marginTop: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  overline: { ...TYPO.overline, marginBottom: SPACING.sm },
  demoRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  demoDot: { width: 6, height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  demoRole: { ...TYPO.body, fontWeight: "600" },
  demoEmail: { ...TYPO.bodyMuted, fontSize: 12 },
});
