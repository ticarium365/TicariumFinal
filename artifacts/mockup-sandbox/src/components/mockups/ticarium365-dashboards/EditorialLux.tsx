import {
  TrendingUp,
  ShoppingBag,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const kpis = [
  { label: "Bugünkü Satış", value: "₺48.290", delta: "+12,4%", up: true, icon: TrendingUp },
  { label: "Aktif Sipariş", value: "23", delta: "+3", up: true, icon: ShoppingBag },
  { label: "Tahsilat Bekleyen", value: "₺127.450", delta: "-4,1%", up: false, icon: Wallet },
  { label: "Kritik Stok", value: "8", delta: "+2", up: false, icon: AlertTriangle },
];

const week = [
  { d: "Pzt", v: 32 },
  { d: "Sal", v: 41 },
  { d: "Çar", v: 28 },
  { d: "Per", v: 55 },
  { d: "Cum", v: 47 },
  { d: "Cmt", v: 62 },
  { d: "Paz", v: 48 },
];

const topProducts = [
  { name: "PRO-1500 Endüstriyel Pompa", sku: "PRS-1500-A", qty: 14, total: "₺18.760" },
  { name: "Vakum Filtre Seti — Mavi", sku: "PRS-VFS-B", qty: 32, total: "₺9.280" },
  { name: "Hortum Bağlantı Aparatı", sku: "PRS-HBA-22", qty: 58, total: "₺6.960" },
  { name: "Yedek Conta Paketi", sku: "PRS-CNT-10", qty: 120, total: "₺4.800" },
  { name: "Servis Seti — Premium", sku: "PRS-SS-PRM", qty: 7, total: "₺21.350" },
];

const lowStock = [
  { name: "PRO-1500 Endüstriyel Pompa", left: 3, min: 10 },
  { name: "Servis Seti — Premium", left: 2, min: 8 },
  { name: "Filtre Kartuşu — XL", left: 5, min: 20 },
  { name: "Bakım Yağı 5L", left: 4, min: 15 },
];

const activity = [
  { t: "09:42", who: "Mehmet Y.", what: "yeni satış oluşturdu", amt: "₺2.480" },
  { t: "09:18", who: "Ayşe T.", what: "tahsilat kaydetti", amt: "₺6.300" },
  { t: "08:55", who: "Sistem", what: "günlük kapanış aldı", amt: "—" },
  { t: "08:31", who: "Burak K.", what: "ürün stoğu güncelledi", amt: "+24" },
];

const max = Math.max(...week.map((w) => w.v));

export function EditorialLux() {
  return (
    <div
      className="min-h-screen bg-[#fbfaf7] text-[#1a1a1a]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap"
      />

      <div className="max-w-[1240px] mx-auto px-12 py-10">
        {/* Header */}
        <div className="flex items-end justify-between border-b border-[#e6dfd2] pb-8 mb-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-[#8a7a5c] mb-3">
              Ticarium365 · Yönetim Paneli
            </div>
            <h1
              className="text-[56px] leading-[1.05] font-medium text-[#1a1a1a]"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Ana Panel
            </h1>
            <p className="text-[#6b6356] mt-2 text-[15px] font-light">
              18 Nisan 2026, Cumartesi · Bugünün özeti
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.32em] text-[#8a7a5c]">
              Şube
            </div>
            <div
              className="text-2xl mt-1"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              PROSAN — Merkez
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-px bg-[#e6dfd2] border border-[#e6dfd2] mb-12">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-[#fbfaf7] p-7">
                <div className="flex items-center justify-between mb-5">
                  <Icon className="w-4 h-4 text-[#8a7a5c]" strokeWidth={1.5} />
                  <span
                    className={`text-[11px] flex items-center gap-1 ${
                      k.up ? "text-[#3f6b3f]" : "text-[#9b4242]"
                    }`}
                  >
                    {k.up ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {k.delta}
                  </span>
                </div>
                <div
                  className="text-[38px] leading-none font-medium text-[#1a1a1a] mb-3 tabular-nums"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {k.value}
                </div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#6b6356]">
                  {k.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sales chart + Top products */}
        <div className="grid grid-cols-3 gap-10 mb-12">
          <div className="col-span-2">
            <div className="flex items-baseline justify-between mb-6">
              <h2
                className="text-3xl font-medium"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Son 7 Gün
              </h2>
              <span className="text-[11px] uppercase tracking-[0.28em] text-[#8a7a5c]">
                Satış · Bin ₺
              </span>
            </div>
            <div className="border-t border-[#e6dfd2] pt-8">
              <div className="flex items-end gap-6 h-[220px]">
                {week.map((w) => (
                  <div key={w.d} className="flex-1 flex flex-col items-center gap-3">
                    <div
                      className="w-full bg-[#1a1a1a]"
                      style={{ height: `${(w.v / max) * 180}px` }}
                    />
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7a5c]">
                      {w.d}
                    </div>
                    <div className="text-[13px] tabular-nums">{w.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-6">
              <h2
                className="text-3xl font-medium"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Çok Satanlar
              </h2>
            </div>
            <ul className="border-t border-[#e6dfd2]">
              {topProducts.map((p, i) => (
                <li
                  key={p.sku}
                  className="flex items-baseline justify-between py-4 border-b border-[#e6dfd2]"
                >
                  <div className="flex gap-4 min-w-0">
                    <span
                      className="text-[#8a7a5c] tabular-nums text-[13px]"
                      style={{ fontFamily: "'Cormorant Garamond', serif" }}
                    >
                      0{i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] truncate">{p.name}</div>
                      <div className="text-[11px] text-[#8a7a5c] tabular-nums">
                        {p.qty} adet
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-[15px] tabular-nums shrink-0 ml-3"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    {p.total}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Low stock + activity */}
        <div className="grid grid-cols-2 gap-10">
          <div>
            <h2
              className="text-3xl font-medium mb-6"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Kritik Stok
            </h2>
            <div className="border-t border-[#e6dfd2]">
              {lowStock.map((s) => (
                <div
                  key={s.name}
                  className="py-4 border-b border-[#e6dfd2] flex items-center justify-between"
                >
                  <div className="text-[14px]">{s.name}</div>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] tabular-nums text-[#9b4242]">
                      {s.left} / {s.min}
                    </span>
                    <div className="w-24 h-[2px] bg-[#e6dfd2] relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-[#9b4242]"
                        style={{ width: `${(s.left / s.min) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2
              className="text-3xl font-medium mb-6"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Son Hareketler
            </h2>
            <div className="border-t border-[#e6dfd2]">
              {activity.map((a, i) => (
                <div
                  key={i}
                  className="py-4 border-b border-[#e6dfd2] flex items-baseline gap-4"
                >
                  <div className="text-[11px] tabular-nums text-[#8a7a5c] uppercase tracking-[0.18em] w-12">
                    {a.t}
                  </div>
                  <div className="flex-1 text-[14px]">
                    <span className="font-medium">{a.who}</span>{" "}
                    <span className="text-[#6b6356]">{a.what}</span>
                  </div>
                  <div
                    className="text-[14px] tabular-nums"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    {a.amt}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 text-center text-[10px] uppercase tracking-[0.4em] text-[#8a7a5c]">
          — Ticarium365 —
        </div>
      </div>
    </div>
  );
}
