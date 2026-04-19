// Yeni tenant onboarding — subdomain validation + rezerve liste.
// Amaç: kötü niyetli/karışıklık yaratan subdomain'leri (admin, api, www, ...) tenant
// olarak almayı engellemek. Multi-tenant subdomain isolation mimarisinde kritik.

const RESERVED_SUBDOMAINS = new Set<string>([
  // Sistem / altyapı
  "admin", "api", "www", "app", "dashboard", "auth", "login", "logout",
  "static", "assets", "cdn", "media", "files", "uploads",
  "mail", "email", "smtp", "imap", "pop", "webmail",
  // Marka / kurumsal sayfalar
  "blog", "help", "docs", "support", "status", "about", "kvkk", "iletisim",
  "pricing", "legal", "privacy", "terms", "kullanim", "gizlilik",
  // Operasyonel
  "ops", "internal", "staging", "dev", "test", "demo", "sandbox", "preview",
  "monitor", "metrics", "logs", "health", "healthz", "readyz",
  // Public servisler
  "public", "shop", "store", "market", "pazar", "marketplace",
  "checkout", "payment", "odeme", "fatura", "invoice",
  // Ticarium365'e özel
  "ticarium", "ticarium365", "tcrm", "panel", "yonetim", "musteri",
  // Yaygın trap (typosquatting / hijack koruması)
  "ftp", "ssh", "vpn", "git", "ns", "ns1", "ns2", "mx", "dns",
  "root", "system", "config", "settings", "billing", "pay",
  // Auth/SSO/identity (yetki paneli ile karışmasın)
  "sso", "oauth", "oauth2", "openid", "id", "identity", "secure", "account", "accounts",
  // Türkiye finans/e-fatura branded (kullanıcı karışıklığı + olası phishing)
  "efatura", "earsiv", "gib", "edefter", "esmm", "eirsaliye", "muhasebe", "finans",
  // Kısa rezervler (tek/iki harfli engel ile aynı zamanda min uzunluk kontrolü)
]);

export type SubdomainValidation =
  | { ok: true; value: string }
  | { ok: false; code: "too_short" | "too_long" | "invalid_chars" | "starts_with_hyphen" | "ends_with_hyphen" | "double_hyphen" | "reserved"; message: string };

/**
 * DNS-safe subdomain doğrulaması.
 * Kurallar (RFC 1035 + ürün politikası):
 *  - 3–32 karakter
 *  - Sadece küçük harf (a-z), rakam (0-9), tire (-)
 *  - Tire ile başlayamaz/bitemez
 *  - Çift tire (--) yasak (Punycode IDN karışıklığı)
 *  - Rezerve listede olamaz
 *
 * Not: Büyük harf gönderilirse otomatik küçük harfe çevrilir (kullanıcı dostu).
 */
export function validateSubdomain(input: unknown): SubdomainValidation {
  if (typeof input !== "string") {
    return { ok: false, code: "invalid_chars", message: "Subdomain metin olmalı." };
  }
  const value = input.trim().toLowerCase();

  if (value.length < 3) {
    return { ok: false, code: "too_short", message: "Subdomain en az 3 karakter olmalı." };
  }
  if (value.length > 32) {
    return { ok: false, code: "too_long", message: "Subdomain en fazla 32 karakter olabilir." };
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    return { ok: false, code: "invalid_chars", message: "Subdomain yalnızca küçük harf, rakam ve tire içerebilir." };
  }
  if (value.startsWith("-")) {
    return { ok: false, code: "starts_with_hyphen", message: "Subdomain tire ile başlayamaz." };
  }
  if (value.endsWith("-")) {
    return { ok: false, code: "ends_with_hyphen", message: "Subdomain tire ile bitemez." };
  }
  if (value.includes("--")) {
    return { ok: false, code: "double_hyphen", message: "Subdomain ardışık iki tire içeremez." };
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return { ok: false, code: "reserved", message: `"${value}" sistem tarafından rezerve edilmiş, başka bir ad seçin.` };
  }
  return { ok: true, value };
}

export function isReservedSubdomain(s: string): boolean {
  return RESERVED_SUBDOMAINS.has(s.trim().toLowerCase());
}

// Test/observability için listeyi dışa aç (UI'da gösterilebilir).
export function listReservedSubdomains(): string[] {
  return Array.from(RESERVED_SUBDOMAINS).sort();
}
