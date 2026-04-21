/**
 * BRAND COMMITMENT (Ticarium365):
 * - primary/tint: light=#4F46E5 (Indigo-600), dark=#818CF8 (Indigo-400) — mor brand.
 * - accent/success: light=#5EEAD4 (Teal-300), dark=#5EEAD4 — teal vurgu.
 * Bu değerler web `BrandLogo.tsx` palette ile aligned. Drift = brand kopukluğu.
 * UI token'larını değiştirirken stil rehberini koru — BrandMark (logo) palette'ten
 * bağımsızdır (sabit marka varlığı, dark/light her ikisinde aynı).
 */
const colors = {
  light: {
    text: "#0F1117",
    tint: "#4F46E5",
    background: "#F5F7FA",
    foreground: "#0F1117",
    card: "#FFFFFF",
    cardForeground: "#0F1117",
    primary: "#4F46E5",
    primaryForeground: "#FFFFFF",
    secondary: "#EEF2FF",
    secondaryForeground: "#1A1A2E",
    muted: "#F0F4FF",
    mutedForeground: "#6B7280",
    accent: "#5EEAD4",
    accentForeground: "#FFFFFF",
    destructive: "#FF4757",
    destructiveForeground: "#FFFFFF",
    border: "#E5E9F0",
    input: "#E5E9F0",
    warning: "#FF9F1C",
    success: "#5EEAD4",
  },
  dark: {
    text: "#F0F4FF",
    tint: "#818CF8",
    background: "#0F1117",
    foreground: "#F0F4FF",
    card: "#1E2130",
    cardForeground: "#F0F4FF",
    primary: "#818CF8",
    primaryForeground: "#0F1117",
    secondary: "#252A3D",
    secondaryForeground: "#D0D5FF",
    muted: "#1A1E2E",
    mutedForeground: "#9CA3AF",
    accent: "#5EEAD4",
    accentForeground: "#0F1117",
    destructive: "#FF4757",
    destructiveForeground: "#FFFFFF",
    border: "#2A3045",
    input: "#2A3045",
    warning: "#FF9F1C",
    success: "#5EEAD4",
  },
  radius: 12,
};

export default colors;
