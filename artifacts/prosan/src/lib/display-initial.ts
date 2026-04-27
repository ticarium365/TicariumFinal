/** Avatar / chip initial — safe when name is null/undefined/empty */
export function initialLetter(name: string | null | undefined, fallback = "?"): string {
  const s = typeof name === "string" ? name.trim() : "";
  if (!s.length) return fallback.slice(0, 1).toUpperCase();
  return s.charAt(0).toUpperCase();
}
