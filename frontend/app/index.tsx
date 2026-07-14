import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View
        testID="root-loading"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg }}
      >
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  return <Redirect href={user ? "/(app)/home" : "/(auth)/login"} />;
}
