import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
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

import { api, DuplicatePair } from "@/src/api/client";
import { COLORS, SPACING, TYPO } from "@/src/theme";

export default function DuplicatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<DuplicatePair[]>("/admin/duplicates");
      setPairs(r.data);
    } catch {
      setPairs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const del = async (id: string) => {
    try {
      await api.delete(`/designs/${id}`);
      await load();
    } catch {}
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="dup-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Admin</Text>
          <Text style={styles.title}>Duplicate detection</Text>
          <Text style={styles.sub}>{pairs.length} pair{pairs.length === 1 ? "" : "s"} at ≥94% similarity</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 + insets.bottom }}>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : pairs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={40} color={COLORS.success} />
            <Text style={styles.emptyTitle}>No duplicates detected</Text>
            <Text style={TYPO.bodyMuted}>Your catalog is clean.</Text>
          </View>
        ) : (
          pairs.map((p, i) => (
            <View key={`${p.design_a_id}-${p.design_b_id}-${i}`} style={styles.pair} testID={`dup-pair-${i}`}>
              <View style={styles.pairHeader}>
                <View style={styles.pairBadge}>
                  <Text style={styles.pairBadgeText}>{(p.similarity * 100).toFixed(1)}%</Text>
                </View>
                <Text style={styles.pairText}>Duplicate found</Text>
              </View>
              <View style={styles.pairBody}>
                <TouchableOpacity
                  testID={`dup-open-a-${i}`}
                  style={styles.pairSide}
                  onPress={() => router.push(`/(app)/design/${p.design_a_id}` as any)}
                >
                  <Image source={p.design_a_thumb} style={styles.pairImg} contentFit="cover" />
                  <Text style={styles.pairNo}>#{p.design_a_number}</Text>
                </TouchableOpacity>
                <View style={styles.vs}><Ionicons name="git-compare" size={18} color={COLORS.textMuted} /></View>
                <TouchableOpacity
                  testID={`dup-open-b-${i}`}
                  style={styles.pairSide}
                  onPress={() => router.push(`/(app)/design/${p.design_b_id}` as any)}
                >
                  <Image source={p.design_b_thumb} style={styles.pairImg} contentFit="cover" />
                  <Text style={styles.pairNo}>#{p.design_b_number}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pairActions}>
                <TouchableOpacity
                  testID={`dup-delete-b-${i}`}
                  style={styles.delBtn}
                  onPress={() => del(p.design_b_id)}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  <Text style={styles.delText}>Remove #{p.design_b_number}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  title: { ...TYPO.h3, marginTop: 2 },
  sub: { ...TYPO.bodyMuted, fontSize: 12, marginTop: 4 },
  empty: { alignItems: "center", padding: SPACING.xl, gap: 6 },
  emptyTitle: { ...TYPO.h3, marginTop: 8 },
  pair: {
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  pairHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: "#FEF2F2",
  },
  pairBadge: { backgroundColor: COLORS.danger, paddingHorizontal: 8, paddingVertical: 3 },
  pairBadgeText: { color: "#fff", fontFamily: "Menlo", fontSize: 11, letterSpacing: 1 },
  pairText: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  pairBody: { flexDirection: "row", alignItems: "center", padding: SPACING.sm, gap: SPACING.sm },
  pairSide: { flex: 1, alignItems: "center", gap: 6 },
  pairImg: { width: "100%", aspectRatio: 1, borderWidth: 1, borderColor: COLORS.border },
  pairNo: { fontFamily: "Menlo", fontSize: 12, color: COLORS.text },
  vs: { width: 32, alignItems: "center" },
  pairActions: { flexDirection: "row", padding: SPACING.sm, gap: 8, justifyContent: "flex-end" },
  delBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: COLORS.danger, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  delText: { color: COLORS.danger, fontSize: 12, fontWeight: "600" },
});
