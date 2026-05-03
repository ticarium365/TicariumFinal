import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { formatTryCurrency, formatTrDate } from "@/lib/finance-intl";

export type FinanceCashflowDay = {
  date: string;
  inflow?: number;
  outflow?: number;
  net: number;
  in?: number;
  out?: number;
};

export function FinanceDashboardCashflowChart({ data }: { data: FinanceCashflowDay[] }) {
  if (data.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-12">Henüz banka hareketi yok.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-mint)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-chart-mint)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-coral)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-chart-coral)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => formatTrDate(d as string, { day: "2-digit", month: "2-digit" })}
          fontSize={11}
        />
        <YAxis tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`} fontSize={11} />
        <Tooltip
          formatter={(v: number) => formatTryCurrency(Number(v), 2)}
          labelFormatter={(d) => formatTrDate(d as string)}
        />
        <Area type="monotone" dataKey="inflow" stroke="var(--color-chart-mint)" fill="url(#gIn)" name="Giriş" />
        <Area type="monotone" dataKey="outflow" stroke="var(--color-chart-coral)" fill="url(#gOut)" name="Çıkış" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
