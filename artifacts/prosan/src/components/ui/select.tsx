"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { cva, type VariantProps } from "class-variance-authority"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const selectTriggerVariants = cva(
  [
    "flex w-full min-w-0 items-center justify-between gap-[var(--spacing-2)] whitespace-nowrap rounded-[var(--radius-md)] border bg-[var(--color-surface-card)]",
    "px-[var(--spacing-3)] text-left text-[color:var(--color-neutral-900)] shadow-[var(--shadow-sm)] transition-[color,box-shadow,border-color,opacity]",
    "data-[placeholder]:text-[color:var(--color-neutral-500)]",
    "focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-brand-500)_35%,transparent)]",
    "disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-8 min-h-[32px] text-[length:var(--font-size-xs)] [&_svg]:size-3.5",
        md: "h-9 min-h-[36px] text-[length:var(--font-size-sm)] [&_svg]:size-4",
      },
      error: {
        true: "border-[var(--color-semantic-danger)] focus:border-[var(--color-semantic-danger)] focus:ring-[color:color-mix(in_srgb,var(--color-semantic-danger)_35%,transparent)]",
        false: "border-[color:var(--color-border-subtle)]",
      },
    },
    defaultVariants: {
      size: "md",
      error: false,
    },
  }
)

export type SelectTriggerSize = NonNullable<
  VariantProps<typeof selectTriggerVariants>["size"]
>

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> &
    VariantProps<typeof selectTriggerVariants>
>(({ className, children, size, error, ...props }, ref) => {
  const hasError = Boolean(error)
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        selectTriggerVariants({ size, error: hasError }),
        className
      )}
      aria-invalid={hasError || undefined}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="shrink-0 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="size-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="size-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-[min(var(--radix-select-content-available-height),24rem)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-card)] text-[color:var(--color-neutral-900)] shadow-[var(--shadow-md)]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold)]",
      className
    )}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-[var(--radius-sm)] py-1.5 pl-2 pr-8 text-[length:var(--font-size-sm)] outline-none",
      "focus:bg-[color-mix(in_srgb,var(--color-neutral-500)_10%,var(--color-surface-card))] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn(
      "-mx-1 my-1 h-px bg-[color:var(--color-border-subtle)]",
      className
    )}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export interface SelectFieldProps {
  label?: string
  helperText?: string
  error?: string
  leftIcon?: React.ReactNode
  size?: SelectTriggerSize
  id?: string
  fullWidth?: boolean
  placeholder?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  name?: string
  children: React.ReactNode
}

function SelectField({
  label,
  helperText,
  error: errorMessage,
  leftIcon,
  size = "md",
  id: idProp,
  fullWidth = true,
  placeholder,
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  name,
  children,
}: SelectFieldProps) {
  const genId = React.useId()
  const id = idProp ?? genId
  const hasError = Boolean(errorMessage)
  const footnote = hasError ? errorMessage : helperText

  const padL =
    leftIcon != null
      ? size === "sm"
        ? "pl-8"
        : "pl-9"
      : undefined

  return (
    <div
      className={cn(
        fullWidth && "w-full",
        "flex flex-col gap-[var(--spacing-2)]"
      )}
    >
      {label ? (
        <label
          htmlFor={id}
          className="block text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-[color:var(--color-neutral-800)]"
        >
          {label}
          {required ? (
            <span className="text-[color:var(--color-semantic-danger)]"> *</span>
          ) : null}
        </label>
      ) : null}
      <Select
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        name={name}
        required={required}
      >
        <div className={cn("relative", fullWidth && "w-full")}>
          {leftIcon != null ? (
            <span
              className={cn(
                "pointer-events-none absolute left-[var(--spacing-3)] top-1/2 z-10 -translate-y-1/2 text-[color:var(--color-neutral-500)] [&_svg]:size-4",
                size === "sm" && "left-2 [&_svg]:size-3.5"
              )}
            >
              {leftIcon}
            </span>
          ) : null}
          <SelectTrigger
            id={id}
            size={size}
            error={hasError}
            className={padL}
            aria-describedby={footnote ? `${id}-hint` : undefined}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
        </div>
        <SelectContent>{children}</SelectContent>
      </Select>
      {footnote ? (
        <p
          id={`${id}-hint`}
          role={hasError ? "alert" : undefined}
          className={cn(
            "text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-600)]",
            hasError &&
              "font-[var(--font-weight-medium)] text-[color:var(--color-semantic-danger)]"
          )}
        >
          {footnote}
        </p>
      ) : null}
    </div>
  )
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SelectField,
  selectTriggerVariants,
}
