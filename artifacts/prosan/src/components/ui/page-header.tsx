import * as React from "react"

import { cn } from "@/lib/utils"

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Typically action buttons (e.g. `Button`/`Button` group) */
  right?: React.ReactNode
}

export function PageHeader({
  title,
  subtitle,
  right,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-[var(--spacing-3)] pb-[var(--spacing-4)] sm:flex-row sm:items-start sm:justify-between sm:gap-[var(--spacing-6)]",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1 space-y-[var(--spacing-2)]">
        <h1
          className={cn(
            "text-[length:var(--font-size-3xl)] font-[var(--font-weight-bold)] tracking-tight text-[color:var(--color-neutral-900)]"
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={cn(
              "max-w-2xl text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] text-[color:var(--color-neutral-600)]"
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {right != null ? (
        <div className="flex shrink-0 flex-wrap items-center gap-[var(--spacing-2)] sm:justify-end">
          {right}
        </div>
      ) : null}
    </header>
  )
}
