/**
 * Dalga 22 — Billing routes (Iyzico recurring billing iskelet).
 *
 * Endpoints:
 *   POST /api/billing/checkout            — Auth admin. Yeni ödeme oturumu açar (provider'a göre yönlendirir).
 *   POST /api/billing/webhook             — Provider callback (no-auth, HMAC verify).
 *   GET  /api/billing/payments            — Auth admin. Şirketin ödeme geçmişi.
 *   POST /api/billing/__simulate-success  — DEV/super_admin only. Mock ödeme başarısı simüle et.
 *
 * Subscription transition: payment 'succeeded' olduğunda
 *   - Aktif company_subscriptions satırı varsa: planId/billingCycle/expiresAt güncellenir.
 *   - Yoksa: yeni satır insert (status='active').
 *   Güvenlik: tek-seferli işlem için `payments.conversation_id` unique + idempotent
 *   webhook handler (success ikinci kez gelirse no-op).
 */
import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import {
  db,
  paymentsTable,
  subscriptionPlansTable,
  companySubscriptionsTable,
  companiesTable,
  usersTable,
  companySettingsTable,
  creditPurchasesTable,
  productFunnelEventsTable,
} from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getBillingProvider, newConversationId } from "../services/billing/iyzico";
import { CREDIT_PACKS, findCreditPack } from "../services/billing/credit-packs";
import { addPurchasedCredits, currentPeriodUTC } from "../services/usage";
import { invalidateFeaturesCache } from "../middlewares/features";
import { logger } from "../lib/logger";

/** +905xxxxxxxxx (13 chars) — Iyzico buyer.gsmNumber için tutarlı biçim */
function normalizeTrGsm(raw: string): string | null {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("90") && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 && d.startsWith("5")) return `+90${d}`;
  return null;
}

function requireNormalizedGsm(
  userPhone: string | null | undefined,
  settingsPhone: string | null | undefined,
): { ok: true; gsm: string } | { ok: false; code: "PHONE_REQUIRED" | "PHONE_INVALID" } {
  const raw = String(userPhone || settingsPhone || "").trim();
  if (!raw) return { ok: false, code: "PHONE_REQUIRED" };
  const gsm = normalizeTrGsm(raw);
  if (!gsm || !/^\+905\d{9}$/.test(gsm)) return { ok: false, code: "PHONE_INVALID" };
  return { ok: true, gsm };
}

/** `/api/billing/return` içinden üretilen sentetik webhook gövdesi — PSP imzası yok; HMAC ile güvenilir */
function signBillingReturnHmac(rawBody: string): string | null {
  const sk = process.env.IYZICO_SECRET_KEY || "";
  if (!sk) return null;
  return crypto.createHmac("sha256", sk).update(rawBody, "utf8").digest("hex");
}

function verifyBillingReturnHmac(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
  const expected = signBillingReturnHmac(rawBody);
  if (!expected) return false;
  const hdr = headers["x-billing-return-sig"];
  const got = Array.isArray(hdr) ? hdr[0] : String(hdr || "");
  if (!got || got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

const router = Router();

/* -------------------- POST /checkout -------------------- */
router.post("/checkout", requireAuth, requireRole(["admin", "super_admin"]), async (req: Request, res: Response) => {
  try {
    const planId = Number(req.body?.planId);
    const billingCycle = String(req.body?.billingCycle || "monthly").toLowerCase();
    if (!Number.isFinite(planId) || planId <= 0) {
      return res.status(400).json({ error: { code: "INVALID_PLAN_ID", message: "planId zorunludur" } });
    }
    if (!["monthly", "yearly"].includes(billingCycle)) {
      return res.status(400).json({ error: { code: "INVALID_CYCLE", message: "billingCycle 'monthly' veya 'yearly' olmalı" } });
    }
    const companyId = req.session.user!.companyId;

    // Planı çek + güvenlik kontrolleri
    const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, planId)).limit(1);
    if (!plan) return res.status(404).json({ error: { code: "PLAN_NOT_FOUND", message: "Plan bulunamadı" } });
    if (!plan.isActive) return res.status(400).json({ error: { code: "PLAN_INACTIVE", message: "Plan aktif değil" } });
    if (plan.isPublic === false) return res.status(403).json({ error: { code: "PLAN_HIDDEN", message: "Bu plan kullanıcı seçimine kapalıdır" } });

    // Dalga 22 — accountType eşleşme kontrolü (review #5)
    if (plan.requiredAccountType) {
      const [co] = await db.select({ accountType: companiesTable.accountType })
        .from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
      const myType = co?.accountType ?? "both";
      if (myType !== plan.requiredAccountType && myType !== "both" && plan.requiredAccountType !== "both") {
        return res.status(403).json({
          error: { code: "PLAN_ACCOUNT_TYPE_MISMATCH",
            message: `Bu plan ${plan.requiredAccountType} hesap tipine özeldir.` },
        });
      }
    }

    const amount = Number(billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: { code: "INVALID_AMOUNT", message: "Plan fiyatı geçersiz" } });
    }

    // Buyer bilgisi
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.user!.id)).limit(1);
    const [settings] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, companyId)).limit(1);

    const identityNumber = (settings?.taxNumber || "").trim();
    if (!identityNumber) {
      return res.status(400).json({
        error: { code: "IDENTITY_REQUIRED", message: "Ödeme için vergi numarası (VKN/TCKN) gerekli. Ayarlar → Firma bilgileri alanını doldurun." },
      });
    }
    const gsmRes = requireNormalizedGsm(user?.phone, settings?.phone);
    if (!gsmRes.ok) {
      return res.status(400).json({
        error: {
          code: gsmRes.code,
          message: gsmRes.code === "PHONE_INVALID"
            ? "Ödeme için geçerli bir Türkiye GSM numarası gerekli (örn. +905xx… veya 05xx…)."
            : "Ödeme için telefon numarası gerekli. Ayarlar → Firma bilgileri alanını doldurun.",
        },
      });
    }
    const gsmNumber = gsmRes.gsm;

    const conversationId = newConversationId();
    const provider = getBillingProvider();

    // Önce DB'ye 'pending' kayıt aç (idempotency anchor)
    const [pending] = await db.insert(paymentsTable).values({
      companyId,
      planId,
      billingCycle,
      amount: amount.toFixed(2),
      currency: "TRY",
      provider: provider.name,
      status: "pending",
      conversationId,
      rawRequest: { planSlug: plan.slug, planName: plan.name, billingCycle, amount } as any,
    }).returning();

    // Sonra provider'a checkout session aç
    // Gerçek iyzico akışında token callbackUrl'ye POST edilir → backend /return karşılar
    const callbackUrl = `${req.protocol}://${req.get("host")}/api/billing/return`;
    let session: { paymentPageUrl: string; token: string; provider: string };
    try {
      session = await provider.createCheckoutSession({
        conversationId,
        companyId,
        planId,
        planName: plan.name,
        billingCycle: billingCycle as "monthly" | "yearly",
        amount,
        currency: "TRY",
        callbackUrl,
        buyer: {
          id: `co-${companyId}`,
          name: (user?.fullName?.split(" ")[0]) || "Adsız",
          surname: (user?.fullName?.split(" ").slice(1).join(" ")) || "Kullanıcı",
          email: user?.email || `noreply+${companyId}@ticarium365.local`,
          gsmNumber,
          identityNumber,
          registrationAddress: settings?.address || "Türkiye",
          city: company?.city || "İstanbul",
          country: "Turkey",
          ip: req.ip,
        },
      });
    } catch (err: any) {
      const msg = err?.message || "provider_initialize_failed";
      await db.update(paymentsTable).set({
        status: "failed",
        errorCode: "PROVIDER_INIT_FAILED",
        errorMessage: msg,
        rawResponse: { ...(pending.rawResponse as any || {}), initError: msg } as any,
        updatedAt: new Date(),
      }).where(eq(paymentsTable.id, pending.id)).catch(() => {});
      await db.insert(productFunnelEventsTable).values({
        companyId,
        eventKey: "billing_checkout_failed",
        props: JSON.stringify({ stage: "initialize", provider: provider.name, plan_id: planId, billing_cycle: billingCycle, conversation_id: conversationId }).slice(0, 4000),
      }).catch(() => {});
      logger.warn({ err, conversationId, companyId }, "billing_checkout_provider_init_failed");
      return res.status(502).json({ error: { code: "PROVIDER_INIT_FAILED", message: "Ödeme başlatılamadı. Lütfen birkaç dakika sonra tekrar deneyin.", details: { conversationId } } });
    }

    // Checkout token'ı kayıt altına al (return/retrieve correlation için).
    await db.update(paymentsTable).set({
      rawResponse: { ...(pending.rawResponse as any || {}), checkoutToken: session.token, provider: session.provider } as any,
      updatedAt: new Date(),
    }).where(eq(paymentsTable.id, pending.id));

    return res.status(201).json({
      ok: true,
      paymentId: pending.id,
      conversationId,
      paymentPageUrl: session.paymentPageUrl,
      provider: session.provider,
      amount,
      currency: "TRY",
    });
  } catch (err: any) {
    logger.warn({ err }, "billing_checkout_failed");
    return res.status(500).json({ error: { code: "INTERNAL", message: err?.message || "checkout_failed" } });
  }
});

/* -------------------- GET /credit-packs (catalog) -------------------- */
router.get("/credit-packs", requireAuth, (_req: Request, res: Response) => {
  res.json({ packs: CREDIT_PACKS });
});

/* -------------------- POST /topup -------------------- */
/**
 * Ek kontör satın alma. checkout ile aynı flow:
 *   1) packCode validate → CreditPack çek
 *   2) payments satırı 'pending' (kind='topup'; planId NULL kabul, biz plan id koymuyoruz)
 *   3) credit_purchases satırı 'pending' (paymentId ile bağlı)
 *   4) Provider checkout session aç → paymentPageUrl döndür
 * Webhook 'succeeded' geldiğinde apply branch credit_purchases'i 'applied' yapar
 * ve usage_counters.purchased_credits += quantity uygular.
 */
router.post("/topup", requireAuth, requireRole(["admin", "super_admin"]), async (req: Request, res: Response) => {
  try {
    const packCode = String(req.body?.packCode || "");
    const pack = findCreditPack(packCode);
    if (!pack) {
      return res.status(400).json({ error: { code: "INVALID_PACK", message: "Geçersiz kontör paketi" } });
    }
    const companyId = req.session.user!.companyId;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.user!.id)).limit(1);
    const [settings] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, companyId)).limit(1);

    const identityNumber = (settings?.taxNumber || "").trim();
    if (!identityNumber) {
      return res.status(400).json({
        error: { code: "IDENTITY_REQUIRED", message: "Ödeme için vergi numarası (VKN/TCKN) gerekli. Ayarlar → Firma bilgileri alanını doldurun." },
      });
    }
    const gsmRes = requireNormalizedGsm(user?.phone, settings?.phone);
    if (!gsmRes.ok) {
      return res.status(400).json({
        error: {
          code: gsmRes.code,
          message: gsmRes.code === "PHONE_INVALID"
            ? "Ödeme için geçerli bir Türkiye GSM numarası gerekli (örn. +905xx… veya 05xx…)."
            : "Ödeme için telefon numarası gerekli. Ayarlar → Firma bilgileri alanını doldurun.",
        },
      });
    }
    const gsmNumber = gsmRes.gsm;
    const conversationId = newConversationId();
    const provider = getBillingProvider();

    // payments satırı (planId yok → 0 placeholder; topup için subscriptionId atanmaz)
    const [pending] = await db.insert(paymentsTable).values({
      companyId,
      planId: 0, // top-up: plan yok
      billingCycle: "topup",
      amount: pack.totalPrice.toFixed(2),
      currency: "TRY",
      provider: provider.name,
      status: "pending",
      conversationId,
      rawRequest: { kind: "topup", packCode: pack.code, metric: pack.metric, quantity: pack.quantity, unitPrice: pack.unitPrice } as any,
    }).returning();

    // credit_purchases satırı 'pending'
    await db.insert(creditPurchasesTable).values({
      companyId,
      paymentId: pending.id,
      metric: pack.metric,
      packCode: pack.code,
      quantity: pack.quantity,
      unitPrice: pack.unitPrice.toFixed(4),
      totalAmount: pack.totalPrice.toFixed(2),
      period: currentPeriodUTC(),
      status: "pending",
    });

    const callbackUrl = `${req.protocol}://${req.get("host")}/api/billing/return`;
    let session: { paymentPageUrl: string; token: string; provider: string };
    try {
      session = await provider.createCheckoutSession({
        conversationId,
        companyId,
        planId: 0,
        planName: pack.label,
        billingCycle: "monthly", // provider için zorunlu (top-up için anlamsız)
        amount: pack.totalPrice,
        currency: "TRY",
        callbackUrl,
        buyer: {
          id: `co-${companyId}`,
          name: (user?.fullName?.split(" ")[0]) || "Adsız",
          surname: (user?.fullName?.split(" ").slice(1).join(" ")) || "Kullanıcı",
          email: user?.email || `noreply+${companyId}@ticarium365.local`,
          gsmNumber,
          identityNumber,
          registrationAddress: settings?.address || "Türkiye",
          city: company?.city || "İstanbul",
          country: "Turkey",
          ip: req.ip,
        },
      });
    } catch (err: any) {
      const msg = err?.message || "provider_initialize_failed";
      await db.update(paymentsTable).set({
        status: "failed",
        errorCode: "PROVIDER_INIT_FAILED",
        errorMessage: msg,
        rawResponse: { ...(pending.rawResponse as any || {}), initError: msg } as any,
        updatedAt: new Date(),
      }).where(eq(paymentsTable.id, pending.id)).catch(() => {});
      await db.insert(productFunnelEventsTable).values({
        companyId,
        eventKey: "billing_topup_failed",
        props: JSON.stringify({ stage: "initialize", provider: provider.name, pack_code: pack.code, conversation_id: conversationId }).slice(0, 4000),
      }).catch(() => {});
      logger.warn({ err, conversationId, companyId }, "billing_topup_provider_init_failed");
      return res.status(502).json({ error: { code: "PROVIDER_INIT_FAILED", message: "Ödeme başlatılamadı. Lütfen birkaç dakika sonra tekrar deneyin.", details: { conversationId } } });
    }

    await db.update(paymentsTable).set({
      rawResponse: { ...(pending.rawResponse as any || {}), checkoutToken: session.token, provider: session.provider } as any,
      updatedAt: new Date(),
    }).where(eq(paymentsTable.id, pending.id));

    return res.status(201).json({
      ok: true,
      paymentId: pending.id,
      conversationId,
      paymentPageUrl: session.paymentPageUrl,
      provider: session.provider,
      amount: pack.totalPrice,
      currency: "TRY",
      pack: { code: pack.code, metric: pack.metric, quantity: pack.quantity, label: pack.label },
    });
  } catch (err: any) {
    logger.warn({ err }, "billing_topup_failed");
    return res.status(500).json({ error: { code: "INTERNAL", message: err?.message || "topup_failed" } });
  }
});

/**
 * Dalga 23 — TX commit'ten SONRA top-up kontörlerini usage_counters'a yansıtır.
 * Her pack için: addPurchasedCredits → başarılıysa credit_purchases.status='applied'.
 * Başarısız olursa pending kalır → bir sonraki webhook self-heal eder.
 */
async function applyTopupsAfterCommit(items: Array<{ companyId: number; metric: any; quantity: number; creditPurchaseId: number; period: string }>): Promise<void> {
  for (const t of items) {
    try {
      // ÖNCE row'u atomik 'claim' et: status pending→applying. Concurrent self-heal varsa
      // sadece bir thread RETURNING satır alır → addPurchasedCredits tek kez çağrılır.
      const claimed = await db.update(creditPurchasesTable)
        .set({ status: "applying" })
        .where(and(eq(creditPurchasesTable.id, t.creditPurchaseId), eq(creditPurchasesTable.status, "pending")))
        .returning({ id: creditPurchasesTable.id });
      if (claimed.length === 0) {
        // Başka bir webhook self-heal sırasında zaten claim etmiş veya 'applied' olmuş.
        continue;
      }
      try {
        // Dalga 23 — Period explicit (Round 2 fix): satın alma period'una yansıt,
        // ay sınırı aşan webhook retry'larında bile.
        await addPurchasedCredits(t.companyId, t.metric, t.quantity, t.period);
        await db.update(creditPurchasesTable)
          .set({ status: "applied", appliedAt: new Date() })
          .where(eq(creditPurchasesTable.id, t.creditPurchaseId));
      } catch (innerErr) {
        // addPurchasedCredits başarısız → claim'i geri al ki bir sonraki webhook self-heal etsin.
        await db.update(creditPurchasesTable)
          .set({ status: "pending" })
          .where(and(eq(creditPurchasesTable.id, t.creditPurchaseId), eq(creditPurchasesTable.status, "applying")));
        throw innerErr;
      }
    } catch (err) {
      logger.warn({ err, t }, "topup_apply_failed_will_self_heal_on_next_webhook");
    }
  }
}

/* -------------------- Webhook handler (shared) -------------------- */
/**
 * Tx + per-conversation advisory lock (review #1) ile concurrent webhook
 * race condition'ını engeller. İmza doğrulama TX dışında, deserialize sonrası
 * conversationId hash'i üzerine `pg_advisory_xact_lock` alınır.
 *
 * Subscription transition (review #3): Mevcut active subscription'ın kalan
 * süresi yeni periyoda eklenir → kullanıcı upgrade'de zaman kaybetmez.
 *   newExpires = max(now, currentExpiresAt) + periodMs
 */
async function handleWebhookEvent(rawBody: string, headers: Record<string, string | string[] | undefined>) {
  const provider = getBillingProvider();
  const trustedReturn = verifyBillingReturnHmac(rawBody, headers);
  if (!trustedReturn && !provider.verifyWebhookSignature(rawBody, headers)) {
    return { status: 401, body: { error: { code: "INVALID_SIGNATURE", message: "Geçersiz imza" } } };
  }
  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return { status: 400, body: { error: { code: "INVALID_JSON", message: "Geçersiz JSON" } } }; }

  const evt = provider.parseWebhookEvent(payload);
  if (!evt.conversationId) {
    return { status: 400, body: { error: { code: "MISSING_CONVERSATION_ID", message: "conversationId yok" } } };
  }

  return await db.transaction(async (tx) => {
    // Per-conversationId advisory lock (TX scope, otomatik release)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${evt.conversationId}))`);

    const [payment] = await tx.select().from(paymentsTable)
      .where(eq(paymentsTable.conversationId, evt.conversationId)).limit(1);
    if (!payment) return { status: 404 as const, body: { error: { code: "PAYMENT_NOT_FOUND", message: "Ödeme bulunamadı" } } };
    if (payment.status === "succeeded" || payment.status === "refunded") {
      // Dalga 23 — Self-healing: önceki webhook'ta TX commit etti ama TX-dışı
      // addPurchasedCredits başarısız olduysa credit_purchases hala 'pending' kalmıştır.
      // Bu retry isteğinde apply'ı tekrar deneyelim.
      const orphaned = await tx.select().from(creditPurchasesTable)
        .where(and(eq(creditPurchasesTable.paymentId, payment.id), eq(creditPurchasesTable.status, "pending")));
      if (orphaned.length > 0) {
        return {
          status: 200 as const,
          body: { ok: true, idempotent: true, paymentId: payment.id, status: payment.status, healing: orphaned.length },
          _applyTopups: orphaned.map(p => ({ companyId: payment.companyId, metric: p.metric as any, quantity: p.quantity, creditPurchaseId: p.id, period: p.period })),
        } as any;
      }
      return { status: 200 as const, body: { ok: true, idempotent: true, paymentId: payment.id, status: payment.status } };
    }

    if (evt.eventType === "payment.failed") {
      await tx.update(paymentsTable).set({
        status: "failed",
        errorCode: evt.errorCode || null,
        errorMessage: evt.errorMessage || null,
        rawResponse: evt.raw as any,
        updatedAt: new Date(),
      }).where(eq(paymentsTable.id, payment.id));
      // Funnel: ödeme hatası
      await tx.insert(productFunnelEventsTable).values({
        companyId: payment.companyId,
        eventKey: "billing_payment_failed",
        props: JSON.stringify({
          provider: payment.provider,
          billing_cycle: payment.billingCycle,
          conversation_id: payment.conversationId,
          error_code: evt.errorCode,
        }).slice(0, 4000),
      }).catch(() => {});
      return { status: 200 as const, body: { ok: true, paymentId: payment.id, status: "failed" } };
    }

    const now = new Date();

    // Dalga 23 — Top-up (ek kontör) ödemeleri: subscription dokunmaz, sadece
    // bekleyen credit_purchases satırları 'applied' olur ve usage_counters'a yansır.
    if (payment.billingCycle === "topup" || payment.planId === 0) {
      // Dalga 23 — credit_purchases 'pending' KALIR; TX dışında addPurchasedCredits
      // başarılı olduktan sonra 'applied' işaretlenir → idempotent retry ile self-heal.
      const pendingPacks = await tx.select().from(creditPurchasesTable)
        .where(and(eq(creditPurchasesTable.paymentId, payment.id), eq(creditPurchasesTable.status, "pending")));
      await tx.update(paymentsTable).set({
        status: "succeeded",
        externalId: evt.externalId || null,
        rawResponse: evt.raw as any,
        paidAt: now,
        updatedAt: now,
      }).where(eq(paymentsTable.id, payment.id));
      return {
        status: 200 as const,
        body: { ok: true, paymentId: payment.id, status: "succeeded", topup: true, applied: pendingPacks.length },
        _applyTopups: pendingPacks.map(p => ({ companyId: payment.companyId, metric: p.metric as any, quantity: p.quantity, creditPurchaseId: p.id, period: p.period })),
      } as any;
    }

    // payment.succeeded → subscription'ı aktive/yenile (pro-rate: kalan süre korunur)
    const periodMs = payment.billingCycle === "yearly" ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

    const [active] = await tx.select().from(companySubscriptionsTable)
      .where(and(
        eq(companySubscriptionsTable.companyId, payment.companyId),
        eq(companySubscriptionsTable.status, "active"),
      )).limit(1);

    let subscriptionId: number;
    if (active) {
      // Aynı plan + cycle ise pro-rate (kalan süreyi koru); değişmişse plan upgrade,
      // yine "max(now, mevcutSon) + periyot" → kullanıcı zaman kaybetmez.
      const baseMs = Math.max(now.getTime(), active.expiresAt ? new Date(active.expiresAt).getTime() : now.getTime());
      const newExpires = new Date(baseMs + periodMs);
      await tx.update(companySubscriptionsTable)
        .set({
          planId: payment.planId,
          billingCycle: payment.billingCycle,
          expiresAt: newExpires,
          gracePeriodEndsAt: null,
          cancelledAt: null,
          updatedAt: now,
        })
        .where(eq(companySubscriptionsTable.id, active.id));
      subscriptionId = active.id;
    } else {
      // Yeni active satırı (önceki trial/expired tarihçede kalır).
      const newExpires = new Date(now.getTime() + periodMs);
      try {
        const [created] = await tx.insert(companySubscriptionsTable).values({
          companyId: payment.companyId,
          planId: payment.planId,
          billingCycle: payment.billingCycle,
          status: "active",
          startedAt: now,
          expiresAt: newExpires,
          autoRenew: true,
        }).returning({ id: companySubscriptionsTable.id });
        subscriptionId = created.id;
      } catch (err: any) {
        // Eşzamanlı webhook 'active' satırı oluşturmuş olabilir (uniq violation).
        // Tx içindeyiz → SAVEPOINT yok; uniq violation → tekrar oku ve update'e düş.
        if (err?.code === "23505") {
          const [retry] = await tx.select().from(companySubscriptionsTable)
            .where(and(
              eq(companySubscriptionsTable.companyId, payment.companyId),
              eq(companySubscriptionsTable.status, "active"),
            )).limit(1);
          if (!retry) throw err;
          const baseMs = Math.max(now.getTime(), retry.expiresAt ? new Date(retry.expiresAt).getTime() : now.getTime());
          await tx.update(companySubscriptionsTable)
            .set({ planId: payment.planId, billingCycle: payment.billingCycle, expiresAt: new Date(baseMs + periodMs), updatedAt: now })
            .where(eq(companySubscriptionsTable.id, retry.id));
          subscriptionId = retry.id;
        } else { throw err; }
      }
    }

    await tx.update(paymentsTable).set({
      status: "succeeded",
      externalId: evt.externalId || null,
      rawResponse: evt.raw as any,
      paidAt: now,
      subscriptionId,
      updatedAt: now,
    }).where(eq(paymentsTable.id, payment.id));

    try {
      if (payment.planId > 0 && (!active || active.planId !== payment.planId)) {
        const [npSlug] = await tx.select({ slug: subscriptionPlansTable.slug })
          .from(subscriptionPlansTable)
          .where(eq(subscriptionPlansTable.id, payment.planId))
          .limit(1);
        let prevPlanSlug: string | null = null;
        let prevPlanId: number | null = null;
        if (active) {
          prevPlanId = active.planId;
          const [opSlug] = await tx.select({ slug: subscriptionPlansTable.slug })
            .from(subscriptionPlansTable)
            .where(eq(subscriptionPlansTable.id, active.planId))
            .limit(1);
          prevPlanSlug = opSlug?.slug ?? null;
        }
        await tx.insert(productFunnelEventsTable).values({
          companyId: payment.companyId,
          eventKey: "plan_upgraded",
          props: JSON.stringify({
            source: "billing_webhook",
            prev_plan_id: prevPlanId,
            prev_plan_slug: prevPlanSlug,
            new_plan_id: payment.planId,
            new_plan_slug: npSlug?.slug ?? "",
            billing_cycle: payment.billingCycle,
            conversation_id: payment.conversationId,
          }).slice(0, 4000),
        });
      }
    } catch (fe) {
      logger.warn({ fe, companyId: payment.companyId }, "plan_upgraded_funnel_insert_failed");
    }

    invalidateFeaturesCache(payment.companyId);
    logger.info({ companyId: payment.companyId, planId: payment.planId, paymentId: payment.id, subscriptionId }, "billing_payment_succeeded");
    await tx.insert(productFunnelEventsTable).values({
      companyId: payment.companyId,
      eventKey: "billing_payment_succeeded",
      props: JSON.stringify({
        provider: payment.provider,
        billing_cycle: payment.billingCycle,
        conversation_id: payment.conversationId,
        amount_try: Number(payment.amount),
      }).slice(0, 4000),
    }).catch(() => {});
    return { status: 200 as const, body: { ok: true, paymentId: payment.id, status: "succeeded", subscriptionId } };
  });
}

/* -------------------- /return (Iyzico callbackUrl) -------------------- */
/**
 * iyzico PWI/CheckoutForm dönüşü: callbackUrl'ye `token` POST edilir.
 * Bu endpoint token ile retrieve çağrısını yapar, ödeme durumunu DB'ye uygular
 * ve kullanıcıyı UI sonuç sayfasına yönlendirir.
 */
router.all("/return", async (req: Request, res: Response) => {
  const redirectResult = (opts: { conversationId?: string; returnStatus?: string; returnCode?: string }) => {
    const u = new URL(`${req.protocol}://${req.get("host")}/odeme/sonuc`);
    if (opts.conversationId) u.searchParams.set("conversation_id", opts.conversationId);
    if (opts.returnStatus) u.searchParams.set("return_status", opts.returnStatus);
    if (opts.returnCode) u.searchParams.set("return_code", opts.returnCode);
    return res.redirect(302, u.toString());
  };

  try {
    const body = (req.body && typeof req.body === "object") ? (req.body as any) : {};
    const q = req.query as any;
    const token = String(body.token || q.token || "").trim();
    const conversationId = String(q.conversation_id || body.conversationId || body.conversation_id || "").trim();

    if (!token) {
      return redirectResult({ conversationId: conversationId || undefined, returnStatus: "400", returnCode: "MISSING_TOKEN" });
    }

    const provider = getBillingProvider();
    let evt;
    try {
      evt = await provider.retrieveCheckoutResult({ token, conversationId: conversationId || null });
    } catch (e: any) {
      logger.warn({ err: e, conversationId }, "billing_return_retrieve_failed");
      return redirectResult({ conversationId: conversationId || undefined, returnStatus: "502", returnCode: "RETRIEVE_FAILED" });
    }

    const payload = {
      status: evt.eventType === "payment.succeeded" ? "success" : "failure",
      paymentStatus: evt.eventType === "payment.succeeded" ? "SUCCESS" : "FAILURE",
      conversationId: evt.conversationId || conversationId,
      paymentId: evt.externalId,
      paidPrice: evt.amount,
      price: evt.amount,
      errorCode: evt.errorCode,
      errorMessage: evt.errorMessage,
      raw: evt.raw,
    };
    const rawBody = JSON.stringify(payload);
    const trustHeaders: Record<string, string | string[] | undefined> =
      provider.name === "mock"
        ? { "x-mock-signature": "mock-ok" }
        : { "x-billing-return-sig": signBillingReturnHmac(rawBody) || "" };

    const r: any = await handleWebhookEvent(rawBody, trustHeaders);
    if (Array.isArray(r._applyTopups) && r._applyTopups.length > 0) {
      await applyTopupsAfterCommit(r._applyTopups);
      invalidateFeaturesCache(r._applyTopups[0].companyId);
    }

    if (r.status !== 200) {
      const code = (r.body as any)?.error?.code || `BILLING_${r.status}`;
      return redirectResult({
        conversationId: String(evt.conversationId || conversationId || ""),
        returnStatus: String(r.status),
        returnCode: code,
      });
    }

    const u = new URL(`${req.protocol}://${req.get("host")}/odeme/sonuc`);
    u.searchParams.set("conversation_id", evt.conversationId || conversationId);
    return res.redirect(302, u.toString());
  } catch (err: any) {
    logger.warn({ err }, "billing_return_failed");
    const conversationId = String((req.query as any)?.conversation_id || (req.body as any)?.conversationId || (req.body as any)?.conversation_id || "").trim();
    return redirectResult({ conversationId: conversationId || undefined, returnStatus: "500", returnCode: "UNEXPECTED" });
  }
});

/* -------------------- POST /webhook -------------------- */
router.post("/webhook", async (req: Request, res: Response) => {
  // Dalga 22 — Iyzico HMAC için RAW body byte sırası (review #2). app.ts içinde
  // express.json verify callback rawBody'yi yakalıyor; fallback: stringify.
  const rawBody = typeof (req as any).rawBody === "string"
    ? (req as any).rawBody
    : JSON.stringify(req.body || {});
  try {
    const r: any = await handleWebhookEvent(rawBody, req.headers as any);
    // Dalga 23 — TX commit ettikten SONRA top-up kontörlerini usage_counters'a yansıt
    if (Array.isArray(r._applyTopups) && r._applyTopups.length > 0) {
      await applyTopupsAfterCommit(r._applyTopups);
      invalidateFeaturesCache(r._applyTopups[0].companyId);
    }
    res.status(r.status).json(r.body);
  } catch (err: any) {
    logger.error({ err }, "billing_webhook_failed");
    res.status(500).json({ error: { code: "INTERNAL", message: err?.message || "webhook_failed" } });
  }
});

/* -------------------- GET /payments -------------------- */
router.get("/payments", requireAuth, async (req: Request, res: Response) => {
  const companyId = req.session.user!.companyId;
  const rows = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.companyId, companyId))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(50);
  res.json({ payments: rows });
});

/* -------------------- POST /__simulate-success (DEV ONLY) -------------------- */
/**
 * Mock provider için hızlı test: paymentId verilen 'pending' bir kaydı 'succeeded'a çevirir,
 * subscription'ı aktive eder. Production'da 404 (super_admin required).
 */
router.post("/__simulate-success", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: { code: "NOT_FOUND" } });
  }
  if (!req.session?.user || (req.session.user.role !== "super_admin" && req.session.user.role !== "admin")) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin gerekli" } });
  }
  const conversationId = String(req.body?.conversationId || "");
  if (!conversationId) {
    return res.status(400).json({ error: { code: "MISSING_CONVERSATION_ID" } });
  }
  // Dalga 22 — cross-tenant guard (review #6). Admin sadece kendi şirketinin
  // ödemesini simüle edebilir; super_admin tümünü.
  if (req.session.user.role !== "super_admin") {
    const [own] = await db.select({ companyId: paymentsTable.companyId }).from(paymentsTable)
      .where(eq(paymentsTable.conversationId, conversationId)).limit(1);
    if (!own) return res.status(404).json({ error: { code: "PAYMENT_NOT_FOUND" } });
    if (own.companyId !== req.session.user.companyId) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Bu ödemeyi simüle edemezsiniz" } });
    }
  }
  // Sahte mock webhook payload üret + handler'ı çağır
  const payload = { event: "payment.succeeded", conversationId, paymentId: `mock_${conversationId}`, price: req.body?.amount };
  const rawBody = JSON.stringify(payload);
  const r: any = await handleWebhookEvent(rawBody, { "x-mock-signature": "mock-ok" });
  if (Array.isArray(r._applyTopups) && r._applyTopups.length > 0) {
    await applyTopupsAfterCommit(r._applyTopups);
    invalidateFeaturesCache(r._applyTopups[0].companyId);
  }
  res.status(r.status).json(r.body);
});

export default router;
