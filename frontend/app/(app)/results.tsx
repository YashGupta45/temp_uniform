import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { DesignSearchResult } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ data?: string; queryImage?: string }>();

  const results = useMemo<DesignSearchResult[]>(() => {
    try {
      return params.data ? JSON.parse(String(params.data)) : [];
    } catch {
      return [];
    }
  }, [params.data]);

  const top = results[0];
  const rest = results.slice(1);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="results-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>AI Search Results</Text>
          <Text style={styles.title}>{results.length} matches</Text>
        </View>
        <TouchableOpacity
          testID="results-scan-again"
          onPress={() => router.replace("/(app)/scan")}
          style={styles.iconBtn}
        >
          <Ionicons name="scan" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Query preview */}
        {params.queryImage ? (
          <View style={styles.querySection}>
            <View style={styles.queryImgWrap}>
              <Image source={String(params.queryImage)} style={styles.queryImg} contentFit="cover" />
              <View style={styles.queryBadge}>
                <Text style={styles.queryBadgeText}>QUERY</Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={TYPO.overline}>Best Match</Text>
              {top ? (
                <>
                  <Text style={styles.topSim}>{(top.similarity * 100).toFixed(1)}%</Text>
                  <Text style={styles.topNo}>#{top.design_number}</Text>
                  <Text style={{ ...TYPO.bodyMuted, fontSize: 12 }}>
                    {top.catalog_name} · pg {top.page_number ?? "—"}
                  </Text>
                </>
              ) : (
                <Text style={TYPO.bodyMuted}>No matches yet</Text>
              )}
            </View>
          </View>
        ) : null}

        {/* Top match large card */}
        {top ? (
          <TouchableOpacity
            testID={`result-top-${top.id}`}
            activeOpacity={0.85}
            onPress={() => router.push(`/(app)/design/${top.id}` as any)}
            style={styles.topCard}
          >
            <Image source={top.thumbnail} style={styles.topImg} contentFit="cover" />
            <View style={styles.topSimBadge}>
              <Text style={styles.topSimBadgeText}>{(top.similarity * 100).toFixed(0)}%</Text>
            </View>
            <View style={styles.topInfo}>
              <Text style={styles.topInfoTitle}>#{top.design_number}</Text>
              <Text style={styles.topInfoSub}>
                {top.color || "—"} · {top.pattern || "—"} · {top.brand || "—"}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={44} color={COLORS.textFaint} />
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptySub}>
              Add more designs to your catalogs, then try scanning again.
            </Text>
            <PillButton
              testID="results-empty-scan"
              label="Scan again"
              icon="scan"
              onPress={() => router.replace("/(app)/scan")}
              style={{ marginTop: SPACING.md }}
            />
          </View>
        )}

        {/* Rest as edge-to-edge grid */}
        {rest.length > 0 ? (
          <>
            <View style={styles.otherHeader}>
              <Text style={TYPO.overline}>Also similar ({rest.length})</Text>
            </View>
            <View style={styles.grid}>
              {rest.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  testID={`result-item-${r.id}`}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/(app)/design/${r.id}` as any)}
                  style={styles.gridItem}
                >
                  <Image source={r.thumbnail} style={styles.gridImg} contentFit="cover" />
                  <View style={styles.simBadge}>
                    <Text style={styles.simBadgeText}>{(r.similarity * 100).toFixed(0)}%</Text>
                  </View>
                  <View style={styles.gridMeta}>
                    <Text style={styles.gridNo}>#{r.design_number}</Text>
                    <Text style={styles.gridSub} numberOfLines={1}>
                      {r.color || "—"} · {r.pattern || "—"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
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

  querySection: {
    flexDirection: "row", gap: SPACING.md, padding: SPACING.lg, alignItems: "center",
  },
  queryImgWrap: { width: 92, height: 92, position: "relative" },
  queryImg: { width: "100%", height: "100%", borderWidth: 1, borderColor: COLORS.border },
  queryBadge: {
    position: "absolute", top: 4, left: 4,
    backgroundColor: COLORS.danger, paddingHorizontal: 6, paddingVertical: 2,
  },
  queryBadgeText: { color: "#fff", fontFamily: "Menlo", fontSize: 9, letterSpacing: 1.5 },
  topSim: { fontSize: 32, fontWeight: "700", color: COLORS.primary, fontFamily: "Menlo", letterSpacing: -1 },
  topNo: { fontSize: 15, fontWeight: "600", color: COLORS.text },

  topCard: {
    marginHorizontal: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.lg,
  },
  topImg: { width: "100%", aspectRatio: 1, backgroundColor: COLORS.surfaceMuted },
  topSimBadge: {
    position: "absolute", top: 12, right: 12,
    backgroundColor: COLORS.ink, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  topSimBadgeText: { color: "#fff", fontFamily: "Menlo", fontSize: 12, letterSpacing: 1 },
  topInfo: { padding: SPACING.md, gap: 4 },
  topInfoTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  topInfoSub: { ...TYPO.bodyMuted, fontSize: 12 },

  empty: { alignItems: "center", padding: SPACING.xl, gap: 8 },
  emptyTitle: { ...TYPO.h3, marginTop: 8 },
  emptySub: { ...TYPO.bodyMuted, textAlign: "center", fontSize: 13 },

  otherHeader: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  grid: {
    flexDirection: "row", flexWrap: "wrap",
    borderTopWidth: 1, borderLeftWidth: 1, borderColor: COLORS.border,
  },
  gridItem: {
    width: "50%",
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  gridImg: { width: "100%", aspectRatio: 1, backgroundColor: COLORS.surfaceMuted },
  simBadge: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 3,
  },
  simBadgeText: { color: "#fff", fontFamily: "Menlo", fontSize: 11, letterSpacing: 1 },
  gridMeta: { padding: SPACING.sm, gap: 2 },
  gridNo: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  gridSub: { fontSize: 11, color: COLORS.textMuted },
});
