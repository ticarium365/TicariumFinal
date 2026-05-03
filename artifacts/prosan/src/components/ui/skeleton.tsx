"use client"

import * as React from "react"
import { useLayoutEffect } from "react"
import { cn } from "@/lib/utils"

const STYLE_ID = "t365-skeleton-keyframes"

function injectKeyframesOnce() {
  if (typeof document === "undefined") return
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement("style")
  el.id = STYLE_ID
  el.textContent = `
@keyframes t365-skel-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
@keyframes t365-skel-shimmer {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
}
`
  document.head.appendChild(el)
}

function SkeletonSurface({
  className,
  style,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  useLayoutEffect(() => {
    injectKeyframesOnce()
  }, [])

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        backgroundColor: "var(--color-neutral-100)",
        animation: "t365-skel-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[55%]"
        style={{
          background:
            "linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.48) 50%, transparent 75%)",
          animation: "t365-skel-shimmer 1.5s ease-in-out infinite",
        }}
      />
      {children}
    </div>
  )
}

export type SkeletonLineProps = {
  width?: React.CSSProperties["width"]
  height?: React.CSSProperties["height"]
  borderRadius?: React.CSSProperties["borderRadius"]
  className?: string
}

export function SkeletonLine({
  width = "100%",
  height = 16,
  borderRadius = 4,
  className,
}: SkeletonLineProps) {
  return (
    <SkeletonSurface
      className={cn("inline-block max-w-full align-middle", className)}
      style={{ width, height, borderRadius }}
    />
  )
}

export type SkeletonBlockProps = {
  width: React.CSSProperties["width"]
  height: React.CSSProperties["height"]
  borderRadius?: React.CSSProperties["borderRadius"]
  className?: string
}

export function SkeletonBlock({
  width,
  height,
  borderRadius = 4,
  className,
}: SkeletonBlockProps) {
  return (
    <SkeletonSurface
      className={cn(className)}
      style={{ width, height, borderRadius }}
    />
  )
}

export type SkeletonTableProps = {
  rows?: number
  columns?: number
  /** Matches DataTable body row height */
  rowHeight?: number
  showHeader?: boolean
  className?: string
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  rowHeight = 40,
  showHeader = true,
  className,
}: SkeletonTableProps) {
  useLayoutEffect(() => {
    injectKeyframesOnce()
  }, [])

  return (
    <div
      className={cn(
        "flex flex-col overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)]",
        className
      )}
      aria-busy
      aria-label="Yükleniyor"
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-[length:var(--font-size-sm)]">
        {showHeader ? (
          <thead>
            <tr className="border-b border-[color:var(--color-border-subtle)]">
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-[var(--spacing-3)] py-[var(--spacing-3)]">
                  <SkeletonLine
                    height={14}
                    borderRadius={4}
                    width={i === 0 ? "48%" : `${58 + ((i * 7) % 15)}%`}
                  />
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {Array.from({ length: rows }).map((_, ri) => (
            <tr
              key={ri}
              className="border-b border-[color:var(--color-border-subtle)]"
              style={{ height: rowHeight }}
            >
              {Array.from({ length: columns }).map((_, ci) => (
                <td key={ci} className="px-[var(--spacing-3)] align-middle">
                  <SkeletonLine
                    height={16}
                    borderRadius={4}
                    width={
                      ci === columns - 1 ? "72%" : ci === 0 ? "88%" : `${65 + ((ri + ci * 3) % 25)}%`
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Legacy generic placeholder — pricing/sidebar/super-admin */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
