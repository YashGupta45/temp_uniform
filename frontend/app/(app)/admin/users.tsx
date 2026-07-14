import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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

import { api, UserPublic } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { TxtInput } from "@/src/components/TxtInput";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

const ROLES: ("employee" | "manager" | "admin")[] = ["employee", "manager", "admin"];

export default function AdminUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "manager" | "admin">("employee");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<UserPublic[]>("/auth/users");
      setUsers(r.data);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    setErr(null); setMsg(null);
    if (!email.trim() || !password.trim() || !name.trim()) return setErr("All fields required");
    setBusy(true);
    try {
      await api.post("/auth/register", {
        email: email.trim(), name: name.trim(), password, role,
      });
      setEmail(""); setName(""); setPassword(""); setRole("employee");
      setMsg("User created");
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="users-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Admin</Text>
          <Text style={styles.title}>Users ({users.length})</Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Add form */}
          <View style={styles.formBlock}>
            <Text style={TYPO.overline}>Add user</Text>
            <TxtInput testID="user-name" label="Name" value={name} onChangeText={setName} />
            <TxtInput testID="user-email" label="Email" value={email} onChangeText={setEmail}
              autoCapitalize="none" keyboardType="email-address" />
            <TxtInput testID="user-password" label="Password" value={password} onChangeText={setPassword}
              secureTextEntry />
            <Text style={TYPO.overline}>Role</Text>
            <View style={styles.roles}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  testID={`user-role-${r}`}
                  onPress={() => setRole(r)}
                  style={[styles.roleChip, role === r && styles.roleChipActive]}
                >
                  <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {err ? <Text style={{ color: COLORS.danger, marginTop: 6 }}>{err}</Text> : null}
            {msg ? <Text style={{ color: COLORS.success, marginTop: 6 }}>{msg}</Text> : null}
            <PillButton
              testID="user-submit"
              label={busy ? "Creating..." : "Create user"}
              onPress={create}
              disabled={busy}
              loading={busy}
              style={{ marginTop: SPACING.md }}
            />
          </View>

          {/* Existing users */}
          <View style={styles.listBlock}>
            <Text style={[TYPO.overline, { marginBottom: SPACING.sm }]}>Members</Text>
            {users.map((u) => (
              <View key={u.id} style={styles.userRow} testID={`user-row-${u.id}`}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{u.name?.[0]?.toUpperCase() || "?"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{u.name}</Text>
                  <Text style={styles.userEmail}>{u.email}</Text>
                </View>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{u.role.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
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

  formBlock: {
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, gap: 6,
  },
  roles: { flexDirection: "row", gap: 8, marginBottom: SPACING.sm, marginTop: 4 },
  roleChip: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.sm,
  },
  roleChipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  roleChipText: { fontFamily: "Menlo", fontSize: 11, letterSpacing: 1.5, color: COLORS.text },
  roleChipTextActive: { color: "#fff" },

  listBlock: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: SPACING.md },
  userRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryDim,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: COLORS.primary, fontWeight: "700" },
  userName: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  userEmail: { fontSize: 12, color: COLORS.textMuted },
  rolePill: { backgroundColor: COLORS.surfaceMuted, paddingHorizontal: 8, paddingVertical: 3 },
  rolePillText: { fontFamily: "Menlo", fontSize: 10, letterSpacing: 1.5, color: COLORS.text },
});
