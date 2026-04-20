import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { TrialBanner } from "@/components/TrialBanner";
import { BrandMark } from "@/components/BrandMark";

interface DashboardStats {
  totalProducts: number;
  todaySalesCount: number;
  criticalStockCount: number;
  outOfStock: number;
  todayGrossRevenue: number;
  todayProfit: number;
}

interface TodaySales {
  totalSales: number;
  totalQuantity: number;
  grossRevenue: number;
  netRevenue: number;
  totalProfit: number;
}

interface Product {
  id: number;
  name: string;
  productCode: string;
  barcode?: string;
  stock: number;
  minStock: number;
  salePrice: number;
  category?: string;
}

function StatCard({ icon, label, value, color, bg }: {
  icon: string;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card }]}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function CriticalItem({ product }: { product: Product }) {
  const colors = useColors();
  const pct = product.minStock > 0 ? Math.round((product.stock / product.minStock) * 100) : 100;
  return (
    <View style={[styles.critRow, { backgroundColor: colors.card }]}>
      <View style={styles.critInfo}>
        <Text style={[styles.critName, { color: colors.foreground }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[styles.critCode, { color: colors.mutedForeground }]}>{product.productCode}</Text>
      </View>
      <View style={styles.critRight}>
        <Text style={[styles.critStock, { color: pct < 50 ? colors.destructive : colors.warning }]}>
          {product.stock} adet
        </Text>
        <Text style={[styles.critMin, { color: colors.mutedForeground }]}>min: {product.minStock}</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const { apiGet, user, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiGet<DashboardStats>("/dashboard/stats"),
  });

  const { data: critical, isLoading: critLoading, refetch: refetchCritical } = useQuery({
    queryKey: ["critical-stock"],
    queryFn: () => apiGet<Product[]>("/dashboard/critical-stock"),
  });

  const { data: todaySales } = useQuery({
    queryKey: ["today-sales"],
    queryFn: () => apiGet<TodaySales>("/sales/today"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchCritical()]);
    setRefreshing(false);
  }, [refetchStats, refetchCritical]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: btmPad + 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <BrandMark size={36} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Hoş geldiniz</Text>
            <Text style={[styles.username, { color: colors.foreground }]} numberOfLines={1}>{user?.fullName ?? user?.username}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); logout(); }}
          style={[styles.logoutBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="log-out" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <TrialBanner />

      <View style={styles.todayCard}>
        <View style={[styles.todayInner, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={styles.todayLabel}>Bugünkü Ciro</Text>
            <Text style={styles.todayAmount}>
              ₺{(todaySales?.grossRevenue ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.todayRight}>
            <Feather name="trending-up" size={32} color="rgba(255,255,255,0.5)" />
            <Text style={styles.todayCount}>{todaySales?.totalSales ?? 0} satış</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsGrid}>
        {statsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
        ) : (
          <>
            <StatCard icon="package" label="Toplam Ürün" value={String(stats?.totalProducts ?? 0)} color={colors.primary} bg={colors.primary + "22"} />
            <StatCard icon="alert-triangle" label="Kritik Stok" value={String(stats?.criticalStockCount ?? 0)} color={colors.destructive} bg={colors.destructive + "22"} />
            <StatCard icon="shopping-bag" label="Bugün Satış" value={String(stats?.todaySalesCount ?? 0)} color={colors.accent} bg={colors.accent + "22"} />
            <StatCard
              icon="x-circle"
              label="Stok Yok"
              value={String(stats?.outOfStock ?? 0)}
              color={colors.warning}
              bg={colors.warning + "22"}
            />
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Kritik Stok Uyarıları</Text>
        {critLoading ? (
          <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
        ) : critical && critical.length > 0 ? (
          critical.slice(0, 8).map(p => <CriticalItem key={p.id} product={p} />)
        ) : (
          <View style={[styles.emptyBox, { backgroundColor: colors.card }]}>
            <Feather name="check-circle" size={24} color={colors.success} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Kritik stok yok</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 20 },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  username: { fontSize: 20, fontFamily: "Inter_700Bold" },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  todayCard: { paddingHorizontal: 20, marginBottom: 20 },
  todayInner: { borderRadius: 16, padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  todayLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  todayAmount: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  todayRight: { alignItems: "flex-end", gap: 4 },
  todayCount: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_500Medium" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8, marginBottom: 24 },
  statCard: { flex: 1, minWidth: "44%", borderRadius: 14, padding: 14, gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: { paddingHorizontal: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  critRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 12, marginBottom: 8 },
  critInfo: { flex: 1, marginRight: 12 },
  critName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  critCode: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  critRight: { alignItems: "flex-end" },
  critStock: { fontSize: 15, fontFamily: "Inter_700Bold" },
  critMin: { fontSize: 11, fontFamily: "Inter_400Regular" },
  emptyBox: { borderRadius: 12, padding: 24, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
