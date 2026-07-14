import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "@/src/context/AuthContext";

export default function AuthLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/(app)/home");
  }, [user, loading, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
