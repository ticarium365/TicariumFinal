"use client"

import * as React from "react"
import { format } from "date-fns"
import { tr } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatTrDate } from "@/lib/finance-intl"

export type FinanceDateRangeValue = { from: Date; to: Date }

function toYmd(d: Date) {
  return format(d, "yyyy-MM-dd")
}

export interface DateRangePickerProps {
  value: FinanceDateRangeValue
  onChange: (next: FinanceDateRangeValue) => void
  className?: string
  align?: "start" | "center" | "end"
  disabled?: boolean
  /** Compact label using Turkish short date */
  useShortLabel?: boolean
}

export function DateRangePicker({
  value,
  onChange,
  className,
  align = "start",
  disabled,
  useShortLabel,
}: DateRangePickerProps) {
  const range: DateRange = { from: value.from, to: value.to }
  const label =
    useShortLabel
      ? `${formatTrDate(value.from, { day: "2-digit", month: "short" })} — ${formatTrDate(value.to, { day: "2-digit", month: "short", year: "numeric" })}`
      : `${toYmd(value.from)} — ${toYmd(value.to)}`
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          className={cn("justify-start text-left font-normal", className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) => {
            if (!r?.from) return
            const to = r.to ?? r.from
            onChange({ from: r.from, to })
          }}
          numberOfMonths={2}
          locale={tr}
        />
      </PopoverContent>
    </Popover>
  )
}

/** yyyy-MM-dd pair for API query strings */
export function financeRangeToApiStrings(r: FinanceDateRangeValue) {
  return { startDate: toYmd(r.from), endDate: toYmd(r.to) }
}
