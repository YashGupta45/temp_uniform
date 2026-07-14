import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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

import { api, Catalog, Design } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, SPACING, TYPO } from "@/src/theme";

export default function CatalogDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const canManage = user?.role !== "employee";

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        api.get<Catalog>(`/catalogs/${id}`),
        api.get<Design[]>(`/designs?catalog_id=${id}`),
      ]);
      setCatalog(c.data);
      setDesigns(d.data);
    } catch (e) {
      console.log("catalog detail error", e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !catalog) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="catalog-detail-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>{catalog.brand || "Catalog"}</Text>
          <Text style={styles.title} numberOfLines={1}>{catalog.name}</Text>
          <Text style={styles.subtitle}>
            {catalog.design_count} designs · {catalog.season || "—"} {catalog.year ?? ""}
          </Text>
        </View>
        {canManage ? (
          <TouchableOpacity
            testID="catalog-add-design"
            style={styles.addBtn}
            onPress={() => router.push({ pathname: "/(app)/admin/add-design", params: { catalog_id: id } } as any)}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {designs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={44} color={COLORS.textFaint} />
          <Text style={styles.emptyTitle}>No designs in this catalog</Text>
          {canManage ? (
            <Text style={TYPO.bodyMuted}>Tap + to add your first design.</Text>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={designs}
          keyExtractor={(d) => d.id}
          numColumns={2}
          contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`catalog-design-${item.id}`}
              onPress={() => router.push(`/(app)/design/${item.id}` as any)}
              activeOpacity={0.85}
              style={styles.tile}
            >
              <Image source={item.thumbnail || item.image} style={styles.tileImg} contentFit="cover" />
              <View style={styles.tileMeta}>
                <Text style={styles.tileNo}>#{item.design_number}</Text>
                <Text style={styles.tileSub} numberOfLines={1}>
                  {item.color || "—"} · {item.pattern || "—"}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row", alignItems: "flex-start", gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  title: { ...TYPO.h2, marginTop: 2 },
  subtitle: { ...TYPO.bodyMuted, fontSize: 12, marginTop: 4 },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: SPACING.lg },
  emptyTitle: { ...TYPO.h3, marginTop: 8 },

  tile: {
    width: "50%",
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tileImg: { width: "100%", aspectRatio: 1, backgroundColor: COLORS.surfaceMuted },
  tileMeta: { padding: SPACING.sm, gap: 2 },
  tileNo: { fontSize: 13, fontWeight: "600", color: COLORS.text, fontFamily: "Menlo" },
  tileSub: { fontSize: 11, color: COLORS.textMuted },
});
