/**
 * Sunucuya yapılandırılmış ürün olayı gönderir (session cookie ile).
 * Başarısızlıkta sessizce yutulur — kullanıcı akışını bloklamaz.
 */
export function trackProductEvent(
  event: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ event, properties: properties ?? {} });
  try {
    void fetch("/api/product-analytics/track", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
