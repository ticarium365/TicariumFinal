import type { Config } from "tailwindcss";

/**
 * Extends Tailwind with design tokens from src/styles/tokens.css (P1-B).
 * Does not remove or replace existing @theme / shadcn utilities.
 */
export default {
  theme: {
    extend: {
      colors: {
        nav: {
          950: "var(--color-nav-950)",
          900: "var(--color-nav-900)",
          800: "var(--color-nav-800)",
          700: "var(--color-nav-700)",
          text: "var(--color-nav-text)",
          "text-active": "var(--color-nav-text-active)",
        },
        brand: {
          50: "var(--color-brand-50)",
          200: "var(--color-brand-200)",
          500: "var(--color-brand-500)",
          700: "var(--color-brand-700)",
          900: "var(--color-brand-900)",
        },
        neutral: {
          50: "var(--color-neutral-50)",
          100: "var(--color-neutral-100)",
          200: "var(--color-neutral-200)",
          300: "var(--color-neutral-300)",
          400: "var(--color-neutral-400)",
          500: "var(--color-neutral-500)",
          600: "var(--color-neutral-600)",
          700: "var(--color-neutral-700)",
          800: "var(--color-neutral-800)",
          900: "var(--color-neutral-900)",
        },
        semantic: {
          success: "var(--color-semantic-success)",
          "success-fg": "var(--color-semantic-success-fg)",
          warning: "var(--color-semantic-warning)",
          "warning-fg": "var(--color-semantic-warning-fg)",
          danger: "var(--color-semantic-danger)",
          "danger-fg": "var(--color-semantic-danger-fg)",
          info: "var(--color-semantic-info)",
          "info-fg": "var(--color-semantic-info-fg)",
        },
        surface: {
          bg: "var(--color-surface-bg)",
          card: "var(--color-surface-card)",
          elevated: "var(--color-surface-elevated)",
        },
        /** Subtle dividers — use `border-border-subtle` */
        "border-subtle": "var(--color-border-subtle)",
      },
      fontFamily: {
        token: ["var(--font-family-sans)"],
        "token-display": ["var(--font-family-display)"],
        "token-mono": ["var(--font-family-mono)"],
      },
      fontSize: {
        "token-xs": [
          "var(--font-size-xs)",
          { lineHeight: "var(--line-height-tight)" },
        ],
        "token-sm": [
          "var(--font-size-sm)",
          { lineHeight: "var(--line-height-normal)" },
        ],
        "token-base": [
          "var(--font-size-base)",
          { lineHeight: "var(--line-height-normal)" },
        ],
        "token-lg": [
          "var(--font-size-lg)",
          { lineHeight: "var(--line-height-normal)" },
        ],
        "token-xl": [
          "var(--font-size-xl)",
          { lineHeight: "var(--line-height-normal)" },
        ],
        "token-2xl": [
          "var(--font-size-2xl)",
          { lineHeight: "var(--line-height-tight)" },
        ],
        "token-3xl": [
          "var(--font-size-3xl)",
          { lineHeight: "var(--line-height-tight)" },
        ],
        "token-4xl": [
          "var(--font-size-4xl)",
          { lineHeight: "var(--line-height-tight)" },
        ],
        "token-5xl": [
          "var(--font-size-5xl)",
          { lineHeight: "var(--line-height-tight)" },
        ],
      },
      fontWeight: {
        token: "var(--font-weight-regular)",
        "token-medium": "var(--font-weight-medium)",
        "token-semibold": "var(--font-weight-semibold)",
        "token-bold": "var(--font-weight-bold)",
      },
      lineHeight: {
        "token-tight": "var(--line-height-tight)",
        "token-normal": "var(--line-height-normal)",
        "token-relaxed": "var(--line-height-relaxed)",
      },
      spacing: {
        "ds-1": "var(--spacing-1)",
        "ds-2": "var(--spacing-2)",
        "ds-3": "var(--spacing-3)",
        "ds-4": "var(--spacing-4)",
        "ds-5": "var(--spacing-5)",
        "ds-6": "var(--spacing-6)",
        "ds-7": "var(--spacing-7)",
        "ds-8": "var(--spacing-8)",
        "ds-9": "var(--spacing-9)",
        "ds-10": "var(--spacing-10)",
        "ds-11": "var(--spacing-11)",
        "ds-12": "var(--spacing-12)",
        "ds-13": "var(--spacing-13)",
        "ds-14": "var(--spacing-14)",
        "ds-15": "var(--spacing-15)",
        "ds-16": "var(--spacing-16)",
      },
      borderRadius: {
        "token-xs": "var(--radius-xs)",
        "token-sm": "var(--radius-sm)",
        "token-md": "var(--radius-md)",
        "token-lg": "var(--radius-lg)",
        "token-xl": "var(--radius-xl)",
        "token-2xl": "var(--radius-2xl)",
        "token-full": "var(--radius-full)",
      },
      boxShadow: {
        "token-sm": "var(--shadow-sm)",
        "token-md": "var(--shadow-md)",
        "token-lg": "var(--shadow-lg)",
      },
    },
  },
} satisfies Config;
