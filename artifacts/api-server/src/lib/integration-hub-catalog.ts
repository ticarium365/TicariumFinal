/**
 * Birleşik entegrasyon kataloğu — UI + `/ext-integrations` doğrulama listeleri için tek kaynak.
 * Sahte API çağrısı yok; yalnızca meta + kurulum ipuçları + (opsiyonel) process.env anahtar varlığı.
 */
import { PROVIDER_META } from "../services/einvoice/factory.js";

export type IntegrationLifecycle = "live" | "pilot" | "roadmap";
export type IntegrationSetupDifficulty = "low" | "medium" | "high";
export type IntegrationHubTab = "webhooks" | "api-keys" | "accounting" | "ecommerce";

export type IntegrationCatalogEntry = {
  entryId: string;
  family: "platform" | "accounting" | "ecommerce" | "einvoice" | "connectivity";
  providerId: string;
  displayName: string;
  emoji: string;
  description: string;
  lifecycle: IntegrationLifecycle;
  setupDifficulty: IntegrationSetupDifficulty;
  businessImpactTags: string[];
  recommendedFor: string[];
  packageEligibilityHint: string;
  setupChecklist: string[];
  /** Sunucuda tanımlı mı (değer asla dönmez, yalnızca boolean). */
  envReadinessKeys: string[];
  deepLinkTab: IntegrationHubTab | null;
  inboundPath?: string;
};

type AccountingRow = {
  id: string;
  name: string;
  logo: string;
  description: string;
  lifecycle: IntegrationLifecycle;
  setupDifficulty: IntegrationSetupDifficulty;
  businessImpactTags: string[];
  recommendedFor: string[];
  packageEligibilityHint: string;
  setupChecklist: string[];
  envReadinessKeys: string[];
};

const ACCOUNTING_ROWS: AccountingRow[] = [
  {
    id: "parasut",
    name: "Paraşüt",
    logo: "🧾",
    description: "Bulut tabanlı muhasebe yazılımı",
    lifecycle: "live",
    setupDifficulty: "medium",
    businessImpactTags: ["muhasebe", "KDV", "cari"],
    recommendedFor: ["KOBİ", "perakende", "hizmet"],
    packageEligibilityHint: "Tüm aktif paketler (admin bağlantısı)",
    setupChecklist: [
      "Paraşüt API / entegrasyon kullanıcısı oluşturun.",
      "Kiracı admin olarak Bağlantılar → Muhasebe’den kayıt açın.",
      "İlk senkron sonrası log satırlarını kontrol edin.",
    ],
    envReadinessKeys: [],
  },
  {
    id: "logo",
    name: "Logo",
    logo: "📊",
    description: "Logo Tiger / Go / Start",
    lifecycle: "pilot",
    setupDifficulty: "high",
    businessImpactTags: ["ERP", "muhasebe"],
    recommendedFor: ["orta ölçek", "üretim"],
    packageEligibilityHint: "Pilot — IT eşliği önerilir",
    setupChecklist: [
      "Kullanılan Logo ürünü ve sürümünü netleştirin.",
      "API / dosya köprüsü kararını (partner) yazılı hale getirin.",
    ],
    envReadinessKeys: [],
  },
  {
    id: "mikro",
    name: "Mikro",
    logo: "📈",
    description: "Mikro ERP yazılımı",
    lifecycle: "pilot",
    setupDifficulty: "high",
    businessImpactTags: ["ERP", "stok"],
    recommendedFor: ["toptan", "üretim"],
    packageEligibilityHint: "Pilot",
    setupChecklist: ["Mikro tarafında izin verilen veri kapsamını sınırlayın.", "Test şirketi ile deneme senkronu."],
    envReadinessKeys: [],
  },
  {
    id: "luca",
    name: "Luca",
    logo: "🔢",
    description: "DYS Yazılım / Luca muhasebe",
    lifecycle: "pilot",
    setupDifficulty: "medium",
    businessImpactTags: ["muhasebe"],
    recommendedFor: ["KOBİ"],
    packageEligibilityHint: "Pilot",
    setupChecklist: ["Luca API erişim bilgilerini güvenli kanaldan alın.", "Şirket başına tek bağlantı kuralına uyun."],
    envReadinessKeys: [],
  },
  {
    id: "netsis",
    name: "Netsis",
    logo: "🏢",
    description: "Netsis ERP sistemi",
    lifecycle: "roadmap",
    setupDifficulty: "high",
    businessImpactTags: ["ERP"],
    recommendedFor: ["kurumsal"],
    packageEligibilityHint: "Yol haritası — ön talep",
    setupChecklist: ["İş birliği öncesi veri hacmi ve güncelleme sıklığını dokümante edin."],
    envReadinessKeys: [],
  },
];

type EcommerceRow = Omit<AccountingRow, "id"> & { id: string };

const ECOMMERCE_ROWS: EcommerceRow[] = [
  {
    id: "trendyol",
    name: "Trendyol",
    logo: "🛍️",
    description: "Türkiye'nin en büyük e-ticaret pazaryeri",
    lifecycle: "live",
    setupDifficulty: "medium",
    businessImpactTags: ["pazaryeri", "satış hacmi"],
    recommendedFor: ["perakende", "marka"],
    packageEligibilityHint: "Pazaryeri özellik bayrağı ile",
    setupChecklist: ["Kanal hesabında API anahtarlarını doğrulayın.", "Pazaryeri sağlık ekranından bağlantıyı test edin."],
    envReadinessKeys: [],
  },
  {
    id: "hepsiburada",
    name: "Hepsiburada",
    logo: "🛒",
    description: "Hepsiburada.com",
    lifecycle: "pilot",
    setupDifficulty: "medium",
    businessImpactTags: ["pazaryeri"],
    recommendedFor: ["perakende"],
    packageEligibilityHint: "Pazaryeri (pilot)",
    setupChecklist: ["Satıcı panelinden entegrasyon izinlerini açın."],
    envReadinessKeys: [],
  },
  {
    id: "n11",
    name: "n11",
    logo: "🏪",
    description: "n11.com pazaryeri",
    lifecycle: "pilot",
    setupDifficulty: "medium",
    businessImpactTags: ["pazaryeri"],
    recommendedFor: ["perakende"],
    packageEligibilityHint: "Pazaryeri (pilot)",
    setupChecklist: ["API kota ve IP kısıtlarını not edin."],
    envReadinessKeys: [],
  },
  {
    id: "pazarama",
    name: "Pazarama",
    logo: "🏬",
    description: "Pazarama.com",
    lifecycle: "roadmap",
    setupDifficulty: "medium",
    businessImpactTags: ["pazaryeri"],
    recommendedFor: ["perakende"],
    packageEligibilityHint: "Yol haritası",
    setupChecklist: ["Ön talep: iş hacmi ve kategori bilgisi toplayın."],
    envReadinessKeys: [],
  },
  {
    id: "shopify",
    name: "Shopify",
    logo: "🌐",
    description: "Kendi mağazanız (Shopify)",
    lifecycle: "pilot",
    setupDifficulty: "medium",
    businessImpactTags: ["D2C", "stok"],
    recommendedFor: ["marka", "ihracat"],
    packageEligibilityHint: "Pazaryeri / kanal modülleri",
    setupChecklist: ["Private app veya custom app token kapsamını daraltın."],
    envReadinessKeys: [],
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    logo: "🔌",
    description: "WordPress / WooCommerce",
    lifecycle: "pilot",
    setupDifficulty: "high",
    businessImpactTags: ["D2C", "WordPress"],
    recommendedFor: ["KOBİ", "içerik ticareti"],
    packageEligibilityHint: "Pazaryeri (pilot)",
    setupChecklist: ["TLS ve webhook uç noktası URL’sini doğrulayın.", "Bakım pencerelerinde senkronu durdurun."],
    envReadinessKeys: [],
  },
];

function rowToEntry(
  row: AccountingRow | EcommerceRow,
  family: "accounting" | "ecommerce",
  deepLinkTab: IntegrationHubTab,
): IntegrationCatalogEntry {
  return {
    entryId: `${family}_${row.id}`,
    family,
    providerId: row.id,
    displayName: row.name,
    emoji: row.logo,
    description: row.description,
    lifecycle: row.lifecycle,
    setupDifficulty: row.setupDifficulty,
    businessImpactTags: row.businessImpactTags,
    recommendedFor: row.recommendedFor,
    packageEligibilityHint: row.packageEligibilityHint,
    setupChecklist: row.setupChecklist,
    envReadinessKeys: row.envReadinessKeys,
    deepLinkTab,
    inboundPath: "/api/webhooks/:provider/:accountId",
  };
}

function buildEinvoiceEntries(): IntegrationCatalogEntry[] {
  return PROVIDER_META.map((m) => ({
    entryId: `einvoice_${m.key}`,
    family: "einvoice" as const,
    providerId: m.key,
    displayName: m.label,
    emoji: m.key === "mock" ? "🧪" : "📄",
    description: `${m.label} — e-belge entegrasyonu (${m.category})`,
    lifecycle: m.key === "mock" ? ("live" as const) : ("pilot" as const),
    setupDifficulty: m.needs.length >= 4 ? ("high" as const) : m.needs.length <= 1 ? ("low" as const) : ("medium" as const),
    businessImpactTags: ["e-Fatura", "uyumluluk"],
    recommendedFor: ["tüm satıcılar"],
    packageEligibilityHint: m.key === "mock" ? "Geliştirme / demo" : "Canlı öncesi entegratör onayı önerilir",
    setupChecklist: [
      "Şirket VKN ve unvanı GİB ile uyumlu mu kontrol edin.",
      ...(m.needs.length ? [`Gerekli alanlar: ${m.needs.join(", ")}.`] : ["Mock ile uçtan uca akışı doğrulayın."]),
    ],
    envReadinessKeys: [],
    deepLinkTab: null,
  }));
}

function connectivityEntries(): IntegrationCatalogEntry[] {
  return [
    {
      entryId: "connectivity_webhooks",
      family: "connectivity",
      providerId: "outbound_webhooks",
      displayName: "Giden Webhook'lar",
      emoji: "⚡",
      description: "Satış, stok ve diğer olayları harici URL’lere güvenli iletim.",
      lifecycle: "live",
      setupDifficulty: "medium",
      businessImpactTags: ["otomasyon", "ERP", "BI"],
      recommendedFor: ["orta ölçek", "entegrasyon olgun"],
      packageEligibilityHint: "Admin — Bağlantılar sekmesi",
      setupChecklist: [
        "Uç nokta HTTPS ve 10 sn içinde yanıt verebilir olmalı.",
        "HMAC gizli anahtarını yalnızca güvenli kanalda paylaşın.",
        "Önce test.ping ile doğrulayın.",
      ],
      envReadinessKeys: [],
      deepLinkTab: "webhooks",
    },
    {
      entryId: "connectivity_api_keys",
      family: "connectivity",
      providerId: "tenant_api_keys",
      displayName: "Kiracı API anahtarları",
      emoji: "🔑",
      description: "Harici sistemlerin Ticarium365 API’sine sınırlı erişimi.",
      lifecycle: "live",
      setupDifficulty: "low",
      businessImpactTags: ["API", "güvenlik"],
      recommendedFor: ["entegrasyon", "mobil"],
      packageEligibilityHint: "Admin",
      setupChecklist: [
        "En dar yetki (read) ile başlayın.",
        "Anahtarı tek seferlik kopyalayıp kasaya alın.",
      ],
      envReadinessKeys: [],
      deepLinkTab: "api-keys",
    },
    {
      entryId: "connectivity_marketplace_inbound",
      family: "connectivity",
      providerId: "marketplace_inbound",
      displayName: "Pazaryeri gelen webhook",
      emoji: "📥",
      description: "Kanal hesabı bazlı imzalı inbound uç (N+1 kuyruk hazırlığı).",
      lifecycle: "live",
      setupDifficulty: "high",
      businessImpactTags: ["pazaryeri", "gerçek zamanlı"],
      recommendedFor: ["yüksek hacim"],
      packageEligibilityHint: "MARKETPLACE_PRO + kanal hesabı",
      setupChecklist: [
        "Kanal hesabı ayarlarında webhookSecret tanımlayın.",
        "Sağlayıcı panelinde URL: /api/webhooks/{provider}/{accountId}",
      ],
      envReadinessKeys: [],
      deepLinkTab: null,
      inboundPath: "/api/webhooks/:provider/:accountId",
    },
  ];
}

export function getAllIntegrationCatalogEntries(): IntegrationCatalogEntry[] {
  return [
    ...ACCOUNTING_ROWS.map((r) => rowToEntry(r, "accounting", "accounting")),
    ...ECOMMERCE_ROWS.map((r) => rowToEntry(r, "ecommerce", "ecommerce")),
    ...buildEinvoiceEntries(),
    {
      entryId: "payments_iyzico",
      family: "platform",
      providerId: "iyzico",
      displayName: "Ödeme — Iyzico",
      emoji: "💳",
      description: "Abonelik checkout + webhook doğrulama (readiness: SDK/PKI imza).",
      lifecycle: "pilot",
      setupDifficulty: "high",
      businessImpactTags: ["tahsilat", "abonelik", "güven"],
      recommendedFor: ["SaaS dönüşüm"],
      packageEligibilityHint: "Faturalama modülü",
      setupChecklist: [
        "IYZICO_API_KEY ve IYZICO_SECRET_KEY tanımlayın.",
        "Webhook doğrulama ve gerçek checkout transport'unu aktif edin (SDK/PKI).",
        "Canlıya çıkmadan önce sandbox test ödeme akışını doğrulayın.",
      ],
      envReadinessKeys: ["IYZICO_API_KEY", "IYZICO_SECRET_KEY"],
      deepLinkTab: null,
    },
    {
      entryId: "payments_mock",
      family: "platform",
      providerId: "mock",
      displayName: "Ödeme — Mock (Sandbox)",
      emoji: "🧪",
      description: "Geliştirme için mock ödeme akışı.",
      lifecycle: "live",
      setupDifficulty: "low",
      businessImpactTags: ["test"],
      recommendedFor: ["demo", "yerel geliştirme"],
      packageEligibilityHint: "Dev/test",
      setupChecklist: ["Iyzico anahtarları olmadan otomatik mock çalışır."],
      envReadinessKeys: [],
      deepLinkTab: null,
    },
    {
      entryId: "cargo_readiness",
      family: "platform",
      providerId: "cargo",
      displayName: "Kargo entegrasyonları",
      emoji: "📦",
      description: "Taşıyıcı adapter altyapısı (hazırlık). Şimdilik kargo fiyat kuralları uygulama içi yönetilir.",
      lifecycle: "roadmap",
      setupDifficulty: "high",
      businessImpactTags: ["lojistik", "teslimat", "iade"],
      recommendedFor: ["yüksek hacim"],
      packageEligibilityHint: "Roadmap",
      setupChecklist: [
        "Önce Shipping Rules/Zones ile fiyatlamayı netleştirin.",
        "Taşıyıcı sağlayıcı seçimi + credential depolama eklendiğinde burada ping aktif olacak.",
      ],
      envReadinessKeys: [],
      deepLinkTab: null,
    },
    ...connectivityEntries(),
  ];
}

/** `ext-integrations` rotaları için geriye dönük şekil (logo alanı). */
export const LEGACY_ACCOUNTING_PROVIDER_LIST = ACCOUNTING_ROWS.map((r) => ({
  id: r.id,
  name: r.name,
  logo: r.logo,
  description: r.description,
}));

export const LEGACY_ECOMMERCE_PLATFORM_LIST = ECOMMERCE_ROWS.map((r) => ({
  id: r.id,
  name: r.name,
  logo: r.logo,
  description: r.description,
}));

export type TenantIntegrationCounts = {
  webhooks: number;
  apiKeys: number;
  accounting: number;
  ecommerce: number;
};

export type ProviderConnectedCounts = Partial<Record<string, number>>;

export type ConnectionStatusHint = {
  ok: boolean;
  message: string;
  checkedAtIso?: string;
};

export type IntegrationCatalogResponse = {
  version: 1;
  generatedAt: string;
  entries: Array<IntegrationCatalogEntry & {
    envReadiness: Record<string, boolean>;
    connectedCountHint?: number;
    statusHint?: ConnectionStatusHint;
  }>;
  tenantCounts: TenantIntegrationCounts;
  recommendedEntryIds: string[];
};

function envTruthy(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = (env[name] ?? "").trim();
  if (!v) return false;
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
}

export function buildIntegrationCatalogResponse(
  env: NodeJS.ProcessEnv,
  tenantCounts: TenantIntegrationCounts,
  opts?: {
    connectedByProvider?: ProviderConnectedCounts;
    statusByEntryId?: Partial<Record<string, ConnectionStatusHint>>;
  },
): IntegrationCatalogResponse {
  const entries = getAllIntegrationCatalogEntries().map((e) => {
    const envReadiness: Record<string, boolean> = {};
    for (const k of e.envReadinessKeys) {
      envReadiness[k] = envTruthy(k, env);
    }
    let connectedCountHint: number | undefined;
    if (e.entryId === "connectivity_webhooks") connectedCountHint = tenantCounts.webhooks;
    else if (e.entryId === "connectivity_api_keys") connectedCountHint = tenantCounts.apiKeys;
    else if (e.family === "ecommerce") {
      connectedCountHint = opts?.connectedByProvider?.[e.providerId];
    }
    const statusHint = opts?.statusByEntryId?.[e.entryId];
    return { ...e, envReadiness, connectedCountHint, statusHint };
  });

  const recommendedEntryIds: string[] = [];
  if (tenantCounts.webhooks === 0) recommendedEntryIds.push("connectivity_webhooks");
  if (tenantCounts.apiKeys === 0 && tenantCounts.webhooks > 0) recommendedEntryIds.push("connectivity_api_keys");
  if (tenantCounts.accounting === 0) recommendedEntryIds.push("accounting_parasut");
  recommendedEntryIds.push("einvoice_mock");
  recommendedEntryIds.push("payments_iyzico");

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries,
    tenantCounts,
    recommendedEntryIds: [...new Set(recommendedEntryIds)].slice(0, 6),
  };
}
