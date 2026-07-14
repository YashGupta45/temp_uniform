import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Catalog } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, SPACING, TYPO } from "@/src/theme";

export default function CatalogsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = user?.role !== "employee";

  const load = useCallback(async () => {
    try {
      const r = await api.get<Catalog[]>("/catalogs");
      setCatalogs(r.data);
    } catch (e) {
      console.log("catalogs error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Library</Text>
          <Text style={styles.title}>Catalogs</Text>
        </View>
        {canManage ? (
          <TouchableOpacity
            testID="catalogs-add-button"
            onPress={() => router.push("/(app)/admin/add-catalog")}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>New</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : catalogs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={44} color={COLORS.textFaint} />
          <Text style={styles.emptyTitle}>No catalogs yet</Text>
          <Text style={TYPO.bodyMuted}>Create your first catalog to start adding designs.</Text>
        </View>
      ) : (
        <FlatList
          data={catalogs}
          keyExtractor={(c) => c.id}
          numColumns={2}
          columnWrapperStyle={{ gap: SPACING.sm, paddingHorizontal: SPACING.lg }}
          contentContainerStyle={{ paddingBottom: 90 + insets.bottom, gap: SPACING.sm, paddingTop: SPACING.sm }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`catalog-card-${item.id}`}
              activeOpacity={0.85}
              style={styles.card}
              onPress={() => router.push(`/(app)/catalog/${item.id}` as any)}
            >
              {item.cover_image ? (
                <Image source={item.cover_image} style={styles.cardImg} contentFit="cover" />
              ) : (
                <View style={[styles.cardImg, { backgroundColor: COLORS.surfaceMuted, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="images-outline" size={28} color={COLORS.textFaint} />
                </View>
              )}
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                <View style={styles.cardRow}>
                  <Text style={styles.cardCount}>{item.design_count}</Text>
                  <Text style={styles.cardCountLabel}>DESIGNS</Text>
                </View>
                <Text style={styles.cardBrand} numberOfLines={1}>
                  {item.brand || "—"} · {item.season || "—"} {item.year ? item.year : ""}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { ...TYPO.h1, marginTop: 4 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
  },
  addText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: SPACING.lg },
  emptyTitle: { ...TYPO.h3, marginTop: 8 },

  card: {
    flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  cardImg: { width: "100%", aspectRatio: 1 },
  cardMeta: { padding: SPACING.sm, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  cardRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  cardCount: { fontFamily: "Menlo", fontSize: 18, color: COLORS.primary },
  cardCountLabel: { fontSize: 10, letterSpacing: 1.5, color: COLORS.textMuted, fontFamily: "Menlo" },
  cardBrand: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
