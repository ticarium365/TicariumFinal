import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-[length:var(--font-weight-medium)]",
    "transition-colors duration-150 ease-out",
    "transition-transform duration-[80ms] ease-out active:scale-[0.97] motion-reduce:active:scale-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-brand-500)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface-card)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "border border-transparent bg-[var(--color-brand-500)] text-[color:var(--color-semantic-info-fg)] hover:bg-[var(--color-brand-700)] active:opacity-[0.92]",
        secondary:
          "border border-[color:var(--color-border-subtle)] bg-[var(--color-neutral-100)] text-[color:var(--color-neutral-900)] hover:bg-[var(--color-neutral-200)] active:opacity-[0.92]",
        ghost:
          "border border-transparent bg-transparent text-[color:var(--color-neutral-700)] hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_10%,var(--color-surface-card))] active:bg-[color-mix(in_srgb,var(--color-neutral-500)_14%,var(--color-surface-card))]",
        danger:
          "border border-transparent bg-[var(--color-semantic-danger)] text-[color:var(--color-semantic-danger-fg)] hover:opacity-90 active:opacity-[0.88]",
        link: "border-0 bg-transparent p-0 h-auto min-h-0 text-[color:var(--color-brand-700)] underline-offset-4 hover:underline active:opacity-80",
        /** @deprecated use `primary` — shadcn / legacy */
        default:
          "border border-transparent bg-[var(--color-brand-500)] text-[color:var(--color-semantic-info-fg)] hover:bg-[var(--color-brand-700)] active:opacity-[0.92]",
        /** @deprecated use `danger` */
        destructive:
          "border border-transparent bg-[var(--color-semantic-danger)] text-[color:var(--color-semantic-danger-fg)] hover:opacity-90 active:opacity-[0.88]",
        /** @deprecated use `secondary` */
        outline:
          "border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)] text-[color:var(--color-neutral-900)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-neutral-100)] active:opacity-95",
      },
      size: {
        sm: "min-h-[28px] h-[28px] gap-1.5 rounded-[var(--radius-sm)] px-3 text-[length:var(--font-size-xs)] [&_svg]:size-3.5",
        md: "min-h-[36px] h-[36px] gap-2 rounded-[var(--radius-md)] px-4 text-[length:var(--font-size-sm)] [&_svg]:size-4",
        lg: "min-h-[44px] h-[44px] gap-2 rounded-[var(--radius-md)] px-5 text-[length:var(--font-size-base)] [&_svg]:size-4",
        /** @deprecated — icon square, md height */
        icon: "size-9 min-h-[36px] min-w-[36px] rounded-[var(--radius-md)] p-0 [&_svg]:size-4",
        /** legacy shadcn default height */
        default:
          "min-h-[36px] h-[36px] gap-2 rounded-[var(--radius-md)] px-4 py-2 text-[length:var(--font-size-sm)] [&_svg]:size-4",
      },
    },
    compoundVariants: [
      {
        variant: "primary",
        class:
          "focus-visible:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-500)]",
      },
      {
        variant: "default",
        class:
          "focus-visible:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-500)]",
      },
      {
        variant: "link",
        size: "sm",
        class: "text-[length:var(--font-size-xs)]",
      },
      {
        variant: "link",
        size: "md",
        class: "text-[length:var(--font-size-sm)]",
      },
      {
        variant: "link",
        size: "lg",
        class: "text-[length:var(--font-size-base)]",
      },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export type ButtonStyleVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
export type ButtonStyleSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  children?: React.ReactNode
  /** Prepended icon (hidden when `loading` — spinner takes this slot) */
  leftIcon?: React.ReactNode
  /** Appended icon (hidden when `loading`) */
  rightIcon?: React.ReactNode
  loading?: boolean
  fullWidth?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      leftIcon,
      rightIcon,
      loading = false,
      fullWidth,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const v = variant ?? "primary"
    const s = size ?? "md"
    const Comp = asChild ? Slot : "button"

    if (asChild) {
      return (
        <Comp
          className={cn(
            buttonVariants({ variant: v, size: s }),
            fullWidth && "w-full",
            loading && "pointer-events-none opacity-60",
            className
          )}
          ref={ref}
          aria-busy={loading || undefined}
          {...props}
        >
          {children}
        </Comp>
      )
    }

    const inner = loading ? (
      <>
        <Spinner className={cn(s === "sm" && "size-3.5", s === "lg" && "size-[1.125rem]")} />
        {children}
      </>
    ) : (
      <>
        {leftIcon}
        {children}
        {rightIcon}
      </>
    )

    return (
      <Comp
        className={cn(
          buttonVariants({ variant: v, size: s }),
          fullWidth && "w-full",
          loading && "cursor-wait",
          className
        )}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {inner}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
