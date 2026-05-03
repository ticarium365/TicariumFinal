import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  [
    "inline-flex max-w-max shrink-0 items-center gap-[var(--spacing-2)] whitespace-nowrap",
    "rounded-[var(--radius-sm)] border font-[var(--font-weight-semibold)] transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-brand-500)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface-card)]",
  ].join(" "),
  {
    variants: {
      tone: {
        success:
          "border-transparent bg-[var(--color-semantic-success)] text-[color:var(--color-semantic-success-fg)]",
        warning:
          "border-transparent bg-[var(--color-semantic-warning)] text-[color:var(--color-semantic-warning-fg)]",
        danger:
          "border-transparent bg-[var(--color-semantic-danger)] text-[color:var(--color-semantic-danger-fg)]",
        info: "border-transparent bg-[var(--color-semantic-info)] text-[color:var(--color-semantic-info-fg)]",
        neutral:
          "border-[color:var(--color-border-subtle)] bg-[var(--color-neutral-100)] text-[color:var(--color-neutral-800)]",
        brand:
          "border-transparent bg-[var(--color-brand-500)] text-[color:var(--color-semantic-info-fg)]",
        /** @deprecated use `brand` */
        default:
          "border-transparent bg-[var(--color-brand-500)] text-[color:var(--color-semantic-info-fg)]",
        /** @deprecated use `neutral` */
        secondary:
          "border-[color:var(--color-border-subtle)] bg-[var(--color-neutral-100)] text-[color:var(--color-neutral-800)]",
        /** @deprecated use `danger` */
        destructive:
          "border-transparent bg-[var(--color-semantic-danger)] text-[color:var(--color-semantic-danger-fg)]",
        /** @deprecated use `neutral` with outline feel */
        outline:
          "border-[color:var(--color-border-subtle)] bg-transparent text-[color:var(--color-neutral-800)]",
      },
      size: {
        sm: "px-2 py-0.5 text-[length:var(--font-size-xs)] leading-[var(--line-height-tight)] [&_[data-badge-dot]]:size-1.5",
        md: "px-2.5 py-1 text-[length:var(--font-size-sm)] leading-[var(--line-height-tight)] [&_[data-badge-dot]]:size-2",
      },
      dot: {
        true: "pl-2",
        false: "",
      },
    },
    compoundVariants: [
      {
        dot: true,
        size: "sm",
        class: "gap-1.5",
      },
    ],
    defaultVariants: {
      tone: "neutral",
      size: "sm",
      dot: false,
    },
  }
)

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>["size"]>

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
    VariantProps<typeof badgeVariants> {
  /** Semantic color; alias of `tone` for shadcn-style `variant` prop */
  variant?: BadgeTone | "default" | "secondary" | "destructive" | "outline"
  children?: React.ReactNode
  /** Colored circle before label text */
  dot?: boolean
}

function Badge({
  className,
  tone,
  variant,
  size,
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const resolvedTone = (tone ?? variant ?? "neutral") as NonNullable<
    VariantProps<typeof badgeVariants>["tone"]
  >

  return (
    <div
      className={cn(badgeVariants({ tone: resolvedTone, size, dot }), className)}
      {...props}
    >
      {dot ? (
        <>
          <span
            data-badge-dot=""
            aria-hidden
            className={cn(
              "inline-block shrink-0 rounded-[var(--radius-full)] bg-current opacity-90"
            )}
          />
          {children}
        </>
      ) : (
        children
      )}
    </div>
  )
}

export { Badge, badgeVariants }
