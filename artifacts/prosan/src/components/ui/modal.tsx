"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const modalWidthClass = {
  sm: "w-[min(100%,400px)] max-w-[400px]",
  md: "w-[min(100%,560px)] max-w-[560px]",
  lg: "w-[min(100%,720px)] max-w-[720px]",
} as const

export type ModalSize = keyof typeof modalWidthClass

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: React.ReactNode
  /** Shown under title (e.g. helper copy). Uses Radix Description for a11y when set. */
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: ModalSize
  className?: string
  contentClassName?: string
  /** Default true — matches click-outside to close */
  closeOnOverlayClick?: boolean
}

const ModalOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[color:color-mix(in_srgb,var(--color-neutral-900)_52%,transparent)]",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
ModalOverlay.displayName = DialogPrimitive.Overlay.displayName

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  contentClassName,
  closeOnOverlayClick = true,
}: ModalProps) {
  const showHeader = title != null || description != null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <ModalOverlay />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => {
            if (!closeOnOverlayClick) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (!closeOnOverlayClick) e.preventDefault()
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,900px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)] shadow-[var(--shadow-lg)] duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            modalWidthClass[size],
            className
          )}
        >
          {showHeader ? (
            <div
              className={cn(
                "flex shrink-0 items-start justify-between gap-[var(--spacing-4)] border-b border-[color:var(--color-border-subtle)] px-[var(--spacing-6)] py-[var(--spacing-4)]"
              )}
            >
              <div className="min-w-0 flex-1 space-y-[var(--spacing-2)]">
                {title != null ? (
                  <DialogPrimitive.Title
                    className={cn(
                      "text-[length:var(--font-size-lg)] font-[var(--font-weight-semibold)] leading-[var(--line-height-tight)] text-[color:var(--color-neutral-900)]"
                    )}
                  >
                    {title}
                  </DialogPrimitive.Title>
                ) : (
                  <DialogPrimitive.Title className="sr-only">
                    İletişim kutusu
                  </DialogPrimitive.Title>
                )}
                {description != null ? (
                  <DialogPrimitive.Description
                    className={cn(
                      "text-[length:var(--font-size-sm)] text-[color:var(--color-neutral-600)]"
                    )}
                  >
                    {description}
                  </DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only" />
                )}
              </div>
              <DialogPrimitive.Close
                type="button"
                className={cn(
                  "shrink-0 rounded-[var(--radius-sm)] p-1 text-[color:var(--color-neutral-600)] transition-colors",
                  "hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_12%,var(--color-surface-card))] hover:text-[color:var(--color-neutral-900)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-brand-500)_35%,transparent)]"
                )}
                aria-label="Kapat"
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
          ) : (
            <>
              <DialogPrimitive.Title className="sr-only">Modal</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only" />
              <div className="absolute right-[var(--spacing-3)] top-[var(--spacing-3)] z-10">
                <DialogPrimitive.Close
                  type="button"
                  className={cn(
                    "rounded-[var(--radius-sm)] p-1 text-[color:var(--color-neutral-600)] transition-colors",
                    "hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_12%,var(--color-surface-card))] hover:text-[color:var(--color-neutral-900)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-brand-500)_35%,transparent)]"
                  )}
                  aria-label="Kapat"
                >
                  <X className="size-5" />
                </DialogPrimitive.Close>
              </div>
            </>
          )}
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto px-[var(--spacing-6)] py-[var(--spacing-4)]",
              !showHeader && "pt-[var(--spacing-10)]",
              contentClassName
            )}
          >
            {children}
          </div>
          {footer != null ? (
            <div
              className={cn(
                "flex shrink-0 flex-col-reverse gap-[var(--spacing-2)] border-t border-[color:var(--color-border-subtle)] px-[var(--spacing-6)] py-[var(--spacing-4)] sm:flex-row sm:justify-end"
              )}
            >
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

