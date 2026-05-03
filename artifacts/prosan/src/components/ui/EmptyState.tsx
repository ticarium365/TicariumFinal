"use client"

import * as React from "react"
import { Link } from "wouter"
import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type EmptyStateAction = {
  label: string
  onClick?: () => void
  href?: string
  testId?: string
}

export type EmptyStateProps = {
  /** Lucide icon component — renders at 48×48px */
  icon?: LucideIcon
  title: string
  description: string
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const primaryClassName =
    "bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-nav-text-active)]"

  const renderAction = (a: EmptyStateAction, variant: "primary" | "outline") => {
    const isOutline = variant === "outline"
    if (a.href) {
      return (
        <Button
          asChild
          size="sm"
          variant={isOutline ? "outline" : "default"}
          className={!isOutline ? primaryClassName : undefined}
        >
          <Link href={a.href} data-testid={a.testId}>
            {a.label}
          </Link>
        </Button>
      )
    }
    return (
      <Button
        type="button"
        size="sm"
        variant={isOutline ? "outline" : "default"}
        className={!isOutline ? primaryClassName : undefined}
        onClick={a.onClick}
        data-testid={a.testId}
      >
        {a.label}
      </Button>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-10 text-center",
        className
      )}
      data-testid="empty-state"
    >
      <Icon
        className="h-12 w-12 shrink-0 text-[color:var(--color-neutral-400)]"
        aria-hidden
      />
      <h3 className="mt-4 text-base font-semibold text-[color:var(--color-neutral-900)]">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-[color:var(--color-neutral-500)]">
        {description}
      </p>
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action ? renderAction(action, "primary") : null}
          {secondaryAction ? renderAction(secondaryAction, "outline") : null}
        </div>
      )}
    </div>
  )
}
