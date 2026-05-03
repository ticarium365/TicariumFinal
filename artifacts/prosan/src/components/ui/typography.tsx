import * as React from "react";
import { cn } from "@/lib/utils";

const headingColor =
  "text-[color:var(--color-neutral-900)] dark:text-[color:var(--color-neutral-50)]";
const bodyColor =
  "text-[color:var(--color-neutral-700)] dark:text-[color:var(--color-neutral-300)]";
const captionColor =
  "text-[color:var(--color-neutral-500)] dark:text-[color:var(--color-neutral-400)]";
const labelColor =
  "text-[color:var(--color-neutral-700)] dark:text-[color:var(--color-neutral-300)]";

export type TypographyProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">;

export function Heading1<T extends React.ElementType = "h1">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "h1") as React.ElementType;
  return (
    <Comp
      className={cn(
        "font-[var(--font-weight-bold)] text-[length:var(--font-size-4xl)] leading-[var(--line-height-tight)]",
        headingColor,
        className,
      )}
      {...props}
    />
  );
}

export function Heading2<T extends React.ElementType = "h2">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "h2") as React.ElementType;
  return (
    <Comp
      className={cn(
        "font-[var(--font-weight-bold)] text-[length:var(--font-size-3xl)] leading-[var(--line-height-tight)]",
        headingColor,
        className,
      )}
      {...props}
    />
  );
}

export function Heading3<T extends React.ElementType = "h3">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "h3") as React.ElementType;
  return (
    <Comp
      className={cn(
        "font-[var(--font-weight-semibold)] text-[length:var(--font-size-2xl)] leading-[var(--line-height-tight)]",
        headingColor,
        className,
      )}
      {...props}
    />
  );
}

export function Heading4<T extends React.ElementType = "h4">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "h4") as React.ElementType;
  return (
    <Comp
      className={cn(
        "font-[var(--font-weight-semibold)] text-[length:var(--font-size-xl)] leading-[var(--line-height-tight)]",
        headingColor,
        className,
      )}
      {...props}
    />
  );
}

export function Body<T extends React.ElementType = "p">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "p") as React.ElementType;
  return (
    <Comp
      className={cn(
        "text-[length:var(--font-size-base)] leading-[var(--line-height-normal)] font-[var(--font-weight-regular)]",
        bodyColor,
        className,
      )}
      {...props}
    />
  );
}

export function BodySmall<T extends React.ElementType = "p">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "p") as React.ElementType;
  return (
    <Comp
      className={cn(
        "text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] font-[var(--font-weight-regular)]",
        bodyColor,
        className,
      )}
      {...props}
    />
  );
}

export function Caption<T extends React.ElementType = "span">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "span") as React.ElementType;
  return (
    <Comp
      className={cn(
        "text-[length:var(--font-size-xs)] leading-[var(--line-height-normal)] font-[var(--font-weight-regular)]",
        captionColor,
        className,
      )}
      {...props}
    />
  );
}

/** Inline label / field legend text — not the Radix form `Label`. */
export function Label<T extends React.ElementType = "span">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "span") as React.ElementType;
  return (
    <Comp
      className={cn(
        "text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] font-[var(--font-weight-medium)]",
        labelColor,
        className,
      )}
      {...props}
    />
  );
}

export function Code<T extends React.ElementType = "code">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "code") as React.ElementType;
  return (
    <Comp
      className={cn(
        "font-[family-name:var(--font-family-mono)] text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] font-[var(--font-weight-regular)]",
        bodyColor,
        className,
      )}
      {...props}
    />
  );
}

export function PageTitle<T extends React.ElementType = "h1">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "h1") as React.ElementType;
  return (
    <Comp
      className={cn(
        "font-[var(--font-weight-semibold)] text-[length:var(--font-size-3xl)] leading-[var(--line-height-tight)]",
        headingColor,
        className,
      )}
      {...props}
    />
  );
}

export function SectionTitle<T extends React.ElementType = "h2">({
  as,
  className,
  ...props
}: TypographyProps<T> & { as?: T }) {
  const Comp = (as ?? "h2") as React.ElementType;
  return (
    <Comp
      className={cn(
        "font-[var(--font-weight-semibold)] text-[length:var(--font-size-base)] leading-[var(--line-height-tight)]",
        headingColor,
        className,
      )}
      {...props}
    />
  );
}
