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

import { api, Design } from "@/src/api/client";
import { COLORS, SPACING, TYPO } from "@/src/theme";

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Design[]>("/favorites");
      setItems(r.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Pinned</Text>
          <Text style={styles.title}>Saved designs</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={48} color={COLORS.textFaint} />
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={TYPO.bodyMuted}>Save designs from the detail screen to build your shortlist.</Text>
          <TouchableOpacity
            testID="favorites-goto-catalogs"
            onPress={() => router.push("/(app)/catalogs")}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>Browse catalogs</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          numColumns={2}
          contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`favorite-${item.id}`}
              onPress={() => router.push(`/(app)/design/${item.id}` as any)}
              activeOpacity={0.85}
              style={styles.tile}
            >
              <Image source={item.thumbnail || item.image} style={styles.tileImg} contentFit="cover" />
              <View style={styles.tileMeta}>
                <Text style={styles.tileNo}>#{item.design_number}</Text>
                <Text style={styles.tileSub} numberOfLines={1}>
                  {item.catalog_name || "—"}
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
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { ...TYPO.h1, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: SPACING.lg },
  emptyTitle: { ...TYPO.h3, marginTop: 8 },
  cta: {
    marginTop: SPACING.md, flexDirection: "row", gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
    alignItems: "center",
  },
  ctaText: { color: "#fff", fontWeight: "600" },

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
