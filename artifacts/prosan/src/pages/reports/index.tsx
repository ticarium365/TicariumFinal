import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  BarChart3, TrendingUp, Package, Users, Truck,
  Download, ShoppingCart, TrendingDown, ArrowUpRight, ArrowDownRight,
  FileText, DollarSign, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-context";

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (v: number | undefined, suffix = " ₺") =>
  (v ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + suffix;

const pct = (v: number | undefined) => `%${(v ?? 0).toFixed(1)}`;

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error("Yükleme hatası");
  return res.json();
}

function downloadCSV(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// HIZLI TARİH ARALIKLARI
// ─────────────────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "Bugün", start: () => format(new Date(), "yyyy-MM-dd"), end: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Bu Hafta", start: () => format(subDays(new Date(), 6), "yyyy-MM-dd"), end: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Bu Ay", start: () => format(startOfMonth(new Date()), "yyyy-MM-dd"), end: () => format(endOfMonth(new Date()), "yyyy-MM-dd") },
  { label: "Son 30 Gün", start: () => format(subDays(new Date(), 29), "yyyy-MM-dd"), end: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Son 3 Ay", start: () => format(subMonths(new Date(), 3), "yyyy-MM-dd"), end: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Son 6 Ay", start: () => format(subMonths(new Date(), 6), "yyyy-MM-dd"), end: () => format(new Date(), "yyyy-MM-dd") },
  { label: "Bu Yıl", start: () => `${new Date().getFullYear()}-01-01`, end: () => format(new Date(), "yyyy-MM-dd") },
];

// ─────────────────────────────────────────────────────────────────────────────
// KÜçÜK KART
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ title, value, sub, color = "text-foreground", icon: Icon }:
  { title: string; value: string; sub?: string; color?: string; icon: React.ElementType }) {
  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-1">{title}</p>
          <p className={`text-xl font-bold truncate ${color}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLO
// ─────────────────────────────────────────────────────────────────────────────
function ReportTable({ headers, rows, emptyText = "Veri yok" }: {
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
  emptyText?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={`px-3 py-2.5 font-medium text-muted-foreground ${i > 0 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="text-center py-8 text-muted-foreground">{emptyText}</td></tr>
          ) : rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-muted/20">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2.5 ${ci > 0 ? "text-right" : ""}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SATIŞ RAPORU SEKMESİ
// ─────────────────────────────────────────────────────────────────────────────
function SalesTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-sales", startDate, endDate],
    queryFn: () => apiFetch(`/reports/sales?startDate=${startDate}&endDate=${endDate}`),
    enabled: !!startDate && !!endDate,
    staleTime: 30_000,
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Brüt Ciro" value={fmt(data?.grossRevenue)} sub={`${data?.totalSales} işlem`} icon={ShoppingCart} color="text-primary" />
        <StatCard title="Toplam Kâr" value={fmt(data?.totalProfit)} sub={pct(data?.profitPercent) + " kâr marjı"} icon={TrendingUp} color="text-green-600" />
        <StatCard title="Toplam Maliyet" value={fmt(data?.costTotal)} icon={DollarSign} />
        <StatCard title="Satılan Adet" value={String(data?.totalQuantity ?? 0)} sub="ürün adedi" icon={Package} />
      </div>

      {/* Ödeme yöntemi */}
      {data?.paymentBreakdown && Object.keys(data.paymentBreakdown).length > 0 && (
        <div className="bg-card border rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Ödeme Yöntemi Dağılımı</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(data.paymentBreakdown as Record<string, number>).map(([k, v]) => (
              <div key={k} className="bg-muted rounded-lg px-3 py-2 text-sm">
                <span className="text-muted-foreground capitalize">{k}: </span>
                <span className="font-semibold">{fmt(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ürün bazlı */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Ürün Bazlı Satışlar (İlk 20)</h3>
          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
            onClick={() => window.open(`/api/reports/export/sales?startDate=${startDate}&endDate=${endDate}`, "_blank")}>
            <Download className="h-3 w-3" /> CSV İndir
          </Button>
        </div>
        <ReportTable
          headers={["Ürün", "Adet", "Ciro", "Kâr", "Kâr %"]}
          rows={(data?.productBreakdown ?? []).slice(0, 20).map((p: { productName: string; productCode: string; quantity: number; revenue: number; profit: number; profitPercent: number }) => [
            <div key="n"><p className="font-medium">{p.productName}</p><p className="text-xs text-muted-foreground font-mono">{p.productCode}</p></div>,
            p.quantity,
            fmt(p.revenue),
            <span className="text-green-300 font-medium">{fmt(p.profit)}</span>,
            <span className={p.profitPercent >= 20 ? "text-green-600" : "text-amber-600"}>{pct(p.profitPercent)}</span>,
          ])}
        />
      </div>

      {/* Günlük kırılım */}
      {(data?.dailyBreakdown ?? []).length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Günlük Kırılım</h3>
          <ReportTable
            headers={["Tarih", "İşlem", "Ciro", "Kâr"]}
            rows={(data.dailyBreakdown as { date: string; count: number; revenue: number; profit: number }[]).map(d => [
              new Date(d.date).toLocaleDateString("tr-TR"),
              d.count,
              fmt(d.revenue),
              fmt(d.profit),
            ])}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KÂR ANALİZİ SEKMESİ
// ─────────────────────────────────────────────────────────────────────────────
function ProfitTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-profit", startDate, endDate],
    queryFn: () => apiFetch(`/reports/profit?startDate=${startDate}&endDate=${endDate}`),
    enabled: !!startDate && !!endDate,
    staleTime: 30_000,
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>;

  const s = data?.summary;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Toplam Ciro" value={fmt(s?.totalRevenue)} icon={TrendingUp} color="text-primary" />
        <StatCard title="Toplam Maliyet" value={fmt(s?.totalCost)} icon={DollarSign} />
        <StatCard title="Net Kâr" value={fmt(s?.totalProfit)} sub={pct(s?.profitPercent) + " marjı"} icon={ArrowUpRight} color="text-green-600" />
        <StatCard title="İşlem Sayısı" value={String(s?.totalTransactions ?? 0)} icon={ShoppingCart} />
      </div>

      {/* Aylık trend */}
      {(data?.monthlyTrend ?? []).length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Aylık Kâr Trendi</h3>
          <ReportTable
            headers={["Ay", "Ciro", "Maliyet", "Kâr", "Kâr %"]}
            rows={(data.monthlyTrend as { month: string; revenue: number; cost: number; profit: number; profitPercent: number }[]).map(m => [
              m.month,
              fmt(m.revenue),
              fmt(m.cost),
              <span className="text-green-300 font-medium">{fmt(m.profit)}</span>,
              <span className={m.profitPercent >= 20 ? "text-green-600 font-medium" : "text-amber-600"}>{pct(m.profitPercent)}</span>,
            ])}
          />
        </div>
      )}

      {/* Kategori bazlı */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Kategori Bazlı Kâr</h3>
        <ReportTable
          headers={["Kategori", "Adet", "Ciro", "Kâr", "Kâr %"]}
          rows={(data?.categoryProfits ?? []).map((c: { category: string; quantity: number; revenue: number; profit: number; profitPercent: number }) => [
            c.category,
            c.quantity,
            fmt(c.revenue),
            <span className="text-green-300 font-medium">{fmt(c.profit)}</span>,
            pct(c.profitPercent),
          ])}
        />
      </div>

      {/* Ürün bazlı kâr */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Ürün Bazlı Kâr (İlk 20)</h3>
        <ReportTable
          headers={["Ürün", "Adet", "Ciro", "Maliyet", "Kâr", "Kâr %"]}
          rows={(data?.productProfits ?? []).slice(0, 20).map((p: { productName: string; productCode: string; quantity: number; revenue: number; cost: number; profit: number; profitPercent: number }) => [
            <div key="n"><p className="font-medium">{p.productName}</p><p className="text-xs text-muted-foreground font-mono">{p.productCode}</p></div>,
            p.quantity,
            fmt(p.revenue),
            fmt(p.cost),
            <span className="text-green-300 font-medium">{fmt(p.profit)}</span>,
            <span className={p.profitPercent >= 20 ? "text-green-600" : "text-amber-600"}>{pct(p.profitPercent)}</span>,
          ])}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ ANALİZİ SEKMESİ
// ─────────────────────────────────────────────────────────────────────────────
function CustomerTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-customers", startDate, endDate],
    queryFn: () => apiFetch(`/reports/customer-analytics?startDate=${startDate}&endDate=${endDate}`),
    enabled: !!startDate && !!endDate,
    staleTime: 30_000,
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Aktif Müşteri" value={String(data?.totalCustomers ?? 0)} icon={Users} />
        <StatCard title="Toplam Alacak" value={fmt(data?.totalDebt)} sub="bekleyen tahsilat" icon={ArrowUpRight} color="text-red-600" />
      </div>

      <div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">En Çok Ciro Yapan Müşteriler (İlk 20)</h3>
        <ReportTable
          headers={["Müşteri", "Kod", "İşlem", "Ciro", "Kâr"]}
          rows={(data?.topCustomersBySales ?? []).map((c: { customerName: string; code: string; transactions: number; revenue: number; profit: number }) => [
            c.customerName,
            <span className="font-mono text-xs">{c.code}</span>,
            c.transactions,
            fmt(c.revenue),
            <span className="text-green-300">{fmt(c.profit)}</span>,
          ])}
          emptyText="Seçilen dönemde müşteri bazlı satış yok"
        />
      </div>

      <div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">En Borçlu 10 Müşteri</h3>
        <ReportTable
          headers={["Müşteri", "Kod", "Bakiye"]}
          rows={(data?.topDebtors ?? []).map((c: { name: string; code: string; balance: number }) => [
            c.name,
            <span className="font-mono text-xs">{c.code}</span>,
            <span className="text-red-300 font-semibold">{fmt(c.balance)}</span>,
          ])}
          emptyText="Borçlu müşteri yok"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEDARİKÇİ ANALİZİ SEKMESİ
// ─────────────────────────────────────────────────────────────────────────────
function SupplierTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-suppliers", startDate, endDate],
    queryFn: () => apiFetch(`/reports/supplier-analytics?startDate=${startDate}&endDate=${endDate}`),
    enabled: !!startDate && !!endDate,
    staleTime: 30_000,
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard title="Aktif Tedarikçi" value={String(data?.totalSuppliers ?? 0)} icon={Truck} />
        <StatCard title="Dönem Alışları" value={fmt(data?.totalPurchaseAmount)} icon={ShoppingCart} color="text-primary" />
        <StatCard title="Toplam Borç" value={fmt(data?.totalDebt)} sub="ödenmesi gereken" icon={ArrowDownRight} color="text-orange-600" />
      </div>

      {/* Aylık trend */}
      {(data?.monthlyPurchases ?? []).length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Aylık Alış Trendi</h3>
          <ReportTable
            headers={["Ay", "Fatura Adedi", "Toplam"]}
            rows={(data.monthlyPurchases as { month: string; invoiceCount: number; totalSpend: number }[]).map(m => [
              m.month, m.invoiceCount, fmt(m.totalSpend),
            ])}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">En Çok Alış Yapılan Tedarikçiler</h3>
          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
            onClick={() => window.open(`/api/reports/export/purchases?startDate=${startDate}&endDate=${endDate}`, "_blank")}>
            <Download className="h-3 w-3" /> CSV İndir
          </Button>
        </div>
        <ReportTable
          headers={["Tedarikçi", "Kod", "Fatura", "Toplam Harcama"]}
          rows={(data?.topSuppliersBySpend ?? []).map((s: { supplierName: string; code: string; invoiceCount: number; totalSpend: number }) => [
            s.supplierName,
            <span className="font-mono text-xs">{s.code}</span>,
            s.invoiceCount,
            fmt(s.totalSpend),
          ])}
          emptyText="Seçilen dönemde alış yok"
        />
      </div>

      <div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Mevcut Borç Durumu (İlk 10)</h3>
        <ReportTable
          headers={["Tedarikçi", "Kod", "Borç"]}
          rows={(data?.topCreditors ?? []).map((s: { name: string; code: string; balance: number }) => [
            s.name,
            <span className="font-mono text-xs">{s.code}</span>,
            <span className="text-orange-300 font-semibold">{fmt(s.balance)}</span>,
          ])}
          emptyText="Borç yok"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STOK RAPORU SEKMESİ
// ─────────────────────────────────────────────────────────────────────────────
function StockTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-stock"],
    queryFn: () => apiFetch("/reports/stock"),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Ürün Çeşidi" value={String(data?.totalProducts ?? 0)} icon={Package} />
        <StatCard title="Stok Değeri (Alış)" value={fmt(data?.totalStockValue)} icon={DollarSign} />
        <StatCard title="Stok Değeri (Satış)" value={fmt(data?.totalSaleValue)} icon={TrendingUp} color="text-primary" />
        <StatCard title="Potansiyel Kâr" value={fmt(data?.potentialProfit)} sub="satış-alış farkı" icon={ArrowUpRight} color="text-green-600" />
      </div>

      {/* Kategori */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Kategori Bazlı Stok</h3>
          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
            onClick={() => window.open("/api/reports/export/stock", "_blank")}>
            <Download className="h-3 w-3" /> CSV İndir
          </Button>
        </div>
        <ReportTable
          headers={["Kategori", "Ürün", "Stok", "Alış Değeri", "Satış Değeri"]}
          rows={(data?.stockByCategory ?? []).map((c: { category: string; productCount: number; totalStock: number; stockValue: number; saleValue: number }) => [
            c.category, c.productCount, c.totalStock, fmt(c.stockValue), fmt(c.saleValue),
          ])}
        />
      </div>

      {/* Tükenen */}
      {(data?.outOfStock ?? []).length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Tükenen Ürünler ({data.outOfStock.length})
          </h3>
          <ReportTable
            headers={["Kod", "Ürün Adı", "Kategori", "Alış Fiyatı"]}
            rows={data.outOfStock.slice(0, 20).map((p: { productCode: string; name: string; category?: string; purchasePrice: number }) => [
              <span className="font-mono text-xs">{p.productCode}</span>, p.name, p.category ?? "—", fmt(p.purchasePrice),
            ])}
          />
        </div>
      )}

      {/* Kritik stok */}
      {(data?.criticalStock ?? []).length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Kritik Stok ({data.criticalStock.length})
          </h3>
          <ReportTable
            headers={["Kod", "Ürün", "Stok", "Min Stok"]}
            rows={data.criticalStock.slice(0, 20).map((p: { productCode: string; name: string; stock: number; minStock: number }) => [
              <span className="font-mono text-xs">{p.productCode}</span>, p.name,
              <span className="text-amber-600 font-semibold">{p.stock}</span>, p.minStock,
            ])}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANA SAYFA
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "sales", label: "Satış Raporu", icon: ShoppingCart },
  { id: "profit", label: "Kâr Analizi", icon: TrendingUp },
  { id: "customers", label: "Müşteri Analizi", icon: Users },
  { id: "suppliers", label: "Tedarikçi Analizi", icon: Truck },
  { id: "stock", label: "Stok Durumu", icon: Package },
] as const;

export default function Reports() {
  const { user } = useAuth();
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("sales");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  if (user?.role === "super_admin") {
    return <div className="p-8 text-center text-muted-foreground">Super admin raporlara erişemez.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight t365-gradient-text t365-heading-accent" style={{ fontFamily: "var(--font-display)" }}>Raporlar</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gelişmiş satış, kâr ve envanter analizleri</p>
        </div>
      </div>

      {/* Tarih aralığı */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Başlangıç</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bitiş</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 w-40" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button key={p.label}
              onClick={() => { setStartDate(p.start()); setEndDate(p.end()); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                startDate === p.start() && endDate === p.end()
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-0.5 bg-muted/50 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Sekme içeriği */}
      {tab === "sales" && <SalesTab startDate={startDate} endDate={endDate} />}
      {tab === "profit" && <ProfitTab startDate={startDate} endDate={endDate} />}
      {tab === "customers" && <CustomerTab startDate={startDate} endDate={endDate} />}
      {tab === "suppliers" && <SupplierTab startDate={startDate} endDate={endDate} />}
      {tab === "stock" && <StockTab />}
    </div>
  );
}
