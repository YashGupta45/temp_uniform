import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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

import { api, Design, DesignSearchResult } from "@/src/api/client";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

export default function DesignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [design, setDesign] = useState<Design | null>(null);
  const [related, setRelated] = useState<DesignSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, r, favs] = await Promise.all([
        api.get<Design>(`/designs/${id}`),
        api.get<DesignSearchResult[]>(`/search/related/${id}?top_k=8`),
        api.get<Design[]>("/favorites"),
      ]);
      setDesign(d.data);
      setRelated(r.data);
      setSaved(favs.data.some((f) => f.id === id));
    } catch (e) {
      console.log("design load error", e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleFav = async () => {
    if (!id) return;
    try {
      if (saved) {
        await api.delete(`/favorites/${id}`);
        setSaved(false);
      } else {
        await api.post("/favorites", { design_id: id });
        setSaved(true);
      }
    } catch {}
  };

  if (loading || !design) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="detail-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Design</Text>
          <Text style={styles.title} numberOfLines={1}>#{design.design_number}</Text>
        </View>
        <TouchableOpacity
          testID="detail-toggle-favorite"
          onPress={toggleFav}
          style={[styles.iconBtn, saved && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
        >
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color={saved ? "#fff" : COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <Image source={design.image} style={styles.hero} contentFit="cover" />

        <View style={styles.metaBlock}>
          <MetaRow k="DESIGN NO." v={`#${design.design_number}`} mono />
          <MetaRow k="CATALOG" v={design.catalog_name} />
          <MetaRow k="BRAND" v={design.brand || "—"} />
          <MetaRow k="PAGE" v={design.page_number != null ? String(design.page_number) : "—"} mono />
          <MetaRow k="COLOR" v={design.color || "—"} />
          <MetaRow k="PATTERN" v={design.pattern || "—"} />
          {design.tags.length > 0 ? (
            <View style={{ marginTop: SPACING.sm }}>
              <Text style={TYPO.overline}>TAGS</Text>
              <View style={styles.tagRow}>
                {design.tags.map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {design.remarks ? (
            <View style={{ marginTop: SPACING.md }}>
              <Text style={TYPO.overline}>REMARKS</Text>
              <Text style={{ ...TYPO.body, marginTop: 6 }}>{design.remarks}</Text>
            </View>
          ) : null}
        </View>

        {/* Related */}
        {related.length > 0 ? (
          <View style={{ marginTop: SPACING.md }}>
            <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm }}>
              <Text style={TYPO.overline}>Visually similar</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relRow}
            >
              {related.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  testID={`related-${r.id}`}
                  onPress={() => router.push(`/(app)/design/${r.id}` as any)}
                  style={styles.relCard}
                  activeOpacity={0.85}
                >
                  <Image source={r.thumbnail} style={styles.relImg} contentFit="cover" />
                  <View style={styles.relBadge}>
                    <Text style={styles.relBadgeText}>{(r.similarity * 100).toFixed(0)}%</Text>
                  </View>
                  <Text style={styles.relNo}>#{r.design_number}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaKey}>{k}</Text>
      <Text style={[styles.metaVal, mono && { fontFamily: "Menlo" }]} numberOfLines={2}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
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
  hero: { width: "100%", aspectRatio: 1, backgroundColor: COLORS.surfaceMuted },
  metaBlock: { padding: SPACING.lg, gap: 4 },
  metaRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  metaKey: { ...TYPO.overline, width: 110 },
  metaVal: { ...TYPO.body, flex: 1, fontWeight: "600" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  tagText: { fontSize: 12, color: COLORS.text, fontFamily: "Menlo" },
  relRow: { paddingHorizontal: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.md },
  relCard: { width: 120 },
  relImg: { width: 120, height: 120, borderWidth: 1, borderColor: COLORS.border },
  relBadge: {
    position: "absolute", top: 6, right: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: 6, paddingVertical: 2,
  },
  relBadgeText: { color: "#fff", fontFamily: "Menlo", fontSize: 10 },
  relNo: { marginTop: 8, fontFamily: "Menlo", fontSize: 12, color: COLORS.text },
});
