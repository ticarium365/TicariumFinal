import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState, useMemo } from "react";
import {
  ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet,
  Text, TextInput, View, TouchableOpacity, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Customer {
  id: number;
  code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  currentBalance: number;
  creditLimit: number;
}

interface CustomerListResponse {
  customers: Customer[];
  total: number;
}

function CustomerItem({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const colors = useColors();
  const balance = Number(customer.currentBalance) || 0;
  const isDebt = balance > 0;
  return (
    <TouchableOpacity onPress={onPress} style={[styles.item, { backgroundColor: colors.card }]}>
      <View style={[styles.itemIcon, { backgroundColor: (isDebt ? "#ef4444" : "#10b981") + "22" }]}>
        <Feather name="user" size={18} color={isDebt ? "#ef4444" : "#10b981"} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{customer.name}</Text>
        <Text style={[styles.itemDetail, { color: colors.mutedForeground }]} numberOfLines={1}>
          {customer.code} {customer.phone ? `· ${customer.phone}` : ""}
        </Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={[styles.itemTotal, { color: isDebt ? "#ef4444" : "#10b981" }]}>
          ₺{Math.abs(balance).toFixed(2)}
        </Text>
        <Text style={[styles.itemUnit, { color: colors.mutedForeground }]}>
          {isDebt ? "borç" : "alacak"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CustomersScreen() {
  const { apiGet } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery<CustomerListResponse | Customer[]>({
    queryKey: ["customers"],
    queryFn: () => apiGet("/customers?limit=500"),
  });

  const all = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data) ? data : data.customers || [];
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) =>
      c.name?.toLowerCase().includes(q) ||
      c.code?.toLowerCase().includes(q) ||
      c.phone?.includes(q),
    );
  }, [all, search]);

  const totalDebt = useMemo(() => all.reduce((s, c) => s + (Number(c.currentBalance) || 0), 0), [all]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const showDetail = (c: Customer) => {
    Alert.alert(
      c.name,
      `Kod: ${c.code}\nTelefon: ${c.phone || "-"}\nE-posta: ${c.email || "-"}\nŞehir: ${c.city || "-"}\nBakiye: ₺${Number(c.currentBalance).toFixed(2)}\nKredi Limiti: ₺${Number(c.creditLimit).toFixed(2)}`,
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.summaryCard, { backgroundColor: colors.primary, paddingTop: topPad + 16 }]}>
        <Text style={[styles.summaryLabel, { color: colors.primaryForeground }]}>TOPLAM CARİ BAKİYE</Text>
        <Text style={[styles.summaryValue, { color: colors.primaryForeground }]}>
          ₺{totalDebt.toFixed(2)}
        </Text>
        <Text style={[styles.summarySub, { color: colors.primaryForeground }]}>
          {all.length} müşteri
        </Text>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Ad, kod veya telefon ara..."
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item }) => <CustomerItem customer={item} onPress={() => showDetail(item)} />}
          contentContainerStyle={{ paddingBottom: btmPad + 80, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: colors.mutedForeground }}>Müşteri bulunamadı.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  summaryCard: { padding: 16, paddingBottom: 20 },
  summaryLabel: { fontSize: 11, opacity: 0.8, letterSpacing: 1, fontFamily: "Inter_500Medium" },
  summaryValue: { fontSize: 32, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  summarySub: { fontSize: 12, opacity: 0.85, marginTop: 2 },
  searchBox: {
    flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginTop: -10,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 4, fontFamily: "Inter_400Regular" },
  item: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14,
    marginHorizontal: 12, marginTop: 8, borderRadius: 12, gap: 12,
  },
  itemIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  itemDetail: { fontSize: 12, marginTop: 2, fontFamily: "Inter_400Regular" },
  itemRight: { alignItems: "flex-end" },
  itemTotal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemUnit: { fontSize: 11, marginTop: 2, fontFamily: "Inter_400Regular" },
  center: { padding: 40, alignItems: "center", justifyContent: "center" },
});
