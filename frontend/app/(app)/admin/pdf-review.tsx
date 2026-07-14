import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

type Item = {
  id: string;
  job_id: string;
  page_index: number;
  printed_page_number: number;
  cell_index: number;
  label_thumb: string;
  thumbnail: string;
  suggested_number: string;
  edited_number: string;
  ocr_status: string;
  pattern?: string;
  color?: string;
  skip?: boolean;
};

type Job = {
  id: string;
  catalog_id: string;
  catalog_name: string;
  status: string;
  item_count: number;
  total_pages: number;
  pages: { page_index: number; thumb: string; detected: number; skip_page: boolean }[];
};

export default function PdfReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { job_id } = useLocalSearchParams<{ job_id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedPage, setSelectedPage] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = useCallback(async () => {
    if (!job_id) return;
    setLoading(true);
    try {
      const [j, its] = await Promise.all([
        api.get<Job>(`/admin/pdf-import/${job_id}`),
        api.get<Item[]>(`/admin/pdf-import/${job_id}/items`),
      ]);
      setJob(j.data);
      setItems(its.data);
    } finally {
      setLoading(false);
    }
  }, [job_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pageFilter = (it: Item) =>
    selectedPage === "all" ? true : it.page_index === selectedPage;
  const visibleItems = items.filter(pageFilter);
  const activeCount = items.filter((i) => !i.skip && (i.edited_number || "").trim()).length;

  const pages = useMemo(() => {
    if (!job) return [];
    // Only pages that had detections
    return (job.pages || []).filter((p) => (p.detected || 0) > 0);
  }, [job]);

  const patchItem = async (id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      await api.patch(`/admin/pdf-import/${job_id}/items/${id}`, patch);
    } catch {}
  };

  const patchPage = async (pageIndex: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((x) => (x.page_index === pageIndex ? { ...x, ...patch } : x)));
    try {
      await api.patch(`/admin/pdf-import/${job_id}/page/${pageIndex}`, patch);
    } catch {}
  };

  const openEdit = (it: Item) => {
    setEditing(it);
    setEditValue(it.edited_number || "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const val = editValue.trim();
    await patchItem(editing.id, { edited_number: val });
    setEditing(null);
  };

  const commit = async () => {
    setCommitting(true);
    setMsg(null);
    try {
      const r = await api.post<{ inserted: number }>(`/admin/pdf-import/${job_id}/commit`);
      setMsg(`Imported ${r.data.inserted} designs into ${job?.catalog_name || "the catalog"}.`);
      setTimeout(() => router.replace("/(app)/catalogs" as any), 1200);
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || "Failed to commit import");
    } finally {
      setCommitting(false);
    }
  };

  if (loading || !job) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="review-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Review · {job.catalog_name}</Text>
          <Text style={styles.title}>{activeCount} of {items.length} ready</Text>
        </View>
      </View>

      {/* Page chip row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <TouchableOpacity
          testID="review-chip-all"
          onPress={() => setSelectedPage("all")}
          style={[styles.chip, selectedPage === "all" && styles.chipActive]}
        >
          <Text style={[styles.chipText, selectedPage === "all" && styles.chipTextActive]}>
            All ({items.length})
          </Text>
        </TouchableOpacity>
        {pages.map((p) => {
          const count = items.filter((i) => i.page_index === p.page_index).length;
          const active = selectedPage === p.page_index;
          return (
            <TouchableOpacity
              key={p.page_index}
              testID={`review-chip-page-${p.page_index}`}
              onPress={() => setSelectedPage(p.page_index)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                p{p.page_index + 1} · {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectedPage !== "all" ? (
        <View style={styles.pageActions}>
          <TouchableOpacity
            testID="review-page-skip-all"
            onPress={() => patchPage(selectedPage as number, { skip: true })}
            style={styles.pageAction}
          >
            <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
            <Text style={styles.pageActionText}>Skip whole page</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="review-page-keep-all"
            onPress={() => patchPage(selectedPage as number, { skip: false })}
            style={styles.pageAction}
          >
            <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.success} />
            <Text style={styles.pageActionText}>Include all</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(x) => x.id}
        numColumns={2}
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
        renderItem={({ item }) => (
          <View style={[styles.tile, item.skip && styles.tileSkipped]} testID={`review-item-${item.id}`}>
            <Image source={item.thumbnail} style={styles.tileImg} contentFit="cover" />
            <View style={styles.tileMeta}>
              <TouchableOpacity
                testID={`review-code-${item.id}`}
                onPress={() => openEdit(item)}
                activeOpacity={0.7}
                style={styles.codeRow}
              >
                <Text style={[styles.code, !item.edited_number && styles.codePlaceholder]} numberOfLines={1}>
                  {item.edited_number || "Tap to add code"}
                </Text>
                <Ionicons name="pencil" size={12} color={COLORS.textMuted} />
              </TouchableOpacity>
              <Text style={styles.pageLabel}>p{item.printed_page_number}</Text>
            </View>
            <TouchableOpacity
              testID={`review-toggle-skip-${item.id}`}
              onPress={() => patchItem(item.id, { skip: !item.skip })}
              style={styles.skipBtn}
            >
              <Ionicons
                name={item.skip ? "add-circle" : "close-circle"}
                size={22}
                color={item.skip ? COLORS.success : COLORS.danger}
              />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Bottom commit bar */}
      <View style={[styles.commitBar, { paddingBottom: insets.bottom + 12 }]}>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        <PillButton
          testID="review-commit"
          label={committing ? "Importing..." : `Import ${activeCount} designs`}
          icon="checkmark-done-outline"
          onPress={commit}
          disabled={committing || activeCount === 0}
          loading={committing}
        />
      </View>

      {/* Edit modal */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={TYPO.overline}>Design code</Text>
            {editing ? (
              <Image source={editing.label_thumb} style={styles.modalLabel} contentFit="contain" />
            ) : null}
            <TextInput
              testID="review-edit-input"
              value={editValue}
              onChangeText={setEditValue}
              placeholder="e.g. 622155-Liberty"
              placeholderTextColor={COLORS.textFaint}
              style={styles.modalInput}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity testID="review-edit-cancel" onPress={() => setEditing(null)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="review-edit-save" onPress={saveEdit} style={styles.modalSave}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  chipRow: {
    paddingHorizontal: SPACING.lg, gap: 8,
    minHeight: 56, paddingTop: SPACING.sm, alignItems: "center",
  },
  chip: {
    flexShrink: 0, paddingHorizontal: 12, height: 36, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipText: { fontSize: 12, color: COLORS.text, fontWeight: "500" },
  chipTextActive: { color: "#fff" },

  pageActions: {
    flexDirection: "row", gap: 12,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
  },
  pageAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  pageActionText: { fontSize: 12, color: COLORS.text, fontWeight: "600" },

  tile: {
    width: "50%",
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, position: "relative",
  },
  tileSkipped: { opacity: 0.35 },
  tileImg: { width: "100%", aspectRatio: 1, backgroundColor: COLORS.surfaceMuted },
  tileMeta: { padding: SPACING.sm, gap: 2 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  code: { flex: 1, fontSize: 12, fontWeight: "600", color: COLORS.text, fontFamily: "Menlo" },
  codePlaceholder: { color: COLORS.textFaint, fontWeight: "400", fontStyle: "italic" },
  pageLabel: { fontSize: 10, color: COLORS.textMuted, fontFamily: "Menlo" },
  skipBtn: { position: "absolute", top: 6, right: 6 },

  commitBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    gap: 6,
  },
  msg: { fontSize: 12, color: COLORS.success, textAlign: "center" },

  modalWrap: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center", padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surface, padding: SPACING.lg, borderRadius: RADIUS.md,
    width: "100%", maxWidth: 420, gap: 10,
  },
  modalLabel: {
    width: "100%", height: 60,
    backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.border,
  },
  modalInput: {
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, color: COLORS.text, fontFamily: "Menlo",
  },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  modalCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, alignItems: "center",
  },
  modalCancelText: { color: COLORS.text, fontWeight: "600" },
  modalSave: {
    flex: 1, paddingVertical: 12, borderRadius: 999,
    backgroundColor: COLORS.primary, alignItems: "center",
  },
  modalSaveText: { color: "#fff", fontWeight: "600" },
});
