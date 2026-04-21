import { Feather } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  message: string | null;
  isRead: boolean;
  createdAt: string;
}

interface ListResp {
  notifications: NotificationRow[];
  total: number;
}

const TYPE_ICON: Record<string, string> = {
  stock_zero: "x-circle",
  low_stock: "alert-triangle",
  daily_summary: "check-circle",
  system: "info",
  budget_alert_critical: "trending-down",
  budget_alert_warning: "trending-down",
  budget_alert_info: "trending-down",
  einvoice_sent: "file-text",
  einvoice_failed: "file",
  einvoice_cancelled: "file-minus",
};

const TYPE_COLOR: Record<string, string> = {
  stock_zero: "#dc2626",
  low_stock: "#f59e0b",
  daily_summary: "#2563eb",
  system: "#6b7280",
  budget_alert_critical: "#dc2626",
  budget_alert_warning: "#f59e0b",
  budget_alert_info: "#2563eb",
  einvoice_sent: "#10b981",
  einvoice_failed: "#dc2626",
  einvoice_cancelled: "#6b7280",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} sa önce`;
  return `${Math.floor(hour / 24)} gün önce`;
}

export default function NotificationsScreen() {
  const { apiGet, apiPut } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<ListResp>({
    queryKey: ["notifications-list"],
    queryFn: () => apiGet<ListResp>("/notifications?limit=50"),
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => apiPut(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-list"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiPut("/notifications/read-all", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-list"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === "web" ? 8 : 0;
  const btmPad = Platform.OS === "web" ? 16 : insets.bottom;
  const notifications = data?.notifications ?? [];
  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Bildirimler</Text>
        {hasUnread ? (
          <Pressable
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            style={styles.markAllBtn}
            testID="mark-all-read"
          >
            <Feather name="check" size={14} color={colors.primary} />
            <Text style={[styles.markAllText, { color: colors.primary }]}>Tümü</Text>
          </Pressable>
        ) : <View style={styles.markAllBtn} />}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
      ) : isError ? (
        <View style={{ padding: 32, alignItems: "center" }}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, marginTop: 12, textAlign: "center" }}>
            Bildirimler yüklenemedi{"\n"}
            <Text style={{ fontSize: 12 }}>{error instanceof Error ? error.message : "Bilinmeyen hata"}</Text>
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: btmPad + 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={[styles.empty, { backgroundColor: colors.card }]}>
              <Feather name="bell-off" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz bildirim yok</Text>
            </View>
          }
          renderItem={({ item }) => {
            const iconName = (TYPE_ICON[item.type] ?? "bell") as any;
            const tint = TYPE_COLOR[item.type] ?? colors.primary;
            return (
              <Pressable
                onPress={() => { if (!item.isRead) markRead.mutate(item.id); }}
                style={[
                  styles.row,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  !item.isRead && { borderLeftWidth: 3, borderLeftColor: tint },
                ]}
                testID={`notif-row-${item.id}`}
              >
                <View style={[styles.iconBox, { backgroundColor: tint + "22" }]}>
                  <Feather name={iconName} size={18} color={tint} />
                </View>
                <View style={styles.body}>
                  <Text
                    style={[
                      styles.rowTitle,
                      { color: colors.foreground, fontFamily: item.isRead ? "Inter_500Medium" : "Inter_700Bold" },
                    ]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  {item.message ? (
                    <Text style={[styles.rowMsg, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {item.message}
                    </Text>
                  ) : null}
                  <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
                </View>
                {!item.isRead && <View style={[styles.dot, { backgroundColor: tint }]} />}
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 4,
  },
  backBtn: { padding: 8 },
  title: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 18 },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 40,
  },
  markAllText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  empty: {
    alignItems: "center",
    padding: 32,
    borderRadius: 12,
    gap: 12,
    marginTop: 32,
  },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  rowTitle: { fontSize: 14, marginBottom: 2 },
  rowMsg: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  rowTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});
