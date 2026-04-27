/** Post-login destination from ?next= — same-origin path only (open-redirect safe) */
export function safePathAfterLogin(nextParam: string | null): string {
  const fallback = "/dashboard";
  if (nextParam == null || nextParam === "") return fallback;
  try {
    const path = decodeURIComponent(nextParam);
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    if (path.startsWith("/login")) return fallback;
    return path;
  } catch {
    return fallback;
  }
}

export function loginUrlWithCurrentLocationNext(): string {
  const path = `${window.location.pathname}${window.location.search}`;
  return `/login?next=${encodeURIComponent(path)}`;
}
