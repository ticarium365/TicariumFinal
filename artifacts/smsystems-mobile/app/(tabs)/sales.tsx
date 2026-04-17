import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Sale {
  id: number;
  productId: number;
  productName: string;
  productCode?: string;
  quantity: number;
  salePrice: number;
  totalPrice: number;
  createdAt: string;
}

interface SaleListResponse {
  sales: Sale[];
  total: number;
}

function SaleItem({ sale }: { sale: Sale }) {
  const colors = useColors();
  const date = new Date(sale.createdAt);
  const dateStr = date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  const timeStr = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={[styles.item, { backgroundColor: colors.card }]}>
      <View style={[styles.itemIcon, { backgroundColor: colors.accent + "22" }]}>
        <Feather name="shopping-cart" size={18} color={colors.accent} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{sale.productName}</Text>
        <Text style={[styles.itemDetail, { color: colors.mutedForeground }]}>
          {sale.quantity} adet · {dateStr} {timeStr}
        </Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={[styles.itemTotal, { color: colors.foreground }]}>
          ₺{Number(sale.totalPrice).toFixed(2)}
        </Text>
        <Text style={[styles.itemUnit, { color: colors.mutedForeground }]}>
          ₺{Number(sale.salePrice).toFixed(2)}/ad
        </Text>
      </View>
    </View>
  );
}

export default function SalesScreen() {
  const { apiGet } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery<SaleListResponse>({
    queryKey: ["sales-history"],
    queryFn: () => apiGet("/sales?limit=100"),
  });

  const { data: todaySales } = useQuery({
    queryKey: ["today-sales"],
    queryFn: () => apiGet<{ grossRevenue: number; totalSales: number }>("/sales/today"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.summaryCard, { backgroundColor: colors.primary, paddingTop: topPad + 16 }]}>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Bugünkü Ciro</Text>
            <Text style={styles.summaryAmount}>
              ₺{Number(todaySales?.grossRevenue ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.summaryRight}>
            <Feather name="activity" size={28} color="rgba(255,255,255,0.5)" />
            <Text style={styles.summaryCount}>{todaySales?.totalSales ?? 0} satış</Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={data?.sales ?? []}
          keyExtractor={s => String(s.id)}
          renderItem={({ item }) => <SaleItem sale={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: btmPad + 16, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          scrollEnabled={true}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            data && data.total > 0 ? (
              <Text style={[styles.totalCount, { color: colors.mutedForeground }]}>
                {data.total} satış kaydı
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={[styles.emptyBox, { backgroundColor: colors.card }]}>
              <Feather name="shopping-bag" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz satış yok</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  summaryCard: { paddingHorizontal: 20, paddingBottom: 20 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  summaryAmount: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  summaryRight: { alignItems: "flex-end", gap: 4 },
  summaryCount: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_500Medium" },
  totalCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 },
  itemIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  itemDetail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  itemRight: { alignItems: "flex-end" },
  itemTotal: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemUnit: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyBox: { borderRadius: 16, padding: 40, alignItems: "center", gap: 12, marginTop: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
