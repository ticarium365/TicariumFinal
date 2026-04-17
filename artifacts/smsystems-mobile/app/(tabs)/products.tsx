import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Product {
  id: number;
  name: string;
  productCode: string;
  barcode?: string;
  stock: number;
  minStock: number;
  salePrice: number;
  purchasePrice: number;
  category?: string;
  brand?: string;
}

interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
}

function ProductItem({ product, onPress }: { product: Product; onPress: () => void }) {
  const colors = useColors();
  const isLow = product.stock <= product.minStock;

  return (
    <Pressable
      style={({ pressed }) => [styles.item, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
      onPress={onPress}
    >
      <View style={styles.itemLeft}>
        <View style={[styles.itemIcon, { backgroundColor: isLow ? colors.destructive + "22" : colors.primary + "22" }]}>
          <Feather name="box" size={18} color={isLow ? colors.destructive : colors.primary} />
        </View>
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[styles.itemCode, { color: colors.mutedForeground }]} numberOfLines={1}>
          {product.productCode}{product.category ? ` · ${product.category}` : ""}
        </Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={[styles.itemPrice, { color: colors.foreground }]}>
          ₺{product.salePrice.toFixed(2)}
        </Text>
        <Text style={[styles.itemStock, { color: isLow ? colors.destructive : colors.mutedForeground }]}>
          {product.stock} adet
        </Text>
      </View>
    </Pressable>
  );
}

export default function ProductsScreen() {
  const { apiGet } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, refetch } = useQuery<ProductListResponse>({
    queryKey: ["products", debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      return apiGet(`/products?${params}`);
    },
  });

  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(text), 400);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Ürün ara..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={handleSearch}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {search.length > 0 && Platform.OS !== "ios" ? (
            <Pressable onPress={() => { setSearch(""); setDebouncedSearch(""); }}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {data ? `${data.total} ürün` : ""}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={data?.products ?? []}
          keyExtractor={p => String(p.id)}
          renderItem={({ item }) => (
            <ProductItem
              product={item}
              onPress={() => { Haptics.selectionAsync(); }}
            />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: btmPad + 16, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          scrollEnabled={true}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { backgroundColor: colors.card }]}>
              <Feather name="package" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? "Ürün bulunamadı" : "Henüz ürün yok"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  count: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, marginLeft: 4 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  itemLeft: {},
  itemIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  itemCode: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  itemRight: { alignItems: "flex-end" },
  itemPrice: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemStock: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyBox: { borderRadius: 16, padding: 40, alignItems: "center", gap: 12, marginTop: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
