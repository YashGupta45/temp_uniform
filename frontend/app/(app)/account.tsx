import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, DashboardStats } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canManage = user?.role === "admin" || user?.role === "manager";
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const r = await api.get<DashboardStats>("/admin/stats");
      setStats(r.data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const regen = async () => {
    setRegenBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ updated: number }>("/admin/regenerate-embeddings");
      setMsg(`Regenerated ${r.data.updated} embeddings.`);
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || "Failed to regenerate embeddings.");
    } finally {
      setRegenBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 + insets.bottom, gap: SPACING.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || "U"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Admin stats */}
        {canManage ? (
          <View style={styles.statsBlock}>
            <Text style={styles.overline}>Overview</Text>
            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.md }} />
            ) : stats ? (
              <View style={styles.statsGrid}>
                <Stat label="USERS" value={stats.users} />
                <Stat label="CATALOGS" value={stats.catalogs} />
                <Stat label="DESIGNS" value={stats.designs} />
                <Stat label="SEARCHES 7d" value={stats.searches_last_7d} />
                <Stat label="DUPES ~" value={stats.duplicates_estimate} />
                <Stat label="STORAGE MB" value={Math.round(stats.storage_bytes / (1024 * 1024))} />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Admin actions */}
        {canManage ? (
          <View style={styles.section}>
            <Text style={styles.overline}>Manage</Text>
            <ActionRow
              testID="nav-add-catalog"
              icon="add-circle-outline"
              label="Add catalog"
              onPress={() => router.push("/(app)/admin/add-catalog")}
            />
            <ActionRow
              testID="nav-add-design"
              icon="images-outline"
              label="Add design"
              onPress={() => router.push("/(app)/admin/add-design")}
            />
            <ActionRow
              testID="nav-duplicates"
              icon="git-compare-outline"
              label="Duplicate detection"
              onPress={() => router.push("/(app)/admin/duplicates")}
            />
            {isAdmin ? (
              <ActionRow
                testID="nav-users"
                icon="people-outline"
                label="User management"
                onPress={() => router.push("/(app)/admin/users")}
              />
            ) : null}
            {isAdmin ? (
              <ActionRow
                testID="nav-regen"
                icon="refresh-outline"
                label={regenBusy ? "Regenerating..." : "Regenerate all embeddings"}
                onPress={regen}
                disabled={regenBusy}
              />
            ) : null}
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          </View>
        ) : null}

        {/* App actions */}
        <View style={styles.section}>
          <Text style={styles.overline}>Preferences</Text>
          <ActionRow
            testID="pref-change-password"
            icon="key-outline"
            label="Change password"
            onPress={() => router.push("/(app)/change-password")}
          />
          <ActionRow icon="notifications-outline" label="Notifications" muted testID="pref-notifications" />
          <ActionRow icon="cloud-download-outline" label="Offline sync (soon)" muted testID="pref-offline" />
          <ActionRow icon="information-circle-outline" label="About WEFT · AI" muted testID="pref-about" />
        </View>

        <PillButton
          testID="account-logout"
          label="Sign out"
          variant="secondary"
          icon="log-out-outline"
          onPress={logout}
          style={{ marginTop: SPACING.sm }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionRow({
  icon, label, onPress, muted, disabled, testID,
}: {
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  muted?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.8}
      disabled={disabled || muted}
      onPress={onPress}
      style={[styles.row, (muted || disabled) && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={20} color={COLORS.text} />
      <Text style={{ ...TYPO.body, flex: 1, marginLeft: 12, fontWeight: "500" }}>{label}</Text>
      {!muted && !disabled ? <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.ink, borderRadius: RADIUS.md,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  name: { color: "#fff", fontSize: 18, fontWeight: "700" },
  email: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 2 },
  rolePill: {
    marginTop: 6, alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 8, paddingVertical: 3,
  },
  roleText: { color: "#fff", fontSize: 10, letterSpacing: 1.5, fontFamily: "Menlo" },

  overline: { ...TYPO.overline, marginBottom: SPACING.sm },
  statsBlock: {
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    padding: SPACING.md,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap" },
  statCell: {
    width: "33.3%", paddingVertical: SPACING.sm,
  },
  statVal: { fontSize: 22, fontWeight: "700", color: COLORS.text, fontFamily: "Menlo", letterSpacing: -0.5 },
  statLabel: { fontSize: 10, letterSpacing: 1.5, color: COLORS.textMuted, marginTop: 2, fontFamily: "Menlo" },

  section: {
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    padding: SPACING.md,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  msg: {
    marginTop: 8, fontSize: 12, color: COLORS.success, fontFamily: "Menlo",
  },
});
