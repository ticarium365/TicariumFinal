/**
 * Harici bağlantı adapter’ları için ortak sözleşme (API anahtarları geldiğinde genişletilir).
 * Şimdilik tip + dokümantasyon omurgası; gerçek çağrılar ilgili domain factory’lerinde kalır.
 */
export type AdapterHealthMode = "sandbox" | "live" | "unknown";

export type AdapterHealthResult = {
  ok: boolean;
  message: string;
  mode: AdapterHealthMode;
};

/** Normalize edilmiş sağlayıcı anahtarı (örn. einvoice `parasut`, muhasebe `parasut` ayrı entryId ile ayrılır). */
export interface IntegrationConnectionAdapter {
  readonly catalogEntryId: string;
  ping(ctx: { companyId: number }): Promise<AdapterHealthResult>;
}
