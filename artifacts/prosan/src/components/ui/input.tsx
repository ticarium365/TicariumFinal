import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  [
    "w-full min-w-0 rounded-[var(--radius-md)] border bg-[var(--color-surface-card)]",
    "text-[color:var(--color-neutral-900)] shadow-[var(--shadow-sm)] transition-[color,box-shadow,border-color,opacity] duration-[120ms] ease-out",
    "placeholder:text-[color:var(--color-neutral-500)]",
    "file:border-0 file:bg-transparent file:text-[length:var(--font-size-sm)] file:font-[var(--font-weight-medium)] file:text-[color:var(--color-neutral-900)]",
    "focus-visible:outline-none focus-visible:border-[var(--color-brand-500)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-brand-500)_35%,transparent)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-8 min-h-[32px] px-[var(--spacing-3)] text-[length:var(--font-size-xs)]",
        md: "h-9 min-h-[36px] px-[var(--spacing-3)] text-[length:var(--font-size-sm)]",
      },
      error: {
        true: "border-[var(--color-semantic-danger)] focus-visible:border-[var(--color-semantic-danger)] focus-visible:ring-[color:color-mix(in_srgb,var(--color-semantic-danger)_35%,transparent)]",
        false: "border-[color:var(--color-border-subtle)]",
      },
    },
    defaultVariants: {
      size: "md",
      error: false,
    },
  }
)

export type InputSize = NonNullable<VariantProps<typeof inputVariants>["size"]>

export interface InputProps extends React.ComponentProps<"input"> {
  /** Visual size — distinct from the native HTML `size` attribute. */
  inputSize?: InputSize
  /** When true or a non-empty string, shows error border; string also renders below the input. */
  error?: boolean | string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", inputSize = "md", size: nativeSize, error, ...props }, ref) => {
    const message = typeof error === "string" ? error.trim() : ""
    const hasError = error === true || Boolean(message)
    const hintId = React.useId()
    const input = (
      <input
        type={type}
        size={nativeSize}
        className={cn(inputVariants({ size: inputSize, error: hasError }), className)}
        ref={ref}
        aria-invalid={hasError || undefined}
        aria-describedby={message ? hintId : undefined}
        {...props}
      />
    )
    if (!message) return input
    return (
      <>
        {input}
        <p
          id={hintId}
          role="alert"
          className="mt-[var(--spacing-1)] text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-[color:var(--color-semantic-danger)]"
        >
          {message}
        </p>
      </>
    )
  }
)
Input.displayName = "Input"

export interface InputFieldProps extends Omit<InputProps, "error"> {
  label?: string
  helperText?: string
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  inputSize?: InputSize
  id?: string
  /** Applies to the outer wrapper */
  fullWidth?: boolean
}

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  (
    {
      label,
      helperText,
      error: errorMessage,
      leftIcon,
      rightIcon,
      inputSize = "md",
      id: idProp,
      fullWidth = true,
      className,
      disabled,
      ...inputProps
    },
    ref
  ) => {
    const genId = React.useId()
    const id = idProp ?? genId
    const hasError = Boolean(errorMessage)
    const footnote = hasError ? errorMessage : helperText

    const padL =
      leftIcon != null
        ? inputSize === "sm"
          ? "pl-8"
          : "pl-9"
        : undefined
    const padR =
      rightIcon != null
        ? inputSize === "sm"
          ? "pr-8"
          : "pr-9"
        : undefined

    return (
      <div
        className={cn(fullWidth && "w-full", "flex flex-col gap-[var(--spacing-2)]")}
      >
        {label ? (
          <label
            htmlFor={id}
            className={cn(
              "block text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-[color:var(--color-neutral-800)]"
            )}
          >
            {label}
          </label>
        ) : null}
        <div className={cn("relative", fullWidth && "w-full")}>
          {leftIcon != null ? (
            <span
              className={cn(
                "pointer-events-none absolute left-[var(--spacing-3)] top-1/2 -translate-y-1/2 text-[color:var(--color-neutral-500)] [&_svg]:size-4",
                inputSize === "sm" && "left-2 [&_svg]:size-3.5"
              )}
            >
              {leftIcon}
            </span>
          ) : null}
          <Input
            id={id}
            ref={ref}
            inputSize={inputSize}
            error={hasError}
            disabled={disabled}
            aria-describedby={footnote ? `${id}-hint` : undefined}
            className={cn(padL, padR, className)}
            {...inputProps}
          />
          {rightIcon != null ? (
            <span
              className={cn(
                "pointer-events-none absolute right-[var(--spacing-3)] top-1/2 -translate-y-1/2 text-[color:var(--color-neutral-500)] [&_svg]:size-4",
                inputSize === "sm" && "right-2 [&_svg]:size-3.5"
              )}
            >
              {rightIcon}
            </span>
          ) : null}
        </div>
        {footnote ? (
          <p
            id={`${id}-hint`}
            role={hasError ? "alert" : undefined}
            className={cn(
              "text-[length:var(--font-size-xs)] text-[color:var(--color-neutral-600)]",
              hasError && "font-[var(--font-weight-medium)] text-[color:var(--color-semantic-danger)]"
            )}
          >
            {footnote}
          </p>
        ) : null}
      </div>
    )
  }
)
InputField.displayName = "InputField"

export { Input, InputField, inputVariants }
