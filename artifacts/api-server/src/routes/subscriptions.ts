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

const PLAN_DEFS = [
  {
    slug: "pkg_inventory",
    name: "Envanter",
    description: "Mağaza, depo, nalbur — sadece stok takibi",
    priceMonthly: "999",
    priceYearly: "9990",
    maxUsers: 2,
    maxBranches: 1,
    maxProducts: 5000,
    maxMonthlySales: -1,
    storageMb: 500,
    sortOrder: 1,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
    ],
  },
  {
    slug: "pkg_trade",
    name: "Ticaret",
    description: "En çok satılan paket — POS, satış, cari, e-arşiv",
    priceMonthly: "1999",
    priceYearly: "19990",
    maxUsers: 5,
    maxBranches: 2,
    maxProducts: 20000,
    maxMonthlySales: -1,
    storageMb: 2000,
    sortOrder: 2,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic,
    ],
  },
  {
    slug: "pkg_business",
    name: "İşletme",
    description: "Gider merkezi, banka, personel, OCR, demirbaş",
    priceMonthly: "3499",
    priceYearly: "34990",
    maxUsers: 10,
    maxBranches: 5,
    maxProducts: 50000,
    maxMonthlySales: -1,
    storageMb: 10000,
    sortOrder: 3,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic, FEATURES.einvoice_pro,
      FEATURES.finance_expenses, FEATURES.finance_banking, FEATURES.hr_staff,
      FEATURES.assets_fixed, FEATURES.ocr_receipts, FEATURES.documents,
      FEATURES.profit_dashboard,
    ],
  },
  {
    slug: "pkg_growth",
    name: "Büyüme",
    description: "Pazaryeri, kampanya, sadakat, çoklu para, gelişmiş raporlar",
    priceMonthly: "5999",
    priceYearly: "59990",
    maxUsers: 20,
    maxBranches: 10,
    maxProducts: -1,
    maxMonthlySales: -1,
    storageMb: 30000,
    sortOrder: 4,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic, FEATURES.einvoice_pro,
      FEATURES.finance_expenses, FEATURES.finance_banking, FEATURES.hr_staff,
      FEATURES.hr_payroll, FEATURES.assets_fixed, FEATURES.ocr_receipts,
      FEATURES.documents, FEATURES.profit_dashboard,
      FEATURES.marketplace_basic, FEATURES.marketplace_pro,
      FEATURES.campaigns, FEATURES.loyalty_points, FEATURES.currency_multi,
      FEATURES.reports_advanced,
    ],
  },
  {
    slug: "pkg_enterprise_v2",
    name: "Kurumsal",
    description: "Sınırsız + API + üretim + mali müşavir + öncelikli destek",
    priceMonthly: "9999",
    priceYearly: "99990",
    maxUsers: -1,
    maxBranches: -1,
    maxProducts: -1,
    maxMonthlySales: -1,
    storageMb: 100000,
    sortOrder: 5,
    features: [
      FEATURES.inventory_core, FEATURES.stock_counts, FEATURES.barcode_print,
      FEATURES.sales_pos, FEATURES.sales_invoices, FEATURES.customers_crm,
      FEATURES.suppliers, FEATURES.einvoice_basic, FEATURES.einvoice_pro,
      FEATURES.finance_expenses, FEATURES.finance_banking, FEATURES.hr_staff,
      FEATURES.hr_payroll, FEATURES.assets_fixed, FEATURES.ocr_receipts,
      FEATURES.documents, FEATURES.profit_dashboard,
      FEATURES.marketplace_basic, FEATURES.marketplace_pro,
      FEATURES.campaigns, FEATURES.loyalty_points, FEATURES.currency_multi,
      FEATURES.reports_advanced,
      FEATURES.api_public, FEATURES.integrations_accounting,
      FEATURES.production_bom, FEATURES.accountant_panel, FEATURES.webhooks,
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
      features: JSON.stringify(def.features),
      sortOrder: def.sortOrder,
      isActive: true,
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

  // Eski planlara bağlı aktif abonelikleri Kurumsal v2'ye migrate et (existing customer'lar erişimini kaybetmesin)
  if (deprecatedIds.length > 0) {
    const [enterprise] = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.slug, "pkg_enterprise_v2"));
    if (enterprise) {
      const migrated = await db.update(companySubscriptionsTable)
        .set({ planId: enterprise.id, updatedAt: new Date(), notes: "Auto-migrated from deprecated plan" })
        .where(and(
          inArray(companySubscriptionsTable.planId, deprecatedIds),
          inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
        ))
        .returning({ companyId: companySubscriptionsTable.companyId });
      for (const m of migrated) invalidateFeaturesCache(m.companyId);
      if (migrated.length > 0) console.info(`Migrated ${migrated.length} subscriptions to Kurumsal v2`);
    }
  }
  console.info("Subscription plans v2 seeded (5 packages)");
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

// Planları listele (herkese açık)
router.get("/plans", async (_req, res) => {
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

    // Mevcut aktif aboneliği iptal et
    await db.update(companySubscriptionsTable)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(companySubscriptionsTable.companyId, cid),
        eq(companySubscriptionsTable.status, "active"),
      ));

    // Bitiş tarihini hesapla
    const expiresAt = new Date();
    if (billingCycle === "monthly") expiresAt.setMonth(expiresAt.getMonth() + 1);
    else expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const [newSub] = await db.insert(companySubscriptionsTable).values({
      companyId: cid,
      planId,
      billingCycle,
      status: "active",
      expiresAt,
      managedBy: uid,
    }).returning();

    // Fatura oluştur (simülasyon)
    const price = billingCycle === "monthly" ? plan.priceMonthly : plan.priceYearly;
    const invoiceNo = `INV-${cid}-${Date.now()}`;
    await db.insert(subscriptionInvoicesTable).values({
      subscriptionId: newSub.id,
      companyId: cid,
      invoiceNo,
      amount: price,
      status: Number(price) > 0 ? "pending" : "paid",
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      description: `${plan.name} plan aboneliği — ${billingCycle === "monthly" ? "Aylık" : "Yıllık"}`,
      periodStart: new Date(),
      periodEnd: expiresAt,
    });

    // Şirketin plan tipini güncelle
    await db.update(companiesTable)
      .set({ planType: "active", updatedAt: new Date() })
      .where(eq(companiesTable.id, cid));

    invalidateFeaturesCache(cid);
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
    const { companyId, planSlug, billingCycle = "monthly", markPaid = false, note } = req.body as {
      companyId?: number; planSlug?: string; billingCycle?: string; markPaid?: boolean; note?: string;
    };
    if (!companyId || !planSlug) {
      return void res.status(400).json(Errors.badRequest("companyId ve planSlug gerekli"));
    }
    const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, planSlug));
    if (!plan) return void res.status(404).json(Errors.notFound("Plan"));

    // Mevcut aktif aboneliği iptal et
    await db.update(companySubscriptionsTable)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(companySubscriptionsTable.companyId, companyId),
        inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
      ));

    const expiresAt = new Date();
    if (billingCycle === "yearly") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    else expiresAt.setMonth(expiresAt.getMonth() + 1);

    const [newSub] = await db.insert(companySubscriptionsTable).values({
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
      await db.insert(subscriptionInvoicesTable).values({
        subscriptionId: newSub.id,
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

    await db.update(companiesTable)
      .set({ planType: "active", updatedAt: new Date() })
      .where(eq(companiesTable.id, companyId));

    invalidateFeaturesCache(companyId);
    res.status(201).json({ subscription: newSub, plan });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

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
