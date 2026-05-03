"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

export type SortDir = "asc" | "desc" | null

export interface DataTableColumn<T> {
  id: string
  header: React.ReactNode
  cell: (row: T, rowIndex: number) => React.ReactNode
  sortable?: boolean
  /** Used when `sortable`; default: raw value access via id if row is object */
  sortValue?: (row: T) => string | number | boolean | null | undefined
  className?: string
  headerClassName?: string
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataTableColumn<T>>
  data: readonly T[]
  getRowId: (row: T, index: number) => string
  loading?: boolean
  emptyState?: React.ReactNode
  className?: string
  /** Initial selection — uncontrolled (ignored when `controlledSelection` is set) */
  defaultSelectedIds?: ReadonlySet<string> | readonly string[]
  /** Hide the leading checkbox column */
  enableRowSelection?: boolean
  /** Hide built-in client pagination footer (show all rows in `data`) */
  showFooterPagination?: boolean
  /** Controlled row selection (e.g. sync with bulk actions) */
  controlledSelection?: {
    selectedIds: ReadonlySet<string>
    onSelectedIdsChange: (next: Set<string>) => void
  }
}

function toSet(ids?: ReadonlySet<string> | readonly string[]): Set<string> {
  if (!ids) return new Set()
  return ids instanceof Set ? new Set(ids) : new Set(ids)
}

function defaultSortValue<T>(row: T, columnId: string): unknown {
  if (row != null && typeof row === "object" && columnId in (row as object)) {
    return (row as Record<string, unknown>)[columnId]
  }
  return undefined
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading = false,
  emptyState,
  className,
  defaultSelectedIds,
  enableRowSelection = true,
  showFooterPagination = true,
  controlledSelection,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<{
    id: string | null
    dir: SortDir
  }>({ id: null, dir: null })
  const sortColumnId = sort.id
  const sortDir = sort.dir
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  const [internalSelected, setInternalSelected] = React.useState<Set<string>>(
    () => toSet(defaultSelectedIds)
  )

  const selected = controlledSelection
    ? controlledSelection.selectedIds
    : internalSelected

  const sortedData = React.useMemo(() => {
    if (!sortColumnId || !sortDir) return [...data]
    const col = columns.find((c) => c.id === sortColumnId)
    if (!col?.sortable) return [...data]
    const accessor = col.sortValue
      ? col.sortValue
      : (row: T) =>
          defaultSortValue(row, col.id) as
            | string
            | number
            | boolean
            | null
            | undefined
    const copy = [...data]
    copy.sort((ra, rb) => {
      const cmp = compareValues(accessor(ra), accessor(rb))
      return sortDir === "asc" ? cmp : -cmp
    })
    return copy
  }, [columns, data, sortColumnId, sortDir])

  const pageCount = showFooterPagination
    ? Math.max(1, Math.ceil(sortedData.length / pageSize))
    : 1
  const safePage = Math.min(pageIndex, pageCount - 1)
  const pageData = React.useMemo(() => {
    if (!showFooterPagination) return sortedData
    const p = Math.min(pageIndex, Math.max(0, pageCount - 1))
    const start = p * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [
    pageIndex,
    pageCount,
    pageSize,
    sortedData,
    showFooterPagination,
  ])

  React.useEffect(() => {
    if (!showFooterPagination) return
    if (pageIndex > pageCount - 1) {
      setPageIndex(Math.max(0, pageCount - 1))
    }
  }, [pageCount, pageIndex, showFooterPagination])

  const allPageSelected =
    enableRowSelection &&
    pageData.length > 0 &&
    pageData.every((row, i) => {
      const globalIndex = showFooterPagination ? safePage * pageSize + i : i
      const id = getRowId(row, globalIndex)
      return selected.has(id)
    })
  const somePageSelected =
    enableRowSelection &&
    pageData.some((row, i) => {
      const globalIndex = showFooterPagination ? safePage * pageSize + i : i
      return selected.has(getRowId(row, globalIndex))
    })

  function toggleSort(columnId: string) {
    const col = columns.find((c) => c.id === columnId)
    if (!col?.sortable) return
    setSort((s) => {
      if (s.id !== columnId) return { id: columnId, dir: "asc" }
      if (s.dir === "asc") return { id: columnId, dir: "desc" }
      if (s.dir === "desc") return { id: null, dir: null }
      return { id: columnId, dir: "asc" }
    })
  }

  function toggleRow(id: string, checked: boolean) {
    if (controlledSelection) {
      const next = new Set(controlledSelection.selectedIds)
      if (checked) next.add(id)
      else next.delete(id)
      controlledSelection.onSelectedIdsChange(next)
    } else {
      setInternalSelected((prev) => {
        const next = new Set(prev)
        if (checked) next.add(id)
        else next.delete(id)
        return next
      })
    }
  }

  function toggleAllPage(checked: boolean) {
    if (controlledSelection) {
      const next = new Set(controlledSelection.selectedIds)
      pageData.forEach((row, i) => {
        const globalIndex = showFooterPagination
          ? safePage * pageSize + i
          : i
        const id = getRowId(row, globalIndex)
        if (checked) next.add(id)
        else next.delete(id)
      })
      controlledSelection.onSelectedIdsChange(next)
    } else {
      setInternalSelected((prev) => {
        const next = new Set(prev)
        pageData.forEach((row, i) => {
          const globalIndex = showFooterPagination
            ? safePage * pageSize + i
            : i
          const id = getRowId(row, globalIndex)
          if (checked) next.add(id)
          else next.delete(id)
        })
        return next
      })
    }
  }

  const showEmpty = !loading && sortedData.length === 0

  return (
    <div
      className={cn(
        "flex flex-col gap-[var(--spacing-4)] rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)]",
        className
      )}
    >
      <div className="relative overflow-x-auto">
        {loading ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-[color:color-mix(in_srgb,var(--color-surface-card)_82%,transparent)]"
            aria-busy
            aria-label="Yükleniyor"
          >
            <Spinner className="size-8 text-[color:var(--color-brand-500)]" />
          </div>
        ) : null}
        <table className="w-full min-w-[640px] border-collapse text-left text-[length:var(--font-size-sm)] text-[color:var(--color-neutral-900)]">
          <thead>
            <tr className="border-b border-[color:var(--color-border-subtle)]">
              {enableRowSelection ? (
                <th
                  className={cn(
                    "sticky top-0 z-10 w-10 bg-[var(--color-surface-card)] px-[var(--spacing-3)] py-[var(--spacing-3)] shadow-[inset_0_-1px_0_var(--color-border-subtle)]"
                  )}
                >
                  <Checkbox
                    checked={
                      allPageSelected
                        ? true
                        : somePageSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => toggleAllPage(v === true)}
                    aria-label="Bu sayfadaki tüm satırları seç"
                    className={cn(
                      "border-[color:var(--color-border-subtle)]",
                      "data-[state=checked]:border-[var(--color-brand-500)] data-[state=checked]:bg-[var(--color-brand-500)] data-[state=checked]:text-[color:var(--color-semantic-info-fg)]"
                    )}
                  />
                </th>
              ) : null}
              {columns.map((col) => {
                const active = sortColumnId === col.id
                return (
                  <th
                    key={col.id}
                    className={cn(
                      "sticky top-0 z-10 bg-[var(--color-surface-card)] px-[var(--spacing-3)] py-[var(--spacing-3)] font-[var(--font-weight-semibold)] shadow-[inset_0_-1px_0_var(--color-border-subtle)]",
                      col.headerClassName
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={cn(
                          "inline-flex items-center gap-1 text-[color:var(--color-neutral-800)] transition-colors hover:text-[color:var(--color-neutral-900)]",
                          "focus-visible:rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-brand-500)_35%,transparent)]"
                        )}
                      >
                        {col.header}
                        {active && sortDir === "asc" ? (
                          <ArrowUp className="size-4 opacity-70" />
                        ) : active && sortDir === "desc" ? (
                          <ArrowDown className="size-4 opacity-70" />
                        ) : (
                          <ArrowUpDown className="size-4 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {showEmpty ? (
              <tr>
                <td
                  colSpan={columns.length + (enableRowSelection ? 1 : 0)}
                  className="px-[var(--spacing-4)] py-[var(--spacing-10)] text-center text-[color:var(--color-neutral-600)]"
                >
                  {emptyState ?? "Gösterilecek kayıt yok."}
                </td>
              </tr>
            ) : (
              pageData.map((row, rowIndex) => {
                const globalIndex = showFooterPagination
                  ? safePage * pageSize + rowIndex
                  : rowIndex
                const id = getRowId(row, globalIndex)
                return (
                  <tr
                    key={id}
                    className={cn(
                      "border-b border-[color:var(--color-border-subtle)] transition-colors",
                      "hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_6%,var(--color-surface-card))]"
                    )}
                  >
                    {enableRowSelection ? (
                      <td className="px-[var(--spacing-3)] py-[var(--spacing-2)] align-middle">
                        <Checkbox
                          checked={selected.has(id)}
                          onCheckedChange={(v) => toggleRow(id, v === true)}
                          aria-label="Satırı seç"
                          className={cn(
                            "border-[color:var(--color-border-subtle)]",
                            "data-[state=checked]:border-[var(--color-brand-500)] data-[state=checked]:bg-[var(--color-brand-500)] data-[state=checked]:text-[color:var(--color-semantic-info-fg)]"
                          )}
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          "px-[var(--spacing-3)] py-[var(--spacing-2)] align-middle text-[color:var(--color-neutral-800)]",
                          col.className
                        )}
                      >
                        {col.cell(row, globalIndex)}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {!showEmpty && showFooterPagination ? (
        <div
          className={cn(
            "flex flex-col gap-[var(--spacing-3)] border-t border-[color:var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] sm:flex-row sm:items-center sm:justify-between"
          )}
        >
          <p className="text-[length:var(--font-size-sm)] text-[color:var(--color-neutral-600)]">
            Toplam {sortedData.length} kayıt
            {sortedData.length > 0 ? (
              <>
                {" "}
                · Sayfa {safePage + 1} / {pageCount}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
            <div className="flex items-center gap-2">
              <span
                id="data-table-page-size-label"
                className="text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-600)]"
              >
                Sayfa başına
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v))
                  setPageIndex(0)
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-[4.5rem]"
                  id="data-table-page-size"
                  aria-labelledby="data-table-page-size-label"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={safePage <= 0}
                className={cn(
                  "rounded-[var(--radius-sm)] border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)] px-2 py-1 text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)]",
                  "text-[color:var(--color-neutral-800)] transition-colors hover:bg-[var(--color-neutral-100)]",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                Önceki
              </button>
              <button
                type="button"
                onClick={() =>
                  setPageIndex((p) => Math.min(pageCount - 1, p + 1))
                }
                disabled={safePage >= pageCount - 1}
                className={cn(
                  "rounded-[var(--radius-sm)] border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)] px-2 py-1 text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)]",
                  "text-[color:var(--color-neutral-800)] transition-colors hover:bg-[var(--color-neutral-100)]",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                Sonraki
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
