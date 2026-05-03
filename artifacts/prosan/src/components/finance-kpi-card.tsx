import * as React from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface FinanceKpiCardProps {
  label: string
  value: React.ReactNode
  sublabel?: React.ReactNode
  /** Positive = up (green), negative = down (red); omit to hide trend row */
  trendPct?: number | null
  className?: string
}

export function FinanceKpiCard({
  label,
  value,
  sublabel,
  trendPct,
  className,
}: FinanceKpiCardProps) {
  const up = trendPct != null && trendPct > 0
  const down = trendPct != null && trendPct < 0
  return (
    <Card
      variant="flat"
      className={cn(
        "border border-[color:var(--color-border-subtle)] shadow-none",
        className
      )}
    >
      <div className="space-y-1 p-4">
        <div className="text-[length:12px] font-medium leading-tight text-[color:var(--color-neutral-600)]">
          {label}
        </div>
        <div className="text-[length:32px] font-bold leading-none tracking-tight text-[color:var(--color-neutral-900)]">
          {value}
        </div>
        {trendPct != null && Number.isFinite(trendPct) && (
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-semibold",
              up && "text-[var(--color-semantic-success)]",
              down && "text-[var(--color-semantic-danger)]",
              !up && !down && "text-[color:var(--color-neutral-600)]"
            )}
          >
            {up ? (
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
            ) : down ? (
              <ArrowDownRight className="h-4 w-4 shrink-0" aria-hidden />
            ) : null}
            <span>
              {trendPct > 0 ? "+" : ""}
              {trendPct.toFixed(1)}%
            </span>
          </div>
        )}
        {sublabel ? (
          <div className="pt-0.5 text-[11px] text-[color:var(--color-neutral-500)]">
            {sublabel}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
