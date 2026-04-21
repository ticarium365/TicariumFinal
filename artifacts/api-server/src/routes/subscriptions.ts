import { Router, Request, Response } from "express";
import {
  db,
  subscriptionPlansTable, companySubscriptionsTable,
  subscriptionInvoicesTable, subscriptionUsageTable,
  usersTable, productsTable, branchesTable, salesTable,
  companiesTable,
} from "@workspace/db";
import { and, eq, desc, sql, gte } from "drizzle-orm";
import { requireAuth, requireRole, requireSuperAdmin } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { getCompanyFeatureContext, invalidateFeaturesCache } from "../middlewares/features.js";
import { audit } from "../lib/audit.js";
import { inArray, gt, lt, isNull, or, count } from "drizzle-orm";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PAKET TANIMLARI v2 (Sprint 71) — 5 ana paket + feature flag listesi
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

// ─── Dalga 18 (Sprint 73) — 4 ana paket, sektör jargonuyla ────────────────────
// Yıllıkta 2 ay hediye → yıllık fiyat = aylık × 10. Trial: 30 gün Kurumsal.
const PLAN_DEFS = [
  {
    slug: "pkg_starter",
    name: "Başlangıç",
    description: "Solo esnaf ve mikro işletme için temel ön muhasebe + barkod POS.",
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
    description: "Mağaza, atölye ve butik için pazaryeri, banka ve fiş okuma dahil.",
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
    description: "Çok kanallı satıcı için tam pazaryeri seti, B2B vitrin ve üretim modülü.",
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
    description: "Çok şubeli kurum için sınırsız her şey + AI öneri + özel temsilci + SLA.",
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

// Eski seed (artık çağrılmamalı, geriye dönük uyumluluk için kalıyor)
export async function seedSubscriptionPlans() {
  // Yeni v2 seed'i çalıştır
  await seedSubscriptionPlansV2();
  return;

  // ÖLÜ KOD — eski örnek planlar
  const existing = await db.select({ id: subscriptionPlansTable.id }).from(subscriptionPlansTable).limit(1);
  if (existing.length > 0) return;

  await db.insert(subscriptionPlansTable).values([
    {
      name: "Ücretsiz",
      slug: "free",
      description: "Küçük işletmeler için temel özellikler",
      priceMonthly: "0",
      priceYearly: "0",
      maxUsers: 2,
      maxProducts: 100,
      maxBranches: 1,
      maxMonthlySales: 100,
      storageMb: 100,
      features: JSON.stringify(["Ürün yönetimi", "Temel satış", "PDF rapor"]),
      sortOrder: 0,
    },
    {
      name: "Başlangıç",
      slug: "starter",
      description: "Büyüyen işletmeler için ideal",
      priceMonthly: "299",
      priceYearly: "2990",
      maxUsers: 5,
      maxProducts: 1000,
      maxBranches: 2,
      maxMonthlySales: 500,
      storageMb: 1000,
      features: JSON.stringify([
        "Ürün yönetimi", "Satış & iade", "Tedarikçi/alış",
        "Raporlama", "Barkod/etiket", "Çoklu şube (2)",
      ]),
      sortOrder: 1,
    },
    {
      name: "Profesyonel",
      slug: "pro",
      description: "Orta ölçekli işletmeler için",
      priceMonthly: "699",
      priceYearly: "6990",
      maxUsers: 20,
      maxProducts: 10000,
      maxBranches: 10,
      maxMonthlySales: 5000,
      storageMb: 5000,
      features: JSON.stringify([
        "Tüm Başlangıç özellikleri",
        "Çoklu şube (10)", "Webhook entegrasyonu",
        "API erişimi", "Muhasebe entegrasyonu",
        "E-ticaret entegrasyonu", "CSV export",
      ]),
      sortOrder: 2,
    },
    {
      name: "Kurumsal",
      slug: "enterprise",
      description: "Büyük işletmeler ve zincirler için sınırsız",
      priceMonthly: "1499",
      priceYearly: "14990",
      maxUsers: -1,
      maxProducts: -1,
      maxBranches: -1,
      maxMonthlySales: -1,
      storageMb: 50000,
      features: JSON.stringify([
        "Tüm Pro özellikleri",
        "Sınırsız kullanıcı", "Sınırsız ürün",
        "Sınırsız şube", "Özel API entegrasyonu",
        "Öncelikli destek", "SLA garantisi",
      ]),
      sortOrder: 3,
    },
  ]);
  console.info("Subscription plans seeded");
}

// ─────────────────────────────────────────────────────────────────────────────
// KULLANIM HESAPLAMA
// ─────────────────────────────────────────────────────────────────────────────
async function calcUsage(companyId: number) {
  const [userCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(usersTable).where(eq(usersTable.companyId, companyId));
  const [productCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(productsTable).where(and(eq(productsTable.companyId, companyId), eq(productsTable.isActive, true)));
  const [branchCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(branchesTable).where(and(eq(branchesTable.companyId, companyId), eq(branchesTable.isActive, true)));

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [salesCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(salesTable).where(and(eq(salesTable.companyId, companyId), gte(salesTable.createdAt, monthStart)));

  return {
    users: userCount?.count ?? 0,
    products: productCount?.count ?? 0,
    branches: branchCount?.count ?? 0,
    monthlySales: salesCount?.count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTALAR
// ─────────────────────────────────────────────────────────────────────────────

// Planları listele (herkese açık afiş — pricing/paketler/onboarding sayfaları)
// Yetki Şeması v2 (Dalga 16): isPublic=false planlar (trial_enterprise, procurement)
//   sadece sistem tarafından otomatik atanır, kullanıcıya gösterilmez.
router.get("/plans", async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable)
      .where(and(
        eq(subscriptionPlansTable.isActive, true),
        eq(subscriptionPlansTable.isPublic, true),
      ))
      .orderBy(subscriptionPlansTable.sortOrder);
    res.json({ plans });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Süper admin için TÜM planlar (gizli sistem planları dahil) — billing yönetimi
router.get("/plans/all", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.sortOrder);
    res.json({ plans });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Şirketin güncel aboneliğini getir
router.get("/current", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;

    const [sub] = await db.select({
      subscription: companySubscriptionsTable,
      plan: subscriptionPlansTable,
    }).from(companySubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(and(
        eq(companySubscriptionsTable.companyId, cid),
        eq(companySubscriptionsTable.status, "active"),
      ))
      .orderBy(desc(companySubscriptionsTable.createdAt))
      .limit(1);

    const [company] = await db.select({
      planType: companiesTable.planType,
      trialEndsAt: companiesTable.trialEndsAt,
      name: companiesTable.name,
    }).from(companiesTable).where(eq(companiesTable.id, cid));

    const usage = await calcUsage(cid);

    res.json({
      subscription: sub?.subscription ?? null,
      plan: sub?.plan ?? null,
      companyPlanType: company?.planType,
      trialEndsAt: company?.trialEndsAt,
      usage,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Kullanım istatistiklerini getir
router.get("/usage", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const usage = await calcUsage(cid);

    // Aktif plan kısıtlamalarını bul
    const [sub] = await db.select({ plan: subscriptionPlansTable })
      .from(companySubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(and(
        eq(companySubscriptionsTable.companyId, cid),
        eq(companySubscriptionsTable.status, "active"),
      ))
      .limit(1);

    res.json({ usage, plan: sub?.plan ?? null });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Abonelik başlat / yükselt
router.post("/subscribe", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const uid = req.userId;
    const { planId, billingCycle = "monthly" } = req.body as {
      planId?: number; billingCycle?: string;
    };

    if (!planId) return void res.status(400).json(Errors.badRequest("planId gerekli"));
    if (!["monthly", "yearly"].includes(billingCycle)) {
      return void res.status(400).json(Errors.badRequest("billingCycle: monthly veya yearly olmalı"));
    }

    const [plan] = await db.select().from(subscriptionPlansTable)
      .where(and(eq(subscriptionPlansTable.id, planId), eq(subscriptionPlansTable.isActive, true)));
    if (!plan) return void res.status(404).json(Errors.notFound("Plan"));

    // Yetki Şeması v2 (Dalga 16) — gizli sistem planı koruması:
    // isPublic=false planlar (pkg_trial_enterprise, pkg_procurement) tenant admin
    // tarafından self-serve subscribe ile seçilemez. Sadece sistem otomatik atar
    // (register flow) veya super_admin /admin/billing/set-plan ile atayabilir.
    if (plan.isPublic === false) {
      return void res.status(403).json(Errors.forbidden(
        "Bu plan kullanıcı seçimine kapalıdır. Lütfen geçerli bir paket seçin."
      ));
    }
    // Hesap tipi kısıtlaması — örn. pkg_procurement sadece "purchasing" hesaplara
    if (plan.requiredAccountType) {
      const [company] = await db.select({ accountType: companiesTable.accountType })
        .from(companiesTable).where(eq(companiesTable.id, cid)).limit(1);
      if (!company || company.accountType !== plan.requiredAccountType) {
        return void res.status(403).json(Errors.forbidden(
          `Bu plan yalnızca '${plan.requiredAccountType}' hesap tipine uygundur.`
        ));
      }
    }

    // Bitiş tarihini hesapla
    const expiresAt = new Date();
    if (billingCycle === "monthly") expiresAt.setMonth(expiresAt.getMonth() + 1);
    else expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // T016 (architect): cancel + insert + invoice + company update tek transaction içinde.
    // Partial unique index `company_subscriptions_active_per_company_uq` aynı anda 2 active'i
    // engellediği için (atomic olmadan) eş zamanlı isteklerde 23505 fırlayabilir.
    const price = billingCycle === "monthly" ? plan.priceMonthly : plan.priceYearly;
    const invoiceNo = `INV-${cid}-${Date.now()}`;
    const newSub = await db.transaction(async (tx) => {
      await tx.update(companySubscriptionsTable)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(companySubscriptionsTable.companyId, cid),
          eq(companySubscriptionsTable.status, "active"),
        ));

      const [created] = await tx.insert(companySubscriptionsTable).values({
        companyId: cid,
        planId,
        billingCycle,
        status: "active",
        expiresAt,
        managedBy: uid,
      }).returning();

      await tx.insert(subscriptionInvoicesTable).values({
        subscriptionId: created.id,
        companyId: cid,
        invoiceNo,
        amount: price,
        status: Number(price) > 0 ? "pending" : "paid",
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        description: `${plan.name} plan aboneliği — ${billingCycle === "monthly" ? "Aylık" : "Yıllık"}`,
        periodStart: new Date(),
        periodEnd: expiresAt,
      });

      await tx.update(companiesTable)
        .set({ planType: "active", updatedAt: new Date() })
        .where(eq(companiesTable.id, cid));

      return created;
    });

    invalidateFeaturesCache(cid);
    await audit({
      req,
      action: "SUBSCRIPTION_CHANGE",
      entity: "company_subscriptions",
      entityId: newSub.id,
      details: { planId, planSlug: plan.slug, billingCycle, invoiceNo, companyId: cid },
    });
    res.status(201).json({ subscription: newSub, plan, invoiceNo });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Abonelik iptal
router.post("/cancel", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const { reason } = req.body as { reason?: string };

    const [active] = await db.select().from(companySubscriptionsTable)
      .where(and(
        eq(companySubscriptionsTable.companyId, cid),
        eq(companySubscriptionsTable.status, "active"),
      ));
    if (!active) return void res.status(404).json(Errors.notFound("Aktif abonelik"));

    // Grace period: abonelik bitişine kadar erişim devam eder
    const gracePeriodEndsAt = active.expiresAt ?? new Date();

    await db.update(companySubscriptionsTable)
      .set({
        status: "grace_period",
        cancelledAt: new Date(),
        gracePeriodEndsAt,
        notes: reason ?? "Kullanıcı tarafından iptal edildi",
        updatedAt: new Date(),
      })
      .where(eq(companySubscriptionsTable.id, active.id));

    await audit({
      req,
      action: "SUBSCRIPTION_CANCEL",
      entity: "company_subscriptions",
      entityId: active.id,
      details: { reason: reason ?? null, gracePeriodEndsAt, planId: active.planId },
    });

    res.json({ ok: true, gracePeriodEndsAt, message: "Abonelik iptal edildi. Dönem sonuna kadar erişiminiz devam eder." });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Abonelik yenile (iptal edilen)
router.post("/reactivate", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;

    const [cancelled] = await db.select().from(companySubscriptionsTable)
      .where(and(
        eq(companySubscriptionsTable.companyId, cid),
        eq(companySubscriptionsTable.status, "grace_period"),
      ))
      .orderBy(desc(companySubscriptionsTable.createdAt))
      .limit(1);
    if (!cancelled) return void res.status(404).json(Errors.notFound("İptal edilmiş abonelik"));

    await db.update(companySubscriptionsTable)
      .set({ status: "active", cancelledAt: null, gracePeriodEndsAt: null, updatedAt: new Date() })
      .where(eq(companySubscriptionsTable.id, cancelled.id));

    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Fatura geçmişi
router.get("/invoices", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const invoices = await db.select({
      invoice: subscriptionInvoicesTable,
      planName: subscriptionPlansTable.name,
    }).from(subscriptionInvoicesTable)
      .innerJoin(companySubscriptionsTable, eq(subscriptionInvoicesTable.subscriptionId, companySubscriptionsTable.id))
      .innerJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(subscriptionInvoicesTable.companyId, cid))
      .orderBy(desc(subscriptionInvoicesTable.createdAt))
      .limit(50);

    res.json({ invoices: invoices.map(i => ({ ...i.invoice, planName: i.planName })) });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Fatura ödendi (simülasyon — gerçekte ödeme sağlayıcısı webhook'u tetikler)
router.post("/invoices/:id/pay", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [inv] = await db.select().from(subscriptionInvoicesTable)
      .where(and(eq(subscriptionInvoicesTable.id, id), eq(subscriptionInvoicesTable.companyId, cid)));
    if (!inv) return void res.status(404).json(Errors.notFound("Fatura"));
    if (inv.status === "paid") return void res.status(409).json(Errors.conflict("Fatura zaten ödenmiş"));

    const [updated] = await db.update(subscriptionInvoicesTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(subscriptionInvoicesTable.id, id))
      .returning();

    res.json({ invoice: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─── SUPER ADMIN — Şirket aboneliği yönetimi ──────────────────────────────
router.get("/admin/all", requireAuth, requireRole(["super_admin"]), async (_req, res) => {
  try {
    const subs = await db.select({
      subscription: companySubscriptionsTable,
      plan: subscriptionPlansTable,
      companyName: companiesTable.name,
    }).from(companySubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
      .innerJoin(companiesTable, eq(companySubscriptionsTable.companyId, companiesTable.id))
      .orderBy(desc(companySubscriptionsTable.createdAt));

    res.json({ subscriptions: subs });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Super admin plan yönetimi
router.put("/plans/:id", requireAuth, requireRole(["super_admin"]), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { priceMonthly, priceYearly, maxUsers, maxProducts, isActive } = req.body as {
      priceMonthly?: string; priceYearly?: string; maxUsers?: number; maxProducts?: number; isActive?: boolean;
    };

    const updateData: Record<string, unknown> = {};
    if (priceMonthly !== undefined) updateData.priceMonthly = priceMonthly;
    if (priceYearly !== undefined) updateData.priceYearly = priceYearly;
    if (maxUsers !== undefined) updateData.maxUsers = maxUsers;
    if (maxProducts !== undefined) updateData.maxProducts = maxProducts;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db.update(subscriptionPlansTable)
      .set(updateData)
      .where(eq(subscriptionPlansTable.id, id))
      .returning();
    if (!updated) return void res.status(404).json(Errors.notFound("Plan"));

    res.json({ plan: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 71 — FEATURE INFO (frontend modül kilit kontrolü için)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/features", requireAuth, async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const ctx = await getCompanyFeatureContext(cid);
    const allFeatures = Object.values(FEATURES);
    res.json({
      features: ctx.features,
      planSlug: ctx.planSlug,
      status: ctx.status,
      trialEndsAt: ctx.trialEndsAt,
      allFeatures,
      isAllUnlocked: ctx.features.includes("*"),
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 71 — SUPER ADMIN BILLING PANEL
// ─────────────────────────────────────────────────────────────────────────────

// Tüm tenant'ları + paketlerini + trial durumlarını listele
router.get("/admin/billing/tenants", requireSuperAdmin, async (_req, res) => {
  try {
    const rows = await db.select({
      companyId: companiesTable.id,
      companyName: companiesTable.name,
      subdomain: companiesTable.subdomain,
      planType: companiesTable.planType,
      trialEndsAt: companiesTable.trialEndsAt,
      isActive: companiesTable.isActive,
      createdAt: companiesTable.createdAt,
      subId: companySubscriptionsTable.id,
      subStatus: companySubscriptionsTable.status,
      subExpiresAt: companySubscriptionsTable.expiresAt,
      planSlug: subscriptionPlansTable.slug,
      planName: subscriptionPlansTable.name,
      planPrice: subscriptionPlansTable.priceMonthly,
    })
      .from(companiesTable)
      .leftJoin(companySubscriptionsTable, and(
        eq(companySubscriptionsTable.companyId, companiesTable.id),
        inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
      ))
      .leftJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
      .orderBy(desc(companiesTable.createdAt));
    res.json({ tenants: rows });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Tenant'a manuel plan ata (trial uzat, ücretsiz upgrade vb.)
router.post("/admin/billing/set-plan", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const {
      companyId, planSlug, billingCycle = "monthly", markPaid = false, note,
      // Sprint H — CAS/version precondition: opsiyonel. Gönderilirse: mevcut active/grace
      // subscription.id BU değere eşit olmalı; aksi halde 409 + currentSubscriptionId döner.
      // Tek-process testler bunu kullanmadan da çalışır (geri-uyumlu); paralel testler veya
      // eşzamanlı admin oturumları lost-update'i provably engellemek için bunu set etmeli.
      expectedSubscriptionId,
    } = req.body as {
      companyId?: number; planSlug?: string; billingCycle?: string; markPaid?: boolean; note?: string;
      expectedSubscriptionId?: number | null;
    };
    if (!companyId || !planSlug) {
      return void res.status(400).json(Errors.badRequest("companyId ve planSlug gerekli"));
    }
    const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, planSlug));
    if (!plan) return void res.status(404).json(Errors.notFound("Plan"));

    const expiresAt = new Date();
    if (billingCycle === "yearly") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    else expiresAt.setMonth(expiresAt.getMonth() + 1);

    // T016 (architect): atomic cancel+insert+invoice+company update — partial unique index ile race önle
    // Sprint H: CAS check + per-company advisory lock + FOR UPDATE row lock → TOCTOU + no-row race kapalı.
    const txResult = await db.transaction(async (tx) => {
      // Sprint H Round 2 — per-company pg_advisory_xact_lock: companyId üzerine deterministik lock.
      // Aktif/grace satır YOKSA bile (FOR UPDATE empty result → lock yok) iki paralel set-plan
      // çağrısı bu lock üzerinden serileştirilir; null-precondition yarışı kapatılır.
      // Lock key: namespaced bigint (yüksek bit'ler subscription set-plan namespace, düşükler companyId).
      const lockKey = (BigInt(0x53455450) << 32n) | BigInt(companyId); // 'SETP' << 32 | companyId
      const signedLockKey = lockKey & 0x7fffffffffffffffn;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${signedLockKey})`);

      // Sprint H — CAS precondition (opsiyonel). Advisory lock + FOR UPDATE row-lock kombinasyonu
      // hem aktif satır var hem yok durumlarında transaction süresince state'i dondurur.
      if (typeof expectedSubscriptionId !== "undefined") {
        const currentRows = await tx.select({ id: companySubscriptionsTable.id })
          .from(companySubscriptionsTable)
          .where(and(
            eq(companySubscriptionsTable.companyId, companyId),
            inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
          ))
          .for("update");
        const currentId = currentRows[0]?.id ?? null;
        const expected = expectedSubscriptionId ?? null; // null = "no active sub bekleniyor"
        if (currentId !== expected) {
          return { conflict: true as const, currentSubscriptionId: currentId };
        }
      }

      await tx.update(companySubscriptionsTable)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(companySubscriptionsTable.companyId, companyId),
          inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
        ));

      const [created] = await tx.insert(companySubscriptionsTable).values({
        companyId,
        planId: plan.id,
        billingCycle,
        status: "active",
        expiresAt,
        managedBy: req.session.user!.id,
        notes: note ?? `Super admin tarafından ayarlandı (${plan.name})`,
      }).returning();

      if (markPaid) {
        const price = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
        await tx.insert(subscriptionInvoicesTable).values({
          subscriptionId: created.id,
          companyId,
          invoiceNo: `ADM-${companyId}-${Date.now()}`,
          amount: price,
          status: "paid",
          paidAt: new Date(),
          description: `Manuel ödeme — ${plan.name} (${billingCycle})`,
          periodStart: new Date(),
          periodEnd: expiresAt,
        });
      }

      await tx.update(companiesTable)
        .set({ planType: "active", updatedAt: new Date() })
        .where(eq(companiesTable.id, companyId));

      return { conflict: false as const, created };
    });

    if (txResult.conflict) {
      // Sprint H — CAS mismatch: caller stale state üzerinden işlem yapıyor.
      return void res.status(409).json({
        ...Errors.conflict(
          "subscription_version_mismatch",
          "Aboneliğin beklenen sürümüyle mevcut sürümü uyuşmuyor (lost-update koruması)",
          { currentSubscriptionId: txResult.currentSubscriptionId },
        ),
        currentSubscriptionId: txResult.currentSubscriptionId,
      });
    }
    const newSub = txResult.created;

    invalidateFeaturesCache(companyId);
    await audit({
      req,
      action: "SUBSCRIPTION_ADMIN_SET",
      entity: "company_subscriptions",
      entityId: newSub.id,
      details: {
        targetCompanyId: companyId,
        planSlug,
        planId: plan.id,
        billingCycle,
        markPaid,
        note: note ?? null,
      },
    });
    res.status(201).json({ subscription: newSub, plan });
  } catch (e: unknown) {
    // Sprint H Round 2 — partial unique index (active_per_company) çakışması: paralel yarış
    // kazananı hemen sonra başka tx tarafından insert edildi. 500 yerine 409 döndür ki
    // caller stale state olduğunu anlasın ve refresh ile yeniden denesin.
    const err = e as { code?: string; constraint?: string; message?: string };
    // Sprint H Round 3: SADECE active-per-company unique index çakışmasını mismatch sayalım;
    // başka unique ihlalleri (örn. invoice number vb.) yanıltıcı olmasın.
    const isActiveSubUniqueViolation = err?.code === "23505"
      && (err.constraint === "company_subscriptions_active_per_company_uq"
        || (err.message ?? "").includes("company_subscriptions_active_per_company_uq"));
    if (isActiveSubUniqueViolation) {
      try {
        const [active] = await db.select({ id: companySubscriptionsTable.id })
          .from(companySubscriptionsTable)
          .where(and(
            eq(companySubscriptionsTable.companyId, req.body?.companyId),
            inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
          ));
        const currentSubscriptionId = active?.id ?? null;
        return void res.status(409).json({
          ...Errors.conflict(
            "subscription_version_mismatch",
            "Eşzamanlı plan değişikliği nedeniyle çakışma (lost-update koruması)",
            { currentSubscriptionId, constraint: err.constraint ?? null },
          ),
          currentSubscriptionId,
        });
      } catch (refreshErr) {
        console.error("set-plan 23505 refresh failed", refreshErr);
      }
    }
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// Sprint H Round 3 — TEST-ONLY: aktif/grace subscription'ları cancel et (null-precondition race testi için).
// Production guard: NODE_ENV === "production" iken endpoint hiç mount edilmez (404).
if (process.env.NODE_ENV !== "production") {
  router.post("/admin/billing/__test_cancel_active", requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { companyId } = req.body as { companyId?: number };
      if (!companyId) return void res.status(400).json(Errors.badRequest("companyId gerekli"));
      const updated = await db.update(companySubscriptionsTable)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(companySubscriptionsTable.companyId, companyId),
          inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
        ))
        .returning({ id: companySubscriptionsTable.id });
      res.status(200).json({ cancelled: updated.length, ids: updated.map((u) => u.id) });
    } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
  });
}

// Trial uzat
router.post("/admin/billing/extend-trial", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { companyId, days = 30 } = req.body as { companyId?: number; days?: number };
    if (!companyId) return void res.status(400).json(Errors.badRequest("companyId gerekli"));

    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company) return void res.status(404).json(Errors.notFound("Şirket"));

    const base = company.trialEndsAt && company.trialEndsAt > new Date() ? company.trialEndsAt : new Date();
    const newEnd = new Date(base);
    newEnd.setDate(newEnd.getDate() + Number(days));

    await db.update(companiesTable).set({
      planType: "trial",
      trialEndsAt: newEnd,
      updatedAt: new Date(),
    }).where(eq(companiesTable.id, companyId));

    invalidateFeaturesCache(companyId);
    res.json({ ok: true, trialEndsAt: newEnd });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// MRR (Monthly Recurring Revenue) + churn metrikleri
router.get("/admin/billing/metrics", requireSuperAdmin, async (_req, res) => {
  try {
    const activeSubs = await db.select({
      planSlug: subscriptionPlansTable.slug,
      planName: subscriptionPlansTable.name,
      billingCycle: companySubscriptionsTable.billingCycle,
      priceMonthly: subscriptionPlansTable.priceMonthly,
      priceYearly: subscriptionPlansTable.priceYearly,
    })
      .from(companySubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(companySubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(companySubscriptionsTable.status, "active"));

    let mrr = 0;
    let arr = 0;
    const planBreakdown: Record<string, { count: number; mrr: number; name: string }> = {};
    for (const s of activeSubs) {
      const monthlyEquivalent = s.billingCycle === "yearly"
        ? Number(s.priceYearly) / 12
        : Number(s.priceMonthly);
      mrr += monthlyEquivalent;
      arr += monthlyEquivalent * 12;
      if (!planBreakdown[s.planSlug]) {
        planBreakdown[s.planSlug] = { count: 0, mrr: 0, name: s.planName };
      }
      planBreakdown[s.planSlug].count++;
      planBreakdown[s.planSlug].mrr += monthlyEquivalent;
    }

    const [trialCount] = await db.select({ c: count() }).from(companiesTable)
      .where(and(
        eq(companiesTable.planType, "trial"),
        gt(companiesTable.trialEndsAt, new Date()),
      ));
    const [expiredCount] = await db.select({ c: count() }).from(companiesTable)
      .where(or(
        eq(companiesTable.planType, "suspended"),
        and(
          eq(companiesTable.planType, "trial"),
          lt(companiesTable.trialEndsAt, new Date()),
        ),
      ));
    const [totalTenants] = await db.select({ c: count() }).from(companiesTable);

    const [cancelledCount] = await db.select({ c: count() }).from(companySubscriptionsTable)
      .where(eq(companySubscriptionsTable.status, "cancelled"));

    res.json({
      mrr: Math.round(mrr),
      arr: Math.round(arr),
      activeTenantCount: activeSubs.length,
      trialTenantCount: trialCount?.c ?? 0,
      expiredTenantCount: expiredCount?.c ?? 0,
      totalTenants: totalTenants?.c ?? 0,
      churnedSubscriptions: cancelledCount?.c ?? 0,
      planBreakdown,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Trial başlat (yeni şirket onboarding'inde de kullanılabilir)
router.post("/admin/billing/start-trial", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { companyId, days = 30 } = req.body as { companyId?: number; days?: number };
    if (!companyId) return void res.status(400).json(Errors.badRequest("companyId gerekli"));
    const newEnd = new Date();
    newEnd.setDate(newEnd.getDate() + Number(days));
    await db.update(companiesTable).set({
      planType: "trial", trialEndsAt: newEnd, updatedAt: new Date(),
    }).where(eq(companiesTable.id, companyId));
    invalidateFeaturesCache(companyId);
    res.json({ ok: true, trialEndsAt: newEnd });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Manuel ödeme işaretle (banka havalesi vb)
router.post("/admin/billing/mark-paid", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.body as { invoiceId?: number };
    if (!invoiceId) return void res.status(400).json(Errors.badRequest("invoiceId gerekli"));
    const [updated] = await db.update(subscriptionInvoicesTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(subscriptionInvoicesTable.id, invoiceId))
      .returning();
    if (!updated) return void res.status(404).json(Errors.notFound("Fatura"));
    invalidateFeaturesCache(updated.companyId);
    res.json({ invoice: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

export default router;
