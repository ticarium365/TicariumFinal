import { Router, Request, Response } from "express";
import {
  db,
  subscriptionPlansTable, companySubscriptionsTable,
  subscriptionInvoicesTable, subscriptionUsageTable,
  usersTable, productsTable, branchesTable, salesTable,
  companiesTable,
  contactRequestsTable,
  productFunnelEventsTable,
  paymentsTable,
  collectionReminderActionsTable,
  b2bQuoteRequestsTable,
} from "@workspace/db";
import { and, eq, desc, sql, gte, lte, lt, isNotNull } from "drizzle-orm";
import { requireAuth, requireRole, requireSuperAdmin } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { getCompanyFeatureContext, invalidateFeaturesCache } from "../middlewares/features.js";
import { audit } from "../lib/audit.js";
import {
  computeFounderOvernightPackV1,
  computeB2bOpsSupplementV1,
  buildFounderIntelligenceV2,
  buildFounderIntelligenceV3,
  buildRevenueEngineBundleV1,
  buildChurnPreventionBundleV1,
  buildB2bOpsBundleV1,
  buildDocsPlaybooksBundleV1,
  buildBillingMetricsPerformanceBundleV1,
} from "../lib/founder-overnight-pack.js";
import { inArray, gt, isNull, or, count } from "drizzle-orm";

const router = Router();

const MAX_SUBSCRIPTION_NOTES_CHARS = 12_000;

function appendSubscriptionNote(previous: string | null | undefined, newLine: string): string {
  const base = (previous ?? "").trim();
  const next = base ? `${newLine}\n${base}` : newLine;
  return next.length > MAX_SUBSCRIPTION_NOTES_CHARS ? next.slice(0, MAX_SUBSCRIPTION_NOTES_CHARS) : next;
}

function buildCancelNoteLine(reason: string | undefined): string {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const tail = reason?.trim()
    ? reason.trim().slice(0, 500).replace(/\s+/g, " ")
    : "Kullanıcı tarafından iptal";
  return `[cancel ${stamp}] ${tail}`;
}

const CANCEL_REASON_CODES = new Set(["price", "features", "support", "pause", "other", "unknown"]);

const CANCEL_REASON_LABELS: Record<string, string> = {
  price: "Fiyat",
  features: "Özellik",
  support: "Destek",
  pause: "Geçici durdurma",
  other: "Diğer",
  unknown: "Belirtilmedi",
};

function normalizeCancelReasonCode(input: unknown): string {
  const s = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (CANCEL_REASON_CODES.has(s)) return s;
  return "unknown";
}

function parseCancelReasonLabel(notes: string | null | undefined): string {
  if (!notes) return "Belirtilmedi";
  const m = notes.match(/\[cancel[^\]\n]*\]\s*(.+?)(?:\n|$)/s);
  if (m?.[1]) {
    const t = m[1].trim();
    return t ? t.slice(0, 120) : "Belirtilmedi";
  }
  const trimmed = notes.trim();
  if (!trimmed) return "Belirtilmedi";
  return trimmed.length <= 120 ? trimmed : `${trimmed.slice(0, 117)}…`;
}

function churnReasonDisplay(row: { cancelReason: string | null; notes: string | null }): string {
  const c = row.cancelReason?.trim().toLowerCase() ?? "";
  if (c && CANCEL_REASON_CODES.has(c)) {
    return CANCEL_REASON_LABELS[c] ?? c;
  }
  return parseCancelReasonLabel(row.notes);
}

function collectionReminderLevel(oldestDueDays: number): "soft" | "firm" | "urgent" {
  if (oldestDueDays <= 7) return "soft";
  if (oldestDueDays <= 30) return "firm";
  return "urgent";
}

/** Heuristik: tahsil edilebilirlik / ödeme olasılığı (0–100), eğitimli model değil. */
function collectionRecoverability01(
  overdueTry: number,
  oldestDueDays: number,
  tier: "soft" | "firm" | "urgent",
): { payProbability0to100: number; basis: string } {
  const tierBoost = tier === "urgent" ? 22 : tier === "firm" ? 12 : 0;
  const safeTry = Math.max(0, overdueTry);
  const money = Math.min(55, Math.log10(100 + safeTry) * 14);
  const age = Math.min(40, oldestDueDays * 1.15);
  const p = Math.min(100, Math.round(money + age + tierBoost));
  const basis = `log(TRY+100)→${money.toFixed(0)} + yaş(${oldestDueDays}g)→${age.toFixed(0)} + ${tier}(+${tierBoost})`;
  return { payProbability0to100: p, basis };
}

type RecoV2Shape = {
  id: string;
  kind: string;
  roiScore: number;
  headline: string;
  rationale: string;
  companyId?: number;
  sellerCompanyId?: number;
  requestId?: number;
  amountTry?: number;
  badges: string[];
};

/** Kuralsal kopya — LLM değil; aksiyon başına kısa karar desteği. */
function copilotEnrichV1(a: RecoV2Shape): {
  whyNow: string;
  expectedRoiBand: string;
  ifIgnored: string;
  estimatedImpactTryBand: string;
} {
  switch (a.kind) {
    case "collect_call": {
      const amt = Math.max(0, a.amountTry ?? 0);
      const low = Math.round(amt * 0.12);
      const high = Math.round(amt * 0.42);
      return {
        whyNow: "Vadesi geçmiş bakiye yaşlandıkça tahsil maliyeti ve ilişki riski artar; skor bu yüzden öne çıktı.",
        expectedRoiBand: `Heuristik kısmi tahsil bandı ~${low}–${high} TRY (ROI skoru ${a.roiScore}).`,
        ifIgnored: "Nakit akışı baskısı ve tahsilat zinciri uzar; sonraki vade dönemleri üst üste biner.",
        estimatedImpactTryBand: `${low}–${high} TRY`,
      };
    }
    case "plan_upgrade": {
      return {
        whyNow: "Limit baskısı veya satış yoğunluğu yükseltme penceresini kısaltır; rakip kaçırılmaması için zaman kritik.",
        expectedRoiBand: `Segment skoru ${a.roiScore}; paket farkına göre MRR artışı kataloğa bağlı.`,
        ifIgnored: "Ürün/depo limiti tıkanınca büyüme durur ve memnuniyet düşebilir.",
        estimatedImpactTryBand: "MRR ↑",
      };
    }
    case "b2b_sla": {
      return {
        whyNow: "Bekleyen teklifler soğur; yanıt SLA’sı B2B güveninin doğrudan göstergesi.",
        expectedRoiBand: `Pipeline hızı; ROI skoru ${a.roiScore} (kapanan teklif başına gelir potansiyeli).`,
        ifIgnored: "Alıcı tarafında hayal kırıklığı ve teklif düşüşü; tekrarlayan kayıplar.",
        estimatedImpactTryBand: "Pipeline koruma",
      };
    }
    case "grace_churn_save": {
      return {
        whyNow: "Grace / iptal hattındaki MRR bugün kaybedilirse geri kazanım maliyeti çok artar.",
        expectedRoiBand: `MRR koruma önceliği; skor ${a.roiScore}.`,
        ifIgnored: "Aylık tekrarlayan gelir kaybı ve marka güveni zedelenmesi.",
        estimatedImpactTryBand: "MRR koruma",
      };
    }
    case "collect_followup": {
      return {
        whyNow: "Uzun süre “iletişimde” kalan kayıtlar operasyon gürültüsü yaratır ve sonuç belirsiz kalır.",
        expectedRoiBand: `Operasyon netliği; skor ${a.roiScore}.`,
        ifIgnored: "Tahsilat kuyruğu şişer; gerçek tahsil edilebilir vaka kaybolur.",
        estimatedImpactTryBand: "Operasyon",
      };
    }
    default:
      return {
        whyNow: "Sinyaller bu aksiyonu öne çıkardı; günlük yürütmede öncelik sırası netleşsin.",
        expectedRoiBand: `Öncelik skoru ${a.roiScore}.`,
        ifIgnored: "Fırsat maliyeti: ertelenen aksiyonlar birikerek haftayı zorlar.",
        estimatedImpactTryBand: "Belirsiz",
      };
  }
}

function upgradeProbability01(args: {
  upsellScore: number;
  planLimitPressurePct: number;
  sales30d: number;
}): number {
  const p = 38
    + Math.min(32, args.upsellScore / 18)
    + Math.min(22, args.planLimitPressurePct / 4.2)
    + Math.min(8, args.sales30d / 4);
  return Math.min(100, Math.round(p));
}

/** Pazartesi başlangıçlı hafta anahtarı (YYYY-MM-DD, yerel). */
function mondayPeriodKey(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function reminderActionIdempotencyKey(companyId: number, periodKey: string, tier: string): string {
  return `cr:${companyId}:${periodKey}:${tier.toLowerCase()}:touch`;
}

const REMINDER_ACTION_STATUSES = new Set(["queued", "contacted", "snoozed", "dismissed", "resolved"]);

async function recordOverdueInvoiceRecovered(args: {
  companyId: number;
  userId: number | null;
  invoiceId: number;
  amountTry: number;
}): Promise<void> {
  try {
    await db.insert(productFunnelEventsTable).values({
      companyId: args.companyId,
      userId: args.userId ?? undefined,
      eventKey: "overdue_invoice_recovered",
      props: JSON.stringify({
        invoiceId: args.invoiceId,
        amountTry: Math.round(args.amountTry),
      }).slice(0, 4000),
    });
  } catch {
    /* tablo yok / izin */
  }
  try {
    const ago14 = new Date(Date.now() - 14 * 86400000);
    const [touch] = await db.select({ id: collectionReminderActionsTable.id }).from(collectionReminderActionsTable)
      .where(and(
        eq(collectionReminderActionsTable.companyId, args.companyId),
        eq(collectionReminderActionsTable.status, "contacted"),
        gte(collectionReminderActionsTable.createdAt, ago14),
      ))
      .orderBy(desc(collectionReminderActionsTable.createdAt))
      .limit(1);
    if (!touch) return;
    await db.insert(productFunnelEventsTable).values({
      companyId: args.companyId,
      userId: args.userId ?? undefined,
      eventKey: "overdue_invoice_recovered_after_reminder",
      props: JSON.stringify({
        invoiceId: args.invoiceId,
        amountTry: Math.round(args.amountTry),
        reminderActionId: touch.id,
      }).slice(0, 4000),
    });
  } catch {
    /* aksiyon tablosu yok / izin */
  }
}

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

// Süper admin için TÜM planlar (gizli + pasif sistem planları dahil) — billing
// yönetimi. Dalga 24 fix: artık isActive filtrelemez, çünkü panel soft-delete
// edilen planları da göstermeli (re-activate akışı + recovery için).
router.get("/plans/all", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable)
      .orderBy(subscriptionPlansTable.sortOrder, subscriptionPlansTable.id);
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
    const { reason, cancelReasonCode } = req.body as { reason?: string; cancelReasonCode?: string };
    const reasonCode = normalizeCancelReasonCode(cancelReasonCode);
    const reasonDetail = reason?.trim().slice(0, 2000) || null;

    const [active] = await db.select().from(companySubscriptionsTable)
      .where(and(
        eq(companySubscriptionsTable.companyId, cid),
        eq(companySubscriptionsTable.status, "active"),
      ));
    if (!active) return void res.status(404).json(Errors.notFound("Aktif abonelik"));

    // Grace period: abonelik bitişine kadar erişim devam eder
    const gracePeriodEndsAt = active.expiresAt ?? new Date();

    const cancelLine = buildCancelNoteLine(reason);
    await db.update(companySubscriptionsTable)
      .set({
        status: "grace_period",
        cancelledAt: new Date(),
        gracePeriodEndsAt,
        notes: appendSubscriptionNote(active.notes, cancelLine),
        cancelReason: reasonCode,
        cancelReasonDetail: reasonDetail ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(companySubscriptionsTable.id, active.id));

    await audit({
      req,
      action: "SUBSCRIPTION_CANCEL",
      entity: "company_subscriptions",
      entityId: active.id,
      details: {
        reason: reason ?? null,
        cancelReasonCode: reasonCode,
        gracePeriodEndsAt,
        planId: active.planId,
      },
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
      .set({
        status: "active",
        cancelledAt: null,
        gracePeriodEndsAt: null,
        cancelReason: null,
        cancelReasonDetail: null,
        updatedAt: new Date(),
      })
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

// Tahsilat önceliği — kiracı admin için özet (vadesi yaklaşan / gecikmiş bekleyen faturalar)
router.get("/invoices/collection-brief", requireAuth, requireRole(["admin"]), async (req: Request, res: Response) => {
  try {
    const cid = req.companyId;
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const rows = await db.select().from(subscriptionInvoicesTable)
      .where(and(
        eq(subscriptionInvoicesTable.companyId, cid),
        eq(subscriptionInvoicesTable.status, "pending"),
      ));

    let pendingTotalTry = 0;
    let dueNext7DaysTry = 0;
    let dueNext7DaysCount = 0;
    let overdueTry = 0;
    let overdueCount = 0;
    let maxOverdueDays = 0;
    const buckets = {
      days0to7: { try: 0, count: 0 },
      days8to30: { try: 0, count: 0 },
      days31Plus: { try: 0, count: 0 },
    };

    for (const inv of rows) {
      const amt = Number(inv.amount);
      pendingTotalTry += amt;
      const d = inv.dueDate ? new Date(inv.dueDate) : null;
      if (!d) continue;
      if (d >= now && d <= in7) {
        dueNext7DaysTry += amt;
        dueNext7DaysCount++;
      }
      if (d < now) {
        overdueTry += amt;
        overdueCount++;
        const daysLate = Math.floor((now.getTime() - d.getTime()) / 86400000);
        if (daysLate > maxOverdueDays) maxOverdueDays = daysLate;
        if (daysLate < 7) {
          buckets.days0to7.try += amt;
          buckets.days0to7.count++;
        } else if (daysLate < 30) {
          buckets.days8to30.try += amt;
          buckets.days8to30.count++;
        } else {
          buckets.days31Plus.try += amt;
          buckets.days31Plus.count++;
        }
      }
    }

    const topByPriority = rows
      .filter((r) => r.dueDate)
      .map((r) => {
        const d = new Date(r.dueDate!);
        const amt = Number(r.amount);
        const daysOverdue = d < now ? Math.min(365, Math.floor((now.getTime() - d.getTime()) / 86400000)) : 0;
        const priorityScore = Math.round(amt * (1 + daysOverdue / 30));
        return {
          id: r.id,
          invoiceNo: r.invoiceNo,
          amountTry: Math.round(amt),
          dueDate: r.dueDate,
          daysOverdue,
          priorityScore,
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 5);

    let suggestedCollectionReminder: "none" | "soft" | "firm" | "urgent" = "none";
    if (overdueCount > 0) {
      suggestedCollectionReminder = collectionReminderLevel(maxOverdueDays);
    } else if (dueNext7DaysCount > 0) {
      suggestedCollectionReminder = "soft";
    }

    res.json({
      pendingTotalTry: Math.round(pendingTotalTry),
      dueNext7DaysTry: Math.round(dueNext7DaysTry),
      dueNext7DaysCount,
      overdueTry: Math.round(overdueTry),
      overdueCount,
      overdueBucketsTry: {
        days0to7: Math.round(buckets.days0to7.try),
        days8to30: Math.round(buckets.days8to30.try),
        days31Plus: Math.round(buckets.days31Plus.try),
      },
      overdueBucketsCount: {
        days0to7: buckets.days0to7.count,
        days8to30: buckets.days8to30.count,
        days31Plus: buckets.days31Plus.count,
      },
      topInvoicesByCollectionScore: topByPriority,
      suggestedCollectionReminder,
      reminderPolicyNote: "Sinyal yalnızca önceliklendirme içindir; otomatik e-posta veya dış bildirim gönderilmez.",
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// Tahsilat hatırlatma sinyalleri — salt okunur kuyruk (e-posta / dış kanal yok).
router.get("/admin/billing/collection-reminder-signals", requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const rows = await db
      .select({
        companyId: subscriptionInvoicesTable.companyId,
        overdueTry: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
        oldestDue: sql<Date | null>`min(${subscriptionInvoicesTable.dueDate})`,
        invCount: sql<number>`count(*)::int`,
      })
      .from(subscriptionInvoicesTable)
      .where(and(
        eq(subscriptionInvoicesTable.status, "pending"),
        isNotNull(subscriptionInvoicesTable.dueDate),
        lte(subscriptionInvoicesTable.dueDate, now),
      ))
      .groupBy(subscriptionInvoicesTable.companyId)
      .orderBy(desc(sql`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`))
      .limit(80);

    const ids = rows.map((r) => r.companyId).filter((id) => Number.isInteger(id));
    const names = ids.length
      ? await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(inArray(companiesTable.id, ids))
      : [];
    const nameById = new Map(names.map((r) => [r.id, r.name]));

    let soft = 0;
    let firm = 0;
    let urgent = 0;
    const queue = rows.map((r) => {
      const oldest = r.oldestDue ? new Date(r.oldestDue as Date) : now;
      const oldestDueDays = Math.min(365, Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 86400000)));
      const level = collectionReminderLevel(oldestDueDays);
      if (level === "soft") soft++;
      else if (level === "firm") firm++;
      else urgent++;
      return {
        companyId: r.companyId,
        name: nameById.get(r.companyId) ?? `#${r.companyId}`,
        overdueTry: Math.round(Number(r.overdueTry ?? 0)),
        oldestDueDays,
        reminderLevel: level,
        pendingInvoiceCount: Number(r.invCount ?? 0),
      };
    });

    res.json({
      generatedAt: now.toISOString(),
      reminderPolicyNote: "Salt okunur sinyal listesi. Otomatik hatırlatma veya üçüncü taraf bildirimi tetiklenmez.",
      segments: { soft, firm, urgent, totalCompanies: queue.length },
      queue,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

// Tahsilat aksiyon kuyruğu — idempotent kayıt + durum güncelleme (e-posta göndermez).
router.get("/admin/billing/collection-reminder-actions", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "open";
    const lim = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
    const openStatuses = ["queued", "contacted", "snoozed"] as const;

    const base = () => db.select({
      action: collectionReminderActionsTable,
      companyName: companiesTable.name,
    })
      .from(collectionReminderActionsTable)
      .innerJoin(companiesTable, eq(collectionReminderActionsTable.companyId, companiesTable.id));

    const rows = status === "open"
      ? await base()
        .where(inArray(collectionReminderActionsTable.status, [...openStatuses]))
        .orderBy(desc(collectionReminderActionsTable.createdAt))
        .limit(lim)
      : status === "all"
        ? await base()
          .orderBy(desc(collectionReminderActionsTable.createdAt))
          .limit(lim)
        : await base()
          .where(eq(collectionReminderActionsTable.status, status))
          .orderBy(desc(collectionReminderActionsTable.createdAt))
          .limit(lim);

    res.json({
      actions: rows.map((r) => ({
        ...r.action,
        companyName: r.companyName,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

router.post("/admin/billing/collection-reminder-actions", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      companyId?: number;
      reminderTier?: string;
      status?: string;
      notes?: string;
      overdueTrySnapshot?: number;
    };
    const companyId = Number(body.companyId);
    if (!Number.isInteger(companyId)) return void res.status(400).json(Errors.badRequest("companyId gerekli"));
    const tierRaw = typeof body.reminderTier === "string" ? body.reminderTier.toLowerCase() : "";
    if (!["soft", "firm", "urgent"].includes(tierRaw)) {
      return void res.status(400).json(Errors.badRequest("reminderTier: soft | firm | urgent"));
    }
    const st = typeof body.status === "string" && REMINDER_ACTION_STATUSES.has(body.status) ? body.status : "queued";
    const periodKey = mondayPeriodKey(new Date());
    const idempotencyKey = reminderActionIdempotencyKey(companyId, periodKey, tierRaw);
    const snap = Math.round(Number(body.overdueTrySnapshot ?? 0));

    try {
      const [inserted] = await db.insert(collectionReminderActionsTable).values({
        companyId,
        periodKey,
        reminderTier: tierRaw,
        status: st,
        notes: body.notes?.trim().slice(0, 2000) || null,
        overdueTrySnapshot: snap,
        idempotencyKey,
        createdByUserId: req.session?.user?.id ?? null,
        updatedAt: new Date(),
      }).returning();
      if (inserted) {
        void db.insert(productFunnelEventsTable).values({
          companyId,
          userId: req.session?.user?.id ?? undefined,
          eventKey: "collection_reminder_action_created",
          props: JSON.stringify({ actionId: inserted.id, tier: tierRaw, status: st }).slice(0, 4000),
        }).catch(() => {});
        return res.status(201).json({ action: inserted });
      }
    } catch (ins: unknown) {
      const code = (ins as { code?: string })?.code;
      if (code === "23505") {
        const [existing] = await db.select().from(collectionReminderActionsTable)
          .where(eq(collectionReminderActionsTable.idempotencyKey, idempotencyKey));
        if (existing) return res.status(200).json({ action: existing, idempotent: true });
      }
      throw ins;
    }
    return void res.status(500).json({ message: "Kayıt oluşturulamadı" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
});

router.patch("/admin/billing/collection-reminder-actions/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));
    const { status, notes } = req.body as { status?: string; notes?: string };
    if (!status || !REMINDER_ACTION_STATUSES.has(status)) {
      return void res.status(400).json(Errors.badRequest("status geçersiz"));
    }
    const patch: {
      status: string;
      updatedAt: Date;
      notes?: string | null;
    } = { status, updatedAt: new Date() };
    if (notes !== undefined) patch.notes = String(notes).trim().slice(0, 2000) || null;

    const [updated] = await db.update(collectionReminderActionsTable)
      .set(patch)
      .where(eq(collectionReminderActionsTable.id, id))
      .returning();
    if (!updated) return void res.status(404).json(Errors.notFound("Aksiyon"));

    void db.insert(productFunnelEventsTable).values({
      companyId: updated.companyId,
      userId: req.session?.user?.id ?? undefined,
      eventKey: "collection_reminder_action_updated",
      props: JSON.stringify({ actionId: id, status }).slice(0, 4000),
    }).catch(() => {});

    res.json({ action: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
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

    const wasOverdue = inv.status === "pending"
      && inv.dueDate
      && new Date(inv.dueDate) < new Date();

    const [updated] = await db.update(subscriptionInvoicesTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(subscriptionInvoicesTable.id, id))
      .returning();

    if (wasOverdue) {
      void recordOverdueInvoiceRecovered({
        companyId: cid,
        userId: req.session?.user?.id ?? null,
        invoiceId: id,
        amountTry: Number(inv.amount),
      });
    }

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

// ─── Dalga 24 — SÜPER ADMIN PLAN YÖNETİM PANELİ ─────────────────────────
//
// Plan tanımlarının (subscription_plans) tam CRUD'u: liste/oluştur/güncelle/
// soft-delete. PUT artık tüm düzenlenebilir alanları destekler (önceki 5 alan
// dar kapsamlıydı). Tüm mutasyonlar audit log'a yazılır + tüm tenant'ların
// feature cache'i invalidate edilir (plan değişimi feature listesini etkiler).
//
// Yetkilendirme: yalnızca super_admin (requireSuperAdmin middleware).
// Schema doğrulama: prices >= 0, limits integer (-1=sınırsız), features JSON
// array string. Slug değişikliği YASAK (subscription kayıtları slug bazlı
// referans tutmaz ama feature-codes mapping'i slug bazlı; karışıklığı önler).
// ────────────────────────────────────────────────────────────────────────

const PLAN_EDITABLE_FIELDS = [
  "name", "description", "priceMonthly", "priceYearly",
  "maxUsers", "maxProducts", "maxBranches", "maxMonthlySales", "storageMb",
  "maxEinvoiceMonthly", "einvoiceOverageRate",
  "maxOcrMonthly", "maxApiCallsMonthly",
  "maxCustomers", "maxMarketplaceChannels",
  "features", "isActive", "isPublic", "requiredAccountType", "sortOrder",
] as const;

function buildPlanUpdate(body: Record<string, unknown>): { data: Record<string, unknown>; error?: string } {
  const data: Record<string, unknown> = {};
  for (const k of PLAN_EDITABLE_FIELDS) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v === undefined) continue;

    // Numeric string fields (drizzle numeric → string)
    if (k === "priceMonthly" || k === "priceYearly" || k === "einvoiceOverageRate") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < 0) return { data, error: `${k} >= 0 olmalı` };
      data[k] = String(n);
      continue;
    }
    // Integer limit fields (-1 = sınırsız)
    const intFields = new Set([
      "maxUsers", "maxProducts", "maxBranches", "maxMonthlySales", "storageMb",
      "maxEinvoiceMonthly", "maxOcrMonthly", "maxApiCallsMonthly",
      "maxCustomers", "maxMarketplaceChannels", "sortOrder",
    ]);
    if (intFields.has(k)) {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isInteger(n) || n < -1) return { data, error: `${k} integer (>= -1) olmalı` };
      data[k] = n;
      continue;
    }
    // Boolean fields
    if (k === "isActive" || k === "isPublic") {
      if (typeof v !== "boolean") return { data, error: `${k} boolean olmalı` };
      data[k] = v;
      continue;
    }
    // features → JSON string of array
    if (k === "features") {
      let arr: unknown = v;
      if (typeof v === "string") {
        try { arr = JSON.parse(v); } catch { return { data, error: "features JSON array olmalı" }; }
      }
      if (!Array.isArray(arr) || !arr.every(x => typeof x === "string")) {
        return { data, error: "features string[] olmalı" };
      }
      data[k] = JSON.stringify(arr);
      continue;
    }
    // Text fields (name, description, requiredAccountType)
    if (v === null) { data[k] = null; continue; }
    if (typeof v !== "string") return { data, error: `${k} string olmalı` };
    data[k] = v;
  }
  return { data };
}

// Tüm tenant'ların feature cache'ini topluca invalidate et — plan tanımı
// değiştikten sonra her firma yeni feature setine geçmeli.
async function invalidateAllFeatureCaches(): Promise<void> {
  const ids = await db.select({ id: companiesTable.id }).from(companiesTable);
  for (const c of ids) invalidateFeaturesCache(c.id);
}

// CREATE — yeni plan tanımı
router.post("/plans", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!/^[a-z0-9_]+$/i.test(slug) || slug.length < 3 || slug.length > 64) {
      return void res.status(400).json(Errors.badRequest("slug: 3-64 karakter, [a-zA-Z0-9_]"));
    }
    if (!name) return void res.status(400).json(Errors.badRequest("name gerekli"));

    const [exists] = await db.select({ id: subscriptionPlansTable.id })
      .from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, slug)).limit(1);
    if (exists) return void res.status(409).json(Errors.conflict(`slug '${slug}' zaten kullanılıyor`));

    const { data, error } = buildPlanUpdate({ ...body, name });
    if (error) return void res.status(400).json(Errors.badRequest(error));

    const insertVals: Record<string, unknown> = { slug, name, ...data };
    const [created] = await db.insert(subscriptionPlansTable).values(insertVals as any).returning();

    await audit({
      req,
      action: "PLAN_CREATE",
      entity: "subscription_plans",
      entityId: created.id,
      details: { slug: created.slug, name: created.name },
    });
    // Dalga 24 fix — mutation contract: create de cache invalidate eder
    // (consistency; yeni plan henüz abone yokken impact düşük ama future-proof).
    await invalidateAllFeatureCaches();
    res.status(201).json({ plan: created });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// UPDATE — tüm düzenlenebilir alanlar
router.put("/plans/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const { data, error } = buildPlanUpdate((req.body ?? {}) as Record<string, unknown>);
    if (error) return void res.status(400).json(Errors.badRequest(error));
    if (Object.keys(data).length === 0) return void res.status(400).json(Errors.badRequest("Güncellenecek alan yok"));

    const [updated] = await db.update(subscriptionPlansTable)
      .set(data as any)
      .where(eq(subscriptionPlansTable.id, id))
      .returning();
    if (!updated) return void res.status(404).json(Errors.notFound("Plan"));

    await audit({
      req,
      action: "PLAN_UPDATE",
      entity: "subscription_plans",
      entityId: id,
      details: { fields: Object.keys(data), slug: updated.slug },
    });
    await invalidateAllFeatureCaches();
    res.json({ plan: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

// SOFT-DELETE — isActive=false. Aktif abone varsa engelle (veri tutarlılığı).
router.delete("/plans/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return void res.status(400).json(Errors.badRequest("Geçersiz ID"));

    const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id)).limit(1);
    if (!plan) return void res.status(404).json(Errors.notFound("Plan"));

    const [{ activeCount }] = await db.select({
      activeCount: sql<number>`COUNT(*)::int`,
    }).from(companySubscriptionsTable).where(and(
      eq(companySubscriptionsTable.planId, id),
      inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
    ));
    if (Number(activeCount) > 0) {
      return void res.status(409).json(Errors.conflict(
        `${activeCount} aktif abone var; önce başka plana taşıyın veya iptal edin.`
      ));
    }

    const [updated] = await db.update(subscriptionPlansTable)
      .set({ isActive: false })
      .where(eq(subscriptionPlansTable.id, id))
      .returning();

    await audit({
      req,
      action: "PLAN_DELETE",
      entity: "subscription_plans",
      entityId: id,
      details: { slug: plan.slug, name: plan.name, soft: true },
    });
    await invalidateAllFeatureCaches();
    res.json({ ok: true, plan: updated });
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
      const lockedSubs = await tx.select({
        id: companySubscriptionsTable.id,
        planId: companySubscriptionsTable.planId,
      })
        .from(companySubscriptionsTable)
        .where(and(
          eq(companySubscriptionsTable.companyId, companyId),
          inArray(companySubscriptionsTable.status, ["active", "grace_period"]),
        ))
        .for("update");

      if (typeof expectedSubscriptionId !== "undefined") {
        const currentId = lockedSubs[0]?.id ?? null;
        const expected = expectedSubscriptionId ?? null; // null = "no active sub bekleniyor"
        if (currentId !== expected) {
          return { conflict: true as const, currentSubscriptionId: currentId };
        }
      }

      let prevPlanSlugForEvent: string | null = null;
      const prevPidLock = lockedSubs[0]?.planId;
      if (prevPidLock != null) {
        const [psRow] = await tx.select({ slug: subscriptionPlansTable.slug })
          .from(subscriptionPlansTable)
          .where(eq(subscriptionPlansTable.id, prevPidLock))
          .limit(1);
        prevPlanSlugForEvent = psRow?.slug ?? null;
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

      if (prevPlanSlugForEvent !== planSlug) {
        await tx.insert(productFunnelEventsTable).values({
          companyId,
          userId: req.session.user!.id,
          eventKey: "plan_upgraded",
          props: JSON.stringify({
            source: "admin_set_plan",
            prev_plan_slug: prevPlanSlugForEvent,
            new_plan_slug: planSlug,
            billing_cycle: billingCycle,
          }).slice(0, 4000),
        });
      }

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
  const billingMetricsStartedAt = Date.now();
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

    const now = new Date();
    const ago7 = new Date(now);
    ago7.setDate(ago7.getDate() - 7);
    const ago30 = new Date(now);
    ago30.setDate(ago30.getDate() - 30);
    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);

    const [
      trialsEndingSoonRow,
      churn30Row,
      pendingInv7Row,
      newActive7Row,
      salesTenants7Row,
      topSalesRows,
      newStarts30Row,
    ] = await Promise.all([
      db.select({ c: count() }).from(companiesTable).where(and(
        eq(companiesTable.planType, "trial"),
        isNotNull(companiesTable.trialEndsAt),
        gte(companiesTable.trialEndsAt, now),
        lte(companiesTable.trialEndsAt, in7),
      )),
      db.select({ c: count() }).from(companySubscriptionsTable).where(and(
        eq(companySubscriptionsTable.status, "cancelled"),
        isNotNull(companySubscriptionsTable.cancelledAt),
        gte(companySubscriptionsTable.cancelledAt, ago30),
      )),
      db.select({ c: count() }).from(subscriptionInvoicesTable).where(and(
        eq(subscriptionInvoicesTable.status, "pending"),
        gte(subscriptionInvoicesTable.createdAt, ago7),
      )),
      db.select({ c: count() }).from(companySubscriptionsTable).where(and(
        eq(companySubscriptionsTable.status, "active"),
        gte(companySubscriptionsTable.startedAt, ago7),
      )),
      db
        .select({ c: sql<number>`count(DISTINCT ${salesTable.companyId})::int` })
        .from(salesTable)
        .where(gte(salesTable.createdAt, ago7)),
      db
        .select({
          companyId: salesTable.companyId,
          saleCount: sql<number>`count(*)::int`,
        })
        .from(salesTable)
        .where(gte(salesTable.createdAt, ago7))
        .groupBy(salesTable.companyId)
        .orderBy(desc(sql`count(*)`))
        .limit(5),
      db.select({ c: count() }).from(companySubscriptionsTable).where(and(
        eq(companySubscriptionsTable.status, "active"),
        gte(companySubscriptionsTable.startedAt, ago30),
      )),
    ]);

    const topIds = topSalesRows
      .map((r: { companyId: number }) => r.companyId)
      .filter((id: number): id is number => Number.isInteger(id));
    const topNames = topIds.length
      ? await db.select({ id: companiesTable.id, name: companiesTable.name })
        .from(companiesTable)
        .where(inArray(companiesTable.id, topIds))
      : [];
    type NameRow = (typeof topNames)[number];
    const nameById = new Map<number, string>(topNames.map((r: NameRow) => [r.id, r.name]));
    const topTenantsBySales7d = topSalesRows.map((r: { companyId: number; saleCount: number | string }) => ({
      companyId: r.companyId,
      name: nameById.get(r.companyId) ?? `#${r.companyId}`,
      salesCount: Number(r.saleCount ?? 0),
    }));

    const ago14 = new Date(now);
    ago14.setDate(ago14.getDate() - 14);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      inactiveTenants7dRow,
      last7ByCompany,
      prev7ByCompany,
      invoiceRiskRows,
      topPlansMonthRows,
      supportHeavyRows,
      hotTrialSqlResult,
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` })
        .from(companiesTable)
        .where(and(
          eq(companiesTable.isActive, true),
          inArray(companiesTable.accountType, ["seller", "both"]),
          sql`NOT EXISTS (
            SELECT 1 FROM sales s
            WHERE s.company_id = ${companiesTable.id} AND s.created_at >= ${ago7}
          )`,
        )),
      db
        .select({ companyId: salesTable.companyId, c: sql<number>`count(*)::int` })
        .from(salesTable)
        .where(gte(salesTable.createdAt, ago7))
        .groupBy(salesTable.companyId),
      db
        .select({ companyId: salesTable.companyId, c: sql<number>`count(*)::int` })
        .from(salesTable)
        .where(and(gte(salesTable.createdAt, ago14), lt(salesTable.createdAt, ago7)))
        .groupBy(salesTable.companyId),
      db
        .select({
          companyId: subscriptionInvoicesTable.companyId,
          overdueAmount: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
          invoiceCount: sql<number>`count(*)::int`,
        })
        .from(subscriptionInvoicesTable)
        .where(and(
          eq(subscriptionInvoicesTable.status, "pending"),
          isNotNull(subscriptionInvoicesTable.dueDate),
          lte(subscriptionInvoicesTable.dueDate, now),
        ))
        .groupBy(subscriptionInvoicesTable.companyId)
        .orderBy(desc(sql`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`))
        .limit(5),
      db
        .select({
          planSlug: subscriptionPlansTable.slug,
          planName: subscriptionPlansTable.name,
          starts: sql<number>`count(*)::int`,
        })
        .from(companySubscriptionsTable)
        .innerJoin(
          subscriptionPlansTable,
          eq(companySubscriptionsTable.planId, subscriptionPlansTable.id),
        )
        .where(and(
          eq(companySubscriptionsTable.status, "active"),
          gte(companySubscriptionsTable.startedAt, monthStart),
        ))
        .groupBy(subscriptionPlansTable.slug, subscriptionPlansTable.name)
        .orderBy(desc(sql`count(*)`))
        .limit(5),
      db
        .select({
          companyId: contactRequestsTable.sellerCompanyId,
          openCount: sql<number>`count(*)::int`,
        })
        .from(contactRequestsTable)
        .where(and(
          eq(contactRequestsTable.status, "new"),
          isNotNull(contactRequestsTable.sellerCompanyId),
        ))
        .groupBy(contactRequestsTable.sellerCompanyId)
        .orderBy(desc(sql`count(*)`))
        .limit(5),
      db.execute(sql`
        SELECT c.id AS company_id, c.name AS name, COUNT(s.id)::int AS sale_count
        FROM companies c
        INNER JOIN sales s ON s.company_id = c.id AND s.created_at >= ${ago14}
        WHERE c.plan_type = 'trial' AND c.trial_ends_at IS NOT NULL AND c.trial_ends_at > ${now}
          AND c.onboarding_completed_at IS NOT NULL
        GROUP BY c.id, c.name
        ORDER BY sale_count DESC
        LIMIT 5
      `),
    ]);

    let funnelUpgradeTouchesLast30Days = 0;
    let funnelCheckoutStartsLast30Days = 0;
    try {
      const [fu] = await db.select({ c: count() }).from(productFunnelEventsTable).where(and(
        gte(productFunnelEventsTable.createdAt, ago30),
        inArray(productFunnelEventsTable.eventKey, [
          "billing_checkout_started",
          "trial_cta_click",
          "pricing_view",
        ]),
      ));
      funnelUpgradeTouchesLast30Days = Number(fu?.c ?? 0);
      const [fc] = await db.select({ c: count() }).from(productFunnelEventsTable).where(and(
        gte(productFunnelEventsTable.createdAt, ago30),
        eq(productFunnelEventsTable.eventKey, "billing_checkout_started"),
      ));
      funnelCheckoutStartsLast30Days = Number(fc?.c ?? 0);
    } catch {
      /* tablo henüz yok veya izin hatası */
    }

    const prevMap = new Map(
      prev7ByCompany.map((r: { companyId: number; c: number | string }) => [r.companyId, Number(r.c ?? 0)]),
    );
    const fastGrowingTenants = last7ByCompany
      .map((r: { companyId: number; c: number | string }) => {
        const last7 = Number(r.c ?? 0);
        const prev7 = prevMap.get(r.companyId) ?? 0;
        return { companyId: r.companyId, delta: last7 - prev7, salesLast7Days: last7 };
      })
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
    const fgIds = fastGrowingTenants.map((x) => x.companyId).filter((id: number) => Number.isInteger(id));
    const fgNames = fgIds.length
      ? await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(inArray(companiesTable.id, fgIds))
      : [];
    const fgNameById = new Map(fgNames.map((r: { id: number; name: string }) => [r.id, r.name]));
    const fastGrowingTenantsNamed = fastGrowingTenants.map((x) => ({
      companyId: x.companyId,
      name: fgNameById.get(x.companyId) ?? `#${x.companyId}`,
      deltaSalesCount: x.delta,
      salesLast7Days: x.salesLast7Days,
    }));

    const irIds = invoiceRiskRows.map((r: { companyId: number }) => r.companyId).filter((id: number) => Number.isInteger(id));
    const irNames = irIds.length
      ? await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(inArray(companiesTable.id, irIds))
      : [];
    const irNameById = new Map(irNames.map((r: { id: number; name: string }) => [r.id, r.name]));
    const invoiceRiskTenants = invoiceRiskRows.map((r: {
      companyId: number;
      overdueAmount: number | string;
      invoiceCount: number | string;
    }) => ({
      companyId: r.companyId,
      name: irNameById.get(r.companyId) ?? `#${r.companyId}`,
      overdueAmountTry: Math.round(Number(r.overdueAmount ?? 0)),
      pendingInvoiceCount: Number(r.invoiceCount ?? 0),
    }));

    const shIds = supportHeavyRows
      .map((r: { companyId: number | null }) => r.companyId)
      .filter((id: number | null): id is number => typeof id === "number" && Number.isInteger(id));
    const shNames = shIds.length
      ? await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(inArray(companiesTable.id, shIds))
      : [];
    const shNameById = new Map(shNames.map((r: { id: number; name: string }) => [r.id, r.name]));
    const supportHeavyTenants = supportHeavyRows.map((r: {
      companyId: number | null;
      openCount: number | string;
    }) => ({
      companyId: r.companyId ?? 0,
      name: r.companyId ? (shNameById.get(r.companyId) ?? `#${r.companyId}`) : "—",
      openContactRequests: Number(r.openCount ?? 0),
    }));

    const hotTrialList = (hotTrialSqlResult.rows ?? []) as {
      company_id: number;
      name: string;
      sale_count: number | string;
    }[];
    const trialMomentum = hotTrialList.map((row) => ({
      companyId: Number(row.company_id),
      name: row.name,
      salesLast14Days: Number(row.sale_count ?? 0),
    }));

    const founderSignalsV3 = {
      inactiveSellerTenantsNoSales7d: Number(inactiveTenants7dRow[0]?.c ?? 0),
      fastGrowingTenants: fastGrowingTenantsNamed,
      invoiceRiskTenants,
      topPlansStartedThisMonth: topPlansMonthRows.map((r: {
        planSlug: string;
        planName: string;
        starts: number | string;
      }) => ({
        planSlug: r.planSlug,
        planName: r.planName,
        newSubscriptionStarts: Number(r.starts ?? 0),
      })),
      supportHeavyTenants,
      trialMomentumCandidates: trialMomentum,
      funnelUpgradeTouchesLast30Days,
      funnelCheckoutStartsLast30Days,
    };

    let founderSignalsV4: {
      overduePendingInvoicesTotalTry: number;
      dormantActiveSubNoSales30d: number;
      newCompaniesThisCalendarMonth: number;
      funnelEventsTop7d: { eventKey: string; count: number }[];
      topDormantTenants: { companyId: number; name: string; productCount: number }[];
    } = {
      overduePendingInvoicesTotalTry: 0,
      dormantActiveSubNoSales30d: 0,
      newCompaniesThisCalendarMonth: 0,
      funnelEventsTop7d: [],
      topDormantTenants: [],
    };
    try {
      const [overdueArr, dormantRow, newCoRow, funnelBreakRows, dormantTop] = await Promise.all([
        db.select({
          s: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
        })
          .from(subscriptionInvoicesTable)
          .where(and(
            eq(subscriptionInvoicesTable.status, "pending"),
            isNotNull(subscriptionInvoicesTable.dueDate),
            lte(subscriptionInvoicesTable.dueDate, now),
          )),
        db.select({ c: sql<number>`count(distinct ${companiesTable.id})::int` })
          .from(companiesTable)
          .innerJoin(companySubscriptionsTable, and(
            eq(companySubscriptionsTable.companyId, companiesTable.id),
            eq(companySubscriptionsTable.status, "active"),
          ))
          .where(and(
            eq(companiesTable.isActive, true),
            sql`NOT EXISTS (
              SELECT 1 FROM sales s
              WHERE s.company_id = ${companiesTable.id} AND s.created_at >= ${ago30}
            )`,
          )),
        db.select({ c: count() }).from(companiesTable).where(gte(companiesTable.createdAt, monthStart)),
        db
          .select({
            eventKey: productFunnelEventsTable.eventKey,
            cnt: sql<number>`count(*)::int`,
          })
          .from(productFunnelEventsTable)
          .where(gte(productFunnelEventsTable.createdAt, ago7))
          .groupBy(productFunnelEventsTable.eventKey)
          .orderBy(desc(sql`count(*)`))
          .limit(12),
        db.execute(sql`
          SELECT c.id AS company_id, c.name AS name, (SELECT count(*)::int FROM products p WHERE p.company_id = c.id) AS product_count
          FROM companies c
          INNER JOIN company_subscriptions cs ON cs.company_id = c.id AND cs.status = 'active'
          WHERE c.is_active = true
            AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${ago30})
          ORDER BY product_count DESC NULLS LAST
          LIMIT 5
        `),
      ]);
      founderSignalsV4 = {
        overduePendingInvoicesTotalTry: Math.round(Number(overdueArr[0]?.s ?? 0)),
        dormantActiveSubNoSales30d: Number(dormantRow[0]?.c ?? 0),
        newCompaniesThisCalendarMonth: Number(newCoRow[0]?.c ?? 0),
        funnelEventsTop7d: funnelBreakRows.map((r: { eventKey: string; cnt: number | string }) => ({
          eventKey: r.eventKey,
          count: Number(r.cnt ?? 0),
        })),
        topDormantTenants: ((dormantTop.rows ?? []) as { company_id: number; name: string; product_count: number | string }[]).map((row) => ({
          companyId: Number(row.company_id),
          name: row.name,
          productCount: Number(row.product_count ?? 0),
        })),
      };
    } catch {
      /* şema / tablo uyumsuzluğu */
    }

    const overdueCut7 = new Date(now.getTime() - 7 * 86400000);
    const overdueCut30 = new Date(now.getTime() - 30 * 86400000);

    let founderSignalsV5: {
      cashDueNext7DaysTry: number;
      cashDueNext7DaysCount: number;
      overdueBucketsTry: { days0to7: number; days8to30: number; days31Plus: number };
      overdueBucketsCount: { days0to7: number; days8to30: number; days31Plus: number };
      collectionPriority: {
        companyId: number;
        name: string;
        collectionScore: number;
        overdueTry: number;
        oldestDueDays: number;
        pendingInvoiceCount: number;
      }[];
      atRiskMrrTry: number;
      churnReasonSummary: { reason: string; count: number }[];
      gracePeriodStarts7d: number;
      operatingSnapshot30d: {
        mrrTry: number;
        churnSubsCancelled30d: number;
        overduePendingTry: number;
        overdueInvoicesRecovered30d: number;
        cancelRescueViews30d: number;
        cancelConfirmed30d: number;
      };
      billingReturnSources30d: { source: string; count: number }[];
    } = {
      cashDueNext7DaysTry: 0,
      cashDueNext7DaysCount: 0,
      overdueBucketsTry: { days0to7: 0, days8to30: 0, days31Plus: 0 },
      overdueBucketsCount: { days0to7: 0, days8to30: 0, days31Plus: 0 },
      collectionPriority: [],
      atRiskMrrTry: 0,
      churnReasonSummary: [],
      gracePeriodStarts7d: 0,
      operatingSnapshot30d: {
        mrrTry: Math.round(mrr),
        churnSubsCancelled30d: Number(churn30Row[0]?.c ?? 0),
        overduePendingTry: founderSignalsV4.overduePendingInvoicesTotalTry,
        overdueInvoicesRecovered30d: 0,
        cancelRescueViews30d: 0,
        cancelConfirmed30d: 0,
      },
      billingReturnSources30d: [],
    };

    let founderSignalsV6: {
      moneyDueThisWeekTry: number;
      moneyDueThisWeekCount: number;
      recoverableMrrTry: number;
      churnRiskMrrTry: number;
      topGrowthTenants: { companyId: number; name: string; deltaSalesCount: number; salesLast7Days: number }[];
      weakEngagementTenants: { companyId: number; name: string; salesLast30d: number }[];
      churnReasonByCode: { code: string; count: number }[];
      recoveredCashTryLast30d: number;
      reminderSegments: { soft: number; firm: number; urgent: number; totalCompanies: number };
      reminderSignalQueue: {
        companyId: number;
        name: string;
        overdueTry: number;
        oldestDueDays: number;
        reminderLevel: "soft" | "firm" | "urgent";
        pendingInvoiceCount: number;
      }[];
      monthlyExecutiveSnapshot: {
        calendarMonth: string;
        mrrTry: number;
        newCompaniesThisMonth: number;
        churnSubsCancelled30d: number;
        overduePendingTry: number;
        trialsEndingWithin7Days: number;
        dormantActiveSubNoSales30d: number;
        overdueRecoveredEvents30d: number;
      };
      sellerQuoteAcceptance: {
        sellerCompanyId: number;
        sellerName: string;
        acceptedCount: number;
        decidedCount: number;
        acceptanceRate: number;
      }[];
    } = {
      moneyDueThisWeekTry: 0,
      moneyDueThisWeekCount: 0,
      recoverableMrrTry: 0,
      churnRiskMrrTry: 0,
      topGrowthTenants: [],
      weakEngagementTenants: [],
      churnReasonByCode: [],
      recoveredCashTryLast30d: 0,
      reminderSegments: { soft: 0, firm: 0, urgent: 0, totalCompanies: 0 },
      reminderSignalQueue: [],
      monthlyExecutiveSnapshot: {
        calendarMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        mrrTry: Math.round(mrr),
        newCompaniesThisMonth: founderSignalsV4.newCompaniesThisCalendarMonth,
        churnSubsCancelled30d: Number(churn30Row[0]?.c ?? 0),
        overduePendingTry: founderSignalsV4.overduePendingInvoicesTotalTry,
        trialsEndingWithin7Days: trialsEndingSoonRow[0]?.c ?? 0,
        dormantActiveSubNoSales30d: founderSignalsV4.dormantActiveSubNoSales30d,
        overdueRecoveredEvents30d: 0,
      },
      sellerQuoteAcceptance: [],
    };

    let founderSignalsV7: {
      openReminderActionCount: number;
      contactedReminderActions7d: number;
      resolvedReminderActions7d: number;
      recoveredAfterReminder30d: number;
      comebackPricingViews30d: number;
      comebackOfferClicks30d: number;
      churnGraceSavesThisMonth: number;
      upgradeOpportunityTop: {
        companyId: number;
        name: string;
        planSlug: string;
        upsellScore: number;
        sales30d: number;
        productCount: number;
        planLimitPressurePct: number;
        maxProducts: number;
      }[];
      sellerLeaderboardByVolume: {
        sellerCompanyId: number;
        sellerName: string;
        decidedCount: number;
        acceptancePct: number;
      }[];
      growthHotspots: { companyId: number; name: string; salesLast7Days: number }[];
      weeklyMoneyActionsDigest: string;
      engagedLowPlanCandidates: {
        companyId: number;
        name: string;
        planSlug: string;
        engagementScore: number;
        sales30d: number;
        productCount: number;
        planLimitPressurePct: number;
      }[];
    } = {
      openReminderActionCount: 0,
      contactedReminderActions7d: 0,
      resolvedReminderActions7d: 0,
      recoveredAfterReminder30d: 0,
      comebackPricingViews30d: 0,
      comebackOfferClicks30d: 0,
      churnGraceSavesThisMonth: 0,
      upgradeOpportunityTop: [],
      sellerLeaderboardByVolume: [],
      growthHotspots: topTenantsBySales7d.slice(0, 8).map((t) => ({
        companyId: t.companyId,
        name: t.name,
        salesLast7Days: t.salesCount,
      })),
      weeklyMoneyActionsDigest: "",
      engagedLowPlanCandidates: [],
    };

    try {
      const [
        cashDue7Row,
        bucketRow,
        overdueAggRows,
        atRiskRow,
        grace7Row,
        churnNotesRows,
        rec30Row,
        rescueView30Row,
        cancelConf30Row,
      ] = await Promise.all([
        db.select({
          s: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
          n: sql<number>`count(*)::int`,
        })
          .from(subscriptionInvoicesTable)
          .where(and(
            eq(subscriptionInvoicesTable.status, "pending"),
            isNotNull(subscriptionInvoicesTable.dueDate),
            gte(subscriptionInvoicesTable.dueDate, now),
            lte(subscriptionInvoicesTable.dueDate, in7),
          )),
        db.execute(sql`
          SELECT
            coalesce(sum((amount)::numeric) FILTER (
              WHERE due_date < ${now} AND due_date >= ${overdueCut7}
            ), 0) AS b0_7,
            count(*) FILTER (
              WHERE due_date < ${now} AND due_date >= ${overdueCut7}
            )::int AS n0_7,
            coalesce(sum((amount)::numeric) FILTER (
              WHERE due_date < ${overdueCut7} AND due_date >= ${overdueCut30}
            ), 0) AS b8_30,
            count(*) FILTER (
              WHERE due_date < ${overdueCut7} AND due_date >= ${overdueCut30}
            )::int AS n8_30,
            coalesce(sum((amount)::numeric) FILTER (WHERE due_date < ${overdueCut30}), 0) AS b31,
            count(*) FILTER (WHERE due_date < ${overdueCut30})::int AS n31
          FROM subscription_invoices
          WHERE status = 'pending' AND due_date IS NOT NULL AND due_date < ${now}
        `),
        db
          .select({
            companyId: subscriptionInvoicesTable.companyId,
            overdueTry: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
            oldestDue: sql<Date | null>`min(${subscriptionInvoicesTable.dueDate})`,
            invCount: sql<number>`count(*)::int`,
          })
          .from(subscriptionInvoicesTable)
          .where(and(
            eq(subscriptionInvoicesTable.status, "pending"),
            isNotNull(subscriptionInvoicesTable.dueDate),
            lte(subscriptionInvoicesTable.dueDate, now),
          ))
          .groupBy(subscriptionInvoicesTable.companyId)
          .limit(48),
        db.execute(sql`
          SELECT coalesce(sum(
            CASE cs.billing_cycle WHEN 'yearly' THEN (p.price_yearly::numeric) / 12 ELSE p.price_monthly::numeric END
          ), 0) AS at_risk
          FROM (
            SELECT DISTINCT company_id FROM subscription_invoices
            WHERE status = 'pending' AND due_date IS NOT NULL AND due_date < ${now}
          ) o
          INNER JOIN company_subscriptions cs ON cs.company_id = o.company_id AND cs.status = 'active'
          INNER JOIN subscription_plans p ON p.id = cs.plan_id
        `),
        db.select({ c: count() }).from(companySubscriptionsTable).where(and(
          eq(companySubscriptionsTable.status, "grace_period"),
          isNotNull(companySubscriptionsTable.cancelledAt),
          gte(companySubscriptionsTable.cancelledAt, ago7),
        )),
        db.select({
          cancelReason: companySubscriptionsTable.cancelReason,
          notes: companySubscriptionsTable.notes,
        }).from(companySubscriptionsTable).where(and(
          isNotNull(companySubscriptionsTable.cancelledAt),
          gte(companySubscriptionsTable.cancelledAt, ago30),
        )).limit(400),
        db.select({ c: count() }).from(productFunnelEventsTable).where(and(
          gte(productFunnelEventsTable.createdAt, ago30),
          eq(productFunnelEventsTable.eventKey, "overdue_invoice_recovered"),
        )),
        db.select({ c: count() }).from(productFunnelEventsTable).where(and(
          gte(productFunnelEventsTable.createdAt, ago30),
          eq(productFunnelEventsTable.eventKey, "subscription_cancel_rescue_view"),
        )),
        db.select({ c: count() }).from(productFunnelEventsTable).where(and(
          gte(productFunnelEventsTable.createdAt, ago30),
          eq(productFunnelEventsTable.eventKey, "subscription_cancel_confirmed"),
        )),
      ]);

      const br = (bucketRow.rows?.[0] ?? {}) as Record<string, unknown>;
      const reasonCounts = new Map<string, number>();
      for (const row of churnNotesRows) {
        const label = churnReasonDisplay(row);
        reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
      }
      const churnReasonSummary = [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

      const cpIds = overdueAggRows.map((r) => r.companyId).filter((id) => Number.isInteger(id));
      const cpNames = cpIds.length
        ? await db.select({ id: companiesTable.id, name: companiesTable.name })
          .from(companiesTable)
          .where(inArray(companiesTable.id, cpIds))
        : [];
      const cpNameById = new Map(cpNames.map((r) => [r.id, r.name]));
      const collectionPriority = overdueAggRows
        .map((r) => {
          const overdueTry = Math.round(Number(r.overdueTry ?? 0));
          const oldest = r.oldestDue ? new Date(r.oldestDue as Date) : now;
          const oldestDueDays = Math.min(365, Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 86400000)));
          const collectionScore = Math.round(overdueTry * (1 + oldestDueDays / 30));
          return {
            companyId: r.companyId,
            name: cpNameById.get(r.companyId) ?? `#${r.companyId}`,
            collectionScore,
            overdueTry,
            oldestDueDays,
            pendingInvoiceCount: Number(r.invCount ?? 0),
          };
        })
        .sort((a, b) => b.collectionScore - a.collectionScore)
        .slice(0, 12);

      let billingReturnSources30d: { source: string; count: number }[] = [];
      try {
        const srcRows = await db.execute(sql`
          SELECT COALESCE(NULLIF(trim(props::json->>'from'), ''), 'unknown') AS src, count(*)::int AS c
          FROM product_funnel_events
          WHERE event_key = 'billing_return_success' AND created_at >= ${ago30}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 8
        `);
        billingReturnSources30d = ((srcRows.rows ?? []) as { src: string; c: number | string }[]).map((row) => ({
          source: row.src,
          count: Number(row.c ?? 0),
        }));
      } catch {
        billingReturnSources30d = [];
      }

      const atRiskNum = Number((atRiskRow.rows?.[0] as { at_risk?: string } | undefined)?.at_risk ?? 0);

      founderSignalsV5 = {
        cashDueNext7DaysTry: Math.round(Number(cashDue7Row[0]?.s ?? 0)),
        cashDueNext7DaysCount: Number(cashDue7Row[0]?.n ?? 0),
        overdueBucketsTry: {
          days0to7: Math.round(Number(br.b0_7 ?? 0)),
          days8to30: Math.round(Number(br.b8_30 ?? 0)),
          days31Plus: Math.round(Number(br.b31 ?? 0)),
        },
        overdueBucketsCount: {
          days0to7: Number(br.n0_7 ?? 0),
          days8to30: Number(br.n8_30 ?? 0),
          days31Plus: Number(br.n31 ?? 0),
        },
        collectionPriority,
        atRiskMrrTry: Math.round(atRiskNum),
        churnReasonSummary,
        gracePeriodStarts7d: Number(grace7Row[0]?.c ?? 0),
        operatingSnapshot30d: {
          mrrTry: Math.round(mrr),
          churnSubsCancelled30d: Number(churn30Row[0]?.c ?? 0),
          overduePendingTry: founderSignalsV4.overduePendingInvoicesTotalTry,
          overdueInvoicesRecovered30d: Number(rec30Row[0]?.c ?? 0),
          cancelRescueViews30d: Number(rescueView30Row[0]?.c ?? 0),
          cancelConfirmed30d: Number(cancelConf30Row[0]?.c ?? 0),
        },
        billingReturnSources30d,
      };

      try {
      const ago90 = new Date(now.getTime() - 90 * 86400000);
      const day = now.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(now);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() + mondayOffset);
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

      const reminderQueue = collectionPriority.map((row) => ({
        companyId: row.companyId,
        name: row.name,
        overdueTry: row.overdueTry,
        oldestDueDays: row.oldestDueDays,
        reminderLevel: collectionReminderLevel(row.oldestDueDays),
        pendingInvoiceCount: row.pendingInvoiceCount,
      }));
      const seg = { soft: 0, firm: 0, urgent: 0 };
      for (const r of reminderQueue) {
        if (r.reminderLevel === "soft") seg.soft++;
        else if (r.reminderLevel === "firm") seg.firm++;
        else seg.urgent++;
      }

      const [
        weekDueRow,
        churnRiskMrrRow,
        weakEngageSql,
        recoveredCashRow,
        churnCodeSql,
        b2bAcceptSql,
      ] = await Promise.all([
        db.select({
          s: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
          n: sql<number>`count(*)::int`,
        })
          .from(subscriptionInvoicesTable)
          .where(and(
            eq(subscriptionInvoicesTable.status, "pending"),
            isNotNull(subscriptionInvoicesTable.dueDate),
            gte(subscriptionInvoicesTable.dueDate, weekStart),
            lt(subscriptionInvoicesTable.dueDate, weekEnd),
          )),
        db.select({
          s: sql<number>`coalesce(sum(
            CASE ${companySubscriptionsTable.billingCycle}
              WHEN 'yearly' THEN (${subscriptionPlansTable.priceYearly}::numeric) / 12
              ELSE ${subscriptionPlansTable.priceMonthly}::numeric
            END
          ), 0)`,
        })
          .from(companySubscriptionsTable)
          .innerJoin(
            subscriptionPlansTable,
            eq(companySubscriptionsTable.planId, subscriptionPlansTable.id),
          )
          .where(eq(companySubscriptionsTable.status, "grace_period")),
        db.execute(sql`
          SELECT c.id AS company_id, c.name AS name, COUNT(s.id)::int AS sales_30d
          FROM companies c
          INNER JOIN company_subscriptions cs ON cs.company_id = c.id AND cs.status = 'active'
          LEFT JOIN sales s ON s.company_id = c.id AND s.created_at >= ${ago30}
          WHERE c.is_active = true
          GROUP BY c.id, c.name
          HAVING COUNT(s.id) BETWEEN 1 AND 6
          ORDER BY COUNT(s.id) ASC, c.name
          LIMIT 10
        `),
        db.select({
          s: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
        })
          .from(subscriptionInvoicesTable)
          .where(and(
            eq(subscriptionInvoicesTable.status, "paid"),
            isNotNull(subscriptionInvoicesTable.paidAt),
            gte(subscriptionInvoicesTable.paidAt, ago30),
            isNotNull(subscriptionInvoicesTable.dueDate),
            lt(subscriptionInvoicesTable.dueDate, subscriptionInvoicesTable.paidAt),
          )),
        db.execute(sql`
          SELECT COALESCE(NULLIF(TRIM(cancel_reason), ''), 'unknown') AS code, COUNT(*)::int AS n
          FROM company_subscriptions
          WHERE cancelled_at >= ${ago90}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 12
        `),
        db.execute(sql`
          SELECT
            qr.to_company_id AS seller_company_id,
            c.name AS seller_name,
            COUNT(*) FILTER (WHERE qr.status = 'accepted')::int AS accepted_n,
            COUNT(*)::int AS decided_n
          FROM b2b_quote_requests qr
          INNER JOIN companies c ON c.id = qr.to_company_id
          WHERE qr.decided_at >= ${ago90}
            AND qr.status IN ('accepted', 'rejected')
          GROUP BY qr.to_company_id, c.name
          HAVING COUNT(*) >= 2
          ORDER BY (COUNT(*) FILTER (WHERE qr.status = 'accepted')::float / NULLIF(COUNT(*)::float, 0)) DESC NULLS LAST
          LIMIT 20
        `),
      ]);

      const churnReasonByCode = ((churnCodeSql.rows ?? []) as { code: string; n: number | string }[]).map((row) => ({
        code: row.code,
        count: Number(row.n ?? 0),
      }));

      const sellerQuoteAcceptance = ((b2bAcceptSql.rows ?? []) as {
        seller_company_id: number;
        seller_name: string;
        accepted_n: number | string;
        decided_n: number | string;
      }[])
        .map((row) => {
          const decided = Number(row.decided_n ?? 0);
          const accepted = Number(row.accepted_n ?? 0);
          return {
            sellerCompanyId: Number(row.seller_company_id),
            sellerName: row.seller_name,
            acceptedCount: accepted,
            decidedCount: decided,
            acceptanceRate: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : 0,
          };
        });

      founderSignalsV6 = {
        moneyDueThisWeekTry: Math.round(Number(weekDueRow[0]?.s ?? 0)),
        moneyDueThisWeekCount: Number(weekDueRow[0]?.n ?? 0),
        recoverableMrrTry: founderSignalsV5.atRiskMrrTry,
        churnRiskMrrTry: Math.round(Number(churnRiskMrrRow[0]?.s ?? 0)),
        topGrowthTenants: fastGrowingTenantsNamed.slice(0, 6),
        weakEngagementTenants: ((weakEngageSql.rows ?? []) as {
          company_id: number;
          name: string;
          sales_30d: number | string;
        }[]).map((row) => ({
          companyId: Number(row.company_id),
          name: row.name,
          salesLast30d: Number(row.sales_30d ?? 0),
        })),
        churnReasonByCode,
        recoveredCashTryLast30d: Math.round(Number(recoveredCashRow[0]?.s ?? 0)),
        reminderSegments: { ...seg, totalCompanies: reminderQueue.length },
        reminderSignalQueue: reminderQueue.slice(0, 20),
        monthlyExecutiveSnapshot: {
          calendarMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
          mrrTry: Math.round(mrr),
          newCompaniesThisMonth: founderSignalsV4.newCompaniesThisCalendarMonth,
          churnSubsCancelled30d: Number(churn30Row[0]?.c ?? 0),
          overduePendingTry: founderSignalsV4.overduePendingInvoicesTotalTry,
          trialsEndingWithin7Days: trialsEndingSoonRow[0]?.c ?? 0,
          dormantActiveSubNoSales30d: founderSignalsV4.dormantActiveSubNoSales30d,
          overdueRecoveredEvents30d: founderSignalsV5.operatingSnapshot30d.overdueInvoicesRecovered30d,
        },
        sellerQuoteAcceptance,
      };
      } catch {
        /* v6 — ek tablolar / sütunlar / B2B */
      }
    } catch {
      /* v5 isteğe bağlı tablolar */
    }

    let funnel30dPlanUpgraded = 0;
    try {
      const ago90b = new Date(now.getTime() - 90 * 86400000);
      const openSt = ["queued", "contacted", "snoozed"] as const;
      const [
        openActRow,
        cont7Row,
        res7Row,
        funnel30dSql,
        savesMoRow,
        upsellRows,
        sellerVolSql,
        engagedLowPlanSql,
      ] = await Promise.all([
        db.select({ c: count() }).from(collectionReminderActionsTable)
          .where(inArray(collectionReminderActionsTable.status, [...openSt])),
        db.select({ c: count() }).from(collectionReminderActionsTable).where(and(
          eq(collectionReminderActionsTable.status, "contacted"),
          gte(collectionReminderActionsTable.createdAt, ago7),
        )),
        db.select({ c: count() }).from(collectionReminderActionsTable).where(and(
          eq(collectionReminderActionsTable.status, "resolved"),
          gte(collectionReminderActionsTable.updatedAt, ago7),
        )),
        db.execute(sql`
          SELECT event_key, count(*)::int AS c
          FROM product_funnel_events
          WHERE created_at >= ${ago30}
            AND event_key IN (
              'overdue_invoice_recovered_after_reminder',
              'post_cancel_comeback_view',
              'post_cancel_rescue_offer_click',
              'plan_upgraded'
            )
          GROUP BY event_key
        `),
        db.select({ c: count() }).from(productFunnelEventsTable).where(and(
          eq(productFunnelEventsTable.eventKey, "grace_period_reactivate_success"),
          gte(productFunnelEventsTable.createdAt, monthStart),
        )),
        db.execute(sql`
          SELECT c.id AS company_id, c.name, p.slug AS plan_slug,
            (SELECT COUNT(*)::int FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${ago30}) AS sales_30d,
            (SELECT COUNT(*)::int FROM products pr WHERE pr.company_id = c.id) AS product_count,
            COALESCE(p.max_products, 0)::int AS max_products
          FROM companies c
          INNER JOIN company_subscriptions cs ON cs.company_id = c.id AND cs.status = 'active'
          INNER JOIN subscription_plans p ON p.id = cs.plan_id
          WHERE c.is_active = true AND p.slug IN ('pkg_starter', 'pkg_pro')
            AND (SELECT COUNT(*) FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${ago30}) >= 12
            AND (SELECT COUNT(*) FROM products pr WHERE pr.company_id = c.id) >= 15
          ORDER BY (SELECT COUNT(*) FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${ago30}) DESC
          LIMIT 12
        `),
        db.execute(sql`
          SELECT
            qr.to_company_id AS seller_company_id,
            c.name AS seller_name,
            COUNT(*)::int AS decided_n,
            COUNT(*) FILTER (WHERE qr.status = 'accepted')::int AS accepted_n
          FROM b2b_quote_requests qr
          INNER JOIN companies c ON c.id = qr.to_company_id
          WHERE qr.decided_at >= ${ago90b}
            AND qr.status IN ('accepted', 'rejected')
          GROUP BY qr.to_company_id, c.name
          HAVING COUNT(*) >= 2
          ORDER BY COUNT(*) DESC
          LIMIT 10
        `),
        db.execute(sql`
          SELECT c.id AS company_id, c.name, p.slug AS plan_slug,
            (SELECT COUNT(*)::int FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${ago30}) AS sales_30d,
            (SELECT COUNT(*)::int FROM products pr WHERE pr.company_id = c.id) AS product_count,
            COALESCE(p.max_products, 0)::int AS max_products
          FROM companies c
          INNER JOIN company_subscriptions cs ON cs.company_id = c.id AND cs.status = 'active'
          INNER JOIN subscription_plans p ON p.id = cs.plan_id
          WHERE c.is_active = true AND p.slug IN ('pkg_starter', 'pkg_pro')
            AND (SELECT COUNT(*) FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${ago30}) BETWEEN 3 AND 11
            AND (SELECT COUNT(*) FROM products pr WHERE pr.company_id = c.id) >= 8
          ORDER BY (SELECT COUNT(*) FROM sales s WHERE s.company_id = c.id AND s.created_at >= ${ago30}) DESC,
                   (SELECT COUNT(*) FROM products pr WHERE pr.company_id = c.id) DESC
          LIMIT 10
        `),
      ]);

      const f30 = new Map<string, number>();
      for (const row of (funnel30dSql.rows ?? []) as { event_key: string; c: number | string }[]) {
        f30.set(row.event_key, Number(row.c ?? 0));
      }
      funnel30dPlanUpgraded = f30.get("plan_upgraded") ?? 0;

      const upsellRaw = (upsellRows.rows ?? []) as {
        company_id: number;
        name: string;
        plan_slug: string;
        sales_30d: number | string;
        product_count: number | string;
        max_products: number | string;
      }[];
      const upgradeOpportunityTop = upsellRaw.map((row) => {
        const s30 = Number(row.sales_30d ?? 0);
        const pc = Number(row.product_count ?? 0);
        const mx = Math.max(1, Number(row.max_products ?? 1));
        const util = Math.min(1.35, pc / mx);
        const planLimitPressurePct = Math.min(100, Math.round((pc / mx) * 100));
        const upsellScore = Math.round(
          s30 * 3.2
          + util * 105
          + (s30 >= 22 ? 28 : s30 >= 16 ? 14 : 0)
          + (planLimitPressurePct >= 90 ? 22 : planLimitPressurePct >= 75 ? 12 : 0),
        );
        return {
          companyId: Number(row.company_id),
          name: row.name,
          planSlug: row.plan_slug,
          upsellScore,
          sales30d: s30,
          productCount: pc,
          planLimitPressurePct,
          maxProducts: mx,
        };
      }).sort((a, b) => b.upsellScore - a.upsellScore).slice(0, 8);

      const engagedRaw = (engagedLowPlanSql.rows ?? []) as {
        company_id: number;
        name: string;
        plan_slug: string;
        sales_30d: number | string;
        product_count: number | string;
        max_products: number | string;
      }[];
      const engagedLowPlanCandidates = engagedRaw.map((row) => {
        const s30 = Number(row.sales_30d ?? 0);
        const pc = Number(row.product_count ?? 0);
        const mx = Math.max(1, Number(row.max_products ?? 1));
        const util = Math.min(1.2, pc / mx);
        const planLimitPressurePct = Math.min(100, Math.round((pc / mx) * 100));
        const engagementScore = Math.round(
          s30 * 11
          + pc * 2.8
          + util * 78
          + (planLimitPressurePct >= 88 ? 18 : 0),
        );
        return {
          companyId: Number(row.company_id),
          name: row.name,
          planSlug: row.plan_slug,
          engagementScore,
          sales30d: s30,
          productCount: pc,
          planLimitPressurePct,
        };
      }).sort((a, b) => b.engagementScore - a.engagementScore);

      const sellerLeaderboardByVolume = ((sellerVolSql.rows ?? []) as {
        seller_company_id: number;
        seller_name: string;
        decided_n: number | string;
        accepted_n: number | string;
      }[]).map((row) => {
        const decided = Number(row.decided_n ?? 0);
        const accepted = Number(row.accepted_n ?? 0);
        return {
          sellerCompanyId: Number(row.seller_company_id),
          sellerName: row.seller_name,
          decidedCount: decided,
          acceptancePct: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : 0,
        };
      });

      const openN = Number(openActRow[0]?.c ?? 0);
      const cont7 = Number(cont7Row[0]?.c ?? 0);
      const res7 = Number(res7Row[0]?.c ?? 0);
      founderSignalsV7 = {
        openReminderActionCount: openN,
        contactedReminderActions7d: cont7,
        resolvedReminderActions7d: res7,
        recoveredAfterReminder30d: f30.get("overdue_invoice_recovered_after_reminder") ?? 0,
        comebackPricingViews30d: f30.get("post_cancel_comeback_view") ?? 0,
        comebackOfferClicks30d: f30.get("post_cancel_rescue_offer_click") ?? 0,
        churnGraceSavesThisMonth: Number(savesMoRow[0]?.c ?? 0),
        upgradeOpportunityTop,
        sellerLeaderboardByVolume,
        growthHotspots: topTenantsBySales7d.slice(0, 8).map((t) => ({
          companyId: t.companyId,
          name: t.name,
          salesLast7Days: t.salesCount,
        })),
        engagedLowPlanCandidates,
        weeklyMoneyActionsDigest:
          `Açık tahsilat aksiyonu: ${openN}. Son 7 gün iletişim: ${cont7}, çözüldü: ${res7}. `
          + `Hatırlatma sonrası tahsilat (30g olay): ${f30.get("overdue_invoice_recovered_after_reminder") ?? 0}. `
          + `Düşük planda etkileşimli aday: ${engagedLowPlanCandidates.length}. `
          + `Plan yükseltme olayı (30g): ${f30.get("plan_upgraded") ?? 0}.`,
      };
    } catch {
      /* v7 — ops tablosu / huni */
    }

    let founderSignalsV8: {
      weeklyActionScoreboard: {
        collectionActionsOpen: number;
        collectionContacted7d: number;
        collectionResolved7d: number;
        b2bQuotesStuckPending3dPlus: number;
        b2bQuotesStuckPending7dPlus: number;
        trackedUpgradeLeads: number;
      };
      moneyRecoveredOverdueTryThisWeek: number;
      billingCheckoutStartsThisMonth: number;
      billingPaidSuccessThisMonth: number;
      churnGraceSavesThisMonth: number;
      topRiskTenants: { companyId: number; name: string; overdueTry: number; oldestDueDays: number }[];
      growthOpportunityLabels: string[];
      b2bStuckQuoteSamples: {
        requestId: number;
        code: string;
        sellerName: string;
        buyerName: string;
        ageDays: number;
      }[];
      b2bSellersMostStuckPending: { sellerCompanyId: number; sellerName: string; stuckPending3dPlus: number }[];
      collectionOutcomes30d: {
        resolved: number;
        dismissed: number;
        snoozed: number;
        contactedStale14d: number;
      };
      openReminderActionsByTier: { tier: string; count: number }[];
      weeklyExecutionDigest: string;
    } = {
      weeklyActionScoreboard: {
        collectionActionsOpen: founderSignalsV7.openReminderActionCount,
        collectionContacted7d: founderSignalsV7.contactedReminderActions7d,
        collectionResolved7d: founderSignalsV7.resolvedReminderActions7d,
        b2bQuotesStuckPending3dPlus: 0,
        b2bQuotesStuckPending7dPlus: 0,
        trackedUpgradeLeads:
          founderSignalsV7.upgradeOpportunityTop.length
          + founderSignalsV7.engagedLowPlanCandidates.length,
      },
      moneyRecoveredOverdueTryThisWeek: 0,
      billingCheckoutStartsThisMonth: 0,
      billingPaidSuccessThisMonth: 0,
      churnGraceSavesThisMonth: founderSignalsV7.churnGraceSavesThisMonth,
      topRiskTenants: founderSignalsV5.collectionPriority.slice(0, 5).map((r) => ({
        companyId: r.companyId,
        name: r.name,
        overdueTry: r.overdueTry,
        oldestDueDays: r.oldestDueDays,
      })),
      growthOpportunityLabels: [],
      b2bStuckQuoteSamples: [],
      b2bSellersMostStuckPending: [],
      collectionOutcomes30d: { resolved: 0, dismissed: 0, snoozed: 0, contactedStale14d: 0 },
      openReminderActionsByTier: [],
      weeklyExecutionDigest: "",
    };

    let founderSignalsV9: {
      planUpgradedEvents30d: number;
      planUpgradedEventsThisMonth: number;
      planUpgradeDestinationsMonth: { planSlug: string; count: number }[];
      planUpgradeSourceBreakdown30d: { source: string; count: number }[];
      b2bGlobalMedianFirstResponseHours: number | null;
      b2bSlowestMedianResponseSellers: {
        sellerCompanyId: number;
        sellerName: string;
        medianFirstResponseHours: number;
      }[];
      strategicDigestV9: string;
      todayRecommendedActions: string[];
    } = {
      planUpgradedEvents30d: funnel30dPlanUpgraded,
      planUpgradedEventsThisMonth: 0,
      planUpgradeDestinationsMonth: [],
      planUpgradeSourceBreakdown30d: [],
      b2bGlobalMedianFirstResponseHours: null,
      b2bSlowestMedianResponseSellers: [],
      strategicDigestV9: "",
      todayRecommendedActions: [],
    };

    let founderSignalsV10: {
      dailyCeoBriefing: string;
      weeklyExecutiveDigest: string;
      moneyRiskMapLine: string;
      growthMapLine: string;
      whatToDoNext: string[];
      recommendationsV2: {
        id: string;
        kind: string;
        roiScore: number;
        headline: string;
        rationale: string;
        companyId?: number;
        sellerCompanyId?: number;
        requestId?: number;
        amountTry?: number;
        badges: string[];
      }[];
      collectionRecoverabilityPreview: {
        companyId: number;
        name: string;
        payProbability0to100: number;
        basis: string;
      }[];
      planUpgradeSourceBreakdown30d: { source: string; count: number }[];
    } = {
      dailyCeoBriefing: "",
      weeklyExecutiveDigest: "",
      moneyRiskMapLine: "",
      growthMapLine: "",
      whatToDoNext: [],
      recommendationsV2: [],
      collectionRecoverabilityPreview: [],
      planUpgradeSourceBreakdown30d: [],
    };

    let revenueAttributionV2: {
      medianDaysSignupToFirstBillingSuccess: number | null;
      trialTouchCompanies30d: number;
      trialTouchAndBillingPaid30d: number;
      trialCohortPaidConversionPct: number;
      graceRescueViewCompanies30d: number;
      graceViewAndReactivateCompanies30d: number;
      graceComebackConversionPct: number;
      billingPaidSuccessByPage30d: { page: string; count: number }[];
      checkoutToPaidRateThisMonthPct: number;
      planUpgradedEventsPrev30d: number;
      planUpgradedEventsLast30d: number;
    } = {
      medianDaysSignupToFirstBillingSuccess: null,
      trialTouchCompanies30d: 0,
      trialTouchAndBillingPaid30d: 0,
      trialCohortPaidConversionPct: 0,
      graceRescueViewCompanies30d: 0,
      graceViewAndReactivateCompanies30d: 0,
      graceComebackConversionPct: 0,
      billingPaidSuccessByPage30d: [],
      checkoutToPaidRateThisMonthPct: 0,
      planUpgradedEventsPrev30d: 0,
      planUpgradedEventsLast30d: funnel30dPlanUpgraded,
    };

    let revenueAttributionV3:
      & typeof revenueAttributionV2
      & {
        billingPaidSuccessByUtm30d: { utmSource: string; count: number }[];
        billingPaidSuccessByPropsSource30d: { source: string; count: number }[];
        graceRescueViewsBySource30d: { source: string; count: number }[];
        medianDaysSignupToPaidByPlanSlug: { planSlug: string; medianDays: number; sampleSize: number }[];
        livePaymentsThisMonth: { paidCount: number; paidAmountTry: number };
        identityGateThisMonth: {
          shownCount: number;
          savedCount: number;
          phoneShownCount: number;
          phoneSavedCount: number;
          checkoutFailedCount: number;
        };
        paymentFailureClusters30d: { errorCode: string; count: number }[];
        trialCohortByMonth: {
          monthKey: string;
          trialCompanies: number;
          paidSameMonthCompanies: number;
          conversionPct: number;
        }[];
        pricingViewToPaidWithin7dCompanies30d: number;
        upsellConversionsByTrigger30d: { trigger: string; count: number }[];
      } = {
        ...revenueAttributionV2,
        billingPaidSuccessByUtm30d: [],
        billingPaidSuccessByPropsSource30d: [],
        graceRescueViewsBySource30d: [],
        medianDaysSignupToPaidByPlanSlug: [],
        livePaymentsThisMonth: { paidCount: 0, paidAmountTry: 0 },
        identityGateThisMonth: { shownCount: 0, savedCount: 0, phoneShownCount: 0, phoneSavedCount: 0, checkoutFailedCount: 0 },
        paymentFailureClusters30d: [],
        trialCohortByMonth: [],
        pricingViewToPaidWithin7dCompanies30d: 0,
        upsellConversionsByTrigger30d: [],
      };

    let founderCopilotV1: {
      actions: (RecoV2Shape & ReturnType<typeof copilotEnrichV1>)[];
      fastestWinToday: string;
      bestGrowthBetThisWeek: string;
      biggestRiskToday: string;
    } = {
      actions: [],
      fastestWinToday: "",
      bestGrowthBetThisWeek: "",
      biggestRiskToday: "",
    };

    let expansionEngineV1: {
      upgradeProbabilityTop: {
        companyId: number;
        name: string;
        planSlug: string;
        upgradeProbability0to100: number;
        upsellScore: number;
        planLimitPressurePct: number;
        signals: string[];
      }[];
      warmAccountsToContact: { companyId: number; name: string; reasonTag: string; priority0to100: number }[];
      planMismatchHints: string[];
      expansionTimingLine: string;
    } = {
      upgradeProbabilityTop: [],
      warmAccountsToContact: [],
      planMismatchHints: [],
      expansionTimingLine: "",
    };

    let founderSignalsV11: {
      dailyCeoBriefing: string;
      weeklyBoardSummary: string;
      top3MovesThisWeek: (RecoV2Shape & ReturnType<typeof copilotEnrichV1>)[];
      riskRadar: { level: "low" | "medium" | "high"; summary: string; signals: string[] };
      growthRadar: { level: "low" | "medium" | "high"; summary: string; signals: string[] };
      cashRadar: { level: "low" | "medium" | "high"; summary: string; signals: string[] };
      recommendedPlaybook: { title: string; steps: string[] }[];
    } = {
      dailyCeoBriefing: "",
      weeklyBoardSummary: "",
      top3MovesThisWeek: [],
      riskRadar: { level: "low", summary: "", signals: [] },
      growthRadar: { level: "low", summary: "", signals: [] },
      cashRadar: { level: "low", summary: "", signals: [] },
      recommendedPlaybook: [],
    };

    try {
      const dayW = now.getDay();
      const monOff = dayW === 0 ? -6 : 1 - dayW;
      const weekStartW = new Date(now);
      weekStartW.setHours(0, 0, 0, 0);
      weekStartW.setDate(weekStartW.getDate() + monOff);
      const weekEndW = new Date(weekStartW.getTime() + 7 * 86400000);
      const ago3b = new Date(now.getTime() - 3 * 86400000);
      const ago7st = new Date(now.getTime() - 7 * 86400000);
      const ago90sla = new Date(now.getTime() - 90 * 86400000);
      const ago60 = new Date(now.getTime() - 60 * 86400000);
      const ago120 = new Date(now.getTime() - 120 * 86400000);

      const [
        stuckMergedSql,
        recoveredWeekRow,
        funnelMonthSql,
        paymentsThisMonthSql,
        paymentFailClusters30dSql,
        outcomeSql,
        staleContRow,
        tierRows,
        stuckSampleSql,
        sellerStuckSql,
        planDestMonthSql,
        b2bGlobalMedSql,
        b2bSlowMedSql,
        upgradeSource30dSql,
        timeToPaidMedSql,
        trialCohortSql,
        graceComebackSql,
        paidByPage30dSql,
        planUpgradedPrev30Sql,
        paidByUtm30dSql,
        paidByPropsSource30dSql,
        graceViewsBySource30dSql,
        timeToPaidByPlanSql,
        trialByMonthSql,
        pricingViewToPaid7dSql,
      ] = await Promise.all([
        db.execute(sql`
          SELECT
            count(*) FILTER (WHERE created_at < ${ago3b})::int AS c3,
            count(*) FILTER (WHERE created_at < ${ago7st})::int AS c7
          FROM b2b_quote_requests
          WHERE status = 'pending'
        `),
        db.select({
          s: sql<number>`coalesce(sum((${subscriptionInvoicesTable.amount})::numeric), 0)`,
        })
          .from(subscriptionInvoicesTable)
          .where(and(
            eq(subscriptionInvoicesTable.status, "paid"),
            isNotNull(subscriptionInvoicesTable.paidAt),
            gte(subscriptionInvoicesTable.paidAt, weekStartW),
            lt(subscriptionInvoicesTable.paidAt, weekEndW),
            isNotNull(subscriptionInvoicesTable.dueDate),
            lt(subscriptionInvoicesTable.dueDate, subscriptionInvoicesTable.paidAt),
          )),
        db.execute(sql`
          SELECT event_key, count(*)::int AS c
          FROM product_funnel_events
          WHERE created_at >= ${monthStart}
            AND event_key IN (
              'billing_checkout_started',
              'billing_return_success',
              'billing_payment_succeeded',
              'billing_payment_failed',
              'billing_identity_required_shown',
              'billing_identity_saved',
              'billing_phone_required_shown',
              'billing_phone_saved',
              'billing_checkout_failed',
              'plan_upgraded',
              'grace_period_reactivate_success'
            )
          GROUP BY event_key
        `),
        db.execute(sql`
          SELECT
            count(*) FILTER (WHERE status = 'succeeded')::int AS paid_n,
            coalesce(sum((amount)::numeric) FILTER (WHERE status = 'succeeded'), 0)::numeric AS paid_try
          FROM payments
          WHERE paid_at >= ${monthStart}
            AND paid_at < ${monthEnd}
        `),
        db.execute(sql`
          SELECT
            coalesce(error_code, 'unknown') AS error_code,
            count(*)::int AS c
          FROM payments
          WHERE status = 'failed'
            AND created_at >= ${ago30}
          GROUP BY coalesce(error_code, 'unknown')
          ORDER BY c DESC
          LIMIT 8
        `),
        db.execute(sql`
          SELECT
            count(*) FILTER (WHERE status = 'resolved' AND updated_at >= ${ago30})::int AS resolved_n,
            count(*) FILTER (WHERE status = 'dismissed' AND updated_at >= ${ago30})::int AS dismissed_n,
            count(*) FILTER (WHERE status = 'snoozed' AND updated_at >= ${ago30})::int AS snoozed_n
          FROM collection_reminder_actions
        `),
        db.select({ c: count() }).from(collectionReminderActionsTable).where(and(
          eq(collectionReminderActionsTable.status, "contacted"),
          lt(collectionReminderActionsTable.createdAt, ago14),
        )),
        db
          .select({
            tier: collectionReminderActionsTable.reminderTier,
            n: sql<number>`count(*)::int`,
          })
          .from(collectionReminderActionsTable)
          .where(inArray(collectionReminderActionsTable.status, ["queued", "contacted", "snoozed"]))
          .groupBy(collectionReminderActionsTable.reminderTier),
        db.execute(sql`
          SELECT qr.id AS request_id, qr.code, cs.name AS seller_name, cb.name AS buyer_name,
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - qr.created_at)) / 86400))::int AS age_days
          FROM b2b_quote_requests qr
          INNER JOIN companies cs ON cs.id = qr.to_company_id
          INNER JOIN companies cb ON cb.id = qr.from_company_id
          WHERE qr.status = 'pending' AND qr.created_at < ${ago3b}
          ORDER BY qr.created_at ASC
          LIMIT 10
        `),
        db.execute(sql`
          SELECT qr.to_company_id AS seller_company_id, c.name AS seller_name, count(*)::int AS n
          FROM b2b_quote_requests qr
          INNER JOIN companies c ON c.id = qr.to_company_id
          WHERE qr.status = 'pending' AND qr.created_at < ${ago3b}
          GROUP BY qr.to_company_id, c.name
          ORDER BY n DESC
          LIMIT 8
        `),
        db.execute(sql`
          SELECT COALESCE((COALESCE(nullif(trim(props), ''), '{}'))::jsonb->>'new_plan_slug', 'unknown') AS slug, count(*)::int AS c
          FROM product_funnel_events
          WHERE event_key = 'plan_upgraded' AND created_at >= ${monthStart}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 8
        `),
        db.execute(sql`
          SELECT percentile_cont(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (responded_at - created_at)) / 3600.0
          )::float AS med_h
          FROM b2b_quote_requests
          WHERE responded_at IS NOT NULL AND created_at >= ${ago90sla}
        `),
        db.execute(sql`
          SELECT qr.to_company_id AS seller_company_id, c.name AS seller_name,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (qr.responded_at - qr.created_at)) / 3600.0
            )::float AS med_h
          FROM b2b_quote_requests qr
          INNER JOIN companies c ON c.id = qr.to_company_id
          WHERE qr.responded_at IS NOT NULL AND qr.created_at >= ${ago90sla}
          GROUP BY qr.to_company_id, c.name
          HAVING count(*) >= 2
          ORDER BY med_h DESC NULLS LAST
          LIMIT 6
        `),
        db.execute(sql`
          SELECT COALESCE((COALESCE(nullif(trim(props), ''), '{}'))::jsonb->>'source', 'unknown') AS src, count(*)::int AS c
          FROM product_funnel_events
          WHERE event_key = 'plan_upgraded' AND created_at >= ${ago30}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 12
        `),
        db.execute(sql`
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sub.d)::float AS median_days
          FROM (
            SELECT EXTRACT(EPOCH FROM (
              (SELECT MIN(e.created_at) FROM product_funnel_events e
               WHERE e.company_id = c.id AND e.event_key = 'billing_return_success')
              - c.created_at
            )) / 86400 AS d
            FROM companies c
            WHERE c.is_active = true
          ) sub
          WHERE sub.d IS NOT NULL AND sub.d >= 0 AND sub.d <= 900
        `),
        db.execute(sql`
          WITH trialed AS (
            SELECT DISTINCT company_id FROM product_funnel_events
            WHERE created_at >= ${ago30}
              AND event_key IN (
                'trial_cta_click',
                'trial_layout_strip_view',
                'trial_dashboard_banner_view'
              )
          ),
          paid30 AS (
            SELECT DISTINCT company_id FROM product_funnel_events
            WHERE created_at >= ${ago30} AND event_key = 'billing_return_success'
          )
          SELECT
            (SELECT count(*)::int FROM trialed) AS trial_n,
            (SELECT count(*)::int FROM trialed t WHERE EXISTS (
              SELECT 1 FROM paid30 p WHERE p.company_id = t.company_id
            )) AS trial_paid_n
        `),
        db.execute(sql`
          WITH viewed AS (
            SELECT DISTINCT company_id FROM product_funnel_events
            WHERE created_at >= ${ago30} AND event_key = 'grace_period_rescue_view'
          ),
          react AS (
            SELECT DISTINCT company_id FROM product_funnel_events
            WHERE created_at >= ${ago30} AND event_key = 'grace_period_reactivate_success'
          )
          SELECT
            (SELECT count(*)::int FROM viewed) AS view_n,
            (SELECT count(*)::int FROM viewed v WHERE EXISTS (
              SELECT 1 FROM react r WHERE r.company_id = v.company_id
            )) AS view_react_n
        `),
        db.execute(sql`
          SELECT COALESCE((COALESCE(nullif(trim(props), ''), '{}'))::jsonb->>'page', 'unknown') AS pg,
            count(*)::int AS c
          FROM product_funnel_events
          WHERE event_key = 'billing_return_success' AND created_at >= ${ago30}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 8
        `),
        db.select({ c: count() }).from(productFunnelEventsTable).where(and(
          eq(productFunnelEventsTable.eventKey, "plan_upgraded"),
          gte(productFunnelEventsTable.createdAt, ago60),
          lt(productFunnelEventsTable.createdAt, ago30),
        )),
        db.execute(sql`
          SELECT COALESCE(NULLIF(TRIM((COALESCE(NULLIF(TRIM(props), ''), '{}'))::jsonb->>'utm_source'), ''), 'unknown') AS utm,
            count(*)::int AS c
          FROM product_funnel_events
          WHERE event_key = 'billing_return_success' AND created_at >= ${ago30}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 10
        `),
        db.execute(sql`
          SELECT COALESCE(NULLIF(TRIM((COALESCE(NULLIF(TRIM(props), ''), '{}'))::jsonb->>'source'), ''), 'unknown') AS src,
            count(*)::int AS c
          FROM product_funnel_events
          WHERE event_key = 'billing_return_success' AND created_at >= ${ago30}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 10
        `),
        db.execute(sql`
          SELECT COALESCE(NULLIF(TRIM((COALESCE(NULLIF(TRIM(props), ''), '{}'))::jsonb->>'source'), ''), 'unknown') AS src,
            count(*)::int AS c
          FROM product_funnel_events
          WHERE event_key = 'grace_period_rescue_view' AND created_at >= ${ago30}
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 10
        `),
        db.execute(sql`
          SELECT x.plan_slug,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY x.d)::float AS median_days,
            count(*)::int AS n
          FROM (
            SELECT c.id AS cid, sp.slug AS plan_slug,
              EXTRACT(EPOCH FROM (
                (SELECT MIN(e.created_at) FROM product_funnel_events e
                 WHERE e.company_id = c.id AND e.event_key = 'billing_return_success')
                - c.created_at
              )) / 86400 AS d
            FROM companies c
            INNER JOIN company_subscriptions cs ON cs.company_id = c.id
              AND cs.status IN ('active', 'trial', 'grace_period')
            INNER JOIN subscription_plans sp ON sp.id = cs.plan_id
            WHERE c.is_active = true
          ) x
          WHERE x.d IS NOT NULL AND x.d >= 0 AND x.d <= 900
          GROUP BY x.plan_slug
          HAVING count(*) >= 2
          ORDER BY count(*) DESC
          LIMIT 8
        `),
        db.execute(sql`
          SELECT to_char(date_trunc('month', p.created_at), 'YYYY-MM') AS ym,
            count(DISTINCT p.company_id)::int AS trial_n,
            count(DISTINCT p.company_id) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM product_funnel_events e2
                WHERE e2.company_id = p.company_id
                  AND e2.event_key = 'billing_return_success'
                  AND e2.created_at >= date_trunc('month', p.created_at)
                  AND e2.created_at < date_trunc('month', p.created_at) + interval '1 month'
              )
            )::int AS paid_same_month_n
          FROM product_funnel_events p
          WHERE p.event_key IN (
            'trial_cta_click',
            'trial_layout_strip_view',
            'trial_dashboard_banner_view'
          )
            AND p.created_at >= ${ago120}
          GROUP BY date_trunc('month', p.created_at)
          ORDER BY date_trunc('month', p.created_at) DESC
          LIMIT 4
        `),
        db.execute(sql`
          SELECT COUNT(DISTINCT p1.company_id)::int AS n
          FROM product_funnel_events p1
          WHERE p1.event_key = 'pricing_view'
            AND p1.created_at >= ${ago30}
            AND EXISTS (
              SELECT 1 FROM product_funnel_events p2
              WHERE p2.company_id = p1.company_id
                AND p2.event_key = 'billing_return_success'
                AND p2.created_at > p1.created_at
                AND p2.created_at <= p1.created_at + interval '7 days'
            )
        `),
      ]);

      const stuckBr = (stuckMergedSql.rows?.[0] ?? {}) as { c3?: number | string; c7?: number | string };
      const s3 = Number(stuckBr.c3 ?? 0);
      const s7 = Number(stuckBr.c7 ?? 0);

      const utmRows = (paidByUtm30dSql.rows ?? []) as { utm: string; c: number | string }[];
      const paidSrcRows = (paidByPropsSource30dSql.rows ?? []) as { src: string; c: number | string }[];
      const graceSrcRows = (graceViewsBySource30dSql.rows ?? []) as { src: string; c: number | string }[];
      const ttpPlanRows = (timeToPaidByPlanSql.rows ?? []) as {
        plan_slug: string;
        median_days: number | string | null;
        n: number | string;
      }[];
      const trialMonthRows = (trialByMonthSql.rows ?? []) as {
        ym: string;
        trial_n: number | string;
        paid_same_month_n: number | string;
      }[];
      const pricingPaidRow = (pricingViewToPaid7dSql.rows?.[0] ?? {}) as { n?: number | string };
      const pricingViewToPaidWithin7dCompanies30dEarly = Number(pricingPaidRow.n ?? 0);
      const trialCohortByMonthEarly = trialMonthRows.map((row) => {
        const trialCompanies = Number(row.trial_n ?? 0);
        const paidSameMonthCompanies = Number(row.paid_same_month_n ?? 0);
        const conversionPct = trialCompanies > 0
          ? Math.round((paidSameMonthCompanies / trialCompanies) * 1000) / 10
          : 0;
        return {
          monthKey: row.ym || "",
          trialCompanies,
          paidSameMonthCompanies,
          conversionPct,
        };
      }).filter((x) => x.monthKey);

      const fm = new Map<string, number>();
      for (const row of (funnelMonthSql.rows ?? []) as { event_key: string; c: number | string }[]) {
        fm.set(row.event_key, Number(row.c ?? 0));
      }
      const chkMo = fm.get("billing_checkout_started") ?? 0;
      const paidMo = (fm.get("billing_payment_succeeded") ?? 0) || (fm.get("billing_return_success") ?? 0);
      const planUpgradedMo = fm.get("plan_upgraded") ?? 0;
      const identityShownMo = fm.get("billing_identity_required_shown") ?? 0;
      const identitySavedMo = fm.get("billing_identity_saved") ?? 0;
      const phoneShownMo = fm.get("billing_phone_required_shown") ?? 0;
      const phoneSavedMo = fm.get("billing_phone_saved") ?? 0;
      const checkoutFailedMo = fm.get("billing_checkout_failed") ?? 0;

      const payRow = (paymentsThisMonthSql.rows?.[0] ?? {}) as { paid_n?: number | string; paid_try?: number | string };
      const livePaymentsThisMonth = {
        paidCount: Number(payRow.paid_n ?? 0),
        paidAmountTry: Math.round(Number(payRow.paid_try ?? 0)),
      };
      const identityGateThisMonth = {
        shownCount: identityShownMo,
        savedCount: identitySavedMo,
        phoneShownCount: phoneShownMo,
        phoneSavedCount: phoneSavedMo,
        checkoutFailedCount: checkoutFailedMo,
      };
      const paymentFailureClusters30d = ((paymentFailClusters30dSql.rows ?? []) as { error_code: string; c: number | string }[])
        .map((r) => ({ errorCode: r.error_code || "unknown", count: Number(r.c ?? 0) }));

      const or = (outcomeSql.rows?.[0] ?? {}) as Record<string, unknown>;
      const resolvedN = Number(or.resolved_n ?? 0);
      const dismissedN = Number(or.dismissed_n ?? 0);
      const snoozedN = Number(or.snoozed_n ?? 0);
      const staleN = Number(staleContRow[0]?.c ?? 0);
      const recW = Math.round(Number(recoveredWeekRow[0]?.s ?? 0));

      const planDestRows = (planDestMonthSql.rows ?? []) as { slug: string; c: number | string }[];
      const planUpgradeDestinationsMonth = planDestRows.map((r) => ({
        planSlug: r.slug || "unknown",
        count: Number(r.c ?? 0),
      }));

      const gMed = (b2bGlobalMedSql.rows?.[0] ?? {}) as { med_h?: number | string | null };
      const b2bGlobalMedianFirstResponseHours = gMed.med_h != null && Number.isFinite(Number(gMed.med_h))
        ? Math.round(Number(gMed.med_h) * 10) / 10
        : null;

      const slowRows = (b2bSlowMedSql.rows ?? []) as {
        seller_company_id: number;
        seller_name: string;
        med_h: number | string | null;
      }[];
      const b2bSlowestMedianResponseSellers = slowRows.map((r) => ({
        sellerCompanyId: Number(r.seller_company_id),
        sellerName: r.seller_name,
        medianFirstResponseHours: r.med_h != null && Number.isFinite(Number(r.med_h))
          ? Math.round(Number(r.med_h) * 10) / 10
          : 0,
      }));

      const upgradeSrc30 = (upgradeSource30dSql.rows ?? []) as { src: string; c: number | string }[];
      const planUpgradeSourceBreakdown30d = upgradeSrc30.map((row) => ({
        source: row.src || "unknown",
        count: Number(row.c ?? 0),
      }));

      const ttpRow = (timeToPaidMedSql.rows?.[0] ?? {}) as { median_days?: number | string | null };
      const medianDaysSignupToFirstBillingSuccess = ttpRow.median_days != null && Number.isFinite(Number(ttpRow.median_days))
        ? Math.round(Number(ttpRow.median_days) * 10) / 10
        : null;

      const trialRow = (trialCohortSql.rows?.[0] ?? {}) as { trial_n?: number | string; trial_paid_n?: number | string };
      const trialTouchCompanies30d = Number(trialRow.trial_n ?? 0);
      const trialTouchAndBillingPaid30d = Number(trialRow.trial_paid_n ?? 0);
      const trialCohortPaidConversionPct = trialTouchCompanies30d > 0
        ? Math.round((trialTouchAndBillingPaid30d / trialTouchCompanies30d) * 1000) / 10
        : 0;

      const graceRow = (graceComebackSql.rows?.[0] ?? {}) as { view_n?: number | string; view_react_n?: number | string };
      const graceRescueViewCompanies30d = Number(graceRow.view_n ?? 0);
      const graceViewAndReactivateCompanies30d = Number(graceRow.view_react_n ?? 0);
      const graceComebackConversionPct = graceRescueViewCompanies30d > 0
        ? Math.round((graceViewAndReactivateCompanies30d / graceRescueViewCompanies30d) * 1000) / 10
        : 0;

      const paidPageRows = (paidByPage30dSql.rows ?? []) as { pg: string; c: number | string }[];
      const billingPaidSuccessByPage30d = paidPageRows.map((row) => ({
        page: row.pg || "unknown",
        count: Number(row.c ?? 0),
      }));

      const checkoutToPaidRateThisMonthPct = chkMo > 0
        ? Math.round((paidMo / chkMo) * 1000) / 10
        : 0;
      const planUpgradedEventsPrev30d = Number(planUpgradedPrev30Sql[0]?.c ?? 0);

      revenueAttributionV2 = {
        medianDaysSignupToFirstBillingSuccess,
        trialTouchCompanies30d,
        trialTouchAndBillingPaid30d,
        trialCohortPaidConversionPct,
        graceRescueViewCompanies30d,
        graceViewAndReactivateCompanies30d,
        graceComebackConversionPct,
        billingPaidSuccessByPage30d,
        checkoutToPaidRateThisMonthPct,
        planUpgradedEventsPrev30d,
        planUpgradedEventsLast30d: funnel30dPlanUpgraded,
      };

      revenueAttributionV3 = {
        ...revenueAttributionV2,
        livePaymentsThisMonth,
        identityGateThisMonth,
        paymentFailureClusters30d,
        billingPaidSuccessByUtm30d: utmRows.map((r) => ({
          utmSource: r.utm || "unknown",
          count: Number(r.c ?? 0),
        })),
        billingPaidSuccessByPropsSource30d: paidSrcRows.map((r) => ({
          source: r.src || "unknown",
          count: Number(r.c ?? 0),
        })),
        graceRescueViewsBySource30d: graceSrcRows.map((r) => ({
          source: r.src || "unknown",
          count: Number(r.c ?? 0),
        })),
        medianDaysSignupToPaidByPlanSlug: ttpPlanRows.map((r) => ({
          planSlug: r.plan_slug || "unknown",
          medianDays: r.median_days != null && Number.isFinite(Number(r.median_days))
            ? Math.round(Number(r.median_days) * 10) / 10
            : 0,
          sampleSize: Number(r.n ?? 0),
        })),
        trialCohortByMonth: trialCohortByMonthEarly,
        pricingViewToPaidWithin7dCompanies30d: pricingViewToPaidWithin7dCompanies30dEarly,
        upsellConversionsByTrigger30d: planUpgradeSourceBreakdown30d.map((x) => ({
          trigger: x.source,
          count: x.count,
        })),
      };

      const growthLbl: string[] = [];
      for (const t of topTenantsBySales7d.slice(0, 3)) {
        growthLbl.push(`${t.name}: 7g ${t.salesCount} satış`);
      }
      for (const u of founderSignalsV7.upgradeOpportunityTop.slice(0, 2)) {
        growthLbl.push(`${u.name}: yükseltme skoru ${u.upsellScore}`);
      }

      const samples = ((stuckSampleSql.rows ?? []) as {
        request_id: number;
        code: string;
        seller_name: string;
        buyer_name: string;
        age_days: number | string;
      }[]).map((row) => ({
        requestId: Number(row.request_id),
        code: row.code,
        sellerName: row.seller_name,
        buyerName: row.buyer_name,
        ageDays: Number(row.age_days ?? 0),
      }));

      const sellerStuck = ((sellerStuckSql.rows ?? []) as {
        seller_company_id: number;
        seller_name: string;
        n: number | string;
      }[]).map((row) => ({
        sellerCompanyId: Number(row.seller_company_id),
        sellerName: row.seller_name,
        stuckPending3dPlus: Number(row.n ?? 0),
      }));

      founderSignalsV8 = {
        weeklyActionScoreboard: {
          collectionActionsOpen: founderSignalsV7.openReminderActionCount,
          collectionContacted7d: founderSignalsV7.contactedReminderActions7d,
          collectionResolved7d: founderSignalsV7.resolvedReminderActions7d,
          b2bQuotesStuckPending3dPlus: s3,
          b2bQuotesStuckPending7dPlus: s7,
          trackedUpgradeLeads:
            founderSignalsV7.upgradeOpportunityTop.length
            + founderSignalsV7.engagedLowPlanCandidates.length,
        },
        moneyRecoveredOverdueTryThisWeek: recW,
        billingCheckoutStartsThisMonth: chkMo,
        billingPaidSuccessThisMonth: paidMo,
        churnGraceSavesThisMonth: founderSignalsV7.churnGraceSavesThisMonth,
        topRiskTenants: founderSignalsV5.collectionPriority.slice(0, 5).map((r) => ({
          companyId: r.companyId,
          name: r.name,
          overdueTry: r.overdueTry,
          oldestDueDays: r.oldestDueDays,
        })),
        growthOpportunityLabels: growthLbl,
        b2bStuckQuoteSamples: samples,
        b2bSellersMostStuckPending: sellerStuck,
        collectionOutcomes30d: {
          resolved: resolvedN,
          dismissed: dismissedN,
          snoozed: snoozedN,
          contactedStale14d: staleN,
        },
        openReminderActionsByTier: tierRows.map((r) => ({
          tier: String(r.tier ?? ""),
          count: Number(r.n ?? 0),
        })),
        weeklyExecutionDigest:
          `Bu hafta vadesi geçmiş tahsil edilen (TRY, yaklaşık): ${recW}. `
          + `B2B bekleyen teklif (3+ gün): ${s3} adet (7+ gün: ${s7}). `
          + `Tahsilat aksiyonu 30g: çözüldü ${resolvedN}, kapattı ${dismissedN}, ertelendi ${snoozedN}; `
          + `14+ gün iletişimde kalan: ${staleN}. `
          + `Ödeme hunisi bu ay: checkout ${chkMo}, başarılı dönüş ${paidMo}, plan_upgraded ${planUpgradedMo}. `
          + `Grace kurtarma: ${founderSignalsV7.churnGraceSavesThisMonth}.`,
      };

      const recommendationsV2: {
        id: string;
        kind: string;
        roiScore: number;
        headline: string;
        rationale: string;
        companyId?: number;
        sellerCompanyId?: number;
        requestId?: number;
        amountTry?: number;
        badges: string[];
      }[] = [];

      for (const r of founderSignalsV5.collectionPriority.slice(0, 3)) {
        const tier = collectionReminderLevel(r.oldestDueDays);
        const { payProbability0to100, basis } = collectionRecoverability01(r.overdueTry, r.oldestDueDays, tier);
        recommendationsV2.push({
          id: `call:${r.companyId}`,
          kind: "collect_call",
          roiScore: Math.round(payProbability0to100 * 2.1 + r.collectionScore / 9000),
          headline: `Bugün ara: ${r.name}`,
          rationale: `${Math.round(r.overdueTry)} TRY vadesi geçmiş, ${r.oldestDueDays} gün, ${r.pendingInvoiceCount} fatura. Tahmini geri kazanım sinyali %${payProbability0to100}. ${basis}`,
          companyId: r.companyId,
          amountTry: r.overdueTry,
          badges: ["tahsilat", tier],
        });
      }

      for (const u of founderSignalsV7.upgradeOpportunityTop.slice(0, 2)) {
        const press = u.planLimitPressurePct ?? 0;
        recommendationsV2.push({
          id: `upgrade:${u.companyId}`,
          kind: "plan_upgrade",
          roiScore: Math.round(u.upsellScore * 1.4 + (press >= 85 ? 28 : press >= 70 ? 14 : 0)),
          headline: `Yükseltme fırsatı: ${u.name}`,
          rationale: `Plan ${u.planSlug}, skor ${u.upsellScore}, 30g satış ${u.sales30d}, ürün ${u.productCount}, limit baskısı %${press}.`,
          companyId: u.companyId,
          badges: ["gelir", "paket"],
        });
      }

      const topStuck = sellerStuck[0];
      if (topStuck && topStuck.stuckPending3dPlus >= 2) {
        recommendationsV2.push({
          id: `b2b:seller:${topStuck.sellerCompanyId}`,
          kind: "b2b_sla",
          roiScore: Math.round(52 + topStuck.stuckPending3dPlus * 9),
          headline: `B2B SLA: ${topStuck.sellerName}`,
          rationale: `${topStuck.stuckPending3dPlus} bekleyen teklif (3+ gün); yanıt gecikmesi müşteri kaybına gider.`,
          sellerCompanyId: topStuck.sellerCompanyId,
          badges: ["b2b", "sla"],
        });
      }

      if (founderSignalsV6.churnRiskMrrTry > 8000) {
        recommendationsV2.push({
          id: "grace:mrr_risk",
          kind: "grace_churn_save",
          roiScore: Math.round(68 + Math.min(22, founderSignalsV6.churnRiskMrrTry / 15_000)),
          headline: "Grace / iptal hattındaki MRR riskini ele al",
          rationale: `Yaklaşık ${Math.round(founderSignalsV6.churnRiskMrrTry)} TRY/ay MRR grace sinyali; kurtarma akışlarını kontrol edin.`,
          badges: ["iptal", "mrr"],
        });
      }

      if (staleN >= 2) {
        recommendationsV2.push({
          id: "collect:stale_contacted",
          kind: "collect_followup",
          roiScore: Math.round(58 + staleN * 4),
          headline: "Tahsilat: uzun süredir iletişimde kalan aksiyonlar",
          rationale: `${staleN} kayıt 14+ gün “iletişimde”; sonuç veya yeni kanal netleştirin.`,
          badges: ["tahsilat", "operasyon"],
        });
      }

      recommendationsV2.sort((a, b) => b.roiScore - a.roiScore);
      const topRecs = recommendationsV2.slice(0, 8);

      const collectionRecoverabilityPreview = founderSignalsV5.collectionPriority.slice(0, 5).map((r) => {
        const tier = collectionReminderLevel(r.oldestDueDays);
        const { payProbability0to100, basis } = collectionRecoverability01(r.overdueTry, r.oldestDueDays, tier);
        return {
          companyId: r.companyId,
          name: r.name,
          payProbability0to100,
          basis,
        };
      });

      const copilotActions = topRecs.map((r) => ({ ...r, ...copilotEnrichV1(r) }));
      const topUpgrade = founderSignalsV7.upgradeOpportunityTop[0];
      const topDebtCo = founderSignalsV5.collectionPriority[0];

      founderCopilotV1 = {
        actions: copilotActions.slice(0, 6),
        fastestWinToday: topRecs[0]
          ? `${topRecs[0].headline} — ${copilotEnrichV1(topRecs[0]).expectedRoiBand}`
          : "Öncelikli sinyal için huni ve tahsilat verisini güçlendirin.",
        bestGrowthBetThisWeek: topUpgrade
          ? `Bu hafta: ${topUpgrade.name} ile paket yükseltme (skor ${topUpgrade.upsellScore}, limit baskısı %${topUpgrade.planLimitPressurePct}).`
          : (topTenantsBySales7d[0]
            ? `Bu hafta: ${topTenantsBySales7d[0].name} üzerinden modül/çapraz satış.`
            : "Bu hafta: düşük planda yüksek etkileşimli firmaları tarayın."),
        biggestRiskToday: [
          founderSignalsV6.churnRiskMrrTry > 12_000
            ? `Grace/MRR riski ~${Math.round(founderSignalsV6.churnRiskMrrTry)} TRY/ay.`
            : "",
          topDebtCo ? `Tahsilat önceliği: ${topDebtCo.name} (${Math.round(topDebtCo.overdueTry)} TRY, ${topDebtCo.oldestDueDays}g).` : "",
          s3 >= 4 ? `B2B: ${s3} teklif 3+ gün bekliyor.` : "",
        ].filter(Boolean).join(" ") || "Kritik risk sinyali düşük; rutin gözlem yeterli.",
      };

      expansionEngineV1 = {
        upgradeProbabilityTop: founderSignalsV7.upgradeOpportunityTop.slice(0, 6).map((u) => ({
          companyId: u.companyId,
          name: u.name,
          planSlug: u.planSlug,
          upgradeProbability0to100: upgradeProbability01({
            upsellScore: u.upsellScore,
            planLimitPressurePct: u.planLimitPressurePct ?? 0,
            sales30d: u.sales30d,
          }),
          upsellScore: u.upsellScore,
          planLimitPressurePct: u.planLimitPressurePct ?? 0,
          signals: [
            `30g satış ${u.sales30d}`,
            `ürün ${u.productCount}`,
            `limit %${u.planLimitPressurePct ?? 0}`,
          ],
        })),
        warmAccountsToContact: (() => {
          const m = new Map<number, { companyId: number; name: string; reasonTag: string; priority0to100: number }>();
          for (const r of founderSignalsV5.collectionPriority.slice(0, 2)) {
            const tier = collectionReminderLevel(r.oldestDueDays);
            const { payProbability0to100 } = collectionRecoverability01(r.overdueTry, r.oldestDueDays, tier);
            m.set(r.companyId, {
              companyId: r.companyId,
              name: r.name,
              reasonTag: "tahsilat",
              priority0to100: Math.min(100, Math.round(payProbability0to100 + r.collectionScore / 12_000)),
            });
          }
          for (const u of founderSignalsV7.upgradeOpportunityTop.slice(0, 2)) {
            if (m.has(u.companyId)) continue;
            m.set(u.companyId, {
              companyId: u.companyId,
              name: u.name,
              reasonTag: "expansion",
              priority0to100: upgradeProbability01({
                upsellScore: u.upsellScore,
                planLimitPressurePct: u.planLimitPressurePct ?? 0,
                sales30d: u.sales30d,
              }),
            });
          }
          return [...m.values()].sort((a, b) => b.priority0to100 - a.priority0to100);
        })(),
        planMismatchHints: founderSignalsV7.engagedLowPlanCandidates
          .filter((c) => c.sales30d >= 10 && String(c.planSlug).includes("starter"))
          .slice(0, 4)
          .map((c) => `${c.name}: starter planda yüksek hacim (${c.sales30d} satış/30g) — paket uyumsuzluğu.`),
        expansionTimingLine: funnel30dPlanUpgraded > planUpgradedEventsPrev30d
          ? "Yükseltme olayları hızlanıyor; fiyatlandırma ve limit mesajını bu hafta netleştirin."
          : "Trial→ödeme ve pricing_view→7g ödeme hunisini sıkılaştırın.",
      };

      const openInv7 = Number(pendingInv7Row[0]?.c ?? 0);
      const riskSignals: string[] = [];
      if (topDebtCo && topDebtCo.overdueTry >= 25_000) riskSignals.push("Yüksek vadesi geçmiş TRY konsantrasyonu");
      if (s3 >= 5) riskSignals.push("B2B yanıt gecikmesi (çok bekleyen teklif)");
      if (founderSignalsV6.churnRiskMrrTry > 15_000) riskSignals.push("Grace / iptal hattında yüksek MRR");
      if (staleN >= 3) riskSignals.push("Tahsilat aksiyonlarında takılı iletişim");
      const riskLevel: "low" | "medium" | "high" = riskSignals.length >= 2 ? "high"
        : riskSignals.length === 1 ? "medium"
          : "low";

      const growthSignals: string[] = [];
      if (funnel30dPlanUpgraded > planUpgradedEventsPrev30d) growthSignals.push("Plan yükseltme olayları ivmeli");
      if (topTenantsBySales7d[0]?.salesCount >= 8) growthSignals.push("7g satışta güçlü üst uç kiracı");
      if (trialCohortPaidConversionPct >= 18) growthSignals.push("Trial→ödeme dönüşümü sağlıklı");
      const growthLevel: "low" | "medium" | "high" = growthSignals.length >= 2 ? "high"
        : growthSignals.length === 1 ? "medium"
          : "low";

      const cashSignals: string[] = [];
      if (recW > 0) cashSignals.push(`Bu hafta vadesi geçmiş tahsil ~${recW} TRY`);
      if (founderSignalsV7.openReminderActionCount > 0) {
        cashSignals.push(`Açık tahsilat aksiyonu: ${founderSignalsV7.openReminderActionCount}`);
      }
      if (openInv7 > 0) cashSignals.push(`Son 7 gün ödenmemiş abonelik faturası: ${openInv7}`);
      const cashLevel: "low" | "medium" | "high" = cashSignals.length >= 2 ? "high"
        : cashSignals.length === 1 ? "medium"
          : "low";

      const topDebt = founderSignalsV5.collectionPriority.slice(0, 3).map((r) => `${r.name} (${Math.round(r.overdueTry)} TRY)`).join(" · ");
      const hotGrowth = topTenantsBySales7d.slice(0, 2).map((t) => `${t.name}`).join(" · ");

      founderSignalsV10 = {
        dailyCeoBriefing:
          `Özet: MRR ~${Math.round(mrr)} TRY; açık tahsilat aksiyonu ${founderSignalsV7.openReminderActionCount}; `
          + `B2B 3+g bekleyen ${s3} teklif; bu ay plan_upgraded ${planUpgradedMo}. `
          + `Öncelik aksiyon: ${topRecs[0]?.headline ?? "veri toplama ve gözden geçirme"}.`,
        weeklyExecutiveDigest:
          `${founderSignalsV7.weeklyMoneyActionsDigest} ${founderSignalsV8.weeklyExecutionDigest}`.trim(),
        moneyRiskMapLine: topDebt || "Öncelikli vadesi geçmiş bakiye listesi boş.",
        growthMapLine: [
          hotGrowth ? `7g satış sıcak: ${hotGrowth}.` : "7g satış sıcak noktası sınırlı.",
          medianDaysSignupToFirstBillingSuccess != null
            ? `Kayıt→ilk ödeme (billing_return_success) medyan: ${medianDaysSignupToFirstBillingSuccess} gün.`
            : "",
          trialTouchCompanies30d > 0
            ? `Trial dokunuş→30g ödeme: %${trialCohortPaidConversionPct} (${trialTouchAndBillingPaid30d}/${trialTouchCompanies30d}).`
            : "",
          planUpgradedEventsPrev30d > 0 || funnel30dPlanUpgraded > 0
            ? `Plan yükseltme olayı: son 30g ${funnel30dPlanUpgraded}, önceki 30g ${planUpgradedEventsPrev30d}.`
            : "",
        ].filter(Boolean).join(" "),
        whatToDoNext: topRecs.slice(0, 5).map((x) => x.headline),
        recommendationsV2: topRecs,
        collectionRecoverabilityPreview,
        planUpgradeSourceBreakdown30d,
      };

      const playbookParts: { title: string; steps: string[] }[] = [];
      if (founderSignalsV7.openReminderActionCount >= 3 || (topDebtCo && topDebtCo.overdueTry > 15_000)) {
        playbookParts.push({
          title: "Tahsilat sprinti (48s)",
          steps: [
            "Öncelik 3 kiracıyı arayın (liste: cockpit).",
            "Her kayıt için tek kanal ve son tarih netleştirin.",
            "Çözüldü / ertelendi kararını aynı gün girin.",
          ],
        });
      }
      if (topUpgrade) {
        playbookParts.push({
          title: "Expansion görüşme bloku",
          steps: [
            `${topUpgrade.name} ile limit ve satış hacmini konuşun.`,
            "Sonraki paket fiyatını ve geçiş tarihini yazılı teyit edin.",
            "plan_upgraded olayında source alanını doldurun (attribution).",
          ],
        });
      }
      if (s3 >= 3) {
        playbookParts.push({
          title: "B2B SLA blitz",
          steps: [
            "3+ gün bekleyen teklifleri satıcı bazında sıralayın.",
            "İlk yanıt şablonunu kısaltın; SLA hedefini ekranda gösterin.",
            "Kapanmayan teklifler için yöneticiye eskalasyon kuralı ekleyin.",
          ],
        });
      }

      founderSignalsV11 = {
        dailyCeoBriefing:
          `${founderSignalsV10.dailyCeoBriefing} Copilot — en hızlı kazanım: ${founderCopilotV1.fastestWinToday}`.slice(0, 900),
        weeklyBoardSummary:
          `${(founderSignalsV7.weeklyMoneyActionsDigest + " " + founderSignalsV8.weeklyExecutionDigest).trim().slice(0, 380)} `
          + `| Checkout→Ödeme (bu ay) %${checkoutToPaidRateThisMonthPct} | plan_upgraded son 30g: ${funnel30dPlanUpgraded}.`,
        top3MovesThisWeek: copilotActions.slice(0, 3),
        riskRadar: {
          level: riskLevel,
          summary: riskLevel === "high" ? "Birden fazla nakit/B2B riski örtüşüyor." : riskLevel === "medium" ? "Tek başına yönetilebilir ama yakın takip." : "Riskler dağınık veya düşük.",
          signals: riskSignals.length ? riskSignals : ["Öne çıkan kritik risk yok"],
        },
        growthRadar: {
          level: growthLevel,
          summary: growthLevel === "high" ? "Büyüme sinyalleri üst üste biniyor." : "Büyüme ritmi izlenebilir.",
          signals: growthSignals.length ? growthSignals : ["Büyüme için daha fazla huni verisi gerekli"],
        },
        cashRadar: {
          level: cashLevel,
          summary: cashLevel === "high" ? "Nakit ve tahsilat baskısı aynı anda yükseliyor." : "Nakit akışı kontrol altında görünüyor.",
          signals: cashSignals.length ? cashSignals : ["Nakit sinyali nötr"],
        },
        recommendedPlaybook: playbookParts,
      };

      founderSignalsV9 = {
        planUpgradedEvents30d: funnel30dPlanUpgraded,
        planUpgradedEventsThisMonth: planUpgradedMo,
        planUpgradeDestinationsMonth,
        planUpgradeSourceBreakdown30d,
        b2bGlobalMedianFirstResponseHours,
        b2bSlowestMedianResponseSellers,
        strategicDigestV9:
          `Plan yükseltme (30g / bu ay): ${funnel30dPlanUpgraded} / ${planUpgradedMo}. `
          + (planUpgradeSourceBreakdown30d[0]
            ? `Kaynak (30g üst): ${planUpgradeSourceBreakdown30d[0].source} ×${planUpgradeSourceBreakdown30d[0].count}. `
            : "")
          + (b2bGlobalMedianFirstResponseHours != null
            ? `B2B ilk yanıt süresi medyanı (saat, 90g): ${b2bGlobalMedianFirstResponseHours}. `
            : "B2B ilk yanıt medyanı için yeterli örnek yok. "),
        todayRecommendedActions: topRecs.slice(0, 6).map((x) => x.headline),
      };
    } catch {
      /* v8 — B2B / cra / huni */
    }

    const ago90 = new Date(now.getTime() - 90 * 86400000);
    let founderOvernightPackV1: Awaited<ReturnType<typeof computeFounderOvernightPackV1>> | undefined;
    let b2bOpsSupplementV1: Awaited<ReturnType<typeof computeB2bOpsSupplementV1>> | undefined;
    let b2bSupplementOk = false;
    try {
      const accountsToCallSeed: { companyId: number; name: string; tag: string; score: number }[] = [];
      for (const r of founderSignalsV5.collectionPriority.slice(0, 8)) {
        accountsToCallSeed.push({
          companyId: r.companyId,
          name: r.name,
          tag: "tahsilat",
          score: Math.min(100, Math.round(r.collectionScore / 2500)),
        });
      }
      for (const w of expansionEngineV1.warmAccountsToContact) {
        accountsToCallSeed.push({
          companyId: w.companyId,
          name: w.name,
          tag: w.reasonTag,
          score: w.priority0to100,
        });
      }
      const [packSettled, b2bSettled] = await Promise.allSettled([
        computeFounderOvernightPackV1({
          now,
          monthStart,
          ago30,
          ago90,
          baseMrrTry: mrr,
          activeTenantCount: Math.max(1, activeSubs.length),
          accountsToCallSeed,
        }),
        computeB2bOpsSupplementV1({ ago90 }),
      ]);
      if (packSettled.status === "fulfilled") {
        founderOvernightPackV1 = packSettled.value;
      } else {
        console.error("[billing/metrics] founderOvernightPackV1", packSettled.reason);
      }
      if (b2bSettled.status === "fulfilled") {
        b2bOpsSupplementV1 = b2bSettled.value;
        b2bSupplementOk = true;
      } else {
        console.error("[billing/metrics] computeB2bOpsSupplementV1", b2bSettled.reason);
      }
    } catch (packErr) {
      console.error("[billing/metrics] founderOvernightPackV1", packErr);
    }

    let founderIntelligenceV2: ReturnType<typeof buildFounderIntelligenceV2> | undefined;
    let founderIntelligenceV3: ReturnType<typeof buildFounderIntelligenceV3> | undefined;
    let revenueEngineBundleV1: ReturnType<typeof buildRevenueEngineBundleV1> | undefined;
    let churnPreventionBundleV1: ReturnType<typeof buildChurnPreventionBundleV1> | undefined;
    let b2bOpsBundleV1: ReturnType<typeof buildB2bOpsBundleV1> | undefined;
    if (founderOvernightPackV1) {
      founderIntelligenceV2 = buildFounderIntelligenceV2({
        pack: founderOvernightPackV1,
        churnRiskMrrTry: founderSignalsV6.churnRiskMrrTry,
        copilot: {
          fastestWinToday: founderCopilotV1.fastestWinToday,
          bestGrowthBetThisWeek: founderCopilotV1.bestGrowthBetThisWeek,
          biggestRiskToday: founderCopilotV1.biggestRiskToday,
          actions: founderCopilotV1.actions.map((a) => ({
            headline: a.headline,
            kind: a.kind,
            roiScore: a.roiScore,
          })),
        },
      });
      founderIntelligenceV3 = buildFounderIntelligenceV3({
        v2: founderIntelligenceV2,
        pack: founderOvernightPackV1,
        copilot: {
          fastestWinToday: founderCopilotV1.fastestWinToday,
          bestGrowthBetThisWeek: founderCopilotV1.bestGrowthBetThisWeek,
          biggestRiskToday: founderCopilotV1.biggestRiskToday,
          actions: founderCopilotV1.actions.map((a) => ({
            headline: a.headline,
            kind: a.kind,
            roiScore: a.roiScore,
          })),
        },
      });
      revenueEngineBundleV1 = buildRevenueEngineBundleV1({
        pack: founderOvernightPackV1,
        revenueV3: revenueAttributionV3,
        expansion: expansionEngineV1,
      });
      churnPreventionBundleV1 = buildChurnPreventionBundleV1({
        pack: founderOvernightPackV1,
        v6: founderSignalsV6,
        v7: founderSignalsV7,
        v5Operating: founderSignalsV5.operatingSnapshot30d,
      });
      b2bOpsBundleV1 = buildB2bOpsBundleV1({
        pack: founderOvernightPackV1,
        supplement: b2bOpsSupplementV1 ?? { repeatBuyerRelationships: [] },
        sellerQuoteAcceptance: founderSignalsV6.sellerQuoteAcceptance,
      });
    }

    const billingMetricsDurationMs = Date.now() - billingMetricsStartedAt;
    const billingMetricsPerformanceBundleV1 = buildBillingMetricsPerformanceBundleV1({
      durationMs: billingMetricsDurationMs,
      founderPackOk: Boolean(founderOvernightPackV1),
      b2bSupplementOk,
    });
    const docsPlaybooksBundleV1 = buildDocsPlaybooksBundleV1({
      mirroredBoardPlaybooks: founderSignalsV11.recommendedPlaybook ?? [],
    });

    return res.json({
      mrr: Math.round(mrr),
      arr: Math.round(arr),
      activeTenantCount: activeSubs.length,
      trialTenantCount: trialCount?.c ?? 0,
      expiredTenantCount: expiredCount?.c ?? 0,
      totalTenants: totalTenants?.c ?? 0,
      churnedSubscriptions: cancelledCount?.c ?? 0,
      planBreakdown,
      founderSignals: {
        trialsEndingWithin7Days: trialsEndingSoonRow[0]?.c ?? 0,
        churnCancelledLast30Days: churn30Row[0]?.c ?? 0,
        unpaidSubscriptionInvoicesLast7Days: pendingInv7Row[0]?.c ?? 0,
        newActiveSubscriptionsLast7Days: newActive7Row[0]?.c ?? 0,
        tenantsWithSalesLast7Days: Number(salesTenants7Row[0]?.c ?? 0),
        newActiveSubscriptionsLast30Days: newStarts30Row[0]?.c ?? 0,
        topTenantsBySales7d,
      },
      founderSignalsV3,
      founderSignalsV4,
      founderSignalsV5,
      founderSignalsV6,
      founderSignalsV7,
      founderSignalsV8,
      founderSignalsV9,
      founderSignalsV10,
      founderSignalsV11,
      founderCopilotV1,
      expansionEngineV1,
      revenueAttributionV2,
      revenueAttributionV3,
      founderOvernightPackV1,
      founderIntelligenceV2,
      founderIntelligenceV3,
      revenueEngineBundleV1,
      churnPreventionBundleV1,
      b2bOpsBundleV1,
      billingMetricsPerformanceBundleV1,
      docsPlaybooksBundleV1,
    });
  } catch (e) { console.error(e); return res.status(500).json({ message: "Sunucu hatası" }); }
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
    const [prev] = await db.select().from(subscriptionInvoicesTable)
      .where(eq(subscriptionInvoicesTable.id, invoiceId));
    if (!prev) return void res.status(404).json(Errors.notFound("Fatura"));
    const wasOverdue = prev.status === "pending"
      && prev.dueDate
      && new Date(prev.dueDate) < new Date();

    const [updated] = await db.update(subscriptionInvoicesTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(subscriptionInvoicesTable.id, invoiceId))
      .returning();
    if (!updated) return void res.status(404).json(Errors.notFound("Fatura"));
    if (wasOverdue) {
      void recordOverdueInvoiceRecovered({
        companyId: updated.companyId,
        userId: req.session?.user?.id ?? null,
        invoiceId,
        amountTry: Number(prev.amount),
      });
    }
    invalidateFeaturesCache(updated.companyId);
    res.json({ invoice: updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Sunucu hatası" }); }
});

export default router;
