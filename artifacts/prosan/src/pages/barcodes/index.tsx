import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Search, X, Plus, Minus, Tag, Scan, Grid3X3, LayoutGrid, Download, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/components/company-context";

// ─────────────────────────────────────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────────────────────────────────────
interface Product {
  id: number;
  productCode: string;
  name: string;
  barcode?: string | null;
  salePrice: number;
  purchasePrice: number;
  brand?: string | null;
  category?: string | null;
  stock: number;
}

type TemplateId = "thermal" | "price" | "shelf" | "qr";

interface SelectedProduct {
  product: Product;
  qty: number;
}

const TEMPLATES: { id: TemplateId; label: string; icon: React.ElementType; desc: string; size: string }[] = [
  { id: "thermal", label: "Termal Etiketi", icon: Scan, desc: "Barkod + isim + fiyat", size: "58×30mm" },
  { id: "price", label: "Fiyat Etiketi", icon: Tag, desc: "Büyük fiyat + barkod", size: "60×40mm" },
  { id: "shelf", label: "Raf Etiketi", icon: LayoutGrid, desc: "Ürün kodu + stok", size: "90×30mm" },
  { id: "qr", label: "QR Kod Etiketi", icon: Grid3X3, desc: "QR kod + fiyat", size: "40×40mm" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SVG BARKOD KOMPONENTI (jsbarcode)
// ─────────────────────────────────────────────────────────────────────────────
function Barcode({ value, height = 40, fontSize = 9 }: { value: string; height?: number; fontSize?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        height,
        fontSize,
        margin: 2,
        textMargin: 1,
        displayValue: true,
        lineColor: "#000",
        background: "#fff",
      });
    } catch {
      // Geçersiz barkod değeri
    }
  }, [value, height, fontSize]);

  return <svg ref={svgRef} className="w-full" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ETİKET ŞABLONLARı
// ─────────────────────────────────────────────────────────────────────────────
function ThermalLabel({ product, companyName }: { product: Product; companyName: string }) {
  const code = product.barcode || product.productCode;
  return (
    <div className="label-item" style={{
      width: "58mm", minHeight: "30mm", border: "0.5px solid #bbb", padding: "2mm",
      boxSizing: "border-box", background: "#fff", pageBreakInside: "avoid",
      fontFamily: "'Arial', sans-serif", display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      <div style={{ fontSize: "7pt", fontWeight: 700, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        {companyName}
      </div>
      <div style={{ fontSize: "8pt", textAlign: "center", lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {product.name}
      </div>
      <Barcode value={code} height={28} fontSize={7} />
      <div style={{ fontSize: "10pt", fontWeight: 800, textAlign: "center" }}>
        {product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
      </div>
    </div>
  );
}

function PriceLabel({ product, companyName }: { product: Product; companyName: string }) {
  const code = product.barcode || product.productCode;
  return (
    <div className="label-item" style={{
      width: "60mm", minHeight: "40mm", border: "0.5px solid #bbb", padding: "2.5mm",
      boxSizing: "border-box", background: "#fff", pageBreakInside: "avoid",
      fontFamily: "'Arial', sans-serif",
    }}>
      <div style={{ fontSize: "7pt", color: "#555", marginBottom: "1mm" }}>{companyName}</div>
      <div style={{ fontSize: "9pt", fontWeight: 700, lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: "1mm" }}>
        {product.name}
      </div>
      {(product.brand || product.category) && (
        <div style={{ fontSize: "7pt", color: "#666", marginBottom: "2mm" }}>
          {product.brand}{product.brand && product.category ? " • " : ""}{product.category}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "2mm" }}>
        <div>
          <div style={{ fontSize: "7pt", color: "#888" }}>Satış Fiyatı</div>
          <div style={{ fontSize: "18pt", fontWeight: 900, lineHeight: 1, color: "#000" }}>
            {product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "8pt", fontWeight: 600, color: "#444" }}>TL</div>
        </div>
        <div style={{ maxWidth: "30mm" }}>
          <Barcode value={code} height={22} fontSize={6} />
        </div>
      </div>
    </div>
  );
}

function ShelfLabel({ product, companyName }: { product: Product; companyName: string }) {
  return (
    <div className="label-item" style={{
      width: "90mm", minHeight: "30mm", border: "0.5px solid #bbb", padding: "2mm",
      boxSizing: "border-box", background: "#fff", pageBreakInside: "avoid",
      fontFamily: "'Arial', sans-serif", display: "flex", alignItems: "center", gap: "3mm",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "7pt", color: "#777", marginBottom: "0.5mm" }}>{companyName}</div>
        <div style={{ fontSize: "14pt", fontWeight: 900, letterSpacing: "0.5px", color: "#111", marginBottom: "0.5mm" }}>
          {product.productCode}
        </div>
        <div style={{ fontSize: "9pt", fontWeight: 600, lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {product.name}
        </div>
      </div>
      <div style={{ borderLeft: "0.5px solid #ccc", paddingLeft: "3mm", textAlign: "center", minWidth: "18mm" }}>
        <div style={{ fontSize: "6pt", color: "#888" }}>STOK</div>
        <div style={{ fontSize: "18pt", fontWeight: 900, lineHeight: 1 }}>{product.stock}</div>
        <div style={{ fontSize: "6pt", color: "#888" }}>ADET</div>
        <div style={{ marginTop: "1.5mm", fontSize: "8pt", fontWeight: 700 }}>
          {product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
        </div>
      </div>
    </div>
  );
}

function QRLabel({ product, companyName }: { product: Product; companyName: string }) {
  const qrValue = product.barcode || product.productCode;
  return (
    <div className="label-item" style={{
      width: "40mm", minHeight: "40mm", border: "0.5px solid #bbb", padding: "2mm",
      boxSizing: "border-box", background: "#fff", pageBreakInside: "avoid",
      fontFamily: "'Arial', sans-serif", display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ fontSize: "6pt", color: "#666", marginBottom: "1mm" }}>{companyName}</div>
      <QRCodeSVG value={qrValue} size={80} level="M" style={{ margin: "1mm 0" }} />
      <div style={{ fontSize: "7pt", fontWeight: 700, textAlign: "center", lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginTop: "1mm" }}>
        {product.name}
      </div>
      <div style={{ fontSize: "9pt", fontWeight: 800, marginTop: "1mm" }}>
        {product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
      </div>
      <div style={{ fontSize: "6pt", color: "#888", fontFamily: "monospace" }}>{product.productCode}</div>
    </div>
  );
}

function LabelComponent({ template, product, companyName }: { template: TemplateId; product: Product; companyName: string }) {
  switch (template) {
    case "thermal": return <ThermalLabel product={product} companyName={companyName} />;
    case "price":   return <PriceLabel   product={product} companyName={companyName} />;
    case "shelf":   return <ShelfLabel   product={product} companyName={companyName} />;
    case "qr":      return <QRLabel      product={product} companyName={companyName} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────────────────────
export default function BarcodesPage() {
  const { company } = useCompany();
  const companyName = company?.name ?? "SMSYSTEMS";

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<number, SelectedProduct>>(new Map());
  const [template, setTemplate] = useState<TemplateId>("thermal");

  const { data: productsData, isLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["products-for-barcodes"],
    queryFn: async () => {
      const res = await fetch("/api/products?limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Ürünler yüklenemedi");
      return res.json();
    },
    staleTime: 60_000,
  });

  const products = productsData?.products ?? [];
  const filtered = products.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.productCode.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search))
  );

  const toggleProduct = useCallback((product: Product) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(product.id)) next.delete(product.id);
      else next.set(product.id, { product, qty: 1 });
      return next;
    });
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setSelected(prev => {
      const next = new Map(prev);
      const item = next.get(id);
      if (!item) return next;
      if (qty <= 0) next.delete(id);
      else next.set(id, { ...item, qty });
      return next;
    });
  }, []);

  const selectAll = () => {
    const next = new Map<number, SelectedProduct>();
    filtered.forEach(p => next.set(p.id, selected.get(p.id) ?? { product: p, qty: 1 }));
    setSelected(next);
  };

  const clearAll = () => setSelected(new Map());

  const printLabels = () => window.print();

  const totalLabels = Array.from(selected.values()).reduce((s, x) => s + x.qty, 0);
  const selectedItems = Array.from(selected.values());

  return (
    <>
      {/* YAZDIRMA STILI — sayfa içinde gizli, print'te görünür */}
      <style>{`
        @media screen {
          .print-area { display: none; }
        }
        @media print {
          body > * { display: none !important; }
          .print-area {
            display: flex !important;
            flex-wrap: wrap;
            gap: 2mm;
            padding: 5mm;
            align-items: flex-start;
          }
          .label-item {
            break-inside: avoid;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* YAZDIRILACAK ALAN — ekranda gizli */}
      <div className="print-area">
        {selectedItems.flatMap(({ product, qty }) =>
          Array.from({ length: qty }, (_, i) => (
            <LabelComponent key={`${product.id}-${i}`} template={template} product={product} companyName={companyName} />
          ))
        )}
      </div>

      {/* EKRAN UI */}
      <div className="no-print p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        {/* Başlık */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Barkod / Etiket Merkezi</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Toplu etiket yazdır, PDF çıkar, termal yazıcıya gönder</p>
          </div>
          <Button className="gap-2" disabled={totalLabels === 0} onClick={printLabels}>
            <Printer className="h-4 w-4" />
            Yazdır / PDF
            {totalLabels > 0 && <span className="ml-1 bg-primary-foreground/20 px-1.5 py-0.5 rounded text-xs">{totalLabels}</span>}
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* SOL: Ürün Seçimi */}
          <div className="xl:col-span-2 space-y-4">
            {/* Şablon seçici */}
            <div className="bg-card border rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Etiket Şablonu</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setTemplate(t.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-left ${
                      template === t.id ? "border-primary bg-primary/5" : "border-transparent bg-muted hover:bg-muted/80"
                    }`}>
                    <t.icon className={`h-5 w-5 ${template === t.id ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className={`text-xs font-semibold ${template === t.id ? "text-primary" : ""}`}>{t.label}</p>
                      <p className="text-[10px] text-muted-foreground">{t.size}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Ürün listesi */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="p-3 border-b flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Ürün adı, kod veya barkod..."
                  className="border-0 p-0 h-auto focus-visible:ring-0 text-sm"
                />
                {search && <button onClick={() => setSearch("")}><X className="h-4 w-4 text-muted-foreground" /></button>}
                <div className="ml-auto flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={selectAll}>
                    <CheckSquare className="h-3 w-3" /> Tümünü Seç
                  </Button>
                  {selected.size > 0 && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={clearAll}>
                      <Square className="h-3 w-3" /> Temizle
                    </Button>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground text-sm">Yükleniyor...</div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto divide-y">
                  {filtered.slice(0, 100).map(product => {
                    const sel = selected.get(product.id);
                    const isSelected = !!sel;
                    return (
                      <div key={product.id}
                        className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                        onClick={() => toggleProduct(product)}>
                        <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                          {isSelected && <div className="h-2 w-2 rounded-sm bg-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{product.productCode}{product.barcode ? ` • ${product.barcode}` : ""}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</p>
                          <p className="text-xs text-muted-foreground">Stok: {product.stock}</p>
                        </div>

                        {isSelected && (
                          <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setQty(product.id, (sel?.qty ?? 1) - 1)}
                              className="h-6 w-6 rounded bg-muted flex items-center justify-center hover:bg-muted/80">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold">{sel?.qty}</span>
                            <button onClick={() => setQty(product.id, (sel?.qty ?? 1) + 1)}
                              className="h-6 w-6 rounded bg-muted flex items-center justify-center hover:bg-muted/80">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="py-10 text-center text-muted-foreground text-sm">
                      {search ? "Sonuç bulunamadı" : "Ürün yok"}
                    </div>
                  )}
                  {filtered.length > 100 && (
                    <div className="py-3 text-center text-xs text-muted-foreground">
                      İlk 100 ürün gösteriliyor. Aramayı daraltın.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* SAĞ: Önizleme */}
          <div className="space-y-4">
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Önizleme</p>
                {totalLabels > 0 && (
                  <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">
                    {totalLabels} etiket
                  </span>
                )}
              </div>

              {selected.size === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm rounded-lg bg-muted/30 border-2 border-dashed">
                  Sol listeden ürün seçin
                </div>
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto">
                  {selectedItems.map(({ product, qty }) => (
                    <div key={product.id} className="border rounded-lg p-2 bg-muted/20">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{product.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{product.productCode}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setQty(product.id, qty - 1)}
                            className="h-5 w-5 rounded bg-background border flex items-center justify-center hover:bg-muted text-xs">
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold">{qty}</span>
                          <button onClick={() => setQty(product.id, qty + 1)}
                            className="h-5 w-5 rounded bg-background border flex items-center justify-center hover:bg-muted text-xs">
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                          <button onClick={() => toggleProduct(product)}
                            className="h-5 w-5 rounded bg-background border flex items-center justify-center hover:bg-destructive/10 text-destructive ml-1">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                      {/* Mini etiket önizleme */}
                      <div style={{ transform: "scale(0.55)", transformOrigin: "top left", pointerEvents: "none" }}>
                        <LabelComponent template={template} product={product} companyName={companyName} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button className="w-full gap-2" disabled={totalLabels === 0} onClick={printLabels} size="lg">
                <Printer className="h-4 w-4" />
                {totalLabels > 0 ? `${totalLabels} Etiket Yazdır / PDF` : "Etiket seçin"}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                Tarayıcının "Yazdır" ekranında "PDF olarak kaydet" seçeneğini kullanabilirsiniz.
                Termal yazıcılar için kağıt boyutunu şablona göre ayarlayın.
              </p>
            </div>

            {/* Termal yazıcı ipuçları */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Termal Yazıcı İpuçları</p>
              <ul className="space-y-0.5 list-disc list-inside text-amber-700">
                <li>Termal etiket için 58mm kağıt genişliği seçin</li>
                <li>Yazdır → Kenar boşluklarını "Yok" ayarlayın</li>
                <li>Ölçeği %100 (Gerçek boyut) olarak tutun</li>
                <li>Renk modunu "Siyah-Beyaz" seçin</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
