import { Router, Request, Response } from "express";
import { db, companiesTable, bankPaymentsTable, platformSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

const router = Router();

// ─── Müşteri tarafı ───────────────────────────────────────────────────────────

// GET /api/payment/status — Bu kiracının plan durumu
router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const company = req.company;
    const now = new Date();

    const trialDaysLeft = company.trialEndsAt
      ? Math.ceil((company.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const isTrialExpired =
      company.planType === "trial" && company.trialEndsAt && company.trialEndsAt < now;

    const [ibanRow] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "iban_info"));

    let ibanInfo: Record<string, string> = {};
    try {
      if (ibanRow?.value) ibanInfo = JSON.parse(ibanRow.value);
    } catch {}

    res.json({
      planType: company.planType,
      trialEndsAt: company.trialEndsAt,
      trialDaysLeft,
      isTrialExpired,
      isActive: company.isActive,
      ibanInfo,
    });
  } catch (err) {
    res.status(500).json(Errors.internal());
  }
});

// POST /api/payment/bank-transfer — Havale bildirimi gönder
router.post("/bank-transfer", requireAuth, async (req: Request, res: Response) => {
  try {
    const { amount, senderName, referenceNote } = req.body;

    if (!amount || !senderName) {
      res.status(400).json(Errors.badRequest("amount ve senderName zorunlu"));
      return;
    }

    const [payment] = await db.insert(bankPaymentsTable).values({
      companyId: req.companyId,
      amount: String(amount),
      senderName,
      referenceNote: referenceNote || null,
      status: "pending",
    }).returning();

    await audit({
      req,
      action: "PAYMENT_SUBMIT",
      entity: "payment",
      entityId: payment!.id,
      details: { amount, senderName },
    });

    res.status(201).json(payment);
  } catch (err) {
    req.log?.error({ err }, "Bank transfer submission error");
    res.status(500).json(Errors.internal());
  }
});

// GET /api/payment/my-payments — Bu kiracının ödeme bildirimleri
router.get("/my-payments", requireAuth, async (req: Request, res: Response) => {
  try {
    const payments = await db
      .select()
      .from(bankPaymentsTable)
      .where(eq(bankPaymentsTable.companyId, req.companyId))
      .orderBy(desc(bankPaymentsTable.createdAt));
    res.json(payments);
  } catch (err) {
    res.status(500).json(Errors.internal());
  }
});

// ─── Süper admin tarafı ──────────────────────────────────────────────────────

// GET /api/payment/admin/transfers — Tüm havale bildirimleri
router.get("/admin/transfers", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const payments = await db
      .select({
        id: bankPaymentsTable.id,
        companyId: bankPaymentsTable.companyId,
        companyName: companiesTable.name,
        amount: bankPaymentsTable.amount,
        senderName: bankPaymentsTable.senderName,
        referenceNote: bankPaymentsTable.referenceNote,
        status: bankPaymentsTable.status,
        adminNote: bankPaymentsTable.adminNote,
        confirmedAt: bankPaymentsTable.confirmedAt,
        createdAt: bankPaymentsTable.createdAt,
      })
      .from(bankPaymentsTable)
      .leftJoin(companiesTable, eq(bankPaymentsTable.companyId, companiesTable.id))
      .orderBy(desc(bankPaymentsTable.createdAt));
    res.json(payments);
  } catch (err) {
    res.status(500).json(Errors.internal());
  }
});

// PATCH /api/payment/admin/transfers/:id — Havale onayla / reddet
router.patch("/admin/transfers/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id!);
    const { action, adminNote, activateMonths } = req.body;

    if (!["confirm", "reject"].includes(action)) {
      res.status(400).json(Errors.badRequest("action: 'confirm' veya 'reject' olmalı"));
      return;
    }

    const [payment] = await db
      .select()
      .from(bankPaymentsTable)
      .where(eq(bankPaymentsTable.id, id));

    if (!payment) {
      res.status(404).json(Errors.notFound("Ödeme"));
      return;
    }

    // Idempotency: zaten işlenmiş ödeme tekrar onaylanamaz / reddedilemez
    if (payment.status !== "pending") {
      res.status(409).json(Errors.paymentAlreadyProcessed(payment.status));
      return;
    }

    const newStatus = action === "confirm" ? "confirmed" : "rejected";
    const [updated] = await db
      .update(bankPaymentsTable)
      .set({
        status: newStatus,
        adminNote: adminNote || null,
        confirmedAt: action === "confirm" ? new Date() : null,
        confirmedById: req.session?.user?.id,
      })
      .where(eq(bankPaymentsTable.id, id))
      .returning();

    // Ödeme onaylandıysa firmayı aktifleştir
    if (action === "confirm") {
      const months = activateMonths || 1;
      const newExpiry = new Date();
      newExpiry.setMonth(newExpiry.getMonth() + months);

      await db.update(companiesTable).set({
        planType: "active",
        trialEndsAt: newExpiry,
        updatedAt: new Date(),
      }).where(eq(companiesTable.id, payment.companyId));

      await audit({
        req,
        action: "COMPANY_PLAN_CHANGE",
        entity: "company",
        entityId: payment.companyId,
        details: { planType: "active", activatedMonths: months, expiresAt: newExpiry },
      });
    }

    await audit({
      req,
      action: action === "confirm" ? "PAYMENT_CONFIRM" : "PAYMENT_REJECT",
      entity: "payment",
      entityId: id,
      details: { previousStatus: "pending", newStatus, adminNote, amount: payment.amount },
    });

    res.json(updated);
  } catch (err) {
    req.log?.error({ err }, "Transfer action error");
    res.status(500).json(Errors.internal());
  }
});

// GET /api/payment/admin/platform-settings — IBAN ayarları
router.get("/admin/platform-settings", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(platformSettingsTable);
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json(Errors.internal());
  }
});

// PUT /api/payment/admin/platform-settings — IBAN ayarlarını kaydet
router.put("/admin/platform-settings", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { iban, bankName, accountHolder, monthlyPrice } = req.body;

    const ibanInfo = JSON.stringify({ iban, bankName, accountHolder, monthlyPrice });
    await db
      .insert(platformSettingsTable)
      .values({ key: "iban_info", value: ibanInfo })
      .onConflictDoUpdate({
        target: platformSettingsTable.key,
        set: { value: ibanInfo, updatedAt: new Date() },
      });

    await audit({
      req,
      action: "PLATFORM_SETTINGS_UPDATE",
      entity: "platform_settings",
      details: { key: "iban_info", updatedFields: Object.keys(req.body) },
    });

    res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "Platform settings update error");
    res.status(500).json(Errors.internal());
  }
});

export default router;
