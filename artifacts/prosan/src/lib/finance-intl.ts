/** Canonical TR formatting for finance module screens */

const tryFmt2 = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tryFmt0 = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatTryCurrency(value: number, maxFractionDigits: 0 | 2 = 2): string {
  const n = Number(value) || 0;
  return maxFractionDigits === 0 ? tryFmt0.format(n) : tryFmt2.format(n);
}

export function formatTrDate(
  input: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("tr-TR", options).format(d);
}

export function formatTrDateTime(input: string | Date): string {
  return formatTrDate(input, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
