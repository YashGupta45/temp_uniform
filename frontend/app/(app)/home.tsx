import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Catalog, DashboardStats, RecentSearch } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1701964620963-4dcaab6d020f?w=800";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([
        api.get<Catalog[]>("/catalogs"),
        api.get<RecentSearch[]>("/search/recent"),
      ]);
      setCatalogs(c.data);
      setRecent(r.data);
      if (user?.role !== "employee") {
        try {
          const s = await api.get<DashboardStats>("/admin/stats");
          setStats(s.data);
        } catch {
          setStats(null);
        }
      }
    } catch (e) {
      console.log("home load error", e);
    }
  }, [user?.role]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 90 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.greetRow}>
          <View>
            <Text style={styles.overline}>Welcome, {user?.name?.split(" ")[0] || user?.email}</Text>
            <Text style={styles.h1}>What are we{"\n"}matching today?</Text>
          </View>
        </View>

        {/* Hero scan card */}
        <TouchableOpacity
          testID="home-scan-hero"
          activeOpacity={0.9}
          onPress={() => router.push("/(app)/scan")}
          style={styles.hero}
        >
          <Image source={HERO} style={styles.heroImg} contentFit="cover" />
          <View style={styles.heroScrim} />
          <View style={styles.heroReticle}>
            <View style={[styles.corner, { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 }]} />
            <View style={[styles.corner, { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
            <View style={[styles.corner, { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 }]} />
            <View style={[styles.corner, { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 }]} />
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.heroKicker}>AI SIMILARITY SEARCH</Text>
            <Text style={styles.heroTitle}>Scan a cloth sample</Text>
            <Text style={styles.heroSub}>Point your camera or upload a photo — get Top 20 matches instantly.</Text>
            <View style={styles.heroCta}>
              <Ionicons name="scan" size={16} color="#fff" />
              <Text style={styles.heroCtaText}>Open Scanner</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction icon="pricetag-outline" label="Design No." testID="quick-text-search"
            onPress={() => router.push("/(app)/text-search")} />
          <QuickAction icon="albums-outline" label="Catalogs" testID="quick-catalogs"
            onPress={() => router.push("/(app)/catalogs")} />
          <QuickAction icon="bookmark-outline" label="Saved" testID="quick-favorites"
            onPress={() => router.push("/(app)/favorites")} />
          <QuickAction icon="time-outline" label="Recent" testID="quick-recent"
            onPress={() => router.push("/(app)/text-search")} />
        </View>

        {/* Admin stats */}
        {stats ? (
          <View style={styles.statsBlock}>
            <Text style={styles.overline}>Overview · Last 7 days</Text>
            <View style={styles.statsGrid}>
              <StatCell label="DESIGNS" value={stats.designs} />
              <StatCell label="CATALOGS" value={stats.catalogs} />
              <StatCell label="SEARCHES" value={stats.searches_last_7d} />
              <StatCell label="DUPES" value={stats.duplicates_estimate} />
            </View>
          </View>
        ) : null}

        {/* Recent searches */}
        {recent.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.overline}>Recent scans</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentRow}
            >
              {recent.slice(0, 12).map((r) => (
                <TouchableOpacity
                  key={r.id}
                  testID={`recent-${r.id}`}
                  activeOpacity={0.85}
                  onPress={() => r.top_design_id && router.push(`/(app)/design/${r.top_design_id}` as any)}
                  style={styles.recentCard}
                >
                  {r.thumbnail ? (
                    <Image source={r.thumbnail} style={styles.recentImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.recentImg, { alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="search" size={22} color={COLORS.textMuted} />
                    </View>
                  )}
                  <Text style={styles.recentSim}>
                    {r.query_type === "image"
                      ? `${(r.top_similarity * 100).toFixed(0)}%`
                      : r.query_text || "text"}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Catalogs preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.overline}>Catalogs</Text>
            <TouchableOpacity testID="see-all-catalogs" onPress={() => router.push("/(app)/catalogs")}>
              <Text style={styles.linkText}>See all →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.catalogGrid}>
            {catalogs.slice(0, 4).map((c) => (
              <TouchableOpacity
                key={c.id}
                testID={`home-catalog-${c.id}`}
                onPress={() => router.push(`/(app)/catalog/${c.id}` as any)}
                activeOpacity={0.85}
                style={styles.catalogCard}
              >
                {c.cover_image ? (
                  <Image source={c.cover_image} style={styles.catalogImg} contentFit="cover" />
                ) : (
                  <View style={[styles.catalogImg, { backgroundColor: COLORS.surfaceMuted }]} />
                )}
                <View style={styles.catalogMeta}>
                  <Text style={styles.catalogTitle} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.catalogSub}>
                    {c.brand || "—"} · {c.design_count} designs
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.85} style={styles.qa}>
      <View style={styles.qaIcon}>
        <Ionicons name={icon} size={20} color={COLORS.text} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: SPACING.lg },
  greetRow: { marginTop: SPACING.sm },
  overline: { ...TYPO.overline },
  h1: { ...TYPO.h1, marginTop: 8, lineHeight: 40 },

  hero: {
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 240,
  },
  heroImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroScrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(10,10,10,0.55)",
  },
  heroReticle: {
    position: "absolute", top: 16, right: 16, width: 60, height: 60,
  },
  corner: {
    position: "absolute", width: 14, height: 14,
    borderColor: COLORS.danger, borderWidth: 2,
  },
  heroContent: { position: "absolute", left: 0, right: 0, bottom: 0, padding: SPACING.lg },
  heroKicker: { color: COLORS.danger, fontFamily: "Menlo", fontSize: 11, letterSpacing: 2, marginBottom: 6 },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 6 },
  heroCta: {
    marginTop: SPACING.md, alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 999,
  },
  heroCtaText: { color: "#fff", fontWeight: "600", fontSize: 13 },

  quickRow: { flexDirection: "row", gap: SPACING.sm, justifyContent: "space-between" },
  qa: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, alignItems: "center", gap: 8,
  },
  qaIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceMuted,
    alignItems: "center", justifyContent: "center",
  },
  qaLabel: { fontSize: 11, fontWeight: "600", color: COLORS.text, letterSpacing: 0.3 },

  statsBlock: { backgroundColor: COLORS.ink, padding: SPACING.lg, borderRadius: RADIUS.md },
  statsGrid: { flexDirection: "row", marginTop: SPACING.md, justifyContent: "space-between" },
  statCell: { flex: 1, paddingRight: 8 },
  statValue: { color: "#fff", fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  statLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1.5, marginTop: 2, fontFamily: "Menlo" },

  section: { gap: SPACING.sm },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  linkText: { fontSize: 12, fontWeight: "600", color: COLORS.primary },

  recentRow: { gap: SPACING.sm, paddingRight: SPACING.lg },
  recentCard: { width: 90 },
  recentImg: {
    width: 90, height: 90, backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1, borderColor: COLORS.border,
  },
  recentSim: {
    marginTop: 6, fontFamily: "Menlo", fontSize: 12, color: COLORS.text,
  },

  catalogGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  catalogCard: {
    width: "48.5%", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  catalogImg: { width: "100%", aspectRatio: 1, backgroundColor: COLORS.surfaceMuted },
  catalogMeta: { padding: SPACING.sm, gap: 2 },
  catalogTitle: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  catalogSub: { fontSize: 11, color: COLORS.textMuted },
});
