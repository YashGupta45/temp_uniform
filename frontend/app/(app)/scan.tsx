import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { PillButton } from "@/src/components/PillButton";
import { COLORS, RADIUS, SPACING, TYPO } from "@/src/theme";

async function toBase64DataUri(uri: string): Promise<string> {
  // Downscale + JPEG-encode to keep payload small; expo-image-manipulator
  // returns a base64 string when requested.
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!result.base64) throw new Error("Failed to encode image");
  return `data:image/jpeg;base64,${result.base64}`;
}

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  const scanY = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 260] });

  const runSearch = async (dataUri: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post("/search/similar", { image: dataUri, top_k: 20 });
      const results = res.data;
      router.push({
        pathname: "/(app)/results",
        params: { data: JSON.stringify(results), queryImage: dataUri },
      } as any);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Search failed. Try another photo.");
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
      if (!shot?.uri) return;
      const cropped = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ resize: { width: 1000 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const dataUri = `data:image/jpeg;base64,${cropped.base64}`;
      await runSearch(dataUri);
    } catch (e: any) {
      setErr(e?.message || "Camera error");
    }
  };

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr("Photo library permission was denied.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (res.canceled || !res.assets[0]) return;
    try {
      const uri = res.assets[0].uri;
      const dataUri = await toBase64DataUri(uri);
      await runSearch(dataUri);
    } catch (e: any) {
      setErr(e?.message || "Failed to process image");
    }
  };

  // Permission gating flow
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const permissionDenied = !permission.granted;

  return (
    <View style={styles.wrap}>
      {permissionDenied ? (
        <SafeAreaView edges={["top", "bottom"]} style={styles.permWrap}>
          <View style={{ alignItems: "center", gap: 16, padding: SPACING.lg }}>
            <View style={styles.permIcon}>
              <Ionicons name="camera-outline" size={28} color="#fff" />
            </View>
            <Text style={[TYPO.h2, { textAlign: "center", color: "#fff" }]}>Camera access needed</Text>
            <Text style={{ ...TYPO.bodyMuted, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>
              We use the camera only to photograph your cloth sample and match it against your catalogs.
            </Text>
            {permission.canAskAgain ? (
              <PillButton
                testID="scan-request-permission"
                label="Enable Camera"
                onPress={requestPermission}
                style={{ marginTop: 8 }}
              />
            ) : (
              <PillButton
                testID="scan-open-settings"
                label="Open Settings"
                onPress={() => Linking.openSettings()}
                style={{ marginTop: 8 }}
              />
            )}
            <TouchableOpacity testID="scan-fallback-gallery" onPress={pickGallery} style={{ marginTop: 8 }}>
              <Text style={{ color: COLORS.primary, fontWeight: "600" }}>Use a photo from gallery instead</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={flash === "on"}
        />
      )}

      {/* Overlay UI */}
      <View style={[styles.overlay, { paddingTop: insets.top }]} pointerEvents="box-none">
        {/* Top row */}
        <View style={styles.topRow}>
          <TouchableOpacity
            testID="scan-close"
            style={styles.iconBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.topBadge}>
            <View style={styles.dotRed} />
            <Text style={styles.topBadgeText}>AI SCANNER · LIVE</Text>
          </View>
          <TouchableOpacity
            testID="scan-toggle-flash"
            style={styles.iconBtn}
            onPress={() => setFlash((f) => (f === "on" ? "off" : "on"))}
          >
            <Ionicons name={flash === "on" ? "flash" : "flash-off"} size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Reticle */}
        <View style={styles.reticleWrap} pointerEvents="none">
          <View style={styles.reticle}>
            <View style={[styles.rCorner, { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0 }]} />
            <View style={[styles.rCorner, { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
            <View style={[styles.rCorner, { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0 }]} />
            <View style={[styles.rCorner, { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0 }]} />
            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanY }] }]} />
          </View>
          <Text style={styles.reticleHelp}>Fill the frame with the fabric</Text>
        </View>

        {/* Bottom controls */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 90 }]}>
          {err ? <Text style={styles.errText}>{err}</Text> : null}
          <View style={styles.bottomRow}>
            <TouchableOpacity
              testID="scan-gallery-button"
              style={styles.sideBtn}
              onPress={pickGallery}
            >
              <Ionicons name="images-outline" size={22} color="#fff" />
              <Text style={styles.sideLabel}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="scan-capture-button"
              disabled={busy || permissionDenied}
              onPress={takePhoto}
              style={styles.captureOuter}
              activeOpacity={0.8}
            >
              <View style={styles.captureInner}>
                {busy ? (
                  <ActivityIndicator color={COLORS.ink} />
                ) : (
                  <Ionicons name="scan" size={28} color={COLORS.ink} />
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.sideBtn}>
              <Ionicons name="help-circle-outline" size={22} color="rgba(255,255,255,0.4)" />
              <Text style={[styles.sideLabel, { color: "rgba(255,255,255,0.4)" }]}>Tips</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  permWrap: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  permIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  topBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  dotRed: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.danger },
  topBadgeText: { color: "#fff", fontFamily: "Menlo", fontSize: 10, letterSpacing: 2 },

  reticleWrap: { alignItems: "center", justifyContent: "center", gap: 12 },
  reticle: {
    width: 260, height: 260,
  },
  rCorner: {
    position: "absolute", width: 22, height: 22,
    borderColor: COLORS.danger, borderWidth: 3,
  },
  scanLine: {
    position: "absolute", left: 0, right: 0, height: 2,
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger, shadowOpacity: 0.8, shadowRadius: 6,
  },
  reticleHelp: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Menlo", letterSpacing: 1 },

  bottomBar: { gap: SPACING.md, paddingHorizontal: SPACING.md },
  errText: {
    color: "#fff", backgroundColor: "rgba(255,59,48,0.9)",
    padding: 10, textAlign: "center", fontSize: 13, borderRadius: RADIUS.sm,
  },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sideBtn: { alignItems: "center", gap: 6, width: 70 },
  sideLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Menlo", letterSpacing: 1 },
  captureOuter: {
    width: 84, height: 84, borderRadius: 42,
    borderWidth: 3, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  captureInner: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
});
