import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
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

import { api } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { TxtInput } from "@/src/components/TxtInput";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

async function pickCover(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8,
  });
  if (r.canceled || !r.assets[0]) return null;
  const m = await ImageManipulator.manipulateAsync(
    r.assets[0].uri,
    [{ resize: { width: 800 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return `data:image/jpeg;base64,${m.base64}`;
}

export default function AddCatalog() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [season, setSeason] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr("Name is required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/catalogs", {
        name: name.trim(),
        brand: brand.trim(),
        manufacturer: manufacturer.trim(),
        year: year ? Number(year) : null,
        season: season.trim(),
        description: description.trim(),
        cover_image: cover,
      });
      router.back();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Failed to create catalog");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="add-catalog-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={TYPO.overline}>Admin</Text>
          <Text style={styles.title}>New catalog</Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 + insets.bottom }}
          keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="add-catalog-cover"
            onPress={async () => { const c = await pickCover(); if (c) setCover(c); }}
            style={styles.coverBtn} activeOpacity={0.85}>
            {cover ? (
              <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <>
                <Ionicons name="image-outline" size={28} color={COLORS.textFaint} />
                <Text style={TYPO.bodyMuted}>Add cover image (optional)</Text>
              </>
            )}
          </TouchableOpacity>

          <TxtInput testID="add-catalog-name" label="Name *" value={name} onChangeText={setName} placeholder="e.g. Spring / Summer 2026" />
          <TxtInput testID="add-catalog-brand" label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Emergent Textiles" />
          <TxtInput testID="add-catalog-manufacturer" label="Manufacturer" value={manufacturer} onChangeText={setManufacturer} placeholder="Mill / vendor" />
          <TxtInput testID="add-catalog-year" label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="2026" />
          <TxtInput testID="add-catalog-season" label="Season" value={season} onChangeText={setSeason} placeholder="SS, AW, ..." />
          <TxtInput testID="add-catalog-description" label="Description" value={description} onChangeText={setDescription} multiline placeholder="Short notes" style={{ minHeight: 80, textAlignVertical: "top" }} />

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <PillButton
            testID="add-catalog-submit"
            label={busy ? "Creating..." : "Create catalog"}
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
  coverBtn: {
    height: 140, borderWidth: 1, borderColor: COLORS.border,
    borderStyle: "dashed", backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center", gap: 6,
    marginBottom: SPACING.lg, borderRadius: RADIUS.sm, overflow: "hidden",
  },
  err: { color: COLORS.danger, marginTop: SPACING.sm },
});
