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

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
              disabled={busy || !email || !password}
              loading={busy}
              style={{ marginTop: SPACING.sm }}
            />
          </View>

          <Text style={styles.helper}>
            Ask your admin for login credentials.
          </Text>
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
  helper: {
    marginTop: SPACING.xl,
    textAlign: "center",
    color: COLORS.textFaint,
    fontSize: 12,
    fontFamily: "Menlo",
    letterSpacing: 0.6,
  },
});
