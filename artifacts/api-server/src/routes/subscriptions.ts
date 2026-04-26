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
import { and, eq, desc, sql, gte, lte, isNotNull, inArray } from "drizzle-orm";
import { requireAuth, requireRole, requireSuperAdmin } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { getCompanyFeatureContext, invalidateFeaturesCache } from "../middlewares/features.js";
import { audit } from "../lib/audit.js";
import { buildMarketplaceWorkerFounderAlertsV1 } from "../lib/marketplace-worker-observability.js";
import { buildMarketplaceSelfHealFounderAlertsV1 } from "../services/marketplace/self-heal.js";
import { buildMarketplaceProfitFounderAlertsV1 } from "../lib/marketplace-profit-automation.js";
import {
  appendSubscriptionNote,
  buildCancelNoteLine,
  normalizeCancelReasonCode,
  calcUsage,
  collectionReminderLevel,
  mondayPeriodKey,
  reminderActionIdempotencyKey,
  recordOverdueInvoiceRecovered,
} from "./subscriptions/subscriptions-shared-helpers.js";
import { registerSubscriptionsAdminBillingMetrics } from "./subscriptions/subscriptions-admin-billing-metrics.js";
import { seedSubscriptionPlans, seedSubscriptionPlansV2 } from "./subscriptions/subscriptions-plans-seed.js";

export { seedSubscriptionPlans, seedSubscriptionPlansV2 };

const router = Router();

registerSubscriptionsAdminBillingMetrics(router);

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

/** super_admin: takılı pazaryeri kuyruğu olan kiracılar (worker observability). */
router.get("/admin/marketplace-worker-alerts", requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await buildMarketplaceWorkerFounderAlertsV1();
    const automation = await buildMarketplaceSelfHealFounderAlertsV1();
    const profitAuto = await buildMarketplaceProfitFounderAlertsV1();
    res.json({
      ...data,
      automationAlerts: automation.alerts,
      profitAutomationAlerts: profitAuto.alerts,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Sunucu hatası" });
  }
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
