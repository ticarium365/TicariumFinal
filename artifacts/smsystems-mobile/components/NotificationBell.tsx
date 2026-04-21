import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface CountResp { unread: number }

export function NotificationBell() {
  const { apiGet, user } = useAuth();
  const colors = useColors();

  // Backend GET /notifications + PUT read-all/:id/read endpoint'leri requireAdmin —
  // staff/viewer'a bell gösterirsek tıklamada 403 + yanıltıcı boş ekran riski var.
  const isAdmin = user?.role === "admin";

  const { data } = useQuery<CountResp>({
    queryKey: ["notifications-count"],
    queryFn: () => apiGet<CountResp>("/notifications/count"),
    enabled: isAdmin,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  if (!isAdmin) return null;

  const unread = Math.max(0, Number(data?.unread ?? 0));
  const display = unread > 99 ? "99+" : String(unread);

  return (
    <Pressable
      onPress={() => router.push("/notifications" as any)}
      style={[styles.btn, { backgroundColor: colors.secondary }]}
      testID="notification-bell-mobile"
      accessibilityLabel={unread > 0 ? `${unread} okunmamış bildirim` : "Bildirimler"}
    >
      <Feather name="bell" size={18} color={colors.mutedForeground} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{display}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
});
