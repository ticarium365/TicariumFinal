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

  const bgFill = variant === "mono-light" ? "#FFFFFF" : `url(#${gradId})`;
  const tFill = variant === "mono-light" ? "#0F172A" : "#FFFFFF";
  const dotFill = variant === "mono-light" ? "#2563EB" : "#5EEAD4";

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
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="55%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#0EA5A4" />
        </linearGradient>
        <linearGradient id={shineId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
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
      style={{ fontFamily: "var(--font-display)", color: light ? "#FFFFFF" : "#0F172A" }}
    >
      Ticarium
      <span
        style={
          light
            ? { color: "#A5F3FC" }
            : {
                background: "linear-gradient(135deg,#2563EB 0%,#0EA5A4 100%)",
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
