/**
 * Backend API origin (scheme + host, no trailing slash). Empty when
 * `VITE_API_BASE_URL` is unset so `/api/...` stays relative (Vite dev proxy
 * or same-origin API).
 */
export function getApiOrigin(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
  return raw.replace(/\/+$/, "");
}

/**
 * Base path for REST calls: `/api` in dev (proxy), or `https://api-host/api` in production.
 */
export const apiBase: string = (() => {
  const o = getApiOrigin();
  return o ? `${o}/api` : "/api";
})();

/** Build an absolute API URL for navigation (`window.open`) or `<form action>`. */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const o = getApiOrigin();
  return o ? `${o}${p}` : p;
}
