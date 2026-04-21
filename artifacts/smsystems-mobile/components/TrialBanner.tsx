import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { usePaymentStatus } from "@/hooks/usePaymentStatus";

export function TrialBanner() {
  const { user } = useAuth();
  const { data: status } = usePaymentStatus();

  // Belt-and-suspenders role guard: hook enabled=false super_admin için ama React Query
  // cache global; logout sonrası cache invalidate edilmiyorsa stale `status` kalabilir.
  if (!user || user.role === "super_admin") return null;
  if (!status || status.planType !== "trial" || status.trialDaysLeft === null) return null;
  if (status.isTrialExpired) return null;

  const days = status.trialDaysLeft;
  const bg = days <= 3 ? "#dc2626" : days <= 7 ? "#f97316" : "#2563eb";

  return (
    <Pressable
      onPress={() => router.push("/(tabs)" as any)}
      style={[styles.banner, { backgroundColor: bg }]}
      testID="trial-banner-mobile"
    >
      <Feather name="clock" size={14} color="#fff" />
      <Text style={styles.text}>
        Trial: {days} gün kaldı
        {days <= 7 ? "  ·  Süre dolmadan ödeme yapın" : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  text: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    flex: 1,
  },
});
