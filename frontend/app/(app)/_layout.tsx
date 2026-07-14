import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/theme";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loading && !user) router.replace("/(auth)/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const canAdmin = user.role === "admin" || user.role === "manager";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
          ...Platform.select({ ios: { position: "absolute" }, default: {} }),
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="catalogs"
        options={{
          title: "Catalogs",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: () => (
            <View style={styles.scanBubble} testID="tab-scan-fab">
              <Ionicons name="scan" size={26} color="#fff" />
            </View>
          ),
          tabBarLabelStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Saved",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bookmark-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: canAdmin ? "Admin" : "Account",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={canAdmin ? "settings-outline" : "person-circle-outline"}
              size={size ?? 22}
              color={color}
            />
          ),
        }}
      />
      {/* Non-tab screens */}
      <Tabs.Screen name="results" options={{ href: null }} />
      <Tabs.Screen name="text-search" options={{ href: null }} />
      <Tabs.Screen name="design/[id]" options={{ href: null }} />
      <Tabs.Screen name="catalog/[id]" options={{ href: null }} />
      <Tabs.Screen name="admin/add-catalog" options={{ href: null }} />
      <Tabs.Screen name="admin/add-design" options={{ href: null }} />
      <Tabs.Screen name="admin/duplicates" options={{ href: null }} />
      <Tabs.Screen name="admin/users" options={{ href: null }} />
      <Tabs.Screen name="change-password" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg,
  },
  scanBubble: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
    marginTop: -12,
    shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
