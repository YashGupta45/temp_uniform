import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Catalog } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

type JobStatus = {
  id: string;
  status: "queued" | "rendering" | "detecting" | "ocr" | "ready" | "failed" | "committed";
  progress: number;
  total_pages?: number;
  item_count?: number;
  error?: string;
  ocr_warning?: string;
  pages?: { page_index: number; detected: number; skip_page: boolean }[];
};

export default function PdfImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogId, setCatalogId] = useState<string | undefined>();
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [useAiOcr, setUseAiOcr] = useState(true);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get<Catalog[]>("/catalogs").then((r) => {
      setCatalogs(r.data);
      if (r.data[0]) setCatalogId(r.data[0].id);
    }).catch(() => {});
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets[0]) return;
    setFile(res.assets[0]);
    setErr(null);
  };

  const start = async () => {
    setErr(null);
    if (!catalogId) return setErr("Select a target catalog");
    if (!file) return setErr("Pick a PDF file first");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("catalog_id", catalogId);
      form.append("use_ai_ocr", String(useAiOcr));
      // @ts-ignore -- RN FormData file shape
      form.append("pdf", {
        uri: file.uri,
        name: file.name || "catalog.pdf",
        type: "application/pdf",
      });
      const res = await api.post<{ job_id: string }>("/admin/pdf-import/start", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000,
      });
      startPolling(res.data.job_id);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Failed to start import");
    } finally {
      setBusy(false);
    }
  };

  const startPolling = (jobId: string) => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    const fetchOnce = async () => {
      try {
        const r = await api.get<JobStatus>(`/admin/pdf-import/${jobId}`);
        setJob(r.data);
        if (r.data.status === "ready" || r.data.status === "failed" || r.data.status === "committed") {
          if (pollTimer.current) clearInterval(pollTimer.current);
        }
      } catch {
        /* keep polling */
      }
    };
    fetchOnce();
    pollTimer.current = setInterval(fetchOnce, 2000);
  };

  const openReview = () => {
    if (!job) return;
    router.push({ pathname: "/(app)/admin/pdf-review", params: { job_id: job.id } } as any);
  };

  const progressPct = Math.round((job?.progress ?? 0) * 100);
  const statusLabel = job
    ? job.status === "queued" || job.status === "rendering"
      ? "Rendering pages"
      : job.status === "detecting"
      ? `Detecting swatches · ${progressPct}%`
      : job.status === "ocr"
      ? `AI reading design codes · ${progressPct}%`
      : job.status === "ready"
      ? "Ready to review"
      : job.status === "failed"
      ? "Failed"
      : job.status === "committed"
      ? "Committed"
      : job.status
    : "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="pdf-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Admin · Bulk import</Text>
          <Text style={styles.title}>Upload PDF catalog</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.info}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.textMuted} />
          <Text style={styles.infoText}>
            Upload a multi-page PDF where every page contains a grid of fabric swatches (each with its
            design code printed above it). We&apos;ll auto-detect every swatch, let AI read each code,
            then hand you a review screen before we save anything to the catalog.
          </Text>
        </View>

        {/* Catalog picker */}
        <Text style={TYPO.overline}>Target catalog</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {catalogs.map((c) => {
            const active = catalogId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                testID={`pdf-catalog-${c.id}`}
                onPress={() => setCatalogId(c.id)}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          testID="pdf-new-catalog"
          onPress={() => router.push("/(app)/admin/add-catalog")}
          style={styles.newCatalog}
        >
          <Ionicons name="add" size={14} color={COLORS.primary} />
          <Text style={styles.newCatalogText}>Create a new catalog first</Text>
        </TouchableOpacity>

        {/* File pick */}
        <Text style={[TYPO.overline, { marginTop: SPACING.md }]}>PDF file</Text>
        <TouchableOpacity testID="pdf-pick" onPress={pickPdf} style={styles.fileBtn} activeOpacity={0.85}>
          <Ionicons name="document-outline" size={28} color={file ? COLORS.primary : COLORS.textFaint} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fileTitle} numberOfLines={1}>
              {file ? file.name : "Tap to choose a PDF"}
            </Text>
            <Text style={styles.fileSub}>
              {file ? `${Math.round((file.size || 0) / 1024)} KB · PDF` : "Max 60 MB"}
            </Text>
          </View>
          {file ? <Ionicons name="checkmark-circle" size={22} color={COLORS.success} /> : null}
        </TouchableOpacity>

        {/* AI OCR toggle */}
        <View style={styles.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...TYPO.body, fontWeight: "600" }}>AI reads design codes</Text>
            <Text style={{ ...TYPO.bodyMuted, fontSize: 12 }}>
              GPT-4o-mini reads the code printed above each swatch. Uses Universal Key credits.
            </Text>
          </View>
          <Switch
            testID="pdf-ai-toggle"
            value={useAiOcr}
            onValueChange={setUseAiOcr}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
          />
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <PillButton
          testID="pdf-start"
          label={busy ? "Starting..." : "Start import"}
          icon="cloud-upload-outline"
          onPress={start}
          disabled={busy || !file || !catalogId}
          loading={busy}
          style={{ marginTop: SPACING.sm }}
        />

        {/* Job progress */}
        {job ? (
          <View style={styles.jobCard}>
            <View style={styles.jobHeader}>
              <View style={styles.dot} />
              <Text style={styles.jobStatus}>{statusLabel}</Text>
              {(job.status !== "ready" && job.status !== "failed" && job.status !== "committed") ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 8 }} />
              ) : null}
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFg, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.jobDetail}>
              {job.total_pages ? `${job.total_pages} PDF pages` : "…"} ·{" "}
              {job.item_count ? `${job.item_count} swatches detected` : "detecting swatches"}
            </Text>
            {job.ocr_warning ? (
              <View style={styles.warning}>
                <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
                <Text style={styles.warningText}>{job.ocr_warning}</Text>
              </View>
            ) : null}
            {job.error ? <Text style={styles.err}>{job.error}</Text> : null}
            {job.status === "ready" ? (
              <PillButton
                testID="pdf-open-review"
                label="Review detected swatches"
                icon="checkmark-done-outline"
                onPress={openReview}
                style={{ marginTop: SPACING.sm }}
              />
            ) : null}
          </View>
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

  info: {
    flexDirection: "row", gap: 8,
    padding: SPACING.md, backgroundColor: COLORS.primaryDim, borderRadius: RADIUS.sm,
  },
  infoText: { flex: 1, fontSize: 12, color: COLORS.text, lineHeight: 18 },

  chipRow: { gap: 8, paddingVertical: 4 },
  chip: {
    flexShrink: 0, paddingHorizontal: 14, height: 36, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center", maxWidth: 240,
  },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipText: { fontSize: 12, color: COLORS.text, fontWeight: "500" },
  chipTextActive: { color: "#fff" },

  newCatalog: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  newCatalogText: { color: COLORS.primary, fontSize: 12, fontWeight: "600" },

  fileBtn: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md, borderWidth: 1, borderStyle: "dashed",
    borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
  },
  fileTitle: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  fileSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  toggle: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },

  err: { color: COLORS.danger, fontSize: 13 },

  jobCard: {
    marginTop: SPACING.md,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, gap: 8,
  },
  jobHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  jobStatus: { fontSize: 13, fontWeight: "600", color: COLORS.text, flex: 1 },
  progressBg: { height: 6, backgroundColor: COLORS.surfaceMuted, borderRadius: 3, overflow: "hidden" },
  progressFg: { height: 6, backgroundColor: COLORS.primary },
  jobDetail: { fontSize: 12, color: COLORS.textMuted, fontFamily: "Menlo" },
  warning: {
    flexDirection: "row", gap: 8, padding: 10, backgroundColor: "#FEF3C7",
    borderRadius: RADIUS.sm, alignItems: "flex-start",
  },
  warningText: { flex: 1, fontSize: 12, color: "#78350F" },
});
