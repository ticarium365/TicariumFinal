const STORAGE_KEY = "t365_cmd_recent_v1";
const MAX = 8;

export type RecentPageEntry = { href: string; label: string; at: number };

export function readRecentPages(): RecentPageEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPageEntry[];
    return Array.isArray(parsed)
      ? parsed.filter((x) => x && typeof x.href === "string" && typeof x.label === "string")
      : [];
  } catch {
    return [];
  }
}

export function touchRecentPage(href: string, label: string): void {
  try {
    const prev = readRecentPages().filter((x) => x.href !== href);
    const next: RecentPageEntry[] = [{ href, label, at: Date.now() }, ...prev].slice(0, MAX);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
