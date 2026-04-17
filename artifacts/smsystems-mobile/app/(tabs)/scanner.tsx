import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import React, { useState, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Product {
  id: number;
  name: string;
  productCode: string;
  barcode?: string;
  stock: number;
  minStock: number;
  purchasePrice: number;
  salePrice: number;
  category?: string;
  brand?: string;
}

function ProductResult({ product, onUpdateStock, updating }: {
  product: Product;
  onUpdateStock: (delta: number) => void;
  updating: boolean;
}) {
  const colors = useColors();
  const isLow = product.stock <= product.minStock;

  return (
    <View style={[styles.resultCard, { backgroundColor: colors.card }]}>
      <View style={styles.resultHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.resultName, { color: colors.foreground }]}>{product.name}</Text>
          <Text style={[styles.resultCode, { color: colors.mutedForeground }]}>{product.productCode}</Text>
          {product.brand && (
            <Text style={[styles.resultBrand, { color: colors.mutedForeground }]}>{product.brand}</Text>
          )}
        </View>
        <View style={[styles.stockBadge, { backgroundColor: isLow ? colors.destructive + "22" : colors.success + "22" }]}>
          <Text style={[styles.stockBadgeText, { color: isLow ? colors.destructive : colors.success }]}>
            {product.stock} adet
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.priceRow}>
        <View>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Alış</Text>
          <Text style={[styles.priceValue, { color: colors.foreground }]}>₺{product.purchasePrice.toFixed(2)}</Text>
        </View>
        <View>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Satış</Text>
          <Text style={[styles.priceValue, { color: colors.primary }]}>₺{product.salePrice.toFixed(2)}</Text>
        </View>
        <View>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Min. Stok</Text>
          <Text style={[styles.priceValue, { color: colors.foreground }]}>{product.minStock}</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Text style={[styles.updateLabel, { color: colors.mutedForeground }]}>Stok Güncelle</Text>
      <View style={styles.stockControls}>
        <Pressable
          style={({ pressed }) => [styles.stockBtn, { backgroundColor: colors.destructive + "22", opacity: pressed ? 0.7 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUpdateStock(-1); }}
          disabled={updating}
        >
          <Feather name="minus" size={20} color={colors.destructive} />
        </Pressable>

        {updating ? (
          <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
        ) : (
          <Text style={[styles.stockCurrent, { color: colors.foreground }]}>{product.stock}</Text>
        )}

        <Pressable
          style={({ pressed }) => [styles.stockBtn, { backgroundColor: colors.success + "22", opacity: pressed ? 0.7 : 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUpdateStock(1); }}
          disabled={updating}
        >
          <Feather name="plus" size={20} color={colors.success} />
        </Pressable>
      </View>
    </View>
  );
}

export default function ScannerScreen() {
  const { apiGet, apiPatch } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [manualBarcode, setManualBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastScanned = useRef<string>("");
  const cooldown = useRef(false);

  const lookupBarcode = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;
    setLoading(true);
    setError(null);
    setProduct(null);
    try {
      const found = await apiGet<Product>(`/products/barcode/${encodeURIComponent(barcode.trim())}`);
      setProduct(found);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError(`"${barcode}" barkodu bulunamadı`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [apiGet]);

  const handleBarcodeScanned = useCallback(({ data }: { data: string }) => {
    if (cooldown.current || data === lastScanned.current) return;
    cooldown.current = true;
    lastScanned.current = data;
    setScanning(false);
    lookupBarcode(data);
    setTimeout(() => { cooldown.current = false; }, 2000);
  }, [lookupBarcode]);

  const updateStock = useCallback(async (delta: number) => {
    if (!product) return;
    setUpdating(true);
    try {
      const updated = await apiPatch<Product>(`/products/${product.id}/quick-update`, {
        stock: product.stock + delta,
      });
      setProduct(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUpdating(false);
    }
  }, [product, apiPatch]);

  const reset = () => {
    setProduct(null);
    setError(null);
    setManualBarcode("");
    lastScanned.current = "";
    setScanning(true);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const btmPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (!permission) return <View style={[styles.root, { backgroundColor: colors.background }]} />;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {Platform.OS !== "web" && permission.granted ? (
        <View style={styles.cameraWrap}>
          {scanning && !product && !loading && !error ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "code39", "qr"] }}
            >
              <View style={[styles.overlay, { paddingTop: topPad }]}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>Barkodu çerçeve içine getirin</Text>
              </View>
            </CameraView>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={styles.bottomSheet}
        contentContainerStyle={{ paddingTop: Platform.OS !== "web" && permission.granted && scanning ? 0 : topPad + 16, paddingBottom: btmPad + 16, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {(!permission.granted || Platform.OS === "web") && (
          <View style={{ marginBottom: 16 }}>
            {!permission.granted && Platform.OS !== "web" ? (
              <Pressable
                style={[styles.permBtn, { backgroundColor: colors.primary }]}
                onPress={requestPermission}
              >
                <Feather name="camera" size={18} color="#fff" />
                <Text style={styles.permBtnText}>Kamera İzni Ver</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={[styles.manualRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="hash" size={18} color={colors.mutedForeground} style={styles.manualIcon} />
          <TextInput
            style={[styles.manualInput, { color: colors.foreground }]}
            placeholder="Barkod girin..."
            placeholderTextColor={colors.mutedForeground}
            value={manualBarcode}
            onChangeText={setManualBarcode}
            keyboardType="default"
            returnKeyType="search"
            onSubmitEditing={() => { setScanning(false); lookupBarcode(manualBarcode); }}
          />
          <Pressable
            style={({ pressed }) => [styles.searchBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => { setScanning(false); lookupBarcode(manualBarcode); }}
          >
            <Feather name="search" size={16} color="#fff" />
          </Pressable>
        </View>

        {loading ? (
          <View style={[styles.stateBox, { backgroundColor: colors.card }]}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Aranıyor...</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateBox, { backgroundColor: colors.card }]}>
            <Feather name="alert-circle" size={32} color={colors.destructive} />
            <Text style={[styles.stateText, { color: colors.destructive }]}>{error}</Text>
            <Pressable style={[styles.retryBtn, { backgroundColor: colors.secondary }]} onPress={reset}>
              <Text style={[styles.retryText, { color: colors.foreground }]}>Tekrar Tara</Text>
            </Pressable>
          </View>
        ) : product ? (
          <>
            <View style={styles.resultActions}>
              <Pressable style={[styles.newScanBtn, { backgroundColor: colors.secondary }]} onPress={reset}>
                <Feather name="camera" size={16} color={colors.foreground} />
                <Text style={[styles.newScanText, { color: colors.foreground }]}>Yeni Tarama</Text>
              </Pressable>
            </View>
            <ProductResult product={product} onUpdateStock={updateStock} updating={updating} />
          </>
        ) : !scanning ? (
          <View style={[styles.stateBox, { backgroundColor: colors.card }]}>
            <Feather name="camera" size={32} color={colors.mutedForeground} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Taramaya hazır</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cameraWrap: { height: 300, position: "relative" },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  scanFrame: { width: 220, height: 140, borderWidth: 2, borderColor: "#00C9A7", borderRadius: 8, marginBottom: 16 },
  scanHint: { color: "#fff", fontSize: 13, fontFamily: "Inter_400Regular" },
  bottomSheet: { flex: 1 },
  manualRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingLeft: 14, marginBottom: 16, height: 52 },
  manualIcon: { marginRight: 10 },
  manualInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  searchBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: "center", alignItems: "center", margin: 4 },
  stateBox: { borderRadius: 16, padding: 32, alignItems: "center", gap: 12 },
  stateText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  retryText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  permBtn: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", height: 48, borderRadius: 12 },
  permBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  resultActions: { flexDirection: "row", marginBottom: 12 },
  newScanBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  newScanText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  resultCard: { borderRadius: 16, padding: 16, gap: 12 },
  resultHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  resultName: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  resultCode: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  resultBrand: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  stockBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: "flex-start" },
  stockBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1 },
  priceRow: { flexDirection: "row", justifyContent: "space-around" },
  priceLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2, textAlign: "center" },
  priceValue: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  updateLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  stockControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  stockBtn: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  stockCurrent: { flex: 1, textAlign: "center", fontSize: 28, fontFamily: "Inter_700Bold" },
});
