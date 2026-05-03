import { useId } from "react";

type Props = {
  size?: number;
  className?: string;
  variant?: "color" | "mono-light";
};

export function BrandLogo({ size = 40, className, variant = "color" }: Props) {
  const uid = useId().replace(/:/g, "");
  const gradId = `bl-${uid}-grad`;
  const shineId = `bl-${uid}-shine`;

  const bgFill = variant === "mono-light" ? "var(--color-surface-card)" : `url(#${gradId})`;
  const tFill = variant === "mono-light" ? "var(--color-neutral-900)" : "var(--color-nav-text-active)";
  const dotFill = variant === "mono-light" ? "var(--color-brand-500)" : "var(--color-accent-teal)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Ticarium365"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-900)" />
          <stop offset="55%" stopColor="var(--color-brand-500)" />
          <stop offset="100%" stopColor="var(--color-accent-teal)" />
        </linearGradient>
        <linearGradient id={shineId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-nav-text-active)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-nav-text-active)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Rozet zemini */}
      <rect x="0" y="0" width="48" height="48" rx="12" fill={bgFill} />
      {variant === "color" && (
        <rect x="0" y="0" width="48" height="22" rx="12" fill={`url(#${shineId})`} />
      )}

      {/* Bold T monogramı (ortalanmış, geniş ayak) */}
      <path
        d="M11 14 H37 V20.5 H27.2 V37 H20.8 V20.5 H11 Z"
        fill={tFill}
      />

      {/* Sağ alt accent — büyüme/ok ipucu */}
      <circle cx="36.5" cy="35" r="3.4" fill={dotFill} />
    </svg>
  );
}

type WordmarkProps = {
  className?: string;
  light?: boolean;
};

export function BrandWordmark({ className, light = false }: WordmarkProps) {
  return (
    <span
      className={className ?? "font-bold text-lg tracking-tight leading-none"}
      style={{ fontFamily: "var(--font-display)", color: light ? "var(--color-nav-text-active)" : "var(--color-neutral-900)" }}
    >
      Ticarium
      <span
        style={
          light
            ? { color: "var(--color-brand-200)" }
            : {
                background: "linear-gradient(135deg, var(--color-brand-500) 0%, var(--color-accent-teal) 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }
        }
      >
        365
      </span>
    </span>
  );
}
