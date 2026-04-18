import {
  TrendingUp,
  ShoppingBag,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Search,
  Bell,
} from "lucide-react";

const kpis = [
  {
    label: "Bugünkü Satış",
    value: "₺48.290",
    delta: "+12.4%",
    up: true,
    icon: TrendingUp,
    accent: "from-cyan-400 to-teal-400",
    glow: "shadow-[0_0_40px_-10px_rgba(34,211,238,0.4)]",
  },
  {
    label: "Aktif Sipariş",
    value: "23",
    delta: "+3",
    up: true,
    icon: ShoppingBag,
    accent: "from-violet-400 to-fuchsia-400",
    glow: "shadow-[0_0_40px_-10px_rgba(167,139,250,0.4)]",
  },
  {
    label: "Tahsilat Bekleyen",
    value: "₺127.450",
    delta: "-4.1%",
    up: false,
    icon: Wallet,
    accent: "from-amber-400 to-orange-400",
    glow: "shadow-[0_0_40px_-10px_rgba(251,191,36,0.4)]",
  },
  {
    label: "Kritik Stok",
    value: "8",
    delta: "+2",
    up: false,
    icon: AlertTriangle,
    accent: "from-rose-400 to-red-400",
    glow: "shadow-[0_0_40px_-10px_rgba(251,113,133,0.4)]",
  },
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
  { t: "09:42", who: "Mehmet Y.", what: "yeni satış oluşturdu", amt: "₺2.480", c: "text-cyan-400" },
  { t: "09:18", who: "Ayşe T.", what: "tahsilat kaydetti", amt: "₺6.300", c: "text-emerald-400" },
  { t: "08:55", who: "Sistem", what: "günlük kapanış aldı", amt: "—", c: "text-slate-400" },
  { t: "08:31", who: "Burak K.", what: "ürün stoğu güncelledi", amt: "+24", c: "text-violet-400" },
];

const max = Math.max(...week.map((w) => w.v));

export function DarkPro() {
  return (
    <div
      className="min-h-screen bg-[#070a14] text-slate-100 relative overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
      />

      {/* Glow blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-[1240px] mx-auto px-10 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              <span
                className="text-[11px] uppercase tracking-[0.3em] text-emerald-400"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                LIVE · PROSAN — Merkez
              </span>
            </div>
            <h1 className="text-[42px] font-bold leading-tight bg-gradient-to-r from-white via-cyan-200 to-violet-200 bg-clip-text text-transparent">
              Ana Panel
            </h1>
            <p
              className="text-slate-400 text-[13px] mt-1"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              18.04.2026 · 09:47:23
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10">
              <Search className="w-4 h-4 text-slate-400" />
              <span className="text-[13px] text-slate-500">Ürün, müşteri ara…</span>
              <kbd
                className="ml-6 text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                ⌘K
              </kbd>
            </div>
            <button className="relative w-10 h-10 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-slate-300" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center font-semibold text-sm">
              MS
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div
                key={k.label}
                className={`relative rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-5 ${k.glow} hover:border-white/20 transition`}
              >
                <div className="flex items-start justify-between mb-6">
                  <div
                    className={`w-9 h-9 rounded-lg bg-gradient-to-br ${k.accent} flex items-center justify-center`}
                  >
                    <Icon className="w-4 h-4 text-slate-900" strokeWidth={2.5} />
                  </div>
                  <span
                    className={`text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-md ${
                      k.up
                        ? "text-emerald-300 bg-emerald-400/10"
                        : "text-rose-300 bg-rose-400/10"
                    }`}
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
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
                  className="text-[28px] font-semibold tabular-nums leading-none mb-2"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {k.value}
                </div>
                <div className="text-[12px] text-slate-400 uppercase tracking-wider">
                  {k.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart + Top products */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="col-span-2 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-[15px] font-semibold">Son 7 Gün — Satış Akışı</h2>
              </div>
              <div className="flex gap-1 text-[11px]">
                {["Gün", "Hafta", "Ay"].map((t, i) => (
                  <button
                    key={t}
                    className={`px-3 py-1 rounded-md ${
                      i === 0
                        ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/30"
                        : "text-slate-500 border border-transparent"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative h-[220px]">
              {/* Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="border-t border-white/5" />
                ))}
              </div>
              <div className="absolute inset-0 flex items-end gap-3 px-2">
                {week.map((w, i) => (
                  <div key={w.d} className="flex-1 flex flex-col items-center gap-2">
                    <div className="text-[10px] text-cyan-300 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {w.v}
                    </div>
                    <div
                      className={`w-full rounded-t-md bg-gradient-to-t ${
                        i === 5
                          ? "from-cyan-500/40 to-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.5)]"
                          : "from-violet-500/30 to-violet-300/80"
                      }`}
                      style={{ height: `${(w.v / max) * 180}px` }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-3 px-2">
              {week.map((w) => (
                <div
                  key={w.d}
                  className="flex-1 text-center text-[11px] text-slate-500"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {w.d}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-6">
            <h2 className="text-[15px] font-semibold mb-5">Çok Satanlar</h2>
            <ul className="space-y-3">
              {topProducts.map((p, i) => (
                <li key={p.sku} className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-semibold ${
                      i === 0
                        ? "bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-900"
                        : "bg-white/5 border border-white/10 text-slate-400"
                    }`}
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] truncate text-slate-200">{p.name}</div>
                    <div
                      className="text-[10.5px] text-slate-500 tabular-nums"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {p.qty} adet · {p.sku}
                    </div>
                  </div>
                  <div
                    className="text-[12.5px] tabular-nums text-cyan-300 shrink-0"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {p.total}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Low stock + activity */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-6">
            <div className="flex items-center gap-2 mb-5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <h2 className="text-[15px] font-semibold">Kritik Stok</h2>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-md bg-rose-400/10 text-rose-300 border border-rose-400/20">
                4 acil
              </span>
            </div>
            {lowStock.map((s) => (
              <div key={s.name} className="py-2.5 border-b border-white/5 last:border-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[12.5px] text-slate-200">{s.name}</div>
                  <div
                    className="text-[11px] text-rose-300 tabular-nums"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {s.left}/{s.min}
                  </div>
                </div>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-400 to-amber-400"
                    style={{ width: `${(s.left / s.min) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-6">
            <h2 className="text-[15px] font-semibold mb-5">Son Hareketler</h2>
            {activity.map((a, i) => (
              <div
                key={i}
                className="flex items-baseline gap-3 py-2.5 border-b border-white/5 last:border-0"
              >
                <div
                  className="text-[10.5px] text-slate-500 tabular-nums w-12"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {a.t}
                </div>
                <div className="flex-1 text-[12.5px]">
                  <span className={`font-semibold ${a.c}`}>{a.who}</span>{" "}
                  <span className="text-slate-400">{a.what}</span>
                </div>
                <div
                  className="text-[12px] tabular-nums text-slate-300"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {a.amt}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
