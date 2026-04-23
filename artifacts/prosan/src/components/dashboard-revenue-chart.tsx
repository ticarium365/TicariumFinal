import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export type RevenueChartRow = {
  date: string;
  revenue: number;
  profit: number;
  count: number;
  label: string;
};

const fmt = (v: number) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₺";

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return String(v);
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as RevenueChartRow | undefined;
  if (!row?.date) return null;
  const date = new Date(row.date + "T00:00:00");
  const day = date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm min-w-[140px]">
      <p className="font-semibold mb-2 text-foreground">{day}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex justify-between gap-4 text-xs">
          <span style={{ color: entry.color }}>{entry.name === "revenue" ? "Ciro" : "Kâr"}</span>
          <span className="font-mono font-medium">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardRevenueChart({ data }: { data: RevenueChartRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          Son 30 Gün — Ciro & Kâr
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtShort}
              width={42}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(v) => (v === "revenue" ? "Ciro" : "Kâr")}
            />
            <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#colorRevenue)" dot={false} />
            <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#colorProfit)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
