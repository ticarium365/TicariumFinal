/**
 * Abonelik plan tanımları + DB seed — `subscriptions.ts`'ten ayrıldı.
 */
import { db, subscriptionPlansTable, companySubscriptionsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { invalidateFeaturesCache } from "../../middlewares/features.js";

// ─────────────────────────────────────────────────────────────────────────────
// PAKET TANIMLARI v2 — 4 ana paket + feature flag listesi (KOBİ değer merdiveni)
// Fiyat mantığı (özet): düşük giriş → Pro’da pazaryeri/OCR desteği → Business’ta
// çok kanal + API + üretim → Kurumsal’da yüksek limitler ve operasyonel marj.
// Rakamlar piyasa + altyapı maliyeti + destek yükü dengesine göre ayarlanır; A/B test edilebilir.
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = {
  // Çekirdek
  inventory_core: "inventory.core",         // ürün/kategori/stok/barkod
  stock_counts: "stock.counts",
  barcode_print: "barcode.print",
  // Ticaret
  sales_pos: "sales.pos",
  sales_invoices: "sales.invoices",
  customers_crm: "customers.crm",
  suppliers: "suppliers",
  einvoice_basic: "einvoice.basic",
  einvoice_pro: "einvoice.pro",
  // İşletme
  finance_expenses: "finance.expenses",
  finance_banking: "finance.banking",
  hr_staff: "hr.staff",
  hr_payroll: "hr.payroll",
  assets_fixed: "assets.fixed",
  ocr_receipts: "ocr.receipts",
  documents: "documents",
  profit_dashboard: "profit.dashboard",
  // Sprint 72 — Gerçek Kârlılık Motoru
  profit_holding_cost: "profit.holding_cost",     // Raf maliyeti + sermaye + devir + gider dağıtım + ürün kâr raporu
  profit_true_dashboard: "profit.true_dashboard", // Gerçek Kâr dashboard'u
  profit_ai_advisor: "profit.ai_advisor",         // Akıllı öneriler motoru
  // Büyüme
  marketplace_basic: "marketplace.basic",
  marketplace_pro: "marketplace.pro",
  campaigns: "campaigns",
  loyalty_points: "loyalty.points",
  currency_multi: "currency.multi",
  reports_advanced: "reports.advanced",
  // Kurumsal
  api_public: "api.public",
  integrations_accounting: "integrations.accounting",
  production_bom: "production.bom",
  accountant_panel: "accountant.panel",
  webhooks: "integrations.webhooks",
} as const;

// Yıllıkta 2 ay hediye → yıllık fiyat = aylık × 10. Trial: 30 gün (şirket politikasına göre).
const PLAN_DEFS = [
  {
    slug: "pkg_starter",
    name: "Başlangıç",
    description: "Tek şube, az kullanıcı: stok, hızlı satış (POS), cari ve temel e-arşiv.",
    priceMonthly: "899",
    priceYearly: "8990",
    maxUsers: 2,
    maxBranches: 1,
    maxProducts: 1000,
    maxMonthlySales: 1000,
    maxCustomers: 500,
    maxEinvoiceMonthly: 100,
    einvoiceOverageRate: "0.90",
    maxOcrMonthly: 0,
    maxApiCallsMonthly: 0,
    maxMarketplaceChannels: 0,
    storageMb: 1000,
    sortOrder: 1,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic,
      FEATURES.profit_dashboard,
    ],
  },
  {
    slug: "pkg_pro",
    name: "Pro",
    description: "Çevrimiçi satışa açılan işletmeler: pazaryeri, kasa/gider, banka eşleştirme ve fiş OCR.",
    priceMonthly: "1899",
    priceYearly: "18990",
    maxUsers: 7,
    maxBranches: 3,
    maxProducts: 10000,
    maxMonthlySales: 10000,
    maxCustomers: 5000,
    maxEinvoiceMonthly: 500,
    einvoiceOverageRate: "0.60",
    maxOcrMonthly: 100,
    maxApiCallsMonthly: 0,
    maxMarketplaceChannels: 3,
    storageMb: 5000,
    sortOrder: 2,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic, FEATURES.einvoice_pro,
      FEATURES.finance_expenses, FEATURES.finance_banking,
      FEATURES.hr_staff, FEATURES.assets_fixed, FEATURES.ocr_receipts,
      FEATURES.documents, FEATURES.profit_dashboard,
      FEATURES.profit_holding_cost,
      FEATURES.marketplace_basic,
      FEATURES.campaigns,
    ],
  },
  {
    slug: "pkg_business_v3",
    name: "Business",
    description: "Birden fazla satış kanalı ve B2B vitrin; gelişmiş kârlılık, açık API ve üretim/reçete.",
    priceMonthly: "2499",
    priceYearly: "24990",
    maxUsers: 20,
    maxBranches: 8,
    maxProducts: 75000,
    maxMonthlySales: 50000,
    maxCustomers: -1,
    maxEinvoiceMonthly: 3000,
    einvoiceOverageRate: "0.40",
    maxOcrMonthly: 750,
    maxApiCallsMonthly: 25000,
    maxMarketplaceChannels: 8,
    storageMb: 30000,
    sortOrder: 3,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic, FEATURES.einvoice_pro,
      FEATURES.finance_expenses, FEATURES.finance_banking,
      FEATURES.hr_staff, FEATURES.hr_payroll, FEATURES.assets_fixed,
      FEATURES.ocr_receipts, FEATURES.documents, FEATURES.profit_dashboard,
      FEATURES.profit_holding_cost, FEATURES.profit_true_dashboard,
      FEATURES.marketplace_basic, FEATURES.marketplace_pro,
      FEATURES.campaigns, FEATURES.loyalty_points, FEATURES.currency_multi,
      FEATURES.reports_advanced,
      FEATURES.api_public, FEATURES.production_bom,
    ],
  },
  {
    slug: "pkg_enterprise_v3",
    name: "Kurumsal",
    description: "Çok şubeli veya yüksek hacimli ekipler: çok yüksek limitler, gelişmiş API, muhasebe köprüleri ve AI destekli kâr önerileri. (Özel koşullar satış ekibiyle netleşir.)",
    priceMonthly: "3799",
    priceYearly: "37990",
    maxUsers: -1,
    maxBranches: -1,
    maxProducts: -1,
    maxMonthlySales: -1,
    maxCustomers: -1,
    maxEinvoiceMonthly: 15000,
    einvoiceOverageRate: "0.25",
    maxOcrMonthly: 3000,
    maxApiCallsMonthly: 250000,
    maxMarketplaceChannels: -1,
    storageMb: 100000,
    sortOrder: 4,
    isPublic: true,
    requiredAccountType: null as string | null,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic, FEATURES.einvoice_pro,
      FEATURES.finance_expenses, FEATURES.finance_banking, FEATURES.hr_staff,
      FEATURES.hr_payroll, FEATURES.assets_fixed, FEATURES.ocr_receipts,
      FEATURES.documents, FEATURES.profit_dashboard,
      FEATURES.profit_holding_cost, FEATURES.profit_true_dashboard, FEATURES.profit_ai_advisor,
      FEATURES.marketplace_basic, FEATURES.marketplace_pro,
      FEATURES.campaigns, FEATURES.loyalty_points, FEATURES.currency_multi,
      FEATURES.reports_advanced,
      FEATURES.api_public, FEATURES.integrations_accounting,
      FEATURES.production_bom, FEATURES.accountant_panel, FEATURES.webhooks,
    ],
  },
  // ─── Yetki Şeması v2 (Dalga 16) — gizli sistem planları ────────────────────
  // Bu planlar afişte/pricing/onboarding sayfalarında GÖSTERİLMEZ. Sadece
  // kayıt/onboarding sırasında otomatik atanır. Kullanıcı seçemez.
  {
    slug: "pkg_trial_enterprise",
    name: "Deneme (Kurumsal)",
    description: "30 günlük tam yetki deneme süresi — kayıt sırasında otomatik atanır",
    priceMonthly: "0",
    priceYearly: "0",
    maxUsers: -1,
    maxBranches: -1,
    maxProducts: -1,
    maxMonthlySales: -1,
    maxCustomers: -1,
    maxEinvoiceMonthly: 1000,
    einvoiceOverageRate: "0.00",
    maxOcrMonthly: 200,
    maxApiCallsMonthly: 10000,
    maxMarketplaceChannels: -1,
    storageMb: 100000,
    sortOrder: 100, // afişte gösterilmez ama listenin sonunda kalır
    isPublic: false,
    requiredAccountType: null as string | null,
    features: [
      // Tüm enterprise feature seti — trial 21 gün boyunca her yeri açar
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic, FEATURES.einvoice_pro,
      FEATURES.finance_expenses, FEATURES.finance_banking, FEATURES.hr_staff,
      FEATURES.hr_payroll, FEATURES.assets_fixed, FEATURES.ocr_receipts,
      FEATURES.documents, FEATURES.profit_dashboard,
      FEATURES.profit_holding_cost, FEATURES.profit_true_dashboard, FEATURES.profit_ai_advisor,
      FEATURES.marketplace_basic, FEATURES.marketplace_pro,
      FEATURES.campaigns, FEATURES.loyalty_points, FEATURES.currency_multi,
      FEATURES.reports_advanced,
      FEATURES.api_public, FEATURES.integrations_accounting,
      FEATURES.production_bom, FEATURES.accountant_panel, FEATURES.webhooks,
    ],
  },
  {
    slug: "pkg_procurement",
    name: "Satınalmacı",
    description: "Satınalmacı portalı — sadece tedarikçi keşfi, teklif, karşılaştırma",
    priceMonthly: "0",
    priceYearly: "0",
    maxUsers: 5,
    maxBranches: 1,
    maxProducts: 0,
    maxMonthlySales: 0,
    maxCustomers: 5000,
    maxEinvoiceMonthly: 0,
    einvoiceOverageRate: "0.00",
    maxOcrMonthly: 0,
    maxApiCallsMonthly: 0,
    maxMarketplaceChannels: 0,
    storageMb: 500,
    sortOrder: 101,
    isPublic: false,
    requiredAccountType: "purchasing", // sadece satınalmacı hesaplara
    features: [
      // Satınalmacı sadece görüntüler/teklif ister, satış/POS/finans/marketplace YOK
      FEATURES.customers_crm,
      FEATURES.suppliers,
      FEATURES.documents,
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PLAN SEED — uygulama açılışında çalışır (index.ts'den çağırılır)
// ─────────────────────────────────────────────────────────────────────────────
export async function seedSubscriptionPlansV2() {
  // Eski paketleri (free/starter/pro/enterprise) deaktif et — referans bütünlüğü için silmiyoruz
  const newSlugs = PLAN_DEFS.map(p => p.slug);
  for (const def of PLAN_DEFS) {
    const [existing] = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.slug, def.slug)).limit(1);
    const data = {
      name: def.name,
      description: def.description,
      priceMonthly: def.priceMonthly,
      priceYearly: def.priceYearly,
      maxUsers: def.maxUsers,
      maxProducts: def.maxProducts,
      maxBranches: def.maxBranches,
      maxMonthlySales: def.maxMonthlySales,
      storageMb: def.storageMb,
      // Dalga 18: Kontör ve genişletilmiş limit alanları
      maxEinvoiceMonthly: (def as any).maxEinvoiceMonthly ?? 0,
      einvoiceOverageRate: (def as any).einvoiceOverageRate ?? "0.90",
      maxOcrMonthly: (def as any).maxOcrMonthly ?? 0,
      maxApiCallsMonthly: (def as any).maxApiCallsMonthly ?? 0,
      maxCustomers: (def as any).maxCustomers ?? 500,
      maxMarketplaceChannels: (def as any).maxMarketplaceChannels ?? 0,
      features: JSON.stringify(def.features),
      sortOrder: def.sortOrder,
      isActive: true,
      isPublic: def.isPublic ?? true,
      requiredAccountType: def.requiredAccountType ?? null,
    };
    if (existing) {
      await db.update(subscriptionPlansTable).set(data).where(eq(subscriptionPlansTable.id, existing.id));
    } else {
      await db.insert(subscriptionPlansTable).values({ slug: def.slug, ...data });
    }
  }
  // Yeni listede olmayan eski planları gizle
  const all = await db.select().from(subscriptionPlansTable);
  const deprecatedIds: number[] = [];
  for (const p of all) {
    if (!newSlugs.includes(p.slug)) {
      if (p.isActive) {
        await db.update(subscriptionPlansTable).set({ isActive: false }).where(eq(subscriptionPlansTable.id, p.id));
      }
      deprecatedIds.push(p.id);
    }
  }

  // Eski planlara bağlı aktif abonelikleri Kurumsal v3'e migrate et (existing customer'lar erişimini kaybetmesin)
  if (deprecatedIds.length > 0) {
    const [enterprise] = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.slug, "pkg_enterprise_v3"));
    if (enterprise) {
      const migrated = await db.update(companySubscriptionsTable)
        .set({ planId: enterprise.id, updatedAt: new Date(), notes: "Auto-migrated from deprecated plan to Kurumsal v3" })
        .where(and(
          inArray(companySubscriptionsTable.planId, deprecatedIds),
          inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
        ))
        .returning({ companyId: companySubscriptionsTable.companyId });
      for (const m of migrated) invalidateFeaturesCache(m.companyId);
      if (migrated.length > 0) console.info(`Migrated ${migrated.length} subscriptions to Kurumsal v3`);
    }
  }
  const publicCount = PLAN_DEFS.filter(d => d.isPublic !== false).length;
  const hiddenCount = PLAN_DEFS.length - publicCount;
  console.info(`Subscription plans v2 seeded (${publicCount} public + ${hiddenCount} hidden = ${PLAN_DEFS.length} total)`);
}

// Eski isim — geriye dönük uyumluluk için ince shim. Tüm tanımlar v2'de.
// Dalga 25 — Yetki temizliği: ölü inline seed (free/starter/pro/enterprise)
// kaldırıldı; eski v1 plan slug'ları artık hiçbir yerde tanımlı değil.
export async function seedSubscriptionPlans() {
  await seedSubscriptionPlansV2();
}
