import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Printer, Search, X, Plus, Minus, Tag, Scan, Grid3X3, LayoutGrid,
  CheckSquare, Square, FileText, ScrollText, LayoutDashboard,
} from "lucide-react";
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
type PrintMode = "roll" | "a4";

interface SelectedProduct {
  product: Product;
  qty: number;
}

// A4: 210mm genişlik, 8mm kenar boşluğu → kullanılabilir: 194mm
// Sütun genişlikleri ve tahmini sayfa başına etiket sayısı
const A4_PRESETS: { cols: number; label: string; cellW: string; approxPerPage: Record<TemplateId, number> }[] = [
  {
    cols: 2,
    label: "2 Sütun",
    cellW: "97mm",
    approxPerPage: { thermal: 9, price: 7, shelf: 7, qr: 7 },
  },
  {
    cols: 3,
    label: "3 Sütun",
    cellW: "63mm",
    approxPerPage: { thermal: 12, price: 10, shelf: 10, qr: 9 },
  },
  {
    cols: 4,
    label: "4 Sütun",
    cellW: "46mm",
    approxPerPage: { thermal: 18, price: 15, shelf: 15, qr: 14 },
  },
  {
    cols: 5,
    label: "5 Sütun",
    cellW: "36mm",
    approxPerPage: { thermal: 24, price: 20, shelf: 20, qr: 18 },
  },
];

const TEMPLATES: { id: TemplateId; label: string; icon: React.ElementType; desc: string; size: string }[] = [
  { id: "thermal", label: "Termal Etiketi", icon: Scan, desc: "Barkod + isim + fiyat", size: "58×30mm" },
  { id: "price", label: "Fiyat Etiketi", icon: Tag, desc: "Büyük fiyat + barkod", size: "60×40mm" },
  { id: "shelf", label: "Raf Etiketi", icon: LayoutGrid, desc: "Ürün kodu + stok", size: "90×30mm" },
  { id: "qr", label: "QR Kod Etiketi", icon: Grid3X3, desc: "QR kod + fiyat", size: "40×40mm" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SVG BARKOD
// ─────────────────────────────────────────────────────────────────────────────
function Barcode({ value, height = 40, fontSize = 9 }: { value: string; height?: number; fontSize?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current) return;
    let cancelled = false;
    (async () => {
      const { default: JsBarcode } = await import("jsbarcode");
      if (cancelled || !svgRef.current) return;
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128", height, fontSize, margin: 2, textMargin: 1,
          displayValue: true, lineColor: "#000", background: "#fff",
        });
      } catch { /* geçersiz */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, height, fontSize]);
  return <svg ref={svgRef} style={{ width: "100%" }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ETİKET ŞABLONLARı — a4Mode=true olduğunda genişlik %100, yükseklik auto
// ─────────────────────────────────────────────────────────────────────────────
function ThermalLabel({ product, companyName, a4Mode }: { product: Product; companyName: string; a4Mode?: boolean }) {
  const code = product.barcode || product.productCode;
  return (
    <div className="label-item" style={{
      width: a4Mode ? "100%" : "58mm",
      minHeight: a4Mode ? undefined : "30mm",
      border: "0.5px solid #bbb", padding: "2mm", boxSizing: "border-box",
      background: "#fff", pageBreakInside: "avoid", breakInside: "avoid",
      fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column",
      justifyContent: "space-between", gap: "1mm",
    }}>
      <div style={{ fontSize: "7pt", fontWeight: 700, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        {companyName}
      </div>
      <div style={{ fontSize: a4Mode ? "7pt" : "8pt", textAlign: "center", lineHeight: 1.2, overflow: "hidden" }}>
        {product.name}
      </div>
      <Barcode value={code} height={a4Mode ? 22 : 28} fontSize={6} />
      <div style={{ fontSize: a4Mode ? "9pt" : "10pt", fontWeight: 800, textAlign: "center" }}>
        {product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
      </div>
    </div>
  );
}

function PriceLabel({ product, companyName, a4Mode }: { product: Product; companyName: string; a4Mode?: boolean }) {
  const code = product.barcode || product.productCode;
  return (
    <div className="label-item" style={{
      width: a4Mode ? "100%" : "60mm",
      minHeight: a4Mode ? undefined : "40mm",
      border: "0.5px solid #bbb", padding: "2.5mm", boxSizing: "border-box",
      background: "#fff", pageBreakInside: "avoid", breakInside: "avoid",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{ fontSize: "7pt", color: "#555", marginBottom: "0.5mm" }}>{companyName}</div>
      <div style={{ fontSize: a4Mode ? "8pt" : "9pt", fontWeight: 700, lineHeight: 1.2, marginBottom: "0.5mm" }}>
        {product.name}
      </div>
      {(product.brand || product.category) && (
        <div style={{ fontSize: "6pt", color: "#666", marginBottom: "1mm" }}>
          {product.brand}{product.brand && product.category ? " • " : ""}{product.category}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "1mm" }}>
        <div>
          <div style={{ fontSize: "6pt", color: "#888" }}>Satış Fiyatı</div>
          <div style={{ fontSize: a4Mode ? "14pt" : "18pt", fontWeight: 900, lineHeight: 1 }}>
            {product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "8pt", fontWeight: 600, color: "#444" }}>TL</div>
        </div>
        <div style={{ flex: 1, maxWidth: a4Mode ? "50%" : "30mm" }}>
          <Barcode value={code} height={a4Mode ? 18 : 22} fontSize={5} />
        </div>
      </div>
    </div>
  );
}

function ShelfLabel({ product, companyName, a4Mode }: { product: Product; companyName: string; a4Mode?: boolean }) {
  return (
    <div className="label-item" style={{
      width: a4Mode ? "100%" : "90mm",
      minHeight: a4Mode ? undefined : "30mm",
      border: "0.5px solid #bbb", padding: "2mm", boxSizing: "border-box",
      background: "#fff", pageBreakInside: "avoid", breakInside: "avoid",
      fontFamily: "Arial, sans-serif", display: "flex", alignItems: "center", gap: "2mm",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "6pt", color: "#777", marginBottom: "0.5mm" }}>{companyName}</div>
        <div style={{ fontSize: a4Mode ? "11pt" : "14pt", fontWeight: 900, letterSpacing: "0.5px", color: "#111", marginBottom: "0.5mm" }}>
          {product.productCode}
        </div>
        <div style={{ fontSize: a4Mode ? "7pt" : "9pt", fontWeight: 600, lineHeight: 1.2 }}>
          {product.name}
        </div>
      </div>
      <div style={{ borderLeft: "0.5px solid #ccc", paddingLeft: "2mm", textAlign: "center", minWidth: "14mm" }}>
        <div style={{ fontSize: "5pt", color: "#888" }}>STOK</div>
        <div style={{ fontSize: a4Mode ? "14pt" : "18pt", fontWeight: 900, lineHeight: 1 }}>{product.stock}</div>
        <div style={{ fontSize: "5pt", color: "#888", marginBottom: "1mm" }}>ADET</div>
        <div style={{ fontSize: "7pt", fontWeight: 700 }}>
          {product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
        </div>
      </div>
    </div>
  );
}

function QRLabel({ product, companyName, a4Mode }: { product: Product; companyName: string; a4Mode?: boolean }) {
  const qrValue = product.barcode || product.productCode;
  const qrSize = a4Mode ? 64 : 80;
  return (
    <div className="label-item" style={{
      width: a4Mode ? "100%" : "40mm",
      minHeight: a4Mode ? undefined : "40mm",
      border: "0.5px solid #bbb", padding: "2mm", boxSizing: "border-box",
      background: "#fff", pageBreakInside: "avoid", breakInside: "avoid",
      fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ fontSize: "6pt", color: "#666", marginBottom: "0.5mm" }}>{companyName}</div>
      <QRCodeSVG value={qrValue} size={qrSize} level="M" style={{ margin: "1mm 0" }} />
      <div style={{ fontSize: "7pt", fontWeight: 700, textAlign: "center", lineHeight: 1.2, marginTop: "0.5mm" }}>
        {product.name}
      </div>
      <div style={{ fontSize: a4Mode ? "8pt" : "9pt", fontWeight: 800, marginTop: "0.5mm" }}>
        {product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺
      </div>
      <div style={{ fontSize: "6pt", color: "#888", fontFamily: "monospace" }}>{product.productCode}</div>
    </div>
  );
}

function LabelComponent({ template, product, companyName, a4Mode }: {
  template: TemplateId; product: Product; companyName: string; a4Mode?: boolean;
}) {
  switch (template) {
    case "thermal": return <ThermalLabel product={product} companyName={companyName} a4Mode={a4Mode} />;
    case "price":   return <PriceLabel   product={product} companyName={companyName} a4Mode={a4Mode} />;
    case "shelf":   return <ShelfLabel   product={product} companyName={companyName} a4Mode={a4Mode} />;
    case "qr":      return <QRLabel      product={product} companyName={companyName} a4Mode={a4Mode} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// YAZDIRMA CSS — mod ve sütuna göre
// ─────────────────────────────────────────────────────────────────────────────
function getPrintStyle(printMode: PrintMode, cols: number): string {
  if (printMode === "roll") {
    return `
      @media screen { .print-area { display: none !important; } }
      @media print {
        @page { margin: 4mm; }
        body > * { display: none !important; }
        .print-area {
          display: flex !important;
          flex-wrap: wrap;
          gap: 1.5mm;
          align-items: flex-start;
        }
        .label-item { break-inside: avoid; }
        .no-print { display: none !important; }
      }
    `;
  }
  // A4 grid modu
  return `
    @media screen { .print-area { display: none !important; } }
    @media print {
      @page { size: A4 portrait; margin: 8mm; }
      body > * { display: none !important; }
      .print-area {
        display: grid !important;
        grid-template-columns: repeat(${cols}, 1fr);
        gap: 2mm;
        width: 100%;
        align-items: start;
      }
      .label-item {
        width: 100% !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .no-print { display: none !important; }
    }
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────────────────────
export default function BarcodesPage() {
  const { company } = useCompany();
  const companyName = company?.name ?? "Ticarium365";

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<number, SelectedProduct>>(new Map());
  const [template, setTemplate] = useState<TemplateId>("thermal");
  const [printMode, setPrintMode] = useState<PrintMode>("a4");
  const [a4Cols, setA4Cols] = useState(3);

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

  // A4 preset bilgisi
  const preset = A4_PRESETS.find(p => p.cols === a4Cols) ?? A4_PRESETS[1];
  const approxPerPage = preset.approxPerPage[template];
  const estPages = totalLabels > 0 ? Math.ceil(totalLabels / approxPerPage) : 0;

  return (
    <>
      <style>{getPrintStyle(printMode, a4Cols)}</style>

      {/* YAZDIRILACAK ALAN */}
      <div className="print-area">
        {selectedItems.flatMap(({ product, qty }) =>
          Array.from({ length: qty }, (_, i) => (
            <LabelComponent
              key={`${product.id}-${i}`}
              template={template}
              product={product}
              companyName={companyName}
              a4Mode={printMode === "a4"}
            />
          ))
        )}
      </div>

      {/* EKRAN UI */}
      <div className="no-print p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        {/* Başlık */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Barkod / Etiket Merkezi</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Toplu etiket yazdır, A4'e sığdır veya termal rulo çıkar</p>
          </div>
          <Button className="gap-2" disabled={totalLabels === 0} onClick={printLabels} size="lg">
            <Printer className="h-4 w-4" />
            Yazdır / PDF
            {totalLabels > 0 && (
              <span className="ml-1 bg-primary-foreground/20 px-1.5 py-0.5 rounded text-xs font-bold">
                {totalLabels}
              </span>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* SOL PANELİ */}
          <div className="xl:col-span-2 space-y-4">

            {/* AYARLAR KARTI */}
            <div className="bg-card border rounded-xl p-4 space-y-4">
              {/* Şablon */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Etiket Şablonu</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => setTemplate(t.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                        template === t.id ? "border-primary bg-primary/5" : "border-transparent bg-muted hover:bg-muted/80"
                      }`}>
                      <t.icon className={`h-5 w-5 ${template === t.id ? "text-primary" : "text-muted-foreground"}`} />
                      <p className={`text-xs font-semibold ${template === t.id ? "text-primary" : ""}`}>{t.label}</p>
                      <p className="text-[10px] text-muted-foreground">{t.size}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Yazdırma Modu */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sayfa Düzeni</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setPrintMode("a4")}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      printMode === "a4" ? "border-primary bg-primary/5" : "border-transparent bg-muted hover:bg-muted/80"
                    }`}>
                    <FileText className={`h-5 w-5 shrink-0 ${printMode === "a4" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="text-left">
                      <p className={`text-sm font-semibold ${printMode === "a4" ? "text-primary" : ""}`}>A4 Sayfası</p>
                      <p className="text-[10px] text-muted-foreground">Birden fazla etiket, tek sayfa</p>
                    </div>
                  </button>
                  <button onClick={() => setPrintMode("roll")}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      printMode === "roll" ? "border-primary bg-primary/5" : "border-transparent bg-muted hover:bg-muted/80"
                    }`}>
                    <ScrollText className={`h-5 w-5 shrink-0 ${printMode === "roll" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="text-left">
                      <p className={`text-sm font-semibold ${printMode === "roll" ? "text-primary" : ""}`}>Termal Rulo</p>
                      <p className="text-[10px] text-muted-foreground">Termal yazıcı, özel kağıt</p>
                    </div>
                  </button>
                </div>

                {/* A4 sütun seçici */}
                {printMode === "a4" && (
                  <div className="mt-3 p-3 bg-muted/40 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">A4 Sütun Sayısı</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {A4_PRESETS.map(p => {
                        const perPage = p.approxPerPage[template];
                        return (
                          <button key={p.cols} onClick={() => setA4Cols(p.cols)}
                            className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border-2 transition-all ${
                              a4Cols === p.cols ? "border-primary bg-primary/10" : "border-transparent bg-background hover:bg-muted"
                            }`}>
                            {/* Mini ızgara görseli */}
                            <div className={`grid gap-0.5 w-8`} style={{ gridTemplateColumns: `repeat(${Math.min(p.cols, 4)}, 1fr)` }}>
                              {Array.from({ length: Math.min(p.cols * 2, 8) }).map((_, i) => (
                                <div key={i} className={`h-1.5 rounded-sm ${a4Cols === p.cols ? "bg-primary" : "bg-muted-foreground/40"}`} />
                              ))}
                            </div>
                            <p className={`text-xs font-bold mt-1 ${a4Cols === p.cols ? "text-primary" : ""}`}>{p.label}</p>
                            <p className="text-[10px] text-muted-foreground">~{perPage}/sayfa</p>
                          </button>
                        );
                      })}
                    </div>
                    {/* Özet bilgi */}
                    <div className="flex items-center gap-2 mt-1 pt-2 border-t">
                      <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        {a4Cols} sütun → <strong>yaklaşık {approxPerPage} etiket/A4</strong>
                        {totalLabels > 0 && ` — ${totalLabels} etiket ≈ ${estPages} sayfa`}
                      </p>
                    </div>
                  </div>
                )}
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
                <div className="max-h-[460px] overflow-y-auto divide-y">
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
                          <p className="text-xs text-muted-foreground font-mono">
                            {product.productCode}{product.barcode ? ` • ${product.barcode}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{product.salePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</p>
                          <p className="text-xs text-muted-foreground">Stok: {product.stock}</p>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
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

          {/* SAĞ: Özet + Önizleme */}
          <div className="space-y-4">
            {/* Yazdırma özeti */}
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Yazdırma Özeti</p>
                {totalLabels > 0 && (
                  <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">
                    {totalLabels} etiket
                  </span>
                )}
              </div>

              {/* Sayfa bilgisi */}
              {printMode === "a4" && totalLabels > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-blue-300 font-semibold">
                    <FileText className="h-4 w-4" />
                    A4 Özeti
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs text-blue-300">
                    <div className="flex justify-between">
                      <span>Sütun sayısı:</span>
                      <strong>{a4Cols}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Sayfa başına:</span>
                      <strong>~{approxPerPage} etiket</strong>
                    </div>
                    <div className="flex justify-between border-t border-blue-500/20 pt-0.5 mt-1">
                      <span>Toplam sayfa:</span>
                      <strong>~{estPages} A4</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Seçilen ürünler */}
              {selected.size === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm rounded-lg bg-muted/30 border-2 border-dashed">
                  Sol listeden ürün seçin
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                  {selectedItems.map(({ product, qty }) => (
                    <div key={product.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/10">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{product.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{product.productCode}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setQty(product.id, qty - 1)}
                          className="h-5 w-5 rounded bg-background border flex items-center justify-center hover:bg-muted">
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold">{qty}</span>
                        <button onClick={() => setQty(product.id, qty + 1)}
                          className="h-5 w-5 rounded bg-background border flex items-center justify-center hover:bg-muted">
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                        <button onClick={() => toggleProduct(product)}
                          className="h-5 w-5 rounded bg-background border flex items-center justify-center hover:bg-destructive/10 text-destructive ml-0.5">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button className="w-full gap-2" disabled={totalLabels === 0} onClick={printLabels} size="lg">
                <Printer className="h-4 w-4" />
                {totalLabels > 0 ? `${totalLabels} Etiket Yazdır` : "Ürün seçin"}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                "PDF olarak kaydet" ile dijital arşiv oluşturabilirsiniz.
              </p>
            </div>

            {/* İpuçları */}
            {printMode === "a4" ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-xs text-green-300 space-y-1">
                <p className="font-semibold">A4 Yazdırma İpuçları</p>
                <ul className="space-y-0.5 list-disc list-inside text-green-300">
                  <li>Yazdır → Kağıt boyutu: A4 seçin</li>
                  <li>Kenar boşluklarını "Minimum" yapın</li>
                  <li>Ölçeği %100 (Gerçek boyut) tutun</li>
                  <li>Arka plan grafiklerini açık bırakın</li>
                  <li>Sütun sayısını azaltarak etiket büyütün</li>
                </ul>
              </div>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                <p className="font-semibold">Termal Yazıcı İpuçları</p>
                <ul className="space-y-0.5 list-disc list-inside text-amber-300">
                  <li>Kağıt genişliğini şablona göre ayarlayın</li>
                  <li>Kenar boşluklarını "Yok" seçin</li>
                  <li>Ölçeği %100 (Gerçek boyut) tutun</li>
                  <li>Renk: Siyah-Beyaz seçin</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
