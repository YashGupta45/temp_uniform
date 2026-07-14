import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Catalog } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { TxtInput } from "@/src/components/TxtInput";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

async function pickImageDataUri(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true,
  });
  if (r.canceled || !r.assets[0]) return null;
  const m = await ImageManipulator.manipulateAsync(
    r.assets[0].uri,
    [{ resize: { width: 1000 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return `data:image/jpeg;base64,${m.base64}`;
}

export default function AddDesign() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ catalog_id?: string }>();
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogId, setCatalogId] = useState<string | undefined>(params.catalog_id || undefined);
  const [designNumber, setDesignNumber] = useState("");
  const [pageNumber, setPageNumber] = useState("");
  const [color, setColor] = useState("");
  const [pattern, setPattern] = useState("");
  const [tags, setTags] = useState("");
  const [remarks, setRemarks] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Catalog[]>("/catalogs").then((r) => {
      setCatalogs(r.data);
      if (!catalogId && r.data[0]) setCatalogId(r.data[0].id);
    }).catch(() => {});
  }, []);

  const submit = async () => {
    setErr(null);
    if (!catalogId) return setErr("Select a catalog");
    if (!designNumber.trim()) return setErr("Design number required");
    if (!image) return setErr("Image is required");
    setBusy(true);
    try {
      await api.post("/designs", {
        design_number: designNumber.trim(),
        catalog_id: catalogId,
        page_number: pageNumber ? Number(pageNumber) : null,
        color: color.trim(),
        pattern: pattern.trim(),
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
        remarks: remarks.trim(),
        image,
      });
      router.back();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Failed to create design");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="add-design-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Admin</Text>
          <Text style={styles.title}>New design</Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 + insets.bottom }}
          keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            testID="add-design-image"
            onPress={async () => { const uri = await pickImageDataUri(); if (uri) setImage(uri); }}
            style={styles.imgBtn}
          >
            {image ? (
              <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={30} color={COLORS.textFaint} />
                <Text style={TYPO.bodyMuted}>Tap to pick a swatch photo</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={TYPO.overline}>Catalog</Text>
          <View style={styles.catalogChips}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {catalogs.map((c) => {
                const active = catalogId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    testID={`design-catalog-${c.id}`}
                    onPress={() => setCatalogId(c.id)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <TxtInput testID="add-design-number" label="Design number *" value={designNumber} onChangeText={setDesignNumber} autoCapitalize="characters" placeholder="e.g. UNI-042" />
          <TxtInput testID="add-design-page" label="Page number" value={pageNumber} onChangeText={setPageNumber} keyboardType="number-pad" placeholder="12" />
          <TxtInput testID="add-design-color" label="Color" value={color} onChangeText={setColor} placeholder="e.g. Navy / Grey" />
          <TxtInput testID="add-design-pattern" label="Pattern" value={pattern} onChangeText={setPattern} placeholder="Stripe / Check / Floral..." />
          <TxtInput testID="add-design-tags" label="Tags (comma-separated)" value={tags} onChangeText={setTags} placeholder="school, formal, stripe" />
          <TxtInput testID="add-design-remarks" label="Remarks" value={remarks} onChangeText={setRemarks} multiline placeholder="Optional notes" style={{ minHeight: 60, textAlignVertical: "top" }} />

          {err ? <Text style={styles.err}>{err}</Text> : null}
          <PillButton
            testID="add-design-submit"
            label={busy ? "Uploading..." : "Save design"}
            onPress={submit}
            disabled={busy}
            loading={busy}
            style={{ marginTop: SPACING.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  imgBtn: {
    height: 220, borderWidth: 1, borderColor: COLORS.border,
    borderStyle: "dashed", backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center", gap: 6,
    marginBottom: SPACING.lg, borderRadius: RADIUS.sm, overflow: "hidden",
  },
  catalogChips: { marginBottom: SPACING.md },
  chip: {
    flexShrink: 0, paddingHorizontal: 14, height: 36, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center", maxWidth: 220,
  },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipText: { fontSize: 12, color: COLORS.text, fontWeight: "500" },
  chipTextActive: { color: "#fff" },
  err: { color: COLORS.danger, marginTop: SPACING.sm },
});
