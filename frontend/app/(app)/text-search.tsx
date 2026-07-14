import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Catalog, Design } from "@/src/api/client";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "Stripe", label: "Stripe" },
  { key: "Check", label: "Check" },
  { key: "Floral", label: "Floral" },
  { key: "Polka", label: "Polka" },
  { key: "Solid", label: "Solid" },
  { key: "Weave", label: "Weave" },
] as const;

export default function TextSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [pattern, setPattern] = useState<string>("all");
  const [catalogFilter, setCatalogFilter] = useState<string | null>(null);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [items, setItems] = useState<Design[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<Catalog[]>("/catalogs").then((r) => setCatalogs(r.data)).catch(() => {});
  }, []);

  const search = useMemo(() => async () => {
    setLoading(true);
    try {
      const body: any = { limit: 60 };
      if (query.trim()) body.query = query.trim();
      if (pattern !== "all") body.pattern = pattern;
      if (catalogFilter) body.catalog_id = catalogFilter;
      const r = await api.post<Design[]>("/search/text", body);
      setItems(r.data);
    } finally {
      setLoading(false);
    }
  }, [query, pattern, catalogFilter]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { search(); }, 200);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, pattern, catalogFilter, search]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.stickyHeader}>
        <View style={styles.topRow}>
          <TouchableOpacity testID="text-search-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={TYPO.overline}>Search</Text>
            <Text style={styles.title}>By design number</Text>
          </View>
        </View>

        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            testID="text-search-input"
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. UNI-001, stripe, olive"
            placeholderTextColor={COLORS.textFaint}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query ? (
            <TouchableOpacity testID="text-search-clear" onPress={() => setQuery("")} hitSlop={{ top: 6, left: 6, right: 6, bottom: 6 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textFaint} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Chip row — horizontal, non-wrapping */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = pattern === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`chip-${f.key}`}
                onPress={() => setPattern(f.key)}
                activeOpacity={0.85}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <TouchableOpacity
            testID="chip-catalog-all"
            onPress={() => setCatalogFilter(null)}
            style={[styles.chip, !catalogFilter && styles.chipActive]}
          >
            <Text style={[styles.chipText, !catalogFilter && styles.chipTextActive]}>All catalogs</Text>
          </TouchableOpacity>
          {catalogs.map((c) => {
            const active = catalogFilter === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                testID={`chip-catalog-${c.id}`}
                onPress={() => setCatalogFilter(active ? null : c.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={44} color={COLORS.textFaint} />
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={TYPO.bodyMuted}>Try a different keyword or clear the filters.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          numColumns={2}
          contentContainerStyle={{ paddingBottom: 100 + insets.bottom, paddingTop: SPACING.xs }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`text-result-${item.id}`}
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
  stickyHeader: {
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.bg,
  },
  topRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  title: { ...TYPO.h3, marginTop: 2 },
  inputWrap: {
    marginHorizontal: SPACING.lg,
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    paddingHorizontal: 12, borderRadius: RADIUS.sm,
    height: 44,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.text },
  chipRow: {
    paddingHorizontal: SPACING.lg, gap: 8, alignItems: "center",
    minHeight: 44, paddingTop: SPACING.sm,
  },
  chip: {
    flexShrink: 0,
    paddingHorizontal: 14, height: 36,
    borderRadius: 999, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center",
    maxWidth: 220,
  },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipText: { fontSize: 12, color: COLORS.text, fontWeight: "500" },
  chipTextActive: { color: "#fff" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.lg, gap: 8 },
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
