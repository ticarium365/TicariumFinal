import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Loader2, BarChart3, Search } from "lucide-react";

type Row = {
  companyId: number;
  companyName: string;
  subdomain: string;
  sector: string | null;
  scorePercent: number;
  itemsDone: number;
  itemsTotal: number;
  categories: { id: string; label: string; scorePercent: number }[];
  missing: string[];
};

type Data = {
  totalTenants: number;
  avgScore: number;
  rows: Row[];
};

function colorFor(p: number) {
  if (p >= 80) return "bg-emerald-500";
  if (p >= 50) return "bg-blue-600";
  if (p >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function badgeColor(p: number) {
  if (p >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (p >= 50) return "bg-blue-100 text-blue-800 border-blue-300";
  if (p >= 25) return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-red-100 text-red-800 border-red-300";
}

export default function MusteriDoluluk() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/musteri-doluluk", { credentials: "include" })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor...
      </div>
    );
  }

  const filtered = data.rows.filter((r) =>
    !q ||
    r.companyName.toLowerCase().includes(q.toLowerCase()) ||
    r.subdomain.toLowerCase().includes(q.toLowerCase()) ||
    (r.sector ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="h-8 w-8 text-blue-700" />
          Müşteri Doluluk Tablosu
        </h1>
        <p className="text-slate-600 mt-1">
          Tüm tenantların kurulum & kullanım skoru. Düşük skorlu müşteriler önce listelenir —
          onboarding ekibinin önceliklendirmesi için.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="text-xs text-blue-700 font-semibold uppercase">Toplam Tenant</div>
            <div className="text-3xl font-bold text-blue-900">{data.totalTenants}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4">
            <div className="text-xs text-emerald-700 font-semibold uppercase">Ortalama Skor</div>
            <div className="text-3xl font-bold text-emerald-900">%{data.avgScore}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="text-xs text-red-700 font-semibold uppercase">%50 Altı (Acil)</div>
            <div className="text-3xl font-bold text-red-900">
              {data.rows.filter((r) => r.scorePercent < 50).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <Input
              placeholder="Tenant veya sektör ara..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-sm"
            />
          </CardTitle>
          <CardDescription>
            {filtered.length} tenant gösteriliyor (toplam {data.rows.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 px-2">Tenant</th>
                  <th className="py-2 px-2">Sektör</th>
                  <th className="py-2 px-2 w-[200px]">Skor</th>
                  <th className="py-2 px-2">Profil</th>
                  <th className="py-2 px-2">Veri</th>
                  <th className="py-2 px-2">Kullanım</th>
                  <th className="py-2 px-2">Yapılması Gerekenler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.companyId} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-2">
                      <div className="font-semibold text-slate-900">{r.companyName}</div>
                      <div className="text-xs text-slate-500">{r.subdomain}</div>
                    </td>
                    <td className="py-3 px-2">
                      {r.sector ? (
                        <Badge variant="outline">{r.sector}</Badge>
                      ) : (
                        <span className="text-slate-400 text-xs italic">girilmedi</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <Badge className={badgeColor(r.scorePercent)}>
                          %{r.scorePercent}
                        </Badge>
                        <div className="flex-1 h-2 bg-slate-200 rounded overflow-hidden">
                          <div
                            className={`h-full ${colorFor(r.scorePercent)} transition-all`}
                            style={{ width: `${r.scorePercent}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {r.itemsDone}/{r.itemsTotal} öğe
                      </div>
                    </td>
                    {r.categories.map((c) => (
                      <td key={c.id} className="py-3 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${badgeColor(c.scorePercent)}`}>
                          %{c.scorePercent}
                        </span>
                      </td>
                    ))}
                    <td className="py-3 px-2 max-w-[260px]">
                      {r.missing.length === 0 ? (
                        <span className="text-emerald-700 text-xs">— tamam —</span>
                      ) : (
                        <div className="text-xs text-slate-600 line-clamp-3" title={r.missing.join(" · ")}>
                          {r.missing.slice(0, 3).join(" · ")}
                          {r.missing.length > 3 && ` +${r.missing.length - 3} daha`}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
