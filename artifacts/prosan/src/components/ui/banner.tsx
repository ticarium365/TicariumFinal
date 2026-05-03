import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

const bannerVariants = cva(
  "flex gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-[length:var(--font-size-sm)]",
  {
    variants: {
      variant: {
        danger:
          "border-[color:color-mix(in_srgb,var(--color-semantic-danger)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--color-semantic-danger)_12%,var(--color-surface-card))] text-[color:var(--color-neutral-900)]",
        warning:
          "border-amber-500/40 bg-amber-500/10 text-[color:var(--color-neutral-900)]",
        info:
          "border-[color:var(--color-border-subtle)] bg-[color:color-mix(in_srgb,var(--color-brand-500)_10%,var(--color-surface-card))] text-[color:var(--color-neutral-900)]",
        success:
          "border-emerald-500/35 bg-emerald-500/10 text-[color:var(--color-neutral-900)]",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const icons = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
} as const;

export interface BannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bannerVariants> {
  title?: string;
}

export function Banner({ className, variant = "info", title, children, ...props }: BannerProps) {
  const Icon = icons[variant ?? "info"];
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn(bannerVariants({ variant }), className)}
      {...props}
    >
      <Icon className="h-5 w-5 shrink-0 opacity-80 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? (
          <p className="font-[var(--font-weight-semibold)] leading-snug">{title}</p>
        ) : null}
        {children ? <div className="text-[color:var(--color-neutral-700)] leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
