import {
  TrendingUp,
  ShoppingBag,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Sun,
  Sparkles,
} from "lucide-react";

const kpis = [
  {
    label: "Bugünkü Satış",
    value: "₺48.290",
    delta: "+12,4%",
    up: true,
    icon: TrendingUp,
    bg: "bg-[#fef3e2]",
    ring: "ring-[#f5c98a]",
    chip: "bg-[#f5c98a]/40 text-[#7a4d12]",
    iconBg: "bg-[#f5b04a] text-white",
  },
  {
    label: "Aktif Sipariş",
    value: "23",
    delta: "+3",
    up: true,
    icon: ShoppingBag,
    bg: "bg-[#e9f1e0]",
    ring: "ring-[#b9d196]",
    chip: "bg-[#b9d196]/40 text-[#3d5a1f]",
    iconBg: "bg-[#7fa64a] text-white",
  },
  {
    label: "Tahsilat Bekleyen",
    value: "₺127.450",
    delta: "-4,1%",
    up: false,
    icon: Wallet,
    bg: "bg-[#fde6dc]",
    ring: "ring-[#f0a98c]",
    chip: "bg-[#f0a98c]/40 text-[#7a3a1f]",
    iconBg: "bg-[#d97050] text-white",
  },
  {
    label: "Kritik Stok",
    value: "8",
    delta: "+2",
    up: false,
    icon: AlertTriangle,
    bg: "bg-[#f6e2e2]",
    ring: "ring-[#e0a4a4]",
    chip: "bg-[#e0a4a4]/40 text-[#7a2929]",
    iconBg: "bg-[#c45757] text-white",
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
  { name: "PRO-1500 Endüstriyel Pompa", sku: "PRS-1500-A", qty: 14, total: "₺18.760", emoji: "🏆" },
  { name: "Vakum Filtre Seti — Mavi", sku: "PRS-VFS-B", qty: 32, total: "₺9.280", emoji: "🥈" },
  { name: "Hortum Bağlantı Aparatı", sku: "PRS-HBA-22", qty: 58, total: "₺6.960", emoji: "🥉" },
  { name: "Yedek Conta Paketi", sku: "PRS-CNT-10", qty: 120, total: "₺4.800", emoji: "✨" },
  { name: "Servis Seti — Premium", sku: "PRS-SS-PRM", qty: 7, total: "₺21.350", emoji: "✨" },
];

const lowStock = [
  { name: "PRO-1500 Endüstriyel Pompa", left: 3, min: 10 },
  { name: "Servis Seti — Premium", left: 2, min: 8 },
  { name: "Filtre Kartuşu — XL", left: 5, min: 20 },
  { name: "Bakım Yağı 5L", left: 4, min: 15 },
];

const activity = [
  { t: "09:42", who: "Mehmet Y.", what: "yeni satış oluşturdu", amt: "₺2.480", color: "bg-[#7fa64a]" },
  { t: "09:18", who: "Ayşe T.", what: "tahsilat kaydetti", amt: "₺6.300", color: "bg-[#f5b04a]" },
  { t: "08:55", who: "Sistem", what: "günlük kapanış aldı", amt: "—", color: "bg-[#a89789]" },
  { t: "08:31", who: "Burak K.", what: "ürün stoğu güncelledi", amt: "+24", color: "bg-[#d97050]" },
];

const max = Math.max(...week.map((w) => w.v));

export function WarmFriendly() {
  return (
    <div
      className="min-h-screen bg-[#faf6f1] text-[#3a2f24]"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Caveat:wght@500;600&display=swap"
      />

      <div className="max-w-[1240px] mx-auto px-10 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f5b04a] to-[#d97050] flex items-center justify-center shadow-lg shadow-[#f5b04a]/30">
              <Sun className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[34px] font-extrabold tracking-tight text-[#2a1f14]">
                  Günaydın Mehmet 👋
                </h1>
              </div>
              <p
                className="text-[#7a6a5a] text-[14px] -mt-1"
                style={{ fontFamily: "'Caveat', cursive", fontSize: "20px" }}
              >
                bugün harika gidiyor!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2.5 rounded-2xl bg-white border border-[#ece2d4] flex items-center gap-2 shadow-sm shadow-[#e8d8c4]/50">
              <Sparkles className="w-4 h-4 text-[#f5b04a]" />
              <span className="text-[13px] font-medium text-[#5a4a3a]">PROSAN — Merkez</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#f5b04a] to-[#d97050] flex items-center justify-center text-white font-bold shadow-lg shadow-[#d97050]/30">
              MS
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-7">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div
                key={k.label}
                className={`${k.bg} rounded-3xl p-5 ring-1 ${k.ring}/40 hover:-translate-y-1 transition-all duration-300 shadow-sm`}
              >
                <div className="flex items-center justify-between mb-5">
                  <div
                    className={`w-11 h-11 rounded-2xl ${k.iconBg} flex items-center justify-center shadow-md`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2.5} />
                  </div>
                  <span
                    className={`text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1 rounded-full ${k.chip}`}
                  >
                    {k.up ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {k.delta}
                  </span>
                </div>
                <div className="text-[28px] font-extrabold tabular-nums text-[#2a1f14] leading-none mb-1.5">
                  {k.value}
                </div>
                <div className="text-[12.5px] text-[#7a6a5a] font-medium">{k.label}</div>
              </div>
            );
          })}
        </div>

        {/* Chart + Top products */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="col-span-2 bg-white rounded-3xl p-6 border border-[#ece2d4] shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#2a1f14]">Bu Haftanın Satışları</h2>
                <p
                  className="text-[#a89789] -mt-0.5"
                  style={{ fontFamily: "'Caveat', cursive", fontSize: "16px" }}
                >
                  güzel bir trend yakaladık 📈
                </p>
              </div>
              <div className="flex gap-1.5">
                {["Hafta", "Ay", "Yıl"].map((t, i) => (
                  <button
                    key={t}
                    className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${
                      i === 0
                        ? "bg-[#f5b04a] text-white"
                        : "bg-[#f7eee2] text-[#7a6a5a]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3 h-[220px]">
              {week.map((w, i) => (
                <div key={w.d} className="flex-1 flex flex-col items-center gap-2">
                  <div className="text-[11px] font-bold tabular-nums text-[#7a6a5a]">
                    ₺{w.v}k
                  </div>
                  <div
                    className={`w-full rounded-2xl ${
                      i === 5
                        ? "bg-gradient-to-t from-[#d97050] to-[#f5b04a]"
                        : "bg-gradient-to-t from-[#f5c98a] to-[#fde2b3]"
                    }`}
                    style={{ height: `${(w.v / max) * 180}px` }}
                  />
                  <div className="text-[12px] font-medium text-[#7a6a5a]">{w.d}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-[#ece2d4] shadow-sm">
            <h2 className="text-[18px] font-bold text-[#2a1f14] mb-1">Çok Satanlar</h2>
            <p
              className="text-[#a89789] mb-4"
              style={{ fontFamily: "'Caveat', cursive", fontSize: "15px" }}
            >
              en iyi 5 ürünümüz ⭐
            </p>
            <ul className="space-y-3">
              {topProducts.map((p) => (
                <li key={p.sku} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-[#fef3e2] flex items-center justify-center text-base shrink-0">
                    {p.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-[#2a1f14] truncate">
                      {p.name}
                    </div>
                    <div className="text-[10.5px] text-[#a89789] tabular-nums">
                      {p.qty} adet satıldı
                    </div>
                  </div>
                  <div className="text-[12.5px] font-bold tabular-nums text-[#d97050] shrink-0">
                    {p.total}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Low stock + activity */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-3xl p-6 border border-[#ece2d4] shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-2xl bg-[#f6e2e2] flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-[#c45757]" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[#2a1f14]">Stok Uyarısı</h2>
                <p className="text-[11.5px] text-[#a89789]">4 ürün dikkat istiyor</p>
              </div>
            </div>
            {lowStock.map((s) => (
              <div key={s.name} className="py-3 border-b border-[#f3ebe0] last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-medium text-[#2a1f14]">{s.name}</div>
                  <div className="text-[12px] font-bold tabular-nums text-[#c45757] bg-[#f6e2e2] px-2 py-0.5 rounded-full">
                    {s.left} kaldı
                  </div>
                </div>
                <div className="h-2 rounded-full bg-[#f7eee2] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#c45757] to-[#f5b04a] rounded-full"
                    style={{ width: `${(s.left / s.min) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-[#ece2d4] shadow-sm">
            <h2 className="text-[16px] font-bold text-[#2a1f14] mb-5">Son Hareketler</h2>
            {activity.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-3 border-b border-[#f3ebe0] last:border-0"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${a.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px]">
                    <span className="font-bold text-[#2a1f14]">{a.who}</span>{" "}
                    <span className="text-[#7a6a5a]">{a.what}</span>
                  </div>
                  <div className="text-[10.5px] text-[#a89789] tabular-nums">{a.t}</div>
                </div>
                <div className="text-[13px] font-bold tabular-nums text-[#d97050]">
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
